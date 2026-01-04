'use client';

import { useState, useEffect } from 'react';
import { Calendar, Clock, ChevronLeft, ChevronRight, Check, MapPin, Phone, User, Mail } from 'lucide-react';
import { useParams } from 'next/navigation';

interface AppointmentType {
  id: string;
  name: string;
  description?: string;
  duration_minutes: number;
  price: number;
  color: string;
  available_days: number[];
  start_time: string;
  end_time: string;
}

interface TimeSlot {
  time: string;
  available: boolean;
}

const DAYS_ARABIC = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];

export default function PublicBookingPage() {
  const params = useParams();
  const orgId = params.orgId as string;

  const [step, setStep] = useState<'type' | 'date' | 'time' | 'info' | 'success'>('type');
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [selectedType, setSelectedType] = useState<AppointmentType | null>(null);
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [timeSlots, setTimeSlots] = useState<TimeSlot[]>([]);
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  const [customerInfo, setCustomerInfo] = useState({
    name: '',
    phone: '',
    email: '',
    notes: '',
  });

  const [bookingResult, setBookingResult] = useState<{
    date: string;
    time: string;
    type: string;
  } | null>(null);

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    fetchAppointmentTypes();
  }, [orgId]);

  useEffect(() => {
    if (selectedType && selectedDate) {
      fetchAvailableSlots();
    }
  }, [selectedType, selectedDate]);

  const fetchAppointmentTypes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/appointments/public/${orgId}/types`);
      const data = await res.json();
      setAppointmentTypes(data.types || []);
    } catch (error) {
      console.error('Error fetching types:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableSlots = async () => {
    if (!selectedType || !selectedDate) return;

    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const res = await fetch(
        `${API_URL}/api/appointments/public/${orgId}/availability?type_id=${selectedType.id}&date=${dateStr}`
      );
      const data = await res.json();
      setTimeSlots(data.slots || []);
    } catch (error) {
      console.error('Error fetching slots:', error);
    }
  };

  const handleBook = async () => {
    if (!selectedType || !selectedDate || !selectedTime || !customerInfo.name || !customerInfo.phone) {
      alert('الرجاء إدخال جميع البيانات المطلوبة');
      return;
    }

    setSubmitting(true);

    try {
      const dateStr = selectedDate.toISOString().split('T')[0];
      const res = await fetch(`${API_URL}/api/appointments/public/${orgId}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          appointment_type_id: selectedType.id,
          date: dateStr,
          time: selectedTime,
          customer_name: customerInfo.name,
          customer_phone: customerInfo.phone,
          customer_email: customerInfo.email,
          notes: customerInfo.notes,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setBookingResult({
          date: selectedDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' }),
          time: selectedTime,
          type: selectedType.name,
        });
        setStep('success');
      } else {
        alert(data.error || 'فشل في حجز الموعد');
      }
    } catch (error) {
      console.error('Error booking:', error);
      alert('حدث خطأ في الحجز');
    } finally {
      setSubmitting(false);
    }
  };

  // Calendar helpers
  const getDaysInMonth = () => {
    const year = currentMonth.getFullYear();
    const month = currentMonth.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const isDateAvailable = (date: Date) => {
    if (!selectedType) return false;
    
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    
    // Past date
    if (date < today) return false;
    
    // Check if day is available
    const dayOfWeek = date.getDay();
    if (!selectedType.available_days.includes(dayOfWeek)) return false;
    
    return true;
  };

  const prevMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1));
  };

  const renderStepIndicator = () => (
    <div className="flex justify-center mb-8">
      <div className="flex items-center gap-3">
        {['type', 'date', 'time', 'info'].map((s, i) => (
          <div key={s} className="flex items-center gap-3">
            <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-medium ${
              step === s 
                ? 'bg-teal-600 text-white' 
                : ['type', 'date', 'time', 'info'].indexOf(step) > i
                ? 'bg-teal-100 text-teal-600'
                : 'bg-gray-100 text-gray-400'
            }`}>
              {['type', 'date', 'time', 'info'].indexOf(step) > i ? <Check className="w-4 h-4" /> : i + 1}
            </div>
            {i < 3 && <div className={`w-12 h-1 rounded ${
              ['type', 'date', 'time', 'info'].indexOf(step) > i ? 'bg-teal-200' : 'bg-gray-100'
            }`} />}
          </div>
        ))}
      </div>
    </div>
  );

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-teal-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">جاري التحميل...</p>
        </div>
      </div>
    );
  }

  if (appointmentTypes.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4" dir="rtl">
        <div className="text-center bg-white rounded-2xl p-8 shadow-sm max-w-md">
          <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <h1 className="text-xl font-bold text-gray-900 mb-2">لا توجد مواعيد متاحة</h1>
          <p className="text-gray-500">لم يتم إعداد أي مواعيد للحجز حالياً</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-teal-50 to-blue-50 p-4 md:p-8" dir="rtl">
      <div className="max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="w-16 h-16 bg-teal-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Calendar className="w-8 h-8 text-teal-600" />
          </div>
          <h1 className="text-2xl font-bold text-gray-900">حجز موعد</h1>
          <p className="text-gray-500 mt-1">اختر الموعد المناسب لك</p>
        </div>

        {step !== 'success' && renderStepIndicator()}

        {/* Step 1: Select Type */}
        {step === 'type' && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <h2 className="text-lg font-bold text-gray-900 mb-4">اختر نوع الموعد</h2>
            <div className="space-y-3">
              {appointmentTypes.map(type => (
                <button
                  key={type.id}
                  onClick={() => {
                    setSelectedType(type);
                    setStep('date');
                  }}
                  className={`w-full text-right p-4 rounded-xl border-2 transition-all ${
                    selectedType?.id === type.id 
                      ? 'border-teal-500 bg-teal-50' 
                      : 'border-gray-100 hover:border-teal-200'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div 
                      className="w-4 h-4 rounded-full mt-1 flex-shrink-0"
                      style={{ backgroundColor: type.color }}
                    />
                    <div className="flex-1">
                      <h3 className="font-bold text-gray-900">{type.name}</h3>
                      {type.description && (
                        <p className="text-sm text-gray-500 mt-1">{type.description}</p>
                      )}
                      <div className="flex items-center gap-4 mt-2 text-sm text-gray-600">
                        <span className="flex items-center gap-1">
                          <Clock className="w-4 h-4" />
                          {type.duration_minutes} دقيقة
                        </span>
                        {type.price > 0 && (
                          <span className="font-medium text-teal-600">{type.price} ج.م</span>
                        )}
                      </div>
                    </div>
                    <ChevronLeft className="w-5 h-5 text-gray-400" />
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Step 2: Select Date */}
        {step === 'date' && selectedType && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setStep('type')}
                className="text-teal-600 text-sm font-medium"
              >
                ← تغيير النوع
              </button>
              <h2 className="text-lg font-bold text-gray-900">اختر التاريخ</h2>
              <div />
            </div>

            {/* Selected Type Summary */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4 flex items-center gap-2">
              <div 
                className="w-3 h-3 rounded-full"
                style={{ backgroundColor: selectedType.color }}
              />
              <span className="font-medium">{selectedType.name}</span>
              <span className="text-gray-400">•</span>
              <span className="text-gray-500">{selectedType.duration_minutes} دقيقة</span>
            </div>

            {/* Calendar */}
            <div>
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronRight className="w-5 h-5" />
                </button>
                <h3 className="font-bold">
                  {currentMonth.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}
                </h3>
                <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-7 gap-1 mb-2">
                {['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'].map(day => (
                  <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>

              <div className="grid grid-cols-7 gap-1">
                {getDaysInMonth().map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} className="aspect-square" />;
                  }

                  const available = isDateAvailable(date);
                  const isSelected = selectedDate?.toDateString() === date.toDateString();

                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => {
                        if (available) {
                          setSelectedDate(date);
                          setStep('time');
                        }
                      }}
                      disabled={!available}
                      className={`aspect-square p-2 rounded-lg text-sm font-medium transition-all ${
                        isSelected
                          ? 'bg-teal-600 text-white'
                          : available
                          ? 'hover:bg-teal-100 text-gray-900'
                          : 'text-gray-300 cursor-not-allowed'
                      }`}
                    >
                      {date.getDate()}
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}

        {/* Step 3: Select Time */}
        {step === 'time' && selectedType && selectedDate && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setStep('date')}
                className="text-teal-600 text-sm font-medium"
              >
                ← تغيير التاريخ
              </button>
              <h2 className="text-lg font-bold text-gray-900">اختر الوقت</h2>
              <div />
            </div>

            {/* Selected Summary */}
            <div className="bg-gray-50 rounded-xl p-3 mb-4">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="w-4 h-4 text-gray-400" />
                <span>{selectedDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
              </div>
            </div>

            {/* Time Slots */}
            <div className="grid grid-cols-3 md:grid-cols-4 gap-2">
              {timeSlots.length === 0 ? (
                <div className="col-span-full text-center py-8 text-gray-500">
                  جاري تحميل الأوقات المتاحة...
                </div>
              ) : timeSlots.filter(s => s.available).length === 0 ? (
                <div className="col-span-full text-center py-8 text-gray-500">
                  لا توجد أوقات متاحة في هذا اليوم
                </div>
              ) : (
                timeSlots.map(slot => (
                  <button
                    key={slot.time}
                    onClick={() => {
                      if (slot.available) {
                        setSelectedTime(slot.time);
                        setStep('info');
                      }
                    }}
                    disabled={!slot.available}
                    className={`py-3 px-4 rounded-lg text-sm font-medium transition-all ${
                      selectedTime === slot.time
                        ? 'bg-teal-600 text-white'
                        : slot.available
                        ? 'bg-gray-100 hover:bg-teal-100 text-gray-900'
                        : 'bg-gray-50 text-gray-300 cursor-not-allowed line-through'
                    }`}
                  >
                    {slot.time}
                  </button>
                ))
              )}
            </div>
          </div>
        )}

        {/* Step 4: Customer Info */}
        {step === 'info' && selectedType && selectedDate && selectedTime && (
          <div className="bg-white rounded-2xl shadow-sm p-6">
            <div className="flex items-center justify-between mb-4">
              <button
                onClick={() => setStep('time')}
                className="text-teal-600 text-sm font-medium"
              >
                ← تغيير الوقت
              </button>
              <h2 className="text-lg font-bold text-gray-900">بياناتك</h2>
              <div />
            </div>

            {/* Booking Summary */}
            <div className="bg-teal-50 border border-teal-100 rounded-xl p-4 mb-6">
              <h3 className="font-bold text-teal-900 mb-2">ملخص الحجز</h3>
              <div className="space-y-1 text-sm text-teal-800">
                <div className="flex items-center gap-2">
                  <div 
                    className="w-3 h-3 rounded-full"
                    style={{ backgroundColor: selectedType.color }}
                  />
                  <span>{selectedType.name}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Calendar className="w-3 h-3" />
                  <span>{selectedDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Clock className="w-3 h-3" />
                  <span>{selectedTime}</span>
                </div>
              </div>
            </div>

            {/* Customer Form */}
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <User className="w-4 h-4 inline ml-1" />
                  الاسم الكامل *
                </label>
                <input
                  type="text"
                  value={customerInfo.name}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, name: e.target.value })}
                  placeholder="اكتب اسمك"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Phone className="w-4 h-4 inline ml-1" />
                  رقم الهاتف *
                </label>
                <input
                  type="tel"
                  value={customerInfo.phone}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, phone: e.target.value })}
                  placeholder="01xxxxxxxxx"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  <Mail className="w-4 h-4 inline ml-1" />
                  البريد الإلكتروني (اختياري)
                </label>
                <input
                  type="email"
                  value={customerInfo.email}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, email: e.target.value })}
                  placeholder="example@email.com"
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                  dir="ltr"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">
                  ملاحظات (اختياري)
                </label>
                <textarea
                  value={customerInfo.notes}
                  onChange={(e) => setCustomerInfo({ ...customerInfo, notes: e.target.value })}
                  placeholder="أي معلومات إضافية..."
                  rows={2}
                  className="w-full px-4 py-3 border border-gray-200 rounded-xl focus:ring-2 focus:ring-teal-500 focus:border-teal-500"
                />
              </div>
            </div>

            <button
              onClick={handleBook}
              disabled={!customerInfo.name || !customerInfo.phone || submitting}
              className="w-full mt-6 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white py-4 rounded-xl font-bold text-lg transition-colors"
            >
              {submitting ? 'جاري الحجز...' : 'تأكيد الحجز'}
            </button>
          </div>
        )}

        {/* Success */}
        {step === 'success' && bookingResult && (
          <div className="bg-white rounded-2xl shadow-sm p-8 text-center">
            <div className="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
              <Check className="w-10 h-10 text-green-600" />
            </div>
            
            <h2 className="text-2xl font-bold text-gray-900 mb-2">تم الحجز بنجاح! 🎉</h2>
            <p className="text-gray-500 mb-6">سنتواصل معك قريباً لتأكيد الموعد</p>

            <div className="bg-gray-50 rounded-xl p-6 text-right mb-6">
              <h3 className="font-bold text-gray-900 mb-3">تفاصيل الحجز</h3>
              <div className="space-y-2 text-gray-600">
                <div className="flex justify-between">
                  <span>نوع الموعد</span>
                  <span className="font-medium">{bookingResult.type}</span>
                </div>
                <div className="flex justify-between">
                  <span>التاريخ</span>
                  <span className="font-medium">{bookingResult.date}</span>
                </div>
                <div className="flex justify-between">
                  <span>الوقت</span>
                  <span className="font-medium">{bookingResult.time}</span>
                </div>
              </div>
            </div>

            <button
              onClick={() => {
                setStep('type');
                setSelectedType(null);
                setSelectedDate(null);
                setSelectedTime(null);
                setCustomerInfo({ name: '', phone: '', email: '', notes: '' });
                setBookingResult(null);
              }}
              className="text-teal-600 font-medium"
            >
              حجز موعد آخر
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
