import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { verifyToken } from "./auth";
import { z } from "zod";
import { validate } from "../middleware/validate";

const router = Router();

const taskSchema = z.object({
    body: z.object({
        customer_id: z.string().optional().nullable().transform(val => val === "" ? null : val),
        title: z.string().min(1, "العنوان مطلوب"),
        description: z.string().optional(),
        due_date: z.string().optional(),
        priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
        status: z.enum(["todo", "in_progress", "completed", "cancelled"]).default("todo"),
    })
});

const getOrgId = (req: Request): string => (req as any).user?.organizationId;

/**
 * @route   GET /api/tasks
 * @desc    Get all tasks for the organization
 */
router.get("/", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { status, priority, customer_id } = req.query;

        let query = supabase
            .from("tasks")
            .select(`
        *,
        customer:customers(id, name, phone)
      `)
            .eq("organization_id", orgId)
            .order("due_date", { ascending: true });

        if (status) query = query.eq("status", status);
        if (priority) query = query.eq("priority", priority);
        if (customer_id) query = query.eq("customer_id", customer_id);

        const { data, error } = await query;
        if (error) throw error;
        res.json({ tasks: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   POST /api/tasks
 * @desc    Create a new task
 */
router.post("/", verifyToken, validate(taskSchema), async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const taskData = req.body;

        const { data, error } = await supabase
            .from("tasks")
            .insert({
                ...taskData,
                organization_id: orgId,
            })
            .select()
            .single();

        if (error) throw error;
        res.status(201).json({ message: "تم إنشاء المهمة بنجاح", task: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   PUT /api/tasks/:id
 * @desc    Update task status or details
 */
router.put("/:id", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { id } = req.params;
        const updates = req.body;

        const { data, error } = await supabase
            .from("tasks")
            .update({
                ...updates,
                updated_at: new Date().toISOString()
            })
            .eq("id", id)
            .eq("organization_id", orgId)
            .select()
            .single();

        if (error) throw error;
        res.json({ message: "تم تحديث المهمة", task: data });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

/**
 * @route   DELETE /api/tasks/:id
 */
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = getOrgId(req);
        const { id } = req.params;

        const { error } = await supabase
            .from("tasks")
            .delete()
            .eq("id", id)
            .eq("organization_id", orgId);

        if (error) throw error;
        res.json({ message: "تم حذف المهمة" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
