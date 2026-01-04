import { Router, Request, Response } from 'express';
import Stripe from 'stripe';
import { supabase } from '../lib/supabase';
import { z } from 'zod';

const router = Router();

// Get Stripe instance for organization
async function getStripeForOrg(organizationId: string): Promise<Stripe | null> {
  const { data: settings } = await supabase
    .from('payment_settings')
    .select('stripe_secret_key_encrypted')
    .eq('organization_id', organizationId)
    .single();

  if (!settings?.stripe_secret_key_encrypted) {
    // Fall back to environment variable
    if (process.env.STRIPE_SECRET_KEY) {
      return new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
    }
    return null;
  }

  return new Stripe(settings.stripe_secret_key_encrypted, { apiVersion: '2023-10-16' });
}

// Generate short code
function generateShortCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 8; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// =====================================================
// GET /api/payments/settings
// Get payment settings for organization
// =====================================================
router.get('/settings', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { data, error } = await supabase
      .from('payment_settings')
      .select('*')
      .eq('organization_id', organizationId)
      .single();

    if (error && error.code !== 'PGRST116') {
      throw error;
    }

    // Don't send encrypted keys to client
    if (data) {
      delete data.stripe_secret_key_encrypted;
      delete data.stripe_webhook_secret_encrypted;
      delete data.paymob_api_key_encrypted;
    }

    res.json({ settings: data || null });
  } catch (error: any) {
    console.error('Error fetching payment settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/payments/settings
// Update payment settings
// =====================================================
router.post('/settings', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const {
      provider,
      stripe_publishable_key,
      stripe_secret_key,
      stripe_webhook_secret,
      paymob_api_key,
      paymob_integration_id,
      default_currency,
      auto_send_payment_link,
      payment_link_expiry_hours,
    } = req.body;

    const updateData: any = {
      organization_id: organizationId,
      updated_at: new Date().toISOString(),
    };

    if (provider) updateData.provider = provider;
    if (stripe_publishable_key) updateData.stripe_publishable_key = stripe_publishable_key;
    if (stripe_secret_key) updateData.stripe_secret_key_encrypted = stripe_secret_key;
    if (stripe_webhook_secret) updateData.stripe_webhook_secret_encrypted = stripe_webhook_secret;
    if (paymob_api_key) updateData.paymob_api_key_encrypted = paymob_api_key;
    if (paymob_integration_id) updateData.paymob_integration_id = paymob_integration_id;
    if (default_currency) updateData.default_currency = default_currency;
    if (auto_send_payment_link !== undefined) updateData.auto_send_payment_link = auto_send_payment_link;
    if (payment_link_expiry_hours) updateData.payment_link_expiry_hours = payment_link_expiry_hours;

    const { data, error } = await supabase
      .from('payment_settings')
      .upsert(updateData, { onConflict: 'organization_id' })
      .select()
      .single();

    if (error) throw error;

    // Remove sensitive data before returning
    delete data.stripe_secret_key_encrypted;
    delete data.stripe_webhook_secret_encrypted;
    delete data.paymob_api_key_encrypted;

    res.json({ settings: data });
  } catch (error: any) {
    console.error('Error updating payment settings:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/payments/create-link
// Create a payment link
// =====================================================
router.post('/create-link', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { amount, description, invoice_id, order_id, customer_id, expires_in_hours = 72 } = req.body;

    if (!amount || !description) {
      return res.status(400).json({ error: 'Amount and description are required' });
    }

    const stripe = await getStripeForOrg(organizationId);
    if (!stripe) {
      return res.status(400).json({ error: 'Payment provider not configured' });
    }

    const shortCode = generateShortCode();
    const successUrl = `${process.env.FRONTEND_URL || 'https://web-one-nu-37.vercel.app'}/payment/success?code=${shortCode}`;
    const cancelUrl = `${process.env.FRONTEND_URL || 'https://web-one-nu-37.vercel.app'}/payment/cancel?code=${shortCode}`;

    // Create Stripe Checkout Session
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'egp',
          product_data: {
            name: description,
          },
          unit_amount: Math.round(amount * 100), // Stripe uses cents
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: successUrl,
      cancel_url: cancelUrl,
      expires_at: Math.floor(Date.now() / 1000) + (expires_in_hours * 60 * 60),
      metadata: {
        organization_id: organizationId,
        invoice_id: invoice_id || '',
        order_id: order_id || '',
        customer_id: customer_id || '',
        short_code: shortCode,
      },
    });

    // Save to database
    const { data: paymentLink, error } = await supabase
      .from('payment_links')
      .insert({
        organization_id: organizationId,
        invoice_id,
        order_id,
        customer_id,
        amount,
        currency: 'EGP',
        description,
        stripe_payment_link_id: session.id,
        payment_url: session.url,
        short_code: shortCode,
        expires_at: new Date(Date.now() + expires_in_hours * 60 * 60 * 1000).toISOString(),
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ 
      paymentLink,
      whatsappMessage: generatePaymentMessage(description, amount, session.url!)
    });
  } catch (error: any) {
    console.error('Error creating payment link:', error);
    res.status(500).json({ error: error.message });
  }
});

// Generate WhatsApp payment message
function generatePaymentMessage(description: string, amount: number, paymentUrl: string): string {
  return `🧾 *فاتورة جديدة*

📝 الوصف: ${description}
💰 المبلغ: ${amount.toFixed(2)} ج.م

للدفع اضغط على الرابط:
${paymentUrl}

⚡ الدفع آمن و سريع عبر البطاقة البنكية

شكراً لثقتكم 🙏`;
}

// =====================================================
// GET /api/payments/links
// Get all payment links for organization
// =====================================================
router.get('/links', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { status, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('payment_links')
      .select('*, customers(name, phone)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range((Number(page) - 1) * Number(limit), Number(page) * Number(limit) - 1);

    if (status) {
      query = query.eq('status', status);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ paymentLinks: data, total: count });
  } catch (error: any) {
    console.error('Error fetching payment links:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// GET /api/payments/link/:shortCode
// Get payment link by short code (public)
// =====================================================
router.get('/link/:shortCode', async (req: Request, res: Response) => {
  try {
    const { shortCode } = req.params;

    const { data, error } = await supabase
      .from('payment_links')
      .select('*')
      .eq('short_code', shortCode)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    res.json({ paymentLink: data });
  } catch (error: any) {
    console.error('Error fetching payment link:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/payments/webhook/stripe
// Stripe webhook handler
// =====================================================
router.post('/webhook/stripe', async (req: Request, res: Response) => {
  const sig = req.headers['stripe-signature'] as string;
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  if (!webhookSecret) {
    console.error('Stripe webhook secret not configured');
    return res.status(500).json({ error: 'Webhook not configured' });
  }

  let event: Stripe.Event;

  try {
    const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, { apiVersion: '2023-10-16' });
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err: any) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).json({ error: `Webhook Error: ${err.message}` });
  }

  // Handle the event
  switch (event.type) {
    case 'checkout.session.completed': {
      const session = event.data.object as Stripe.Checkout.Session;
      const shortCode = session.metadata?.short_code;

      if (shortCode) {
        // Update payment link status
        await supabase
          .from('payment_links')
          .update({ 
            status: 'paid', 
            paid_at: new Date().toISOString(),
            stripe_payment_intent_id: session.payment_intent as string,
          })
          .eq('short_code', shortCode);

        // Update invoice if linked
        if (session.metadata?.invoice_id) {
          await supabase
            .from('invoices')
            .update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('id', session.metadata.invoice_id);
        }

        // Update order if linked
        if (session.metadata?.order_id) {
          await supabase
            .from('orders')
            .update({ payment_status: 'paid' })
            .eq('id', session.metadata.order_id);
        }

        console.log(`Payment completed for ${shortCode}`);
      }
      break;
    }

    case 'checkout.session.expired': {
      const session = event.data.object as Stripe.Checkout.Session;
      const shortCode = session.metadata?.short_code;

      if (shortCode) {
        await supabase
          .from('payment_links')
          .update({ status: 'expired' })
          .eq('short_code', shortCode);

        console.log(`Payment expired for ${shortCode}`);
      }
      break;
    }
  }

  res.json({ received: true });
});

// =====================================================
// POST /api/payments/send-to-customer
// Send payment link to customer via WhatsApp
// =====================================================
router.post('/send-to-customer', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { payment_link_id, customer_phone } = req.body;

    // Get payment link
    const { data: paymentLink, error } = await supabase
      .from('payment_links')
      .select('*')
      .eq('id', payment_link_id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !paymentLink) {
      return res.status(404).json({ error: 'Payment link not found' });
    }

    const message = generatePaymentMessage(
      paymentLink.description,
      paymentLink.amount,
      paymentLink.payment_url
    );

    // The message will be sent via the existing WhatsApp service
    // Just return the message for now
    res.json({ 
      success: true, 
      message,
      paymentLink 
    });
  } catch (error: any) {
    console.error('Error sending payment link:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
