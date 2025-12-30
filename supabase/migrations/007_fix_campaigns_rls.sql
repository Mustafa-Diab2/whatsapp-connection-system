-- Fix RLS Policies for campaigns tables
-- This migration adds proper RLS policies that were missing

-- ========== CAMPAIGNS TABLE POLICIES ==========

-- Drop existing policies if any (to avoid conflicts)
DROP POLICY IF EXISTS "campaigns_select_policy" ON campaigns;
DROP POLICY IF EXISTS "campaigns_insert_policy" ON campaigns;
DROP POLICY IF EXISTS "campaigns_update_policy" ON campaigns;
DROP POLICY IF EXISTS "campaigns_delete_policy" ON campaigns;

-- Create SELECT policy: Users can only see their organization's campaigns
CREATE POLICY "campaigns_select_policy" ON campaigns
    FOR SELECT
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );

-- Create INSERT policy: Users can only create campaigns for their organization
CREATE POLICY "campaigns_insert_policy" ON campaigns
    FOR INSERT
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );

-- Create UPDATE policy: Users can only update their organization's campaigns
CREATE POLICY "campaigns_update_policy" ON campaigns
    FOR UPDATE
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    )
    WITH CHECK (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );

-- Create DELETE policy: Users can only delete their organization's campaigns
CREATE POLICY "campaigns_delete_policy" ON campaigns
    FOR DELETE
    USING (
        organization_id IN (
            SELECT organization_id FROM users WHERE id = auth.uid()
        )
    );

-- ========== CAMPAIGN_LOGS TABLE POLICIES ==========

-- Drop existing policies if any
DROP POLICY IF EXISTS "campaign_logs_select_policy" ON campaign_logs;
DROP POLICY IF EXISTS "campaign_logs_insert_policy" ON campaign_logs;
DROP POLICY IF EXISTS "campaign_logs_delete_policy" ON campaign_logs;

-- Create SELECT policy: Users can see logs for campaigns in their organization
CREATE POLICY "campaign_logs_select_policy" ON campaign_logs
    FOR SELECT
    USING (
        campaign_id IN (
            SELECT id FROM campaigns WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
        )
    );

-- Create INSERT policy: Users can add logs for campaigns in their organization
CREATE POLICY "campaign_logs_insert_policy" ON campaign_logs
    FOR INSERT
    WITH CHECK (
        campaign_id IN (
            SELECT id FROM campaigns WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
        )
    );

-- Create DELETE policy: Users can delete logs for campaigns in their organization
CREATE POLICY "campaign_logs_delete_policy" ON campaign_logs
    FOR DELETE
    USING (
        campaign_id IN (
            SELECT id FROM campaigns WHERE organization_id IN (
                SELECT organization_id FROM users WHERE id = auth.uid()
            )
        )
    );

-- ========== INDEXES FOR PERFORMANCE ==========

-- Add index on status for filtering active campaigns
CREATE INDEX IF NOT EXISTS idx_campaigns_status ON campaigns(status);

-- Add index on created_at for ordering
CREATE INDEX IF NOT EXISTS idx_campaigns_created_at ON campaigns(created_at DESC);

-- Add composite index for common query pattern
CREATE INDEX IF NOT EXISTS idx_campaigns_org_status ON campaigns(organization_id, status);

-- Add index on campaign_logs status for filtering
CREATE INDEX IF NOT EXISTS idx_campaign_logs_status ON campaign_logs(status);

-- Add index on sent_at for ordering
CREATE INDEX IF NOT EXISTS idx_campaign_logs_sent_at ON campaign_logs(sent_at DESC);

-- ========== SERVICE ROLE BYPASS ==========
-- Note: The service role key bypasses RLS, which is what we use in the backend API
-- This is the expected behavior since our backend validates organization access

-- For API access using service key (which bypasses RLS), we rely on 
-- application-level security (verifyToken middleware + org checks)

-- ========== GRANT PERMISSIONS ==========
GRANT ALL ON campaigns TO authenticated;
GRANT ALL ON campaign_logs TO authenticated;
GRANT ALL ON campaigns TO service_role;
GRANT ALL ON campaign_logs TO service_role;
