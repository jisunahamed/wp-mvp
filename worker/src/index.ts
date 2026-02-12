import { supabase } from './auth-state';
import { SessionManager } from './session-manager';
import pino from 'pino';
import * as dotenv from 'dotenv';
dotenv.config({ path: '../.env.local' });

const logger = pino({ level: 'info' });

async function main() {
    logger.info('WhatsApp Worker Starting...');

    // 1. Load all active sessions
    const { data: sessions, error } = await supabase
        .from('sessions')
        .select('id, status')
        .neq('status', 'disconnected');

    if (error) {
        logger.error({ error }, 'Failed to load sessions');
        process.exit(1);
    }

    logger.info(`Found ${sessions.length} active sessions to restore.`);

    // Start each session
    for (const session of sessions) {
        SessionManager.startSession(session.id);
    }

    // 2. Subscribe to Session Changes (New session created via API)
    supabase
        .channel('public:sessions')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sessions' }, (payload) => {
            logger.info({ payload }, 'New session created');
            SessionManager.startSession(payload.new.id);
        })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions' }, (payload) => {
            // Handle disconnect requests or status changes if needed
            if (payload.new.status === 'disconnected') {
                SessionManager.stopSession(payload.new.id);
            }
        })
        .subscribe();

    // 3. Subscribe to Outgoing Messages
    supabase
        .channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'direction=eq.outgoing' }, async (payload) => {
            const msg = payload.new;
            if (msg.status === 'pending') {
                logger.info({ msgId: msg.id }, 'Processing outgoing message');

                const sock = SessionManager.getSession(msg.session_id);
                if (!sock) {
                    logger.warn({ sessionId: msg.session_id }, 'Session not connected for outgoing message');
                    await supabase.from('messages').update({ status: 'failed', error_message: 'Session not connected' }).eq('id', msg.id);
                    return;
                }

                try {
                    await sock.sendMessage(msg.to_number + '@s.whatsapp.net', { text: msg.content.text });

                    await supabase.from('messages').update({ status: 'sent' }).eq('id', msg.id);
                    logger.info({ msgId: msg.id }, 'Message sent');
                } catch (err: any) {
                    logger.error({ err, msgId: msg.id }, 'Failed to send message');
                    await supabase.from('messages').update({ status: 'failed', error_message: err.message }).eq('id', msg.id);
                }
            }
        })
        .subscribe();

    logger.info('Worker is running and listening for events.');
}

main().catch(err => logger.error(err));
