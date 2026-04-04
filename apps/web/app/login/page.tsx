"use client";

import { useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function LoginPage() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const callback = searchParams.get("callback") || "/whatsapp-connect";

    const [isLogin, setIsLogin] = useState(true);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState("");

    const [form, setForm] = useState({
        email: "",
        password: "",
        name: "",
        confirmPassword: ""
    });

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError("");
        setLoading(true);

        // Validation
        if (!form.email || !form.password) {
            setError("يرجى ملء جميع الحقول المطلوبة");
            setLoading(false);
            return;
        }

        if (!isLogin && form.password !== form.confirmPassword) {
            setError("كلمة المرور غير متطابقة");
            setLoading(false);
            return;
        }

        try {
            const endpoint = isLogin ? "/auth/login" : "/auth/register";
            const body = isLogin
                ? { email: form.email, password: form.password }
                : { email: form.email, password: form.password, name: form.name };

            const res = await fetch(`${apiBase}${endpoint}`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                credentials: "include",
                body: JSON.stringify(body)
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.error || "حدث خطأ");
            }

            // Store user data in localStorage (non-sensitive)
            localStorage.setItem("user", JSON.stringify(data.user));
            
            // Store organizationId for API calls
            if (data.user?.organization_id) {
                localStorage.setItem("organizationId", data.user.organization_id);
            }

            // Set cookie for middleware - secure flag in production
            const isSecure = window.location.protocol === 'https:';
            document.cookie = `token=${data.token}; path=/; max-age=${7 * 24 * 60 * 60}; samesite=lax${isSecure ? '; secure' : ''}`;

            // Redirect to callback or dashboard
            router.push(callback);
        } catch (err: any) {
            setError(err.message || "حدث خطأ في الاتصال");
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-800 flex items-center justify-center p-4">
            {/* Background Pattern */}
            <div className="absolute inset-0 bg-gradient-to-br from-blue-900/20 to-purple-900/20"></div>

            <div className="relative w-full max-w-md">
                {/* Logo/Brand */}
                <div className="text-center mb-8">
                    <div className="inline-flex items-center justify-center w-20 h-20 bg-white/20 backdrop-blur-lg rounded-2xl mb-4">
                        <span className="text-4xl">💬</span>
                    </div>
                    <h1 className="text-3xl font-bold text-white mb-2">واتساب CRM</h1>
                    <p className="text-white/70">نظام إدارة محادثات الواتساب الذكي</p>
                </div>

                {/* Card */}
                <div className="bg-white/10 backdrop-blur-xl rounded-3xl p-8 shadow-2xl border border-white/20">
                    {/* Tabs */}
                    <div className="flex gap-2 mb-6 bg-white/10 rounded-xl p-1">
                        <button
                            onClick={() => setIsLogin(true)}
                            className={`flex-1 py-3 rounded-lg font-medium transition-all ${isLogin
                                ? "bg-white text-blue-600 shadow-lg"
                                : "text-white/80 hover:text-white"
                                }`}
                        >
                            تسجيل الدخول
                        </button>
                        <button
                            onClick={() => setIsLogin(false)}
                            className={`flex-1 py-3 rounded-lg font-medium transition-all ${!isLogin
                                ? "bg-white text-blue-600 shadow-lg"
                                : "text-white/80 hover:text-white"
                                }`}
                        >
                            حساب جديد
                        </button>
                    </div>

                    {/* Error Message */}
                    {error && (
                        <div className="mb-4 p-3 bg-red-500/20 border border-red-500/50 rounded-xl text-red-200 text-sm text-center">
                            {error}
                        </div>
                    )}

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-4">
                        {!isLogin && (
                            <div>
                                <label htmlFor="name" className="block text-white/80 text-sm mb-2">الاسم الكامل</label>
                                <input
                                    id="name"
                                    type="text"
                                    placeholder="أدخل اسمك"
                                    className="w-full p-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/50 outline-none focus:border-white/50 transition-colors"
                                    value={form.name}
                                    onChange={(e) => setForm({ ...form, name: e.target.value })}
                                />
                            </div>
                        )}

                        <div>
                            <label htmlFor="email" className="block text-white/80 text-sm mb-2">البريد الإلكتروني</label>
                            <input
                                id="email"
                                type="email"
                                placeholder="example@email.com"
                                className="w-full p-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/50 outline-none focus:border-white/50 transition-colors"
                                value={form.email}
                                onChange={(e) => setForm({ ...form, email: e.target.value })}
                            />
                        </div>

                        <div>
                            <label htmlFor="password" className="block text-white/80 text-sm mb-2">كلمة المرور</label>
                            <input
                                id="password"
                                type="password"
                                placeholder="••••••••"
                                className="w-full p-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/50 outline-none focus:border-white/50 transition-colors"
                                value={form.password}
                                onChange={(e) => setForm({ ...form, password: e.target.value })}
                            />
                        </div>

                        {!isLogin && (
                            <div>
                                <label htmlFor="confirmPassword" className="block text-white/80 text-sm mb-2">تأكيد كلمة المرور</label>
                                <input
                                    id="confirmPassword"
                                    type="password"
                                    placeholder="••••••••"
                                    className="w-full p-4 bg-white/10 border border-white/20 rounded-xl text-white placeholder:text-white/50 outline-none focus:border-white/50 transition-colors"
                                    value={form.confirmPassword}
                                    onChange={(e) => setForm({ ...form, confirmPassword: e.target.value })}
                                />
                            </div>
                        )}

                        <button
                            type="submit"
                            disabled={loading}
                            className={`w-full py-4 rounded-xl font-bold text-lg transition-all ${loading
                                ? "bg-white/50 text-white/70 cursor-not-allowed"
                                : "bg-white text-blue-600 hover:bg-white/90 hover:shadow-lg hover:scale-[1.02]"
                                }`}
                        >
                            {loading ? (
                                <span className="flex items-center justify-center gap-2">
                                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v4a4 4 0 00-4 4H4z" />
                                    </svg>
                                    جاري التحميل...
                                </span>
                            ) : isLogin ? "تسجيل الدخول" : "إنشاء حساب"}
                        </button>
                    </form>

                    {isLogin && (
                        <div className="mt-4 text-center">
                            <a href="#" className="text-white/60 hover:text-white text-sm transition-colors">
                                نسيت كلمة المرور؟
                            </a>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <p className="text-center text-white/50 text-sm mt-6">
                    © 2024 واتساب CRM - جميع الحقوق محفوظة
                </p>
            </div>
        </div >
    );
}
