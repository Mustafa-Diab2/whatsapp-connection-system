import { z } from "zod";

export const productSchema = z.object({
    body: z.object({
        name: z.string().min(1, "اسم المنتج مطلوب"),
        description: z.string().optional(),
        sku: z.string().optional(),
        price: z.number().min(0, "السعر يجب أن يكون 0 أو أكثر"),
        cost_price: z.number().min(0).optional(),
        stock_quantity: z.number().int().min(0, "الكمية يجب أن تكون 0 أو أكثر"),
        min_stock_level: z.number().int().min(0).optional(),
        category: z.string().optional(),
        image_url: z.string().optional().or(z.literal("")),
        status: z.enum(["active", "archived", "out_of_stock"]).default("active"),
    })
});

export const orderItemSchema = z.object({
    product_id: z.string().min(1, "معرف المنتج غير صالح"),
    name: z.string().optional(),
    quantity: z.number().int().min(1, "الكمية يجب أن تكون 1 على الأقل"),
    unit_price: z.number().min(0),
});

export const orderSchema = z.object({
    body: z.object({
        customer_id: z.string().min(1, "معرف العميل غير صالح").optional(),
        items: z.array(orderItemSchema).min(1, "يجب إضافة منتج واحد على الأقل"),
        status: z.enum(["pending", "processing", "shipped", "delivered", "cancelled"]).default("pending"),
        payment_status: z.enum(["unpaid", "partially_paid", "paid", "refunded"]).default("unpaid"),
        notes: z.string().optional(),
    })
});
