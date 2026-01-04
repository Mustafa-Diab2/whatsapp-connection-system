import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';
import { z } from 'zod';

const router = Router();

// Generate short code
function generateShortCode(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  let result = '';
  for (let i = 0; i < 6; i++) {
    result += chars.charAt(Math.floor(Math.random() * chars.length));
  }
  return result;
}

// =====================================================
// GET /api/catalogs
// Get all catalogs for organization
// =====================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { data, error } = await supabase
      .from('product_catalogs')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ catalogs: data });
  } catch (error: any) {
    console.error('Error fetching catalogs:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/catalogs
// Create a new catalog
// =====================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { name, description, product_ids, show_prices, show_stock, theme_color, cover_image } = req.body;

    const shortCode = generateShortCode();
    const shareUrl = `${process.env.FRONTEND_URL || 'https://web-one-nu-37.vercel.app'}/shop/${shortCode}`;

    const { data, error } = await supabase
      .from('product_catalogs')
      .insert({
        organization_id: organizationId,
        name,
        description,
        short_code: shortCode,
        share_url: shareUrl,
        product_ids: product_ids || [],
        show_prices: show_prices ?? true,
        show_stock: show_stock ?? false,
        theme_color: theme_color || '#3B82F6',
        cover_image,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ catalog: data });
  } catch (error: any) {
    console.error('Error creating catalog:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// PUT /api/catalogs/:id
// Update a catalog
// =====================================================
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('product_catalogs')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;

    res.json({ catalog: data });
  } catch (error: any) {
    console.error('Error updating catalog:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// DELETE /api/catalogs/:id
// Delete a catalog
// =====================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('product_catalogs')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting catalog:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// GET /api/catalogs/public/:shortCode
// Get public catalog (no auth required)
// =====================================================
router.get('/public/:shortCode', async (req: Request, res: Response) => {
  try {
    const { shortCode } = req.params;

    // Get catalog
    const { data: catalog, error: catalogError } = await supabase
      .from('product_catalogs')
      .select('*')
      .eq('short_code', shortCode)
      .eq('is_active', true)
      .single();

    if (catalogError || !catalog) {
      return res.status(404).json({ error: 'Catalog not found' });
    }

    // Increment view count
    await supabase
      .from('product_catalogs')
      .update({ view_count: (catalog.view_count || 0) + 1 })
      .eq('id', catalog.id);

    // Get products
    let products = [];
    if (catalog.product_ids && catalog.product_ids.length > 0) {
      const { data: productData } = await supabase
        .from('products')
        .select('id, name, description, price, sale_price, images, stock_quantity, category, sku')
        .in('id', catalog.product_ids)
        .eq('is_active', true);

      products = productData || [];
    } else {
      // Get all active products for the organization
      const { data: productData } = await supabase
        .from('products')
        .select('id, name, description, price, sale_price, images, stock_quantity, category, sku')
        .eq('organization_id', catalog.organization_id)
        .eq('is_active', true)
        .limit(100);

      products = productData || [];
    }

    // Get organization info for branding
    const { data: org } = await supabase
      .from('organizations')
      .select('name, logo_url, phone')
      .eq('id', catalog.organization_id)
      .single();

    // Log view
    await supabase.from('catalog_views').insert({
      catalog_id: catalog.id,
      source: req.query.source || 'direct',
    });

    res.json({
      catalog: {
        ...catalog,
        organization: org,
      },
      products,
    });
  } catch (error: any) {
    console.error('Error fetching public catalog:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/catalogs/:id/share
// Generate WhatsApp share message
// =====================================================
router.post('/:id/share', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const { data: catalog, error } = await supabase
      .from('product_catalogs')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !catalog) {
      return res.status(404).json({ error: 'Catalog not found' });
    }

    // Get product count
    let productCount = catalog.product_ids?.length || 0;
    if (!productCount) {
      const { count } = await supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .eq('organization_id', organizationId)
        .eq('is_active', true);
      productCount = count || 0;
    }

    const message = `🛍️ *${catalog.name}*

${catalog.description || ''}

📦 عدد المنتجات: ${productCount}

🔗 شاهد الكتالوج:
${catalog.share_url}

تسوق الآن واختار اللي يعجبك! ✨`;

    res.json({
      message,
      shareUrl: catalog.share_url,
      productCount,
    });
  } catch (error: any) {
    console.error('Error generating share message:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/catalogs/send-product
// Send a single product to customer
// =====================================================
router.post('/send-product', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { product_id } = req.body;

    const { data: product, error } = await supabase
      .from('products')
      .select('*')
      .eq('id', product_id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !product) {
      return res.status(404).json({ error: 'Product not found' });
    }

    const price = product.sale_price || product.price;
    const message = `📦 *${product.name}*

${product.description || ''}

💰 السعر: ${price?.toFixed(2)} ج.م
${product.sale_price ? `~~${product.price?.toFixed(2)}~~ خصم! 🔥` : ''}

${product.stock_quantity > 0 ? '✅ متوفر' : '❌ غير متوفر حالياً'}

للطلب اكتب: *أريد ${product.name}*`;

    res.json({
      message,
      product,
      image: product.images?.[0] || null,
    });
  } catch (error: any) {
    console.error('Error generating product message:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
