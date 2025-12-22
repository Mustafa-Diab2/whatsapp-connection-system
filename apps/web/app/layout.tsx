import type { Metadata } from "next";
import "./globals.css";
import AppShell from "../components/Layout/AppShell";

export const metadata: Metadata = {
  title: "لوحة تحكم الواتساب",
  description: "نظام إدارة علاقات العملاء عبر واتساب",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ar" dir="rtl">
      <body className="rtl bg-brand-gray text-slate-900">
        <AppShell>
          {children}
        </AppShell>
      </body>
    </html>
  );
}
