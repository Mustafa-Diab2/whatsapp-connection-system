import express from "express";
import { supabase } from "../lib/supabase";

const router = express.Router();

// Get comprehensive dashboard stats
router.get("/dashboard", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { period = "30" } = req.query;
    const days = parseInt(period as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    // Parallel data fetching
    const [
      customersResult,
      ordersResult,
      messagesResult,
      campaignsResult,
      appointmentsResult,
    ] = await Promise.all([
      // Customers
      supabase
        .from("customers")
        .select("id, created_at, last_activity, tags, customer_type")
        .eq("organization_id", organizationId),
      
      // Orders
      supabase
        .from("orders")
        .select(`
          id, total, status, created_at,
          order_items (product_id, quantity, price, products (name, category))
        `)
        .eq("organization_id", organizationId)
        .gte("created_at", startDate),
      
      // Messages
      supabase
        .from("messages")
        .select("id, direction, created_at, status")
        .eq("organization_id", organizationId)
        .gte("created_at", startDate),
      
      // Campaigns
      supabase
        .from("campaigns")
        .select("id, status, sent_count, delivered_count, read_count, created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", startDate),
      
      // Appointments
      supabase
        .from("appointments")
        .select("id, status, created_at")
        .eq("organization_id", organizationId)
        .gte("created_at", startDate),
    ]);

    const customers = customersResult.data || [];
    const orders = ordersResult.data || [];
    const messages = messagesResult.data || [];
    const campaigns = campaignsResult.data || [];
    const appointments = appointmentsResult.data || [];

    // Calculate metrics
    const totalRevenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);
    const avgOrderValue = orders.length > 0 ? totalRevenue / orders.length : 0;
    
    // Daily breakdown
    const dailyData: Record<string, { revenue: number; orders: number; messages: number; customers: number }> = {};
    
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      dailyData[dateKey] = { revenue: 0, orders: 0, messages: 0, customers: 0 };
    }

    orders.forEach(order => {
      const dateKey = order.created_at.split('T')[0];
      if (dailyData[dateKey]) {
        dailyData[dateKey].revenue += order.total || 0;
        dailyData[dateKey].orders += 1;
      }
    });

    messages.forEach(msg => {
      const dateKey = msg.created_at.split('T')[0];
      if (dailyData[dateKey]) {
        dailyData[dateKey].messages += 1;
      }
    });

    customers.forEach(customer => {
      const dateKey = customer.created_at.split('T')[0];
      if (dailyData[dateKey]) {
        dailyData[dateKey].customers += 1;
      }
    });

    // Convert to array sorted by date
    const chartData = Object.entries(dailyData)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Order status breakdown
    const ordersByStatus = orders.reduce((acc, o) => {
      acc[o.status] = (acc[o.status] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Top products
    const productSales: Record<string, { name: string; category: string; quantity: number; revenue: number }> = {};
    orders.forEach(order => {
      order.order_items?.forEach((item: any) => {
        const id = item.product_id;
        if (!productSales[id]) {
          productSales[id] = {
            name: item.products?.name || 'Unknown',
            category: item.products?.category || 'Other',
            quantity: 0,
            revenue: 0,
          };
        }
        productSales[id].quantity += item.quantity;
        productSales[id].revenue += item.price * item.quantity;
      });
    });

    const topProducts = Object.entries(productSales)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([id, data]) => ({ id, ...data }));

    // Customer segments
    const now = new Date();
    const newCustomers = customers.filter(c => {
      const created = new Date(c.created_at);
      return (now.getTime() - created.getTime()) < 7 * 24 * 60 * 60 * 1000;
    }).length;

    const activeCustomers = customers.filter(c => c.last_activity && 
      (now.getTime() - new Date(c.last_activity).getTime()) < 30 * 24 * 60 * 60 * 1000
    ).length;

    // Campaign performance
    const totalSent = campaigns.reduce((sum, c) => sum + (c.sent_count || 0), 0);
    const totalDelivered = campaigns.reduce((sum, c) => sum + (c.delivered_count || 0), 0);
    const totalRead = campaigns.reduce((sum, c) => sum + (c.read_count || 0), 0);

    // Message metrics
    const inboundMessages = messages.filter(m => m.direction === 'inbound').length;
    const outboundMessages = messages.filter(m => m.direction === 'outbound').length;

    // Appointment metrics
    const completedAppointments = appointments.filter(a => a.status === 'completed').length;
    const cancelledAppointments = appointments.filter(a => a.status === 'cancelled').length;

    res.json({
      summary: {
        total_revenue: totalRevenue,
        total_orders: orders.length,
        avg_order_value: avgOrderValue,
        total_customers: customers.length,
        new_customers: newCustomers,
        active_customers: activeCustomers,
        total_messages: messages.length,
        inbound_messages: inboundMessages,
        outbound_messages: outboundMessages,
        total_appointments: appointments.length,
        completed_appointments: completedAppointments,
      },
      chart_data: chartData,
      orders_by_status: ordersByStatus,
      top_products: topProducts,
      campaign_performance: {
        total_campaigns: campaigns.length,
        total_sent: totalSent,
        total_delivered: totalDelivered,
        total_read: totalRead,
        delivery_rate: totalSent > 0 ? Math.round((totalDelivered / totalSent) * 100) : 0,
        read_rate: totalDelivered > 0 ? Math.round((totalRead / totalDelivered) * 100) : 0,
      },
      customer_types: customers.reduce((acc, c) => {
        const type = c.customer_type || 'regular';
        acc[type] = (acc[type] || 0) + 1;
        return acc;
      }, {} as Record<string, number>),
    });
  } catch (error) {
    console.error("Error fetching dashboard:", error);
    res.status(500).json({ error: "Failed to fetch dashboard" });
  }
});

// Get sales report
router.get("/sales", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { start_date, end_date, group_by = "day" } = req.query;

    const startDate = start_date 
      ? new Date(start_date as string).toISOString()
      : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const endDate = end_date 
      ? new Date(end_date as string).toISOString()
      : new Date().toISOString();

    const { data: orders, error } = await supabase
      .from("orders")
      .select(`
        id, total, status, created_at, customer_id,
        order_items (product_id, quantity, price, products (name, category)),
        customers (name, phone)
      `)
      .eq("organization_id", organizationId)
      .gte("created_at", startDate)
      .lte("created_at", endDate)
      .order("created_at", { ascending: true });

    if (error) throw error;

    // Group by period
    const grouped: Record<string, { revenue: number; orders: number; items: number }> = {};

    orders?.forEach(order => {
      let key: string;
      const date = new Date(order.created_at);

      switch (group_by) {
        case "week":
          const weekStart = new Date(date);
          weekStart.setDate(date.getDate() - date.getDay());
          key = weekStart.toISOString().split('T')[0];
          break;
        case "month":
          key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
          break;
        default: // day
          key = order.created_at.split('T')[0];
      }

      if (!grouped[key]) {
        grouped[key] = { revenue: 0, orders: 0, items: 0 };
      }
      grouped[key].revenue += order.total || 0;
      grouped[key].orders += 1;
      grouped[key].items += order.order_items?.reduce((sum: number, i: any) => sum + i.quantity, 0) || 0;
    });

    const chartData = Object.entries(grouped)
      .map(([period, data]) => ({ period, ...data }))
      .sort((a, b) => a.period.localeCompare(b.period));

    // Top customers
    const customerSales: Record<string, { name: string; phone: string; revenue: number; orders: number }> = {};
    orders?.forEach(order => {
      const id = order.customer_id;
      if (id) {
        const customer = Array.isArray(order.customers) ? order.customers[0] : order.customers;
        if (!customerSales[id]) {
          customerSales[id] = {
            name: customer?.name || 'Unknown',
            phone: customer?.phone || '',
            revenue: 0,
            orders: 0,
          };
        }
        customerSales[id].revenue += order.total || 0;
        customerSales[id].orders += 1;
      }
    });

    const topCustomers = Object.entries(customerSales)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 10)
      .map(([id, data]) => ({ id, ...data }));

    res.json({
      summary: {
        total_revenue: orders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0,
        total_orders: orders?.length || 0,
        total_items: orders?.reduce((sum, o) => 
          sum + (o.order_items?.reduce((s: number, i: any) => s + i.quantity, 0) || 0), 0) || 0,
        avg_order_value: orders?.length 
          ? (orders.reduce((sum, o) => sum + (o.total || 0), 0) / orders.length)
          : 0,
      },
      chart_data: chartData,
      top_customers: topCustomers,
      orders: orders?.slice(0, 50),
    });
  } catch (error) {
    console.error("Error fetching sales report:", error);
    res.status(500).json({ error: "Failed to fetch sales report" });
  }
});

// Get customer analytics
router.get("/customers", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];

    const { data: customers, error } = await supabase
      .from("customers")
      .select(`
        id, name, phone, email, created_at, last_activity, tags, customer_type,
        orders (id, total, created_at)
      `)
      .eq("organization_id", organizationId);

    if (error) throw error;

    const now = new Date();

    // Analyze customers
    const analyzed = customers?.map(customer => {
      const orderCount = customer.orders?.length || 0;
      const totalSpent = customer.orders?.reduce((sum: number, o: any) => sum + (o.total || 0), 0) || 0;
      const avgOrderValue = orderCount > 0 ? totalSpent / orderCount : 0;
      
      const lastOrder = customer.orders?.sort((a: any, b: any) => 
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
      )[0];

      const daysSinceLastOrder = lastOrder 
        ? Math.floor((now.getTime() - new Date(lastOrder.created_at).getTime()) / (24 * 60 * 60 * 1000))
        : null;

      const daysSinceCreated = Math.floor(
        (now.getTime() - new Date(customer.created_at).getTime()) / (24 * 60 * 60 * 1000)
      );

      // RFM scoring (simplified)
      let recency = 0;
      if (daysSinceLastOrder !== null) {
        if (daysSinceLastOrder < 7) recency = 5;
        else if (daysSinceLastOrder < 30) recency = 4;
        else if (daysSinceLastOrder < 60) recency = 3;
        else if (daysSinceLastOrder < 90) recency = 2;
        else recency = 1;
      }

      let frequency = 0;
      if (orderCount > 10) frequency = 5;
      else if (orderCount > 5) frequency = 4;
      else if (orderCount > 3) frequency = 3;
      else if (orderCount > 1) frequency = 2;
      else if (orderCount > 0) frequency = 1;

      let monetary = 0;
      if (totalSpent > 5000) monetary = 5;
      else if (totalSpent > 2000) monetary = 4;
      else if (totalSpent > 1000) monetary = 3;
      else if (totalSpent > 500) monetary = 2;
      else if (totalSpent > 0) monetary = 1;

      // Customer segment based on RFM
      let segment = 'new';
      const rfmScore = recency + frequency + monetary;
      if (rfmScore >= 12) segment = 'champion';
      else if (rfmScore >= 9) segment = 'loyal';
      else if (rfmScore >= 6) segment = 'potential';
      else if (rfmScore >= 3) segment = 'at_risk';
      else if (orderCount === 0) segment = 'new';
      else segment = 'dormant';

      return {
        id: customer.id,
        name: customer.name,
        phone: customer.phone,
        email: customer.email,
        customer_type: customer.customer_type,
        order_count: orderCount,
        total_spent: totalSpent,
        avg_order_value: avgOrderValue,
        days_since_last_order: daysSinceLastOrder,
        days_since_created: daysSinceCreated,
        rfm: { recency, frequency, monetary, score: rfmScore },
        segment,
      };
    }) || [];

    // Segment counts
    const segments = analyzed.reduce((acc, c) => {
      acc[c.segment] = (acc[c.segment] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    // Customer type distribution
    const typeDistribution = analyzed.reduce((acc, c) => {
      const type = c.customer_type || 'regular';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    res.json({
      summary: {
        total_customers: analyzed.length,
        with_orders: analyzed.filter(c => c.order_count > 0).length,
        total_revenue: analyzed.reduce((sum, c) => sum + c.total_spent, 0),
        avg_customer_value: analyzed.length > 0 
          ? analyzed.reduce((sum, c) => sum + c.total_spent, 0) / analyzed.length 
          : 0,
      },
      segments,
      type_distribution: typeDistribution,
      customers: analyzed.sort((a, b) => b.total_spent - a.total_spent),
    });
  } catch (error) {
    console.error("Error fetching customer analytics:", error);
    res.status(500).json({ error: "Failed to fetch customer analytics" });
  }
});

// Get messaging analytics
router.get("/messaging", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { period = "7" } = req.query;
    const days = parseInt(period as string);
    const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();

    const { data: messages, error } = await supabase
      .from("messages")
      .select("id, direction, type, status, created_at")
      .eq("organization_id", organizationId)
      .gte("created_at", startDate);

    if (error) throw error;

    // Hourly distribution
    const hourlyDistribution = Array(24).fill(0).map((_, i) => ({ hour: i, count: 0 }));
    messages?.forEach(msg => {
      const hour = new Date(msg.created_at).getHours();
      hourlyDistribution[hour].count += 1;
    });

    // Daily breakdown
    const dailyData: Record<string, { inbound: number; outbound: number }> = {};
    for (let i = 0; i < days; i++) {
      const date = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const dateKey = date.toISOString().split('T')[0];
      dailyData[dateKey] = { inbound: 0, outbound: 0 };
    }

    messages?.forEach(msg => {
      const dateKey = msg.created_at.split('T')[0];
      if (dailyData[dateKey]) {
        if (msg.direction === 'inbound') {
          dailyData[dateKey].inbound += 1;
        } else {
          dailyData[dateKey].outbound += 1;
        }
      }
    });

    const chartData = Object.entries(dailyData)
      .map(([date, data]) => ({ date, ...data }))
      .sort((a, b) => a.date.localeCompare(b.date));

    // Message types
    const messageTypes = messages?.reduce((acc, m) => {
      acc[m.type || 'text'] = (acc[m.type || 'text'] || 0) + 1;
      return acc;
    }, {} as Record<string, number>) || {};

    res.json({
      summary: {
        total_messages: messages?.length || 0,
        inbound: messages?.filter(m => m.direction === 'inbound').length || 0,
        outbound: messages?.filter(m => m.direction === 'outbound').length || 0,
        avg_per_day: messages?.length ? Math.round(messages.length / days) : 0,
      },
      hourly_distribution: hourlyDistribution,
      chart_data: chartData,
      message_types: messageTypes,
    });
  } catch (error) {
    console.error("Error fetching messaging analytics:", error);
    res.status(500).json({ error: "Failed to fetch messaging analytics" });
  }
});

// Export data
router.post("/export", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { type, start_date, end_date, format = "json" } = req.body;

    let data: any[] = [];
    
    switch (type) {
      case "customers":
        const { data: customers } = await supabase
          .from("customers")
          .select("*")
          .eq("organization_id", organizationId);
        data = customers || [];
        break;
        
      case "orders":
        const { data: orders } = await supabase
          .from("orders")
          .select(`*, order_items (*, products (name))`)
          .eq("organization_id", organizationId)
          .gte("created_at", start_date || new Date(0).toISOString())
          .lte("created_at", end_date || new Date().toISOString());
        data = orders || [];
        break;
        
      case "messages":
        const { data: messages } = await supabase
          .from("messages")
          .select("*")
          .eq("organization_id", organizationId)
          .gte("created_at", start_date || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
          .lte("created_at", end_date || new Date().toISOString());
        data = messages || [];
        break;
    }

    if (format === "csv") {
      // Convert to CSV
      if (data.length === 0) {
        return res.send("");
      }
      const headers = Object.keys(data[0]).join(",");
      const rows = data.map(row => 
        Object.values(row).map(v => 
          typeof v === "string" ? `"${v.replace(/"/g, '""')}"` : v
        ).join(",")
      );
      res.setHeader("Content-Type", "text/csv");
      res.setHeader("Content-Disposition", `attachment; filename=${type}_export.csv`);
      return res.send([headers, ...rows].join("\n"));
    }

    res.json({ data, count: data.length });
  } catch (error) {
    console.error("Error exporting data:", error);
    res.status(500).json({ error: "Failed to export data" });
  }
});

export default router;
