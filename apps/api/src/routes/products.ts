import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "./auth";
import { validate } from "../middleware/validate";
import { productSchema } from "../schemas/erpSchemas";

const router = Router();

// Helper to get organizationId from verified user
const getOrgId = (req: Request): string => (req as any).user?.organizationId;

/**
 * @route   GET /api/products
 * @desc    Get all products for the organization
 * @access  Private
 */
router.get("/", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { category, status, search } = req.query;

        let query = supabase
            .from("products")
            .select("*")
            .eq("organization_id", orgId)
            .order("created_at", { ascending: false });

        if (category) query = query.eq("category", category);
        if (status) query = query.eq("status", status);
        if (search) query = query.ilike("name", `%${search}%`);

        const { data, error } = await query;

        if (error) throw error;
        res.json({ products: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   POST /api/products
 * @desc    Create a new product
 * @access  Private
 */
router.post("/", verifyToken, validate(productSchema), async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const productData = req.body;

        const { data, error } = await supabase
            .from("products")
            .insert({
                ...productData,
                organization_id: orgId,
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ message: "تمت إضافة المنتج بنجاح", product: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   GET /api/products/:id
 * @desc    Get product by ID
 * @access  Private
 */
router.get("/:id", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { id } = req.params;

        const { data, error } = await supabase
            .from("products")
            .select("*")
            .eq("id", id)
            .eq("organization_id", orgId)
            .single();

        if (error) throw error;
        if (!data) return res.status(404).json({ error: "المنتج غير موجود" });

        res.json({ product: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   PUT /api/products/:id
 * @desc    Update a product
 * @access  Private
 */
router.put("/:id", verifyToken, validate(productSchema), async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { id } = req.params;
        const updateData = req.body;

        const { data, error } = await supabase
            .from("products")
            .update({
                ...updateData,
                updated_at: new Date().toISOString(),
            })
            .eq("id", id)
            .eq("organization_id", orgId)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: "تم تحديث المنتج بنجاح", product: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   DELETE /api/products/:id
 * @desc    Archiving product (we don't hard delete for ERP integrity)
 * @access  Private
 */
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { id } = req.params;

        const { error } = await supabase
            .from("products")
            .update({ status: 'archived', updated_at: new Date().toISOString() })
            .eq("id", id)
            .eq("organization_id", orgId);

        if (error) throw error;
        res.json({ message: "تم أرشفة المنتج بنجاح" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
