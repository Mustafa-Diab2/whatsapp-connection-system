import { Router, Request, Response } from 'express';
import { supabase } from '../lib/supabase';

const router = Router();

// =====================================================
// SURVEY TEMPLATES
// =====================================================

// GET /api/surveys/templates
router.get('/templates', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { data, error } = await supabase
      .from('survey_templates')
      .select('*')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false });

    if (error) throw error;

    res.json({ templates: data });
  } catch (error: any) {
    console.error('Error fetching survey templates:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/surveys/templates
router.post('/templates', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { 
      name, 
      description, 
      trigger_type, 
      trigger_delay_hours, 
      questions, 
      thank_you_message 
    } = req.body;

    const { data, error } = await supabase
      .from('survey_templates')
      .insert({
        organization_id: organizationId,
        name,
        description,
        trigger_type: trigger_type || 'manual',
        trigger_delay_hours: trigger_delay_hours || 24,
        questions: questions || [],
        thank_you_message: thank_you_message || 'شكراً لمشاركتك! رأيك يهمنا 🙏',
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ template: data });
  } catch (error: any) {
    console.error('Error creating survey template:', error);
    res.status(500).json({ error: error.message });
  }
});

// PUT /api/surveys/templates/:id
router.put('/templates/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;
    const updates = req.body;

    const { data, error } = await supabase
      .from('survey_templates')
      .update({ ...updates, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', organizationId)
      .select()
      .single();

    if (error) throw error;

    res.json({ template: data });
  } catch (error: any) {
    console.error('Error updating survey template:', error);
    res.status(500).json({ error: error.message });
  }
});

// DELETE /api/surveys/templates/:id
router.delete('/templates/:id', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { id } = req.params;

    const { error } = await supabase
      .from('survey_templates')
      .delete()
      .eq('id', id)
      .eq('organization_id', organizationId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error: any) {
    console.error('Error deleting survey template:', error);
    res.status(500).json({ error: error.message });
  }
});

// =====================================================
// SURVEY RESPONSES
// =====================================================

// GET /api/surveys/responses
router.get('/responses', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { template_id, page = 1, limit = 20 } = req.query;

    let query = supabase
      .from('survey_responses')
      .select('*, survey_templates(name), customers(name, phone)')
      .eq('organization_id', organizationId)
      .order('created_at', { ascending: false })
      .range((Number(page) - 1) * Number(limit), Number(page) * Number(limit) - 1);

    if (template_id) {
      query = query.eq('survey_template_id', template_id);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    res.json({ responses: data, total: count });
  } catch (error: any) {
    console.error('Error fetching survey responses:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/surveys/send
router.post('/send', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { template_id, customer_id, order_id, invoice_id, conversation_id } = req.body;

    // Get template
    const { data: template, error: templateError } = await supabase
      .from('survey_templates')
      .select('*')
      .eq('id', template_id)
      .single();

    if (templateError || !template) {
      return res.status(404).json({ error: 'Survey template not found' });
    }

    // Create survey response record
    const { data: response, error: responseError } = await supabase
      .from('survey_responses')
      .insert({
        organization_id: organizationId,
        survey_template_id: template_id,
        customer_id,
        order_id,
        invoice_id,
        conversation_id,
        responses: {},
      })
      .select()
      .single();

    if (responseError) throw responseError;

    // Generate WhatsApp survey message
    const message = generateSurveyMessage(template, response.id);

    res.json({ 
      response, 
      message,
      survey_link: `${process.env.FRONTEND_URL}/survey/${response.id}`
    });
  } catch (error: any) {
    console.error('Error sending survey:', error);
    res.status(500).json({ error: error.message });
  }
});

// POST /api/surveys/respond/:id (Public - for customers to submit)
router.post('/respond/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const { responses } = req.body;

    // Get survey response
    const { data: surveyResponse, error: getError } = await supabase
      .from('survey_responses')
      .select('*, survey_templates(questions)')
      .eq('id', id)
      .single();

    if (getError || !surveyResponse) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    if (surveyResponse.completed_at) {
      return res.status(400).json({ error: 'Survey already completed' });
    }

    // Calculate overall rating if there are rating questions
    let overallRating = null;
    const template = surveyResponse.survey_templates;
    if (template?.questions) {
      const ratingQuestions = template.questions.filter((q: any) => q.type === 'rating');
      if (ratingQuestions.length > 0) {
        const ratings = ratingQuestions
          .map((q: any) => responses[q.id])
          .filter((r: any) => typeof r === 'number');
        if (ratings.length > 0) {
          overallRating = ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length;
        }
      }
    }

    // Determine sentiment
    let sentiment = null;
    if (overallRating !== null) {
      if (overallRating >= 4) sentiment = 'positive';
      else if (overallRating >= 3) sentiment = 'neutral';
      else sentiment = 'negative';
    }

    // Update response
    const { data, error } = await supabase
      .from('survey_responses')
      .update({
        responses,
        overall_rating: overallRating,
        sentiment,
        completed_at: new Date().toISOString(),
      })
      .eq('id', id)
      .select()
      .single();

    if (error) throw error;

    res.json({ success: true, response: data });
  } catch (error: any) {
    console.error('Error submitting survey response:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/surveys/:id (Public - get survey for customer)
router.get('/:id', async (req: Request, res: Response) => {
  try {
    const { id } = req.params;

    const { data, error } = await supabase
      .from('survey_responses')
      .select('id, completed_at, survey_templates(name, description, questions, thank_you_message)')
      .eq('id', id)
      .single();

    if (error || !data) {
      return res.status(404).json({ error: 'Survey not found' });
    }

    res.json({ survey: data });
  } catch (error: any) {
    console.error('Error fetching survey:', error);
    res.status(500).json({ error: error.message });
  }
});

// GET /api/surveys/analytics
router.get('/analytics', async (req: Request, res: Response) => {
  try {
    const organizationId = req.headers['x-organization-id'] as string;
    if (!organizationId) {
      return res.status(400).json({ error: 'Organization ID required' });
    }

    const { template_id, days = 30 } = req.query;
    const startDate = new Date();
    startDate.setDate(startDate.getDate() - Number(days));

    let query = supabase
      .from('survey_responses')
      .select('overall_rating, sentiment, completed_at')
      .eq('organization_id', organizationId)
      .gte('created_at', startDate.toISOString())
      .not('completed_at', 'is', null);

    if (template_id) {
      query = query.eq('survey_template_id', template_id);
    }

    const { data, error } = await query;
    if (error) throw error;

    // Calculate analytics
    const totalResponses = data.length;
    const completedResponses = data.filter(r => r.completed_at).length;
    
    const ratings = data.filter(r => r.overall_rating).map(r => r.overall_rating);
    const averageRating = ratings.length > 0 
      ? ratings.reduce((a, b) => a + b, 0) / ratings.length 
      : 0;

    const sentimentCounts = {
      positive: data.filter(r => r.sentiment === 'positive').length,
      neutral: data.filter(r => r.sentiment === 'neutral').length,
      negative: data.filter(r => r.sentiment === 'negative').length,
    };

    // NPS calculation (if using 1-10 scale)
    const promoters = ratings.filter(r => r >= 4.5).length;
    const detractors = ratings.filter(r => r <= 2.5).length;
    const nps = totalResponses > 0 
      ? Math.round(((promoters - detractors) / totalResponses) * 100) 
      : 0;

    res.json({
      analytics: {
        totalResponses,
        completedResponses,
        completionRate: totalResponses > 0 ? (completedResponses / totalResponses * 100).toFixed(1) : 0,
        averageRating: averageRating.toFixed(2),
        nps,
        sentimentCounts,
      }
    });
  } catch (error: any) {
    console.error('Error fetching survey analytics:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper function to generate survey WhatsApp message
function generateSurveyMessage(template: any, responseId: string): string {
  const surveyLink = `${process.env.FRONTEND_URL || 'https://web-one-nu-37.vercel.app'}/survey/${responseId}`;
  
  return `⭐ *${template.name}*

${template.description || 'نود معرفة رأيك في خدمتنا!'}

رأيك يهمنا جداً ويساعدنا على التحسين 💪

شاركنا تقييمك من هنا:
${surveyLink}

شكراً لوقتك! 🙏`;
}

export default router;
