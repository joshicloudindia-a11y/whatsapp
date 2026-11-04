"use client";

import { Icon } from "@/components/ui/icon";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import { toast } from "sonner";
import { useAdmin } from "@/components/admin/admin-context";
import {
  Page, PageHeader, Card, Button, IconButton, Badge, Field, inputCls, SearchInput, FilterTabs, EmptyState,
  SkeletonRows, Pagination, Modal, ConfirmDialog, apiError, useDebounced, PLAN_TONES, Avatar,
} from "@/components/admin/ui";

const PLANS = ["TRIAL", "GROWTH", "PRO", "BUSINESS"] as const;
type PlanName = (typeof PLANS)[number];
const LIMIT = 20;

interface OrgRow {
  id: string; name: string; slug: string; plan: PlanName; website: string | null; trialEndsAt: string | null; createdAt: string;
  subscription: { plan: string; status: string } | null;
  _count: { members: number; conversations: number; broadcasts: number; whatsappAccounts: number };
}

export default function AdminOrganizationsPage() {
  const qc = useQueryClient();
  const { can } = useAdmin();
  const [search, setSearch] = useState("");
  const [plan, setPlan] = useState<"ALL" | PlanName>("ALL");
  const [page, setPage] = useState(1);
  const debounced = useDebounced(search);

  const [formOrg, setFormOrg] = useState<OrgRow | "new" | null>(null);
  const [viewOrg, setViewOrg] = useState<OrgRow | null>(null);
  const [deleting, setDeleting] = useState<OrgRow | null>(null);
  const [busy, setBusy] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ["admin-orgs", debounced, plan, page],
    queryFn: () =>
      axios.get("/api/admin/organizations", {
        params: { search: debounced, page, limit: LIMIT, ...(plan !== "ALL" && { plan }) },
      }).then((r) => r.data),
    placeholderData: (prev) => prev,
  });
  const orgs: OrgRow[] = data?.organizations ?? [];
  const refresh = () => qc.invalidateQueries({ queryKey: ["admin-orgs"] });

  const doDelete = async () => {
    if (!deleting) return;
    setBusy(true);
    try {
      await axios.delete(`/api/admin/organizations/${deleting.id}`, { params: { confirm: deleting.slug } });
      toast.success("Organization deleted");
      setDeleting(null);
      refresh();
    } catch (e) { toast.error(apiError(e)); }
    finally { setBusy(false); }
  };

  const Actions = ({ o }: { o: OrgRow }) => (
    <div className="flex items-center gap-1.5">
      <IconButton icon={"visibility"} label="View details & WhatsApp" onClick={() => setViewOrg(o)} />
      {can("orgs:write") && <IconButton icon={"edit"} label="Edit organization" onClick={() => setFormOrg(o)} />}
      {can("orgs:delete") && <IconButton icon={"delete"} label="Delete organization" tone="danger" onClick={() => setDeleting(o)} />}
    </div>
  );

  return (
    <Page>
      <PageHeader
        title="Organizations"
        description="Every workspace on the platform, their plans and WhatsApp numbers"
        actions={can("orgs:create") && <Button icon={"add"} onClick={() => setFormOrg("new")}>New organization</Button>}
      />

      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <SearchInput value={search} onChange={(v) => { setSearch(v); setPage(1); }} placeholder="Search name or slug…" />
        <FilterTabs<"ALL" | PlanName>
          value={plan}
          onChange={(v) => { setPlan(v); setPage(1); }}
          options={[{ value: "ALL", label: "All plans" }, ...PLANS.map((p) => ({ value: p, label: p[0] + p.slice(1).toLowerCase() }))]}
        />
      </div>

      <Card className="overflow-hidden">
        {isLoading ? <SkeletonRows /> : orgs.length === 0 ? (
          <EmptyState
            icon={"apartment"} title="No organizations found" description="Try a different search or create one."
            action={can("orgs:create") && <Button icon={"add"} onClick={() => setFormOrg("new")}>New organization</Button>}
          />
        ) : (
          <>
            <div className="hidden md:block overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50/80 text-[11px] uppercase tracking-wider text-slate-500">
                  <tr>
                    {["Organization", "Plan", "Members", "WhatsApp", "Conversations", "Created", ""].map((h) => (
                      <th key={h} className="text-left font-semibold px-5 py-3">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {orgs.map((o) => (
                    <tr key={o.id} className="hover:bg-slate-50/60">
                      <td className="px-5 py-3.5">
                        <button onClick={() => setViewOrg(o)} className="flex items-center gap-3 text-left">
                          <div className="w-9 h-9 rounded-xl bg-slate-100 flex items-center justify-center text-xs font-bold text-slate-600 shrink-0">
                            {o.name[0]?.toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold text-slate-900 truncate max-w-[220px] hover:text-green-600">{o.name}</p>
                            <p className="text-xs text-slate-400 font-mono">{o.slug}</p>
                          </div>
                        </button>
                      </td>
                      <td className="px-5 py-3.5"><Badge tone={PLAN_TONES[o.plan]}>{o.plan}</Badge></td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-600">{o._count.members}</td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-600">{o._count.whatsappAccounts}</td>
                      <td className="px-5 py-3.5 tabular-nums text-slate-600">{o._count.conversations.toLocaleString()}</td>
                      <td className="px-5 py-3.5 text-xs text-slate-400">{new Date(o.createdAt).toLocaleDateString()}</td>
                      <td className="px-5 py-3.5"><div className="flex justify-end"><Actions o={o} /></div></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <ul className="md:hidden divide-y divide-slate-100">
              {orgs.map((o) => (
                <li key={o.id} className="p-4">
                  <button onClick={() => setViewOrg(o)} className="w-full flex items-start gap-3 text-left">
                    <div className="w-10 h-10 rounded-xl bg-slate-100 flex items-center justify-center text-sm font-bold text-slate-600 shrink-0">
                      {o.name[0]?.toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="font-semibold text-slate-900 text-sm truncate">{o.name}</p>
                        <Badge tone={PLAN_TONES[o.plan]}>{o.plan}</Badge>
                      </div>
                      <p className="text-xs text-slate-400 font-mono truncate">{o.slug}</p>
                      <div className="mt-2 flex gap-4 text-[11px] text-slate-500">
                        <span><Icon name={"group"} className="w-2.5 h-2.5 mr-1" />{o._count.members}</span>
                        <span><Icon name={"smartphone"} className="w-2.5 h-2.5 mr-1" />{o._count.whatsappAccounts}</span>
                        <span><Icon name={"forum"} className="w-2.5 h-2.5 mr-1" />{o._count.conversations}</span>
                      </div>
                    </div>
                  </button>
                  <div className="mt-3 flex justify-end"><Actions o={o} /></div>
                </li>
              ))}
            </ul>
          </>
        )}
        <Pagination page={page} limit={LIMIT} total={data?.total ?? 0} onChange={setPage} />
      </Card>

      {formOrg && <OrgFormModal org={formOrg === "new" ? null : formOrg} onClose={() => setFormOrg(null)} onSaved={() => { refresh(); setFormOrg(null); }} />}
      {viewOrg && <OrgDetailModal org={viewOrg} onClose={() => setViewOrg(null)} onChanged={refresh} />}

      <ConfirmDialog
        open={!!deleting}
        onClose={() => setDeleting(null)}
        onConfirm={doDelete}
        loading={busy}
        title="Delete organization?"
        confirmLabel="Delete forever"
        confirmText={deleting?.slug}
        message={<>All contacts, conversations, templates, broadcasts and WhatsApp numbers of <b>{deleting?.name}</b> will be permanently deleted.</>}
      />
    </Page>
  );
}

function OrgFormModal({ org, onClose, onSaved }: { org: OrgRow | null; onClose: () => void; onSaved: () => void }) {
  const [form, setForm] = useState({
    name: org?.name ?? "", slug: org?.slug ?? "", website: org?.website ?? "",
    plan: (org?.plan ?? "TRIAL") as PlanName,
    trialEndsAt: org?.trialEndsAt ? org.trialEndsAt.slice(0, 10) : "",
  });
  const [saving, setSaving] = useState(false);
  const set = (k: keyof typeof form, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const payload = { ...form, trialEndsAt: form.trialEndsAt || null };
      if (org) await axios.patch(`/api/admin/organizations/${org.id}`, payload);
      else await axios.post("/api/admin/organizations", payload);
      toast.success(org ? "Organization updated" : "Organization created");
      onSaved();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  return (
    <Modal
      open onClose={onClose} icon={org ? "edit" : "add"}
      title={org ? "Edit organization" : "New organization"} description={org?.slug}
      footer={<>
        <Button variant="secondary" className="flex-1" onClick={onClose}>Cancel</Button>
        <Button type="submit" form="org-form" className="flex-1" loading={saving}>{org ? "Save changes" : "Create"}</Button>
      </>}
    >
      <form id="org-form" onSubmit={submit} className="space-y-4">
        <Field label="Business name *" hint="Shown to the team and used for the workspace URL."><input className={inputCls} value={form.name} onChange={(e) => set("name", e.target.value)} required minLength={2} maxLength={120} placeholder="e.g. Sun Jewellers" autoFocus={!org} /></Field>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Slug" hint={org ? "Changing the slug can break existing links." : "Leave empty to generate from name."}>
            <input className={`${inputCls} font-mono`} value={form.slug} onChange={(e) => set("slug", e.target.value)} placeholder="acme-inc" />
          </Field>
          <Field label="Website (optional)" hint="https:// is added automatically."><input type="text" inputMode="url" autoComplete="url" className={inputCls} value={form.website} onChange={(e) => set("website", e.target.value)} placeholder="sunjewellers.com" /></Field>
        </div>
        <Field label="Plan">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {PLANS.map((p) => (
              <button type="button" key={p} onClick={() => set("plan", p)}
                className={`rounded-xl border-2 px-3 py-2.5 text-xs font-bold transition-colors ${form.plan === p ? "border-green-500 bg-green-50 text-green-700" : "border-slate-200 text-slate-600 hover:border-slate-300"}`}>
                {p}
              </button>
            ))}
          </div>
        </Field>
        {form.plan === "TRIAL" && (
          <Field label="Trial ends on"><input type="date" className={inputCls} value={form.trialEndsAt} onChange={(e) => set("trialEndsAt", e.target.value)} /></Field>
        )}
      </form>
    </Modal>
  );
}

const WA_EMPTY = { phoneNumber: "", phoneNumberId: "", displayName: "", wabaId: "", accessToken: "" };

interface OrgDetail {
  members: { id: string; role: string; user: { id: string; name: string | null; email: string; isActive: boolean } }[];
  whatsappAccounts: { id: string; phoneNumber: string; phoneNumberId: string; wabaId: string; displayName: string; isActive: boolean }[];
  subscription: { status: string } | null;
  _count: { conversations: number; broadcasts: number; contacts: number; templates: number };
}

function OrgDetailModal({ org, onClose, onChanged }: { org: OrgRow; onClose: () => void; onChanged: () => void }) {
  const { can } = useAdmin();
  const [tab, setTab] = useState<"overview" | "members" | "whatsapp">("overview");
  const [waForm, setWaForm] = useState<typeof WA_EMPTY | null>(null);
  const [saving, setSaving] = useState(false);
  const [removing, setRemoving] = useState<OrgDetail["whatsappAccounts"][number] | null>(null);

  const { data, refetch, isLoading } = useQuery({
    queryKey: ["admin-org-detail", org.id],
    queryFn: () => axios.get(`/api/admin/organizations/${org.id}`).then((r) => r.data.organization as OrgDetail),
  });

  const afterChange = () => { refetch(); onChanged(); };

  const addWa = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!waForm) return;
    setSaving(true);
    try {
      await axios.post(`/api/admin/organizations/${org.id}/whatsapp`, waForm);
      toast.success("WhatsApp number connected");
      setWaForm(null);
      afterChange();
    } catch (e) { toast.error(apiError(e)); }
    finally { setSaving(false); }
  };

  const toggleWa = async (acc: OrgDetail["whatsappAccounts"][number]) => {
    try {
      await axios.patch(`/api/admin/organizations/${org.id}/whatsapp`, { isActive: !acc.isActive }, { params: { accountId: acc.id } });
      toast.success(acc.isActive ? "Number disabled" : "Number enabled");
      afterChange();
    } catch (e) { toast.error(apiError(e)); }
  };

  const removeWa = async () => {
    if (!removing) return;
    try {
      await axios.delete(`/api/admin/organizations/${org.id}/whatsapp`, { params: { accountId: removing.id } });
      toast.success("Number removed");
      setRemoving(null);
      afterChange();
    } catch (e) { toast.error(apiError(e)); }
  };

  const stats = data ? [
    { label: "Contacts", value: data._count.contacts, icon: "contacts" },
    { label: "Conversations", value: data._count.conversations, icon: "forum" },
    { label: "Broadcasts", value: data._count.broadcasts, icon: "campaign" },
    { label: "Templates", value: data._count.templates, icon: "apartment" },
  ] : [];

  return (
    <Modal open onClose={onClose} title={org.name} description={`${org.slug} · ${org.plan}`} icon={"apartment"} size="lg">
      <div className="space-y-4">
        <FilterTabs value={tab} onChange={setTab} options={[
          { value: "overview", label: "Overview" },
          { value: "members", label: `Members (${org._count.members})` },
          { value: "whatsapp", label: `WhatsApp (${data?.whatsappAccounts.length ?? org._count.whatsappAccounts})` },
        ]} />

        {isLoading || !data ? <SkeletonRows rows={3} /> : tab === "overview" ? (
          <div className="space-y-4">
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              {stats.map((s) => (
                <div key={s.label} className="rounded-xl bg-slate-50 p-3">
                  <Icon name={s.icon} className="w-3 h-3 text-slate-400" />
                  <p className="mt-1.5 text-lg font-bold text-slate-900 tabular-nums">{s.value.toLocaleString()}</p>
                  <p className="text-[11px] text-slate-500">{s.label}</p>
                </div>
              ))}
            </div>
            <dl className="grid grid-cols-2 gap-3 text-sm">
              <div><dt className="text-xs text-slate-400">Subscription</dt><dd className="font-semibold text-slate-800">{data.subscription?.status ?? "—"}</dd></div>
              <div><dt className="text-xs text-slate-400">Trial ends</dt><dd className="font-semibold text-slate-800">{org.trialEndsAt ? new Date(org.trialEndsAt).toLocaleDateString() : "—"}</dd></div>
              <div><dt className="text-xs text-slate-400">Website</dt><dd className="font-semibold text-slate-800 truncate">{org.website ?? "—"}</dd></div>
              <div><dt className="text-xs text-slate-400">Created</dt><dd className="font-semibold text-slate-800">{new Date(org.createdAt).toLocaleDateString()}</dd></div>
            </dl>
          </div>
        ) : tab === "members" ? (
          data.members.length === 0 ? <p className="py-8 text-center text-sm text-slate-400">No members</p> : (
            <ul className="divide-y divide-slate-100 rounded-xl border border-slate-100">
              {data.members.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3.5 py-3">
                  <Avatar name={m.user.name ?? m.user.email} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-slate-800 truncate">{m.user.name ?? "—"}</p>
                    <p className="text-xs text-slate-400 truncate">{m.user.email}</p>
                  </div>
                  <Badge tone="blue">{m.role.replace(/_/g, " ")}</Badge>
                </li>
              ))}
            </ul>
          )
        ) : (
          <div className="space-y-3">
            {data.whatsappAccounts.length === 0 && !waForm && (
              <EmptyState icon={"smartphone"} title="No WhatsApp numbers" description="Connect a number using its Meta Phone Number ID." />
            )}
            {data.whatsappAccounts.map((acc) => (
              <div key={acc.id} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3.5">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center ${acc.isActive ? "bg-green-50 text-green-600" : "bg-slate-100 text-slate-400"}`}>
                  <Icon name={"wifi"} className="w-3.5 h-3.5" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-slate-800 truncate">{acc.displayName} <span className="font-normal text-slate-400">+{acc.phoneNumber}</span></p>
                  <p className="text-[11px] text-slate-400 font-mono truncate">ID {acc.phoneNumberId} · WABA {acc.wabaId}</p>
                </div>
                {can("orgs:write") && (
                  <div className="flex gap-1.5">
                    <IconButton icon={acc.isActive ? "cancel" : "check_circle"} label={acc.isActive ? "Disable" : "Enable"} tone={acc.isActive ? "warn" : "success"} onClick={() => toggleWa(acc)} />
                    <IconButton icon={"delete"} label="Remove number" tone="danger" onClick={() => setRemoving(acc)} />
                  </div>
                )}
              </div>
            ))}

            {can("orgs:write") && (waForm ? (
              <form onSubmit={addWa} className="rounded-xl border border-green-200 bg-green-50/40 p-4 space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="Phone number"><input className={inputCls} value={waForm.phoneNumber} onChange={(e) => setWaForm({ ...waForm, phoneNumber: e.target.value })} placeholder="919876543210" required /></Field>
                  <Field label="Display name"><input className={inputCls} value={waForm.displayName} onChange={(e) => setWaForm({ ...waForm, displayName: e.target.value })} /></Field>
                  <Field label="Phone Number ID"><input className={`${inputCls} font-mono`} value={waForm.phoneNumberId} onChange={(e) => setWaForm({ ...waForm, phoneNumberId: e.target.value })} required /></Field>
                  <Field label="WABA ID"><input className={`${inputCls} font-mono`} value={waForm.wabaId} onChange={(e) => setWaForm({ ...waForm, wabaId: e.target.value })} required /></Field>
                </div>
                <Field label="Permanent access token" hint="System User token with whatsapp_business_messaging & whatsapp_business_management.">
                  <input type="password" className={`${inputCls} font-mono`} value={waForm.accessToken} onChange={(e) => setWaForm({ ...waForm, accessToken: e.target.value })} required autoComplete="off" />
                </Field>
                <div className="flex gap-2 justify-end">
                  <Button type="button" variant="secondary" onClick={() => setWaForm(null)}>Cancel</Button>
                  <Button type="submit" loading={saving}>Connect number</Button>
                </div>
              </form>
            ) : (
              <Button variant="secondary" icon={"add"} className="w-full" onClick={() => setWaForm({ ...WA_EMPTY })}>Connect WhatsApp number</Button>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={!!removing} onClose={() => setRemoving(null)} onConfirm={removeWa}
        title="Remove WhatsApp number?" confirmLabel="Remove"
        message={<>Messages will stop flowing for <b>+{removing?.phoneNumber}</b>. Existing conversations are kept.</>}
      />
    </Modal>
  );
}
