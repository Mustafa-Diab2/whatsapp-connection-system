"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface DashboardStats {
  totalCustomers: number;
  activeCustomers: number;
  totalContacts: number;
  openThreads: number;
  pendingThreads: number;
}

interface Thread {
  id: string;
  title: string;
  customer: string;
  status: string;
  priority: string;
  messages: number;
  lastUpdate: string;
}

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [threads, setThreads] = useState<Thread[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
    // Check auth
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token) {
      router.push("/login");
      return;
    }

    if (storedUser) {
      setUser(JSON.parse(storedUser));
    }

    fetchData(token);
  }, [router]);

  const fetchData = async (token: string) => {
    setLoading(true);
    try {
      // Fetch Stats
      const statsRes = await fetch(`${API_URL}/api/reports/stats`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (statsRes.ok) {
        const data = await statsRes.json();
        setStats(data);
      }

      // Fetch Recent Threads
      const threadsRes = await fetch(`${API_URL}/api/threads`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (threadsRes.ok) {
        const data = await threadsRes.json();
        setThreads(data.threads.slice(0, 5)); // Take first 5
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  if (loading && !stats) {
    return (
      <div className="flex h-full items-center justify-center p-12">
        <div className="text-center">
          <div className="spinner mb-4 h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent mx-auto"></div>
          <p className="text-slate-500">جاري تحميل البيانات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">لوحة التحكم</p>
          <h1 className="text-2xl font-extrabold text-slate-900">
            {user?.role === 'admin' ? `${user.name} (Admin)` : user?.name || 'Inbox'} · WhatsApp CRM
          </h1>
        </div>
        <div className="badge bg-brand-blue text-white">Online</div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Stats Card */}
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">WhatsApp CRM</h2>
            <span className="badge bg-emerald-100 text-emerald-700">Live</span>
          </div>
          <p className="text-sm text-slate-600">
            أرقام الأداء الحالية لمنظمتك.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              { label: "محادثات مفتوحة", value: stats?.openThreads || 0 },
              { label: "عملاء نشطين", value: stats?.activeCustomers || 0 },
              { label: "إجمالي العملاء", value: stats?.totalCustomers || 0 },
              { label: "محادثات معلقة", value: stats?.pendingThreads || 0 },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="text-xl font-bold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        {/* Recent Inbox Card */}
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">آخر المحادثات</h2>
            <button
              onClick={() => fetchData(localStorage.getItem("token") || "")}
              className="btn bg-brand-blue px-3 py-2 text-white hover:bg-blue-700 text-xs"
            >
              تحديث
            </button>
          </div>
          <div className="space-y-3">
            {threads.length === 0 ? (
              <p className="text-center text-slate-400 py-8">لا توجد محادثات نشطة حالياً</p>
            ) : (
              threads.map((thread) => (
                <div key={thread.id} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-800">{thread.title || thread.customer}</p>
                    <p className="text-xs text-slate-500">
                      {new Date(thread.lastUpdate).toLocaleDateString('ar-EG')}
                    </p>
                  </div>
                  <span
                    className={`badge ${thread.status === "open" ? "bg-green-100 text-green-700" :
                        thread.status === "pending" ? "bg-yellow-100 text-yellow-700" :
                          "bg-slate-200 text-slate-700"
                      }`}
                  >
                    {thread.status === "open" ? "مفتوح" : thread.status === "pending" ? "معلق" : "مغلق"}
                  </span>
                </div>
              ))
            )}

            {threads.length > 0 && (
              <button
                onClick={() => router.push('/threads')}
                className="w-full text-center text-sm text-brand-blue mt-2 hover:underline"
              >
                عرض الكل
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
