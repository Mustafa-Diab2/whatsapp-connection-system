import rateLimit from "express-rate-limit";
import type { Request, Response, NextFunction } from "express";

/**
 * Rate limiters لحماية API من الطلبات المتكررة
 */

// General API rate limiter - 100 requests per 15 minutes
export const generalLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // 100 requests per window
    message: {
        error: "تم تجاوز عدد الطلبات المسموح به، يرجى المحاولة لاحقاً",
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Strict limiter for sensitive endpoints - 10 requests per 15 minutes
export const strictLimiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 10, // 10 requests per window
    message: {
        error: "تم تجاوز عدد الطلبات المسموح به لهذا الإجراء، يرجى المحاولة لاحقاً",
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// WhatsApp connection limiter - 3 requests per hour
export const whatsappConnectLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 3, // 3 connection attempts per hour
    message: {
        error: "تم تجاوز عدد محاولات الاتصال، يرجى المحاولة بعد ساعة",
    },
    standardHeaders: true,
    legacyHeaders: false,
    skipSuccessfulRequests: true, // لا تحسب الطلبات الناجحة
});

// Message sending limiter - 30 messages per minute
export const messageLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 30, // 30 messages per minute
    message: {
        error: "تم إرسال عدد كبير من الرسائل، يرجى الانتظار قليلاً",
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Facebook API limiter - 200 requests per hour (to stay within Graph API limits)
export const facebookApiLimiter = rateLimit({
    windowMs: 60 * 60 * 1000, // 1 hour
    max: 200, // 200 requests per hour
    message: {
        error: "تم تجاوز عدد طلبات Facebook API، يرجى المحاولة لاحقاً",
    },
    standardHeaders: true,
    legacyHeaders: false,
});

// Tracking redirect limiter - high limit for public tracking URLs
export const trackingLimiter = rateLimit({
    windowMs: 60 * 1000, // 1 minute
    max: 100, // 100 requests per minute per IP
    message: "Too many requests",
    standardHeaders: true,
    legacyHeaders: false,
});

/**
 * Error handling middleware
 */
export function errorHandler(
    err: any,
    req: Request,
    res: Response,
    next: NextFunction
) {
    // Log error details (في الإنتاج، استخدم logging service)
    console.error("Error:", {
        message: err.message,
        stack: process.env.NODE_ENV === "development" ? err.stack : undefined,
        path: req.path,
        method: req.method,
    });

    // Don't expose internal errors in production
    const isDevelopment = process.env.NODE_ENV === "development";

    // Handle different error types
    if (err.name === "ValidationError") {
        return res.status(400).json({
            error: "خطأ في التحقق من البيانات",
            message: isDevelopment ? err.message : undefined,
        });
    }

    if (err.name === "UnauthorizedError") {
        return res.status(401).json({
            error: "غير مصرح",
        });
    }

    // Default error response
    res.status(err.status || 500).json({
        error: isDevelopment ? err.message : "حدث خطأ في الخادم",
        ...(isDevelopment && { stack: err.stack }),
    });
}

/**
 * Not found handler
 */
export function notFoundHandler(req: Request, res: Response) {
    res.status(404).json({
        error: "الصفحة غير موجودة",
        path: req.path,
    });
}

/**
 * Async handler wrapper لتفادي try-catch في كل route
 */
export function asyncHandler(
    fn: (req: Request, res: Response, next: NextFunction) => Promise<any>
) {
    return (req: Request, res: Response, next: NextFunction) => {
        Promise.resolve(fn(req, res, next)).catch(next);
    };
}
