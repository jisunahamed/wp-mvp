import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

// Client for public access (if needed, though mostly we use service role for admin tasks in API)
export const supabase = createClient(supabaseUrl, supabaseAnonKey);

// Admin client for bypassing RLS and managing system data
export const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
