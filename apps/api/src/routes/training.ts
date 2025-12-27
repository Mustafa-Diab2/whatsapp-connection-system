import { Router, Request, Response } from "express";
import { db } from "../lib/supabase";
import { verifyToken } from "./auth";
import { ai } from "../lib/ai";
import multer from "multer";
const pdf = require("pdf-parse");
import fs from "fs-extra";

const router = Router();
const upload = multer({ dest: "uploads/" });

function getOrgId(req: Request) {
    const orgId = (req as any).user?.organizationId;
    if (!orgId) throw new Error("Unauthorized: Organization ID missing");
    return orgId;
}

// Get all trained documents
router.get("/documents", verifyToken, async (req, res) => {
    const orgId = getOrgId(req);
    try {
        const docs = await db.getDocuments(orgId);
        res.json({ documents: docs });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

// Upload and train a document
router.post("/upload", verifyToken, upload.single("file"), async (req, res) => {
    const orgId = getOrgId(req);
    const file = req.file;

    if (!file) return res.status(400).json({ error: "No file uploaded" });

    try {
        let textContent = "";

        if (file.mimetype === "application/pdf") {
            const dataBuffer = await fs.readFile(file.path);
            const data = await pdf(dataBuffer);
            textContent = data.text;
        } else if (file.mimetype === "text/plain") {
            textContent = await fs.readFile(file.path, "utf-8");
        } else {
            await fs.remove(file.path);
            return res.status(400).json({ error: "Unsupported file type. Use PDF or TXT." });
        }

        if (!textContent.trim()) {
            await fs.remove(file.path);
            return res.status(400).json({ error: "File is empty or could not be read." });
        }

        // 1. Generate Embedding for the entire content 
        // Note: For large files, we should chunk the text. For a simple MVP, we take the first 5000 chars.
        const chunk = textContent.slice(0, 5000);
        const embedding = await ai.generateEmbedding(chunk);

        // 2. Save to DB
        const doc = await db.createDocument({
            content: textContent,
            metadata: {
                filename: file.originalname,
                mimetype: file.mimetype,
                size: file.size
            },
            embedding,
            organization_id: orgId
        });

        // Cleanup
        await fs.remove(file.path);

        res.json({ message: "Document trained successfully", document: doc });
    } catch (err: any) {
        console.error("Training Error:", err);
        if (req.file) await fs.remove(req.file.path);
        res.status(500).json({ error: err.message });
    }
});

// Delete a document
router.delete("/documents/:id", verifyToken, async (req, res) => {
    const orgId = getOrgId(req);
    const { id } = req.params;
    try {
        await db.deleteDocument(id, orgId);
        res.json({ message: "Document deleted" });
    } catch (err: any) {
        res.status(500).json({ error: err.message });
    }
});

export default router;
