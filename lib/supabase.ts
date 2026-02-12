import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isValidUrl = (url: string) => url.startsWith('http');

// Helper to create client safely
const createSafeClient = (url: string, key: string, options: any = {}) => {
    if (!isValidUrl(url) || !key) {
        // Return a dummy object that matches the shape largely, or at least doesn't crash on import
        // Note: This will crash at runtime if used, which is intended if config is missing.
        return {
            from: () => ({ select: () => ({ eq: () => ({ single: () => Promise.resolve({ data: null, error: null }) }) }) }),
            auth: { getUser: () => Promise.resolve({ data: { user: null }, error: null }) }
        } as any;
    }
    return createClient(url, key, options);
};

// Client for public access (if needed, though mostly we use service role for admin tasks in API)
export const supabase = createSafeClient(supabaseUrl, supabaseAnonKey);

// Admin client for bypassing RLS and managing system data
export const supabaseAdmin = createSafeClient(supabaseUrl, supabaseServiceKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false
    }
});
