import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateApiKey } from '@/lib/middleware/auth';
import { checkRateLimit } from '@/lib/middleware/rate-limit';
import { sendMessageSchema } from '@/lib/validation/schemas';


export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        // 1. Auth check
        const userId = await authenticateApiKey(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        // 2. Validation
        const body = await req.json();
        const validation = sendMessageSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: validation.error.format() },
                { status: 400 }
            );
        }

        const { session_id, to, text } = validation.data;

        // 3. User & Session Ownership Check
        const { data: session, error: sessionError } = await supabaseAdmin
            .from('sessions')
            .select('id, status, phone_number')
            .eq('id', session_id)
            .eq('user_id', userId)
            .single();

        if (sessionError || !session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        if (session.status !== 'connected') {
            return NextResponse.json(
                { error: 'Session not connected. Please scan QR code first.' },
                { status: 400 }
            );
        }

        // 4. Rate Limiting
        const rateLimit = await checkRateLimit(userId);
        if (!rateLimit.allowed) {
            return NextResponse.json({
                error: 'Daily rate limit exceeded',
                details: {
                    limit: rateLimit.limit,
                    used: rateLimit.current,
                    resets_at: rateLimit.resetsAt
                }
            }, { status: 429 });
        }

        // 5. Baileys Send
        try {
            // Dynamic import to avoid build-time initialization issues with native modules in Baileys
            const { BaileysConnectionManager } = await import('@/lib/baileys/connection');
            const { sock } = await BaileysConnectionManager.getConnection(session.id);

            const jid = `${to}@s.whatsapp.net`;
            const sentMsg = await sock.sendMessage(jid, { text });

            if (!sentMsg) {
                throw new Error('Baileys failed to send message (returned undefined)');
            }

            // 6. Save to DB
            const { data: msgRecord, error: dbError } = await supabaseAdmin
                .from('messages')
                .insert({
                    session_id: session.id,
                    message_id: sentMsg.key.id,
                    direction: 'outgoing',
                    message_type: 'text',
                    from_number: session.phone_number || 'unknown',
                    to_number: to,
                    content: { text },
                    status: 'sent'
                })
                .select('id, created_at')
                .single();

            if (dbError) {
                console.error('Failed to log message to DB:', dbError);
                // Message sent but not logged... technically partial success.
                // We return success but log error.
            }

            return NextResponse.json({
                message_id: msgRecord?.id || 'pending_log',
                wa_id: sentMsg.key.id,
                status: 'sent',
                queued_at: msgRecord?.created_at || new Date().toISOString()
            });

        } catch (baileysError: any) {
            console.error('Baileys Send Error:', baileysError);
            return NextResponse.json({ error: 'Failed to send message via WhatsApp network' }, { status: 502 });
        }

    } catch (error) {
        console.error('Internal Send Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
