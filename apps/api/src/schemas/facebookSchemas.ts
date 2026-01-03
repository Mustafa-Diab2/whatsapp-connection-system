import { z } from "zod";

// =====================================================
// Facebook OAuth Schemas
// =====================================================

export const facebookOAuthCallbackSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({
    code: z.string().min(1, "Authorization code is required"),
    state: z.string().optional(),
  }),
  params: z.object({}).optional(),
});

export const facebookDisconnectPageSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({}).optional(),
  params: z.object({
    pageId: z.string().min(1, "Page ID is required"),
  }),
});

// =====================================================
// Facebook Page Management Schemas
// =====================================================

export const facebookPageSubscribeSchema = z.object({
  body: z.object({
    subscribed_fields: z
      .array(z.string())
      .default(["messages", "messaging_postbacks", "leadgen"]),
  }),
  query: z.object({}).optional(),
  params: z.object({
    pageId: z.string().min(1, "Page ID is required"),
  }),
});

export const facebookPageSchema = z.object({
  id: z.string(),
  page_id: z.string(),
  page_name: z.string(),
  page_picture_url: z.string().optional(),
  is_active: z.boolean(),
  webhook_subscribed: z.boolean(),
  token_expires_at: z.string().nullable(),
  last_synced_at: z.string().nullable(),
  created_at: z.string(),
});

// =====================================================
// Facebook Webhook Schemas
// =====================================================

export const facebookWebhookVerifySchema = z.object({
  body: z.object({}).optional(),
  query: z.object({
    "hub.mode": z.literal("subscribe"),
    "hub.verify_token": z.string(),
    "hub.challenge": z.string(),
  }),
  params: z.object({}).optional(),
});

// Messenger message structure
const messengerMessageSchema = z.object({
  mid: z.string().optional(),
  text: z.string().optional(),
  attachments: z
    .array(
      z.object({
        type: z.string(),
        payload: z.object({
          url: z.string().optional(),
        }).optional(),
      })
    )
    .optional(),
  quick_reply: z
    .object({
      payload: z.string(),
    })
    .optional(),
  referral: z
    .object({
      ref: z.string().optional(),
      source: z.string().optional(),
      type: z.string().optional(),
      ad_id: z.string().optional(),
      ads_context_data: z
        .object({
          ad_title: z.string().optional(),
          photo_url: z.string().optional(),
          video_url: z.string().optional(),
          post_id: z.string().optional(),
        })
        .optional(),
      ctwa_clid: z.string().optional(),
    })
    .optional(),
});

// Messenger messaging entry
const messengerMessagingSchema = z.object({
  sender: z.object({
    id: z.string(),
  }),
  recipient: z.object({
    id: z.string(),
  }),
  timestamp: z.number(),
  message: messengerMessageSchema.optional(),
  postback: z
    .object({
      title: z.string().optional(),
      payload: z.string(),
      referral: z
        .object({
          ref: z.string().optional(),
          source: z.string().optional(),
          type: z.string().optional(),
        })
        .optional(),
    })
    .optional(),
  referral: z
    .object({
      ref: z.string().optional(),
      source: z.string().optional(),
      type: z.string().optional(),
      ad_id: z.string().optional(),
    })
    .optional(),
});

// Lead gen webhook value
const leadgenValueSchema = z.object({
  leadgen_id: z.string(),
  page_id: z.string(),
  form_id: z.string().optional(),
  adgroup_id: z.string().optional(),
  ad_id: z.string().optional(),
  created_time: z.number(),
});

// Webhook entry structure
const webhookEntrySchema = z.object({
  id: z.string(),
  time: z.number(),
  messaging: z.array(messengerMessagingSchema).optional(),
  changes: z
    .array(
      z.object({
        field: z.string(),
        value: z.union([leadgenValueSchema, z.record(z.unknown())]),
      })
    )
    .optional(),
});

export const facebookWebhookEventSchema = z.object({
  object: z.enum(["page", "instagram", "whatsapp_business_account"]),
  entry: z.array(webhookEntrySchema),
});

// =====================================================
// Tracking Link Schemas
// =====================================================

export const createTrackingLinkSchema = z.object({
  body: z.object({
    destination_type: z.enum(["whatsapp", "messenger", "website"]),
    destination_phone: z.string().optional(),
    destination_url: z.string().url().optional(),
    default_message: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_content: z.string().optional(),
    utm_term: z.string().optional(),
    campaign_name: z.string().optional(),
    fb_campaign_id: z.string().optional(),
    fb_ad_id: z.string().optional(),
    expires_at: z.string().optional(),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

export const trackingLinkSchema = z.object({
  id: z.string(),
  short_code: z.string(),
  destination_type: z.string(),
  destination_phone: z.string().nullable(),
  destination_url: z.string().nullable(),
  default_message: z.string().nullable(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
  utm_content: z.string().nullable(),
  utm_term: z.string().nullable(),
  campaign_name: z.string().nullable(),
  click_count: z.number(),
  conversion_count: z.number(),
  is_active: z.boolean(),
  created_at: z.string(),
});

// =====================================================
// Click Attribution Schemas
// =====================================================

export const recordClickSchema = z.object({
  body: z.object({}).optional(),
  query: z.object({
    fbclid: z.string().optional(),
    utm_source: z.string().optional(),
    utm_medium: z.string().optional(),
    utm_campaign: z.string().optional(),
    utm_content: z.string().optional(),
    utm_term: z.string().optional(),
  }),
  params: z.object({
    code: z.string().min(1, "Short code is required"),
  }),
});

export const attributionEventSchema = z.object({
  id: z.string(),
  phone: z.string().nullable(),
  fbclid: z.string().nullable(),
  ctwa_clid: z.string().nullable(),
  source_type: z.string().nullable(),
  source_campaign_name: z.string().nullable(),
  utm_source: z.string().nullable(),
  utm_medium: z.string().nullable(),
  utm_campaign: z.string().nullable(),
  clicked_at: z.string(),
  converted_at: z.string().nullable(),
  status: z.string(),
});

// =====================================================
// Facebook Campaign Schemas (synced from FB)
// =====================================================

export const facebookCampaignSchema = z.object({
  id: z.string(),
  fb_campaign_id: z.string(),
  fb_campaign_name: z.string(),
  objective: z.string().nullable(),
  status: z.string().nullable(),
  daily_budget: z.number().nullable(),
  lifetime_budget: z.number().nullable(),
  insights: z.record(z.unknown()).optional(),
  last_synced_at: z.string().nullable(),
});

export const syncCampaignsSchema = z.object({
  body: z.object({
    ad_account_id: z.string().min(1, "Ad Account ID is required"),
  }),
  query: z.object({}).optional(),
  params: z.object({}).optional(),
});

// =====================================================
// Attribution Report Schemas
// =====================================================

export const attributionReportQuerySchema = z.object({
  body: z.object({}).optional(),
  query: z.object({
    start_date: z.string().optional(),
    end_date: z.string().optional(),
    source_type: z.string().optional(),
    campaign_name: z.string().optional(),
  }),
  params: z.object({}).optional(),
});

export const attributionReportSchema = z.object({
  source_type: z.string(),
  source_campaign_name: z.string().nullable(),
  customer_count: z.number(),
  customers_with_deals: z.number(),
  total_deal_value: z.number(),
  deal_count: z.number(),
  conversion_rate: z.number(),
});

// =====================================================
// Types
// =====================================================

export type FacebookOAuthCallback = z.infer<typeof facebookOAuthCallbackSchema>;
export type FacebookPageSubscribe = z.infer<typeof facebookPageSubscribeSchema>;
export type FacebookWebhookEvent = z.infer<typeof facebookWebhookEventSchema>;
export type CreateTrackingLink = z.infer<typeof createTrackingLinkSchema>;
export type RecordClick = z.infer<typeof recordClickSchema>;
export type AttributionReportQuery = z.infer<typeof attributionReportQuerySchema>;
export type FacebookCampaign = z.infer<typeof facebookCampaignSchema>;
