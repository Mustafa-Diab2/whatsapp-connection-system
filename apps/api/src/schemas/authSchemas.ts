import { z } from "zod";

export const registerSchema = z.object({
    body: z.object({
        email: z.string().email("البريد الإلكتروني غير صالح"),
        password: z.string().min(6, "كلمة المرور يجب أن تكون 6 أحرف على الأقل"),
        name: z.string().optional()
    })
});

export const loginSchema = z.object({
    body: z.object({
        email: z.string().email("البريد الإلكتروني غير صالح"),
        password: z.string().min(1, "كلمة المرور مطلوبة")
    })
});
