import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// =====================================================
// APPOINTMENT TYPES
// =====================================================

// GET /api/appointments/types
router.get('/types', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { data, error } = await supabase
      .from('appointment_types')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at');

    if (error) throw error;

    res.json({ types: data });
  } catch (error: any) {
    console.error('Error fetching appointment types:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/appointments/types
router.post('/types', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { 
      name, 
      description, 
      duration_minutes, 
      price, 
      color,
      available_days,
      start_time,
      end_time,
      buffer_minutes,
      max_advance_days
    } = req.body;

    const { data, error } = await supabase
      .from('appointment_types')
      .insert({
        organization_id: organizationId,
        name,
        description,
        duration_minutes: duration_minutes || 30,
        price: price || 0,
        color: color || '#3B82F6',
        available_days: available_days || [0, 1, 2, 3, 4, 5, 6],
        start_time: start_time || '09:00',
        end_time: end_time || '17:00',
        buffer_minutes: buffer_minutes || 15,
        max_advance_days: max_advance_days || 30,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ type: data });
  } catch (error: any) {
    console.error('Error creating appointment type:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/appointments/types/:id
router.put('/types/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('appointment_types')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;

    res.json({ type: data });
  } catch (error: any) {
    console.error('Error updating appointment type:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/appointments/types/:id
router.delete('/types/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('appointment_types')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting appointment type:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// APPOINTMENTS
// =====================================================

// GET /api/appointments
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { start_date, end_date, status } = req.query;

    let query = supabase
      .from('appointments')
      .select('*, appointment_types(name, color, duration_minutes), customers(name, phone)')
      .eq('organization_id', organizationId)
      .order('start_time', { ascending: true });

    if (start_date) {
      query = query.gte('start_time', start_date);
    }
    if (end_date) {
      query = query.lte('start_time', end_date);
    }
    if (status) {
      query = query.eq('status', status);
    }

    const { data, error } = await query;
    if (error) throw error;

    res.json({ appointments: data });
  } catch (error: any) {
    console.error('Error fetching appointments:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/appointments
router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { 
      appointment_type_id,
      customer_id,
      title,
      description,
      start_time,
      end_time,
      customer_name,
      customer_phone,
      customer_email,
      notes
    } = req.body;

    // Check for conflicts
    const { data: conflicts } = await supabase
      .from('appointments')
      .select('id')
      .eq('organization_id', organizationId)
      .neq('status', 'cancelled')
      .lt('start_time', end_time)
      .gt('end_time', start_time);

    if (conflicts && conflicts.length > 0) {
      return res.status(400).json({ error: 'يوجد موعد آخر في هذا الوقت' });
    }

    const { data, error } = await supabase
      .from('appointments')
      .insert({
        organization_id: organizationId,
        appointment_type_id,
        customer_id,
        title,
        description,
        start_time,
        end_time,
        customer_name,
        customer_phone,
        customer_email,
        notes,
      })
      .select('*, appointment_types(name, color)')
      .single();

    if (error) throw error;

    res.json({ appointment: data });
  } catch (error: any) {
    console.error('Error creating appointment:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/appointments/:id
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('appointments')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select('*, appointment_types(name, color)')
      .single();

    if (error) throw error;

    res.json({ appointment: data });
  } catch (error: any) {
    console.error('Error updating appointment:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/appointments/:id
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('appointments')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting appointment:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/appointments/:id/status
router.post('/:id/status', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const { status } = req.body;

    const { data, error } = await supabase
      .from('appointments')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;

    res.json({ appointment: data });
  } catch (error: any) {
    console.error('Error updating appointment status:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// PUBLIC BOOKING
// =====================================================

// GET /api/appointments/public/:orgId/types
router.get('/public/:orgId/types', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;

    const { data, error } = await supabase
      .from('appointment_types')
      .select('id, name, description, duration_minutes, price, color, available_days, start_time, end_time, max_advance_days')
      .eq('organization_id', orgId)
      .eq('is_active', true);

    if (error) throw error;

    res.json({ types: data });
  } catch (error: any) {
    console.error('Error fetching public appointment types:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/appointments/public/:orgId/availability
router.get('/public/:orgId/availability', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { type_id, date } = req.query;

    if (!type_id || !date) {
      return res.status(400).json({ error: 'type_id and date are required' });
    }

    // Get appointment type
    const { data: appointmentType, error: typeError } = await supabase
      .from('appointment_types')
      .select('*')
      .eq('id', type_id)
      .single();

    if (typeError || !appointmentType) {
      return res.status(404).json({ error: 'Appointment type not found' });
    }

    // Check if day is available
    const dayOfWeek = new Date(date as string).getDay();
    if (!appointmentType.available_days.includes(dayOfWeek)) {
      return res.json({ slots: [], message: 'هذا اليوم غير متاح للحجز' });
    }

    // Get existing appointments for the day
    const startOfDay = new Date(date as string);
    startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(date as string);
    endOfDay.setHours(23, 59, 59, 999);

    const { data: existingAppointments } = await supabase
      .from('appointments')
      .select('start_time, end_time')
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .gte('start_time', startOfDay.toISOString())
      .lte('start_time', endOfDay.toISOString());

    // Generate available slots
    const slots = [];
    const [startHour, startMin] = appointmentType.start_time.split(':').map(Number);
    const [endHour, endMin] = appointmentType.end_time.split(':').map(Number);
    const duration = appointmentType.duration_minutes;
    const buffer = appointmentType.buffer_minutes;

    let currentTime = new Date(date as string);
    currentTime.setHours(startHour, startMin, 0, 0);

    const endTime = new Date(date as string);
    endTime.setHours(endHour, endMin, 0, 0);

    while (currentTime < endTime) {
      const slotEnd = new Date(currentTime.getTime() + duration * 60000);
      
      // Check if slot conflicts with existing appointments
      const hasConflict = existingAppointments?.some(apt => {
        const aptStart = new Date(apt.start_time);
        const aptEnd = new Date(apt.end_time);
        return currentTime < aptEnd && slotEnd > aptStart;
      });

      // Check if slot is in the past
      const isPast = currentTime < new Date();

      if (!hasConflict && !isPast) {
        slots.push({
          start: currentTime.toISOString(),
          end: slotEnd.toISOString(),
          display: currentTime.toLocaleTimeString('ar-EG', { hour: '2-digit', minute: '2-digit' }),
        });
      }

      currentTime = new Date(currentTime.getTime() + (duration + buffer) * 60000);
    }

    res.json({ slots });
  } catch (error: any) {
    console.error('Error fetching availability:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/appointments/public/:orgId/book
router.post('/public/:orgId/book', async (req: Request, res: Response) => {
  try {
    const { orgId } = req.params;
    const { 
      type_id, 
      start_time, 
      customer_name, 
      customer_phone, 
      customer_email,
      notes 
    } = req.body;

    // Get appointment type
    const { data: appointmentType, error: typeError } = await supabase
      .from('appointment_types')
      .select('*')
      .eq('id', type_id)
      .single();

    if (typeError || !appointmentType) {
      return res.status(404).json({ error: 'Appointment type not found' });
    }

    // Calculate end time
    const startDate = new Date(start_time);
    const endDate = new Date(startDate.getTime() + appointmentType.duration_minutes * 60000);

    // Check for conflicts
    const { data: conflicts } = await supabase
      .from('appointments')
      .select('id')
      .eq('organization_id', orgId)
      .neq('status', 'cancelled')
      .lt('start_time', endDate.toISOString())
      .gt('end_time', startDate.toISOString());

    if (conflicts && conflicts.length > 0) {
      return res.status(400).json({ error: 'هذا الموعد محجوز، يرجى اختيار وقت آخر' });
    }

    // Create appointment
    const { data, error } = await supabase
      .from('appointments')
      .insert({
        organization_id: orgId,
        appointment_type_id: type_id,
        title: appointmentType.name,
        start_time: startDate.toISOString(),
        end_time: endDate.toISOString(),
        customer_name,
        customer_phone,
        customer_email,
        notes,
        status: 'scheduled',
      })
      .select()
      .single();

    if (error) throw error;

    // Generate confirmation message
    const message = generateBookingConfirmation(data, appointmentType);

    res.json({ appointment: data, message });
  } catch (error: any) {
    console.error('Error booking appointment:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function
function generateBookingConfirmation(appointment: any, type: any): string {
  const date = new Date(appointment.start_time);
  const formattedDate = date.toLocaleDateString('ar-EG', { 
    weekday: 'long', 
    year: 'numeric', 
    month: 'long', 
    day: 'numeric' 
  });
  const formattedTime = date.toLocaleTimeString('ar-EG', { 
    hour: '2-digit', 
    minute: '2-digit' 
  });

  return `✅ *تم تأكيد حجزك!*

📅 *${type.name}*
🗓️ التاريخ: ${formattedDate}
⏰ الوقت: ${formattedTime}
⏱️ المدة: ${type.duration_minutes} دقيقة
${type.price > 0 ? `💰 السعر: ${type.price} ج.م` : ''}

نتطلع لرؤيتك! 🙏

للإلغاء أو التعديل، تواصل معنا.`;
}

export default router;
