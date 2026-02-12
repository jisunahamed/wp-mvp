import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { createSessionSchema } from '@/lib/validation/schemas';
import { authenticateApiKey } from '@/lib/middleware/auth';

export const dynamic = 'force-dynamic';

export async function POST(req: Request) {
    try {
        const userId = await authenticateApiKey(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const body = await req.json();
        const validation = createSessionSchema.safeParse(body);

        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: validation.error.format() },
                { status: 400 }
            );
        }

        const { session_name } = validation.data;

        // Check availability
        const { data: existing } = await supabaseAdmin
            .from('sessions')
            .select('id')
            .eq('user_id', userId)
            .eq('session_name', session_name)
            .single();

        if (existing) {
            return NextResponse.json(
                { error: 'Session name already exists for this user' },
                { status: 400 }
            );
        }

        // Create Session
        const { data: session, error } = await supabaseAdmin
            .from('sessions')
            .insert({
                user_id: userId,
                session_name,
                status: 'pending' // Initial status, will be updated by worker
            })
            .select('id, session_name, status')
            .single();

        if (error) {
            console.error('Create session error:', error);
            return NextResponse.json(
                { error: 'Failed to create session' },
                { status: 500 }
            );
        }

        // REFACTOR: In Hybrid Architecture, we only create the session record.
        // The Worker service (listening to DB changes) will pick this up and start the connection.

        // Ensure status is pending_worker so worker picks it up
        await supabaseAdmin
            .from('sessions')
            .update({ status: 'pending_worker' })
            .eq('id', session.id);

        return NextResponse.json({
            session_id: session.id,
            message: 'Session created. Waiting for worker to initialize...',
            qr_code: null
        });

    } catch (error) {
        console.error('Session creation error:', error);
        return NextResponse.json(
            { error: 'Internal server error' },
            { status: 500 }
        );
    }
}

export async function GET(req: Request) {
    try {
        const userId = await authenticateApiKey(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { data: sessions, error } = await supabaseAdmin
            .from('sessions')
            .select('id, session_name, phone_number, status, created_at, last_seen')
            .eq('user_id', userId)
            .order('created_at', { ascending: false });

        if (error) {
            return NextResponse.json({ error: 'Failed to fetch sessions' }, { status: 500 });
        }

        // Map to simplified response keys if needed, but schema matches requested format mostly
        const safeSessions = (sessions || []).map((s: any) => ({
            id: s.id,
            session_name: s.session_name,
            phone_number: s.phone_number,
            status: s.status,
            created_at: s.created_at,
            last_seen: s.last_seen
        }));

        return NextResponse.json({ sessions: safeSessions });

    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
