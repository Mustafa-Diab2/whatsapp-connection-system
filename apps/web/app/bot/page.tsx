"use client";

import { useState, useCallback, useEffect } from "react";
import { io, Socket } from "socket.io-client";

const clientId = "default";
const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface BotActivity {
    id: string;
    timestamp: string;
    customerPhone: string;
    customerMessage: string;
    sentiment: string;
    intent: string;
    botReply: string;
    responseTimeMs: number;
}

export default function BotPage() {
    const [prompt, setPrompt] = useState("");
    const [apiKey, setApiKey] = useState("");
    const [enabled, setEnabled] = useState(false);
    const [loading, setLoading] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Activity & Testing
    const [activities, setActivities] = useState<BotActivity[]>([]);
    const [testMessage, setTestMessage] = useState("");
    const [testResult, setTestResult] = useState<{
        analysis: { sentiment: string; intent: string };
        response: string;
        responseTimeMs: number;
    } | null>(null);
    const [testing, setTesting] = useState(false);
    const [socket, setSocket] = useState<Socket | null>(null);

    // Fetch config
    const fetchConfig = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase}/bot/config/${clientId}`);
            if (res.ok) {
                const data = await res.json();
                setPrompt(data.system_prompt || data.systemPrompt || "");
                setApiKey(data.api_key || data.apiKey || "");
                setEnabled(data.enabled || false);
            }
        } catch (err) {
            console.error(err);
        }
    }, []);

    // Fetch activities
    const fetchActivities = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase}/bot/activity/${clientId}?limit=20`);
            if (res.ok) {
                const data = await res.json();
                setActivities(data.activities || []);
            }
        } catch (err) {
            console.error(err);
        }
    }, []);

    useEffect(() => {
        fetchConfig();
        fetchActivities();

        // Setup socket for real-time updates
        const socketInstance = io(apiBase, { transports: ["websocket", "polling"] });
        socketInstance.emit("wa:subscribe", { clientId });

        socketInstance.on("bot:activity", (data: { activity: BotActivity }) => {
            setActivities((prev) => [data.activity, ...prev].slice(0, 20));
        });

        setSocket(socketInstance);

        return () => {
            socketInstance.disconnect();
        };
    }, [fetchConfig, fetchActivities]);

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

    const handleTest = async () => {
        if (!testMessage.trim()) return;
        setTesting(true);
        setTestResult(null);
        try {
            const res = await fetch(`${apiBase}/bot/test`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ clientId, message: testMessage }),
            });
            if (res.ok) {
                const data = await res.json();
                setTestResult(data);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setTesting(false);
        }
    };

    const getSentimentBadge = (sentiment: string) => {
        switch (sentiment) {
            case "positive": return <span className="px-2 py-1 rounded-full text-xs bg-green-100 text-green-700">🟢 إيجابي</span>;
            case "negative": return <span className="px-2 py-1 rounded-full text-xs bg-red-100 text-red-700">🔴 سلبي</span>;
            default: return <span className="px-2 py-1 rounded-full text-xs bg-gray-100 text-gray-700">⚪ محايد</span>;
        }
    };

    const getIntentBadge = (intent: string) => {
        const icons: Record<string, string> = {
            question: "❓ سؤال",
            complaint: "😤 شكوى",
            order: "🛒 طلب",
            greeting: "👋 تحية",
            feedback: "💭 رأي",
            support: "🛠️ دعم",
            other: "📝 أخرى"
        };
        return <span className="px-2 py-1 rounded-full text-xs bg-blue-100 text-blue-700">{icons[intent] || intent}</span>;
    };

    // Stats
    const stats = {
        total: activities.length,
        positive: activities.filter(a => a.sentiment === "positive").length,
        negative: activities.filter(a => a.sentiment === "negative").length,
        avgTime: activities.length > 0
            ? Math.round(activities.reduce((sum, a) => sum + a.responseTimeMs, 0) / activities.length)
            : 0
    };

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex flex-col gap-2">
                <h1 className="text-2xl font-extrabold text-slate-900">إعدادات البوت الذكي</h1>
                <p className="text-slate-500">قم بتهيئة مساعدك الذكي للرد على العملاء تلقائياً</p>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-4 text-center">
                    <div className="text-2xl font-bold text-blue-600">{stats.total}</div>
                    <div className="text-sm text-slate-500">إجمالي الردود</div>
                </div>
                <div className="card p-4 text-center">
                    <div className="text-2xl font-bold text-green-600">{stats.positive}</div>
                    <div className="text-sm text-slate-500">رسائل إيجابية</div>
                </div>
                <div className="card p-4 text-center">
                    <div className="text-2xl font-bold text-red-600">{stats.negative}</div>
                    <div className="text-sm text-slate-500">رسائل سلبية</div>
                </div>
                <div className="card p-4 text-center">
                    <div className="text-2xl font-bold text-purple-600">{stats.avgTime}ms</div>
                    <div className="text-sm text-slate-500">متوسط وقت الرد</div>
                </div>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
                {/* Config Section */}
                <div className="card p-6 space-y-6">
                    <h2 className="font-bold text-lg text-slate-800">⚙️ إعدادات البوت</h2>

                    {/* Toggle Switch */}
                    <div className="flex items-center justify-between border-b border-slate-100 pb-4">
                        <div>
                            <h3 className="font-semibold text-slate-800">تفعيل الرد التلقائي</h3>
                            <p className="text-sm text-slate-500">عند التفعيل، سيرد البوت تلقائياً</p>
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

                    {/* API Key Input (Hidden/Static) */}
                    <div className="space-y-2">
                        <label className="block text-sm font-medium text-slate-700">مفتاح Perplexity API</label>
                        <div className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 flex items-center gap-2">
                            <span>🔒</span>
                            <span>تم إعداد المفتاح في النظام (Static Key Configured)</span>
                        </div>
                    </div>

                    {/* System Prompt Input */}
                    <div className="space-y-2">
                        <div className="flex justify-between items-center">
                            <label className="block text-sm font-medium text-slate-700">ذاكرة البوت (System Prompt)</label>
                            <div className="flex gap-2">
                                {[
                                    { name: "💼 مبيعات", text: "أنت موظف مبيعات محترف ومقنع. هدفك هو مساعدة العملاء في العثور على المنتجات المناسبة وإتمام عملية الشراء. كن ودوداً واستخدم لغة تشجيعية." },
                                    { name: "🛠️ دعم فني", text: "أنت مهندس دعم فني متخصص. ساعد العملاء في حل مشاكلهم التقنية بخطوات واضحة ومبسطة. كن صبوراً وتأكد من حل المشكلة." },
                                    { name: "📅 سكرتير", text: "أنت سكرتير شخصي محترف. ساعد في تنظيم المواعيد والرد على الاستفسارات العامة بأسلوب رسمي ومهذب." },
                                    { name: "🎧 خدمة عملاء", text: "أنت مساعد خدمة عملاء ودود. جاوب على استفسارات العملاء برحابة صدر. استخدم الإيموجي المناسب وكن متعاوناً." }
                                ].map(t => (
                                    <button
                                        key={t.name}
                                        onClick={() => setPrompt(t.text)}
                                        className="px-3 py-1 text-xs bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-full transition-colors"
                                    >
                                        {t.name}
                                    </button>
                                ))}
                            </div>
                        </div>
                        <textarea
                            className="w-full min-h-[150px] p-4 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none text-slate-800 leading-relaxed"
                            placeholder="اكتب تعليمات البوت هنا..."
                            value={prompt}
                            onChange={(e) => setPrompt(e.target.value)}
                        />
                    </div>

                    {/* Save Button */}
                    <div className="flex items-center gap-4">
                        <button
                            className={`btn bg-brand-blue px-6 py-2 text-white hover:bg-blue-700 ${loading ? 'opacity-70' : ''}`}
                            onClick={handleSave}
                            disabled={loading}
                        >
                            {loading ? "جاري الحفظ..." : "💾 حفظ الإعدادات"}
                        </button>
                        {msg && (
                            <span className={`text-sm ${msg.type === 'success' ? 'text-green-600' : 'text-red-600'}`}>
                                {msg.text}
                            </span>
                        )}
                    </div>
                </div>

                {/* Test Section */}
                <div className="card p-6 space-y-4">
                    <h2 className="font-bold text-lg text-slate-800">🧪 اختبار البوت</h2>
                    <p className="text-sm text-slate-500">جرب رد البوت قبل تفعيله على الرسائل الحقيقية</p>

                    <div className="flex gap-2">
                        <input
                            type="text"
                            className="flex-1 p-3 rounded-xl border border-slate-200 outline-none"
                            placeholder="اكتب رسالة اختبارية..."
                            value={testMessage}
                            onChange={(e) => setTestMessage(e.target.value)}
                            onKeyDown={(e) => e.key === "Enter" && handleTest()}
                        />
                        <button
                            className={`btn bg-purple-600 px-4 py-2 text-white hover:bg-purple-700 ${testing ? 'opacity-70' : ''}`}
                            onClick={handleTest}
                            disabled={testing}
                        >
                            {testing ? "..." : "🚀 اختبار"}
                        </button>
                    </div>

                    {testResult && (
                        <div className="space-y-3 p-4 bg-slate-50 rounded-xl">
                            <div className="flex gap-2 flex-wrap">
                                {getSentimentBadge(testResult.analysis.sentiment)}
                                {getIntentBadge(testResult.analysis.intent)}
                                <span className="px-2 py-1 rounded-full text-xs bg-purple-100 text-purple-700">
                                    ⏱️ {testResult.responseTimeMs}ms
                                </span>
                            </div>
                            <div className="p-3 bg-white rounded-lg border border-slate-200">
                                <p className="text-sm text-slate-600 mb-1">رد البوت:</p>
                                <p className="text-slate-800">{testResult.response}</p>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Activity Log */}
            <div className="card p-6">
                <h2 className="font-bold text-lg text-slate-800 mb-4">📊 نشاط البوت الحي</h2>

                {activities.length === 0 ? (
                    <div className="text-center py-8 text-slate-400">
                        <div className="text-4xl mb-2">🤖</div>
                        <p>لا يوجد نشاط بعد. فعّل البوت وابدأ استقبال الرسائل!</p>
                    </div>
                ) : (
                    <div className="space-y-3 max-h-[400px] overflow-y-auto">
                        {activities.map((activity, i) => (
                            <div key={activity.id || i} className="p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                <div className="flex items-center justify-between mb-2">
                                    <div className="flex gap-2 items-center">
                                        <span className="text-sm font-medium text-slate-600">{activity.customerPhone}</span>
                                        {getSentimentBadge(activity.sentiment)}
                                        {getIntentBadge(activity.intent)}
                                    </div>
                                    <span className="text-xs text-slate-400">{activity.responseTimeMs}ms</span>
                                </div>
                                <div className="grid md:grid-cols-2 gap-2 text-sm">
                                    <div className="p-2 bg-white rounded border-r-2 border-blue-400">
                                        <span className="text-xs text-slate-400">العميل:</span>
                                        <p className="text-slate-700">{activity.customerMessage}</p>
                                    </div>
                                    <div className="p-2 bg-white rounded border-r-2 border-green-400">
                                        <span className="text-xs text-slate-400">البوت:</span>
                                        <p className="text-slate-700">{activity.botReply}</p>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
