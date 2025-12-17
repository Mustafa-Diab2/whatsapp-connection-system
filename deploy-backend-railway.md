# نشر Backend على Railway

## الخطوات السريعة:

### 1. إنشاء حساب Railway
- اذهب إلى https://railway.app
- سجل الدخول بحساب GitHub

### 2. إنشاء مشروع جديد
- اضغط "New Project"
- اختر "Deploy from GitHub repo"
- اختر هذا المشروع

### 3. إعدادات المشروع
في إعدادات Railway:

**Root Directory**: `apps/api`

**Build Command**: (اتركه فارغاً أو ضع)
```
npm install
```

**Start Command**:
```
npm run dev
```

### 4. متغيرات البيئة
اذهب إلى Variables وأضف:

```
PORT=3001
WEB_ORIGIN=https://your-vercel-app.vercel.app
NODE_ENV=production
```

### 5. احفظ رابط API
بعد النشر، ستحصل على رابط مثل:
```
https://your-project.railway.app
```

احفظ هذا الرابط!

### 6. حدّث Frontend
اذهب إلى Vercel → Settings → Environment Variables

عدّل أو أضف:
```
NEXT_PUBLIC_API_URL=https://your-project.railway.app
```

ثم Redeploy Frontend.

### 7. اختبار
افتح:
```
https://your-vercel-app.vercel.app
```

---

## Persistent Storage للجلسات

⚠️ مهم: لحفظ جلسات WhatsApp، تحتاج Volume:

1. في Railway → Settings → Volumes
2. Add Volume
3. Mount Path: `/app/.wwebjs_auth`

هذا يضمن عدم فقدان الجلسات عند إعادة النشر.

---

## استكشاف الأخطاء

### الخطأ: Chromium not found
أضف في `apps/api/package.json`:
```json
{
  "scripts": {
    "postinstall": "cd node_modules/puppeteer && npm run install"
  }
}
```

### الخطأ: Connection refused
تأكد من:
- PORT في Environment Variables
- WEB_ORIGIN صحيح
- CORS مفعّل

---

## تكلفة Railway
- **Free Tier**: $5 رصيد شهري مجاناً
- **Starter**: $5/شهر بعد استهلاك المجاني
- يكفي للمشاريع الصغيرة والمتوسطة
