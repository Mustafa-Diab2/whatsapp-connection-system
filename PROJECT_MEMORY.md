# 📋 Awfar CRM - WhatsApp Connection Suite

## 🎯 نظرة عامة

**Awfar CRM** هو نظام CRM/ERP متكامل متعدد المستأجرين (Multi-tenant) لإدارة التواصل مع العملاء عبر قنوات متعددة مع التركيز على WhatsApp.

### الغرض الرئيسي
- ربط واتساب مع نظام إدارة علاقات العملاء
- أتمتة الردود باستخدام الذكاء الاصطناعي (Google Gemini)
- إدارة الحملات التسويقية والرسائل الجماعية
- نظام ERP متكامل (منتجات، طلبات، فواتير، مشتريات)
- تكامل مع Facebook/Instagram للتواصل والإعلانات

---

## 🛠️ التقنيات المستخدمة

### Backend (apps/api)
| التقنية | الاستخدام |
|---------|-----------|
| Node.js + Express | Server Framework |
| TypeScript | لغة البرمجة |
| whatsapp-web.js | تكامل WhatsApp |
| Socket.io | Real-time Communication |
| Supabase (PostgreSQL) | قاعدة البيانات |
| Google Generative AI (Gemini 2.0) | الذكاء الاصطناعي |
| JWT + bcryptjs | المصادقة |
| Stripe | الدفع الإلكتروني |
| Zod | التحقق من البيانات |

### Frontend (apps/web)
| التقنية | الاستخدام |
|---------|-----------|
| Next.js 14 | Framework |
| React 18 | UI Library |
| TypeScript | لغة البرمجة |
| Tailwind CSS | التصميم |
| Chart.js | الرسوم البيانية |
| Socket.io-client | Real-time |

### البنية التحتية
- **Docker + Docker Compose** للنشر المحلي
- **Vercel** لنشر Frontend
- **Railway** لنشر Backend
- **Nginx** كـ Reverse Proxy

---

## 📁 هيكل المشروع

```
├── apps/
│   ├── api/                    # Backend Express API
│   │   ├── src/
│   │   │   ├── server.ts       # نقطة البداية
│   │   │   ├── routes/         # API endpoints
│   │   │   ├── services/       # Business logic
│   │   │   ├── wa/             # WhatsApp integration
│   │   │   ├── schemas/        # Zod validation
│   │   │   └── middleware/     # Express middleware
│   │   └── Dockerfile
│   │
│   └── web/                    # Frontend Next.js
│       ├── app/                # صفحات التطبيق
│       ├── components/         # React components
│       ├── lib/                # Utilities & hooks
│       └── Dockerfile
│
├── supabase/
│   └── migrations/             # Database migrations (18 ملف)
│
├── docker/
│   └── nginx/nginx.conf
│
├── docker-compose.yml
├── railway.toml
└── vercel.json
```

---

## 🔧 Services الرئيسية

### 1. WhatsAppManager (apps/api/src/wa/WhatsAppManager.ts)
**الحجم**: ~1900 سطر - أهم ملف في المشروع

#### المسؤوليات:
- إدارة جلسات WhatsApp (connect, disconnect, reset)
- إرسال/استقبال الرسائل في الوقت الفعلي
- البوت الذكي (AI/Local/Hybrid modes)
- مزامنة جهات الاتصال والمحادثات
- تتبع Attribution (CTWA ads)

#### حالات الاتصال:
```
disconnected → initializing → qr → ready/connected → disconnected
```

#### أوضاع البوت:
| الوضع | الوصف |
|-------|-------|
| `ai` | ردود Gemini AI كاملة |
| `local` | قواعد محلية من قاعدة البيانات |
| `hybrid` | محلي أولاً، ثم AI إذا لم يجد |

### 2. FacebookService (apps/api/src/services/facebook.service.ts)
**الحجم**: ~876 سطر

#### المسؤوليات:
- OAuth authentication مع Facebook
- تشفير/فك تشفير access tokens (AES-256-GCM)
- إدارة صفحات Facebook
- مزامنة حملات Facebook Ads
- Messenger API للرسائل
- Conversions API للتتبع
- Webhook verification

### 3. PaymentsService (apps/api/src/services/payments.service.ts)
- إنشاء روابط دفع Stripe
- معالجة Webhooks
- ربط الدفع بالطلبات/الفواتير

### 4. AutomationEngine (apps/api/src/services/automation.service.ts)
- التذكيرات التلقائية
- رؤى AI للمبيعات
- جدولة المهام

### 5. WorkflowEngine (apps/api/src/services/workflow.service.ts)
- محرك سير العمل التلقائي
- محفزات (keywords, new customer)
- إجراءات (send_message, send_buttons, send_list)

---

## 🗄️ قاعدة البيانات (PostgreSQL/Supabase)

### الجداول الرئيسية

#### CRM Core
| الجدول | الوصف |
|--------|-------|
| `organizations` | المؤسسات (Multi-tenant) |
| `users` | المستخدمين |
| `customers` | العملاء |
| `contacts` | جهات الاتصال من WhatsApp |
| `conversations` | المحادثات |
| `messages` | الرسائل |

#### ERP
| الجدول | الوصف |
|--------|-------|
| `products` | المنتجات والمخزون |
| `orders` | الطلبات |
| `order_items` | عناصر الطلبات |
| `invoices` | الفواتير |
| `vendors` | الموردين |
| `purchase_orders` | أوامر الشراء |
| `tasks` | المهام |

#### التسويق
| الجدول | الوصف |
|--------|-------|
| `campaigns` | الحملات التسويقية |
| `campaign_logs` | سجلات الإرسال |
| `deals` | صفقات CRM |
| `deal_stages` | مراحل الصفقات |
| `quick_replies` | الردود السريعة |

#### التكاملات
| الجدول | الوصف |
|--------|-------|
| `facebook_pages` | صفحات Facebook |
| `facebook_campaigns` | حملات الإعلانات |
| `click_attribution_events` | تتبع CTWA |
| `messenger_pages` | صفحات Messenger |
| `messenger_conversations` | محادثات Messenger |
| `messenger_messages` | رسائل Messenger |

#### إضافية
| الجدول | الوصف |
|--------|-------|
| `documents` | قاعدة المعرفة للبوت |
| `bot_config` | إعدادات البوت |
| `surveys` | الاستبيانات |
| `appointments` | المواعيد |
| `chatbot_flows` | تدفقات الشات بوت |
| `payment_links` | روابط الدفع |

---

## 🌐 API Endpoints

### Authentication (`/api/auth`)
```
POST /register       - تسجيل جديد
POST /login          - تسجيل دخول
GET  /profile        - الملف الشخصي
PUT  /profile        - تحديث الملف
PUT  /change-password - تغيير كلمة المرور
POST /team/invite    - دعوة عضو فريق
GET  /team           - قائمة الفريق
```

### WhatsApp (`/whatsapp`)
```
POST /connect        - ربط واتساب (يُرجع QR)
GET  /status/:clientId - حالة الاتصال
POST /send           - إرسال رسالة نصية
POST /send-media     - إرسال وسائط
POST /send-contact   - إرسال جهة اتصال
POST /reply          - الرد على رسالة
POST /delete-message - حذف رسالة
POST /logout         - تسجيل خروج
POST /reset          - إعادة ضبط الجلسة
GET  /me             - معلومات الحساب
GET  /chats          - قائمة المحادثات
GET  /messages/:chatId - رسائل محادثة
GET  /contacts       - جهات الاتصال
POST /contacts/sync  - مزامنة جهات الاتصال
```

### ERP APIs
```
/api/products        - المنتجات
/api/orders          - الطلبات
/api/invoices        - الفواتير
/api/purchases       - المشتريات
/api/tasks           - المهام
```

### CRM APIs
```
/api/campaigns       - الحملات
/api/deals           - صفقات Kanban
/api/quick-replies   - الردود السريعة
```

### Integration APIs
```
/api/facebook        - تكامل Facebook
/api/messenger       - رسائل Messenger
/api/instagram       - تكامل Instagram
/api/tracking        - تتبع الإحالات
/api/payments        - روابط الدفع
```

---

## 📱 صفحات الواجهة الأمامية

### الصفحات الرئيسية
| المسار | الوصف | الحجم |
|--------|-------|-------|
| `/login` | تسجيل الدخول | - |
| `/dashboard` | لوحة التحكم | 218 سطر |
| `/chat` | المحادثات (الأكبر) | 1734 سطر |
| `/contacts` | جهات الاتصال | - |
| `/campaigns` | الحملات | 596 سطر |
| `/crm` | Kanban الصفقات | 420 سطر |

### ERP
| المسار | الوصف |
|--------|-------|
| `/inventory` | المنتجات والمخزون |
| `/orders` | الطلبات |
| `/invoices` | الفواتير |
| `/purchases` | المشتريات |

### إعدادات
| المسار | الوصف |
|--------|-------|
| `/whatsapp-connect` | ربط WhatsApp |
| `/bot` | إعدادات البوت |
| `/documents` | قاعدة المعرفة |
| `/settings` | الإعدادات العامة |
| `/meta` | Facebook/Instagram |

---

## 🔐 الأمان والمصادقة

### Authentication
- **JWT Tokens** (صلاحية 7 أيام)
- **HTTP-Only Cookies**
- **bcryptjs** لتشفير كلمات المرور
- **Multi-tenant** عبر `organization_id`

### Security Features
- Helmet للـ Security Headers
- Rate Limiting (500 عام، 20 للمصادقة)
- CORS مع قائمة بيضاء
- تشفير Facebook tokens (AES-256-GCM)
- Webhook signature verification

### Rate Limits
| Endpoint | الحد |
|----------|------|
| عام | 500 req / 15 min |
| Auth | 20 req / 15 min |
| WhatsApp Connect | 3 req / hour |
| Messages | 30 msg / min |
| Facebook API | 200 req / hour |

---

## 🎨 Patterns المستخدمة

### 1. Singleton Pattern
```typescript
// AutomationEngine, WorkflowEngine
public static getInstance(manager): AutomationEngine
```

### 2. Single-Flight Pattern
```typescript
// منع تكرار اتصال WhatsApp
private connectInFlight = new Map<string, Promise<WaState>>();
```

### 3. Multi-tenancy
```typescript
// فلترة البيانات بـ organization_id
.eq('organization_id', organizationId)
```

### 4. Real-time Events
```typescript
// Socket.io events
wa:qr, wa:state, wa:message, wa:message_ack,
wa:reaction, bot:activity, campaign:update
```

### 5. Optimistic Updates
```typescript
// تحديث UI فوراً ثم API
setCampaigns(prev => prev.filter(c => c.id !== id));
await axios.delete(...);
```

---

## ⚙️ Environment Variables

### مطلوبة
```env
# Database
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=

# Auth
JWT_SECRET=

# AI
GEMINI_API_KEY=

# Frontend
FRONTEND_URL=
NEXT_PUBLIC_API_URL=
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
```

### اختيارية
```env
# Payments
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=

# Facebook
FACEBOOK_APP_ID=
FACEBOOK_APP_SECRET=
FACEBOOK_VERIFY_TOKEN=
FACEBOOK_ENCRYPTION_KEY=
```

---

## 🐳 Docker

### Services
| Service | Port | الوصف |
|---------|------|-------|
| api | 3001 | Express + WhatsApp |
| web | 3000 | Next.js |
| nginx | 80 | Reverse Proxy |

### Volumes
- `wa_auth` - WhatsApp session data
- `wa_cache` - WhatsApp cache

### أوامر مفيدة
```bash
# تشغيل
docker-compose up -d

# عرض السجلات
docker-compose logs -f api

# إعادة بناء
docker-compose up -d --build
```

---

## 📊 إحصائيات المشروع

| العنصر | العدد |
|--------|-------|
| Routes Files | 22+ |
| Database Migrations | 18 |
| Frontend Pages | 35+ |
| API Endpoints | 100+ |
| Database Tables | 25+ |

---

## 🔄 آخر التحديثات

- **018_messenger_integration.sql** - تكامل Facebook Messenger
- **017_advanced_features.sql** - ميزات متقدمة
- **016_facebook_integration.sql** - تكامل Facebook/Instagram

---

## 📝 ملاحظات للمطورين

1. **WhatsAppManager** هو الملف الأهم - تعامل معه بحذر
2. جميع البيانات مفلترة بـ `organization_id` للـ Multi-tenancy
3. الرسائل بالعربية في الأخطاء والـ toasts
4. استخدم Zod للتحقق من المدخلات
5. Socket.io للتحديثات الفورية
6. Gemini 2.0 Flash للـ AI
