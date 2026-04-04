'use client';

import { useSearchParams } from 'next/navigation';
import { XCircle, ArrowLeft, RefreshCw, MessageCircle } from 'lucide-react';
import Link from 'next/link';

export default function PaymentCancelPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');

  return (
    <div className="min-h-screen bg-gradient-to-br from-red-50 to-orange-100 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {/* Cancel Animation */}
        <div className="relative mb-6">
          <div className="w-24 h-24 mx-auto bg-red-100 rounded-full flex items-center justify-center">
            <XCircle className="w-14 h-14 text-red-600" />
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          تم إلغاء الدفع
        </h1>
        
        <p className="text-gray-600 mb-6">
          لا تقلق! لم يتم خصم أي مبلغ من حسابك.
          <br />
          يمكنك المحاولة مرة أخرى أو التواصل معنا للمساعدة.
        </p>

        {code && (
          <div className="bg-gray-50 rounded-xl p-4 mb-6">
            <p className="text-sm text-gray-500">رقم العملية</p>
            <p className="font-mono text-lg">{code}</p>
          </div>
        )}

        <div className="space-y-3">
          {code && (
            <Link 
              href={`/payment/retry?code=${code}`}
              className="flex items-center justify-center gap-2 w-full bg-blue-600 hover:bg-blue-700 text-white py-3 px-4 rounded-xl font-medium transition-colors"
            >
              <RefreshCw className="w-5 h-5" />
              حاول مرة أخرى
            </Link>
          )}
          
          <a 
            href="https://wa.me/20XXXXXXXXXX" 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-xl font-medium transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            تواصل معنا للمساعدة
          </a>
          
          <Link 
            href="/"
            className="flex items-center justify-center gap-2 w-full bg-gray-100 hover:bg-gray-200 text-gray-700 py-3 px-4 rounded-xl font-medium transition-colors"
          >
            <ArrowLeft className="w-5 h-5" />
            العودة للرئيسية
          </Link>
        </div>

        <p className="text-xs text-gray-400 mt-6">
          إذا واجهت أي مشكلة، فريقنا جاهز لمساعدتك
        </p>
      </div>
    </div>
  );
}
