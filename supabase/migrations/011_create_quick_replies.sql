-- =====================================================
-- QUICK_REPLIES TABLE - الردود السريعة
-- =====================================================
CREATE TABLE IF NOT EXISTS quick_replies (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  organization_id UUID NOT NULL, -- Ties to the organization
  title TEXT NOT NULL,
  shortcut TEXT, -- e.g. /welcome
  body TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_quick_replies_org ON quick_replies(organization_id);

-- Trigger for updated_at
CREATE TRIGGER update_quick_replies_updated_at
    BEFORE UPDATE ON quick_replies
    FOR EACH ROW
    EXECUTE FUNCTION update_updated_at_column();
