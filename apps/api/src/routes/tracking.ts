import { Router, Request, Response } from "express";
import crypto from "crypto";
import { verifyToken } from "./auth";
import { validate } from "../middleware/validate";
import { supabase } from "../lib/supabase";
import { createTrackingLinkSchema, recordClickSchema } from "../schemas/facebookSchemas";

const router = Router();

// =====================================================
// Short Code Generation
// =====================================================

function generateShortCode(length: number = 8): string {
  const chars = "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789";
  let result = "";
  const randomBytes = crypto.randomBytes(length);
  for (let i = 0; i < length; i++) {
    result += chars[randomBytes[i] % chars.length];
  }
  return result;
}

// =====================================================
// Tracking Link Management (Protected Routes)
// =====================================================

/**
 * POST /api/tracking/links
 * Create a new tracking link
 */
router.post(
  "/links",
  verifyToken,
  validate(createTrackingLinkSchema),
  async (req: Request, res: Response) => {
    try {
      const orgId = (req as any).user.organizationId;
      const {
        destination_type,
        destination_phone,
        destination_url,
        default_message,
        utm_source,
        utm_medium,
        utm_campaign,
        utm_content,
        utm_term,
        campaign_name,
        fb_campaign_id,
        fb_ad_id,
        expires_at,
      } = req.body;

      // Validate destination based on type
      if (destination_type === "whatsapp" && !destination_phone) {
        return res.status(400).json({
          error: "Phone number is required for WhatsApp links",
        });
      }
      if (destination_type === "website" && !destination_url) {
        return res.status(400).json({
          error: "URL is required for website links",
        });
      }

      // Generate unique short code
      let shortCode = generateShortCode();
      let attempts = 0;
      const maxAttempts = 5;

      while (attempts < maxAttempts) {
        const { data: existing } = await supabase
          .from("tracking_links")
          .select("id")
          .eq("short_code", shortCode)
          .single();

        if (!existing) break;
        shortCode = generateShortCode();
        attempts++;
      }

      if (attempts >= maxAttempts) {
        return res.status(500).json({
          error: "Could not generate unique short code",
        });
      }

      // Create tracking link
      const { data, error } = await supabase
        .from("tracking_links")
        .insert({
          organization_id: orgId,
          short_code: shortCode,
          destination_type,
          destination_phone,
          destination_url,
          default_message,
          utm_source: utm_source || "facebook",
          utm_medium: utm_medium || "paid",
          utm_campaign,
          utm_content,
          utm_term,
          campaign_name,
          fb_campaign_id,
          fb_ad_id,
          expires_at,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      // Generate the full tracking URL
      const baseUrl = process.env.API_URL || process.env.FRONTEND_URL || "http://localhost:3001";
      const trackingUrl = `${baseUrl}/t/${shortCode}`;

      res.json({
        ok: true,
        data: {
          ...data,
          tracking_url: trackingUrl,
        },
      });
    } catch (error: any) {
      console.error("Error creating tracking link:", error);
      res.status(500).json({
        error: error.message || "Failed to create tracking link",
      });
    }
  }
);

/**
 * GET /api/tracking/links
 * Get all tracking links for the organization
 */
router.get("/links", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;

    const { data, error } = await supabase
      .from("tracking_links")
      .select("*")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false });

    if (error) throw error;

    const baseUrl = process.env.API_URL || process.env.FRONTEND_URL || "http://localhost:3001";

    const linksWithUrls = (data || []).map((link: any) => ({
      ...link,
      tracking_url: `${baseUrl}/t/${link.short_code}`,
    }));

    res.json({
      ok: true,
      data: linksWithUrls,
    });
  } catch (error: any) {
    console.error("Error fetching tracking links:", error);
    res.status(500).json({
      error: error.message || "Failed to fetch tracking links",
    });
  }
});

/**
 * GET /api/tracking/links/:id
 * Get a specific tracking link with stats
 */
router.get("/links/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;

    const { data: link, error } = await supabase
      .from("tracking_links")
      .select("*")
      .eq("organization_id", orgId)
      .eq("id", id)
      .single();

    if (error || !link) {
      return res.status(404).json({ error: "Tracking link not found" });
    }

    // Get click events for this link
    const { data: clicks } = await supabase
      .from("click_attribution_events")
      .select("id, clicked_at, converted_at, status, ip_address")
      .eq("short_code", link.short_code)
      .order("clicked_at", { ascending: false })
      .limit(100);

    const baseUrl = process.env.API_URL || process.env.FRONTEND_URL || "http://localhost:3001";

    res.json({
      ok: true,
      data: {
        ...link,
        tracking_url: `${baseUrl}/t/${link.short_code}`,
        recent_clicks: clicks || [],
      },
    });
  } catch (error: any) {
    console.error("Error fetching tracking link:", error);
    res.status(500).json({
      error: error.message || "Failed to fetch tracking link",
    });
  }
});

/**
 * DELETE /api/tracking/links/:id
 * Delete (deactivate) a tracking link
 */
router.delete("/links/:id", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { id } = req.params;

    const { error } = await supabase
      .from("tracking_links")
      .update({
        is_active: false,
        updated_at: new Date().toISOString(),
      })
      .eq("organization_id", orgId)
      .eq("id", id);

    if (error) throw error;

    res.json({
      ok: true,
      message: "Tracking link deactivated",
    });
  } catch (error: any) {
    console.error("Error deleting tracking link:", error);
    res.status(500).json({
      error: error.message || "Failed to delete tracking link",
    });
  }
});

/**
 * GET /api/tracking/events
 * Get click attribution events
 */
router.get("/events", verifyToken, async (req: Request, res: Response) => {
  try {
    const orgId = (req as any).user.organizationId;
    const { status, limit = 50, offset = 0 } = req.query;

    let query = supabase
      .from("click_attribution_events")
      .select("*, customers(name, phone)")
      .eq("organization_id", orgId)
      .order("clicked_at", { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (status) {
      query = query.eq("status", status as string);
    }

    const { data, error, count } = await query;

    if (error) throw error;

    res.json({
      ok: true,
      data: data || [],
      pagination: {
        limit: Number(limit),
        offset: Number(offset),
        total: count,
      },
    });
  } catch (error: any) {
    console.error("Error fetching attribution events:", error);
    res.status(500).json({
      error: error.message || "Failed to fetch attribution events",
    });
  }
});

/**
 * POST /api/tracking/generate-whatsapp-link
 * Quick endpoint to generate a WhatsApp tracking link
 */
router.post(
  "/generate-whatsapp-link",
  verifyToken,
  async (req: Request, res: Response) => {
    try {
      const orgId = (req as any).user.organizationId;
      const {
        phone,
        message,
        campaign_name,
        utm_source = "facebook",
        utm_medium = "paid",
        utm_campaign,
      } = req.body;

      if (!phone) {
        return res.status(400).json({ error: "Phone number is required" });
      }

      // Normalize phone number (remove non-digits, ensure country code)
      let normalizedPhone = phone.replace(/\D/g, "");
      if (!normalizedPhone.startsWith("20") && normalizedPhone.length === 10) {
        normalizedPhone = "20" + normalizedPhone; // Default to Egypt
      }

      // Generate short code
      const shortCode = generateShortCode();

      // Create tracking link
      const { data, error } = await supabase
        .from("tracking_links")
        .insert({
          organization_id: orgId,
          short_code: shortCode,
          destination_type: "whatsapp",
          destination_phone: normalizedPhone,
          default_message: message,
          utm_source,
          utm_medium,
          utm_campaign: utm_campaign || campaign_name,
          campaign_name,
          is_active: true,
        })
        .select()
        .single();

      if (error) throw error;

      const baseUrl = process.env.API_URL || process.env.FRONTEND_URL || "http://localhost:3001";
      const trackingUrl = `${baseUrl}/t/${shortCode}`;

      // Also generate direct wa.me link with UTM for fallback
      const waParams = new URLSearchParams();
      if (message) waParams.set("text", message);
      const directWaLink = `https://wa.me/${normalizedPhone}${
        waParams.toString() ? "?" + waParams.toString() : ""
      }`;

      res.json({
        ok: true,
        data: {
          tracking_url: trackingUrl,
          direct_wa_link: directWaLink,
          short_code: shortCode,
          phone: normalizedPhone,
        },
      });
    } catch (error: any) {
      console.error("Error generating WhatsApp link:", error);
      res.status(500).json({
        error: error.message || "Failed to generate tracking link",
      });
    }
  }
);

export default router;

// =====================================================
// Public Click Tracking Route (Separate - No Auth)
// This should be mounted at /t/:code in server.ts
// =====================================================

export async function handleTrackingRedirect(
  req: Request,
  res: Response
): Promise<void> {
  try {
    const { code } = req.params;
    const { fbclid, utm_source, utm_medium, utm_campaign, utm_content, utm_term } =
      req.query;

    // Find the tracking link
    const { data: link, error } = await supabase
      .from("tracking_links")
      .select("*")
      .eq("short_code", code)
      .eq("is_active", true)
      .single();

    if (error || !link) {
      res.status(404).send("Link not found or expired");
      return;
    }

    // Check expiry
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      res.status(410).send("Link has expired");
      return;
    }

    // Record the click
    const clickData: any = {
      organization_id: link.organization_id,
      short_code: code,
      phone: link.destination_phone,
      fbclid: fbclid as string,
      utm_source: (utm_source as string) || link.utm_source,
      utm_medium: (utm_medium as string) || link.utm_medium,
      utm_campaign: (utm_campaign as string) || link.utm_campaign,
      utm_content: (utm_content as string) || link.utm_content,
      utm_term: (utm_term as string) || link.utm_term,
      source_type: link.utm_source === "facebook" ? "facebook" : "other",
      source_campaign_name: link.campaign_name,
      ip_address: req.ip || req.headers["x-forwarded-for"],
      user_agent: req.headers["user-agent"],
      referrer_url: req.headers["referer"],
      status: "pending",
    };

    // Format fbc if fbclid exists
    if (fbclid) {
      clickData.fbc = `fb.1.${Date.now()}.${fbclid}`;
    }

    // Generate fbp (browser ID)
    clickData.fbp = `fb.1.${Date.now()}.${Math.floor(Math.random() * 10000000000)}`;

    await supabase.from("click_attribution_events").insert(clickData);

    // Update click count
    await supabase
      .from("tracking_links")
      .update({
        click_count: (link.click_count || 0) + 1,
        updated_at: new Date().toISOString(),
      })
      .eq("id", link.id);

    // Build destination URL
    let destinationUrl: string;

    if (link.destination_type === "whatsapp") {
      const waParams = new URLSearchParams();
      if (link.default_message) {
        waParams.set("text", link.default_message);
      }
      destinationUrl = `https://wa.me/${link.destination_phone}${
        waParams.toString() ? "?" + waParams.toString() : ""
      }`;
    } else if (link.destination_type === "messenger") {
      destinationUrl = `https://m.me/${link.destination_phone}`;
    } else {
      // Website - append UTM params
      const url = new URL(link.destination_url);
      if (utm_source || link.utm_source) url.searchParams.set("utm_source", (utm_source as string) || link.utm_source);
      if (utm_medium || link.utm_medium) url.searchParams.set("utm_medium", (utm_medium as string) || link.utm_medium);
      if (utm_campaign || link.utm_campaign) url.searchParams.set("utm_campaign", (utm_campaign as string) || link.utm_campaign);
      if (fbclid) url.searchParams.set("fbclid", fbclid as string);
      destinationUrl = url.toString();
    }

    // Set cookies for attribution
    if (fbclid) {
      res.cookie("_fbc", clickData.fbc, {
        maxAge: 90 * 24 * 60 * 60 * 1000, // 90 days
        httpOnly: true,
        sameSite: "lax",
      });
    }
    res.cookie("_fbp", clickData.fbp, {
      maxAge: 90 * 24 * 60 * 60 * 1000,
      httpOnly: true,
      sameSite: "lax",
    });

    // Redirect to destination
    res.redirect(302, destinationUrl);
  } catch (error) {
    console.error("Error handling tracking redirect:", error);
    res.status(500).send("An error occurred");
  }
}
