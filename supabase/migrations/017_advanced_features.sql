-- =====================================================
-- Migration 017: Advanced Features
-- Payment Links, Appointments, Surveys, Quick Replies, etc.
-- =====================================================

-- =====================================================
-- 1. PAYMENT LINKS
-- =====================================================
CREATE TABLE IF NOT EXISTS payment_links (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  amount DECIMAL(12,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'EGP',
  description TEXT NOT NULL,
  
  stripe_payment_link_id TEXT,
  stripe_payment_intent_id TEXT,
  payment_url TEXT NOT NULL,
  short_code VARCHAR(10) UNIQUE NOT NULL,
  
  status VARCHAR(20) DEFAULT 'pending' CHECK (status IN ('pending', 'paid', 'expired', 'cancelled')),
  
  expires_at TIMESTAMPTZ,
  paid_at TIMESTAMPTZ,
  
  metadata JSONB DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_payment_links_org ON payment_links(organization_id);
CREATE INDEX idx_payment_links_status ON payment_links(status);
CREATE INDEX idx_payment_links_short_code ON payment_links(short_code);

-- =====================================================
-- 2. APPOINTMENTS / BOOKING SYSTEM
-- =====================================================
CREATE TABLE IF NOT EXISTS appointment_types (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  duration_minutes INT DEFAULT 30,
  price DECIMAL(10,2) DEFAULT 0,
  color VARCHAR(7) DEFAULT '#3B82F6',
  is_active BOOLEAN DEFAULT true,
  
  -- Availability settings
  available_days INT[] DEFAULT '{1,2,3,4,5}', -- 0=Sunday, 6=Saturday
  start_time TIME DEFAULT '09:00',
  end_time TIME DEFAULT '17:00',
  buffer_minutes INT DEFAULT 15,
  max_advance_days INT DEFAULT 30,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS appointments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  appointment_type_id UUID REFERENCES appointment_types(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  title VARCHAR(255) NOT NULL,
  description TEXT,
  
  start_time TIMESTAMPTZ NOT NULL,
  end_time TIMESTAMPTZ NOT NULL,
  
  status VARCHAR(20) DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'confirmed', 'cancelled', 'completed', 'no_show')),
  
  -- Customer info (for non-registered customers)
  customer_name VARCHAR(255),
  customer_phone VARCHAR(50),
  customer_email VARCHAR(255),
  
  -- Reminders
  reminder_sent BOOLEAN DEFAULT false,
  reminder_24h_sent BOOLEAN DEFAULT false,
  reminder_1h_sent BOOLEAN DEFAULT false,
  
  notes TEXT,
  metadata JSONB DEFAULT '{}',
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_appointments_org ON appointments(organization_id);
CREATE INDEX idx_appointments_date ON appointments(start_time);
CREATE INDEX idx_appointments_customer ON appointments(customer_id);
CREATE INDEX idx_appointments_status ON appointments(status);

-- =====================================================
-- 3. CUSTOMER SATISFACTION SURVEYS
-- =====================================================
CREATE TABLE IF NOT EXISTS survey_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  trigger_type VARCHAR(50) DEFAULT 'manual' CHECK (trigger_type IN ('manual', 'after_order', 'after_invoice_paid', 'after_conversation', 'scheduled')),
  trigger_delay_hours INT DEFAULT 24,
  
  questions JSONB NOT NULL DEFAULT '[]',
  -- Example: [{"id": "q1", "type": "rating", "text": "كيف تقيم خدمتنا؟", "options": [1,2,3,4,5]}]
  
  thank_you_message TEXT DEFAULT 'شكراً لمشاركتك! رأيك يهمنا 🙏',
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS survey_responses (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  survey_template_id UUID REFERENCES survey_templates(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  
  -- Linked entities
  order_id UUID REFERENCES orders(id) ON DELETE SET NULL,
  invoice_id UUID REFERENCES invoices(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  
  responses JSONB NOT NULL DEFAULT '{}',
  -- Example: {"q1": 5, "q2": "ممتاز جداً"}
  
  overall_rating DECIMAL(3,2),
  sentiment VARCHAR(20),
  
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_survey_responses_org ON survey_responses(organization_id);
CREATE INDEX idx_survey_responses_customer ON survey_responses(customer_id);
CREATE INDEX idx_survey_responses_rating ON survey_responses(overall_rating);

-- =====================================================
-- 4. QUICK REPLY TEMPLATES (Enhanced)
-- =====================================================
CREATE TABLE IF NOT EXISTS quick_reply_categories (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  icon VARCHAR(50) DEFAULT '💬',
  sort_order INT DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Update existing quick_replies table if exists, or create
CREATE TABLE IF NOT EXISTS quick_reply_templates (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  category_id UUID REFERENCES quick_reply_categories(id) ON DELETE SET NULL,
  
  name VARCHAR(255) NOT NULL,
  shortcut VARCHAR(50), -- e.g., "/hello" or "!price"
  
  content TEXT NOT NULL,
  
  -- Dynamic variables support
  -- Available: {customer_name}, {customer_phone}, {order_id}, {invoice_amount}, {product_name}
  has_variables BOOLEAN DEFAULT false,
  
  -- Media attachment
  media_type VARCHAR(20), -- image, video, document
  media_url TEXT,
  
  -- Buttons
  buttons JSONB DEFAULT '[]',
  -- Example: [{"type": "url", "text": "زيارة الموقع", "url": "https://..."}]
  
  usage_count INT DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_quick_replies_org ON quick_reply_templates(organization_id);
CREATE INDEX idx_quick_replies_shortcut ON quick_reply_templates(shortcut);
CREATE INDEX idx_quick_replies_category ON quick_reply_templates(category_id);

-- =====================================================
-- 5. PRODUCT CATALOG SHARING (WhatsApp Shop)
-- =====================================================
CREATE TABLE IF NOT EXISTS product_catalogs (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Sharing settings
  short_code VARCHAR(10) UNIQUE NOT NULL,
  share_url TEXT,
  
  -- Display settings
  cover_image TEXT,
  theme_color VARCHAR(7) DEFAULT '#3B82F6',
  show_prices BOOLEAN DEFAULT true,
  show_stock BOOLEAN DEFAULT false,
  
  -- Included products
  product_ids UUID[] DEFAULT '{}',
  category_filter JSONB DEFAULT '{}',
  
  is_active BOOLEAN DEFAULT true,
  view_count INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS catalog_views (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  catalog_id UUID REFERENCES product_catalogs(id) ON DELETE CASCADE,
  customer_phone VARCHAR(50),
  viewed_products UUID[] DEFAULT '{}',
  source VARCHAR(50), -- whatsapp, direct, qr
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 6. CHATBOT FLOW BUILDER (Visual Bot)
-- =====================================================
CREATE TABLE IF NOT EXISTS chatbot_flows (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  name VARCHAR(255) NOT NULL,
  description TEXT,
  
  -- Flow definition (nodes and edges)
  nodes JSONB NOT NULL DEFAULT '[]',
  edges JSONB NOT NULL DEFAULT '[]',
  
  -- Trigger settings
  trigger_type VARCHAR(50) DEFAULT 'keyword' CHECK (trigger_type IN ('keyword', 'new_customer', 'always', 'schedule', 'api')),
  trigger_keywords TEXT[] DEFAULT '{}',
  
  is_active BOOLEAN DEFAULT true,
  priority INT DEFAULT 0,
  
  -- Stats
  triggered_count INT DEFAULT 0,
  completed_count INT DEFAULT 0,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS chatbot_flow_sessions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  flow_id UUID REFERENCES chatbot_flows(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES customers(id) ON DELETE SET NULL,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  
  current_node_id VARCHAR(100),
  variables JSONB DEFAULT '{}',
  
  status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'completed', 'abandoned', 'error')),
  
  started_at TIMESTAMPTZ DEFAULT NOW(),
  completed_at TIMESTAMPTZ,
  last_activity_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_chatbot_flows_org ON chatbot_flows(organization_id);
CREATE INDEX idx_chatbot_flows_trigger ON chatbot_flows(trigger_type, is_active);

-- =====================================================
-- 7. VOICE MESSAGE TRANSCRIPTION
-- =====================================================
ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_transcription TEXT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS voice_duration_seconds INT;
ALTER TABLE messages ADD COLUMN IF NOT EXISTS transcription_status VARCHAR(20);

-- =====================================================
-- 8. AI SALES ASSISTANT
-- =====================================================
CREATE TABLE IF NOT EXISTS ai_product_recommendations (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  conversation_id UUID REFERENCES conversations(id) ON DELETE SET NULL,
  
  recommended_products UUID[] NOT NULL,
  recommendation_reason TEXT,
  confidence_score DECIMAL(3,2),
  
  -- Outcome tracking
  shown_to_customer BOOLEAN DEFAULT false,
  customer_clicked BOOLEAN DEFAULT false,
  resulted_in_order BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- 9. INSTAGRAM DM INTEGRATION
-- =====================================================
CREATE TABLE IF NOT EXISTS instagram_accounts (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  facebook_page_id UUID REFERENCES facebook_pages(id) ON DELETE CASCADE,
  
  instagram_user_id TEXT NOT NULL,
  instagram_username TEXT,
  profile_picture_url TEXT,
  
  access_token_encrypted TEXT,
  
  is_active BOOLEAN DEFAULT true,
  webhook_subscribed BOOLEAN DEFAULT false,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Add Instagram fields to conversations
ALTER TABLE conversations ADD COLUMN IF NOT EXISTS channel VARCHAR(20) DEFAULT 'whatsapp';
-- Possible values: whatsapp, messenger, instagram

-- =====================================================
-- 10. PREDICTIVE ANALYTICS
-- =====================================================
CREATE TABLE IF NOT EXISTS customer_predictions (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL,
  customer_id UUID REFERENCES customers(id) ON DELETE CASCADE,
  
  -- Churn prediction
  churn_probability DECIMAL(3,2),
  churn_risk_level VARCHAR(20), -- low, medium, high
  days_since_last_order INT,
  
  -- Purchase prediction
  next_purchase_probability DECIMAL(3,2),
  predicted_next_purchase_date DATE,
  predicted_order_value DECIMAL(10,2),
  
  -- Engagement
  optimal_contact_time TIME,
  optimal_contact_day INT, -- 0-6
  preferred_channel VARCHAR(20),
  
  -- Lifetime value
  predicted_ltv DECIMAL(12,2),
  
  calculated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_customer_predictions_org ON customer_predictions(organization_id);
CREATE INDEX idx_customer_predictions_churn ON customer_predictions(churn_risk_level);

-- =====================================================
-- 11. STRIPE SETTINGS PER ORGANIZATION
-- =====================================================
CREATE TABLE IF NOT EXISTS payment_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL UNIQUE,
  
  provider VARCHAR(20) DEFAULT 'stripe' CHECK (provider IN ('stripe', 'paymob', 'tap', 'manual')),
  
  -- Stripe
  stripe_publishable_key TEXT,
  stripe_secret_key_encrypted TEXT,
  stripe_webhook_secret_encrypted TEXT,
  
  -- PayMob (Egypt)
  paymob_api_key_encrypted TEXT,
  paymob_integration_id TEXT,
  
  -- General settings
  default_currency VARCHAR(3) DEFAULT 'EGP',
  auto_send_payment_link BOOLEAN DEFAULT false,
  payment_link_expiry_hours INT DEFAULT 72,
  
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =====================================================
-- DISABLE RLS FOR SIMPLICITY (handled in API)
-- =====================================================
ALTER TABLE payment_links DISABLE ROW LEVEL SECURITY;
ALTER TABLE appointment_types DISABLE ROW LEVEL SECURITY;
ALTER TABLE appointments DISABLE ROW LEVEL SECURITY;
ALTER TABLE survey_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE survey_responses DISABLE ROW LEVEL SECURITY;
ALTER TABLE quick_reply_categories DISABLE ROW LEVEL SECURITY;
ALTER TABLE quick_reply_templates DISABLE ROW LEVEL SECURITY;
ALTER TABLE product_catalogs DISABLE ROW LEVEL SECURITY;
ALTER TABLE catalog_views DISABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_flows DISABLE ROW LEVEL SECURITY;
ALTER TABLE chatbot_flow_sessions DISABLE ROW LEVEL SECURITY;
ALTER TABLE ai_product_recommendations DISABLE ROW LEVEL SECURITY;
ALTER TABLE instagram_accounts DISABLE ROW LEVEL SECURITY;
ALTER TABLE customer_predictions DISABLE ROW LEVEL SECURITY;
ALTER TABLE payment_settings DISABLE ROW LEVEL SECURITY;
