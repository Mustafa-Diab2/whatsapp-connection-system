import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "./auth";
import { z } from "zod";
import { validate } from "../middleware/validate";

const router = Router();

const vendorSchema = z.object({
    body: z.object({
        name: z.string().min(1, "اسم المورد مطلوب"),
        contact_name: z.string().optional().or(z.literal("")),
        email: z.string().optional().or(z.literal("")),
        phone: z.string().optional().or(z.literal("")),
        address: z.string().optional().or(z.literal("")),
        tax_id: z.string().optional().or(z.literal("")),
    })
});

const purchaseOrderSchema = z.object({
    body: z.object({
        vendor_id: z.string().min(1, "المورد مطلوب"),
        items: z.array(z.object({
            product_id: z.string().min(1, "المنتج مطلوب"),
            name: z.string().optional(),
            quantity: z.number().positive("الكمية يجب أن تكون أكبر من 0"),
            unit_cost: z.number().nonnegative("التكلفة لا يمكن أن تكون سالبة"),
        })).min(1, "يجب إضافة منتج واحد على الأقل"),
        status: z.enum(["draft", "ordered", "received", "cancelled"]).default("draft"),
        notes: z.string().optional().or(z.literal("")),
    })
});

const getOrgId = (req: Request): string => (req as any).user?.organizationId;

// --- VENDORS ---

router.get("/vendors", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { data, error } = await supabase
            .from("vendors")
            .select("*")
            .eq("organization_id", orgId);
        if (error) throw error;
        res.json({ vendors: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/vendors", verifyToken, validate(vendorSchema), async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { data, error } = await supabase
            .from("vendors")
            .insert({ ...req.body, organization_id: orgId })
            .select()
            .single();
        if (error) throw error;
        res.status(201).json({ vendor: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// --- PURCHASE ORDERS ---

router.get("/", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { data, error } = await supabase
            .from("purchase_orders")
            .select(`
        *,
        vendor:vendors(name),
        items:purchase_order_items(
          *,
          product:products(name)
        )
      `)
            .eq("organization_id", orgId)
            .order("created_at", { ascending: false });
        if (error) throw error;
        res.json({ purchase_orders: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

router.post("/", verifyToken, validate(purchaseOrderSchema), async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { vendor_id, items, status, notes } = req.body;

        const totalCost = items.reduce((acc: number, item: any) => acc + (item.quantity * item.unit_cost), 0);

        // 1. Create Purchase Order
        const { data: po, error: poError } = await supabase
            .from("purchase_orders")
            .insert({
                organization_id: orgId,
                vendor_id,
                total_amount: totalCost,
                status,
                notes
            })
            .select()
            .single();

        if (poError) throw poError;

        // 2. Create Items
        const poItems = items.map((item: any) => ({
            organization_id: orgId,
            purchase_order_id: po.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_cost: item.unit_cost
        }));

        const { error: itemsError } = await supabase
            .from("purchase_order_items")
            .insert(poItems);

        if (itemsError) throw itemsError;

        // 3. If Received, update stock (Wait, we might want a explicit 'receive' action)
        // For MVP, if status is 'received', we should increment stock.
        if (status === 'received') {
            for (const item of items) {
                // We'll use an RPC or multiple queries. For now, multiple updates.
                const { data: p } = await supabase.from("products").select("stock_quantity").eq("id", item.product_id).single();
                await supabase.from("products").update({
                    stock_quantity: (p?.stock_quantity || 0) + item.quantity
                }).eq("id", item.product_id);
            }
        }

        res.status(201).json({ message: "تم إنشاء أمر الشراء بنجاح", purchase_order: po });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
