"use client";

import { useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { STAGES, STAGE_META, isEmail, normalizePhone, prettyPhone, type ContactRow, type Stage } from "./shared";
import { Modal, Spinner, TagInput, Toggle, errMsg, inputCls } from "./ui";

type Editable = Pick<ContactRow, "id" | "phone" | "name" | "email" | "stage" | "notes" | "optedOut" | "isBlocked" | "tags">;

export function ContactFormModal({ contact, tagSuggestions, onClose, onSaved }: {
  contact?: Editable | null;
  tagSuggestions: string[];
  onClose: () => void;
  onSaved: (c: ContactRow) => void;
}) {
  const editing = !!contact;
  const [phone, setPhone] = useState(contact ? `+${contact.phone}` : "");
  const [name, setName] = useState(contact?.name ?? "");
  const [email, setEmail] = useState(contact?.email ?? "");
  const [stage, setStage] = useState<Stage>(contact?.stage ?? "LEAD");
  const [tags, setTags] = useState<string[]>(contact?.tags.map((t) => t.tag) ?? []);
  const [notes, setNotes] = useState(contact?.notes ?? "");
  const [optedOut, setOptedOut] = useState(contact?.optedOut ?? false);
  const [isBlocked, setIsBlocked] = useState(contact?.isBlocked ?? false);
  const [touched, setTouched] = useState(false);
  const [saving, setSaving] = useState(false);

  const p = normalizePhone(phone);
  const phoneErr = "error" in p ? p.error : null;
  const emailErr = email.trim() && !isEmail(email.trim()) ? "Enter a valid email address" : null;
  const valid = !phoneErr && !emailErr;

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTouched(true);
    if (!valid) return;
    setSaving(true);
    const body = { phone, name: name.trim() || null, email: email.trim() || null, stage, tags, notes: notes.trim() || null, optedOut, isBlocked };
    try {
      const r = editing ? await axios.patch(`/api/contacts/${contact!.id}`, body) : await axios.post("/api/contacts", body);
      toast.success(editing ? "Contact updated" : "Contact added");
      onSaved(r.data.contact as ContactRow);
    } catch (err) {
      toast.error(errMsg(err, editing ? "Couldn't update contact" : "Couldn't add contact"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      title={editing ? "Edit contact" : "Add contact"}
      subtitle={editing ? undefined : "Save a customer so you can message and segment them."}
      onClose={onClose}
      footer={
        <>
          <button type="button" onClick={onClose} className="rounded-xl border border-slate-200 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-50">Cancel</button>
          <div className="flex-1" />
          <button type="submit" form="contact-form" disabled={saving}
            className="inline-flex items-center gap-2 rounded-xl bg-[#25D366] px-5 py-2.5 text-sm font-semibold text-white shadow-sm shadow-green-500/25 hover:bg-[#1fb857] disabled:opacity-50">
            {saving ? <Spinner /> : <Icon name={editing ? "check" : "person_add"} className="w-4 h-4" />}
            {editing ? "Save changes" : "Add contact"}
          </button>
        </>
      }
    >
      <form id="contact-form" onSubmit={submit} className="space-y-4" noValidate>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block space-y-1.5 sm:col-span-2">
            <span className="text-xs font-semibold text-slate-600">WhatsApp number <span className="text-red-500">*</span></span>
            <div className="relative">
              <Icon name="smartphone" className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
              <input autoFocus={!editing} inputMode="tel" autoComplete="tel" value={phone} onChange={(e) => setPhone(e.target.value)} onBlur={() => setTouched(true)}
                placeholder="+91 98765 43210" className={cn(inputCls, "pl-9", touched && phoneErr && "border-red-300 focus:border-red-400 focus:ring-red-500/20")} />
            </div>
            {touched && phoneErr ? (
              <span className="block text-[11px] text-red-500">{phoneErr}</span>
            ) : "phone" in p ? (
              <span className="flex items-center gap-1 text-[11px] text-slate-500"><Icon name="check_circle" className="w-3 h-3 text-green-600" filled /> Saved as {prettyPhone(p.phone)}</span>
            ) : (
              <span className="block text-[11px] text-slate-400">Include the country code. 10-digit numbers are treated as Indian (+91).</span>
            )}
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} autoComplete="name" placeholder="Rahul Sharma" className={inputCls} />
          </label>
          <label className="block space-y-1.5">
            <span className="text-xs font-semibold text-slate-600">Email</span>
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} maxLength={191} autoComplete="email" placeholder="rahul@example.com"
              className={cn(inputCls, touched && emailErr && "border-red-300")} />
            {touched && emailErr && <span className="block text-[11px] text-red-500">{emailErr}</span>}
          </label>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">Stage</span>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {STAGES.map((s) => (
              <button key={s} type="button" onClick={() => setStage(s)} aria-pressed={stage === s}
                className={cn("flex items-center gap-2 rounded-xl border-2 px-3 py-2 text-sm font-semibold transition",
                  stage === s ? "border-green-500 bg-green-50/50 text-slate-900" : "border-slate-200 text-slate-600 hover:border-slate-300")}>
                <span className={cn("w-2 h-2 rounded-full", STAGE_META[s].dot)} /> {STAGE_META[s].label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">Tags</span>
          <TagInput value={tags} onChange={setTags} suggestions={tagSuggestions} placeholder="vip, diwali-2026… press Enter" />
        </div>

        <label className="block space-y-1.5">
          <span className="text-xs font-semibold text-slate-600">Notes</span>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={5000} rows={3} placeholder="Anything your team should know…" className={cn(inputCls, "resize-y")} />
        </label>

        <div className="grid gap-2 sm:grid-cols-2">
          <Toggle checked={optedOut} onChange={setOptedOut} label="Opted out" hint="Asked not to receive marketing; skipped by broadcasts" />
          <Toggle checked={isBlocked} onChange={setIsBlocked} danger label="Blocked" hint="Spam or unwanted contact; skipped by broadcasts" />
        </div>
      </form>
    </Modal>
  );
}
