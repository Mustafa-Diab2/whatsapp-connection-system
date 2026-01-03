"use client";

import { useState, useEffect, useCallback } from "react";
import axios from "axios";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

interface Product {
    id: string;
    name: string;
    description: string;
    sku: string;
    price: number;
    cost_price: number;
    stock_quantity: number;
    min_stock_level: number;
    category: string;
    image_url: string;
    status: "active" | "archived" | "out_of_stock";
    created_at: string;
}

export default function InventoryPage() {
    const [products, setProducts] = useState<Product[]>([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState("");
    const [selectedCategory, setSelectedCategory] = useState("all");

    // Modal State
    const [showModal, setShowModal] = useState(false);
    const [editingProduct, setEditingProduct] = useState<Product | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [formData, setFormData] = useState({
        name: "",
        description: "",
        sku: "",
        price: 0,
        cost_price: 0,
        stock_quantity: 0,
        min_stock_level: 5,
        category: "عام",
        image_url: "",
        status: "active" as "active" | "archived" | "out_of_stock"
    });

    const fetchProducts = useCallback(async () => {
        setLoading(true);
        try {
            const token = localStorage.getItem("token");
            const res = await axios.get(`${API_URL}/api/products`, {
                headers: { Authorization: `Bearer ${token}` },
                params: {
                    search: searchTerm,
                    category: selectedCategory === "all" ? undefined : selectedCategory
                }
            });
            setProducts(res.data.products || []);
        } catch (error) {
            console.error("Failed to fetch products", error);
        } finally {
            setLoading(false);
        }
    }, [searchTerm, selectedCategory]);

    useEffect(() => {
        fetchProducts();
    }, [fetchProducts]);

    const handleSave = async () => {
        if (!formData.name) return alert("يرجى إدخال اسم المنتج");
        setIsSaving(true);
        try {
            const token = localStorage.getItem("token");
            if (editingProduct) {
                await axios.put(`${API_URL}/api/products/${editingProduct.id}`, formData, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            } else {
                await axios.post(`${API_URL}/api/products`, formData, {
                    headers: { Authorization: `Bearer ${token}` }
                });
            }
            setShowModal(false);
            setEditingProduct(null);
            fetchProducts();
            setFormData({
                name: "", description: "", sku: "", price: 0, cost_price: 0,
                stock_quantity: 0, min_stock_level: 5, category: "عام", image_url: "",
                status: "active" as "active" | "archived" | "out_of_stock"
            });
        } catch (error: any) {
            alert(error.response?.data?.error || "حدث خطأ أثناء الحفظ");
        } finally {
            setIsSaving(false);
        }
    };

    const handleDelete = async (id: string) => {
        if (!confirm("هل أنت متأكد من أرشفة هذا المنتج؟")) return;
        try {
            const token = localStorage.getItem("token");
            await axios.delete(`${API_URL}/api/products/${id}`, {
                headers: { Authorization: `Bearer ${token}` }
            });
            fetchProducts();
        } catch (error) {
            alert("فشل الأرشفة");
        }
    };

    const openEdit = (product: Product) => {
        setEditingProduct(product);
        setFormData({
            name: product.name,
            description: product.description || "",
            sku: product.sku || "",
            price: Number(product.price),
            cost_price: Number(product.cost_price || 0),
            stock_quantity: product.stock_quantity,
            min_stock_level: product.min_stock_level,
            category: product.category || "عام",
            image_url: product.image_url || "",
            status: product.status
        });
        setShowModal(true);
    };

    const categories = ["all", ...Array.from(new Set(products.map(p => p.category || "عام")))];

    return (
        <div className="min-h-screen bg-slate-50/50 p-6 md:p-8">
            {/* Header */}
            <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between mb-8">
                <div>
                    <h1 className="text-3xl font-black text-slate-900 tracking-tight">المخزون والمنتجات</h1>
                    <p className="text-slate-500 font-medium">إدارة التوافر، الأسعار، والمخازن</p>
                </div>
                <button
                    onClick={() => {
                        setEditingProduct(null);
                        setShowModal(true);
                    }}
                    className="btn bg-brand-blue text-white px-8 py-4 rounded-2xl shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all font-black flex items-center gap-2"
                >
                    <span className="text-xl">+</span>
                    إضافة منتج جديد
                </button>
            </div>

            {/* Stats Quick View */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-8">
                {[
                    { label: "إجمالي المنتجات", value: products.length, icon: "📦", color: "blue" },
                    { label: "منخفض المخزون", value: products.filter(p => p.stock_quantity <= p.min_stock_level).length, icon: "⚠️", color: "orange" },
                    { label: "نفذ من المخزون", value: products.filter(p => p.stock_quantity === 0).length, icon: "🚫", color: "red" },
                    { label: "قيمة المخزون", value: `${products.reduce((acc, p) => acc + (p.price * p.stock_quantity), 0).toLocaleString()} JOD`, icon: "💰", color: "green" },
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

            {/* Filters & Search */}
            <div className="bg-white p-4 rounded-3xl border border-slate-100 shadow-sm mb-8 flex flex-col md:flex-row gap-4 items-center">
                <div className="relative flex-1 w-full">
                    <span className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400">🔍</span>
                    <input
                        type="text"
                        placeholder="البحث بالاسم أو الـ SKU..."
                        className="w-full bg-slate-50 border-none rounded-2xl py-4 pr-12 pl-4 focus:ring-2 focus:ring-brand-blue/20 outline-none transition-all font-medium text-slate-700"
                        value={searchTerm}
                        onChange={(e) => setSearchTerm(e.target.value)}
                    />
                </div>
                <div className="flex gap-2 overflow-x-auto w-full md:w-auto pb-2 md:pb-0">
                    {categories.map(cat => (
                        <button
                            key={cat}
                            onClick={() => setSelectedCategory(cat)}
                            className={`px-6 py-3 rounded-2xl text-xs font-black transition-all whitespace-nowrap ${selectedCategory === cat
                                ? "bg-slate-900 text-white shadow-lg shadow-slate-200"
                                : "bg-slate-50 text-slate-500 hover:bg-slate-100"
                                }`}
                        >
                            {cat === "all" ? "الكل" : cat}
                        </button>
                    ))}
                </div>
            </div>

            {/* Products Table */}
            <div className="bg-white rounded-[2.5rem] border border-slate-100 shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                    <table className="w-full text-right">
                        <thead>
                            <tr className="bg-slate-50/50 border-b border-slate-100">
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">المنتج</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">SKU</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">التصنيف</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">المخزون</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">السعر</th>
                                <th className="px-8 py-5 text-[10px] font-black text-slate-400 uppercase tracking-widest">الإجراءات</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-50">
                            {loading ? (
                                <tr><td colSpan={6} className="p-20 text-center"><div className="h-8 w-8 animate-spin rounded-full border-4 border-brand-blue border-t-transparent mx-auto"></div></td></tr>
                            ) : products.length === 0 ? (
                                <tr><td colSpan={6} className="p-20 text-center text-slate-400 font-bold italic">لا توجد منتجات حالياً</td></tr>
                            ) : products.map(product => (
                                <tr key={product.id} className="hover:bg-slate-50/80 transition-colors group">
                                    <td className="px-8 py-5">
                                        <div className="flex items-center gap-4">
                                            <div className="h-14 w-14 rounded-2xl bg-slate-100 flex-shrink-0 overflow-hidden relative border border-slate-200">
                                                {product.image_url ? <img src={product.image_url} alt="" className="h-full w-full object-cover" /> : <span className="m-auto text-xl">📦</span>}
                                            </div>
                                            <div>
                                                <p className="font-black text-slate-900 leading-none mb-1">{product.name}</p>
                                                <p className="text-[10px] text-slate-400 font-medium line-clamp-1">{product.description || "لا يوجد وصف"}</p>
                                            </div>
                                        </div>
                                    </td>
                                    <td className="px-8 py-5">
                                        <span className="text-[10px] font-black bg-slate-100 text-slate-500 px-3 py-1 rounded-full">{product.sku || "N/A"}</span>
                                    </td>
                                    <td className="px-8 py-5 font-bold text-slate-600 text-sm">{product.category || "عام"}</td>
                                    <td className="px-8 py-5">
                                        <div className="flex flex-col gap-1">
                                            <span className={`text-sm font-black ${product.stock_quantity <= product.min_stock_level ? "text-orange-500" : "text-green-600"}`}>
                                                {product.stock_quantity} قطعة
                                            </span>
                                            {product.stock_quantity <= product.min_stock_level && (
                                                <span className="text-[9px] font-bold text-orange-400 animate-pulse">مخزون منخفض!</span>
                                            )}
                                        </div>
                                    </td>
                                    <td className="px-8 py-5 font-black text-brand-blue">{Number(product.price).toLocaleString()} <span className="text-[10px] opacity-60">JOD</span></td>
                                    <td className="px-8 py-5 text-left">
                                        <div className="flex gap-2 justify-end opacity-0 group-hover:opacity-100 transition-opacity">
                                            <button onClick={() => openEdit(product)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-600 hover:bg-brand-blue hover:text-white hover:border-brand-blue transition-all">✏️</button>
                                            <button onClick={() => handleDelete(product.id)} className="h-10 w-10 flex items-center justify-center rounded-xl bg-white border border-slate-200 text-slate-400 hover:bg-red-50 hover:text-red-500 hover:border-red-100 transition-all">🗑️</button>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>

            {/* Product Modal */}
            {showModal && (
                <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-sm p-4">
                    <div className="bg-white w-full max-w-2xl rounded-[3rem] shadow-2xl overflow-hidden animate-in zoom-in-95 duration-200">
                        <div className="p-8 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                            <div>
                                <h3 className="text-2xl font-black text-slate-900 tracking-tight">{editingProduct ? "تعديل المنتج" : "إضافة منتج جديد"}</h3>
                                <p className="text-sm text-slate-500 font-medium">أدخل المعلومات الأساسية للمنتج وتفاصيل التسعير</p>
                            </div>
                            <button
                                onClick={() => setShowModal(false)}
                                className="h-12 w-12 rounded-full bg-white border border-slate-200 flex items-center justify-center text-slate-400 hover:text-slate-900 transition-all shadow-sm active:scale-90"
                            >✕</button>
                        </div>

                        <div className="p-10 grid grid-cols-2 gap-6 max-h-[70vh] overflow-y-auto no-scrollbar">
                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">اسم المنتج *</label>
                                <input
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all font-bold"
                                    value={formData.name}
                                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                                    placeholder="مثال: آيفون 15 برو"
                                />
                            </div>

                            <div className="col-span-2 md:col-span-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">SKU (رمز المنتج)</label>
                                <input
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all font-mono"
                                    value={formData.sku}
                                    onChange={(e) => setFormData({ ...formData, sku: e.target.value })}
                                    placeholder="PROD-001"
                                />
                            </div>

                            <div className="col-span-2 md:col-span-1">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">التصنيف</label>
                                <input
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all font-bold"
                                    value={formData.category}
                                    onChange={(e) => setFormData({ ...formData, category: e.target.value })}
                                    placeholder="مثال: إلكترونيات"
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">سعر البيع (JOD) *</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all font-black text-brand-blue text-xl"
                                    value={formData.price}
                                    onChange={(e) => setFormData({ ...formData, price: Number(e.target.value) })}
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">تكلفة الشراء (JOD)</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all font-black text-slate-600 text-xl"
                                    value={formData.cost_price}
                                    onChange={(e) => setFormData({ ...formData, cost_price: Number(e.target.value) })}
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">الكمية المتوفرة</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all font-black text-xl"
                                    value={formData.stock_quantity}
                                    onChange={(e) => setFormData({ ...formData, stock_quantity: Number(e.target.value) })}
                                />
                            </div>

                            <div>
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">الحد الأدنى للمخزون</label>
                                <input
                                    type="number"
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all font-black text-xl text-orange-500"
                                    value={formData.min_stock_level}
                                    onChange={(e) => setFormData({ ...formData, min_stock_level: Number(e.target.value) })}
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">رابط صورة المنتج</label>
                                <input
                                    className="w-full bg-slate-50 border border-slate-100 rounded-2xl px-5 py-4 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all"
                                    value={formData.image_url}
                                    onChange={(e) => setFormData({ ...formData, image_url: e.target.value })}
                                    placeholder="https://example.com/image.jpg"
                                />
                            </div>

                            <div className="col-span-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest block mb-2 px-1">وصف المنتج</label>
                                <textarea
                                    className="w-full bg-slate-50 border border-slate-100 rounded-[2rem] px-6 py-5 outline-none focus:ring-4 focus:ring-brand-blue/10 focus:border-brand-blue transition-all min-h-[120px] resize-none font-medium"
                                    value={formData.description}
                                    onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                                    placeholder="تفاصيل إضافية عن المنتج للموظفين..."
                                />
                            </div>
                        </div>

                        <div className="p-10 bg-slate-50/50 border-t border-slate-100 flex gap-4">
                            <button
                                onClick={handleSave}
                                disabled={isSaving}
                                className="flex-1 bg-brand-blue text-white py-5 rounded-2xl font-black shadow-xl shadow-blue-500/20 hover:scale-[1.02] active:scale-95 transition-all disabled:opacity-50"
                            >
                                {isSaving ? "جاري الحفظ..." : "تأكيد وحفظ البيانات"}
                            </button>
                            <button
                                onClick={() => setShowModal(false)}
                                className="flex-1 bg-white border border-slate-200 text-slate-600 py-5 rounded-2xl font-bold hover:bg-slate-50 transition-all font-bold"
                            >إلغاء</button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
