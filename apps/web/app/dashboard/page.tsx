"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function DashboardPage() {
  const router = useRouter();
  const [stats, setStats] = useState<any>(null);
  const [activity, setActivity] = useState<any[]>([]);
  const [erpStats, setErpStats] = useState({
    totalSales: 0,
    pendingInvoices: 0,
    lowStockCount: 0,
    activeTasks: 0
  });
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<any>(null);

  const fetchData = useCallback(async (token: string) => {
    try {
      const headers = { Authorization: `Bearer ${token}` };

      const [statsRes, activityRes, ordersRes, productsRes, tasksRes, invoicesRes] = await Promise.all([
        axios.get(`${API_URL}/api/reports/stats`, { headers }),
        axios.get(`${API_URL}/api/reports/activity`, { headers }),
        axios.get(`${API_URL}/api/orders`, { headers }),
        axios.get(`${API_URL}/api/products`, { headers }),
        axios.get(`${API_URL}/api/tasks`, { headers }),
        axios.get(`${API_URL}/api/invoices`, { headers })
      ]);

      setStats(statsRes.data);
      setActivity(activityRes.data.activity || []);

      const orders = ordersRes.data.orders || [];
      const products = productsRes.data.products || [];
      const tasks = tasksRes.data.tasks || [];
      const invoices = invoicesRes.data.invoices || [];

      setErpStats({
        totalSales: orders.reduce((acc: number, o: any) => acc + Number(o.total_amount), 0),
        pendingInvoices: invoices.filter((i: any) => i.status !== 'paid').length,
        lowStockCount: products.filter((p: any) => p.stock_quantity <= p.min_stock_level).length,
        activeTasks: tasks.filter((t: any) => t.status !== 'completed').length
      });

    } catch (error) {
      console.error("Failed to fetch dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const token = localStorage.getItem("token");
    const storedUser = localStorage.getItem("user");

    if (!token) {
      router.push("/login");
      return;
    }

    if (storedUser) setUser(JSON.parse(storedUser));
    fetchData(token);

    const interval = setInterval(() => fetchData(token), 60000);
    return () => clearInterval(interval);
  }, [router, fetchData]);

  if (loading && !stats) {
    return (
      <div className="flex h-[80vh] items-center justify-center">
        <div className="text-center">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-blue border-t-transparent mx-auto mb-6"></div>
          <p className="text-slate-500 font-black tracking-widest text-xs uppercase animate-pulse">جاري تجميع البيانات...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-10 pb-20">
      {/* Dynamic Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
            <p className="text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">نظام الإدارة المتكامل • ERP CRM</p>
          </div>
          <h1 className="text-4xl font-black text-slate-900 tracking-tight">
            مرحباً، <span className="text-brand-blue">{user?.name?.split(' ')[0] || 'مستخدمنا'}</span> 👋
          </h1>
          <p className="text-slate-500 font-medium mt-1">إليك ملخص سريع لأداء مشروعك اليوم ونشاط العملاء</p>
        </div>
        <div className="flex gap-4">
          <div className="bg-white px-6 py-4 rounded-[1.5rem] shadow-xl shadow-slate-200/50 border border-slate-50 flex items-center gap-4">
            <div className="text-2xl">💰</div>
            <div>
              <p className="text-[9px] font-black text-slate-400 uppercase">إجمالي المبيعات</p>
              <p className="text-lg font-black text-slate-900">{erpStats.totalSales.toLocaleString()} <span className="text-[10px] opacity-40">JOD</span></p>
            </div>
          </div>
        </div>
      </div>

      {/* Main KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[
          { label: "طلبات بانتظار التحصيل", value: erpStats.pendingInvoices, icon: "🧾", color: "indigo", bg: "bg-indigo-50", trend: "+2 حركات" },
          { label: "منتجات منخفضة المخزون", value: erpStats.lowStockCount, icon: "⚠️", color: "rose", bg: "bg-rose-50", trend: "بحاجة لطلب" },
          { label: "مهام عمل نشطة", value: erpStats.activeTasks, icon: "✅", color: "amber", bg: "bg-amber-50", trend: "متابعة فورية" },
          { label: "عملاء نشطون", value: stats?.activeCustomers || 0, icon: "👥", color: "emerald", bg: "bg-emerald-50", trend: "تفاعل مرتفع" },
        ].map((item, i) => (
          <div key={i} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 hover:shadow-2xl hover:scale-[1.02] transition-all group relative overflow-hidden">
            <div className={`absolute top-0 right-0 h-32 w-32 ${item.bg} rounded-full -translate-y-1/2 translate-x-1/2 opacity-20 group-hover:scale-125 transition-transform duration-700`}></div>
            <div className="relative z-10">
              <div className="flex justify-between items-start mb-6">
                <div className={`h-12 w-12 rounded-2xl ${item.bg} flex items-center justify-center text-2xl`}>{item.icon}</div>
                <span className="text-[9px] font-black text-slate-300 uppercase tracking-widest">{item.trend}</span>
              </div>
              <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">{item.label}</p>
              <h3 className="text-4xl font-black text-slate-900">{item.value}</h3>
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Business Overview Card */}
        <div className="lg:col-span-2 space-y-8">
          <div className="bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 relative overflow-hidden">
            <div className="absolute top-0 right-0 h-full w-1/3 bg-gradient-to-l from-brand-blue/5 to-transparent"></div>
            <div className="relative z-10">
              <h3 className="text-xl font-black text-slate-900 mb-2">حالة مخزونك المستودعي</h3>
              <p className="text-sm text-slate-500 font-medium mb-10 max-w-md">نتابع معك مستويات المخزون لضمان عدم توقف عمليات البيع. حالياً لديك <span className="text-rose-500 font-bold">{erpStats.lowStockCount} أصناف</span> قاربت على النفاد.</p>

              <div className="grid grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-slate-50 p-6 rounded-3xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-2">نسبة التحصيل</p>
                  <p className="text-2xl font-black text-emerald-600">92%</p>
                </div>
                <div className="bg-slate-50 p-6 rounded-3xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-2">سرعة الرد</p>
                  <p className="text-2xl font-black text-indigo-600">2.4 د</p>
                </div>
                <div className="bg-slate-50 p-6 rounded-3xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-2">نجاح الحملات</p>
                  <p className="text-2xl font-black text-amber-500">88%</p>
                </div>
                <div className="bg-slate-50 p-6 rounded-3xl">
                  <p className="text-[10px] font-black text-slate-400 uppercase mb-2">الطلبيات الجديدة</p>
                  <p className="text-2xl font-black text-slate-900">+{stats?.messagesToday || 0}</p>
                </div>
              </div>
            </div>
          </div>

          {/* Quick Actions Billboard */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="bg-slate-900 p-8 rounded-[3rem] text-white shadow-2xl group hover:bg-black transition-all cursor-pointer">
              <div className="flex justify-between items-start mb-6">
                <div className="h-10 w-10 bg-white/10 rounded-xl flex items-center justify-center text-xl">📢</div>
                <span className="text-xs font-bold text-slate-500">بداية سريعة</span>
              </div>
              <h4 className="text-xl font-black mb-2">أطلق حملة واتساب</h4>
              <p className="text-slate-400 text-xs font-medium leading-relaxed">تواصل مع {stats?.totalCustomers || 0} عميل دفعة واحدة بعرض خاص أو تحديث.</p>
            </div>
            <div className="bg-brand-blue p-8 rounded-[3rem] text-white shadow-2xl group hover:bg-blue-600 transition-all cursor-pointer">
              <div className="flex justify-between items-start mb-6">
                <div className="h-10 w-10 bg-white/20 rounded-xl flex items-center justify-center text-xl">🛒</div>
                <span className="text-xs font-bold text-white/50">بيع جديد</span>
              </div>
              <h4 className="text-xl font-black mb-2">إنشاء طلبية بيع</h4>
              <p className="text-white/70 text-xs font-medium leading-relaxed">سجل عملية بيع جديدة وقم بتوليد فاتورة فورية لعميلك.</p>
            </div>
          </div>
        </div>

        {/* Real-time Activity Sidebar */}
        <div className="bg-white rounded-[3.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 flex flex-col overflow-hidden">
          <div className="p-10 border-b border-slate-50 flex items-center justify-between bg-slate-50/30">
            <h3 className="text-lg font-black text-slate-900 tracking-tight">آخر التحركات</h3>
            <span className="h-2 w-2 rounded-full bg-indigo-500 animate-pulse"></span>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-6">
            {activity.length === 0 ? (
              <div className="py-20 text-center text-slate-300 italic text-sm">لا توجد تحركات مسجلة</div>
            ) : activity.slice(0, 10).map((act, i) => (
              <div key={i} className="flex gap-4 group cursor-default">
                <div className="relative">
                  <div className="h-12 w-12 rounded-2xl bg-slate-50 border border-slate-100 flex items-center justify-center text-lg transition-all group-hover:scale-110 group-hover:bg-indigo-50 group-hover:text-indigo-600">
                    {act.action.includes('message') ? '💬' : act.action.includes('deal') ? '🤝' : '⚙️'}
                  </div>
                  {i < 3 && <div className="absolute -top-1 -right-1 h-3 w-3 bg-emerald-500 rounded-full border-2 border-white"></div>}
                </div>
                <div className="flex-1 border-b border-slate-50 pb-4 group-last:border-0">
                  <p className="text-xs font-black text-slate-800 leading-tight">
                    {act.user?.name || 'النظام'} <span className="font-medium text-slate-400 capitalize">{act.action.replace('_', ' ')}</span>
                  </p>
                  <p className="text-[10px] text-slate-400 font-bold mt-1 uppercase tracking-widest">
                    {new Date(act.created_at).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <div className="p-8 bg-slate-50/50">
            <button className="w-full py-3 bg-white border border-slate-200 rounded-2xl text-[10px] font-black uppercase tracking-widest text-slate-500 hover:bg-slate-100 transition-all">تصدير سجل النشاط</button>
          </div>
        </div>
      </div>
    </div>
  );
}
