"use client";

import { useState, useEffect } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const clientId = "default";

export default function AIPage() {
    const [activeTab, setActiveTab] = useState<"agents" | "training" | "analytics">("agents");
    const [showModal, setShowModal] = useState(false);

    // Agents List State
    const [agents, setAgents] = useState<any[]>([]);

    // Real Bot State
    const [enabled, setEnabled] = useState(false);
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    // Form State
    const [agentForm, setAgentForm] = useState({
        name: "",
        description: "",
        systemPrompt: "",
    });

    const fetchConfig = async () => {
        try {
            // Add timestamp to prevent caching
            const res = await fetch(`${apiBase}/bot/config/${clientId}?t=${Date.now()}`, {
                cache: 'no-store'
            });
            if (res.ok) {
                const data = await res.json();
                setConfig(data);
                setEnabled(data.enabled || false);
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchAgents = async () => {
        try {
            const res = await fetch(`${apiBase}/api/agents`);
            if (res.ok) {
                const data = await res.json();
                setAgents(data);
            }
        } catch (err) {
            console.error("Failed to fetch agents", err);
        }
    };

    useEffect(() => {
        fetchConfig();
        fetchAgents();
        setLoading(false);
    }, []);

    const toggleBot = async (forcedStatus?: boolean) => {
        if (!config && !forcedStatus) return;
        const newStatus = forcedStatus !== undefined ? forcedStatus : !enabled;

        // 1. Optimistic Update (Update local state immediately)
        setEnabled(newStatus);
        setConfig((prev: any) => ({ ...prev, enabled: newStatus }));

        try {
            await fetch(`${apiBase}/bot/config`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                    clientId,
                    // Use most up-to-date state from config
                    systemPrompt: config?.systemPrompt || config?.system_prompt || "",
                    apiKey: config?.apiKey || config?.api_key || "",
                    enabled: newStatus
                })
            });
            // 2. Refresh to confirm
            fetchConfig();
        } catch (err) {
            console.error("Failed to toggle bot", err);
            // Revert on error
            setEnabled(!newStatus);
        }
    };

    const handleCreateAgent = async () => {
        if (!agentForm.name || !agentForm.systemPrompt) return;

        try {
            const res = await fetch(`${apiBase}/api/agents`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(agentForm)
            });

            if (res.ok) {
                setShowModal(false);
                setAgentForm({ name: "", description: "", systemPrompt: "" });
                fetchAgents();
            }
        } catch (err) {
            console.error("Failed to create agent", err);
        }
    };

    const activateAgent = async (agent: any) => {
        // Activate this agent's persona on the main bot
        if (confirm(`هل أنت متأكد من تفعيل الوكيل "${agent.name}"؟ سيتم تحديث إعدادات البوت الحالية.`)) {
            try {
                // 1. Update bot config with new prompt
                await fetch(`${apiBase}/bot/config`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify({
                        clientId,
                        systemPrompt: agent.system_prompt, // Load persona
                        apiKey: config?.apiKey || config?.api_key || "", // Keep key
                        enabled: true // Auto enable
                    })
                });

                // 2. Refresh UI
                await fetchConfig();
                alert(`تم تفعيل الوكيل ${agent.name} بنجاح!`);
            } catch (err) {
                console.error("Failed to activate agent", err);
            }
        }
    };

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
                    {/* Main Active Bot Card */}
                    <div className="card p-6 space-y-4 border-2 border-brand-blue/20 bg-blue-50/50 relative overflow-hidden">
                        <div className="absolute top-0 left-0 bg-brand-blue text-white text-xs px-3 py-1 rounded-br-xl">
                            البوت الحالي
                        </div>
                        <div className="flex items-center justify-between mt-2">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-500 to-cyan-600 rounded-xl flex items-center justify-center text-white text-xl">
                                🤖
                            </div>
                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                {enabled ? 'متصل' : 'موقف'}
                            </span>
                        </div>
                        <div>
                            <h3 className="font-semibold text-slate-800">المساعد الرئيسي (Gemini)</h3>
                            <p className="text-xs text-slate-500 line-clamp-2 mt-1">
                                {config?.systemPrompt || config?.system_prompt || "لا يوجد وصف"}
                            </p>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => toggleBot()}
                                className={`flex-1 btn py-2 text-white transition ${enabled ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-green hover:bg-green-600'}`}
                            >
                                {enabled ? 'إيقاف البوت' : 'تفعيل البوت'}
                            </button>
                        </div>
                    </div>

                    {/* Agents List from DB */}
                    {agents.map((agent) => (
                        <div key={agent.id} className="card p-6 space-y-4">
                            <div className="flex items-center justify-between">
                                <div className="w-12 h-12 bg-gradient-to-br from-purple-500 to-indigo-600 rounded-xl flex items-center justify-center text-white text-xl">
                                    👤
                                </div>
                            </div>
                            <div>
                                <h3 className="font-semibold text-slate-800">{agent.name}</h3>
                                <p className="text-sm text-slate-500 mt-1 line-clamp-2">{agent.description || agent.system_prompt}</p>
                            </div>
                            <div className="flex gap-2 pt-2">
                                <button
                                    onClick={() => activateAgent(agent)}
                                    className="flex-1 btn bg-slate-100 py-2 text-slate-700 hover:bg-slate-200"
                                >
                                    تفعيل هذا الوكيل
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
                    <div className="bg-yellow-50 p-4 rounded-xl text-yellow-800 text-sm">
                        هذه الميزة قيد التطوير. قريباً ستتمكن من رفع ملفات PDF لتدريب البوت.
                    </div>
                </div>
            )}

            {/* Analytics Tab */}
            {activeTab === "analytics" && (
                <div className="grid md:grid-cols-3 gap-4">
                    <div className="card p-6 text-center">
                        <p className="text-4xl font-bold text-brand-blue">--</p>
                        <p className="text-slate-500 mt-1">إجمالي المحادثات</p>
                    </div>
                    {/* Placeholders */}
                </div>
            )}

            {/* Create Agent Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4">
                        <h3 className="text-xl font-bold text-slate-800">إنشاء وكيل جديد</h3>
                        <div className="space-y-3">
                            <div>
                                <label className="text-sm font-medium text-slate-700">اسم الوكيل</label>
                                <input
                                    type="text"
                                    placeholder="مثال: موظف المبيعات"
                                    className="w-full p-3 mt-1 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                                    value={agentForm.name}
                                    onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">الوصف (اختياري)</label>
                                <input
                                    type="text"
                                    placeholder="وصف قصير للوكيل"
                                    className="w-full p-3 mt-1 rounded-xl border border-slate-200 outline-none focus:border-brand-blue"
                                    value={agentForm.description}
                                    onChange={(e) => setAgentForm({ ...agentForm, description: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-sm font-medium text-slate-700">تعليمات البوت (System Prompt)</label>
                                <textarea
                                    placeholder="أنت مساعد ذكي..."
                                    className="w-full p-3 mt-1 rounded-xl border border-slate-200 min-h-[120px] outline-none focus:border-brand-blue"
                                    value={agentForm.systemPrompt}
                                    onChange={(e) => setAgentForm({ ...agentForm, systemPrompt: e.target.value })}
                                />
                            </div>
                        </div>
                        <div className="flex gap-3 pt-2">
                            <button
                                onClick={handleCreateAgent}
                                className="flex-1 btn bg-brand-blue py-3 text-white hover:bg-blue-700"
                            >
                                حفظ الوكيل
                            </button>
                            <button
                                className="flex-1 btn bg-slate-100 py-3 text-slate-700 hover:bg-slate-200"
                                onClick={() => setShowModal(false)}
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
