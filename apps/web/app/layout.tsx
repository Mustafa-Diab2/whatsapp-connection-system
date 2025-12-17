import type { Metadata } from "next";
import "./globals.css";
import Topbar from "../components/Layout/Topbar";
import Sidebar from "../components/Layout/Sidebar";

export const metadata: Metadata = {
  title: "لوحة تحكم الواتساب",
  description: "نظام اتصال احترافي عبر واتساب باستخدام whatsapp-web.js",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="rtl bg-brand-gray text-slate-900">
        <Topbar />
        <div className="flex flex-row-reverse min-h-[calc(100vh-72px)]">
          <Sidebar />
          <main className="flex-1 p-6">{children}</main>
        </div>
      </body>
    </html>
  );
}
