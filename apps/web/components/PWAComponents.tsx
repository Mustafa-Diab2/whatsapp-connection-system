'use client';

import { useState, useEffect } from 'react';
import { usePWA } from '@/lib/usePWA';
import {
  Download,
  X,
  Smartphone,
  Bell,
  Wifi,
  WifiOff,
  RefreshCw,
  CheckCircle,
  Settings,
} from 'lucide-react';

export function PWAInstallBanner() {
  const { isInstallable, isInstalled, installApp, isOnline } = usePWA();
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);

  useEffect(() => {
    // Check if user previously dismissed
    const wasDismissed = localStorage.getItem('pwa-install-dismissed');
    if (wasDismissed) {
      const dismissedTime = parseInt(wasDismissed, 10);
      // Show again after 7 days
      if (Date.now() - dismissedTime < 7 * 24 * 60 * 60 * 1000) {
        setDismissed(true);
      }
    }
  }, []);

  const handleInstall = async () => {
    setInstalling(true);
    const success = await installApp();
    setInstalling(false);
    if (success) {
      setDismissed(true);
    }
  };

  const handleDismiss = () => {
    setDismissed(true);
    localStorage.setItem('pwa-install-dismissed', Date.now().toString());
  };

  if (!isInstallable || isInstalled || dismissed) return null;

  return (
    <div className="fixed bottom-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-up" dir="rtl">
      <div className="bg-gradient-to-r from-blue-600 to-blue-700 rounded-2xl shadow-2xl p-4 text-white">
        <button
          onClick={handleDismiss}
          className="absolute top-2 left-2 p-1 hover:bg-white/20 rounded-full transition-colors"
        >
          <X className="w-5 h-5" />
        </button>
        
        <div className="flex items-start gap-4">
          <div className="w-14 h-14 bg-white rounded-xl flex items-center justify-center shrink-0">
            <Smartphone className="w-8 h-8 text-blue-600" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold text-lg">ثبّت التطبيق</h3>
            <p className="text-white/80 text-sm mb-3">
              احصل على تجربة أسرع مع إشعارات فورية والوصول دون إنترنت
            </p>
            <button
              onClick={handleInstall}
              disabled={installing}
              className="flex items-center gap-2 bg-white text-blue-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-blue-50 transition-colors disabled:opacity-70"
            >
              {installing ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  جاري التثبيت...
                </>
              ) : (
                <>
                  <Download className="w-4 h-4" />
                  تثبيت الآن
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function PWAUpdateBanner() {
  const { updateAvailable, updateApp } = usePWA();

  if (!updateAvailable) return null;

  return (
    <div className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-96 z-50 animate-slide-down" dir="rtl">
      <div className="bg-gradient-to-r from-green-600 to-emerald-600 rounded-2xl shadow-2xl p-4 text-white">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 bg-white/20 rounded-xl flex items-center justify-center shrink-0">
            <RefreshCw className="w-6 h-6" />
          </div>
          <div className="flex-1">
            <h3 className="font-bold">تحديث متاح</h3>
            <p className="text-white/80 text-sm">إصدار جديد متاح، قم بالتحديث للحصول على أحدث المميزات</p>
          </div>
          <button
            onClick={updateApp}
            className="bg-white text-green-600 px-4 py-2 rounded-lg font-bold text-sm hover:bg-green-50 transition-colors"
          >
            تحديث
          </button>
        </div>
      </div>
    </div>
  );
}

export function OfflineIndicator() {
  const { isOnline } = usePWA();

  if (isOnline) return null;

  return (
    <div className="fixed top-0 left-0 right-0 bg-red-500 text-white py-2 px-4 text-center text-sm font-medium z-50 flex items-center justify-center gap-2" dir="rtl">
      <WifiOff className="w-4 h-4" />
      أنت غير متصل بالإنترنت - بعض المميزات قد لا تعمل
    </div>
  );
}

export function PWASettings() {
  const {
    isInstalled,
    isStandalone,
    notificationPermission,
    requestNotificationPermission,
    isOnline,
  } = usePWA();
  
  const [loading, setLoading] = useState(false);

  const handleEnableNotifications = async () => {
    setLoading(true);
    await requestNotificationPermission();
    setLoading(false);
  };

  return (
    <div className="bg-white rounded-xl border p-6" dir="rtl">
      <h3 className="text-lg font-bold text-gray-900 mb-4 flex items-center gap-2">
        <Settings className="w-5 h-5" />
        إعدادات التطبيق
      </h3>

      <div className="space-y-4">
        {/* Installation Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            <Smartphone className="w-5 h-5 text-gray-600" />
            <div>
              <p className="font-medium text-gray-900">حالة التثبيت</p>
              <p className="text-sm text-gray-500">
                {isStandalone ? 'يعمل كتطبيق مستقل' : 'يعمل في المتصفح'}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            isInstalled ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-600'
          }`}>
            {isInstalled ? 'مُثبّت' : 'غير مُثبّت'}
          </span>
        </div>

        {/* Connection Status */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            {isOnline ? (
              <Wifi className="w-5 h-5 text-green-600" />
            ) : (
              <WifiOff className="w-5 h-5 text-red-600" />
            )}
            <div>
              <p className="font-medium text-gray-900">حالة الاتصال</p>
              <p className="text-sm text-gray-500">
                {isOnline ? 'متصل بالإنترنت' : 'غير متصل'}
              </p>
            </div>
          </div>
          <span className={`px-3 py-1 rounded-full text-xs font-medium ${
            isOnline ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
          }`}>
            {isOnline ? 'متصل' : 'غير متصل'}
          </span>
        </div>

        {/* Notifications */}
        <div className="flex items-center justify-between p-4 bg-gray-50 rounded-lg">
          <div className="flex items-center gap-3">
            <Bell className="w-5 h-5 text-gray-600" />
            <div>
              <p className="font-medium text-gray-900">الإشعارات</p>
              <p className="text-sm text-gray-500">
                {notificationPermission === 'granted' && 'مفعّلة'}
                {notificationPermission === 'denied' && 'مرفوضة'}
                {notificationPermission === 'default' && 'غير مُعدّة'}
                {notificationPermission === 'unsupported' && 'غير مدعومة'}
              </p>
            </div>
          </div>
          {notificationPermission === 'default' && (
            <button
              onClick={handleEnableNotifications}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
            >
              {loading ? 'جاري التفعيل...' : 'تفعيل'}
            </button>
          )}
          {notificationPermission === 'granted' && (
            <CheckCircle className="w-5 h-5 text-green-600" />
          )}
        </div>
      </div>
    </div>
  );
}

// CSS Animation styles (add to globals.css)
// @keyframes slide-up {
//   from { transform: translateY(100%); opacity: 0; }
//   to { transform: translateY(0); opacity: 1; }
// }
// @keyframes slide-down {
//   from { transform: translateY(-100%); opacity: 0; }
//   to { transform: translateY(0); opacity: 1; }
// }
// .animate-slide-up { animation: slide-up 0.3s ease-out; }
// .animate-slide-down { animation: slide-down 0.3s ease-out; }
