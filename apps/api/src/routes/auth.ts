import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { supabase } from "../lib/supabase";

const router = Router();

const JWT_SECRET = process.env.JWT_SECRET || "your-super-secret-key-change-in-production";
const JWT_EXPIRES_IN = "7d";

// Register
router.post("/register", async (req: Request, res: Response) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
        }

        // Check if user exists
        const { data: existingUser } = await supabase
            .from("users")
            .select("id")
            .eq("email", email)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: "هذا البريد الإلكتروني مسجل بالفعل" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // 1. Create Organization
        const { data: org, error: orgError } = await supabase
            .from("organizations")
            .insert({ name: `${name || email.split("@")[0]}'s Organization` })
            .select()
            .single();

        if (orgError) throw orgError;

        // 2. Create User linked to Organization
        const { data: user, error } = await supabase
            .from("users")
            .insert({
                email,
                password: hashedPassword,
                name: name || email.split("@")[0],
                organization_id: org.id,
                role: 'admin'
            })
            .select("id, email, name, organization_id, role, created_at")
            .single();

        if (error) throw error;

        // Generate token
        const token = jwt.sign({
            userId: user.id,
            email: user.email,
            organizationId: user.organization_id // Add organizationId to token
        }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
        });

        res.status(201).json({
            message: "تم إنشاء الحساب بنجاح",
            token,
            user,
        });
    } catch (error: any) {
        console.error("Register error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ في إنشاء الحساب" });
    }
});

// Login
router.post("/login", async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
        }

        // Find user
        const { data: user, error } = await supabase
            .from("users")
            .select("*")
            .eq("email", email)
            .single();

        if (!user) {
            return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
        }

        // Verify password
        const isValidPassword = await bcrypt.compare(password, user.password);
        if (!isValidPassword) {
            return res.status(401).json({ error: "بيانات الدخول غير صحيحة" });
        }

        // Generate token
        const token = jwt.sign({
            userId: user.id,
            email: user.email,
            organizationId: user.organization_id // Add organizationId to token
        }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
        });

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        res.json({
            message: "تم تسجيل الدخول بنجاح",
            token,
            user: userWithoutPassword,
        });
    } catch (error: any) {
        console.error("Login error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ في تسجيل الدخول" });
    }
});

// Verify token middleware
export const verifyToken = (req: Request, res: Response, next: Function) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.split(" ")[1];

    if (!token) {
        return res.status(401).json({ error: "غير مصرح - لا يوجد توكن" });
    }

    try {
        const decoded = jwt.verify(token, JWT_SECRET) as { userId: string; email: string };
        (req as any).user = decoded;
        next();
    } catch (error) {
        return res.status(403).json({ error: "توكن غير صالح" });
    }
};

// Get profile
router.get("/profile", verifyToken, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;

        const { data: user, error } = await supabase
            .from("users")
            .select("id, email, name, avatar, created_at")
            .eq("id", userId)
            .single();

        if (!user) {
            return res.status(404).json({ error: "المستخدم غير موجود" });
        }

        res.json({ user });
    } catch (error: any) {
        console.error("Profile error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ" });
    }
});

// Update profile
router.put("/profile", verifyToken, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { name } = req.body;

        const { data: user, error } = await supabase
            .from("users")
            .update({ name, updated_at: new Date().toISOString() })
            .eq("id", userId)
            .select("id, email, name, avatar, created_at")
            .single();

        if (error) throw error;

        res.json({ user, message: "تم تحديث الملف الشخصي" });
    } catch (error: any) {
        console.error("Update profile error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ" });
    }
});

// Change password
router.put("/change-password", verifyToken, async (req: Request, res: Response) => {
    try {
        const userId = (req as any).user.userId;
        const { currentPassword, newPassword } = req.body;

        // Get current user
        const { data: user } = await supabase
            .from("users")
            .select("password")
            .eq("id", userId)
            .single();

        if (!user) {
            return res.status(404).json({ error: "المستخدم غير موجود" });
        }

        // Verify current password
        const isValid = await bcrypt.compare(currentPassword, user.password);
        if (!isValid) {
            return res.status(400).json({ error: "كلمة المرور الحالية غير صحيحة" });
        }

        // Hash new password
        const hashedPassword = await bcrypt.hash(newPassword, 12);

        // Update password
        await supabase
            .from("users")
            .update({ password: hashedPassword, updated_at: new Date().toISOString() })
            .eq("id", userId);

        res.json({ message: "تم تغيير كلمة المرور بنجاح" });
    } catch (error: any) {
        console.error("Change password error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ" });
    }
});
// Add Team Member
router.post("/team/invite", verifyToken, async (req: Request, res: Response) => {
    try {
        const requesterId = (req as any).user.userId;
        const requesterOrgId = (req as any).user.organizationId;
        const { email, password, name, role } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
        }

        // Check requester role (optional, for now allow all valid users to invite)
        // const { data: requester } = await supabase.from('users').select('role').eq('id', requesterId).single();
        // if (requester?.role !== 'admin') return res.status(403).json({ error: "غير مصرح" });

        // Check if user exists
        const { data: existingUser } = await supabase
            .from("users")
            .select("id")
            .eq("email", email)
            .single();

        if (existingUser) {
            return res.status(400).json({ error: "هذا البريد الإلكتروني مسجل بالفعل" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create user in SAME organization
        const { data: user, error } = await supabase
            .from("users")
            .insert({
                email,
                password: hashedPassword,
                name: name || email.split("@")[0],
                organization_id: requesterOrgId,
                role: role || 'member'
            })
            .select("id, email, name, role, created_at")
            .single();

        if (error) throw error;

        res.status(201).json({
            message: "تم إضافة العضو بنجاح",
            user
        });
    } catch (error: any) {
        console.error("Invite error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ في إضافة العضو" });
    }
});

// Get Team Members
router.get("/team", verifyToken, async (req: Request, res: Response) => {
    try {
        const orgId = (req as any).user.organizationId;

        const { data: members, error } = await supabase
            .from("users")
            .select("id, name, email, role, created_at, avatar")
            .eq("organization_id", orgId)
            .order("created_at", { ascending: false });

        if (error) throw error;

        res.json({ members });
    } catch (error: any) {
        console.error("Get team error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ" });
    }
});

export default router;
