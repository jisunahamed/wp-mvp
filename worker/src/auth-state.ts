import { createClient } from '@supabase/supabase-js';
import { AuthenticationCreds, AuthenticationState, initAuthCreds, BufferJSON, SignalDataTypeMap, proto } from '@whiskeysockets/baileys';
import * as dotenv from 'dotenv';

dotenv.config({ path: '../.env.local' }); // Load from root .env.local if available, or just environment

// Initialize Supabase Client (Worker needs its own instance)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase URL or Service Key. Make sure .env is set.");
    // In production, these should be set in the environment
}

export const supabase = createClient(supabaseUrl, supabaseServiceKey);

export async function useSupabaseAuthState(sessionId: string): Promise<{ state: AuthenticationState, saveCreds: () => Promise<void> }> {
    // Fetch initial state
    const { data, error } = await supabase
        .from('sessions')
        .select('auth_state')
        .eq('id', sessionId)
        .single();

    let creds: AuthenticationCreds;
    let keys: any = {};

    if (data?.auth_state) {
        const parsed = JSON.parse(JSON.stringify(data.auth_state), BufferJSON.reviver);
        creds = parsed.creds;
        keys = parsed.keys;
    } else {
        creds = initAuthCreds();
        keys = {};
    }

    const saveCreds = async () => {
        const authState = {
            creds: creds,
            keys: keys
        };

        // We only save creds occasionally to avoid DB spam, 
        // but for critical updates (like login), Baileys calls this.
        // We'll trust Baileys to call it when needed.
        const { error } = await supabase
            .from('sessions')
            .update({ auth_state: JSON.parse(JSON.stringify(authState, BufferJSON.replacer)) })
            .eq('id', sessionId);

        if (error) {
            console.error(`[${sessionId}] Failed to save auth state:`, error);
        }
    };

    return {
        state: {
            creds,
            keys: {
                get: (type, ids) => {
                    const data: { [key: string]: any } = {};
                    for (const id of ids) {
                        const value = keys[type]?.[id];
                        if (value) {
                            if (type === 'app-state-sync-key' && value) {
                                data[id] = proto.Message.AppStateSyncKeyData.fromObject(value);
                            } else {
                                data[id] = value;
                            }
                        }
                    }
                    return data;
                },
                set: (data: any) => {
                    for (const type in data) {
                        keys[type] = keys[type] || {};
                        for (const id in data[type]) {
                            keys[type][id] = data[type][id];
                        }
                    }
                    saveCreds(); // Save on key updates
                }
            }
        },
        saveCreds
    };
}
