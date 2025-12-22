-- Create organizations table
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update users table to belong to an organization
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'admin'; -- admin, member

-- Add organization_id to all data tables
ALTER TABLE customers ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE threads ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE messages ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE ai_agents ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE bot_config ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE settings ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE ai_responses ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE analytics_daily ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customers_org ON customers(organization_id);
CREATE INDEX IF NOT EXISTS idx_contacts_org ON contacts(organization_id);
CREATE INDEX IF NOT EXISTS idx_conversations_org ON conversations(organization_id);
CREATE INDEX IF NOT EXISTS idx_messages_org ON messages(organization_id);

-- Disable RLS for now (logic will be handled in API)
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
