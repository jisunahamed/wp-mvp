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
exports.SessionManager = void 0;
const baileys_1 = __importStar(require("@whiskeysockets/baileys"));
const auth_state_1 = require("./auth-state");
const pino_1 = __importDefault(require("pino"));
const logger = (0, pino_1.default)({ level: 'info' });
class SessionManager {
    static async startSession(sessionId) {
        if (this.sessions.has(sessionId)) {
            logger.info({ sessionId }, 'Session already active');
            return;
        }
        logger.info({ sessionId }, 'Starting session...');
        try {
            const { state, saveCreds } = await (0, auth_state_1.useSupabaseAuthState)(sessionId);
            // hardcoded version for stability similar to the nextjs fix
            const version = [2, 3000, 1015901307];
            const sock = (0, baileys_1.default)({
                version,
                logger,
                auth: {
                    creds: state.creds,
                    keys: (0, baileys_1.makeCacheableSignalKeyStore)(state.keys, logger),
                },
                printQRInTerminal: false, // We'll save QR to DB
                generateHighQualityLinkPreview: true,
            });
            this.sessions.set(sessionId, sock);
            sock.ev.on('creds.update', saveCreds);
            sock.ev.on('connection.update', async (update) => {
                const { connection, lastDisconnect, qr } = update;
                if (qr) {
                    logger.info({ sessionId }, 'QR Code generated');
                    await auth_state_1.supabase
                        .from('sessions')
                        .update({
                        qr_code: qr,
                        qr_expires_at: new Date(Date.now() + 60000).toISOString(), // 60s validity
                        status: 'qr_ready'
                    })
                        .eq('id', sessionId);
                }
                if (connection === 'open') {
                    logger.info({ sessionId }, 'Connection OPEN');
                    const user = sock.user;
                    const phoneNumber = user?.id?.split(':')[0];
                    await auth_state_1.supabase
                        .from('sessions')
                        .update({
                        status: 'connected',
                        qr_code: null,
                        phone_number: phoneNumber,
                        last_seen: new Date().toISOString()
                    })
                        .eq('id', sessionId);
                }
                if (connection === 'close') {
                    const shouldReconnect = lastDisconnect?.error?.output?.statusCode !== baileys_1.DisconnectReason.loggedOut;
                    logger.info({ sessionId, shouldReconnect }, 'Connection CLOSED');
                    if (shouldReconnect) {
                        this.sessions.delete(sessionId);
                        this.startSession(sessionId); // Auto-reconnect
                    }
                    else {
                        // Logged out
                        await auth_state_1.supabase
                            .from('sessions')
                            .update({ status: 'disconnected', auth_state: null })
                            .eq('id', sessionId);
                        this.sessions.delete(sessionId);
                    }
                }
            });
            // Handle Incoming Messages
            sock.ev.on('messages.upsert', async (m) => {
                if (m.type === 'notify') {
                    for (const msg of m.messages) {
                        if (!msg.message || msg.key.fromMe || msg.key.remoteJid === 'status@broadcast')
                            continue;
                        logger.info({ sessionId, msgId: msg.key.id }, 'Received message');
                        const type = msg.message.imageMessage ? 'image' :
                            msg.message.conversation ? 'text' : 'unknown';
                        // Save to DB (The Dispatcher in Next.js or a separate webhook listener can pick this up)
                        // Ideally, we replicate the message handler logic here.
                        // For MVP, lets just insert into 'messages' table. 
                        // The existing Webhook Dispatcher logic in Next.js relies on the Next.js API inserted it.
                        // If we insert here, we also need to dispatch webhooks here or let Supabase trigger something.
                        // EASIEST MVP: Dispatch Webhook Here directly.
                        const { data: session } = await auth_state_1.supabase.from('sessions').select('webhook_url').eq('id', sessionId).single();
                        if (session?.webhook_url) {
                            // Simple fire-and-forget webhook
                            const payload = {
                                event: 'message.received',
                                session_id: sessionId,
                                message: msg.message,
                                received_at: new Date().toISOString()
                            };
                            fetch(session.webhook_url, {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify(payload)
                            }).catch(err => logger.error({ err }, 'Failed to send webhook'));
                        }
                    }
                }
            });
        }
        catch (error) {
            logger.error({ sessionId, error }, 'Failed to start session');
        }
    }
    static async stopSession(sessionId) {
        const sock = this.sessions.get(sessionId);
        if (sock) {
            sock.end(undefined);
            this.sessions.delete(sessionId);
        }
    }
    static getSession(sessionId) {
        return this.sessions.get(sessionId);
    }
}
exports.SessionManager = SessionManager;
SessionManager.sessions = new Map();
