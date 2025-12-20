"use client";

import { useState } from "react";

type Addon = {
    id: string;
    name: string;
    description: string;
    icon: string;
    installed: boolean;
    price: string;
    category: string;
};

const addons: Addon[] = [
    { id: "1", name: "تكامل Shopify", description: "ربط متجرك على Shopify لإرسال تحديثات الطلبات تلقائياً", icon: "🛒", installed: true, price: "مجاني", category: "تكاملات" },
    { id: "2", name: "تكامل WooCommerce", description: "ربط متجرك على WooCommerce مع WhatsApp", icon: "🏪", installed: false, price: "$9/شهر", category: "تكاملات" },
    { id: "3", name: "جدولة الرسائل", description: "إرسال رسائل مجدولة في وقت محدد", icon: "⏰", installed: true, price: "مجاني", category: "أدوات" },
    { id: "4", name: "تحليلات متقدمة", description: "تقارير وإحصائيات تفصيلية عن المحادثات", icon: "📊", installed: false, price: "$19/شهر", category: "تحليلات" },
    { id: "5", name: "قوالب الرسائل", description: "قوالب جاهزة للردود السريعة", icon: "📝", installed: true, price: "مجاني", category: "أدوات" },
    { id: "6", name: "تكامل Zapier", description: "ربط مع آلاف التطبيقات عبر Zapier", icon: "⚡", installed: false, price: "$15/شهر", category: "تكاملات" },
    { id: "7", name: "نظام التذاكر", description: "نظام متكامل لإدارة تذاكر الدعم", icon: "🎫", installed: false, price: "$12/شهر", category: "أدوات" },
    { id: "8", name: "تصدير البيانات", description: "تصدير المحادثات والعملاء بصيغ متعددة", icon: "📤", installed: true, price: "مجاني", category: "أدوات" },
];

export default function AddonsPage() {
    const [installedAddons, setInstalledAddons] = useState<string[]>(
        addons.filter((a) => a.installed).map((a) => a.id)
    );
    const [filter, setFilter] = useState("all");

    const toggleAddon = (id: string) => {
        setInstalledAddons((prev) =>
            prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]
        );
    };

    const categories = ["all", ...new Set(addons.map((a) => a.category))];
    const filteredAddons = filter === "all" ? addons : addons.filter((a) => a.category === filter);

    return (
        <div className="space-y-6">
            <div>
                <h1 className="text-2xl font-extrabold text-slate-900">الإضافات</h1>
                <p className="text-slate-500">قم بتوسيع إمكانيات النظام بإضافات متنوعة</p>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="card p-4 text-center">
                    <p className="text-3xl font-bold text-brand-blue">{addons.length}</p>
                    <p className="text-sm text-slate-500">إضافة متاحة</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-3xl font-bold text-green-600">{installedAddons.length}</p>
                    <p className="text-sm text-slate-500">مثبتة</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-3xl font-bold text-purple-600">{addons.filter(a => a.price === "مجاني").length}</p>
                    <p className="text-sm text-slate-500">مجانية</p>
                </div>
            </div>

            {/* Filter */}
            <div className="flex gap-2 flex-wrap">
                {categories.map((cat) => (
                    <button
                        key={cat}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === cat ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        onClick={() => setFilter(cat)}
                    >
                        {cat === "all" ? "الكل" : cat}
                    </button>
                ))}
            </div>

            {/* Addons Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredAddons.map((addon) => {
                    const isInstalled = installedAddons.includes(addon.id);
                    return (
                        <div key={addon.id} className="card p-6 space-y-4">
                            <div className="flex items-start justify-between">
                                <div className="w-14 h-14 bg-gradient-to-br from-slate-100 to-slate-200 rounded-xl flex items-center justify-center text-2xl">
                                    {addon.icon}
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${addon.price === "مجاني" ? 'bg-green-100 text-green-700' : 'bg-purple-100 text-purple-700'}`}>
                                    {addon.price}
                                </span>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-800">{addon.name}</h3>
                                <p className="text-sm text-slate-500 mt-1">{addon.description}</p>
                            </div>
                            <button
                                className={`w-full btn py-2.5 transition ${isInstalled ? 'bg-red-50 text-red-600 hover:bg-red-100' : 'bg-brand-blue text-white hover:bg-blue-700'}`}
                                onClick={() => toggleAddon(addon.id)}
                            >
                                {isInstalled ? "إلغاء التثبيت" : "تثبيت"}
                            </button>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
