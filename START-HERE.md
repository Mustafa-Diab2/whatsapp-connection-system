# ابدأ من هنا! 🚀

## مرحباً! 👋

مشروعك **جاهز للنشر على Vercel** (Frontend) و **Railway** (Backend)!

---

## ⚡ النشر في 3 خطوات (6 دقائق)

### الخطوة 1: نشر Frontend على Vercel

**من الترمينال (Windows PowerShell):**
```powershell
.\deploy-vercel.ps1
```

**أو من الموقع:**
1. افتح https://vercel.com/new
2. Import من GitHub
3. Root Directory: `apps/web`
4. Deploy!

📝 احفظ الرابط: `https://your-app.vercel.app`

---

### الخطوة 2: نشر Backend على Railway

1. افتح https://railway.app
2. سجل دخول بـ GitHub
3. New Project → Deploy from GitHub repo
4. Root Directory: `apps/api`
5. Add Variables:
   ```
   PORT=3001
   WEB_ORIGIN=https://your-app.vercel.app
   ```
6. Deploy!

📝 احفظ الرابط: `https://your-api.railway.app`

---

### الخطوة 3: ربطهما

**في Vercel:**
- Settings → Environment Variables
- Add: `NEXT_PUBLIC_API_URL=https://your-api.railway.app`
- Redeploy

---

## ✅ اختبار

افتح: `https://your-app.vercel.app/whatsapp-connect`

---

## 📚 الملفات المهمة

| الملف | الوصف | متى تستخدمه |
|-------|--------|-------------|
| **[QUICK-DEPLOY.md](QUICK-DEPLOY.md)** | دليل سريع مفصّل | للنشر خطوة بخطوة |
| **[DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)** | قائمة تحقق | لضمان عدم نسيان شيء |
| **[DEPLOYMENT-FAQ.md](DEPLOYMENT-FAQ.md)** | أسئلة شائعة | عند مواجهة مشكلة |
| **[DEPLOYMENT.md](DEPLOYMENT.md)** | دليل شامل | للتفاصيل التقنية |
| **[PROJECT-SUMMARY.md](PROJECT-SUMMARY.md)** | ملخص المشروع | لفهم البنية الكاملة |

---

## 🆘 مشكلة؟

### QR لا يظهر؟
➡️ راجع [DEPLOYMENT-FAQ.md](DEPLOYMENT-FAQ.md#-qr-code-لا-يظهر)

### CORS Error؟
➡️ راجع [DEPLOYMENT-FAQ.md](DEPLOYMENT-FAQ.md#-cors-error-في-console)

### أي مشكلة أخرى؟
➡️ راجع [DEPLOYMENT-FAQ.md](DEPLOYMENT-FAQ.md)

---

## 💰 التكلفة

- **Vercel (Frontend)**: مجاني
- **Railway (Backend)**: $5 رصيد مجاني، ثم $5/شهر
- **المجموع**: $0-5/شهر

---

## 🎯 الخلاصة

1. ✅ نشر Frontend على Vercel
2. ✅ نشر Backend على Railway
3. ✅ ربطهما عبر Environment Variables
4. ✅ اختبار والاستمتاع!

---

**الآن ابدأ! اختر إحدى الطرق وانطلق 🚀**

- **سريع جداً**: راجع [QUICK-DEPLOY.md](QUICK-DEPLOY.md)
- **حذر ومنظم**: راجع [DEPLOYMENT-CHECKLIST.md](DEPLOYMENT-CHECKLIST.md)
- **فني ومفصّل**: راجع [DEPLOYMENT.md](DEPLOYMENT.md)

**حظاً موفقاً! 🎉**
