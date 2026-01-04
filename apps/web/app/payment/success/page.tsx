'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { CheckCircle, ArrowLeft, MessageCircle } from 'lucide-react';
import Link from 'next/link';

export default function PaymentSuccessPage() {
  const searchParams = useSearchParams();
  const code = searchParams.get('code');
  const [paymentDetails, setPaymentDetails] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (code) {
      fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/payments/link/${code}`)
        .then(res => res.json())
        .then(data => {
          setPaymentDetails(data.paymentLink);
          setLoading(false);
        })
        .catch(() => setLoading(false));
    } else {
      setLoading(false);
    }
  }, [code]);

  return (
    <div className="min-h-screen bg-gradient-to-br from-green-50 to-emerald-100 flex items-center justify-center p-4" dir="rtl">
      <div className="bg-white rounded-2xl shadow-xl p-8 max-w-md w-full text-center">
        {/* Success Animation */}
        <div className="relative mb-6">
          <div className="w-24 h-24 mx-auto bg-green-100 rounded-full flex items-center justify-center animate-pulse">
            <CheckCircle className="w-14 h-14 text-green-600" />
          </div>
          <div className="absolute -top-2 -right-2 w-32 h-32 bg-green-200 rounded-full opacity-30 animate-ping" style={{ animationDuration: '2s' }} />
        </div>

        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          تم الدفع بنجاح! 🎉
        </h1>
        
        <p className="text-gray-600 mb-6">
          شكراً لك! تم استلام الدفع وسيتم معالجة طلبك قريباً.
        </p>

        {!loading && paymentDetails && (
          <div className="bg-gray-50 rounded-xl p-4 mb-6 text-right">
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-500">رقم العملية</span>
              <span className="font-mono text-sm bg-gray-200 px-2 py-1 rounded">{code}</span>
            </div>
            <div className="flex justify-between items-center mb-2">
              <span className="text-gray-500">المبلغ</span>
              <span className="font-bold text-green-600">{paymentDetails.amount?.toFixed(2)} ج.م</span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">الوصف</span>
              <span className="text-gray-900">{paymentDetails.description}</span>
            </div>
          </div>
        )}

        <div className="space-y-3">
          <a 
            href="https://wa.me/20XXXXXXXXXX" 
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white py-3 px-4 rounded-xl font-medium transition-colors"
          >
            <MessageCircle className="w-5 h-5" />
            تواصل معنا على واتساب
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
          ستصلك رسالة تأكيد على الواتساب قريباً
        </p>
      </div>
    </div>
  );
}
