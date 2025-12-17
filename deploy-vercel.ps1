# PowerShell Script للنشر على Vercel
# الاستخدام: .\deploy-vercel.ps1

Write-Host "🚀 بدء نشر Frontend على Vercel..." -ForegroundColor Green

# التحقق من تثبيت Node.js
if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    Write-Host "❌ Node.js غير مثبت. يرجى تثبيته من https://nodejs.org" -ForegroundColor Red
    exit 1
}

# التحقق من تثبيت Vercel CLI
if (-not (Get-Command vercel -ErrorAction SilentlyContinue)) {
    Write-Host "📦 تثبيت Vercel CLI..." -ForegroundColor Yellow
    npm install -g vercel
}

# الانتقال إلى مجلد Web
Set-Location -Path "apps\web"

Write-Host "🔨 بناء المشروع..." -ForegroundColor Cyan
npm run build

if ($LASTEXITCODE -eq 0) {
    Write-Host "✅ البناء نجح!" -ForegroundColor Green

    Write-Host ""
    Write-Host "🌐 الآن سيبدأ النشر على Vercel..." -ForegroundColor Cyan
    Write-Host "سيُطلب منك:" -ForegroundColor Yellow
    Write-Host "  1. تسجيل الدخول (إذا لم تكن مسجلاً)" -ForegroundColor Yellow
    Write-Host "  2. اختيار Scope" -ForegroundColor Yellow
    Write-Host "  3. تأكيد الإعدادات" -ForegroundColor Yellow
    Write-Host ""

    # نشر على Vercel
    vercel --prod

    if ($LASTEXITCODE -eq 0) {
        Write-Host ""
        Write-Host "✅ تم النشر بنجاح!" -ForegroundColor Green
        Write-Host ""
        Write-Host "⚠️  خطوات مهمة بعد النشر:" -ForegroundColor Yellow
        Write-Host "1. اذهب إلى لوحة تحكم Vercel" -ForegroundColor White
        Write-Host "2. Settings → Environment Variables" -ForegroundColor White
        Write-Host "3. أضف المتغير التالي:" -ForegroundColor White
        Write-Host "   NEXT_PUBLIC_API_URL = https://your-backend-url.com" -ForegroundColor Cyan
        Write-Host "4. Redeploy المشروع" -ForegroundColor White
        Write-Host ""
        Write-Host "📖 راجع DEPLOYMENT.md للمزيد من التفاصيل" -ForegroundColor Magenta
    } else {
        Write-Host "❌ فشل النشر" -ForegroundColor Red
        exit 1
    }
} else {
    Write-Host "❌ فشل البناء" -ForegroundColor Red
    exit 1
}

# العودة إلى المجلد الرئيسي
Set-Location -Path "..\..\"
