-- ============================================
-- Script: حذف جداول المشتريات والموردين
-- Project: Awfar CRM
-- Date: 2026-01-13
-- Description: حذف كامل لميزة المشتريات والموردين
-- ============================================

-- 1. حذف الجداول بالترتيب الصحيح (من التابع للأساسي)
-- لتجنب مشاكل Foreign Key Constraints

-- حذف بيانات طلبات الشراء التفصيلية
DROP TABLE IF EXISTS purchase_order_items CASCADE;

-- حذف جدول طلبات الشراء الرئيسي
DROP TABLE IF EXISTS purchase_orders CASCADE;

-- حذف جدول الموردين
DROP TABLE IF EXISTS vendors CASCADE;

-- ============================================
-- 2. تنظيف صلاحيات المستخدمين
-- ============================================

-- إزالة صفحة /purchases من جميع المستخدمين
UPDATE users 
SET allowed_pages = array_remove(allowed_pages, '/purchases')
WHERE '/purchases' = ANY(COALESCE(allowed_pages, ARRAY[]::text[]));

-- ============================================
-- 3. تنظيف السجلات (اختياري)
-- ============================================

-- حذف أي سجلات نشاط متعلقة بالموردين أو المشتريات
DELETE FROM activity_logs 
WHERE action LIKE '%vendor%' 
   OR action LIKE '%purchase%'
   OR action LIKE '%supplier%';

-- ============================================
-- 4. التحقق من النتائج
-- ============================================

-- التحقق من حذف الجداول
SELECT 
    tablename,
    schemaname
FROM pg_tables
WHERE schemaname = 'public'
  AND tablename IN ('vendors', 'purchase_orders', 'purchase_order_items');
-- النتيجة المتوقعة: لا يوجد صفوف (0 rows)

-- التحقق من تنظيف الصلاحيات
SELECT 
    id,
    email,
    allowed_pages
FROM users
WHERE '/purchases' = ANY(COALESCE(allowed_pages, ARRAY[]::text[]));
-- النتيجة المتوقعة: لا يوجد صفوف (0 rows)

-- ============================================
-- 5. نتائج متوقعة
-- ============================================
/*
✅ تم حذف جداول: vendors, purchase_orders, purchase_order_items
✅ تم إزالة صلاحيات /purchases من جميع المستخدمين
✅ تم حذف السجلات المتعلقة بالموردين والمشتريات
✅ قاعدة البيانات نظيفة من أي أثر لميزة المشتريات
*/

-- ============================================
-- ملاحظات مهمة:
-- ============================================
/*
1. هذا السكريبت لا يمكن التراجع عنه - تأكد من أخذ نسخة احتياطية
2. إذا كان هناك بيانات مهمة في الجداول، قم بتصديرها أولاً
3. لا تنس تشغيل هذا السكريبت على البيئة المحلية أولاً للاختبار

للتصدير قبل الحذف:
COPY (SELECT * FROM vendors) TO '/tmp/vendors_backup.csv' CSV HEADER;
COPY (SELECT * FROM purchase_orders) TO '/tmp/purchase_orders_backup.csv' CSV HEADER;
*/
