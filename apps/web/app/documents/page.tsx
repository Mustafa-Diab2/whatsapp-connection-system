"use client";

import { useState, useEffect } from "react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Document {
    id: string;
    content: string;
    source: string;
    created_at: string;
}

export default function KnowledgeBasePage() {
    const [documents, setDocuments] = useState<Document[]>([]);
    const [newContent, setNewContent] = useState("");
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);

    // Fetch documents
    useEffect(() => {
        fetchDocuments();
    }, []);

    const fetchDocuments = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_URL}/api/documents`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setDocuments(res.data.documents);
        } catch (error) {
            console.error("Failed to fetch documents", error);
        } finally {
            setFetching(false);
        }
    };

    const handleAddDocument = async () => {
        if (!newContent.trim()) return;

        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(
                `${API_URL}/api/documents`,
                { content: newContent, source: "manual" },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            setNewContent("");
            await fetchDocuments();
            alert("تمت إضافة المحتوى بنجاح");
        } catch (error) {
            console.error("Failed to add document", error);
            alert("حدث خطأ أثناء الإضافة");
        } finally {
            setLoading(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("هل أنت متأكد من الحذف؟")) return;

        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_URL}/api/documents/${id}`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            await fetchDocuments();
        } catch (error) {
            console.error("Failed to delete document", error);
            alert("حدث خطأ أثناء الحذف");
        }
    };

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-bold">قاعدة المعرفة (Knowledge Base)</h1>
                <p className="text-slate-500">
                    أضف معلومات هنا لتدريب البوت عليها. سيستخدم البوت هذه المعلومات للرد على استفسارات
                    العملاء.
                </p>
            </div>

            <div className="grid gap-6 md:grid-cols-2">
                {/* Add New Document */}
                <div className="card p-6 h-fit">
                    <h2 className="mb-4 text-lg font-bold">إضافة معرفة جديدة</h2>
                    <textarea
                        className="w-full rounded-lg border border-slate-300 p-3 h-40 focus:outline-none focus:ring-2 focus:ring-brand-blue"
                        placeholder="أدخل النص هنا... مثال: ساعات العمل من 9 صباحًا حتى 5 مساءً."
                        value={newContent}
                        onChange={(e) => setNewContent(e.target.value)}
                    ></textarea>
                    <button
                        className="btn mt-4 w-full bg-brand-blue text-white py-2 rounded-lg hover:bg-blue-700 disabled:opacity-50"
                        onClick={handleAddDocument}
                        disabled={loading || !newContent.trim()}
                    >
                        {loading ? "جاري الإضافة..." : "حفظ المعلومات"}
                    </button>
                </div>

                {/* List Documents */}
                <div className="card p-6">
                    <h2 className="mb-4 text-lg font-bold flex justify-between items-center">
                        <span>المعلومات المحفوظة</span>
                        <span className="text-sm font-normal text-slate-500">
                            {documents.length} مستند
                        </span>
                    </h2>

                    {fetching ? (
                        <p className="text-center text-slate-500">جاري التحميل...</p>
                    ) : documents.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                            <p className="text-slate-500">لا توجد معلومات مضافة بعد</p>
                        </div>
                    ) : (
                        <div className="space-y-3 max-h-[500px] overflow-y-auto pr-2">
                            {documents.map((doc) => (
                                <div
                                    key={doc.id}
                                    className="rounded-lg border border-slate-200 p-3 hover:border-brand-blue transition-colors bg-white shadow-sm"
                                >
                                    <p className="text-sm text-slate-800 line-clamp-3 mb-2">{doc.content}</p>
                                    <div className="flex items-center justify-between mt-2 pt-2 border-t border-slate-100">
                                        <span className="text-xs text-slate-400">
                                            {new Date(doc.created_at).toLocaleDateString("ar-EG")}
                                        </span>
                                        <button
                                            onClick={() => handleDelete(doc.id)}
                                            className="text-xs text-red-500 hover:text-red-700 hover:underline"
                                        >
                                            حذف
                                        </button>
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
