"use client";

import { useMemo, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { STAGES, STAGE_META, cleanTag, normalizePhone, parseCsv, type Stage } from "./shared";
import { Modal, Spinner, errMsg, fmt, inputCls } from "./ui";

const FIELDS = ["phone", "name", "email", "tags"] as const;
type Field = (typeof FIELDS)[number];
type Mapping = Record<Field, number>; // column index, -1 = not mapped

const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 20_000;
const BATCH = 500;

const ALIASES: Record<Field, string[]> = {
  phone: ["phone", "phone number", "mobile", "mobile number", "number", "whatsapp", "whatsapp number", "contact", "contact number", "msisdn", "wa_id"],
  name: ["name", "full name", "fullname", "contact name", "customer", "customer name", "first name"],
  email: ["email", "e-mail", "email address", "mail"],
  tags: ["tags", "tag", "labels", "label", "groups", "group", "segment"],
};

function detect(header: string[]): { mapping: Mapping; hasHeader: boolean } {
  const h = header.map((c) => c.trim().toLowerCase());
  const mapping = Object.fromEntries(FIELDS.map((f) => [f, h.findIndex((c) => ALIASES[f].includes(c))])) as Mapping;
  if (mapping.phone >= 0) return { mapping, hasHeader: true };
  // No recognisable header → assume the documented order name,phone,email,tags.
  return { mapping: { name: 0, phone: header.length > 1 ? 1 : 0, email: header.length > 2 ? 2 : -1, tags: header.length > 3 ? 3 : -1 }, hasHeader: false };
}

const splitTags = (s: string) => s.split(/[;|,]/).map(cleanTag).filter(Boolean);

export function ImportModal({ onClose, onDone }: { onClose: () => void; onDone: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [fileName, setFileName] = useState("");
  const [rows, setRows] = useState<string[][]>([]);
  const [hasHeader, setHasHeader] = useState(true);
  const [mapping, setMapping] = useState<Mapping>({ phone: -1, name: -1, email: -1, tags: -1 });
  const [stage, setStage] = useState<Stage>("LEAD");
  const [extraTag, setExtraTag] = useState("");
  const [dragging, setDragging] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [result, setResult] = useState<{ imported: number; skipped: number; invalid: number } | null>(null);

  const load = async (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_BYTES) return toast.error("File is larger than 5 MB. Split it into smaller files.");
    if (!/\.(csv|txt)$/i.test(file.name) && !file.type.includes("csv") && !file.type.startsWith("text/")) return toast.error("Please choose a .csv file");
    const parsed = parseCsv(await file.text());
    if (!parsed.length) return toast.error("This file is empty");
    const d = detect(parsed[0]);
    setFileName(file.name);
    setRows(parsed);
    setHasHeader(d.hasHeader);
    setMapping(d.mapping);
    setResult(null);
  };

  const header = rows[0] ?? [];
  const body = useMemo(() => (hasHeader ? rows.slice(1) : rows), [rows, hasHeader]);
  const colLabel = (i: number) => (hasHeader ? header[i]?.trim() || `Column ${i + 1}` : `Column ${i + 1}`);

  const prepared = useMemo(() => {
    const seen = new Set<string>();
    let invalid = 0;
    let dupes = 0;
    const out: { phone: string; name?: string; email?: string; tags?: string[] }[] = [];
    const cell = (r: string[], f: Field) => (mapping[f] >= 0 ? (r[mapping[f]] ?? "").trim() : "");
    for (const r of body.slice(0, MAX_ROWS)) {
      const p = normalizePhone(cell(r, "phone"));
      if ("error" in p) { invalid++; continue; }
      if (seen.has(p.phone)) { dupes++; continue; }
      seen.add(p.phone);
      out.push({ phone: p.phone, name: cell(r, "name") || undefined, email: cell(r, "email") || undefined, tags: mapping.tags >= 0 ? splitTags(cell(r, "tags")) : undefined });
    }
    return { rows: out, invalid, dupes };
  }, [body, mapping]);

  const run = async () => {
    const list = prepared.rows;
    if (!list.length) return;
    const tags = cleanTag(extraTag) ? [cleanTag(extraTag)] : [];
    const total = { imported: 0, skipped: prepared.dupes, invalid: prepared.invalid };
    setProgress({ done: 0, total: list.length });
    try {
      for (let i = 0; i < list.length; i += BATCH) {
        const r = await axios.post("/api/contacts/import", { rows: list.slice(i, i + BATCH), stage, tags });
        total.imported += r.data.imported;
        total.skipped += r.data.skipped;
        total.invalid += r.data.invalid;
        setProgress({ done: Math.min(list.length, i + BATCH), total: list.length });
      }
      setResult(total);
      toast.success(`${fmt(total.imported)} contacts imported`);
    } catch (e) {
      setResult(total);
      toast.error(errMsg(e, "Import stopped part-way. Already imported rows were saved."));
    } finally {
      setProgress(null);
      onDone();
    }
  };

  const downloadSample = () => {
    const csv = "name,phone,email,tags\nRahul Sharma,+91 98765 43210,rahul@example.com,vip;diwali\nPriya Patel,9123456789,,new-lead\n";
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = Object.assign(document.createElement("a"), { href: url, download: "contacts-sample.csv" });
    a.click();
    URL.revokeObjectURL(url);
  };

  const importing = !!progress;
  const reset = () => { setRows([]); setFileName(""); setResult(null); if (fileRef.current) fileRef.current.value = ""; };

  return (
    <Modal
      wide
      title="Import contacts"
      subtitle="Upload a CSV with name, phone, email and tags columns."
      onClose={importing ? () => {} : onClose}
      footer={
        result ? (
          <>
            <button onClick={reset} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Import another file</button>
            <div className="flex-1" />
            <button onClick={onClose} className="rounded-xl bg-slate-900 px-5 py-2.5 text-sm font-semibold text-white">Done</button>
          </>
        ) : (
          <>
            <button disabled={importing} onClick={rows.length ? reset : onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50">
              {rows.length ? "Choose another file" : "Cancel"}
            </button>
            <div className="flex-1" />
            {rows.length > 0 && (
              <button onClick={run} disabled={importing || !prepared.rows.length || mapping.phone < 0}
                className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857] disabled:opacity-50">
                {importing ? <Spinner /> : <Icon name="upload" className="w-4 h-4" />}
                {progress ? `Importing ${fmt(progress.done)} / ${fmt(progress.total)}` : `Import ${fmt(prepared.rows.length)} contacts`}
              </button>
            )}
          </>
        )
      }
    >
      {result ? (
        <div className="text-center py-4">
          <span className="mx-auto w-14 h-14 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name="task_alt" className="w-7 h-7 text-green-600" /></span>
          <p className="mt-3 text-base font-bold text-slate-900">Import finished</p>
          <div className="mt-4 grid grid-cols-3 gap-2 max-w-sm mx-auto">
            {([["Imported", result.imported, "text-green-700"], ["Skipped", result.skipped, "text-slate-700"], ["Invalid", result.invalid, "text-red-600"]] as const).map(([k, v, cls]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3"><p className={cn("text-xl font-bold tabular-nums", cls)}>{fmt(v)}</p><p className="text-[11px] text-slate-500">{k}</p></div>
            ))}
          </div>
          <p className="mt-3 text-xs text-slate-500">Skipped rows were duplicates: numbers already in your contacts or repeated in the file.</p>
        </div>
      ) : !rows.length ? (
        <div className="space-y-4">
          <button type="button" onClick={() => fileRef.current?.click()}
            onDragOver={(e) => { e.preventDefault(); setDragging(true); }} onDragLeave={() => setDragging(false)}
            onDrop={(e) => { e.preventDefault(); setDragging(false); load(e.dataTransfer.files[0]); }}
            className={cn("w-full rounded-2xl border-2 border-dashed px-6 py-10 text-center transition", dragging ? "border-green-500 bg-green-50/50" : "border-slate-300 hover:border-slate-400 hover:bg-slate-50/50")}>
            <span className="mx-auto w-12 h-12 rounded-2xl bg-green-50 flex items-center justify-center"><Icon name="upload" className="w-6 h-6 text-green-600" /></span>
            <p className="mt-3 text-sm font-semibold text-slate-800">Drop a CSV here or <span className="text-green-700">browse</span></p>
            <p className="mt-1 text-xs text-slate-500">Up to 5 MB and {fmt(MAX_ROWS)} rows</p>
          </button>
          <input ref={fileRef} type="file" accept=".csv,text/csv,text/plain" className="hidden" onChange={(e) => load(e.target.files?.[0])} />
          <div className="rounded-xl bg-slate-50 p-4 text-xs text-slate-600 space-y-1.5">
            <p className="font-semibold text-slate-700">Tips</p>
            <p>Phone numbers should include the country code. 10-digit numbers are treated as Indian (+91).</p>
            <p>Separate multiple tags with a semicolon, e.g. <code className="font-mono">vip;diwali</code>.</p>
            <p>Numbers that already exist in your contacts are skipped, not overwritten.</p>
            <button type="button" onClick={downloadSample} className="inline-flex items-center gap-1 font-semibold text-green-700 hover:underline"><Icon name="download" className="w-3.5 h-3.5" /> Download sample CSV</button>
          </div>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="flex items-center gap-3 rounded-xl border border-slate-200 p-3">
            <span className="w-9 h-9 rounded-lg bg-green-50 flex items-center justify-center"><Icon name="description" className="w-5 h-5 text-green-600" /></span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-slate-800 truncate">{fileName}</p>
              <p className="text-[11px] text-slate-500">{fmt(body.length)} rows{body.length > MAX_ROWS && ` · only the first ${fmt(MAX_ROWS)} will be imported`}</p>
            </div>
            <label className="flex items-center gap-1.5 text-xs text-slate-600 shrink-0">
              <input type="checkbox" checked={hasHeader} onChange={(e) => setHasHeader(e.target.checked)} className="rounded border-slate-300 text-green-600 focus:ring-green-500" />
              First row is header
            </label>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-slate-600">Match columns</p>
            <div className="grid gap-2 sm:grid-cols-2">
              {FIELDS.map((f) => (
                <label key={f} className="flex items-center gap-2">
                  <span className="w-14 text-xs font-semibold text-slate-700 capitalize">{f}{f === "phone" && <span className="text-red-500">*</span>}</span>
                  <select value={mapping[f]} onChange={(e) => setMapping({ ...mapping, [f]: Number(e.target.value) })} className={cn(inputCls, "py-2")}>
                    <option value={-1}>{f === "phone" ? "Choose column" : "Don't import"}</option>
                    {header.map((_, i) => <option key={i} value={i}>{colLabel(i)}</option>)}
                  </select>
                </label>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-3 gap-2">
            {([["Ready", prepared.rows.length, "text-green-700"], ["Duplicates", prepared.dupes, "text-slate-700"], ["Invalid phone", prepared.invalid, "text-red-600"]] as const).map(([k, v, cls]) => (
              <div key={k} className="rounded-xl bg-slate-50 p-3"><p className={cn("text-lg font-bold tabular-nums", cls)}>{fmt(v)}</p><p className="text-[11px] text-slate-500">{k}</p></div>
            ))}
          </div>

          {prepared.rows.length > 0 && (
            <div className="overflow-x-auto rounded-xl border border-slate-100">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 text-left text-slate-500"><tr>{FIELDS.map((f) => <th key={f} className="px-3 py-2 font-semibold capitalize">{f}</th>)}</tr></thead>
                <tbody className="divide-y divide-slate-100">
                  {prepared.rows.slice(0, 5).map((r) => (
                    <tr key={r.phone} className="text-slate-700">
                      <td className="px-3 py-2 tabular-nums whitespace-nowrap">+{r.phone}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate">{r.name ?? "—"}</td>
                      <td className="px-3 py-2 max-w-[160px] truncate">{r.email ?? "—"}</td>
                      <td className="px-3 py-2">{r.tags?.length ? r.tags.map((t) => `#${t}`).join(" ") : "—"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Stage for new contacts</span>
              <select value={stage} onChange={(e) => setStage(e.target.value as Stage)} className={inputCls}>
                {STAGES.map((s) => <option key={s} value={s}>{STAGE_META[s].label}</option>)}
              </select>
            </label>
            <label className="block space-y-1.5">
              <span className="text-xs font-semibold text-slate-600">Add a tag to everyone (optional)</span>
              <input value={extraTag} onChange={(e) => setExtraTag(e.target.value)} maxLength={40} placeholder="e.g. expo-2026" className={inputCls} />
            </label>
          </div>

          {progress && (
            <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
              <div className="h-full rounded-full bg-[#25D366] transition-all" style={{ width: `${(progress.done / Math.max(1, progress.total)) * 100}%` }} />
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
