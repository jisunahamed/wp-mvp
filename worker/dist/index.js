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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const auth_state_1 = require("./auth-state");
const session_manager_1 = require("./session-manager");
const pino_1 = __importDefault(require("pino"));
const dotenv = __importStar(require("dotenv"));
dotenv.config({ path: '../.env.local' });
const logger = (0, pino_1.default)({ level: 'info' });
async function main() {
    logger.info('WhatsApp Worker Starting...');
    // 1. Load all active sessions
    const { data: sessions, error } = await auth_state_1.supabase
        .from('sessions')
        .select('id, status')
        .neq('status', 'disconnected');
    if (error) {
        logger.error({ error }, 'Failed to load sessions');
        process.exit(1);
    }
    logger.info(`Found ${sessions.length} active sessions to restore.`);
    // Start each session
    for (const session of sessions) {
        session_manager_1.SessionManager.startSession(session.id);
    }
    // 2. Subscribe to Session Changes (New session created via API)
    auth_state_1.supabase
        .channel('public:sessions')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'sessions' }, (payload) => {
        logger.info({ payload }, 'New session created');
        session_manager_1.SessionManager.startSession(payload.new.id);
    })
        .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'sessions' }, (payload) => {
        // Handle disconnect requests or status changes if needed
        if (payload.new.status === 'disconnected') {
            session_manager_1.SessionManager.stopSession(payload.new.id);
        }
    })
        .subscribe();
    // 3. Subscribe to Outgoing Messages
    auth_state_1.supabase
        .channel('public:messages')
        .on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'direction=eq.outgoing' }, async (payload) => {
        const msg = payload.new;
        if (msg.status === 'pending') {
            logger.info({ msgId: msg.id }, 'Processing outgoing message');
            const sock = session_manager_1.SessionManager.getSession(msg.session_id);
            if (!sock) {
                logger.warn({ sessionId: msg.session_id }, 'Session not connected for outgoing message');
                await auth_state_1.supabase.from('messages').update({ status: 'failed', error_message: 'Session not connected' }).eq('id', msg.id);
                return;
            }
            try {
                await sock.sendMessage(msg.to_number + '@s.whatsapp.net', { text: msg.content.text });
                await auth_state_1.supabase.from('messages').update({ status: 'sent' }).eq('id', msg.id);
                logger.info({ msgId: msg.id }, 'Message sent');
            }
            catch (err) {
                logger.error({ err, msgId: msg.id }, 'Failed to send message');
                await auth_state_1.supabase.from('messages').update({ status: 'failed', error_message: err.message }).eq('id', msg.id);
            }
        }
    })
        .subscribe();
    logger.info('Worker is running and listening for events.');
}
main().catch(err => logger.error(err));
