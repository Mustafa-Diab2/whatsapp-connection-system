'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import {
  Bot,
  Save,
  ArrowRight,
  Play,
  Pause,
  Plus,
  Trash2,
  Settings,
  MessageSquare,
  GitBranch,
  Image,
  File,
  Clock,
  Edit,
  Hash,
  Globe,
  Sparkles,
  UserPlus,
  Tag,
  CheckCircle,
  List,
  Grid3X3,
  Zap,
  ChevronDown,
  X,
  GripVertical,
  Link as LinkIcon,
} from 'lucide-react';
import { useSupabase } from '@/lib/supabase';

// Node type definitions
interface FlowNode {
  id: string;
  type: string;
  position: { x: number; y: number };
  data: Record<string, any>;
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  sourceHandle?: string;
  targetHandle?: string;
}

interface NodeType {
  type: string;
  label: string;
  category: string;
  icon: string;
  color: string;
  description: string;
  inputs: string[];
  outputs: string[];
  config: Array<{
    key: string;
    type: string;
    label: string;
    options?: string[];
    default?: any;
    max?: number;
  }>;
}

const ICON_MAP: Record<string, any> = {
  'play': Play,
  'message-square': MessageSquare,
  'grid': Grid3X3,
  'list': List,
  'image': Image,
  'file': File,
  'edit': Edit,
  'git-branch': GitBranch,
  'hash': Hash,
  'globe': Globe,
  'sparkles': Sparkles,
  'user-plus': UserPlus,
  'tag': Tag,
  'clock': Clock,
  'check-circle': CheckCircle,
};

export default function FlowEditorPage() {
  const params = useParams();
  const router = useRouter();
  const { session, organizationId } = useSupabase();
  const flowId = params.id as string;

  const [flow, setFlow] = useState<any>(null);
  const [nodes, setNodes] = useState<FlowNode[]>([]);
  const [edges, setEdges] = useState<FlowEdge[]>([]);
  const [nodeTypes, setNodeTypes] = useState<NodeType[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [showNodePicker, setShowNodePicker] = useState(false);
  const [draggedNodeType, setDraggedNodeType] = useState<string | null>(null);

  // Canvas state
  const canvasRef = useRef<HTMLDivElement>(null);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [connecting, setConnecting] = useState<{ nodeId: string; handle: string } | null>(null);
  
  const API_URL = process.env.NEXT_PUBLIC_API_URL || '';

  useEffect(() => {
    if (organizationId && flowId) {
      fetchFlow();
      fetchNodeTypes();
    }
  }, [organizationId, flowId]);

  const fetchFlow = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chatbot/flows/${flowId}`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      if (data.flow) {
        setFlow(data.flow);
        setNodes(data.flow.nodes || []);
        setEdges(data.flow.edges || []);
      }
    } catch (error) {
      console.error('Error fetching flow:', error);
    } finally {
      setLoading(false);
    }
  };

  const fetchNodeTypes = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chatbot/node-types`, {
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      setNodeTypes(data.nodeTypes || []);
    } catch (error) {
      console.error('Error fetching node types:', error);
    }
  };

  const saveFlow = async () => {
    setSaving(true);
    try {
      await fetch(`${API_URL}/api/chatbot/flows/${flowId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
        body: JSON.stringify({ nodes, edges }),
      });
      alert('تم الحفظ بنجاح');
    } catch (error) {
      console.error('Error saving flow:', error);
      alert('فشل في الحفظ');
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async () => {
    try {
      const res = await fetch(`${API_URL}/api/chatbot/flows/${flowId}/toggle`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${session?.access_token}`,
          'x-organization-id': organizationId || '',
        },
      });
      const data = await res.json();
      if (data.flow) {
        setFlow(data.flow);
      }
    } catch (error) {
      console.error('Error toggling flow:', error);
    }
  };

  const addNode = (type: string, x: number = 300, y: number = 200) => {
    const nodeType = nodeTypes.find(nt => nt.type === type);
    if (!nodeType) return;

    const newNode: FlowNode = {
      id: `node_${Date.now()}`,
      type,
      position: { x, y },
      data: {
        label: nodeType.label,
        ...nodeType.config.reduce((acc, cfg) => {
          if (cfg.default !== undefined) acc[cfg.key] = cfg.default;
          return acc;
        }, {} as Record<string, any>),
      },
    };

    setNodes([...nodes, newNode]);
    setSelectedNode(newNode.id);
    setShowNodePicker(false);
  };

  const deleteNode = (nodeId: string) => {
    setNodes(nodes.filter(n => n.id !== nodeId));
    setEdges(edges.filter(e => e.source !== nodeId && e.target !== nodeId));
    if (selectedNode === nodeId) setSelectedNode(null);
  };

  const updateNodeData = (nodeId: string, key: string, value: any) => {
    setNodes(nodes.map(n => {
      if (n.id === nodeId) {
        return { ...n, data: { ...n.data, [key]: value } };
      }
      return n;
    }));
  };

  const addEdge = (source: string, target: string, sourceHandle?: string) => {
    // Prevent duplicate edges
    const exists = edges.some(e => e.source === source && e.target === target);
    if (exists || source === target) return;

    const newEdge: FlowEdge = {
      id: `edge_${Date.now()}`,
      source,
      target,
      sourceHandle,
    };

    setEdges([...edges, newEdge]);
  };

  const deleteEdge = (edgeId: string) => {
    setEdges(edges.filter(e => e.id !== edgeId));
  };

  // Mouse handlers for dragging nodes
  const handleNodeMouseDown = (e: React.MouseEvent, nodeId: string) => {
    e.stopPropagation();
    setDraggingNode(nodeId);
    setDragStart({ x: e.clientX, y: e.clientY });
    setSelectedNode(nodeId);
  };

  const handleMouseMove = useCallback((e: MouseEvent) => {
    if (draggingNode) {
      const dx = e.clientX - dragStart.x;
      const dy = e.clientY - dragStart.y;
      
      setNodes(nodes.map(n => {
        if (n.id === draggingNode) {
          return {
            ...n,
            position: {
              x: n.position.x + dx,
              y: n.position.y + dy,
            },
          };
        }
        return n;
      }));
      
      setDragStart({ x: e.clientX, y: e.clientY });
    }
  }, [draggingNode, dragStart, nodes]);

  const handleMouseUp = useCallback(() => {
    setDraggingNode(null);
    setConnecting(null);
  }, []);

  useEffect(() => {
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [handleMouseMove, handleMouseUp]);

  const handleConnectorClick = (nodeId: string, isOutput: boolean, handle?: string) => {
    if (isOutput) {
      setConnecting({ nodeId, handle: handle || 'default' });
    } else if (connecting) {
      addEdge(connecting.nodeId, nodeId, connecting.handle);
      setConnecting(null);
    }
  };

  const getNodeType = (type: string) => nodeTypes.find(nt => nt.type === type);

  const renderNode = (node: FlowNode) => {
    const nodeType = getNodeType(node.type);
    if (!nodeType) return null;

    const IconComponent = ICON_MAP[nodeType.icon] || MessageSquare;
    const isSelected = selectedNode === node.id;
    const hasOutputs = nodeType.outputs.length > 0;
    const hasInputs = nodeType.inputs.length > 0;

    return (
      <div
        key={node.id}
        className={`absolute bg-white rounded-xl shadow-lg border-2 transition-shadow ${
          isSelected ? 'ring-2 ring-purple-400 border-purple-400' : 'border-gray-100'
        }`}
        style={{
          left: node.position.x,
          top: node.position.y,
          minWidth: 200,
          cursor: draggingNode === node.id ? 'grabbing' : 'grab',
        }}
        onMouseDown={(e) => handleNodeMouseDown(e, node.id)}
      >
        {/* Input Connector */}
        {hasInputs && (
          <div
            className={`absolute -top-3 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full border-2 border-white shadow cursor-pointer ${
              connecting ? 'bg-green-500 animate-pulse' : 'bg-gray-300'
            }`}
            onClick={() => handleConnectorClick(node.id, false)}
          />
        )}

        {/* Node Content */}
        <div 
          className="p-3 rounded-t-xl"
          style={{ backgroundColor: nodeType.color + '20' }}
        >
          <div className="flex items-center gap-2">
            <div 
              className="w-8 h-8 rounded-lg flex items-center justify-center"
              style={{ backgroundColor: nodeType.color }}
            >
              <IconComponent className="w-4 h-4 text-white" />
            </div>
            <span className="font-medium text-gray-900">{node.data.label || nodeType.label}</span>
          </div>
        </div>

        {/* Node Preview */}
        <div className="p-3 text-sm text-gray-600">
          {node.type === 'message' && (
            <p className="line-clamp-2">{node.data.text || 'اكتب رسالتك...'}</p>
          )}
          {node.type === 'buttons' && (
            <div className="space-y-1">
              {node.data.buttons?.slice(0, 2).map((btn: any, i: number) => (
                <div key={i} className="bg-gray-100 px-2 py-1 rounded text-xs">{btn.text || `زر ${i + 1}`}</div>
              ))}
            </div>
          )}
          {node.type === 'condition' && (
            <p>{node.data.variable} {node.data.operator} {node.data.value}</p>
          )}
          {node.type === 'wait_input' && (
            <p>حفظ في: {node.data.variable || '...'}</p>
          )}
          {node.type === 'delay' && (
            <p>انتظار {node.data.seconds || 0} ثانية</p>
          )}
        </div>

        {/* Output Connectors */}
        {hasOutputs && (
          <div className="flex justify-around pb-3">
            {nodeType.outputs.map((output, i) => (
              <div
                key={i}
                className={`relative w-6 h-6 rounded-full border-2 border-white shadow cursor-pointer ${
                  connecting?.nodeId === node.id ? 'bg-purple-500' : 'bg-gray-400'
                }`}
                style={{ backgroundColor: connecting?.nodeId === node.id ? nodeType.color : undefined }}
                onClick={() => handleConnectorClick(node.id, true, output)}
              >
                {output !== 'default' && output !== 'dynamic' && (
                  <span className="absolute -bottom-5 left-1/2 -translate-x-1/2 text-xs text-gray-500">
                    {output === 'true' ? '✓' : '✗'}
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    );
  };

  const renderEdges = () => {
    return edges.map(edge => {
      const sourceNode = nodes.find(n => n.id === edge.source);
      const targetNode = nodes.find(n => n.id === edge.target);
      if (!sourceNode || !targetNode) return null;

      const sourceX = sourceNode.position.x + 100;
      const sourceY = sourceNode.position.y + 120;
      const targetX = targetNode.position.x + 100;
      const targetY = targetNode.position.y;

      const midY = (sourceY + targetY) / 2;

      return (
        <g key={edge.id}>
          <path
            d={`M ${sourceX} ${sourceY} C ${sourceX} ${midY}, ${targetX} ${midY}, ${targetX} ${targetY}`}
            fill="none"
            stroke="#9CA3AF"
            strokeWidth="2"
            className="cursor-pointer hover:stroke-red-500"
            onClick={() => deleteEdge(edge.id)}
          />
          {/* Arrow */}
          <circle cx={targetX} cy={targetY - 3} r="4" fill="#9CA3AF" />
        </g>
      );
    });
  };

  const renderNodePicker = () => {
    const categories = {
      triggers: 'المُفعّلات',
      actions: 'الإجراءات',
      logic: 'المنطق',
      integrations: 'التكاملات',
    };

    return (
      <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
        <div className="bg-white rounded-2xl w-full max-w-2xl max-h-[80vh] overflow-hidden">
          <div className="p-4 border-b flex items-center justify-between">
            <h2 className="text-lg font-bold">إضافة عقدة</h2>
            <button onClick={() => setShowNodePicker(false)}>
              <X className="w-5 h-5" />
            </button>
          </div>
          <div className="p-4 overflow-y-auto max-h-[60vh]">
            {Object.entries(categories).map(([key, label]) => {
              const categoryNodes = nodeTypes.filter(nt => nt.category === key);
              if (categoryNodes.length === 0) return null;

              return (
                <div key={key} className="mb-6">
                  <h3 className="text-sm font-medium text-gray-500 mb-3">{label}</h3>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {categoryNodes.map(nt => {
                      const IconComponent = ICON_MAP[nt.icon] || MessageSquare;
                      return (
                        <button
                          key={nt.type}
                          onClick={() => addNode(nt.type)}
                          className="flex items-center gap-3 p-3 rounded-lg border hover:border-purple-300 hover:bg-purple-50 transition-colors text-right"
                        >
                          <div
                            className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
                            style={{ backgroundColor: nt.color }}
                          >
                            <IconComponent className="w-5 h-5 text-white" />
                          </div>
                          <div>
                            <p className="font-medium text-gray-900">{nt.label}</p>
                            <p className="text-xs text-gray-500">{nt.description}</p>
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  const renderNodeEditor = () => {
    const node = nodes.find(n => n.id === selectedNode);
    if (!node) return null;

    const nodeType = getNodeType(node.type);
    if (!nodeType) return null;

    return (
      <div className="w-80 bg-white border-r overflow-y-auto">
        <div className="p-4 border-b flex items-center justify-between">
          <h3 className="font-bold">تعديل العقدة</h3>
          <button
            onClick={() => deleteNode(node.id)}
            className="p-2 text-red-600 hover:bg-red-50 rounded-lg"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
        
        <div className="p-4 space-y-4">
          {nodeType.config.map(cfg => (
            <div key={cfg.key}>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                {cfg.label}
              </label>
              
              {cfg.type === 'text' && (
                <input
                  type="text"
                  value={node.data[cfg.key] || ''}
                  onChange={(e) => updateNodeData(node.id, cfg.key, e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              )}
              
              {cfg.type === 'textarea' && (
                <textarea
                  value={node.data[cfg.key] || ''}
                  onChange={(e) => updateNodeData(node.id, cfg.key, e.target.value)}
                  rows={3}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              )}
              
              {cfg.type === 'number' && (
                <input
                  type="number"
                  value={node.data[cfg.key] || 0}
                  onChange={(e) => updateNodeData(node.id, cfg.key, parseInt(e.target.value))}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                />
              )}
              
              {cfg.type === 'select' && (
                <select
                  value={node.data[cfg.key] || ''}
                  onChange={(e) => updateNodeData(node.id, cfg.key, e.target.value)}
                  className="w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-500"
                >
                  <option value="">اختر...</option>
                  {cfg.options?.map(opt => (
                    <option key={opt} value={opt}>{opt}</option>
                  ))}
                </select>
              )}
              
              {cfg.type === 'buttons' && (
                <div className="space-y-2">
                  {(node.data.buttons || []).map((btn: any, i: number) => (
                    <div key={i} className="flex gap-2">
                      <input
                        type="text"
                        value={btn.text || ''}
                        onChange={(e) => {
                          const buttons = [...(node.data.buttons || [])];
                          buttons[i] = { ...buttons[i], text: e.target.value };
                          updateNodeData(node.id, 'buttons', buttons);
                        }}
                        placeholder={`زر ${i + 1}`}
                        className="flex-1 px-3 py-2 border rounded-lg text-sm"
                      />
                      <button
                        onClick={() => {
                          const buttons = node.data.buttons.filter((_: any, j: number) => j !== i);
                          updateNodeData(node.id, 'buttons', buttons);
                        }}
                        className="p-2 text-red-500 hover:bg-red-50 rounded-lg"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  ))}
                  {(node.data.buttons?.length || 0) < (cfg.max || 3) && (
                    <button
                      onClick={() => {
                        const buttons = [...(node.data.buttons || []), { text: '', id: Date.now() }];
                        updateNodeData(node.id, 'buttons', buttons);
                      }}
                      className="w-full py-2 border-2 border-dashed rounded-lg text-gray-500 hover:border-purple-300 hover:text-purple-600"
                    >
                      + إضافة زر
                    </button>
                  )}
                </div>
              )}

              {cfg.type === 'tags' && (
                <div className="space-y-2">
                  <div className="flex flex-wrap gap-1">
                    {(node.data[cfg.key] || []).map((tag: string, i: number) => (
                      <span key={i} className="px-2 py-1 bg-purple-100 text-purple-700 rounded-full text-sm flex items-center gap-1">
                        {tag}
                        <button
                          onClick={() => {
                            const tags = node.data[cfg.key].filter((_: any, j: number) => j !== i);
                            updateNodeData(node.id, cfg.key, tags);
                          }}
                        >
                          ×
                        </button>
                      </span>
                    ))}
                  </div>
                  <input
                    type="text"
                    placeholder="اضغط Enter للإضافة"
                    className="w-full px-3 py-2 border rounded-lg text-sm"
                    onKeyPress={(e) => {
                      if (e.key === 'Enter') {
                        const value = (e.target as HTMLInputElement).value.trim();
                        if (value) {
                          const tags = [...(node.data[cfg.key] || []), value];
                          updateNodeData(node.id, cfg.key, tags);
                          (e.target as HTMLInputElement).value = '';
                        }
                      }
                    }}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    );
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <div className="w-12 h-12 border-4 border-purple-600 border-t-transparent rounded-full animate-spin mx-auto mb-4" />
          <p className="text-gray-500">جاري تحميل المحرر...</p>
        </div>
      </div>
    );
  }

  if (!flow) {
    return (
      <div className="min-h-screen bg-gray-100 flex items-center justify-center" dir="rtl">
        <div className="text-center">
          <Bot className="w-16 h-16 mx-auto text-gray-300 mb-4" />
          <p className="text-gray-500">لم يتم العثور على البوت</p>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-gray-100" dir="rtl">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/chatbot')}
            className="p-2 hover:bg-gray-100 rounded-lg"
          >
            <ArrowRight className="w-5 h-5" />
          </button>
          <div>
            <h1 className="font-bold text-gray-900">{flow.name}</h1>
            <p className="text-sm text-gray-500">{flow.description || 'بدون وصف'}</p>
          </div>
        </div>
        
        <div className="flex items-center gap-3">
          <button
            onClick={toggleActive}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg font-medium transition-colors ${
              flow.is_active
                ? 'bg-red-100 text-red-700 hover:bg-red-200'
                : 'bg-green-100 text-green-700 hover:bg-green-200'
            }`}
          >
            {flow.is_active ? (
              <>
                <Pause className="w-4 h-4" />
                إيقاف
              </>
            ) : (
              <>
                <Play className="w-4 h-4" />
                تفعيل
              </>
            )}
          </button>
          
          <button
            onClick={saveFlow}
            disabled={saving}
            className="flex items-center gap-2 bg-purple-600 hover:bg-purple-700 disabled:bg-gray-400 text-white px-4 py-2 rounded-lg font-medium transition-colors"
          >
            <Save className="w-4 h-4" />
            {saving ? 'جاري الحفظ...' : 'حفظ'}
          </button>
        </div>
      </div>

      {/* Editor */}
      <div className="flex-1 flex overflow-hidden">
        {/* Left Sidebar - Node Editor */}
        {selectedNode && renderNodeEditor()}

        {/* Canvas */}
        <div className="flex-1 relative overflow-hidden" ref={canvasRef}>
          {/* Grid Background */}
          <div 
            className="absolute inset-0"
            style={{
              backgroundImage: 'radial-gradient(circle, #ddd 1px, transparent 1px)',
              backgroundSize: '20px 20px',
            }}
          />

          {/* SVG for edges */}
          <svg className="absolute inset-0 pointer-events-none" style={{ zIndex: 1 }}>
            {renderEdges()}
          </svg>

          {/* Nodes */}
          <div className="absolute inset-0" style={{ zIndex: 2 }}>
            {nodes.map(node => renderNode(node))}
          </div>

          {/* Add Node Button */}
          <button
            onClick={() => setShowNodePicker(true)}
            className="absolute bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-purple-600 hover:bg-purple-700 text-white px-6 py-3 rounded-full shadow-lg font-medium transition-all hover:scale-105"
          >
            <Plus className="w-5 h-5" />
            إضافة عقدة
          </button>

          {/* Connection indicator */}
          {connecting && (
            <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-purple-600 text-white px-4 py-2 rounded-lg shadow-lg">
              اضغط على العقدة المستهدفة للربط
            </div>
          )}
        </div>
      </div>

      {/* Node Picker Modal */}
      {showNodePicker && renderNodePicker()}
    </div>
  );
}
