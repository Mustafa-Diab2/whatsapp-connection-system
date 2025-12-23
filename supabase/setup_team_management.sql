-- =====================================================
-- إعداد نظام إدارة الفريق
-- قم بتشغيل هذا الكود في Supabase SQL Editor
-- =====================================================

-- 1. إنشاء جدول المنظمات (إذا لم يكن موجوداً)
CREATE TABLE IF NOT EXISTS organizations (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. التأكد من وجود الأعمدة المطلوبة في جدول users
ALTER TABLE users ADD COLUMN IF NOT EXISTS organization_id UUID REFERENCES organizations(id);
ALTER TABLE users ADD COLUMN IF NOT EXISTS role TEXT DEFAULT 'member';

-- 3. إنشاء فهرس للبحث السريع
CREATE INDEX IF NOT EXISTS idx_users_org ON users(organization_id);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);

-- 4. تحديث المستخدمين الموجودين بدون organization
-- هذا الكود يضيف منظمة للمستخدمين الذين ليس لديهم منظمة
DO $$
DECLARE
    user_rec RECORD;
    new_org_id UUID;
BEGIN
    FOR user_rec IN SELECT id, email, name FROM users WHERE organization_id IS NULL
    LOOP
        -- إنشاء منظمة جديدة للمستخدم
        INSERT INTO organizations (name) 
        VALUES (COALESCE(user_rec.name, SPLIT_PART(user_rec.email, '@', 1)) || '''s Organization')
        RETURNING id INTO new_org_id;
        
        -- ربط المستخدم بالمنظمة وجعله admin
        UPDATE users 
        SET organization_id = new_org_id, role = 'admin'
        WHERE id = user_rec.id;
    END LOOP;
END $$;

-- 5. تعطيل RLS مؤقتاً (للتطوير)
ALTER TABLE organizations DISABLE ROW LEVEL SECURITY;
ALTER TABLE users DISABLE ROW LEVEL SECURITY;

-- =====================================================
-- للتحقق من البيانات
-- =====================================================

-- عرض المستخدمين مع منظماتهم
SELECT 
    u.id,
    u.email,
    u.name,
    u.role,
    o.name as organization_name,
    u.created_at
FROM users u
LEFT JOIN organizations o ON u.organization_id = o.id
ORDER BY u.created_at DESC;
