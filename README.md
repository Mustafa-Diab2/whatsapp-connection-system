# نظام اتصال واتساب (Express + Socket.io + Next.js)

يشغّل Backend على `http://localhost:3001` و Frontend على `http://localhost:3000` مع واجهة RTL عربية ولوحة شبيهة بالصورة.

## المتطلبات
- Node.js 18+
- متصفح Chrome/Chromium (مطلوب لـ whatsapp-web.js)

## التشغيل السريع
1) انسخ ملف البيئة:
   ```bash
   cp .env.example .env
   ```
   يمكن تعديل المنافذ إن لزم الأمر.
2) ثبّت الاعتمادات من الجذر:
   ```bash
   npm install
   ```
3) شغّل الخدمتين معًا:
   ```bash
   npm run dev
   ```
   أو منفصلًا:
   ```bash
   npm run dev:api
   npm run dev:web
   ```
4) افتح `http://localhost:3000/whatsapp-connect` واضغط "اتصال بـ WhatsApp" ثم امسح QR من هاتفك.

> ملاحظة النشر: استخدم VPS + PM2 أو أي مخلّص عمليات، واحرص على إبقاء مجلد `.wwebjs_auth` على قرص دائم لعدم فقدان الجلسات.

## 🚀 النشر على الإنترنت

### خيارات النشر المتاحة

**الخيار الموصى به: Vercel (Frontend) + Railway (Backend)**

لنشر المشروع على الإنترنت، راجع الملفات التالية:

- **[QUICK-DEPLOY.md](QUICK-DEPLOY.md)** - دليل النشر السريع خطوة بخطوة ⭐
- **[DEPLOYMENT.md](DEPLOYMENT.md)** - دليل شامل لجميع خيارات النشر
- **[deploy-backend-railway.md](deploy-backend-railway.md)** - نشر Backend على Railway

### النشر السريع (5 دقائق)

```bash
# 1. نشر Frontend على Vercel
npm install -g vercel
cd apps/web
vercel --prod

# 2. نشر Backend على Railway
# افتح https://railway.app وانشر من GitHub
# Root Directory: apps/api
# Environment Variables: PORT=3001, WEB_ORIGIN=https://your-app.vercel.app

# 3. ربطهما معاً
# في Vercel Settings → Environment Variables
# أضف: NEXT_PUBLIC_API_URL=https://your-api.railway.app
```

**ملاحظة**: Vercel لا تدعم WhatsApp-Web.js، لذلك Backend يجب أن يكون على Railway/VPS.

## البنية
```
repo/
  apps/api   ← Express + Socket.io + whatsapp-web.js
  apps/web   ← Next.js (App Router) + Tailwind RTL
  package.json (npm workspaces)
```

## Backend (apps/api)
- مسار التشغيل: `npm run dev:api` (ts-node-dev)
- LocalAuth لكل `clientId` بدون قواعد بيانات (المجلد `.wwebjs_auth`).
- منافذ:
  - HTTP: `3001`
  - Socket.io: نفس المنفذ
- CORS يسمح لـ `http://localhost:3000`

### Endpoints
- `GET  /health` → `{ ok: true }`
- `POST /whatsapp/connect` body `{ clientId?: string }`
- `GET  /whatsapp/status/:clientId`
- `GET  /whatsapp/qr/:clientId`
- `DELETE /whatsapp/session/:clientId` (Reset كامل)
- `GET  /whatsapp/chats/:clientId` (جلب قائمة المحادثات)
- `GET  /whatsapp/messages/:clientId/:chatId` (آخر 50 رسالة)
- `POST /whatsapp/send` body `{ clientId, chatId, message }`

### منطق الحماية من مشكلة "Session already exists but QR not ready yet"
- **Lock** لكل `clientId`: إذا كان lock مفعلًا فلن يبدأ اتصال جديد، فقط يرجع الحالة الحالية.
- **Timeout 20 ثانية** أثناء `initializing`/`waiting_qr`: لو لم يصل QR → Reset تلقائي.
  - إذا كانت `attemptCount = 0` يعيد المحاولة مرة واحدة تلقائيًا.
  - إذا `attemptCount >= 1` يضع الحالة `error` برسالة عربية واضحة.
- **Reset Session** يمسح فولدر LocalAuth الخاص بالجلسة ويدمّر العميل ويعيد الحالة إلى `idle`.
- **Socket events**:
  - Emits: `wa:state { clientId, status, updatedAt, lastError? }`
  - Emits: `wa:qr { clientId, qrDataUrl }`
  - Client emits: `wa:subscribe { clientId }`

### ملاحظات
- إن حدث `disconnected` يمكن إعادة التهيئة يدويًا بالزر "اتصال" أو زر Reset من الواجهة.
- إضافات Puppeteer: `--no-sandbox --disable-setuid-sandbox` لتعمل محليًا وعلى خوادم بدون صلاحيات root.

## Frontend (apps/web)
- Next.js App Router + Tailwind + RTL.
- متغير بيئة: `NEXT_PUBLIC_API_URL=http://localhost:3001`
- صفحة `/dashboard` Placeholder شبيه بالصورة.
- صفحة `/whatsapp-connect`:
  - تعرض الحالة اللحظية (idle/initializing/waiting_qr/ready/error/disconnected).
  - زر "اتصال بـ WhatsApp" مع تعطيل تلقائي لمنع الضغط المكرر.
  - عرض QR فور وصوله عبر Socket.io بدون Refresh.
  - زر "Reset Session".
  - رسائل خطأ عربية.
  - Fallback يجلب الحالة و QR عبر الـ API عند فتح الصفحة.
  - أزرار Topbar: خروج، Fullscreen، Refresh، Badge Online، اسم المستخدم Admin، شعار Awfar.
  - Sidebar يمين مع تمييز عنصر "WhatsApp Connection" باللون الأخضر.

## إضافة صفحات أو عملاء جدد
- لكل عميل جديد مرّر `clientId` مختلفًا في الطلبات والأحداث.
- سيتم إنشاء مجلد LocalAuth مستقل تلقائيًا تحت `.wwebjs_auth/<clientId>`.
