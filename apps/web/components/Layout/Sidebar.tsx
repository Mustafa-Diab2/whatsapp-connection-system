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
  { label: "Bot + Survey Bot", labelAr: "البوت + استطلاع", href: "/bot", icon: "🤖" },
  { label: "Configuration", labelAr: "الإعدادات", href: "/settings", icon: "⚙️" },
  { label: "Mini CRM", labelAr: "إدارة العملاء", href: "/crm", icon: "👥" },
  { label: "Setting", labelAr: "الضبط", href: "/tuning", icon: "🔧" },
  { label: "Report", labelAr: "التقارير", href: "/reports", icon: "📈" },
  { label: "AI / AI Agent", labelAr: "الذكاء الاصطناعي", href: "/ai", icon: "🧠" },
  { label: "Threads", labelAr: "المواضيع", href: "/threads", icon: "📝" },
  { label: "Add-ons", labelAr: "الإضافات", href: "/addons", icon: "🔌" },
  { label: "Contacts", labelAr: "جهات الاتصال", href: "/contacts", icon: "📞" }
];

const Sidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="w-72 border-l border-slate-200 bg-white shadow-sm overflow-y-auto">
      <div className="px-5 py-6">
        <p className="mb-4 text-sm font-semibold text-slate-500">القائمة الرئيسية</p>
        <nav className="space-y-2">
          {menuItems.map((item) => {
            const isActive = pathname === item.href ||
              (item.href !== "#" && pathname?.startsWith(item.href));

            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition-all duration-200 ${isActive
                  ? "bg-brand-green text-white shadow-md"
                  : "bg-slate-50 text-slate-700 hover:bg-slate-100 hover:shadow-sm"
                  }`}
              >
                <div className="flex items-center gap-3">
                  {item.icon && <span className="text-base">{item.icon}</span>}
                  <span>{item.labelAr}</span>
                </div>
                <span className={`text-xs px-2 py-0.5 rounded-md ${isActive
                  ? "bg-white/20"
                  : "bg-slate-200 text-slate-600"
                  }`}>
                  {isActive ? "نشط" : "انتقل"}
                </span>
              </Link>
            );
          })}
        </nav>
      </div>

      {/* Footer */}
      <div className="border-t border-slate-100 px-5 py-4 mt-4">
        <p className="text-xs text-slate-400 text-center">
          WhatsApp CRM v1.0.0
        </p>
      </div>
    </aside>
  );
};

export default Sidebar;
