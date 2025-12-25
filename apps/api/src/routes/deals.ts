import { Router, Request, Response } from "express";
import { db } from "../lib/supabase";
import { verifyToken } from "./auth";

const router = Router();
import { validate } from "../middleware/validate";
import { createDealSchema, updateDealStageSchema } from "../schemas/crmSchemas";

// Get Kanban Board Data
router.get("/", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;

        // 1. Get Stages
        const stages = await db.getStages(orgId);

        // 2. Get Deals
        const deals = await db.getDeals(orgId);

        res.json({ stages, deals });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to fetch kanban data" });
    }
});

// Create Deal
router.post("/", verifyToken, validate(createDealSchema), async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { title, value, customerId, stageId, priority, notes } = req.body;

        if (!title || !stageId) {
            return res.status(400).json({ error: "Title and Stage ID required" });
        }

        const deal = await db.createDeal({
            organization_id: orgId,
            title,
            value: value || 0,
            customer_id: customerId,
            stage_id: stageId,
            priority: priority || 'medium',
            notes
        });

        res.status(201).json({ message: "Deal created", deal });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to create deal" });
    }
});

// Update Deal (Move Stage)
router.put("/:id", verifyToken, validate(updateDealStageSchema), async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { id } = req.params;
        const { stageId } = req.body;

        if (!stageId) return res.status(400).json({ error: "Stage ID required" });

        const deal = await db.updateDealStage(id, stageId, orgId);
        res.json({ message: "Deal moved", deal });
    } catch (error: any) {
        res.status(500).json({ error: error.message || "Failed to move deal" });
    }
});

export default router;
