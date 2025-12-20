"use client";

import { useState } from "react";

const agents = [
    { id: 1, name: "مساعد خدمة العملاء", status: "active", messages: 234, rating: 4.8 },
    { id: 2, name: "مساعد المبيعات", status: "active", messages: 156, rating: 4.5 },
    { id: 3, name: "دعم فني", status: "inactive", messages: 89, rating: 4.2 },
];

export default function AIPage() {
    const [activeTab, setActiveTab] = useState<"agents" | "training" | "analytics">("agents");
    const [showModal, setShowModal] = useState(false);
    const [agentForm, setAgentForm] = useState({
        name: "",
        personality: "",
        instructions: "",
    });

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
                                <button className="flex-1 btn bg-brand-blue py-2 text-white hover:bg-blue-700">تفعيل</button>
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
                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="اسم الوكيل"
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none"
                                value={agentForm.name}
                                onChange={(e) => setAgentForm({ ...agentForm, name: e.target.value })}
                            />
                            <input
                                type="text"
                                placeholder="شخصية الوكيل (مثال: ودود، احترافي)"
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none"
                                value={agentForm.personality}
                                onChange={(e) => setAgentForm({ ...agentForm, personality: e.target.value })}
                            />
                            <textarea
                                placeholder="تعليمات الوكيل..."
                                className="w-full p-3 rounded-xl border border-slate-200 min-h-[120px] outline-none"
                                value={agentForm.instructions}
                                onChange={(e) => setAgentForm({ ...agentForm, instructions: e.target.value })}
                            />
                        </div>
                        <div className="flex gap-3">
                            <button className="flex-1 btn bg-brand-blue py-3 text-white hover:bg-blue-700">إنشاء</button>
                            <button className="flex-1 btn bg-slate-100 py-3 text-slate-700 hover:bg-slate-200" onClick={() => setShowModal(false)}>إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
