import { z } from "zod";

/**
 * Validation schemas للـ WhatsApp API endpoints
 */

// Client ID validation
export const clientIdSchema = z
    .string()
    .min(1, "Client ID مطلوب")
    .max(50, "Client ID طويل جداً")
    .regex(/^[a-zA-Z0-9_-]+$/, "Client ID يجب أن يحتوي على أحرف وأرقام فقط");

// Phone number validation (international format)
export const phoneNumberSchema = z
    .string()
    .min(8, "رقم الهاتف قصير جداً")
    .max(20, "رقم الهاتف طويل جداً")
    .regex(/^[0-9]+$/, "رقم الهاتف يجب أن يحتوي على أرقام فقط");

// Chat ID validation (WhatsApp format: number@c.us or number@g.us)
export const chatIdSchema = z
    .string()
    .min(1, "Chat ID مطلوب")
    .regex(/^[0-9]+@(c\.us|g\.us)$/, "صيغة Chat ID غير صحيحة");

// Message text validation
export const messageTextSchema = z
    .string()
    .min(1, "الرسالة فارغة")
    .max(10000, "الرسالة طويلة جداً");

// Connect request schema
export const connectRequestSchema = z.object({
    clientId: clientIdSchema.optional().default("default"),
});

// Send message via chat ID schema
export const sendMessageSchema = z.object({
    clientId: clientIdSchema.optional().default("default"),
    chatId: chatIdSchema,
    message: messageTextSchema,
});

// Send message via phone number schema
export const sendMessageByPhoneSchema = z.object({
    clientId: clientIdSchema.optional().default("default"),
    to: phoneNumberSchema,
    text: messageTextSchema,
});

// Helper function للتحقق من البيانات
export function validateRequest<T>(
    schema: z.ZodSchema<T>,
    data: unknown
):
    | { success: true; data: T; error?: undefined }
    | { success: false; data?: undefined; error: string } {
    try {
        const validated = schema.parse(data);
        return { success: true, data: validated };
    } catch (error) {
        if (error instanceof z.ZodError) {
            const firstError = error.errors[0];
            return {
                success: false,
                error: firstError.message,
            };
        }
        return {
            success: false,
            error: "خطأ في التحقق من البيانات",
        };
    }
}
