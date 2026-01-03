"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import { useParams, useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function InvoiceDetailPage() {
    const { id } = useParams();
    const router = useRouter();
    const [invoice, setInvoice] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchInvoice = async () => {
            try {
                const token = localStorage.getItem("token");
                const res = await axios.get(`${API_URL}/api/invoices/${id}`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                setInvoice(res.data.invoice);
            } catch (err) {
                console.error("Fetch invoice failed", err);
            } finally {
                setLoading(false);
            }
        };
        if (id) fetchInvoice();
    }, [id]);

    if (loading) return <div className="p-20 text-center font-bold">جاري تحميل الفاتورة...</div>;
    if (!invoice) return <div className="p-20 text-center text-red-500 font-bold">الفاتورة غير موجودة</div>;

    const handlePrint = () => {
        window.print();
    };

    return (
        <div className="min-h-screen bg-slate-100/50 p-6 md:p-10 flex flex-col items-center">
            {/* Action Bar - Hidden in Print */}
            <div className="w-full max-w-4xl mb-8 flex justify-between items-center print:hidden">
                <button
                    onClick={() => router.back()}
                    className="px-6 py-3 bg-white border border-slate-200 rounded-2xl text-sm font-black text-slate-600 hover:bg-slate-50 shadow-sm"
                >
                    ← العودة للقائمة
                </button>
                <div className="flex gap-4">
                    <button
                        onClick={handlePrint}
                        className="px-8 py-3 bg-slate-900 text-white rounded-2xl text-sm font-black shadow-xl shadow-slate-300 hover:bg-black"
                    >
                        طباعة الفاتورة 🖨️
                    </button>
                    <button className="px-8 py-3 bg-brand-blue text-white rounded-2xl text-sm font-black shadow-xl shadow-blue-200 hover:bg-blue-700">
                        إرسال عبر واتساب 📱
                    </button>
                </div>
            </div>

            {/* Invoice Paper */}
            <div className="w-full max-w-4xl bg-white shadow-2xl rounded-[3rem] overflow-hidden print:shadow-none print:rounded-none">
                {/* Invoice Header */}
                <div className="bg-slate-900 p-12 text-white flex justify-between items-start">
                    <div>
                        <h1 className="text-4xl font-black tracking-tighter mb-4">INVOICE</h1>
                        <div className="space-y-1">
                            <p className="text-xs font-black uppercase text-slate-400 tracking-widest">رقم الفاتورة</p>
                            <p className="text-xl font-bold">{invoice.invoice_number}</p>
                        </div>
                    </div>
                    <div className="text-right">
                        <div className="h-16 w-16 bg-white/10 rounded-2xl flex items-center justify-center text-3xl mb-4 ml-auto">🚀</div>
                        <p className="font-black text-lg">مؤسسة الحلول المتكاملة</p>
                        <p className="text-sm text-slate-400 font-medium text-left">عمان، الأردن</p>
                        <p className="text-sm text-slate-400 font-medium text-left">info@example.com</p>
                    </div>
                </div>

                <div className="p-12">
                    {/* Billing Info */}
                    <div className="grid grid-cols-2 gap-12 mb-16">
                        <div className="text-right">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4">فاتورة لـ:</h3>
                            <p className="text-xl font-black text-slate-900 mb-1">{invoice.customer?.name || 'عميل نقدي'}</p>
                            <p className="text-sm font-bold text-slate-500 mb-1">{invoice.customer?.phone || ''}</p>
                            <p className="text-sm text-slate-400">{invoice.customer?.email || ''}</p>
                        </div>
                        <div className="text-left">
                            <h3 className="text-[10px] font-black uppercase text-slate-400 tracking-[0.2em] mb-4">تفاصيل الدفع:</h3>
                            <div className="space-y-3">
                                <div className="flex justify-end gap-10">
                                    <span className="text-sm text-slate-500 font-bold">تاريخ الإصدار:</span>
                                    <span className="text-sm font-black text-slate-900">{new Date(invoice.created_at).toLocaleDateString("ar-EG")}</span>
                                </div>
                                <div className="flex justify-end gap-10">
                                    <span className="text-sm text-slate-500 font-bold">تاريخ الاستحقاق:</span>
                                    <span className="text-sm font-black text-slate-900 font-black">{new Date(invoice.due_date).toLocaleDateString("ar-EG")}</span>
                                </div>
                                <div className="flex justify-end gap-10">
                                    <span className="text-sm text-slate-500 font-bold">الحالة:</span>
                                    <span className={`text-xs font-black px-3 py-1 rounded-lg ${invoice.status === 'paid' ? 'bg-emerald-50 text-emerald-600' : 'bg-blue-50 text-blue-600'}`}>
                                        {invoice.status === 'paid' ? 'مدفوعة' : 'بانتظار التحصيل'}
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Table */}
                    <div className="border border-slate-100 rounded-[2rem] overflow-hidden mb-12">
                        <table className="w-full text-right">
                            <thead>
                                <tr className="bg-slate-50 border-b border-slate-100">
                                    <th className="px-8 py-5 text-xs font-black text-slate-900 uppercase">الصنف</th>
                                    <th className="px-8 py-5 text-xs font-black text-slate-900 uppercase">الكمية</th>
                                    <th className="px-8 py-5 text-xs font-black text-slate-900 uppercase">سعر الوحدة</th>
                                    <th className="px-8 py-5 text-xs font-black text-slate-900 uppercase">الإجمالي</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {invoice.order?.order_items?.map((item: any, idx: number) => (
                                    <tr key={idx}>
                                        <td className="px-8 py-5">
                                            <p className="font-black text-slate-800">{item.product?.name || 'صنف مخصص'}</p>
                                            <p className="text-[10px] text-slate-400 font-bold italic">{item.product?.sku || ''}</p>
                                        </td>
                                        <td className="px-8 py-5 text-sm font-black text-slate-600">{item.quantity}</td>
                                        <td className="px-8 py-5 text-sm font-black text-slate-600">{Number(item.unit_price).toLocaleString()} JOD</td>
                                        <td className="px-8 py-5 text-sm font-black text-slate-900">{Number(item.quantity * item.unit_price).toLocaleString()} JOD</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>

                    {/* Summary */}
                    <div className="flex justify-end">
                        <div className="w-80 space-y-4">
                            <div className="flex justify-between items-center px-4">
                                <span className="text-sm font-bold text-slate-400">المبلغ الفرعي:</span>
                                <span className="text-sm font-black text-slate-900">{Number(invoice.total_amount).toLocaleString()} JOD</span>
                            </div>
                            <div className="flex justify-between items-center px-4">
                                <span className="text-sm font-bold text-slate-400">الضريبة (0%):</span>
                                <span className="text-sm font-black text-slate-900">0.00 JOD</span>
                            </div>
                            <div className="h-px bg-slate-100 w-full my-4"></div>
                            <div className="flex justify-between items-center bg-slate-900 text-white p-6 rounded-[2rem] shadow-xl">
                                <span className="text-sm font-black uppercase tracking-widest opacity-70">الإجمالي النهائي</span>
                                <span className="text-2xl font-black">{Number(invoice.total_amount).toLocaleString()} JOD</span>
                            </div>
                        </div>
                    </div>

                    {/* Footer */}
                    <div className="mt-20 pt-10 border-t border-slate-50 text-center">
                        <p className="text-xs font-bold text-slate-400 mb-2">شكراً لتعاملكم معنا، نسعد بخدمتكم دائماً</p>
                        <p className="text-[10px] uppercase font-black tracking-widest text-slate-300">هذه فاتورة تم إنشاؤها آلياً بنظام Awfar ERP</p>
                    </div>
                </div>
            </div>

            {/* Print Safe Styles */}
            <style jsx global>{`
        @media print {
          body { background: white !important; }
          .print-safe { padding: 0 !important; margin: 0 !important; }
          header, footer, nav, aside { display: none !important; }
        }
      `}</style>
        </div>
    );
}
