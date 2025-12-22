"use client";

import "./globals.css";
import Topbar from "../components/Layout/Topbar";
import Sidebar from "../components/Layout/Sidebar";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  // Pages that don't need the sidebar/topbar
  // We use startsWith to handle potential sub-routes if any, but exact match is safer here
  const isAuthPage = pathname === "/login" || pathname === "/register";

  useEffect(() => {
    setMounted(true);
    // Basic Route Protection
    const token = localStorage.getItem("token");
    if (!token && !isAuthPage) {
      router.push("/login");
    }
    // If user is already logged in and tries to go to login, redirect to dashboard
    if (token && isAuthPage) {
      router.push("/dashboard");
    }
  }, [pathname, isAuthPage, router]);

  if (!mounted) {
    // Return a basic shell to avoid hydration mismatch initially
    return (
      <html lang="ar" dir="rtl">
        <body>{children}</body>
      </html>
    );
  }

  return (
    <html lang="ar" dir="rtl">
      <body className="rtl bg-brand-gray text-slate-900">
        {!isAuthPage && <Topbar />}

        <div className={!isAuthPage ? "flex flex-row-reverse min-h-[calc(100vh-72px)]" : "h-screen w-full"}>
          {!isAuthPage && <Sidebar />}
          <main className={!isAuthPage ? "flex-1 p-6" : "w-full h-full"}>
            {children}
          </main>
        </div>
      </body>
    </html>
  );
}
