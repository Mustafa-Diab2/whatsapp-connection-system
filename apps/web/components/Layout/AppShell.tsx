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

    // Prevent Hydration Mismatch
    if (!mounted) {
        return null; // Or a loading spinner
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
