import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { STAGES, cleanTag } from "@/components/contacts/shared";
import { CAN_DELETE_ROLES } from "../_lib/query";

const schema = z.object({
  ids: z.array(z.string().min(1).max(64)).min(1).max(500),
  action: z.enum(["addTag", "removeTag", "setStage", "optOut", "optIn", "block", "unblock", "delete"]),
  tag: z.string().max(60).optional(),
  stage: z.enum(STAGES).optional(),
});

/** POST { ids, action, tag?, stage? } → applies one action to the caller's own contacts only. */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid bulk action" }, { status: 400 });
  const { action } = parsed.data;

  // Only ids that belong to this organization are ever touched.
  const owned = await prisma.contact.findMany({
    where: { id: { in: [...new Set(parsed.data.ids)] }, organizationId: member.organizationId },
    select: { id: true },
  });
  const ids = owned.map((c) => c.id);
  if (!ids.length) return NextResponse.json({ error: "No matching contacts" }, { status: 404 });

  switch (action) {
    case "addTag":
    case "removeTag": {
      const tag = cleanTag(parsed.data.tag ?? "");
      if (!tag) return NextResponse.json({ error: "Enter a tag" }, { status: 400 });
      const r = action === "addTag"
        ? await prisma.contactTag.createMany({ data: ids.map((contactId) => ({ contactId, tag })), skipDuplicates: true })
        : await prisma.contactTag.deleteMany({ where: { contactId: { in: ids }, tag } });
      return NextResponse.json({ updated: ids.length, changed: r.count });
    }
    case "setStage": {
      if (!parsed.data.stage) return NextResponse.json({ error: "Choose a stage" }, { status: 400 });
      const r = await prisma.contact.updateMany({ where: { id: { in: ids }, organizationId: member.organizationId }, data: { stage: parsed.data.stage } });
      return NextResponse.json({ updated: r.count });
    }
    case "optOut":
    case "optIn":
    case "block":
    case "unblock": {
      const data = action === "optOut" ? { optedOut: true } : action === "optIn" ? { optedOut: false } : action === "block" ? { isBlocked: true } : { isBlocked: false };
      const r = await prisma.contact.updateMany({ where: { id: { in: ids }, organizationId: member.organizationId }, data });
      return NextResponse.json({ updated: r.count });
    }
    case "delete": {
      if (!CAN_DELETE_ROLES.includes(member.role)) return NextResponse.json({ error: "Only admins and campaign managers can delete contacts" }, { status: 403 });
      // Contacts with chat/broadcast history are kept (those relations don't cascade).
      const [convRows, bcRows] = await Promise.all([
        prisma.conversation.groupBy({ by: ["contactId"], where: { contactId: { in: ids }, organizationId: member.organizationId } }),
        prisma.broadcastRecipient.groupBy({ by: ["contactId"], where: { contactId: { in: ids } } }),
      ]);
      const keep = new Set([...convRows.map((r) => r.contactId), ...bcRows.map((r) => r.contactId)]);
      const del = ids.filter((id) => !keep.has(id));
      if (del.length) {
        await prisma.$transaction([
          prisma.chatbotSession.deleteMany({ where: { contactId: { in: del } } }),
          prisma.contactTag.deleteMany({ where: { contactId: { in: del } } }),
          prisma.contactAttribute.deleteMany({ where: { contactId: { in: del } } }),
          prisma.contact.deleteMany({ where: { id: { in: del }, organizationId: member.organizationId } }),
        ]);
      }
      return NextResponse.json({ deleted: del.length, skipped: keep.size });
    }
  }
}
