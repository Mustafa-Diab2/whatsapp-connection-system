"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const menuItems = [
  { label: "Dashboard", href: "/dashboard" },
  { label: "WhatsApp Connection", href: "/whatsapp-connect" },
  { label: "Chat", href: "/chat" },
  { label: "Bot + Survey Bot", href: "#" },
  { label: "Configuration", href: "#" },
  { label: "Mini CRM", href: "#" },
  { label: "Drivers", href: "#" },
  { label: "Setting", href: "#" },
  { label: "Report", href: "#" },
  { label: "AI / AI Agent", href: "#" },
  { label: "Threads", href: "#" },
  { label: "Add-ons", href: "#" },
  { label: "Contacts", href: "#" }
];

const Sidebar = () => {
  const pathname = usePathname();

  return (
    <aside className="w-72 border-l border-slate-200 bg-white shadow-sm">
      <div className="px-5 py-6">
        <p className="mb-4 text-sm font-semibold text-slate-500">القائمة الرئيسية</p>
        <div className="space-y-2">
          {menuItems.map((item) => {
            const active = pathname === item.href || (pathname.startsWith(item.href) && item.href !== "#");
            return (
              <Link
                key={item.label}
                href={item.href}
                className={`flex items-center justify-between rounded-xl px-4 py-3 text-sm font-semibold transition ${
                  active
                    ? "bg-brand-green text-white shadow-md"
                    : "bg-slate-50 text-slate-700 hover:bg-slate-100"
                }`}
              >
                <span>{item.label}</span>
                <span className="text-xs opacity-70">{active ? "On" : "Go"}</span>
              </Link>
            );
          })}
        </div>
      </div>
    </aside>
  );
};

export default Sidebar;
