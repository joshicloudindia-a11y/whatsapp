"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

export interface ReminderRow {
  id: string; dueAt: string; note: string; doneAt: string | null; createdAt: string; conversationId: string | null;
  contact: { id: string; name: string | null; phone: string };
  createdBy: { id: string; name: string | null };
  assignedTo: { id: string; name: string | null } | null;
}

const err = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Something went wrong";
const pad = (n: number) => String(n).padStart(2, "0");
/** Value for <input type="datetime-local"> in the viewer's timezone. */
const toLocalInput = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
const whenText = (iso: string, now: number) => {
  const d = new Date(iso);
  const label = d.toLocaleString("en-IN", { day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });
  return d.getTime() <= now ? `Due · ${label}` : label;
};

function presets(now: number) {
  const inHour = new Date(now + 60 * 60 * 1000);
  const tomorrow = new Date(now); tomorrow.setDate(tomorrow.getDate() + 1); tomorrow.setHours(10, 0, 0, 0);
  const in3 = new Date(now); in3.setDate(in3.getDate() + 3); in3.setHours(10, 0, 0, 0);
  const nextWeek = new Date(now); nextWeek.setDate(nextWeek.getDate() + 7); nextWeek.setHours(10, 0, 0, 0);
  return [["In 1 hour", inHour], ["Tomorrow 10 AM", tomorrow], ["In 3 days", in3], ["Next week", nextWeek]] as const;
}

/** Follow-up reminders for one contact (inbox info panel). */
export function ContactFollowUps({ contactId, conversationId }: { contactId: string; conversationId: string }) {
  const qc = useQueryClient();
  const [now] = useState(() => Date.now());
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState("");
  const [dueAt, setDueAt] = useState(() => toLocalInput(presets(Date.now())[1][1]));
  const [saving, setSaving] = useState(false);
  const key = ["reminders", contactId];
  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => axios.get("/api/reminders", { params: { contactId } }).then((r) => r.data.reminders as ReminderRow[]),
  });
  const open = (data ?? []).filter((r) => !r.doneAt);
  const refresh = () => { qc.invalidateQueries({ queryKey: key }); qc.invalidateQueries({ queryKey: ["my-reminders"] }); };

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await axios.post("/api/reminders", { contactId, conversationId, note, dueAt: new Date(dueAt).toISOString() });
      toast.success("Follow-up reminder set");
      setNote(""); setAdding(false); refresh();
    } catch (e) { toast.error(err(e)); }
    finally { setSaving(false); }
  };
  const done = async (r: ReminderRow) => {
    try { await axios.patch(`/api/reminders/${r.id}`, { done: true }); toast.success("Marked as done"); refresh(); }
    catch (e) { toast.error(err(e)); }
  };

  return (
    <section className="space-y-2">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-slate-700 flex items-center gap-1.5">
          <Icon name="notifications" className="w-3.5 h-3.5 text-slate-400" /> Follow-ups
          {open.length > 0 && <span className="rounded-full bg-amber-100 px-1.5 text-[10px] font-bold text-amber-700">{open.length}</span>}
        </p>
        {!adding && (
          <button type="button" onClick={() => setAdding(true)} className="inline-flex items-center gap-0.5 text-[11px] font-semibold text-green-700 hover:text-green-800">
            <Icon name="add" className="w-3.5 h-3.5" /> Add
          </button>
        )}
      </div>

      {adding && (
        <form onSubmit={save} className="space-y-2 rounded-xl border border-slate-200 bg-slate-50/60 p-2.5">
          <textarea value={note} onChange={(e) => setNote(e.target.value)} required maxLength={1000} rows={2} autoFocus
            placeholder="e.g. Call back about the bulk order quote"
            className="w-full resize-none rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/40" />
          <div className="flex flex-wrap gap-1">
            {presets(now).map(([label, d]) => (
              <button key={label} type="button" onClick={() => setDueAt(toLocalInput(d))}
                className={cn("rounded-full border px-2 py-0.5 text-[10px] font-semibold", dueAt === toLocalInput(d) ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50")}>
                {label}
              </button>
            ))}
          </div>
          <input type="datetime-local" value={dueAt} onChange={(e) => setDueAt(e.target.value)} required
            className="w-full rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-green-500/40" />
          <div className="flex justify-end gap-1.5">
            <button type="button" onClick={() => setAdding(false)} className="rounded-lg px-2.5 py-1.5 text-[11px] font-semibold text-slate-500 hover:bg-white">Cancel</button>
            <button type="submit" disabled={saving || !note.trim()} className="rounded-lg bg-[#25D366] px-3 py-1.5 text-[11px] font-semibold text-white hover:bg-[#1fb857] disabled:opacity-60">
              {saving ? "Saving…" : "Set reminder"}
            </button>
          </div>
        </form>
      )}

      {isLoading ? (
        <div className="h-12 rounded-xl bg-slate-50 animate-pulse" />
      ) : open.length === 0 && !adding ? (
        <p className="text-[11px] text-slate-400">No follow-ups. Add one to get an email and a reminder in the app when it&apos;s due.</p>
      ) : (
        <ul className="space-y-1.5">
          {open.map((r) => {
            const overdue = new Date(r.dueAt).getTime() <= now;
            return (
              <li key={r.id} className={cn("flex items-start gap-2 rounded-xl border p-2.5", overdue ? "border-amber-200 bg-amber-50/60" : "border-slate-100 bg-slate-50/60")}>
                <button type="button" onClick={() => done(r)} aria-label="Mark as done" title="Mark as done"
                  className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 bg-white text-transparent hover:border-green-500 hover:text-green-600">
                  <Icon name="check" className="w-3 h-3" />
                </button>
                <div className="min-w-0">
                  <p className="text-xs text-slate-700 break-words">{r.note}</p>
                  <p className={cn("mt-0.5 text-[10px] font-semibold", overdue ? "text-amber-700" : "text-slate-400")}>
                    {whenText(r.dueAt, now)}{r.createdBy.name ? ` · by ${r.createdBy.name}` : ""}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}

/** Header bell: my open follow-ups, with the number that are due. */
export function RemindersBell() {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const { data } = useQuery({
    queryKey: ["my-reminders"],
    queryFn: () => axios.get("/api/reminders").then((r) => r.data as { reminders: ReminderRow[]; due: number }),
    refetchInterval: 60_000,
  });
  const due = data?.due ?? 0;
  const done = async (r: ReminderRow) => {
    try { await axios.patch(`/api/reminders/${r.id}`, { done: true }); qc.invalidateQueries({ queryKey: ["my-reminders"] }); qc.invalidateQueries({ queryKey: ["reminders", r.contact.id] }); }
    catch (e) { toast.error(err(e)); }
  };

  return (
    <div className="relative">
      <button type="button" onClick={() => { setNow(Date.now()); setOpen((o) => !o); }} aria-label={`Follow-up reminders${due ? `, ${due} due` : ""}`}
        className="relative flex h-9 w-9 items-center justify-center rounded-xl text-slate-500 hover:bg-slate-100 hover:text-slate-800">
        <Icon name="notifications" className="w-5 h-5" />
        {due > 0 && <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold text-white">{due > 9 ? "9+" : due}</span>}
      </button>
      {open && (
        <>
          <button type="button" aria-hidden tabIndex={-1} className="fixed inset-0 z-40 cursor-default" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-11 z-50 w-[min(340px,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl">
            <p className="border-b border-slate-100 px-4 py-3 text-sm font-bold text-slate-900">Follow-ups</p>
            {!data?.reminders.length ? (
              <p className="px-4 py-6 text-center text-xs text-slate-400">Nothing to follow up. Add reminders from a chat&apos;s contact panel.</p>
            ) : (
              <ul className="max-h-[360px] divide-y divide-slate-100 overflow-y-auto">
                {data.reminders.map((r) => {
                  const overdue = new Date(r.dueAt).getTime() <= now;
                  return (
                    <li key={r.id} className="flex items-start gap-2.5 px-4 py-3">
                      <button type="button" onClick={() => done(r)} aria-label="Mark as done" title="Mark as done"
                        className="mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-full border border-slate-300 text-transparent hover:border-green-500 hover:text-green-600">
                        <Icon name="check" className="w-3 h-3" />
                      </button>
                      <Link href={`/inbox${r.conversationId ? `?id=${r.conversationId}` : ""}`} onClick={() => setOpen(false)} className="min-w-0 flex-1">
                        <p className="text-xs font-semibold text-slate-800 truncate">{r.contact.name || `+${r.contact.phone}`}</p>
                        <p className="text-xs text-slate-600 line-clamp-2">{r.note}</p>
                        <p className={cn("mt-0.5 text-[10px] font-semibold", overdue ? "text-amber-700" : "text-slate-400")}>{whenText(r.dueAt, now)}</p>
                      </Link>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </>
      )}
    </div>
  );
}
