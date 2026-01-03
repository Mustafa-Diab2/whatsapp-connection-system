"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Order {
    id: string;
    order_number: number;
    customer?: { name: string; phone: string };
    total_amount: number;
    status: string;
    payment_status: string;
    invoice_id?: string;
    created_at: string;
    items?: any[];
}

export default function OrdersPage() {
    const [orders, setOrders] = useState<Order[]>([]);
    const [loading, setLoading] = useState(true);
    const [showModal, setShowModal] = useState(false);
    const [customers, setCustomers] = useState<any[]>([]);
    const [products, setProducts] = useState<any[]>([]);

    // New Order State
    const [newOrder, setNewOrder] = useState({
        customerId: "",
        items: [] as any[],
        status: "pending",
        payment_status: "unpaid",
        notes: ""
    });

    const fetchData = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const [oRes, cRes, pRes] = await Promise.all([
                axios.get(`${API_URL}/api/orders`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/api/customers`, { headers: { Authorization: `Bearer ${token}` } }),
                axios.get(`${API_URL}/api/products`, { headers: { Authorization: `Bearer ${token}` } })
            ]);
            setOrders(oRes.data.orders || []);
            setCustomers(cRes.data.customers || []);
            setProducts(pRes.data.products || []);
        } catch (err) {
            console.error("Fetch failed", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const addProductToOrder = (productId: string) => {
        const product = products.find(p => p.id === productId);
        if (!product) return;

        setNewOrder(prev => {
            const existing = prev.items.find(i => i.product_id === productId);
            if (existing) {
                return {
                    ...prev,
                    items: prev.items.map(i => i.product_id === productId ? { ...i, quantity: i.quantity + 1 } : i)
                };
            }
            return {
                ...prev,
                items: [...prev.items, { product_id: productId, name: product.name, unit_price: product.price, quantity: 1 }]
            };
        });
    };

    const handleCreateOrder = async () => {
        if (newOrder.items.length === 0) return alert("يرجى إضافة منتجات للطلب");
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_URL}/api/orders`, {
                customer_id: newOrder.customerId || undefined,
                items: newOrder.items,
                status: newOrder.status,
                payment_status: newOrder.payment_status,
                notes: newOrder.notes
            }, { headers: { Authorization: `Bearer ${token}` } });

            setShowModal(false);
            setNewOrder({ customerId: "", items: [], status: "pending", payment_status: "unpaid", notes: "" });
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.error || "فشل إنشاء الطلب");
        }
    };

    const handleCreateInvoice = async (orderId: string) => {
        try {
            const token = localStorage.getItem("token");
            await axios.post(`${API_URL}/api/invoices`, { order_id: orderId }, {
                headers: { Authorization: `Bearer ${token}` }
            });
            alert("تم إنشاء الفاتورة وإرسالها عبر واتساب بنجاح ✅");
            fetchData();
        } catch (err: any) {
            alert(err.response?.data?.error || "فشل إنشاء الفاتورة");
        }
    };

    const calculateTotal = () => newOrder.items.reduce((sum, i) => sum + (i.unit_price * i.quantity), 0);

    const getStatusBadge = (status: string) => {
        const map: any = {
            pending: "bg-amber-100 text-amber-700",
            processing: "bg-blue-100 text-blue-700",
            shipped: "bg-purple-100 text-purple-700",
            delivered: "bg-green-100 text-green-700",
            cancelled: "bg-red-100 text-red-700",
        };
        return map[status] || "bg-slate-100";
    };

    return (
        <div className="min-h-screen bg-slate-50/50 p-6 md:p-8">
            {/* Header */}
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">المبيعات والطلبيات</h1>
                    <p className="text-slate-500 font-medium">تتبع المبيعات وتعامل مع طلبات العملاء</p>
                </div>
                <button
                    onClick={() => setShowModal(true)}
                    className="btn bg-brand-blue text-white px-8 py-4 rounded-2xl shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all font-black flex items-center gap-2"
                >
                    <span className="text-xl">+</span>
                    طلب بيع جديد
                </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: "طلبات اليوم", value: orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length, icon: "🛒", color: "blue" },
                    { label: "قيد المعالجة", value: orders.filter(o => o.status === 'processing').length, icon: "⚙️", color: "amber" },
                    { label: "إجمالي المبيعات", value: `${orders.reduce((acc, o) => acc + Number(o.total_amount), 0).toLocaleString()} JOD`, icon: "💰", color: "green" },
                    { label: "غير مدفوعة", value: orders.filter(o => o.payment_status === 'unpaid').length, icon: "💳", color: "red" },
                ].map((stat, i) => (
                    <div key={i} className="bg-white p-6 rounded-3xl border border-slate-100 shadow-sm flex items-center gap-4">
                        <div className={`h-12 w-12 rounded-2xl bg-${stat.color}-50 flex items-center justify-center text-xl`}>{stat.icon}</div>
                        <div>
                            <p className="text-[10px] font-black uppercase text-slate-400 tracking-widest leading-none mb-1">{stat.label}</p>
                            <p className="text-xl font-black text-slate-900">{stat.value}</p>
                        </div>
                    </div>
                ))}
            </div>

            {/* Orders Table */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">رقم الطلب</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">العميل</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">التاريخ</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">المبلغ الإجمالي</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">الحالة</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">الدفع</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">الفاتورة</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan={6} className="p-20 text-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent mx-auto"></div></td></tr>
                            ) : orders.map(order => (
                                <tr key={order.id} className="hover:bg-slate-50/80 transition-colors group cursor-pointer">
                                    <td className="px-8 py-5">
                                        <span className="font-black text-slate-900">#{order.order_number}</span>
                                    </td>
                                    <td className="px-8 py-5">
                                        <p className="font-bold text-slate-700 leading-none">{order.customer?.name || "عميل نقدي"}</p>
                                        <p className="text-[10px] text-slate-400 mt-1">{order.customer?.phone || ""}</p>
                                    </td>
                                    <td className="px-8 py-5 text-sm text-slate-500 font-medium">{new Date(order.created_at).toLocaleDateString("ar-EG")}</td>
                                    <td className="px-8 py-5 font-black text-brand-blue">{Number(order.total_amount).toLocaleString()} <span className="text-[10px] opacity-60">JOD</span></td>
                                    <td className="px-8 py-5">
                                        <span className={`px-4 py-1.5 rounded-full text-[10px] font-black uppercase tracking-wide ${getStatusBadge(order.status)}`}>
                                            {order.status === 'pending' ? 'قيد الانتظار' : order.status === 'processing' ? 'قيد المعالجة' : order.status === 'delivered' ? 'تم التوصيل' : order.status}
                                        </span>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className={`h-2 w-2 inline-block rounded-full ml-2 ${order.payment_status === 'paid' ? 'bg-green-500' : 'bg-red-500'}`}></span>
                                        <span className="text-xs font-bold text-slate-600">{order.payment_status === 'paid' ? 'تم الدفع' : 'غير مدفوع'}</span>
                                    </td>
                                    <td className="px-8 py-5">
                                        {(order as any).invoices && (order as any).invoices.length > 0 ? (
                                            <span className="text-[10px] font-black text-emerald-600 bg-emerald-50 px-3 py-1 rounded-lg">قيد التحصيل</span>
                                        ) : (
                                            <button
                                                onClick={(e) => { e.stopPropagation(); handleCreateInvoice(order.id); }}
                                                className="text-[10px] font-black text-brand-blue hover:underline"
                                            >
                                                + إصدار فاتورة
                                            </button>
                                        )}
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* New Order Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-4xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200 flex flex-col max-h-[90vh]">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">إنشاء طلب بيع جديد</h3>
                                <p className="text-sm text-slate-500 font-medium">اختر المنتجات والعميل لإتمام العملية</p>
                            </div>
                            <button onClick={() => setShowModal(false)} className="h-10 w-10 text-slate-400">✕</button>
                        </div>

                        <div className="flex-1 overflow-hidden flex flex-col md:flex-row divide-x divide-x-reverse divide-slate-100">
                            {/* Products Side */}
                            <div className="flex-1 p-8 overflow-y-auto no-scrollbar">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">قائمة المنتجات</h4>
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                                    {products.map(p => (
                                        <button
                                            key={p.id}
                                            onClick={() => addProductToOrder(p.id)}
                                            className="p-4 rounded-2xl border border-slate-100 bg-slate-50 text-right hover:border-brand-blue hover:bg-white transition-all group"
                                            disabled={p.stock_quantity === 0}
                                        >
                                            <p className="font-black text-slate-800 line-clamp-1">{p.name}</p>
                                            <p className="text-xs font-bold text-brand-blue mt-1">{p.price} JOD</p>
                                            <p className={`text-[9px] mt-1 ${p.stock_quantity > 0 ? 'text-slate-400' : 'text-red-400 font-bold'}`}>
                                                المخزون: {p.stock_quantity}
                                            </p>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Summary Side */}
                            <div className="w-full md:w-80 bg-slate-50/30 p-8 flex flex-col">
                                <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4">ملخص الطلب</h4>

                                <div className="mb-6">
                                    <label className="text-[10px] font-black text-slate-400 mb-2 block">العميل</label>
                                    <select
                                        className="w-full bg-white border border-slate-200 rounded-xl px-4 py-3 outline-none focus:border-brand-blue"
                                        value={newOrder.customerId}
                                        onChange={(e) => setNewOrder({ ...newOrder, customerId: e.target.value })}
                                    >
                                        <option value="">عميل نقدي</option>
                                        {customers.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                                    </select>
                                </div>

                                <div className="flex-1 overflow-y-auto space-y-3 mb-6 pr-2">
                                    {newOrder.items.map((item, idx) => (
                                        <div key={idx} className="bg-white p-3 rounded-xl border border-slate-100 flex justify-between items-center">
                                            <div>
                                                <p className="text-xs font-black text-slate-800">{item.name}</p>
                                                <p className="text-[10px] text-slate-400">{item.quantity} × {item.unit_price} JOD</p>
                                            </div>
                                            <button
                                                onClick={() => setNewOrder({ ...newOrder, items: newOrder.items.filter((_, i) => i !== idx) })}
                                                className="text-red-300 hover:text-red-500"
                                            >✕</button>
                                        </div>
                                    ))}
                                    {newOrder.items.length === 0 && <p className="text-center text-slate-300 text-xs italic mt-10"> السلة فارغة</p>}
                                </div>

                                <div className="pt-6 border-t border-slate-200">
                                    <div className="flex justify-between items-center mb-6">
                                        <span className="text-sm font-black text-slate-500">الإجمالي:</span>
                                        <span className="text-2xl font-black text-slate-900">{calculateTotal().toLocaleString()} JOD</span>
                                    </div>
                                    <button
                                        onClick={handleCreateOrder}
                                        disabled={newOrder.items.length === 0}
                                        className="w-full bg-slate-900 text-white py-4 rounded-2xl font-black shadow-xl hover:bg-black transition-all disabled:opacity-50 active:scale-95"
                                    >
                                        إتمام الطلب ✅
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
