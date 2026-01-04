'use client';

import { useState, useEffect, useCallback } from 'react';
import {
  Bot,
  Plus,
  Copy,
  Trash2,
  Power,
  PowerOff,
  Edit2,
  BarChart2,
  ChevronLeft,
  Search,
  Play,
  Pause,
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase';
import Link from 'next/link';

interface ChatbotFlow {
  id: string;
  name: string;
  description?: string;
  trigger_type: 'keyword' | 'first_message' | 'button_click';
  trigger_keywords: string[];
  is_active: boolean;
  nodes: any[];
  edges: any[];
  created_at: string;
  updated_at: string;
}

export default function ChatbotListPage() {
  const { session, organizationId } = useSupabase();
  const [flows, setFlows] = useState<ChatbotFlow[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newFlow, setNewFlow] = useState({
    name: '',
    description: '',
    trigger_type: 'keyword' as const,
    trigger_keywords: [] as string[],
  });
  const [keywordInput, setKeywordInput] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (organizationId) {
      fetchFlows();
    }
  }, [organizationId]);

  const fetchFlows = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chatbot/flows`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setFlows(data.flows || []);
    } catch (error) {
      console.error('Error fetching flows:', error);
    } finally {
      setLoading(false);
    }
  };

  const createFlow = async () => {
    if (!newFlow.name) return;

    try {
      const res = await fetch(`${API_URL}/api/chatbot/flows`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify(newFlow),
      });
      const data = await res.json();
      if (data.flow) {
        setFlows([data.flow, ...flows]);
        setShowCreateModal(false);
        setNewFlow({ name: '', description: '', trigger_type: 'keyword', trigger_keywords: [] });
      }
    } catch (error) {
      console.error('Error creating flow:', error);
    }
  };

  const duplicateFlow = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/chatbot/flows/${id}/duplicate`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      if (data.flow) {
        setFlows([data.flow, ...flows]);
      }
    } catch (error) {
      console.error('Error duplicating flow:', error);
    }
  };

  const toggleFlow = async (id: string) => {
    try {
      const res = await fetch(`${API_URL}/api/chatbot/flows/${id}/toggle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      if (data.flow) {
        setFlows(flows.map(f => f.id === id ? data.flow : f));
      }
    } catch (error) {
      console.error('Error toggling flow:', error);
    }
  };

  const deleteFlow = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا البوت؟')) return;

    try {
      await fetch(`${API_URL}/api/chatbot/flows/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      setFlows(flows.filter(f => f.id !== id));
    } catch (error) {
      console.error('Error deleting flow:', error);
    }
  };

  const addKeyword = () => {
    if (keywordInput.trim() && !newFlow.trigger_keywords.includes(keywordInput.trim())) {
      setNewFlow({
        ...newFlow,
        trigger_keywords: [...newFlow.trigger_keywords, keywordInput.trim()],
      });
      setKeywordInput('');
    }
  };

  const removeKeyword = (keyword: string) => {
    setNewFlow({
      ...newFlow,
      trigger_keywords: newFlow.trigger_keywords.filter(k => k !== keyword),
    });
  };

  const filteredFlows = flows.filter(f =>
    f.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    f.description?.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const TRIGGER_LABELS = {
    keyword: 'كلمات مفتاحية',
    first_message: 'أول رسالة',
    button_click: 'ضغط زر',
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Bot className="w-7 h-7 text-purple-600" />
              منشئ البوتات المرئي
            </h1>
            <p className="text-gray-500 mt-1">أنشئ بوتات ذكية بالسحب والإفلات</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-5 py-2.5 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            بوت جديد
          </button>
        </div>

        {/* Search */}
        <div className="mb-6">
          <div className="relative">
            <Search className="absolute right-3 top-1/2 transform -translate-y-1/2 text-gray-400 w-5 h-5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="البحث في البوتات..."
              className="w-full md:w-80 pr-10 pl-4 py-2.5 border rounded-lg focus:ring-2 focus:ring-purple-500"
            />
          </div>
        </div>

        {/* Flows Grid */}
        {filteredFlows.length === 0 ? (
          <div className="bg-white rounded-2xl shadow-sm p-12 text-center">
            <Bot className="w-20 h-20 mx-auto text-gray-200 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">لا توجد بوتات</h2>
            <p className="text-gray-500 mb-6">أنشئ أول بوت لك باستخدام المحرر المرئي</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              إنشاء بوت جديد
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredFlows.map(flow => (
              <div key={flow.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Status Bar */}
                <div className={`h-1 ${flow.is_active ? 'bg-green-500' : 'bg-gray-200'}`} />
                
                <div className="p-5">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900 mb-1">{flow.name}</h3>
                      <p className="text-sm text-gray-500 line-clamp-2">
                        {flow.description || 'لا يوجد وصف'}
                      </p>
                    </div>
                    <div className={`p-1.5 rounded-full ${flow.is_active ? 'bg-green-100' : 'bg-gray-100'}`}>
                      {flow.is_active ? (
                        <Play className="w-4 h-4 text-green-600" />
                      ) : (
                        <Pause className="w-4 h-4 text-gray-400" />
                      )}
                    </div>
                  </div>

                  {/* Info */}
                  <div className="flex flex-wrap gap-2 mb-4">
                    <span className="px-2 py-1 bg-purple-50 text-purple-700 text-xs font-medium rounded">
                      {TRIGGER_LABELS[flow.trigger_type]}
                    </span>
                    <span className="px-2 py-1 bg-gray-100 text-gray-600 text-xs rounded">
                      {flow.nodes?.length || 0} عقدة
                    </span>
                    {flow.trigger_keywords?.length > 0 && (
                      <span className="px-2 py-1 bg-blue-50 text-blue-600 text-xs rounded">
                        {flow.trigger_keywords.slice(0, 2).join('، ')}
                        {flow.trigger_keywords.length > 2 && ` +${flow.trigger_keywords.length - 2}`}
                      </span>
                    )}
                  </div>

                  {/* Actions */}
                  <div className="flex gap-2 pt-3 border-t">
                    <Link
                      href={`/chatbot/${flow.id}`}
                      className="flex-1 flex items-center justify-center gap-1 py-2 bg-purple-100 hover:bg-purple-200 text-purple-700 rounded-lg text-sm font-medium transition-colors"
                    >
                      <Edit2 className="w-4 h-4" />
                      تعديل
                    </Link>
                    <button
                      onClick={() => toggleFlow(flow.id)}
                      className={`p-2 rounded-lg transition-colors ${
                        flow.is_active 
                          ? 'bg-red-100 hover:bg-red-200 text-red-600' 
                          : 'bg-green-100 hover:bg-green-200 text-green-600'
                      }`}
                      title={flow.is_active ? 'إيقاف' : 'تفعيل'}
                    >
                      {flow.is_active ? <PowerOff className="w-4 h-4" /> : <Power className="w-4 h-4" />}
                    </button>
                    <button
                      onClick={() => duplicateFlow(flow.id)}
                      className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                      title="نسخ"
                    >
                      <Copy className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => deleteFlow(flow.id)}
                      className="p-2 bg-gray-100 hover:bg-red-100 text-gray-600 hover:text-red-600 rounded-lg transition-colors"
                      title="حذف"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">بوت جديد</h2>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">اسم البوت *</label>
                <input
                  type="text"
                  value={newFlow.name}
                  onChange={(e) => setNewFlow({ ...newFlow, name: e.target.value })}
                  placeholder="مثال: بوت الترحيب"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الوصف</label>
                <input
                  type="text"
                  value={newFlow.description}
                  onChange={(e) => setNewFlow({ ...newFlow, description: e.target.value })}
                  placeholder="وصف مختصر للبوت"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">متى يعمل البوت؟</label>
                <select
                  value={newFlow.trigger_type}
                  onChange={(e) => setNewFlow({ ...newFlow, trigger_type: e.target.value as any })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="keyword">عند كتابة كلمات معينة</option>
                  <option value="first_message">عند أول رسالة من العميل</option>
                  <option value="button_click">عند الضغط على زر</option>
                </select>
              </div>

              {newFlow.trigger_type === 'keyword' && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">الكلمات المفتاحية</label>
                  <div className="flex gap-2 mb-2">
                    <input
                      type="text"
                      value={keywordInput}
                      onChange={(e) => setKeywordInput(e.target.value)}
                      onKeyPress={(e) => e.key === 'Enter' && (e.preventDefault(), addKeyword())}
                      placeholder="اكتب كلمة ثم Enter"
                      className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                    />
                    <button
                      type="button"
                      onClick={addKeyword}
                      className="px-4 py-2 bg-purple-100 text-purple-700 rounded-lg font-medium"
                    >
                      إضافة
                    </button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {newFlow.trigger_keywords.map(kw => (
                      <span
                        key={kw}
                        className="px-3 py-1 bg-purple-100 text-purple-700 rounded-full text-sm flex items-center gap-1"
                      >
                        {kw}
                        <button
                          onClick={() => removeKeyword(kw)}
                          className="hover:text-purple-900"
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={createFlow}
                disabled={!newFlow.name}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white py-2 rounded-lg font-medium transition-colors"
              >
                إنشاء البوت
              </button>
              <button
                onClick={() => setShowCreateModal(false)}
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
