# النشر السريع - خطوة بخطوة 🚀

## المتطلبات الأساسية

```bash
# تثبيت Node.js 18+
# تثبيت Git
# حساب GitHub
```

---

## الطريقة 1️⃣: Vercel (Frontend) + Railway (Backend) ⭐ الأسهل

### الخطوة 1: نشر Frontend على Vercel

```bash
# تثبيت Vercel CLI
npm install -g vercel

# تسجيل الدخول
vercel login

# من مجلد المشروع الرئيسي
cd "c:\Users\Badr\OneDrive\Desktop\يارب"

# نشر Frontend
cd apps/web
vercel --prod
```

**ملاحظات:**
- اختر اسم مشروع (أو اترك الافتراضي)
- ستحصل على رابط مثل: `https://your-app.vercel.app`
- احفظ هذا الرابط!

### الخطوة 2: نشر Backend على Railway

**من المتصفح (الأسهل):**

1. افتح https://railway.app
2. سجل دخول بـ GitHub
3. New Project → Deploy from GitHub repo
4. اختر المشروع
5. Settings:
   - **Root Directory**: `apps/api`
   - **Start Command**: `npm run dev`
6. Variables → Add Variables:
   ```
   PORT=3001
   WEB_ORIGIN=https://your-app.vercel.app
   ```
7. Deploy!
8. احفظ الرابط: `https://your-api.railway.app`

### الخطوة 3: ربط Frontend بـ Backend

```bash
# في Vercel Dashboard
# Settings → Environment Variables → Add

NEXT_PUBLIC_API_URL=https://your-api.railway.app

# ثم Redeploy
vercel --prod
```

✅ **جاهز! افتح**: `https://your-app.vercel.app`

---

## الطريقة 2️⃣: Railway فقط (كل شيء في مكان واحد)

### الخطوة 1: نشر Backend

نفس الخطوات أعلاه ☝️

### الخطوة 2: نشر Frontend

في Railway:
1. New Project → Deploy from GitHub repo (نفس الريبو)
2. Settings:
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build`
   - **Start Command**: `npm start`
3. Variables:
   ```
   NEXT_PUBLIC_API_URL=https://your-api.railway.app
   ```

✅ **جاهز!**

---

## الطريقة 3️⃣: Render (البديل المجاني)

### نشر Backend

1. افتح https://render.com
2. New → Web Service
3. Connect GitHub repo
4. Settings:
   - **Root Directory**: `apps/api`
   - **Build Command**: `npm install`
   - **Start Command**: `npm run dev`
5. Environment:
   ```
   PORT=3001
   WEB_ORIGIN=https://your-frontend.onrender.com
   ```

### نشر Frontend

1. New → Static Site
2. Connect GitHub repo
3. Settings:
   - **Root Directory**: `apps/web`
   - **Build Command**: `npm run build`
   - **Publish Directory**: `.next`
4. Environment:
   ```
   NEXT_PUBLIC_API_URL=https://your-backend.onrender.com
   ```

⚠️ **ملاحظة**: Render المجاني قد يكون بطيء في البداية (cold start)

---

## الطريقة 4️⃣: VPS (الأكثر تحكماً)

### على خادم Ubuntu/Debian

```bash
# SSH إلى الخادم
ssh user@your-server-ip

# تثبيت Node.js
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# استنساخ المشروع
git clone https://github.com/your-username/your-repo.git
cd your-repo

# تثبيت الاعتمادات
npm install

# تثبيت PM2
npm install -g pm2

# إنشاء ملف .env
cat > .env << EOF
PORT=3001
WEB_ORIGIN=http://your-server-ip:3000
NEXT_PUBLIC_API_URL=http://your-server-ip:3001
EOF

# تشغيل Backend
cd apps/api
pm2 start src/server.ts --name whatsapp-api
pm2 save

# في نافذة/جلسة أخرى، تشغيل Frontend
cd apps/web
npm run build
pm2 start npm --name "nextjs" -- start
pm2 save

# حفظ PM2 للتشغيل التلقائي عند إعادة التشغيل
pm2 startup
# انسخ الأمر الذي يظهر ونفذه

# التحقق من الحالة
pm2 status
pm2 logs
```

**إعداد Nginx (اختياري):**

```bash
sudo apt install nginx

# إنشاء ملف تكوين
sudo nano /etc/nginx/sites-available/whatsapp-app

# أضف:
server {
    listen 80;
    server_name your-domain.com;

    location /api {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}

# تفعيل
sudo ln -s /etc/nginx/sites-available/whatsapp-app /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl restart nginx
```

---

## اختبار بعد النشر

### Frontend
افتح: `https://your-app.vercel.app` (أو الرابط الخاص بك)

### Backend Health Check
افتح: `https://your-api.railway.app/health`
يجب أن ترى: `{"ok":true}`

### WhatsApp Connection
1. اذهب إلى `/whatsapp-connect`
2. اضغط "اتصال بـ WhatsApp"
3. امسح QR من هاتفك

---

## استكشاف الأخطاء الشائعة

### ❌ CORS Error
**الحل**: تأكد من `WEB_ORIGIN` في Backend يطابق رابط Frontend

### ❌ QR لا يظهر
**الحل**:
1. افتح Console في المتصفح
2. تحقق من `NEXT_PUBLIC_API_URL` صحيح
3. تحقق من Backend يعمل: `/health`

### ❌ Chromium not found (على Railway/Render)
**الحل**: أضف في `apps/api/Dockerfile` أو `nixpacks.toml`:
```toml
[phases.setup]
aptPkgs = ["chromium", "chromium-sandbox"]
```

### ❌ Session تضيع عند Redeploy
**الحل**: استخدم Persistent Volume/Storage في Railway/Render

---

## الخلاصة: أي طريقة تختار؟

| الطريقة | السهولة | التكلفة | الأداء | التوصية |
|---------|---------|---------|--------|----------|
| Vercel + Railway | ⭐⭐⭐⭐⭐ | مجاني-$5 | ممتاز | **للمبتدئين** |
| Railway فقط | ⭐⭐⭐⭐ | مجاني-$5 | جيد جداً | موصى به |
| Render | ⭐⭐⭐⭐ | مجاني | متوسط | للتجربة |
| VPS | ⭐⭐⭐ | $4-10/شهر | ممتاز | للمحترفين |

**توصيتي**: ابدأ بـ **Vercel + Railway** - الأسهل والأسرع! 🚀
