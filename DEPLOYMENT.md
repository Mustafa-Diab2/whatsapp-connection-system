# دليل النشر على Vercel والخوادم الأخرى

## ⚠️ ملاحظة مهمة جداً

**Vercel لا تدعم WhatsApp-Web.js بشكل كامل!**

السبب: WhatsApp-Web.js يستخدم Puppeteer/Chromium الذي لا يعمل في Serverless Functions، ويحتاج:
- عملية مستمرة (long-running process)
- تخزين دائم للجلسات (.wwebjs_auth)
- اتصال Socket.io مستمر

## الحلول الممكنة

### الحل 1: نشر مقسم (الموصى به) ✅

**Frontend على Vercel + Backend على VPS/Railway/Render**

#### خطوات النشر:

##### 1. نشر Frontend على Vercel

```bash
# تثبيت Vercel CLI
npm install -g vercel

# تسجيل الدخول
vercel login

# نشر من مجلد المشروع
cd "c:\Users\Badr\OneDrive\Desktop\يارب"
vercel
```

أثناء النشر، اختر:
- Setup and deploy? **Yes**
- Which scope? اختر حسابك
- Link to existing project? **No**
- Project name? اتركه كما هو أو غيره
- In which directory is your code? **./apps/web**
- Override settings? **No**

##### 2. إضافة متغيرات البيئة في Vercel

اذهب إلى لوحة تحكم Vercel → مشروعك → Settings → Environment Variables

أضف:
```
NEXT_PUBLIC_API_URL=https://your-backend-url.com
```

##### 3. نشر Backend على Railway/Render

**خيار A: Railway (سهل ومجاني للبداية)**

1. اذهب إلى https://railway.app
2. سجل الدخول بحساب GitHub
3. New Project → Deploy from GitHub repo
4. اختر المشروع
5. أضف متغيرات البيئة:
   ```
   PORT=3001
   WEB_ORIGIN=https://your-vercel-app.vercel.app
   ```
6. Root Directory: `apps/api`
7. Build Command: `npm install && npm run build`
8. Start Command: `npm run dev`

**خيار B: Render (مجاني مع قيود)**

1. اذهب إلى https://render.com
2. New → Web Service
3. Connect GitHub repository
4. Name: whatsapp-api
5. Root Directory: `apps/api`
6. Build Command: `npm install`
7. Start Command: `npm run dev`
8. أضف Environment Variables:
   ```
   PORT=3001
   WEB_ORIGIN=https://your-vercel-app.vercel.app
   ```

**خيار C: VPS (الأكثر استقراراً)**

```bash
# على الخادم
git clone your-repo-url
cd your-repo/apps/api
npm install
npm install -g pm2

# إنشاء ملف .env
nano .env
# أضف:
# PORT=3001
# WEB_ORIGIN=https://your-vercel-app.vercel.app

# تشغيل بـ PM2
pm2 start src/server.ts --name whatsapp-api
pm2 save
pm2 startup
```

##### 4. ربط Frontend بـ Backend

بعد نشر Backend، احصل على الرابط (مثلاً: https://your-api.railway.app)

ثم:
1. اذهب إلى Vercel → Settings → Environment Variables
2. عدل `NEXT_PUBLIC_API_URL` إلى رابط API الخاص بك
3. Redeploy المشروع

---

### الحل 2: نشر كامل على Railway/Render (بديل Vercel)

إذا أردت نشر Frontend + Backend معاً:

#### Railway (موصى به)

1. اذهب إلى https://railway.app
2. New Project → Deploy from GitHub repo
3. ستحتاج مشروعين:
   - **المشروع الأول (Backend)**:
     - Root Directory: `apps/api`
     - Start Command: `npm run dev`
     - Port: 3001

   - **المشروع الثاني (Frontend)**:
     - Root Directory: `apps/web`
     - Build Command: `npm run build`
     - Start Command: `npm start`
     - Environment Variables:
       ```
       NEXT_PUBLIC_API_URL=https://your-backend.railway.app
       ```

#### Render

نفس الخطوات تقريباً، لكن أنشئ خدمتين منفصلتين.

---

### الحل 3: Docker (للمحترفين)

إنشاء ملف `Dockerfile` في الجذر:

```dockerfile
# Frontend
FROM node:18 AS frontend
WORKDIR /app
COPY package*.json ./
COPY apps/web ./apps/web
RUN npm install
RUN npm run build --prefix apps/web

# Backend
FROM node:18
WORKDIR /app
RUN apt-get update && apt-get install -y \
    chromium \
    chromium-sandbox
COPY package*.json ./
COPY apps/api ./apps/api
RUN npm install
COPY --from=frontend /app/apps/web/.next ./apps/web/.next
EXPOSE 3000 3001
CMD ["npm", "run", "dev"]
```

ثم نشر على أي منصة تدعم Docker (Railway, Render, DigitalOcean).

---

## اختبار محلياً قبل النشر

```bash
# 1. اختبار البناء
cd apps/web
npm run build

# 2. تشغيل الإنتاج محلياً
npm start

# 3. في نافذة أخرى، شغل API
cd apps/api
npm run dev
```

---

## نشر سريع عبر Vercel CLI

```bash
# في مجلد المشروع
vercel

# للإنتاج
vercel --prod
```

---

## متغيرات البيئة المطلوبة

### Frontend (Vercel)
```
NEXT_PUBLIC_API_URL=https://your-backend-url.com
```

### Backend (Railway/Render/VPS)
```
PORT=3001
WEB_ORIGIN=https://your-vercel-app.vercel.app
```

---

## استكشاف الأخطاء

### المشكلة: QR code لا يظهر
- **السبب**: Backend غير متصل أو CORS
- **الحل**: تأكد من `WEB_ORIGIN` صحيح في Backend

### المشكلة: Puppeteer لا يعمل
- **السبب**: Vercel لا تدعم Chromium
- **الحل**: استخدم VPS أو Railway للـ Backend

### المشكلة: الجلسة تنقطع باستمرار
- **السبب**: حذف مجلد `.wwebjs_auth`
- **الحل**: استخدم Volume/Persistent Storage في Railway/Render

---

## الخيار المثالي حسب الميزانية

| المنصة | Frontend | Backend | التكلفة | الاستقرار |
|--------|----------|---------|---------|-----------|
| Vercel + Railway | ✅ | ✅ | مجاني → $5/شهر | ممتاز |
| Vercel + Render | ✅ | ✅ | مجاني | جيد |
| Railway فقط | ✅ | ✅ | مجاني → $5/شهر | ممتاز |
| VPS (DigitalOcean) | ✅ | ✅ | $4-6/شهر | ممتاز |

---

## الخطوات السريعة (TL;DR)

```bash
# 1. نشر Frontend على Vercel
vercel --cwd apps/web

# 2. نشر Backend على Railway
# (من خلال الواجهة أو CLI)

# 3. ربط الاثنين عبر Environment Variables
# في Vercel: NEXT_PUBLIC_API_URL
# في Railway: WEB_ORIGIN
```

---

**ملاحظة أخيرة**: إذا كنت تريد حل بسيط وسريع، استخدم **Railway** لكل شيء. أسهل وأكثر استقراراً لهذا النوع من المشاريع.
