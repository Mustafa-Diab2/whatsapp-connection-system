#!/bin/bash

# سكريبت نشر Frontend على Vercel
# الاستخدام: bash deploy-frontend.sh

echo "🚀 بدء نشر Frontend على Vercel..."

# التأكد من تثبيت Vercel CLI
if ! command -v vercel &> /dev/null
then
    echo "📦 تثبيت Vercel CLI..."
    npm install -g vercel
fi

# الانتقال إلى مجلد Web
cd apps/web

echo "🔨 بناء المشروع..."
npm run build

if [ $? -eq 0 ]; then
    echo "✅ البناء نجح!"
    echo "🌐 نشر على Vercel..."
    vercel --prod

    if [ $? -eq 0 ]; then
        echo "✅ تم النشر بنجاح!"
        echo "🔗 لا تنسَ إضافة NEXT_PUBLIC_API_URL في إعدادات Vercel"
    else
        echo "❌ فشل النشر"
        exit 1
    fi
else
    echo "❌ فشل البناء"
    exit 1
fi
