"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";

interface Account { id: string; displayName: string; phoneNumber: string; phoneNumberId: string }
interface Template {
  id: string; name: string; language: string; category: string; headerType: string | null; headerContent: string | null;
  body: string; footer: string | null; bodyVars: number; headerVars: number; headerMedia: string | null;
}
type Status = "PENDING" | "SENT" | "DELIVERED" | "READ" | "FAILED";
interface SentMessage { id: string; status: Status; wamid: string | null; failureReason: string | null; createdAt: string; updatedAt: string }
interface SendResult {
  ok: boolean; message: SentMessage; conversationId: string;
  request: { method: string; url: string; headers: Record<string, string>; body: unknown };
  response: { status: number; durationMs: number; body: unknown };
}

const inputCls = "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500/40 focus:border-green-500";
const err = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? "Something went wrong";
const STEPS: { key: Status; label: string; icon: string }[] = [
  { key: "SENT", label: "Sent", icon: "check" },
  { key: "DELIVERED", label: "Delivered", icon: "done_all" },
  { key: "READ", label: "Read", icon: "visibility" },
];
const RANK: Record<Status, number> = { PENDING: 0, SENT: 1, DELIVERED: 2, READ: 3, FAILED: -1 };

function fill(text: string, values: string[]) {
  return text.replace(/\{\{\s*(\d+)\s*\}\}/g, (m, n) => values[Number(n) - 1]?.trim() || m);
}

function JsonBlock({ value }: { value: unknown }) {
  const text = JSON.stringify(value, null, 2);
  return (
    <div className="relative">
      <button type="button" onClick={() => { navigator.clipboard.writeText(text); toast.success("Copied"); }}
        className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-lg bg-white/10 px-2 py-1 text-[11px] font-medium text-slate-200 hover:bg-white/20">
        <Icon name="content_copy" className="w-3 h-3" /> Copy
      </button>
      <pre className="max-h-[420px] overflow-auto rounded-xl bg-slate-950 p-4 pr-16 text-[12px] leading-5 text-green-200"><code>{text}</code></pre>
    </div>
  );
}

export default function SendMessagePage() {
  const { data, isLoading } = useQuery({
    queryKey: ["test-message-options"],
    queryFn: () => axios.get("/api/test-message").then((r) => r.data as { accounts: Account[]; templates: Template[] }),
  });
  const accounts = data?.accounts ?? [];
  const templates = data?.templates ?? [];

  const [accountId, setAccountId] = useState("");
  const [to, setTo] = useState("");
  const [templateId, setTemplateId] = useState("");
  const [bodyVars, setBodyVars] = useState<string[]>([]);
  const [headerText, setHeaderText] = useState("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [sending, setSending] = useState(false);
  const [result, setResult] = useState<SendResult | null>(null);
  const [tab, setTab] = useState<"response" | "request">("response");

  const account = accounts.find((a) => a.id === accountId) ?? accounts[0];
  const tpl = templates.find((t) => t.id === templateId);

  const { data: live } = useQuery({
    queryKey: ["test-message-status", result?.message.id],
    queryFn: () => axios.get(`/api/test-message/${result!.message.id}`).then((r) => r.data.message as SentMessage),
    enabled: !!result?.ok,
    refetchInterval: (q) => {
      const s = (q.state.data as SentMessage | undefined)?.status;
      return s === "READ" || s === "FAILED" ? false : 2500;
    },
  });
  const msg = live ?? result?.message;

  const preview = useMemo(() => {
    if (!tpl) return null;
    return {
      header: tpl.headerType?.toUpperCase() === "TEXT" ? fill(tpl.headerContent ?? "", [headerText]) : null,
      body: fill(tpl.body, bodyVars),
      footer: tpl.footer,
    };
  }, [tpl, bodyVars, headerText]);

  const pickTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => x.id === id);
    setBodyVars(Array(t?.bodyVars ?? 0).fill(""));
    setHeaderText("");
    setHeaderMediaUrl("");
  };

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!account || !tpl) return;
    setSending(true);
    try {
      const r = await axios.post("/api/test-message", {
        accountId: account.id, to, templateId: tpl.id, bodyVariables: bodyVars, headerText, headerMediaUrl,
      });
      setResult(r.data);
      setTab("response");
      if (r.data.ok) toast.success("Accepted by WhatsApp. Waiting for delivery…");
      else toast.error("WhatsApp rejected the message. See the API response.");
    } catch (e) { toast.error(err(e)); }
    finally { setSending(false); }
  };

  const noSetup = data && (!accounts.length || !templates.length);

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 space-y-5 max-w-7xl mx-auto w-full">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold text-slate-900">Send message</h1>
        <p className="text-sm text-slate-500 mt-0.5">Send an approved template to one number and see WhatsApp&apos;s API response and live delivery status.</p>
      </div>

      {noSetup && (
        <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <Icon name="warning" className="w-5 h-5 text-amber-600 shrink-0" />
          <p className="flex-1 text-sm text-amber-900">
            {!accounts.length ? "Connect a WhatsApp number first." : "You need at least one approved template. Create one and submit it to Meta, or sync from Meta."}
          </p>
          <Link href={!accounts.length ? "/settings?tab=whatsapp" : "/templates"} className="shrink-0 rounded-xl bg-white border border-amber-200 px-3.5 py-2 text-xs font-semibold text-amber-800 hover:bg-amber-100">
            {!accounts.length ? "Connect WhatsApp" : "Open templates"}
          </Link>
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,420px)_minmax(0,1fr)]">
        {/* Composer */}
        <form onSubmit={send} className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5 shadow-sm space-y-4 self-start">
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">From (WhatsApp number)</span>
            <select className={inputCls} value={account?.id ?? ""} onChange={(e) => setAccountId(e.target.value)} disabled={isLoading || !accounts.length}>
              {accounts.map((a) => <option key={a.id} value={a.id}>{a.displayName} · +{a.phoneNumber}</option>)}
            </select>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Recipient number</span>
            <div className="relative">
              <Icon name="smartphone" className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 pointer-events-none" />
              <input className={cn(inputCls, "pl-10 font-mono")} inputMode="tel" placeholder="919876543210" value={to} onChange={(e) => setTo(e.target.value)} required />
            </div>
            <span className="block text-[11px] text-slate-400">With country code, no + or spaces.</span>
          </label>

          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Message template</span>
            <select className={inputCls} value={templateId} onChange={(e) => pickTemplate(e.target.value)} required disabled={isLoading || !templates.length}>
              <option value="">{isLoading ? "Loading…" : "Choose an approved template"}</option>
              {templates.map((t) => <option key={t.id} value={t.id}>{t.name} · {t.language} · {t.category.toLowerCase()}</option>)}
            </select>
          </label>

          {tpl && tpl.headerVars > 0 && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Header variable {"{{1}}"}</span>
              <input className={inputCls} value={headerText} onChange={(e) => setHeaderText(e.target.value)} required maxLength={60} />
            </label>
          )}
          {tpl?.headerMedia && (
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Header {tpl.headerMedia.toLowerCase()} link</span>
              <input className={inputCls} type="url" placeholder="https://…" value={headerMediaUrl} onChange={(e) => setHeaderMediaUrl(e.target.value)} required />
            </label>
          )}
          {bodyVars.map((v, i) => (
            <label key={i} className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">{tpl?.category === "AUTHENTICATION" && i === 0 ? "One-time code {{1}}" : `Body variable {{${i + 1}}}`}</span>
              <input className={inputCls} value={v} onChange={(e) => setBodyVars(bodyVars.map((x, k) => (k === i ? e.target.value : x)))} required />
            </label>
          ))}

          {preview && (
            <div className="rounded-2xl bg-[#e7ddd3] p-3">
              <div className="ml-auto max-w-[92%] rounded-xl rounded-tr-sm bg-[#d9fdd3] px-3 py-2 shadow-sm text-[13px] text-slate-800 space-y-1">
                {tpl?.headerMedia && (
                  <div className="flex items-center gap-1.5 rounded-lg bg-white/60 px-2 py-3 text-xs text-slate-500">
                    <Icon name={tpl.headerMedia === "VIDEO" ? "videocam" : tpl.headerMedia === "DOCUMENT" ? "description" : "image"} className="w-4 h-4" />
                    {tpl.headerMedia.toLowerCase()} header
                  </div>
                )}
                {preview.header && <p className="font-semibold">{preview.header}</p>}
                <p className="whitespace-pre-wrap break-words">{preview.body}</p>
                {preview.footer && <p className="text-[11px] text-slate-500">{preview.footer}</p>}
              </div>
            </div>
          )}

          <button type="submit" disabled={sending || !account || !tpl}
            className="w-full inline-flex items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857] disabled:opacity-60">
            {sending ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Icon name="send" className="w-4 h-4" />}
            {sending ? "Sending…" : "Send message"}
          </button>
        </form>

        {/* Result */}
        <div className="space-y-5 min-w-0">
          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900">Message status</h2>
              {msg && result?.ok && msg.status !== "READ" && msg.status !== "FAILED" && (
                <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-400">
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" /> Live
                </span>
              )}
            </div>
            {!msg ? (
              <p className="mt-3 text-sm text-slate-400">Send a message to see its status here.</p>
            ) : msg.status === "FAILED" ? (
              <div className="mt-3 flex gap-3 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-700">
                <Icon name="error" className="w-5 h-5 shrink-0" />
                <div className="min-w-0">
                  <p className="font-semibold">Failed</p>
                  <p className="text-xs mt-0.5 break-words">{msg.failureReason ?? "WhatsApp could not deliver this message."}</p>
                </div>
              </div>
            ) : (
              <>
                <ol className="mt-4 grid grid-cols-3 gap-2">
                  {STEPS.map((s) => {
                    const done = RANK[msg.status] >= RANK[s.key];
                    return (
                      <li key={s.key} className={cn("rounded-xl border p-3 text-center transition", done ? "border-green-200 bg-green-50" : "border-slate-200 bg-slate-50")}>
                        <span className={cn("mx-auto flex h-8 w-8 items-center justify-center rounded-full", done ? "bg-[#25D366] text-white" : "bg-slate-200 text-slate-400")}>
                          <Icon name={s.icon} className="w-4 h-4" />
                        </span>
                        <p className={cn("mt-1.5 text-xs font-semibold", done ? "text-green-800" : "text-slate-400")}>{s.label}</p>
                      </li>
                    );
                  })}
                </ol>
                <dl className="mt-4 grid gap-1 text-xs text-slate-500 sm:grid-cols-2">
                  <div className="min-w-0"><dt className="inline">Message ID: </dt><dd className="inline font-mono text-slate-700 break-all">{msg.wamid}</dd></div>
                  <div><dt className="inline">Last update: </dt><dd className="inline text-slate-700">{new Date(msg.updatedAt).toLocaleTimeString()}</dd></div>
                </dl>
                {result && (
                  <Link href={`/inbox?id=${result.conversationId}`} className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-green-700 hover:text-green-800">
                    Open conversation in inbox <Icon name="arrow_forward" className="w-3.5 h-3.5" />
                  </Link>
                )}
              </>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200/70 bg-white p-4 sm:p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-bold text-slate-900">API response</h2>
              <div className="inline-flex rounded-xl bg-slate-100 p-1 text-xs font-semibold">
                {(["response", "request"] as const).map((t) => (
                  <button key={t} type="button" onClick={() => setTab(t)}
                    className={cn("rounded-lg px-3 py-1.5 capitalize", tab === t ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
                    {t}
                  </button>
                ))}
              </div>
            </div>
            {!result ? (
              <p className="mt-3 text-sm text-slate-400">The exact request sent to the WhatsApp Cloud API and its raw response appear here.</p>
            ) : tab === "response" ? (
              <div className="mt-3 space-y-2">
                <p className="flex flex-wrap items-center gap-2 text-xs">
                  <span className={cn("rounded-full px-2 py-0.5 font-bold", result.response.status >= 200 && result.response.status < 300 ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>
                    HTTP {result.response.status || "—"}
                  </span>
                  <span className="text-slate-400">{result.response.durationMs} ms</span>
                </p>
                <JsonBlock value={result.response.body} />
              </div>
            ) : (
              <div className="mt-3 space-y-2">
                <p className="text-xs font-mono text-slate-600 break-all"><b>{result.request.method}</b> {result.request.url}</p>
                <JsonBlock value={{ headers: result.request.headers, body: result.request.body }} />
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
