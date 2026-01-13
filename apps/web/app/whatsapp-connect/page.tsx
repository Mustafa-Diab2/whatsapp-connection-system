"use client";

import { useCallback, useEffect, useMemo, useState, useRef } from "react";
import { io, Socket } from "socket.io-client";

type Status = "idle" | "initializing" | "waiting_qr" | "ready" | "error" | "disconnected";

type WaState = {
  status: Status;
  qrDataUrl?: string;
  lastError?: string;
  updatedAt?: string;
};

const apiBase = process.env.NEXT_PUBLIC_API_URL || "https://repoapi-production-61b1.up.railway.app";
const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || apiBase;

const statusLabels: Record<Status, string> = {
  idle: "جاهز",
  initializing: "جاري التهيئة...",
  waiting_qr: "انتظر مسح QR",
  ready: "متصل ✅",
  error: "فشل الاتصال",
  disconnected: "غير متصل",
};

// Helper to get token from everywhere
const getAuthToken = () => {
  if (typeof window === "undefined") return null;
  const localToken = localStorage.getItem("token");
  if (localToken) return localToken;

  // Try fallback from cookies
  const match = document.cookie.match(new RegExp('(^| )token=([^;]+)'));
  return match ? match[2] : null;
};

const getAuthHeaders = () => {
  const token = getAuthToken();
  return {
    "Authorization": `Bearer ${token}`,
    "Cache-Control": "no-cache",
    "Pragma": "no-cache"
  };
};

export default function WhatsAppConnect() {
  const [clientId, setClientId] = useState<string>("default");
  const [loading, setLoading] = useState(false);
  const [connectDisabled, setConnectDisabled] = useState(false);
  const [isPolling, setIsPolling] = useState(false);
  const [state, setState] = useState<WaState>({
    status: "idle",
  });

  const socketRef = useRef<Socket | null>(null);

  // 1. Robust Client & Token Detection
  useEffect(() => {
    const initData = () => {
      const userStr = localStorage.getItem("user");
      const storedOrgId = localStorage.getItem("organizationId") || localStorage.getItem("orgId");

      console.log("[WhatsApp] Storage Check:", { hasUser: !!userStr, storedOrgId });

      if (userStr) {
        try {
          const user = JSON.parse(userStr);
          const orgId = user.organization_id || user.organizationId || storedOrgId;
          if (orgId && orgId !== "default") {
            setClientId(orgId);
            console.log("[WhatsApp] ✅ ClientId set to:", orgId);
          }
        } catch (e) {
          console.error("User parse error", e);
        }
      } else if (storedOrgId && storedOrgId !== "default") {
        setClientId(storedOrgId);
      }
    };

    initData();
    // Re-check after 1 second in case of slow hydration
    const timer = setTimeout(initData, 1000);
    return () => clearTimeout(timer);
  }, []);

  // 2. Clear Storage Function (Emergency Reset)
  const handleResetStorage = () => {
    console.log("[WhatsApp] 🧹 Resetting storage...");
    const token = getAuthToken();
    const user = localStorage.getItem("user");
    localStorage.clear();
    if (token) localStorage.setItem("token", token);
    if (user) localStorage.setItem("user", user);
    window.location.reload();
  };

  const fetchStatus = useCallback(async () => {
    if (clientId === "default") return;
    try {
      // Add timestamp to bypass service worker/browser cache
      const res = await fetch(`${apiBase}/whatsapp/status/${clientId}?t=${Date.now()}`, {
        headers: getAuthHeaders(),
      });

      if (res.status === 401) {
        console.error("[WhatsApp] ❌ 401 Unauthorized - Token might be invalid");
        return;
      }

      const data = await res.json();
      console.log("[WhatsApp] 📊 Status Poll:", data.status);

      setState(prev => ({
        ...prev,
        status: data.status,
        lastError: data.lastError,
        qrDataUrl: data.qrDataUrl || (data.status === "ready" ? undefined : prev.qrDataUrl)
      }));

      if (data.status === "ready") {
        setLoading(false);
        setConnectDisabled(false);
      }
    } catch (err) {
      console.error("Status fetch failed", err);
    }
  }, [clientId]);

  // 3. Socket Connection
  useEffect(() => {
    const token = getAuthToken();
    if (!token) return;

    console.log("[WhatsApp] 🔌 Connecting Socket... ClientId:", clientId);
    const s = io(socketUrl, {
      transports: ["websocket", "polling"],
      auth: { token },
      reconnectionAttempts: 10
    });

    socketRef.current = s;

    s.on("connect", () => {
      console.log("[WhatsApp] ✅ Socket connected");
      if (clientId !== "default") s.emit("wa:subscribe", { clientId });
    });

    s.on("wa:state", (data: any) => {
      console.log("[WhatsApp] 📡 Socket State:", data.status);
      // Recovery: if payload contains clientId, use it!
      if (data.clientId && data.clientId !== "default") {
        setClientId(data.clientId);
        localStorage.setItem("organizationId", data.clientId);
      }

      setState(prev => ({
        ...prev,
        status: data.status,
        qrDataUrl: data.qrDataUrl || (data.status === "ready" ? undefined : prev.qrDataUrl)
      }));

      if (data.status === "ready") {
        setLoading(false);
        setConnectDisabled(false);
      }
    });

    s.on("wa:qr", (data: any) => {
      console.log("[WhatsApp] 🔳 QR Received via Socket");
      setState(prev => ({ ...prev, status: "waiting_qr", qrDataUrl: data.qrDataUrl }));
      setLoading(false);
    });

    return () => {
      s.disconnect();
    };
  }, [clientId]);

  // 4. Polling Fallback
  useEffect(() => {
    if (clientId === "default" || state.status === "ready") return;
    const interval = setInterval(fetchStatus, 4000);
    return () => clearInterval(interval);
  }, [clientId, state.status, fetchStatus]);

  const handleConnect = async () => {
    setLoading(true);
    setConnectDisabled(true);
    setError("");

    try {
      const res = await fetch(`${apiBase}/whatsapp/connect?t=${Date.now()}`, {
        method: "POST",
        headers: {
          ...getAuthHeaders(),
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientId }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || "فشل بدء الجلسة");
      }

      console.log("[WhatsApp] 🚀 Connection request sent");
    } catch (err: any) {
      console.error("Connect error", err);
      setError(err.message);
      setLoading(false);
      setConnectDisabled(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("هل أنت متأكد من قطع الاتصال؟")) return;
    try {
      await fetch(`${apiBase}/whatsapp/disconnect/${clientId}`, {
        method: "DELETE",
        headers: getAuthHeaders(),
      });
      setState({ status: "disconnected" });
    } catch (err) {
      console.error("Disconnect error", err);
    }
  };

  const [error, setError] = useState("");

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6 animate-in fade-in duration-500">
      <div className="flex justify-between items-center bg-white p-6 rounded-3xl shadow-sm border border-gray-100">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">اتصال الواتساب</h1>
          <p className="text-gray-500 text-sm mt-1">إدارة وتحكم في جلسة واتساب ويب</p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleResetStorage}
            className="text-xs text-red-500 hover:underline px-3 py-1 border border-red-100 rounded-full"
            title="حل مشكلة الـ default clientId والـ Cache"
          >
            إعادة ضبط التخزين 🧹
          </button>
          <div className={`px-4 py-2 rounded-2xl text-sm font-bold flex items-center gap-2 ${state.status === 'ready' ? 'bg-green-50 text-green-600' : 'bg-orange-50 text-orange-600'
            }`}>
            <span className={`w-2 h-2 rounded-full ${state.status === 'ready' ? 'bg-green-600 animate-pulse' : 'bg-orange-600'}`}></span>
            {statusLabels[state.status] || state.status}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-gray-100 flex flex-col items-center justify-center min-h-[400px]">
          {state.status === "waiting_qr" && state.qrDataUrl ? (
            <div className="space-y-6 text-center">
              <div className="p-4 bg-white rounded-3xl shadow-xl border-4 border-blue-50">
                <img src={state.qrDataUrl} alt="WhatsApp QR" className="w-64 h-64 rounded-xl" />
              </div>
              <p className="text-gray-600 font-medium">امسح الكود من تطبيق واتساب بهاتفك</p>
            </div>
          ) : state.status === "ready" ? (
            <div className="text-center space-y-4">
              <div className="w-24 h-24 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto text-4xl shadow-inner">✅</div>
              <h2 className="text-xl font-bold text-gray-800">متصل بنجاح!</h2>
              <p className="text-gray-500">يمكنك الآن إرسال واستقبال الرسائل</p>
            </div>
          ) : (
            <div className="text-center space-y-4 text-gray-400">
              {loading ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-12 h-12 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-blue-600 font-bold">جاري طلب الكود...</p>
                </div>
              ) : (
                <>
                  <div className="text-6xl opacity-20">📱</div>
                  <p>اضغط على زر "الاتصال" لإنشاء كيو أر كود جديد</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-blue-600 p-8 rounded-3xl text-white shadow-lg shadow-blue-200 relative overflow-hidden group">
            <div className="absolute top-0 right-0 w-32 h-32 bg-white/10 rounded-full -mr-16 -mt-16 transition-transform group-hover:scale-110"></div>
            <h2 className="text-xl font-bold mb-2">التحكم في الجلسة</h2>
            <p className="text-blue-100 text-sm mb-6 leading-relaxed">قم ببدء جلسة جديدة أو إنهاء الجلسة الحالية. تأكد من أن هاتفك متصل بالإنترنت.</p>

            <div className="flex flex-col gap-3">
              <button
                onClick={handleConnect}
                disabled={connectDisabled || state.status === 'ready'}
                className="w-full py-4 bg-white text-blue-600 rounded-2xl font-bold shadow-sm hover:bg-blue-50 disabled:opacity-50 transition-all active:scale-95"
              >
                {loading ? "جاري البدء..." : "اتصال بـ WhatsApp"}
              </button>

              {state.status === 'ready' && (
                <button
                  onClick={handleDisconnect}
                  className="w-full py-4 bg-red-500/20 hover:bg-red-500/30 text-white rounded-2xl font-bold border border-white/20 transition-all"
                >
                  قطع الاتصال
                </button>
              )}
            </div>
          </div>

          <div className="bg-gray-50 p-6 rounded-3xl border border-gray-100 space-y-4 text-sm">
            <h3 className="font-bold text-gray-700 flex items-center gap-2">
              <span className="w-1.5 h-1.5 bg-blue-600 rounded-full"></span>
              تفاصيل النظام
            </h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="p-3 bg-white rounded-2xl">
                <p className="text-gray-400 text-xs">العميل (ID)</p>
                <p className="font-mono text-[10px] truncate" title={clientId}>{clientId}</p>
              </div>
              <div className="p-3 bg-white rounded-2xl">
                <p className="text-gray-400 text-xs">الحالة</p>
                <p className="font-bold text-blue-600">{statusLabels[state.status] || state.status}</p>
              </div>
            </div>
            {error && <div className="p-4 bg-red-50 text-red-600 rounded-2xl text-xs border border-red-100">⚠️ {error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
