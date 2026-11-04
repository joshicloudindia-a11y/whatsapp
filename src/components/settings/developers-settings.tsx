"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, timeAgo } from "@/lib/utils";
import { SButton, SField, SettingsCard, SettingsHeader, sInput, settingsError } from "./ui";

// ─── Types ──────────────────────────────────────────────────────────────────

interface EventDef { id: string; label: string; description: string }
interface Endpoint {
  id: string; name: string; url: string; events: string[]; isActive: boolean; failureCount: number;
  lastTriggeredAt: string | null; createdAt: string; _count?: { deliveries: number };
}
interface Delivery {
  id: string; event: string; statusCode: number | null; responseBody: string | null; success: boolean;
  duration: number | null; createdAt: string; attempt: number; payload: unknown;
}

const copy = (text: string, what = "Copied to clipboard") => {
  navigator.clipboard.writeText(text).then(() => toast.success(what), () => toast.error("Couldn't copy"));
};

const baseUrl = () =>
  ((process.env.NEXT_PUBLIC_APP_URL || (typeof window !== "undefined" ? window.location.origin : "")).replace(/\/$/, "")) + "/api/v1";

// ─── Root ───────────────────────────────────────────────────────────────────

export function DevelopersSettings() {
  const [section, setSection] = useState<"api" | "webhooks">("api");
  return (
    <div className="max-w-4xl space-y-5">
      <SettingsHeader title="Developers" description="Connect your own systems with the ChatFlow REST API and real-time webhooks." />
      <div className="inline-flex w-full sm:w-auto rounded-xl border border-slate-200 bg-slate-50 p-1" role="tablist">
        {([
          { id: "api", label: "REST API", icon: "code" },
          { id: "webhooks", label: "Webhooks", icon: "http" },
        ] as const).map((t) => (
          <button key={t.id} role="tab" aria-selected={section === t.id} onClick={() => setSection(t.id)}
            className={cn("flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-lg px-4 py-2 text-sm font-semibold transition",
              section === t.id ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700")}>
            <Icon name={t.icon} className={cn("w-4 h-4", section === t.id && "text-green-600")} /> {t.label}
          </button>
        ))}
      </div>
      {section === "api" ? <ApiDocs /> : <Webhooks />}
    </div>
  );
}

// ─── API docs ───────────────────────────────────────────────────────────────

function CodeBlock({ code, label }: { code: string; label?: string }) {
  return (
    <div className="rounded-xl bg-slate-900 overflow-hidden">
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10">
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">{label ?? "curl"}</span>
        <button onClick={() => copy(code)} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-semibold text-slate-300 hover:bg-white/10" aria-label="Copy code">
          <Icon name="content_copy" className="w-3.5 h-3.5" /> Copy
        </button>
      </div>
      <pre className="p-3 text-[12px] leading-relaxed text-slate-100 overflow-x-auto"><code>{code}</code></pre>
    </div>
  );
}

const METHOD_CLS: Record<string, string> = {
  GET: "bg-sky-50 text-sky-700 border-sky-100",
  POST: "bg-green-50 text-green-700 border-green-100",
  PATCH: "bg-amber-50 text-amber-700 border-amber-100",
};

interface DocEndpoint { method: "GET" | "POST" | "PATCH"; path: string; title: string; description: string; curl: (b: string) => string; response: string; notes?: string[] }

const KEY = "$CHATFLOW_API_KEY";

const ENDPOINTS: DocEndpoint[] = [
  {
    method: "POST", path: "/messages", title: "Send a message",
    description: "Send a text (only while the customer's 24-hour window is open) or an approved template to a phone number. The contact and conversation are created automatically.",
    curl: (b) => `curl -X POST ${b}/messages \\
  -H "Authorization: Bearer ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{
    "to": "919876543210",
    "type": "template",
    "template": { "name": "order_update", "language": "en", "variables": ["Asha", "#1042"] }
  }'

# Free-form text (24h window must be open)
curl -X POST ${b}/messages \\
  -H "Authorization: Bearer ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{ "to": "919876543210", "type": "text", "text": "Your order has shipped!" }'`,
    response: `{
  "id": "cm3x9k2...",
  "wamid": "wamid.HBgMOTE5ODc2NTQzMjEw...",
  "status": "sent",
  "message": { "id": "cm3x9k2...", "direction": "outbound", "type": "template", "status": "sent", "to": "919876543210", ... }
}`,
    notes: [
      "`to`: digits with country code. Optional `from`: the phoneNumberId of the sending number (defaults to your first active number). Optional `name` for new contacts.",
      "Errors: WINDOW_CLOSED (422), CONTACT_OPTED_OUT (422), TEMPLATE_NOT_FOUND (404), SEND_FAILED (502, includes messageId).",
    ],
  },
  {
    method: "GET", path: "/messages/{id}", title: "Get message status",
    description: "Look up a message by its id (or WhatsApp wamid) to check delivery status.",
    curl: (b) => `curl ${b}/messages/cm3x9k2... \\
  -H "Authorization: Bearer ${KEY}"`,
    response: `{
  "message": {
    "id": "cm3x9k2...", "wamid": "wamid.HBgM...", "direction": "outbound", "type": "text",
    "status": "delivered", "to": "919876543210", "content": "Your order has shipped!",
    "failureReason": null, "createdAt": "2026-11-05T10:00:00.000Z", "updatedAt": "2026-11-05T10:00:04.000Z"
  }
}`,
    notes: ["status is one of pending, sent, delivered, read, failed."],
  },
  {
    method: "GET", path: "/contacts", title: "List contacts",
    description: "Paginated contact list. Filter with search (name, email or phone), stage, tag and optedOut.",
    curl: (b) => `curl "${b}/contacts?search=asha&page=1&limit=25" \\
  -H "Authorization: Bearer ${KEY}"`,
    response: `{
  "data": [
    { "id": "cm3...", "phone": "919876543210", "name": "Asha", "email": "asha@example.com",
      "stage": "CUSTOMER", "tags": ["vip"], "optedOut": false, "isBlocked": false,
      "lastSeenAt": null, "createdAt": "...", "updatedAt": "..." }
  ],
  "page": 1, "limit": 25, "total": 1, "pages": 1
}`,
  },
  {
    method: "POST", path: "/contacts", title: "Create or update a contact",
    description: "Upserts by phone number. Returns 201 when created, 200 when an existing contact was updated.",
    curl: (b) => `curl -X POST ${b}/contacts \\
  -H "Authorization: Bearer ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{ "phone": "919876543210", "name": "Asha", "email": "asha@example.com", "stage": "lead", "tags": ["website"] }'`,
    response: `{ "contact": { "id": "cm3...", "phone": "919876543210", "name": "Asha", ... }, "created": true }`,
  },
  {
    method: "GET", path: "/contacts/{id}", title: "Get a contact",
    description: "Fetch one contact by id or by phone number.",
    curl: (b) => `curl ${b}/contacts/919876543210 \\
  -H "Authorization: Bearer ${KEY}"`,
    response: `{ "contact": { "id": "cm3...", "phone": "919876543210", "name": "Asha", "tags": ["vip"], ... } }`,
  },
  {
    method: "PATCH", path: "/contacts/{id}", title: "Update a contact",
    description: "Update name, email, stage (lead, prospect, customer, churned), tags (replaces the list) or optedOut.",
    curl: (b) => `curl -X PATCH ${b}/contacts/cm3... \\
  -H "Authorization: Bearer ${KEY}" \\
  -H "Content-Type: application/json" \\
  -d '{ "stage": "customer", "tags": ["vip", "repeat"], "optedOut": false }'`,
    response: `{ "contact": { "id": "cm3...", "stage": "CUSTOMER", "tags": ["repeat", "vip"], ... } }`,
  },
  {
    method: "GET", path: "/templates", title: "List approved templates",
    description: "Approved message templates you can send. Filter with search, language and category.",
    curl: (b) => `curl "${b}/templates?language=en" \\
  -H "Authorization: Bearer ${KEY}"`,
    response: `{
  "data": [
    { "id": "cm3...", "name": "order_update", "language": "en", "category": "utility",
      "header": null, "body": "Hi {{1}}, your order {{2}} has shipped.", "footer": null,
      "buttons": [], "variables": 2, "approvedAt": "..." }
  ],
  "page": 1, "limit": 25, "total": 1, "pages": 1
}`,
  },
];

function EndpointDoc({ ep, base }: { ep: DocEndpoint; base: string }) {
  const [open, setOpen] = useState(false);
  return (
    <li className="border-t border-slate-100 first:border-t-0">
      <button onClick={() => setOpen((o) => !o)} aria-expanded={open}
        className="w-full flex items-center gap-3 px-4 sm:px-5 py-3.5 text-left hover:bg-slate-50/70">
        <span className={cn("w-14 shrink-0 text-center rounded-md border px-1.5 py-0.5 text-[11px] font-bold", METHOD_CLS[ep.method])}>{ep.method}</span>
        <span className="min-w-0 flex-1">
          <span className="block font-mono text-[13px] text-slate-800 truncate">{ep.path}</span>
          <span className="block text-xs text-slate-500 truncate">{ep.title}</span>
        </span>
        <Icon name={open ? "expand_less" : "expand_more"} className="w-5 h-5 text-slate-400 shrink-0" />
      </button>
      {open && (
        <div className="px-4 sm:px-5 pb-5 space-y-3">
          <p className="text-sm text-slate-600">{ep.description}</p>
          {ep.notes?.map((n) => (
            <p key={n} className="flex items-start gap-2 text-xs text-slate-500"><Icon name="info" className="w-4 h-4 shrink-0 text-slate-400" />{n}</p>
          ))}
          <CodeBlock code={ep.curl(base)} label="Request" />
          <CodeBlock code={ep.response} label="Response" />
        </div>
      )}
    </li>
  );
}

const VERIFY_SNIPPET = `// Node.js / Express — verify X-ChatFlow-Signature
import crypto from "crypto";

app.post("/webhooks/chatflow", express.raw({ type: "application/json" }), (req, res) => {
  const expected = "sha256=" + crypto
    .createHmac("sha256", process.env.CHATFLOW_WEBHOOK_SECRET)
    .update(req.body) // the raw request body, before JSON parsing
    .digest("hex");
  const given = req.get("X-ChatFlow-Signature") || "";
  const ok = given.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(given), Buffer.from(expected));
  if (!ok) return res.status(401).end();

  const event = JSON.parse(req.body.toString()); // { id, event, createdAt, data }
  // Use event.id to ignore duplicates. Respond quickly with 2xx.
  res.sendStatus(200);
});`;

function ApiDocs() {
  const base = baseUrl();
  return (
    <div className="space-y-5">
      <SettingsCard title="Quick start" description="Authenticate every request with an API key from Settings → API Keys." icon="rocket_launch">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Base URL</span>
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-800">{base}</code>
                <button onClick={() => copy(base)} aria-label="Copy base URL" className="w-10 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
                  <Icon name="content_copy" className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Authentication header</span>
              <div className="flex gap-2">
                <code className="flex-1 min-w-0 truncate rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5 font-mono text-xs text-slate-800">Authorization: Bearer cf_live_...</code>
                <button onClick={() => copy("Authorization: Bearer cf_live_...")} aria-label="Copy header" className="w-10 shrink-0 inline-flex items-center justify-center rounded-xl border border-slate-200 text-slate-500 hover:bg-slate-50">
                  <Icon name="content_copy" className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
          <div className="grid gap-2 sm:grid-cols-3 text-xs">
            {[
              { icon: "timer", title: "60 requests / minute", text: "Per key. 429 with Retry-After when exceeded." },
              { icon: "monitoring", title: "Metered usage", text: "Each request counts toward your plan's API calls." },
              { icon: "shield", title: "Keep keys secret", text: "Call the API from your server, never from a browser or app." },
            ].map((t) => (
              <div key={t.title} className="flex items-start gap-2.5 rounded-xl bg-slate-50 p-3">
                <Icon name={t.icon} className="w-4 h-4 text-green-600 shrink-0 mt-0.5" />
                <div><p className="font-semibold text-slate-800">{t.title}</p><p className="text-slate-500 mt-0.5">{t.text}</p></div>
              </div>
            ))}
          </div>
          <div className="space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Errors</span>
            <CodeBlock label="Error response" code={`HTTP/1.1 401 Unauthorized
{ "error": { "code": "UNAUTHORIZED", "message": "Invalid, revoked or expired API key." } }`} />
          </div>
        </div>
      </SettingsCard>

      <section className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
        <div className="flex items-start gap-3 px-4 sm:px-5 pt-4 sm:pt-5 pb-3">
          <span className="w-9 h-9 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center shrink-0"><Icon name="description" className="w-[18px] h-[18px]" /></span>
          <div>
            <h3 className="text-sm font-bold text-slate-900">Endpoints</h3>
            <p className="text-xs text-slate-500 mt-0.5">Tap an endpoint for a copyable example and sample response.</p>
          </div>
        </div>
        <ul>{ENDPOINTS.map((ep) => <EndpointDoc key={ep.method + ep.path} ep={ep} base={base} />)}</ul>
      </section>

      <SettingsCard title="Verifying webhook signatures" description="Every webhook is signed with your endpoint's secret." icon="lock">
        <div className="space-y-3">
          <p className="text-sm text-slate-600">
            We send <span className="font-mono text-xs">X-ChatFlow-Signature: sha256=&lt;hex&gt;</span>, an HMAC-SHA256 of the raw body keyed with your endpoint secret,
            plus <span className="font-mono text-xs">X-ChatFlow-Event</span>, <span className="font-mono text-xs">X-ChatFlow-Delivery</span> and <span className="font-mono text-xs">X-ChatFlow-Timestamp</span>.
            Requests time out after 5 seconds and are retried once on network errors or 5xx responses.
          </p>
          <CodeBlock code={VERIFY_SNIPPET} label="Node.js" />
        </div>
      </SettingsCard>
    </div>
  );
}

// ─── Webhooks ───────────────────────────────────────────────────────────────

function SecretBanner({ name, secret, onClose }: { name: string; secret: string; onClose: () => void }) {
  const [show, setShow] = useState(false);
  return (
    <div className="rounded-2xl border border-amber-200 bg-amber-50 p-4 sm:p-5 space-y-3" role="alert">
      <div className="flex items-start gap-3">
        <Icon name="warning" className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
        <div>
          <p className="text-sm font-bold text-amber-900">Signing secret for &ldquo;{name}&rdquo;</p>
          <p className="text-xs text-amber-800 mt-0.5">Store it in your server&apos;s environment and use it to verify the X-ChatFlow-Signature header.</p>
        </div>
      </div>
      <div className="flex flex-col sm:flex-row gap-2">
        <code className="flex-1 min-w-0 rounded-xl border border-amber-200 bg-white px-3.5 py-2.5 font-mono text-xs text-slate-800 break-all">
          {show ? secret : secret.slice(0, 10) + "•".repeat(24)}
        </code>
        <div className="flex gap-2">
          <button onClick={() => setShow((s) => !s)} aria-label={show ? "Hide secret" : "Show secret"}
            className="w-11 shrink-0 inline-flex items-center justify-center rounded-xl border border-amber-200 bg-white text-amber-700 hover:bg-amber-100">
            <Icon name={show ? "visibility_off" : "visibility"} className="w-4 h-4" />
          </button>
          <button onClick={() => copy(secret, "Secret copied")}
            className="flex-1 sm:flex-none inline-flex items-center justify-center gap-1.5 rounded-xl bg-amber-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-amber-700">
            <Icon name="content_copy" className="w-4 h-4" /> Copy
          </button>
        </div>
      </div>
      <button onClick={onClose} className="text-xs font-semibold text-amber-800 hover:underline">Done, hide this</button>
    </div>
  );
}

function EndpointForm({ events, initial, onCancel, onSaved }: {
  events: EventDef[]; initial?: Endpoint; onCancel: () => void; onSaved: (r: { endpoint: Endpoint; secret?: string }) => void;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [url, setUrl] = useState(initial?.url ?? "");
  const [selected, setSelected] = useState<string[]>(initial?.events ?? events.map((e) => e.id));
  const [saving, setSaving] = useState(false);

  const toggle = (id: string) => setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));
  const urlError = url && !/^https:\/\//i.test(url.trim()) ? "Must start with https://" : null;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selected.length) return toast.error("Choose at least one event");
    setSaving(true);
    try {
      const payload = { name, url: url.trim(), events: selected };
      const r = initial
        ? await axios.patch(`/api/settings/webhooks/${initial.id}`, payload)
        : await axios.post("/api/settings/webhooks", payload);
      toast.success(initial ? "Endpoint updated" : "Endpoint added");
      onSaved(r.data);
    } catch (err) { toast.error(settingsError(err)); }
    finally { setSaving(false); }
  };

  return (
    <form onSubmit={submit} className="rounded-2xl border border-green-200 bg-green-50/40 p-4 sm:p-5 space-y-4">
      <div className="grid gap-4 sm:grid-cols-[200px_1fr]">
        <SField label="Name">
          <input className={sInput} value={name} maxLength={60} onChange={(e) => setName(e.target.value)} placeholder="e.g. CRM sync" />
        </SField>
        <SField label="Endpoint URL" hint={urlError ?? "HTTPS only. Must be publicly reachable."}>
          <input autoFocus required type="url" inputMode="url" className={cn(sInput, urlError && "border-red-300 focus:ring-red-500/30 focus:border-red-400")}
            value={url} maxLength={500} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/webhooks/chatflow" />
        </SField>
      </div>
      <fieldset className="space-y-2">
        <legend className="text-xs font-semibold text-slate-600 mb-1.5">Events to send</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {events.map((ev) => {
            const on = selected.includes(ev.id);
            return (
              <label key={ev.id} className={cn("flex items-start gap-3 rounded-xl border bg-white p-3 cursor-pointer transition", on ? "border-green-300 ring-1 ring-green-200" : "border-slate-200 hover:border-slate-300")}>
                <input type="checkbox" className="mt-0.5 h-4 w-4 accent-[#25D366]" checked={on} onChange={() => toggle(ev.id)} />
                <span className="min-w-0">
                  <span className="block font-mono text-xs font-semibold text-slate-800">{ev.id}</span>
                  <span className="block text-[11px] text-slate-500">{ev.description}</span>
                </span>
              </label>
            );
          })}
        </div>
      </fieldset>
      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-end">
        <SButton type="button" variant="secondary" onClick={onCancel}>Cancel</SButton>
        <SButton type="submit" loading={saving} disabled={!!urlError}>{initial ? "Save changes" : "Add endpoint"}</SButton>
      </div>
    </form>
  );
}

function Deliveries({ endpointId }: { endpointId: string }) {
  const [openId, setOpenId] = useState<string | null>(null);
  const { data, isLoading, refetch, isFetching } = useQuery({
    queryKey: ["webhook-deliveries", endpointId],
    queryFn: () => axios.get(`/api/settings/webhooks/${endpointId}/deliveries`).then((r) => r.data.deliveries as Delivery[]),
  });
  const rows = data ?? [];
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/50">
      <div className="flex items-center justify-between px-3 py-2 border-b border-slate-200">
        <span className="text-xs font-semibold text-slate-600">Recent deliveries</span>
        <button onClick={() => refetch()} className="inline-flex items-center gap-1 text-xs font-semibold text-slate-500 hover:text-slate-700" aria-label="Refresh deliveries">
          <Icon name="refresh" className={cn("w-3.5 h-3.5", isFetching && "animate-spin")} /> Refresh
        </button>
      </div>
      {isLoading ? (
        <div className="p-3 space-y-2">{[0, 1, 2].map((i) => <div key={i} className="h-9 rounded-lg bg-slate-100 animate-pulse" />)}</div>
      ) : rows.length === 0 ? (
        <p className="px-3 py-6 text-center text-xs text-slate-500">No deliveries yet. Use &ldquo;Send test&rdquo; to try it.</p>
      ) : (
        <ul className="divide-y divide-slate-100 max-h-96 overflow-y-auto">
          {rows.map((d) => (
            <li key={d.id}>
              <button onClick={() => setOpenId(openId === d.id ? null : d.id)} className="w-full flex items-center gap-2.5 px-3 py-2 text-left hover:bg-white">
                <Icon name={d.success ? "check_circle" : "error"} filled className={cn("w-4 h-4 shrink-0", d.success ? "text-green-600" : "text-red-500")} />
                <span className="font-mono text-xs text-slate-800 truncate flex-1 min-w-0">{d.event}</span>
                <span className={cn("rounded-md px-1.5 py-0.5 text-[11px] font-semibold", d.success ? "bg-green-50 text-green-700" : "bg-red-50 text-red-600")}>
                  {d.statusCode ?? "ERR"}
                </span>
                {d.attempt > 1 && <span className="hidden sm:inline text-[11px] text-slate-400">retry</span>}
                <span className="hidden sm:inline w-14 text-right text-[11px] text-slate-400">{d.duration != null ? `${d.duration}ms` : ""}</span>
                <span className="w-16 text-right text-[11px] text-slate-400 shrink-0">{timeAgo(d.createdAt)}</span>
              </button>
              {openId === d.id && (
                <div className="px-3 pb-3 space-y-2">
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 mb-1">Response</p>
                    <pre className="rounded-lg bg-white border border-slate-200 p-2 text-[11px] text-slate-700 whitespace-pre-wrap break-all max-h-40 overflow-y-auto">{d.responseBody || "(empty)"}</pre>
                  </div>
                  <div>
                    <p className="text-[11px] font-semibold text-slate-500 mb-1">Payload</p>
                    <pre className="rounded-lg bg-slate-900 p-2 text-[11px] text-slate-100 overflow-x-auto max-h-56">{JSON.stringify(d.payload, null, 2)}</pre>
                  </div>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function EndpointRow({ ep, events, onChanged, onSecret }: { ep: Endpoint; events: EventDef[]; onChanged: () => void; onSecret: (name: string, secret: string) => void }) {
  const qc = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [showDeliveries, setShowDeliveries] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [confirm, setConfirm] = useState<"delete" | "rotate" | null>(null);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try { await fn(); } catch (e) { toast.error(settingsError(e)); } finally { setBusy(null); }
  };

  const test = () => run("test", async () => {
    const r = await axios.post(`/api/settings/webhooks/${ep.id}/test`);
    const res = r.data.result as { success: boolean; statusCode: number | null; error?: string; duration: number };
    if (res.success) toast.success(`Test delivered (HTTP ${res.statusCode}, ${res.duration}ms)`);
    else toast.error(res.error ?? `Endpoint responded with HTTP ${res.statusCode}`);
    qc.invalidateQueries({ queryKey: ["webhook-deliveries", ep.id] });
    setShowDeliveries(true);
    onChanged();
  });
  const toggleActive = () => run("active", async () => {
    await axios.patch(`/api/settings/webhooks/${ep.id}`, { isActive: !ep.isActive });
    toast.success(ep.isActive ? "Endpoint disabled" : "Endpoint enabled");
    onChanged();
  });
  const secret = (action: "reveal" | "rotate") => run(action, async () => {
    const r = await axios.post(`/api/settings/webhooks/${ep.id}/secret`, { action });
    onSecret(ep.name, r.data.secret);
    if (action === "rotate") toast.success("Secret rotated. Update your server; the old secret no longer works.");
    setConfirm(null);
  });
  const remove = () => run("delete", async () => {
    await axios.delete(`/api/settings/webhooks/${ep.id}`);
    toast.success("Endpoint deleted");
    setConfirm(null);
    onChanged();
  });

  if (editing) {
    return (
      <li className="p-3 sm:p-4">
        <EndpointForm events={events} initial={ep} onCancel={() => setEditing(false)} onSaved={() => { setEditing(false); onChanged(); }} />
      </li>
    );
  }

  const failing = ep.isActive && ep.failureCount > 0;
  const btn = "inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-50";

  return (
    <li className="p-4 space-y-3">
      <div className="flex items-start gap-3">
        <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", !ep.isActive ? "bg-slate-100 text-slate-400" : failing ? "bg-amber-50 text-amber-600" : "bg-green-50 text-green-600")}>
          <Icon name="http" className="w-5 h-5" />
        </span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-slate-900 truncate">{ep.name}</p>
            <span className={cn("rounded-full px-2 py-0.5 text-[11px] font-semibold",
              !ep.isActive ? "bg-slate-100 text-slate-500" : failing ? "bg-amber-50 text-amber-700" : "bg-green-50 text-green-700")}>
              {!ep.isActive ? "Disabled" : failing ? `${ep.failureCount} failed` : "Active"}
            </span>
          </div>
          <p className="mt-0.5 font-mono text-xs text-slate-500 break-all">{ep.url}</p>
          <div className="mt-2 flex flex-wrap gap-1">
            {ep.events.map((e) => <span key={e} className="rounded-md bg-slate-100 px-1.5 py-0.5 font-mono text-[10px] text-slate-600">{e}</span>)}
          </div>
          <p className="mt-1.5 text-[11px] text-slate-400">{ep.lastTriggeredAt ? `Last delivery ${timeAgo(ep.lastTriggeredAt)}` : "No deliveries yet"}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2 sm:pl-[52px]">
        <button onClick={test} disabled={!!busy} className={cn(btn, "border-green-200 text-green-700 hover:bg-green-50")}>
          <Icon name="send" className={cn("w-3.5 h-3.5", busy === "test" && "animate-pulse")} /> {busy === "test" ? "Sending…" : "Send test"}
        </button>
        <button onClick={() => setShowDeliveries((s) => !s)} className={btn}>
          <Icon name="history" className="w-3.5 h-3.5" /> Deliveries
        </button>
        <button onClick={() => setEditing(true)} className={btn}><Icon name="edit" className="w-3.5 h-3.5" /> Edit</button>
        <button onClick={() => secret("reveal")} disabled={!!busy} className={btn}><Icon name="key" className="w-3.5 h-3.5" /> Reveal secret</button>
        <button onClick={() => setConfirm("rotate")} disabled={!!busy} className={btn}><Icon name="refresh" className="w-3.5 h-3.5" /> Rotate</button>
        <button onClick={toggleActive} disabled={!!busy} className={btn}>
          <Icon name="power_settings_new" className="w-3.5 h-3.5" /> {ep.isActive ? "Disable" : "Enable"}
        </button>
        <button onClick={() => setConfirm("delete")} disabled={!!busy} className={cn(btn, "border-red-100 text-red-500 hover:bg-red-50")}>
          <Icon name="delete" className="w-3.5 h-3.5" /> Delete
        </button>
      </div>

      {showDeliveries && <div className="sm:pl-[52px]"><Deliveries endpointId={ep.id} /></div>}

      {confirm && (
        <div className="fixed inset-0 z-[60] flex items-end sm:items-center justify-center sm:p-4" role="dialog" aria-modal="true">
          <div className="absolute inset-0 bg-slate-950/50" onClick={() => setConfirm(null)} />
          <div className="relative w-full sm:max-w-sm rounded-t-3xl sm:rounded-2xl bg-white p-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] shadow-2xl space-y-4">
            <div className="flex items-start gap-3">
              <span className={cn("w-10 h-10 rounded-xl flex items-center justify-center shrink-0", confirm === "delete" ? "bg-red-50 text-red-500" : "bg-amber-50 text-amber-600")}>
                <Icon name={confirm === "delete" ? "delete" : "refresh"} className="w-5 h-5" />
              </span>
              <div>
                <h3 className="text-base font-bold text-slate-900">{confirm === "delete" ? `Delete “${ep.name}”?` : "Rotate signing secret?"}</h3>
                <p className="mt-1 text-sm text-slate-600">
                  {confirm === "delete"
                    ? "Events will stop being sent to this URL and its delivery history will be removed."
                    : "The current secret stops working immediately. Update your server with the new one."}
                </p>
              </div>
            </div>
            <div className="flex gap-2">
              <SButton variant="secondary" className="flex-1" onClick={() => setConfirm(null)}>Cancel</SButton>
              <SButton variant="danger" className="flex-1" loading={busy === "delete" || busy === "rotate"}
                onClick={() => (confirm === "delete" ? remove() : secret("rotate"))}>
                {confirm === "delete" ? "Delete" : "Rotate"}
              </SButton>
            </div>
          </div>
        </div>
      )}
    </li>
  );
}

function Webhooks() {
  const qc = useQueryClient();
  const [adding, setAdding] = useState(false);
  const [revealed, setRevealed] = useState<{ name: string; secret: string } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["webhook-endpoints"],
    queryFn: () => axios.get("/api/settings/webhooks").then((r) => r.data as { endpoints: Endpoint[]; events: EventDef[]; limit: number }),
  });
  const endpoints = data?.endpoints ?? [];
  const events = data?.events ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["webhook-endpoints"] });
  const atLimit = !!data && endpoints.length >= data.limit;

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <p className="text-sm text-slate-500">
          Get notified at your URL when things happen in ChatFlow.{data && <> {endpoints.length}/{data.limit} endpoints.</>}
        </p>
        {!adding && (
          <SButton onClick={() => setAdding(true)} disabled={isLoading || atLimit} className="self-start">
            <Icon name="add" className="w-4 h-4" /> Add endpoint
          </SButton>
        )}
      </div>

      {revealed && <SecretBanner name={revealed.name} secret={revealed.secret} onClose={() => setRevealed(null)} />}

      {adding && events.length > 0 && (
        <EndpointForm events={events} onCancel={() => setAdding(false)}
          onSaved={(r) => { setAdding(false); if (r.secret) setRevealed({ name: r.endpoint.name, secret: r.secret }); refresh(); }} />
      )}

      <div className="rounded-2xl border border-slate-200/70 bg-white shadow-sm overflow-hidden">
        {isLoading ? (
          <div className="p-5 space-y-3">{[0, 1].map((i) => <div key={i} className="h-20 rounded-xl bg-slate-100 animate-pulse" />)}</div>
        ) : endpoints.length === 0 ? (
          <div className="py-12 px-6 text-center">
            <span className="mx-auto w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name="http" className="w-6 h-6 text-green-600" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-800">No webhook endpoints yet</p>
            <p className="text-xs text-slate-500 mt-1">Add an HTTPS URL to receive messages, delivery updates and contact events in real time.</p>
          </div>
        ) : (
          <ul className="divide-y divide-slate-100">
            {endpoints.map((ep) => (
              <EndpointRow key={ep.id} ep={ep} events={events} onChanged={refresh} onSecret={(name, secret) => setRevealed({ name, secret })} />
            ))}
          </ul>
        )}
      </div>

      <SettingsCard title="Payload format" description="Every event uses the same envelope." icon="code">
        <CodeBlock label="POST to your URL" code={`Content-Type: application/json
X-ChatFlow-Event: message.received
X-ChatFlow-Delivery: evt_4f1c...
X-ChatFlow-Timestamp: 1762336800
X-ChatFlow-Signature: sha256=9a7b...

{
  "id": "evt_4f1c...",
  "event": "message.received",
  "createdAt": "2026-11-05T10:00:00.000Z",
  "data": {
    "message": { "id": "cm3...", "direction": "inbound", "type": "text", "status": "delivered", "from": "919876543210", "content": "Hi!" },
    "contact": { "id": "cm3...", "phone": "919876543210", "name": "Asha" }
  }
}`} />
        <p className="mt-3 flex items-start gap-2 text-xs text-slate-500">
          <Icon name="info" className="w-4 h-4 shrink-0 text-slate-400" />
          Respond with any 2xx within 5 seconds. Endpoints that fail 100 times in a row are disabled automatically.
        </p>
      </SettingsCard>
    </div>
  );
}
