'use client';

import { useState, useEffect } from 'react';
import { 
  CreditCard, 
  Plus, 
  ExternalLink, 
  Copy, 
  Check, 
  Clock, 
  CheckCircle, 
  XCircle,
  Settings,
  Send,
  Search,
  Filter
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase';

interface PaymentLink {
  id: string;
  amount: number;
  currency: string;
  description: string;
  payment_url: string;
  short_code: string;
  status: 'pending' | 'paid' | 'expired' | 'cancelled';
  created_at: string;
  paid_at?: string;
  expires_at?: string;
  customers?: {
    name: string;
    phone: string;
  };
}

interface PaymentSettings {
  provider: string;
  stripe_publishable_key?: string;
  default_currency: string;
  auto_send_payment_link: boolean;
  payment_link_expiry_hours: number;
}

export default function PaymentsPage() {
  const { session, organizationId } = useSupabase();
  const [activeTab, setActiveTab] = useState<'links' | 'settings'>('links');
  const [paymentLinks, setPaymentLinks] = useState<PaymentLink[]>([]);
  const [settings, setSettings] = useState<PaymentSettings | null>(null);
  const [loading, setLoading] = useState(true);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');

  // Form state for creating payment link
  const [newLink, setNewLink] = useState({
    amount: '',
    description: '',
    expires_in_hours: 72,
  });

  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    provider: 'stripe',
    stripe_publishable_key: '',
    stripe_secret_key: '',
    stripe_webhook_secret: '',
    default_currency: 'EGP',
    auto_send_payment_link: false,
    payment_link_expiry_hours: 72,
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (organizationId) {
      fetchPaymentLinks();
      fetchSettings();
    }
  }, [organizationId]);

  const fetchPaymentLinks = async () => {
    try {
      const res = await fetch(`${API_URL}/api/payments/links`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setPaymentLinks(data.paymentLinks || []);
    } catch (error) {
      console.error('Error fetching payment links:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/payments/settings`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
        setSettingsForm(prev => ({
          ...prev,
          ...data.settings,
        }));
      }
    } catch (error) {
      console.error('Error fetching settings:', error);
    }
  };

  const createPaymentLink = async () => {
    if (!newLink.amount || !newLink.description) return;

    try {
      const res = await fetch(`${API_URL}/api/payments/create-link`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify({
          amount: parseFloat(newLink.amount),
          description: newLink.description,
          expires_in_hours: newLink.expires_in_hours,
        }),
      });

      const data = await res.json();
      if (data.paymentLink) {
        setPaymentLinks([data.paymentLink, ...paymentLinks]);
        setShowCreateModal(false);
        setNewLink({ amount: '', description: '', expires_in_hours: 72 });
      } else {
        alert(data.error || 'فشل في إنشاء رابط الدفع');
      }
    } catch (error) {
      console.error('Error creating payment link:', error);
      alert('فشل في إنشاء رابط الدفع');
    }
  };

  const saveSettings = async () => {
    try {
      const res = await fetch(`${API_URL}/api/payments/settings`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify(settingsForm),
      });

      const data = await res.json();
      if (data.settings) {
        setSettings(data.settings);
        alert('تم حفظ الإعدادات بنجاح');
      }
    } catch (error) {
      console.error('Error saving settings:', error);
      alert('فشل في حفظ الإعدادات');
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(null), 2000);
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'paid':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded-full text-xs font-medium">
            <CheckCircle className="w-3 h-3" />
            مدفوع
          </span>
        );
      case 'pending':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-yellow-100 text-yellow-700 rounded-full text-xs font-medium">
            <Clock className="w-3 h-3" />
            في الانتظار
          </span>
        );
      case 'expired':
        return (
          <span className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded-full text-xs font-medium">
            <XCircle className="w-3 h-3" />
            منتهي
          </span>
        );
      default:
        return null;
    }
  };

  const filteredLinks = paymentLinks.filter(link => {
    const matchesStatus = statusFilter === 'all' || link.status === statusFilter;
    const matchesSearch = link.description.toLowerCase().includes(searchQuery.toLowerCase()) ||
                         link.short_code.toLowerCase().includes(searchQuery.toLowerCase());
    return matchesStatus && matchesSearch;
  });

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <CreditCard className="w-7 h-7 text-blue-600" />
              المدفوعات
            </h1>
            <p className="text-gray-500 mt-1">إنشاء وإدارة روابط الدفع</p>
          </div>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Plus className="w-5 h-5" />
            رابط دفع جديد
          </button>
        </div>

        {/* Tabs */}
        <div className="flex gap-4 mb-6 border-b">
          <button
            onClick={() => setActiveTab('links')}
            className={`pb-3 px-1 font-medium transition-colors ${
              activeTab === 'links'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            روابط الدفع
          </button>
          <button
            onClick={() => setActiveTab('settings')}
            className={`pb-3 px-1 font-medium transition-colors flex items-center gap-2 ${
              activeTab === 'settings'
                ? 'text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            <Settings className="w-4 h-4" />
            الإعدادات
          </button>
        </div>

        {activeTab === 'links' && (
          <>
            {/* Filters */}
            <div className="flex gap-4 mb-6">
              <div className="flex-1 relative">
                <Search className="absolute right-3 top-1/2 -translate-y-1/2 w-5 h-5 text-gray-400" />
                <input
                  type="text"
                  placeholder="بحث..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pr-10 pl-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="all">كل الحالات</option>
                <option value="pending">في الانتظار</option>
                <option value="paid">مدفوع</option>
                <option value="expired">منتهي</option>
              </select>
            </div>

            {/* Payment Links Table */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              {loading ? (
                <div className="p-8 text-center text-gray-500">جاري التحميل...</div>
              ) : filteredLinks.length === 0 ? (
                <div className="p-8 text-center text-gray-500">
                  <CreditCard className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>لا توجد روابط دفع</p>
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="mt-3 text-blue-600 hover:underline"
                  >
                    إنشاء رابط دفع جديد
                  </button>
                </div>
              ) : (
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="text-right py-3 px-4 font-medium text-gray-700">الوصف</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-700">المبلغ</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-700">الحالة</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-700">التاريخ</th>
                      <th className="text-right py-3 px-4 font-medium text-gray-700">إجراءات</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredLinks.map((link) => (
                      <tr key={link.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-4">
                          <div>
                            <p className="font-medium text-gray-900">{link.description}</p>
                            <p className="text-xs text-gray-500 font-mono">{link.short_code}</p>
                          </div>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-gray-900">
                            {link.amount.toFixed(2)} {link.currency}
                          </span>
                        </td>
                        <td className="py-3 px-4">{getStatusBadge(link.status)}</td>
                        <td className="py-3 px-4 text-sm text-gray-500">
                          {new Date(link.created_at).toLocaleDateString('ar-EG')}
                        </td>
                        <td className="py-3 px-4">
                          <div className="flex items-center gap-2">
                            <button
                              onClick={() => copyToClipboard(link.payment_url, link.id)}
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              title="نسخ الرابط"
                            >
                              {copiedId === link.id ? (
                                <Check className="w-4 h-4 text-green-600" />
                              ) : (
                                <Copy className="w-4 h-4 text-gray-500" />
                              )}
                            </button>
                            <a
                              href={link.payment_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="p-2 hover:bg-gray-100 rounded-lg transition-colors"
                              title="فتح الرابط"
                            >
                              <ExternalLink className="w-4 h-4 text-gray-500" />
                            </a>
                            <button
                              className="p-2 hover:bg-green-100 rounded-lg transition-colors"
                              title="إرسال عبر واتساب"
                            >
                              <Send className="w-4 h-4 text-green-600" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </>
        )}

        {activeTab === 'settings' && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">إعدادات الدفع</h2>
            
            <div className="space-y-6">
              {/* Provider */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  مزود الدفع
                </label>
                <select
                  value={settingsForm.provider}
                  onChange={(e) => setSettingsForm({ ...settingsForm, provider: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="stripe">Stripe</option>
                  <option value="paymob">PayMob (مصر)</option>
                  <option value="manual">يدوي</option>
                </select>
              </div>

              {settingsForm.provider === 'stripe' && (
                <>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Stripe Publishable Key
                    </label>
                    <input
                      type="text"
                      value={settingsForm.stripe_publishable_key}
                      onChange={(e) => setSettingsForm({ ...settingsForm, stripe_publishable_key: e.target.value })}
                      placeholder="pk_..."
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Stripe Secret Key
                    </label>
                    <input
                      type="password"
                      value={settingsForm.stripe_secret_key}
                      onChange={(e) => setSettingsForm({ ...settingsForm, stripe_secret_key: e.target.value })}
                      placeholder="sk_..."
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Stripe Webhook Secret
                    </label>
                    <input
                      type="password"
                      value={settingsForm.stripe_webhook_secret}
                      onChange={(e) => setSettingsForm({ ...settingsForm, stripe_webhook_secret: e.target.value })}
                      placeholder="whsec_..."
                      className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500 font-mono text-sm"
                    />
                  </div>
                </>
              )}

              {/* Currency */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  العملة الافتراضية
                </label>
                <select
                  value={settingsForm.default_currency}
                  onChange={(e) => setSettingsForm({ ...settingsForm, default_currency: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value="EGP">جنيه مصري (EGP)</option>
                  <option value="SAR">ريال سعودي (SAR)</option>
                  <option value="AED">درهم إماراتي (AED)</option>
                  <option value="USD">دولار أمريكي (USD)</option>
                </select>
              </div>

              {/* Expiry Hours */}
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  مدة صلاحية الرابط (بالساعات)
                </label>
                <input
                  type="number"
                  value={settingsForm.payment_link_expiry_hours}
                  onChange={(e) => setSettingsForm({ ...settingsForm, payment_link_expiry_hours: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>

              {/* Auto Send */}
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="autoSend"
                  checked={settingsForm.auto_send_payment_link}
                  onChange={(e) => setSettingsForm({ ...settingsForm, auto_send_payment_link: e.target.checked })}
                  className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500"
                />
                <label htmlFor="autoSend" className="text-sm text-gray-700">
                  إرسال رابط الدفع تلقائياً مع الفاتورة
                </label>
              </div>

              <button
                onClick={saveSettings}
                className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
              >
                حفظ الإعدادات
              </button>
            </div>
          </div>
        )}
      </div>

      {/* Create Payment Link Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">رابط دفع جديد</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  المبلغ (ج.م)
                </label>
                <input
                  type="number"
                  value={newLink.amount}
                  onChange={(e) => setNewLink({ ...newLink, amount: e.target.value })}
                  placeholder="0.00"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  الوصف
                </label>
                <input
                  type="text"
                  value={newLink.description}
                  onChange={(e) => setNewLink({ ...newLink, description: e.target.value })}
                  placeholder="مثال: فاتورة رقم 123"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                />
              </div>
              
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  مدة الصلاحية (بالساعات)
                </label>
                <select
                  value={newLink.expires_in_hours}
                  onChange={(e) => setNewLink({ ...newLink, expires_in_hours: parseInt(e.target.value) })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-blue-500"
                >
                  <option value={24}>24 ساعة</option>
                  <option value={48}>48 ساعة</option>
                  <option value={72}>72 ساعة (3 أيام)</option>
                  <option value={168}>أسبوع</option>
                </select>
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={createPaymentLink}
                disabled={!newLink.amount || !newLink.description}
                className="flex-1 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 text-white py-2 rounded-lg font-medium transition-colors"
              >
                إنشاء الرابط
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
