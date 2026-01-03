"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function PurchasesPage() {
    const [view, setView] = useState<"pos" | "vendors">("pos");
    const [pos, setPos] = useState<any[]>([]);
    const [vendors, setVendors] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);

    // Modals
    const [showPOModal, setShowPOModal] = useState(false);
    const [showVendorModal, setShowVendorModal] = useState(false);

    const [vendorForm, setVendorForm] = useState({ name: "", contact_name: "", email: "", phone: "" });
    const [poForm, setPOForm] = useState({ vendor_id: "", items: [] as any[], notes: "", status: "draft" });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const [posRes, venRes, prodRes] = await Promise.all([
                axios.get(`${API_URL}/api/purchases`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/api/purchases/vendors`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/api/products`, { headers: { Authorization: `Bearer ${token}` } }),
            ]);
            setPos(posRes.data.purchase_orders || []);
            setVendors(venRes.data.vendors || []);
            setProducts(prodRes.data.products || []);
        } catch (err) {
            console.error("Fetch failed", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => { fetchData(); }, [fetchData]);

    const handleCreateVendor = async () => {
        if (!vendorForm.name) return alert("الاسم مطلوب");
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_URL}/api/purchases/vendors`, vendorForm, { headers: { Authorization: `Bearer ${token}` } });
            setShowVendorModal(false);
            setVendorForm({ name: "", contact_name: "", email: "", phone: "" });
            fetchData();
        } catch (err) { alert("فشل الحفظ"); }
    };

    const addProductToPO = (prodId: string) => {
        const p = products.find(x => x.id === prodId);
        if (!p) return;
        setPOForm(prev => ({
            ...prev,
            items: [...prev.items, { product_id: p.id, name: p.name, quantity: 1, unit_cost: Number(p.cost_price || 0) }]
        }));
    };

    const handleCreatePO = async () => {
        if (!poForm.vendor_id || poForm.items.length === 0) return alert("يرجى اختيار مورد ومنتجات");
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_URL}/api/purchases`, poForm, { headers: { Authorization: `Bearer ${token}` } });
            setShowPOModal(false);
            setPOForm({ vendor_id: "", items: [], notes: "", status: "draft" });
            fetchData();
        } catch (err) { alert("فشل إنشاء الطلب"); }
    };

    return (
        <div className="min-h-screen bg-slate-50/30 p-6 md:p-10">
            <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-10 gap-4">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">إدارة المشتريات والموردين</h1>
                    <p className="text-slate-500 font-medium">تتبع طلبيات Refill المخزون والتعامل مع الشركات الموردة</p>
                </div>
                <div className="flex gap-4">
                    <button
                        onClick={() => setView(view === "pos" ? "vendors" : "pos")}
                        className="px-6 py-4 rounded-2xl bg-white border border-slate-200 text-sm font-black text-slate-600 shadow-sm transition-all active:scale-95"
                    >
                        {view === "pos" ? "عرض الموردين 👥" : "عرض طلبيات الشراء 🚛"}
                    </button>
                    <button
                        onClick={() => view === "pos" ? setShowPOModal(true) : setShowVendorModal(true)}
                        className="bg-slate-900 text-white px-8 py-4 rounded-2xl shadow-xl shadow-slate-200 hover:scale-[1.02] active:scale-95 transition-all font-black"
                    >
                        {view === "pos" ? "+ أمر شراء جديد" : "+ إضافة مورد جديد"}
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="py-32 text-center text-slate-400 font-bold">جاري تحميل البيانات...</div>
            ) : view === "pos" ? (
                <div className="grid grid-cols-1 gap-6">
                    {pos.map(po => (
                        <div key={po.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 flex flex-col md:flex-row justify-between gap-6 group">
                            <div className="flex-1">
                                <div className="flex items-center gap-3 mb-4">
                                    <span className="h-2 w-2 rounded-full bg-blue-500"></span>
                                    <span className="text-[10px] font-black text-slate-400 uppercase tracking-widest">طلب رقم #{po.id.slice(0, 8)}</span>
                                    <span className={`px-3 py-1 rounded-lg text-[9px] font-black uppercase ${po.status === 'received' ? 'bg-emerald-50 text-emerald-600' : 'bg-amber-50 text-amber-600'
                                        }`}>{po.status === 'received' ? 'تم الاستلام' : 'قيد الانتظار'}</span>
                                </div>
                                <h3 className="text-xl font-black text-slate-900 mb-2">المورد: {po.vendor?.name}</h3>
                                <div className="flex flex-wrap gap-2">
                                    {po.items?.map((it: any, i: number) => (
                                        <span key={i} className="text-[10px] font-bold bg-slate-50 text-slate-500 px-3 py-1 rounded-full border border-slate-100">
                                            {it.product?.name} ({it.quantity} قطعة)
                                        </span>
                                    ))}
                                </div>
                            </div>
                            <div className="text-right flex flex-col justify-center border-t md:border-t-0 md:border-r border-slate-50 pt-6 md:pt-0 md:pr-10">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">إجمالي التكلفة</p>
                                <p className="text-3xl font-black text-slate-900">{Number(po.total_amount).toLocaleString()} <span className="text-sm opacity-30">JOD</span></p>
                                <p className="text-[10px] text-slate-400 mt-2 font-bold">{new Date(po.created_at).toLocaleDateString("ar-EG")}</p>
                            </div>
                        </div>
                    ))}
                    {pos.length === 0 && <div className="text-center py-20 text-slate-300 italic">لا توجد سجلات مشتريات</div>}
                </div>
            ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {vendors.map(v => (
                        <div key={v.id} className="bg-white p-8 rounded-[2.5rem] border border-slate-100 shadow-xl shadow-slate-200/40 hover:border-brand-blue transition-all">
                            <div className="h-14 w-14 rounded-2xl bg-indigo-50 text-indigo-500 flex items-center justify-center text-2xl mb-6">🏬</div>
                            <h3 className="text-xl font-black text-slate-900 mb-2">{v.name}</h3>
                            <div className="space-y-3">
                                <div className="flex items-center gap-3 text-slate-500">
                                    <span className="text-sm">👤</span>
                                    <span className="text-xs font-bold">{v.contact_name || "بدون اسم تواصل"}</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-500">
                                    <span className="text-sm">📱</span>
                                    <span className="text-xs font-bold">{v.phone || "بدون هاتف"}</span>
                                </div>
                                <div className="flex items-center gap-3 text-slate-500">
                                    <span className="text-sm">📧</span>
                                    <span className="text-xs font-bold truncate">{v.email || "بدون بريد"}</span>
                                </div>
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* PO Modal */}
            {showPOModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden flex flex-col md:flex-row max-h-[90vh]">
                        <div className="flex-1 p-10 overflow-y-auto no-scrollbar">
                            <h3 className="text-2xl font-black text-slate-900 mb-6">إنشاء طلب شراء</h3>
                            <div className="grid grid-cols-1 gap-4">
                                <label className="text-[10px] font-black text-slate-400 uppercase px-1">اختر المورد</label>
                                <select
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:border-brand-blue font-bold appearance-none mb-6"
                                    value={poForm.vendor_id}
                                    onChange={e => setPOForm({ ...poForm, vendor_id: e.target.value })}
                                >
                                    <option value="">-- اختر مورد من القائمة --</option>
                                    {vendors.map(v => <option key={v.id} value={v.id}>{v.name}</option>)}
                                </select>

                                <label className="text-[10px] font-black text-slate-400 uppercase px-1">إضافة أصناف للطلب</label>
                                <div className="grid grid-cols-2 gap-3 mb-6">
                                    {products.map(p => (
                                        <button key={p.id} onClick={() => addProductToPO(p.id)} className="p-4 bg-slate-50 rounded-2xl border border-slate-100 text-right hover:border-brand-blue transition-all">
                                            <p className="font-black text-sm text-slate-800">{p.name}</p>
                                            <p className="text-[10px] text-slate-400 font-bold mt-1">ت. الشراء: {p.cost_price} JOD</p>
                                        </button>
                                    ))}
                                </div>

                                <label className="text-[10px] font-black text-slate-400 uppercase px-1">ملاحظات إضافية</label>
                                <textarea className="w-full bg-slate-50 border border-slate-100 rounded-[2rem] px-5 py-4 min-h-[100px] outline-none" placeholder="أي تفاصيل للشحن أو الدفع..." value={poForm.notes} onChange={e => setPOForm({ ...poForm, notes: e.target.value })}></textarea>
                            </div>
                        </div>
                        <div className="w-full md:w-80 bg-slate-50 p-10 border-r border-slate-100 flex flex-col">
                            <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-6">ملخص المشتريات</h4>
                            <div className="flex-1 overflow-y-auto space-y-3 mb-6">
                                {poForm.items.map((it, idx) => (
                                    <div key={idx} className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm relative group">
                                        <button className="absolute top-1 right-1 text-slate-300 hover:text-red-500 opacity-0 group-hover:opacity-100 transition-opacity" onClick={() => setPOForm({ ...poForm, items: poForm.items.filter((_, i) => i !== idx) })}>✕</button>
                                        <p className="text-xs font-black text-slate-800">{it.name}</p>
                                        <div className="flex justify-between items-center mt-2">
                                            <input type="number" min="1" className="w-16 bg-slate-50 border-none rounded-lg p-1 text-xs font-black" value={it.quantity} onChange={(e) => {
                                                const newItems = [...poForm.items];
                                                newItems[idx].quantity = Number(e.target.value);
                                                setPOForm({ ...poForm, items: newItems });
                                            }} />
                                            <span className="text-[10px] font-bold text-slate-400">{it.unit_cost * it.quantity} JOD</span>
                                        </div>
                                    </div>
                                ))}
                                {poForm.items.length === 0 && <p className="text-center text-slate-300 text-xs italic mt-10">القائمة فارغة</p>}
                            </div>
                            <div className="pt-6 border-t border-slate-200">
                                <div className="flex justify-between items-center mb-6">
                                    <span className="text-sm font-black text-slate-400">الإجمالي:</span>
                                    <span className="text-2xl font-black text-slate-900">{poForm.items.reduce((acc, x) => acc + (x.quantity * x.unit_cost), 0).toLocaleString()} JOD</span>
                                </div>
                                <div className="flex flex-col gap-2">
                                    <button onClick={handleCreatePO} className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-black transition-all">تأكيد الطلب 🚛</button>
                                    <button onClick={() => setShowPOModal(false)} className="w-full bg-white border border-slate-200 text-slate-500 py-3 rounded-2xl font-black text-xs">إلغاء</button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}

            {/* Vendor Modal */}
            {showVendorModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-lg rounded-[3rem] shadow-2xl p-10 animate-in zoom-in-95 duration-200">
                        <h3 className="text-2xl font-black text-slate-900 mb-8">إضافة مورد جديد</h3>
                        <div className="space-y-5">
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">اسم المورد / الشركة *</label>
                                <input className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:border-brand-blue font-bold" value={vendorForm.name} onChange={e => setVendorForm({ ...vendorForm, name: e.target.value })} placeholder="مثال: شركة التوريدات التقنية" />
                            </div>
                            <div className="grid grid-cols-2 gap-4">
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">اسم المسؤول</label>
                                    <input className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:border-brand-blue font-bold" value={vendorForm.contact_name} onChange={e => setVendorForm({ ...vendorForm, contact_name: e.target.value })} />
                                </div>
                                <div>
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">رقم الهاتف</label>
                                    <input className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:border-brand-blue font-bold" value={vendorForm.phone} onChange={e => setVendorForm({ ...vendorForm, phone: e.target.value })} />
                                </div>
                            </div>
                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">البريد الإلكتروني</label>
                                <input className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:border-brand-blue font-bold" value={vendorForm.email} onChange={e => setVendorForm({ ...vendorForm, email: e.target.value })} />
                            </div>
                        </div>
                        <div className="mt-10 flex gap-4">
                            <button onClick={handleCreateVendor} className="flex-1 bg-brand-blue text-white py-4 rounded-2xl font-black shadow-xl shadow-blue-200 hover:bg-blue-600 transition-all font-black">حفظ المورد ✅</button>
                            <button onClick={() => setShowVendorModal(false)} className="flex-1 bg-slate-50 text-slate-500 py-4 rounded-2xl font-black">إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
