"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface FacebookPage {
  id: string;
  page_id: string;
  page_name: string;
  page_picture_url?: string;
  is_active: boolean;
  webhook_subscribed: boolean;
  token_expires_at: string | null;
  last_synced_at: string | null;
  created_at: string;
  token_status: "valid" | "expiring_soon" | "expired";
  days_until_expiry?: number;
}

interface TrackingLink {
  id: string;
  short_code: string;
  destination_phone: string | null;
  campaign_name: string | null;
  utm_source: string | null;
  utm_campaign: string | null;
  click_count: number;
  conversion_count: number;
  tracking_url: string;
  created_at: string;
}

export default function FacebookIntegrationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Link generator form
  const [linkForm, setLinkForm] = useState({
    phone: "",
    message: "",
    campaign_name: "",
    utm_source: "facebook",
    utm_medium: "paid",
    utm_campaign: "",
  });
  const [generatedLink, setGeneratedLink] = useState<string | null>(null);
  const [generatingLink, setGeneratingLink] = useState(false);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  // Fetch connected pages
  const fetchPages = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/facebook/pages`, {
        headers: getAuthHeaders(),
      });
      setPages(response.data.data || []);
    } catch (err: any) {
      console.error("Error fetching pages:", err);
    }
  }, [getAuthHeaders]);

  // Fetch tracking links
  const fetchTrackingLinks = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/tracking/links`, {
        headers: getAuthHeaders(),
      });
      setTrackingLinks(response.data.data || []);
    } catch (err: any) {
      console.error("Error fetching tracking links:", err);
    }
  }, [getAuthHeaders]);

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([fetchPages(), fetchTrackingLinks()]);
      setLoading(false);
    };
    loadData();
  }, [fetchPages, fetchTrackingLinks]);

  // Handle OAuth callback (if redirected back)
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");

    if (code) {
      handleOAuthCallback(code, state);
      // Clean URL
      window.history.replaceState({}, "", "/integrations/facebook");
    }
  }, []);

  const handleOAuthCallback = async (code: string, state: string | null) => {
    try {
      setLoading(true);
      const response = await axios.post(
        `${API_URL}/api/facebook/auth/callback?code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ""}`,
        {},
        { headers: getAuthHeaders() }
      );
      setSuccess(response.data.message);
      await fetchPages();
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في ربط صفحة الفيسبوك");
    } finally {
      setLoading(false);
    }
  };

  // Start OAuth flow
  const connectFacebook = async () => {
    try {
      const response = await axios.get(`${API_URL}/api/facebook/auth/url`, {
        headers: getAuthHeaders(),
      });
      // Redirect to Facebook OAuth
      window.location.href = response.data.data.authUrl;
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في بدء عملية الربط");
    }
  };

  // Subscribe page to webhooks
  const subscribePage = async (pageId: string) => {
    try {
      await axios.post(
        `${API_URL}/api/facebook/pages/${pageId}/subscribe`,
        { subscribed_fields: ["messages", "messaging_postbacks", "leadgen"] },
        { headers: getAuthHeaders() }
      );
      setSuccess("تم تفعيل استقبال الرسائل بنجاح");
      await fetchPages();
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في تفعيل الـ Webhooks");
    }
  };

  // Disconnect page
  const disconnectPage = async (pageId: string) => {
    if (!confirm("هل أنت متأكد من فصل هذه الصفحة؟")) return;

    try {
      await axios.delete(`${API_URL}/api/facebook/pages/${pageId}`, {
        headers: getAuthHeaders(),
      });
      setSuccess("تم فصل الصفحة بنجاح");
      await fetchPages();
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في فصل الصفحة");
    }
  };

  // Generate tracking link
  const generateTrackingLink = async () => {
    if (!linkForm.phone) {
      setError("رقم الهاتف مطلوب");
      return;
    }

    setGeneratingLink(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/tracking/generate-whatsapp-link`,
        linkForm,
        { headers: getAuthHeaders() }
      );
      setGeneratedLink(response.data.data.tracking_url);
      setSuccess("تم إنشاء رابط التتبع بنجاح");
      await fetchTrackingLinks();
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في إنشاء الرابط");
    } finally {
      setGeneratingLink(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess("تم نسخ الرابط");
    setTimeout(() => setSuccess(null), 2000);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">تكامل الفيسبوك</h1>
            <p className="text-gray-600 mt-1">
              اربط صفحات الفيسبوك لتتبع مصدر العملاء من الإعلانات
            </p>
          </div>
          <button
            onClick={() => router.push("/settings")}
            className="text-gray-600 hover:text-gray-900"
          >
            ← العودة للإعدادات
          </button>
        </div>

        {/* Alerts */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
            {error}
            <button onClick={() => setError(null)} className="float-left">×</button>
          </div>
        )}
        {success && (
          <div className="bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg">
            {success}
            <button onClick={() => setSuccess(null)} className="float-left">×</button>
          </div>
        )}

        {/* Connected Pages Section */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">صفحات الفيسبوك المتصلة</h2>
            <button
              onClick={connectFacebook}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg flex items-center gap-2"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              ربط صفحة جديدة
            </button>
          </div>

          {pages.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <svg className="w-16 h-16 mx-auto mb-4 text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1" />
              </svg>
              <p>لا توجد صفحات متصلة</p>
              <p className="text-sm mt-2">اضغط على "ربط صفحة جديدة" للبدء</p>
            </div>
          ) : (
            <div className="space-y-4">
              {pages.map((page) => (
                <div
                  key={page.id}
                  className="border rounded-lg p-4 flex items-center justify-between"
                >
                  <div className="flex items-center gap-4">
                    {page.page_picture_url ? (
                      <img
                        src={page.page_picture_url}
                        alt={page.page_name}
                        className="w-12 h-12 rounded-full"
                      />
                    ) : (
                      <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                        <span className="text-blue-600 font-bold text-lg">
                          {page.page_name[0]}
                        </span>
                      </div>
                    )}
                    <div>
                      <h3 className="font-medium">{page.page_name}</h3>
                      <div className="flex items-center gap-2 text-sm text-gray-500">
                        <span>ID: {page.page_id}</span>
                        {page.token_status === "expired" && (
                          <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">
                            منتهي الصلاحية
                          </span>
                        )}
                        {page.token_status === "expiring_soon" && (
                          <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs">
                            ينتهي خلال {page.days_until_expiry} يوم
                          </span>
                        )}
                        {page.token_status === "valid" && (
                          <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">
                            نشط
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    {!page.webhook_subscribed && (
                      <button
                        onClick={() => subscribePage(page.page_id)}
                        className="text-blue-600 hover:text-blue-800 px-3 py-1 border border-blue-200 rounded-lg text-sm"
                      >
                        تفعيل الاستقبال
                      </button>
                    )}
                    <button
                      onClick={() => disconnectPage(page.page_id)}
                      className="text-red-600 hover:text-red-800 px-3 py-1 border border-red-200 rounded-lg text-sm"
                    >
                      فصل
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Tracking Link Generator */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">مولد روابط التتبع</h2>
          <p className="text-gray-600 text-sm mb-4">
            أنشئ روابط WhatsApp قابلة للتتبع لاستخدامها في إعلانات الفيسبوك
          </p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                رقم الواتساب *
              </label>
              <input
                type="text"
                value={linkForm.phone}
                onChange={(e) => setLinkForm({ ...linkForm, phone: e.target.value })}
                placeholder="201234567890"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                اسم الحملة
              </label>
              <input
                type="text"
                value={linkForm.campaign_name}
                onChange={(e) => setLinkForm({ ...linkForm, campaign_name: e.target.value })}
                placeholder="حملة رمضان 2026"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">
                الرسالة الافتراضية
              </label>
              <textarea
                value={linkForm.message}
                onChange={(e) => setLinkForm({ ...linkForm, message: e.target.value })}
                placeholder="مرحباً، أريد الاستفسار عن..."
                rows={2}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                UTM Source
              </label>
              <input
                type="text"
                value={linkForm.utm_source}
                onChange={(e) => setLinkForm({ ...linkForm, utm_source: e.target.value })}
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                UTM Campaign
              </label>
              <input
                type="text"
                value={linkForm.utm_campaign}
                onChange={(e) => setLinkForm({ ...linkForm, utm_campaign: e.target.value })}
                placeholder="summer_sale"
                className="w-full border rounded-lg px-3 py-2 focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
            </div>
          </div>

          <button
            onClick={generateTrackingLink}
            disabled={generatingLink}
            className="mt-4 bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
          >
            {generatingLink ? "جاري الإنشاء..." : "إنشاء رابط التتبع"}
          </button>

          {generatedLink && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <p className="text-sm text-green-700 mb-2">رابط التتبع الخاص بك:</p>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={generatedLink}
                  readOnly
                  className="flex-1 bg-white border rounded px-3 py-2 text-sm"
                />
                <button
                  onClick={() => copyToClipboard(generatedLink)}
                  className="bg-green-600 text-white px-4 py-2 rounded hover:bg-green-700"
                >
                  نسخ
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Tracking Links List */}
        <div className="bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">روابط التتبع السابقة</h2>

          {trackingLinks.length === 0 ? (
            <p className="text-gray-500 text-center py-4">لا توجد روابط تتبع بعد</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    <th className="px-4 py-3 text-right">الحملة</th>
                    <th className="px-4 py-3 text-right">الرابط</th>
                    <th className="px-4 py-3 text-center">النقرات</th>
                    <th className="px-4 py-3 text-center">التحويلات</th>
                    <th className="px-4 py-3 text-center">معدل التحويل</th>
                    <th className="px-4 py-3 text-right">التاريخ</th>
                    <th className="px-4 py-3"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {trackingLinks.map((link) => (
                    <tr key={link.id} className="hover:bg-gray-50">
                      <td className="px-4 py-3">
                        {link.campaign_name || link.utm_campaign || "-"}
                      </td>
                      <td className="px-4 py-3">
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {link.short_code}
                        </code>
                      </td>
                      <td className="px-4 py-3 text-center">{link.click_count}</td>
                      <td className="px-4 py-3 text-center">{link.conversion_count}</td>
                      <td className="px-4 py-3 text-center">
                        {link.click_count > 0
                          ? `${((link.conversion_count / link.click_count) * 100).toFixed(1)}%`
                          : "-"}
                      </td>
                      <td className="px-4 py-3 text-gray-500">
                        {new Date(link.created_at).toLocaleDateString("ar-EG")}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => copyToClipboard(link.tracking_url)}
                          className="text-blue-600 hover:text-blue-800"
                        >
                          نسخ
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
