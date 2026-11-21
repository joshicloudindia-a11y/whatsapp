import { prisma } from "@/lib/prisma";
import { sendMail } from "@/lib/mailer";

export const REMINDER_SELECT = {
  id: true, dueAt: true, note: true, doneAt: true, createdAt: true, conversationId: true,
  contact: { select: { id: true, name: true, phone: true } },
  createdBy: { select: { id: true, name: true } },
  assignedTo: { select: { id: true, name: true } },
} as const;

const appUrl = () => (process.env.NEXTAUTH_URL || process.env.NEXT_PUBLIC_APP_URL || "").replace(/\/$/, "");
const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

/** Emails the owner of every follow-up reminder that has just become due (once each). Called by the cron. */
export async function processDueReminders(limit = 100) {
  const due = await prisma.reminder.findMany({
    where: { doneAt: null, notifiedAt: null, dueAt: { lte: new Date() } },
    orderBy: { dueAt: "asc" },
    take: limit,
    select: {
      id: true, note: true, dueAt: true, conversationId: true,
      contact: { select: { name: true, phone: true } },
      createdBy: { select: { email: true, name: true, isActive: true } },
      assignedTo: { select: { email: true, name: true, isActive: true } },
    },
  });
  let sent = 0;
  for (const r of due) {
    const owner = r.assignedTo?.isActive ? r.assignedTo : r.createdBy;
    // Mark first so a slow/failed email never causes repeats.
    await prisma.reminder.update({ where: { id: r.id }, data: { notifiedAt: new Date() } });
    if (!owner?.isActive || !owner.email) continue;
    const who = r.contact.name ? `${r.contact.name} (+${r.contact.phone})` : `+${r.contact.phone}`;
    const link = `${appUrl()}/inbox${r.conversationId ? `?id=${r.conversationId}` : ""}`;
    try {
      await sendMail({
        to: owner.email,
        subject: `Follow-up due: ${r.contact.name || `+${r.contact.phone}`}`,
        html: `<div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;border:1px solid #e2e8f0;border-radius:16px;padding:28px">
  <p style="margin:0 0 4px;color:#16a34a;font-weight:700;font-size:12px;letter-spacing:.08em">CHATFLOW · FOLLOW-UP</p>
  <h2 style="margin:0 0 12px;color:#0f172a">Time to follow up with ${esc(who)}</h2>
  <p style="margin:0 0 16px;color:#334155;white-space:pre-wrap">${esc(r.note)}</p>
  <a href="${link}" style="display:inline-block;background:#25D366;color:#fff;text-decoration:none;font-weight:700;padding:10px 18px;border-radius:10px">Open conversation</a>
</div>`,
      });
      sent++;
    } catch (e) {
      console.error("[reminders] email failed", e);
    }
  }
  return { due: due.length, emailed: sent };
}
