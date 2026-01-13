-- Enable Row Level Security on core tables
ALTER TABLE organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE campaign_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE quick_replies ENABLE ROW LEVEL SECURITY;
ALTER TABLE deals ENABLE ROW LEVEL SECURITY;

-- Create Policies (Example for customers table)
-- Policy: Users can only see customers of their own organization
CREATE POLICY "Users can only access their own organization's customers" 
ON customers 
FOR ALL 
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Repeat for campaigns
CREATE POLICY "Users can only access their own organization's campaigns" 
ON campaigns 
FOR ALL 
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));

-- Policy for users table (Users can only see themselves or colleagues)
CREATE POLICY "Users can only see colleagues in the same organization" 
ON users 
FOR ALL 
USING (organization_id = (SELECT organization_id FROM users WHERE id = auth.uid()));
