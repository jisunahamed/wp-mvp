"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
Object.defineProperty(exports, "__esModule", { value: true });
exports.supabase = void 0;
exports.useSupabaseAuthState = useSupabaseAuthState;
const supabase_js_1 = require("@supabase/supabase-js");
const baileys_1 = require("@whiskeysockets/baileys");
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '../.env.local' }); // Load from root .env.local if available, or just environment
// Initialize Supabase Client (Worker needs its own instance)
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!supabaseUrl || !supabaseServiceKey) {
    console.error("Missing Supabase URL or Service Key. Make sure .env is set.");
    // In production, these should be set in the environment
}
exports.supabase = (0, supabase_js_1.createClient)(supabaseUrl, supabaseServiceKey);
async function useSupabaseAuthState(sessionId) {
    // Fetch initial state
    const { data, error } = await exports.supabase
        .from('sessions')
        .select('auth_state')
        .eq('id', sessionId)
        .single();
    let creds;
    let keys = {};
    if (data?.auth_state) {
        const parsed = JSON.parse(JSON.stringify(data.auth_state), baileys_1.BufferJSON.reviver);
        creds = parsed.creds;
        keys = parsed.keys;
    }
    else {
        creds = (0, baileys_1.initAuthCreds)();
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
        const { error } = await exports.supabase
            .from('sessions')
            .update({ auth_state: JSON.parse(JSON.stringify(authState, baileys_1.BufferJSON.replacer)) })
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
                    const data = {};
                    for (const id of ids) {
                        const value = keys[type]?.[id];
                        if (value) {
                            if (type === 'app-state-sync-key' && value) {
                                data[id] = baileys_1.proto.Message.AppStateSyncKeyData.fromObject(value);
                            }
                            else {
                                data[id] = value;
                            }
                        }
                    }
                    return data;
                },
                set: (data) => {
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
