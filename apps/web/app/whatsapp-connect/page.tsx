"use client";

import { useCallback, useEffect, useState, useRef } from "react";
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
  idle: "جاهز لبدء الاتصال",
  initializing: "جاري تهيئة الواتساب...",
  waiting_qr: "انتظر ظهور الكود ومسحه",
  ready: "متصل الآن ✅",
  error: "حدث خطأ في الاتصال",
  disconnected: "تم قطع الاتصال",
};

export default function WhatsAppConnect() {
  const [clientId, setClientId] = useState<string>("default");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [state, setState] = useState<WaState>({ status: "idle" });

  const socketRef = useRef<Socket | null>(null);

  const getAuthToken = useCallback(() => {
    if (typeof window === "undefined") return null;
    return localStorage.getItem("token") || document.cookie.match(/(^| )token=([^;]+)/)?.[2] || null;
  }, []);

  // 1. Initial State Sync
  const fetchStatus = useCallback(async (forcedId?: string) => {
    const targetId = forcedId || clientId;
    if (!targetId || targetId === "default") return;

    try {
      const res = await fetch(`${apiBase}/whatsapp/status/${targetId}?t=${Date.now()}`, {
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      if (res.ok) {
        const data = await res.json();
        console.log("[WhatsApp] 🔄 Synced state:", data.status);
        setState({
          status: data.status,
          qrDataUrl: data.qrDataUrl,
          lastError: data.lastError
        });
        if (data.status === "waiting_qr") setLoading(false);
      }
    } catch (e) {
      console.error("Fetch failed", e);
    }
  }, [clientId, apiBase, getAuthToken]);

  // 2. Identify Client
  useEffect(() => {
    const userStr = localStorage.getItem("user");
    const storedOrgId = localStorage.getItem("organizationId") || localStorage.getItem("orgId");

    let activeId = "default";
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        activeId = user.organization_id || user.organizationId || storedOrgId || "default";
      } catch (e) { }
    } else if (storedOrgId) {
      activeId = storedOrgId;
    }

    if (activeId !== "default" && activeId !== clientId) {
      console.log("[WhatsApp] 🎯 Active ID detected:", activeId);
      setClientId(activeId);
      fetchStatus(activeId);
    }
  }, [clientId, fetchStatus]);

  // 3. Socket Management
  useEffect(() => {
    const token = getAuthToken();
    if (!token || clientId === "default") return;

    console.log("[WhatsApp] 🔌 Connecting Socket for:", clientId);
    const s = io(socketUrl, {
      transports: ["websocket", "polling"],
      auth: { token }
    });
    socketRef.current = s;

    s.on("connect", () => {
      console.log("[WhatsApp] ✅ Socket online");
      s.emit("wa:subscribe", { clientId });
    });

    s.on("wa:state", (data: any) => {
      console.log("[WhatsApp] 📡 State Update:", data.status);
      setState(prev => ({
        ...prev,
        status: data.status,
        qrDataUrl: data.qrDataUrl || prev.qrDataUrl
      }));
      if (data.status !== "initializing") setLoading(false);
    });

    s.on("wa:qr", (data: any) => {
      console.log("[WhatsApp] 🔳 QR Received");
      setState(prev => ({ ...prev, status: "waiting_qr", qrDataUrl: data.qrDataUrl }));
      setLoading(false);
    });

    return () => {
      s.disconnect();
    };
  }, [clientId, socketUrl, getAuthToken]);

  const handleConnect = async () => {
    if (clientId === "default") {
      alert("خطأ: لم يتم تحديد معرف المؤسسة. حاول تسجيل الخروج والدخول ثانية.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const res = await fetch(`${apiBase}/whatsapp/connect?t=${Date.now()}`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${getAuthToken()}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ clientId }),
      });
      if (!res.ok) throw new Error("فشل بدء الجلسة");
      console.log("[WhatsApp] 🚀 Request sent");
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  };

  const handleDisconnect = async () => {
    if (!confirm("هل أنت متأكد؟")) return;
    try {
      await fetch(`${apiBase}/whatsapp/disconnect/${clientId}`, {
        method: "DELETE",
        headers: { "Authorization": `Bearer ${getAuthToken()}` }
      });
      setState({ status: "disconnected" });
    } catch (e) { }
  };

  return (
    <div className="p-4 md:p-8 max-w-5xl mx-auto space-y-6">
      <div className="bg-white rounded-[2rem] p-6 shadow-xl shadow-blue-900/5 flex flex-col md:flex-row justify-between items-center gap-4">
        <div className="text-center md:text-right">
          <h1 className="text-2xl font-black text-gray-900">ربط الواتساب</h1>
          <p className="text-gray-500 font-medium">حالة النظام: {statusLabels[state.status] || state.status}</p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => { localStorage.clear(); window.location.reload(); }}
            className="px-4 py-2 text-xs font-bold text-red-500 bg-red-50 rounded-xl hover:bg-red-100 transition-colors"
          >
            تصفير الكاش 🧹
          </button>
          <div className={`px-6 py-2 rounded-xl text-sm font-black ${state.status === 'ready' ? 'bg-green-100 text-green-700' : 'bg-orange-100 text-orange-700'
            }`}>
            {state.status === 'ready' ? 'متصل بنجاح' : 'جاري التحقق...'}
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        <div className="md:col-span-2 bg-white rounded-[2.5rem] p-10 shadow-xl shadow-blue-900/5 flex flex-col items-center justify-center min-h-[450px] border border-gray-50">
          {state.status === "waiting_qr" && state.qrDataUrl ? (
            <div className="animate-in zoom-in duration-500 text-center space-y-6">
              <div className="relative group">
                <div className="absolute -inset-4 bg-gradient-to-tr from-blue-600 to-purple-600 rounded-[3rem] blur opacity-20 group-hover:opacity-40 transition duration-1000"></div>
                <div className="relative bg-white p-6 rounded-[2.5rem] shadow-2xl border border-gray-100">
                  <img src={state.qrDataUrl} alt="QR" className="w-64 h-64 md:w-80 md:h-80" />
                </div>
              </div>
              <div className="bg-blue-50 text-blue-700 px-6 py-3 rounded-2xl font-bold inline-block animate-pulse">
                افتح واتساب {'>'} الأجهزة المرتبطة {'>'} ربط جهاز
              </div>
            </div>
          ) : state.status === "ready" ? (
            <div className="text-center space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-700">
              <div className="w-32 h-32 bg-green-500 text-white rounded-full flex items-center justify-center mx-auto text-6xl shadow-2xl shadow-green-200">✓</div>
              <h2 className="text-3xl font-black text-gray-900">أنت الآن متصل!</h2>
              <p className="text-gray-500 max-w-sm mx-auto leading-relaxed">تم ربط حسابك بنجاح. يمكنك الآن إدارة جميع محادثاتك من لوحة التحكم مباشرة.</p>
            </div>
          ) : (
            <div className="text-center space-y-6 opacity-60">
              {loading ? (
                <div className="flex flex-col items-center gap-4">
                  <div className="w-16 h-16 border-8 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                  <p className="text-blue-600 font-black text-xl">جاري استخراج الكود...</p>
                </div>
              ) : (
                <>
                  <div className="text-9xl mb-4">📱</div>
                  <p className="text-xl font-bold text-gray-400">في انتظار بدء الجلسة</p>
                </>
              )}
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="bg-blue-600 rounded-[2.5rem] p-8 text-white shadow-2xl shadow-blue-600/30 flex flex-col justify-between">
            <div>
              <h2 className="text-2xl font-black mb-4">التحكم بالجلسة</h2>
              <p className="text-blue-100 text-sm mb-8 font-medium leading-relaxed">لبدء استقبال الرسائل، اضغط على زر الاتصال بالأسفل وامسح الكود الظاهر بجانبك.</p>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleConnect}
                disabled={loading || state.status === 'ready'}
                className="w-full py-5 bg-white text-blue-600 rounded-2xl font-black shadow-xl hover:bg-blue-50 disabled:opacity-50 transition-all active:scale-95"
              >
                {loading ? "جاري الاتصال..." : "اتصال بـ WhatsApp"}
              </button>

              {state.status === 'ready' && (
                <button
                  onClick={handleDisconnect}
                  className="w-full py-5 bg-red-500 text-white rounded-2xl font-black shadow-xl hover:bg-red-600 transition-all active:scale-95"
                >
                  قطع الاتصال نهائياً
                </button>
              )}
            </div>
          </div>

          <div className="bg-gray-50 rounded-[2rem] p-6 border border-gray-100 space-y-4">
            <h3 className="font-black text-gray-800 flex items-center gap-2">معلومات التقنية</h3>
            <div className="space-y-3">
              <div className="bg-white p-4 rounded-2xl shadow-sm">
                <span className="text-gray-400 text-[10px] block uppercase font-black">Organization ID</span>
                <code className="text-[10px] text-blue-600 break-all leading-none">{clientId}</code>
              </div>
              <div className="bg-white p-4 rounded-2xl shadow-sm">
                <span className="text-gray-400 text-[10px] block uppercase font-black">Connection Status</span>
                <span className="font-bold text-sm text-gray-700">{statusLabels[state.status]}</span>
              </div>
            </div>
            {error && <div className="p-4 bg-red-50 text-red-600 rounded-xl text-xs font-bold ring-1 ring-red-100 italic">⚠️ {error}</div>}
          </div>
        </div>
      </div>
    </div>
  );
}
