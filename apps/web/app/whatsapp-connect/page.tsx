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

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

const statusLabels: Record<Status, string> = {
  idle: "جاهز",
  initializing: "جاري التهيئة",
  waiting_qr: "انتظر مسح QR",
  ready: "متصل",
  error: "خطأ",
  disconnected: "تم فصل الاتصال",
};

const statusColors: Record<Status, string> = {
  idle: "bg-slate-100 text-slate-700",
  initializing: "bg-blue-100 text-blue-700",
  waiting_qr: "bg-amber-100 text-amber-700",
  ready: "bg-green-100 text-green-700",
  error: "bg-red-100 text-red-700",
  disconnected: "bg-slate-200 text-slate-700",
};

// Helper to get auth token
const getAuthHeaders = () => {
  const token = typeof window !== 'undefined' ? localStorage.getItem('token') : null;
  return {
    'Content-Type': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {})
  };
};

export default function WhatsAppConnectPage() {
  const [state, setState] = useState<WaState>({ status: "idle" });
  const [connectDisabled, setConnectDisabled] = useState(false);
  const [loading, setLoading] = useState(false);
  const [clientId, setClientId] = useState<string>("default");
  const [isPolling, setIsPolling] = useState(false); // Track if we should poll
  const socketRef = useRef<Socket | null>(null);

  // Polling refs - defined early so socket handlers can access them
  const pollingIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const isPollingActiveRef = useRef<boolean>(false);

  // Get organizationId from user data on mount
  useEffect(() => {
    const userStr = localStorage.getItem("user");
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        // API returns organization_id (snake_case)
        const orgId = user.organization_id || user.organizationId;
        if (orgId) {
          setClientId(orgId);
          console.log("[WhatsApp] Using organizationId:", orgId);
        }
      } catch (e) {
        console.error("Failed to parse user data", e);
      }
    }
  }, []);

  const statusBadge = useMemo(() => statusLabels[state.status], [state.status]);

  // Fetch QR directly from API
  const fetchQr = useCallback(async () => {
    if (clientId === "default") return;
    try {
      const res = await fetch(`${apiBase}/whatsapp/qr/${clientId}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      if (data?.qrDataUrl) {
        console.log("[WhatsApp] QR received via API");
        setState((prev) => ({ ...prev, qrDataUrl: data.qrDataUrl, status: "waiting_qr" }));
        setLoading(false);
        return true;
      }
    } catch (e) {
      console.error("[WhatsApp] QR fetch failed:", e);
    }
    return false;
  }, [clientId]);

  const fetchStatus = useCallback(async () => {
    if (clientId === "default") return; // Wait for real clientId
    try {
      const res = await fetch(`${apiBase}/whatsapp/status/${clientId}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      console.log("[WhatsApp] Status fetched:", data.status, "hasQR:", !!data.qrDataUrl);
      setState((prev) => ({
        ...prev,
        status: data.status,
        lastError: data.lastError,
        updatedAt: data.updatedAt,
        qrDataUrl: data.qrDataUrl ?? prev.qrDataUrl
      }));

      // If waiting_qr but no QR, try to fetch it
      if (data.status === "waiting_qr" && !data.qrDataUrl) {
        await fetchQr();
      }
    } catch (err) {
      console.error("Failed to fetch status", err);
      setState((prev) => ({ ...prev, status: "error", lastError: "تعذر جلب الحالة الحالية" }));
    }
  }, [clientId, fetchQr]);

  // Continuous status polling until ready - ensures we detect the connected state
  useEffect(() => {
    if (clientId === "default") {
      console.log("[WhatsApp] Waiting for clientId...");
      return;
    }

    console.log("[WhatsApp] 🚀 Starting status polling for clientId:", clientId);

    // Initial fetch
    void fetchStatus();

    // Poll every 3 seconds to detect status changes
    const statusPollingInterval = setInterval(async () => {
      console.log("[WhatsApp] 🔄 Polling status...");
      try {
        const res = await fetch(`${apiBase}/whatsapp/status/${clientId}`, {
          headers: getAuthHeaders()
        });

        if (!res.ok) {
          console.error("[WhatsApp] ❌ Status API error:", res.status, res.statusText);
          return;
        }

        const data = await res.json();
        console.log("[WhatsApp] 📊 Status received:", data.status, "| hasQR:", !!data.qrDataUrl);

        setState((prev) => ({
          ...prev,
          status: data.status,
          lastError: data.lastError,
          updatedAt: data.updatedAt,
          qrDataUrl: data.qrDataUrl ?? (data.status === "ready" ? undefined : prev.qrDataUrl)
        }));

        // Stop polling and loading state when ready
        if (data.status === "ready") {
          console.log("[WhatsApp] ✅ Connected! Stopping status polling");
          setConnectDisabled(false);
          setLoading(false);
          clearInterval(statusPollingInterval);
        }
      } catch (err) {
        console.error("[WhatsApp] ❌ Status poll failed:", err);
      }
    }, 3000);

    return () => {
      console.log("[WhatsApp] 🛑 Cleanup: stopping polling");
      clearInterval(statusPollingInterval);
    };
  }, [fetchStatus, clientId]);

  useEffect(() => {
    if (clientId === "default") return; // Wait for real clientId

    const token = localStorage.getItem("token");
    const socketUrl = process.env.NEXT_PUBLIC_SOCKET_URL || apiBase;

    const s = io(socketUrl, {
      transports: ["websocket", "polling"],
      auth: { token },
      reconnectionAttempts: 10,
      reconnectionDelay: 1000,
      timeout: 20000,
    });

    socketRef.current = s;

    s.on("connect", () => {
      console.log("[WhatsApp] Socket connected:", s.id);
      s.emit("wa:subscribe", { clientId });
    });

    s.on("disconnect", (reason) => {
      console.warn("[WhatsApp] Socket disconnected:", reason);
      // Note: polling is started by handleConnect, not here
    });

    s.on("connect_error", (err) => {
      console.error("[WhatsApp] Socket connection error:", err.message);
      // Note: polling is started by handleConnect, not here
    });

    s.on("wa:state", (payload: { status: Status; qrDataUrl?: string; lastError?: string }) => {
      console.log("[WhatsApp] State update via socket:", payload.status, "hasQR:", !!payload.qrDataUrl);
      setState((prev) => ({
        ...prev,
        status: payload.status,
        lastError: payload.lastError,
        qrDataUrl: payload.qrDataUrl ?? (payload.status === "ready" || payload.status === "idle" ? undefined : prev.qrDataUrl)
      }));
      if (payload.status !== "waiting_qr" && payload.status !== "initializing") {
        setConnectDisabled(false);
        setLoading(false);
        // Stop polling using refs directly
        isPollingActiveRef.current = false;
        if (pollingIntervalRef.current) {
          clearInterval(pollingIntervalRef.current);
          pollingIntervalRef.current = null;
        }
        setIsPolling(false);
      }
    });

    s.on("wa:qr", (payload: { qrDataUrl: string }) => {
      console.log("[WhatsApp] QR received via socket");
      setState((prev) => ({ ...prev, qrDataUrl: payload.qrDataUrl, status: "waiting_qr" }));
      setLoading(false);
    });

    return () => {
      s.disconnect();
      socketRef.current = null;
    };
  }, [clientId]);

  // Continuous polling functions
  const stopPolling = useCallback(() => {
    console.log("[WhatsApp] Stopping polling");
    isPollingActiveRef.current = false;
    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }
    setIsPolling(false);
  }, []);

  const startPolling = useCallback(() => {
    if (clientId === "default" || isPollingActiveRef.current) return;

    console.log("[WhatsApp] Starting continuous polling...");
    isPollingActiveRef.current = true;
    setIsPolling(true);

    const pollStatus = async () => {
      if (!isPollingActiveRef.current) return;

      try {
        const statusRes = await fetch(`${apiBase}/whatsapp/status/${clientId}`, {
          headers: getAuthHeaders()
        });
        const statusData = await statusRes.json();
        console.log("[WhatsApp] Poll:", statusData.status, "hasQR:", !!statusData.qrDataUrl);

        // Update state FIRST before any conditional logic
        const newStatus = statusData.status as Status;
        const newQr = statusData.qrDataUrl ?? (newStatus === "waiting_qr" ? undefined : undefined);

        setState((prev) => ({
          ...prev,
          status: newStatus,
          lastError: statusData.lastError,
          qrDataUrl: statusData.qrDataUrl ?? (newStatus === "waiting_qr" ? prev.qrDataUrl : undefined)
        }));

        // Check terminal states AFTER state update
        if (newStatus === "ready") {
          console.log("[WhatsApp] ✅ Connected successfully!");
          stopPolling();
          setLoading(false);
          return;
        }

        if (newStatus === "error" || newStatus === "disconnected") {
          console.log("[WhatsApp] Connection ended:", newStatus);
          stopPolling();
          setLoading(false);
          return;
        }

        // If waiting_qr but no QR, try QR endpoint
        if (newStatus === "waiting_qr" && !statusData.qrDataUrl) {
          try {
            const qrRes = await fetch(`${apiBase}/whatsapp/qr/${clientId}`, {
              headers: getAuthHeaders()
            });
            const qrData = await qrRes.json();
            if (qrData?.qrDataUrl) {
              console.log("[WhatsApp] QR via polling");
              setState((prev) => ({ ...prev, qrDataUrl: qrData.qrDataUrl }));
              setLoading(false);
            }
          } catch (e) { }
        }
      } catch (e) {
        console.error("[WhatsApp] Poll failed:", e);
      }
    };

    // Poll immediately
    pollStatus();

    // Then poll every 1.5 seconds
    pollingIntervalRef.current = setInterval(pollStatus, 1500);
  }, [clientId, stopPolling]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) {
        clearInterval(pollingIntervalRef.current);
      }
    };
  }, []);

  const handleConnect = useCallback(async () => {
    if (state.status === "initializing" || state.status === "waiting_qr") return;
    setConnectDisabled(true);
    setLoading(true);
    setState((prev) => ({ ...prev, status: "initializing", qrDataUrl: undefined }));

    // Start polling immediately - this will detect state changes
    startPolling();

    setTimeout(() => setConnectDisabled(false), 2000);
    try {
      const res = await fetch(`${apiBase}/whatsapp/connect`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();

      // If response includes QR, use it immediately
      if (data?.state?.qrDataUrl) {
        setState((prev) => ({ ...prev, qrDataUrl: data.state.qrDataUrl, status: "waiting_qr" }));
        setLoading(false);
      }
    } catch (err) {
      console.error("Connect failed", err);
      setState((prev) => ({ ...prev, status: "error", lastError: "فشل طلب الاتصال، حاول مجددًا" }));
      setLoading(false);
      stopPolling();
    }
  }, [state.status, clientId, startPolling, stopPolling]);

  const handleReset = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/whatsapp/reset`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (data.state) setState({ ...data.state, qrDataUrl: undefined }); // Clear QR on reset
      setConnectDisabled(false);
    } catch (err) {
      console.error("Reset failed", err);
      setState((prev) => ({ ...prev, status: "error", lastError: "تعذر إعادة التعيين" }));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  const handleDisconnect = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/whatsapp/disconnect`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (data.state) setState(data.state);
    } catch (err) {
      console.error("Disconnect failed", err);
      setState((prev) => ({ ...prev, status: "error", lastError: "تعذر قطع الاتصال" }));
    } finally {
      setLoading(false);
    }
  }, [clientId]);

  // Sync chats to database with proper wa_chat_id
  const [syncResult, setSyncResult] = useState<{ synced?: number; updated?: number; failed?: number } | null>(null);
  const [syncing, setSyncing] = useState(false);

  const handleSyncChats = useCallback(async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await fetch(`${apiBase}/whatsapp/chats/sync`, {
        method: "POST",
        headers: getAuthHeaders(),
      });
      const data = await res.json();
      if (data.ok) {
        setSyncResult({ synced: data.synced, updated: data.updated, failed: data.failed });
      } else {
        setState((prev) => ({ ...prev, lastError: data.message || "فشل المزامنة" }));
      }
    } catch (err) {
      console.error("Sync failed", err);
      setState((prev) => ({ ...prev, lastError: "تعذر مزامنة المحادثات" }));
    } finally {
      setSyncing(false);
    }
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">التكامل</p>
          <h1 className="text-2xl font-extrabold text-slate-900">اتصال الواتساب</h1>
        </div>
        <div className={`badge ${statusColors[state.status]}`}>{statusBadge}</div>
      </div>

      <div className="card overflow-hidden">
        <div className="bg-gradient-to-l from-brand-blue to-sky-400 px-6 py-5 text-white">
          <h2 className="text-xl font-bold">اربط نظامك باحتراف عبر واتساب</h2>
          <p className="mt-1 text-sm opacity-90">
            شغّل الجلسة، امسح كود QR من هاتفك، وسيصبح النظام متصلًا فورًا دون إعادة تحميل الصفحة.
          </p>
        </div>

        <div className="grid gap-6 px-6 py-6 md:grid-cols-3">
          <div className="md:col-span-2 space-y-4">
            <div className="flex items-center gap-3">
              <span className={`badge ${statusColors[state.status]}`}>{statusBadge}</span>
              {loading && <span className="animate-pulse text-sm text-slate-500">...جاري التحميل</span>}
              {state.updatedAt && (
                <span className="text-xs text-slate-500">آخر تحديث: {new Date(state.updatedAt).toLocaleTimeString()}</span>
              )}
            </div>

            <div className="flex flex-wrap gap-4">
              <button
                className="btn bg-brand-blue flex items-center gap-2 px-6 py-3 text-white shadow-lg shadow-blue-200 transition-all hover:bg-blue-700 hover:scale-[1.02] active:scale-95 disabled:cursor-not-allowed disabled:bg-blue-300 disabled:shadow-none"
                onClick={handleConnect}
                disabled={connectDisabled || state.status === "initializing" || state.status === "waiting_qr"}
              >
                <span className="text-lg">🔌</span>
                اتصال بـ WhatsApp
              </button>

              <button
                className="btn bg-white border border-orange-200 flex items-center gap-2 px-6 py-3 text-orange-600 shadow-sm transition-all hover:bg-orange-50 hover:border-orange-300 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleDisconnect}
                disabled={loading || state.status === "idle" || state.status === "disconnected"}
              >
                <span className="text-lg">✂️</span>
                قطع الاتصال
              </button>

              <button
                className="btn bg-white border border-red-100 flex items-center gap-2 px-6 py-3 text-red-500 shadow-sm transition-all hover:bg-red-50 hover:border-red-200 active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
                onClick={handleReset}
                disabled={loading}
              >
                <span className="text-lg">♻️</span>
                إعادة تهيئة
              </button>

              <button
                className="btn bg-slate-50 border border-slate-200 flex items-center gap-2 px-4 py-3 text-slate-600 transition-all hover:bg-slate-100 active:scale-95"
                onClick={fetchStatus}
              >
                <span className="text-lg">🔄</span>
                تحديث
              </button>

              <button
                className={`btn flex items-center gap-2 px-6 py-3 shadow-md transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed ${syncing ? "bg-indigo-100 text-indigo-400" : "bg-indigo-600 text-white hover:bg-indigo-700"
                  }`}
                onClick={handleSyncChats}
                disabled={syncing || state.status !== "ready"}
              >
                <span className="text-lg">{syncing ? "⏳" : "🔄"}</span>
                {syncing ? "جاري المزامنة..." : "مزامنة المحادثات (ID)"}
              </button>
            </div>

            {syncResult && (
              <div className="rounded-xl border border-indigo-100 bg-indigo-50 p-4 text-sm text-indigo-700 animate-in fade-in slide-in-from-top-2">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <span>✅</span> تم اكتمال المزامنة بنجاح
                </div>
                <div className="grid grid-cols-3 gap-2 mt-2">
                  <div className="bg-white p-2 rounded border border-indigo-100 text-center">
                    <div className="text-xs opacity-70">جديد</div>
                    <div className="text-lg font-bold">{syncResult.synced}</div>
                  </div>
                  <div className="bg-white p-2 rounded border border-indigo-100 text-center">
                    <div className="text-xs opacity-70">مُحدّث</div>
                    <div className="text-lg font-bold">{syncResult.updated}</div>
                  </div>
                  <div className="bg-white p-2 rounded border border-indigo-100 text-center">
                    <div className="text-xs opacity-70">فشل</div>
                    <div className="text-lg font-bold text-red-500">{syncResult.failed}</div>
                  </div>
                </div>
                <p className="mt-2 text-xs opacity-80">
                  تم حفظ معرفات المحادثات (Chat IDs) لضمان وصول رسائل الحملات بنسبة 100%.
                </p>
              </div>
            )}

            {state.lastError && (
              <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
                {state.lastError}
              </div>
            )}

            <div className="rounded-2xl border border-dashed border-slate-200 bg-slate-50 p-4">
              <h3 className="mb-2 text-sm font-semibold text-slate-700">الحالة التفصيلية</h3>
              <ul className="space-y-1 text-sm text-slate-600">
                <li>العميل: {clientId}</li>
                <li>الوضع الحالي: {statusLabels[state.status]}</li>
                <li>القفل: {state.status === "initializing" || state.status === "waiting_qr" ? "مفعل" : "غير مفعل"}</li>
                <li>التنبيهات: سيتم إعادة المحاولة تلقائيًا (3 محاولات) إذا لم يتم مسح QR خلال 3 دقائق.</li>
              </ul>
            </div>
          </div>

          <div className="flex flex-col items-center justify-center rounded-2xl bg-slate-50 p-4 text-center">
            {state.status === "waiting_qr" && state.qrDataUrl && (
              <>
                <img src={state.qrDataUrl} alt="WhatsApp QR" className="h-64 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow" />
                <p className="mt-3 text-sm text-slate-700">امسح الكود من تطبيق واتساب للاتصال</p>
              </>
            )}
            {state.status === "ready" && (
              <div className="space-y-2">
                <div className="mx-auto h-16 w-16 rounded-full bg-green-100 text-green-600 grid place-items-center text-3xl">✓</div>
                <p className="font-semibold text-slate-800">تم الاتصال بنجاح</p>
                <p className="text-sm text-slate-600">يمكنك الآن استخدام النظام دون أي إجراء إضافي</p>
              </div>
            )}
            {state.status !== "waiting_qr" && state.status !== "ready" && (
              <div className="space-y-2">
                <div className="mx-auto h-16 w-16 rounded-full bg-slate-100 text-slate-500 grid place-items-center text-2xl">⌛</div>
                <p className="font-semibold text-slate-800">في انتظار بدء الاتصال</p>
                <p className="text-sm text-slate-600">اضغط على زر الاتصال لبدء الجلسة</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
