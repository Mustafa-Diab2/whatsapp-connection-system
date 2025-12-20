-- =====================================================
-- WhatsApp CRM Database Schema
-- Supabase PostgreSQL
-- =====================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =====================================================
-- 1. CUSTOMERS TABLE - العملاء
-- =====================================================
CREATE TABLE IF NOT EXISTS customers (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('active', 'inactive', 'pending')),
  notes TEXT,
  tags TEXT[] DEFAULT '{}',
  source TEXT DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_contact_at TIMESTAMPTZ
);

-- Index for phone lookup
CREATE INDEX IF NOT EXISTS idx_customers_phone ON customers(phone);
CREATE INDEX IF NOT EXISTS idx_customers_status ON customers(status);

-- =====================================================
-- 2. CONTACTS TABLE - جهات الاتصال
-- =====================================================
CREATE TABLE IF NOT EXISTS contacts (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  group_name TEXT DEFAULT 'عملاء جدد',
  avatar TEXT DEFAULT '👤',
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_contacts_phone ON contacts(phone);
CREATE INDEX IF NOT EXISTS idx_contacts_group ON contacts(group_name);

-- =====================================================
-- 3. CONVERSATIONS TABLE - المحادثات
-- =====================================================
CREATE TABLE IF NOT EXISTS conversations (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  wa_chat_id TEXT NOT NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'closed', 'archived')),
  priority TEXT DEFAULT 'normal' CHECK (priority IN ('low', 'normal', 'high')),
  assigned_to TEXT,
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_conversations_wa_chat_id ON conversations(wa_chat_id);
CREATE INDEX IF NOT EXISTS idx_conversations_customer ON conversations(customer_id);
CREATE INDEX IF NOT EXISTS idx_conversations_status ON conversations(status);

-- =====================================================
-- 4. MESSAGES TABLE - الرسائل
-- =====================================================
CREATE TABLE IF NOT EXISTS messages (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  conversation_id UUID REFERENCES conversations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  wa_message_id TEXT UNIQUE,
  body TEXT,
  from_phone TEXT,
  to_phone TEXT,
  is_from_customer BOOLEAN DEFAULT true,
  is_bot_reply BOOLEAN DEFAULT false,
  message_type TEXT DEFAULT 'text' CHECK (message_type IN ('text', 'image', 'audio', 'video', 'document', 'sticker')),
  sentiment TEXT CHECK (sentiment IN ('positive', 'negative', 'neutral')),
  intent TEXT,
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messages_customer ON messages(customer_id);
CREATE INDEX IF NOT EXISTS idx_messages_created_at ON messages(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_messages_wa_id ON messages(wa_message_id);

-- =====================================================
-- 5. AI_RESPONSES TABLE - ردود الذكاء الاصطناعي
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_responses (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  message_id UUID REFERENCES messages(id) ON DELETE CASCADE,
  prompt TEXT,
  response TEXT,
  model TEXT DEFAULT 'gemini-1.5-flash',
  tokens_used INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_ai_responses_message ON ai_responses(message_id);

-- =====================================================
-- 6. THREADS TABLE - تذاكر الدعم
-- =====================================================
CREATE TABLE IF NOT EXISTS threads (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  title TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  customer_name TEXT,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  status TEXT DEFAULT 'open' CHECK (status IN ('open', 'pending', 'closed')),
  priority TEXT DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
  assigned_to TEXT,
  messages_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_threads_status ON threads(status);
CREATE INDEX IF NOT EXISTS idx_threads_customer ON threads(customer_id);

-- =====================================================
-- 7. SETTINGS TABLE - الإعدادات
-- =====================================================
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default settings
INSERT INTO settings (key, value) VALUES 
  ('general', '{"companyName": "شركتي", "welcomeMessage": "مرحباً بك! كيف يمكنني مساعدتك؟", "language": "ar", "theme": "light"}'),
  ('notifications', '{"notifyNewMessage": true, "notifyNewCustomer": true}'),
  ('bot', '{"enabled": false, "systemPrompt": "", "apiKey": ""}')
ON CONFLICT (key) DO NOTHING;

-- =====================================================
-- 8. ANALYTICS_DAILY TABLE - الإحصائيات اليومية
-- =====================================================
CREATE TABLE IF NOT EXISTS analytics_daily (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  date DATE UNIQUE NOT NULL DEFAULT CURRENT_DATE,
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  new_customers INTEGER DEFAULT 0,
  bot_replies INTEGER DEFAULT 0,
  avg_response_time_seconds INTEGER DEFAULT 0,
  positive_sentiment_count INTEGER DEFAULT 0,
  negative_sentiment_count INTEGER DEFAULT 0,
  neutral_sentiment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_analytics_date ON analytics_daily(date DESC);

-- =====================================================
-- 9. BOT_CONFIG TABLE - إعدادات البوت
-- =====================================================
CREATE TABLE IF NOT EXISTS bot_config (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  client_id TEXT UNIQUE NOT NULL DEFAULT 'default',
  enabled BOOLEAN DEFAULT false,
  system_prompt TEXT DEFAULT '',
  api_key TEXT DEFAULT '',
  model TEXT DEFAULT 'gemini-1.5-flash',
  max_tokens INTEGER DEFAULT 500,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert default bot config
INSERT INTO bot_config (client_id, enabled, system_prompt) VALUES 
  ('default', false, 'أنت مساعد ذكي لخدمة العملاء. كن مهذباً ومفيداً.')
ON CONFLICT (client_id) DO NOTHING;

-- =====================================================
-- FUNCTIONS - دوال مساعدة
-- =====================================================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for updated_at
CREATE TRIGGER update_customers_updated_at
    BEFORE UPDATE ON customers
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_threads_updated_at
    BEFORE UPDATE ON threads
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_bot_config_updated_at
    BEFORE UPDATE ON bot_config
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();

-- =====================================================
-- Function to increment daily analytics
-- =====================================================
CREATE OR REPLACE FUNCTION increment_daily_stat(
  stat_name TEXT,
  increment_by INTEGER DEFAULT 1
)
RETURNS VOID AS $$
BEGIN
  INSERT INTO analytics_daily (date)
  VALUES (CURRENT_DATE)
  ON CONFLICT (date) DO NOTHING;
  
  EXECUTE format(
    'UPDATE analytics_daily SET %I = %I + $1 WHERE date = CURRENT_DATE',
    stat_name, stat_name
  ) USING increment_by;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- ROW LEVEL SECURITY (RLS)
-- =====================================================
-- For now, we'll keep RLS disabled since backend uses service role
-- You can enable it later for more security

-- ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
-- ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
-- etc.

-- =====================================================
-- REALTIME - Enable real-time for specific tables
-- =====================================================
-- Run this in Supabase Dashboard -> Database -> Replication
-- Enable real-time for: messages, customers, threads

-- =====================================================
-- DONE! 🎉
-- =====================================================
