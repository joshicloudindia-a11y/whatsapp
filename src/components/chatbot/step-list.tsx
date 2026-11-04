"use client";

import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import NodeEditor, { type Agent } from "./node-editor";
import { NODE_META, isTerminal, nodePreview, outEdge, type FlowEdge, type FlowIssue, type FlowNode, type NodeData } from "./flow";

/** Vertical, touch-friendly flow editor (phones; optional on desktop). */
export default function StepList({
  nodes, edges, issuesByNode, variables, agents, readOnly, startId, openId,
  onOpen, onPatch, onMove, onDelete, onDuplicate, onAddAfter, onSetNext,
}: {
  nodes: FlowNode[]; edges: FlowEdge[]; issuesByNode: Map<string, FlowIssue[]>; variables: string[]; agents: Agent[];
  readOnly?: boolean; startId: string | null; openId: string | null;
  onOpen: (id: string | null) => void;
  onPatch: (id: string, patch: Partial<NodeData>) => void;
  onMove: (id: string, dir: -1 | 1) => void;
  onDelete: (id: string) => void;
  onDuplicate: (id: string) => void;
  onAddAfter: (id: string | null) => void;
  onSetNext: (source: string, handle: string | null, target: string | null) => void;
}) {
  const indexOf = new Map(nodes.map((n, i) => [n.id, i]));
  const label = (n: FlowNode) => `${(indexOf.get(n.id) ?? 0) + 1}. ${NODE_META[n.type].label}`;

  const nextSelect = (node: FlowNode, handle: string | null, title: string) => {
    const cur = outEdge(edges, node.id, handle)?.target ?? "";
    return (
      <label className="flex items-center gap-2 text-xs">
        <span className={cn("shrink-0 font-semibold", handle === "true" ? "text-green-700" : handle === "false" ? "text-red-600" : "text-slate-500")}>{title}</span>
        <select disabled={readOnly} value={cur} onChange={(e) => onSetNext(node.id, handle, e.target.value || null)}
          className="min-w-0 flex-1 rounded-lg border border-slate-200 bg-white px-2 py-1.5 text-xs text-slate-700 focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500">
          <option value="">End the bot</option>
          {nodes.filter((n) => n.id !== node.id).map((n) => <option key={n.id} value={n.id}>{label(n)}</option>)}
        </select>
      </label>
    );
  };

  return (
    <div className="mx-auto w-full max-w-2xl px-4 py-4 sm:px-6 space-y-2">
      {nodes.length === 0 && (
        <div className="rounded-2xl border border-dashed border-slate-300 bg-white py-10 px-6 text-center">
          <span className="mx-auto w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name="smart_toy" className="w-6 h-6 text-green-600" /></span>
          <p className="mt-3 text-sm font-semibold text-slate-800">No steps yet</p>
          <p className="text-xs text-slate-500 mt-1">Add the first message your bot sends.</p>
        </div>
      )}

      {nodes.map((n, i) => {
        const meta = NODE_META[n.type];
        const open = openId === n.id;
        const iss = issuesByNode.get(n.id) ?? [];
        const errs = iss.filter((x) => x.level === "error").length;
        const preview = nodePreview(n);
        return (
          <div key={n.id}>
            <article className={cn("rounded-2xl border bg-white shadow-sm transition", open ? "border-green-500 ring-2 ring-green-500/15" : errs ? "border-red-200" : "border-slate-200/70")}>
              <button type="button" onClick={() => onOpen(open ? null : n.id)} className="w-full flex items-start gap-3 p-3.5 text-left">
                <span className="relative w-9 h-9 shrink-0 rounded-xl flex items-center justify-center text-white" style={{ background: meta.color }}>
                  <Icon name={meta.icon} className="w-4 h-4" />
                  <span className="absolute -top-1.5 -left-1.5 min-w-[18px] h-[18px] px-1 rounded-full bg-white border border-slate-200 text-[10px] font-bold text-slate-700 flex items-center justify-center tabular-nums">{i + 1}</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-sm font-semibold text-slate-900">{meta.label}</span>
                    {startId === n.id && <span className="rounded-full bg-green-50 px-1.5 py-px text-[10px] font-bold text-green-700">START</span>}
                    {errs > 0 && <span className="inline-flex items-center gap-0.5 rounded-full bg-red-50 px-1.5 py-px text-[10px] font-bold text-red-600"><Icon name="error" className="w-3 h-3" />{errs}</span>}
                    {!errs && iss.length > 0 && <Icon name="warning" className="w-3.5 h-3.5 text-amber-500" />}
                  </span>
                  <span className={cn("block text-xs mt-0.5", preview ? "text-slate-600 line-clamp-2 whitespace-pre-line" : "text-slate-400 italic")}>{preview || "Tap to configure"}</span>
                  {n.type === "askQuestion" && (n.data.options ?? []).filter(Boolean).length > 0 && !open && (
                    <span className="mt-1.5 flex flex-wrap gap-1">
                      {(n.data.options ?? []).filter(Boolean).map((o) => <span key={o} className="rounded-md border border-blue-100 bg-blue-50 px-1.5 py-px text-[10px] font-medium text-blue-700">{o}</span>)}
                    </span>
                  )}
                </span>
                <Icon name={open ? "expand_less" : "expand_more"} className="w-5 h-5 text-slate-400 shrink-0" />
              </button>

              {open && (
                <div className="border-t border-slate-100 p-3.5 space-y-4">
                  <NodeEditor node={n} onChange={(p) => onPatch(n.id, p)} variables={variables} agents={agents} issues={iss} readOnly={readOnly} />
                </div>
              )}

              <div className="border-t border-slate-100 px-3.5 py-2.5 space-y-2">
                {n.type === "condition" ? (
                  <>
                    {nextSelect(n, "true", "Yes →")}
                    {nextSelect(n, "false", "No →")}
                  </>
                ) : isTerminal(n.type) ? (
                  <p className="text-[11px] text-slate-400 flex items-center gap-1"><Icon name="flag" className="w-3.5 h-3.5" /> The bot stops after this step.</p>
                ) : (
                  nextSelect(n, null, "Then →")
                )}
                {!readOnly && (
                  <div className="flex items-center gap-1 pt-0.5">
                    <IconBtn icon="arrow_back" label="Move up" className="rotate-90" disabled={i === 0} onClick={() => onMove(n.id, -1)} />
                    <IconBtn icon="arrow_forward" label="Move down" className="rotate-90" disabled={i === nodes.length - 1} onClick={() => onMove(n.id, 1)} />
                    <IconBtn icon="content_copy" label="Duplicate" onClick={() => onDuplicate(n.id)} />
                    <div className="flex-1" />
                    <IconBtn icon="delete" label="Delete" danger onClick={() => onDelete(n.id)} />
                  </div>
                )}
              </div>
            </article>
            {!readOnly && (
              <div className="flex justify-center py-1">
                <button type="button" onClick={() => onAddAfter(n.id)} aria-label={`Add step after step ${i + 1}`}
                  className="w-7 h-7 rounded-full border border-slate-200 bg-white text-slate-400 hover:text-green-700 hover:border-green-300 flex items-center justify-center shadow-sm">
                  <Icon name="add" className="w-4 h-4" />
                </button>
              </div>
            )}
          </div>
        );
      })}

      {!readOnly && (
        <button type="button" onClick={() => onAddAfter(nodes.length ? nodes[nodes.length - 1].id : null)}
          className="w-full rounded-2xl border-2 border-dashed border-slate-300 py-3.5 text-sm font-semibold text-slate-600 hover:border-green-400 hover:text-green-700 flex items-center justify-center gap-2">
          <Icon name="add" className="w-4 h-4" /> Add step
        </button>
      )}
    </div>
  );
}

function IconBtn({ icon, label, onClick, disabled, danger, className }: { icon: string; label: string; onClick: () => void; disabled?: boolean; danger?: boolean; className?: string }) {
  return (
    <button type="button" aria-label={label} title={label} disabled={disabled} onClick={onClick}
      className={cn("w-9 h-9 rounded-lg flex items-center justify-center disabled:opacity-30", danger ? "text-red-500 hover:bg-red-50" : "text-slate-500 hover:bg-slate-100")}>
      <Icon name={icon} className={cn("w-4 h-4", className)} />
    </button>
  );
}
