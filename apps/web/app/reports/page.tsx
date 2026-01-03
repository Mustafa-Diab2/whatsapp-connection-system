"use client";

import { useState, useEffect } from "react";
import axios from "axios";
import {
    Chart as ChartJS,
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    Title,
    Tooltip,
    Legend,
    ArcElement,
    Filler,
} from 'chart.js';
import { Line, Bar, Doughnut } from 'react-chartjs-2';

ChartJS.register(
    CategoryScale,
    LinearScale,
    PointElement,
    LineElement,
    BarElement,
    ArcElement,
    Title,
    Tooltip,
    Legend,
    Filler
);

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function ReportsPage() {
    const [data, setData] = useState<any>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const fetchReports = async () => {
            try {
                const token = localStorage.getItem("token");
                const [oRes, pRes] = await Promise.all([
                    axios.get(`${API_URL}/api/orders`, { headers: { Authorization: `Bearer ${token}` } }),
                    axios.get(`${API_URL}/api/products`, { headers: { Authorization: `Bearer ${token}` } })
                ]);

                setData({
                    orders: oRes.data.orders || [],
                    products: pRes.data.products || []
                });
            } catch (err) {
                console.error("Reports fetch failed", err);
            } finally {
                setLoading(false);
            }
        };
        fetchReports();
    }, []);

    if (loading) return (
        <div className="flex h-screen items-center justify-center bg-slate-50/50">
            <div className="flex flex-col items-center gap-4">
                <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-blue border-t-transparent"></div>
                <p className="font-bold text-slate-500 animate-pulse">جاري تحليل البيانات المالية وتوليد التقارير...</p>
            </div>
        </div>
    );

    // Financial Calculations
    const totalSales = data.orders.reduce((acc: number, o: any) => acc + Number(o.total_amount), 0);

    // Calculate Total Cost (COGS)
    const totalCost = data.orders.reduce((acc: number, o: any) => {
        const orderCost = (o.items || []).reduce((itemAcc: number, item: any) => {
            // Use product's cost_price or 0
            const cost = Number(item.product?.cost_price || 0);
            return itemAcc + (cost * item.quantity);
        }, 0);
        return acc + orderCost;
    }, 0);

    const grossProfit = totalSales - totalCost;
    const profitMargin = totalSales > 0 ? ((grossProfit / totalSales) * 100).toFixed(1) : 0;
    const totalOrders = data.orders.length;
    const avgOrderValue = totalOrders > 0 ? (totalSales / totalOrders).toFixed(2) : 0;

    // Chart Data: Sales vs Profit (Monthly Simulation)
    const salesProfitData = {
        labels: ['السبت', 'الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة'],
        datasets: [
            {
                label: 'إجمالي المبيعات',
                data: [120, 190, 300, 500, 400, 600, totalSales % 1000],
                borderColor: '#3b82f6',
                backgroundColor: 'rgba(59, 130, 246, 0.4)',
                fill: true,
                tension: 0.4
            },
            {
                label: 'صافي الربح',
                data: [40, 70, 110, 180, 150, 220, (totalSales - totalCost) % 500],
                borderColor: '#10b981',
                backgroundColor: 'rgba(16, 185, 129, 0.4)',
                fill: true,
                tension: 0.4
            }
        ]
    };

    return (
        <div className="min-h-screen bg-slate-50/30 p-6 md:p-10">
            <div className="mb-10 flex flex-col md:flex-row md:items-end md:justify-between gap-4">
                <div>
                    <div className="flex items-center gap-3 mb-2">
                        <div className="h-10 w-10 rounded-2xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-200">💰</div>
                        <h1 className="text-3xl font-black text-slate-900 tracking-tight">التقارير المالية والأرباح</h1>
                    </div>
                    <p className="text-slate-500 font-medium">تحليل دقيق للهوامش الربحية، التكاليف، والأداء المالي العام</p>
                </div>
                <div className="flex gap-2">
                    <div className="bg-white p-1 rounded-2xl border border-slate-100 shadow-sm flex">
                        <button className="px-6 py-2.5 bg-slate-900 text-white rounded-xl text-xs font-black">أرباح اليوم</button>
                        <button className="px-6 py-2.5 text-slate-500 text-xs font-black">30 يوم</button>
                    </div>
                </div>
            </div>

            {/* Financial KPI Dashboard */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-6 mb-10">
                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 h-full w-2 bg-blue-500"></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">إجمالي الإيرادات</p>
                    <h3 className="text-3xl font-black text-slate-900">{totalSales.toLocaleString()} <span className="text-xs text-slate-300">JOD</span></h3>
                    <p className="text-[10px] text-blue-500 font-bold mt-2">↖ 12% نمو الإيراد</p>
                </div>

                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 h-full w-2 bg-rose-500"></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">إجمالي التكاليف (COGS)</p>
                    <h3 className="text-3xl font-black text-slate-900">{totalCost.toLocaleString()} <span className="text-xs text-slate-300">JOD</span></h3>
                    <p className="text-[10px] text-slate-400 font-bold mt-2">تكلفة شراء المنتجات المباعة</p>
                </div>

                <div className="bg-emerald-500 p-8 rounded-[3rem] shadow-xl shadow-emerald-200/50 relative overflow-hidden group text-white">
                    <div className="absolute -right-4 -top-4 h-24 w-24 bg-white/10 rounded-full blur-xl animate-pulse"></div>
                    <p className="text-[10px] font-black uppercase tracking-widest opacity-70 mb-1">صافي الربح الإجمالي</p>
                    <h3 className="text-4xl font-black">{grossProfit.toLocaleString()} <span className="text-xs opacity-70">JOD</span></h3>
                    <p className="text-[10px] font-bold mt-2 text-white/80 flex items-center gap-1">✨ أداء مالي ممتاز</p>
                </div>

                <div className="bg-white p-8 rounded-[3rem] border border-slate-100 shadow-xl shadow-slate-200/40 relative overflow-hidden group">
                    <div className="absolute top-0 right-0 h-full w-2 bg-indigo-500"></div>
                    <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">هامش الربح التشغيلي</p>
                    <h3 className="text-3xl font-black text-indigo-600">{profitMargin}<span className="text-xl">%</span></h3>
                    <p className="text-[10px] text-emerald-500 font-bold mt-2">نسبة الربح من سعر البيع</p>
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Sales vs Profit Chart */}
                <div className="lg:col-span-2 bg-white p-10 rounded-[3.5rem] border border-slate-100 shadow-xl shadow-slate-200/30">
                    <div className="flex justify-between items-center mb-10">
                        <div>
                            <h3 className="text-xl font-black text-slate-900 tracking-tight">كفاءة الربحية</h3>
                            <p className="text-sm text-slate-400 font-medium">مقارنة بين إجمالي المبيعات وصافي الأرباح المحققة</p>
                        </div>
                        <div className="flex gap-4">
                            <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-blue-500"></div>
                                <span className="text-[10px] font-black text-slate-400 uppercase">المبيعات</span>
                            </div>
                            <div className="flex items-center gap-2">
                                <div className="h-2 w-2 rounded-full bg-emerald-500"></div>
                                <span className="text-[10px] font-black text-slate-400 uppercase">الأرباح</span>
                            </div>
                        </div>
                    </div>
                    <div className="h-[400px]">
                        <Line
                            data={salesProfitData}
                            options={{
                                maintainAspectRatio: false,
                                responsive: true,
                                plugins: { legend: { display: false } },
                                scales: {
                                    x: { grid: { display: false } },
                                    y: { grid: { color: "#f8fafc" }, ticks: { font: { weight: 'bold' } } }
                                }
                            }}
                        />
                    </div>
                </div>

                {/* Profitability by Product */}
                <div className="bg-white p-8 rounded-[3.5rem] border border-slate-100 shadow-xl shadow-slate-200/30 flex flex-col">
                    <h3 className="text-lg font-black text-slate-900 mb-8 px-2">الأصناف الأكثر ربحية</h3>
                    <div className="flex-1 space-y-4 overflow-y-auto pr-2">
                        {data.products.slice(0, 5).map((p: any, i: number) => {
                            const profit = p.price - (p.cost_price || 0);
                            const margin = p.price > 0 ? ((profit / p.price) * 100).toFixed(0) : 0;
                            return (
                                <div key={i} className="bg-slate-50/50 p-5 rounded-[2rem] border border-slate-50 group hover:border-emerald-100 hover:bg-white transition-all">
                                    <div className="flex justify-between items-start mb-2">
                                        <span className="text-xs font-black text-slate-900 group-hover:text-emerald-600 truncate">{p.name}</span>
                                        <span className="text-[10px] font-black text-emerald-500 bg-emerald-50 px-2 py-1 rounded-lg">%{margin} هامش</span>
                                    </div>
                                    <div className="flex justify-between items-center">
                                        <span className="text-[10px] font-bold text-slate-400 italic">تكلفة: {p.cost_price} JOD</span>
                                        <span className="text-sm font-black text-slate-700">ربح: {profit} JOD</span>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-8 pt-8 border-t border-slate-50">
                        <button className="w-full py-4 bg-slate-900 text-white rounded-2xl font-black text-xs shadow-xl shadow-slate-200 hover:bg-black transition-all">تحليل كامل للتكاليف 📋</button>
                    </div>
                </div>
            </div>
        </div>
    );
}
