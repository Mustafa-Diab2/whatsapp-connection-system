"use client";

import { useState, useEffect, useCallback } from "react";
import { useRouter } from "next/navigation";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type Organization = {
    id: string;
    name: string;
    status: 'active' | 'suspended';
    member_limit: number;
    memberCount: number;
    created_at: string;
    mainAdmin?: {
        id: string;
        email: string;
        name: string;
        allowed_pages?: string[] | null;
    };
};

const AVAILABLE_PAGES = [
    { id: "dashboard", labelAr: "لوحة التحكم", href: "/dashboard" },
    { id: "whatsapp-connect", labelAr: "اتصال الواتساب", href: "/whatsapp-connect" },
    { id: "chat", labelAr: "المحادثات", href: "/chat" },
    { id: "meta", labelAr: "منصة Meta", href: "/integrations/meta" },
    { id: "crm", labelAr: "إدارة العملاء", href: "/crm" },
    { id: "contacts", labelAr: "جهة اتصال", href: "/contacts" },
    { id: "documents", labelAr: "قاعدة المعرفة", href: "/documents" },
    { id: "campaigns", labelAr: "الحملات", href: "/campaigns" },
    { id: "inventory", labelAr: "المخزون", href: "/inventory" },
    { id: "purchases", labelAr: "المشتريات والموردين", href: "/purchases" },
    { id: "orders", labelAr: "المبيعات والطلبيات", href: "/orders" },
    { id: "invoices", labelAr: "الفواتير والحسابات", href: "/invoices" },
    { id: "loyalty", labelAr: "نقاط الولاء", href: "/loyalty" },
    { id: "tasks", labelAr: "المهام والمتابعات", href: "/tasks" },
    { id: "reports", labelAr: "التقارير والمالية", href: "/reports" },
    { id: "ai", labelAr: "الذكاء الاصطناعي", href: "/ai" },
    { id: "settings", labelAr: "الإعدادات", href: "/settings" },
    { id: "profile", labelAr: "ملفي الشخصي", href: "/profile" },
];

export default function SuperAdminPage() {
    const [organizations, setOrganizations] = useState<Organization[]>([]);
    const [loading, setLoading] = useState(true);
    const [showCreateModal, setShowCreateModal] = useState(false);
    const [showEditModal, setShowEditModal] = useState(false);
    const [selectedOrg, setSelectedOrg] = useState<Organization | null>(null);
    const [newOrg, setNewOrg] = useState({
        name: "",
        adminEmail: "",
        adminPassword: "",
        adminName: "",
        member_limit: 10,
        allowed_pages: [] as string[]
    });
    const [editForm, setEditForm] = useState({
        name: "",
        status: 'active' as 'active' | 'suspended',
        member_limit: 10,
        allowed_pages: [] as string[]
    });
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);
    const router = useRouter();

    const fetchOrgs = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/api/auth/super/organizations`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (res.status === 403) {
                router.push("/dashboard");
                return;
            }
            const data = await res.json();
            if (data.organizations) setOrganizations(data.organizations);
        } catch (err) {
            console.error(err);
        } finally {
            setLoading(false);
        }
    }, [router]);

    useEffect(() => {
        fetchOrgs();
    }, [fetchOrgs]);

    const handleCreateOrg = async () => {
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/api/auth/super/organizations`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(newOrg)
            });
            if (res.ok) {
                setMsg({ type: "success", text: "تم إنشاء الحساب والصلاحيات بنجاح" });
                setShowCreateModal(false);
                fetchOrgs();
            } else {
                const data = await res.json();
                setMsg({ type: "error", text: data.error || "فشل الإنشاء" });
            }
        } catch (err) {
            setMsg({ type: "error", text: "حدث خطأ ما" });
        }
    };

    const handleUpdateOrg = async () => {
        if (!selectedOrg) return;
        try {
            const token = localStorage.getItem("token");

            // 1. Update Org (Status, Limit)
            const orgRes = await fetch(`${apiBase}/api/auth/super/organizations/${selectedOrg.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({
                    status: editForm.status,
                    member_limit: editForm.member_limit,
                    name: editForm.name
                })
            });

            if (!orgRes.ok) throw new Error("فشل تحديث بيانات المنظمة");

            // 2. Update Admin (Allowed Pages)
            if (selectedOrg.mainAdmin) {
                const userRes = await fetch(`${apiBase}/api/auth/super/users/${selectedOrg.mainAdmin.id}`, {
                    method: "PUT",
                    headers: {
                        "Content-Type": "application/json",
                        Authorization: `Bearer ${token}`
                    },
                    body: JSON.stringify({
                        allowed_pages: editForm.allowed_pages
                    })
                });
                if (!userRes.ok) throw new Error("فشل تحديث صلاحيات الأدمن");
            }

            setMsg({ type: "success", text: "تم التحديث بنجاح" });
            setShowEditModal(false);
            fetchOrgs();
        } catch (err: any) {
            setMsg({ type: "error", text: err.message || "حدث خطأ أثناء التحديث" });
        }
    };

    const openEditModal = (org: Organization) => {
        setSelectedOrg(org);
        setEditForm({
            name: org.name,
            status: org.status,
            member_limit: org.member_limit,
            allowed_pages: org.mainAdmin?.allowed_pages || []
        });
        setShowEditModal(true);
    };

    if (loading) return <div className="p-10 text-center">جاري التحميل...</div>;

    return (
        <div className="p-6 max-w-6xl mx-auto space-y-6">
            <div className="flex justify-between items-center bg-white p-6 rounded-2xl shadow-sm border border-slate-100">
                <div>
                    <h1 className="text-3xl font-black text-slate-800">إدارة الحسابات (سوبر أدمن)</h1>
                    <p className="text-slate-500 font-medium mt-1">إدارة المنظمات، الصلاحيات، وحالة الاشتراكات</p>
                </div>
                <button
                    onClick={() => setShowCreateModal(true)}
                    className="bg-brand-blue text-white px-6 py-3 rounded-xl font-bold shadow-lg shadow-blue-100 hover:scale-105 transition-all"
                >
                    + إنشاء حساب جديد
                </button>
            </div>

            {msg && (
                <div className={`p-4 rounded-xl font-bold flex items-center justify-between ${msg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                    <span>{msg.text}</span>
                    <button onClick={() => setMsg(null)}>✕</button>
                </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {organizations.map(org => (
                    <div key={org.id} className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 hover:shadow-md transition-all group overflow-hidden relative">
                        {/* Status Label */}
                        <div className={`absolute -right-12 top-6 rotate-45 px-14 py-1 text-[10px] font-black uppercase tracking-widest text-center ${org.status === 'active' ? 'bg-green-500 text-white' : 'bg-red-500 text-white'}`}>
                            {org.status === 'active' ? 'نشط' : 'موقوف'}
                        </div>

                        <div className="space-y-4">
                            <div>
                                <h3 className="text-xl font-black text-slate-800 line-clamp-1">{org.name}</h3>
                                <p className="text-xs text-slate-400 font-mono mt-1">{org.id.substring(0, 8)}...</p>
                            </div>

                            <div className="bg-slate-50 p-4 rounded-xl space-y-2">
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">الأدمن:</span>
                                    <span className="font-bold text-slate-700">{org.mainAdmin?.name || '---'}</span>
                                </div>
                                <div className="flex justify-between text-sm">
                                    <span className="text-slate-500">الأعضاء:</span>
                                    <span className="font-bold text-slate-700">{org.memberCount} / {org.member_limit}</span>
                                </div>
                            </div>

                            <div className="pt-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2">الصلاحيات الحالية</p>
                                <div className="flex flex-wrap gap-1">
                                    {(!org.mainAdmin?.allowed_pages || org.mainAdmin.allowed_pages.length === 0) ? (
                                        <span className="px-2 py-1 bg-blue-50 text-blue-600 rounded-md text-[10px] font-bold">كل الصفحات</span>
                                    ) : (
                                        org.mainAdmin.allowed_pages.slice(0, 3).map(p => (
                                            <span key={p} className="px-2 py-1 bg-slate-100 text-slate-600 rounded-md text-[10px] font-bold">
                                                {AVAILABLE_PAGES.find(ap => ap.href === p)?.labelAr || p}
                                            </span>
                                        ))
                                    )}
                                    {org.mainAdmin?.allowed_pages && org.mainAdmin.allowed_pages.length > 3 && (
                                        <span className="px-2 py-1 bg-slate-100 text-slate-500 rounded-md text-[10px] font-bold">+{org.mainAdmin.allowed_pages.length - 3}</span>
                                    )}
                                </div>
                            </div>

                            <button
                                onClick={() => openEditModal(org)}
                                className="w-full bg-slate-900 text-white py-3 rounded-xl font-bold text-sm hover:bg-slate-800 transition-colors"
                            >
                                تعديل الصلاحيات والحالة
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {/* Create Modal */}
            {showCreateModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-md rounded-3xl p-8 shadow-2xl animate-in zoom-in-95 duration-200">
                        <h2 className="text-2xl font-black text-slate-800 mb-6 text-center">إنشاء حساب جديد</h2>
                        <div className="space-y-4">
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">اسم المنظمة</label>
                                <input
                                    type="text"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-brand-blue/20 outline-none"
                                    placeholder="مثال: شركة البركة"
                                    value={newOrg.name}
                                    onChange={e => setNewOrg({ ...newOrg, name: e.target.value })}
                                />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">اسم الأدمن</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-brand-blue/20 outline-none"
                                        placeholder="مصطفى"
                                        value={newOrg.adminName}
                                        onChange={e => setNewOrg({ ...newOrg, adminName: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">حد الأعضاء</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-brand-blue/20 outline-none"
                                        value={newOrg.member_limit}
                                        onChange={e => setNewOrg({ ...newOrg, member_limit: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">البريد الإلكتروني</label>
                                <input
                                    type="email"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-brand-blue/20 outline-none"
                                    placeholder="admin@company.com"
                                    value={newOrg.adminEmail}
                                    onChange={e => setNewOrg({ ...newOrg, adminEmail: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">كلمة المرور</label>
                                <input
                                    type="password"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold focus:ring-2 focus:ring-brand-blue/20 outline-none"
                                    placeholder="••••••••"
                                    value={newOrg.adminPassword}
                                    onChange={e => setNewOrg({ ...newOrg, adminPassword: e.target.value })}
                                />
                            </div>

                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">الصلاحيات المسموح بها لهذا الأدمن</label>
                                <div className="grid grid-cols-2 gap-2 p-3 bg-slate-50 rounded-2xl border border-slate-100 max-h-40 overflow-y-auto">
                                    {AVAILABLE_PAGES.map(page => (
                                        <label key={page.id} className="flex items-center gap-2 p-1 cursor-pointer">
                                            <input
                                                type="checkbox"
                                                className="w-3 h-3 rounded text-brand-blue"
                                                checked={newOrg.allowed_pages.includes(page.href)}
                                                onChange={e => {
                                                    const updated = e.target.checked
                                                        ? [...newOrg.allowed_pages, page.href]
                                                        : newOrg.allowed_pages.filter(p => p !== page.href);
                                                    setNewOrg({ ...newOrg, allowed_pages: updated });
                                                }}
                                            />
                                            <span className="text-[10px] font-bold text-slate-600">{page.labelAr}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4">
                                <button
                                    onClick={() => setShowCreateModal(false)}
                                    className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl font-bold"
                                >
                                    إلغاء
                                </button>
                                <button
                                    onClick={handleCreateOrg}
                                    className="flex-1 bg-brand-blue text-white py-4 rounded-2xl font-bold shadow-lg shadow-blue-100"
                                >
                                    إنشاء الآن
                                </button>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Edit Modal */}
            {showEditModal && (
                <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-white w-full max-w-2xl rounded-3xl p-8 shadow-2xl animate-in fade-in duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-2xl font-black text-slate-800">تعديل حساب: {selectedOrg?.name}</h2>
                            <div className="flex gap-2">
                                <button
                                    onClick={() => setEditForm({ ...editForm, status: 'active' })}
                                    className={`px-4 py-2 rounded-xl font-bold text-xs ${editForm.status === 'active' ? 'bg-green-500 text-white' : 'bg-slate-100 text-slate-400'}`}
                                >
                                    نشط
                                </button>
                                <button
                                    onClick={() => setEditForm({ ...editForm, status: 'suspended' })}
                                    className={`px-4 py-2 rounded-xl font-bold text-xs ${editForm.status === 'suspended' ? 'bg-red-500 text-white' : 'bg-slate-100 text-slate-400'}`}
                                >
                                    إيقاف
                                </button>
                            </div>
                        </div>

                        <div className="space-y-6">
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">اسم المنظمة</label>
                                    <input
                                        type="text"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold outline-none"
                                        value={editForm.name}
                                        onChange={e => setEditForm({ ...editForm, name: e.target.value })}
                                    />
                                </div>
                                <div>
                                    <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">حد الأعضاء</label>
                                    <input
                                        type="number"
                                        className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 text-sm font-bold outline-none"
                                        value={editForm.member_limit}
                                        onChange={e => setEditForm({ ...editForm, member_limit: parseInt(e.target.value) })}
                                    />
                                </div>
                            </div>

                            <div>
                                <label className="text-xs font-black text-slate-400 uppercase tracking-widest block mb-2">الصفحات المسموح بها للأدمن</label>
                                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 p-4 bg-slate-50 rounded-2xl border border-slate-100 max-h-60 overflow-y-auto">
                                    {AVAILABLE_PAGES.map(page => (
                                        <label key={page.id} className="flex items-center gap-2 p-2 rounded-lg hover:bg-white cursor-pointer transition-colors group">
                                            <input
                                                type="checkbox"
                                                className="w-4 h-4 rounded border-slate-300 text-brand-blue"
                                                checked={editForm.allowed_pages.includes(page.href)}
                                                onChange={e => {
                                                    const updated = e.target.checked
                                                        ? [...editForm.allowed_pages, page.href]
                                                        : editForm.allowed_pages.filter(p => p !== page.href);
                                                    setEditForm({ ...editForm, allowed_pages: updated });
                                                }}
                                            />
                                            <span className="text-xs font-bold text-slate-600 group-hover:text-slate-900">{page.labelAr}</span>
                                        </label>
                                    ))}
                                </div>
                            </div>

                            <div className="flex gap-4 pt-4 font-black">
                                <button className="flex-1 bg-slate-100 text-slate-600 py-4 rounded-2xl" onClick={() => setShowEditModal(false)}>إلغاء</button>
                                <button className="flex-1 bg-slate-900 text-white py-4 rounded-2xl shadow-xl shadow-slate-200" onClick={handleUpdateOrg}>حفظ التغييرات</button>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
