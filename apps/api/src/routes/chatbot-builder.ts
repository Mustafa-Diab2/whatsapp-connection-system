import express from "express";
import { createClient } from "@supabase/supabase-js";

const router = express.Router();

const supabaseUrl = process.env.SUPABASE_URL || "";
const supabaseKey = process.env.SUPABASE_SERVICE_KEY || "";
const supabase = createClient(supabaseUrl, supabaseKey);

// Get all chatbot flows
router.get("/flows", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];

    const { data: flows, error } = await supabase
      .from("chatbot_flows")
      .select("*")
      .eq("organization_id", organizationId)
      .order("updated_at", { ascending: false });

    if (error) throw error;

    res.json({ flows });
  } catch (error) {
    console.error("Error fetching flows:", error);
    res.status(500).json({ error: "Failed to fetch flows" });
  }
});

// Get single flow with nodes
router.get("/flows/:id", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { id } = req.params;

    const { data: flow, error } = await supabase
      .from("chatbot_flows")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();

    if (error) throw error;
    if (!flow) return res.status(404).json({ error: "Flow not found" });

    res.json({ flow });
  } catch (error) {
    console.error("Error fetching flow:", error);
    res.status(500).json({ error: "Failed to fetch flow" });
  }
});

// Create new flow
router.post("/flows", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { name, description, trigger_type, trigger_keywords } = req.body;

    // Default empty flow structure
    const defaultNodes = [
      {
        id: "start",
        type: "trigger",
        position: { x: 250, y: 50 },
        data: {
          label: "بداية المحادثة",
          trigger_type: trigger_type || "keyword",
          keywords: trigger_keywords || [],
        },
      },
    ];

    const defaultEdges: any[] = [];

    const { data: flow, error } = await supabase
      .from("chatbot_flows")
      .insert({
        organization_id: organizationId,
        name,
        description,
        trigger_type: trigger_type || "keyword",
        trigger_keywords: trigger_keywords || [],
        nodes: defaultNodes,
        edges: defaultEdges,
        is_active: false,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ flow });
  } catch (error) {
    console.error("Error creating flow:", error);
    res.status(500).json({ error: "Failed to create flow" });
  }
});

// Update flow
router.put("/flows/:id", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { id } = req.params;
    const { name, description, nodes, edges, trigger_type, trigger_keywords, is_active } = req.body;

    const updateData: any = { updated_at: new Date().toISOString() };
    if (name !== undefined) updateData.name = name;
    if (description !== undefined) updateData.description = description;
    if (nodes !== undefined) updateData.nodes = nodes;
    if (edges !== undefined) updateData.edges = edges;
    if (trigger_type !== undefined) updateData.trigger_type = trigger_type;
    if (trigger_keywords !== undefined) updateData.trigger_keywords = trigger_keywords;
    if (is_active !== undefined) updateData.is_active = is_active;

    const { data: flow, error } = await supabase
      .from("chatbot_flows")
      .update(updateData)
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) throw error;

    res.json({ flow });
  } catch (error) {
    console.error("Error updating flow:", error);
    res.status(500).json({ error: "Failed to update flow" });
  }
});

// Delete flow
router.delete("/flows/:id", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { id } = req.params;

    const { error } = await supabase
      .from("chatbot_flows")
      .delete()
      .eq("id", id)
      .eq("organization_id", organizationId);

    if (error) throw error;

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting flow:", error);
    res.status(500).json({ error: "Failed to delete flow" });
  }
});

// Duplicate flow
router.post("/flows/:id/duplicate", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { id } = req.params;

    // Get original flow
    const { data: original, error: fetchError } = await supabase
      .from("chatbot_flows")
      .select("*")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();

    if (fetchError) throw fetchError;
    if (!original) return res.status(404).json({ error: "Flow not found" });

    // Create duplicate
    const { data: flow, error } = await supabase
      .from("chatbot_flows")
      .insert({
        organization_id: organizationId,
        name: `${original.name} (نسخة)`,
        description: original.description,
        trigger_type: original.trigger_type,
        trigger_keywords: original.trigger_keywords,
        nodes: original.nodes,
        edges: original.edges,
        is_active: false,
      })
      .select()
      .single();

    if (error) throw error;

    res.json({ flow });
  } catch (error) {
    console.error("Error duplicating flow:", error);
    res.status(500).json({ error: "Failed to duplicate flow" });
  }
});

// Toggle flow active status
router.post("/flows/:id/toggle", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { id } = req.params;

    // Get current status
    const { data: current, error: fetchError } = await supabase
      .from("chatbot_flows")
      .select("is_active")
      .eq("id", id)
      .eq("organization_id", organizationId)
      .single();

    if (fetchError) throw fetchError;
    if (!current) return res.status(404).json({ error: "Flow not found" });

    // Toggle
    const { data: flow, error } = await supabase
      .from("chatbot_flows")
      .update({ is_active: !current.is_active, updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("organization_id", organizationId)
      .select()
      .single();

    if (error) throw error;

    res.json({ flow });
  } catch (error) {
    console.error("Error toggling flow:", error);
    res.status(500).json({ error: "Failed to toggle flow" });
  }
});

// Get flow sessions (analytics)
router.get("/flows/:id/sessions", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { id } = req.params;

    const { data: sessions, error } = await supabase
      .from("chatbot_flow_sessions")
      .select(`
        *,
        customers (name, phone)
      `)
      .eq("flow_id", id)
      .order("started_at", { ascending: false })
      .limit(100);

    if (error) throw error;

    // Calculate analytics
    const total = sessions?.length || 0;
    const completed = sessions?.filter(s => s.status === "completed").length || 0;
    const dropped = sessions?.filter(s => s.status === "dropped").length || 0;

    res.json({
      sessions,
      analytics: {
        total,
        completed,
        dropped,
        completion_rate: total > 0 ? Math.round((completed / total) * 100) : 0,
      },
    });
  } catch (error) {
    console.error("Error fetching sessions:", error);
    res.status(500).json({ error: "Failed to fetch sessions" });
  }
});

// Node types configuration (for frontend)
router.get("/node-types", async (req, res) => {
  const nodeTypes = [
    {
      type: "trigger",
      label: "بداية",
      category: "triggers",
      icon: "play",
      color: "#10B981",
      description: "نقطة بداية المحادثة",
      inputs: [],
      outputs: ["default"],
      config: [
        { key: "trigger_type", type: "select", label: "نوع التفعيل", options: ["keyword", "first_message", "button_click"] },
        { key: "keywords", type: "tags", label: "الكلمات المفتاحية" },
      ],
    },
    {
      type: "message",
      label: "رسالة",
      category: "actions",
      icon: "message-square",
      color: "#3B82F6",
      description: "إرسال رسالة نصية",
      inputs: ["default"],
      outputs: ["default"],
      config: [
        { key: "text", type: "textarea", label: "نص الرسالة" },
        { key: "delay", type: "number", label: "تأخير (ثواني)", default: 0 },
      ],
    },
    {
      type: "buttons",
      label: "أزرار",
      category: "actions",
      icon: "grid",
      color: "#8B5CF6",
      description: "رسالة مع أزرار للاختيار",
      inputs: ["default"],
      outputs: ["dynamic"],
      config: [
        { key: "text", type: "textarea", label: "نص الرسالة" },
        { key: "buttons", type: "buttons", label: "الأزرار", max: 3 },
      ],
    },
    {
      type: "list",
      label: "قائمة",
      category: "actions",
      icon: "list",
      color: "#F59E0B",
      description: "قائمة خيارات متعددة",
      inputs: ["default"],
      outputs: ["dynamic"],
      config: [
        { key: "text", type: "textarea", label: "نص الرسالة" },
        { key: "button_text", type: "text", label: "نص الزر" },
        { key: "sections", type: "list_sections", label: "الأقسام" },
      ],
    },
    {
      type: "image",
      label: "صورة",
      category: "actions",
      icon: "image",
      color: "#EC4899",
      description: "إرسال صورة",
      inputs: ["default"],
      outputs: ["default"],
      config: [
        { key: "url", type: "text", label: "رابط الصورة" },
        { key: "caption", type: "textarea", label: "النص المرفق" },
      ],
    },
    {
      type: "document",
      label: "ملف",
      category: "actions",
      icon: "file",
      color: "#06B6D4",
      description: "إرسال ملف",
      inputs: ["default"],
      outputs: ["default"],
      config: [
        { key: "url", type: "text", label: "رابط الملف" },
        { key: "filename", type: "text", label: "اسم الملف" },
      ],
    },
    {
      type: "wait_input",
      label: "انتظار إدخال",
      category: "logic",
      icon: "edit",
      color: "#14B8A6",
      description: "انتظار رد من العميل",
      inputs: ["default"],
      outputs: ["default"],
      config: [
        { key: "variable", type: "text", label: "اسم المتغير" },
        { key: "validation", type: "select", label: "نوع التحقق", options: ["none", "phone", "email", "number"] },
        { key: "error_message", type: "textarea", label: "رسالة الخطأ" },
      ],
    },
    {
      type: "condition",
      label: "شرط",
      category: "logic",
      icon: "git-branch",
      color: "#F97316",
      description: "تفرع بناءً على شرط",
      inputs: ["default"],
      outputs: ["true", "false"],
      config: [
        { key: "variable", type: "text", label: "المتغير" },
        { key: "operator", type: "select", label: "العملية", options: ["equals", "not_equals", "contains", "greater", "less"] },
        { key: "value", type: "text", label: "القيمة" },
      ],
    },
    {
      type: "set_variable",
      label: "تعيين متغير",
      category: "logic",
      icon: "hash",
      color: "#6366F1",
      description: "تعيين قيمة لمتغير",
      inputs: ["default"],
      outputs: ["default"],
      config: [
        { key: "variable", type: "text", label: "اسم المتغير" },
        { key: "value", type: "text", label: "القيمة" },
      ],
    },
    {
      type: "api_call",
      label: "API خارجي",
      category: "integrations",
      icon: "globe",
      color: "#EF4444",
      description: "استدعاء API خارجي",
      inputs: ["default"],
      outputs: ["success", "error"],
      config: [
        { key: "url", type: "text", label: "رابط API" },
        { key: "method", type: "select", label: "الطريقة", options: ["GET", "POST", "PUT", "DELETE"] },
        { key: "headers", type: "key_value", label: "Headers" },
        { key: "body", type: "textarea", label: "Body (JSON)" },
        { key: "result_variable", type: "text", label: "متغير النتيجة" },
      ],
    },
    {
      type: "ai_response",
      label: "رد ذكي (AI)",
      category: "integrations",
      icon: "sparkles",
      color: "#A855F7",
      description: "استخدام AI للرد",
      inputs: ["default"],
      outputs: ["default"],
      config: [
        { key: "context", type: "textarea", label: "سياق المحادثة" },
        { key: "result_variable", type: "text", label: "متغير النتيجة" },
      ],
    },
    {
      type: "assign_agent",
      label: "تحويل لموظف",
      category: "actions",
      icon: "user-plus",
      color: "#0EA5E9",
      description: "تحويل المحادثة لموظف",
      inputs: ["default"],
      outputs: [],
      config: [
        { key: "agent_id", type: "agent_select", label: "الموظف" },
        { key: "message", type: "textarea", label: "رسالة للعميل" },
      ],
    },
    {
      type: "add_tag",
      label: "إضافة تاج",
      category: "actions",
      icon: "tag",
      color: "#84CC16",
      description: "إضافة تاج للعميل",
      inputs: ["default"],
      outputs: ["default"],
      config: [{ key: "tag", type: "text", label: "التاج" }],
    },
    {
      type: "delay",
      label: "تأخير",
      category: "logic",
      icon: "clock",
      color: "#78716C",
      description: "انتظار فترة زمنية",
      inputs: ["default"],
      outputs: ["default"],
      config: [
        { key: "seconds", type: "number", label: "الثواني" },
      ],
    },
    {
      type: "end",
      label: "نهاية",
      category: "logic",
      icon: "check-circle",
      color: "#DC2626",
      description: "إنهاء المحادثة",
      inputs: ["default"],
      outputs: [],
      config: [],
    },
  ];

  res.json({ nodeTypes });
});

// Process incoming message through flows
router.post("/process", async (req, res) => {
  try {
    const organizationId = req.headers["x-organization-id"];
    const { customer_id, phone, message } = req.body;

    // Find matching active flow
    const { data: flows, error: flowsError } = await supabase
      .from("chatbot_flows")
      .select("*")
      .eq("organization_id", organizationId)
      .eq("is_active", true);

    if (flowsError) throw flowsError;

    // Check for existing session
    const { data: existingSession } = await supabase
      .from("chatbot_flow_sessions")
      .select("*")
      .eq("customer_id", customer_id)
      .eq("status", "active")
      .single();

    if (existingSession) {
      // Continue existing session
      const result = await continueSession(existingSession, message);
      return res.json(result);
    }

    // Find matching flow by keyword
    const matchingFlow = flows?.find((flow) => {
      if (flow.trigger_type === "first_message") return true;
      if (flow.trigger_type === "keyword") {
        return flow.trigger_keywords?.some((kw: string) =>
          message.toLowerCase().includes(kw.toLowerCase())
        );
      }
      return false;
    });

    if (!matchingFlow) {
      return res.json({ matched: false, message: "No matching flow" });
    }

    // Start new session
    const { data: session, error: sessionError } = await supabase
      .from("chatbot_flow_sessions")
      .insert({
        flow_id: matchingFlow.id,
        customer_id,
        phone,
        current_node: "start",
        variables: {},
        status: "active",
      })
      .select()
      .single();

    if (sessionError) throw sessionError;

    // Process first node
    const result = await processNode(matchingFlow, session, "start");
    
    res.json({ matched: true, session_id: session.id, ...result });
  } catch (error) {
    console.error("Error processing message:", error);
    res.status(500).json({ error: "Failed to process message" });
  }
});

async function continueSession(session: any, message: string) {
  const { data: flow } = await supabase
    .from("chatbot_flows")
    .select("*")
    .eq("id", session.flow_id)
    .single();

  if (!flow) return { error: "Flow not found" };

  // Update session with user input
  const currentNode = flow.nodes.find((n: any) => n.id === session.current_node);
  
  if (currentNode?.type === "wait_input") {
    // Store input in variable
    const variableName = currentNode.data.variable || "input";
    const variables = { ...session.variables, [variableName]: message };

    await supabase
      .from("chatbot_flow_sessions")
      .update({ variables })
      .eq("id", session.id);

    session.variables = variables;
  }

  // Find next node
  const edge = flow.edges.find((e: any) => e.source === session.current_node);
  if (!edge) {
    // End session
    await supabase
      .from("chatbot_flow_sessions")
      .update({ status: "completed", ended_at: new Date().toISOString() })
      .eq("id", session.id);

    return { completed: true };
  }

  return processNode(flow, session, edge.target);
}

async function processNode(flow: any, session: any, nodeId: string): Promise<any> {
  const node = flow.nodes.find((n: any) => n.id === nodeId);
  if (!node) return { error: "Node not found" };

  // Update current node
  await supabase
    .from("chatbot_flow_sessions")
    .update({ current_node: nodeId })
    .eq("id", session.id);

  const actions: any[] = [];

  switch (node.type) {
    case "message":
      actions.push({
        type: "send_message",
        text: replaceVariables(node.data.text, session.variables),
        delay: node.data.delay || 0,
      });
      break;

    case "buttons":
      actions.push({
        type: "send_buttons",
        text: replaceVariables(node.data.text, session.variables),
        buttons: node.data.buttons,
      });
      return { actions, wait_for_input: true };

    case "list":
      actions.push({
        type: "send_list",
        text: replaceVariables(node.data.text, session.variables),
        button_text: node.data.button_text,
        sections: node.data.sections,
      });
      return { actions, wait_for_input: true };

    case "image":
      actions.push({
        type: "send_image",
        url: node.data.url,
        caption: replaceVariables(node.data.caption, session.variables),
      });
      break;

    case "wait_input":
      return { actions, wait_for_input: true };

    case "delay":
      await new Promise((resolve) => setTimeout(resolve, (node.data.seconds || 1) * 1000));
      break;

    case "set_variable":
      const variables = {
        ...session.variables,
        [node.data.variable]: replaceVariables(node.data.value, session.variables),
      };
      await supabase
        .from("chatbot_flow_sessions")
        .update({ variables })
        .eq("id", session.id);
      session.variables = variables;
      break;

    case "condition":
      const varValue = session.variables[node.data.variable];
      const checkValue = node.data.value;
      let result = false;

      switch (node.data.operator) {
        case "equals":
          result = varValue === checkValue;
          break;
        case "not_equals":
          result = varValue !== checkValue;
          break;
        case "contains":
          result = String(varValue).includes(checkValue);
          break;
        case "greater":
          result = Number(varValue) > Number(checkValue);
          break;
        case "less":
          result = Number(varValue) < Number(checkValue);
          break;
      }

      // Find correct edge
      const conditionEdge = flow.edges.find(
        (e: any) => e.source === nodeId && e.sourceHandle === (result ? "true" : "false")
      );
      if (conditionEdge) {
        const nextResult = await processNode(flow, session, conditionEdge.target);
        actions.push(...(nextResult.actions || []));
        return { actions, ...nextResult };
      }
      break;

    case "assign_agent":
      actions.push({
        type: "assign_agent",
        agent_id: node.data.agent_id,
        message: replaceVariables(node.data.message, session.variables),
      });
      await supabase
        .from("chatbot_flow_sessions")
        .update({ status: "transferred" })
        .eq("id", session.id);
      return { actions, transferred: true };

    case "add_tag":
      actions.push({
        type: "add_tag",
        tag: node.data.tag,
      });
      break;

    case "end":
      await supabase
        .from("chatbot_flow_sessions")
        .update({ status: "completed", ended_at: new Date().toISOString() })
        .eq("id", session.id);
      return { actions, completed: true };
  }

  // Find and process next node
  const edge = flow.edges.find((e: any) => e.source === nodeId);
  if (edge) {
    const nextResult = await processNode(flow, session, edge.target);
    actions.push(...(nextResult.actions || []));
    return { actions, ...nextResult };
  }

  return { actions };
}

function replaceVariables(text: string, variables: Record<string, any>): string {
  if (!text) return text;
  
  return text.replace(/\{\{(\w+)\}\}/g, (match, varName) => {
    return variables[varName] !== undefined ? String(variables[varName]) : match;
  });
}

export default router;
