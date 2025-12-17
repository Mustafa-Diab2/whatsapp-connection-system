export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-semibold text-slate-500">لوحة التحكم</p>
          <h1 className="text-2xl font-extrabold text-slate-900">Inbox · WhatsApp CRM</h1>
        </div>
        <div className="badge bg-brand-blue text-white">Online</div>
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">WhatsApp CRM</h2>
            <span className="badge bg-emerald-100 text-emerald-700">Live</span>
          </div>
          <p className="text-sm text-slate-600">
            تتبع المحادثات والردود في الزمن الحقيقي. تم تصميم هذه اللوحة لتكون نقطة الدخول السريعة لأهم أرقام الأداء.
          </p>
          <div className="mt-6 grid grid-cols-2 gap-3">
            {[
              { label: "محادثات مفتوحة", value: "24" },
              { label: "رسائل جديدة", value: "8" },
              { label: "وكلاء متصلون", value: "5" },
              { label: "استطلاعات قيد الإرسال", value: "3" },
            ].map((item) => (
              <div key={item.label} className="rounded-xl bg-slate-50 p-4">
                <p className="text-xs text-slate-500">{item.label}</p>
                <p className="text-xl font-bold text-slate-900">{item.value}</p>
              </div>
            ))}
          </div>
        </div>

        <div className="card p-6">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-bold">Inbox</h2>
            <button className="btn bg-brand-blue px-3 py-2 text-white hover:bg-blue-700">تحديث</button>
          </div>
          <div className="space-y-3">
            {[
              { name: "عميل جديد", message: "هل يمكنني معرفة عروض البوت؟", status: "مفتوح" },
              { name: "الدعم", message: "تم حل المشكلة الأخيرة بنجاح", status: "مغلق" },
              { name: "تجربة", message: "يرجى إضافة استطلاع رضا", status: "مفتوح" },
            ].map((item) => (
              <div key={item.name} className="flex items-center justify-between rounded-xl bg-slate-50 px-4 py-3">
                <div>
                  <p className="font-semibold text-slate-800">{item.name}</p>
                  <p className="text-sm text-slate-600">{item.message}</p>
                </div>
                <span
                  className={`badge ${
                    item.status === "مفتوح" ? "bg-green-100 text-green-700" : "bg-slate-200 text-slate-700"
                  }`}
                >
                  {item.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
