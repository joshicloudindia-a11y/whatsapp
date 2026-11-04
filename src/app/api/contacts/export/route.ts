import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { csvCell } from "@/components/contacts/shared";
import { buildContactWhere } from "../_lib/query";

const MAX_ROWS = 50_000;
const BATCH = 2_000;

/** GET ?search&stage&tag&status → CSV of the caller's contacts matching the current filter. */
export async function GET(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;

  const where = buildContactWhere(member.organizationId, req.nextUrl.searchParams);
  const total = await prisma.contact.count({ where });
  if (total > MAX_ROWS) {
    return NextResponse.json({ error: `Too many contacts to export at once (${total.toLocaleString("en-IN")}). Narrow the filter to ${MAX_ROWS.toLocaleString("en-IN")} or fewer.` }, { status: 413 });
  }

  const lines = [["name", "phone", "email", "stage", "tags", "opted_out", "blocked", "notes", "created_at", "last_seen_at"].join(",")];
  let cursor: string | undefined;
  for (;;) {
    const batch = await prisma.contact.findMany({
      where,
      select: { id: true, name: true, phone: true, email: true, stage: true, optedOut: true, isBlocked: true, notes: true, createdAt: true, lastSeenAt: true, tags: { select: { tag: true } } },
      orderBy: { id: "asc" },
      take: BATCH,
      ...(cursor && { skip: 1, cursor: { id: cursor } }),
    });
    for (const c of batch) {
      lines.push([
        c.name, c.phone, c.email, c.stage, c.tags.map((t) => t.tag).join(";"),
        c.optedOut ? "yes" : "no", c.isBlocked ? "yes" : "no", c.notes,
        c.createdAt.toISOString(), c.lastSeenAt?.toISOString() ?? "",
      ].map(csvCell).join(","));
    }
    if (batch.length < BATCH) break;
    cursor = batch[batch.length - 1].id;
  }

  const date = new Date().toISOString().slice(0, 10);
  return new Response("﻿" + lines.join("\r\n"), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="contacts-${date}.csv"`,
      "Cache-Control": "no-store",
    },
  });
}
