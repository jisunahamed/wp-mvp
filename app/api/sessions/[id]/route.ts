import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateApiKey } from '@/lib/middleware/auth';

export const dynamic = 'force-dynamic';

export async function GET(
    req: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await authenticateApiKey(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const params = await props.params;
        if (!params?.id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
        const { id } = params;

        const { data: session, error } = await supabaseAdmin
            .from('sessions')
            .select('id, session_name, phone_number, status, webhook_url, last_seen')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error || !session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        return NextResponse.json({
            session_id: session.id,
            session_name: session.session_name,
            phone_number: session.phone_number,
            status: session.status,
            webhook_url: session.webhook_url,
            last_seen: session.last_seen
        });

    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}

export async function DELETE(
    req: Request,
    props: { params: Promise<{ id: string }> }
) {
    try {
        const userId = await authenticateApiKey(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const params = await props.params;
        if (!params?.id) return NextResponse.json({ error: 'Missing ID' }, { status: 400 });
        const { id } = params;

        // TODO: We should also ideally logout the Baileys session here if it's active
        // This will happen in Phase 3 when we integrate ConnectionManager

        const { error } = await supabaseAdmin
            .from('sessions')
            .delete()
            .eq('id', id)
            .eq('user_id', userId);

        if (error) {
            return NextResponse.json({ error: 'Failed to delete session' }, { status: 500 });
        }

        return NextResponse.json({ success: true, message: 'Session deleted' });

    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
