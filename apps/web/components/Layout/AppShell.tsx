"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import Topbar from "./Topbar";
import Sidebar from "./Sidebar";

export default function AppShell({ children }: { children: React.ReactNode }) {
    const pathname = usePathname();
    const [mounted, setMounted] = useState(false);
    const [sidebarOpen, setSidebarOpen] = useState(false);

    useEffect(() => {
        setMounted(true);
    }, []);

    // Pages that don't need the sidebar/topbar
    const isAuthPage = pathname === "/login" || pathname === "/register" || pathname === "/";

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
