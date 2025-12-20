"use client";

import { useState, useEffect, useCallback } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const dailyData = [
    { day: "السبت", messages: 120, customers: 8 },
    { day: "الأحد", messages: 180, customers: 12 },
    { day: "الاثنين", messages: 150, customers: 10 },
    { day: "الثلاثاء", messages: 200, customers: 15 },
    { day: "الأربعاء", messages: 170, customers: 11 },
    { day: "الخميس", messages: 220, customers: 18 },
    { day: "الجمعة", messages: 90, customers: 5 },
];

export default function ReportsPage() {
    const [period, setPeriod] = useState("week");
    const [stats, setStats] = useState({
        totalCustomers: 0,
        activeCustomers: 0,
        totalContacts: 0,
        openThreads: 0,
        pendingThreads: 0,
    });
    const [loading, setLoading] = useState(true);

    const fetchStats = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase}/api/reports/stats`);
            const data = await res.json();
            setStats(data);
        } catch (err) {
            console.error("Failed to fetch stats:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchStats();
    }, [fetchStats]);

    const statsCards = [
        { label: "إجمالي العملاء", value: stats.totalCustomers, color: "text-blue-600" },
        { label: "عملاء نشطون", value: stats.activeCustomers, color: "text-green-600" },
        { label: "جهات الاتصال", value: stats.totalContacts, color: "text-purple-600" },
        { label: "مواضيع مفتوحة", value: stats.openThreads, color: "text-amber-600" },
    ];

    if (loading) {
        return <div className="text-center py-12 text-slate-500">جاري التحميل...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900">التقارير والإحصائيات</h1>
                    <p className="text-slate-500">نظرة شاملة على أداء النظام</p>
                </div>
                <select
                    className="p-3 rounded-xl border border-slate-200 outline-none bg-white"
                    value={period}
                    onChange={(e) => setPeriod(e.target.value)}
                >
                    <option value="today">اليوم</option>
                    <option value="week">هذا الأسبوع</option>
                    <option value="month">هذا الشهر</option>
                    <option value="year">هذه السنة</option>
                </select>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                {statsCards.map((stat, i) => (
                    <div key={i} className="card p-6">
                        <p className="text-sm text-slate-500">{stat.label}</p>
                        <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                    </div>
                ))}
            </div>

            {/* Charts Section */}
            <div className="grid md:grid-cols-2 gap-6">
                {/* Daily Messages Chart */}
                <div className="card p-6">
                    <h3 className="font-semibold text-slate-800 mb-4">الرسائل اليومية</h3>
                    <div className="space-y-3">
                        {dailyData.map((d, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <span className="w-16 text-sm text-slate-600">{d.day}</span>
                                <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-brand-blue to-blue-400 rounded-full transition-all duration-500"
                                        style={{ width: `${(d.messages / 220) * 100}%` }}
                                    />
                                </div>
                                <span className="w-12 text-sm font-medium text-slate-700">{d.messages}</span>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Customers Chart */}
                <div className="card p-6">
                    <h3 className="font-semibold text-slate-800 mb-4">العملاء الجدد</h3>
                    <div className="space-y-3">
                        {dailyData.map((d, i) => (
                            <div key={i} className="flex items-center gap-3">
                                <span className="w-16 text-sm text-slate-600">{d.day}</span>
                                <div className="flex-1 bg-slate-100 rounded-full h-6 overflow-hidden">
                                    <div
                                        className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full transition-all duration-500"
                                        style={{ width: `${(d.customers / 18) * 100}%` }}
                                    />
                                </div>
                                <span className="w-12 text-sm font-medium text-slate-700">{d.customers}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Summary Cards */}
            <div className="grid md:grid-cols-3 gap-4">
                <div className="card p-6 text-center bg-gradient-to-br from-blue-50 to-blue-100">
                    <div className="text-4xl mb-2">📊</div>
                    <p className="text-2xl font-bold text-blue-700">1,130</p>
                    <p className="text-sm text-blue-600">إجمالي الرسائل هذا الأسبوع</p>
                </div>
                <div className="card p-6 text-center bg-gradient-to-br from-green-50 to-green-100">
                    <div className="text-4xl mb-2">✅</div>
                    <p className="text-2xl font-bold text-green-700">94%</p>
                    <p className="text-sm text-green-600">معدل الرد على الرسائل</p>
                </div>
                <div className="card p-6 text-center bg-gradient-to-br from-purple-50 to-purple-100">
                    <div className="text-4xl mb-2">⏱️</div>
                    <p className="text-2xl font-bold text-purple-700">2.3 دقيقة</p>
                    <p className="text-sm text-purple-600">متوسط وقت الرد</p>
                </div>
            </div>
        </div>
    );
}
