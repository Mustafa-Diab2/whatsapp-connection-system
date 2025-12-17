"use client";

import { useCallback } from "react";

const Topbar = () => {
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

  return (
    <header className="sticky top-0 z-20 bg-brand-blue text-white shadow-md">
      <div className="mx-auto flex items-center justify-between px-6 py-4">
        <div className="flex items-center gap-4">
          <button
            className="btn bg-white/10 px-4 py-2 text-sm hover:bg-white/20"
            onClick={() => (window.location.href = "/")}
          >
            خروج
          </button>
          <div className="flex items-center gap-2 rounded-full bg-white/10 px-4 py-2 text-sm">
            <span className="font-semibold">Admin</span>
            <span className="badge bg-green-400/90 text-white shadow-sm">Online</span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button className="btn bg-white/10 px-3 py-2 hover:bg-white/20" onClick={toggleFullscreen}>
            Fullscreen
          </button>
          <button className="btn bg-white/10 px-3 py-2 hover:bg-white/20" onClick={refreshPage}>
            Refresh
          </button>
          <div className="flex items-center gap-2 rounded-full bg-white px-4 py-2 text-brand-blue shadow-sm">
            <div className="h-3 w-3 rounded-full bg-brand-blue" />
            <span className="font-extrabold tracking-tight">Awfar</span>
          </div>
        </div>
      </div>
    </header>
  );
};

export default Topbar;
