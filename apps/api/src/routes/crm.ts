import { Router, Request, Response } from "express";
import { db, supabase } from "../lib/supabase";
import { verifyToken } from "./auth";
import { validate } from "../middleware/validate";
import { createCustomerSchema, updateCustomerSchema } from "../schemas/customerSchemas";

const router = Router();

// Helper to extract orgId
const getOrgId = (req: Request): string => {
  return (req as any).user?.organizationId;
};

/**
 * Normalize phone number for database storage
 */
function normalizePhoneForDB(phone: string): string | null {
  if (!phone) return null;
  let cleanPhone = String(phone).replace(/\D/g, '');
  
  if (cleanPhone.length > 14) {
    const egyptMatch = cleanPhone.match(/(20[1][0-9]{9})/);
    if (egyptMatch) cleanPhone = egyptMatch[1];
    else if (cleanPhone.includes('966')) {
        const saudiMatch = cleanPhone.match(/(966[5][0-9]{8})/);
        if (saudiMatch) cleanPhone = saudiMatch[1];
        else return null;
    } else return null;
  }
  
  if (cleanPhone.startsWith('01') && cleanPhone.length === 11) cleanPhone = '20' + cleanPhone.substring(1);
  else if (cleanPhone.startsWith('1') && cleanPhone.length === 10) cleanPhone = '20' + cleanPhone;
  else if (cleanPhone.startsWith('05') && cleanPhone.length === 10) cleanPhone = '966' + cleanPhone.substring(1);
  else if (cleanPhone.startsWith('5') && cleanPhone.length === 9) cleanPhone = '966' + cleanPhone;

  if (cleanPhone.length < 10 || cleanPhone.length > 13) return null;
  return cleanPhone;
}

// ========== CUSTOMERS API ==========

router.get("/customers", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const customers = await db.getCustomers(orgId);
    res.json({ customers });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get customers" });
  }
});

router.get("/customers/phone/:phone", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  let { phone } = req.params;
  phone = phone.replace(/@c\.us$/, '').replace(/@s\.whatsapp\.net$/, '');

  try {
    const customer = await db.getCustomerByPhone(phone, orgId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json({ customer });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get customer" });
  }
});

router.get("/customers/:id", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { id } = req.params;
  try {
    const customer = await db.getCustomerById(id, orgId);
    if (!customer) return res.status(404).json({ message: "Customer not found" });
    res.json({ customer });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get customer" });
  }
});

router.post("/customers", verifyToken, validate(createCustomerSchema), async (req, res) => {
  const orgId = getOrgId(req);
  const { name, email, status, notes } = req.body;
  let { phone } = req.body;

  if (phone) {
    phone = normalizePhoneForDB(phone);
    if (!phone) return res.status(400).json({ message: "رقم الهاتف غير صالح" });
  }

  try {
    const customer = await db.createCustomer({ name, phone, email, status, notes, organization_id: orgId });
    res.json({ ok: true, customer });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create customer" });
  }
});

router.put("/customers/:id", verifyToken, validate(updateCustomerSchema), async (req, res) => {
  const orgId = getOrgId(req);
  const { id } = req.params;
  try {
    const customer = await db.updateCustomer(id, req.body, orgId);
    res.json({ ok: true, customer });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update customer" });
  }
});

router.delete("/customers/:id", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { id } = req.params;
  try {
    await db.deleteCustomer(id, orgId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to delete customer" });
  }
});

// ========== CONTACTS API ==========

router.get("/contacts", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  try {
    const contacts = await db.getContacts(orgId);
    res.json({ contacts });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to get contacts" });
  }
});

router.post("/contacts", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { name, phone, email, group } = req.body;
  try {
    const contact = await db.createContact({ name, phone, email, group_name: group, organization_id: orgId });
    res.json({ ok: true, contact });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to create contact" });
  }
});

router.put("/contacts/:id", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { id } = req.params;
  const updates = { ...req.body };
  if (updates.group) {
    updates.group_name = updates.group;
    delete updates.group;
  }
  try {
    const contact = await db.updateContact(id, updates, orgId);
    res.json({ ok: true, contact });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to update contact" });
  }
});

router.delete("/contacts/:id", verifyToken, async (req, res) => {
  const orgId = getOrgId(req);
  const { id } = req.params;
  try {
    await db.deleteContact(id, orgId);
    res.json({ ok: true });
  } catch (err: any) {
    res.status(500).json({ message: err?.message || "Failed to delete contact" });
  }
});

export default router;
