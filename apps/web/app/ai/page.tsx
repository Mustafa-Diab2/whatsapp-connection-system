"use client";

import { useState, useEffect } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const clientId = "default";

export default function AIPage() {
    const [activeTab, setActiveTab] = useState<"agents" | "training" | "analytics">("agents");
    const [showModal, setShowModal] = useState(false);

    // Real Bot State
    const [enabled, setEnabled] = useState(false);
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    const fetchConfig = async () => {
        try {
            const res = await fetch(`${apiBase}/bot/config/${clientId}`);
            if (res.ok) {
                const data = await res.json();
                setConfig(data);
                setEnabled(data.enabled || false);
            }
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        fetchConfig();
    }, []);

    const toggleBot = async () => {
        if (!config) return;
        const newStatus = !enabled;
        try {
            const res = await fetch(`${apiBase}/bot/config`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientId,
                    systemPrompt: config.systemPrompt || config.system_prompt || "",
                    apiKey: config.apiKey || config.api_key || "",
                    enabled: newStatus
                })
            });
            if (res.ok) {
                setEnabled(newStatus);
                fetchConfig(); // Refresh
            }
        } catch (err) {
            console.error("Failed to toggle bot", err);
        }
    };

    // Derived agents list for UI
    const agents = [
        {
            id: 1,
            name: "المساعد الرئيسي (Perplexity)",
            status: enabled ? "active" : "inactive",
            messages: 479,
            rating: 4.8
        },
    ];

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900">الذكاء الاصطناعي</h1>
                    <p className="text-slate-500">إدارة وكلاء الذكاء الاصطناعي وتدريبهم</p>
                </div>
                <button
                    className="btn bg-brand-blue px-6 py-3 text-white hover:bg-blue-700"
                    onClick={() => setShowModal(true)}
                >
                    + وكيل جديد
                </button>
            </div>

            {/* Tabs */}
            <div className="flex gap-2 border-b border-slate-200">
                {[
                    { key: "agents", label: "الوكلاء" },
                    { key: "training", label: "التدريب" },
                    { key: "analytics", label: "التحليلات" },
                ].map((tab) => (
                    <button
                        key={tab.key}
                        className={`px-6 py-3 font-medium transition ${activeTab === tab.key ? 'text-brand-blue border-b-2 border-brand-blue' : 'text-slate-500 hover:text-slate-700'}`}
                        onClick={() => setActiveTab(tab.key as any)}
                    >
                        {tab.label}
                    </button>
                ))}
            </div>

            {/* Agents Tab */}
            {activeTab === "agents" && (
                <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {agents.map((agent) => (
                        <div key={agent.id} className="card p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-xl">
                                    🤖
                                </div>
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${agent.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-slate-100 text-slate-600'}`}>
                                    {agent.status === 'active' ? 'نشط' : 'غير نشط'}
                                </span>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-800">{agent.name}</h3>
                                <div className="flex items-center gap-4 mt-2 text-sm text-slate-500">
                                    <span>💬 {agent.messages} رسالة</span>
                                    <span>⭐ {agent.rating}</span>
                                </div>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button className="flex-1 btn bg-slate-100 py-2 text-slate-700 hover:bg-slate-200">تعديل</button>
                                <button
                                    onClick={toggleBot}
                                    className={`flex-1 btn py-2 text-white transition ${enabled ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-green hover:bg-green-600'}`}
                                >
                                    {enabled ? 'إيقاف' : 'تفعيل'}
                                </button>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Training Tab */}
            {activeTab === "training" && (
                <div className="card p-6 space-y-6">
                    <h3 className="font-semibold text-slate-800">تدريب الوكيل</h3>
                    <div className="space-y-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">اختر الوكيل</label>
                            <select className="w-full p-3 rounded-xl border border-slate-200 outline-none">
                                {agents.map((a) => (
                                    <option key={a.id} value={a.id}>{a.name}</option>
                                ))}
                            </select>
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">أضف بيانات تدريب</label>
                            <textarea
                                className="w-full p-4 rounded-xl border border-slate-200 min-h-[200px] outline-none"
                                placeholder="أدخل أمثلة للأسئلة والأجوبة لتحسين أداء الوكيل..."
                            />
                        </div>
                        <button className="btn bg-brand-blue px-8 py-3 text-white hover:bg-blue-700">
                            بدء التدريب
                        </button>
                    </div>
                </div>
            )}

            {/* Analytics Tab */}
            {activeTab === "analytics" && (
                <div className="grid md:grid-cols-3 gap-4">
                    <div className="card p-6 text-center">
                        <p className="text-4xl font-bold text-brand-blue">479</p>
                        <p className="text-slate-500 mt-1">إجمالي المحادثات</p>
                    </div>
                    <div className="card p-6 text-center">
                        <p className="text-4xl font-bold text-green-600">94%</p>
                        <p className="text-slate-500 mt-1">معدل الرضا</p>
                    </div>
                    <div className="card p-6 text-center">
                        <p className="text-4xl font-bold text-purple-600">1.2s</p>
                        <p className="text-slate-500 mt-1">متوسط وقت الرد</p>
                    </div>
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4">
                        <h3 className="text-xl font-bold text-slate-800">إنشاء وكيل جديد</h3>
                        <p className="text-sm text-yellow-600 bg-yellow-50 p-3 rounded-lg">
                            ملاحظة: هذه الميزة قيد التطوير. حالياً يمكنك استخدام "المساعد الرئيسي" فقط.
                        </p>
                        <div className="flex gap-3">
                            <button className="flex-1 btn bg-slate-100 py-3 text-slate-700 hover:bg-slate-200" onClick={() => setShowModal(false)}>إغلاق</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
