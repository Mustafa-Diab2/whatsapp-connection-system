'use client';

import { useState, useEffect } from 'react';
import { 
  ShoppingBag, 
  Plus, 
  ExternalLink, 
  Copy, 
  Check, 
  Edit2, 
  Trash2, 
  Eye,
  Share2,
  MessageCircle,
  Palette,
  Image as ImageIcon,
  Search
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase';

interface Product {
  id: string;
  name: string;
  price: number;
  images?: string[];
}

interface Catalog {
  id: string;
  name: string;
  description: string;
  short_code: string;
  share_url: string;
  theme_color: string;
  cover_image?: string;
  show_prices: boolean;
  show_stock: boolean;
  product_ids: string[];
  is_active: boolean;
  view_count: number;
  created_at: string;
}

export default function CatalogsPage() {
  const { session, organizationId } = useSupabase();
  const [catalogs, setCatalogs] = useState<Catalog[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<Catalog | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);

  const [formData, setFormData] = useState({
    name: '',
    description: '',
    theme_color: '#3B82F6',
    cover_image: '',
    show_prices: true,
    show_stock: false,
    product_ids: [] as string[],
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (organizationId) {
      fetchCatalogs();
      fetchProducts();
    }
  }, [organizationId]);

  const fetchCatalogs = async () => {
    try {
      const res = await fetch(`${API_URL}/api/catalogs`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setCatalogs(data.catalogs || []);
    } catch (error) {
      console.error('Error fetching catalogs:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchProducts = async () => {
    try {
      const res = await fetch(`${API_URL}/api/products`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setProducts(data.products || data || []);
    } catch (error) {
      console.error('Error fetching products:', error);
    }
  };

  const saveCatalog = async () => {
    if (!formData.name) return;

    try {
      const url = editingCatalog 
        ? `${API_URL}/api/catalogs/${editingCatalog.id}`
        : `${API_URL}/api/catalogs`;
      
      const res = await fetch(url, {
        method: editingCatalog ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify(formData),
      });

      const data = await res.json();
      if (data.catalog) {
        if (editingCatalog) {
          setCatalogs(catalogs.map(c => c.id === editingCatalog.id ? data.catalog : c));
        } else {
          setCatalogs([data.catalog, ...catalogs]);
        }
        closeModal();
      }
    } catch (error) {
      console.error('Error saving catalog:', error);
    }
  };

  const deleteCatalog = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا الكتالوج؟')) return;

    try {
      await fetch(`${API_URL}/api/catalogs/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      setCatalogs(catalogs.filter(c => c.id !== id));
    } catch (error) {
      console.error('Error deleting catalog:', error);
    }
  };

  const openEditModal = (catalog: Catalog) => {
    setEditingCatalog(catalog);
    setFormData({
      name: catalog.name,
      description: catalog.description || '',
      theme_color: catalog.theme_color,
      cover_image: catalog.cover_image || '',
      show_prices: catalog.show_prices,
      show_stock: catalog.show_stock,
      product_ids: catalog.product_ids || [],
    });
    setShowModal(true);
  };

  const closeModal = () => {
    setShowModal(false);
    setEditingCatalog(null);
    setFormData({
      name: '',
      description: '',
      theme_color: '#3B82F6',
      cover_image: '',
      show_prices: true,
      show_stock: false,
      product_ids: [],
    });
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const shareViaWhatsApp = (catalog: Catalog) => {
    const message = `🛍️ ${catalog.name}\n\nشاهد منتجاتنا:\n${catalog.share_url}`;
    window.open(`https://wa.me/?text=${encodeURIComponent(message)}`, '_blank');
  };

  const toggleProductSelection = (productId: string) => {
    setFormData(prev => ({
      ...prev,
      product_ids: prev.product_ids.includes(productId)
        ? prev.product_ids.filter(id => id !== productId)
        : [...prev.product_ids, productId],
    }));
  };

  const colorOptions = [
    '#3B82F6', // Blue
    '#10B981', // Green
    '#8B5CF6', // Purple
    '#F59E0B', // Amber
    '#EF4444', // Red
    '#EC4899', // Pink
    '#6366F1', // Indigo
    '#14B8A6', // Teal
  ];

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <ShoppingBag className="w-7 h-7 text-purple-600" />
              كتالوج المنتجات
            </h1>
            <p className="text-gray-500 mt-1">إنشاء كتالوجات للمشاركة عبر واتساب</p>
          </div>
          <button
            onClick={() => setShowModal(true)}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            كتالوج جديد
          </button>
        </div>

        {/* Catalogs Grid */}
        {loading ? (
          <div className="text-center py-12 text-gray-500">جاري التحميل...</div>
        ) : catalogs.length === 0 ? (
          <div className="bg-white rounded-xl shadow-sm p-12 text-center">
            <ShoppingBag className="w-16 h-16 mx-auto text-gray-300 mb-4" />
            <h2 className="text-xl font-bold text-gray-900 mb-2">لا توجد كتالوجات</h2>
            <p className="text-gray-500 mb-4">أنشئ كتالوج لمشاركة منتجاتك مع العملاء</p>
            <button
              onClick={() => setShowModal(true)}
              className="bg-purple-600 hover:bg-purple-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
            >
              إنشاء كتالوج
            </button>
          </div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {catalogs.map(catalog => (
              <div key={catalog.id} className="bg-white rounded-xl shadow-sm overflow-hidden">
                {/* Cover */}
                <div 
                  className="h-32 flex items-center justify-center"
                  style={{ backgroundColor: catalog.cover_image ? undefined : catalog.theme_color }}
                >
                  {catalog.cover_image ? (
                    <img src={catalog.cover_image} alt={catalog.name} className="w-full h-full object-cover" />
                  ) : (
                    <ShoppingBag className="w-12 h-12 text-white/80" />
                  )}
                </div>

                <div className="p-4">
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <h3 className="font-bold text-gray-900">{catalog.name}</h3>
                      <p className="text-sm text-gray-500 line-clamp-2">{catalog.description}</p>
                    </div>
                    <span 
                      className={`px-2 py-1 rounded-full text-xs font-medium ${
                        catalog.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
                      }`}
                    >
                      {catalog.is_active ? 'نشط' : 'معطل'}
                    </span>
                  </div>

                  <div className="flex items-center gap-4 text-sm text-gray-500 mb-4">
                    <span className="flex items-center gap-1">
                      <Eye className="w-4 h-4" />
                      {catalog.view_count || 0} مشاهدة
                    </span>
                    <span className="flex items-center gap-1">
                      <ShoppingBag className="w-4 h-4" />
                      {catalog.product_ids?.length || 'كل'} منتج
                    </span>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-2 border-t pt-3">
                    <button
                      onClick={() => copyToClipboard(catalog.share_url, catalog.id)}
                      className="flex-1 flex items-center justify-center gap-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm transition-colors"
                    >
                      {copiedId === catalog.id ? (
                        <><Check className="w-4 h-4 text-green-600" /> تم النسخ</>
                      ) : (
                        <><Copy className="w-4 h-4" /> نسخ الرابط</>
                      )}
                    </button>
                    <button
                      onClick={() => shareViaWhatsApp(catalog)}
                      className="p-2 bg-green-100 hover:bg-green-200 text-green-600 rounded-lg transition-colors"
                    >
                      <MessageCircle className="w-5 h-5" />
                    </button>
                    <a
                      href={catalog.share_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-2 bg-blue-100 hover:bg-blue-200 text-blue-600 rounded-lg transition-colors"
                    >
                      <ExternalLink className="w-5 h-5" />
                    </a>
                    <button
                      onClick={() => openEditModal(catalog)}
                      className="p-2 bg-gray-100 hover:bg-gray-200 text-gray-600 rounded-lg transition-colors"
                    >
                      <Edit2 className="w-5 h-5" />
                    </button>
                    <button
                      onClick={() => deleteCatalog(catalog.id)}
                      className="p-2 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg transition-colors"
                    >
                      <Trash2 className="w-5 h-5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Create/Edit Modal */}
      {showModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingCatalog ? 'تعديل الكتالوج' : 'كتالوج جديد'}
            </h2>
            
            <div className="space-y-4">
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  اسم الكتالوج *
                </label>
                <input
                  type="text"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="مثال: عروض الصيف"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Description */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  الوصف
                </label>
                <textarea
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="وصف قصير للكتالوج..."
                  rows={2}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Theme Color */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <Palette className="w-4 h-4" />
                  لون الكتالوج
                </label>
                <div className="flex gap-2 flex-wrap">
                  {colorOptions.map(color => (
                    <button
                      key={color}
                      onClick={() => setFormData({ ...formData, theme_color: color })}
                      className={`w-8 h-8 rounded-full transition-transform ${
                        formData.theme_color === color ? 'ring-2 ring-offset-2 ring-gray-400 scale-110' : ''
                      }`}
                      style={{ backgroundColor: color }}
                    />
                  ))}
                  <input
                    type="color"
                    value={formData.theme_color}
                    onChange={(e) => setFormData({ ...formData, theme_color: e.target.value })}
                    className="w-8 h-8 rounded-full cursor-pointer"
                  />
                </div>
              </div>

              {/* Cover Image */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2 flex items-center gap-2">
                  <ImageIcon className="w-4 h-4" />
                  صورة الغلاف (رابط)
                </label>
                <input
                  type="url"
                  value={formData.cover_image}
                  onChange={(e) => setFormData({ ...formData, cover_image: e.target.value })}
                  placeholder="https://..."
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              </div>

              {/* Settings */}
              <div className="flex gap-6">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.show_prices}
                    onChange={(e) => setFormData({ ...formData, show_prices: e.target.checked })}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <span className="text-sm text-gray-700">عرض الأسعار</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.show_stock}
                    onChange={(e) => setFormData({ ...formData, show_stock: e.target.checked })}
                    className="w-4 h-4 text-purple-600 rounded"
                  />
                  <span className="text-sm text-gray-700">عرض المخزون</span>
                </label>
              </div>

              {/* Product Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  المنتجات (اتركها فارغة لتضمين كل المنتجات)
                </label>
                <div className="border rounded-lg max-h-48 overflow-y-auto p-2 space-y-1">
                  {products.length === 0 ? (
                    <p className="text-center text-gray-500 py-4">لا توجد منتجات</p>
                  ) : (
                    products.map(product => (
                      <label
                        key={product.id}
                        className={`flex items-center gap-3 p-2 rounded-lg cursor-pointer transition-colors ${
                          formData.product_ids.includes(product.id) 
                            ? 'bg-purple-50 border border-purple-200' 
                            : 'hover:bg-gray-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={formData.product_ids.includes(product.id)}
                          onChange={() => toggleProductSelection(product.id)}
                          className="w-4 h-4 text-purple-600 rounded"
                        />
                        <div className="w-10 h-10 bg-gray-100 rounded-lg flex-shrink-0 overflow-hidden">
                          {product.images?.[0] ? (
                            <img src={product.images[0]} alt="" className="w-full h-full object-cover" />
                          ) : (
                            <div className="w-full h-full flex items-center justify-center">
                              <ShoppingBag className="w-4 h-4 text-gray-300" />
                            </div>
                          )}
                        </div>
                        <div className="flex-1">
                          <p className="font-medium text-sm">{product.name}</p>
                          <p className="text-xs text-gray-500">{product.price?.toFixed(2)} ج.م</p>
                        </div>
                      </label>
                    ))
                  )}
                </div>
                {formData.product_ids.length > 0 && (
                  <p className="text-sm text-purple-600 mt-1">
                    تم اختيار {formData.product_ids.length} منتج
                  </p>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveCatalog}
                disabled={!formData.name}
                className="flex-1 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-300 text-white py-2 rounded-lg font-medium transition-colors"
              >
                {editingCatalog ? 'حفظ التغييرات' : 'إنشاء الكتالوج'}
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
