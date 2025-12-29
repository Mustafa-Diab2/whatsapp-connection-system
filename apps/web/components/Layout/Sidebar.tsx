"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type MenuItem = {
  label: string;
  labelAr: string;
  href: string;
  icon?: string;
};

const menuItems: MenuItem[] = [
  { label: "Dashboard", labelAr: "لوحة التحكم", href: "/dashboard", icon: "📊" },
  { label: "WhatsApp Connection", labelAr: "اتصال الواتساب", href: "/whatsapp-connect", icon: "📱" },
  { label: "Chat", labelAr: "المحادثات", href: "/chat", icon: "💬" },
  { label: "Mini CRM", labelAr: "إدارة العملاء", href: "/crm", icon: "👥" },
  { label: "Contacts", labelAr: "جهة اتصال", href: "/contacts", icon: "📇" },
  { label: "Knowledge Base", labelAr: "قاعدة المعرفة", href: "/documents", icon: "📚" },
  { label: "Campaigns", labelAr: "الحملات", href: "/campaigns", icon: "📢" },
  { label: "AI Agent", labelAr: "الذكاء الاصطناعي", href: "/ai", icon: "🧠" },
  { label: "Configuration", labelAr: "الإعدادات", href: "/settings", icon: "⚙️" },
  { label: "My Profile", labelAr: "ملفي الشخصي", href: "/profile", icon: "👤" },
];

type SidebarProps = {
  isOpen?: boolean;
  onClose?: () => void;
};

const Sidebar = ({ isOpen, onClose }: SidebarProps) => {
  const pathname = usePathname();

  return (
    <>
      {/* Mobile Overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 backdrop-blur-sm md:hidden transition-opacity duration-300"
          onClick={onClose}
        />
      )}

      {/* Sidebar Container */}
      <aside className={`
        fixed inset-y-0 right-0 z-50 w-72 bg-white shadow-[0_0_50px_-12px_rgba(0,0,0,0.12)] transform transition-all duration-500 ease-in-out
        md:translate-x-0 md:static md:shadow-none md:border-r md:border-slate-100 md:h-[calc(100vh-72px)]
        ${isOpen ? "translate-x-0" : "translate-x-full md:translate-x-0"}
      `}>
        <div className="h-full flex flex-col bg-white">
          {/* Header for Mobile */}
          <div className="px-6 py-6 flex justify-between items-center md:hidden border-b border-slate-50">
            <span className="font-black text-xl text-slate-900">القائمة</span>
            <button onClick={onClose} className="h-10 w-10 flex items-center justify-center bg-slate-50 rounded-2xl hover:bg-red-50 hover:text-red-500 transition-all active:scale-90">
              ✕
            </button>
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-8 custom-scrollbar">
            <p className="px-4 mb-6 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400">Main Menu</p>
            <nav className="space-y-1.5">
              {menuItems.map((item) => {
                const isActive = pathname === item.href ||
                  (item.href !== "#" && pathname?.startsWith(item.href));

                return (
                  <Link
                    key={item.label}
                    href={item.href}
                    onClick={() => {
                      if (typeof window !== 'undefined' && window.innerWidth < 768 && onClose) onClose();
                    }}
                    className={`group flex items-center justify-between rounded-2xl px-5 py-3.5 text-sm font-black transition-all duration-300 ${isActive
                      ? "bg-brand-blue text-white shadow-xl shadow-blue-100 scale-[1.02]"
                      : "text-slate-500 hover:bg-slate-50 hover:text-slate-900"
                      }`}
                  >
                    <div className="flex items-center gap-3.5">
                      <span className={`text-lg transition-transform duration-300 group-hover:scale-125 ${isActive ? 'drop-shadow-md' : 'grayscale group-hover:grayscale-0 opacity-70 group-hover:opacity-100'}`}>
                        {item.icon}
                      </span>
                      <span className="tracking-tight">{item.labelAr}</span>
                    </div>
                    {isActive && (
                      <span className="h-1.5 w-1.5 rounded-full bg-white shadow-sm animate-pulse" />
                    )}
                  </Link>
                );
              })}
            </nav>
          </div>

          {/* User Status / Plan Card */}
          <div className="p-4 mt-auto border-t border-slate-50">
            <div className="rounded-3xl bg-gradient-to-br from-slate-900 to-slate-800 p-5 text-white shadow-xl overflow-hidden relative">
              <div className="absolute top-0 right-0 w-20 h-20 bg-white/5 rounded-full -translate-y-1/2 translate-x-1/2 blur-2xl"></div>
              <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">Current Plan</p>
              <h4 className="font-black text-sm mb-3">Enterprise Suite</h4>
              <div className="h-1.5 w-full bg-white/10 rounded-full overflow-hidden mb-2">
                <div className="h-full w-2/3 bg-brand-blue rounded-full"></div>
              </div>
              <p className="text-[9px] font-black text-slate-400">65% of monthly messages used</p>
            </div>
          </div>

          {/* Version Footer */}
          <div className="px-5 py-4 bg-slate-50/30">
            <p className="text-[9px] font-black text-slate-300 text-center uppercase tracking-widest">
              Awfar CRM • Version 2.4.0
            </p>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
