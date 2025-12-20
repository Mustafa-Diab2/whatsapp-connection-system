#!/bin/bash
# Clean Up Script - تنظيف الملفات المتشابهة
# للأنظمة التي تستخدم Bash

echo "🧹 بدء تنظيف المشروع..."

# حذف ملفات documentation المتشابهة
echo ""
echo "📄 حذف ملفات documentation المتشابهة..."
rm -f DEPLOYMENT.md DEPLOYMENT-CHECKLIST.md DEPLOYMENT-FAQ.md 
rm -f START-HERE.md PROJECT-SUMMARY.md deploy-backend-railway.md
echo "  ✓ تم حذف ملفات documentation المتكررة"

# حذف ملفات logs
echo ""
echo "📝 حذف ملفات logs..."
rm -f dev.log dev.err.log
echo "  ✓ تم حذف ملفات logs"

# نقل scripts إلى مجلد منفصل
echo ""
echo "📁 تنظيم scripts..."
mkdir -p scripts
mv -f deploy-vercel.ps1 deploy-frontend.sh scripts/ 2>/dev/null || true
echo "  ✓ تم نقل scripts إلى مجلد منفصل"

echo ""
echo "✅ اكتمل التنظيف!"
echo ""
echo "الملفات المتبقية:"
echo "  ✓ README.md - الدليل الرئيسي"
echo "  ✓ QUICK-DEPLOY.md - دليل النشر السريع"
echo "  ✓ scripts/ - scripts منظمة"
echo ""
