"use client";

import { useState } from "react";

export default function TuningPage() {
    const [settings, setSettings] = useState({
        maxMessagesPerDay: 1000,
        messageDelay: 2,
        workStartHour: 9,
        workEndHour: 17,
        weekendMode: false,
        autoSaveSession: true,
        debugMode: false,
        apiRateLimit: 60,
    });
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<string | null>(null);

    const handleSave = async () => {
        setSaving(true);
        await new Promise((r) => setTimeout(r, 800));
        setMsg("تم حفظ إعدادات الضبط بنجاح!");
        setSaving(false);
        setTimeout(() => setMsg(null), 3000);
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div>
                <h1 className="text-2xl font-extrabold text-slate-900">الضبط المتقدم</h1>
                <p className="text-slate-500">إعدادات متقدمة للتحكم في سلوك النظام</p>
            </div>

            {/* Rate Limiting */}
            <div className="card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">حدود الاستخدام</h2>

                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">الحد الأقصى للرسائل يومياً</label>
                        <input
                            type="number"
                            className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                            value={settings.maxMessagesPerDay}
                            onChange={(e) => setSettings({ ...settings, maxMessagesPerDay: +e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">التأخير بين الرسائل (ثانية)</label>
                        <input
                            type="number"
                            className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                            value={settings.messageDelay}
                            onChange={(e) => setSettings({ ...settings, messageDelay: +e.target.value })}
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">حد API في الدقيقة</label>
                        <input
                            type="number"
                            className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                            value={settings.apiRateLimit}
                            onChange={(e) => setSettings({ ...settings, apiRateLimit: +e.target.value })}
                        />
                    </div>
                </div>
            </div>

            {/* Working Hours */}
            <div className="card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">ساعات العمل</h2>

                <div className="grid md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">بداية العمل</label>
                        <select
                            className="w-full p-3 rounded-xl border border-slate-200 outline-none"
                            value={settings.workStartHour}
                            onChange={(e) => setSettings({ ...settings, workStartHour: +e.target.value })}
                        >
                            {Array.from({ length: 24 }, (_, i) => (
                                <option key={i} value={i}>{i}:00</option>
                            ))}
                        </select>
                    </div>
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">نهاية العمل</label>
                        <select
                            className="w-full p-3 rounded-xl border border-slate-200 outline-none"
                            value={settings.workEndHour}
                            onChange={(e) => setSettings({ ...settings, workEndHour: +e.target.value })}
                        >
                            {Array.from({ length: 24 }, (_, i) => (
                                <option key={i} value={i}>{i}:00</option>
                            ))}
                        </select>
                    </div>
                </div>

                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="font-medium text-slate-700">وضع عطلة نهاية الأسبوع</p>
                        <p className="text-sm text-slate-500">إيقاف الردود التلقائية في العطلات</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings.weekendMode}
                            onChange={(e) => setSettings({ ...settings, weekendMode: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                    </label>
                </div>
            </div>

            {/* System */}
            <div className="card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">إعدادات النظام</h2>

                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="font-medium text-slate-700">حفظ الجلسة تلقائياً</p>
                        <p className="text-sm text-slate-500">حفظ جلسة WhatsApp تلقائياً</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings.autoSaveSession}
                            onChange={(e) => setSettings({ ...settings, autoSaveSession: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                    </label>
                </div>

                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="font-medium text-slate-700">وضع التصحيح (Debug)</p>
                        <p className="text-sm text-slate-500">عرض سجلات تفصيلية للمطورين</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings.debugMode}
                            onChange={(e) => setSettings({ ...settings, debugMode: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-slate-200 rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-amber-500"></div>
                    </label>
                </div>
            </div>

            <div className="flex items-center gap-4">
                <button
                    className={`btn bg-brand-blue px-8 py-3 text-white hover:bg-blue-700 shadow-md ${saving ? 'opacity-70' : ''}`}
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? "جاري الحفظ..." : "حفظ الضبط"}
                </button>
                {msg && <span className="text-green-600 text-sm">{msg}</span>}
            </div>
        </div>
    );
}
