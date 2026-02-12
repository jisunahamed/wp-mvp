import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

const isValidUrl = (url: string) => url.startsWith('http');

// Helper to create client safely
const createSafeClient = (url: string, key: string, options: any = {}) => {
    if (!isValidUrl(url) || !key) {
        console.warn('Supabase credentials missing during build. Using mock client.');

        // Explicit mock object to handle Supabase chaining without Proxy magic
        const mockQueryBuilder: any = {
            select: () => mockQueryBuilder,
            insert: () => mockQueryBuilder,
            update: () => mockQueryBuilder,
            delete: () => mockQueryBuilder,
            eq: () => mockQueryBuilder,
            neq: () => mockQueryBuilder,
            gt: () => mockQueryBuilder,
            lt: () => mockQueryBuilder,
            gte: () => mockQueryBuilder,
            lte: () => mockQueryBuilder,
            in: () => mockQueryBuilder,
            is: () => mockQueryBuilder,
            like: () => mockQueryBuilder,
            ilike: () => mockQueryBuilder,
            contains: () => mockQueryBuilder,
            order: () => mockQueryBuilder,
            limit: () => mockQueryBuilder,
            single: () => mockQueryBuilder,
            maybeSingle: () => mockQueryBuilder,
            // Make it thenable to resolve to empty data
            then: (resolve: Function) => resolve({ data: null, error: null, count: null })
        };

        return {
            from: () => mockQueryBuilder,
            auth: {
                getUser: () => Promise.resolve({ data: { user: null }, error: null }),
                signUp: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
                signInWithPassword: () => Promise.resolve({ data: { user: null, session: null }, error: null }),
                signOut: () => Promise.resolve({ error: null })
            }
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
