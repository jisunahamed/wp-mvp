import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WASocket,
    ConnectionState
} from '@whiskeysockets/baileys';
import { useSupabaseAuthState } from './auth-state';
import { handleIncomingMessage } from './message-handler';
import { supabaseAdmin } from '@/lib/supabase';
import pino from 'pino';

// Global connection map (in-memory)
// NOTE: Vercel serverless functions are ephemeral. This map only persists 
// while the specific container is warm. 
// We rely on "Connection Pooling" within the container lifecycle.
const connections = new Map<string, {
    sock: WASocket;
    lastUsed: number;
    qr?: string;
}>();

const logger = pino({ level: 'silent' }); // Reduce noise in Vercel logs

export class BaileysConnectionManager {
    private static CLEANUP_INTERVAL = 60 * 1000; // 1 minute
    private static MAX_IDLE_TIME = 5 * 60 * 1000; // 5 minutes

    static async getConnection(sessionId: string): Promise<{ sock: WASocket; qr?: string }> {
        const existing = connections.get(sessionId);
        if (existing) {
            existing.lastUsed = Date.now();
            return { sock: existing.sock, qr: existing.qr };
        }

        return this.createConnection(sessionId);
    }

    private static async createConnection(sessionId: string): Promise<{ sock: WASocket; qr?: string }> {
        console.log(`[${sessionId}] Starting connection creation...`);
        const { state, saveCreds } = await useSupabaseAuthState(sessionId);
        console.log(`[${sessionId}] Auth state loaded.`);

        // optimizing startup by skipping version fetch
        // const { version } = await fetchLatestBaileysVersion();
        const version: [number, number, number] = [2, 3000, 1015901307];
        console.log(`[${sessionId}] Using Baileys version: ${version.join('.')}`);

        const sock = makeWASocket({
            version,
            logger,
            auth: {
                creds: state.creds,
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            generateHighQualityLinkPreview: true,
            connectTimeoutMs: 30000, // extend internal connection timeout
            keepAliveIntervalMs: 30000,
            syncFullHistory: false, // minimize data sync for faster startup
        });

        // Save initial connection to map
        connections.set(sessionId, { sock, lastUsed: Date.now() });

        sock.ev.on('creds.update', saveCreds);

        // Create a promise that resolves when QR is received or connection opens
        // This ensures Vercel function stays alive long enough to get the QR
        const ConnectionPromise = new Promise<{ sock: WASocket; qr?: string }>((resolve) => {
            let resolved = false;

            const listener = async (update: Partial<ConnectionState>) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    // Update QR in memory
                    const entry = connections.get(sessionId);
                    if (entry) entry.qr = qr;

                    // Update DB with QR
                    await supabaseAdmin
                        .from('sessions')
                        .update({
                            qr_code: qr,
                            qr_expires_at: new Date(Date.now() + 60000).toISOString(),
                            status: 'qr_ready'
                        })
                        .eq('id', sessionId);

                    if (!resolved) {
                        resolved = true;
                        resolve({ sock, qr });
                    }
                }

                if (connection === 'open') {
                    // Clear QR
                    const entry = connections.get(sessionId);
                    if (entry) entry.qr = undefined;

                    // Get phone number
                    const user = sock.user;
                    const phoneNumber = user?.id?.split(':')[0];

                    await supabaseAdmin
                        .from('sessions')
                        .update({
                            status: 'connected',
                            qr_code: null,
                            phone_number: phoneNumber,
                            last_seen: new Date().toISOString()
                        })
                        .eq('id', sessionId);

                    if (!resolved) {
                        resolved = true;
                        resolve({ sock, qr: undefined });
                    }
                }

                if (connection === 'close') {
                    const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;

                    if (!shouldReconnect) {
                        await supabaseAdmin
                            .from('sessions')
                            .update({ status: 'disconnected', auth_state: null })
                            .eq('id', sessionId);
                        connections.delete(sessionId);
                    } else {
                        connections.delete(sessionId);
                    }
                }
            };

            sock.ev.on('connection.update', listener);

            // Timeout after 40 seconds if no QR or connection (Vercel limit is 10s/60s depending on plan)
            setTimeout(() => {
                if (!resolved) {
                    console.log(`[${sessionId}] Connection wait timeout`);
                    resolve({ sock, qr: undefined });
                }
            }, 40000);
        });

        // We also need to attach the listener permanently, not just for the promise
        // The promise logic effectively duplicates the event handling for the *first* event
        // But we can just return the promise. 
        // Note: The listener above handles DB updates which is what we need. 
        // However, `sock.ev.on` adds a listener. The promise wrapper adds one listener.
        // We should ensure the listener persists for subsequent updates (like 'open' after 'qr').
        // Actually, the above listener IS persistent. It will keep running. 

        // Wait for the initial event
        return ConnectionPromise;
    }

    static async closeConnection(sessionId: string) {
        const entry = connections.get(sessionId);
        if (entry) {
            entry.sock.end(undefined);
            connections.delete(sessionId);
        }
    }
}
