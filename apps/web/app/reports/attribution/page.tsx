"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface AttributionReport {
    campaign_id: string;
    campaign_name: string;
    source_type: string;
    total_clicks: number;
    total_conversions: number;
    conversion_rate: number;
}

interface Campaign {
    id: string;
    name: string;
    status: string;
    impressions: number;
    clicks: number;
    spend: number;
    last_synced_at: string;
}

interface TrackingStats {
    total_links: number;
    total_clicks: number;
    total_conversions: number;
    overall_conversion_rate: number;
}

interface DailyClick {
    date: string;
    clicks: number;
    conversions: number;
}

export default function AttributionPage() {
    const [loading, setLoading] = useState(true);
    const [attributionData, setAttributionData] = useState<AttributionReport[]>([]);
    const [campaigns, setCampaigns] = useState<Campaign[]>([]);
    const [stats, setStats] = useState<TrackingStats | null>(null);
    const [dailyClicks, setDailyClicks] = useState<DailyClick[]>([]);
    const [dateRange, setDateRange] = useState("30"); // days
    const [error, setError] = useState<string | null>(null);

    const fetchData = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const token = localStorage.getItem("token");
            const headers = { Authorization: `Bearer ${token}` };

            const [statsRes, reportRes, campaignsRes] = await Promise.all([
                axios.get(`${API_URL}/api/facebook/stats`, { headers }),
                axios.get(`${API_URL}/api/facebook/attribution-report`, { headers }),
                axios.get(`${API_URL}/api/facebook/campaigns`, { headers }),
            ]);

            setStats(statsRes.data);
            setAttributionData(reportRes.data.report || []);
            setCampaigns(campaignsRes.data.campaigns || []);

            // Generate mock daily data for chart (in real app, this would come from API)
            const days = parseInt(dateRange);
            const daily: DailyClick[] = [];
            for (let i = days - 1; i >= 0; i--) {
                const date = new Date();
                date.setDate(date.getDate() - i);
                daily.push({
                    date: date.toLocaleDateString('ar-EG', { month: 'short', day: 'numeric' }),
                    clicks: Math.floor(Math.random() * 50) + 10,
                    conversions: Math.floor(Math.random() * 10) + 1,
                });
            }
            setDailyClicks(daily);
        } catch (err: any) {
            console.error("Failed to fetch attribution data", err);
            setError(err.response?.data?.error || "فشل تحميل البيانات");
        } finally {
            setLoading(false);
        }
    }, [dateRange]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const formatNumber = (num: number) => {
        return new Intl.NumberFormat('ar-EG').format(num);
    };

    const formatMoney = (num: number) => {
        return new Intl.NumberFormat('ar-EG', { style: 'currency', currency: 'EGP' }).format(num);
    };

    const getSourceIcon = (source: string) => {
        switch (source) {
            case 'facebook_ad': return '📢';
            case 'tracking_link': return '🔗';
            case 'ctwa': return '💬';
            case 'organic': return '🌱';
            default: return '❓';
        }
    };

    const getSourceLabel = (source: string) => {
        switch (source) {
            case 'facebook_ad': return 'إعلانات فيسبوك';
            case 'tracking_link': return 'رابط تتبع';
            case 'ctwa': return 'Click to WhatsApp';
            case 'organic': return 'طبيعي';
            default: return source;
        }
    };

    if (loading) {
        return (
            <div className="h-screen flex items-center justify-center bg-slate-50">
                <div className="text-center">
                    <div className="h-12 w-12 animate-spin rounded-full border-4 border-brand-blue border-t-transparent mx-auto mb-4"></div>
                    <p className="text-slate-500 font-medium">جاري تحميل تقارير الإسناد...</p>
                </div>
            </div>
        );
    }

    return (
        <div className="h-screen overflow-hidden flex flex-col bg-slate-50/30">
            {/* Header */}
            <div className="bg-white border-b border-slate-200 px-8 py-5 flex justify-between items-center">
                <div>
                    <div className="flex items-center gap-2 mb-1">
                        <span className="text-2xl">📊</span>
                        <h1 className="text-2xl font-black text-slate-900 tracking-tight">تقارير الإسناد</h1>
                    </div>
                    <p className="text-slate-500 text-sm font-medium">تتبع مصادر العملاء وأداء الحملات الإعلانية</p>
                </div>
                <div className="flex items-center gap-3">
                    <select
                        value={dateRange}
                        onChange={(e) => setDateRange(e.target.value)}
                        className="bg-slate-50 border border-slate-200 rounded-xl px-4 py-2 text-sm font-medium"
                    >
                        <option value="7">آخر 7 أيام</option>
                        <option value="14">آخر 14 يوم</option>
                        <option value="30">آخر 30 يوم</option>
                        <option value="90">آخر 90 يوم</option>
                    </select>
                    <button
                        onClick={fetchData}
                        className="bg-brand-blue text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700 transition-colors"
                    >
                        🔄 تحديث
                    </button>
                </div>
            </div>

            <div className="flex-1 overflow-y-auto p-8 custom-scrollbar">
                {error ? (
                    <div className="bg-red-50 border border-red-200 rounded-2xl p-6 text-center">
                        <p className="text-red-600 font-medium">{error}</p>
                        <button
                            onClick={fetchData}
                            className="mt-4 bg-red-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-red-700"
                        >
                            إعادة المحاولة
                        </button>
                    </div>
                ) : (
                    <div className="max-w-7xl mx-auto space-y-8">
                        {/* Stats Cards */}
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
                            <div className="bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50 border-l-4 border-l-blue-500">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-2xl">🔗</span>
                                    <span className="text-xs font-bold bg-blue-100 text-blue-700 px-2 py-1 rounded-full">روابط</span>
                                </div>
                                <p className="text-3xl font-black text-slate-900">{formatNumber(stats?.total_links || 0)}</p>
                                <p className="text-sm text-slate-500 font-medium">إجمالي الروابط</p>
                            </div>

                            <div className="bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50 border-l-4 border-l-green-500">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-2xl">👆</span>
                                    <span className="text-xs font-bold bg-green-100 text-green-700 px-2 py-1 rounded-full">نقرات</span>
                                </div>
                                <p className="text-3xl font-black text-slate-900">{formatNumber(stats?.total_clicks || 0)}</p>
                                <p className="text-sm text-slate-500 font-medium">إجمالي النقرات</p>
                            </div>

                            <div className="bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50 border-l-4 border-l-purple-500">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-2xl">🎯</span>
                                    <span className="text-xs font-bold bg-purple-100 text-purple-700 px-2 py-1 rounded-full">تحويلات</span>
                                </div>
                                <p className="text-3xl font-black text-slate-900">{formatNumber(stats?.total_conversions || 0)}</p>
                                <p className="text-sm text-slate-500 font-medium">العملاء المحولون</p>
                            </div>

                            <div className="bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50 border-l-4 border-l-orange-500">
                                <div className="flex items-center justify-between mb-2">
                                    <span className="text-2xl">📈</span>
                                    <span className="text-xs font-bold bg-orange-100 text-orange-700 px-2 py-1 rounded-full">معدل</span>
                                </div>
                                <p className="text-3xl font-black text-slate-900">{(stats?.overall_conversion_rate || 0).toFixed(1)}%</p>
                                <p className="text-sm text-slate-500 font-medium">معدل التحويل</p>
                            </div>
                        </div>

                        {/* Chart - Simple Bar representation */}
                        <div className="bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50">
                            <h2 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                                <span>📉</span> النقرات والتحويلات اليومية
                            </h2>
                            <div className="h-64 flex items-end gap-1 overflow-x-auto pb-4">
                                {dailyClicks.map((day, i) => {
                                    const maxClicks = Math.max(...dailyClicks.map(d => d.clicks));
                                    const clickHeight = (day.clicks / maxClicks) * 180;
                                    const convHeight = (day.conversions / maxClicks) * 180;
                                    
                                    return (
                                        <div key={i} className="flex flex-col items-center min-w-[40px] group">
                                            <div className="flex items-end gap-0.5 h-48">
                                                <div
                                                    className="w-3 bg-blue-400 rounded-t transition-all group-hover:bg-blue-500"
                                                    style={{ height: `${clickHeight}px` }}
                                                    title={`نقرات: ${day.clicks}`}
                                                ></div>
                                                <div
                                                    className="w-3 bg-green-400 rounded-t transition-all group-hover:bg-green-500"
                                                    style={{ height: `${convHeight}px` }}
                                                    title={`تحويلات: ${day.conversions}`}
                                                ></div>
                                            </div>
                                            <span className="text-[9px] text-slate-400 mt-2 rotate-45 origin-left">{day.date}</span>
                                        </div>
                                    );
                                })}
                            </div>
                            <div className="flex justify-center gap-6 mt-4">
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-blue-400 rounded"></div>
                                    <span className="text-xs text-slate-500">النقرات</span>
                                </div>
                                <div className="flex items-center gap-2">
                                    <div className="w-3 h-3 bg-green-400 rounded"></div>
                                    <span className="text-xs text-slate-500">التحويلات</span>
                                </div>
                            </div>
                        </div>

                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                            {/* Attribution by Source */}
                            <div className="bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50">
                                <h2 className="text-lg font-black text-slate-800 mb-6 flex items-center gap-2">
                                    <span>🎯</span> الإسناد حسب المصدر
                                </h2>
                                {attributionData.length === 0 ? (
                                    <div className="text-center py-12">
                                        <span className="text-4xl mb-4 block">📭</span>
                                        <p className="text-slate-500 font-medium">لا توجد بيانات إسناد بعد</p>
                                        <p className="text-xs text-slate-400 mt-1">ستظهر البيانات عندما يتفاعل العملاء مع روابط التتبع</p>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {attributionData.map((item, i) => (
                                            <div key={i} className="p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-3">
                                                        <span className="text-xl">{getSourceIcon(item.source_type)}</span>
                                                        <div>
                                                            <p className="font-bold text-slate-800">{item.campaign_name || 'غير معروف'}</p>
                                                            <p className="text-xs text-slate-500">{getSourceLabel(item.source_type)}</p>
                                                        </div>
                                                    </div>
                                                    <div className="text-left">
                                                        <p className="text-lg font-black text-green-600">{item.conversion_rate?.toFixed(1) || 0}%</p>
                                                        <p className="text-xs text-slate-400">معدل التحويل</p>
                                                    </div>
                                                </div>
                                                <div className="flex gap-4 text-xs text-slate-500">
                                                    <span>👆 {formatNumber(item.total_clicks)} نقرة</span>
                                                    <span>🎯 {formatNumber(item.total_conversions)} تحويل</span>
                                                </div>
                                                {/* Progress bar */}
                                                <div className="mt-2 h-1.5 bg-slate-200 rounded-full overflow-hidden">
                                                    <div 
                                                        className="h-full bg-gradient-to-r from-green-400 to-green-600 rounded-full"
                                                        style={{ width: `${Math.min(item.conversion_rate || 0, 100)}%` }}
                                                    ></div>
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Facebook Campaigns */}
                            <div className="bg-white rounded-2xl p-6 shadow-lg shadow-slate-200/50">
                                <div className="flex items-center justify-between mb-6">
                                    <h2 className="text-lg font-black text-slate-800 flex items-center gap-2">
                                        <span>📢</span> حملات الفيسبوك
                                    </h2>
                                    <a 
                                        href="/integrations/facebook" 
                                        className="text-xs text-blue-600 hover:text-blue-700 font-bold"
                                    >
                                        مزامنة الحملات →
                                    </a>
                                </div>
                                {campaigns.length === 0 ? (
                                    <div className="text-center py-12">
                                        <span className="text-4xl mb-4 block">📊</span>
                                        <p className="text-slate-500 font-medium">لا توجد حملات مُزامنة</p>
                                        <p className="text-xs text-slate-400 mt-1">اربط حسابك الإعلاني من إعدادات فيسبوك</p>
                                        <a
                                            href="/integrations/facebook"
                                            className="inline-block mt-4 bg-blue-600 text-white px-4 py-2 rounded-xl text-sm font-bold hover:bg-blue-700"
                                        >
                                            ربط الحساب الإعلاني
                                        </a>
                                    </div>
                                ) : (
                                    <div className="space-y-3">
                                        {campaigns.slice(0, 5).map((campaign) => (
                                            <div key={campaign.id} className="p-4 bg-slate-50 rounded-xl hover:bg-slate-100 transition-colors">
                                                <div className="flex items-center justify-between mb-2">
                                                    <div className="flex items-center gap-3">
                                                        <div className={`w-2 h-2 rounded-full ${campaign.status === 'ACTIVE' ? 'bg-green-500' : 'bg-slate-400'}`}></div>
                                                        <p className="font-bold text-slate-800 truncate max-w-[180px]">{campaign.name}</p>
                                                    </div>
                                                    <span className={`text-xs font-bold px-2 py-1 rounded-full ${
                                                        campaign.status === 'ACTIVE' 
                                                            ? 'bg-green-100 text-green-700' 
                                                            : 'bg-slate-100 text-slate-500'
                                                    }`}>
                                                        {campaign.status === 'ACTIVE' ? 'نشط' : 'متوقف'}
                                                    </span>
                                                </div>
                                                <div className="grid grid-cols-3 gap-2 text-xs">
                                                    <div className="bg-white rounded-lg p-2 text-center">
                                                        <p className="font-black text-slate-800">{formatNumber(campaign.impressions || 0)}</p>
                                                        <p className="text-slate-400">مشاهدات</p>
                                                    </div>
                                                    <div className="bg-white rounded-lg p-2 text-center">
                                                        <p className="font-black text-slate-800">{formatNumber(campaign.clicks || 0)}</p>
                                                        <p className="text-slate-400">نقرات</p>
                                                    </div>
                                                    <div className="bg-white rounded-lg p-2 text-center">
                                                        <p className="font-black text-slate-800">{formatMoney(campaign.spend || 0)}</p>
                                                        <p className="text-slate-400">إنفاق</p>
                                                    </div>
                                                </div>
                                            </div>
                                        ))}
                                        {campaigns.length > 5 && (
                                            <p className="text-center text-xs text-slate-400 pt-2">
                                                و {campaigns.length - 5} حملات أخرى...
                                            </p>
                                        )}
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Tips Section */}
                        <div className="bg-gradient-to-r from-blue-500 to-purple-600 rounded-2xl p-6 text-white">
                            <h3 className="text-lg font-black mb-4 flex items-center gap-2">
                                <span>💡</span> نصائح لتحسين التتبع
                            </h3>
                            <div className="grid md:grid-cols-3 gap-4">
                                <div className="bg-white/10 rounded-xl p-4">
                                    <p className="font-bold mb-1">1. استخدم روابط التتبع</p>
                                    <p className="text-sm text-white/80">أنشئ روابط مخصصة لكل إعلان لتتبع الأداء بدقة</p>
                                </div>
                                <div className="bg-white/10 rounded-xl p-4">
                                    <p className="font-bold mb-1">2. فعّل Click-to-WhatsApp</p>
                                    <p className="text-sm text-white/80">استخدم إعلانات CTWA للتتبع التلقائي من الفيسبوك</p>
                                </div>
                                <div className="bg-white/10 rounded-xl p-4">
                                    <p className="font-bold mb-1">3. زامن الحملات</p>
                                    <p className="text-sm text-white/80">زامن حملاتك الإعلانية لمقارنة الأداء والتكلفة</p>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
        </div>
    );
}
