'use client';

import { useState, useEffect } from 'react';
import {
  Sparkles,
  TrendingUp,
  ShoppingCart,
  Users,
  Package,
  MessageSquare,
  RefreshCw,
  Lightbulb,
  Target,
  Brain,
  Send,
  ChevronDown,
  Zap,
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase';

interface Insight {
  metrics: {
    total_revenue: number;
    avg_order_value: number;
    total_orders: number;
    total_customers: number;
  };
  top_products: Array<{
    id: string;
    name: string;
    quantity: number;
    revenue: number;
  }>;
  customer_segments: {
    new: number;
    active: number;
    dormant: number;
  };
}

interface Recommendation {
  product_id: string;
  product_name: string;
  reason: string;
  confidence: number;
  sales_pitch: string;
}

export default function AIAssistantPage() {
  const { session, organizationId } = useSupabase();
  const [activeTab, setActiveTab] = useState<'insights' | 'recommend' | 'generate'>('insights');
  const [insights, setInsights] = useState<Insight | null>(null);
  const [loading, setLoading] = useState(true);
  const [customers, setCustomers] = useState<Array<{ id: string; name: string; phone: string }>>([]);
  const [selectedCustomer, setSelectedCustomer] = useState<string>('');
  const [recommendations, setRecommendations] = useState<any>(null);
  const [loadingRecommendations, setLoadingRecommendations] = useState(false);
  const [context, setContext] = useState('');

  // Product generation
  const [productName, setProductName] = useState('');
  const [productCategory, setProductCategory] = useState('');
  const [productFeatures, setProductFeatures] = useState('');
  const [generatedDescription, setGeneratedDescription] = useState<any>(null);
  const [generatingDescription, setGeneratingDescription] = useState(false);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (organizationId) {
      fetchInsights();
      fetchCustomers();
    }
  }, [organizationId]);

  const fetchInsights = async () => {
    try {
      const res = await fetch(`${API_URL}/api/ai-sales/insights`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setInsights(data);
    } catch (error) {
      console.error('Error fetching insights:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCustomers = async () => {
    try {
      const res = await fetch(`${API_URL}/api/customers?limit=100`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setCustomers(data.customers || []);
    } catch (error) {
      console.error('Error fetching customers:', error);
    }
  };

  const getRecommendations = async () => {
    if (!selectedCustomer && !context) {
      alert('اختر عميل أو أدخل سياق للتوصيات');
      return;
    }

    setLoadingRecommendations(true);
    try {
      const res = await fetch(`${API_URL}/api/ai-sales/recommend`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify({
          customer_id: selectedCustomer || null,
          context: context || null,
          max_products: 5,
        }),
      });
      const data = await res.json();
      setRecommendations(data);
    } catch (error) {
      console.error('Error getting recommendations:', error);
    } finally {
      setLoadingRecommendations(false);
    }
  };

  const generateDescription = async () => {
    if (!productName) {
      alert('أدخل اسم المنتج');
      return;
    }

    setGeneratingDescription(true);
    try {
      const res = await fetch(`${API_URL}/api/ai-sales/generate-description`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify({
          product_name: productName,
          category: productCategory,
          features: productFeatures.split('\n').filter(Boolean),
          tone: 'professional',
        }),
      });
      const data = await res.json();
      setGeneratedDescription(data);
    } catch (error) {
      console.error('Error generating description:', error);
    } finally {
      setGeneratingDescription(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    alert('تم النسخ!');
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">جاري تحميل المساعد الذكي...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Sparkles className="w-7 h-7 text-purple-600" />
              مساعد المبيعات الذكي
            </h1>
            <p className="text-gray-500 mt-1">تحليلات وتوصيات مدعومة بالذكاء الاصطناعي</p>
          </div>
        </div>

        {/* Tabs */}
        <div className="flex gap-2 mb-6">
          <button
            onClick={() => setActiveTab('insights')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'insights'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <TrendingUp className="w-4 h-4" />
            رؤى المبيعات
          </button>
          <button
            onClick={() => setActiveTab('recommend')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'recommend'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Target className="w-4 h-4" />
            توصيات المنتجات
          </button>
          <button
            onClick={() => setActiveTab('generate')}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              activeTab === 'generate'
                ? 'bg-purple-600 text-white'
                : 'bg-white text-gray-700 hover:bg-gray-50'
            }`}
          >
            <Brain className="w-4 h-4" />
            توليد المحتوى
          </button>
        </div>

        {/* Insights Tab */}
        {activeTab === 'insights' && insights && (
          <div className="space-y-6">
            {/* Metrics Cards */}
            <div className="grid md:grid-cols-4 gap-4">
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">إجمالي المبيعات</span>
                  <TrendingUp className="w-5 h-5 text-green-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {insights.metrics.total_revenue.toLocaleString()} ج.م
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">متوسط الطلب</span>
                  <ShoppingCart className="w-5 h-5 text-blue-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {insights.metrics.avg_order_value.toLocaleString()} ج.م
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">عدد الطلبات</span>
                  <Package className="w-5 h-5 text-orange-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {insights.metrics.total_orders}
                </p>
              </div>
              <div className="bg-white rounded-xl shadow-sm p-5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-gray-500 text-sm">إجمالي العملاء</span>
                  <Users className="w-5 h-5 text-purple-500" />
                </div>
                <p className="text-2xl font-bold text-gray-900">
                  {insights.metrics.total_customers}
                </p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              {/* Top Products */}
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Package className="w-5 h-5 text-purple-600" />
                  أفضل المنتجات مبيعاً
                </h3>
                <div className="space-y-3">
                  {insights.top_products.map((product, index) => (
                    <div key={product.id} className="flex items-center gap-3">
                      <span className="w-6 h-6 bg-purple-100 text-purple-700 rounded-full flex items-center justify-center text-sm font-bold">
                        {index + 1}
                      </span>
                      <div className="flex-1">
                        <p className="font-medium text-gray-900">{product.name}</p>
                        <p className="text-sm text-gray-500">{product.quantity} وحدة مباعة</p>
                      </div>
                      <span className="font-bold text-gray-900">
                        {product.revenue.toLocaleString()} ج.م
                      </span>
                    </div>
                  ))}
                  {insights.top_products.length === 0 && (
                    <p className="text-center text-gray-500 py-4">لا توجد بيانات كافية</p>
                  )}
                </div>
              </div>

              {/* Customer Segments */}
              <div className="bg-white rounded-xl shadow-sm p-5">
                <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />
                  شرائح العملاء
                </h3>
                <div className="space-y-4">
                  <div className="flex items-center justify-between p-3 bg-green-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-green-500 rounded-full" />
                      <span className="font-medium">عملاء جدد (آخر 7 أيام)</span>
                    </div>
                    <span className="font-bold text-green-700">{insights.customer_segments.new}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-blue-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-blue-500 rounded-full" />
                      <span className="font-medium">عملاء نشطون</span>
                    </div>
                    <span className="font-bold text-blue-700">{insights.customer_segments.active}</span>
                  </div>
                  <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 bg-gray-400 rounded-full" />
                      <span className="font-medium">عملاء غير نشطين</span>
                    </div>
                    <span className="font-bold text-gray-700">{insights.customer_segments.dormant}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Recommendations Tab */}
        {activeTab === 'recommend' && (
          <div className="space-y-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4">احصل على توصيات ذكية</h3>
              
              <div className="grid md:grid-cols-2 gap-4 mb-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">اختر عميل</label>
                  <select
                    value={selectedCustomer}
                    onChange={(e) => setSelectedCustomer(e.target.value)}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                  >
                    <option value="">بدون عميل محدد</option>
                    {customers.map(c => (
                      <option key={c.id} value={c.id}>{c.name} - {c.phone}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">السياق (اختياري)</label>
                  <input
                    type="text"
                    value={context}
                    onChange={(e) => setContext(e.target.value)}
                    placeholder="مثال: يبحث عن هدية، منتج للأطفال..."
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>
              </div>

              <button
                onClick={getRecommendations}
                disabled={loadingRecommendations}
                className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                {loadingRecommendations ? (
                  <RefreshCw className="w-4 h-4 animate-spin" />
                ) : (
                  <Zap className="w-4 h-4" />
                )}
                {loadingRecommendations ? 'جاري التحليل...' : 'احصل على التوصيات'}
              </button>
            </div>

            {recommendations && (
              <div className="space-y-4">
                {/* Customer Insights */}
                {recommendations.insights && (
                  <div className="bg-gradient-to-r from-purple-500 to-indigo-600 rounded-xl p-6 text-white">
                    <h4 className="font-bold mb-3 flex items-center gap-2">
                      <Lightbulb className="w-5 h-5" />
                      رؤى العميل
                    </h4>
                    <div className="grid md:grid-cols-3 gap-4">
                      <div>
                        <p className="text-purple-200 text-sm">نوع العميل</p>
                        <p className="font-medium">{recommendations.insights.customer_type}</p>
                      </div>
                      <div>
                        <p className="text-purple-200 text-sm">نمط الشراء</p>
                        <p className="font-medium">{recommendations.insights.buying_pattern}</p>
                      </div>
                      <div>
                        <p className="text-purple-200 text-sm">طريقة البيع المقترحة</p>
                        <p className="font-medium">{recommendations.insights.recommended_approach}</p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Recommendations */}
                <div className="bg-white rounded-xl shadow-sm p-6">
                  <h4 className="font-bold text-gray-900 mb-4">المنتجات الموصى بها</h4>
                  <div className="space-y-4">
                    {recommendations.recommendations?.map((rec: Recommendation, i: number) => (
                      <div key={i} className="border rounded-lg p-4">
                        <div className="flex items-start justify-between mb-2">
                          <h5 className="font-bold text-gray-900">{rec.product_name}</h5>
                          <span className="px-2 py-1 bg-green-100 text-green-700 text-sm rounded-full">
                            {Math.round(rec.confidence * 100)}% توافق
                          </span>
                        </div>
                        <p className="text-gray-600 text-sm mb-2">{rec.reason}</p>
                        <div className="bg-purple-50 rounded-lg p-3">
                          <p className="text-sm text-purple-700">
                            <strong>نص مبيعات مقترح:</strong> {rec.sales_pitch}
                          </p>
                        </div>
                        <button
                          onClick={() => copyToClipboard(rec.sales_pitch)}
                          className="mt-2 text-sm text-purple-600 hover:underline"
                        >
                          نسخ نص المبيعات
                        </button>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Cross-sell */}
                {recommendations.cross_sell?.length > 0 && (
                  <div className="bg-white rounded-xl shadow-sm p-6">
                    <h4 className="font-bold text-gray-900 mb-4">منتجات تكميلية (Cross-sell)</h4>
                    <div className="grid md:grid-cols-2 gap-4">
                      {recommendations.cross_sell.map((item: any, i: number) => (
                        <div key={i} className="border rounded-lg p-4">
                          <h5 className="font-medium text-gray-900">{item.product_name}</h5>
                          <p className="text-sm text-gray-600">{item.reason}</p>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Generate Content Tab */}
        {activeTab === 'generate' && (
          <div className="grid md:grid-cols-2 gap-6">
            <div className="bg-white rounded-xl shadow-sm p-6">
              <h3 className="font-bold text-gray-900 mb-4 flex items-center gap-2">
                <Brain className="w-5 h-5 text-purple-600" />
                توليد وصف المنتج
              </h3>

              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">اسم المنتج *</label>
                  <input
                    type="text"
                    value={productName}
                    onChange={(e) => setProductName(e.target.value)}
                    placeholder="مثال: سماعة بلوتوث لاسلكية"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">الفئة</label>
                  <input
                    type="text"
                    value={productCategory}
                    onChange={(e) => setProductCategory(e.target.value)}
                    placeholder="مثال: إلكترونيات"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">المميزات (سطر لكل ميزة)</label>
                  <textarea
                    value={productFeatures}
                    onChange={(e) => setProductFeatures(e.target.value)}
                    placeholder="بطارية تدوم 20 ساعة&#10;عزل ضوضاء&#10;مقاومة للماء"
                    rows={4}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                  />
                </div>

                <button
                  onClick={generateDescription}
                  disabled={generatingDescription || !productName}
                  className="w-full flex items-center justify-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white py-3 rounded-lg font-medium transition-colors"
                >
                  {generatingDescription ? (
                    <RefreshCw className="w-5 h-5 animate-spin" />
                  ) : (
                    <Sparkles className="w-5 h-5" />
                  )}
                  {generatingDescription ? 'جاري التوليد...' : 'توليد الوصف'}
                </button>
              </div>
            </div>

            {generatedDescription && (
              <div className="bg-white rounded-xl shadow-sm p-6 space-y-4">
                <h3 className="font-bold text-gray-900">الوصف المُولّد</h3>

                <div>
                  <label className="text-sm text-gray-500">وصف قصير</label>
                  <p className="bg-gray-50 p-3 rounded-lg">{generatedDescription.short_description}</p>
                  <button
                    onClick={() => copyToClipboard(generatedDescription.short_description)}
                    className="text-sm text-purple-600 hover:underline"
                  >
                    نسخ
                  </button>
                </div>

                <div>
                  <label className="text-sm text-gray-500">الوصف الكامل</label>
                  <p className="bg-gray-50 p-3 rounded-lg whitespace-pre-wrap">{generatedDescription.full_description}</p>
                  <button
                    onClick={() => copyToClipboard(generatedDescription.full_description)}
                    className="text-sm text-purple-600 hover:underline"
                  >
                    نسخ
                  </button>
                </div>

                <div>
                  <label className="text-sm text-gray-500">النقاط الرئيسية</label>
                  <ul className="bg-gray-50 p-3 rounded-lg space-y-1">
                    {generatedDescription.bullet_points?.map((point: string, i: number) => (
                      <li key={i}>• {point}</li>
                    ))}
                  </ul>
                </div>

                <div>
                  <label className="text-sm text-gray-500">الهاشتاقات</label>
                  <div className="flex flex-wrap gap-2">
                    {generatedDescription.hashtags?.map((tag: string, i: number) => (
                      <span key={i} className="px-2 py-1 bg-blue-100 text-blue-700 rounded-full text-sm">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
