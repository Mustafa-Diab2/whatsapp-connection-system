"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Task {
    id: string;
    title: string;
    description: string;
    due_date: string;
    priority: "low" | "medium" | "high" | "urgent";
    status: "todo" | "in_progress" | "completed" | "cancelled";
    customer?: { id: string; name: string; phone: string };
    created_at: string;
}

export default function TasksPage() {
    const [tasks, setTasks] = useState<Task[]>([]);
    const [loading, setLoading] = useState(true);
    const [customers, setCustomers] = useState<any[]>([]);

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        title: "",
        description: "",
        due_date: "",
        priority: "medium" as const,
        status: "todo" as const,
        customer_id: ""
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const [tRes, cRes] = await Promise.all([
                axios.get(`${API_URL}/api/tasks`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/api/customers`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            setTasks(tRes.data.tasks || []);
            setCustomers(cRes.data.customers || []);
        } catch (err) {
            console.error("Fetch tasks failed", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSave = async () => {
        if (!formData.title) return alert("يرجى إدخال عنوان المهمة");
        setIsSaving(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_URL}/api/tasks`, {
                ...formData,
                customer_id: formData.customer_id || undefined,
                due_date: formData.due_date ? new Date(formData.due_date).toISOString() : undefined
            }, { headers: { Authorization: `Bearer ${token}` } });

            setShowModal(false);
            setFormData({ title: "", description: "", due_date: "", priority: "medium", status: "todo", customer_id: "" });
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.error || "فشل حفظ المهمة");
        } finally {
            setIsSaving(false);
        }
    };

    const updateStatus = async (id: string, newStatus: string) => {
        try {
            const token = localStorage.getItem("token");
            await axios.put(`${API_URL}/api/tasks/${id}`, { status: newStatus }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setTasks(prev => prev.map(t => t.id === id ? { ...t, status: newStatus as any } : t));
        } catch (err) {
            alert("فشل تحديث الحالة");
        }
    };

    const priorityColors = {
        low: "bg-slate-100 text-slate-500",
        medium: "bg-blue-100 text-blue-600",
        high: "bg-orange-100 text-orange-600",
        urgent: "bg-red-100 text-red-600 shadow-sm shadow-red-100 animate-pulse"
    };

    return (
        <div className="min-h-screen bg-slate-50/30 p-6 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-10 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">المهام والمتابعات</h1>
                    <p className="text-slate-500 font-medium">نظم وقتك وتابع طلبات العملاء لضمان أفضل خدمة</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="btn bg-brand-blue text-white px-8 py-4 rounded-2xl shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all font-black flex items-center gap-2"
                >
                    <span className="text-xl">+</span>
                    إضافة مهمة جديدة
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {loading ? (
                    <div className="col-span-full py-20 text-center text-slate-400 font-bold">جاري تحميل المهام...</div>
                ) : tasks.length === 0 ? (
                    <div className="col-span-full py-20 text-center flex flex-col items-center gap-4">
                        <div className="text-6xl opacity-20">📝</div>
                        <p className="text-slate-400 font-bold italic text-lg">لا توجد مهام حالياً، ابدأ بإضافة مهمة جديدة!</p>
                    </div>
                ) : tasks.map(task => (
                    <div key={task.id} className="bg-white rounded-[2rem] border border-slate-100 shadow-xl shadow-slate-200/40 p-6 hover:border-indigo-200 transition-all flex flex-col relative overflow-hidden group">
                        <div className="flex justify-between items-start mb-4">
                            <span className={`px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest ${priorityColors[task.priority]}`}>
                                {task.priority === 'urgent' ? 'عاجل جداً' : task.priority === 'high' ? 'أولوية عالية' : task.priority === 'medium' ? 'متوسطة' : 'منخفضة'}
                            </span>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                <button className="h-8 w-8 rounded-lg bg-slate-50 flex items-center justify-center text-xs">✏️</button>
                            </div>
                        </div>

                        <h3 className={`text-lg font-black text-slate-900 mb-2 ${task.status === 'completed' ? 'line-through opacity-50' : ''}`}>
                            {task.title}
                        </h3>
                        <p className={`text-sm text-slate-500 font-medium mb-6 line-clamp-2 ${task.status === 'completed' ? 'opacity-30' : ''}`}>
                            {task.description || "بدون وصف إضافي"}
                        </p>

                        {task.customer && (
                            <div className="mt-auto mb-6 bg-slate-50 p-4 rounded-2xl border border-slate-100">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">العميل المرتبط</p>
                                <div className="flex items-center gap-3">
                                    <div className="h-8 w-8 rounded-full bg-white flex items-center justify-center text-xs shadow-sm">👤</div>
                                    <div className="overflow-hidden">
                                        <p className="text-sm font-black text-slate-700 truncate">{task.customer.name}</p>
                                        <p className="text-[10px] text-slate-400 font-bold">{task.customer.phone}</p>
                                    </div>
                                </div>
                            </div>
                        )}

                        <div className="flex items-center justify-between pt-4 border-t border-slate-50">
                            <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">الموعد النهائي</span>
                                <span className={`text-[11px] font-black ${new Date(task.due_date) < new Date() && task.status !== 'completed' ? 'text-red-500' : 'text-slate-600'}`}>
                                    {task.due_date ? new Date(task.due_date).toLocaleDateString("ar-EG") : "غير محدد"}
                                </span>
                            </div>

                            <select
                                className={`text-[10px] font-black px-3 py-2 rounded-xl border border-slate-100 outline-none transition-all ${task.status === 'completed' ? 'bg-green-50 text-green-600 border-green-100' : 'bg-white'
                                    }`}
                                value={task.status}
                                onChange={(e) => updateStatus(task.id, e.target.value)}
                            >
                                <option value="todo">في الانتظار</option>
                                <option value="in_progress">جاري التنفيذ</option>
                                <option value="completed">تم الإنجاز ✓</option>
                                <option value="cancelled">ملغاة</option>
                            </select>
                        </div>
                    </div>
                ))}
            </div>

            {/* Task Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">إضافة مهمة جديدة</h3>
                                <p className="text-xs text-slate-500 font-medium">حدد تفاصيل المتابعة والموعد النهائي</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="h-10 w-10 text-slate-400">✕</button>
                        </div>

                        <div className="p-10 space-y-6">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">عنوان المهمة *</label>
                                <input
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all font-bold"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    placeholder="مثال: الاتصال لتأكيد موعد التسليم"
                                />
                            </div>

                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">الأولوية</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all font-bold appearance-none"
                                        value={formData.priority}
                                        onChange={(e) => setFormData({ ...formData, priority: e.target.value as any })}
                                    >
                                        <option value="low">منخفضة</option>
                                        <option value="medium">متوسطة</option>
                                        <option value="high">عالية</option>
                                        <option value="urgent">عاجل جداً</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">الموعد النهائي</label>
                                    <input
                                        type="date"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all font-bold"
                                        value={formData.due_date}
                                        onChange={(e) => setFormData({ ...formData, due_date: e.target.value })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">ارتباط بعميل (اختياري)</label>
                                <select
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all font-bold appearance-none"
                                    value={formData.customer_id}
                                    onChange={(e) => setFormData({ ...formData, customer_id: e.target.value })}
                                >
                                    <option value="">لا يوجد ارتباط عيمل</option>
                                    {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                </select>
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">تفاصيل إضافية</label>
                                <textarea
                                    className="w-full bg-slate-50 border border-slate-100 rounded-[2rem] px-6 py-5 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all min-h-[120px] resize-none font-medium"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="اكتب ملاحظاتك هنا..."
                                />
                            </div>
                        </div>

                        <div className="p-10 bg-slate-50/50 border-t border-slate-100 flex gap-4">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 bg-brand-blue text-white py-5 rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isSaving ? "جاري الحفظ..." : "تنشيط المهمة 🚀"}
                            </button>
                            <button onClick={() => setShowModal(false)} className="flex-1 bg-white border border-slate-200 text-slate-600 py-5 rounded-2xl font-bold hover:bg-slate-50 transition-all">إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
