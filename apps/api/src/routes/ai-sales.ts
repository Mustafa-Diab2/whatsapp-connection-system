import express from "express";
import { supabase } from "../lib/supabase";
import { GoogleGenerativeAI } from "@google/generative-ai";

const router = express.Router();

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || "");

// Get AI product recommendations for a customer
router.post("/recommend", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { customer_id, context, max_products = 5 } = req.body;

    // Get customer data
    let customerData: any = {};
    if (customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select(`
          *,
          orders (
            id,
            total,
            status,
            created_at,
            order_items (product_id, quantity, products (name, category))
          )
        `)
        .eq("id", customer_id)
        .single();
      customerData = customer || {};
    }

    // Get all products
    const { data: products } = await supabase
      .from("products")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .limit(100);

    // Analyze purchase history
    const purchasedProducts = customerData.orders?.flatMap(
      (o: any) => o.order_items?.map((i: any) => i.products?.name) || []
    ).filter(Boolean) || [];

    const purchasedCategories = customerData.orders?.flatMap(
      (o: any) => o.order_items?.map((i: any) => i.products?.category) || []
    ).filter(Boolean) || [];

    // Use AI to generate recommendations
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `أنت مساعد مبيعات ذكي. قم بتحليل البيانات التالية واقترح أفضل ${max_products} منتجات للعميل.

بيانات العميل:
- الاسم: ${customerData.name || 'عميل جديد'}
- المنتجات المشتراة سابقاً: ${purchasedProducts.join('، ') || 'لا توجد مشتريات'}
- الفئات المفضلة: ${[...new Set(purchasedCategories)].join('، ') || 'غير محددة'}
- السياق الحالي: ${context || 'عام'}

المنتجات المتاحة:
${products?.map(p => `- ${p.name}: ${p.description || ''} (السعر: ${p.price} - الفئة: ${p.category || 'عام'})`).join('\n')}

أرجع JSON فقط بالشكل التالي:
{
  "recommendations": [
    {
      "product_id": "uuid",
      "product_name": "اسم المنتج",
      "reason": "سبب الاقتراح",
      "confidence": 0.95,
      "sales_pitch": "عرض مبيعات مقنع"
    }
  ],
  "cross_sell": [
    {
      "product_id": "uuid",
      "product_name": "اسم المنتج",
      "reason": "يكمل المنتجات السابقة"
    }
  ],
  "insights": {
    "customer_type": "نوع العميل",
    "buying_pattern": "نمط الشراء",
    "recommended_approach": "طريقة البيع المقترحة"
  }
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // Parse JSON from response
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let recommendations = { recommendations: [], cross_sell: [], insights: {} };
    
    if (jsonMatch) {
      try {
        recommendations = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }
    }

    // Log recommendation for analytics
    await supabase.from("ai_recommendations").insert({
      organization_id: organizationId,
      customer_id,
      recommendations: recommendations.recommendations,
      context,
      created_at: new Date().toISOString(),
    });

    res.json(recommendations);
  } catch (error) {
    console.error("Error getting recommendations:", error);
    res.status(500).json({ error: "Failed to get recommendations" });
  }
});

// Generate AI sales response
router.post("/response", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { customer_id, message, conversation_history = [], products_mentioned = [] } = req.body;

    // Get organization settings for tone
    const { data: settings } = await supabase
      .from("bot_config")
      .select("*")
      .eq("organization_id", organizationId)
      .single();

    // Get customer data if available
    let customerContext = "";
    if (customer_id) {
      const { data: customer } = await supabase
        .from("customers")
        .select("name, phone, orders(total, status)")
        .eq("id", customer_id)
        .single();

      if (customer) {
        const totalOrders = customer.orders?.length || 0;
        const totalSpent = customer.orders?.reduce((sum: number, o: any) => sum + (o.total || 0), 0) || 0;
        customerContext = `
العميل: ${customer.name}
عدد الطلبات السابقة: ${totalOrders}
إجمالي المشتريات: ${totalSpent} ج.م`;
      }
    }

    // Get mentioned products details
    let productsContext = "";
    if (products_mentioned.length > 0) {
      const { data: products } = await supabase
        .from("products")
        .select("*")
        .in("id", products_mentioned);

      if (products) {
        productsContext = `
المنتجات المذكورة:
${products.map(p => `- ${p.name}: ${p.description} (${p.price} ج.م)`).join('\n')}`;
      }
    }

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `أنت مساعد مبيعات محترف. أجب على رسالة العميل بطريقة ${settings?.tone || 'ودودة'} ومقنعة.

${customerContext}
${productsContext}

المحادثة السابقة:
${conversation_history.slice(-5).map((m: any) => `${m.role}: ${m.content}`).join('\n')}

رسالة العميل الحالية: ${message}

أهداف الرد:
1. الإجابة على استفسار العميل بدقة
2. اقتراح منتجات مناسبة إن أمكن
3. تشجيع العميل على الشراء بطريقة غير مزعجة
4. استخدام لغة عربية فصيحة وواضحة

أرجع JSON فقط:
{
  "response": "نص الرد",
  "intent": "نية العميل (استفسار/شراء/شكوى/عام)",
  "suggested_products": ["product_id1", "product_id2"],
  "follow_up_questions": ["سؤال متابعة 1"],
  "urgency": "low/medium/high",
  "action_needed": "إجراء مطلوب من الموظف"
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let aiResponse = {
      response: "عذراً، حدث خطأ. سأوصلك بموظف خدمة العملاء.",
      intent: "unknown",
      suggested_products: [],
      follow_up_questions: [],
      urgency: "low",
      action_needed: null,
    };
    
    if (jsonMatch) {
      try {
        aiResponse = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error("Failed to parse AI response:", e);
      }
    }

    res.json(aiResponse);
  } catch (error) {
    console.error("Error generating response:", error);
    res.status(500).json({ error: "Failed to generate response" });
  }
});

// Analyze customer sentiment
router.post("/sentiment", async (req, res) => {
  try {
    const { messages } = req.body;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `حلل المشاعر في الرسائل التالية وأرجع JSON:

الرسائل:
${messages.map((m: string, i: number) => `${i + 1}. ${m}`).join('\n')}

أرجع:
{
  "overall_sentiment": "positive/neutral/negative",
  "sentiment_score": 0.0 to 1.0,
  "emotions": ["سعادة", "غضب", etc],
  "key_concerns": ["قلق 1", "قلق 2"],
  "satisfaction_level": "راضي جداً/راضي/محايد/غير راضي/غاضب",
  "recommendation": "توصية للتعامل مع العميل"
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let sentiment = {
      overall_sentiment: "neutral",
      sentiment_score: 0.5,
      emotions: [],
      key_concerns: [],
      satisfaction_level: "محايد",
      recommendation: "",
    };
    
    if (jsonMatch) {
      try {
        sentiment = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error("Failed to parse sentiment:", e);
      }
    }

    res.json(sentiment);
  } catch (error) {
    console.error("Error analyzing sentiment:", error);
    res.status(500).json({ error: "Failed to analyze sentiment" });
  }
});

// Generate upsell/cross-sell suggestions during conversation
router.post("/upsell", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { cart_items, customer_id } = req.body;

    // Get cart product details
    const productIds = cart_items.map((i: any) => i.product_id);
    const { data: cartProducts } = await supabase
      .from("products")
      .select("*")
      .in("id", productIds);

    // Get all products for suggestions
    const { data: allProducts } = await supabase
      .from("products")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("active", true)
      .not("id", "in", `(${productIds.join(",")})`);

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `أنت خبير مبيعات. العميل لديه هذه المنتجات في السلة:
${cartProducts?.map(p => `- ${p.name} (${p.category})`).join('\n')}

المنتجات المتاحة الأخرى:
${allProducts?.slice(0, 20).map(p => `- ${p.id}: ${p.name} (${p.category}) - ${p.price} ج.م`).join('\n')}

اقترح:
1. منتجات تكميلية (Cross-sell) تناسب ما في السلة
2. منتجات أعلى قيمة (Upsell) كبديل

أرجع JSON:
{
  "cross_sell": [
    {"product_id": "uuid", "reason": "سبب", "pitch": "عرض مقنع"}
  ],
  "upsell": [
    {"product_id": "uuid", "reason": "سبب", "pitch": "عرض مقنع"}
  ],
  "bundle_suggestion": {
    "name": "اسم الحزمة",
    "products": ["uuid1", "uuid2"],
    "discount_suggestion": 10
  }
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let suggestions = { cross_sell: [], upsell: [], bundle_suggestion: null };
    
    if (jsonMatch) {
      try {
        suggestions = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error("Failed to parse upsell suggestions:", e);
      }
    }

    res.json(suggestions);
  } catch (error) {
    console.error("Error getting upsell suggestions:", error);
    res.status(500).json({ error: "Failed to get suggestions" });
  }
});

// Auto-generate product descriptions
router.post("/generate-description", async (req, res) => {
  try {
    const { product_name, category, features, target_audience, tone = "professional" } = req.body;

    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `اكتب وصفاً تسويقياً مقنعاً لهذا المنتج:

اسم المنتج: ${product_name}
الفئة: ${category || 'عام'}
المميزات: ${features?.join('، ') || 'غير محددة'}
الجمهور المستهدف: ${target_audience || 'عام'}
نبرة الكتابة: ${tone}

أرجع JSON:
{
  "short_description": "وصف قصير (سطر واحد)",
  "full_description": "وصف كامل (2-3 فقرات)",
  "bullet_points": ["ميزة 1", "ميزة 2", "ميزة 3"],
  "seo_title": "عنوان للسيو",
  "seo_description": "وصف للسيو",
  "hashtags": ["#هاشتاق1", "#هاشتاق2"]
}`;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    const jsonMatch = responseText.match(/\{[\s\S]*\}/);
    let description = {
      short_description: "",
      full_description: "",
      bullet_points: [],
      seo_title: "",
      seo_description: "",
      hashtags: [],
    };
    
    if (jsonMatch) {
      try {
        description = JSON.parse(jsonMatch[0]);
      } catch (e) {
        console.error("Failed to parse description:", e);
      }
    }

    res.json(description);
  } catch (error) {
    console.error("Error generating description:", error);
    res.status(500).json({ error: "Failed to generate description" });
  }
});

// Get sales insights for dashboard
router.get("/insights", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];

    // Get recent orders
    const { data: orders } = await supabase
      .from("orders")
      .select(`
        *,
        order_items (product_id, quantity, price, products (name, category))
      `)
      .eq("organization_id", organizationId)
      .gte("created_at", new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false });

    // Get customer data
    const { data: customers } = await supabase
      .from("customers")
      .select("*")
      .eq("organization_id", organizationId);

    // Calculate metrics
    const totalRevenue = orders?.reduce((sum, o) => sum + (o.total || 0), 0) || 0;
    const avgOrderValue = orders?.length ? totalRevenue / orders.length : 0;
    
    // Product performance
    const productSales: Record<string, { name: string; quantity: number; revenue: number }> = {};
    orders?.forEach(order => {
      order.order_items?.forEach((item: any) => {
        const id = item.product_id;
        if (!productSales[id]) {
          productSales[id] = { name: item.products?.name || 'Unknown', quantity: 0, revenue: 0 };
        }
        productSales[id].quantity += item.quantity;
        productSales[id].revenue += item.price * item.quantity;
      });
    });

    const topProducts = Object.entries(productSales)
      .sort((a, b) => b[1].revenue - a[1].revenue)
      .slice(0, 5)
      .map(([id, data]) => ({ id, ...data }));

    // Customer segments
    const segments = {
      new: customers?.filter(c => {
        const created = new Date(c.created_at);
        return created > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      }).length || 0,
      active: customers?.filter(c => c.last_activity && 
        new Date(c.last_activity) > new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ).length || 0,
      dormant: customers?.filter(c => !c.last_activity || 
        new Date(c.last_activity) < new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
      ).length || 0,
    };

    res.json({
      metrics: {
        total_revenue: totalRevenue,
        avg_order_value: avgOrderValue,
        total_orders: orders?.length || 0,
        total_customers: customers?.length || 0,
      },
      top_products: topProducts,
      customer_segments: segments,
      trends: {
        revenue_change: 0, // Would need historical data
        orders_change: 0,
      },
    });
  } catch (error) {
    console.error("Error getting insights:", error);
    res.status(500).json({ error: "Failed to get insights" });
  }
});

export default router;
