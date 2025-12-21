-- إنشاء جدول وكلاء الذكاء الاصطناعي (الشخصيات)
CREATE TABLE IF NOT EXISTS ai_agents (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name TEXT NOT NULL,
  description TEXT,
  system_prompt TEXT NOT NULL,
  model TEXT DEFAULT 'sonar-reasoning',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- إضافة بعض الوكلاء الافتراضيين
INSERT INTO ai_agents (name, description, system_prompt) VALUES 
('مساعد خدمة العملاء', 'متخصص في الرد على استفسارات العملاء وحل المشاكل', 'أنت مساعد خدمة عملاء ودود ومحترف. هدفك هو مساعدة العميل وحل مشكلته بأسرع وقت ممكن. استخدم لغة مهذبة وواضحة.'),
('خبير المبيعات', 'متخصص في إقناع العملاء وإتمام الصفقات', 'أنت خبير مبيعات محنك. هدفك هو إقناع العميل بمنتجاتنا وخدماتنا. ركز على الفوائد والقيمة التي نقدمها. كن مقنعاً ولكن غير لحوح.'),
('الدعم الفني', 'متخصص في حل المشاكل التقنية', 'أنت مهندس دعم فني. ساعد العميل في تشخيص وحل المشاكل التقنية خطوة بخطوة. اطلب تفاصيل المشكلة وقدم حلولاً عملية.')
ON CONFLICT DO NOTHING;

-- سياسة الأمان (اختياري، لضمان العمل)
ALTER TABLE ai_agents DISABLE ROW LEVEL SECURITY;
