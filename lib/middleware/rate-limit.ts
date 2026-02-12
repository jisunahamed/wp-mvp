import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Use a service role client for rate limiting to bypass RLS if needed, 
// though typically rate limits are system-managed.
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function checkRateLimit(userId: string): Promise<{
    allowed: boolean;
    current: number;
    limit: number;
    resetsAt: string
}> {
    const today = new Date().toISOString().split('T')[0];

    // 1. Get user's limit
    const { data: user, error: userError } = await supabase
        .from('users')
        .select('rate_limit_daily')
        .eq('id', userId)
        .single();

    if (userError || !user) {
        throw new Error('User not found for rate limiting');
    }

    const limit = user.rate_limit_daily;

    // 2. Increment and get current count using RPC
    // This RPC function must handle the "insert or update" logic atomically
    const { data: currentCount, error: rpcError } = await supabase
        .rpc('increment_rate_limit', {
            p_user_id: userId,
            p_date: today
        });

    if (rpcError) {
        console.error('Rate limit RPC error:', rpcError);
        // Fail open or closed? Let's fail closed for safety but log it.
        throw new Error('Rate limit check failed');
    }

    const allowed = currentCount <= limit;

    // Calculate reset time (midnight UTC)
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    tomorrow.setUTCHours(0, 0, 0, 0);

    return {
        allowed,
        current: currentCount,
        limit,
        resetsAt: tomorrow.toISOString()
    };
}
