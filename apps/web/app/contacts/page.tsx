"use client";

import { useState, useMemo } from "react";

type Contact = {
    id: string;
    name: string;
    phone: string;
    email: string;
    group: string;
    lastMessage: string;
    avatar: string;
};

const groups = ["الكل", "عملاء VIP", "عملاء جدد", "موردين", "فريق العمل"];

const initialContacts: Contact[] = [
    { id: "1", name: "أحمد محمد", phone: "+201234567890", email: "ahmed@email.com", group: "عملاء VIP", lastMessage: "شكراً لكم", avatar: "👤" },
    { id: "2", name: "سارة علي", phone: "+201098765432", email: "sara@email.com", group: "عملاء جدد", lastMessage: "متى التوصيل؟", avatar: "👩" },
    { id: "3", name: "محمود خالد", phone: "+201555666777", email: "mahmoud@email.com", group: "موردين", lastMessage: "تم الاستلام", avatar: "👨" },
    { id: "4", name: "نور أحمد", phone: "+201111222333", email: "nour@email.com", group: "عملاء VIP", lastMessage: "ممتاز!", avatar: "👩" },
    { id: "5", name: "خالد حسن", phone: "+201999888777", email: "khaled@email.com", group: "فريق العمل", lastMessage: "تم التنفيذ", avatar: "👨" },
];

export default function ContactsPage() {
    const [contacts, setContacts] = useState<Contact[]>(initialContacts);
    const [search, setSearch] = useState("");
    const [selectedGroup, setSelectedGroup] = useState("الكل");
    const [showModal, setShowModal] = useState(false);
    const [editingContact, setEditingContact] = useState<Contact | null>(null);
    const [formData, setFormData] = useState({ name: "", phone: "", email: "", group: "عملاء جدد" });

    const filteredContacts = useMemo(() => {
        return contacts.filter((c) => {
            const matchesSearch = c.name.includes(search) || c.phone.includes(search);
            const matchesGroup = selectedGroup === "الكل" || c.group === selectedGroup;
            return matchesSearch && matchesGroup;
        });
    }, [contacts, search, selectedGroup]);

    const openAddModal = () => {
        setEditingContact(null);
        setFormData({ name: "", phone: "", email: "", group: "عملاء جدد" });
        setShowModal(true);
    };

    const openEditModal = (contact: Contact) => {
        setEditingContact(contact);
        setFormData({ name: contact.name, phone: contact.phone, email: contact.email, group: contact.group });
        setShowModal(true);
    };

    const handleSave = () => {
        if (!formData.name || !formData.phone) return;
        if (editingContact) {
            setContacts((prev) => prev.map((c) => c.id === editingContact.id ? { ...c, ...formData } : c));
        } else {
            setContacts((prev) => [{ id: Date.now().toString(), ...formData, lastMessage: "", avatar: "👤" }, ...prev]);
        }
        setShowModal(false);
    };

    const handleDelete = (id: string) => {
        if (confirm("هل أنت متأكد من حذف جهة الاتصال؟")) {
            setContacts((prev) => prev.filter((c) => c.id !== id));
        }
    };

    const sendMessage = (phone: string) => {
        window.open(`/chat?phone=${phone}`, "_self");
    };

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                    <h1 className="text-2xl font-extrabold text-slate-900">جهات الاتصال</h1>
                    <p className="text-slate-500">إدارة جهات الاتصال والمجموعات</p>
                </div>
                <button className="btn bg-brand-blue px-6 py-3 text-white hover:bg-blue-700" onClick={openAddModal}>
                    + إضافة جهة اتصال
                </button>
            </div>

            {/* Search & Filter */}
            <div className="card p-4 flex flex-col md:flex-row gap-4">
                <input
                    type="text"
                    placeholder="بحث بالاسم أو الهاتف..."
                    className="flex-1 p-3 rounded-xl border border-slate-200 outline-none"
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <div className="flex gap-2 flex-wrap">
                    {groups.map((g) => (
                        <button
                            key={g}
                            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${selectedGroup === g ? 'bg-brand-blue text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                            onClick={() => setSelectedGroup(g)}
                        >
                            {g}
                        </button>
                    ))}
                </div>
            </div>

            {/* Contacts Grid */}
            <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
                {filteredContacts.map((contact) => (
                    <div key={contact.id} className="card p-5 space-y-3">
                        <div className="flex items-center gap-3">
                            <div className="w-12 h-12 bg-gradient-to-br from-blue-100 to-blue-200 rounded-full flex items-center justify-center text-xl">
                                {contact.avatar}
                            </div>
                            <div className="flex-1">
                                <h4 className="font-semibold text-slate-800">{contact.name}</h4>
                                <p className="text-sm text-slate-500">{contact.phone}</p>
                            </div>
                            <span className="px-2 py-1 rounded-full text-xs bg-slate-100 text-slate-600">
                                {contact.group}
                            </span>
                        </div>

                        {contact.email && (
                            <p className="text-sm text-slate-500">📧 {contact.email}</p>
                        )}

                        {contact.lastMessage && (
                            <p className="text-sm text-slate-400 italic">"{contact.lastMessage}"</p>
                        )}

                        <div className="flex gap-2 pt-2">
                            <button
                                className="flex-1 btn bg-green-50 py-2 text-green-600 hover:bg-green-100"
                                onClick={() => sendMessage(contact.phone)}
                            >
                                💬 مراسلة
                            </button>
                            <button
                                className="btn bg-slate-100 py-2 px-4 text-slate-600 hover:bg-slate-200"
                                onClick={() => openEditModal(contact)}
                            >
                                ✏️
                            </button>
                            <button
                                className="btn bg-red-50 py-2 px-4 text-red-600 hover:bg-red-100"
                                onClick={() => handleDelete(contact.id)}
                            >
                                🗑️
                            </button>
                        </div>
                    </div>
                ))}
            </div>

            {filteredContacts.length === 0 && (
                <div className="text-center py-12 text-slate-500">
                    لا توجد جهات اتصال مطابقة للبحث
                </div>
            )}

            {/* Modal */}
            {showModal && (
                <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
                    <div className="bg-white rounded-2xl w-full max-w-lg p-6 space-y-4">
                        <h3 className="text-xl font-bold text-slate-800">
                            {editingContact ? "تعديل جهة اتصال" : "إضافة جهة اتصال"}
                        </h3>
                        <div className="space-y-3">
                            <input
                                type="text"
                                placeholder="الاسم *"
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none"
                                value={formData.name}
                                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                            />
                            <input
                                type="tel"
                                placeholder="رقم الهاتف *"
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none"
                                value={formData.phone}
                                onChange={(e) => setFormData({ ...formData, phone: e.target.value })}
                            />
                            <input
                                type="email"
                                placeholder="البريد الإلكتروني"
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none"
                                value={formData.email}
                                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                            />
                            <select
                                className="w-full p-3 rounded-xl border border-slate-200 outline-none"
                                value={formData.group}
                                onChange={(e) => setFormData({ ...formData, group: e.target.value })}
                            >
                                {groups.filter(g => g !== "الكل").map((g) => (
                                    <option key={g} value={g}>{g}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex gap-3">
                            <button className="flex-1 btn bg-brand-blue py-3 text-white hover:bg-blue-700" onClick={handleSave}>
                                حفظ
                            </button>
                            <button className="flex-1 btn bg-slate-100 py-3 text-slate-700 hover:bg-slate-200" onClick={() => setShowModal(false)}>
                                إلغاء
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
