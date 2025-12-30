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

interface Activity {
  id: string;
  action: string;
  user?: { name: string };
  details: any;
  created_at: string;
}

interface DailyStat {
  date: string;
  messages_sent?: number;
  messages_received?: number;
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
  const [activity, setActivity] = useState<Activity[]>([]);
  const [dailyData, setDailyData] = useState<DailyStat[]>([]);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  useEffect(() => {
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

    // Live update every 30 seconds
    const interval = setInterval(() => {
      fetchData(token);
    }, 30000);

    return () => clearInterval(interval);
  }, [router]);

  const fetchData = async (token: string) => {
    setLoading(true);
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [statsRes, threadsRes, activityRes, dailyRes] = await Promise.all([
        fetch(`${API_URL}/api/reports/stats`, { headers }),
        fetch(`${API_URL}/api/threads`, { headers }),
        fetch(`${API_URL}/api/reports/activity`, { headers }),
        fetch(`${API_URL}/api/reports/daily?days=7`, { headers })
      ]);

      if (statsRes.ok) setStats(await statsRes.json());
      if (threadsRes.ok) {
        const data = await threadsRes.json();
        setThreads(data.threads.slice(0, 5));
      }
      if (activityRes.ok) {
        const data = await activityRes.json();
        setActivity(data.activity || []);
      }
      if (dailyRes.ok) {
        const data = await dailyRes.json();
        setDailyData(data.analytics || []);
      }
    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  const formatAction = (action: string) => {
    const maps: any = {
      'create_deal': 'أنشأ صفقة جديدة',
      'update_deal': 'حدث حالة صفقة',
      'send_message': 'أرسل رسالة واتساب',
      'receive_message': 'استلم رسالة جديدة',
      'login': 'سجل دخوله للمنصة',
      'connect_whatsapp': 'ربط واتساب جديد',
    };
    return maps[action] || action;
  };

  if (loading && !stats) {
    return (
      <div className="flex h-[70vh] items-center justify-center">
        <div className="text-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-brand-blue border-t-transparent mx-auto mb-4"></div>
          <p className="text-slate-500 font-medium">جاري تجهيز بياناتك...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">
      {/* Header */}
      <div className="flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
        <div className="space-y-1">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-blue/60 mt-1">نظرة عامة على الأداء</p>
          <h1 className="text-3xl font-black text-slate-900 tracking-tight">
            مرحباً، {user?.name || 'مستخدمنا'} 👋
          </h1>
        </div>
        <div className="flex items-center gap-3 bg-white px-4 py-2 rounded-2xl shadow-sm border border-slate-100">
          <span className="relative flex h-3 w-3">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-brand-green opacity-75"></span>
            <span className="relative inline-flex rounded-full h-3 w-3 bg-brand-green"></span>
          </span>
          <span className="text-sm font-bold text-slate-600">النظام متصل</span>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
        {[
          { label: "محادثات نشطة", value: stats?.openThreads || 0, icon: "💬", color: "blue" },
          { label: "عملاء جدد", value: stats?.totalCustomers || 0, icon: "👥", color: "purple" },
          { label: "قيمة الصفقات", value: `${(stats as any)?.totalDealsValue?.toLocaleString() || 0} JOD`, icon: "💰", color: "emerald" },
          { label: "عدد الصفقات", value: (stats as any)?.totalDealsCount || 0, icon: "💼", color: "orange" },
        ].map((item, idx) => (
          <div key={idx} className="group relative overflow-hidden card p-5 transition-all hover:scale-[1.02] hover:shadow-xl">
            <div className="relative z-10 flex flex-col gap-3">
              <div className="flex items-center justify-between">
                <span className="text-2xl">{item.icon}</span>
              </div>
              <div>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-wide">{item.label}</p>
                <p className="text-2xl font-black text-slate-900 mt-1">{item.value}</p>
              </div>
            </div>
            <div className={`absolute -right-4 -bottom-4 h-24 w-24 rounded-full opacity-5 bg-${item.color}-500 transition-transform group-hover:scale-150`}></div>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        {/* Main Chart Area */}
        <div className="card p-6 lg:col-span-2 space-y-6">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-lg font-black text-slate-800">نشاط الرسائل</h3>
              <p className="text-xs text-slate-400 font-medium">عدد الرسائل الصادرة والواردة خلال الـ 7 أيام الماضية</p>
            </div>
            <div className="flex gap-4">
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-brand-blue"></div>
                <span className="text-[10px] font-bold text-slate-500">صادر</span>
              </div>
              <div className="flex items-center gap-1.5">
                <div className="h-2 w-2 rounded-full bg-sky-400"></div>
                <span className="text-[10px] font-bold text-slate-500">وارد</span>
              </div>
            </div>
          </div>

          {/* Simple SVG Chart */}
          <div className="relative h-64 w-full bg-slate-50/50 rounded-2xl flex items-end p-4 group">
            {dailyData.length > 0 ? (
              <div className="flex w-full items-end justify-between h-full gap-2">
                {dailyData.reverse().map((day, idx) => {
                  const max = Math.max(...dailyData.map(d => (d.messages_sent || 0) + (d.messages_received || 0)), 10);
                  const sH = ((day.messages_sent || 0) / max) * 100;
                  const rH = ((day.messages_received || 0) / max) * 100;
                  return (
                    <div key={idx} className="flex-1 flex flex-col items-center gap-2 group/bar">
                      <div className="w-full flex items-end gap-1 px-1 h-48 justify-center">
                        <div className="w-3 rounded-t-full bg-brand-blue transition-all duration-700 hover:brightness-110" style={{ height: `${sH}%` }}></div>
                        <div className="w-3 rounded-t-full bg-sky-400 transition-all duration-700 hover:brightness-110" style={{ height: `${rH}%` }}></div>
                      </div>
                      <span className="text-[9px] font-bold text-slate-400 rotate-45">{new Date(day.date).toLocaleDateString('ar-EG', { weekday: 'short' })}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className="w-full text-center text-slate-400 text-sm italic">لا توجد بيانات كافية لعرض الرسم البياني</div>
            )}
          </div>
        </div>

        {/* Activity Feed */}
        <div className="card overflow-hidden flex flex-col h-full">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between">
            <h3 className="text-lg font-black text-slate-800">آخر النشاطات</h3>
            <span className="bg-slate-50 text-[10px] font-black px-2 py-1 rounded-lg text-slate-400 uppercase tracking-widest">تحديث مباشر</span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[400px]">
            {activity.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-slate-400 text-sm">لا يوجد نشاط مسجل حالياً</p>
              </div>
            ) : (
              activity.map((act) => (
                <div key={act.id} className="flex gap-4 group">
                  <div className="relative">
                    <div className="h-10 w-10 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-sm shadow-sm transition-all group-hover:bg-brand-blue group-hover:text-white group-hover:scale-110 group-active:scale-95">
                      👤
                    </div>
                    {act.id === activity[0].id && (
                      <div className="absolute -top-1 -right-1 h-3 w-3 rounded-full bg-brand-green ring-2 ring-white"></div>
                    )}
                  </div>
                  <div className="flex-1 space-y-1">
                    <p className="text-xs text-slate-800 font-bold leading-none mt-1">
                      {act.user?.name || 'النظام'} <span className="font-medium text-slate-500">{formatAction(act.action)}</span>
                    </p>
                    <p className="text-[10px] text-slate-400 font-bold">{new Date(act.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
