-- =====================================================
-- Migration 016: Facebook Integration & Attribution Tracking
-- =====================================================
-- This migration adds:
-- 1. Facebook Pages management table
-- 2. Click attribution events for tracking ad conversions
-- 3. Customer source tracking fields
-- 4. Channel support for multi-channel messaging
-- =====================================================

-- =====================================================
-- 1. Create facebook_pages table
-- =====================================================
CREATE TABLE IF NOT EXISTS facebook_pages (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    page_id TEXT NOT NULL,
    page_name TEXT NOT NULL,
    page_picture_url TEXT,
    access_token_encrypted TEXT NOT NULL,
    token_expires_at TIMESTAMPTZ,
    is_active BOOLEAN DEFAULT true,
    webhook_subscribed BOOLEAN DEFAULT false,
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, page_id)
);

-- Index for quick lookups
CREATE INDEX IF NOT EXISTS idx_facebook_pages_org ON facebook_pages(organization_id);
CREATE INDEX IF NOT EXISTS idx_facebook_pages_page_id ON facebook_pages(page_id);

-- =====================================================
-- 2. Create facebook_ad_accounts table
-- =====================================================
CREATE TABLE IF NOT EXISTS facebook_ad_accounts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ad_account_id TEXT NOT NULL,
    ad_account_name TEXT,
    facebook_page_id UUID REFERENCES facebook_pages(id) ON DELETE SET NULL,
    currency TEXT DEFAULT 'USD',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, ad_account_id)
);

-- =====================================================
-- 3. Create facebook_campaigns table (synced from FB)
-- =====================================================
CREATE TABLE IF NOT EXISTS facebook_campaigns (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    ad_account_id UUID REFERENCES facebook_ad_accounts(id) ON DELETE CASCADE,
    fb_campaign_id TEXT NOT NULL,
    fb_campaign_name TEXT NOT NULL,
    objective TEXT,
    status TEXT, -- ACTIVE, PAUSED, DELETED, ARCHIVED
    daily_budget DECIMAL(12,2),
    lifetime_budget DECIMAL(12,2),
    start_time TIMESTAMPTZ,
    stop_time TIMESTAMPTZ,
    insights JSONB DEFAULT '{}', -- reach, impressions, clicks, spend
    last_synced_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(organization_id, fb_campaign_id)
);

CREATE INDEX IF NOT EXISTS idx_fb_campaigns_org ON facebook_campaigns(organization_id);
CREATE INDEX IF NOT EXISTS idx_fb_campaigns_fb_id ON facebook_campaigns(fb_campaign_id);

-- =====================================================
-- 4. Create click_attribution_events table
-- =====================================================
CREATE TABLE IF NOT EXISTS click_attribution_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    
    -- Click identification
    short_code TEXT UNIQUE, -- For short URLs like /t/abc123
    phone TEXT, -- Normalized phone number from the link
    
    -- Facebook attribution data
    fbclid TEXT, -- Facebook Click ID from URL
    ctwa_clid TEXT, -- Click-to-WhatsApp Click ID
    fbc TEXT, -- Formatted _fbc cookie value
    fbp TEXT, -- Browser ID (_fbp cookie)
    
    -- UTM parameters
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    
    -- Source campaign info
    source_type TEXT, -- 'facebook', 'instagram', 'google', 'direct', etc.
    source_campaign_id TEXT,
    source_campaign_name TEXT,
    source_ad_id TEXT,
    source_ad_name TEXT,
    source_adset_id TEXT,
    
    -- Tracking data
    ip_address TEXT,
    user_agent TEXT,
    referrer_url TEXT,
    landing_url TEXT,
    
    -- Conversion tracking
    clicked_at TIMESTAMPTZ DEFAULT NOW(),
    converted_at TIMESTAMPTZ, -- When customer was created
    customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
    conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
    
    -- Status
    status TEXT DEFAULT 'pending', -- pending, converted, expired
    
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Indexes for attribution matching
CREATE INDEX IF NOT EXISTS idx_click_attribution_phone ON click_attribution_events(phone);
CREATE INDEX IF NOT EXISTS idx_click_attribution_fbclid ON click_attribution_events(fbclid);
CREATE INDEX IF NOT EXISTS idx_click_attribution_ctwa ON click_attribution_events(ctwa_clid);
CREATE INDEX IF NOT EXISTS idx_click_attribution_org ON click_attribution_events(organization_id);
CREATE INDEX IF NOT EXISTS idx_click_attribution_clicked ON click_attribution_events(clicked_at);
CREATE INDEX IF NOT EXISTS idx_click_attribution_short_code ON click_attribution_events(short_code);

-- =====================================================
-- 5. Extend customers table for attribution
-- =====================================================
DO $$ 
BEGIN
    -- Add channel field
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customers' AND column_name = 'channel') THEN
        ALTER TABLE customers ADD COLUMN channel TEXT DEFAULT 'whatsapp';
    END IF;
    
    -- Add Facebook PSID
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customers' AND column_name = 'facebook_psid') THEN
        ALTER TABLE customers ADD COLUMN facebook_psid TEXT;
    END IF;
    
    -- Add source tracking fields
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customers' AND column_name = 'source_type') THEN
        ALTER TABLE customers ADD COLUMN source_type TEXT DEFAULT 'direct';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customers' AND column_name = 'source_campaign_id') THEN
        ALTER TABLE customers ADD COLUMN source_campaign_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customers' AND column_name = 'source_campaign_name') THEN
        ALTER TABLE customers ADD COLUMN source_campaign_name TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customers' AND column_name = 'source_ad_id') THEN
        ALTER TABLE customers ADD COLUMN source_ad_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customers' AND column_name = 'fbclid') THEN
        ALTER TABLE customers ADD COLUMN fbclid TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customers' AND column_name = 'ctwa_clid') THEN
        ALTER TABLE customers ADD COLUMN ctwa_clid TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customers' AND column_name = 'first_touch_at') THEN
        ALTER TABLE customers ADD COLUMN first_touch_at TIMESTAMPTZ;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'customers' AND column_name = 'attribution_data') THEN
        ALTER TABLE customers ADD COLUMN attribution_data JSONB DEFAULT '{}';
    END IF;
END $$;

-- Index for Facebook PSID lookups
CREATE INDEX IF NOT EXISTS idx_customers_fb_psid ON customers(facebook_psid) WHERE facebook_psid IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_source_type ON customers(source_type);
CREATE INDEX IF NOT EXISTS idx_customers_channel ON customers(channel);

-- =====================================================
-- 6. Extend conversations table for multi-channel
-- =====================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'conversations' AND column_name = 'channel') THEN
        ALTER TABLE conversations ADD COLUMN channel TEXT DEFAULT 'whatsapp';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'conversations' AND column_name = 'facebook_conversation_id') THEN
        ALTER TABLE conversations ADD COLUMN facebook_conversation_id TEXT;
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'conversations' AND column_name = 'last_customer_message_at') THEN
        ALTER TABLE conversations ADD COLUMN last_customer_message_at TIMESTAMPTZ;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_conversations_channel ON conversations(channel);
CREATE INDEX IF NOT EXISTS idx_conversations_fb_id ON conversations(facebook_conversation_id) WHERE facebook_conversation_id IS NOT NULL;

-- =====================================================
-- 7. Extend messages table for multi-channel
-- =====================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'messages' AND column_name = 'channel') THEN
        ALTER TABLE messages ADD COLUMN channel TEXT DEFAULT 'whatsapp';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'messages' AND column_name = 'fb_message_id') THEN
        ALTER TABLE messages ADD COLUMN fb_message_id TEXT;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_messages_channel ON messages(channel);

-- =====================================================
-- 8. Extend campaigns table for multi-channel
-- =====================================================
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'campaigns' AND column_name = 'channels') THEN
        ALTER TABLE campaigns ADD COLUMN channels TEXT[] DEFAULT '{whatsapp}';
    END IF;
    
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'campaigns' AND column_name = 'linked_fb_campaign_id') THEN
        ALTER TABLE campaigns ADD COLUMN linked_fb_campaign_id UUID REFERENCES facebook_campaigns(id) ON DELETE SET NULL;
    END IF;
END $$;

-- =====================================================
-- 9. Create tracking_links table for short URLs
-- =====================================================
CREATE TABLE IF NOT EXISTS tracking_links (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    short_code TEXT NOT NULL UNIQUE,
    
    -- Destination
    destination_type TEXT NOT NULL, -- 'whatsapp', 'messenger', 'website'
    destination_phone TEXT, -- For WhatsApp links
    destination_url TEXT, -- For website links
    default_message TEXT,
    
    -- UTM parameters
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    utm_content TEXT,
    utm_term TEXT,
    
    -- Associated campaign
    campaign_name TEXT,
    fb_campaign_id TEXT,
    fb_ad_id TEXT,
    
    -- Statistics
    click_count INTEGER DEFAULT 0,
    conversion_count INTEGER DEFAULT 0,
    
    -- Status
    is_active BOOLEAN DEFAULT true,
    expires_at TIMESTAMPTZ,
    
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_tracking_links_short_code ON tracking_links(short_code);
CREATE INDEX IF NOT EXISTS idx_tracking_links_org ON tracking_links(organization_id);

-- =====================================================
-- 10. Create facebook_webhooks_log table for debugging
-- =====================================================
CREATE TABLE IF NOT EXISTS facebook_webhooks_log (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    page_id TEXT,
    payload JSONB NOT NULL,
    processed BOOLEAN DEFAULT false,
    error_message TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_fb_webhooks_created ON facebook_webhooks_log(created_at);
CREATE INDEX IF NOT EXISTS idx_fb_webhooks_type ON facebook_webhooks_log(event_type);

-- =====================================================
-- 11. Add RLS policies for new tables
-- =====================================================

-- Enable RLS
ALTER TABLE facebook_pages ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_ad_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE click_attribution_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE tracking_links ENABLE ROW LEVEL SECURITY;
ALTER TABLE facebook_webhooks_log ENABLE ROW LEVEL SECURITY;

-- Policies for facebook_pages
DROP POLICY IF EXISTS "Users can view own org facebook pages" ON facebook_pages;
CREATE POLICY "Users can view own org facebook pages" ON facebook_pages
    FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS "Users can manage own org facebook pages" ON facebook_pages;
CREATE POLICY "Users can manage own org facebook pages" ON facebook_pages
    FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- Policies for click_attribution_events
DROP POLICY IF EXISTS "Users can view own org attribution events" ON click_attribution_events;
CREATE POLICY "Users can view own org attribution events" ON click_attribution_events
    FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS "Users can manage own org attribution events" ON click_attribution_events;
CREATE POLICY "Users can manage own org attribution events" ON click_attribution_events
    FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- Policies for tracking_links
DROP POLICY IF EXISTS "Users can view own org tracking links" ON tracking_links;
CREATE POLICY "Users can view own org tracking links" ON tracking_links
    FOR SELECT USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

DROP POLICY IF EXISTS "Users can manage own org tracking links" ON tracking_links;
CREATE POLICY "Users can manage own org tracking links" ON tracking_links
    FOR ALL USING (organization_id = current_setting('app.current_organization_id', true)::uuid);

-- =====================================================
-- 12. Helper function to find attribution by phone
-- =====================================================
CREATE OR REPLACE FUNCTION find_attribution_by_phone(
    p_phone TEXT,
    p_organization_id UUID,
    p_window_days INTEGER DEFAULT 30
)
RETURNS TABLE (
    attribution_id UUID,
    source_type TEXT,
    source_campaign_id TEXT,
    source_campaign_name TEXT,
    source_ad_id TEXT,
    fbclid TEXT,
    ctwa_clid TEXT,
    utm_source TEXT,
    utm_medium TEXT,
    utm_campaign TEXT,
    clicked_at TIMESTAMPTZ
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        cae.id,
        cae.source_type,
        cae.source_campaign_id,
        cae.source_campaign_name,
        cae.source_ad_id,
        cae.fbclid,
        cae.ctwa_clid,
        cae.utm_source,
        cae.utm_medium,
        cae.utm_campaign,
        cae.clicked_at
    FROM click_attribution_events cae
    WHERE cae.phone = p_phone
      AND cae.organization_id = p_organization_id
      AND cae.status = 'pending'
      AND cae.clicked_at > NOW() - (p_window_days || ' days')::INTERVAL
    ORDER BY cae.clicked_at DESC
    LIMIT 1;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 13. Function to mark attribution as converted
-- =====================================================
CREATE OR REPLACE FUNCTION mark_attribution_converted(
    p_attribution_id UUID,
    p_customer_id UUID,
    p_conversation_id UUID DEFAULT NULL
)
RETURNS VOID AS $$
BEGIN
    UPDATE click_attribution_events
    SET 
        status = 'converted',
        converted_at = NOW(),
        customer_id = p_customer_id,
        conversation_id = p_conversation_id
    WHERE id = p_attribution_id;
END;
$$ LANGUAGE plpgsql;

-- =====================================================
-- 14. Create view for attribution report
-- =====================================================
CREATE OR REPLACE VIEW attribution_report AS
SELECT 
    c.organization_id,
    c.source_type,
    c.source_campaign_name,
    COUNT(DISTINCT c.id) as customer_count,
    COUNT(DISTINCT CASE WHEN d.id IS NOT NULL THEN c.id END) as customers_with_deals,
    COALESCE(SUM(d.value), 0) as total_deal_value,
    COUNT(DISTINCT d.id) as deal_count,
    MIN(c.created_at) as first_customer_at,
    MAX(c.created_at) as last_customer_at
FROM customers c
LEFT JOIN deals d ON d.customer_id = c.id
WHERE c.source_type IS NOT NULL
GROUP BY c.organization_id, c.source_type, c.source_campaign_name;

-- =====================================================
-- Done!
-- =====================================================
