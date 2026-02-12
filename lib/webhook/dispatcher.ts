import { supabaseAdmin } from '@/lib/supabase';

interface WebhookPayload {
    event: string;
    session_id: string;
    session_name?: string;
    message: any;
    received_at: string;
}

export async function dispatchWebhook(
    sessionId: string,
    messageId: string,
    payload: WebhookPayload
): Promise<void> {
    // 1. Get Session Webhook URL
    const { data: session, error } = await supabaseAdmin
        .from('sessions')
        .select('webhook_url, session_name')
        .eq('id', sessionId)
        .single();

    if (error || !session || !session.webhook_url) {
        return; // No webhook configured or session invalid
    }

    // Enrich payload with session name if missing
    if (!payload.session_name) {
        payload.session_name = session.session_name;
    }

    const MAX_RETRIES = 3;
    const BACKOFF_MS = [1000, 3000, 10000]; // 1s, 3s, 10s

    for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
        try {
            const response = await fetch(session.webhook_url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-Attempt': attempt.toString()
                },
                body: JSON.stringify(payload),
                signal: AbortSignal.timeout(10000) // 10s timeout
            });

            const responseBody = await response.text();

            // Log attempt
            await logWebhook({
                message_id: messageId,
                session_id: sessionId,
                webhook_url: session.webhook_url,
                payload,
                response_status: response.status,
                response_body: responseBody.slice(0, 1000), // Truncate for storage
                attempt_number: attempt
            });

            if (response.ok) {
                // Success!
                await markMessageWebhookSent(messageId);
                return;
            }

            // Retry on 5xx or 429
            if (response.status >= 500 || response.status === 429) {
                if (attempt < MAX_RETRIES) {
                    await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]));
                    continue;
                }
            } else {
                // Do not retry on 4xx (client error)
                break;
            }

        } catch (err: any) {
            // Network error or timeout
            await logWebhook({
                message_id: messageId,
                session_id: sessionId,
                webhook_url: session.webhook_url,
                payload,
                error: err.message,
                attempt_number: attempt
            });

            if (attempt < MAX_RETRIES) {
                await new Promise(r => setTimeout(r, BACKOFF_MS[attempt - 1]));
            }
        }
    }
}

async function logWebhook(data: any) {
    const { error } = await supabaseAdmin
        .from('webhook_logs')
        .insert(data);

    if (error) console.error('Failed to log webhook', error);
}

async function markMessageWebhookSent(messageId: string) {
    await supabaseAdmin
        .from('messages')
        .update({ webhook_sent: true })
        .eq('id', messageId);
}
