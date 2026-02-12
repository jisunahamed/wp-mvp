import { WAMessage, WAMessageStubType } from '@whiskeysockets/baileys';
import { supabaseAdmin } from '@/lib/supabase';
import { dispatchWebhook } from '@/lib/webhook/dispatcher';

export async function handleIncomingMessage(sessionId: string, message: WAMessage) {
    // Ignore status updates, broadcasts, or empty messages
    if (
        !message.message ||
        message.key.fromMe ||
        message.key.remoteJid === 'status@broadcast'
    ) {
        return;
    }

    const remoteJid = message.key.remoteJid;
    if (!remoteJid) return;

    const text = message.message.conversation ||
        message.message.extendedTextMessage?.text ||
        message.message.imageMessage?.caption ||
        '';

    const type = message.message.imageMessage ? 'image' :
        message.message.videoMessage ? 'video' :
            message.message.audioMessage ? 'audio' :
                message.message.documentMessage ? 'document' :
                    'text';

    // Save to Database
    const { data: savedMessage, error } = await supabaseAdmin
        .from('messages')
        .insert({
            session_id: sessionId,
            message_id: message.key.id,
            direction: 'incoming',
            message_type: type,
            from_number: remoteJid.split('@')[0],
            to_number: 'me', // TODO: Get actual self number if possible from session snapshot
            content: message.message, // Store full JSON payload
            status: 'delivered'
        })
        .select('id')
        .single();

    if (error) {
        console.error('Failed to save incoming message:', error);
        return;
    }

    console.log(`Saved incoming message ${message.key.id} for session ${sessionId}`);

    // Dispatch Webhook
    await dispatchWebhook(sessionId, savedMessage.id, {
        event: 'message.received',
        session_id: sessionId,
        message: {
            id: message.key.id,
            from: remoteJid.split('@')[0],
            to: 'me',
            type: type,
            text: text,
            timestamp: new Date().toISOString()
        },
        received_at: new Date().toISOString()
    });
}
