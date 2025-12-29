import 'dotenv/config';
import { supabase } from './lib/supabase';

async function seedBotRules() {
    console.log('--- Seeding Local Bot Rules ---');

    // 1. Get all organizations
    const { data: orgs, error: orgError } = await supabase.from('organizations').select('id');

    if (orgError) {
        console.error('Error fetching organizations:', orgError);
        return;
    }

    if (!orgs || orgs.length === 0) {
        console.log('No organizations found.');
        return;
    }

    const defaultRules = [
        {
            trigger_keywords: ['سعر', 'بكام', 'تكلفة', 'اشتراك', 'باقة', 'أسعار'],
            response_text: 'أهلاً بك! لدينا 3 باقات رئيسية:\n1- الباقة الأساسية (للمشاريع الصغيرة)\n2- الباقة الاحترافية (للشركات المتوسطة)\n3- باقة الشركات (للحلول المخصصة)\nلمعرفة المزيد، يرجى كتابة اسم الباقة.',
            match_type: 'contains',
            priority: 10
        },
        {
            trigger_keywords: ['مشكلة', 'عطل', 'لا يعمل', 'خطأ', 'مساعدة', 'عالق'],
            response_text: 'نأسف لمواجهتك مشكلة تقنية. يرجى وصف المشكلة بالتفصيل أو إرسال صورة للخطأ، وسيقوم فريق الدعم الفني بمراجعتها والرد عليك في أسرع وقت.',
            match_type: 'contains',
            priority: 10
        },
        {
            trigger_keywords: ['سلام', 'مرحبا', 'هلو', 'صباح', 'مساء'],
            response_text: 'أهلاً بك في نظام Awfar CRM الذكي! 🤖\nأنا مساعدك الآلي، كيف يمكنني مساعدتك اليوم؟\n- للاستفسار عن الأسعار (اكتب "سعر")\n- للدعم الفني (اكتب "مساعدة")\n- للتحدث مع موظف (انتظر لحظات)',
            match_type: 'contains',
            priority: 5
        }
    ];

    for (const org of orgs) {
        console.log(`Processing Org: ${org.id}`);
        for (const rule of defaultRules) {
            const { error: insertError } = await supabase
                .from('bot_rules')
                .insert({
                    ...rule,
                    organization_id: org.id
                });

            if (insertError) {
                console.error(`Error inserting rule for org ${org.id}:`, insertError.message);
            } else {
                console.log(`Inserted rule: [${rule.trigger_keywords[0]}] for Org: ${org.id}`);
            }
        }

        // Also ensure bot_mode is set to 'hybrid' for these orgs to test
        await supabase
            .from('bot_config')
            .update({ bot_mode: 'hybrid' })
            .eq('organization_id', org.id);
    }

    console.log('--- Seeding Completed ---');
    process.exit(0);
}

seedBotRules();
