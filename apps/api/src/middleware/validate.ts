import { Request, Response, NextFunction } from "express";
import { AnyZodObject, ZodError } from "zod";

export const validate = (schema: AnyZodObject) => (req: Request, res: Response, next: NextFunction) => {
    try {
        const shape = (schema as any).shape;

        if (shape && (shape.body || shape.query || shape.params)) {
            const result = schema.parse({
                body: req.body,
                query: req.query,
                params: req.params,
            });
            // Update request with parsed/transformed data
            if (result.body) req.body = result.body;
            if (result.query) req.query = result.query as any;
            if (result.params) req.params = result.params as any;
        } else {
            // Assume the schema is for the body only
            req.body = schema.parse(req.body);
        }

        next();
    } catch (error) {
        if (error instanceof ZodError) {
            console.error("Validation error for path:", req.path, error.errors);
            return res.status(400).json({
                message: "Validation failed",
                error: error.errors[0]?.message || "بيانات غير صالحة",
                errors: error.errors.map(err => ({
                    field: err.path.join('.'),
                    message: err.message
                }))
            });
        }
        console.error("Internal validation error:", error);
        return res.status(500).json({ message: "Internal server error during validation" });
    }
};
