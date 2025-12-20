"use client";

import { useState, useCallback, useEffect } from "react";

const clientId = "default";
const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function BotPage() {
    const [prompt, setPrompt] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const fetchConfig = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase}/bot/config/${clientId}`);
            if (res.ok) {
                const data = await res.json();
                setPrompt(data.systemPrompt || "");
                setApiKey(data.apiKey || "");
                setEnabled(data.enabled || false);
            }
        } catch (err) {
            console.error(err);
        }
    }, []);

    useEffect(() => {
        fetchConfig();
    }, [fetchConfig]);

    const handleSave = async () => {
        setLoading(true);
        setMsg(null);
        try {
            const res = await fetch(`${apiBase}/bot/config`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientId, systemPrompt: prompt, apiKey, enabled }),
            });
            if (res.ok) {
                setMsg({ type: "success", text: "تم حفظ الإعدادات بنجاح!" });
            } else {
                throw new Error("Failed to save");
            }
        } catch (err) {
            setMsg({ type: "error", text: "فشل حفظ الإعدادات، حاول مرة أخرى." });
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900">إعدادات البوت الذكي</h1>
                <p className="text-slate-500">قم بتهيئة مساعدك الذكي للرد على العملاء تلقائياً</p>
            </div>

            <div className="card p-6 space-y-6">
                {/* Toggle Switch */}
                <div className="flex items-center justify-between border-b border-slate-100 pb-6">
                    <div>
                        <h3 className="font-semibold text-slate-800 text-lg">تفعيل الرد التلقائي</h3>
                        <p className="text-sm text-slate-500">عند التفعيل، سيقوم البوت بالرد على الرسائل الواردة بناءً على التعليمات أدناه.</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={enabled}
                            onChange={(e) => setEnabled(e.target.checked)}
                        />
                        <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-blue-300 rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-[4px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-brand-blue"></div>
                    </label>
                </div>

                {/* API Key Input */}
                <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">مفتاح Gemini API (اختياري)</label>
                    <input
                        type="password"
                        className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none text-slate-800"
                        placeholder="لتحسين الدقة (اختياري)"
                        value={apiKey}
                        onChange={(e) => setApiKey(e.target.value)}
                    />
                    <p className="text-xs text-slate-400">إذا لم يتم توفيره، سيتم استخدام المفتاح الافتراضي للسيرفر (إن وجد).</p>
                </div>

                {/* System Prompt Input */}
                <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">ذاكرة البوت (System Prompt)</label>
                    <p className="text-xs text-slate-500 mb-2">
                        هنا تضع التعليمات التي تحدد شخصية البوت، المعلومات التي يعرفها، وكيفية تصرفه. مثال: "أنت مساعد خدمة عملاء لشركة شحن، اسمك أحمد. ساعات العمل من 9 ص إلى 5 م..."
                    </p>
                    <textarea
                        className="w-full min-h-[300px] p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none text-slate-800 leading-relaxed"
                        placeholder="اكتب تعليمات البوت هنا..."
                        value={prompt}
                        onChange={(e) => setPrompt(e.target.value)}
                    />
                </div>

                {/* Action Buttons */}
                <div className="pt-4 flex items-center gap-4">
                    <button
                        className={`btn bg-brand-blue px-8 py-3 text-white hover:bg-blue-700 shadow-md transition-all ${loading ? 'opacity-70 cursor-not-allowed' : ''}`}
                        onClick={handleSave}
                        disabled={loading}
                    >
                        {loading ? "جاري الحفظ..." : "حفظ الإعدادات"}
                    </button>

                    {msg && (
                        <div className={`text-sm px-4 py-2 rounded-lg ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                            {msg.text}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
