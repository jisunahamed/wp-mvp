-- 001_initial_schema.sql
-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
-- users table
CREATE TABLE public.users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    email TEXT UNIQUE NOT NULL,
    api_key TEXT UNIQUE NOT NULL,
    api_key_hash TEXT NOT NULL,
    -- bcrypt hash
    plan TEXT DEFAULT 'starter' CHECK (plan IN ('starter', 'pro', 'enterprise')),
    rate_limit_daily INTEGER DEFAULT 500,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_users_api_key ON public.users(api_key);
CREATE INDEX idx_users_email ON public.users(email);
-- sessions table
CREATE TABLE public.sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    session_name TEXT NOT NULL,
    phone_number TEXT,
    -- populated after QR scan
    status TEXT DEFAULT 'pending' CHECK (
        status IN (
            'pending',
            'qr_ready',
            'connected',
            'disconnected',
            'failed'
        )
    ),
    webhook_url TEXT,
    auth_state JSONB,
    -- Baileys auth credentials
    last_seen TIMESTAMPTZ,
    qr_code TEXT,
    -- temporary QR storage (expires in 60s)
    qr_expires_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, session_name)
);
CREATE INDEX idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX idx_sessions_status ON public.sessions(status);
CREATE INDEX idx_sessions_phone ON public.sessions(phone_number);
-- messages table
CREATE TABLE public.messages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
    message_id TEXT,
    -- WhatsApp message ID
    direction TEXT CHECK (direction IN ('incoming', 'outgoing')),
    message_type TEXT DEFAULT 'text' CHECK (
        message_type IN ('text', 'image', 'video', 'audio', 'document')
    ),
    from_number TEXT NOT NULL,
    to_number TEXT NOT NULL,
    content JSONB NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (
        status IN ('pending', 'sent', 'delivered', 'read', 'failed')
    ),
    webhook_sent BOOLEAN DEFAULT FALSE,
    webhook_attempts INTEGER DEFAULT 0,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_messages_session_id ON public.messages(session_id);
CREATE INDEX idx_messages_created_at ON public.messages(created_at DESC);
CREATE INDEX idx_messages_direction ON public.messages(direction);
CREATE INDEX idx_messages_status ON public.messages(status);
-- rate_limits table
CREATE TABLE public.rate_limits (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES public.users(id) ON DELETE CASCADE,
    date DATE DEFAULT CURRENT_DATE,
    message_count INTEGER DEFAULT 0,
    last_reset TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(user_id, date)
);
CREATE INDEX idx_rate_limits_user_date ON public.rate_limits(user_id, date);
-- webhook_logs table
CREATE TABLE public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    error TEXT,
    attempt_number INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_webhook_logs_message_id ON public.webhook_logs(message_id);
CREATE INDEX idx_webhook_logs_session_id ON public.webhook_logs(session_id);
CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);
-- Atomic increment function for rate limiting
CREATE OR REPLACE FUNCTION increment_rate_limit(p_user_id UUID, p_date DATE) RETURNS INTEGER AS $$
DECLARE current_count INTEGER;
BEGIN
INSERT INTO rate_limits (user_id, date, message_count)
VALUES (p_user_id, p_date, 1) ON CONFLICT (user_id, date) DO
UPDATE
SET message_count = rate_limits.message_count + 1,
    last_reset = NOW()
RETURNING message_count INTO current_count;
RETURN current_count;
END;
$$ LANGUAGE plpgsql;
-- Cleanup function for old messages
CREATE OR REPLACE FUNCTION cleanup_old_messages() RETURNS void AS $$ BEGIN
DELETE FROM messages
WHERE created_at < NOW() - INTERVAL '30 days';
END;
-- At the end of the file
-- webhook_logs table
CREATE TABLE IF NOT EXISTS public.webhook_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    message_id UUID REFERENCES public.messages(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.sessions(id) ON DELETE CASCADE,
    webhook_url TEXT NOT NULL,
    payload JSONB NOT NULL,
    response_status INTEGER,
    response_body TEXT,
    error TEXT,
    attempt_number INTEGER DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT NOW()
);
CREATE INDEX idx_webhook_logs_message_id ON public.webhook_logs(message_id);
CREATE INDEX idx_webhook_logs_session_id ON public.webhook_logs(session_id);
CREATE INDEX idx_webhook_logs_created_at ON public.webhook_logs(created_at DESC);