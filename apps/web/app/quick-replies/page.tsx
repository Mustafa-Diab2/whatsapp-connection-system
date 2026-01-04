'use client';

import { useState, useEffect } from 'react';
import { 
  MessageSquare, 
  Plus, 
  Edit2, 
  Trash2, 
  Search, 
  FolderOpen,
  Zap,
  Image as ImageIcon,
  Link2,
  Copy,
  Check,
  Tag,
  Hash
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase';

interface QuickReply {
  id: string;
  name: string;
  shortcut?: string;
  content: string;
  category_id?: string;
  media_type?: string;
  media_url?: string;
  buttons: any[];
  has_variables: boolean;
  usage_count: number;
  is_active: boolean;
  quick_reply_categories?: {
    id: string;
    name: string;
    icon: string;
  };
}

interface Category {
  id: string;
  name: string;
  icon: string;
  sort_order: number;
}

const VARIABLE_OPTIONS = [
  { key: '{customer_name}', label: 'اسم العميل', icon: '👤' },
  { key: '{customer_phone}', label: 'رقم الهاتف', icon: '📱' },
  { key: '{order_id}', label: 'رقم الطلب', icon: '📦' },
  { key: '{invoice_amount}', label: 'مبلغ الفاتورة', icon: '💰' },
  { key: '{product_name}', label: 'اسم المنتج', icon: '🏷️' },
];

const EMOJI_OPTIONS = ['💬', '🛒', '💰', '📦', '🎁', '❓', '✅', '🔔', '⭐', '🙏'];

export default function QuickRepliesPage() {
  const { session, organizationId } = useSupabase();
  const [quickReplies, setQuickReplies] = useState<QuickReply[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [showModal, setShowModal] = useState(false);
  const [showCategoryModal, setShowCategoryModal] = useState(false);
  const [editingReply, setEditingReply] = useState<QuickReply | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    shortcut: '',
    content: '',
    category_id: '',
    media_type: '',
    media_url: '',
    buttons: [] as any[],
  });

  const [categoryForm, setCategoryForm] = useState({
    name: '',
    icon: '💬',
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (organizationId) {
      fetchQuickReplies();
      fetchCategories();
    }
  }, [organizationId]);

  const fetchQuickReplies = async () => {
    try {
      const res = await fetch(`${API_URL}/api/quick-replies`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setQuickReplies(data.quickReplies || []);
    } catch (error) {
      console.error('Error fetching quick replies:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchCategories = async () => {
    try {
      const res = await fetch(`${API_URL}/api/quick-replies/categories`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setCategories(data.categories || []);
    } catch (error) {
      console.error('Error fetching categories:', error);
    }
  };

  const saveQuickReply = async () => {
    if (!formData.name || !formData.content) return;

    try {
      const url = editingReply 
        ? `${API_URL}/api/quick-replies/${editingReply.id}`
        : `${API_URL}/api/quick-replies`;
      
      const res = await fetch(url, {
        method: editingReply ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.quickReply) {
        if (editingReply) {
          setQuickReplies(quickReplies.map(qr => qr.id === editingReply.id ? data.quickReply : qr));
        } else {
          setQuickReplies([data.quickReply, ...quickReplies]);
        }
        closeModal();
      }
    } catch (error) {
      console.error('Error saving quick reply:', error);
    }
  };

  const deleteQuickReply = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الرد السريع؟')) return;

    try {
      await fetch(`${API_URL}/api/quick-replies/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      setQuickReplies(quickReplies.filter(qr => qr.id !== id));
    } catch (error) {
      console.error('Error deleting quick reply:', error);
    }
  };

  const saveCategory = async () => {
    if (!categoryForm.name) return;

    try {
      const res = await fetch(`${API_URL}/api/quick-replies/categories`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify(categoryForm),
      });

      const data = await res.json();
      if (data.category) {
        setCategories([...categories, data.category]);
        setShowCategoryModal(false);
        setCategoryForm({ name: '', icon: '💬' });
      }
    } catch (error) {
      console.error('Error saving category:', error);
    }
  };

  const deleteCategory = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا التصنيف؟')) return;

    try {
      await fetch(`${API_URL}/api/quick-replies/categories/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      setCategories(categories.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting category:', error);
    }
  };

  const openEditModal = (reply: QuickReply) => {
    setEditingReply(reply);
    setFormData({
      name: reply.name,
      shortcut: reply.shortcut || '',
      content: reply.content,
      category_id: reply.category_id || '',
      media_type: reply.media_type || '',
      media_url: reply.media_url || '',
      buttons: reply.buttons || [],
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingReply(null);
    setFormData({
      name: '',
      shortcut: '',
      content: '',
      category_id: '',
      media_type: '',
      media_url: '',
      buttons: [],
    });
  };

  const insertVariable = (variable: string) => {
    setFormData(prev => ({
      ...prev,
      content: prev.content + variable,
    }));
  };

  const copyContent = (content: string, id: string) => {
    navigator.clipboard.writeText(content);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const filteredReplies = quickReplies.filter(reply => {
    const matchesSearch = reply.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         reply.content.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         reply.shortcut?.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCategory = selectedCategory === 'all' || reply.category_id === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <MessageSquare className="w-7 h-7 text-indigo-600" />
              الردود السريعة
            </h1>
            <p className="text-gray-500 mt-1">قوالب رسائل جاهزة للاستخدام السريع</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setShowCategoryModal(true)}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <FolderOpen className="w-5 h-5" />
              تصنيف جديد
            </button>
            <button
              onClick={() => setShowModal(true)}
              className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              رد سريع جديد
            </button>
          </div>
        </div>

        {/* Search & Filter */}
        <div className="flex gap-4 mb-6">
          <div className="flex-1 relative">
            <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
            <input
              type="text"
              placeholder="ابحث في الردود السريعة..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
            />
          </div>
          <select
            value={selectedCategory}
            onChange={(e) => setSelectedCategory(e.target.value)}
            className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
          >
            <option value="all">كل التصنيفات</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
            ))}
          </select>
        </div>

        {/* Categories Bar */}
        {categories.length > 0 && (
          <div className="flex gap-2 mb-6 overflow-x-auto pb-2">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${
                selectedCategory === 'all'
                  ? 'bg-indigo-600 text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-100 border'
              }`}
            >
              الكل ({quickReplies.length})
            </button>
            {categories.map(cat => {
              const count = quickReplies.filter(qr => qr.category_id === cat.id).length;
              return (
                <button
                  key={cat.id}
                  onClick={() => setSelectedCategory(cat.id)}
                  className={`px-4 py-2 rounded-full text-sm font-medium whitespace-nowrap transition-colors flex items-center gap-2 ${
                    selectedCategory === cat.id
                      ? 'bg-indigo-600 text-white'
                      : 'bg-white text-gray-700 hover:bg-gray-100 border'
                  }`}
                >
                  <span>{cat.icon}</span>
                  {cat.name} ({count})
                </button>
              );
            })}
          </div>
        )}

        {/* Quick Replies Grid */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">جاري التحميل...</div>
        ) : filteredReplies.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <MessageSquare className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">لا توجد ردود سريعة</h2>
            <p className="text-gray-500 mb-4">أنشئ ردود سريعة لتوفير الوقت في الرد على العملاء</p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              إنشاء رد سريع
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredReplies.map(reply => (
              <div key={reply.id} className="bg-white rounded-xl shadow-sm p-4 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    {reply.quick_reply_categories && (
                      <span className="text-lg">{reply.quick_reply_categories.icon}</span>
                    )}
                    <div>
                      <h3 className="font-bold text-gray-900">{reply.name}</h3>
                      {reply.shortcut && (
                        <span className="text-xs text-indigo-600 font-mono bg-indigo-50 px-2 py-0.5 rounded">
                          {reply.shortcut}
                        </span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className="text-xs text-gray-400">{reply.usage_count}×</span>
                  </div>
                </div>

                <div className="bg-gray-50 rounded-lg p-3 mb-3 max-h-32 overflow-y-auto">
                  <p className="text-sm text-gray-700 whitespace-pre-wrap">{reply.content}</p>
                </div>

                {reply.has_variables && (
                  <div className="flex items-center gap-1 mb-3 text-xs text-amber-600">
                    <Zap className="w-3 h-3" />
                    يحتوي متغيرات ديناميكية
                  </div>
                )}

                {reply.media_url && (
                  <div className="flex items-center gap-1 mb-3 text-xs text-blue-600">
                    <ImageIcon className="w-3 h-3" />
                    يحتوي وسائط
                  </div>
                )}

                <div className="flex items-center gap-2 pt-3 border-t">
                  <button
                    onClick={() => copyContent(reply.content, reply.id)}
                    className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
                  >
                    {copiedId === reply.id ? (
                      <><Check className="w-4 h-4 text-green-600" /> تم النسخ</>
                    ) : (
                      <><Copy className="w-4 h-4" /> نسخ</>
                    )}
                  </button>
                  <button
                    onClick={() => openEditModal(reply)}
                    className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => deleteQuickReply(reply.id)}
                    className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Quick Reply Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingReply ? 'تعديل الرد السريع' : 'رد سريع جديد'}
            </h2>
            
            <div className="space-y-4">
              {/* Name & Shortcut */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    الاسم *
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="مثال: ترحيب بالعملاء"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                    <Hash className="w-4 h-4" />
                    الاختصار
                  </label>
                  <input
                    type="text"
                    value={formData.shortcut}
                    onChange={(e) => setFormData({ ...formData, shortcut: e.target.value })}
                    placeholder="مثال: /hello"
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500 font-mono"
                  />
                </div>
              </div>

              {/* Category */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  التصنيف
                </label>
                <select
                  value={formData.category_id}
                  onChange={(e) => setFormData({ ...formData, category_id: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">بدون تصنيف</option>
                  {categories.map(cat => (
                    <option key={cat.id} value={cat.id}>{cat.icon} {cat.name}</option>
                  ))}
                </select>
              </div>

              {/* Content */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  محتوى الرسالة *
                </label>
                <textarea
                  value={formData.content}
                  onChange={(e) => setFormData({ ...formData, content: e.target.value })}
                  placeholder="اكتب رسالتك هنا..."
                  rows={5}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
                
                {/* Variables */}
                <div className="mt-2">
                  <p className="text-xs text-gray-500 mb-2">أضف متغيرات ديناميكية:</p>
                  <div className="flex flex-wrap gap-2">
                    {VARIABLE_OPTIONS.map(v => (
                      <button
                        key={v.key}
                        type="button"
                        onClick={() => insertVariable(v.key)}
                        className="flex items-center gap-1 px-2 py-1 bg-amber-50 hover:bg-amber-100 text-amber-700 rounded text-xs font-mono transition-colors"
                      >
                        <span>{v.icon}</span>
                        {v.key}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Media */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-1">
                  <ImageIcon className="w-4 h-4" />
                  وسائط (اختياري)
                </label>
                <div className="flex gap-2">
                  <select
                    value={formData.media_type}
                    onChange={(e) => setFormData({ ...formData, media_type: e.target.value })}
                    className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                  >
                    <option value="">بدون وسائط</option>
                    <option value="image">صورة</option>
                    <option value="video">فيديو</option>
                    <option value="document">ملف</option>
                  </select>
                  {formData.media_type && (
                    <input
                      type="url"
                      value={formData.media_url}
                      onChange={(e) => setFormData({ ...formData, media_url: e.target.value })}
                      placeholder="رابط الوسائط..."
                      className="flex-1 px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                    />
                  )}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveQuickReply}
                disabled={!formData.name || !formData.content}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white py-2 rounded-lg font-medium transition-colors"
              >
                {editingReply ? 'حفظ التغييرات' : 'إنشاء الرد السريع'}
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

      {/* Create Category Modal */}
      {showCategoryModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">تصنيف جديد</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  اسم التصنيف *
                </label>
                <input
                  type="text"
                  value={categoryForm.name}
                  onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })}
                  placeholder="مثال: الترحيب"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-indigo-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  الأيقونة
                </label>
                <div className="flex gap-2 flex-wrap">
                  {EMOJI_OPTIONS.map(emoji => (
                    <button
                      key={emoji}
                      type="button"
                      onClick={() => setCategoryForm({ ...categoryForm, icon: emoji })}
                      className={`w-10 h-10 text-xl rounded-lg transition-all ${
                        categoryForm.icon === emoji 
                          ? 'bg-indigo-100 ring-2 ring-indigo-500' 
                          : 'bg-gray-100 hover:bg-gray-200'
                      }`}
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveCategory}
                disabled={!categoryForm.name}
                className="flex-1 bg-indigo-600 hover:bg-indigo-700 disabled:bg-gray-300 text-white py-2 rounded-lg font-medium transition-colors"
              >
                إنشاء التصنيف
              </button>
              <button
                onClick={() => setShowCategoryModal(false)}
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
