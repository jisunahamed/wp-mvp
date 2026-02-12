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

    private static async createConnection(sessionId: string) {
        const { state, saveCreds } = await useSupabaseAuthState(sessionId);
        const { version } = await fetchLatestBaileysVersion();

        const sock = makeWASocket({
            version,
            logger,
            auth: {
                creds: state.creds,
                // We use a simple memory store for keys for now, as implementing full DB key store is complex.
                // This means if function restarts, we might lose some E2E session data (pre-keys), 
                // causing "waiting for message" on client side sometimes. 
                // For MVP this is acceptable trade-off vs complexity.
                keys: makeCacheableSignalKeyStore(state.keys, logger),
            },
            printQRInTerminal: false,
            generateHighQualityLinkPreview: true,
            // browser: ['WhatsApp API SaaS', 'Chrome', '1.0.0'],
        });

        // Save initial connection to map
        connections.set(sessionId, { sock, lastUsed: Date.now() });

        // Handle events
        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {


            const { connection, lastDisconnect, qr } = update;

            // Update QR in memory
            if (qr) {
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
            }

            if (connection === 'close') {
                // Handle reconnect
                const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;

                if (shouldReconnect) {
                    // Reconnect logic
                    // In serverless, we might just let it die and next request restarts it.
                    // But strict "reconnect" might need to happen if valid session.
                    // For now, we remove from map so next request triggers new connection.
                    connections.delete(sessionId);
                } else {
                    // Logged out
                    await supabaseAdmin
                        .from('sessions')
                        .update({ status: 'disconnected', auth_state: null })
                        .eq('id', sessionId);

                    connections.delete(sessionId);
                }
            }
        });

        // Handle incoming messages
        sock.ev.on('messages.upsert', async (m) => {
            if (m.type === 'notify') {
                for (const msg of m.messages) {
                    await handleIncomingMessage(sessionId, msg);
                }
            }
        });

        return { sock, qr: undefined };
    }

    static async closeConnection(sessionId: string) {
        const entry = connections.get(sessionId);
        if (entry) {
            entry.sock.end(undefined);
            connections.delete(sessionId);
        }
    }
}
