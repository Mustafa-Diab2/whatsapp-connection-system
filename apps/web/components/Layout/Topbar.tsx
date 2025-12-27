"use client";

import { useCallback } from "react";

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
      // Clear localStorage
      localStorage.removeItem("token");
      localStorage.removeItem("user");

      // Clear cookie (by setting expiry to past)
      document.cookie = "token=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT;";

      // Redirect to login
      window.location.href = "/login";
    }
  }, []);

  return (
    <header className="sticky top-0 z-20 bg-brand-blue text-white shadow-md">
      <div className="mx-auto flex items-center justify-between px-4 md:px-6 py-4">
        {/* Left side - Menu & User */}
        <div className="flex items-center gap-3">
          {/* Mobile Menu Button */}
          <button
            onClick={onMenuClick}
            className="md:hidden p-2 hover:bg-white/10 rounded-lg transition-colors"
          >
            ☰
          </button>

          <div className="flex items-center gap-4">
            <button
              className="btn bg-white/10 px-4 py-2 text-sm hover:bg-white/20 transition-colors"
              onClick={handleLogout}
            >
              <span className="ml-2">🚪</span>
              خروج
            </button>
            <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm">
              <span className="h-8 w-8 rounded-full bg-white/20 flex items-center justify-center">
                👤
              </span>
              <span className="font-semibold">Admin</span>
              <span className="badge bg-green-400/90 text-white shadow-sm text-xs">
                <span className="h-2 w-2 rounded-full bg-white animate-pulse ml-1"></span>
                متصل
              </span>
            </div>
          </div>

        </div>

        {/* Right side - Actions and branding */}
        <div className="flex items-center gap-3">
          <button
            className="btn bg-white/10 px-3 py-2 hover:bg-white/20 transition-colors text-sm"
            onClick={toggleFullscreen}
            title="ملء الشاشة"
          >
            <span className="ml-1">🔲</span>
            ملء الشاشة
          </button>
          <button
            className="btn bg-white/10 px-3 py-2 hover:bg-white/20 transition-colors text-sm"
            onClick={refreshPage}
            title="تحديث"
          >
            <span className="ml-1">🔄</span>
            تحديث
          </button>
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-brand-blue shadow-sm">
            <div className="h-3 w-3 rounded-full bg-brand-green animate-pulse" />
            <span className="font-extrabold tracking-tight">Awfar</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
