"use client";

import { useState, useEffect } from "react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Stage {
    id: string;
    name: string;
    color: string;
}

interface Deal {
    id: string;
    title: string;
    value: number;
    customer_id?: string;
    priority?: string;
    tags?: string[];
    customer?: { name: string };
    stage_id: string;
    created_at: string;
}

interface Customer {
    id: string;
    name: string;
}

export default function CRMPage() {
    const [stages, setStages] = useState<Stage[]>([]);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [loading, setLoading] = useState(true);

    // Modal State
    const [showDealModal, setShowDealModal] = useState(false);
    const [isSaving, setIsSaving] = useState(false);
    const [dealForm, setDealForm] = useState({
        title: "",
        value: 0,
        customerId: "",
        stageId: "",
        priority: "medium",
        notes: "",
        tags: [] as string[],
        expectedCloseDate: ""
    });

    // Drag State
    const [draggedDealId, setDraggedDealId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
        fetchCustomers();
    }, []);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_URL}/api/deals`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setStages(res.data.stages);
            setDeals(res.data.deals);
            if (res.data.stages.length > 0) {
                setDealForm(prev => ({ ...prev, stageId: res.data.stages[0].id }));
            }
        } catch (error) {
            console.error("Failed to fetch CRM data", error);
        } finally {
            setLoading(false);
        }
    };

    const fetchCustomers = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_URL}/api/customers`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCustomers(res.data.customers || []);
        } catch (err) {
            console.error("Failed to fetch customers", err);
        }
    }

    const handleDragStart = (e: React.DragEvent, dealId: string) => {
        setDraggedDealId(dealId);
        e.dataTransfer.effectAllowed = "move";
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault();
    };

    const handleDrop = async (e: React.DragEvent, targetStageId: string) => {
        e.preventDefault();
        if (!draggedDealId) return;

        const originalDeals = [...deals];
        setDeals(prev => prev.map(d =>
            d.id === draggedDealId ? { ...d, stage_id: targetStageId } : d
        ));

        try {
            const token = localStorage.getItem("token");
            await axios.put(`${API_URL}/api/deals/${draggedDealId}`,
                { stageId: targetStageId },
                { headers: { Authorization: `Bearer ${token}` } }
            );
        } catch (error) {
            console.error("Failed to update deal stage", error);
            setDeals(originalDeals);
            alert("فشل تحديث المرحلة");
        } finally {
            setDraggedDealId(null);
        }
    };

    const handleDeleteDeal = async (dealId: string) => {
        if (!confirm("هل أنت متأكد من حذف هذه الصفقة؟")) return;

        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_URL}/api/deals/${dealId}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setDeals(prev => prev.filter(d => d.id !== dealId));
        } catch (error) {
            console.error("Failed to delete deal", error);
            alert("حدث خطأ أثناء الحذف");
        }
    };

    const handleSaveDeal = async () => {
        if (!dealForm.title || !dealForm.stageId) return alert("يرجى إدخال جميع البيانات المطلوبة");

        setIsSaving(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_URL}/api/deals`, dealForm, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchData();
            setShowDealModal(false);
            setDealForm({
                title: "",
                value: 0,
                customerId: "",
                stageId: stages[0]?.id || "",
                priority: "medium",
                notes: "",
                tags: [],
                expectedCloseDate: ""
            });
        } catch (error: any) {
            console.error("Failed to create deal", error);
            const msg = error.response?.data?.error || "فشل إنشاء الصفقة";
            const details = error.response?.data?.details ? `\nالتفاصيل: ${error.response.data.details}` : "";
            alert(`${msg}${details}`);
        } finally {
            setIsSaving(false);
        }
    };

    if (loading) return (
        <div className="flex h-screen items-center justify-center bg-slate-50/50">
            <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent"></div>
        </div>
    );

    return (
        <div className="h-screen overflow-hidden flex flex-col bg-slate-50/30">
            <div className="flex justify-between items-center bg-white border-b border-slate-200 px-8 py-5">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">💼</span>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">إدارة المبيعات</h1>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">تتبع دورة حياة صفقاتك بكل دقة</p>
                </div>
                <div className="flex items-center gap-4">
                    <div className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 flex items-center gap-2">
                        <span className="text-xs font-bold text-slate-500">مجموع القيمة:</span>
                        <span className="text-sm font-black text-brand-blue">
                            {deals.reduce((sum, d) => sum + Number(d.value), 0).toLocaleString()} JOD
                        </span>
                    </div>
                    <button
                        onClick={() => setShowDealModal(true)}
                        className="btn bg-brand-blue text-white px-6 py-3 rounded-2xl hover:bg-blue-700 shadow-lg shadow-blue-500/20 active:scale-95 transition-all text-sm font-bold flex items-center gap-2"
                    >
                        <span>+</span>
                        صفقة جديدة
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-x-auto p-8 no-scrollbar scroll-smooth">
                <div className="flex gap-6 h-full min-w-max">
                    {stages.map(stage => {
                        const stageDeals = deals.filter(d => d.stage_id === stage.id);
                        const totalValue = stageDeals.reduce((sum, d) => sum + Number(d.value), 0);

                        return (
                            <div
                                key={stage.id}
                                className="w-72 flex flex-col bg-slate-100 rounded-xl max-h-full"
                                onDragOver={handleDragOver}
                                onDrop={(e) => handleDrop(e, stage.id)}
                            >
                                {/* Column Header */}
                                <div className="p-4 border-b border-slate-200 bg-white rounded-t-2xl sticky top-0 z-10 shadow-sm">
                                    <div className="flex justify-between items-center mb-1">
                                        <h3 className="font-extrabold text-slate-800 tracking-tight">{stage.name}</h3>
                                        <span className="text-[10px] font-black bg-slate-100 px-2 py-0.5 rounded-lg text-slate-500">
                                            {stageDeals.length}
                                        </span>
                                    </div>
                                    <div className="text-xs font-bold text-brand-blue/70">
                                        {totalValue.toLocaleString()} JOD
                                    </div>
                                    <div className="mt-3 h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full transition-all duration-1000" style={{ width: '100%', backgroundColor: stage.color || '#3b82f6' }}></div>
                                    </div>
                                </div>

                                {/* Deals List */}
                                <div className="flex-1 overflow-y-auto p-3 space-y-3 custom-scrollbar">
                                    {stageDeals.length > 0 ? (
                                        stageDeals.map(deal => (
                                            <div
                                                key={deal.id}
                                                draggable
                                                onDragStart={(e) => handleDragStart(e, deal.id)}
                                                className="group bg-white p-4 rounded-2xl shadow-sm border border-slate-100 cursor-grab active:cursor-grabbing hover:shadow-xl hover:border-brand-blue/30 transition-all duration-300 relative overflow-hidden"
                                            >
                                                <div className="flex justify-between items-start mb-2">
                                                    <h4 className="font-bold text-slate-900 leading-tight flex-1">{deal.title}</h4>
                                                    <span className={`text-[8px] font-black uppercase px-2 py-0.5 rounded-md ${deal.priority === 'high' ? 'bg-red-50 text-red-500' :
                                                        deal.priority === 'medium' ? 'bg-orange-50 text-orange-500' : 'bg-blue-50 text-blue-500'
                                                        }`}>
                                                        {deal.priority}
                                                    </span>
                                                </div>

                                                <div className="flex items-center gap-2 mb-3">
                                                    <div className="h-6 w-6 rounded-full bg-slate-100 flex items-center justify-center text-[10px]">👤</div>
                                                    <span className="text-[10px] font-bold text-slate-500 truncate">{deal.customer?.name || "بدون عميل"}</span>
                                                </div>

                                                <div className="flex flex-wrap gap-1 mb-4">
                                                    {((deal as any).tags || []).length > 0 ? (deal as any).tags.map((tag: string, i: number) => (
                                                        <span key={i} className="text-[8px] font-bold bg-slate-50 text-slate-400 border border-slate-100 px-1.5 py-0.5 rounded-md">
                                                            #{tag}
                                                        </span>
                                                    )) : (
                                                        <span className="text-[8px] font-medium text-slate-300 italic">لا توجد وسوم</span>
                                                    )}
                                                </div>

                                                <div className="flex justify-between items-center pt-3 border-t border-slate-50">
                                                    <div className="text-[9px] font-bold text-slate-400 flex items-center gap-1">
                                                        🗓️ {new Date(deal.created_at).toLocaleDateString()}
                                                    </div>
                                                    <div className="flex items-center gap-2">
                                                        <span className="text-xs font-black text-slate-900">{Number(deal.value).toLocaleString()} <span className="text-[8px] text-slate-400">JOD</span></span>
                                                        <button
                                                            onClick={(e) => {
                                                                e.stopPropagation();
                                                                handleDeleteDeal(deal.id);
                                                            }}
                                                            className="h-6 w-6 flex items-center justify-center rounded-lg text-slate-300 hover:text-red-500 hover:bg-red-50 transition-colors"
                                                        >
                                                            ✕
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Hover Accent */}
                                                <div className="absolute left-0 top-0 bottom-0 w-1 bg-brand-blue opacity-0 group-hover:opacity-100 transition-opacity"></div>
                                            </div>
                                        ))
                                    ) : (
                                        <div className="h-32 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl text-slate-300 transition-colors hover:border-slate-300">
                                            <span className="text-xl mb-1">📥</span>
                                            <span className="text-[10px] font-bold uppercase tracking-widest">المرحلة فارغة</span>
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>

            {/* Create Deal Modal */}
            {showDealModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4 transition-all">
                    <div className="bg-white w-full max-w-lg rounded-[2.5rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-black text-slate-900 tracking-tight">إنشاء صفقة جديدة</h3>
                                <p className="text-xs text-slate-500 font-medium">أدخل تفاصيل العقد أو الفرصة البيعية</p>
                            </div>
                            <button onClick={() => setShowDealModal(false)} className="h-10 w-10 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all active:scale-90">✕</button>
                        </div>

                        <div className="p-8 space-y-5">
                            <div className="grid grid-cols-2 gap-4">
                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">عنوان الصفقة *</label>
                                    <input
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all"
                                        placeholder="مثال: توريد أجهزة لشركة X"
                                        value={dealForm.title}
                                        onChange={(e) => setDealForm({ ...dealForm, title: e.target.value })}
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">القيمة (JOD)</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all"
                                        value={dealForm.value}
                                        onChange={(e) => setDealForm({ ...dealForm, value: Number(e.target.value) })}
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">الأولوية</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all appearance-none"
                                        value={dealForm.priority}
                                        onChange={(e) => setDealForm({ ...dealForm, priority: e.target.value })}
                                    >
                                        <option value="low">منخفضة</option>
                                        <option value="medium">متوسطة</option>
                                        <option value="high">عالية</option>
                                    </select>
                                </div>

                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">العميل المرتبط</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all appearance-none"
                                        value={dealForm.customerId}
                                        onChange={(e) => setDealForm({ ...dealForm, customerId: e.target.value })}
                                    >
                                        <option value="">بدون عميل (عام)</option>
                                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>

                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">الوسوم (مفصولة بفاصلة)</label>
                                    <input
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all"
                                        placeholder="مثال: مستعجل، عميل VIP، عرض خاص"
                                        value={dealForm.tags.join(", ")}
                                        onChange={(e) => setDealForm({ ...dealForm, tags: e.target.value.split(",").map(t => t.trim()).filter(t => t !== "") })}
                                    />
                                </div>

                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">تاريخ الإغلاق المتوقع</label>
                                    <input
                                        type="date"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all"
                                        value={dealForm.expectedCloseDate}
                                        onChange={(e) => setDealForm({ ...dealForm, expectedCloseDate: e.target.value })}
                                    />
                                </div>

                                <div className="col-span-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">ملاحظات إضافية</label>
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all min-h-[100px] resize-none"
                                        placeholder="أي سياق إضافي عن الصفقة..."
                                        value={dealForm.notes}
                                        onChange={(e) => setDealForm({ ...dealForm, notes: e.target.value })}
                                    />
                                </div>
                            </div>
                        </div>

                        <div className="p-8 bg-slate-50/50 border-t border-slate-100 flex gap-4">
                            <button
                                onClick={handleSaveDeal}
                                disabled={isSaving}
                                className="flex-1 bg-brand-blue text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isSaving ? "جاري الحفظ..." : "تأكيد وإنشاء الصفقة"}
                            </button>
                            <button
                                onClick={() => setShowDealModal(false)}
                                className="flex-1 bg-white border border-slate-200 text-slate-600 py-4 rounded-2xl font-bold hover:bg-slate-50 transition-all"
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
