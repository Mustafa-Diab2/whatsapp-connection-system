"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { io } from "socket.io-client";

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

  const fetchStatus = useCallback(async () => {
    if (clientId === "default") return; // Wait for real clientId
    try {
      const res = await fetch(`${apiBase}/whatsapp/status/${clientId}`, {
        headers: getAuthHeaders()
      });
      const data = await res.json();
      setState((prev) => ({ ...prev, ...data }));
      if (data.status === "waiting_qr") {
        const qrRes = await fetch(`${apiBase}/whatsapp/qr/${clientId}`, {
          headers: getAuthHeaders()
        });
        const qr = await qrRes.json();
        if (qr?.qrDataUrl) {
          setState((prev) => ({ ...prev, qrDataUrl: qr.qrDataUrl }));
        }
      }
    } catch (err) {
      console.error("Failed to fetch status", err);
      setState((prev) => ({ ...prev, status: "error", lastError: "تعذر جلب الحالة الحالية" }));
    }
  }, [clientId]);

  useEffect(() => {
    if (clientId !== "default") {
      void fetchStatus();
    }
  }, [fetchStatus, clientId]);

  useEffect(() => {
    if (clientId === "default") return; // Wait for real clientId

    const token = localStorage.getItem("token");
    const s = io(apiBase, {
      transports: ["websocket"],
      auth: { token }
    });
    s.on("connect", () => {
      s.emit("wa:subscribe", { clientId });
    });
    s.on("wa:state", (payload: { status: Status; qrDataUrl?: string; lastError?: string }) => {
      setState((prev) => ({ ...prev, ...payload, qrDataUrl: payload.qrDataUrl ?? prev.qrDataUrl }));
      if (payload.status !== "waiting_qr") {
        setConnectDisabled(false);
        setLoading(false);
      }
    });
    s.on("wa:qr", (payload: { qrDataUrl: string }) => {
      setState((prev) => ({ ...prev, qrDataUrl: payload.qrDataUrl, status: "waiting_qr" }));
    });
    return () => {
      s.disconnect();
    };
  }, [clientId]);

  const handleConnect = useCallback(async () => {
    if (state.status === "initializing" || state.status === "waiting_qr") return;
    setConnectDisabled(true);
    setLoading(true);
    setTimeout(() => setConnectDisabled(false), 2000);
    try {
      await fetch(`${apiBase}/whatsapp/connect`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ clientId }),
      });
    } catch (err) {
      console.error("Connect failed", err);
      setState((prev) => ({ ...prev, status: "error", lastError: "فشل طلب الاتصال، حاول مجددًا" }));
      setLoading(false);
    }
  }, [state.status, clientId]);

  const handleReset = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`${apiBase}/whatsapp/reset`, {
        method: "POST",
        headers: getAuthHeaders(),
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (data.state) setState(data.state);
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
            </div>

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
                <li>التنبيهات: سيتم إعادة المحاولة تلقائيًا إذا لم يصل QR خلال 20 ثانية.</li>
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
