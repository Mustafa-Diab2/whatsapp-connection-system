"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Topbar from "./Topbar";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);

    const isAuthPage = pathname === "/login" || pathname === "/register" || pathname === "/";

    useEffect(() => {
        setMounted(true);

        const checkToken = () => {
            if (typeof window === 'undefined') return;
            const token = localStorage.getItem("token");
            if (!token && !isAuthPage) {
                router.push(`/login?callback=${pathname}`);
            } else {
                setIsLoading(false);
            }
        };

        checkToken();
    }, [pathname, isAuthPage, router]);

    // Global Auth Check
    useEffect(() => {
        const checkAuth = async () => {
            if (typeof window === 'undefined') return;
            const token = localStorage.getItem("token");
            if (token && !isAuthPage) {
                try {
                    const apiRes = await fetch(`${process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001"}/auth/profile`, {
                        headers: { Authorization: `Bearer ${token}` }
                    });
                    if (apiRes.status === 401) {
                        localStorage.removeItem("token");
                        localStorage.removeItem("user");
                        router.push("/login");
                    } else if (apiRes.ok) {
                        const data = await apiRes.json();
                        if (data.user) {
                            localStorage.setItem("user", JSON.stringify(data.user));
                        }
                    }
                } catch (e) {
                    console.error("Auth check failed", e);
                }
            }
        };
        checkAuth();
    }, [pathname, isAuthPage, router]);

    // Loading State
    if (!mounted || (isLoading && !isAuthPage)) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-[#fafafa]">
                <div className="flex flex-col items-center gap-6">
                    <div className="relative h-16 w-16">
                        <div className="absolute inset-0 rounded-full border-4 border-slate-100"></div>
                        <div className="absolute inset-0 rounded-full border-4 border-brand-blue border-t-transparent animate-spin"></div>
                    </div>
                    <div className="space-y-2 text-center">
                        <h2 className="text-xl font-black text-slate-800">Awfar CRM</h2>
                        <p className="text-slate-400 font-bold text-xs uppercase tracking-widest animate-pulse">Initializing Interface...</p>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-[#fcfcfc] text-slate-900 selection:bg-blue-100 selection:text-brand-blue">
            {mounted && !isAuthPage && (
                <Topbar onMenuClick={() => setSidebarOpen(true)} />
            )}

            <div className={mounted && !isAuthPage ? "flex min-h-[calc(100vh-72px)]" : "h-screen w-full"}>
                {mounted && !isAuthPage && (
                    <Sidebar
                        isOpen={sidebarOpen}
                        onClose={() => setSidebarOpen(false)}
                    />
                )}

                <main className={mounted && !isAuthPage
                    ? "flex-1 p-2 md:p-6 lg:p-8 overflow-y-auto w-full transition-all duration-300"
                    : "w-full h-full"}>
                    <div className="max-w-[1600px] mx-auto h-full">
                        {children}
                    </div>
                </main>
            </div>
        </div>
    );
}
