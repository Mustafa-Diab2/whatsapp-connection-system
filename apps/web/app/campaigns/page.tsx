"use client";

import { useState, useEffect } from "react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Campaign {
    id: string;
    name: string;
    status: string;
    total_recipients: number;
    successful_sends: number;
    created_at: string;
}

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);

    // Form State
    const [name, setName] = useState("");
    const [message, setMessage] = useState("");
    const [targetGroup, setTargetGroup] = useState("all");

    useEffect(() => {
        fetchCampaigns();
    }, []);

    const fetchCampaigns = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_URL}/api/campaigns`, {
                headers: { Authorization: `Bearer ${token}` },
            });
            setCampaigns(res.data.campaigns || []);
        } catch (error) {
            console.error("Failed to fetch campaigns", error);
        } finally {
            setFetching(false);
        }
    };

    const handleCreate = async () => {
        if (!name || !message) {
            alert("يرجى ملء جميع الحقول");
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(
                `${API_URL}/api/campaigns`,
                {
                    name,
                    messageTemplate: message,
                    targetGroup,
                    action: "send", // Auto send for now
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            alert("تم بدء الحملة بنجاح!");
            setName("");
            setMessage("");
            fetchCampaigns();
        } catch (error) {
            console.error("Failed to create campaign", error);
            alert("فشل إنشاء الحملة");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="space-y-6 p-6">
            <div>
                <h1 className="text-2xl font-bold">الحملات الإعلانية (Broadcasts)</h1>
                <p className="text-slate-500">أرسل رسائل جماعية لعملائك بسهولة.</p>
            </div>

            <div className="grid gap-6 lg:grid-cols-3">
                {/* New Campaign Form */}
                <div className="card p-6 lg:col-span-1 h-fit">
                    <h2 className="mb-4 text-lg font-bold">حملة جديدة</h2>

                    <div className="space-y-4">
                        <div>
                            <label className="text-sm text-slate-600 block mb-1">اسم الحملة</label>
                            <input
                                type="text"
                                className="w-full rounded-lg border border-slate-300 p-2"
                                placeholder="مثال: عروض الجمعة السوداء"
                                value={name}
                                onChange={(e) => setName(e.target.value)}
                            />
                        </div>

                        <div>
                            <label className="text-sm text-slate-600 block mb-1">المجموعة المستهدفة</label>
                            <select
                                className="w-full rounded-lg border border-slate-300 p-2"
                                value={targetGroup}
                                onChange={(e) => setTargetGroup(e.target.value)}
                            >
                                <option value="all">كل العملاء</option>
                                <option value="active">العملاء النشطون فقط</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-sm text-slate-600 block mb-1">نص الرسالة</label>
                            <textarea
                                className="w-full rounded-lg border border-slate-300 p-2 h-32"
                                placeholder="مرحباً {name}، لدينا عروض جديدة..."
                                value={message}
                                onChange={(e) => setMessage(e.target.value)}
                            ></textarea>
                            <p className="text-xs text-slate-400 mt-1">يمكنك استخدام {'{name}'} لإدراج اسم العميل.</p>
                        </div>

                        <button
                            className="btn w-full bg-brand-blue text-white py-2 rounded-lg hover:bg-blue-700"
                            onClick={handleCreate}
                            disabled={loading}
                        >
                            {loading ? "جاري الإرسال..." : "إرسال الحملة الآن"}
                        </button>
                    </div>
                </div>

                {/* Campaign History */}
                <div className="card p-6 lg:col-span-2">
                    <h2 className="mb-4 text-lg font-bold">سجل الحملات</h2>

                    {fetching ? (
                        <p className="text-center text-slate-500">جاري التحميل...</p>
                    ) : campaigns.length === 0 ? (
                        <div className="text-center py-8 bg-slate-50 rounded-lg border border-dashed border-slate-300">
                            <p className="text-slate-500">لا توجد حملات سابقة</p>
                        </div>
                    ) : (
                        <div className="space-y-3">
                            {campaigns.map(camp => (
                                <div key={camp.id} className="border border-slate-200 rounded-lg p-4 flex justify-between items-center bg-white">
                                    <div>
                                        <p className="font-bold text-slate-800">{camp.name}</p>
                                        <p className="text-xs text-slate-500">
                                            {new Date(camp.created_at).toLocaleDateString('ar-EG')} - {new Date(camp.created_at).toLocaleTimeString('ar-EG')}
                                        </p>
                                    </div>

                                    <div className="text-left">
                                        <span className={`badge mb-1 block w-fit ml-auto ${camp.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                camp.status === 'processing' ? 'bg-blue-100 text-blue-700' :
                                                    'bg-slate-200 text-slate-700'
                                            }`}>
                                            {camp.status === 'completed' ? 'مكتملة' :
                                                camp.status === 'processing' ? 'جاري الإرسال' : camp.status}
                                        </span>
                                        <p className="text-xs font-semibold">
                                            تم الإرسال: {camp.successful_sends} / {camp.total_recipients}
                                        </p>
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
