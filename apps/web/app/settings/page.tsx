"use client";

import { useState, useEffect, useCallback } from "react";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

type TeamMember = {
    id: string;
    name: string;
    email: string;
    role: string;
    created_at: string;
    avatar?: string;
    allowed_pages?: string[] | null;
};

const AVAILABLE_PAGES = [
    { id: "dashboard", label: "Dashboard", labelAr: "لوحة التحكم", href: "/dashboard" },
    { id: "whatsapp-connect", label: "WhatsApp Connection", labelAr: "اتصال الواتساب", href: "/whatsapp-connect" },
    { id: "chat", label: "Chat", labelAr: "المحادثات", href: "/chat" },
    { id: "meta", label: "Meta Platform", labelAr: "منصة Meta", href: "/integrations/meta" },
    { id: "crm", label: "Mini CRM", labelAr: "إدارة العملاء", href: "/crm" },
    { id: "contacts", label: "Contacts", labelAr: "جهة اتصال", href: "/contacts" },
    { id: "documents", label: "Knowledge Base", labelAr: "قاعدة المعرفة", href: "/documents" },
    { id: "campaigns", label: "Campaigns", labelAr: "الحملات", href: "/campaigns" },
    { id: "inventory", label: "Inventory", labelAr: "المخزون", href: "/inventory" },
    { id: "orders", label: "Sales & Orders", labelAr: "المبيعات والطلبيات", href: "/orders" },
    { id: "invoices", label: "Invoices", labelAr: "الفواتير والحسابات", href: "/invoices" },
    { id: "loyalty", label: "Loyalty", labelAr: "نقاط الولاء", href: "/loyalty" },
    { id: "tasks", label: "Tasks", labelAr: "المهام والمتابعات", href: "/tasks" },
    { id: "reports", label: "Reports", labelAr: "التقارير والمالية", href: "/reports" },
    { id: "ai", label: "AI Agent", labelAr: "الذكاء الاصطناعي", href: "/ai" },
    { id: "settings", label: "Configuration", labelAr: "الإعدادات", href: "/settings" },
    { id: "profile", label: "My Profile", labelAr: "ملفي الشخصي", href: "/profile" },
];

export default function SettingsPage() {
    const [settings, setSettings] = useState({
        companyName: "",
        welcomeMessage: "",
        autoReply: true,
        notifyNewMessage: true,
        notifyNewCustomer: true,
        language: "ar",
        theme: "light",
    });
    const [saving, setSaving] = useState(false);
    const [loading, setLoading] = useState(true);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Team Management State
    const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
    const [loadingTeam, setLoadingTeam] = useState(true);
    const [newMember, setNewMember] = useState({
        email: "",
        password: "",
        name: "",
        role: "member",
        allowed_pages: [] as string[]
    });

    const [user, setUser] = useState<{ role: string; email: string } | null>(null);

    useEffect(() => {
        const userData = localStorage.getItem("user");
        if (userData) {
            try {
                setUser(JSON.parse(userData));
            } catch (e) {
                console.error("Failed to parse user", e);
            }
        }
    }, []);
    const [addingMember, setAddingMember] = useState(false);
    const [teamMsg, setTeamMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    // Auto Assign State
    const [autoAssignEnabled, setAutoAssignEnabled] = useState(false);

    // Fetch Auto Assign Settings
    const fetchAutoAssign = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;
            const res = await fetch(`${apiBase}/api/settings/auto-assign`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            setAutoAssignEnabled(!!data.auto_assign_enabled);
        } catch (err) {
            console.error("Failed to fetch auto-assign:", err);
        }
    }, []);

    const toggleAutoAssign = async (enabled: boolean) => {
        const oldVal = autoAssignEnabled;
        setAutoAssignEnabled(enabled);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/api/settings/auto-assign`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify({ enabled })
            });
            if (!res.ok) throw new Error("Failed");
        } catch (err) {
            console.error(err);
            // Revert on error
            setAutoAssignEnabled(oldVal);
            setMsg({ type: "error", text: "فشل تحديث إعداد التوزيع" });
        }
    };

    const fetchSettings = useCallback(async () => {
        try {
            const token = localStorage.getItem("token");
            if (!token) return;

            const res = await fetch(`${apiBase}/api/settings`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            if (!res.ok) throw new Error("Failed to fetch settings");
            const data = await res.json();
            setSettings(data);
        } catch (err) {
            console.error("Failed to fetch settings:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    // Fetch team members
    const fetchTeamMembers = useCallback(async () => {
        if (!user || user.role === 'super_admin') return;
        try {
            const token = localStorage.getItem("token");
            if (!token) return;

            const res = await fetch(`${apiBase}/api/auth/team`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            const data = await res.json();
            if (data.members) {
                setTeamMembers(data.members);
            }
        } catch (err) {
            console.error("Failed to fetch team:", err);
        } finally {
            setLoadingTeam(false);
        }
    }, [user]);

    // Add new team member
    const handleAddMember = async () => {
        if (!newMember.email || !newMember.password) {
            setTeamMsg({ type: "error", text: "البريد الإلكتروني وكلمة المرور مطلوبان" });
            return;
        }

        setAddingMember(true);
        setTeamMsg(null);

        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/api/auth/team/invite`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(newMember)
            });

            const data = await res.json();

            if (res.ok) {
                setTeamMsg({ type: "success", text: "تم إضافة العضو بنجاح!" });
                setNewMember({ email: "", password: "", name: "", role: "member", allowed_pages: [] });
                fetchTeamMembers(); // Refresh list
            } else {
                setTeamMsg({ type: "error", text: data.error || "فشل إضافة العضو" });
            }
        } catch (err) {
            setTeamMsg({ type: "error", text: "حدث خطأ، حاول مرة أخرى" });
        } finally {
            setAddingMember(false);
        }
    };

    // Edit member state
    const [editingMember, setEditingMember] = useState<TeamMember | null>(null);
    const [editForm, setEditForm] = useState({ name: "", role: "", allowed_pages: [] as string[] });

    // Delete team member
    const handleDeleteMember = async (memberId: string, memberName: string) => {
        if (!confirm(`هل أنت متأكد من حذف العضو "${memberName}"؟`)) {
            return;
        }

        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/api/auth/team/${memberId}`, {
                method: "DELETE",
                headers: { Authorization: `Bearer ${token}` }
            });

            const data = await res.json();

            if (res.ok) {
                setTeamMsg({ type: "success", text: "تم حذف العضو بنجاح!" });
                fetchTeamMembers();
            } else {
                setTeamMsg({ type: "error", text: data.error || "فشل حذف العضو" });
            }
        } catch (err) {
            setTeamMsg({ type: "error", text: "حدث خطأ، حاول مرة أخرى" });
        }
    };

    // Update team member
    const handleUpdateMember = async () => {
        if (!editingMember) return;

        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/api/auth/team/${editingMember.id}`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(editForm)
            });

            const data = await res.json();

            if (res.ok) {
                setTeamMsg({ type: "success", text: "تم تحديث العضو بنجاح!" });
                setEditingMember(null);
                fetchTeamMembers();
            } else {
                setTeamMsg({ type: "error", text: data.error || "فشل تحديث العضو" });
            }
        } catch (err) {
            setTeamMsg({ type: "error", text: "حدث خطأ، حاول مرة أخرى" });
        }
    };

    // Open edit modal
    const openEditModal = (member: TeamMember) => {
        setEditingMember(member);
        setEditForm({
            name: member.name || "",
            role: member.role,
            allowed_pages: member.allowed_pages || []
        });
    };

    useEffect(() => {
        fetchSettings();
        if (user && user.role !== 'super_admin') {
            fetchTeamMembers();
        }
        fetchAutoAssign();
    }, [fetchSettings, fetchTeamMembers, fetchAutoAssign, user]);

    const handleSave = async () => {
        setSaving(true);
        setMsg(null);
        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/api/settings`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    Authorization: `Bearer ${token}`
                },
                body: JSON.stringify(settings),
            });
            if (res.ok) {
                setMsg({ type: "success", text: "تم حفظ الإعدادات بنجاح!" });
            } else {
                throw new Error("Failed to save");
            }
        } catch (err) {
            setMsg({ type: "error", text: "فشل حفظ الإعدادات، حاول مرة أخرى." });
        } finally {
            setSaving(false);
        }
    };

    if (loading) {
        return <div className="text-center py-12 text-slate-500">جاري التحميل...</div>;
    }

    return (
        <div className="space-y-6 max-w-4xl mx-auto">
            <div>
                <h1 className="text-2xl font-extrabold text-slate-900">الإعدادات</h1>
                <p className="text-slate-500">إدارة إعدادات النظام والتفضيلات</p>
            </div>

            {/* Company Settings */}
            <div className="card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">إعدادات الشركة</h2>

                <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">اسم الشركة</label>
                    <input
                        type="text"
                        className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                        value={settings.companyName}
                        onChange={(e) => setSettings({ ...settings, companyName: e.target.value })}
                    />
                </div>

                <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">رسالة الترحيب</label>
                    <textarea
                        className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none min-h-[100px]"
                        value={settings.welcomeMessage}
                        onChange={(e) => setSettings({ ...settings, welcomeMessage: e.target.value })}
                    />
                </div>
            </div>

            {/* Notifications */}
            <div className="card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">الإشعارات</h2>

                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="font-medium text-slate-700">إشعار عند رسالة جديدة</p>
                        <p className="text-sm text-slate-500">استلم إشعار عند وصول رسالة جديدة</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings.notifyNewMessage}
                            onChange={(e) => setSettings({ ...settings, notifyNewMessage: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                    </label>
                </div>

                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="font-medium text-slate-700">إشعار عند عميل جديد</p>
                        <p className="text-sm text-slate-500">استلم إشعار عند إضافة عميل جديد</p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={settings.notifyNewCustomer}
                            onChange={(e) => setSettings({ ...settings, notifyNewCustomer: e.target.checked })}
                        />
                        <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-brand-blue"></div>
                    </label>
                </div>
            </div>

            {/* Appearance */}
            <div className="card p-6 space-y-4">
                <h2 className="text-lg font-semibold text-slate-800 border-b pb-2">المظهر</h2>

                <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">اللغة</label>
                    <select
                        className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                        value={settings.language}
                        onChange={(e) => setSettings({ ...settings, language: e.target.value })}
                    >
                        <option value="ar">العربية</option>
                        <option value="en">English</option>
                    </select>
                </div>

                <div className="space-y-3">
                    <label className="block text-sm font-medium text-slate-700">السمة</label>
                    <select
                        className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                        value={settings.theme}
                        onChange={(e) => setSettings({ ...settings, theme: e.target.value })}
                    >
                        <option value="light">فاتح</option>
                        <option value="dark">داكن</option>
                    </select>
                </div>
            </div>

            {/* Automation Settings */}
            <div className="card p-6 space-y-4 border-l-4 border-l-purple-500 bg-purple-50/30">
                <h2 className="text-lg font-semibold text-slate-800 border-b pb-2 flex items-center gap-2">
                    🤖 الأتمتة والتوزيع
                    <span className="text-xs bg-purple-100 text-purple-700 px-2 py-1 rounded-full">جديد</span>
                </h2>

                <div className="flex items-center justify-between py-2">
                    <div>
                        <p className="font-medium text-slate-700">التوزيع التلقائي للمحادثات (Round Robin)</p>
                        <p className="text-sm text-slate-500">
                            عند تفعيل هذا الخيار، سيتم توزيع الرسائل الواردة من عملاء جدد تلقائيًا على الموظفين بالتتابع.
                            <br />
                            <span className="text-xs text-orange-600">⚠ تأكد من إضافة أعضاء للفريق أولاً.</span>
                        </p>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={autoAssignEnabled}
                            onChange={(e) => toggleAutoAssign(e.target.checked)}
                        />
                        <div className="w-14 h-7 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-6 after:w-6 after:transition-all peer-checked:bg-purple-600"></div>
                    </label>
                </div>
            </div>

            {/* Integrations Section */}
            <div className="card p-6 space-y-4 border-l-4 border-l-blue-500 bg-blue-50/30">
                <h2 className="text-lg font-semibold text-slate-800 border-b pb-2 flex items-center gap-2">
                    🔗 التكاملات الخارجية
                    <span className="text-xs bg-blue-100 text-blue-700 px-2 py-1 rounded-full">جديد</span>
                </h2>

                <div className="space-y-3">
                    <a
                        href="/integrations/facebook"
                        className="flex items-center justify-between p-4 bg-white rounded-lg border border-slate-200 hover:border-blue-300 hover:shadow-md transition-all group"
                    >
                        <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center">
                                <svg className="w-6 h-6 text-white" fill="currentColor" viewBox="0 0 24 24">
                                    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
                                </svg>
                            </div>
                            <div>
                                <p className="font-medium text-slate-700 group-hover:text-blue-600">Facebook & Instagram</p>
                                <p className="text-sm text-slate-500">ربط صفحات الفيسبوك وتتبع الإعلانات</p>
                            </div>
                        </div>
                        <svg className="w-5 h-5 text-slate-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                        </svg>
                    </a>
                </div>
            </div>

            {/* Team Management Section */}
            {user?.role !== 'super_admin' && (
                <div className="card p-6 space-y-6">
                    <div className="flex items-center justify-between border-b pb-2">
                        <h2 className="text-lg font-semibold text-slate-800">👥 إدارة الفريق</h2>
                        <span className="text-sm text-slate-500">{teamMembers.length} عضو</span>
                    </div>

                    {/* Add New Member Form */}
                    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 p-5 rounded-2xl space-y-4">
                        <h3 className="font-medium text-slate-700 flex items-center gap-2">
                            <span className="w-8 h-8 bg-brand-blue text-white rounded-full flex items-center justify-center text-sm">+</span>
                            إضافة عضو جديد
                        </h3>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">الاسم</label>
                                <input
                                    type="text"
                                    placeholder="اسم العضو"
                                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none bg-white"
                                    value={newMember.name}
                                    onChange={(e) => setNewMember({ ...newMember, name: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">البريد الإلكتروني *</label>
                                <input
                                    type="email"
                                    placeholder="example@email.com"
                                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none bg-white"
                                    value={newMember.email}
                                    onChange={(e) => setNewMember({ ...newMember, email: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">كلمة المرور *</label>
                                <input
                                    type="password"
                                    placeholder="••••••••"
                                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none bg-white"
                                    value={newMember.password}
                                    onChange={(e) => setNewMember({ ...newMember, password: e.target.value })}
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">الدور</label>
                                <select
                                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none bg-white"
                                    value={newMember.role}
                                    onChange={(e) => setNewMember({ ...newMember, role: e.target.value })}
                                >
                                    <option value="admin">أدمن (صلاحيات كاملة)</option>
                                    <option value="supervisor">مشرف (إدارة المحادثات)</option>
                                    <option value="moderator">مودريتور (رد على الرسائل)</option>
                                    <option value="member">عضو عادي</option>
                                </select>
                            </div>
                        </div>

                        <div className="space-y-2">
                            <label className="block text-sm font-medium text-slate-600">الصفحات المسموح بها (اختياري - افتراضياً كل الصفحات)</label>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-2 bg-white p-4 rounded-xl border border-slate-200">
                                {AVAILABLE_PAGES.map(page => (
                                    <label key={page.id} className="flex items-center gap-2 cursor-pointer hover:bg-slate-50 p-1 rounded transition-colors text-sm">
                                        <input
                                            type="checkbox"
                                            className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                                            checked={newMember.allowed_pages.includes(page.href)}
                                            onChange={(e) => {
                                                const updated = e.target.checked
                                                    ? [...newMember.allowed_pages, page.href]
                                                    : newMember.allowed_pages.filter(p => p !== page.href);
                                                setNewMember({ ...newMember, allowed_pages: updated });
                                            }}
                                        />
                                        <span className="text-slate-700">{page.labelAr}</span>
                                    </label>
                                ))}
                            </div>
                        </div>

                        <div className="flex items-center gap-4 pt-2">
                            <button
                                className={`btn bg-gradient-to-r from-brand-blue to-indigo-600 px-6 py-2.5 text-white hover:shadow-lg transition-all rounded-xl ${addingMember ? 'opacity-70' : ''}`}
                                onClick={handleAddMember}
                                disabled={addingMember}
                            >
                                {addingMember ? "جاري الإضافة..." : "➕ إضافة العضو"}
                            </button>

                            {teamMsg && (
                                <div className={`text-sm px-4 py-2 rounded-lg ${teamMsg.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                                    {teamMsg.text}
                                </div>
                            )}
                        </div>
                    </div>

                    {/* Team Members List */}
                    <div className="space-y-3">
                        <h3 className="font-medium text-slate-700">أعضاء الفريق الحاليين</h3>

                        {loadingTeam ? (
                            <div className="text-center py-8 text-slate-400">جاري التحميل...</div>
                        ) : teamMembers.length === 0 ? (
                            <div className="text-center py-8 text-slate-400">لا يوجد أعضاء بعد</div>
                        ) : (
                            <div className="overflow-x-auto rounded-xl border border-slate-200">
                                <table className="w-full">
                                    <thead className="bg-slate-50">
                                        <tr>
                                            <th className="text-right p-4 text-sm font-semibold text-slate-600">العضو</th>
                                            <th className="text-right p-4 text-sm font-semibold text-slate-600">البريد الإلكتروني</th>
                                            <th className="text-right p-4 text-sm font-semibold text-slate-600">الدور</th>
                                            <th className="text-right p-4 text-sm font-semibold text-slate-600">تاريخ الإنضمام</th>
                                            <th className="text-center p-4 text-sm font-semibold text-slate-600">الإجراءات</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {teamMembers.map((member, index) => (
                                            <tr key={member.id} className={index % 2 === 0 ? 'bg-white' : 'bg-slate-25'}>
                                                <td className="p-4">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-10 h-10 rounded-full bg-gradient-to-r from-brand-blue to-indigo-500 flex items-center justify-center text-white font-bold">
                                                            {member.name?.charAt(0)?.toUpperCase() || member.email?.charAt(0)?.toUpperCase()}
                                                        </div>
                                                        <span className="font-medium text-slate-800">{member.name || 'بدون اسم'}</span>
                                                    </div>
                                                </td>
                                                <td className="p-4 text-slate-600">{member.email}</td>
                                                <td className="p-4">
                                                    <span className={`px-3 py-1 rounded-full text-xs font-medium ${member.role === 'admin'
                                                        ? 'bg-red-100 text-red-700'
                                                        : member.role === 'supervisor'
                                                            ? 'bg-orange-100 text-orange-700'
                                                            : member.role === 'moderator'
                                                                ? 'bg-blue-100 text-blue-700'
                                                                : 'bg-gray-100 text-gray-700'
                                                        }`}>
                                                        {member.role === 'admin' ? '🔑 أدمن'
                                                            : member.role === 'supervisor' ? '👁️ مشرف'
                                                                : member.role === 'moderator' ? '💬 مودريتور'
                                                                    : '👤 عضو'}
                                                    </span>
                                                </td>
                                                <td className="p-4 text-slate-500 text-sm">
                                                    {new Date(member.created_at).toLocaleDateString('ar-EG')}
                                                </td>
                                                <td className="p-4">
                                                    <div className="flex items-center justify-center gap-2">
                                                        <button
                                                            onClick={() => openEditModal(member)}
                                                            className="p-2 text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                                                            title="تعديل"
                                                        >
                                                            ✏️
                                                        </button>
                                                        <button
                                                            onClick={() => handleDeleteMember(member.id, member.name || member.email)}
                                                            className="p-2 text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                            title="حذف"
                                                        >
                                                            🗑️
                                                        </button>
                                                    </div>
                                                </td>
                                            </tr>
                                        ))}
                                    </tbody>
                                </table>
                            </div>
                        )}
                    </div>
                </div>
            )}

            {/* Save Button */}
            <div className="flex items-center gap-4">
                <button
                    className={`btn bg-brand-blue px-8 py-3 text-white hover:bg-blue-700 shadow-md ${saving ? 'opacity-70' : ''}`}
                    onClick={handleSave}
                    disabled={saving}
                >
                    {saving ? "جاري الحفظ..." : "حفظ الإعدادات"}
                </button>

                {msg && (
                    <div className={`text-sm px-4 py-2 rounded-lg ${msg.type === 'success' ? 'bg-green-50 text-green-700' : 'bg-red-50 text-red-700'}`}>
                        {msg.text}
                    </div>
                )}
            </div>

            {/* Edit Member Modal */}
            {editingMember && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl p-6 w-full max-w-md shadow-2xl">
                        <div className="flex items-center justify-between mb-6">
                            <h3 className="text-xl font-bold text-slate-800">✏️ تعديل العضو</h3>
                            <button
                                onClick={() => setEditingMember(null)}
                                className="text-slate-400 hover:text-slate-600 text-2xl"
                            >
                                ×
                            </button>
                        </div>

                        <div className="space-y-4">
                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">البريد الإلكتروني</label>
                                <input
                                    type="email"
                                    value={editingMember.email}
                                    disabled
                                    className="w-full p-3 rounded-xl border border-slate-200 bg-slate-100 text-slate-500"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">الاسم</label>
                                <input
                                    type="text"
                                    value={editForm.name}
                                    onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                                    placeholder="اسم العضو"
                                />
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-1">الدور</label>
                                <select
                                    value={editForm.role}
                                    onChange={(e) => setEditForm({ ...editForm, role: e.target.value })}
                                    className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                                >
                                    <option value="admin">🔑 أدمن (صلاحيات كاملة)</option>
                                    <option value="supervisor">👁️ مشرف (إدارة المحادثات)</option>
                                    <option value="moderator">💬 مودريتور (رد على الرسائل)</option>
                                    <option value="member">👤 عضو عادي</option>
                                </select>
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-slate-600 mb-2">الصفحات المسموح بها</label>
                                <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-3 border border-slate-200 rounded-xl bg-slate-50">
                                    {AVAILABLE_PAGES.map(page => (
                                        <label key={page.id} className="flex items-center gap-2 cursor-pointer hover:bg-white p-1 rounded transition-colors text-xs">
                                            <input
                                                type="checkbox"
                                                className="rounded border-slate-300 text-brand-blue focus:ring-brand-blue"
                                                checked={editForm.allowed_pages.includes(page.href)}
                                                onChange={(e) => {
                                                    const updated = e.target.checked
                                                        ? [...editForm.allowed_pages, page.href]
                                                        : editForm.allowed_pages.filter(p => p !== page.href);
                                                    setEditForm({ ...editForm, allowed_pages: updated });
                                                }}
                                            />
                                            <span className="text-slate-700">{page.labelAr}</span>
                                        </label>
                                    ))}
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">إذا تم إلغاء تحديد الكل، سيتم تطبيق الصلاحيات الافتراضية للدور.</p>
                            </div>
                        </div>

                        <div className="flex gap-3 mt-6">
                            <button
                                onClick={handleUpdateMember}
                                className="flex-1 bg-gradient-to-r from-brand-blue to-indigo-600 text-white py-3 rounded-xl font-medium hover:shadow-lg transition-all"
                            >
                                💾 حفظ التغييرات
                            </button>
                            <button
                                onClick={() => setEditingMember(null)}
                                className="flex-1 bg-slate-100 text-slate-700 py-3 rounded-xl font-medium hover:bg-slate-200 transition-all"
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

