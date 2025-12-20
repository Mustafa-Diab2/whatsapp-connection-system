# 🚀 خطة ربط Supabase - WhatsApp CRM الذكي

## 📌 نظرة عامة على المشروع الحالي

### البنية الحالية:
- **Frontend**: Next.js 14 → Vercel
- **Backend**: Express + Socket.io → Railway
- **WhatsApp**: whatsapp-web.js
- **Database**: ❌ لا يوجد (In-Memory فقط)

### المشكلة الحالية:
- البيانات تُفقد عند إعادة تشغيل السيرفر
- لا يوجد تخزين دائم للعملاء/الإعدادات/الرسائل
- لا يوجد تحليل للمحادثات

---

## 🎯 الهدف النهائي

نظام CRM متكامل يشمل:
1. ✅ تخزين دائم لجميع البيانات
2. ✅ تحليل الرسائل بالذكاء الاصطناعي
3. ✅ رد آلي ذكي على العملاء
4. ✅ تقارير وإحصائيات حية
5. ✅ تحديثات في الوقت الفعلي

---

# 📐 البنية المقترحة

```
┌─────────────────────────────────────────────────────────────────┐
│                         العميل (العميل)                          │
└─────────────────────┬───────────────────────────────────────────┘
                      │
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Frontend (Next.js)                            │
│                       Vercel                                     │
│  • صفحات التحكم (Dashboard, CRM, Chat, etc.)                     │
│  • Socket.io Client للتحديثات المباشرة                           │
│  • Supabase Client للـ Real-time Updates                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │ REST API + WebSocket
                      ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Backend (Express)                             │
│                       Railway                                    │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐              │
│  │ WhatsApp    │  │ Gemini AI   │  │ Supabase    │              │
│  │ Manager     │  │ Processor   │  │ Client      │              │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘              │
│         │                │                │                      │
└─────────┼────────────────┼────────────────┼──────────────────────┘
          │                │                │
          ▼                ▼                ▼
┌─────────────────┐  ┌──────────┐  ┌──────────────────────────────┐
│   WhatsApp      │  │  Gemini  │  │        Supabase              │
│   (الهاتف)       │  │   API    │  │  ┌──────────────────────┐   │
│                 │  │          │  │  │ PostgreSQL Database  │   │
└─────────────────┘  └──────────┘  │  ├──────────────────────┤   │
                                   │  │ • customers          │   │
                                   │  │ • contacts           │   │
                                   │  │ • messages           │   │
                                   │  │ • conversations      │   │
                                   │  │ • settings           │   │
                                   │  │ • threads            │   │
                                   │  │ • ai_responses       │   │
                                   │  │ • analytics          │   │
                                   │  └──────────────────────┘   │
                                   │  ┌──────────────────────┐   │
                                   │  │ Real-time Subscriptions│  │
                                   │  └──────────────────────┘   │
                                   │  ┌──────────────────────┐   │
                                   │  │ Edge Functions       │   │
                                   │  │ (Optional AI Processing)│ │
                                   │  └──────────────────────┘   │
                                   └──────────────────────────────┘
```

---

# 📊 هيكل قاعدة البيانات (Supabase)

## الجداول المطلوبة:

### 1. `customers` - العملاء
```sql
CREATE TABLE customers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  status TEXT DEFAULT 'pending', -- active, inactive, pending
  notes TEXT,
  tags TEXT[],
  source TEXT DEFAULT 'whatsapp',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  last_contact_at TIMESTAMPTZ
);
```

### 2. `contacts` - جهات الاتصال
```sql
CREATE TABLE contacts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  email TEXT,
  group_name TEXT DEFAULT 'عملاء جدد',
  avatar TEXT,
  customer_id UUID REFERENCES customers(id),
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 3. `conversations` - المحادثات
```sql
CREATE TABLE conversations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id UUID REFERENCES customers(id),
  wa_chat_id TEXT NOT NULL, -- WhatsApp Chat ID
  status TEXT DEFAULT 'open', -- open, closed, archived
  priority TEXT DEFAULT 'normal', -- low, normal, high
  assigned_to UUID, -- يمكن ربطه بجدول المستخدمين
  last_message_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 4. `messages` - الرسائل
```sql
CREATE TABLE messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  conversation_id UUID REFERENCES conversations(id),
  customer_id UUID REFERENCES customers(id),
  wa_message_id TEXT UNIQUE, -- WhatsApp Message ID
  body TEXT,
  from_phone TEXT,
  to_phone TEXT,
  is_from_customer BOOLEAN DEFAULT true,
  is_bot_reply BOOLEAN DEFAULT false,
  message_type TEXT DEFAULT 'text', -- text, image, audio, document
  sentiment TEXT, -- positive, negative, neutral (من AI)
  intent TEXT, -- question, complaint, order, etc (من AI)
  metadata JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 5. `ai_responses` - ردود الذكاء الاصطناعي
```sql
CREATE TABLE ai_responses (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  message_id UUID REFERENCES messages(id),
  prompt TEXT,
  response TEXT,
  model TEXT DEFAULT 'gemini-1.5-flash',
  tokens_used INTEGER,
  response_time_ms INTEGER,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 6. `threads` - تذاكر الدعم
```sql
CREATE TABLE threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  customer_id UUID REFERENCES customers(id),
  conversation_id UUID REFERENCES conversations(id),
  status TEXT DEFAULT 'open', -- open, pending, closed
  priority TEXT DEFAULT 'medium', -- low, medium, high
  assigned_to UUID,
  messages_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  closed_at TIMESTAMPTZ
);
```

### 7. `settings` - الإعدادات
```sql
CREATE TABLE settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  key TEXT UNIQUE NOT NULL,
  value JSONB NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);
```

### 8. `analytics_daily` - الإحصائيات اليومية
```sql
CREATE TABLE analytics_daily (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  date DATE UNIQUE NOT NULL,
  messages_sent INTEGER DEFAULT 0,
  messages_received INTEGER DEFAULT 0,
  new_customers INTEGER DEFAULT 0,
  bot_replies INTEGER DEFAULT 0,
  avg_response_time_seconds INTEGER,
  positive_sentiment_count INTEGER DEFAULT 0,
  negative_sentiment_count INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

---

# 🔄 تدفق البيانات (Data Flow)

## 1. استقبال رسالة جديدة:

```
1. العميل يرسل رسالة على WhatsApp
          ↓
2. whatsapp-web.js يستقبل الرسالة (message event)
          ↓
3. Backend يعالج الرسالة:
   a. يحفظها في Supabase (messages table)
   b. يربطها بالعميل (customer_id)
   c. يربطها بالمحادثة (conversation_id)
          ↓
4. إرسال للـ AI (Gemini):
   a. تحليل المشاعر (Sentiment Analysis)
   b. تحديد النية (Intent Detection)
   c. توليد رد مناسب
          ↓
5. حفظ تحليل AI في Supabase:
   a. تحديث messages.sentiment
   b. تحديث messages.intent
   c. حفظ الرد في ai_responses
          ↓
6. إرسال الرد للعميل عبر WhatsApp
          ↓
7. حفظ رسالة الرد في Supabase
          ↓
8. تحديث الإحصائيات (analytics_daily)
          ↓
9. إرسال تحديث Real-time للـ Frontend
```

## 2. رسم بياني للتدفق:

```
[WhatsApp Message] 
       ↓
[whatsapp-web.js] ─→ [Save to Supabase: messages]
       ↓                      ↓
[Gemini AI Analysis] ←────────┘
       ↓
 ┌─────┴─────┐
 ↓           ↓
Sentiment   Intent
 ↓           ↓
 └─────┬─────┘
       ↓
[Generate Response]
       ↓
[Save AI Response to Supabase]
       ↓
[Send via WhatsApp]
       ↓
[Update Analytics]
       ↓
[Real-time Update to Frontend]
```

---

# 🤖 تحليل الرسائل بـ Gemini AI

## الوظائف:

### 1. Sentiment Analysis (تحليل المشاعر)
```javascript
const analyzeSentiment = async (message) => {
  const prompt = `
    حلل مشاعر هذه الرسالة وصنفها إلى: positive, negative, neutral
    الرسالة: "${message}"
    أعطني فقط التصنيف بدون شرح.
  `;
  // Call Gemini API
};
```

### 2. Intent Detection (تحديد النية)
```javascript
const detectIntent = async (message) => {
  const prompt = `
    حدد نية هذه الرسالة من بين: 
    - question (سؤال)
    - complaint (شكوى)
    - order (طلب)
    - support (دعم فني)
    - feedback (رأي/تقييم)
    - greeting (تحية)
    - other (أخرى)
    
    الرسالة: "${message}"
    أعطني فقط النية بدون شرح.
  `;
  // Call Gemini API
};
```

### 3. Smart Reply (الرد الذكي)
```javascript
const generateReply = async (message, context, systemPrompt) => {
  const prompt = `
    ${systemPrompt}
    
    سياق المحادثة:
    ${context}
    
    رسالة العميل: "${message}"
    
    اكتب رداً مناسباً ومهنياً.
  `;
  // Call Gemini API
};
```

---

# 📈 التقارير والإحصائيات

## البيانات المتاحة:

### 1. إحصائيات يومية
```sql
SELECT 
  date,
  messages_sent,
  messages_received,
  new_customers,
  bot_replies,
  avg_response_time_seconds
FROM analytics_daily
WHERE date >= NOW() - INTERVAL '30 days'
ORDER BY date;
```

### 2. تحليل المشاعر
```sql
SELECT 
  sentiment,
  COUNT(*) as count
FROM messages
WHERE created_at >= NOW() - INTERVAL '7 days'
GROUP BY sentiment;
```

### 3. أكثر الأسئلة شيوعاً
```sql
SELECT 
  intent,
  COUNT(*) as count
FROM messages
WHERE is_from_customer = true
  AND created_at >= NOW() - INTERVAL '30 days'
GROUP BY intent
ORDER BY count DESC;
```

### 4. أداء البوت
```sql
SELECT 
  DATE(created_at) as date,
  COUNT(*) as total_replies,
  AVG(response_time_ms) as avg_response_time
FROM ai_responses
GROUP BY DATE(created_at)
ORDER BY date DESC;
```

---

# 🛠️ خطوات التنفيذ

## المرحلة 1: إعداد Supabase (يوم واحد)

### الخطوة 1.1: إنشاء مشروع Supabase
1. اذهب إلى https://supabase.com
2. أنشئ حساب جديد أو سجل دخول
3. أنشئ مشروع جديد
4. انسخ:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
   - `SUPABASE_SERVICE_ROLE_KEY`

### الخطوة 1.2: إنشاء الجداول
1. اذهب إلى SQL Editor
2. أنشئ الجداول المذكورة أعلاه
3. أضف Row Level Security (RLS)

### الخطوة 1.3: إعداد Real-time
1. اذهب إلى Database → Replication
2. فعّل Real-time للجداول: messages, customers, threads

---

## المرحلة 2: ربط Backend بـ Supabase (يومان)

### الخطوة 2.1: تثبيت المكتبات
```bash
cd apps/api
npm install @supabase/supabase-js
```

### الخطوة 2.2: إنشاء Supabase Client
```typescript
// apps/api/src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export const supabase = createClient(supabaseUrl, supabaseServiceKey);
```

### الخطوة 2.3: تحديث WhatsAppManager
- حفظ الرسائل في Supabase
- إنشاء/تحديث العملاء تلقائياً
- ربط الرسائل بالمحادثات

### الخطوة 2.4: تحديث API Endpoints
- استبدال In-Memory Maps بـ Supabase queries

---

## المرحلة 3: تكامل Gemini AI (يومان)

### الخطوة 3.1: تحسين AI Processor
```typescript
// apps/api/src/ai/GeminiProcessor.ts
class GeminiProcessor {
  async analyzeMessage(message: string) {
    const [sentiment, intent] = await Promise.all([
      this.analyzeSentiment(message),
      this.detectIntent(message)
    ]);
    return { sentiment, intent };
  }
  
  async generateReply(message: string, context: string, systemPrompt: string) {
    // ...
  }
}
```

### الخطوة 3.2: Pipeline المعالجة
```typescript
async handleIncomingMessage(message) {
  // 1. Save raw message
  const savedMessage = await supabase.from('messages').insert({...});
  
  // 2. Analyze with AI
  const analysis = await gemini.analyzeMessage(message.body);
  
  // 3. Update message with analysis
  await supabase.from('messages').update({
    sentiment: analysis.sentiment,
    intent: analysis.intent
  }).eq('id', savedMessage.id);
  
  // 4. Generate and send reply if bot enabled
  if (botEnabled) {
    const reply = await gemini.generateReply(...);
    await this.sendAndSaveReply(reply);
  }
  
  // 5. Update analytics
  await this.updateAnalytics(analysis);
}
```

---

## المرحلة 4: تحديث Frontend (يومان)

### الخطوة 4.1: تثبيت Supabase Client
```bash
cd apps/web
npm install @supabase/supabase-js @supabase/ssr
```

### الخطوة 4.2: Real-time Subscriptions
```typescript
// استقبال الرسائل الجديدة مباشرة
supabase
  .channel('messages')
  .on('postgres_changes', { 
    event: 'INSERT', 
    schema: 'public', 
    table: 'messages' 
  }, (payload) => {
    // Update UI with new message
  })
  .subscribe();
```

### الخطوة 4.3: تحديث صفحة التقارير
- جلب البيانات من Supabase
- رسوم بيانية حية

---

## المرحلة 5: الاختبار والنشر (يوم واحد)

### الخطوة 5.1: اختبار محلي
- اختبار حفظ الرسائل
- اختبار تحليل AI
- اختبار Real-time

### الخطوة 5.2: إضافة متغيرات البيئة
**Railway:**
```
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_SERVICE_ROLE_KEY=eyJ...
GEMINI_API_KEY=AIza...
```

**Vercel:**
```
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=eyJ...
```

### الخطوة 5.3: النشر
```bash
git add .
git commit -m "Integrate Supabase + Gemini AI"
git push origin main
```

---

# 📋 ملخص المهام

| # | المهمة | الأيام | الأولوية |
|---|--------|--------|----------|
| 1 | إعداد Supabase وإنشاء الجداول | 1 | 🔴 عالية |
| 2 | ربط Backend بـ Supabase | 2 | 🔴 عالية |
| 3 | تكامل Gemini AI للتحليل | 2 | 🟡 متوسطة |
| 4 | تحديث Frontend مع Real-time | 2 | 🟡 متوسطة |
| 5 | صفحة التقارير المتقدمة | 1 | 🟢 منخفضة |
| 6 | الاختبار والنشر | 1 | 🔴 عالية |

**المجموع: 9 أيام عمل**

---

# 💡 ميزات إضافية مستقبلية

1. **تصنيف العملاء التلقائي** - بناءً على تحليل المحادثات
2. **توقع احتياجات العميل** - باستخدام ML
3. **رسائل مجدولة** - حملات تسويقية
4. **متجر إلكتروني مدمج** - طلبات عبر WhatsApp
5. **مساعد صوتي** - تحويل الصوت لنص وتحليله

---

**هل تريد أن نبدأ بتنفيذ المرحلة الأولى؟** 🚀
