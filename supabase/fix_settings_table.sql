-- هذا الكود لإنشاء جدول الإعدادات إذا لم يكن موجوداً
-- انسخ هذا الكود وضعه في Supabase SQL Editor ثم اضغط Run

-- 1. إنشاء جدول Settings
CREATE TABLE IF NOT EXISTS settings (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. إضافة القيم الافتراضية
INSERT INTO settings (key, value) VALUES 
  ('general', '{"companyName": "شركتي", "welcomeMessage": "مرحباً بك! كيف يمكنني مساعدتك؟", "language": "ar", "theme": "light"}'),
  ('notifications', '{"notifyNewMessage": true, "notifyNewCustomer": true}')
ON CONFLICT (key) DO NOTHING;

-- 3. التحقق
SELECT * FROM settings;
