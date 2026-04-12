import { Router, Request, Response } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { getSupabase } from "../lib/supabase";

const router = Router();
import { validate } from "../middleware/validate";
import { registerSchema, loginSchema } from "../schemas/authSchemas";

const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
    throw new Error("FATAL ERROR: JWT_SECRET is not defined in environment variables.");
}
const JWT_EXPIRES_IN = "7d";

const setAuthCookie = (res: Response, token: string) => {
    res.cookie("token", token, {
        httpOnly: true,
        secure: process.env.NODE_ENV === "production",
        sameSite: "lax", // Better for redirect flows, strict might block some links
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
    });
};

// Register
router.post("/register", validate(registerSchema), async (req: Request, res: Response) => {
    try {
        const { email, password, name } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
        }

        // Check if user exists
        const { data: existingUser, error: checkError } = await getSupabase()
            .from("users")
            .select("id")
            .eq("email", email)
            .maybeSingle();

        if (checkError) {
            console.error("User check error:", checkError);
            return res.status(500).json({ error: "خطأ في التحقق من البيانات" });
        }

        if (existingUser) {
            return res.status(400).json({ error: "هذا البريد الإلكتروني مسجل بالفعل" });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // 1. Create Organization
        const { data: org, error: orgError } = await getSupabase()
            .from("organizations")
            .insert({ name: `${name || email.split("@")[0]}'s Organization` })
            .select()
            .single();

        if (orgError) throw orgError;

        // 2. Create User linked to Organization
        const { data: user, error } = await getSupabase()
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
            organizationId: user.organization_id,
            role: user.role // Include role to avoid extra DB query
        }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
        });

        setAuthCookie(res, token);

        res.status(201).json({
            message: "تم إنشاء الحساب بنجاح",
            token, // Keep sending token for backward compatibility
            user,
        });
    } catch (error: any) {
        console.error("Register error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ في إنشاء الحساب" });
    }
});

// Login
router.post("/login", validate(loginSchema), async (req: Request, res: Response) => {
    try {
        const { email, password } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
        }

        // Find user
        const { data: user, error } = await getSupabase()
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
            organizationId: user.organization_id,
            role: user.role // Include role to avoid extra DB query
        }, JWT_SECRET, {
            expiresIn: JWT_EXPIRES_IN,
        });

        // Remove password from response
        const { password: _, ...userWithoutPassword } = user;

        // Check organization status (if not super_admin)
        if (user.role !== 'super_admin' && user.organization_id) {
            const { data: org } = await getSupabase().from('organizations').select('status').eq('id', user.organization_id).single();
            if (org?.status === 'suspended') {
                return res.status(403).json({ error: "هذا الحساب موقوف حالياً، يرجى التواصل مع الدعم" });
            }
        }

        setAuthCookie(res, token);
        
        // Log basic info (removed broken logAudit)
        console.log(`[Auth] User logged in: ${email}`);

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
    let token = req.cookies?.token;

    if (!token) {
        const authHeader = req.headers.authorization;
        token = authHeader?.split(" ")[1];
    }

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

        const { data: user, error } = await getSupabase()
            .from("users")
            .select("id, email, name, phone, avatar, role, allowed_pages, created_at")
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
        const { name, phone } = req.body;

        const { data: user, error } = await getSupabase()
            .from("users")
            .update({ name, phone, updated_at: new Date().toISOString() })
            .eq("id", userId)
            .select("id, email, name, phone, avatar, created_at")
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
        const { data: user } = await getSupabase()
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
        await getSupabase()
            .from("users")
            .update({ password: hashedPassword, updated_at: new Date().toISOString() })
            .eq("id", userId);

        res.json({ message: "تم تغيير كلمة المرور بنجاح" });
    } catch (error: any) {
        console.error("Change password error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ" });
    }
});

// ==========================================
// SUPER ADMIN ROUTES
// ==========================================

const verifySuperAdmin = async (req: Request, res: Response, next: Function) => {
    const user = (req as any).user;
    if (!user) return res.status(401).json({ error: "غير مصرح" });

    // Fast path: check role from JWT payload (no DB query needed)
    if (user.role === 'super_admin') {
        return next();
    }

    // Fallback: check DB for older tokens that don't have role in payload
    const { data: userData } = await getSupabase().from('users').select('role').eq('id', user.userId).single();
    if (userData?.role !== 'super_admin') {
        return res.status(403).json({ error: "غير مصرح - يتطلب صلاحية سوبر أدمن" });
    }
    next();
};

// 1. Get all organizations (Super Admin only)
router.get("/super/organizations", verifyToken, verifySuperAdmin, async (req: Request, res: Response) => {
    try {
        const { data: orgs, error } = await getSupabase()
            .from("organizations")
            .select(`
                *,
                admin:users(id, email, name, role)
            `)
            .order("created_at", { ascending: false });

        if (error) throw error;

        // Count members for each org
        const orgsWithCounts = await Promise.all(orgs.map(async (org) => {
            const { count } = await getSupabase()
                .from('users')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', org.id);

            // Re-fetch allowed_pages from settings or user? 
            // In the user request, allowed_pages was on user. 
            // Mostafa wants to define it for "the email" (the admin account).
            const mainAdmin = org.admin?.find((u: any) => u.role === 'admin');

            return { ...org, memberCount: count, mainAdmin };
        }));

        res.json({ organizations: orgsWithCounts });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 2. Create Organization and Admin (Super Admin only)
router.post("/super/organizations", verifyToken, verifySuperAdmin, async (req: Request, res: Response) => {
    try {
        const { name, adminEmail, adminPassword, adminName, member_limit, status, allowed_pages } = req.body;

        // 1. Create Org
        const { data: org, error: orgError } = await getSupabase()
            .from("organizations")
            .insert({ name, member_limit: member_limit || 10, status: status || 'active' })
            .select()
            .single();

        if (orgError) throw orgError;

        // 2. Create Admin
        const hashedPassword = await bcrypt.hash(adminPassword, 12);
        const { data: user, error: userError } = await getSupabase()
            .from("users")
            .insert({
                email: adminEmail,
                password: hashedPassword,
                name: adminName,
                organization_id: org.id,
                role: 'admin',
                allowed_pages: allowed_pages || null
            })
            .select("id, email, name, role, allowed_pages")
            .single();

        if (userError) throw userError;

        res.status(201).json({ message: "تم إنشاء المنظمة والأدمن بنجاح", org, user });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 3. Update Organization (Status, Limit)
router.put("/super/organizations/:orgId", verifyToken, verifySuperAdmin, async (req: Request, res: Response) => {
    try {
        const { orgId } = req.params;
        const { name, status, member_limit } = req.body;

        const { data: org, error } = await getSupabase()
            .from("organizations")
            .update({ name, status, member_limit, updated_at: new Date().toISOString() })
            .eq("id", orgId)
            .select()
            .single();

        if (error) throw error;

        res.json({ message: "تم تحديث المنظمة بنجاح", org });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// 4. Delete Organization (Super Admin only)
router.delete("/super/organizations/:orgId", verifyToken, verifySuperAdmin, async (req: Request, res: Response) => {
    const { orgId } = req.params;
    try {

        console.log(`[SuperAdmin] Hard deleting organization: ${orgId}`);

        // 1. Delete all related data manually to satisfy foreign key constraints
        const tablesToDelete = [
            'messages',
            'campaign_logs',
            'campaigns',
            'quick_replies',
            'deals',
            'documents',
            'contacts',
            'customers',
            'loyalty_transactions',
            'users' // Users should be last before Org
        ];

        for (const table of tablesToDelete) {
            const { error: deleteError } = await getSupabase()
                .from(table)
                .delete()
                .eq("organization_id", orgId);

            if (deleteError) {
                console.warn(`[SuperAdmin] Clean-up warning in ${table}:`, deleteError.message);
                // We continue to try others
            }
        }

        // 2. Finally, delete the organization
        const { error: orgError } = await getSupabase()
            .from("organizations")
            .delete()
            .eq("id", orgId);

        if (orgError) throw orgError;

        res.json({ message: "تم حذف المنظمة وجميع بياناتها (العملاء، الرسائل، المستخدمين) بنجاح" });
    } catch (error: any) {
        console.error(`[SuperAdmin] Failed to delete org ${orgId}:`, error);
        res.status(500).json({ error: error.message });
    }
});

// 5. Update Admin User (allowed_pages)
router.put("/super/users/:userId", verifyToken, verifySuperAdmin, async (req: Request, res: Response) => {
    try {
        const { userId } = req.params;
        const { name, role, allowed_pages } = req.body;

        const { data: user, error } = await getSupabase()
            .from("users")
            .update({ name, role, allowed_pages, updated_at: new Date().toISOString() })
            .eq("id", userId)
            .select("id, email, name, role, allowed_pages")
            .single();

        if (error) throw error;

        res.json({ message: "تم تحديث المستخدم بنجاح", user });
    } catch (error: any) {
        res.status(500).json({ error: error.message });
    }
});

// Add Team Member
router.post("/team/invite", verifyToken, async (req: Request, res: Response) => {
    try {
        const requesterId = (req as any).user.userId;
        const requesterOrgId = (req as any).user.organizationId;
        const { email, password, name, role, allowed_pages } = req.body;

        if (!email || !password) {
            return res.status(400).json({ error: "البريد الإلكتروني وكلمة المرور مطلوبان" });
        }

        // Check requester role and member limit
        const { data: requester } = await getSupabase().from('users').select('role, organization_id').eq('id', requesterId).single();
        if (requester?.role !== 'admin' && requester?.role !== 'super_admin') {
            return res.status(403).json({ error: "غير مصرح - فقط الأدمن يمكنه إضافة أعضاء" });
        }

        // Check member limit for this organization
        const { data: org } = await getSupabase().from('organizations').select('member_limit').eq('id', requesterOrgId).single();
        const { count } = await getSupabase().from('users').select('*', { count: 'exact', head: true }).eq('organization_id', requesterOrgId);

        if (org && count !== null && count >= org.member_limit) {
            return res.status(400).json({ error: `لقد وصلت للحد الأقصى للأعضاء (${org.member_limit})` });
        }

        // Check if user exists
        const { data: existingUser } = await getSupabase()
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
        const { data: user, error } = await getSupabase()
            .from("users")
            .insert({
                email,
                password: hashedPassword,
                name: name || email.split("@")[0],
                organization_id: requesterOrgId,
                role: role || 'member',
                allowed_pages: allowed_pages || null
            })
            .select("id, email, name, role, allowed_pages, created_at")
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

        const { data: members, error } = await getSupabase()
            .from("users")
            .select("id, name, email, role, allowed_pages, created_at, avatar")
            .eq("organization_id", orgId)
            .order("created_at", { ascending: false });

        if (error) throw error;

        res.json({ members });
    } catch (error: any) {
        console.error("Get team error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ" });
    }
});

// Update Team Member
router.put("/team/:memberId", verifyToken, async (req: Request, res: Response) => {
    try {
        const requesterId = (req as any).user.userId;
        const orgId = (req as any).user.organizationId;
        const { memberId } = req.params;
        const { name, role, allowed_pages } = req.body;

        // Check if requester is admin
        const { data: requester } = await getSupabase()
            .from("users")
            .select("role")
            .eq("id", requesterId)
            .single();

        if (requester?.role !== 'admin') {
            return res.status(403).json({ error: "غير مصرح - فقط الأدمن يمكنه تعديل الأعضاء" });
        }

        // Verify member belongs to same organization
        const { data: member } = await getSupabase()
            .from("users")
            .select("id, organization_id")
            .eq("id", memberId)
            .eq("organization_id", orgId)
            .single();

        if (!member) {
            return res.status(404).json({ error: "العضو غير موجود" });
        }

        // Update member
        const { data: updatedMember, error } = await getSupabase()
            .from("users")
            .update({
                name,
                role,
                allowed_pages,
                updated_at: new Date().toISOString()
            })
            .eq("id", memberId)
            .select("id, name, email, role, allowed_pages, created_at")
            .single();

        if (error) throw error;

        res.json({
            message: "تم تحديث العضو بنجاح",
            member: updatedMember
        });
    } catch (error: any) {
        console.error("Update member error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ في تحديث العضو" });
    }
});

// Delete Team Member
router.delete("/team/:memberId", verifyToken, async (req: Request, res: Response) => {
    try {
        const requesterId = (req as any).user.userId;
        const orgId = (req as any).user.organizationId;
        const { memberId } = req.params;

        // Can't delete yourself
        if (requesterId === memberId) {
            return res.status(400).json({ error: "لا يمكنك حذف نفسك" });
        }

        // Check if requester is admin
        const { data: requester } = await getSupabase()
            .from("users")
            .select("role")
            .eq("id", requesterId)
            .single();

        if (requester?.role !== 'admin') {
            return res.status(403).json({ error: "غير مصرح - فقط الأدمن يمكنه حذف الأعضاء" });
        }

        // Verify member belongs to same organization
        const { data: member } = await getSupabase()
            .from("users")
            .select("id, organization_id, role")
            .eq("id", memberId)
            .eq("organization_id", orgId)
            .single();

        if (!member) {
            return res.status(404).json({ error: "العضو غير موجود" });
        }

        // Delete member
        const { error } = await getSupabase()
            .from("users")
            .delete()
            .eq("id", memberId);

        if (error) throw error;

        res.json({ message: "تم حذف العضو بنجاح" });
    } catch (error: any) {
        console.error("Delete member error:", error);
        res.status(500).json({ error: error.message || "حدث خطأ في حذف العضو" });
    }
});
// PASSWORD RECOVERYFLOW
// ==========================================

// Dummy Forgot Password (generates token, logs it - real implementation needs mailer)
router.post("/forgot-password", async (req: Request, res: Response) => {
    try {
        const { email } = req.body;
        if (!email) return res.status(400).json({ error: "البريد الإلكتروني مطلوب" });

        const { data: user } = await getSupabase().from('users').select('id, email, name').eq('email', email).single();
        if (!user) {
            // Security: don't reveal if user exists, but here we can be helpful for dev
            return res.json({ message: "إذا كان الحساب موجوداً، فستصلك رسالة قريباً" });
        }

        // Generate reset token (valid for 1 hour)
        const resetToken = jwt.sign({ userId: user.id, action: 'reset_password' }, JWT_SECRET, { expiresIn: '1h' });
        
        // Log to Audit (Placeholder for Email)
        console.log(`[AUTH] Password reset requested for ${email}. Token: ${resetToken}`);
        // Removed broken logAudit
        console.log(`[Auth] User updated phone: ${user.id}`);

        // IN PRODUCTION: Send email with resetToken in URL
        res.json({ message: "تم إرسال تعليمات استعادة كلمة المرور إلى بريدك" });
    } catch (err: any) {
        res.status(500).json({ error: "حدث خطأ غير متوقع" });
    }
});

// Reset Password
router.post("/reset-password", async (req: Request, res: Response) => {
    try {
        const { token, newPassword } = req.body;
        if (!token || !newPassword) return res.status(400).json({ error: "التوكن وكلمة المرور الجديدة مطلوبان" });

        const decoded = jwt.verify(token, JWT_SECRET) as any;
        if (decoded.action !== 'reset_password') {
            return res.status(400).json({ error: "توكن غير صالح لهذا الإجراء" });
        }

        const hashedPassword = await bcrypt.hash(newPassword, 12);
        const { error } = await getSupabase().from('users').update({ password: hashedPassword }).eq('id', decoded.userId);

        if (error) throw error;

        console.log(`[Auth] Password reset success: ${decoded.userId}`);
        res.json({ message: "تمت إعادة تعيين كلمة المرور بنجاح" });
    } catch (err: any) {
        res.status(400).json({ error: "التوكن منتهي الصلاحية أو غير صالح" });
    }
});

export default router;

