# قائمة التحقق قبل النشر ✅

## قبل البدء

- [ ] Node.js 18+ مثبت
- [ ] Git مثبت ومُعد
- [ ] حساب GitHub جاهز
- [ ] المشروع يعمل محلياً بدون أخطاء

```bash
# اختبر محلياً
npm run dev
# افتح http://localhost:3000 وتأكد من عمل كل شيء
```

---

## إعداد الحسابات

### Vercel (Frontend)
- [ ] إنشاء حساب على https://vercel.com
- [ ] ربط حساب GitHub
- [ ] (اختياري) إضافة Domain مخصص

### Railway (Backend) - الخيار الموصى به
- [ ] إنشاء حساب على https://railway.app
- [ ] ربط حساب GitHub
- [ ] (اختياري) إضافة بطاقة ائتمان للحصول على $5 مجاناً

**أو**

### Render (Backend) - البديل المجاني
- [ ] إنشاء حساب على https://render.com
- [ ] ربط حساب GitHub

---

## إعداد المشروع للنشر

### 1. التأكد من ملفات التكوين

- [ ] ملف `vercel.json` موجود في الجذر
- [ ] ملف `apps/web/vercel.json` موجود
- [ ] ملف `railway.toml` موجود (للـ Railway)
- [ ] ملف `.vercelignore` موجود
- [ ] ملف `.gitignore` محدث
- [ ] ملف `.env.example` موجود ومحدث

### 2. اختبار البناء محلياً

```bash
# اختبر بناء Frontend
cd apps/web
npm run build
npm start
```

- [ ] البناء نجح بدون أخطاء
- [ ] التطبيق يعمل على http://localhost:3000

### 3. رفع الكود على GitHub

```bash
# إنشاء repository جديد على GitHub أولاً

# ثم في الترمينال
git init
git add .
git commit -m "Initial commit - Ready for deployment"
git branch -M main
git remote add origin https://github.com/username/repo-name.git
git push -u origin main
```

- [ ] الكود موجود على GitHub
- [ ] ملفات `.env` و `.wwebjs_auth` **غير** موجودة في GitHub

---

## نشر Frontend على Vercel

### الطريقة الأولى: من الموقع (الأسهل)

1. [ ] اذهب إلى https://vercel.com/new
2. [ ] Import Repository → اختر المشروع
3. [ ] Configure Project:
   - [ ] Framework Preset: Next.js
   - [ ] Root Directory: `apps/web`
   - [ ] Build Command: `npm run build`
   - [ ] Output Directory: `.next`
4. [ ] Environment Variables (اتركها الآن، سنضيفها لاحقاً)
5. [ ] اضغط Deploy
6. [ ] انتظر حتى ينتهي النشر (2-5 دقائق)
7. [ ] احفظ رابط الموقع: `https://your-app.vercel.app`

### الطريقة الثانية: من الترمينال

```bash
# تثبيت Vercel CLI
npm install -g vercel

# تسجيل الدخول
vercel login

# النشر
cd apps/web
vercel --prod
```

- [ ] Frontend منشور على Vercel
- [ ] رابط Frontend محفوظ: `________________`

---

## نشر Backend على Railway

### من الموقع

1. [ ] اذهب إلى https://railway.app/new
2. [ ] Deploy from GitHub repo → اختر المشروع
3. [ ] Settings:
   - [ ] Name: `whatsapp-backend` (أو أي اسم)
   - [ ] Root Directory: `apps/api`
   - [ ] Start Command: `npm run dev`
4. [ ] Variables → Add Variables:
   ```
   PORT=3001
   WEB_ORIGIN=https://your-app.vercel.app
   NODE_ENV=production
   ```
   - [ ] PORT: `3001`
   - [ ] WEB_ORIGIN: `https://your-app.vercel.app`
   - [ ] NODE_ENV: `production`
5. [ ] Deploy
6. [ ] انتظر حتى ينتهي النشر (3-7 دقائق)
7. [ ] Settings → Networking → Generate Domain
8. [ ] احفظ رابط API: `https://your-api.railway.app`

### إضافة Persistent Storage

- [ ] Settings → Volumes → Add Volume
- [ ] Mount Path: `/app/.wwebjs_auth`
- [ ] Size: 1GB

### اختبار Backend

```bash
# اختبر health endpoint
curl https://your-api.railway.app/health
# يجب أن يرجع: {"ok":true}
```

- [ ] Backend يعمل وHealth Check ناجح
- [ ] رابط Backend محفوظ: `________________`

---

## ربط Frontend بـ Backend

### في Vercel

1. [ ] Dashboard → Project → Settings
2. [ ] Environment Variables
3. [ ] Add New:
   - [ ] Name: `NEXT_PUBLIC_API_URL`
   - [ ] Value: `https://your-api.railway.app`
   - [ ] Environment: Production
4. [ ] Save
5. [ ] Deployments → Latest → Redeploy

### تحديث WEB_ORIGIN في Railway

- [ ] التأكد من `WEB_ORIGIN` في Railway يطابق رابط Vercel الفعلي

---

## اختبار بعد النشر

### Frontend
- [ ] افتح `https://your-app.vercel.app`
- [ ] الصفحة تُحمل بدون أخطاء
- [ ] اذهب إلى `/whatsapp-connect`
- [ ] لا توجد أخطاء في Console

### Backend
- [ ] افتح `https://your-api.railway.app/health`
- [ ] يظهر `{"ok":true}`

### WhatsApp Connection
- [ ] في `/whatsapp-connect`، اضغط "اتصال بـ WhatsApp"
- [ ] QR Code يظهر خلال 10-30 ثانية
- [ ] امسح QR من هاتفك
- [ ] الاتصال ينجح والحالة تتغير إلى "Ready"

### Persistence Test
- [ ] اتصل بـ WhatsApp وامسح QR
- [ ] في Railway: Redeploy المشروع
- [ ] انتظر حتى ينتهي
- [ ] افتح Frontend مرة أخرى
- [ ] تحقق من الحالة - يجب أن تكون "Ready" بدون مسح QR مرة أخرى

---

## الأمان والأداء

### SSL/HTTPS
- [ ] Vercel: HTTPS تلقائي ✅
- [ ] Railway: HTTPS تلقائي ✅

### Environment Variables
- [ ] جميع المتغيرات محمية (لا توجد في الكود)
- [ ] لا توجد مفاتيح سرية في GitHub

### CORS
- [ ] `WEB_ORIGIN` في Backend صحيح
- [ ] لا توجد أخطاء CORS في Console

### Performance
- [ ] Frontend يُحمل خلال 3 ثواني
- [ ] API يستجيب خلال 1 ثانية

---

## مراقبة وصيانة

### Logs
- [ ] Railway → Deployments → View Logs (للتحقق من الأخطاء)
- [ ] Vercel → Functions → Logs

### Monitoring
- [ ] Railway → Metrics (استخدام CPU/Memory)
- [ ] Vercel → Analytics

### Backups
- [ ] `.wwebjs_auth` Volume محفوظ في Railway

---

## Domain مخصص (اختياري)

### في Vercel
- [ ] Settings → Domains → Add
- [ ] أدخل Domain الخاص بك
- [ ] اتبع التعليمات لإضافة DNS Records
- [ ] انتظر حتى يتم التحقق (10 دقائق - 48 ساعة)

### تحديث Environment Variables بعد إضافة Domain
- [ ] حدّث `WEB_ORIGIN` في Railway إلى Domain الجديد

---

## استكشاف الأخطاء

إذا واجهت مشاكل:

### QR لا يظهر
- [ ] تحقق من Console في المتصفح
- [ ] تحقق من `NEXT_PUBLIC_API_URL` صحيح
- [ ] تحقق من `/health` endpoint يعمل

### CORS Errors
- [ ] تحقق من `WEB_ORIGIN` في Railway
- [ ] تأكد من عدم وجود "/" في نهاية الرابط

### Chromium Errors
- [ ] تحقق من وجود `railway.toml`
- [ ] Redeploy Backend

### Out of Memory
- [ ] ارفع خطة Railway
- [ ] أو استخدم VPS

---

## بعد النشر الناجح ✅

- [ ] احفظ جميع الروابط والمعلومات
- [ ] شارك الرابط مع المستخدمين
- [ ] راقب Logs بانتظام
- [ ] احتفظ بنسخة احتياطية من `.env`

**تهانينا! 🎉 مشروعك الآن على الإنترنت!**

---

## روابط سريعة

- Frontend: `________________`
- Backend: `________________`
- Vercel Dashboard: https://vercel.com/dashboard
- Railway Dashboard: https://railway.app/dashboard

---

## ملاحظات إضافية

- راجع [DEPLOYMENT-FAQ.md](DEPLOYMENT-FAQ.md) للأسئلة الشائعة
- راجع [DEPLOYMENT.md](DEPLOYMENT.md) لشرح مفصل
- راجع [QUICK-DEPLOY.md](QUICK-DEPLOY.md) للخطوات السريعة
