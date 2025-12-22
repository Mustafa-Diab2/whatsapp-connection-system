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
    customer?: { name: string; phone: string };
    stage_id: string;
    created_at: string;
}

export default function CRMPage() {
    const [stages, setStages] = useState<Stage[]>([]);
    const [deals, setDeals] = useState<Deal[]>([]);
    const [loading, setLoading] = useState(true);

    // Drag State
    const [draggedDealId, setDraggedDealId] = useState<string | null>(null);

    useEffect(() => {
        fetchData();
    }, []);

    const fetchData = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_URL}/api/deals`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setStages(res.data.stages);
            setDeals(res.data.deals);
        } catch (error) {
            console.error("Failed to fetch CRM data", error);
        } finally {
            setLoading(false);
        }
    };

    const handleDragStart = (e: React.DragEvent, dealId: string) => {
        setDraggedDealId(dealId);
        e.dataTransfer.effectAllowed = "move";
        // Optional: set drag image or data
    };

    const handleDragOver = (e: React.DragEvent) => {
        e.preventDefault(); // Necessary to allow dropping
    };

    const handleDrop = async (e: React.DragEvent, targetStageId: string) => {
        e.preventDefault();
        if (!draggedDealId) return;

        // Optimistic Update
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
            // Revert on error
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
            // Update UI
            setDeals(prev => prev.filter(d => d.id !== dealId));
        } catch (error) {
            console.error("Failed to delete deal", error);
            alert("حدث خطأ أثناء الحذف");
        }
    };

    const handleAddDeal = async () => {
        const title = prompt("اسم الصفقة:");
        if (!title) return;

        // For simplicity, just quick add now. In real app, modal with full details.
        const value = prompt("قيمة الصفقة (اختياري):", "0");
        const firstStage = stages[0]?.id;

        if (!firstStage) return alert("لا توجد مراحل متاحة");

        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_URL}/api/deals`,
                { title, value: Number(value), stageId: firstStage },
                { headers: { Authorization: `Bearer ${token}` } }
            );
            fetchData();
        } catch (error) {
            console.error("Failed to create deal", error);
        }
    };

    if (loading) return <div className="p-12 text-center text-slate-500">جاري التحميل...</div>;

    return (
        <div className="h-[calc(100vh-100px)] overflow-hidden flex flex-col p-4">
            <div className="flex justify-between items-center mb-6 px-2">
                <div>
                    <h1 className="text-2xl font-bold">إدارة المبيعات (Pipeline)</h1>
                    <p className="text-slate-500 text-sm">تتبع صفقاتك عبر المراحل المختلفة</p>
                </div>
                <button
                    onClick={handleAddDeal}
                    className="btn bg-brand-blue text-white px-4 py-2 rounded-lg hover:bg-blue-700"
                >
                    + صفقة جديدة
                </button>
            </div>

            <div className="flex-1 overflow-x-auto pb-4">
                <div className="flex gap-4 h-full min-w-max">
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
                                <div className="p-3 border-b border-slate-200 bg-white rounded-t-xl sticky top-0 z-10">
                                    <div className="flex justify-between items-center mb-1">
                                        <h3 className="font-bold text-slate-700">{stage.name}</h3>
                                        <span className="text-xs bg-slate-200 px-2 py-0.5 rounded-full text-slate-600">
                                            {stageDeals.length}
                                        </span>
                                    </div>
                                    <div className="text-xs font-semibold text-slate-500">
                                        {totalValue.toLocaleString()} JOD
                                    </div>
                                    <div className="mt-2 h-1 w-full rounded-full bg-slate-100 overflow-hidden">
                                        <div className="h-full" style={{ width: '100%', backgroundColor: stage.color || '#3b82f6' }}></div>
                                    </div>
                                </div>

                                {/* Deals List */}
                                <div className="flex-1 overflow-y-auto p-2 space-y-2">
                                    {stageDeals.map(deal => (
                                        <div
                                            key={deal.id}
                                            draggable
                                            onDragStart={(e) => handleDragStart(e, deal.id)}
                                            className="bg-white p-3 rounded-lg shadow-sm border border-slate-200 cursor-move hover:shadow-md hover:border-brand-blue transition-all"
                                        >
                                            <h4 className="font-semibold text-slate-800 mb-1">{deal.title}</h4>
                                            <div className="flex justify-between items-center text-xs text-slate-500">
                                                <span>{Number(deal.value).toLocaleString()}</span>
                                                <span>{deal.customer?.name || "بدون عميل"}</span>
                                            </div>
                                            <div className="mt-2 flex justify-between items-center pt-2 border-t border-slate-100">
                                                <div className="text-[10px] text-slate-400">
                                                    {new Date(deal.created_at).toLocaleDateString()}
                                                </div>
                                                <button
                                                    onClick={(e) => {
                                                        e.stopPropagation();
                                                        handleDeleteDeal(deal.id);
                                                    }}
                                                    className="text-red-400 hover:text-red-600 text-xs px-2 py-1 rounded hover:bg-red-50"
                                                >
                                                    حذف
                                                </button>
                                            </div>
                                        </div>
                                    ))}
                                    {stageDeals.length === 0 && (
                                        <div className="text-center py-8 text-slate-400 text-sm border border-dashed border-slate-300 rounded-lg">
                                            اسحب هنا
                                        </div>
                                    )}
                                </div>
                            </div>
                        )
                    })}
                </div>
            </div>
        </div>
    );
}
