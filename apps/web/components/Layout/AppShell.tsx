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
            const token = localStorage.getItem("token");
            if (!token && !isAuthPage) {
                router.push(`/login?callback=${pathname}`);
            } else {
                setIsLoading(false);
            }
        };

        checkToken();
    }, [pathname, isAuthPage, router]);

    // Optional: Global API Interceptor for 401s
    useEffect(() => {
        const checkAuth = async () => {
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
                    }
                } catch (e) {
                    console.error("Auth check failed", e);
                }
            }
        };
        checkAuth();
    }, [pathname]);

    if (!mounted || (isLoading && !isAuthPage)) {
        return (
            <div className="h-screen w-full flex items-center justify-center bg-slate-50">
                <div className="flex flex-col items-center gap-4">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-blue border-t-transparent"></div>
                    <p className="text-slate-500 font-bold animate-pulse text-sm">جاري التحقق من الهوية...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen bg-slate-50">
            {mounted && !isAuthPage && (
                <Topbar onMenuClick={() => setSidebarOpen(true)} />
            )}

            <div className={mounted && !isAuthPage ? "flex flex-row-reverse min-h-[calc(100vh-72px)]" : "h-screen w-full"}>

                {mounted && !isAuthPage && (
                    <Sidebar
                        isOpen={sidebarOpen}
                        onClose={() => setSidebarOpen(false)}
                    />
                )}

                <main className={mounted && !isAuthPage ? "flex-1 p-4 md:p-6 overflow-y-auto w-full" : "w-full h-full"}>
                    {children}
                </main>
            </div>
        </div>
    );
}
