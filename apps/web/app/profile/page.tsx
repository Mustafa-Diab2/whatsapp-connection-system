"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface User {
    id: string;
    email: string;
    name: string;
    phone?: string;
    avatar?: string;
    created_at: string;
}

export default function ProfilePage() {
    const router = useRouter();
    const [user, setUser] = useState<User | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [msg, setMsg] = useState<{ type: "success" | "error"; text: string } | null>(null);

    const [form, setForm] = useState({
        name: "",
        email: "",
        phone: "",
        currentPassword: "",
        newPassword: "",
        confirmPassword: ""
    });

    useEffect(() => {
        // Load user from localStorage
        const userData = localStorage.getItem("user");
        if (userData) {
            const parsed = JSON.parse(userData);
            setUser(parsed);
            setForm(f => ({
                ...f,
                name: parsed.name || "",
                email: parsed.email || "",
                phone: parsed.phone || ""
            }));
        } else {
            router.push("/login");
        }
        setLoading(false);
    }, [router]);

    const handleSaveProfile = async (e: React.FormEvent) => {
        e.preventDefault();
        setSaving(true);
        setMsg(null);

        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/auth/profile`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({ name: form.name, phone: form.phone })
            });

            if (!res.ok) {
                throw new Error("فشل تحديث الملف الشخصي");
            }

            const data = await res.json();
            setUser(data.user);
            localStorage.setItem("user", JSON.stringify(data.user));
            setMsg({ type: "success", text: "تم تحديث الملف الشخصي بنجاح!" });
        } catch (err: any) {
            setMsg({ type: "error", text: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handleChangePassword = async (e: React.FormEvent) => {
        e.preventDefault();

        if (form.newPassword !== form.confirmPassword) {
            setMsg({ type: "error", text: "كلمة المرور الجديدة غير متطابقة" });
            return;
        }

        setSaving(true);
        setMsg(null);

        try {
            const token = localStorage.getItem("token");
            const res = await fetch(`${apiBase}/auth/change-password`, {
                method: "PUT",
                headers: {
                    "Content-Type": "application/json",
                    "Authorization": `Bearer ${token}`
                },
                body: JSON.stringify({
                    currentPassword: form.currentPassword,
                    newPassword: form.newPassword
                })
            });

            if (!res.ok) {
                const data = await res.json();
                throw new Error(data.error || "فشل تغيير كلمة المرور");
            }

            setMsg({ type: "success", text: "تم تغيير كلمة المرور بنجاح!" });
            setForm(f => ({ ...f, currentPassword: "", newPassword: "", confirmPassword: "" }));
        } catch (err: any) {
            setMsg({ type: "error", text: err.message });
        } finally {
            setSaving(false);
        }
    };

    const handleLogout = () => {
        localStorage.removeItem("token");
        localStorage.removeItem("user");
        router.push("/login");
    };

    if (loading) {
        return (
            <div className="flex items-center justify-center min-h-[400px]">
                <div className="w-8 h-8 border-4 border-blue-500 border-t-transparent rounded-full animate-spin"></div>
            </div>
        );
    }

    return (
        <div className="space-y-6 max-w-3xl mx-auto">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900">الملف الشخصي</h1>
                    <p className="text-slate-500">إدارة معلومات حسابك الشخصي</p>
                </div>
                <button
                    onClick={handleLogout}
                    className="px-4 py-2 bg-red-100 text-red-600 rounded-xl hover:bg-red-200 transition-colors"
                >
                    تسجيل الخروج
                </button>
            </div>

            {/* Message */}
            {msg && (
                <div className={`p-4 rounded-xl ${msg.type === "success" ? "bg-green-100 text-green-700" : "bg-red-100 text-red-700"}`}>
                    {msg.text}
                </div>
            )}

            {/* Profile Card */}
            <div className="card p-6 space-y-6">
                {/* Avatar Section */}
                <div className="flex items-center gap-4">
                    <div className="w-20 h-20 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center text-white text-3xl font-bold">
                        {user?.name?.charAt(0)?.toUpperCase() || "U"}
                    </div>
                    <div>
                        <h2 className="text-xl font-bold text-slate-800">{user?.name || "المستخدم"}</h2>
                        <p className="text-slate-500">{user?.email}</p>
                        <p className="text-xs text-slate-400 mt-1">
                            عضو منذ: {user?.created_at ? new Date(user.created_at).toLocaleDateString("ar-EG") : "غير معروف"}
                        </p>
                    </div>
                </div>

                <hr className="border-slate-100" />

                {/* Edit Profile Form */}
                <form onSubmit={handleSaveProfile} className="space-y-4">
                    <h3 className="font-semibold text-slate-800">تعديل المعلومات</h3>

                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">الاسم</label>
                            <input
                                type="text"
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/50"
                                value={form.name}
                                onChange={(e) => setForm({ ...form, name: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">رقم الهاتف (للحملات)</label>
                            <input
                                type="text"
                                placeholder="مثال: 966500000000"
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/50"
                                value={form.phone}
                                onChange={(e) => setForm({ ...form, phone: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">البريد الإلكتروني</label>
                            <input
                                type="email"
                                className="w-full p-3 rounded-xl border border-slate-200 bg-slate-50 text-slate-500 outline-none"
                                value={form.email}
                                disabled
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="btn bg-blue-600 text-white px-6 py-2 hover:bg-blue-700 disabled:opacity-50"
                    >
                        {saving ? "جاري الحفظ..." : "حفظ التغييرات"}
                    </button>
                </form>
            </div>

            {/* Change Password Card */}
            <div className="card p-6 space-y-4">
                <h3 className="font-semibold text-slate-800">تغيير كلمة المرور</h3>

                <form onSubmit={handleChangePassword} className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium text-slate-700 mb-2">كلمة المرور الحالية</label>
                        <input
                            type="password"
                            className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/50"
                            value={form.currentPassword}
                            onChange={(e) => setForm({ ...form, currentPassword: e.target.value })}
                        />
                    </div>
                    <div className="grid md:grid-cols-2 gap-4">
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">كلمة المرور الجديدة</label>
                            <input
                                type="password"
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/50"
                                value={form.newPassword}
                                onChange={(e) => setForm({ ...form, newPassword: e.target.value })}
                            />
                        </div>
                        <div>
                            <label className="block text-sm font-medium text-slate-700 mb-2">تأكيد كلمة المرور</label>
                            <input
                                type="password"
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none focus:ring-2 focus:ring-blue-500/50"
                                value={form.confirmPassword}
                                onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                            />
                        </div>
                    </div>

                    <button
                        type="submit"
                        disabled={saving}
                        className="btn bg-slate-700 text-white px-6 py-2 hover:bg-slate-800 disabled:opacity-50"
                    >
                        {saving ? "جاري التغيير..." : "تغيير كلمة المرور"}
                    </button>
                </form>
            </div>
        </div>
    );
}
