import { z } from "zod";

// Deals Schemas
export const createDealSchema = z.object({
    body: z.object({
        title: z.string().min(1, "عنوان الصفقة مطلوب"),
        value: z.number().min(0).optional(),
        customerId: z.string().optional().nullable().transform(val => val === "" ? null : val),
        stageId: z.string().min(1, "المرحلة مطلوبة"),
        priority: z.enum(['low', 'medium', 'high']).optional(),
        notes: z.string().optional(),
        tags: z.array(z.string()).optional(),
        expectedCloseDate: z.string().optional().nullable().transform(val => val === "" ? null : val)
    })
});

export const updateDealStageSchema = z.object({
    params: z.object({
        id: z.string().min(1, "معرف الصفقة غير صالح")
    }),
    body: z.object({
        stageId: z.string().min(1, "المرحلة الجديدة مطلوبة")
    })
});

// Campaigns Schemas
export const createCampaignSchema = z.object({
    body: z.object({
        name: z.string().min(1, "اسم الحملة مطلوب"),
        messageTemplate: z.string().min(1, "قالب الرسالة مطلوب"),
        targetGroup: z.string().optional(),
        action: z.enum(['save', 'send']).optional()
    })
});

export const sendCampaignSchema = z.object({
    params: z.object({
        id: z.string().min(1, "معرف الحملة غير صالح")
    })
});
