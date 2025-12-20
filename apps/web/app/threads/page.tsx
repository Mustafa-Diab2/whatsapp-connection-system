"use client";

import { useState, useEffect, useCallback } from "react";

type Thread = {
    id: string;
    title: string;
    customer: string;
    status: "open" | "pending" | "closed";
    priority: "high" | "medium" | "low";
    messages: number;
    lastUpdate: string;
};

const statusLabels: Record<string, string> = { open: "مفتوح", pending: "قيد الانتظار", closed: "مغلق" };
const statusColors: Record<string, string> = { open: "bg-green-100 text-green-700", pending: "bg-amber-100 text-amber-700", closed: "bg-slate-100 text-slate-600" };
const priorityLabels: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
const priorityColors: Record<string, string> = { high: "text-red-600", medium: "text-amber-600", low: "text-slate-500" };

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function ThreadsPage() {
    const [threads, setThreads] = useState<Thread[]>([]);
    const [filter, setFilter] = useState("all");
    const [selectedThread, setSelectedThread] = useState<Thread | null>(null);
    const [loading, setLoading] = useState(true);
    const [showNewModal, setShowNewModal] = useState(false);
    const [newThread, setNewThread] = useState({ title: "", customer: "", priority: "medium" });

    const fetchThreads = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase}/api/threads`);
            const data = await res.json();
            setThreads(data.threads || []);
        } catch (err) {
            console.error("Failed to fetch threads:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchThreads();
    }, [fetchThreads]);

    const filteredThreads = threads.filter((t) => filter === "all" || t.status === filter);

    const handleCreateThread = async () => {
        if (!newThread.title || !newThread.customer) return;
        try {
            await fetch(`${apiBase}/api/threads`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(newThread),
            });
            await fetchThreads();
            setShowNewModal(false);
            setNewThread({ title: "", customer: "", priority: "medium" });
        } catch (err) {
            console.error("Failed to create thread:", err);
        }
    };

    const handleCloseThread = async (id: string) => {
        try {
            await fetch(`${apiBase}/api/threads/${id}`, {
                method: "PUT",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ status: "closed" }),
            });
            await fetchThreads();
            setSelectedThread(null);
        } catch (err) {
            console.error("Failed to close thread:", err);
        }
    };

    const handleDeleteThread = async (id: string) => {
        if (confirm("هل أنت متأكد من حذف هذا الموضوع؟")) {
            try {
                await fetch(`${apiBase}/api/threads/${id}`, { method: "DELETE" });
                await fetchThreads();
            } catch (err) {
                console.error("Failed to delete thread:", err);
            }
        }
    };

    const formatDate = (dateStr: string) => {
        const date = new Date(dateStr);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const mins = Math.floor(diff / 60000);
        if (mins < 60) return `منذ ${mins} دقيقة`;
        const hours = Math.floor(mins / 60);
        if (hours < 24) return `منذ ${hours} ساعة`;
        return `منذ ${Math.floor(hours / 24)} يوم`;
    };

    if (loading) {
        return <div className="text-center py-12 text-slate-500">جاري التحميل...</div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900">المواضيع</h1>
                    <p className="text-slate-500">إدارة تذاكر الدعم والمحادثات</p>
                </div>
                <div className="flex gap-2">
                    <button
                        className="btn bg-brand-blue px-6 py-2 text-white hover:bg-blue-700"
                        onClick={() => setShowNewModal(true)}
                    >
                        + موضوع جديد
                    </button>
                </div>
            </div>

            {/* Filter */}
            <div className="flex gap-2 flex-wrap">
                {["all", "open", "pending", "closed"].map((f) => (
                    <button
                        key={f}
                        className={`px-4 py-2 rounded-lg text-sm font-medium transition ${filter === f ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                        onClick={() => setFilter(f)}
                    >
                        {f === "all" ? "الكل" : statusLabels[f]}
                    </button>
                ))}
            </div>

            {/* Stats */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <div className="card p-4 text-center">
                    <p className="text-2xl font-bold text-slate-800">{threads.length}</p>
                    <p className="text-sm text-slate-500">إجمالي المواضيع</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-2xl font-bold text-green-600">{threads.filter(t => t.status === "open").length}</p>
                    <p className="text-sm text-slate-500">مفتوح</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-2xl font-bold text-amber-600">{threads.filter(t => t.status === "pending").length}</p>
                    <p className="text-sm text-slate-500">قيد الانتظار</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-2xl font-bold text-slate-400">{threads.filter(t => t.status === "closed").length}</p>
                    <p className="text-sm text-slate-500">مغلق</p>
                </div>
            </div>

            {/* Threads List */}
            <div className="card overflow-hidden">
                <div className="divide-y divide-slate-100">
                    {filteredThreads.map((thread) => (
                        <div
                            key={thread.id}
                            className="p-4 hover:bg-slate-50 cursor-pointer transition flex items-center justify-between"
                            onClick={() => setSelectedThread(thread)}
                        >
                            <div className="flex-1">
                                <div className="flex items-center gap-3">
                                    <span className={`text-lg ${priorityColors[thread.priority]}`}>
                                        {thread.priority === "high" ? "🔴" : thread.priority === "medium" ? "🟡" : "🟢"}
                                    </span>
                                    <div>
                                        <h4 className="font-semibold text-slate-800">{thread.title}</h4>
                                        <p className="text-sm text-slate-500">{thread.customer} • {thread.messages} رسائل</p>
                                    </div>
                                </div>
                            </div>
                            <div className="flex items-center gap-4">
                                <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[thread.status]}`}>
                                    {statusLabels[thread.status]}
                                </span>
                                <span className="text-xs text-slate-400">{formatDate(thread.lastUpdate)}</span>
                                <button
                                    className="text-red-400 hover:text-red-600"
                                    onClick={(e) => { e.stopPropagation(); handleDeleteThread(thread.id); }}
                                >
                                    🗑️
                                </button>
                            </div>
                        </div>
                    ))}
                    {filteredThreads.length === 0 && (
                        <div className="p-8 text-center text-slate-500">لا توجد مواضيع</div>
                    )}
                </div>
            </div>

            {/* Thread Detail Modal */}
            {selectedThread && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-2xl p-6 space-y-4 max-h-[80vh] overflow-y-auto">
                        <div className="flex items-center justify-between">
                            <h3 className="text-xl font-bold text-slate-800">{selectedThread.title}</h3>
                            <button onClick={() => setSelectedThread(null)} className="text-slate-400 hover:text-slate-600">✕</button>
                        </div>

                        <div className="flex gap-4 text-sm">
                            <span className={`px-3 py-1 rounded-full ${statusColors[selectedThread.status]}`}>
                                {statusLabels[selectedThread.status]}
                            </span>
                            <span className={priorityColors[selectedThread.priority]}>
                                أولوية {priorityLabels[selectedThread.priority]}
                            </span>
                        </div>

                        <div className="border-t pt-4 space-y-4">
                            <div className="bg-slate-50 p-4 rounded-xl">
                                <p className="text-sm text-slate-600">العميل: <strong>{selectedThread.customer}</strong></p>
                                <p className="text-sm text-slate-600">آخر تحديث: {formatDate(selectedThread.lastUpdate)}</p>
                            </div>

                            <textarea
                                className="w-full p-4 rounded-xl border border-slate-200 min-h-[100px] outline-none"
                                placeholder="اكتب رداً..."
                            />
                        </div>

                        <div className="flex gap-3">
                            <button className="flex-1 btn bg-brand-blue py-3 text-white hover:bg-blue-700">إرسال رد</button>
                            {selectedThread.status !== "closed" && (
                                <button
                                    className="btn bg-green-100 py-3 px-6 text-green-700 hover:bg-green-200"
                                    onClick={() => handleCloseThread(selectedThread.id)}
                                >
                                    إغلاق الموضوع
                                </button>
                            )}
                        </div>
                    </div>
                </div>
            )}

            {/* New Thread Modal */}
            {showNewModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4">
                        <h3 className="text-xl font-bold text-slate-800">موضوع جديد</h3>
                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="عنوان الموضوع *"
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none"
                                value={newThread.title}
                                onChange={(e) => setNewThread({ ...newThread, title: e.target.value })}
                            />
                            <input
                                type="text"
                                placeholder="اسم العميل *"
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none"
                                value={newThread.customer}
                                onChange={(e) => setNewThread({ ...newThread, customer: e.target.value })}
                            />
                            <select
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none"
                                value={newThread.priority}
                                onChange={(e) => setNewThread({ ...newThread, priority: e.target.value })}
                            >
                                <option value="low">أولوية منخفضة</option>
                                <option value="medium">أولوية متوسطة</option>
                                <option value="high">أولوية عالية</option>
                            </select>
                        </div>
                        <div className="flex gap-3">
                            <button className="flex-1 btn bg-brand-blue py-3 text-white hover:bg-blue-700" onClick={handleCreateThread}>
                                إنشاء
                            </button>
                            <button className="flex-1 btn bg-slate-100 py-3 text-slate-700 hover:bg-slate-200" onClick={() => setShowNewModal(false)}>
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
