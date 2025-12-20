# Clean Up Script - تنظيف الملفات المتشابهة
# يمكنك تشغيل هذا السكريبت لحذف الملفات غير الضرورية

Write-Host "🧹 بدء تنظيف المشروع..." -ForegroundColor Green

# حذف ملفات documentation المتشابهة
$docsToRemove = @(
    "DEPLOYMENT.md",
    "DEPLOYMENT-CHECKLIST.md", 
    "DEPLOYMENT-FAQ.md",
    "START-HERE.md",
    "PROJECT-SUMMARY.md",
    "deploy-backend-railway.md"
)

Write-Host "`n📄 حذف ملفات documentation المتشابهة..." -ForegroundColor Yellow
foreach ($file in $docsToRemove) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "  ✓ تم حذف: $file" -ForegroundColor Gray
    }
}

# حذف ملفات logs
$logsToRemove = @("dev.log", "dev.err.log")

Write-Host "`n📝 حذف ملفات logs..." -ForegroundColor Yellow
foreach ($file in $logsToRemove) {
    if (Test-Path $file) {
        Remove-Item $file -Force
        Write-Host "  ✓ تم حذف: $file" -ForegroundColor Gray
    }
}

# نقل scripts إلى مجلد منفصل
Write-Host "`n📁 تنظيم scripts..." -ForegroundColor Yellow
if (-not (Test-Path "scripts")) {
    New-Item -ItemType Directory -Name "scripts" | Out-Null
    Write-Host "  ✓ تم إنشاء مجلد scripts" -ForegroundColor Gray
}

$scriptsToMove = @("deploy-vercel.ps1", "deploy-frontend.sh")
foreach ($file in $scriptsToMove) {
    if (Test-Path $file) {
        Move-Item $file "scripts\" -Force
        Write-Host "  ✓ تم نقل: $file إلى scripts\" -ForegroundColor Gray
    }
}

Write-Host "`n✅ اكتمل التنظيف!" -ForegroundColor Green
Write-Host "`nالملفات المتبقية:" -ForegroundColor Cyan
Write-Host "  ✓ README.md - الدليل الرئيسي"
Write-Host "  ✓ QUICK-DEPLOY.md - دليل النشر السريع"
Write-Host "  ✓ scripts\ - scripts منظمة"
Write-Host ""
