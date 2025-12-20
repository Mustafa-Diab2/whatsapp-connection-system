"use client";

import { useState, useMemo, useEffect, useCallback } from "react";

type Customer = {
    id: string;
    name: string;
    phone: string;
    email: string;
    status: "active" | "inactive" | "pending";
    notes: string;
    createdAt: string;
    lastContact: string;
};

const statusLabels: Record<string, string> = {
    active: "نشط",
    inactive: "غير نشط",
    pending: "قيد الانتظار",
};

const statusColors: Record<string, string> = {
    active: "bg-green-100 text-green-700",
    inactive: "bg-slate-100 text-slate-600",
    pending: "bg-amber-100 text-amber-700",
};

const apiBase = process.env.NEXT_PUBLIC_API_URL || "http://localhost:3001";

export default function CRMPage() {
    const [customers, setCustomers] = useState<Customer[]>([]);
    const [search, setSearch] = useState("");
    const [filterStatus, setFilterStatus] = useState<string>("all");
    const [showModal, setShowModal] = useState(false);
    const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
    const [loading, setLoading] = useState(true);
    const [formData, setFormData] = useState({
        name: "",
        phone: "",
        email: "",
        status: "pending" as Customer["status"],
        notes: "",
    });

    const fetchCustomers = useCallback(async () => {
        try {
            const res = await fetch(`${apiBase}/api/customers`);
            const data = await res.json();
            setCustomers(data.customers || []);
        } catch (err) {
            console.error("Failed to fetch customers:", err);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchCustomers();
    }, [fetchCustomers]);

    const filteredCustomers = useMemo(() => {
        return customers.filter((c) => {
            const matchesSearch = c.name.includes(search) || c.phone.includes(search) || c.email.includes(search);
            const matchesStatus = filterStatus === "all" || c.status === filterStatus;
            return matchesSearch && matchesStatus;
        });
    }, [customers, search, filterStatus]);

    const openAddModal = () => {
        setEditingCustomer(null);
        setFormData({ name: "", phone: "", email: "", status: "pending", notes: "" });
        setShowModal(true);
    };

    const openEditModal = (customer: Customer) => {
        setEditingCustomer(customer);
        setFormData({
            name: customer.name,
            phone: customer.phone,
            email: customer.email,
            status: customer.status,
            notes: customer.notes,
        });
        setShowModal(true);
    };

    const handleSave = async () => {
        if (!formData.name || !formData.phone) return;

        try {
            if (editingCustomer) {
                await fetch(`${apiBase}/api/customers/${editingCustomer.id}`, {
                    method: "PUT",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(formData),
                });
            } else {
                await fetch(`${apiBase}/api/customers`, {
                    method: "POST",
                    headers: { "Content-Type": "application/json" },
                    body: JSON.stringify(formData),
                });
            }
            await fetchCustomers();
            setShowModal(false);
        } catch (err) {
            console.error("Failed to save customer:", err);
        }
    };

    const handleDelete = async (id: string) => {
        if (confirm("هل أنت متأكد من حذف هذا العميل؟")) {
            try {
                await fetch(`${apiBase}/api/customers/${id}`, { method: "DELETE" });
                await fetchCustomers();
            } catch (err) {
                console.error("Failed to delete customer:", err);
            }
        }
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900">إدارة العملاء</h1>
                    <p className="text-slate-500">إدارة قاعدة بيانات العملاء والتواصل معهم</p>
                </div>
                <button
                    className="btn bg-brand-blue px-6 py-3 text-white hover:bg-blue-700 shadow-md"
                    onClick={openAddModal}
                >
                    + إضافة عميل
                </button>
            </div>

            {/* Stats */}
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
                <div className="card p-4 text-center">
                    <p className="text-3xl font-bold text-brand-blue">{customers.length}</p>
                    <p className="text-sm text-slate-500">إجمالي العملاء</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-3xl font-bold text-green-600">{customers.filter(c => c.status === "active").length}</p>
                    <p className="text-sm text-slate-500">عملاء نشطون</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-3xl font-bold text-amber-600">{customers.filter(c => c.status === "pending").length}</p>
                    <p className="text-sm text-slate-500">قيد الانتظار</p>
                </div>
                <div className="card p-4 text-center">
                    <p className="text-3xl font-bold text-slate-400">{customers.filter(c => c.status === "inactive").length}</p>
                    <p className="text-sm text-slate-500">غير نشطين</p>
                </div>
            </div>

            {/* Search & Filter */}
            <div className="card p-4 flex flex-col md:flex-row gap-4">
                <input
                    type="text"
                    placeholder="بحث بالاسم أو الهاتف أو البريد..."
                    className="flex-1 p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <select
                    className="p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                    value={filterStatus}
                    onChange={(e) => setFilterStatus(e.target.value)}
                >
                    <option value="all">جميع الحالات</option>
                    <option value="active">نشط</option>
                    <option value="pending">قيد الانتظار</option>
                    <option value="inactive">غير نشط</option>
                </select>
            </div>

            {/* Customers Table */}
            <div className="card overflow-hidden">
                {loading ? (
                    <div className="p-8 text-center text-slate-500">جاري التحميل...</div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full">
                            <thead className="bg-slate-50 border-b">
                                <tr>
                                    <th className="text-right p-4 text-sm font-semibold text-slate-600">الاسم</th>
                                    <th className="text-right p-4 text-sm font-semibold text-slate-600">الهاتف</th>
                                    <th className="text-right p-4 text-sm font-semibold text-slate-600">البريد</th>
                                    <th className="text-right p-4 text-sm font-semibold text-slate-600">الحالة</th>
                                    <th className="text-right p-4 text-sm font-semibold text-slate-600">آخر تواصل</th>
                                    <th className="text-right p-4 text-sm font-semibold text-slate-600">إجراءات</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                                {filteredCustomers.map((customer) => (
                                    <tr key={customer.id} className="hover:bg-slate-50 transition">
                                        <td className="p-4">
                                            <p className="font-semibold text-slate-800">{customer.name}</p>
                                            {customer.notes && <p className="text-xs text-slate-500">{customer.notes}</p>}
                                        </td>
                                        <td className="p-4 text-slate-600">{customer.phone}</td>
                                        <td className="p-4 text-slate-600">{customer.email}</td>
                                        <td className="p-4">
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${statusColors[customer.status]}`}>
                                                {statusLabels[customer.status]}
                                            </span>
                                        </td>
                                        <td className="p-4 text-slate-500 text-sm">{customer.lastContact}</td>
                                        <td className="p-4">
                                            <div className="flex gap-2">
                                                <button
                                                    className="px-3 py-1 text-sm bg-blue-50 text-blue-600 rounded-lg hover:bg-blue-100"
                                                    onClick={() => openEditModal(customer)}
                                                >
                                                    تعديل
                                                </button>
                                                <button
                                                    className="px-3 py-1 text-sm bg-red-50 text-red-600 rounded-lg hover:bg-red-100"
                                                    onClick={() => handleDelete(customer.id)}
                                                >
                                                    حذف
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))}
                                {filteredCustomers.length === 0 && (
                                    <tr>
                                        <td colSpan={6} className="p-8 text-center text-slate-500">
                                            لا يوجد عملاء مطابقون للبحث
                                        </td>
                                    </tr>
                                )}
                            </tbody>
                        </table>
                    </div>
                )}
            </div>

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4">
                        <h3 className="text-xl font-bold text-slate-800">
                            {editingCustomer ? "تعديل عميل" : "إضافة عميل جديد"}
                        </h3>

                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="الاسم *"
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                            <input
                                type="tel"
                                placeholder="رقم الهاتف *"
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                            <input
                                type="email"
                                placeholder="البريد الإلكتروني"
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                            <select
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none"
                                value={formData.status}
                                onChange={(e) => setFormData({ ...formData, status: e.target.value as Customer["status"] })}
                            >
                                <option value="pending">قيد الانتظار</option>
                                <option value="active">نشط</option>
                                <option value="inactive">غير نشط</option>
                            </select>
                            <textarea
                                placeholder="ملاحظات"
                                className="w-full p-3 rounded-xl border border-slate-200 focus:ring-2 focus:ring-brand-blue/50 outline-none min-h-[80px]"
                                value={formData.notes}
                                onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                            />
                        </div>

                        <div className="flex gap-3 pt-2">
                            <button
                                className="flex-1 btn bg-brand-blue py-3 text-white hover:bg-blue-700"
                                onClick={handleSave}
                            >
                                حفظ
                            </button>
                            <button
                                className="flex-1 btn bg-slate-100 py-3 text-slate-700 hover:bg-slate-200"
                                onClick={() => setShowModal(false)}
                            >
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
