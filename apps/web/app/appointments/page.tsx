'use client';

import { useState, useEffect } from 'react';
import { 
  Calendar, 
  Plus, 
  Clock, 
  User, 
  Phone,
  ChevronLeft,
  ChevronRight,
  Check,
  X,
  Settings,
  Eye
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase';

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
  buffer_minutes: number;
  max_advance_days: number;
  is_active: boolean;
}

interface Appointment {
  id: string;
  title: string;
  description?: string;
  start_time: string;
  end_time: string;
  status: 'scheduled' | 'confirmed' | 'cancelled' | 'completed' | 'no_show';
  customer_name?: string;
  customer_phone?: string;
  customer_email?: string;
  notes?: string;
  appointment_types?: {
    name: string;
    color: string;
    duration_minutes: number;
  };
  customers?: {
    name: string;
    phone: string;
  };
}

const DAYS = ['الأحد', 'الإثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت'];
const DAYS_SHORT = ['أحد', 'إثن', 'ثلا', 'أرب', 'خمي', 'جمع', 'سبت'];

const STATUS_COLORS = {
  scheduled: 'bg-blue-100 text-blue-700',
  confirmed: 'bg-green-100 text-green-700',
  cancelled: 'bg-red-100 text-red-700',
  completed: 'bg-gray-100 text-gray-700',
  no_show: 'bg-yellow-100 text-yellow-700',
};

const STATUS_LABELS = {
  scheduled: 'مجدول',
  confirmed: 'مؤكد',
  cancelled: 'ملغي',
  completed: 'مكتمل',
  no_show: 'لم يحضر',
};

export default function AppointmentsPage() {
  const { session, organizationId } = useSupabase();
  const [activeTab, setActiveTab] = useState<'calendar' | 'types'>('calendar');
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [appointmentTypes, setAppointmentTypes] = useState<AppointmentType[]>([]);
  const [loading, setLoading] = useState(true);
  const [currentDate, setCurrentDate] = useState(new Date());
  const [selectedDate, setSelectedDate] = useState<Date | null>(null);
  const [showAppointmentModal, setShowAppointmentModal] = useState(false);
  const [showTypeModal, setShowTypeModal] = useState(false);
  const [editingType, setEditingType] = useState<AppointmentType | null>(null);

  const [appointmentForm, setAppointmentForm] = useState({
    appointment_type_id: '',
    title: '',
    customer_name: '',
    customer_phone: '',
    customer_email: '',
    start_time: '',
    notes: '',
  });

  const [typeForm, setTypeForm] = useState({
    name: '',
    description: '',
    duration_minutes: 30,
    price: 0,
    color: '#3B82F6',
    available_days: [0, 1, 2, 3, 4, 5, 6],
    start_time: '09:00',
    end_time: '17:00',
    buffer_minutes: 15,
    max_advance_days: 30,
  });

  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (organizationId) {
      fetchAppointments();
      fetchAppointmentTypes();
    }
  }, [organizationId, currentDate]);

  const fetchAppointments = async () => {
    try {
      const startOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth(), 1);
      const endOfMonth = new Date(currentDate.getFullYear(), currentDate.getMonth() + 1, 0);

      const res = await fetch(
        `${API_URL}/api/appointments?start_date=${startOfMonth.toISOString()}&end_date=${endOfMonth.toISOString()}`,
        {
          headers: {
            'Authorization': `Bearer ${session?.access_token}`,
            'x-organization-id': organizationId || '',
          },
        }
      );
      const data = await res.json();
      setAppointments(data.appointments || []);
    } catch (error) {
      console.error('Error fetching appointments:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointmentTypes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/appointments/types`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setAppointmentTypes(data.types || []);
    } catch (error) {
      console.error('Error fetching appointment types:', error);
    }
  };

  const createAppointment = async () => {
    if (!appointmentForm.appointment_type_id || !appointmentForm.start_time) return;

    try {
      const selectedType = appointmentTypes.find(t => t.id === appointmentForm.appointment_type_id);
      const startTime = new Date(appointmentForm.start_time);
      const endTime = new Date(startTime.getTime() + (selectedType?.duration_minutes || 30) * 60000);

      const res = await fetch(`${API_URL}/api/appointments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify({
          ...appointmentForm,
          title: appointmentForm.title || selectedType?.name,
          end_time: endTime.toISOString(),
        }),
      });

      const data = await res.json();
      if (data.appointment) {
        setAppointments([...appointments, data.appointment]);
        setShowAppointmentModal(false);
        resetAppointmentForm();
      } else {
        alert(data.error || 'فشل في إنشاء الموعد');
      }
    } catch (error) {
      console.error('Error creating appointment:', error);
    }
  };

  const updateAppointmentStatus = async (id: string, status: string) => {
    try {
      const res = await fetch(`${API_URL}/api/appointments/${id}/status`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify({ status }),
      });

      const data = await res.json();
      if (data.appointment) {
        setAppointments(appointments.map(a => a.id === id ? data.appointment : a));
      }
    } catch (error) {
      console.error('Error updating appointment status:', error);
    }
  };

  const saveAppointmentType = async () => {
    if (!typeForm.name) return;

    try {
      const url = editingType 
        ? `${API_URL}/api/appointments/types/${editingType.id}`
        : `${API_URL}/api/appointments/types`;

      const res = await fetch(url, {
        method: editingType ? 'PUT' : 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify(typeForm),
      });

      const data = await res.json();
      if (data.type) {
        if (editingType) {
          setAppointmentTypes(appointmentTypes.map(t => t.id === editingType.id ? data.type : t));
        } else {
          setAppointmentTypes([...appointmentTypes, data.type]);
        }
        setShowTypeModal(false);
        resetTypeForm();
      }
    } catch (error) {
      console.error('Error saving appointment type:', error);
    }
  };

  const deleteAppointmentType = async (id: string) => {
    if (!confirm('هل أنت متأكد من حذف هذا النوع؟')) return;

    try {
      await fetch(`${API_URL}/api/appointments/types/${id}`, {
        method: 'DELETE',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      setAppointmentTypes(appointmentTypes.filter(t => t.id !== id));
    } catch (error) {
      console.error('Error deleting appointment type:', error);
    }
  };

  const resetAppointmentForm = () => {
    setAppointmentForm({
      appointment_type_id: '',
      title: '',
      customer_name: '',
      customer_phone: '',
      customer_email: '',
      start_time: '',
      notes: '',
    });
  };

  const resetTypeForm = () => {
    setEditingType(null);
    setTypeForm({
      name: '',
      description: '',
      duration_minutes: 30,
      price: 0,
      color: '#3B82F6',
      available_days: [0, 1, 2, 3, 4, 5, 6],
      start_time: '09:00',
      end_time: '17:00',
      buffer_minutes: 15,
      max_advance_days: 30,
    });
  };

  const openEditTypeModal = (type: AppointmentType) => {
    setEditingType(type);
    setTypeForm({
      name: type.name,
      description: type.description || '',
      duration_minutes: type.duration_minutes,
      price: type.price,
      color: type.color,
      available_days: type.available_days,
      start_time: type.start_time,
      end_time: type.end_time,
      buffer_minutes: type.buffer_minutes,
      max_advance_days: type.max_advance_days,
    });
    setShowTypeModal(true);
  };

  // Calendar helpers
  const getDaysInMonth = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();
    const firstDay = new Date(year, month, 1);
    const lastDay = new Date(year, month + 1, 0);
    const days = [];

    // Add padding for first week
    for (let i = 0; i < firstDay.getDay(); i++) {
      days.push(null);
    }

    // Add days of month
    for (let i = 1; i <= lastDay.getDate(); i++) {
      days.push(new Date(year, month, i));
    }

    return days;
  };

  const getAppointmentsForDate = (date: Date) => {
    return appointments.filter(apt => {
      const aptDate = new Date(apt.start_time);
      return aptDate.toDateString() === date.toDateString();
    });
  };

  const prevMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() - 1));
  };

  const nextMonth = () => {
    setCurrentDate(new Date(currentDate.getFullYear(), currentDate.getMonth() + 1));
  };

  const toggleDay = (day: number) => {
    setTypeForm(prev => ({
      ...prev,
      available_days: prev.available_days.includes(day)
        ? prev.available_days.filter(d => d !== day)
        : [...prev.available_days, day].sort(),
    }));
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6" dir="rtl">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900 flex items-center gap-2">
              <Calendar className="w-7 h-7 text-teal-600" />
              المواعيد
            </h1>
            <p className="text-gray-500 mt-1">إدارة حجوزات العملاء</p>
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setActiveTab(activeTab === 'calendar' ? 'types' : 'calendar')}
              className="flex items-center gap-2 bg-gray-100 hover:bg-gray-200 text-gray-700 px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Settings className="w-5 h-5" />
              {activeTab === 'calendar' ? 'أنواع المواعيد' : 'التقويم'}
            </button>
            <button
              onClick={() => activeTab === 'calendar' ? setShowAppointmentModal(true) : setShowTypeModal(true)}
              className="flex items-center gap-2 bg-teal-600 hover:bg-teal-700 text-white px-4 py-2 rounded-lg font-medium transition-colors"
            >
              <Plus className="w-5 h-5" />
              {activeTab === 'calendar' ? 'موعد جديد' : 'نوع جديد'}
            </button>
          </div>
        </div>

        {activeTab === 'calendar' && (
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Calendar */}
            <div className="lg:col-span-2 bg-white rounded-xl shadow-sm p-4">
              {/* Month Navigation */}
              <div className="flex items-center justify-between mb-4">
                <button onClick={prevMonth} className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronRight className="w-5 h-5" />
                </button>
                <h2 className="text-lg font-bold">
                  {currentDate.toLocaleDateString('ar-EG', { month: 'long', year: 'numeric' })}
                </h2>
                <button onClick={nextMonth} className="p-2 hover:bg-gray-100 rounded-lg">
                  <ChevronLeft className="w-5 h-5" />
                </button>
              </div>

              {/* Days Header */}
              <div className="grid grid-cols-7 gap-1 mb-2">
                {DAYS_SHORT.map(day => (
                  <div key={day} className="text-center text-sm font-medium text-gray-500 py-2">
                    {day}
                  </div>
                ))}
              </div>

              {/* Calendar Grid */}
              <div className="grid grid-cols-7 gap-1">
                {getDaysInMonth().map((date, index) => {
                  if (!date) {
                    return <div key={`empty-${index}`} className="aspect-square" />;
                  }

                  const dayAppointments = getAppointmentsForDate(date);
                  const isToday = date.toDateString() === new Date().toDateString();
                  const isSelected = selectedDate?.toDateString() === date.toDateString();

                  return (
                    <button
                      key={date.toISOString()}
                      onClick={() => setSelectedDate(date)}
                      className={`aspect-square p-1 rounded-lg text-sm transition-colors relative ${
                        isSelected 
                          ? 'bg-teal-100 ring-2 ring-teal-500' 
                          : isToday 
                          ? 'bg-blue-50' 
                          : 'hover:bg-gray-50'
                      }`}
                    >
                      <span className={`${isToday ? 'font-bold text-blue-600' : ''}`}>
                        {date.getDate()}
                      </span>
                      {dayAppointments.length > 0 && (
                        <div className="absolute bottom-1 left-1 right-1 flex gap-0.5 justify-center">
                          {dayAppointments.slice(0, 3).map((apt, i) => (
                            <div
                              key={i}
                              className="w-1.5 h-1.5 rounded-full"
                              style={{ backgroundColor: apt.appointment_types?.color || '#3B82F6' }}
                            />
                          ))}
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Selected Day Details */}
            <div className="bg-white rounded-xl shadow-sm p-4">
              <h3 className="font-bold text-gray-900 mb-4">
                {selectedDate 
                  ? selectedDate.toLocaleDateString('ar-EG', { weekday: 'long', day: 'numeric', month: 'long' })
                  : 'اختر يوماً'
                }
              </h3>

              {selectedDate && (
                <div className="space-y-3">
                  {getAppointmentsForDate(selectedDate).length === 0 ? (
                    <p className="text-gray-500 text-center py-8">لا توجد مواعيد</p>
                  ) : (
                    getAppointmentsForDate(selectedDate).map(apt => (
                      <div 
                        key={apt.id} 
                        className="border rounded-lg p-3"
                        style={{ borderRightWidth: '4px', borderRightColor: apt.appointment_types?.color || '#3B82F6' }}
                      >
                        <div className="flex items-start justify-between mb-2">
                          <div>
                            <h4 className="font-medium">{apt.title}</h4>
                            <p className="text-sm text-gray-500 flex items-center gap-1">
                              <Clock className="w-3 h-3" />
                              {new Date(apt.start_time).toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' })}
                            </p>
                          </div>
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[apt.status]}`}>
                            {STATUS_LABELS[apt.status]}
                          </span>
                        </div>
                        
                        {(apt.customer_name || apt.customers?.name) && (
                          <p className="text-sm text-gray-600 flex items-center gap-1">
                            <User className="w-3 h-3" />
                            {apt.customer_name || apt.customers?.name}
                          </p>
                        )}
                        
                        {apt.status === 'scheduled' && (
                          <div className="flex gap-2 mt-2 pt-2 border-t">
                            <button
                              onClick={() => updateAppointmentStatus(apt.id, 'confirmed')}
                              className="flex-1 flex items-center justify-center gap-1 py-1 bg-green-100 hover:bg-green-200 text-green-700 rounded text-sm"
                            >
                              <Check className="w-3 h-3" />
                              تأكيد
                            </button>
                            <button
                              onClick={() => updateAppointmentStatus(apt.id, 'cancelled')}
                              className="flex-1 flex items-center justify-center gap-1 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded text-sm"
                            >
                              <X className="w-3 h-3" />
                              إلغاء
                            </button>
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              )}
            </div>
          </div>
        )}

        {activeTab === 'types' && (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {appointmentTypes.map(type => (
              <div key={type.id} className="bg-white rounded-xl shadow-sm p-4">
                <div className="flex items-start gap-3 mb-3">
                  <div 
                    className="w-4 h-4 rounded-full mt-1"
                    style={{ backgroundColor: type.color }}
                  />
                  <div className="flex-1">
                    <h3 className="font-bold text-gray-900">{type.name}</h3>
                    <p className="text-sm text-gray-500">{type.description}</p>
                  </div>
                </div>

                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>المدة</span>
                    <span>{type.duration_minutes} دقيقة</span>
                  </div>
                  <div className="flex justify-between">
                    <span>السعر</span>
                    <span>{type.price > 0 ? `${type.price} ج.م` : 'مجاني'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span>ساعات العمل</span>
                    <span>{type.start_time} - {type.end_time}</span>
                  </div>
                </div>

                <div className="flex gap-2 mt-4 pt-3 border-t">
                  <button
                    onClick={() => openEditTypeModal(type)}
                    className="flex-1 py-2 bg-gray-100 hover:bg-gray-200 rounded-lg text-sm font-medium transition-colors"
                  >
                    تعديل
                  </button>
                  <button
                    onClick={() => deleteAppointmentType(type.id)}
                    className="py-2 px-4 bg-red-100 hover:bg-red-200 text-red-600 rounded-lg text-sm font-medium transition-colors"
                  >
                    حذف
                  </button>
                </div>
              </div>
            ))}

            {appointmentTypes.length === 0 && (
              <div className="col-span-full bg-white rounded-xl shadow-sm p-12 text-center">
                <Calendar className="w-16 h-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-bold text-gray-900 mb-2">لا توجد أنواع مواعيد</h3>
                <p className="text-gray-500 mb-4">أنشئ أنواع المواعيد المتاحة للحجز</p>
                <button
                  onClick={() => setShowTypeModal(true)}
                  className="bg-teal-600 hover:bg-teal-700 text-white px-6 py-2 rounded-lg font-medium transition-colors"
                >
                  إنشاء نوع موعد
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Create Appointment Modal */}
      {showAppointmentModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-md">
            <h2 className="text-xl font-bold text-gray-900 mb-4">موعد جديد</h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">نوع الموعد *</label>
                <select
                  value={appointmentForm.appointment_type_id}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, appointment_type_id: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">اختر نوع الموعد</option>
                  {appointmentTypes.map(type => (
                    <option key={type.id} value={type.id}>{type.name}</option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">التاريخ والوقت *</label>
                <input
                  type="datetime-local"
                  value={appointmentForm.start_time}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, start_time: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">اسم العميل</label>
                <input
                  type="text"
                  value={appointmentForm.customer_name}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, customer_name: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">رقم الهاتف</label>
                <input
                  type="tel"
                  value={appointmentForm.customer_phone}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, customer_phone: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">ملاحظات</label>
                <textarea
                  value={appointmentForm.notes}
                  onChange={(e) => setAppointmentForm({ ...appointmentForm, notes: e.target.value })}
                  rows={2}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={createAppointment}
                disabled={!appointmentForm.appointment_type_id || !appointmentForm.start_time}
                className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white py-2 rounded-lg font-medium transition-colors"
              >
                إنشاء الموعد
              </button>
              <button
                onClick={() => { setShowAppointmentModal(false); resetAppointmentForm(); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Appointment Type Modal */}
      {showTypeModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <h2 className="text-xl font-bold text-gray-900 mb-4">
              {editingType ? 'تعديل نوع الموعد' : 'نوع موعد جديد'}
            </h2>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الاسم *</label>
                <input
                  type="text"
                  value={typeForm.name}
                  onChange={(e) => setTypeForm({ ...typeForm, name: e.target.value })}
                  placeholder="مثال: استشارة"
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الوصف</label>
                <input
                  type="text"
                  value={typeForm.description}
                  onChange={(e) => setTypeForm({ ...typeForm, description: e.target.value })}
                  className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">المدة (دقيقة)</label>
                  <input
                    type="number"
                    value={typeForm.duration_minutes}
                    onChange={(e) => setTypeForm({ ...typeForm, duration_minutes: parseInt(e.target.value) })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">السعر</label>
                  <input
                    type="number"
                    value={typeForm.price}
                    onChange={(e) => setTypeForm({ ...typeForm, price: parseFloat(e.target.value) })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">من الساعة</label>
                  <input
                    type="time"
                    value={typeForm.start_time}
                    onChange={(e) => setTypeForm({ ...typeForm, start_time: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">إلى الساعة</label>
                  <input
                    type="time"
                    value={typeForm.end_time}
                    onChange={(e) => setTypeForm({ ...typeForm, end_time: e.target.value })}
                    className="w-full px-4 py-2 border rounded-lg focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">الأيام المتاحة</label>
                <div className="flex flex-wrap gap-2">
                  {DAYS.map((day, index) => (
                    <button
                      key={index}
                      type="button"
                      onClick={() => toggleDay(index)}
                      className={`px-3 py-1 rounded-full text-sm font-medium transition-colors ${
                        typeForm.available_days.includes(index)
                          ? 'bg-teal-100 text-teal-700'
                          : 'bg-gray-100 text-gray-500'
                      }`}
                    >
                      {day}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-2">اللون</label>
                <input
                  type="color"
                  value={typeForm.color}
                  onChange={(e) => setTypeForm({ ...typeForm, color: e.target.value })}
                  className="w-full h-10 rounded-lg cursor-pointer"
                />
              </div>
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={saveAppointmentType}
                disabled={!typeForm.name}
                className="flex-1 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-300 text-white py-2 rounded-lg font-medium transition-colors"
              >
                {editingType ? 'حفظ التغييرات' : 'إنشاء'}
              </button>
              <button
                onClick={() => { setShowTypeModal(false); resetTypeForm(); }}
                className="flex-1 bg-gray-100 hover:bg-gray-200 text-gray-700 py-2 rounded-lg font-medium transition-colors"
              >
                إلغاء
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
