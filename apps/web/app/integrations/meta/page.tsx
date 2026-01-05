"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// =====================================================
// Types
// =====================================================
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

interface Conversation {
  id: string;
  page_id: string;
  participant_id: string;
  participant_name: string;
  participant_profile_pic?: string;
  last_message?: string;
  last_message_time?: string;
  unread_count: number;
  platform: "messenger" | "instagram";
}

interface Message {
  id: string;
  sender_id: string;
  message_text?: string;
  message_type: string;
  is_from_page: boolean;
  created_at: string;
  attachments?: any[];
}

interface FacebookSettings {
  app_id?: string;
  verify_token?: string;
  is_configured: boolean;
}

type MetaTab = "settings" | "pages" | "messenger" | "inbox" | "tracking";

const tabs = [
  { id: "settings" as MetaTab, label: "الإعدادات", icon: "⚙️" },
  { id: "pages" as MetaTab, label: "الصفحات", icon: "📘" },
  { id: "messenger" as MetaTab, label: "Messenger", icon: "💬" },
  { id: "inbox" as MetaTab, label: "صندوق الوارد", icon: "📥" },
  { id: "tracking" as MetaTab, label: "التتبع", icon: "📊" },
];

export default function MetaIntegrationPage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<MetaTab>("pages");
  const [loading, setLoading] = useState(true);
  
  // Data states
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [trackingLinks, setTrackingLinks] = useState<TrackingLink[]>([]);
  const [settings, setSettings] = useState<FacebookSettings>({ is_configured: false });
  
  // UI states
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  
  // Settings form
  const [settingsForm, setSettingsForm] = useState({
    app_id: "",
    app_secret: "",
    verify_token: "",
  });
  const [savingSettings, setSavingSettings] = useState(false);
  
  // Manual token form
  const [showManualToken, setShowManualToken] = useState(false);
  const [manualTokenForm, setManualTokenForm] = useState({
    page_id: "",
    page_name: "",
    access_token: "",
  });
  const [savingManualToken, setSavingManualToken] = useState(false);
  
  // Tracking link form
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

  // Inbox states
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [selectedConversation, setSelectedConversation] = useState<Conversation | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [newMessage, setNewMessage] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const [loadingMessages, setLoadingMessages] = useState(false);
  const [platformFilter, setPlatformFilter] = useState<"all" | "messenger" | "instagram">("all");

  // Sync states
  const [syncingPageId, setSyncingPageId] = useState<string | null>(null);

  const getAuthHeaders = useCallback(() => {
    const token = localStorage.getItem("token");
    return { Authorization: `Bearer ${token}` };
  }, []);

  // =====================================================
  // Data Fetching
  // =====================================================
  const fetchSettings = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/facebook/settings`, {
        headers: getAuthHeaders(),
      });
      setSettings(response.data.data || { is_configured: false });
      if (response.data.data?.app_id) {
        setSettingsForm(prev => ({
          ...prev,
          app_id: response.data.data.app_id,
          verify_token: response.data.data.verify_token || "",
        }));
      }
    } catch (err: any) {
      console.error("Error fetching settings:", err);
    }
  }, [getAuthHeaders]);

  const fetchConversations = useCallback(async () => {
    try {
      const response = await axios.get(`${API_URL}/api/messenger/conversations`, {
        headers: getAuthHeaders(),
      });
      setConversations(response.data.data || []);
    } catch (err: any) {
      console.error("Error fetching conversations:", err);
    }
  }, [getAuthHeaders]);

  const fetchMessages = useCallback(async (conversationId: string) => {
    setLoadingMessages(true);
    try {
      const response = await axios.get(`${API_URL}/api/messenger/conversations/${conversationId}/messages`, {
        headers: getAuthHeaders(),
      });
      setMessages(response.data.data || []);
    } catch (err: any) {
      console.error("Error fetching messages:", err);
      setError("فشل في جلب الرسائل");
    } finally {
      setLoadingMessages(false);
    }
  }, [getAuthHeaders]);

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
      await Promise.all([fetchSettings(), fetchPages(), fetchTrackingLinks(), fetchConversations()]);
      setLoading(false);
    };
    loadData();
  }, [fetchSettings, fetchPages, fetchTrackingLinks, fetchConversations]);

  // =====================================================
  // Actions
  // =====================================================

  // Sync messages from Facebook
  const syncMessages = async (pageId: string, mode: "full" | "quick") => {
    setSyncingPageId(pageId);
    try {
      const endpoint = mode === "full" ? "sync" : "quick-sync";
      const response = await axios.post(
        `${API_URL}/api/messenger/pages/${pageId}/${endpoint}`,
        {},
        { headers: getAuthHeaders() }
      );
      setSuccess(`تم مزامنة ${response.data.data?.messages_synced || 0} رسالة بنجاح`);
      await fetchConversations();
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في مزامنة الرسائل");
    } finally {
      setSyncingPageId(null);
    }
  };

  // Send message
  const sendMessage = async () => {
    if (!selectedConversation || !newMessage.trim()) return;

    setSendingMessage(true);
    try {
      await axios.post(
        `${API_URL}/api/messenger/conversations/${selectedConversation.id}/send`,
        { message: newMessage.trim() },
        { headers: getAuthHeaders() }
      );
      setNewMessage("");
      await fetchMessages(selectedConversation.id);
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في إرسال الرسالة");
    } finally {
      setSendingMessage(false);
    }
  };

  // Select conversation
  const selectConversation = async (conversation: Conversation) => {
    setSelectedConversation(conversation);
    await fetchMessages(conversation.id);
  };
  
  // Save Facebook App Settings
  const saveSettings = async () => {
    if (!settingsForm.app_id || !settingsForm.app_secret || !settingsForm.verify_token) {
      setError("جميع الحقول مطلوبة");
      return;
    }

    setSavingSettings(true);
    try {
      await axios.post(
        `${API_URL}/api/facebook/settings`,
        settingsForm,
        { headers: getAuthHeaders() }
      );
      setSuccess("تم حفظ الإعدادات بنجاح");
      await fetchSettings();
      setSettingsForm(prev => ({ ...prev, app_secret: "" }));
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في حفظ الإعدادات");
    } finally {
      setSavingSettings(false);
    }
  };

  // OAuth Flow
  const connectViaOAuth = async () => {
    if (!settings.is_configured) {
      setError("يجب إعداد تطبيق Facebook أولاً من تبويب الإعدادات");
      setActiveTab("settings");
      return;
    }
    
    try {
      const response = await axios.get(`${API_URL}/api/facebook/auth/url`, {
        headers: getAuthHeaders(),
      });
      window.location.href = response.data.data.authUrl;
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في بدء عملية الربط");
    }
  };

  // Handle OAuth callback
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const code = urlParams.get("code");
    const state = urlParams.get("state");

    if (code) {
      handleOAuthCallback(code, state);
      window.history.replaceState({}, "", "/integrations/meta");
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

  // Save manual page token
  const saveManualPageToken = async () => {
    if (!manualTokenForm.page_id || !manualTokenForm.page_name || !manualTokenForm.access_token) {
      setError("جميع الحقول مطلوبة");
      return;
    }

    setSavingManualToken(true);
    setError(null);
    try {
      const response = await axios.post(
        `${API_URL}/api/facebook/pages/manual`,
        manualTokenForm,
        { headers: getAuthHeaders() }
      );
      setSuccess(response.data.message || "تم إضافة الصفحة بنجاح");
      setShowManualToken(false);
      setManualTokenForm({ page_id: "", page_name: "", access_token: "" });
      await fetchPages();
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في إضافة الصفحة");
    } finally {
      setSavingManualToken(false);
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

  // Subscribe to webhooks (Messenger)
  const subscribePage = async (pageId: string) => {
    try {
      await axios.post(
        `${API_URL}/api/facebook/pages/${pageId}/subscribe`,
        { subscribed_fields: ["messages", "messaging_postbacks"] },
        { headers: getAuthHeaders() }
      );
      setSuccess("تم تفعيل استقبال الرسائل بنجاح");
      await fetchPages();
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في تفعيل استقبال الرسائل. تأكد من وجود الصلاحيات المطلوبة.");
    }
  };

  // Generate tracking link
  const generateTrackingLink = async () => {
    if (!linkForm.phone || !linkForm.campaign_name) {
      setError("رقم الواتساب واسم الحملة مطلوبان");
      return;
    }

    setGeneratingLink(true);
    try {
      const response = await axios.post(
        `${API_URL}/api/tracking/links`,
        linkForm,
        { headers: getAuthHeaders() }
      );
      setGeneratedLink(response.data.data.tracking_url);
      setSuccess("تم إنشاء رابط التتبع بنجاح");
      await fetchTrackingLinks();
    } catch (err: any) {
      setError(err.response?.data?.error || "فشل في إنشاء رابط التتبع");
    } finally {
      setGeneratingLink(false);
    }
  };

  // Copy to clipboard
  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setSuccess("تم نسخ الرابط");
  };

  // =====================================================
  // Render Helpers
  // =====================================================
  const TokenStatusBadge = ({ page }: { page: FacebookPage }) => {
    if (page.token_status === "expired") {
      return (
        <span className="bg-red-100 text-red-700 px-2 py-0.5 rounded text-xs">
          منتهي الصلاحية
        </span>
      );
    }
    if (page.token_status === "expiring_soon") {
      return (
        <span className="bg-yellow-100 text-yellow-700 px-2 py-0.5 rounded text-xs">
          ينتهي خلال {page.days_until_expiry} يوم
        </span>
      );
    }
    return (
      <span className="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">
        نشط
      </span>
    );
  };

  // =====================================================
  // Loading State
  // =====================================================
  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
          <p className="text-gray-600">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  // =====================================================
  // Main Render
  // =====================================================
  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="bg-gradient-to-r from-blue-600 to-purple-600 p-3 rounded-xl">
                <svg className="w-8 h-8 text-white" viewBox="0 0 24 24" fill="currentColor">
                  <path d="M12 2C6.477 2 2 6.477 2 12c0 5.523 4.477 10 10 10s10-4.477 10-10c0-5.523-4.477-10-10-10zm3.8 7.2c.1 0 .2 0 .2.1l.1.2c0 .1 0 .1-.1.2l-4.3 4.3c-.1.1-.2.1-.3 0l-2.4-2.4c-.1-.1-.1-.2 0-.3l.2-.2c.1 0 .2 0 .2.1l2 2 4-4c.1-.1.2-.1.4 0z"/>
                </svg>
              </div>
              <div>
                <h1 className="text-2xl font-bold text-gray-900">تكاملات Meta</h1>
                <p className="text-gray-600">Facebook • Messenger • التتبع</p>
              </div>
            </div>
            <button
              onClick={() => router.push("/integrations")}
              className="text-gray-600 hover:text-gray-900 flex items-center gap-1"
            >
              ← العودة
            </button>
          </div>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 text-xl">×</button>
          </div>
        )}
        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700 text-xl">×</button>
          </div>
        )}

        {/* Tabs */}
        <div className="bg-white rounded-xl shadow-sm mb-6">
          <div className="border-b border-gray-200">
            <nav className="flex gap-0 overflow-x-auto">
              {tabs.map((tab) => (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-colors whitespace-nowrap flex items-center gap-2 ${
                    activeTab === tab.id
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300"
                  }`}
                >
                  <span>{tab.icon}</span>
                  <span>{tab.label}</span>
                </button>
              ))}
            </nav>
          </div>

          <div className="p-6">
            {/* ================= Settings Tab ================= */}
            {activeTab === "settings" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold mb-2">إعدادات تطبيق Facebook</h2>
                  <p className="text-gray-600 text-sm mb-4">
                    أنشئ تطبيق على{" "}
                    <a href="https://developers.facebook.com/apps" target="_blank" rel="noopener noreferrer" className="text-blue-600 underline">
                      Facebook Developers
                    </a>
                    {" "}وأدخل البيانات هنا
                  </p>
                </div>

                {settings.is_configured && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4 flex items-center gap-3">
                    <span className="text-2xl">✅</span>
                    <div>
                      <p className="font-medium text-green-800">تم إعداد التطبيق</p>
                      <p className="text-sm text-green-700">App ID: {settings.app_id}</p>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">App ID *</label>
                    <input
                      type="text"
                      value={settingsForm.app_id}
                      onChange={(e) => setSettingsForm({ ...settingsForm, app_id: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="1234567890"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-1">App Secret *</label>
                    <input
                      type="password"
                      value={settingsForm.app_secret}
                      onChange={(e) => setSettingsForm({ ...settingsForm, app_secret: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="••••••••••••"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <label className="block text-sm font-medium text-gray-700 mb-1">Verify Token *</label>
                    <input
                      type="text"
                      value={settingsForm.verify_token}
                      onChange={(e) => setSettingsForm({ ...settingsForm, verify_token: e.target.value })}
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500"
                      placeholder="my_secret_verify_token"
                    />
                    <p className="text-xs text-gray-500 mt-1">نفس الـ Token الذي ستستخدمه في إعدادات Webhooks</p>
                  </div>
                </div>

                <button
                  onClick={saveSettings}
                  disabled={savingSettings}
                  className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
                >
                  {savingSettings ? "جاري الحفظ..." : "حفظ الإعدادات"}
                </button>
              </div>
            )}

            {/* ================= Pages Tab ================= */}
            {activeTab === "pages" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">صفحات Facebook المتصلة</h2>
                    <p className="text-gray-600 text-sm">اربط صفحاتك لتتبع الإعلانات واستقبال الرسائل</p>
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={() => setShowManualToken(!showManualToken)}
                      className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
                    >
                      ✏️ إضافة Token يدوي
                    </button>
                    <button
                      onClick={connectViaOAuth}
                      className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
                    >
                      <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                        <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
                      </svg>
                      ربط عبر OAuth
                    </button>
                  </div>
                </div>

                {/* Manual Token Form */}
                {showManualToken && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <h3 className="font-semibold text-green-800 mb-3">إضافة صفحة يدوياً</h3>
                    <p className="text-sm text-green-700 mb-4">
                      احصل على Page Access Token من{" "}
                      <a href="https://developers.facebook.com/tools/explorer/" target="_blank" rel="noopener noreferrer" className="underline">
                        Graph API Explorer
                      </a>
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                      <input
                        type="text"
                        value={manualTokenForm.page_id}
                        onChange={(e) => setManualTokenForm({ ...manualTokenForm, page_id: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="Page ID"
                      />
                      <input
                        type="text"
                        value={manualTokenForm.page_name}
                        onChange={(e) => setManualTokenForm({ ...manualTokenForm, page_name: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg"
                        placeholder="اسم الصفحة"
                      />
                      <textarea
                        value={manualTokenForm.access_token}
                        onChange={(e) => setManualTokenForm({ ...manualTokenForm, access_token: e.target.value })}
                        className="px-3 py-2 border border-gray-300 rounded-lg font-mono text-xs md:col-span-3"
                        placeholder="Page Access Token"
                        rows={2}
                      />
                    </div>
                    <div className="flex gap-2 mt-3">
                      <button
                        onClick={saveManualPageToken}
                        disabled={savingManualToken}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm disabled:opacity-50"
                      >
                        {savingManualToken ? "جاري الإضافة..." : "إضافة الصفحة"}
                      </button>
                      <button
                        onClick={() => setShowManualToken(false)}
                        className="bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg text-sm"
                      >
                        إلغاء
                      </button>
                    </div>
                  </div>
                )}

                {/* Pages List */}
                {pages.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-5xl mb-4">📘</div>
                    <p className="text-lg font-medium">لا توجد صفحات متصلة</p>
                    <p className="text-sm mt-1">اضغط على "ربط عبر OAuth" أو "إضافة Token يدوي" للبدء</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pages.map((page) => (
                      <div key={page.id} className="border rounded-lg p-4 hover:border-blue-300 transition-colors">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {page.page_picture_url ? (
                              <img src={page.page_picture_url} alt={page.page_name} className="w-12 h-12 rounded-full" />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl">📘</div>
                            )}
                            <div>
                              <h3 className="font-medium">{page.page_name}</h3>
                              <div className="flex items-center gap-2 text-sm text-gray-500">
                                <span>ID: {page.page_id}</span>
                                <TokenStatusBadge page={page} />
                              </div>
                            </div>
                          </div>
                          <button
                            onClick={() => disconnectPage(page.page_id)}
                            className="text-red-600 hover:text-red-800 px-3 py-1 border border-red-200 rounded-lg text-sm hover:bg-red-50"
                          >
                            فصل
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ================= Messenger Tab ================= */}
            {activeTab === "messenger" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">استقبال رسائل Messenger</h2>
                  <p className="text-gray-600 text-sm">فعّل Webhooks لاستقبال رسائل العملاء في النظام</p>
                </div>

                {/* Requirements Info */}
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <h3 className="font-semibold text-blue-800 mb-2">📋 المتطلبات</h3>
                  <ul className="text-sm text-blue-700 space-y-1">
                    <li>• يجب ربط الصفحة أولاً من تبويب "الصفحات"</li>
                    <li>• يحتاج Token بصلاحيات: <code className="bg-blue-100 px-1 rounded">pages_messaging</code> و <code className="bg-blue-100 px-1 rounded">pages_manage_metadata</code></li>
                    <li>• هذه الصلاحيات تتطلب App Review أو استخدام Graph API Explorer</li>
                  </ul>
                </div>

                {/* Pages List for Messenger */}
                {pages.length === 0 ? (
                  <div className="text-center py-12 text-gray-500">
                    <div className="text-5xl mb-4">💬</div>
                    <p className="text-lg font-medium">لا توجد صفحات متصلة</p>
                    <p className="text-sm mt-1">
                      اربط صفحة من{" "}
                      <button onClick={() => setActiveTab("pages")} className="text-blue-600 underline">
                        تبويب الصفحات
                      </button>
                      {" "}أولاً
                    </p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {pages.map((page) => (
                      <div key={page.id} className="border rounded-lg p-4">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-3">
                            {page.page_picture_url ? (
                              <img src={page.page_picture_url} alt={page.page_name} className="w-12 h-12 rounded-full" />
                            ) : (
                              <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center text-xl">💬</div>
                            )}
                            <div>
                              <h3 className="font-medium">{page.page_name}</h3>
                              <div className="flex items-center gap-2 mt-1">
                                {page.webhook_subscribed ? (
                                  <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
                                    <span className="w-2 h-2 bg-green-500 rounded-full animate-pulse"></span>
                                    استقبال الرسائل مفعّل
                                  </span>
                                ) : (
                                  <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                                    غير مفعّل
                                  </span>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            {page.webhook_subscribed && (
                              <>
                                <button
                                  onClick={() => syncMessages(page.page_id, "quick")}
                                  disabled={syncingPageId === page.page_id}
                                  className="bg-green-100 hover:bg-green-200 text-green-700 px-3 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-1"
                                >
                                  {syncingPageId === page.page_id ? (
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                  ) : "🔄"}
                                  مزامنة سريعة
                                </button>
                                <button
                                  onClick={() => syncMessages(page.page_id, "full")}
                                  disabled={syncingPageId === page.page_id}
                                  className="bg-blue-100 hover:bg-blue-200 text-blue-700 px-3 py-2 rounded-lg text-sm disabled:opacity-50 flex items-center gap-1"
                                >
                                  {syncingPageId === page.page_id ? (
                                    <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                    </svg>
                                  ) : "📥"}
                                  مزامنة كاملة
                                </button>
                              </>
                            )}
                            {!page.webhook_subscribed ? (
                              <button
                                onClick={() => subscribePage(page.page_id)}
                                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm"
                              >
                                تفعيل الاستقبال
                              </button>
                            ) : (
                              <span className="text-green-600 flex items-center gap-1">
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                                </svg>
                                مفعّل
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ================= Inbox Tab ================= */}
            {activeTab === "inbox" && (
              <div className="space-y-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-lg font-semibold">صندوق الوارد الموحد</h2>
                    <p className="text-gray-600 text-sm">جميع محادثات Messenger و Instagram في مكان واحد</p>
                  </div>
                  <div className="flex items-center gap-2">
                    <select
                      value={platformFilter}
                      onChange={(e) => setPlatformFilter(e.target.value as any)}
                      className="border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="all">جميع المنصات</option>
                      <option value="messenger">Messenger فقط</option>
                      <option value="instagram">Instagram فقط</option>
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 h-[600px]">
                  {/* Conversations List */}
                  <div className="border rounded-lg overflow-hidden">
                    <div className="bg-gray-50 px-4 py-3 border-b">
                      <h3 className="font-medium">المحادثات</h3>
                    </div>
                    <div className="overflow-y-auto h-[calc(100%-52px)]">
                      {conversations.length === 0 ? (
                        <div className="text-center py-12 text-gray-500">
                          <div className="text-4xl mb-3">💬</div>
                          <p className="text-sm">لا توجد محادثات</p>
                          <p className="text-xs mt-1">استخدم المزامنة لجلب المحادثات</p>
                        </div>
                      ) : (
                        conversations
                          .filter(c => platformFilter === "all" || c.platform === platformFilter)
                          .map((conv) => (
                            <div
                              key={conv.id}
                              onClick={() => selectConversation(conv)}
                              className={`p-4 border-b cursor-pointer hover:bg-gray-50 transition-colors ${
                                selectedConversation?.id === conv.id ? "bg-blue-50" : ""
                              }`}
                            >
                              <div className="flex items-center gap-3">
                                {conv.participant_profile_pic ? (
                                  <img src={conv.participant_profile_pic} alt="" className="w-10 h-10 rounded-full" />
                                ) : (
                                  <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-medium">
                                    {conv.participant_name?.charAt(0) || "?"}
                                  </div>
                                )}
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-2">
                                    <h4 className="font-medium text-sm truncate">{conv.participant_name}</h4>
                                    <span className={`text-xs px-1.5 py-0.5 rounded ${
                                      conv.platform === "messenger" ? "bg-blue-100 text-blue-700" : "bg-pink-100 text-pink-700"
                                    }`}>
                                      {conv.platform === "messenger" ? "💬" : "📸"}
                                    </span>
                                  </div>
                                  {conv.last_message && (
                                    <p className="text-xs text-gray-500 truncate mt-0.5">{conv.last_message}</p>
                                  )}
                                </div>
                                {conv.unread_count > 0 && (
                                  <span className="bg-blue-600 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                                    {conv.unread_count}
                                  </span>
                                )}
                              </div>
                            </div>
                          ))
                      )}
                    </div>
                  </div>

                  {/* Messages Area */}
                  <div className="lg:col-span-2 border rounded-lg overflow-hidden flex flex-col">
                    {selectedConversation ? (
                      <>
                        {/* Chat Header */}
                        <div className="bg-gray-50 px-4 py-3 border-b flex items-center gap-3">
                          {selectedConversation.participant_profile_pic ? (
                            <img src={selectedConversation.participant_profile_pic} alt="" className="w-8 h-8 rounded-full" />
                          ) : (
                            <div className="w-8 h-8 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white text-sm font-medium">
                              {selectedConversation.participant_name?.charAt(0) || "?"}
                            </div>
                          )}
                          <div>
                            <h3 className="font-medium text-sm">{selectedConversation.participant_name}</h3>
                            <span className="text-xs text-gray-500">
                              {selectedConversation.platform === "messenger" ? "Messenger" : "Instagram"}
                            </span>
                          </div>
                        </div>

                        {/* Messages */}
                        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-gray-50">
                          {loadingMessages ? (
                            <div className="text-center py-8">
                              <div className="animate-spin w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full mx-auto"></div>
                              <p className="text-gray-500 mt-2 text-sm">جاري تحميل الرسائل...</p>
                            </div>
                          ) : messages.length === 0 ? (
                            <div className="text-center py-8 text-gray-500">
                              <p className="text-sm">لا توجد رسائل</p>
                            </div>
                          ) : (
                            messages.map((msg) => (
                              <div key={msg.id} className={`flex ${msg.is_from_page ? "justify-end" : "justify-start"}`}>
                                <div className={`max-w-[70%] rounded-2xl px-4 py-2 ${
                                  msg.is_from_page 
                                    ? "bg-blue-600 text-white rounded-br-md" 
                                    : "bg-white border rounded-bl-md"
                                }`}>
                                  <p className="text-sm">{msg.message_text}</p>
                                  <span className={`text-xs ${msg.is_from_page ? "text-blue-100" : "text-gray-400"} block mt-1`}>
                                    {new Date(msg.created_at).toLocaleTimeString("ar", { hour: "2-digit", minute: "2-digit" })}
                                  </span>
                                </div>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Send Message */}
                        <div className="p-3 border-t bg-white">
                          <div className="flex items-center gap-2">
                            <input
                              type="text"
                              value={newMessage}
                              onChange={(e) => setNewMessage(e.target.value)}
                              onKeyPress={(e) => e.key === "Enter" && sendMessage()}
                              placeholder="اكتب رسالتك..."
                              className="flex-1 border rounded-full px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                            />
                            <button
                              onClick={sendMessage}
                              disabled={sendingMessage || !newMessage.trim()}
                              className="bg-blue-600 hover:bg-blue-700 text-white rounded-full p-2 disabled:opacity-50"
                            >
                              {sendingMessage ? (
                                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                                </svg>
                              ) : (
                                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                                </svg>
                              )}
                            </button>
                          </div>
                        </div>
                      </>
                    ) : (
                      <div className="flex-1 flex items-center justify-center text-gray-500">
                        <div className="text-center">
                          <div className="text-5xl mb-4">💬</div>
                          <p className="font-medium">اختر محادثة</p>
                          <p className="text-sm mt-1">اختر محادثة من القائمة لعرض الرسائل</p>
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            )}

            {/* ================= Tracking Tab ================= */}
            {activeTab === "tracking" && (
              <div className="space-y-6">
                <div>
                  <h2 className="text-lg font-semibold">مولد روابط التتبع</h2>
                  <p className="text-gray-600 text-sm">أنشئ روابط WhatsApp قابلة للتتبع لإعلانات Facebook</p>
                </div>

                {/* Link Generator Form */}
                <div className="bg-gray-50 rounded-lg p-4">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">رقم الواتساب *</label>
                      <input
                        type="text"
                        value={linkForm.phone}
                        onChange={(e) => setLinkForm({ ...linkForm, phone: e.target.value })}
                        placeholder="201234567890"
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">اسم الحملة *</label>
                      <input
                        type="text"
                        value={linkForm.campaign_name}
                        onChange={(e) => setLinkForm({ ...linkForm, campaign_name: e.target.value })}
                        placeholder="summer_sale_2026"
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">UTM Source</label>
                      <input
                        type="text"
                        value={linkForm.utm_source}
                        onChange={(e) => setLinkForm({ ...linkForm, utm_source: e.target.value })}
                        placeholder="facebook"
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    </div>
                    <div>
                      <label className="block text-sm font-medium text-gray-700 mb-1">UTM Campaign</label>
                      <input
                        type="text"
                        value={linkForm.utm_campaign}
                        onChange={(e) => setLinkForm({ ...linkForm, utm_campaign: e.target.value })}
                        placeholder="summer_2026"
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    </div>
                    <div className="md:col-span-2">
                      <label className="block text-sm font-medium text-gray-700 mb-1">رسالة مسبقة (اختياري)</label>
                      <input
                        type="text"
                        value={linkForm.message}
                        onChange={(e) => setLinkForm({ ...linkForm, message: e.target.value })}
                        placeholder="أهلاً، أريد الاستفسار عن العرض"
                        className="w-full border rounded-lg px-3 py-2"
                      />
                    </div>
                  </div>
                  <button
                    onClick={generateTrackingLink}
                    disabled={generatingLink}
                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-lg disabled:opacity-50"
                  >
                    {generatingLink ? "جاري الإنشاء..." : "إنشاء رابط التتبع"}
                  </button>
                </div>

                {/* Generated Link */}
                {generatedLink && (
                  <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                    <p className="text-sm text-green-800 mb-2">تم إنشاء الرابط بنجاح:</p>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-white px-3 py-2 rounded border text-sm break-all">
                        {generatedLink}
                      </code>
                      <button
                        onClick={() => copyToClipboard(generatedLink)}
                        className="bg-green-600 hover:bg-green-700 text-white px-4 py-2 rounded-lg text-sm whitespace-nowrap"
                      >
                        نسخ
                      </button>
                    </div>
                  </div>
                )}

                {/* Tracking Links Table */}
                {trackingLinks.length > 0 && (
                  <div>
                    <h3 className="font-semibold mb-3">الروابط السابقة</h3>
                    <div className="overflow-x-auto">
                      <table className="w-full text-sm">
                        <thead className="bg-gray-50">
                          <tr>
                            <th className="px-4 py-2 text-right">الحملة</th>
                            <th className="px-4 py-2 text-right">الرابط</th>
                            <th className="px-4 py-2 text-center">النقرات</th>
                            <th className="px-4 py-2 text-center">التحويلات</th>
                            <th className="px-4 py-2 text-right">التاريخ</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {trackingLinks.map((link) => (
                            <tr key={link.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2">{link.campaign_name || "-"}</td>
                              <td className="px-4 py-2">
                                <button
                                  onClick={() => copyToClipboard(link.tracking_url)}
                                  className="text-blue-600 hover:underline text-xs font-mono"
                                >
                                  {link.short_code}
                                </button>
                              </td>
                              <td className="px-4 py-2 text-center">{link.click_count}</td>
                              <td className="px-4 py-2 text-center">{link.conversion_count}</td>
                              <td className="px-4 py-2 text-gray-500">
                                {new Date(link.created_at).toLocaleDateString("ar")}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
