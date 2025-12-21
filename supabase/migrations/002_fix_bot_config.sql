-- Create bot_config table if it doesn't exist
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

-- Insert default config if not exists
INSERT INTO bot_config (client_id, enabled, system_prompt, api_key) 
VALUES (
  'default', 
  true, 
  'أنت مساعد ذكي لخدمة العملاء. كن مهذباً ومفيداً.',
  ''
)
ON CONFLICT (client_id) 
DO UPDATE SET 
  enabled = true,
  api_key = EXCLUDED.api_key;
