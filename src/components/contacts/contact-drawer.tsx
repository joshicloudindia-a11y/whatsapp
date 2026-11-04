"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, timeAgo } from "@/lib/utils";
import { displayName, prettyPhone, type ContactDetail, type ContactRow } from "./shared";
import { Avatar, StagePill, TagChip, errMsg, fmt } from "./ui";

const dateFmt = (d: string) => new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" });

export function ContactDrawer({ id, canDelete, onClose, onEdit, onChanged }: {
  id: string;
  canDelete: boolean;
  onClose: () => void;
  onEdit: (c: ContactDetail) => void;
  onChanged: (deleted?: boolean) => void;
}) {
  const [busy, setBusy] = useState(false);
  const { data: c, isLoading, isError, refetch } = useQuery({
    queryKey: ["contact", id],
    queryFn: () => axios.get(`/api/contacts/${id}`).then((r) => r.data.contact as ContactDetail),
  });

  const copy = (text: string) => navigator.clipboard?.writeText(text).then(() => toast.success("Copied"), () => toast.error("Couldn't copy"));

  const patch = async (data: Partial<Pick<ContactRow, "optedOut" | "isBlocked">>, msg: string) => {
    setBusy(true);
    try {
      await axios.patch(`/api/contacts/${id}`, data);
      toast.success(msg);
      await refetch();
      onChanged();
    } catch (e) { toast.error(errMsg(e)); } finally { setBusy(false); }
  };

  const remove = async () => {
    if (!c || !confirm(`Delete ${displayName(c)}? This can't be undone.`)) return;
    setBusy(true);
    try {
      await axios.delete(`/api/contacts/${id}`);
      toast.success("Contact deleted");
      onChanged(true);
    } catch (e) { toast.error(errMsg(e, "Couldn't delete contact")); } finally { setBusy(false); }
  };

  const hasHistory = !!c && (c._count.conversations > 0 || c._count.broadcastLogs > 0);

  return (
    <div className="fixed inset-0 z-[60]" role="dialog" aria-modal="true" aria-label="Contact details">
      <div className="absolute inset-0 bg-slate-950/40 admin-fade" onClick={onClose} />
      <aside className="absolute inset-y-0 right-0 w-full sm:w-[440px] bg-white shadow-2xl flex flex-col admin-pop">
        <div className="flex items-center gap-2 px-4 h-14 border-b border-slate-100 shrink-0">
          <p className="flex-1 text-sm font-bold text-slate-900">Contact details</p>
          {c && (
            <button onClick={() => onEdit(c)} className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50">
              <Icon name="edit" className="w-3.5 h-3.5" /> Edit
            </button>
          )}
          <button onClick={onClose} aria-label="Close" className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-400 hover:bg-slate-100"><Icon name="close" className="w-4 h-4" /></button>
        </div>

        {isLoading ? (
          <div className="p-5 space-y-3">{[0, 1, 2, 3].map((i) => <div key={i} className="h-16 rounded-xl bg-slate-100 animate-pulse" />)}</div>
        ) : isError || !c ? (
          <div className="p-8 text-center">
            <Icon name="error" className="w-8 h-8 text-red-400" />
            <p className="mt-2 text-sm text-slate-600">Couldn&apos;t load this contact.</p>
            <button onClick={() => refetch()} className="mt-3 text-xs font-semibold text-green-700 hover:underline">Try again</button>
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto">
            <div className="px-5 pt-6 pb-5 text-center border-b border-slate-100">
              <div className="flex justify-center"><Avatar name={c.name} seed={c.id} size="lg" /></div>
              <p className="mt-3 text-lg font-bold text-slate-900 break-words">{displayName(c)}</p>
              <button onClick={() => copy(`+${c.phone}`)} className="mt-0.5 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-green-700">
                {prettyPhone(c.phone)} <Icon name="content_copy" className="w-3.5 h-3.5" />
              </button>
              <div className="mt-3 flex flex-wrap justify-center gap-1.5">
                <StagePill stage={c.stage} />
                {c.optedOut && <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700"><Icon name="person_remove" className="w-3 h-3" /> Opted out</span>}
                {c.isBlocked && <span className="inline-flex items-center gap-1 rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-600"><Icon name="block" className="w-3 h-3" /> Blocked</span>}
              </div>
              <div className="mt-4 grid grid-cols-2 gap-2">
                {c.latestConversation ? (
                  <Link href={`/inbox?id=${c.latestConversation.id}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-[#25D366] px-3 py-2.5 text-sm font-semibold text-white hover:bg-[#1fb857]">
                    <Icon name="chat" className="w-4 h-4" /> Open chat
                  </Link>
                ) : (
                  <span title="This contact hasn't messaged you yet" className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-100 px-3 py-2.5 text-sm font-semibold text-slate-400 cursor-not-allowed">
                    <Icon name="chat" className="w-4 h-4" /> No chats yet
                  </span>
                )}
                {c.email ? (
                  <a href={`mailto:${c.email}`} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <Icon name="mail" className="w-4 h-4" /> Email
                  </a>
                ) : (
                  <button onClick={() => copy(c.phone)} className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50">
                    <Icon name="content_copy" className="w-4 h-4" /> Copy number
                  </button>
                )}
              </div>
            </div>

            <div className="p-5 space-y-5">
              <div className="grid grid-cols-2 gap-2">
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="flex items-center gap-1 text-[11px] text-slate-500"><Icon name="forum" className="w-3.5 h-3.5" /> Conversations</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{fmt(c._count.conversations)}</p>
                </div>
                <div className="rounded-xl bg-slate-50 p-3">
                  <p className="flex items-center gap-1 text-[11px] text-slate-500"><Icon name="campaign" className="w-3.5 h-3.5" /> Broadcasts received</p>
                  <p className="mt-1 text-lg font-bold text-slate-900 tabular-nums">{fmt(c._count.broadcastLogs)}</p>
                </div>
              </div>

              <dl className="rounded-xl border border-slate-100 divide-y divide-slate-100 text-sm">
                {([
                  ["Email", c.email ?? "—"],
                  ["Added", dateFmt(c.createdAt)],
                  ["Last seen", c.lastSeenAt ? timeAgo(c.lastSeenAt) : "Never"],
                  ["Last chat", c.latestConversation ? `${c.latestConversation.status.toLowerCase()}${c.latestConversation.lastMessageAt ? ` · ${timeAgo(c.latestConversation.lastMessageAt)}` : ""}` : "—"],
                ] as const).map(([k, v]) => (
                  <div key={k} className="flex justify-between gap-4 px-3 py-2.5">
                    <dt className="text-slate-500 shrink-0">{k}</dt>
                    <dd className="font-medium text-slate-800 text-right truncate">{v}</dd>
                  </div>
                ))}
              </dl>

              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Tags</h4>
                {c.tags.length ? <div className="flex flex-wrap gap-1.5">{c.tags.map((t) => <TagChip key={t.tag} tag={t.tag} />)}</div> : <p className="text-xs text-slate-400">No tags</p>}
              </section>

              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Notes</h4>
                {c.notes ? <p className="whitespace-pre-wrap rounded-xl bg-amber-50/60 border border-amber-100 p-3 text-sm text-slate-700">{c.notes}</p> : <p className="text-xs text-slate-400">No notes</p>}
              </section>

              {c.attributes.length > 0 && (
                <section className="space-y-2">
                  <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Attributes</h4>
                  <dl className="rounded-xl border border-slate-100 divide-y divide-slate-100 text-sm">
                    {c.attributes.map((a) => (
                      <div key={a.key} className="flex justify-between gap-4 px-3 py-2"><dt className="text-slate-500">{a.key}</dt><dd className="font-medium text-slate-800 text-right break-all">{a.value}</dd></div>
                    ))}
                  </dl>
                </section>
              )}

              <section className="space-y-2">
                <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-400">Messaging</h4>
                <div className="grid grid-cols-2 gap-2">
                  <button disabled={busy} onClick={() => patch({ optedOut: !c.optedOut }, c.optedOut ? "Opted back in" : "Marked as opted out")}
                    className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50">
                    <Icon name={c.optedOut ? "person_add" : "person_remove"} className="w-4 h-4" /> {c.optedOut ? "Opt back in" : "Opt out"}
                  </button>
                  <button disabled={busy} onClick={() => patch({ isBlocked: !c.isBlocked }, c.isBlocked ? "Unblocked" : "Blocked")}
                    className={cn("inline-flex items-center justify-center gap-1.5 rounded-xl border px-3 py-2 text-xs font-semibold disabled:opacity-50",
                      c.isBlocked ? "border-slate-200 text-slate-700 hover:bg-slate-50" : "border-red-100 text-red-600 hover:bg-red-50")}>
                    <Icon name={c.isBlocked ? "lock_open" : "block"} className="w-4 h-4" /> {c.isBlocked ? "Unblock" : "Block"}
                  </button>
                </div>
              </section>

              {canDelete && (
                <section className="rounded-xl border border-red-100 bg-red-50/40 p-3">
                  {hasHistory ? (
                    <p className="flex gap-2 text-xs text-slate-600"><Icon name="info" className="w-4 h-4 text-slate-400 shrink-0" />
                      This contact has chat or broadcast history, so it can&apos;t be deleted. Block or opt them out to stop messaging.</p>
                  ) : (
                    <button disabled={busy} onClick={remove} className="inline-flex items-center gap-1.5 text-xs font-semibold text-red-600 hover:underline disabled:opacity-50">
                      <Icon name="delete" className="w-4 h-4" /> Delete contact
                    </button>
                  )}
                </section>
              )}
            </div>
          </div>
        )}
      </aside>
    </div>
  );
}
