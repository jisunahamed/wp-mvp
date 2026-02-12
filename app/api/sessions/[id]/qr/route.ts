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

        // Fetch session details
        const { data: session, error } = await supabaseAdmin
            .from('sessions')
            .select('id, status, qr_code, qr_expires_at')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (error || !session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        if (session.status === 'connected') {
            return NextResponse.json({
                status: 'connected',
                message: 'Session connected successfully'
            });
        }

        // Check if QR code is valid
        const now = new Date();
        const expiresAt = session.qr_expires_at ? new Date(session.qr_expires_at) : null;
        const isExpired = expiresAt ? expiresAt < now : true;

        if (!session.qr_code || isExpired) {
            // Trigger QR generation if not ready
            try {
                const { BaileysConnectionManager } = await import('@/lib/baileys/connection');
                // This call starts the connection logic if not active
                await BaileysConnectionManager.getConnection(id);
            } catch (err) {
                console.error('Failed to trigger Baileys connection:', err);
                // Continue to return "initializing" so frontend keeps polling
            }

            return NextResponse.json({
                status: 'initializing',
                message: 'QR code generating... please poll again in 5 seconds',
                qr_code: null,
                expires_in: 0
            });
        }

        const remaining = expiresAt ? Math.ceil((expiresAt.getTime() - now.getTime()) / 1000) : 0;

        return NextResponse.json({
            qr_code: session.qr_code,
            status: 'qr_ready',
            expires_in: remaining
        });

    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
