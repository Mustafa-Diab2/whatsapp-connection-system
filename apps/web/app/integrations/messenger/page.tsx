"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";
import Link from "next/link";

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

export default function MessengerIntegrationPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [pages, setPages] = useState<FacebookPage[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

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

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await fetchPages();
      setLoading(false);
    };
    loadData();
  }, [fetchPages]);

  // Subscribe page to webhooks
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
      setError(err.response?.data?.error || "فشل في تفعيل استقبال الرسائل");
    }
  };

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

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center gap-2 mb-2">
            <Link 
              href="/integrations"
              className="text-blue-600 hover:text-blue-700"
            >
              التكاملات
            </Link>
            <span className="text-gray-400">/</span>
            <span className="text-gray-900">Messenger</span>
          </div>
          <h1 className="text-3xl font-bold text-gray-900">
            💬 استقبال رسائل Messenger
          </h1>
          <p className="text-gray-600 mt-2">
            تلقي وإدارة رسائل عملائك من Messenger داخل النظام
          </p>
        </div>

        {/* Alerts */}
        {error && (
          <div className="mb-4 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{error}</span>
            <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700">
              ✕
            </button>
          </div>
        )}

        {success && (
          <div className="mb-4 bg-green-50 border border-green-200 text-green-700 px-4 py-3 rounded-lg flex items-center justify-between">
            <span>{success}</span>
            <button onClick={() => setSuccess(null)} className="text-green-500 hover:text-green-700">
              ✕
            </button>
          </div>
        )}

        {/* Info Box */}
        <div className="bg-blue-50 border border-blue-200 rounded-lg p-6 mb-6">
          <div className="flex items-start gap-4">
            <div className="bg-blue-100 rounded-full p-3">
              <svg className="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            </div>
            <div className="flex-1">
              <h3 className="font-semibold text-blue-900 mb-2">متطلبات استقبال رسائل Messenger</h3>
              <ul className="text-sm text-blue-800 space-y-2">
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>يجب أن تكون الصفحة مربوطة من <Link href="/integrations/facebook" className="underline font-semibold">صفحة Facebook</Link></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>يجب أن يحتوي الـ Token على صلاحيات: <code className="bg-blue-100 px-1 rounded">pages_messaging</code> و <code className="bg-blue-100 px-1 rounded">pages_manage_metadata</code></span>
                </li>
                <li className="flex items-start gap-2">
                  <span className="text-blue-600 mt-1">•</span>
                  <span>هذه الصلاحيات تتطلب App Review من فيسبوك أو استخدام Graph API Explorer</span>
                </li>
              </ul>
            </div>
          </div>
        </div>

        {/* No Pages Warning */}
        {pages.length === 0 && (
          <div className="bg-white rounded-xl shadow-sm p-8 text-center">
            <div className="bg-yellow-100 rounded-full w-16 h-16 flex items-center justify-center mx-auto mb-4">
              <svg className="w-8 h-8 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
            </div>
            <h3 className="text-xl font-semibold text-gray-900 mb-2">لا توجد صفحات مربوطة</h3>
            <p className="text-gray-600 mb-4">يجب ربط صفحة Facebook أولاً</p>
            <Link 
              href="/integrations/facebook"
              className="inline-flex items-center gap-2 bg-blue-600 hover:bg-blue-700 text-white px-6 py-3 rounded-lg"
            >
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"/>
              </svg>
              ربط صفحة Facebook
            </Link>
          </div>
        )}

        {/* Pages List */}
        {pages.length > 0 && (
          <div className="bg-white rounded-xl shadow-sm p-6">
            <h2 className="text-lg font-semibold mb-4">صفحات Facebook المتصلة</h2>
            <div className="space-y-4">
              {pages.map((page) => (
                <div
                  key={page.id}
                  className="border rounded-lg p-4 hover:border-blue-300 transition-colors"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      {page.page_picture_url ? (
                        <img
                          src={page.page_picture_url}
                          alt={page.page_name}
                          className="w-12 h-12 rounded-full"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-blue-100 flex items-center justify-center">
                          <span className="text-xl">📘</span>
                        </div>
                      )}
                      <div>
                        <h3 className="font-semibold text-gray-900">{page.page_name}</h3>
                        <p className="text-sm text-gray-500">ID: {page.page_id}</p>
                        <div className="flex items-center gap-2 mt-1">
                          {page.webhook_subscribed ? (
                            <span className="text-xs bg-green-100 text-green-700 px-2 py-1 rounded-full flex items-center gap-1">
                              <span className="w-2 h-2 bg-green-500 rounded-full"></span>
                              استقبال الرسائل مفعّل
                            </span>
                          ) : (
                            <span className="text-xs bg-gray-100 text-gray-600 px-2 py-1 rounded-full">
                              غير مفعّل
                            </span>
                          )}
                          {page.token_status === "expired" && (
                            <span className="text-xs bg-red-100 text-red-700 px-2 py-1 rounded-full">
                              Token منتهي الصلاحية
                            </span>
                          )}
                          {page.token_status === "expiring_soon" && (
                            <span className="text-xs bg-yellow-100 text-yellow-700 px-2 py-1 rounded-full">
                              Token سينتهي قريباً ({page.days_until_expiry} يوم)
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                    
                    <div className="flex items-center gap-2">
                      {!page.webhook_subscribed ? (
                        <button
                          onClick={() => subscribePage(page.page_id)}
                          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg text-sm flex items-center gap-2"
                        >
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          تفعيل الاستقبال
                        </button>
                      ) : (
                        <div className="text-green-600 flex items-center gap-2">
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                          </svg>
                          <span className="text-sm font-medium">مفعّل</span>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* How it works */}
        <div className="mt-6 bg-white rounded-xl shadow-sm p-6">
          <h2 className="text-lg font-semibold mb-4">كيف يعمل؟</h2>
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-blue-600 font-semibold">1</span>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">ربط الصفحة</h3>
                <p className="text-sm text-gray-600">اربط صفحة Facebook من الصفحة المخصصة لها</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-blue-600 font-semibold">2</span>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">تفعيل Webhooks</h3>
                <p className="text-sm text-gray-600">اضغط "تفعيل الاستقبال" لتسجيل webhooks مع فيسبوك</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <div className="bg-blue-100 rounded-full w-8 h-8 flex items-center justify-center flex-shrink-0 mt-1">
                <span className="text-blue-600 font-semibold">3</span>
              </div>
              <div>
                <h3 className="font-medium text-gray-900">استقبل الرسائل</h3>
                <p className="text-sm text-gray-600">جميع رسائل Messenger ستظهر في نظام الـ CRM تلقائياً</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
