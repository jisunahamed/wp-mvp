import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateApiKey } from '@/lib/middleware/auth';

export const dynamic = 'force-dynamic'; // Ensure no caching for this endpoint

export async function GET(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await authenticateApiKey(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

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
            // If expired or missing, and we are not connected, the client should keep polling 
            // BUT for the very first call, we might not have a QR yet if the connection loop hasn't started.
            // In a real serverless architecture, GET /qr usually triggers the generation if missing.
            // However, per architecture plan, the User might need to hit a "connect" endpoint or we rely on background trigger?
            // Plan says: "User polls GET /qr -> Initialize Baileys... -> Generate QR".
            // So this endpoint needs to TRIGGER connection if it's dead/idle.

            // TODO: Integration with BaileysConnectionManager in Phase 3.
            // For now (Phase 2), we stub this response or return "waiting_for_qr".

            // Since we can't spin up Baileys here (async/long-running), we normally would trigger an async function 
            // or if Vercel serverless allows, we wait for Baileys to emit QR (up to 10-15s).
            // Given Vercel limits, we might just return "initializing" and return early.

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
