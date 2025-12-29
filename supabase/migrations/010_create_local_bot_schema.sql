-- Create bot_rules table for local pattern matching
CREATE TABLE IF NOT EXISTS bot_rules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  trigger_keywords TEXT[] NOT NULL, -- Array of keywords like ['سعر', 'التكلفة', 'بكام']
  response_text TEXT NOT NULL,
  match_type TEXT DEFAULT 'contains', -- 'exact', 'contains', 'regex'
  is_active BOOLEAN DEFAULT true,
  priority INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster searching
CREATE INDEX IF NOT EXISTS idx_bot_rules_org ON bot_rules(organization_id);

-- Create bot_sessions to track conversation state
CREATE TABLE IF NOT EXISTS bot_sessions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  customer_phone TEXT NOT NULL,
  current_state TEXT DEFAULT 'idle',
  context_data JSONB DEFAULT '{}',
  last_interaction TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, customer_phone)
);

-- Add column to bot_config to allow switching between LOCAL and AI
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS bot_mode TEXT DEFAULT 'ai'; -- 'ai', 'local', 'hybrid'
