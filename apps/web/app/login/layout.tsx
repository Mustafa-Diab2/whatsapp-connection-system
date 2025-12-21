import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
    title: "تسجيل الدخول - واتساب CRM",
    description: "سجل دخولك للوصول إلى لوحة تحكم الواتساب",
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
    return (
        <html lang="ar" dir="rtl">
            <body className="rtl">
                {children}
            </body>
        </html>
    );
}
