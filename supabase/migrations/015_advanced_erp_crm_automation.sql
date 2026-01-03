-- Migration: 015_advanced_erp_crm_automation
-- Description: Foundation for Internal Notes, Scheduled Reminders, Workflows, and AI Insights

-- 1. Internal Notes support in messages
ALTER TABLE messages ADD COLUMN IF NOT EXISTS is_internal BOOLEAN DEFAULT false;

-- 2. Reminders & Scheduled Tasks
CREATE TABLE IF NOT EXISTS scheduled_reminders (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
    related_id UUID, -- id of invoice, order, etc.
    type TEXT NOT NULL, -- 'invoice_payment', 'loyalty_expiration', 'follow_up'
    scheduled_for TIMESTAMPTZ NOT NULL,
    status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'sent', 'cancelled', 'failed')),
    message_text TEXT,
    retry_count INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    executed_at TIMESTAMPTZ
);

-- 3. Proactive AI Insights
CREATE TABLE IF NOT EXISTS ai_insights (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    type TEXT NOT NULL, -- 'inventory_demand', 'customer_sentiment_alert', 'sales_opportunity'
    title TEXT NOT NULL,
    content TEXT NOT NULL,
    urgency TEXT DEFAULT 'medium' CHECK (urgency IN ('low', 'medium', 'high')),
    status TEXT DEFAULT 'active' CHECK (status IN ('active', 'dismissed', 'resolved')),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 4. Workflows (Visual Scenario Engine)
CREATE TABLE IF NOT EXISTS workflows (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    organization_id UUID NOT NULL,
    name TEXT NOT NULL,
    trigger_type TEXT NOT NULL, -- 'keyword', 'new_customer', 'invoice_created'
    trigger_config JSONB DEFAULT '{}',
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS workflow_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    workflow_id UUID REFERENCES workflows(id) ON DELETE CASCADE,
    step_order INTEGER NOT NULL,
    action_type TEXT NOT NULL, -- 'send_message', 'send_list', 'send_buttons', 'update_status', 'notify_admin'
    action_config JSONB DEFAULT '{}',
    next_step_id UUID,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. Indexes
CREATE INDEX IF NOT EXISTS idx_reminders_status ON scheduled_reminders(status, scheduled_for);
CREATE INDEX IF NOT EXISTS idx_insights_org ON ai_insights(organization_id, status);
CREATE INDEX IF NOT EXISTS idx_workflows_org ON workflows(organization_id, is_active);
