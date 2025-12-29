"use client";

import { useCallback } from "react";
import Link from "next/link";

const Topbar = ({ onMenuClick }: { onMenuClick?: () => void }) => {
  const toggleFullscreen = useCallback(() => {
    if (typeof document === "undefined") return;
    if (!document.fullscreenElement) {
      void document.documentElement.requestFullscreen();
    } else {
      void document.exitFullscreen();
    }
  }, []);

  const refreshPage = useCallback(() => {
    if (typeof window !== "undefined") {
      window.location.reload();
    }
  }, []);

  const handleLogout = useCallback(() => {
    if (typeof window !== "undefined") {
      localStorage.removeItem("token");
      localStorage.removeItem("user");
      document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";
      window.location.href = "/login";
    }
  }, []);

  return (
    <header className="sticky top-0 z-[60] h-[72px] bg-white/80 backdrop-blur-xl border-b border-slate-100 px-4 md:px-8">
      <div className="h-full max-w-[1600px] mx-auto flex items-center justify-between">

        {/* Left Section: Context & User */}
        <div className="flex items-center gap-4">
          <button
            onClick={onMenuClick}
            className="md:hidden h-10 w-10 flex items-center justify-center rounded-2xl bg-slate-50 text-slate-500 hover:bg-slate-100 transition-all active:scale-90"
          >
            ☰
          </button>

          <div className="flex items-center gap-3 bg-slate-50/50 p-1.5 rounded-2xl border border-slate-100 ring-offset-2 ring-brand-blue/30 focus-within:ring-2 transition-all">
            <Link href="/profile" className="flex items-center gap-3 group">
              <div className="h-10 w-10 rounded-xl bg-gradient-to-br from-brand-blue to-blue-700 flex items-center justify-center text-white shadow-lg shadow-blue-100 font-black group-hover:scale-105 transition-all">
                AD
              </div>
              <div className="hidden sm:block ml-2 text-right">
                <p className="text-xs font-black text-slate-900 leading-none mb-1 group-hover:text-brand-blue transition-colors">Badr Admin</p>
                <div className="flex items-center gap-1.5">
                  <span className="h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                  <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">System Online</span>
                </div>
              </div>
            </Link>
          </div>
        </div>

        {/* Center: Branding */}
        <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center gap-2">
          <div className="h-8 w-8 bg-brand-blue rounded-lg rotate-12 flex items-center justify-center text-white font-black text-xs shadow-lg">A</div>
          <span className="hidden sm:block font-black text-xl tracking-tighter bg-gradient-to-r from-slate-900 to-slate-600 bg-clip-text text-transparent">
            Awfar CRM
          </span>
        </div>

        {/* Right Section: Actions */}
        <div className="flex items-center gap-2 sm:gap-4">
          <div className="hidden sm:flex items-center bg-slate-50 rounded-2xl p-1 border border-slate-100">
            <button
              onClick={toggleFullscreen}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-transparent hover:bg-white hover:shadow-sm text-slate-500 transition-all active:scale-90"
              title="Full Screen"
            >
              <span className="text-sm">🔲</span>
            </button>
            <button
              onClick={refreshPage}
              className="h-9 w-9 flex items-center justify-center rounded-xl bg-transparent hover:bg-white hover:shadow-sm text-slate-500 transition-all active:scale-90"
              title="Refresh App"
            >
              <span className="text-sm">🔄</span>
            </button>
          </div>

          <button
            className="group flex items-center gap-2 bg-red-50 text-red-600 px-4 py-2.5 rounded-2xl font-black text-[11px] uppercase tracking-widest hover:bg-red-500 hover:text-white transition-all shadow-sm hover:shadow-red-100 active:scale-95"
            onClick={handleLogout}
          >
            <span>خروج</span>
            <span className="text-base group-hover:rotate-12 transition-transform">🚪</span>
          </button>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
