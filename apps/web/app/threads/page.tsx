"use client";

import { useState } from "react";

type Thread = {
    id: string;
    title: string;
    customer: string;
    status: "open" | "pending" | "closed";
    priority: "high" | "medium" | "low";
    messages: number;
    lastUpdate: string;
};

const initialThreads: Thread[] = [
    { id: "1", title: "مشكلة في الطلب #1234", customer: "أحمد محمد", status: "open", priority: "high", messages: 5, lastUpdate: "منذ 10 دقائق" },
    { id: "2", title: "استفسار عن الأسعار", customer: "سارة علي", status: "pending", priority: "medium", messages: 3, lastUpdate: "منذ ساعة" },
    { id: "3", title: "طلب إرجاع منتج", customer: "محمود خالد", status: "open", priority: "high", messages: 8, lastUpdate: "منذ 30 دقيقة" },
    { id: "4", title: "شكر وتقدير", customer: "نور أحمد", status: "closed", priority: "low", messages: 2, lastUpdate: "منذ يومين" },
];

const statusLabels: Record<string, string> = { open: "مفتوح", pending: "قيد الانتظار", closed: "مغلق" };
const statusColors: Record<string, string> = { open: "bg-green-100 text-green-700", pending: "bg-amber-100 text-amber-700", closed: "bg-slate-100 text-slate-600" };
const priorityLabels: Record<string, string> = { high: "عالية", medium: "متوسطة", low: "منخفضة" };
const priorityColors: Record<string, string> = { high: "text-red-600", medium: "text-amber-600", low: "text-slate-500" };

export default function ThreadsPage() {
    const [threads, setThreads] = useState<Thread[]>(initialThreads);
    const [filter, setFilter] = useState("all");
    const [selectedThread, setSelectedThread] = useState<Thread | null>(null);

    const filteredThreads = threads.filter((t) => filter === "all" || t.status === filter);

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900">المواضيع</h1>
                    <p className="text-slate-500">إدارة تذاكر الدعم والمحادثات</p>
                </div>
                <div className="flex gap-2">
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
                                <span className="text-xs text-slate-400">{thread.lastUpdate}</span>
                            </div>
                        </div>
                    ))}
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
                                <p className="text-sm text-slate-600">آخر تحديث: {selectedThread.lastUpdate}</p>
                            </div>

                            <textarea
                                className="w-full p-4 rounded-xl border border-slate-200 min-h-[100px] outline-none"
                                placeholder="اكتب رداً..."
                            />
                        </div>

                        <div className="flex gap-3">
                            <button className="flex-1 btn bg-brand-blue py-3 text-white hover:bg-blue-700">إرسال رد</button>
                            <button
                                className="btn bg-green-100 py-3 px-6 text-green-700 hover:bg-green-200"
                                onClick={() => {
                                    setThreads((prev) => prev.map((t) => t.id === selectedThread.id ? { ...t, status: "closed" } : t));
                                    setSelectedThread(null);
                                }}
                            >
                                إغلاق الموضوع
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
