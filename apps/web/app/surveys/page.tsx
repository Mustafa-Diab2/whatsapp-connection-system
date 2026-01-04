'use client';

import { useState, useEffect } from 'react';
import { 
  Star, 
  Plus, 
  Edit2, 
  Trash2, 
  Send, 
  BarChart3,
  MessageSquare,
  TrendingUp,
  TrendingDown,
  Minus,
  Eye,
  Copy,
  Check
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase';

interface Question {
  id: string;
  type: 'rating' | 'text' | 'choice' | 'nps';
  text: string;
  options?: string[];
  required?: boolean;
}

interface SurveyTemplate {
  id: string;
  name: string;
  description?: string;
  trigger_type: string;
  trigger_delay_hours: number;
  questions: Question[];
  thank_you_message: string;
  is_active: boolean;
  created_at: string;
}

interface Analytics {
  totalResponses: number;
  completedResponses: number;
  completionRate: string;
  averageRating: string;
  nps: number;
  sentimentCounts: {
    positive: number;
    neutral: number;
    negative: number;
  };
}

const QUESTION_TYPES = [
  { value: 'rating', label: 'تقييم بالنجوم (1-5)', icon: '⭐' },
  { value: 'nps', label: 'NPS (0-10)', icon: '📊' },
  { value: 'choice', label: 'اختيار من متعدد', icon: '☑️' },
  { value: 'text', label: 'نص حر', icon: '✍️' },
];

const TRIGGER_TYPES = [
  { value: 'manual', label: 'يدوي' },
  { value: 'after_order', label: 'بعد الطلب' },
  { value: 'after_invoice_paid', label: 'بعد دفع الفاتورة' },
  { value: 'after_conversation', label: 'بعد المحادثة' },
];

export default function SurveysPage() {
  const { session, organizationId } = useSupabase();
  const [activeTab, setActiveTab] = useState<'templates' | 'responses' | 'analytics'>('templates');
  const [templates, setTemplates] = useState<SurveyTemplate[]>([]);
  const [analytics, setAnalytics] = useState<Analytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SurveyTemplate | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    trigger_type: 'manual',
    trigger_delay_hours: 24,
    questions: [] as Question[],
    thank_you_message: 'شكراً لمشاركتك! رأيك يهمنا 🙏',
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (organizationId) {
      fetchTemplates();
      fetchAnalytics();
    }
  }, [organizationId]);

  const fetchTemplates = async () => {
    try {
      const res = await fetch(`${API_URL}/api/surveys/templates`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setTemplates(data.templates || []);
    } catch (error) {
      console.error('Error fetching templates:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAnalytics = async () => {
    try {
      const res = await fetch(`${API_URL}/api/surveys/analytics`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setAnalytics(data.analytics);
    } catch (error) {
      console.error('Error fetching analytics:', error);
    }
  };

  const saveTemplate = async () => {
    if (!formData.name || formData.questions.length === 0) return;

    try {
      const url = editingTemplate 
        ? `${API_URL}/api/surveys/templates/${editingTemplate.id}`
        : `${API_URL}/api/surveys/templates`;
      
      const res = await fetch(url, {
        method: editingTemplate ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.template) {
        if (editingTemplate) {
          setTemplates(templates.map(t => t.id === editingTemplate.id ? data.template : t));
        } else {
          setTemplates([data.template, ...templates]);
        }
        closeModal();
      }
    } catch (error) {
      console.error('Error saving template:', error);
    }
  };

  const deleteTemplate = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الاستبيان؟')) return;

    try {
      await fetch(`${API_URL}/api/surveys/templates/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      setTemplates(templates.filter(t => t.id !== id));
    } catch (error) {
      console.error('Error deleting template:', error);
    }
  };

  const openEditModal = (template: SurveyTemplate) => {
    setEditingTemplate(template);
    setFormData({
      name: template.name,
      description: template.description || '',
      trigger_type: template.trigger_type,
      trigger_delay_hours: template.trigger_delay_hours,
      questions: template.questions,
      thank_you_message: template.thank_you_message,
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingTemplate(null);
    setFormData({
      name: '',
      description: '',
      trigger_type: 'manual',
      trigger_delay_hours: 24,
      questions: [],
      thank_you_message: 'شكراً لمشاركتك! رأيك يهمنا 🙏',
    });
  };

  const addQuestion = () => {
    const newQuestion: Question = {
      id: `q${Date.now()}`,
      type: 'rating',
      text: '',
      required: true,
    };
    setFormData({ ...formData, questions: [...formData.questions, newQuestion] });
  };

  const updateQuestion = (index: number, updates: Partial<Question>) => {
    const newQuestions = [...formData.questions];
    newQuestions[index] = { ...newQuestions[index], ...updates };
    setFormData({ ...formData, questions: newQuestions });
  };

  const removeQuestion = (index: number) => {
    setFormData({ ...formData, questions: formData.questions.filter((_, i) => i !== index) });
  };

  const copyLink = (templateId: string) => {
    // This would normally generate a survey link for a customer
    const link = `${window.location.origin}/survey/preview/${templateId}`;
    navigator.clipboard.writeText(link);
    setCopiedId(templateId);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getSentimentIcon = (sentiment: string) => {
    switch (sentiment) {
      case 'positive': return <TrendingUp className="w-4 h-4 text-green-500" />;
      case 'negative': return <TrendingDown className="w-4 h-4 text-red-500" />;
      default: return <Minus className="w-4 h-4 text-yellow-500" />;
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Star className="w-7 h-7 text-yellow-500" />
              استطلاعات الرأي
            </h1>
            <p className="text-gray-500 mt-1">قياس رضا العملاء وتحسين الخدمة</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            استبيان جديد
          </button>
        </div>

        {/* Analytics Overview */}
        {analytics && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-6">
            <div className="bg-white rounded-xl shadow-sm p-4">
              <p className="text-gray-500 text-sm">إجمالي الردود</p>
              <p className="text-2xl font-bold text-gray-900">{analytics.totalResponses}</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <p className="text-gray-500 text-sm">متوسط التقييم</p>
              <p className="text-2xl font-bold text-yellow-500 flex items-center gap-1">
                {analytics.averageRating}
                <Star className="w-5 h-5 fill-yellow-400" />
              </p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <p className="text-gray-500 text-sm">نسبة الإكمال</p>
              <p className="text-2xl font-bold text-green-600">{analytics.completionRate}%</p>
            </div>
            <div className="bg-white rounded-xl shadow-sm p-4">
              <p className="text-gray-500 text-sm">NPS Score</p>
              <p className={`text-2xl font-bold ${analytics.nps >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {analytics.nps > 0 ? '+' : ''}{analytics.nps}
              </p>
            </div>
          </div>
        )}

        {/* Sentiment Overview */}
        {analytics && (
          <div className="bg-white rounded-xl shadow-sm p-4 mb-6">
            <h3 className="font-medium text-gray-900 mb-3">توزيع المشاعر</h3>
            <div className="flex gap-6">
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-green-500" />
                <span className="text-sm text-gray-600">إيجابي: {analytics.sentimentCounts.positive}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-yellow-500" />
                <span className="text-sm text-gray-600">محايد: {analytics.sentimentCounts.neutral}</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-3 h-3 rounded-full bg-red-500" />
                <span className="text-sm text-gray-600">سلبي: {analytics.sentimentCounts.negative}</span>
              </div>
            </div>
          </div>
        )}

        {/* Templates */}
        <div className="bg-white rounded-xl shadow-sm">
          <div className="p-4 border-b">
            <h2 className="font-bold text-gray-900">قوالب الاستبيانات</h2>
          </div>
          
          {loading ? (
            <div className="p-8 text-center text-gray-500">جاري التحميل...</div>
          ) : templates.length === 0 ? (
            <div className="p-12 text-center">
              <Star className="w-16 h-16 mx-auto text-gray-300 mb-4" />
              <h3 className="text-lg font-bold text-gray-900 mb-2">لا توجد استبيانات</h3>
              <p className="text-gray-500 mb-4">أنشئ استبيانك الأول لقياس رضا العملاء</p>
              <button
                onClick={() => setShowModal(true)}
                className="bg-yellow-500 hover:bg-yellow-600 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                إنشاء استبيان
              </button>
            </div>
          ) : (
            <div className="divide-y">
              {templates.map(template => (
                <div key={template.id} className="p-4 hover:bg-gray-50">
                  <div className="flex items-start justify-between">
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <h3 className="font-bold text-gray-900">{template.name}</h3>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                          template.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                        }`}>
                          {template.is_active ? 'نشط' : 'معطل'}
                        </span>
                      </div>
                      <p className="text-sm text-gray-500">{template.description}</p>
                      <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                        <span>{template.questions.length} سؤال</span>
                        <span>
                          {TRIGGER_TYPES.find(t => t.value === template.trigger_type)?.label}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => copyLink(template.id)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                        title="نسخ الرابط"
                      >
                        {copiedId === template.id ? (
                          <Check className="w-4 h-4 text-green-600" />
                        ) : (
                          <Copy className="w-4 h-4 text-gray-500" />
                        )}
                      </button>
                      <button
                        onClick={() => openEditModal(template)}
                        className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                      >
                        <Edit2 className="w-4 h-4 text-gray-500" />
                      </button>
                      <button
                        onClick={() => deleteTemplate(template.id)}
                        className="p-2 hover:bg-red-50 rounded-lg transition-colors"
                      >
                        <Trash2 className="w-4 h-4 text-red-500" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingTemplate ? 'تعديل الاستبيان' : 'استبيان جديد'}
            </h2>
            
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  اسم الاستبيان *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: تقييم الخدمة"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  الوصف
                </label>
                <input
                  type="text"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="وصف قصير يظهر للعميل..."
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500"
                />
              </div>

              {/* Trigger */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    وقت الإرسال
                  </label>
                  <select
                    value={formData.trigger_type}
                    onChange={(e) => setFormData({ ...formData, trigger_type: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500"
                  >
                    {TRIGGER_TYPES.map(type => (
                      <option key={type.value} value={type.value}>{type.label}</option>
                    ))}
                  </select>
                </div>
                {formData.trigger_type !== 'manual' && (
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      التأخير (بالساعات)
                    </label>
                    <input
                      type="number"
                      value={formData.trigger_delay_hours}
                      onChange={(e) => setFormData({ ...formData, trigger_delay_hours: parseInt(e.target.value) })}
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500"
                    />
                  </div>
                )}
              </div>

              {/* Questions */}
              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="text-sm font-medium text-gray-700">
                    الأسئلة *
                  </label>
                  <button
                    type="button"
                    onClick={addQuestion}
                    className="text-sm text-yellow-600 hover:text-yellow-700 flex items-center gap-1"
                  >
                    <Plus className="w-4 h-4" />
                    إضافة سؤال
                  </button>
                </div>
                
                <div className="space-y-3">
                  {formData.questions.map((question, index) => (
                    <div key={question.id} className="border rounded-lg p-3 bg-gray-50">
                      <div className="flex items-start gap-3">
                        <span className="text-sm text-gray-400 mt-2">{index + 1}.</span>
                        <div className="flex-1 space-y-2">
                          <input
                            type="text"
                            value={question.text}
                            onChange={(e) => updateQuestion(index, { text: e.target.value })}
                            placeholder="نص السؤال..."
                            className="w-full px-3 py-2 border rounded-lg text-sm"
                          />
                          <div className="flex gap-2">
                            <select
                              value={question.type}
                              onChange={(e) => updateQuestion(index, { type: e.target.value as any })}
                              className="px-3 py-1 border rounded-lg text-sm"
                            >
                              {QUESTION_TYPES.map(type => (
                                <option key={type.value} value={type.value}>
                                  {type.icon} {type.label}
                                </option>
                              ))}
                            </select>
                            <label className="flex items-center gap-1 text-sm">
                              <input
                                type="checkbox"
                                checked={question.required}
                                onChange={(e) => updateQuestion(index, { required: e.target.checked })}
                              />
                              مطلوب
                            </label>
                          </div>
                          {question.type === 'choice' && (
                            <input
                              type="text"
                              value={question.options?.join(', ') || ''}
                              onChange={(e) => updateQuestion(index, { options: e.target.value.split(',').map(s => s.trim()) })}
                              placeholder="الخيارات (مفصولة بفاصلة)"
                              className="w-full px-3 py-2 border rounded-lg text-sm"
                            />
                          )}
                        </div>
                        <button
                          type="button"
                          onClick={() => removeQuestion(index)}
                          className="p-1 hover:bg-red-100 rounded text-red-500"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  ))}
                  
                  {formData.questions.length === 0 && (
                    <div className="text-center py-6 text-gray-400 border border-dashed rounded-lg">
                      أضف سؤالاً واحداً على الأقل
                    </div>
                  )}
                </div>
              </div>

              {/* Thank You Message */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  رسالة الشكر
                </label>
                <textarea
                  value={formData.thank_you_message}
                  onChange={(e) => setFormData({ ...formData, thank_you_message: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-yellow-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveTemplate}
                disabled={!formData.name || formData.questions.length === 0}
                className="flex-1 bg-yellow-500 hover:bg-yellow-600 disabled:bg-gray-300 text-white py-2 rounded-lg font-medium transition-colors"
              >
                {editingTemplate ? 'حفظ التغييرات' : 'إنشاء الاستبيان'}
              </button>
              <button
                onClick={closeModal}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
