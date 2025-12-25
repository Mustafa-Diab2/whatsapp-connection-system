import { z } from "zod";

export const createCustomerSchema = z.object({
    body: z.object({
        name: z.string().min(1, "الاسم مطلوب"),
        phone: z.string().min(5, "رقم الهاتف مطلوب"),
        email: z.string().email("بريد إلكتروني غير صالح").optional().or(z.literal("")),
        status: z.string().optional(),
        notes: z.string().optional()
    })
});

export const updateCustomerSchema = z.object({
    params: z.object({
        id: z.string().uuid("معرف العميل غير صالح")
    }),
    body: z.object({
        name: z.string().optional(),
        phone: z.string().optional(),
        email: z.string().email("بريد إلكتروني غير صالح").optional().or(z.literal("")),
        status: z.string().optional(),
        notes: z.string().optional()
    }).refine(data => Object.keys(data).length > 0, {
        message: "يجب إرسال حقل واحد على الأقل للتحديث"
    })
});
