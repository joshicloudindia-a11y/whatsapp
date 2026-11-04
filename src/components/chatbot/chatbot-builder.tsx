"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from "react";
import {
  ReactFlow, ReactFlowProvider, Controls, MiniMap, Background, BackgroundVariant, Handle, Position, MarkerType,
  applyNodeChanges, applyEdgeChanges, useReactFlow,
  type Connection, type Edge, type EdgeChange, type NodeChange, type NodeProps, type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import NodeEditor, { type Agent } from "./node-editor";
import StepList from "./step-list";
import ChatbotSettingsModal, { Sheet, type BotSettings } from "./chatbot-settings-modal";
import {
  NODE_META, NODE_TYPES, collectVariables, createNode, findStart, insertAfter, isTerminal, moveNode, newId, nodePreview,
  removeNode, sanitizeFlow, serializeFlow, setNext, triggerSummary, validateFlow, validateTrigger,
  type FlowEdge, type FlowIssue, type FlowNode, type NodeData, type NodeType, type TriggerType,
} from "./flow";

interface BotDto {
  id: string; name: string; description: string | null; isActive: boolean;
  triggerType: TriggerType; triggerValue: string | null; nodes: FlowNode[]; edges: FlowEdge[];
}
interface BotResponse { chatbot: BotDto; agents: Agent[]; canManage: boolean }

const errMsg = (e: unknown, f = "Something went wrong") => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? f;

// ─── Responsive helper (no setState in effects) ─────────────────────────────
const DESKTOP_Q = "(min-width: 1024px)";
function subscribe(cb: () => void) {
  const m = window.matchMedia(DESKTOP_Q);
  m.addEventListener("change", cb);
  return () => m.removeEventListener("change", cb);
}
const useIsDesktop = () => useSyncExternalStore(subscribe, () => window.matchMedia(DESKTOP_Q).matches, () => false);

// ─── Canvas node ────────────────────────────────────────────────────────────
const FlowCtx = createContext<{ issues: Map<string, FlowIssue[]>; startId: string | null; readOnly: boolean }>({ issues: new Map(), startId: null, readOnly: false });

function CanvasNode({ id, data, selected }: NodeProps<Node<NodeData>>) {
  const { issues, startId, readOnly } = useContext(FlowCtx);
  const type = data.nodeType;
  const meta = NODE_META[type] ?? NODE_META.sendMessage;
  const iss = issues.get(id) ?? [];
  const errs = iss.filter((i) => i.level === "error").length;
  const preview = nodePreview({ id, type, position: { x: 0, y: 0 }, data });
  const handleCls = "!w-3 !h-3 !border-2 !border-white";
  return (
    <div className={cn("w-[220px] rounded-2xl border bg-white shadow-sm text-left transition", selected ? "ring-2 ring-green-500/40 border-green-500" : errs ? "border-red-300" : "border-slate-200")}>
      <Handle type="target" position={Position.Top} className={cn(handleCls, "!bg-slate-400")} isConnectable={!readOnly} />
      <div className="flex items-center gap-2 px-3 pt-2.5">
        <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white shrink-0" style={{ background: meta.color }}><Icon name={meta.icon} className="w-3.5 h-3.5" /></span>
        <span className="text-xs font-bold text-slate-800 truncate flex-1">{meta.label}</span>
        {startId === id && <span className="rounded-full bg-green-50 px-1.5 py-px text-[9px] font-bold text-green-700">START</span>}
        {errs > 0 ? <Icon name="error" className="w-4 h-4 text-red-500" /> : iss.length > 0 ? <Icon name="warning" className="w-4 h-4 text-amber-500" /> : null}
      </div>
      <p className={cn("px-3 pt-1.5 pb-2.5 text-[11px] leading-snug line-clamp-3 whitespace-pre-line", preview ? "text-slate-600" : "text-slate-400 italic")}>{preview || "Click to configure"}</p>
      {type === "askQuestion" && (data.options ?? []).filter(Boolean).length > 0 && (
        <div className="px-3 pb-2.5 flex flex-wrap gap-1">
          {(data.options ?? []).filter(Boolean).map((o) => <span key={o} className="rounded-md bg-blue-50 px-1.5 py-px text-[10px] font-medium text-blue-700">{o}</span>)}
        </div>
      )}
      {type === "condition" ? (
        <>
          <div className="flex justify-between px-4 pb-1.5 text-[10px] font-bold"><span className="text-green-700">Yes</span><span className="text-red-600">No</span></div>
          <Handle id="true" type="source" position={Position.Bottom} style={{ left: "22%" }} className={cn(handleCls, "!bg-green-500")} isConnectable={!readOnly} />
          <Handle id="false" type="source" position={Position.Bottom} style={{ left: "78%" }} className={cn(handleCls, "!bg-red-500")} isConnectable={!readOnly} />
        </>
      ) : !isTerminal(type) ? (
        <Handle type="source" position={Position.Bottom} className={cn(handleCls, "!bg-[#25D366]")} isConnectable={!readOnly} />
      ) : null}
    </div>
  );
}
const nodeTypes = Object.fromEntries(NODE_TYPES.map((t) => [t, CanvasNode]));

/** Simple top-down layered layout from the start step. */
function tidy(nodes: FlowNode[], edges: FlowEdge[]): FlowNode[] {
  const start = findStart(nodes, edges);
  const depth = new Map<string, number>();
  const order: string[] = [];
  if (start) {
    depth.set(start.id, 0); order.push(start.id);
    for (let i = 0; i < order.length; i++) {
      const id = order[i];
      const outs = edges.filter((e) => e.source === id).sort((a, b) => (a.sourceHandle === "false" ? 1 : 0) - (b.sourceHandle === "false" ? 1 : 0));
      for (const e of outs) if (!depth.has(e.target)) { depth.set(e.target, depth.get(id)! + 1); order.push(e.target); }
    }
  }
  let maxD = Math.max(-1, ...depth.values());
  for (const n of nodes) if (!depth.has(n.id)) { depth.set(n.id, ++maxD); order.push(n.id); }
  const rows = new Map<number, string[]>();
  for (const id of order) { const d = depth.get(id)!; rows.set(d, [...(rows.get(d) ?? []), id]); }
  const pos = new Map<string, { x: number; y: number }>();
  for (const [d, ids] of rows) ids.forEach((id, i) => pos.set(id, { x: Math.round((i - (ids.length - 1) / 2) * 260), y: d * 170 }));
  return nodes.map((n) => ({ ...n, position: pos.get(n.id) ?? n.position }));
}

// ─── Builder shell ──────────────────────────────────────────────────────────
export default function ChatbotBuilder({ chatbotId, onBack }: { chatbotId: string; onBack: () => void }) {
  const { data, isLoading, isError } = useQuery({
    queryKey: ["chatbot", chatbotId],
    queryFn: () => axios.get(`/api/chatbots/${chatbotId}`).then((r) => r.data as BotResponse),
    staleTime: Infinity,
    refetchOnWindowFocus: false,
  });

  if (isLoading) {
    return (
      <div className="h-full flex flex-col">
        <div className="h-16 border-b border-slate-200 bg-white animate-pulse" />
        <div className="flex-1 grid place-items-center text-sm text-slate-400"><Icon name="refresh" className="w-6 h-6 animate-spin" /></div>
      </div>
    );
  }
  if (isError || !data) {
    return (
      <div className="h-full grid place-items-center p-6 text-center">
        <div>
          <Icon name="error" className="w-8 h-8 text-red-400 mx-auto" />
          <p className="mt-2 text-sm font-semibold text-slate-800">Couldn&apos;t load this chatbot</p>
          <button onClick={onBack} className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50">Back to chatbots</button>
        </div>
      </div>
    );
  }
  return (
    <ReactFlowProvider>
      <Editor key={data.chatbot.id} initial={data} onBack={onBack} />
    </ReactFlowProvider>
  );
}

function Editor({ initial, onBack }: { initial: BotResponse; onBack: () => void }) {
  const qc = useQueryClient();
  const rf = useReactFlow();
  const isDesktop = useIsDesktop();
  const readOnly = !initial.canManage;
  const agents = initial.agents;
  const botId = initial.chatbot.id;

  const [meta, setMeta] = useState(() => ({
    name: initial.chatbot.name, description: initial.chatbot.description ?? "", isActive: initial.chatbot.isActive,
    triggerType: initial.chatbot.triggerType, triggerValue: initial.chatbot.triggerValue ?? "",
  }));
  const [flow, setFlow] = useState(() => {
    const f = sanitizeFlow(initial.chatbot.nodes, initial.chatbot.edges);
    // Older bots may have no positions; lay them out once.
    const unplaced = f.nodes.length > 1 && f.nodes.every((n) => n.position.x === 0 && n.position.y === 0);
    return { nodes: unplaced ? tidy(f.nodes, f.edges) : f.nodes, edges: f.edges };
  });
  const [saved, setSaved] = useState(() => JSON.stringify(serializeFlow(flow.nodes, flow.edges)));
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [viewPref, setViewPref] = useState<"auto" | "canvas" | "list">("auto");
  const [saving, setSaving] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [showIssues, setShowIssues] = useState(false);
  const [addAfter, setAddAfter] = useState<{ id: string | null } | null>(null);

  const { nodes, edges } = flow;
  const view = !isDesktop ? "list" : viewPref === "auto" ? "canvas" : viewPref;
  const serialized = useMemo(() => JSON.stringify(serializeFlow(nodes, edges)), [nodes, edges]);
  const dirty = serialized !== saved;
  const issues = useMemo(() => validateFlow(nodes, edges), [nodes, edges]);
  const trigErr = validateTrigger(meta.triggerType, meta.triggerValue);
  const errors = issues.filter((i) => i.level === "error");
  const issuesByNode = useMemo(() => {
    const m = new Map<string, FlowIssue[]>();
    for (const i of issues) if (i.nodeId) m.set(i.nodeId, [...(m.get(i.nodeId) ?? []), i]);
    return m;
  }, [issues]);
  const variables = useMemo(() => collectVariables(nodes), [nodes]);
  const startId = useMemo(() => (nodes.length ? findStart(nodes, edges)?.id ?? null : null), [nodes, edges]);
  const selected = nodes.find((n) => n.id === selectedId) ?? null;

  useEffect(() => {
    if (!dirty) return;
    const h = (e: BeforeUnloadEvent) => { e.preventDefault(); };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, [dirty]);

  // ── Mutations ──
  const patchNode = useCallback((id: string, patch: Partial<NodeData>) => {
    setFlow((f) => ({ ...f, nodes: f.nodes.map((n) => (n.id === id ? { ...n, data: { ...n.data, ...patch } } : n)) }));
  }, []);

  const addStep = (type: NodeType, afterId: string | null) => {
    const prev = nodes.find((n) => n.id === afterId) ?? (afterId === null ? nodes[nodes.length - 1] : undefined);
    const branchOffset = prev?.type === "condition" ? (edges.some((e) => e.source === prev.id && e.sourceHandle === "true") ? 140 : -140) : 0;
    const pos = prev ? { x: prev.position.x + branchOffset, y: prev.position.y + 170 } : { x: 0, y: 0 };
    const node = createNode(type, pos);
    setFlow((f) => insertAfter(f, prev?.id ?? null, node));
    setSelectedId(node.id);
    setAddAfter(null);
    if (view === "canvas") requestAnimationFrame(() => rf.setCenter(pos.x + 110, pos.y + 50, { zoom: rf.getZoom(), duration: 300 }));
  };

  const deleteStep = (id: string) => {
    setFlow((f) => removeNode(f, id));
    if (selectedId === id) setSelectedId(null);
  };

  const duplicateStep = (id: string) => {
    const src = nodes.find((n) => n.id === id);
    if (!src) return;
    const copy: FlowNode = { ...src, id: newId(), position: { x: src.position.x + 40, y: src.position.y + 40 }, data: JSON.parse(JSON.stringify(src.data)) };
    // Insert right after the source; in a linear chain it is wired in automatically.
    setFlow((f) => insertAfter(f, id, copy));
    setSelectedId(copy.id);
  };

  const move = (id: string, dir: -1 | 1) => {
    const r = moveNode(flow, id, dir);
    setFlow({ nodes: r.nodes, edges: r.edges });
    if (!r.relinked) toast.message("Order changed — this flow has branches, so check the “Then” links.");
  };

  // ── React Flow wiring ──
  const onNodesChange = useCallback((changes: NodeChange<FlowNode>[]) => {
    setFlow((f) => ({ ...f, nodes: applyNodeChanges(changes.filter((c) => c.type !== "remove"), f.nodes) }));
  }, []);
  const onEdgesChange = useCallback((changes: EdgeChange<FlowEdge>[]) => {
    setFlow((f) => ({ ...f, edges: applyEdgeChanges(changes, f.edges) }));
  }, []);
  const onConnect = useCallback((c: Connection) => {
    if (!c.source || !c.target) return;
    setFlow((f) => ({ ...f, edges: setNext(f.edges, c.source, c.sourceHandle ?? null, c.target) }));
  }, []);
  const onBeforeDelete = useCallback(async ({ nodes: del }: { nodes: FlowNode[]; edges: FlowEdge[] }) => {
    if (del.length === 0) return true; // edge-only delete: let React Flow handle it
    setFlow((f) => del.reduce((g, n) => removeNode(g, n.id), f));
    setSelectedId(null);
    return false;
  }, []);

  const rfEdges = useMemo<Edge[]>(() => edges.map((e) => {
    const h = e.sourceHandle ?? null;
    const color = h === "true" ? "#16a34a" : h === "false" ? "#dc2626" : "#94a3b8";
    return {
      ...e, type: "smoothstep",
      label: h === "true" ? "Yes" : h === "false" ? "No" : undefined,
      labelStyle: { fontSize: 10, fontWeight: 700, fill: color },
      labelBgStyle: { fill: "#fff" },
      style: { stroke: color, strokeWidth: 1.75 },
      markerEnd: { type: MarkerType.ArrowClosed, color, width: 16, height: 16 },
    };
  }), [edges]);

  // ── Persistence ──
  const persist = async (body: Record<string, unknown>, okMsg: string) => {
    setSaving(true);
    try {
      const snap = serializeFlow(nodes, edges);
      const r = await axios.patch(`/api/chatbots/${botId}`, { ...snap, ...body });
      const c = r.data.chatbot as BotDto;
      setSaved(JSON.stringify(snap));
      setMeta({ name: c.name, description: c.description ?? "", isActive: c.isActive, triggerType: c.triggerType, triggerValue: c.triggerValue ?? "" });
      qc.setQueryData<BotResponse>(["chatbot", botId], (old) => (old ? { ...old, chatbot: { ...c, nodes: snap.nodes as FlowNode[], edges: snap.edges } } : old));
      qc.invalidateQueries({ queryKey: ["chatbots"] });
      toast.success(okMsg);
      return true;
    } catch (e) {
      toast.error(errMsg(e, "Failed to save"));
      if ((e as { response?: { data?: { code?: string } } })?.response?.data?.code === "INVALID_FLOW") setShowIssues(true);
      return false;
    } finally { setSaving(false); }
  };

  const save = () => persist({}, meta.isActive ? "Saved — live bot updated" : "Flow saved");

  const toggleActive = async () => {
    if (!meta.isActive) {
      if (trigErr) { toast.error(trigErr); setShowSettings(true); return; }
      if (errors.length) { toast.error(`Fix ${errors.length} issue${errors.length === 1 ? "" : "s"} before activating`); setShowIssues(true); return; }
      await persist({ isActive: true }, "Chatbot is live");
    } else {
      await persist({ isActive: false }, "Chatbot paused");
    }
  };

  const saveSettings = async (v: BotSettings) => {
    if (await persist({ name: v.name, description: v.description, triggerType: v.triggerType, triggerValue: v.triggerValue }, "Settings saved")) setShowSettings(false);
  };

  const back = () => {
    if (dirty && !confirm("You have unsaved changes. Leave without saving?")) return;
    onBack();
  };

  const focusIssue = (i: FlowIssue) => {
    setShowIssues(false);
    if (!i.nodeId) return;
    setSelectedId(i.nodeId);
    const n = nodes.find((x) => x.id === i.nodeId);
    if (n && view === "canvas") rf.setCenter(n.position.x + 110, n.position.y + 50, { zoom: Math.max(rf.getZoom(), 0.9), duration: 300 });
  };

  const ctx = useMemo(() => ({ issues: issuesByNode, startId, readOnly }), [issuesByNode, startId, readOnly]);

  const issueList = (
    <div className="space-y-2">
      {trigErr && <IssueRow issue={{ level: "error", message: `Trigger: ${trigErr}` }} onClick={() => { setShowIssues(false); setShowSettings(true); }} />}
      {issues.length === 0 && !trigErr ? (
        <p className="flex items-center gap-2 rounded-xl bg-green-50 p-3 text-xs font-medium text-green-800"><Icon name="check_circle" className="w-4 h-4" /> Flow looks good — ready to go live.</p>
      ) : issues.map((i, k) => <IssueRow key={k} issue={i} label={i.nodeId ? stepLabel(nodes, i.nodeId) : undefined} onClick={() => focusIssue(i)} />)}
    </div>
  );

  return (
    <FlowCtx.Provider value={ctx}>
      <div className="h-full flex flex-col min-h-0 bg-slate-50">
        {/* Top bar */}
        <header className="shrink-0 border-b border-slate-200 bg-white px-3 sm:px-5 py-2.5 flex items-center gap-2 sm:gap-3">
          <button onClick={back} aria-label="Back to chatbots" className="w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-slate-500 hover:bg-slate-100"><Icon name="arrow_back" className="w-5 h-5" /></button>
          <button onClick={() => setShowSettings(true)} className="min-w-0 flex-1 text-left group">
            <span className="flex items-center gap-2">
              <span className="text-sm sm:text-base font-bold text-slate-900 truncate group-hover:text-green-700">{meta.name}</span>
              <span className={cn("shrink-0 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold", meta.isActive ? "bg-green-50 text-green-700" : "bg-slate-100 text-slate-500")}>
                <span className={cn("w-1.5 h-1.5 rounded-full", meta.isActive ? "bg-green-500" : "bg-slate-400")} />{meta.isActive ? "Live" : "Off"}
              </span>
              {dirty && <span className="hidden sm:inline text-[10px] font-semibold text-amber-600">Unsaved</span>}
            </span>
            <span className="flex items-center gap-1 text-[11px] text-slate-500 truncate"><Icon name="bolt" className="w-3 h-3" />{triggerSummary(meta.triggerType, meta.triggerValue)}</span>
          </button>

          {isDesktop && (
            <div className="flex gap-1 p-1 bg-slate-100 rounded-xl">
              {(["canvas", "list"] as const).map((v) => (
                <button key={v} onClick={() => setViewPref(v)} className={cn("inline-flex items-center gap-1 px-2.5 py-1 text-xs font-semibold rounded-lg", view === v ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-800")}>
                  <Icon name={v === "canvas" ? "alt_route" : "menu"} className="w-3.5 h-3.5" /> {v === "canvas" ? "Canvas" : "Steps"}
                </button>
              ))}
            </div>
          )}
          <button onClick={() => setShowIssues(true)} title="Flow check"
            className={cn("shrink-0 inline-flex items-center gap-1 rounded-xl border px-2.5 h-9 text-xs font-semibold",
              errors.length || trigErr ? "border-red-200 bg-red-50 text-red-600" : issues.length ? "border-amber-200 bg-amber-50 text-amber-700" : "border-green-200 bg-green-50 text-green-700")}>
            <Icon name={errors.length || trigErr ? "error" : issues.length ? "warning" : "task_alt"} className="w-4 h-4" />
            <span className="tabular-nums">{errors.length + (trigErr ? 1 : 0) || issues.length || ""}</span>
            <span className="hidden md:inline">{errors.length || trigErr ? "issues" : issues.length ? "warnings" : "Valid"}</span>
          </button>
          <button onClick={() => setShowSettings(true)} aria-label="Settings" title="Name & trigger" className="hidden sm:flex w-9 h-9 shrink-0 rounded-xl border border-slate-200 items-center justify-center text-slate-500 hover:bg-slate-50"><Icon name="tune" className="w-4 h-4" /></button>
          {!readOnly && (
            <>
              <button onClick={toggleActive} disabled={saving} role="switch" aria-checked={meta.isActive} aria-label={meta.isActive ? "Deactivate" : "Activate"}
                className="shrink-0 hidden sm:inline-flex items-center gap-2 rounded-xl border border-slate-200 px-2.5 h-9 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                <Toggle on={meta.isActive} /> {meta.isActive ? "Live" : "Activate"}
              </button>
              <button onClick={save} disabled={saving || !dirty}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-xl bg-[#25D366] px-3 sm:px-4 h-9 text-sm font-semibold text-white hover:bg-[#1fb857] disabled:opacity-50">
                <Icon name={saving ? "refresh" : "check"} className={cn("w-4 h-4", saving && "animate-spin")} /> <span className="hidden sm:inline">Save</span>
              </button>
            </>
          )}
        </header>

        {/* Mobile: activation + settings strip */}
        {!readOnly && (
          <div className="sm:hidden shrink-0 flex items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
            <button onClick={toggleActive} disabled={saving} role="switch" aria-checked={meta.isActive} className="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 disabled:opacity-50">
              <Toggle on={meta.isActive} /> {meta.isActive ? "Live — tap to pause" : "Off — tap to activate"}
            </button>
            <div className="flex-1" />
            {dirty && <span className="text-[10px] font-semibold text-amber-600">Unsaved</span>}
            <button onClick={() => setShowSettings(true)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600"><Icon name="tune" className="w-3.5 h-3.5" /> Trigger</button>
          </div>
        )}
        {readOnly && <p className="shrink-0 bg-amber-50 px-4 py-2 text-xs text-amber-800 flex items-center gap-1.5"><Icon name="lock" className="w-3.5 h-3.5" /> View only — ask an admin or automation manager to edit this bot.</p>}

        {view === "canvas" ? (
          <div className="flex-1 flex min-h-0">
            {!readOnly && (
              <aside className="w-56 shrink-0 border-r border-slate-200 bg-white p-3 overflow-y-auto">
                <p className="px-1 pb-2 text-[11px] font-semibold uppercase tracking-wide text-slate-400">Add step</p>
                <div className="space-y-1">
                  {NODE_TYPES.map((t) => (
                    <button key={t} onClick={() => addStep(t, selectedId)} className="w-full flex items-center gap-2.5 rounded-xl px-2.5 py-2 text-left hover:bg-slate-50">
                      <span className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0" style={{ background: `${NODE_META[t].color}18`, color: NODE_META[t].color }}><Icon name={NODE_META[t].icon} className="w-3.5 h-3.5" /></span>
                      <span className="min-w-0">
                        <span className="block text-xs font-semibold text-slate-800">{NODE_META[t].label}</span>
                        <span className="block text-[10px] text-slate-500 leading-tight">{NODE_META[t].hint}</span>
                      </span>
                    </button>
                  ))}
                </div>
                <p className="mt-3 rounded-xl bg-slate-50 p-2.5 text-[10px] leading-relaxed text-slate-500">New steps are added after the selected step and linked automatically. Drag from a dot to connect steps; press Delete to remove the selection.</p>
                <button onClick={() => { setFlow((f) => ({ ...f, nodes: tidy(f.nodes, f.edges) })); requestAnimationFrame(() => rf.fitView({ duration: 300, padding: 0.2 })); }}
                  className="mt-2 w-full inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50">
                  <Icon name="dashboard" className="w-3.5 h-3.5" /> Tidy layout
                </button>
              </aside>
            )}
            <div className="flex-1 relative min-w-0">
              <ReactFlow<FlowNode, Edge>
                nodes={nodes}
                edges={rfEdges}
                nodeTypes={nodeTypes}
                onNodesChange={readOnly ? undefined : onNodesChange}
                onEdgesChange={readOnly ? undefined : (onEdgesChange as unknown as (c: EdgeChange<Edge>[]) => void)}
                onConnect={readOnly ? undefined : onConnect}
                onBeforeDelete={readOnly ? async () => false : (onBeforeDelete as never)}
                isValidConnection={(c) => c.source !== c.target}
                onNodeClick={(_, n) => setSelectedId(n.id)}
                onPaneClick={() => setSelectedId(null)}
                nodesDraggable={!readOnly}
                nodesConnectable={!readOnly}
                deleteKeyCode={readOnly ? null : ["Delete", "Backspace"]}
                fitView
                fitViewOptions={{ padding: 0.2, maxZoom: 1 }}
                minZoom={0.2}
                snapToGrid
                snapGrid={[10, 10]}
                proOptions={{ hideAttribution: true }}
              >
                <Controls showInteractive={false} />
                <MiniMap pannable zoomable nodeColor={(n) => NODE_META[(n.data as NodeData).nodeType]?.color ?? "#94a3b8"} className="!rounded-xl !border !border-slate-200" />
                <Background variant={BackgroundVariant.Dots} gap={18} size={1} color="#cbd5e1" />
              </ReactFlow>
              {nodes.length === 0 && !readOnly && (
                <div className="absolute inset-0 grid place-items-center pointer-events-none">
                  <div className="pointer-events-auto rounded-2xl border border-dashed border-slate-300 bg-white/90 px-6 py-8 text-center shadow-sm">
                    <Icon name="smart_toy" className="w-8 h-8 mx-auto text-green-600" />
                    <p className="mt-2 text-sm font-semibold text-slate-800">Start your flow</p>
                    <p className="text-xs text-slate-500">Pick a step on the left — usually a message.</p>
                    <button onClick={() => addStep("sendMessage", null)} className="mt-3 rounded-xl bg-[#25D366] px-4 py-2 text-sm font-semibold text-white hover:bg-[#1fb857]">Add first message</button>
                  </div>
                </div>
              )}
            </div>
            <aside className="w-80 shrink-0 border-l border-slate-200 bg-white flex flex-col min-h-0">
              {selected ? (
                <>
                  <div className="flex items-center gap-2 px-4 h-14 border-b border-slate-100 shrink-0">
                    <span className="w-7 h-7 rounded-lg flex items-center justify-center text-white" style={{ background: NODE_META[selected.type].color }}><Icon name={NODE_META[selected.type].icon} className="w-3.5 h-3.5" /></span>
                    <p className="flex-1 text-sm font-bold text-slate-900">{NODE_META[selected.type].label}</p>
                    <button onClick={() => setSelectedId(null)} aria-label="Close" className="w-8 h-8 rounded-lg flex items-center justify-center text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>
                  </div>
                  <div className="flex-1 overflow-y-auto p-4">
                    <NodeEditor node={selected} onChange={(p) => patchNode(selected.id, p)} variables={variables} agents={agents} issues={issuesByNode.get(selected.id) ?? []} readOnly={readOnly} />
                  </div>
                  {!readOnly && (
                    <div className="shrink-0 border-t border-slate-100 p-3 flex gap-2">
                      <button onClick={() => duplicateStep(selected.id)} className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-slate-200 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-50"><Icon name="content_copy" className="w-3.5 h-3.5" /> Duplicate</button>
                      <button onClick={() => deleteStep(selected.id)} className="flex-1 inline-flex items-center justify-center gap-1 rounded-xl border border-red-100 py-2 text-xs font-semibold text-red-500 hover:bg-red-50"><Icon name="delete" className="w-3.5 h-3.5" /> Delete</button>
                    </div>
                  )}
                </>
              ) : (
                <div className="flex-1 overflow-y-auto p-4 space-y-4">
                  <div>
                    <p className="text-sm font-bold text-slate-900">Flow check</p>
                    <p className="text-[11px] text-slate-500">Errors must be fixed before the bot can go live.</p>
                  </div>
                  {issueList}
                  <div className="rounded-xl bg-slate-50 p-3 text-[11px] text-slate-600 space-y-1.5">
                    <p className="font-semibold text-slate-700">How it runs</p>
                    <p>The step with no incoming link is the start. Messages send instantly; a question waits for the reply and saves it as a variable you can use as {"{{variable}}"} or in a condition.</p>
                  </div>
                </div>
              )}
            </aside>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto min-h-0">
            {(errors.length > 0 || trigErr) && (
              <div className="mx-auto max-w-2xl px-4 sm:px-6 pt-4">
                <button onClick={() => setShowIssues(true)} className="w-full flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 px-3 py-2.5 text-left text-xs font-semibold text-red-700">
                  <Icon name="error" className="w-4 h-4" /> {errors.length + (trigErr ? 1 : 0)} issue{errors.length + (trigErr ? 1 : 0) === 1 ? "" : "s"} to fix before going live
                  <Icon name="chevron_right" className="w-4 h-4 ml-auto" />
                </button>
              </div>
            )}
            <StepList
              nodes={nodes} edges={edges} issuesByNode={issuesByNode} variables={variables} agents={agents} readOnly={readOnly}
              startId={startId} openId={selectedId} onOpen={setSelectedId} onPatch={patchNode} onMove={move}
              onDelete={(id) => { if (confirm("Delete this step?")) deleteStep(id); }} onDuplicate={duplicateStep}
              onAddAfter={(id) => setAddAfter({ id })}
              onSetNext={(s, h, t) => setFlow((f) => ({ ...f, edges: setNext(f.edges, s, h, t) }))}
            />
          </div>
        )}
      </div>

      {addAfter && (
        <Sheet title="Add a step" subtitle={addAfter.id ? `After ${stepLabel(nodes, addAfter.id)}` : "First step"} onClose={() => setAddAfter(null)}>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            {NODE_TYPES.map((t) => (
              <button key={t} onClick={() => addStep(t, addAfter.id)} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-left hover:border-green-400 hover:bg-green-50/40">
                <span className="w-9 h-9 rounded-xl flex items-center justify-center text-white shrink-0" style={{ background: NODE_META[t].color }}><Icon name={NODE_META[t].icon} className="w-4 h-4" /></span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-slate-900">{NODE_META[t].label}</span>
                  <span className="block text-[11px] text-slate-500">{NODE_META[t].hint}</span>
                </span>
              </button>
            ))}
          </div>
        </Sheet>
      )}

      {showIssues && (
        <Sheet title="Flow check" subtitle="Errors must be fixed before the bot can go live." onClose={() => setShowIssues(false)}>{issueList}</Sheet>
      )}

      {showSettings && (
        <ChatbotSettingsModal mode="edit" saving={saving}
          initial={{ name: meta.name, description: meta.description, triggerType: meta.triggerType, triggerValue: meta.triggerValue }}
          onClose={() => setShowSettings(false)} onSubmit={(v) => (readOnly ? setShowSettings(false) : saveSettings(v))} />
      )}
    </FlowCtx.Provider>
  );
}

function stepLabel(nodes: FlowNode[], id: string) {
  const i = nodes.findIndex((n) => n.id === id);
  return i < 0 ? "step" : `step ${i + 1} · ${NODE_META[nodes[i].type].label}`;
}

function IssueRow({ issue, label, onClick }: { issue: FlowIssue; label?: string; onClick: () => void }) {
  const e = issue.level === "error";
  return (
    <button onClick={onClick} className={cn("w-full flex items-start gap-2 rounded-xl border p-2.5 text-left text-xs", e ? "border-red-100 bg-red-50/60 text-red-700 hover:bg-red-50" : "border-amber-100 bg-amber-50/60 text-amber-800 hover:bg-amber-50")}>
      <Icon name={e ? "error" : "warning"} className="w-4 h-4 shrink-0" />
      <span className="min-w-0 flex-1">
        {label && <span className="block text-[10px] font-bold uppercase tracking-wide opacity-70">{label}</span>}
        {issue.message}
      </span>
    </button>
  );
}

export function Toggle({ on }: { on: boolean }) {
  return (
    <span className={cn("relative inline-flex h-5 w-9 shrink-0 rounded-full transition-colors", on ? "bg-[#25D366]" : "bg-slate-300")}>
      <span className={cn("absolute top-0.5 left-0.5 h-4 w-4 rounded-full bg-white shadow transition-transform", on && "translate-x-4")} />
    </span>
  );
}
