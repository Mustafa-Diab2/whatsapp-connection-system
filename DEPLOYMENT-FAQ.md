# الأسئلة الشائعة عن النشر 🤔

## عام

### هل يمكن نشر كل شيء على Vercel؟
**لا**. Vercel لا تدعم WhatsApp-Web.js لأنه يحتاج:
- Chromium/Puppeteer (لا يعمل في Serverless)
- عملية مستمرة (long-running process)
- تخزين دائم للجلسات

**الحل**: Frontend على Vercel + Backend على Railway/VPS

---

### ما هي أفضل منصة للنشر؟
**للمبتدئين**: Vercel (Frontend) + Railway (Backend)
**للميزانية المحدودة**: Render (مجاني بالكامل)
**للاحترافية**: VPS (DigitalOcean, Linode)

---

### كم تكلفة النشر؟
| المنصة | التكلفة الشهرية |
|--------|-----------------|
| Vercel (Frontend) | مجاني |
| Railway (Backend) | $5 رصيد مجاني، ثم $5/شهر |
| Render (Free Tier) | مجاني تماماً |
| VPS | $4-10/شهر |

**مجموع الحل الموصى به**: $0-5/شهر

---

## Vercel

### كيف أنشر على Vercel من الترمينال؟
```bash
# تثبيت Vercel CLI
npm install -g vercel

# تسجيل الدخول
vercel login

# النشر
cd apps/web
vercel --prod
```

---

### كيف أضيف متغيرات البيئة في Vercel؟
1. اذهب إلى Dashboard → Project
2. Settings → Environment Variables
3. اضغط "Add"
4. Name: `NEXT_PUBLIC_API_URL`
5. Value: `https://your-backend.railway.app`
6. اختر "Production"
7. Save
8. Redeploy المشروع

---

### لماذا Backend لا يعمل على Vercel؟
Vercel Serverless Functions لها حد زمني (10-60 ثانية). WhatsApp-Web.js يحتاج عملية مستمرة.

---

## Railway

### كيف أنشر Backend على Railway؟
1. افتح https://railway.app
2. سجل دخول بـ GitHub
3. New Project → Deploy from GitHub repo
4. اختر المشروع
5. Settings:
   - Root Directory: `apps/api`
   - Start Command: `npm run dev`
6. Variables:
   ```
   PORT=3001
   WEB_ORIGIN=https://your-app.vercel.app
   ```

---

### كيف أحفظ جلسات WhatsApp على Railway؟
أضف **Volume** في Railway:
1. Settings → Volumes
2. Add Volume
3. Mount Path: `/app/.wwebjs_auth`

هذا يحفظ الجلسات حتى بعد إعادة النشر.

---

### Railway تطلب بطاقة ائتمان؟
نعم، لكن **فقط للتحقق**. لن يتم الخصم إلا بعد استهلاك $5 المجانية.

بدائل بدون بطاقة:
- Render (مجاني تماماً)
- Heroku (Eco Plan $5)

---

## Render

### كيف أنشر على Render مجاناً؟
**Backend:**
1. New → Web Service
2. Connect GitHub repo
3. Root Directory: `apps/api`
4. Build: `npm install`
5. Start: `npm run dev`

**Frontend:**
1. New → Static Site
2. Build: `npm run build`
3. Publish: `.next`

---

### لماذا Render بطيء؟
Free Tier ينام بعد 15 دقيقة خمول. أول طلب يأخذ 30-60 ثانية (cold start).

**الحل**: استخدم خطة Starter ($7/شهر) أو استخدم Railway.

---

### كيف أضيف Persistent Storage على Render؟
1. Dashboard → Disks
2. Add Disk
3. Mount Path: `/app/.wwebjs_auth`
4. Size: 1GB (كافي)

---

## VPS

### ما هي المواصفات المطلوبة للـ VPS؟
**الحد الأدنى:**
- 1 CPU Core
- 1GB RAM
- 10GB Storage
- Ubuntu 20.04+

**موصى به:**
- 2 CPU Cores
- 2GB RAM
- 20GB Storage

---

### كيف أثبت Node.js على VPS؟
```bash
# SSH إلى الخادم
ssh user@server-ip

# تثبيت Node.js 18
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# التحقق
node --version
npm --version
```

---

### كيف أبقي التطبيق يعمل باستمرار؟
استخدم **PM2**:
```bash
# تثبيت PM2
npm install -g pm2

# تشغيل Backend
cd apps/api
pm2 start src/server.ts --name api

# تشغيل Frontend
cd ../web
npm run build
pm2 start npm --name web -- start

# حفظ الإعدادات
pm2 save
pm2 startup
```

---

## الأخطاء الشائعة

### ❌ CORS Error في Console
**السبب**: `WEB_ORIGIN` في Backend لا يطابق رابط Frontend

**الحل**:
```bash
# في Railway/Render Environment Variables
WEB_ORIGIN=https://your-exact-vercel-url.vercel.app
```

---

### ❌ QR Code لا يظهر
**الأسباب المحتملة:**
1. `NEXT_PUBLIC_API_URL` خاطئ
2. Backend غير متصل
3. CORS محظور

**الحل**:
```bash
# تحقق من صحة API
curl https://your-backend.com/health
# يجب أن يرجع: {"ok":true}

# تحقق من NEXT_PUBLIC_API_URL في Frontend
console.log(process.env.NEXT_PUBLIC_API_URL)
```

---

### ❌ Chromium not found على Railway/Render
**الحل**: أضف `railway.toml` في الجذر:
```toml
[nixpacks.phases.setup]
aptPkgs = ["chromium", "chromium-sandbox"]
```

---

### ❌ Session lost after redeploy
**السبب**: مجلد `.wwebjs_auth` يُحذف عند كل نشر

**الحل**: استخدم **Persistent Volume/Disk**:
- Railway: Settings → Volumes
- Render: Dashboard → Disks
- VPS: البيانات محفوظة تلقائياً

---

### ❌ Out of memory on Railway/Render
**السبب**: WhatsApp-Web.js + Chromium يستهلك الكثير من الذاكرة

**الحل**:
1. ارفع خطة Railway إلى 1GB RAM
2. أضف في `apps/api/src/server.ts`:
```typescript
// قبل تشغيل الخادم
process.setMaxListeners(15);
```

---

### ❌ Build timeout على Vercel
**السبب**: البناء يأخذ أكثر من 45 ثانية

**الحل**:
```bash
# في apps/web/package.json
"scripts": {
  "build": "next build",
  "postbuild": "echo 'Build completed'"
}
```

---

## نصائح للأداء

### كيف أسرّع التطبيق؟
1. استخدم CDN (Vercel يوفره تلقائياً)
2. قلل حجم الصور
3. استخدم lazy loading
4. فعّل compression في Express

---

### كيف أراقب الأداء؟
**Vercel**: Analytics مدمجة
**Railway**: Metrics في Dashboard
**VPS**: استخدم PM2 Monitoring

```bash
pm2 monit
```

---

## الأمان

### كيف أضيف HTTPS؟
**Vercel/Railway/Render**: تلقائي ✅
**VPS**: استخدم Certbot + Let's Encrypt

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

---

### كيف أحمي API من الاستخدام غير المصرح؟
أضف **Rate Limiting** في `apps/api/src/server.ts`:
```typescript
import rateLimit from 'express-rate-limit';

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 100 // 100 طلب كحد أقصى
});

app.use('/whatsapp', limiter);
```

---

## الدعم والمساعدة

### أين أجد المزيد من المساعدة؟
- **Vercel**: https://vercel.com/docs
- **Railway**: https://docs.railway.app
- **Render**: https://render.com/docs
- **WhatsApp-Web.js**: https://wwebjs.dev

---

### كيف أتواصل للدعم؟
- افتح Issue في GitHub
- راجع DEPLOYMENT.md
- راجع QUICK-DEPLOY.md
