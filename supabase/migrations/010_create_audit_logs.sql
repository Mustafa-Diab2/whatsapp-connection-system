-- Create Audit Logs Table
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id UUID REFERENCES users(id) ON DELETE SET NULL, -- Nullable for system actions or failed logins
    action TEXT NOT NULL, -- e.g., 'create_deal', 'login_failed', 'delete_customer'
    details JSONB DEFAULT '{}'::jsonb, -- Store details like { deal_id: "...", old_value: "..." }
    ip_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for faster querying
CREATE INDEX idx_audit_logs_org ON audit_logs(organization_id);
CREATE INDEX idx_audit_logs_user ON audit_logs(user_id);
