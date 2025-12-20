"use client";

import { useState, useEffect, useCallback } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        companyName: "",
        welcomeMessage: "",
        autoReply: true,
        notifyNewMessage: true,
        notifyNewCustomer: true,
        language: "ar",
        theme: "light",
    });
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const fetchSettings = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase}/api/settings`);
            const data = await res.json();
            setSettings(data);
        } catch (err) {
            console.error("Failed to fetch settings:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchSettings();
    }, [fetchSettings]);

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const res = await fetch(`${apiBase}/api/settings`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(settings),
            });
            if (res.ok) {
                setMsg({ type: "success", text: "تم حفظ الإعدادات بنجاح!" });
            } else {
                throw new Error("Failed to save");
            }
        } catch (err) {
            setMsg({ type: "error", text: "فشل حفظ الإعدادات، حاول مرة أخرى." });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="text-center py-12 text-slate-500">جاري التحميل...</div>;
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div>
                <h1 className="text-2xl font-extrabold text-slate-900">الإعدادات</h1>
                <p className="text-slate-500">إدارة إعدادات النظام والتفضيلات</p>
            </div>

            {/* Company Settings */}
            <div className="card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">إعدادات الشركة</h2>

                <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">اسم الشركة</label>
                    <input
                        type="text"
                        className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                        value={settings.companyName}
                        onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                    />
                </div>

                <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">رسالة الترحيب</label>
                    <textarea
                        className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none min-h-[100px]"
                        value={settings.welcomeMessage}
                        onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
                    />
                </div>
            </div>

            {/* Notifications */}
            <div className="card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">الإشعارات</h2>

                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="font-medium text-slate-700">إشعار عند رسالة جديدة</p>
                        <p className="text-sm text-slate-500">استلم إشعار عند وصول رسالة جديدة</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings.notifyNewMessage}
                            onChange={(e) => setSettings({ ...settings, notifyNewMessage: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                    </label>
                </div>

                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="font-medium text-slate-700">إشعار عند عميل جديد</p>
                        <p className="text-sm text-slate-500">استلم إشعار عند إضافة عميل جديد</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings.notifyNewCustomer}
                            onChange={(e) => setSettings({ ...settings, notifyNewCustomer: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                    </label>
                </div>
            </div>

            {/* Appearance */}
            <div className="card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">المظهر</h2>

                <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">اللغة</label>
                    <select
                        className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                        value={settings.language}
                        onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                    >
                        <option value="ar">العربية</option>
                        <option value="en">English</option>
                    </select>
                </div>

                <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">السمة</label>
                    <select
                        className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                        value={settings.theme}
                        onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
                    >
                        <option value="light">فاتح</option>
                        <option value="dark">داكن</option>
                    </select>
                </div>
            </div>

            {/* Save Button */}
            <div className="flex items-center gap-4">
                <button
                    className={`btn bg-brand-blue px-8 py-3 text-white hover:bg-blue-700 shadow-md ${saving ? 'opacity-70' : ''}`}
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
                </button>

                {msg && (
                    <div className={`text-sm px-4 py-2 rounded-lg ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {msg.text}
                    </div>
                )}
            </div>
        </div>
    );
}
