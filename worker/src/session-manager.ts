import makeWASocket, {
    DisconnectReason,
    fetchLatestBaileysVersion,
    makeCacheableSignalKeyStore,
    WASocket,
    ConnectionState
} from '@whiskeysockets/baileys';
import { useSupabaseAuthState, supabase } from './auth-state';
import pino from 'pino';

const logger = pino({ level: 'info' });

export class SessionManager {
    private static sessions = new Map<string, WASocket>();

    static async startSession(sessionId: string) {
        if (this.sessions.has(sessionId)) {
            logger.info({ sessionId }, 'Session already active');
            return;
        }

        logger.info({ sessionId }, 'Starting session...');

        try {
            const { state, saveCreds } = await useSupabaseAuthState(sessionId);
            // hardcoded version for stability similar to the nextjs fix
            const version: [number, number, number] = [2, 3000, 1015901307];

            const sock = makeWASocket({
                version,
                logger,
                auth: {
                    creds: state.creds,
                    keys: makeCacheableSignalKeyStore(state.keys, logger),
                },
                printQRInTerminal: false, // We'll save QR to DB
                generateHighQualityLinkPreview: true,
            });

            this.sessions.set(sessionId, sock);

            sock.ev.on('creds.update', saveCreds);

            sock.ev.on('connection.update', async (update: Partial<ConnectionState>) => {
                const { connection, lastDisconnect, qr } = update;

                if (qr) {
                    logger.info({ sessionId }, 'QR Code generated');
                    await supabase
                        .from('sessions')
                        .update({
                            qr_code: qr,
                            qr_expires_at: new Date(Date.now() + 60000).toISOString(), // 60s validity
                            status: 'qr_ready'
                        })
                        .eq('id', sessionId);
                }

                if (connection === 'open') {
                    logger.info({ sessionId }, 'Connection OPEN');
                    const user = sock.user;
                    const phoneNumber = user?.id?.split(':')[0];

                    await supabase
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
                    const shouldReconnect = (lastDisconnect?.error as any)?.output?.statusCode !== DisconnectReason.loggedOut;
                    logger.info({ sessionId, shouldReconnect }, 'Connection CLOSED');

                    if (shouldReconnect) {
                        this.sessions.delete(sessionId);
                        this.startSession(sessionId); // Auto-reconnect
                    } else {
                        // Logged out
                        await supabase
                            .from('sessions')
                            .update({ status: 'disconnected', auth_state: null })
                            .eq('id', sessionId);
                        this.sessions.delete(sessionId);
                    }
                }
            });

            // Handle Incoming Messages
            sock.ev.on('messages.upsert', async (m) => {
                if (m.type === 'notify') {
                    for (const msg of m.messages) {
                        if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast') continue;

                        logger.info({ sessionId, msgId: msg.key.id }, 'Received message');

                        const type = msg.message.imageMessage ? 'image' :
                            msg.message.conversation ? 'text' : 'unknown';

                        // Save to DB (The Dispatcher in Next.js or a separate webhook listener can pick this up)
                        // Ideally, we replicate the message handler logic here.
                        // For MVP, lets just insert into 'messages' table. 
                        // The existing Webhook Dispatcher logic in Next.js relies on the Next.js API inserted it.
                        // If we insert here, we also need to dispatch webhooks here or let Supabase trigger something.
                        // EASIEST MVP: Dispatch Webhook Here directly.

                        const { data: session } = await supabase.from('sessions').select('webhook_url').eq('id', sessionId).single();
                        if (session?.webhook_url) {
                            // Simple fire-and-forget webhook
                            const payload = {
                                event: 'message.received',
                                session_id: sessionId,
                                message: msg.message,
                                received_at: new Date().toISOString()
                            };

                            fetch(session.webhook_url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            }).catch(err => logger.error({ err }, 'Failed to send webhook'));
                        }
                    }
                }
            });

        } catch (error) {
            logger.error({ sessionId, error }, 'Failed to start session');
        }
    }

    static async stopSession(sessionId: string) {
        const sock = this.sessions.get(sessionId);
        if (sock) {
            sock.end(undefined);
            this.sessions.delete(sessionId);
        }
    }

    static getSession(sessionId: string) {
        return this.sessions.get(sessionId);
    }
}
