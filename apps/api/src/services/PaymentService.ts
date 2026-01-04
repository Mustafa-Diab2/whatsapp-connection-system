import Stripe from "stripe";
import { supabase } from "../lib/supabase";

// Initialize Stripe
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY || "", {
  apiVersion: "2025-12-15.clover",
});

// =====================================================
// Types
// =====================================================
export interface PaymentLink {
  id: string;
  organization_id: string;
  invoice_id?: string;
  order_id?: string;
  customer_id?: string;
  amount: number;
  currency: string;
  description: string;
  stripe_payment_link_id?: string;
  stripe_payment_intent_id?: string;
  payment_url: string;
  short_code: string;
  status: "pending" | "paid" | "expired" | "cancelled";
  expires_at?: string;
  paid_at?: string;
  metadata?: Record<string, any>;
  created_at: string;
  updated_at: string;
}

export interface CreatePaymentLinkParams {
  organizationId: string;
  amount: number;
  currency?: string;
  description: string;
  invoiceId?: string;
  orderId?: string;
  customerId?: string;
  customerPhone?: string;
  customerName?: string;
  expiresInHours?: number;
  metadata?: Record<string, any>;
}

// =====================================================
// Payment Link Management
// =====================================================

/**
 * Create a payment link for an invoice/order
 */
export async function createPaymentLink(
  params: CreatePaymentLinkParams
): Promise<PaymentLink> {
  const {
    organizationId,
    amount,
    currency = "EGP",
    description,
    invoiceId,
    orderId,
    customerId,
    customerPhone,
    customerName,
    expiresInHours = 72,
    metadata = {},
  } = params;

  // Generate short code
  const shortCode = generateShortCode();
  
  // Calculate expiry
  const expiresAt = new Date();
  expiresAt.setHours(expiresAt.getHours() + expiresInHours);

  try {
    // Create Stripe Payment Link
    const stripeSession = await stripe.checkout.sessions.create({
      payment_method_types: ["card"],
      line_items: [
        {
          price_data: {
            currency: currency.toLowerCase(),
            product_data: {
              name: description,
              metadata: {
                organization_id: organizationId,
                invoice_id: invoiceId || "",
                order_id: orderId || "",
              },
            },
            unit_amount: Math.round(amount * 100), // Convert to cents
          },
          quantity: 1,
        },
      ],
      mode: "payment",
      success_url: `${process.env.FRONTEND_URL}/payment/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`,
      expires_at: Math.floor(expiresAt.getTime() / 1000),
      metadata: {
        organization_id: organizationId,
        invoice_id: invoiceId || "",
        order_id: orderId || "",
        customer_id: customerId || "",
        short_code: shortCode,
        ...metadata,
      },
      customer_email: undefined,
      phone_number_collection: {
        enabled: false,
      },
    });

    // Save to database
    const { data, error } = await supabase
      .from("payment_links")
      .insert({
        organization_id: organizationId,
        invoice_id: invoiceId,
        order_id: orderId,
        customer_id: customerId,
        amount,
        currency,
        description,
        stripe_payment_link_id: stripeSession.id,
        payment_url: stripeSession.url,
        short_code: shortCode,
        status: "pending",
        expires_at: expiresAt.toISOString(),
        metadata: {
          customer_phone: customerPhone,
          customer_name: customerName,
          ...metadata,
        },
      })
      .select()
      .single();

    if (error) throw error;
    return data;
  } catch (error: any) {
    console.error("Error creating payment link:", error);
    throw new Error(`Failed to create payment link: ${error.message}`);
  }
}

/**
 * Get payment link by short code
 */
export async function getPaymentLinkByShortCode(
  shortCode: string
): Promise<PaymentLink | null> {
  const { data, error } = await supabase
    .from("payment_links")
    .select("*")
    .eq("short_code", shortCode)
    .single();

  if (error || !data) return null;
  return data;
}

/**
 * Get payment links for organization
 */
export async function getPaymentLinks(
  organizationId: string,
  options: {
    status?: string;
    limit?: number;
    offset?: number;
  } = {}
): Promise<PaymentLink[]> {
  let query = supabase
    .from("payment_links")
    .select("*")
    .eq("organization_id", organizationId)
    .order("created_at", { ascending: false });

  if (options.status) {
    query = query.eq("status", options.status);
  }

  if (options.limit) {
    query = query.limit(options.limit);
  }

  if (options.offset) {
    query = query.range(options.offset, options.offset + (options.limit || 10) - 1);
  }

  const { data, error } = await query;
  if (error) throw error;
  return data || [];
}

/**
 * Handle Stripe webhook for payment completion
 */
export async function handleStripeWebhook(
  event: Stripe.Event
): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      await markPaymentAsPaid(session);
      break;
    }
    case "checkout.session.expired": {
      const session = event.data.object as Stripe.Checkout.Session;
      await markPaymentAsExpired(session.id);
      break;
    }
  }
}

/**
 * Mark payment as paid
 */
async function markPaymentAsPaid(session: Stripe.Checkout.Session): Promise<void> {
  const { error } = await supabase
    .from("payment_links")
    .update({
      status: "paid",
      paid_at: new Date().toISOString(),
      stripe_payment_intent_id: session.payment_intent as string,
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_payment_link_id", session.id);

  if (error) {
    console.error("Error updating payment status:", error);
    return;
  }

  // Get payment link details
  const { data: paymentLink } = await supabase
    .from("payment_links")
    .select("*")
    .eq("stripe_payment_link_id", session.id)
    .single();

  if (paymentLink) {
    // Update invoice status if linked
    if (paymentLink.invoice_id) {
      await supabase
        .from("invoices")
        .update({
          status: "paid",
          paid_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentLink.invoice_id);
    }

    // Update order status if linked
    if (paymentLink.order_id) {
      await supabase
        .from("orders")
        .update({
          payment_status: "paid",
          updated_at: new Date().toISOString(),
        })
        .eq("id", paymentLink.order_id);
    }

    // TODO: Send WhatsApp confirmation message
    console.log(`Payment completed for ${paymentLink.short_code}`);
  }
}

/**
 * Mark payment as expired
 */
async function markPaymentAsExpired(sessionId: string): Promise<void> {
  await supabase
    .from("payment_links")
    .update({
      status: "expired",
      updated_at: new Date().toISOString(),
    })
    .eq("stripe_payment_link_id", sessionId);
}

/**
 * Generate WhatsApp payment message
 */
export function generatePaymentMessage(
  paymentLink: PaymentLink,
  customerName?: string
): string {
  const formattedAmount = new Intl.NumberFormat("ar-EG", {
    style: "currency",
    currency: paymentLink.currency,
  }).format(paymentLink.amount);

  return `مرحباً ${customerName || "عزيزي العميل"} 👋

تم إنشاء رابط دفع لطلبك:

💰 المبلغ: ${formattedAmount}
📝 الوصف: ${paymentLink.description}

🔗 اضغط هنا للدفع:
${paymentLink.payment_url}

⏰ ينتهي الرابط خلال 72 ساعة

شكراً لثقتك بنا! 🙏`;
}

// =====================================================
// Utility Functions
// =====================================================

function generateShortCode(): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < 8; i++) {
    code += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return code;
}

/**
 * Verify Stripe webhook signature
 */
export function verifyWebhookSignature(
  payload: string | Buffer,
  signature: string
): Stripe.Event {
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET || "";
  return stripe.webhooks.constructEvent(payload, signature, webhookSecret);
}

export default {
  createPaymentLink,
  getPaymentLinkByShortCode,
  getPaymentLinks,
  handleStripeWebhook,
  verifyWebhookSignature,
  generatePaymentMessage,
};
