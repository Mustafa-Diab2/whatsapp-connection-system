import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "./auth";
import { validate } from "../middleware/validate";
import { orderSchema } from "../schemas/erpSchemas";
import WhatsAppManager from "../wa/WhatsAppManager";

const router = Router();

const getOrgId = (req: Request): string => (req as any).user?.organizationId;

/**
 * @route   GET /api/orders
 * @desc    Get all orders
 */
router.get("/", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { status, customer_id } = req.query;

        let query = supabase
            .from("orders")
            .select(`
        *,
        customer:customers(id, name, phone),
        invoices(id),
        items:order_items(
          *,
          product:products(id, name, price)
        )
      `)
            .eq("organization_id", orgId)
            .order("created_at", { ascending: false });

        if (status) query = query.eq("status", status);
        if (customer_id) query = query.eq("customer_id", customer_id);

        const { data, error } = await query;
        if (error) throw error;
        res.json({ orders: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   POST /api/orders
 * @desc    Create a new order & deduct stock
 */
router.post("/", verifyToken, validate(orderSchema), async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { customer_id, items, status, payment_status, notes } = req.body;

        // 1. Calculate totals
        const totalAmount = items.reduce((sum: number, item: any) => sum + (item.unit_price * item.quantity), 0);

        // 2. Create Order (Start Transaction-like logic in Supabase)
        // Note: For complex transactions, it's better to use a Postgres function (RPC),
        // but here we do it sequentially for clarity.

        const { data: order, error: orderError } = await supabase
            .from("orders")
            .insert({
                organization_id: orgId,
                customer_id,
                total_amount: totalAmount,
                status,
                payment_status,
                notes
            })
            .select()
            .single();

        if (orderError) throw orderError;

        // 3. Create Order Items
        const itemsToInsert = items.map((item: any) => ({
            order_id: order.id,
            product_id: item.product_id,
            quantity: item.quantity,
            unit_price: item.unit_price,
            total_price: item.unit_price * item.quantity
        }));

        const { error: itemsError } = await supabase
            .from("order_items")
            .insert(itemsToInsert);

        if (itemsError) throw itemsError;

        // Stock reduction is handled by DB TRIGGER 'trigger_update_stock_on_order' created in migration!

        // 4. Automation: Check for Low Stock and Alert Admin
        const manager = (req as any).whatsappManager as WhatsAppManager;

        // 5. Loyalty Points: Award 1 point per 1 JOD
        if (customer_id && totalAmount > 0) {
            const pointsToEarn = Math.floor(totalAmount);

            // Update customer points
            const { data: customerData } = await supabase
                .from("customers")
                .select("loyalty_points, name, phone, wa_chat_id")
                .eq("id", customer_id)
                .single();

            if (customerData) {
                const newPoints = (customerData.loyalty_points || 0) + pointsToEarn;

                await supabase
                    .from("customers")
                    .update({ loyalty_points: newPoints })
                    .eq("id", customer_id);

                // Log transaction
                await supabase
                    .from("loyalty_transactions")
                    .insert({
                        organization_id: orgId,
                        customer_id,
                        points: pointsToEarn,
                        type: 'earned',
                        description: `نقاط مكتسبة من الطلب رقم #${order.order_number}`
                    });

                // Notify via WhatsApp
                if (manager && (customerData.wa_chat_id || customerData.phone)) {
                    const target = customerData.wa_chat_id || customerData.phone;
                    const loyaltyMsg = `🌟 *مبروك! لقد ربحت نقاطاً جديدة* 🌟

شكراً لتسوقك معنا، لقد تمت إضافة *${pointsToEarn}* نقطة إلى رصيدك من طلبك الأخير.
رصيدك الإجمالي الآن: *${newPoints}* نقطة.

استمر في التسوق لتحويل نقاطك إلى خصومات وهدايا قريباً! ✨`;

                    manager.sendMessage(orgId, target, loyaltyMsg).catch(err => console.error("Loyalty WA failed", err.message));
                }
            }
        }

        if (manager) {
            // We fetch the updated stock levels for products in this order
            const productIds = items.map((i: any) => i.product_id);
            const { data: updatedProducts } = await supabase
                .from("products")
                .select("id, name, stock_quantity, min_stock_level")
                .in("id", productIds);

            if (updatedProducts) {
                const lowStockItems = updatedProducts.filter(p => p.stock_quantity <= p.min_stock_level);
                if (lowStockItems.length > 0) {
                    const userPhone = (req as any).user?.phone; // Send to the person who made the order for now
                    if (userPhone) {
                        const alertMsg = `⚠️ *تنبيه انخفاض المخزون* ⚠️

المنتجات التالية وصلت إلى الحد الأدنى للمخزون بعد الطلب الأخير:
${lowStockItems.map(p => `• *${p.name}*: المتبقي (${p.stock_quantity})`).join('\n')}

يرجى مراجعة صفحة المشتريات لتأمين النقص.`;

                        manager.sendMessage(orgId, userPhone, alertMsg).catch(e => console.error("Stock Alert Failed", e.message));
                    }
                }
            }
        }

        res.status(201).json({
            message: "تم إنشاء الطلب بنجاح",
            order_id: order.id,
            total_amount: totalAmount
        });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   GET /api/orders/:id
 */
router.get("/:id", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { id } = req.params;

        const { data, error } = await supabase
            .from("orders")
            .select(`
        *,
        customer:customers(id, name, phone),
        items:order_items(
          *,
          product:products(id, name, price, sku)
        )
      `)
            .eq("id", id)
            .eq("organization_id", orgId)
            .single();

        if (error) throw error;
        res.json({ order: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
