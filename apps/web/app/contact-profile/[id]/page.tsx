"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter, useParams } from "next/navigation";
import Link from "next/link";
import { encodeId } from "../../../lib/obfuscator";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

// Predefined classification categories
const PREDEFINED_CATEGORIES = [
    { id: "vip", label: "VIP", color: "bg-amber-100 text-amber-700 border-amber-200" },
    { id: "lead", label: "عميل محتمل", color: "bg-blue-100 text-blue-700 border-blue-200" },
    { id: "customer", label: "عميل حالي", color: "bg-green-100 text-green-700 border-green-200" },
    { id: "prospect", label: "مهتم", color: "bg-purple-100 text-purple-700 border-purple-200" },
    { id: "inactive", label: "غير نشط", color: "bg-slate-100 text-slate-600 border-slate-200" },
];

interface Customer {
    id: string;
    name: string;
    phone: string;
    email?: string;
    notes?: string;
    tags?: string[];
    status?: string;
    source?: string;
    created_at: string;
    last_contact_at?: string;
}

interface WhatsAppStatus {
    name?: string;
    pushname?: string;
    isOnline?: boolean;
    lastSeen?: number;
    profilePicUrl?: string;
    isBusiness?: boolean;
}

const getAuthHeaders = () => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
    return {
        'Content-Type': 'application/json',
        ...(token ? { 'Authorization': `Bearer ${token}` } : {})
    };
};

export default function ContactProfilePage() {
    const router = useRouter();
    const params = useParams();
    const customerId = params.id as string;

    const [customer, setCustomer] = useState<Customer | null>(null);
    const [waStatus, setWaStatus] = useState<WhatsAppStatus | null>(null);
    const [loading, setLoading] = useState(true);
    const [loadingWaStatus, setLoadingWaStatus] = useState(false);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState<string | null>(null);

    const [notes, setNotes] = useState("");
    const [newTag, setNewTag] = useState("");

    // Fetch customer data
    const fetchCustomer = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase}/api/customers/${customerId}`, {
                headers: getAuthHeaders()
            });
            if (!res.ok) {
                throw new Error("العميل غير موجود");
            }
            const data = await res.json();
            setCustomer(data.customer);
            setNotes(data.customer.notes || "");
        } catch (err: any) {
            setError(err.message);
        } finally {
            setLoading(false);
        }
    }, [customerId]);

    // Fetch WhatsApp presence status
    const fetchWaStatus = useCallback(async (phone: string) => {
        setLoadingWaStatus(true);
        try {
            const res = await fetch(`${apiBase}/whatsapp/contact-status/${phone}`, {
                headers: getAuthHeaders()
            });
            if (res.ok) {
                const data = await res.json();
                setWaStatus(data.contact);
            }
        } catch (e) {
            // WhatsApp status not available
            console.log("WhatsApp status not available");
        } finally {
            setLoadingWaStatus(false);
        }
    }, []);

    useEffect(() => {
        if (customerId) {
            fetchCustomer();
        }
    }, [customerId, fetchCustomer]);

    useEffect(() => {
        if (customer?.phone) {
            fetchWaStatus(customer.phone);
        }
    }, [customer?.phone, fetchWaStatus]);

    // Save notes
    const handleSaveNotes = async () => {
        if (!customer) return;
        setSaving(true);
        try {
            const res = await fetch(`${apiBase}/api/customers/${customer.id}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({ notes })
            });
            if (res.ok) {
                const data = await res.json();
                setCustomer(data.customer);
                alert("تم حفظ الملاحظات بنجاح ✓");
            }
        } catch (e) {
            alert("فشل حفظ الملاحظات");
        } finally {
            setSaving(false);
        }
    };

    // Add tag
    const handleAddTag = async (tag: string) => {
        if (!customer || !tag.trim()) return;
        const newTags = [...(customer.tags || []), tag.trim()];
        await updateTags(newTags);
        setNewTag("");
    };

    // Remove tag
    const handleRemoveTag = async (tagToRemove: string) => {
        if (!customer) return;
        const newTags = (customer.tags || []).filter(t => t !== tagToRemove);
        await updateTags(newTags);
    };

    // Toggle predefined category
    const handleToggleCategory = async (categoryId: string) => {
        if (!customer) return;
        const currentTags = customer.tags || [];
        const hasCategory = currentTags.includes(categoryId);
        const newTags = hasCategory
            ? currentTags.filter(t => t !== categoryId)
            : [...currentTags, categoryId];
        await updateTags(newTags);
    };

    // Update tags API call
    const updateTags = async (tags: string[]) => {
        if (!customer) return;
        setSaving(true);
        try {
            const res = await fetch(`${apiBase}/api/customers/${customer.id}`, {
                method: "PUT",
                headers: getAuthHeaders(),
                body: JSON.stringify({ tags })
            });
            if (res.ok) {
                const data = await res.json();
                setCustomer(data.customer);
            }
        } catch (e) {
            alert("فشل تحديث التصنيفات");
        } finally {
            setSaving(false);
        }
    };

    // Format last seen
    const formatLastSeen = (timestamp?: number) => {
        if (!timestamp) return null;
        const date = new Date(timestamp * 1000);
        const now = new Date();
        const diff = now.getTime() - date.getTime();
        const minutes = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);

        if (minutes < 1) return "متصل الآن";
        if (minutes < 60) return `آخر ظهور منذ ${minutes} دقيقة`;
        if (hours < 24) return `آخر ظهور منذ ${hours} ساعة`;
        return `آخر ظهور منذ ${days} يوم`;
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="w-10 h-10 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    if (error || !customer) {
        return (
            <div className="flex flex-col items-center justify-center min-h-screen gap-4">
                <div className="text-6xl">😕</div>
                <h2 className="text-xl font-bold text-slate-800">{error || "العميل غير موجود"}</h2>
                <button
                    onClick={() => router.back()}
                    className="px-6 py-2 bg-slate-100 rounded-xl text-slate-600 font-bold hover:bg-slate-200 transition-all"
                >
                    العودة
                </button>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50/50 pb-10">
            {/* Header */}
            <div className="bg-white border-b border-slate-100 sticky top-0 z-20">
                <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
                    <button
                        onClick={() => router.back()}
                        className="h-10 w-10 flex items-center justify-center rounded-xl bg-slate-100 text-slate-500 hover:bg-slate-200 transition-all"
                    >
                        ➡️
                    </button>
                    <h1 className="text-lg font-black text-slate-800">ملف العميل</h1>
                    <Link
                        href={`/chat?c=${encodeId(customer.phone + '@c.us')}`}
                        className="h-10 px-4 flex items-center justify-center gap-2 rounded-xl bg-green-500 text-white font-bold text-sm hover:bg-green-600 transition-all shadow-lg shadow-green-500/20"
                    >
                        💬 محادثة
                    </Link>
                </div>
            </div>

            <div className="max-w-3xl mx-auto px-4 pt-6 space-y-6">
                {/* Profile Card */}
                <div className="bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                    <div className="flex flex-col items-center text-center">
                        {/* Avatar */}
                        <div className="relative mb-4">
                            {waStatus?.profilePicUrl ? (
                                <img
                                    src={waStatus.profilePicUrl}
                                    alt={customer.name}
                                    className="h-28 w-28 rounded-[32px] object-cover ring-4 ring-slate-50"
                                />
                            ) : (
                                <div className="h-28 w-28 rounded-[32px] bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-white text-4xl font-black ring-4 ring-slate-50">
                                    {customer.name?.charAt(0)?.toUpperCase() || "👤"}
                                </div>
                            )}
                            {/* Online indicator */}
                            {waStatus?.isOnline && (
                                <span className="absolute bottom-1 right-1 h-5 w-5 bg-green-500 rounded-full border-4 border-white"></span>
                            )}
                        </div>

                        {/* Name & Phone */}
                        <h2 className="text-2xl font-black text-slate-900 mb-1">
                            {waStatus?.pushname || waStatus?.name || customer.name}
                        </h2>
                        <p dir="ltr" className="text-sm font-bold text-slate-400 tracking-wider">
                            {customer.phone}
                        </p>

                        {/* Online/LastSeen Status */}
                        <div className="mt-3 flex items-center gap-2">
                            {loadingWaStatus ? (
                                <span className="text-xs text-slate-400 animate-pulse">جاري التحقق من الحالة...</span>
                            ) : waStatus?.isOnline ? (
                                <span className="px-3 py-1 rounded-full bg-green-100 text-green-700 text-xs font-bold flex items-center gap-1">
                                    <span className="h-2 w-2 bg-green-500 rounded-full animate-pulse"></span>
                                    متصل الآن
                                </span>
                            ) : waStatus?.lastSeen ? (
                                <span className="px-3 py-1 rounded-full bg-slate-100 text-slate-600 text-xs font-bold">
                                    {formatLastSeen(waStatus.lastSeen)}
                                </span>
                            ) : (
                                <span className="text-xs text-slate-400">حالة الظهور غير متاحة</span>
                            )}

                            {waStatus?.isBusiness && (
                                <span className="px-2 py-1 rounded-full bg-blue-50 text-blue-600 text-[10px] font-bold uppercase">
                                    Business
                                </span>
                            )}
                        </div>

                        {/* Last Contact */}
                        {customer.last_contact_at && (
                            <p className="mt-2 text-xs text-slate-400">
                                آخر تواصل: {new Date(customer.last_contact_at).toLocaleDateString("ar-EG", {
                                    year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit'
                                })}
                            </p>
                        )}
                    </div>
                </div>

                {/* Classification Categories */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-slate-800">التصنيف</h3>
                        {saving && <span className="text-xs text-blue-500 animate-pulse">جاري الحفظ...</span>}
                    </div>

                    {/* Predefined Categories */}
                    <div className="flex flex-wrap gap-2 mb-4">
                        {PREDEFINED_CATEGORIES.map(cat => {
                            const isSelected = customer.tags?.includes(cat.id);
                            return (
                                <button
                                    key={cat.id}
                                    onClick={() => handleToggleCategory(cat.id)}
                                    className={`px-4 py-2 rounded-xl text-xs font-bold border transition-all ${isSelected
                                            ? cat.color + " ring-2 ring-offset-1 ring-current"
                                            : "bg-slate-50 text-slate-400 border-slate-100 hover:bg-slate-100"
                                        }`}
                                >
                                    {isSelected && "✓ "}{cat.label}
                                </button>
                            );
                        })}
                    </div>

                    {/* Custom Tags */}
                    <div className="pt-4 border-t border-slate-50">
                        <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-3">وسوم مخصصة</p>
                        <div className="flex flex-wrap gap-2 mb-3">
                            {customer.tags?.filter(t => !PREDEFINED_CATEGORIES.find(c => c.id === t)).map(tag => (
                                <span
                                    key={tag}
                                    className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-100 text-slate-600 text-xs font-bold"
                                >
                                    #{tag}
                                    <button
                                        onClick={() => handleRemoveTag(tag)}
                                        className="text-slate-400 hover:text-red-500 transition-colors"
                                    >
                                        ✕
                                    </button>
                                </span>
                            ))}
                        </div>
                        <div className="flex gap-2">
                            <input
                                type="text"
                                placeholder="إضافة وسم جديد..."
                                value={newTag}
                                onChange={(e) => setNewTag(e.target.value)}
                                onKeyDown={(e) => e.key === 'Enter' && handleAddTag(newTag)}
                                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 text-sm font-bold outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all"
                            />
                            <button
                                onClick={() => handleAddTag(newTag)}
                                disabled={!newTag.trim()}
                                className="px-4 py-2.5 rounded-xl bg-brand-blue text-white text-sm font-bold hover:bg-blue-700 transition-all disabled:opacity-50"
                            >
                                إضافة
                            </button>
                        </div>
                    </div>
                </div>

                {/* Notes Section */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <div className="flex items-center justify-between mb-4">
                        <h3 className="text-sm font-black text-slate-800">ملاحظات</h3>
                        <button
                            onClick={handleSaveNotes}
                            disabled={saving || notes === (customer.notes || "")}
                            className="px-4 py-2 rounded-xl bg-blue-50 text-blue-600 text-xs font-bold hover:bg-blue-100 transition-all disabled:opacity-50"
                        >
                            {saving ? "جاري الحفظ..." : "حفظ الملاحظات"}
                        </button>
                    </div>
                    <textarea
                        value={notes}
                        onChange={(e) => setNotes(e.target.value)}
                        placeholder="اكتب ملاحظاتك عن هذا العميل هنا... (مثل: تفضيلات، تاريخ التعامل، ملاحظات مهمة)"
                        className="w-full min-h-[150px] p-4 rounded-2xl border border-slate-200 bg-slate-50 text-sm font-medium outline-none focus:ring-2 focus:ring-blue-500/20 focus:border-blue-500 transition-all resize-none"
                    />
                </div>

                {/* Customer Info */}
                <div className="bg-white rounded-3xl p-6 shadow-sm border border-slate-100">
                    <h3 className="text-sm font-black text-slate-800 mb-4">معلومات إضافية</h3>
                    <div className="space-y-3">
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                            <span className="text-xs font-bold text-slate-400">المصدر</span>
                            <span className="text-sm font-bold text-slate-700">{customer.source || "واتساب"}</span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                            <span className="text-xs font-bold text-slate-400">الحالة</span>
                            <span className={`px-3 py-1 rounded-full text-xs font-bold ${customer.status === 'active' ? 'bg-green-100 text-green-700' :
                                    customer.status === 'inactive' ? 'bg-slate-100 text-slate-600' :
                                        'bg-amber-100 text-amber-700'
                                }`}>
                                {customer.status === 'active' ? 'نشط' : customer.status === 'inactive' ? 'غير نشط' : 'معلق'}
                            </span>
                        </div>
                        <div className="flex justify-between items-center py-2 border-b border-slate-50">
                            <span className="text-xs font-bold text-slate-400">تاريخ الإضافة</span>
                            <span className="text-sm font-bold text-slate-700">
                                {new Date(customer.created_at).toLocaleDateString("ar-EG")}
                            </span>
                        </div>
                        {customer.email && (
                            <div className="flex justify-between items-center py-2">
                                <span className="text-xs font-bold text-slate-400">البريد الإلكتروني</span>
                                <span className="text-sm font-bold text-slate-700">{customer.email}</span>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
