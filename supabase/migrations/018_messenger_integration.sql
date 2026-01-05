-- Messenger Integration Migration
-- Creates tables for Facebook Messenger conversations and messages

-- ==================== MESSENGER PAGES ====================
CREATE TABLE IF NOT EXISTS messenger_pages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  page_id TEXT NOT NULL,
  page_name TEXT,
  page_picture TEXT,
  access_token TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  webhook_subscribed BOOLEAN DEFAULT false,
  connected_at TIMESTAMPTZ DEFAULT NOW(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(organization_id, page_id)
);

-- Index for faster lookups
CREATE INDEX IF NOT EXISTS idx_messenger_pages_org ON messenger_pages(organization_id);
CREATE INDEX IF NOT EXISTS idx_messenger_pages_page_id ON messenger_pages(page_id);

-- ==================== MESSENGER CONVERSATIONS ====================
CREATE TABLE IF NOT EXISTS messenger_conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  page_id UUID NOT NULL REFERENCES messenger_pages(id) ON DELETE CASCADE,
  psid TEXT NOT NULL, -- Page-Scoped User ID
  customer_name TEXT,
  customer_first_name TEXT,
  customer_last_name TEXT,
  profile_pic TEXT,
  is_active BOOLEAN DEFAULT true,
  is_blocked BOOLEAN DEFAULT false,
  last_message TEXT,
  last_message_at TIMESTAMPTZ,
  unread_count INTEGER DEFAULT 0,
  -- Referral tracking
  referral_source TEXT,
  referral_type TEXT,
  referral_ref TEXT,
  -- Tags and assignment
  tags TEXT[] DEFAULT '{}',
  assigned_to UUID REFERENCES users(id),
  -- Metadata
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  
  UNIQUE(page_id, psid)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messenger_conversations_org ON messenger_conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_messenger_conversations_page ON messenger_conversations(page_id);
CREATE INDEX IF NOT EXISTS idx_messenger_conversations_psid ON messenger_conversations(psid);
CREATE INDEX IF NOT EXISTS idx_messenger_conversations_last_message ON messenger_conversations(last_message_at DESC);
CREATE INDEX IF NOT EXISTS idx_messenger_conversations_unread ON messenger_conversations(unread_count) WHERE unread_count > 0;

-- ==================== MESSENGER MESSAGES ====================
CREATE TABLE IF NOT EXISTS messenger_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  conversation_id UUID NOT NULL REFERENCES messenger_conversations(id) ON DELETE CASCADE,
  message_id TEXT, -- Facebook message ID (mid)
  direction TEXT NOT NULL CHECK (direction IN ('inbound', 'outbound')),
  message_type TEXT DEFAULT 'text', -- text, image, video, audio, file, location, sticker, postback, template
  content TEXT,
  media_url TEXT,
  metadata JSONB DEFAULT '{}', -- For quick_replies, buttons, templates, etc.
  is_read BOOLEAN DEFAULT false,
  is_delivered BOOLEAN DEFAULT false,
  reaction TEXT,
  timestamp TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_messenger_messages_org ON messenger_messages(organization_id);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_conversation ON messenger_messages(conversation_id);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_timestamp ON messenger_messages(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_direction ON messenger_messages(direction);
CREATE INDEX IF NOT EXISTS idx_messenger_messages_unread ON messenger_messages(is_read) WHERE is_read = false;

-- ==================== ROW LEVEL SECURITY ====================

-- Enable RLS
ALTER TABLE messenger_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_conversations ENABLE ROW LEVEL SECURITY;
ALTER TABLE messenger_messages ENABLE ROW LEVEL SECURITY;

-- Policies for messenger_pages
CREATE POLICY "Users can view their org messenger pages"
  ON messenger_pages FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their org messenger pages"
  ON messenger_pages FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Policies for messenger_conversations
CREATE POLICY "Users can view their org messenger conversations"
  ON messenger_conversations FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their org messenger conversations"
  ON messenger_conversations FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- Policies for messenger_messages
CREATE POLICY "Users can view their org messenger messages"
  ON messenger_messages FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can manage their org messenger messages"
  ON messenger_messages FOR ALL
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations WHERE user_id = auth.uid()
  ));

-- ==================== FUNCTIONS ====================

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_messenger_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Triggers
CREATE TRIGGER trigger_messenger_pages_updated_at
  BEFORE UPDATE ON messenger_pages
  FOR EACH ROW
  EXECUTE FUNCTION update_messenger_updated_at();

CREATE TRIGGER trigger_messenger_conversations_updated_at
  BEFORE UPDATE ON messenger_conversations
  FOR EACH ROW
  EXECUTE FUNCTION update_messenger_updated_at();

-- ==================== SERVICE ROLE BYPASS ====================
-- Allow service role to bypass RLS for webhook processing

CREATE POLICY "Service role bypass for messenger_pages"
  ON messenger_pages FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role bypass for messenger_conversations"
  ON messenger_conversations FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');

CREATE POLICY "Service role bypass for messenger_messages"
  ON messenger_messages FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role');
