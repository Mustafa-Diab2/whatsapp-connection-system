"use client";

import { useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export default function FacebookCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();

  useEffect(() => {
    // Get the code and state from URL
    const code = searchParams.get("code");
    const state = searchParams.get("state");
    const error = searchParams.get("error");
    const errorDescription = searchParams.get("error_description");

    if (error) {
      // Redirect to integration page with error
      router.replace(`/integrations/facebook?error=${encodeURIComponent(errorDescription || error)}`);
      return;
    }

    if (code) {
      // Redirect to main integration page with code (it will handle the callback)
      const redirectUrl = `/integrations/facebook?code=${encodeURIComponent(code)}${state ? `&state=${encodeURIComponent(state)}` : ""}`;
      router.replace(redirectUrl);
    } else {
      // No code, redirect to integration page
      router.replace("/integrations/facebook");
    }
  }, [searchParams, router]);

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
      <div className="text-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto mb-4"></div>
        <p className="text-gray-600">جاري إتمام الربط مع الفيسبوك...</p>
      </div>
    </div>
  );
}
