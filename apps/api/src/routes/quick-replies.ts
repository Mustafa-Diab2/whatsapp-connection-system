import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// =====================================================
// GET /api/quick-replies
// Get all quick replies for organization
// =====================================================
router.get('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { data, error } = await supabase
      .from('quick_reply_templates')
      .select('*, quick_reply_categories(id, name, icon)')
      .eq('organization_id', organizationId)
      .order('usage_count', { ascending: false });

    if (error) throw error;

    res.json({ quickReplies: data });
  } catch (error: any) {
    console.error('Error fetching quick replies:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// GET /api/quick-replies/categories
// Get all categories
// =====================================================
router.get('/categories', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { data, error } = await supabase
      .from('quick_reply_categories')
      .select('*')
      .eq('organization_id', organizationId)
      .order('sort_order');

    if (error) throw error;

    res.json({ categories: data });
  } catch (error: any) {
    console.error('Error fetching categories:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/quick-replies/categories
// Create a category
// =====================================================
router.post('/categories', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { name, icon, sort_order } = req.body;

    const { data, error } = await supabase
      .from('quick_reply_categories')
      .insert({
        organization_id: organizationId,
        name,
        icon: icon || '💬',
        sort_order: sort_order || 0,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ category: data });
  } catch (error: any) {
    console.error('Error creating category:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// DELETE /api/quick-replies/categories/:id
// Delete a category
// =====================================================
router.delete('/categories/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('quick_reply_categories')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting category:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/quick-replies
// Create a quick reply
// =====================================================
router.post('/', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { 
      name, 
      shortcut, 
      content, 
      category_id, 
      media_type, 
      media_url, 
      buttons 
    } = req.body;

    // Check for variable placeholders
    const hasVariables = content.includes('{customer_name}') || 
                        content.includes('{customer_phone}') ||
                        content.includes('{order_id}') ||
                        content.includes('{invoice_amount}') ||
                        content.includes('{product_name}');

    const { data, error } = await supabase
      .from('quick_reply_templates')
      .insert({
        organization_id: organizationId,
        name,
        shortcut,
        content,
        category_id,
        media_type,
        media_url,
        buttons: buttons || [],
        has_variables: hasVariables,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ quickReply: data });
  } catch (error: any) {
    console.error('Error creating quick reply:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// PUT /api/quick-replies/:id
// Update a quick reply
// =====================================================
router.put('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const updates = req.body;

    // Check for variable placeholders if content is updated
    if (updates.content) {
      updates.has_variables = updates.content.includes('{customer_name}') || 
                              updates.content.includes('{customer_phone}') ||
                              updates.content.includes('{order_id}') ||
                              updates.content.includes('{invoice_amount}') ||
                              updates.content.includes('{product_name}');
    }

    const { data, error } = await supabase
      .from('quick_reply_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;

    res.json({ quickReply: data });
  } catch (error: any) {
    console.error('Error updating quick reply:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// DELETE /api/quick-replies/:id
// Delete a quick reply
// =====================================================
router.delete('/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('quick_reply_templates')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting quick reply:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/quick-replies/:id/use
// Increment usage count when a quick reply is used
// =====================================================
router.post('/:id/use', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    // Get current count
    const { data: current } = await supabase
      .from('quick_reply_templates')
      .select('usage_count')
      .eq('id', id)
      .single();

    const { data, error } = await supabase
      .from('quick_reply_templates')
      .update({ usage_count: (current?.usage_count || 0) + 1 })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;

    res.json({ quickReply: data });
  } catch (error: any) {
    console.error('Error updating usage count:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// POST /api/quick-replies/:id/render
// Render a quick reply with variable substitution
// =====================================================
router.post('/:id/render', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const { customer_name, customer_phone, order_id, invoice_amount, product_name } = req.body;

    const { data: quickReply, error } = await supabase
      .from('quick_reply_templates')
      .select('*')
      .eq('id', id)
      .eq('organization_id', organizationId)
      .single();

    if (error || !quickReply) {
      return res.status(404).json({ error: 'Quick reply not found' });
    }

    let renderedContent = quickReply.content;
    
    // Replace variables
    if (customer_name) renderedContent = renderedContent.replace(/{customer_name}/g, customer_name);
    if (customer_phone) renderedContent = renderedContent.replace(/{customer_phone}/g, customer_phone);
    if (order_id) renderedContent = renderedContent.replace(/{order_id}/g, order_id);
    if (invoice_amount) renderedContent = renderedContent.replace(/{invoice_amount}/g, invoice_amount);
    if (product_name) renderedContent = renderedContent.replace(/{product_name}/g, product_name);

    res.json({ 
      content: renderedContent,
      media_type: quickReply.media_type,
      media_url: quickReply.media_url,
      buttons: quickReply.buttons,
    });
  } catch (error: any) {
    console.error('Error rendering quick reply:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// GET /api/quick-replies/search
// Search quick replies by shortcut or content
// =====================================================
router.get('/search', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { q } = req.query;
    if (!q) {
      return res.status(400).json({ error: 'Search query required' });
    }

    const { data, error } = await supabase
      .from('quick_reply_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .eq('is_active', true)
      .or(`shortcut.ilike.%${q}%,name.ilike.%${q}%,content.ilike.%${q}%`)
      .limit(10);

    if (error) throw error;

    res.json({ quickReplies: data });
  } catch (error: any) {
    console.error('Error searching quick replies:', error);
    res.status(500).json({ error: error.message });
  }
});

export default router;
