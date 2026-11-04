"use client";

import { useDeferredValue, useMemo, useState, useSyncExternalStore } from "react";
import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn, timeAgo } from "@/lib/utils";
import { encodeQr, qrToCanvas, qrToSvg } from "@/lib/qr";

// ─────────────────────────────────────────────────────────────────────────────
// Shared helpers
// ─────────────────────────────────────────────────────────────────────────────

interface Account { id: string; displayName: string | null; phoneNumber: string; isActive: boolean }

const APP_URL = (process.env.NEXT_PUBLIC_APP_URL || "https://www.bulkmarketing.online").replace(/\/$/, "");
const WIDGET_SRC = `${APP_URL}/widget.js`;

const inputCls =
  "w-full rounded-xl border border-slate-200 bg-white px-3.5 py-2.5 text-sm text-slate-800 placeholder:text-slate-400 " +
  "focus:outline-none focus:ring-2 focus:ring-green-500/30 focus:border-green-500";
const cardCls = "rounded-2xl border border-slate-200/70 bg-white shadow-sm";

const digits = (v: string) => v.replace(/\D/g, "");
const validPhone = (d: string) => d.length >= 7 && d.length <= 15;
const cleanRef = (v: string) => v.trim().toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);

function buildLink(phone: string, message: string, ref: string) {
  const r = cleanRef(ref);
  const text = [message.trim(), r ? `[ref:${r}]` : ""].filter(Boolean).join(" ");
  return `https://wa.me/${phone}${text ? `?text=${encodeURIComponent(text)}` : ""}`;
}

const escAttr = (v: string) => v.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

async function copy(text: string, what = "Copied") {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(what);
  } catch {
    toast.error("Couldn't copy — please copy it manually");
  }
}

function download(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

// Local history (no DB): useSyncExternalStore keeps SSR/hydration consistent.
const HISTORY_KEY = "bm-growth-links";
const HISTORY_EVENT = "bm-growth-links-change";
interface HistoryItem { link: string; phone: string; message: string; ref: string; at: number }
const subscribeHistory = (cb: () => void) => {
  window.addEventListener("storage", cb);
  window.addEventListener(HISTORY_EVENT, cb);
  return () => { window.removeEventListener("storage", cb); window.removeEventListener(HISTORY_EVENT, cb); };
};
const readHistoryRaw = () => { try { return localStorage.getItem(HISTORY_KEY) ?? "[]"; } catch { return "[]"; } };
function parseHistory(raw: string): HistoryItem[] {
  try { const v = JSON.parse(raw); return Array.isArray(v) ? v.slice(0, 10) : []; } catch { return []; }
}
function writeHistory(items: HistoryItem[]) {
  try { localStorage.setItem(HISTORY_KEY, JSON.stringify(items.slice(0, 10))); } catch { /* storage full or disabled */ }
  window.dispatchEvent(new Event(HISTORY_EVENT));
}

const noopSubscribe = () => () => {};
const useOrigin = () => useSyncExternalStore(noopSubscribe, () => window.location.origin, () => "");

function useAccounts() {
  return useQuery({
    queryKey: ["whatsapp-accounts"],
    queryFn: () => axios.get("/api/settings/whatsapp").then((r) => r.data.accounts as Account[]),
  });
}

/** Number picker: one of the org's connected numbers, or a custom number. */
function NumberPicker({ accounts, loading, value, onChange }: {
  accounts: Account[]; loading: boolean;
  value: { mode: string; custom: string }; onChange: (v: { mode: string; custom: string }) => void;
}) {
  return (
    <div className="space-y-2">
      <select value={value.mode} onChange={(e) => onChange({ ...value, mode: e.target.value })} className={inputCls} disabled={loading} aria-label="WhatsApp number">
        {loading && <option value={value.mode}>Loading numbers…</option>}
        {accounts.map((a) => (
          <option key={a.id} value={a.id}>
            {(a.displayName || "WhatsApp number") + " · +" + digits(a.phoneNumber) + (a.isActive ? "" : " (inactive)")}
          </option>
        ))}
        <option value="custom">Another number…</option>
      </select>
      {value.mode === "custom" && (
        <input value={value.custom} onChange={(e) => onChange({ ...value, custom: e.target.value })} inputMode="tel"
          placeholder="Country code + number, e.g. 919876543210" className={inputCls} aria-label="Custom WhatsApp number" />
      )}
      {!loading && accounts.length === 0 && (
        <p className="text-[11px] text-slate-500">
          No numbers connected yet. <a href="/settings?tab=whatsapp" className="font-semibold text-green-700 hover:underline">Connect one</a> or enter any number above.
        </p>
      )}
    </div>
  );
}

/** Resolves the selected number to digits, defaulting to the first active account. */
function usePhone(accounts: Account[]) {
  const [picked, setPicked] = useState<{ mode: string; custom: string } | null>(null);
  const fallback = accounts.find((a) => a.isActive)?.id ?? accounts[0]?.id ?? "custom";
  const value = { mode: picked?.mode ?? fallback, custom: picked?.custom ?? "" };
  const account = accounts.find((a) => a.id === value.mode);
  const phone = digits(account ? account.phoneNumber : value.custom);
  return { value, setValue: setPicked, phone, account };
}

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block space-y-1.5">
      <span className="text-xs font-semibold text-slate-600">{label}</span>
      {children}
      {hint && <span className="block text-[11px] text-slate-400">{hint}</span>}
    </label>
  );
}

function Btn({ variant = "primary", className, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement> & { variant?: "primary" | "secondary" }) {
  return (
    <button type="button" {...props}
      className={cn(
        "inline-flex items-center justify-center gap-1.5 rounded-xl px-3.5 py-2 text-sm font-semibold transition disabled:opacity-50 disabled:cursor-not-allowed",
        variant === "primary" ? "bg-[#25D366] text-white hover:bg-[#1fb857] shadow-sm shadow-green-500/20" : "border border-slate-200 bg-white text-slate-700 hover:bg-slate-50",
        className,
      )} />
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Page
// ─────────────────────────────────────────────────────────────────────────────

type Tab = "link" | "widget";

export default function GrowthPage() {
  const [tab, setTab] = useState<Tab>("link");
  const { data: accounts = [], isLoading } = useAccounts();

  return (
    <div className="px-4 py-5 sm:px-6 lg:px-8 lg:py-8 space-y-5 max-w-7xl mx-auto w-full">
      <section className="relative rounded-3xl bg-slate-950 text-white px-5 py-6 sm:px-8 sm:py-7">
        <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
          <div className="absolute -right-16 -top-16 w-64 h-64 rounded-full bg-green-500/25 blur-3xl" />
          <div className="absolute right-24 -bottom-20 w-52 h-52 rounded-full bg-emerald-400/10 blur-3xl" />
        </div>
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.18em] text-green-400">
            <Icon name="rocket_launch" className="w-3.5 h-3.5" /> Growth tools
          </p>
          <h1 className="mt-2 text-2xl sm:text-3xl font-bold">Bring more customers to WhatsApp</h1>
          <p className="mt-1.5 text-sm text-slate-300 max-w-2xl">
            Share click-to-chat links and QR codes anywhere, or add a WhatsApp chat button to your website in one line of code.
          </p>
        </div>
      </section>

      <div className="inline-flex rounded-xl border border-slate-200 bg-white p-1 shadow-sm" role="tablist">
        {([
          { id: "link", label: "Link & QR code", icon: "send" },
          { id: "widget", label: "Website widget", icon: "language" },
        ] as const).map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)}
            className={cn("inline-flex items-center gap-1.5 rounded-lg px-3 sm:px-4 py-2 text-sm font-semibold transition",
              tab === t.id ? "bg-green-50 text-green-700" : "text-slate-500 hover:text-slate-800")}>
            <Icon name={t.icon} filled={tab === t.id} className="w-4 h-4" /> {t.label}
          </button>
        ))}
      </div>

      {tab === "link" ? <LinkGenerator accounts={accounts} loading={isLoading} /> : <WidgetConfigurator accounts={accounts} loading={isLoading} />}
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Click-to-WhatsApp link + QR
// ─────────────────────────────────────────────────────────────────────────────

function LinkGenerator({ accounts, loading }: { accounts: Account[]; loading: boolean }) {
  const { value, setValue, phone, account } = usePhone(accounts);
  const [message, setMessage] = useState("Hi! I'd like to know more about your products.");
  const [ref, setRef] = useState("");
  const [qrColor, setQrColor] = useState("#111827");
  const history = parseHistory(useSyncExternalStore(subscribeHistory, readHistoryRaw, () => "[]"));

  const ok = validPhone(phone);
  const link = ok ? buildLink(phone, message, ref) : "";
  const deferredLink = useDeferredValue(link);
  const qr = useMemo(() => {
    if (!deferredLink) return null;
    try { return encodeQr(deferredLink, "M"); } catch { return null; }
  }, [deferredLink]);
  const qrPath = useMemo(() => {
    if (!qr) return "";
    let d = "";
    for (let y = 0; y < qr.size; y++) for (let x = 0; x < qr.size; x++) if (qr.modules[y][x]) d += `M${x + 4},${y + 4}h1v1h-1z`;
    return d;
  }, [qr]);

  const remember = () => {
    if (!link) return;
    const item: HistoryItem = { link, phone, message: message.trim(), ref: cleanRef(ref), at: Date.now() };
    writeHistory([item, ...history.filter((h) => h.link !== link)]);
  };
  const fileBase = `whatsapp-qr-${phone}${cleanRef(ref) ? `-${cleanRef(ref)}` : ""}`;

  const downloadSvg = () => {
    if (!qr) return;
    download(new Blob([qrToSvg(qr, { dark: qrColor })], { type: "image/svg+xml" }), `${fileBase}.svg`);
    remember();
  };
  const downloadPng = () => {
    if (!qr) return;
    const canvas = document.createElement("canvas");
    qrToCanvas(qr, canvas, { dark: qrColor, scale: 16 });
    canvas.toBlob((b) => { if (b) download(b, `${fileBase}.png`); else toast.error("Couldn't create the PNG"); }, "image/png");
    remember();
  };

  const tooLong = !!link && link.length > 2000;

  return (
    <div className="grid gap-5 lg:grid-cols-[1.1fr_1fr]">
      <div className="space-y-5">
        <section className={cn(cardCls, "p-4 sm:p-5 space-y-4")}>
          <div>
            <h2 className="text-sm font-bold text-slate-900">Click-to-WhatsApp link</h2>
            <p className="text-xs text-slate-500 mt-0.5">Anyone who opens the link or scans the QR lands in a chat with you, message ready to send.</p>
          </div>
          <Field label="WhatsApp number">
            <NumberPicker accounts={accounts} loading={loading} value={value} onChange={setValue} />
          </Field>
          <Field label="Prefilled message" hint={`${message.length}/1000 · customers can edit it before sending`}>
            <textarea value={message} onChange={(e) => setMessage(e.target.value.slice(0, 1000))} rows={3} className={cn(inputCls, "resize-y")} placeholder="Hi! I'd like to know more…" />
          </Field>
          <Field label="Source tag (optional)" hint={<>Appended as <code className="font-mono">[ref:{cleanRef(ref) || "instagram-bio"}]</code> so you can see where chats come from in the inbox.</>}>
            <input value={ref} onChange={(e) => setRef(e.target.value)} maxLength={60} placeholder="e.g. instagram-bio, flyer-oct, google-ads" className={inputCls} />
          </Field>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">Your link</p>
            {ok ? (
              <p className="mt-1 break-all font-mono text-xs text-slate-800">{link}</p>
            ) : (
              <p className="mt-1 text-xs text-amber-700 inline-flex items-center gap-1"><Icon name="warning" className="w-3.5 h-3.5" /> Enter a valid number with country code (7–15 digits).</p>
            )}
            {tooLong && <p className="mt-1 text-[11px] text-amber-700">This link is very long; some apps may cut it off. Try a shorter message.</p>}
            <div className="mt-3 flex flex-wrap gap-2">
              <Btn disabled={!ok} onClick={() => { copy(link, "Link copied"); remember(); }}><Icon name="content_copy" className="w-4 h-4" /> Copy link</Btn>
              <Btn variant="secondary" disabled={!ok} onClick={() => { window.open(link, "_blank", "noopener,noreferrer"); remember(); }}><Icon name="arrow_forward" className="w-4 h-4" /> Test it</Btn>
            </div>
          </div>
        </section>

        {history.length > 0 && (
          <section className={cn(cardCls, "p-4 sm:p-5")}>
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5"><Icon name="history" className="w-4 h-4 text-slate-400" /> Recent links</h2>
              <button type="button" onClick={() => writeHistory([])} className="text-xs font-medium text-slate-500 hover:text-red-600">Clear</button>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">Saved in this browser only.</p>
            <ul className="mt-3 divide-y divide-slate-100">
              {history.map((h) => (
                <li key={h.link} className="py-2.5 flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-slate-800 truncate">{h.message || <span className="text-slate-400">No message</span>}</p>
                    <p className="text-[11px] text-slate-500 truncate">+{h.phone}{h.ref ? ` · ref:${h.ref}` : ""} · {timeAgo(new Date(h.at))}</p>
                  </div>
                  <button type="button" onClick={() => copy(h.link, "Link copied")} title="Copy link" aria-label="Copy link"
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100"><Icon name="content_copy" className="w-4 h-4" /></button>
                  <button type="button" onClick={() => writeHistory(history.filter((x) => x.link !== h.link))} title="Remove" aria-label="Remove from history"
                    className="w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:bg-red-50 hover:text-red-500"><Icon name="delete" className="w-4 h-4" /></button>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>

      <div className="space-y-5">
        <section className={cn(cardCls, "p-4 sm:p-5")}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900">QR code</h2>
            <label className="inline-flex items-center gap-2 text-xs text-slate-500">
              Colour
              <input type="color" value={qrColor} onChange={(e) => setQrColor(e.target.value)} className="h-7 w-9 cursor-pointer rounded-md border border-slate-200 bg-white p-0.5" aria-label="QR colour" />
            </label>
          </div>
          <div className="mt-4 flex justify-center">
            <div className="w-full max-w-[260px] aspect-square rounded-2xl border border-slate-200 bg-white p-2">
              {qr ? (
                <svg viewBox={`0 0 ${qr.size + 8} ${qr.size + 8}`} className="w-full h-full" shapeRendering="crispEdges" role="img" aria-label="QR code for your WhatsApp link">
                  <rect width="100%" height="100%" fill="#ffffff" />
                  <path d={qrPath} fill={qrColor} />
                </svg>
              ) : (
                <div className="w-full h-full flex flex-col items-center justify-center text-center text-xs text-slate-400 gap-2">
                  <Icon name="image" className="w-8 h-8" /> Your QR code appears here
                </div>
              )}
            </div>
          </div>
          <p className="mt-2 text-center text-[11px] text-slate-400">Tip: keep dark colours on a white background so every phone can scan it.</p>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Btn disabled={!qr} onClick={downloadPng}><Icon name="download" className="w-4 h-4" /> PNG</Btn>
            <Btn variant="secondary" disabled={!qr} onClick={downloadSvg}><Icon name="download" className="w-4 h-4" /> SVG</Btn>
          </div>
        </section>

        <section className={cn(cardCls, "p-4 sm:p-5")}>
          <h2 className="text-sm font-bold text-slate-900">Preview</h2>
          <p className="text-xs text-slate-500 mt-0.5">What your customer sees after tapping the link.</p>
          <div className="mt-3 rounded-2xl overflow-hidden border border-slate-200">
            <div className="bg-[#075E54] text-white px-3 py-2.5 flex items-center gap-2.5">
              <span className="w-8 h-8 rounded-full bg-white/20 flex items-center justify-center"><Icon name="person" className="w-4 h-4" /></span>
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{account?.displayName || (ok ? `+${phone}` : "Your business")}</p>
                <p className="text-[10px] text-white/70">WhatsApp Business</p>
              </div>
            </div>
            <div className="bg-[#efeae2] px-3 py-6 min-h-[110px] flex flex-col justify-end">
              <p className="mx-auto mb-3 rounded-md bg-white/80 px-2 py-0.5 text-[10px] text-slate-500">Message ready to send</p>
              <div className="flex items-end gap-2">
                <div className="flex-1 rounded-full bg-white px-3.5 py-2 text-[13px] text-slate-800 shadow-sm whitespace-pre-wrap break-words min-h-[36px]">
                  {[message.trim(), cleanRef(ref) ? `[ref:${cleanRef(ref)}]` : ""].filter(Boolean).join(" ") || <span className="text-slate-400">Type a message</span>}
                </div>
                <span className="w-9 h-9 rounded-full bg-[#25D366] text-white flex items-center justify-center shrink-0"><Icon name="send" className="w-4 h-4" /></span>
              </div>
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// Website chat widget configurator
// ─────────────────────────────────────────────────────────────────────────────

const HEX = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/;

function WidgetConfigurator({ accounts, loading }: { accounts: Account[]; loading: boolean }) {
  const { value, setValue, phone, account } = usePhone(accounts);
  const origin = useOrigin();
  const [cfg, setCfg] = useState({
    name: "",
    greeting: "Hi there! How can we help you?",
    message: "Hi! I have a question.",
    cta: "Start chat",
    color: "#25D366",
    position: "right" as "right" | "left",
    open: 0,
  });
  const set = <K extends keyof typeof cfg>(k: K, v: (typeof cfg)[K]) => setCfg((c) => ({ ...c, [k]: v }));

  const ok = validPhone(phone);
  const color = HEX.test(cfg.color) ? cfg.color : "#25D366";
  const name = cfg.name.trim() || account?.displayName || "";

  const attrs: [string, string][] = [
    ["data-phone", phone],
    ["data-name", name],
    ["data-greeting", cfg.greeting.trim()],
    ["data-message", cfg.message.trim()],
    ["data-cta", cfg.cta.trim() && cfg.cta.trim() !== "Start chat" ? cfg.cta.trim() : ""],
    ["data-color", color.toUpperCase() !== "#25D366" ? color : ""],
    ["data-position", cfg.position === "left" ? "left" : ""],
    ["data-open", cfg.open > 0 ? String(cfg.open) : ""],
  ];
  const attrStr = (src: string) =>
    `<script src="${escAttr(src)}"` + attrs.filter(([, v]) => v).map(([k, v]) => `\n  ${k}="${escAttr(v)}"`).join("") + `\n  async></script>`;
  const snippet = attrStr(WIDGET_SRC);

  // Live preview: a sandboxed mock page that loads the real widget script from this deployment.
  const deferredAttrs = useDeferredValue(origin && ok ? attrStr(`${origin}/widget.js`) : "");
  const srcDoc = deferredAttrs
    ? `<!DOCTYPE html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
      `<style>body{margin:0;font-family:system-ui,sans-serif;background:#f8fafc;color:#0f172a}` +
      `.nav{height:44px;background:#fff;border-bottom:1px solid #e2e8f0;display:flex;align-items:center;padding:0 16px;gap:12px}` +
      `.logo{width:72px;height:10px;border-radius:5px;background:#cbd5e1}.l{height:8px;border-radius:4px;background:#e2e8f0;margin:10px 0}` +
      `.hero{padding:28px 20px}.h{height:18px;width:60%;border-radius:6px;background:#cbd5e1;margin-bottom:14px}</style></head>` +
      `<body><div class="nav"><div class="logo"></div></div><div class="hero"><div class="h"></div><div class="l" style="width:85%"></div>` +
      `<div class="l" style="width:70%"></div><div class="l" style="width:78%"></div><div class="l" style="width:40%"></div></div>` +
      deferredAttrs + `</body></html>`
    : "";

  return (
    <div className="grid gap-5 lg:grid-cols-[1fr_1.1fr]">
      <section className={cn(cardCls, "p-4 sm:p-5 space-y-4")}>
        <div>
          <h2 className="text-sm font-bold text-slate-900">Website chat widget</h2>
          <p className="text-xs text-slate-500 mt-0.5">A floating WhatsApp button for any website: WordPress, Shopify, Wix or plain HTML.</p>
        </div>
        <Field label="WhatsApp number">
          <NumberPicker accounts={accounts} loading={loading} value={value} onChange={setValue} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Business name">
            <input value={cfg.name} onChange={(e) => set("name", e.target.value.slice(0, 60))} placeholder={account?.displayName || "Chat with us"} className={inputCls} />
          </Field>
          <Field label="Button label">
            <input value={cfg.cta} onChange={(e) => set("cta", e.target.value.slice(0, 40))} placeholder="Start chat" className={inputCls} />
          </Field>
        </div>
        <Field label="Greeting" hint="Shown in the popup bubble.">
          <textarea value={cfg.greeting} onChange={(e) => set("greeting", e.target.value.slice(0, 300))} rows={2} className={cn(inputCls, "resize-y")} />
        </Field>
        <Field label="Prefilled message" hint="Typed into WhatsApp when the visitor starts the chat.">
          <input value={cfg.message} onChange={(e) => set("message", e.target.value.slice(0, 1000))} className={inputCls} />
        </Field>
        <div className="grid gap-4 sm:grid-cols-3">
          <Field label="Colour">
            <div className="flex gap-2">
              <input type="color" value={color} onChange={(e) => set("color", e.target.value)} className="h-[42px] w-12 shrink-0 cursor-pointer rounded-xl border border-slate-200 bg-white p-1" aria-label="Widget colour" />
              <input value={cfg.color} onChange={(e) => set("color", e.target.value.slice(0, 7))} className={cn(inputCls, "font-mono", !HEX.test(cfg.color) && "border-red-300")} aria-label="Widget colour hex" />
            </div>
          </Field>
          <Field label="Position">
            <div className="grid grid-cols-2 rounded-xl border border-slate-200 p-1">
              {(["left", "right"] as const).map((p) => (
                <button key={p} type="button" onClick={() => set("position", p)}
                  className={cn("rounded-lg py-1.5 text-sm font-medium capitalize transition", cfg.position === p ? "bg-green-50 text-green-700" : "text-slate-500 hover:text-slate-800")}>
                  {p}
                </button>
              ))}
            </div>
          </Field>
          <Field label="Auto-open">
            <select value={cfg.open} onChange={(e) => set("open", Number(e.target.value))} className={inputCls}>
              <option value={0}>Never</option>
              <option value={5}>After 5s</option>
              <option value={10}>After 10s</option>
              <option value={30}>After 30s</option>
            </select>
          </Field>
        </div>
      </section>

      <div className="space-y-5">
        <section className={cn(cardCls, "p-4 sm:p-5")}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5"><Icon name="visibility" className="w-4 h-4 text-slate-400" /> Live preview</h2>
            <span className="text-[11px] text-slate-400">Click the button to open the popup</span>
          </div>
          <div className="mt-3 rounded-xl overflow-hidden border border-slate-200 bg-slate-50 h-[420px]">
            {srcDoc ? (
              <iframe key={srcDoc} srcDoc={srcDoc} title="Widget preview" className="w-full h-full" sandbox="allow-scripts allow-popups allow-popups-to-escape-sandbox" />
            ) : (
              <div className="h-full flex flex-col items-center justify-center gap-2 text-xs text-slate-400">
                <Icon name="smartphone" className="w-8 h-8" />
                {ok ? "Loading preview…" : "Pick a valid WhatsApp number to see the preview"}
              </div>
            )}
          </div>
        </section>

        <section className={cn(cardCls, "p-4 sm:p-5")}>
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-bold text-slate-900 inline-flex items-center gap-1.5"><Icon name="code" className="w-4 h-4 text-slate-400" /> Install code</h2>
            <Btn disabled={!ok} onClick={() => copy(snippet, "Snippet copied")}><Icon name="content_copy" className="w-4 h-4" /> Copy</Btn>
          </div>
          <p className="text-xs text-slate-500 mt-1">Paste just before <code className="font-mono">&lt;/body&gt;</code> on every page where the button should appear.</p>
          <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-950 p-3.5 text-[12px] leading-relaxed text-green-300 font-mono whitespace-pre">{ok ? snippet : "<!-- Pick a valid WhatsApp number first -->"}</pre>
          <p className="mt-2 text-[11px] text-slate-400 inline-flex items-start gap-1"><Icon name="info" className="w-3.5 h-3.5 shrink-0 mt-px" /> No cookies, no tracking. Change the options here and re-copy the code any time.</p>
        </section>
      </div>
    </div>
  );
}
