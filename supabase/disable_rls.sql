-- تعطيل حماية RLS على جدول الإعدادات لحل مشكلة 500 Internal Server Error
ALTER TABLE settings DISABLE ROW LEVEL SECURITY;

-- التأكد من أن الجدول قابل للكتابة للجميع (اختياري إذا كان ما سبق كافياً)
-- GRANT ALL ON settings TO anon, authenticated, service_role;
