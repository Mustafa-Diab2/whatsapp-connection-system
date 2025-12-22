"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Topbar from "./Topbar";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const router = useRouter();
    const [mounted, setMounted] = useState(false);

    // Pages that don't need the sidebar/topbar
    const isAuthPage = pathname === "/login" || pathname === "/register";

    useEffect(() => {
        setMounted(true);

        // Check auth on client side only
        const token = localStorage.getItem("token");

        if (!token && !isAuthPage) {
            router.push("/login"); // Redirect to login
        }

        if (token && isAuthPage) {
            router.push("/dashboard"); // Redirect to dashboard if logged in
        }
    }, [pathname, isAuthPage, router]);

    // Prevent Hydration Mismatch by rendering a loading state or default structure
    // But importantly, do NOT return null for children if possible, or ensure it matches server.
    // However, since we check localStorage, we must wait for mount.

    // To fix Error #310 (Hooks mismatch), we ensure hooks are always called in same order.
    // They are.

    // To safe-guard hydration:
    if (!mounted) {
        // Return a shell that matches the server structure as much as possible, 
        // OR simply return nothing but don't crash.
        // Returning null IS valid but can cause hydration warnings. 
        // Let's return a simple loader that replaces the body content safely.
        return (
            <div className="flex h-screen items-center justify-center bg-slate-50">
                <div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent"></div>
            </div>
        );
    }

    return (
        <>
            {!isAuthPage && <Topbar />}
            <div className={!isAuthPage ? "flex flex-row-reverse min-h-[calc(100vh-72px)]" : "h-screen w-full"}>
                {!isAuthPage && <Sidebar />}
                <main className={!isAuthPage ? "flex-1 p-6" : "w-full h-full"}>
                    {children}
                </main>
            </div>
        </>
    );
}
