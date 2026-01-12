import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "./auth";
import { z } from "zod";
import { validate } from "../middleware/validate";
import WhatsAppManager from "../wa/WhatsAppManager";

const router = Router();

const invoiceSchema = z.object({
    body: z.object({
        order_id: z.string().min(1, "رقم الطلب مطلوب"),
        due_date: z.string().optional(),
        notes: z.string().optional(),
    })
});

const getOrgId = (req: Request): string => (req as any).user?.organizationId;

/**
 * @route   POST /api/invoices
 * @desc    Generate an invoice from an existing order
 */
router.post("/", verifyToken, validate(invoiceSchema), async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { order_id, due_date, notes } = req.body;

        // 1. Fetch order details to generate invoice
        const { data: order, error: orderError } = await supabase
            .from("orders")
            .select("*, customer:customers(*)")
            .eq("id", order_id)
            .eq("organization_id", orgId)
            .single();

        if (orderError || !order) {
            return res.status(404).json({ error: "الطلب غير موجود" });
        }

        // 2. Generate Invoice Number (INV-YYYY-XXXX)
        const year = new Date().getFullYear();
        const { count } = await supabase
            .from("invoices")
            .select("*", { count: 'exact', head: true })
            .eq("organization_id", orgId);

        const invoiceNumber = `INV-${year}-${(count || 0) + 1001}`;

        // 3. Create Invoice
        const { data: invoice, error: invError } = await supabase
            .from("invoices")
            .insert({
                organization_id: orgId,
                order_id: order.id,
                customer_id: order.customer_id,
                invoice_number: invoiceNumber,
                subtotal: order.total_amount,
                total_amount: order.total_amount,
                status: order.payment_status === 'paid' ? 'paid' : 'sent',
                due_date: due_date || new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
                notes: notes || order.notes
            })
            .select()
            .single();

        if (invError) throw invError;

        // 4. Automation: Send via WhatsApp if customer has phone/chat_id
        if (order.customer && (order.customer.wa_chat_id || order.customer.phone)) {
            const manager = (req as any).whatsappManager as WhatsAppManager;
            const target = order.customer.wa_chat_id || order.customer.phone;
            const frontendUrl = process.env.FRONTEND_URL || "http://localhost:3000";
            const invoiceLink = `${frontendUrl}/invoices/${invoice.id}`;

            const message = `مرحباً ${order.customer.name}،
تم إصدار فاتورة جديدة برقم: *${invoiceNumber}*
المبلغ الإجمالي: *${Number(order.total_amount).toLocaleString()} JOD*

يمكنك عرض تفاصيل الفاتورة والدفع من خلال الرابط التالي:
${invoiceLink}

شكراً لتعاملك معنا!`;

            // Fire and forget (don't block the response)
            if (manager) {
                manager.sendMessage(orgId, target, message).catch(err => {
                    console.error(`[Invoice Automation] Failed to send WA to ${target}:`, err.message);
                });
            }
        }

        res.status(201).json({ message: "تم إنشاء الفاتورة بنجاح", invoice });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   GET /api/invoices
 */
router.get("/", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { data, error } = await supabase
            .from("invoices")
            .select(`
        *,
        customer:customers(name, phone),
        order:orders(order_number)
      `)
            .eq("organization_id", orgId)
            .order("created_at", { ascending: false });

        if (error) throw error;
        res.json({ invoices: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   GET /api/invoices/:id
 */
router.get("/:id", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { id } = req.params;

        const { data, error } = await supabase
            .from("invoices")
            .select(`
        *,
        customer:customers(*),
        order:orders(*, order_items(*, product:products(*)))
      `)
            .eq("id", id)
            .eq("organization_id", orgId)
            .single();

        if (error || !data) {
            return res.status(404).json({ error: "الفاتورة غير موجودة" });
        }

        res.json({ invoice: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
