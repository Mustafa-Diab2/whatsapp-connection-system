"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";
import Link from "next/link";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Invoice {
    id: string;
    invoice_number: string;
    total_amount: number;
    status: "sent" | "paid" | "overdue" | "cancelled";
    due_date: string;
    created_at: string;
    customer?: { name: string; phone: string };
    order?: { order_number: number };
}

export default function InvoicesPage() {
    const [invoices, setInvoices] = useState<Invoice[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchInvoices = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_URL}/api/invoices`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setInvoices(res.data.invoices || []);
        } catch (err) {
            console.error("Fetch invoices failed", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchInvoices();
    }, [fetchInvoices]);

    const getStatusBadge = (status: string) => {
        const map: any = {
            sent: "bg-blue-50 text-blue-600 border-blue-100",
            paid: "bg-emerald-50 text-emerald-600 border-emerald-100",
            overdue: "bg-rose-50 text-rose-600 border-rose-100",
            cancelled: "bg-slate-50 text-slate-500 border-slate-100",
        };
        return map[status] || "bg-slate-50";
    };

    const getStatusText = (status: string) => {
        const map: any = {
            sent: "تم الإرسال",
            paid: "تم الدفع ✓",
            overdue: "متأخرة",
            cancelled: "ملغاة",
        };
        return map[status] || status;
    };

    return (
        <div className="min-h-screen bg-slate-50/30 p-6 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-10 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">الفواتير والمطالبات المالية</h1>
                    <p className="text-slate-500 font-medium">عرض وإدارة الحسابات المالية لفواتير المبيعات</p>
                </div>
                <div className="flex bg-white p-1.5 rounded-2xl border border-slate-100 shadow-sm">
                    <button className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black shadow-lg shadow-slate-200">الكل</button>
                    <button className="px-6 py-2.5 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-50">بانتظار الدفع</button>
                    <button className="px-6 py-2.5 text-slate-500 rounded-xl text-xs font-black hover:bg-slate-50">متأخرة</button>
                </div>
            </div>

            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">رقم الفاتورة</th>
                                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">العميل</th>
                                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">رقم الطلب</th>
                                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">المبلغ المستحق</th>
                                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">تاريخ الاستحقاق</th>
                                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">الحالة</th>
                                <th className="px-10 py-6 text-[10px] font-black text-slate-400 uppercase tracking-[0.2em]">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan={7} className="p-32 text-center"><div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-blue border-t-transparent mx-auto"></div></td></tr>
                            ) : invoices.length === 0 ? (
                                <tr><td colSpan={7} className="p-32 text-center flex flex-col items-center gap-4">
                                    <div className="text-6xl opacity-20">🧾</div>
                                    <p className="text-slate-400 font-bold italic text-xl">لا توجد فواتير صادرة حالياً</p>
                                </td></tr>
                            ) : invoices.map(invoice => (
                                <tr key={invoice.id} className="hover:bg-slate-50/80 transition-all group">
                                    <td className="px-10 py-6">
                                        <span className="font-black text-slate-900 flex items-center gap-2">
                                            <span className="h-2 w-2 rounded-full bg-indigo-500"></span>
                                            {invoice.invoice_number}
                                        </span>
                                    </td>
                                    <td className="px-10 py-6">
                                        <p className="font-bold text-slate-700 leading-none">{invoice.customer?.name || "عميل نقدي"}</p>
                                        <p className="text-[10px] text-slate-400 mt-1 font-bold">{invoice.customer?.phone || ""}</p>
                                    </td>
                                    <td className="px-10 py-6">
                                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-3 py-1 rounded-lg">#{invoice.order?.order_number}</span>
                                    </td>
                                    <td className="px-10 py-6">
                                        <div className="flex items-baseline gap-1">
                                            <span className="font-black text-brand-blue text-lg">{Number(invoice.total_amount).toLocaleString()}</span>
                                            <span className="text-[10px] font-bold text-slate-400">JOD</span>
                                        </div>
                                    </td>
                                    <td className="px-10 py-6">
                                        <p className={`text-xs font-black ${new Date(invoice.due_date) < new Date() && invoice.status !== 'paid' ? 'text-red-500' : 'text-slate-600'}`}>
                                            {new Date(invoice.due_date).toLocaleDateString("ar-EG")}
                                        </p>
                                    </td>
                                    <td className="px-10 py-6">
                                        <span className={`px-4 py-2 border rounded-2xl text-[10px] font-black uppercase tracking-wide inline-block ${getStatusBadge(invoice.status)}`}>
                                            {getStatusText(invoice.status)}
                                        </span>
                                    </td>
                                    <td className="px-10 py-6 text-left">
                                        <Link
                                            href={`/invoices/${invoice.id}`}
                                            className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:bg-brand-blue hover:text-white hover:border-brand-blue transition-all shadow-sm"
                                        >
                                            👁️
                                        </Link>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            <div className="mt-10 grid grid-cols-1 md:grid-cols-3 gap-6">
                <div className="bg-emerald-500/5 border border-emerald-500/10 p-8 rounded-[2.5rem] relative overflow-hidden">
                    <div className="absolute top-4 right-4 text-3xl opacity-20">💰</div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-emerald-600/60 mb-1">المبالغ المحصلة</p>
                    <p className="text-3xl font-black text-emerald-600">
                        {invoices.filter(i => i.status === 'paid').reduce((acc, i) => acc + Number(i.total_amount), 0).toLocaleString()} <span className="text-xs">JOD</span>
                    </p>
                </div>
                <div className="bg-indigo-500/5 border border-indigo-500/10 p-8 rounded-[2.5rem] relative overflow-hidden">
                    <div className="absolute top-4 right-4 text-3xl opacity-20">📩</div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600/60 mb-1">المبالغ بانتظار التحصيل</p>
                    <p className="text-3xl font-black text-indigo-600">
                        {invoices.filter(i => i.status === 'sent').reduce((acc, i) => acc + Number(i.total_amount), 0).toLocaleString()} <span className="text-xs">JOD</span>
                    </p>
                </div>
                <div className="bg-rose-500/5 border border-rose-500/10 p-8 rounded-[2.5rem] relative overflow-hidden">
                    <div className="absolute top-4 right-4 text-3xl opacity-20">⏰</div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-rose-600/60 mb-1">مبالغ متأخرة</p>
                    <p className="text-3xl font-black text-rose-600">
                        {invoices.filter(i => i.status === 'overdue').reduce((acc, i) => acc + Number(i.total_amount), 0).toLocaleString()} <span className="text-xs">JOD</span>
                    </p>
                </div>
            </div>
        </div>
    );
}
