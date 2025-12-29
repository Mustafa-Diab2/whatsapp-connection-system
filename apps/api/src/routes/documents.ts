import { Router, Request, Response } from "express";
import { supabase } from "../lib/supabase";
import { ai } from "../lib/ai";
import { verifyToken } from "./auth";

const router = Router();

// Get all documents for organization
router.get("/", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;

        const { data, error } = await supabase
            .from("documents")
            .select("id, content, source, created_at")
            .eq("organization_id", orgId)
            .order("created_at", { ascending: false });

        if (error) throw error;

        res.json({ documents: data });
    } catch (error: any) {
        console.error("Get documents error:", error);
        res.status(500).json({ error: error.message || "Failed to fetch documents" });
    }
});

// Add new document
router.post("/", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { content, source } = req.body;

        if (!content) {
            return res.status(400).json({ error: "المحتوى مطلوب" });
        }

        // 1. Generate Embedding
        let embedding: number[];
        try {
            embedding = await ai.generateEmbedding(content);
        } catch (aiError: any) {
            console.error("AI Embedding generation failed:", aiError);
            return res.status(500).json({
                error: "فشل توليد التشفير للذكاء الاصطناعي. تأكد من إعداد مفتاح API بشكل صحيح.",
                details: aiError.message
            });
        }

        // 2. Save to DB
        const { data, error: dbError } = await supabase
            .from("documents")
            .insert({
                organization_id: orgId,
                content,
                source: source || "manual",
                embedding
            })
            .select()
            .single();

        if (dbError) {
            console.error("Supabase Document Insert Error:", dbError);
            throw dbError;
        }

        res.status(201).json({ message: "تمت إضافة المعلومات بنجاح", document: data });
    } catch (error: any) {
        console.error("Add document exception:", error);
        res.status(500).json({
            error: "فشل حفظ المعلومات في قاعدة البيانات.",
            details: error.message
        });
    }
});

// Delete document
router.delete("/:id", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;
        const { id } = req.params;

        const { error } = await supabase
            .from("documents")
            .delete()
            .eq("id", id)
            .eq("organization_id", orgId); // Security: Ensure deleting own doc

        if (error) throw error;

        res.json({ message: "Document deleted successfully" });
    } catch (error: any) {
        console.error("Delete document error:", error);
        res.status(500).json({ error: error.message || "Failed to delete document" });
    }
});

export default router;
