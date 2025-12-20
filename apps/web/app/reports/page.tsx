"use client";

import { useState } from "react";

const stats = [
    { label: "رسائل مرسلة", value: 1234, change: "+12%", color: "text-blue-600" },
    { label: "رسائل مستلمة", value: 5678, change: "+8%", color: "text-green-600" },
    { label: "عملاء جدد", value: 45, change: "+23%", color: "text-purple-600" },
    { label: "معدل الرد", value: "2.3 دقيقة", change: "-15%", color: "text-amber-600" },
];

const recentMessages = [
    { id: 1, customer: "أحمد محمد", message: "شكراً لكم على الخدمة الممتازة", time: "منذ 5 دقائق", type: "incoming" },
    { id: 2, customer: "سارة علي", message: "متى سيتم التوصيل؟", time: "منذ 15 دقيقة", type: "incoming" },
    { id: 3, customer: "محمود خالد", message: "تم استلام الطلب بنجاح", time: "منذ 30 دقيقة", type: "outgoing" },
    { id: 4, customer: "نور أحمد", message: "هل يوجد عروض حالياً؟", time: "منذ ساعة", type: "incoming" },
];

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
                {stats.map((stat, i) => (
                    <div key={i} className="card p-6">
                        <p className="text-sm text-slate-500">{stat.label}</p>
                        <p className={`text-3xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
                        <p className={`text-sm mt-2 ${stat.change.startsWith('+') ? 'text-green-600' : 'text-red-600'}`}>
                            {stat.change} من الفترة السابقة
                        </p>
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
                                        className="h-full bg-gradient-to-r from-brand-blue to-blue-400 rounded-full"
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
                                        className="h-full bg-gradient-to-r from-green-500 to-emerald-400 rounded-full"
                                        style={{ width: `${(d.customers / 18) * 100}%` }}
                                    />
                                </div>
                                <span className="w-12 text-sm font-medium text-slate-700">{d.customers}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>

            {/* Recent Activity */}
            <div className="card p-6">
                <h3 className="font-semibold text-slate-800 mb-4">آخر النشاطات</h3>
                <div className="divide-y divide-slate-100">
                    {recentMessages.map((msg) => (
                        <div key={msg.id} className="flex items-center justify-between py-3">
                            <div className="flex items-center gap-3">
                                <div className={`w-10 h-10 rounded-full flex items-center justify-center ${msg.type === 'incoming' ? 'bg-green-100 text-green-600' : 'bg-blue-100 text-blue-600'}`}>
                                    {msg.type === 'incoming' ? '📥' : '📤'}
                                </div>
                                <div>
                                    <p className="font-medium text-slate-800">{msg.customer}</p>
                                    <p className="text-sm text-slate-500 truncate max-w-[300px]">{msg.message}</p>
                                </div>
                            </div>
                            <span className="text-xs text-slate-400">{msg.time}</span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
