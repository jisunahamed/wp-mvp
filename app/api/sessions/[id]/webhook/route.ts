import { NextResponse } from 'next/server';
import { supabaseAdmin } from '@/lib/supabase';
import { authenticateApiKey } from '@/lib/middleware/auth';
import { webhookSchema } from '@/lib/validation/schemas';

export async function PATCH(
    req: Request,
    { params }: { params: { id: string } }
) {
    try {
        const userId = await authenticateApiKey(req);
        if (!userId) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }

        const { id } = params;
        const body = await req.json();

        // Validate Input
        const validation = webhookSchema.safeParse(body);
        if (!validation.success) {
            return NextResponse.json(
                { error: 'Invalid input', details: validation.error.format() },
                { status: 400 }
            );
        }

        const { webhook_url } = validation.data;

        // Verify Session Ownership
        const { data: session, error: sessionError } = await supabaseAdmin
            .from('sessions')
            .select('id')
            .eq('id', id)
            .eq('user_id', userId)
            .single();

        if (sessionError || !session) {
            return NextResponse.json({ error: 'Session not found' }, { status: 404 });
        }

        // Test Ping
        try {
            const pingResponse = await fetch(webhook_url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ event: 'ping', message: 'Verifying webhook URL' }),
                signal: AbortSignal.timeout(5000)
            });

            if (!pingResponse.ok) {
                return NextResponse.json(
                    { error: `Webhook URL returned status ${pingResponse.status}. It must return 2xx.` },
                    { status: 400 }
                );
            }
        } catch (pingError: any) {
            return NextResponse.json(
                { error: `Failed to ping webhook URL: ${pingError.message}` },
                { status: 400 }
            );
        }

        // Update DB
        const { error: updateError } = await supabaseAdmin
            .from('sessions')
            .update({ webhook_url })
            .eq('id', id);

        if (updateError) {
            return NextResponse.json({ error: 'Failed to update webhook URL' }, { status: 500 });
        }

        return NextResponse.json({ success: true, webhook_url });

    } catch (error) {
        return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
    }
}
