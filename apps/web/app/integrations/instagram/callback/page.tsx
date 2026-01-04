'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Instagram, CheckCircle, XCircle, Loader } from 'lucide-react';
import { useSupabase } from '@/lib/supabase';

export default function InstagramCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { session, organizationId } = useSupabase();
  const [status, setStatus] = useState<'loading' | 'success' | 'error' | 'selecting'>('loading');
  const [error, setError] = useState('');
  const [pages, setPages] = useState<any[]>([]);
  const [selectedPage, setSelectedPage] = useState<string | null>(null);
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
      const tokenResponse = await fetch(
        `https://graph.facebook.com/v18.0/oauth/access_token?` +
        `client_id=${process.env.NEXT_PUBLIC_FACEBOOK_APP_ID}` +
        `&redirect_uri=${encodeURIComponent(window.location.origin + '/integrations/instagram/callback')}` +
        `&client_secret=${process.env.NEXT_PUBLIC_FACEBOOK_APP_SECRET}` +
        `&code=${code}`
      );
      
      const tokenData = await tokenResponse.json();
      
      if (tokenData.error) {
        throw new Error(tokenData.error.message);
      }

      // Get pages with Instagram
      const pagesResponse = await fetch(
        `https://graph.facebook.com/v18.0/me/accounts?fields=id,name,instagram_business_account{id,username,name,profile_picture_url}&access_token=${tokenData.access_token}`
      );
      
      const pagesData = await pagesResponse.json();
      
      if (pagesData.error) {
        throw new Error(pagesData.error.message);
      }

      // Filter pages with Instagram accounts
      const pagesWithInstagram = (pagesData.data || []).filter(
        (page: any) => page.instagram_business_account
      );

      if (pagesWithInstagram.length === 0) {
        throw new Error('لم يتم العثور على حسابات Instagram Business مرتبطة بصفحاتك');
      }

      if (pagesWithInstagram.length === 1) {
        // Auto-connect if only one page
        await connectInstagram(tokenData.access_token, pagesWithInstagram[0].id);
      } else {
        // Show page selection
        setPages(pagesWithInstagram);
        setAccessToken(tokenData.access_token);
        setStatus('selecting');
      }
    } catch (err: any) {
      console.error('Error exchanging code:', err);
      setStatus('error');
      setError(err.message || 'حدث خطأ أثناء الاتصال');
    }
  };

  const connectInstagram = async (token: string, pageId: string) => {
    try {
      const response = await fetch(`${API_URL}/api/instagram/connect`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify({
          access_token: token,
          page_id: pageId,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'فشل الاتصال');
      }

      setStatus('success');
      
      // Redirect after 2 seconds
      setTimeout(() => {
        router.push('/integrations/instagram');
      }, 2000);
    } catch (err: any) {
      console.error('Error connecting Instagram:', err);
      setStatus('error');
      setError(err.message || 'حدث خطأ أثناء ربط الحساب');
    }
  };

  const handlePageSelect = async () => {
    if (!selectedPage) return;
    setStatus('loading');
    await connectInstagram(accessToken, selectedPage);
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-pink-50 to-purple-50 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl max-w-md w-full p-8 text-center">
        {status === 'loading' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
              <Loader className="w-8 h-8 text-white animate-spin" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">جاري الاتصال...</h1>
            <p className="text-gray-500">يرجى الانتظار بينما نربط حسابك</p>
          </>
        )}

        {status === 'success' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 bg-green-100 rounded-full flex items-center justify-center">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">تم الربط بنجاح!</h1>
            <p className="text-gray-500 mb-4">تم ربط حساب Instagram الخاص بك</p>
            <p className="text-sm text-gray-400">جاري التحويل...</p>
          </>
        )}

        {status === 'error' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 bg-red-100 rounded-full flex items-center justify-center">
              <XCircle className="w-8 h-8 text-red-600" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">فشل الاتصال</h1>
            <p className="text-gray-500 mb-6">{error}</p>
            <div className="space-y-3">
              <button
                onClick={() => router.push('/integrations/instagram')}
                className="w-full py-3 bg-gray-100 text-gray-700 rounded-xl font-medium hover:bg-gray-200"
              >
                العودة
              </button>
            </div>
          </>
        )}

        {status === 'selecting' && (
          <>
            <div className="w-16 h-16 mx-auto mb-6 bg-gradient-to-r from-pink-500 to-purple-500 rounded-full flex items-center justify-center">
              <Instagram className="w-8 h-8 text-white" />
            </div>
            <h1 className="text-xl font-bold text-gray-900 mb-2">اختر الصفحة</h1>
            <p className="text-gray-500 mb-6">لديك عدة صفحات مرتبطة بحسابات Instagram</p>
            
            <div className="space-y-3 mb-6">
              {pages.map(page => (
                <div
                  key={page.id}
                  onClick={() => setSelectedPage(page.id)}
                  className={`flex items-center gap-3 p-4 border rounded-xl cursor-pointer transition-colors ${
                    selectedPage === page.id
                      ? 'border-pink-500 bg-pink-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <img
                    src={page.instagram_business_account?.profile_picture_url || `https://ui-avatars.com/api/?name=${page.name}&background=E1306C&color=fff`}
                    alt={page.name}
                    className="w-12 h-12 rounded-full"
                  />
                  <div className="flex-1 text-right">
                    <p className="font-medium text-gray-900">{page.name}</p>
                    <p className="text-sm text-gray-500">
                      @{page.instagram_business_account?.username}
                    </p>
                  </div>
                  {selectedPage === page.id && (
                    <CheckCircle className="w-5 h-5 text-pink-500" />
                  )}
                </div>
              ))}
            </div>

            <button
              onClick={handlePageSelect}
              disabled={!selectedPage}
              className="w-full py-3 bg-gradient-to-r from-pink-500 to-purple-500 text-white rounded-xl font-bold hover:opacity-90 disabled:opacity-50"
            >
              ربط الحساب
            </button>
          </>
        )}
      </div>
    </div>
  );
}
