"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import axios from "axios";
import { io, Socket } from "socket.io-client";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";
const SOCKET_URL = process.env.NEXT_PUBLIC_SOCKET_URL || API_URL;

interface Campaign {
    id: string;
    name: string;
    status: string;
    total_recipients: number;
    successful_sends: number;
    failed_sends?: number;
    error_message?: string;
    created_at: string;
}

interface CampaignLog {
    id: string;
    phone: string;
    customer_name?: string;
    status: 'sent' | 'failed';
    error_message?: string;
    sent_at: string;
}

// Toast notification component
const Toast = ({ message, type, onClose }: { message: string; type: 'success' | 'error' | 'info'; onClose: () => void }) => {
    useEffect(() => {
        const timer = setTimeout(onClose, 4000);
        return () => clearTimeout(timer);
    }, [onClose]);

    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500'
    };

    return (
        <div className={`fixed top-4 right-4 z-[100] ${colors[type]} text-white px-6 py-3 rounded-2xl shadow-xl animate-in slide-in-from-top-2 font-bold text-sm flex items-center gap-2`}>
            {type === 'success' && '✓'}
            {type === 'error' && '✕'}
            {type === 'info' && 'ℹ'}
            {message}
            <button onClick={onClose} className="ml-2 hover:opacity-70">✕</button>
        </div>
    );
};

export default function CampaignsPage() {
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [loading, setLoading] = useState(false);
    const [fetching, setFetching] = useState(true);
    const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'info' } | null>(null);
    const socketRef = useRef<Socket | null>(null);

    // Form State
    const [name, setName] = useState("");
    const [message, setMessage] = useState("");
    const [targetGroup, setTargetGroup] = useState("all");

    // For detailed logs
    const [selectedCampaignForLogs, setSelectedCampaignForLogs] = useState<Campaign | null>(null);
    const [campaignLogs, setCampaignLogs] = useState<CampaignLog[]>([]);
    const [loadingLogs, setLoadingLogs] = useState(false);

    const showToast = useCallback((message: string, type: 'success' | 'error' | 'info') => {
        setToast({ message, type });
    }, []);

    // WebSocket connection for real-time updates
    useEffect(() => {
        const token = localStorage.getItem("token");
        const userStr = localStorage.getItem("user");
        let orgId = "default";

        try {
            if (userStr) {
                const user = JSON.parse(userStr);
                orgId = user.organization_id || user.organizationId || "default";
            }
        } catch (e) { }

        const socket = io(SOCKET_URL, {
            transports: ["websocket", "polling"],
            auth: { token }
        });
        socketRef.current = socket;

        socket.on("connect", () => {
            socket.emit("wa:subscribe", { clientId: orgId });
        });

        // Listen for campaign updates
        socket.on("campaign:update", (data: Partial<Campaign> & { id: string }) => {
            setCampaigns(prev => prev.map(c =>
                c.id === data.id ? { ...c, ...data } : c
            ));
        });

        socket.on("connect_error", (err) => {
            console.error("Socket connection error:", err);
        });

        return () => {
            socket.disconnect();
        };
    }, []);

    const fetchCampaigns = useCallback(async () => {
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
    }, []);

    useEffect(() => {
        fetchCampaigns();
    }, [fetchCampaigns]);

    // Fallback polling only for processing campaigns (reduced frequency)
    useEffect(() => {
        const hasProcessing = campaigns.some(c => c.status === 'processing');
        if (!hasProcessing) return;

        const interval = setInterval(fetchCampaigns, 5000);
        return () => clearInterval(interval);
    }, [campaigns, fetchCampaigns]);

    const handleResend = async (id: string) => {
        if (!confirm("هل تريد استكمال إرسال هذه الحملة؟ سيتم الإرسال فقط للعملاء الذين لم يستلموا الرسالة.")) return;

        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_URL}/api/campaigns/${id}/send`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showToast("تم بدء الإرسال في الخلفية", "success");
            fetchCampaigns();
        } catch (error) {
            console.error("Failed to resend campaign", error);
            showToast("فشل بدء الإرسال", "error");
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("هل أنت متأكد من حذف هذه الحملة نهائياً؟ لا يمكن التراجع عن هذا الإجراء.")) return;

        // Optimistic update
        setCampaigns(prev => prev.filter(c => c.id !== id));

        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_URL}/api/campaigns/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showToast("تم حذف الحملة بنجاح", "success");
        } catch (error) {
            console.error("Failed to delete campaign", error);
            showToast("فشل حذف الحملة", "error");
            fetchCampaigns(); // Revert on error
        }
    };

    const handleStop = async (id: string) => {
        if (!confirm("هل تريد إيقاف هذه الحملة؟ سيتم حفظ التقدم الحالي.")) return;

        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_URL}/api/campaigns/${id}/stop`, {}, {
                headers: { Authorization: `Bearer ${token}` }
            });
            showToast("تم إرسال أمر الإيقاف", "info");
            fetchCampaigns();
        } catch (error) {
            console.error("Failed to stop campaign", error);
            showToast("فشل إيقاف الحملة", "error");
        }
    };

    const handleCreate = async () => {
        if (!name.trim()) {
            showToast("يرجى إدخال اسم الحملة", "error");
            return;
        }
        if (!message.trim()) {
            showToast("يرجى إدخال نص الرسالة", "error");
            return;
        }

        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            await axios.post(
                `${API_URL}/api/campaigns`,
                {
                    name: name.trim(),
                    messageTemplate: message.trim(),
                    targetGroup,
                    action: "send",
                },
                { headers: { Authorization: `Bearer ${token}` } }
            );

            showToast("🚀 تم بدء الحملة بنجاح!", "success");
            setName("");
            setMessage("");
            fetchCampaigns();
        } catch (error: any) {
            console.error("Failed to create campaign", error);
            showToast(error.response?.data?.error || "فشل إنشاء الحملة", "error");
        } finally {
            setLoading(false);
        }
    };

    const fetchLogs = async (campaign: Campaign) => {
        setSelectedCampaignForLogs(campaign);
        setLoadingLogs(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_URL}/api/campaigns/${campaign.id}/logs`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            setCampaignLogs(res.data.logs || []);
        } catch (error) {
            console.error("Failed to fetch logs", error);
            showToast("فشل تحميل سجلات الحملة", "error");
        } finally {
            setLoadingLogs(false);
        }
    };

    return (
        <div className="h-screen overflow-hidden flex flex-col bg-slate-50/30">
            {/* Toast Notification */}
            {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

            <div className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">📢</span>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">الحملات الإعلانية</h1>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">أرسل رسائل جماعية ذكية لعملائك</p>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                <div className="grid gap-8 lg:grid-cols-12 max-w-7xl mx-auto">
                    {/* New Campaign Form */}
                    <div className="lg:col-span-5 space-y-6">
                        <div className="card p-8 bg-white shadow-xl shadow-slate-200/50 rounded-[2.5rem] border-none">
                            <h2 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                                <span>➕</span> إنشاء حملة جديدة
                            </h2>

                            <div className="space-y-5">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">اسم الحملة</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all"
                                        placeholder="عروض الجمعة السوداء"
                                        value={name}
                                        onChange={(e) => setName(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">المجموعة المستهدفة</label>
                                    <select
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all appearance-none"
                                        value={targetGroup}
                                        onChange={(e) => setTargetGroup(e.target.value)}
                                    >
                                        <option value="all">كل العملاء والاتصالات</option>
                                        <option value="active">العملاء النشطون فقط</option>
                                        <option value="type_lead">عملاء محتملون (Leads)</option>
                                        <option value="type_customer">عملاء فعليون (Customers)</option>
                                        <option value="type_vip">عملاء VIP</option>
                                        <option value="type_support">الدعم فني</option>
                                        <option value="type_spam">المزعجون (Spam)</option>
                                    </select>
                                </div>

                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">نص الرسالة</label>
                                    <textarea
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-4 py-3 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all min-h-[140px] resize-none"
                                        placeholder="مرحباً {name}..."
                                        value={message}
                                        onChange={(e) => setMessage(e.target.value)}
                                    ></textarea>
                                    <div className="flex justify-between items-center mt-2 px-1">
                                        <p className="text-[10px] font-bold text-slate-400">استخدم {'{name}'} للتخصيص</p>
                                        <span className="text-[10px] font-bold bg-slate-100 px-2 py-0.5 rounded-lg text-slate-500">{message.length}/1000</span>
                                    </div>
                                </div>

                                <button
                                    className="btn w-full bg-brand-blue text-white py-4 rounded-2xl font-black shadow-lg shadow-blue-500/20 hover:bg-blue-700 active:scale-95 transition-all disabled:opacity-50 mt-4 h-14"
                                    onClick={handleCreate}
                                    disabled={loading}
                                >
                                    {loading ? (
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent"></div>
                                            <span>جاري البدء...</span>
                                        </div>
                                    ) : "إطلاق الحملة الآن 🚀"}
                                </button>
                            </div>
                        </div>

                        {/* Live Preview Overlay */}
                        <div className="card bg-[#e5ddd5] p-6 rounded-[2.5rem] border-none relative overflow-hidden shadow-inner h-[280px]">
                            {/* WhatsApp Header Mockup */}
                            <div className="absolute top-0 left-0 right-0 bg-[#075e54] text-white px-4 py-2 flex items-center justify-between z-10">
                                <span className="text-[10px] font-bold">معاينة مباشرة</span>
                                <div className="flex gap-2 text-xs">📞 📷 ⋮</div>
                            </div>
                            <div className="mt-8 flex flex-col items-start gap-2">
                                <div className="bg-white p-3 rounded-2xl rounded-tl-none relative shadow-sm max-w-[85%] animate-in slide-in-from-left duration-300">
                                    <div className="text-sm text-slate-800 whitespace-pre-wrap leading-relaxed">
                                        {message || "اكتب رسالتك لترى المعاينة هنا..."}
                                    </div>
                                    <span className="text-[9px] text-slate-400 block text-right mt-1">10:00 PM</span>
                                    {/* Arrow */}
                                    <div className="absolute -left-2 top-0 w-0 h-0 border-t-[10px] border-t-white border-l-[10px] border-l-transparent"></div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Campaign History */}
                    <div className="lg:col-span-7">
                        <div className="card p-8 bg-white shadow-xl shadow-slate-200/50 rounded-[2.5rem] border-none h-full flex flex-col">
                            <div className="flex justify-between items-center mb-6">
                                <h2 className="text-lg font-black text-slate-800">سجل الحملات</h2>
                                <span className="text-[10px] font-black bg-slate-50 px-3 py-1 rounded-full text-slate-400 uppercase">تحديث مباشر</span>
                            </div>

                            {fetching ? (
                                <div className="flex-1 flex flex-col items-center justify-center gap-4 py-20">
                                    <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent"></div>
                                    <p className="text-sm font-bold text-slate-400">جاري جلب السجلات...</p>
                                </div>
                            ) : campaigns.length === 0 ? (
                                <div className="flex-1 flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-100">
                                    <div className="text-4xl mb-4">📭</div>
                                    <p className="text-slate-400 font-bold">لا توجد حملات سابقة في سجلك</p>
                                </div>
                            ) : (
                                <div className="space-y-4 overflow-y-auto pr-2 custom-scrollbar">
                                    {campaigns.map(camp => {
                                        const totalProcessed = (camp.successful_sends || 0) + (camp.failed_sends || 0);
                                        const progress = camp.total_recipients > 0 ? (totalProcessed / camp.total_recipients) * 100 : 0;
                                        return (
                                            <div key={camp.id} className="group p-5 bg-slate-50/50 border border-slate-100 rounded-3xl hover:bg-white hover:shadow-xl hover:border-brand-blue/10 transition-all duration-300">
                                                <div className="flex justify-between items-start mb-4">
                                                    <div>
                                                        <p className="font-extrabold text-slate-800 text-lg group-hover:text-brand-blue transition-colors">{camp.name}</p>
                                                        <p className="text-[10px] font-bold text-slate-400 mt-1 uppercase tracking-tighter">
                                                            📅 {new Date(camp.created_at).toLocaleDateString('ar-EG')} • {new Date(camp.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                                                        </p>
                                                    </div>
                                                    <div className="flex flex-col items-end gap-2">
                                                        <span className={`text-[10px] font-black px-3 py-1 rounded-xl uppercase tracking-widest ${camp.status === 'completed' ? 'bg-green-100 text-green-700' :
                                                            camp.status === 'processing' ? 'bg-blue-500 text-white animate-pulse' :
                                                                camp.status === 'stopped' ? 'bg-orange-100 text-orange-700' :
                                                                    camp.status === 'failed' ? 'bg-red-100 text-red-700' :
                                                                        'bg-slate-200 text-slate-600'
                                                            }`}>
                                                            {camp.status === 'completed' ? 'تم الانتهاء' :
                                                                camp.status === 'processing' ? 'جاري التنفيذ' :
                                                                    camp.status === 'stopped' ? 'متوقفة' :
                                                                        camp.status === 'failed' ? 'فشلت' : 'مسودة'}
                                                        </span>
                                                        <span className="text-xs font-black text-slate-900">{Math.round(progress)}%</span>
                                                    </div>
                                                </div>

                                                {/* Progress Bar */}
                                                <div className="h-2.5 w-full bg-slate-200/50 rounded-full overflow-hidden mb-3">
                                                    <div
                                                        className={`h-full transition-all duration-1000 ease-out ${camp.status === 'completed' ? 'bg-brand-green' : 'bg-brand-blue'}`}
                                                        style={{ width: `${progress}%` }}
                                                    ></div>
                                                </div>

                                                <div className="flex justify-between items-center text-xs">
                                                    <div className="flex gap-4">
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase">المستهدفين</span>
                                                            <span className="font-black text-slate-700">{camp.total_recipients}</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase">الناجحة</span>
                                                            <span className="font-black text-brand-green">{camp.successful_sends || 0}</span>
                                                        </div>
                                                        <div className="flex flex-col">
                                                            <span className="text-[9px] font-black text-slate-400 uppercase">الفاشلة</span>
                                                            <span className="font-black text-red-500">{camp.failed_sends || 0}</span>
                                                        </div>
                                                    </div>

                                                    {camp.status === 'processing' ? (
                                                        <button
                                                            onClick={() => handleStop(camp.id)}
                                                            className="h-10 px-4 bg-red-500 text-white rounded-xl text-xs font-black hover:bg-red-600 hover:shadow-md active:scale-95 transition-all animate-pulse"
                                                        >
                                                            ⏹️ إيقاف الحملة
                                                        </button>
                                                    ) : (
                                                        <div className="flex gap-2">
                                                            <button
                                                                onClick={() => fetchLogs(camp)}
                                                                className="h-10 px-4 bg-slate-100 border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-white hover:border-brand-blue hover:text-brand-blue hover:shadow-md active:scale-95 transition-all"
                                                            >
                                                                📊 تقرير
                                                            </button>
                                                            <button
                                                                onClick={() => handleResend(camp.id)}
                                                                className="h-10 px-4 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:border-brand-blue hover:text-brand-blue hover:shadow-md active:scale-95 transition-all"
                                                            >
                                                                ↺ إرسال
                                                            </button>
                                                            <button
                                                                onClick={() => handleDelete(camp.id)}
                                                                className="h-10 px-4 bg-white border border-red-200 rounded-xl text-xs font-black text-red-500 hover:bg-red-50 hover:border-red-300 hover:shadow-md active:scale-95 transition-all"
                                                            >
                                                                🗑️ حذف
                                                            </button>
                                                        </div>
                                                    )}
                                                </div>

                                                {camp.error_message && (
                                                    <div className="mt-4 p-3 bg-red-50 border border-red-100 rounded-2xl">
                                                        <p className="text-[10px] font-bold text-red-600 uppercase">سبب الفشل:</p>
                                                        <p className="text-[11px] text-red-500 font-medium leading-relaxed mt-1">{camp.error_message}</p>
                                                    </div>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
            {/* Logs Modal */}
            {selectedCampaignForLogs && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-in fade-in duration-200">
                    <div className="bg-white w-full max-w-2xl rounded-[2.5rem] shadow-2xl flex flex-col max-h-[85vh] overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 tracking-tight">تقرير الحملة: {selectedCampaignForLogs.name}</h3>
                                <p className="text-xs font-bold text-slate-400 mt-1 uppercase">إجمالي المستهدفين: {selectedCampaignForLogs.total_recipients}</p>
                            </div>
                            <button
                                onClick={() => setSelectedCampaignForLogs(null)}
                                className="h-10 w-10 flex items-center justify-center rounded-2xl bg-white border border-slate-200 text-slate-400 hover:text-red-500 hover:border-red-100 transition-all font-black"
                            >✕</button>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                            {loadingLogs ? (
                                <div className="flex flex-col items-center justify-center py-20 gap-4">
                                    <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-blue border-t-transparent"></div>
                                    <p className="text-sm font-black text-slate-400">جاري جلب تفاصيل الإرسال...</p>
                                </div>
                            ) : campaignLogs.length === 0 ? (
                                <div className="flex flex-col items-center justify-center py-20 bg-slate-50/50 rounded-3xl border border-dashed border-slate-100">
                                    <div className="text-4xl mb-4">🏜️</div>
                                    <p className="text-slate-400 font-bold">لا توجد سجلات مفصلة لهذه الحملة</p>
                                </div>
                            ) : (
                                <div className="space-y-3">
                                    {campaignLogs.map(log => (
                                        <div key={log.id} className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-100 hover:bg-white hover:shadow-md transition-all">
                                            <div className="flex items-center gap-4">
                                                <div className={`h-10 w-10 rounded-xl flex items-center justify-center font-black ${log.status === 'sent' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'}`}>
                                                    {log.status === 'sent' ? '✓' : '✕'}
                                                </div>
                                                <div>
                                                    <p className="text-sm font-black text-slate-700">{log.customer_name || 'غير معروف'}</p>
                                                    <p className="text-[11px] font-bold text-slate-500 mt-0.5" dir="ltr">{log.phone}</p>
                                                    <p className="text-[10px] font-bold text-slate-400 mt-0.5">{new Date(log.sent_at).toLocaleString('ar-EG')}</p>
                                                </div>
                                            </div>
                                            <div>
                                                {log.status === 'sent' ? (
                                                    <span className="text-[10px] font-black bg-green-500 text-white px-3 py-1 rounded-lg uppercase tracking-widest">نجح</span>
                                                ) : (
                                                    <div className="flex flex-col items-end gap-1">
                                                        <span className="text-[10px] font-black bg-red-500 text-white px-3 py-1 rounded-lg uppercase tracking-widest">فشل</span>
                                                        {log.error_message && <p className="text-[9px] font-bold text-red-400 max-w-[200px] text-right line-clamp-1">{log.error_message}</p>}
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            )}
                        </div>

                        <div className="p-8 border-t border-slate-100 bg-slate-50/50 flex justify-end">
                            <button
                                onClick={() => setSelectedCampaignForLogs(null)}
                                className="px-8 py-3 bg-white border border-slate-200 rounded-xl text-xs font-black text-slate-600 hover:bg-slate-50 transition-all font-black uppercase tracking-widest"
                            >
                                إغلاق التقرير
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
