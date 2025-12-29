"use client";

import { useState, useEffect } from "react";
import { io } from "socket.io-client";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const clientId = "default";

export default function AIPage() {
    const [activeTab, setActiveTab] = useState<"agents" | "rules" | "training" | "analytics">("agents");
    const [showModal, setShowModal] = useState(false);
    const [showRuleModal, setShowRuleModal] = useState(false);

    // Rules State
    const [rules, setRules] = useState<any[]>([]);
    const [ruleForm, setRuleForm] = useState({
        trigger_keywords: "",
        response_text: "",
        match_type: "contains" as "exact" | "contains" | "regex"
    });

    // Agents List State
    const [agents, setAgents] = useState<any[]>([]);

    // Real Bot State
    const [enabled, setEnabled] = useState(false);
    const [config, setConfig] = useState<any>(null);
    const [loading, setLoading] = useState(true);
    const [botError, setBotError] = useState<string | null>(null);

    const [agentForm, setAgentForm] = useState({
        name: "",
        description: "",
        systemPrompt: "",
    });

    // Training State
    const [documents, setDocuments] = useState<any[]>([]);
    const [trainingLoading, setTrainingLoading] = useState(false);

    const fetchRules = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/bot/rules`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setRules(data.rules || []);
            }
        } catch (err) {
            console.error("Failed to fetch rules", err);
        }
    };

    const handleAddRule = async () => {
        if (!ruleForm.trigger_keywords || !ruleForm.response_text) return;
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/bot/rules`, {
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${token}`,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({
                    trigger_keywords: ruleForm.trigger_keywords.split(",").map(k => k.trim()),
                    response_text: ruleForm.response_text,
                    match_type: ruleForm.match_type
                })
            });
            if (res.ok) {
                setShowRuleModal(false);
                setRuleForm({ trigger_keywords: "", response_text: "", match_type: "contains" });
                fetchRules();
            }
        } catch (err) {
            console.error("Failed to add rule", err);
        }
    };

    const handleDeleteRule = async (id: string) => {
        if (!confirm("هل أنت متأكد من حذف هذه القاعدة؟")) return;
        try {
            const token = localStorage.getItem("token");
            await fetch(`${apiBase}/bot/rules/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchRules();
        } catch (err) {
            console.error("Failed to delete rule", err);
        }
    };

    const fetchDocuments = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/api/training/documents`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setDocuments(data.documents || []);
            }
        } catch (err) {
            console.error("Failed to fetch documents", err);
        }
    };

    const handleFileUpload = async (file: File) => {
        setTrainingLoading(true);
        const formData = new FormData();
        formData.append("file", file);

        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/api/training/upload`, {
                method: "POST",
                headers: { Authorization: `Bearer ${token}` },
                body: formData
            });

            if (res.ok) {
                alert("تم التدريب بنجاح!");
                fetchDocuments();
            } else {
                const data = await res.json();
                alert(`Error: ${data.error}`);
            }
        } catch (err) {
            console.error("Upload error", err);
            alert("فشل في رفع الملف");
        } finally {
            setTrainingLoading(false);
        }
    };

    const handleDeleteDocument = async (id: string) => {
        if (!confirm("هل أنت متأكد من حذف هذا المستند؟ سيفقد البوت القدرة على الوصول لهذه المعلومات.")) return;
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/api/training/documents/${id}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.ok) {
                setDocuments(prev => prev.filter(d => d.id !== id));
            }
        } catch (err) {
            console.error("Delete error", err);
        }
    };

    const fetchConfig = async () => {
        try {
            const token = localStorage.getItem("token");
            // Remove clientId from path as the API uses orgId from token
            const res = await fetch(`${apiBase}/bot/config?t=${Date.now()}`, {
                headers: { "Authorization": `Bearer ${token}` },
                cache: 'no-store'
            });
            if (res.ok) {
                const data = await res.json();
                setConfig(data);
                setEnabled(data.enabled || false);
                setAgentForm(prev => ({ ...prev, systemPrompt: data.system_prompt || data.systemPrompt || "" }));
            }
        } catch (err) {
            console.error(err);
        }
    };

    const fetchAgents = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/api/agents`, {
                headers: { "Authorization": `Bearer ${token}` }
            });
            if (res.ok) {
                const data = await res.json();
                setAgents(data);
            }
        } catch (err) {
            console.error("Failed to fetch agents", err);
        }
    };

    const saveConfig = async (currentConfig: any) => {
        try {
            const token = localStorage.getItem("token");
            await fetch(`${apiBase}/bot/config`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    clientId,
                    systemPrompt: currentConfig.system_prompt || currentConfig.systemPrompt,
                    apiKey: currentConfig.api_key || currentConfig.apiKey,
                    enabled: currentConfig.enabled,
                    botMode: currentConfig.bot_mode || currentConfig.botMode || "ai"
                })
            });
        } catch (err) {
            console.error("Failed to auto-save config", err);
        }
    };

    useEffect(() => {
        fetchConfig();
        fetchAgents();
        fetchDocuments();
        fetchRules();
        setLoading(false);
    }, []);

    const toggleBot = async (forcedStatus?: boolean) => {
        if (!config && !forcedStatus) return;
        const newStatus = forcedStatus !== undefined ? forcedStatus : !enabled;

        // 1. Optimistic Update (Update local state immediately)
        setEnabled(newStatus);
        setConfig((prev: any) => ({ ...prev, enabled: newStatus }));

        try {
            const token = localStorage.getItem("token");
            await fetch(`${apiBase}/bot/config`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    clientId,
                    systemPrompt: config?.systemPrompt || config?.system_prompt || "",
                    apiKey: config?.apiKey || config?.api_key || "",
                    enabled: newStatus,
                    botMode: config?.bot_mode || config?.botMode || "ai"
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
                    { key: "agents", label: "الوكلاء الذكية" },
                    { key: "rules", label: "قواعد الرد السريع" },
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
                {activeTab === "rules" && (
                    <button
                        className="btn bg-brand-green/20 text-brand-green text-xs px-4 py-1 self-center ml-auto hover:bg-brand-green hover:text-white"
                        onClick={() => setShowRuleModal(true)}
                    >
                        + إضافة قاعدة
                    </button>
                )}
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
                            {botError && (
                                <div className="mt-2 p-2 bg-red-50 border border-red-200 rounded-lg text-[10px] text-red-600 font-bold animate-pulse">
                                    ⚠️ خطأ: {botError}
                                </div>
                            )}
                            <div className="mt-3 space-y-4">
                                <div>
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest block mb-1">شخصية البوت (Persona)</label>
                                    <textarea
                                        className="w-full text-xs p-3 rounded-xl border border-slate-200 bg-white min-h-[80px] focus:ring-2 focus:ring-brand-blue/20 outline-none"
                                        placeholder="اكتب كيف يجب أن يتحدث البوت هنا..."
                                        value={config?.systemPrompt || config?.system_prompt || ""}
                                        onChange={(e) => {
                                            const val = e.target.value;
                                            setConfig((prev: any) => ({ ...prev, system_prompt: val, systemPrompt: val }));
                                        }}
                                    />
                                </div>

                                <div className="p-3 bg-slate-100/50 rounded-xl space-y-2 border border-slate-200">
                                    <label className="text-[10px] font-bold text-slate-500 uppercase block">وضع التشغيل (Operation Mode)</label>
                                    <div className="grid grid-cols-3 gap-1">
                                        {[
                                            { id: 'ai', label: 'AI فقط', color: 'blue' },
                                            { id: 'local', label: 'محلي فقط', color: 'green' },
                                            { id: 'hybrid', label: 'هجين', color: 'purple' }
                                        ].map(m => {
                                            const isActive = (config?.botMode === m.id || config?.bot_mode === m.id);
                                            const activeClasses = {
                                                blue: 'bg-blue-500 text-white border-blue-500 shadow-sm',
                                                green: 'bg-green-500 text-white border-green-500 shadow-sm',
                                                purple: 'bg-purple-500 text-white border-purple-500 shadow-sm'
                                            }[m.color as 'blue' | 'green' | 'purple'];

                                            return (
                                                <button
                                                    key={m.id}
                                                    onClick={() => {
                                                        const newConf = { ...config, botMode: m.id, bot_mode: m.id };
                                                        setConfig(newConf);
                                                        saveConfig(newConf);
                                                    }}
                                                    className={`text-[10px] py-1 rounded-lg border transition ${isActive ? activeClasses : 'bg-white text-slate-500 border-slate-200 hover:bg-slate-50'
                                                        }`}
                                                >
                                                    {m.label}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[9px] text-slate-400 italic">
                                        {(config?.botMode === 'hybrid' || config?.bot_mode === 'hybrid') && "* يبحث في القواعد أولاً ثم ينتقل للذكاء الاصطناعي"}
                                        {(config?.botMode === 'local' || config?.bot_mode === 'local') && "* تشغيل الردود المبرمجة فقط (توفير API)"}
                                        {(config?.botMode === 'ai' || config?.bot_mode === 'ai') && "* يعتمد بالكامل على الذكاء الاصطناعي"}
                                    </p>
                                </div>
                            </div>
                        </div>
                        <div className="flex gap-2 pt-2">
                            <button
                                onClick={() => toggleBot()}
                                className={`flex-1 btn py-2 text-white transition font-bold shadow-sm ${enabled ? 'bg-red-500 hover:bg-red-600' : 'bg-brand-green hover:bg-green-600'}`}
                            >
                                {enabled ? 'إيقاف البوت' : 'تفعيل وحفظ'}
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

            {/* Rules Tab */}
            {activeTab === "rules" && (
                <div className="space-y-4">
                    {rules.length === 0 ? (
                        <div className="card p-12 text-center space-y-4">
                            <div className="text-4xl">📝</div>
                            <h3 className="text-lg font-bold text-slate-700">لا يوجد قواعد حالياً</h3>
                            <p className="text-sm text-slate-500 max-w-xs mx-auto">قم بإضافة كلمات مفتاحية ليقوم البوت بالرد التلقائي عليها فوراً وبدون تكلفة API.</p>
                            <button onClick={() => setShowRuleModal(true)} className="btn bg-brand-blue text-white px-6">إضافة أول قاعدة</button>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {rules.map((rule) => (
                                <div key={rule.id} className="card p-4 flex items-start justify-between gap-4 hover:border-brand-blue/30 transition-all">
                                    <div className="space-y-2">
                                        <div className="flex gap-2 items-center">
                                            {rule.trigger_keywords.map((kw: string) => (
                                                <span key={kw} className="bg-blue-50 text-brand-blue text-[10px] px-2 py-0.5 rounded-md font-bold border border-blue-100">
                                                    {kw}
                                                </span>
                                            ))}
                                            <span className="text-[9px] bg-slate-100 text-slate-500 px-1.5 py-0.5 rounded uppercase font-bold tracking-tighter">
                                                {rule.match_type}
                                            </span>
                                        </div>
                                        <p className="text-xs text-slate-700 font-medium bg-slate-50 p-2 rounded-lg border border-slate-100 leading-relaxed italic">
                                            "{rule.response_text}"
                                        </p>
                                    </div>
                                    <button
                                        onClick={() => handleDeleteRule(rule.id)}
                                        className="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition"
                                    >
                                        🗑️
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            )}
            {activeTab === "training" && (
                <div className="space-y-6">
                    <div className="card p-8 bg-white shadow-xl shadow-slate-200/50 rounded-[2rem] border-none group">
                        <div className="flex justify-between items-center mb-6">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight">تدريب الوكيل (Knowledge Base)</h3>
                                <p className="text-xs text-slate-400 font-bold mt-1">ارفع ملفات PDF أو نصوص ليتمكن البوت من الرد بناءً عليها</p>
                            </div>
                            <div className="h-12 w-12 rounded-2xl bg-brand-blue/10 flex items-center justify-center text-xl">📚</div>
                        </div>

                        <div className="grid md:grid-cols-1 gap-6">
                            <div className="p-8 border-4 border-dashed border-slate-100 rounded-[2rem] bg-slate-50/50 flex flex-col items-center justify-center text-center transition-all hover:border-brand-blue/20 hover:bg-blue-50/20 group/upload relative overflow-hidden">
                                <input
                                    type="file"
                                    accept=".pdf,.txt"
                                    onChange={(e) => {
                                        const file = e.target.files?.[0];
                                        if (file) handleFileUpload(file);
                                    }}
                                    className="absolute inset-0 opacity-0 cursor-pointer z-10"
                                    disabled={trainingLoading}
                                />
                                <div className="h-16 w-16 rounded-full bg-white shadow-sm flex items-center justify-center mb-4 text-2xl group-hover/upload:scale-110 transition-transform">
                                    {trainingLoading ? '⏳' : '📤'}
                                </div>
                                <p className="text-sm font-black text-slate-700">اضغط لرفع ملف تدريبي</p>
                                <p className="text-[10px] font-bold text-slate-400 mt-2 uppercase tracking-widest">يدعم PDF و TXT فقط (حتى 5 ميجابايت)</p>

                                {trainingLoading && (
                                    <div className="absolute inset-0 bg-white/80 backdrop-blur-sm flex items-center justify-center z-20">
                                        <div className="flex flex-col items-center gap-3">
                                            <div className="h-6 w-6 animate-spin rounded-full border-2 border-brand-blue border-t-transparent"></div>
                                            <p className="text-xs font-black text-brand-blue">جاري التحليل والتدريب...</p>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>

                    <div className="card p-8 bg-white shadow-xl shadow-slate-200/50 rounded-[2rem] border-none">
                        <div className="flex justify-between items-center mb-6 px-1">
                            <h4 className="text-sm font-black text-slate-800 uppercase tracking-widest">الملفات المدربة ({documents.length})</h4>
                            <button onClick={fetchDocuments} className="text-[10px] font-bold text-brand-blue hover:underline">تحديث القائمة</button>
                        </div>

                        <div className="space-y-3">
                            {documents.length === 0 ? (
                                <div className="text-center py-12 border border-slate-100 rounded-3xl bg-slate-50/30">
                                    <p className="text-slate-400 text-sm font-medium italic">لا توجد ملفات مدربة حالياً</p>
                                </div>
                            ) : (
                                documents.map((doc: any) => (
                                    <div key={doc.id} className="flex items-center justify-between p-4 bg-slate-50 border border-slate-100 rounded-2xl group/item hover:bg-white hover:shadow-md transition-all">
                                        <div className="flex items-center gap-4">
                                            <div className="h-10 w-10 rounded-xl bg-white border border-slate-100 flex items-center justify-center text-lg">📄</div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-800">{doc.metadata?.filename || "ملف غير معروف"}</p>
                                                <p className="text-[10px] font-bold text-slate-400">{new Date(doc.created_at).toLocaleDateString('ar-EG')}</p>
                                            </div>
                                        </div>
                                        <button
                                            onClick={() => handleDeleteDocument(doc.id)}
                                            className="h-8 w-8 rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-all opacity-0 group-hover/item:opacity-100"
                                        >
                                            ✕
                                        </button>
                                    </div>
                                ))
                            )}
                        </div>
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
            {/* Local Bot Rule Modal */}
            {showRuleModal && (
                <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="w-full max-w-md bg-white rounded-3xl shadow-2xl p-8 space-y-6">
                        <div className="flex justify-between items-center">
                            <h3 className="text-xl font-black text-slate-800 tracking-tight">إضافة قاعدة رد محلي</h3>
                            <button onClick={() => setShowRuleModal(false)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>

                        <div className="space-y-4">
                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">كلمات زناد (Trigger Keywords)</label>
                                <input
                                    type="text"
                                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-brand-blue/20 text-sm"
                                    placeholder="سعر, بكام, تكلفة (افصل بفاصلة)"
                                    value={ruleForm.trigger_keywords}
                                    onChange={(e) => setRuleForm({ ...ruleForm, trigger_keywords: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">الرد التلقائي</label>
                                <textarea
                                    className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-brand-blue/20 text-sm min-h-[100px]"
                                    placeholder="اكتب الرد الذي سيصل للعميل..."
                                    value={ruleForm.response_text}
                                    onChange={(e) => setRuleForm({ ...ruleForm, response_text: e.target.value })}
                                />
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase">نوع المطابقة</label>
                                <div className="flex gap-2">
                                    {["contains", "exact", "regex"].map((m) => (
                                        <button
                                            key={m}
                                            onClick={() => setRuleForm({ ...ruleForm, match_type: m as any })}
                                            className={`flex-1 py-2 text-[10px] font-black rounded-lg border transition ${ruleForm.match_type === m ? 'bg-brand-blue text-white border-brand-blue' : 'bg-white text-slate-500 border-slate-200'}`}
                                        >
                                            {m.toUpperCase()}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>

                        <button
                            onClick={handleAddRule}
                            className="w-full btn bg-brand-blue text-white py-4 font-black shadow-lg shadow-blue-200 disabled:opacity-50"
                        >
                            حفظ القاعدة
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
}
