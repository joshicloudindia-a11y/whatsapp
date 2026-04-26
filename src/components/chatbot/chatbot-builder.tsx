"use client";

import { useCallback, useState, useEffect } from "react";
import {
  ReactFlow,
  addEdge,
  useNodesState,
  useEdgesState,
  Controls,
  MiniMap,
  Background,
  BackgroundVariant,
  type Connection,
  type Node,
  type Edge,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";

const NODE_TYPES_CONFIG = [
  { type: "sendMessage", label: "Send Message", color: "#25D366", icon: "💬" },
  { type: "askQuestion", label: "Ask Question", color: "#3b82f6", icon: "❓" },
  { type: "condition", label: "Condition", color: "#f59e0b", icon: "🔀" },
  { type: "setAttribute", label: "Set Attribute", color: "#8b5cf6", icon: "🏷" },
  { type: "assignAgent", label: "Assign Agent", color: "#06b6d4", icon: "👤" },
  { type: "httpRequest", label: "HTTP Request", color: "#ef4444", icon: "🌐" },
  { type: "delay", label: "Delay", color: "#64748b", icon: "⏱" },
  { type: "endFlow", label: "End Flow", color: "#374151", icon: "🏁" },
];

function NodeCard({ data }: { data: any }) {
  const config = NODE_TYPES_CONFIG.find((n) => n.type === data.nodeType) ?? NODE_TYPES_CONFIG[0];
  return (
    <div
      className="rounded-xl shadow-md border-2 bg-white min-w-[180px] text-sm"
      style={{ borderColor: config.color }}
    >
      <div className="px-3 py-2 rounded-t-xl text-white text-xs font-semibold flex items-center gap-2"
        style={{ background: config.color }}>
        <span>{config.icon}</span>
        <span>{config.label}</span>
      </div>
      <div className="px-3 py-2 text-slate-700 text-xs">
        {data.content ? (
          <p className="truncate max-w-[160px]">{data.content}</p>
        ) : (
          <p className="text-slate-400 italic">Click to configure</p>
        )}
      </div>
    </div>
  );
}

const nodeTypes = {
  sendMessage: NodeCard,
  askQuestion: NodeCard,
  condition: NodeCard,
  setAttribute: NodeCard,
  assignAgent: NodeCard,
  httpRequest: NodeCard,
  delay: NodeCard,
  endFlow: NodeCard,
};

let idCounter = 1;
function genId() { return `node_${idCounter++}`; }

export default function ChatbotBuilder({ chatbotId }: { chatbotId: string }) {
  const queryClient = useQueryClient();
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const [selectedNode, setSelectedNode] = useState<Node | null>(null);

  const { data } = useQuery({
    queryKey: ["chatbot", chatbotId],
    queryFn: () => axios.get(`/api/chatbots/${chatbotId}`).then((r) => r.data),
  });

  useEffect(() => {
    if (data?.chatbot) {
      const storedNodes = data.chatbot.nodes;
      const storedEdges = data.chatbot.edges;
      if (storedNodes?.length) {
        setNodes(storedNodes.map((n: any) => ({ ...n, type: n.data?.nodeType ?? "sendMessage" })));
        setEdges(storedEdges ?? []);
      }
    }
  }, [data, setNodes, setEdges]);

  const onConnect = useCallback(
    (params: Connection) => setEdges((eds) => addEdge({ ...params, animated: true }, eds)),
    [setEdges]
  );

  const addNode = (type: string) => {
    const config = NODE_TYPES_CONFIG.find((n) => n.type === type)!;
    const newNode: Node = {
      id: genId(),
      type,
      position: { x: 200 + Math.random() * 200, y: 100 + Math.random() * 200 },
      data: { nodeType: type, label: config.label, content: "" },
    };
    setNodes((nds) => [...nds, newNode]);
  };

  const saveFlow = async () => {
    try {
      await axios.patch(`/api/chatbots/${chatbotId}`, { nodes, edges });
      toast.success("Flow saved");
    } catch {
      toast.error("Failed to save");
    }
  };

  const updateSelectedNode = (content: string) => {
    if (!selectedNode) return;
    setNodes((nds) =>
      nds.map((n) => n.id === selectedNode.id ? { ...n, data: { ...n.data, content } } : n)
    );
    setSelectedNode((prev) => prev ? { ...prev, data: { ...prev.data, content } } : null);
  };

  return (
    <div className="flex-1 flex min-h-0">
      {/* Node Palette */}
      <div className="w-52 border-r bg-white p-3 space-y-1 overflow-y-auto" style={{ borderColor: "#e2e8f0" }}>
        <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide px-1 mb-2">Add Node</p>
        {NODE_TYPES_CONFIG.map((n) => (
          <button
            key={n.type}
            onClick={() => addNode(n.type)}
            className="w-full text-left flex items-center gap-2 px-3 py-2 rounded-lg text-sm hover:bg-slate-50 transition-colors text-slate-700"
          >
            <span>{n.icon}</span>
            <span>{n.label}</span>
          </button>
        ))}
        <div className="pt-3 border-t mt-3" style={{ borderColor: "#e2e8f0" }}>
          <button
            onClick={saveFlow}
            className="w-full py-2 text-sm font-medium text-white rounded-lg"
            style={{ background: "#25D366" }}
          >
            Save Flow
          </button>
        </div>
      </div>

      {/* Canvas */}
      <div className="flex-1 relative">
        <ReactFlow
          nodes={nodes}
          edges={edges}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          nodeTypes={nodeTypes}
          onNodeClick={(_, node) => setSelectedNode(node)}
          fitView
          snapToGrid
          snapGrid={[16, 16]}
        >
          <Controls />
          <MiniMap />
          <Background variant={BackgroundVariant.Dots} gap={16} size={1} color="#e2e8f0" />
        </ReactFlow>
      </div>

      {/* Node Config Panel */}
      {selectedNode && (
        <div className="w-64 border-l bg-white p-4 space-y-3" style={{ borderColor: "#e2e8f0" }}>
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-slate-900">
              {NODE_TYPES_CONFIG.find((n) => n.type === selectedNode.data?.nodeType)?.label ?? "Node"}
            </h3>
            <button onClick={() => setSelectedNode(null)} className="text-slate-400 hover:text-slate-600 text-lg leading-none">×</button>
          </div>
          <div className="space-y-2">
            <label className="text-xs font-medium text-slate-600">Content</label>
            <textarea
              value={selectedNode.data?.content as string ?? ""}
              onChange={(e) => updateSelectedNode(e.target.value)}
              rows={4}
              placeholder="Enter message content..."
              className="w-full px-3 py-2 border border-slate-200 rounded-lg text-xs resize-none focus:outline-none focus:ring-2 focus:ring-green-500"
            />
          </div>
          <button
            onClick={() => {
              setNodes((nds) => nds.filter((n) => n.id !== selectedNode.id));
              setEdges((eds) => eds.filter((e) => e.source !== selectedNode.id && e.target !== selectedNode.id));
              setSelectedNode(null);
            }}
            className="w-full py-1.5 text-xs text-red-500 border border-red-200 rounded-lg hover:bg-red-50"
          >
            Delete Node
          </button>
        </div>
      )}
    </div>
  );
}
