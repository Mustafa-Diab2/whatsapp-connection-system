# نظام اتصال واتساب CRM

نظام Full-Stack لإدارة اتصال WhatsApp عبر whatsapp-web.js مع واجهة RTL عربية احترافية.

## المميزات

- اتصال WhatsApp في الوقت الحقيقي عبر QR Code
- حل مشكلة "Session already exists but QR not ready yet" جذريًا
- واجهة مستخدم عربية RTL احترافية
- REST API + WebSocket (Socket.io)
- Webhook للرسائل الواردة مع Retry وتوقيع HMAC
- Docker + Docker Compose للنشر السهل
- Nginx Reverse Proxy مع دعم WebSocket

## البنية

```
repo/
├── apps/
│   ├── api/                 # Backend (Express + Socket.io + whatsapp-web.js)
│   │   ├── src/
│   │   │   ├── server.ts    # نقطة الدخول
│   │   │   └── wa/
│   │   │       └── WhatsAppManager.ts
│   │   ├── Dockerfile
│   │   └── package.json
│   └── web/                 # Frontend (Next.js + Tailwind)
│       ├── app/
│       │   ├── layout.tsx
│       │   ├── dashboard/
│       │   └── whatsapp-connect/
│       ├── components/
│       ├── Dockerfile
│       └── package.json
├── docker/
│   └── nginx/
│       └── nginx.conf
├── docker-compose.yml
├── .env.example
└── README.md
```

## المتطلبات

- Node.js 20+
- متصفح Chrome/Chromium (لـ whatsapp-web.js)
- Docker + Docker Compose (للنشر)

---

## التشغيل المحلي (بدون Docker)

### 1. إعداد البيئة

```bash
# انسخ ملف البيئة
cp .env.example .env

# عدّل القيم حسب الحاجة
```

### 2. تثبيت الاعتمادات

```bash
# من المجلد الجذر
npm install

# أو لكل تطبيق على حدة
cd apps/api && npm install
cd apps/web && npm install
```

### 3. التشغيل

```bash
# تشغيل الخدمتين معًا
npm run dev

# أو منفصلًا
npm run dev:api   # http://localhost:3001
npm run dev:web   # http://localhost:3000
```

### 4. الاستخدام

1. افتح `http://localhost:3000/whatsapp-connect`
2. اضغط "اتصال بـ WhatsApp"
3. امسح QR من تطبيق WhatsApp على هاتفك
4. انتظر حتى تتغير الحالة إلى "متصل"

---

## التشغيل عبر Docker Compose

### 1. إعداد البيئة

```bash
cp .env.example .env
```

### 2. البناء والتشغيل

```bash
# بناء وتشغيل جميع الخدمات
docker compose up -d --build

# مراقبة السجلات
docker compose logs -f

# إيقاف الخدمات
docker compose down
```

### 3. الوصول

- الواجهة: `http://localhost/`
- API: `http://localhost/api/`
- WebSocket: `ws://localhost/socket.io/`

### بدون Nginx (للتطوير)

```bash
# تشغيل API و Web فقط
docker compose up api web -d
```

- API: `http://localhost:3001`
- Web: `http://localhost:3000`

---

## النشر على VPS Ubuntu (Hetzner)

### 1. تثبيت Docker

```bash
# تحديث النظام
sudo apt update && sudo apt upgrade -y

# تثبيت Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sudo sh get-docker.sh

# إضافة المستخدم لمجموعة Docker
sudo usermod -aG docker $USER
newgrp docker

# تثبيت Docker Compose
sudo apt install docker-compose-plugin -y
```

### 2. نسخ المشروع

```bash
# Clone من Git أو رفع الملفات
git clone <your-repo-url> whatsapp-crm
cd whatsapp-crm
```

### 3. إعداد البيئة

```bash
cp .env.example .env
nano .env
```

```env
# إعدادات الإنتاج
NODE_ENV=production
CORS_ORIGIN=http://your-domain.com,https://your-domain.com
WEBHOOK_URL=https://your-webhook.com/endpoint
WEBHOOK_SECRET=your-secret-key
```

### 4. التشغيل

```bash
docker compose up -d --build
```

### 5. مراقبة السجلات

```bash
# جميع الخدمات
docker compose logs -f

# خدمة معينة
docker compose logs -f api
docker compose logs -f web
docker compose logs -f nginx
```

### 6. إعداد SSL (اختياري)

```bash
# تثبيت Certbot
sudo apt install certbot -y

# الحصول على شهادة
sudo certbot certonly --webroot -w /var/www/certbot -d your-domain.com

# ثم عدّل nginx.conf لتفعيل HTTPS
```

---

## API Endpoints

### Health Check
```
GET /health → { ok: true, timestamp: "..." }
```

### WhatsApp
```
POST   /whatsapp/connect           body { clientId?: "default" }
GET    /whatsapp/status/:clientId  → { status, lastError?, updatedAt }
GET    /whatsapp/qr/:clientId      → { qrDataUrl? }
DELETE /whatsapp/session/:clientId → Reset كامل
```

### الرسائل
```
POST /messages/send  body { clientId?, to: "966...", text: "مرحبا" }
POST /whatsapp/send  body { clientId?, chatId, message }
GET  /whatsapp/chats/:clientId
GET  /whatsapp/messages/:clientId/:chatId
```

---

## Webhook

عند وصول رسالة جديدة، يتم إرسال POST إلى `WEBHOOK_URL`:

```json
{
  "event": "message",
  "clientId": "default",
  "from": "966xxxxxxxxx@c.us",
  "to": "966yyyyyyyyy@c.us",
  "body": "مرحبا",
  "timestamp": 1703001234,
  "messageId": "..."
}
```

### التوقيع (HMAC)

إذا تم تعيين `WEBHOOK_SECRET`، يضاف header:
```
X-Signature: HMAC-SHA256(payload, secret)
```

للتحقق:
```javascript
const crypto = require('crypto');
const signature = crypto
  .createHmac('sha256', WEBHOOK_SECRET)
  .update(JSON.stringify(payload))
  .digest('hex');

if (req.headers['x-signature'] === signature) {
  // Valid
}
```

### Retry Policy

- 3 محاولات بتأخير: 1s, 3s, 7s

---

## حل مشكلة "Session already exists but QR not ready yet"

### الآلية المستخدمة:

1. **Single-Flight Pattern**
   - إذا كان هناك اتصال جاري لنفس `clientId`، يُرجع نفس Promise بدلاً من بدء اتصال جديد

2. **Lock Mechanism**
   - قفل يُفعّل قبل `initialize()` ويُفك عند الانتهاء (نجاح أو فشل)

3. **QR Timeout (20 ثانية)**
   - إذا لم يصل QR خلال 20 ثانية:
     - Reset تلقائي للجلسة
     - إعادة محاولة واحدة (`attemptCount = 0` → `1`)
     - إذا فشل مرة أخرى → `status: error`

4. **Reset Session**
   - تدمير العميل
   - حذف مجلد LocalAuth
   - تصفير الحالة والمؤقتات والأقفال

---

## ملاحظات مهمة

### تحذير: عدم عمل Scale

**لا تقم بتشغيل أكثر من replica واحدة للـ API!**

WhatsApp session تحتاج instance واحدة لكل `clientId`. تشغيل replicas متعددة سيؤدي إلى تضارب الجلسات.

### حفظ الجلسات

- Volume `wa_auth` يحفظ جلسات WhatsApp
- لا تحذف هذا Volume إلا إذا أردت إعادة مسح QR

### Shared Memory

- الـ API container يحتاج `shm_size: 1gb` لعمل Chromium بشكل صحيح

---

## Socket.io Events

### Client → Server
```javascript
socket.emit("wa:subscribe", { clientId: "default" });
```

### Server → Client
```javascript
socket.on("wa:state", ({ clientId, status, updatedAt, lastError }) => {
  // Handle state change
});

socket.on("wa:qr", ({ clientId, qrDataUrl }) => {
  // Display QR code
});
```

---

## الحالات (States)

| الحالة | الوصف |
|--------|-------|
| `idle` | جاهز للاتصال |
| `initializing` | جاري التهيئة |
| `waiting_qr` | انتظار مسح QR |
| `ready` | متصل وجاهز |
| `error` | حدث خطأ |
| `disconnected` | تم فصل الاتصال |

---

## التراخيص والتحذيرات

- هذا المشروع يستخدم whatsapp-web.js وهو unofficial
- استخدم على مسؤوليتك الخاصة
- لا تستخدم للـ spam أو أي نشاط مخالف لشروط WhatsApp

---

## المساهمة

نرحب بالمساهمات! افتح Issue أو Pull Request.
