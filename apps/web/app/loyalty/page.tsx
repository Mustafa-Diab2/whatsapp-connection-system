"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface CustomerPoints {
    id: string;
    name: string;
    phone: string;
    loyalty_points: number;
}

export default function LoyaltyPage() {
    const [customers, setCustomers] = useState<CustomerPoints[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_URL}/api/customers`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            // Sort by points descending
            const sorted = (res.data.customers || []).sort((a: any, b: any) => (b.loyalty_points || 0) - (a.loyalty_points || 0));
            setCustomers(sorted);
        } catch (err) {
            console.error("Fetch loyalty failed", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const filteredCustomers = customers.filter(c =>
        c.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
        c.phone.includes(searchTerm)
    );

    return (
        <div className="min-h-screen bg-slate-50/30 p-6 md:p-10">
            <div className="mb-10 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight flex items-center gap-3">
                        <span className="text-amber-500">🌟</span> نظام نقاط الولاء
                    </h1>
                    <p className="text-slate-500 font-medium">كافئ عملائك الأكثر تفاعلاً وزد من نسبة المبيعات المتكررة</p>
                </div>
                <div className="bg-white p-2 rounded-2xl border border-slate-100 shadow-sm flex items-center gap-4 px-6 py-3">
                    <div className="text-right">
                        <p className="text-[10px] font-black text-slate-400 uppercase">قاعدة المكافأة</p>
                        <p className="text-sm font-black text-slate-900">1 JOD = 1 نقطة</p>
                    </div>
                    <div className="h-8 w-px bg-slate-100"></div>
                    <button className="text-xs font-black text-brand-blue hover:underline">تعديل القواعد</button>
                </div>
            </div>

            {/* Top 3 Billboard */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                {customers.slice(0, 3).map((c, i) => (
                    <div key={c.id} className={`p-8 rounded-[3rem] shadow-2xl relative overflow-hidden text-white ${i === 0 ? 'bg-gradient-to-br from-amber-400 to-orange-600 scale-105 z-10' :
                            i === 1 ? 'bg-slate-800' : 'bg-slate-700'
                        }`}>
                        <div className="absolute -right-4 -top-4 text-6xl opacity-20">{i === 0 ? '🥇' : i === 1 ? '🥈' : '🥉'}</div>
                        <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-2">عميل VIP #{i + 1}</p>
                        <h3 className="text-2xl font-black mb-1 truncate">{c.name}</h3>
                        <p className="text-xs font-bold opacity-60 mb-6">{c.phone}</p>
                        <div className="flex items-baseline gap-2">
                            <span className="text-4xl font-black">{c.loyalty_points || 0}</span>
                            <span className="text-sm font-bold opacity-70">نقطة</span>
                        </div>
                    </div>
                ))}
            </div>

            <div className="bg-white rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40 overflow-hidden">
                <div className="p-8 border-b border-slate-50 flex flex-col md:flex-row gap-4 justify-between items-center bg-slate-50/30">
                    <h3 className="text-lg font-black text-slate-900">قائمة النقاط الكاملة</h3>
                    <div className="relative w-full md:w-80">
                        <span className="absolute right-4 top-1/2 -translate-y-1/2 opacity-30">🔍</span>
                        <input
                            type="text"
                            placeholder="ابحث باسم العميل..."
                            className="w-full bg-white border border-slate-200 rounded-2xl py-3 pr-12 pl-4 text-sm font-bold outline-none focus:border-brand-blue transition-all"
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                        />
                    </div>
                </div>
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead>
                            <tr className="bg-slate-50/50">
                                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">العميل</th>
                                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">الرصيد الحالي</th>
                                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">مستوى الولاء</th>
                                <th className="px-10 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan={4} className="p-20 text-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent mx-auto"></div></td></tr>
                            ) : filteredCustomers.map(c => (
                                <tr key={c.id} className="hover:bg-slate-50/80 transition-all group">
                                    <td className="px-10 py-6">
                                        <p className="font-black text-slate-800">{c.name}</p>
                                        <p className="text-[10px] text-slate-400 font-bold">{c.phone}</p>
                                    </td>
                                    <td className="px-10 py-6 text-center">
                                        <span className="text-xl font-black text-slate-900">{c.loyalty_points || 0}</span>
                                    </td>
                                    <td className="px-10 py-6">
                                        {(c.loyalty_points || 0) > 500 ? (
                                            <span className="px-3 py-1 bg-purple-50 text-purple-600 rounded-lg text-[10px] font-black">🌟 نـخـبـة (Platinum)</span>
                                        ) : (c.loyalty_points || 0) > 200 ? (
                                            <span className="px-3 py-1 bg-amber-50 text-amber-600 rounded-lg text-[10px] font-black">🥇 ذهـبـي (Gold)</span>
                                        ) : (
                                            <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-lg text-[10px] font-black">🥉 عـادي (Starter)</span>
                                        )}
                                    </td>
                                    <td className="px-10 py-6">
                                        <button className="text-[10px] font-black text-brand-blue bg-blue-50 px-4 py-2 rounded-xl hover:bg-brand-blue hover:text-white transition-all">ارسال مكافأة 🎁</button>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
