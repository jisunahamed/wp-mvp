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

        // 3. Queue Message (Insert into DB)
        // The Worker service will listen to this insert and send the message.
        const { data: message, error: messageError } = await supabaseAdmin
            .from('messages')
            .insert({
                session_id: session_id,
                to_number: to,
                direction: 'outgoing',
                content: { text: text },
                status: 'pending', // Worker picks up 'pending'
                message_type: 'text'
            })
            .select()
            .single();

        if (messageError) {
            return NextResponse.json({ error: messageError.message }, { status: 500 });
        }

        return NextResponse.json({
            status: 'queued',
            message_id: message.id,
            message: 'Message queued for sending'
        });

    } catch (error) {
        console.error('Internal Send Error:', error);
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
