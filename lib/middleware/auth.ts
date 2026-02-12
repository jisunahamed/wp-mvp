import { supabaseAdmin } from '@/lib/supabase';
import { validateApiKeyHash } from '@/lib/utils/api-key';
import { NextResponse } from 'next/server';

// We use the shared admin client which is safe/mocked during build
const supabase = supabaseAdmin;

// Simple in-memory cache for API keys to reduce DB hits
// Key: apiKey, Value: { userId, expiresAt }
const keyCache = new Map<string, { userId: string; expiresAt: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export async function authenticateApiKey(req: Request): Promise<string | null> {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader?.startsWith('Bearer ')) return null;

    const apiKey = authHeader.replace('Bearer ', '');

    // 1. Check Cache
    const cached = keyCache.get(apiKey);
    if (cached && cached.expiresAt > Date.now()) {
        return cached.userId;
    }

    // 2. Check Database
    // We need to look up the user by API key. 
    // Since we store hashes, we strictly speaking should look up by a lookup-index if possible, 
    // OR we store a "key ID" part. 
    // However, the prompt implies "api_key" column in users is the key itself? 
    // Wait, schema says: api_key TEXT UNIQUE NOT NULL, api_key_hash TEXT NOT NULL.
    // This implies we store the raw key? No, that's insecure. 
    // Usually `api_key` in DB is a partial key or ID, and we verify hash.
    // OR if the user spec says "api_key TEXT UNIQUE", maybe they intend to store it plain?
    // "Validation: Compare against hash on each request".
    // PROPOSED FIX: 
    // We cannot search by hash if we use bcrypt (it's salted).
    // So we typically store `sk_...` in `api_key` column? 
    // If `api_key` column holds the raw key, we don't need the hash column for validation, just equality.
    // IF the `api_key` column holds a hashed version, we can't search it.

    // RE-READING SPEC:
    // "Store bcrypt hash in api_key_hash, plaintext in api_key (for user display once)"
    // Wait, "plaintext in api_key" implies we store it plaintext? 
    // That defeats the purpose of hashing. 
    // BUT the spec says: "Validation: Compare against hash on each request".
    // If we store plaintext, we can just compare plaintext.

    // SECURITY BEST PRACTICE ADAPTATION:
    // We will assume the `api_key` column stores the full key (which is bad practice but requested) 
    // OR we assume the client sends the key, and we look it up.
    // If we have `api_key` column unique, we can look it up directly.
    // Then we can verify the hash if we really want to be double sure, or if `api_key` column is actually just a prefix/ID.
    // Let's assume `api_key` column stores the ACTUAL KEY for this MVP to simplify, 
    // as looking up by bcrypt hash is impossible without iterating all users.

    // Implementation for MVP Project Spec:
    // The spec says "Store bcrypt hash in api_key_hash". 
    // It also says "Validation: Compare against hash".
    // This implies we identify the user by the key.
    // If we can't query by the key (because we shouldn't store it), we need a Key ID.
    // The `sk_...` format usually doesn't have an ID.

    // REALISTIC APPROACH for MVP:
    // We will query `users` where `api_key` matches the input.
    // If found, we double check `api_key_hash` using bcrypt (redundant if `api_key` is plaintext unique match, but follows spec).

    const { data: user, error } = await supabase
        .from('users')
        .select('id, api_key_hash')
        .eq('api_key', apiKey)
        .single();

    if (error || !user) return null;

    const isValid = await validateApiKeyHash(apiKey, user.api_key_hash);
    if (!isValid) return null;

    // 3. Update Cache
    keyCache.set(apiKey, { userId: user.id, expiresAt: Date.now() + CACHE_TTL });

    return user.id;
}
