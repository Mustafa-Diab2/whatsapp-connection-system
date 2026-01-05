'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Facebook, CheckCircle, XCircle, RefreshCw } from 'lucide-react';
import { useSupabase } from '@/lib/supabase';

export default function MessengerCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, organizationId } = useSupabase();
  const [status, setStatus] = useState<'loading' | 'selecting' | 'success' | 'error'>('loading');
  const [error, setError] = useState('');
  const [pages, setPages] = useState<any[]>([]);
  const [accessToken, setAccessToken] = useState('');

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    const code = searchParams.get('code');
    const errorParam = searchParams.get('error');

    if (errorParam) {
      setStatus('error');
      setError(searchParams.get('error_description') || 'تم رفض الوصول');
      return;
    }

    if (code) {
      exchangeCodeForToken(code);
    }
  }, [searchParams]);

  const exchangeCodeForToken = async (code: string) => {
    try {
      // Exchange code for access token
      const appId = process.env.NEXT_PUBLIC_FB_APP_ID;
      const appSecret = process.env.NEXT_PUBLIC_FB_APP_SECRET;
      const redirectUri = `${window.location.origin}/integrations/messenger/callback`;

      const tokenRes = await fetch(
        `https://graph.facebook.com/v21.0/oauth/access_token?client_id=${appId}&redirect_uri=${redirectUri}&client_secret=${appSecret}&code=${code}`
      );
      const tokenData = await tokenRes.json();

      if (tokenData.error) {
        throw new Error(tokenData.error.message);
      }

      setAccessToken(tokenData.access_token);

      // Get user's pages
      const pagesRes = await fetch(
        `https://graph.facebook.com/v21.0/me/accounts?fields=id,name,picture,access_token&access_token=${tokenData.access_token}`
      );
      const pagesData = await pagesRes.json();

      if (pagesData.error) {
        throw new Error(pagesData.error.message);
      }

      if (!pagesData.data || pagesData.data.length === 0) {
        setStatus('error');
        setError('لا توجد صفحات متاحة. تأكد من أنك مسؤول عن صفحة واحدة على الأقل.');
        return;
      }

      setPages(pagesData.data);
      setStatus('selecting');
    } catch (err: any) {
      console.error('Token exchange error:', err);
      setStatus('error');
      setError(err.message || 'حدث خطأ أثناء الربط');
    }
  };

  const connectPage = async (page: any) => {
    setStatus('loading');
    try {
      const res = await fetch(`${API_URL}/api/messenger/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify({
          access_token: page.access_token,
          page_id: page.id,
        }),
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'فشل ربط الصفحة');
      }

      setStatus('success');
      setTimeout(() => {
        router.push('/integrations/messenger');
      }, 2000);
    } catch (err: any) {
      console.error('Connect error:', err);
      setStatus('error');
      setError(err.message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8">
        {status === 'loading' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <RefreshCw className="w-8 h-8 text-blue-600 animate-spin" />
            </div>
            <h2 className="text-xl font-bold mb-2">جاري الربط</h2>
            <p className="text-gray-500">يرجى الانتظار...</p>
          </div>
        )}

        {status === 'selecting' && (
          <div>
            <div className="text-center mb-6">
              <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                <Facebook className="w-8 h-8 text-blue-600" />
              </div>
              <h2 className="text-xl font-bold mb-2">اختر صفحة</h2>
              <p className="text-gray-500">اختر الصفحة التي تريد ربطها</p>
            </div>

            <div className="space-y-3">
              {pages.map((page) => (
                <button
                  key={page.id}
                  onClick={() => connectPage(page)}
                  className="w-full p-4 border rounded-xl hover:bg-blue-50 hover:border-blue-500 transition-colors flex items-center gap-4"
                >
                  <img
                    src={page.picture?.data?.url || '/default-page.png'}
                    alt={page.name}
                    className="w-12 h-12 rounded-lg"
                  />
                  <div className="text-right flex-1">
                    <h3 className="font-medium">{page.name}</h3>
                    <p className="text-sm text-gray-500">ID: {page.id}</p>
                  </div>
                </button>
              ))}
            </div>

            <button
              onClick={() => router.push('/integrations/messenger')}
              className="w-full mt-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg"
            >
              إلغاء
            </button>
          </div>
        )}

        {status === 'success' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">تم الربط بنجاح!</h2>
            <p className="text-gray-500">جاري التحويل...</p>
          </div>
        )}

        {status === 'error' && (
          <div className="text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h2 className="text-xl font-bold mb-2">حدث خطأ</h2>
            <p className="text-gray-500 mb-6">{error}</p>
            <button
              onClick={() => router.push('/integrations/messenger')}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              العودة
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
