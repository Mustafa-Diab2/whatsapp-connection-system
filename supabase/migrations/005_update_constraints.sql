-- Drop old unique constraints if they exist (might vary based on setup but this is safer)
ALTER TABLE settings DROP CONSTRAINT IF EXISTS settings_key_key;
ALTER TABLE bot_config DROP CONSTRAINT IF EXISTS bot_config_client_id_key;

-- Add new composite unique constraints for multi-tenancy
ALTER TABLE settings ADD CONSTRAINT settings_org_key_unique UNIQUE (organization_id, key);
ALTER TABLE bot_config ADD CONSTRAINT bot_config_org_client_unique UNIQUE (organization_id, client_id);

-- Optional: Ensure contacts phone is unique per org, not globally
ALTER TABLE contacts DROP CONSTRAINT IF EXISTS contacts_phone_key;
ALTER TABLE contacts ADD CONSTRAINT contacts_org_phone_unique UNIQUE (organization_id, phone);

-- Update RLS policies (optional if we were using RLS, but staying prepared)
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;

-- Simple policy: users can see their own org
CREATE POLICY "Users can see their own org" ON organizations
    FOR SELECT USING (id IN (SELECT organization_id FROM users WHERE auth.uid() = id));
