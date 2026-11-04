import { NextRequest, NextResponse } from "next/server";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

/**
 * Analytics insights for the Analytics page.
 *
 * Query params:
 *   range=7d|30d|90d            preset (default 30d), ending today in the org timezone
 *   from=YYYY-MM-DD&to=YYYY-MM-DD  custom inclusive range in the org timezone (max 180 days)
 *
 * Every metric is computed with count/groupBy/aggregate or bounded raw SQL
 * (tagged templates only) scoped to the caller's organization.
 */

const DEFAULT_TZ = "Asia/Kolkata";
const MAX_DAYS = 180;
const FRT_SAMPLE_LIMIT = 5000; // max conversations sampled for first-response time
const PRESETS: Record<string, number> = { "7d": 7, "30d": 30, "90d": 90 };
const DAY_MS = 86_400_000;
const ISO_DAY = /^\d{4}-\d{2}-\d{2}$/;

// ─── Timezone helpers ────────────────────────────────────────────────────────

function safeTimeZone(tz: string | null | undefined) {
  if (!tz) return DEFAULT_TZ;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TZ;
  }
}

/** Minutes the zone is ahead of UTC at the given instant (e.g. +330 for IST). */
function tzOffsetMinutes(tz: string, at: Date) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
    hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const get = (t: string) => Number(parts.find((p) => p.type === t)?.value ?? 0);
  const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return Math.round((asUtc - Math.floor(at.getTime() / 1000) * 1000) / 60_000);
}

/** "YYYY-MM-DD" of the instant in the zone. */
function localDay(tz: string, at: Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(at);
}

/** UTC instant of local midnight for a "YYYY-MM-DD" day in the zone. */
function localMidnightUtc(tz: string, day: string) {
  const [y, m, d] = day.split("-").map(Number);
  const naive = Date.UTC(y, m - 1, d);
  // Two passes handle DST transitions near midnight.
  let guess = naive - tzOffsetMinutes(tz, new Date(naive)) * 60_000;
  guess = naive - tzOffsetMinutes(tz, new Date(guess)) * 60_000;
  return new Date(guess);
}

function addDays(day: string, n: number) {
  const [y, m, d] = day.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + n)).toISOString().slice(0, 10);
}

function dayDiff(a: string, b: string) {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / DAY_MS);
}

function isValidDay(s: string) {
  return ISO_DAY.test(s) && !Number.isNaN(Date.parse(`${s}T00:00:00Z`)) && new Date(`${s}T00:00:00Z`).toISOString().slice(0, 10) === s;
}

// ─── Math helpers ────────────────────────────────────────────────────────────

const num = (v: unknown) => (v === null || v === undefined ? 0 : Number(v));
const rate = (a: number, b: number) => (b > 0 ? Math.round((a / b) * 1000) / 10 : null);
function trend(curr: number | null, prev: number | null) {
  if (curr === null || prev === null) return null;
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 100);
}
function median(sorted: number[]) {
  if (!sorted.length) return null;
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid] : Math.round((sorted[mid - 1] + sorted[mid]) / 2);
}

// ─── Queries ─────────────────────────────────────────────────────────────────

type Period = { start: Date; end: Date };

interface FrtRow { secs: bigint | number | null; responder: string | null }

/**
 * First-response time: for each conversation whose first INBOUND message in the
 * period falls inside it, the delay until the first OUTBOUND message after it.
 * Bounded to FRT_SAMPLE_LIMIT most recent conversations and an 8s execution cap;
 * on timeout the metric degrades to null instead of failing the whole response.
 */
async function firstResponse(orgId: string, p: Period) {
  const rows = await prisma.$queryRaw<FrtRow[]>`
    SELECT /*+ MAX_EXECUTION_TIME(8000) */
      TIMESTAMPDIFF(SECOND, fi.firstIn, (
        SELECT MIN(o.createdAt) FROM Message o
        WHERE o.conversationId = fi.conversationId AND o.direction = 'OUTBOUND' AND o.createdAt >= fi.firstIn
      )) AS secs,
      (
        SELECT o2.sentByUserId FROM Message o2
        WHERE o2.conversationId = fi.conversationId AND o2.direction = 'OUTBOUND' AND o2.createdAt >= fi.firstIn
        ORDER BY o2.createdAt ASC LIMIT 1
      ) AS responder
    FROM (
      SELECT conversationId, MIN(createdAt) AS firstIn
      FROM Message
      WHERE organizationId = ${orgId} AND direction = 'INBOUND'
        AND createdAt >= ${p.start} AND createdAt < ${p.end}
      GROUP BY conversationId
      ORDER BY firstIn DESC
      LIMIT ${FRT_SAMPLE_LIMIT}
    ) fi
  `.catch((e: unknown) => {
    console.error("[analytics/insights] first-response query failed", e);
    return [] as FrtRow[];
  });
  const answered = rows.filter((r) => r.secs !== null).map((r) => ({ secs: Math.max(0, num(r.secs)), responder: r.responder }));
  const sorted = answered.map((r) => r.secs).sort((a, b) => a - b);
  const avg = sorted.length ? Math.round(sorted.reduce((a, b) => a + b, 0) / sorted.length) : null;
  const within = (s: number) => sorted.filter((x) => x <= s).length;
  return {
    sampled: rows.length,
    answered: answered.length,
    capped: rows.length >= FRT_SAMPLE_LIMIT,
    medianSecs: median(sorted),
    avgSecs: avg,
    within5m: rate(within(300), sorted.length),
    within1h: rate(within(3600), sorted.length),
    perResponder: answered,
  };
}

async function uniqueCustomers(orgId: string, p: Period) {
  const rows = await prisma.$queryRaw<{ n: bigint }[]>`
    SELECT COUNT(DISTINCT c.contactId) AS n
    FROM Message m JOIN Conversation c ON c.id = m.conversationId
    WHERE m.organizationId = ${orgId} AND m.direction = 'INBOUND'
      AND m.createdAt >= ${p.start} AND m.createdAt < ${p.end}
  `;
  return num(rows[0]?.n);
}

/** Headline numbers for one period (run for current + previous). */
async function periodSummary(orgId: string, p: Period) {
  const created = { gte: p.start, lt: p.end };
  const [convStatus, msgGroups, customers, newContacts, frt, bc] = await Promise.all([
    prisma.conversation.groupBy({ by: ["status"], where: { organizationId: orgId, createdAt: created }, _count: { _all: true } }),
    prisma.message.groupBy({ by: ["direction", "status"], where: { organizationId: orgId, createdAt: created }, _count: { _all: true } }),
    uniqueCustomers(orgId, p),
    prisma.contact.count({ where: { organizationId: orgId, createdAt: created } }),
    firstResponse(orgId, p),
    prisma.broadcast.aggregate({
      where: { organizationId: orgId, createdAt: created },
      _count: { _all: true },
      _sum: { totalCount: true, sentCount: true, deliveredCount: true, readCount: true, failedCount: true, repliedCount: true },
    }),
  ]);

  const byStatus: Record<string, number> = { OPEN: 0, PENDING: 0, RESOLVED: 0, SNOOZED: 0 };
  for (const g of convStatus) byStatus[g.status] = g._count._all;
  const conversations = Object.values(byStatus).reduce((a, b) => a + b, 0);

  let inbound = 0, outbound = 0, outDelivered = 0, outFailed = 0;
  for (const g of msgGroups) {
    const n = g._count._all;
    if (g.direction === "INBOUND") { inbound += n; continue; }
    outbound += n;
    if (g.status === "DELIVERED") outDelivered += n;
    if (g.status === "READ") outDelivered += n; // read implies delivered
    if (g.status === "FAILED") outFailed += n;
  }

  const s = bc._sum;
  const bSent = num(s.sentCount), bDelivered = num(s.deliveredCount), bRead = num(s.readCount);
  return {
    byStatus,
    frt,
    kpis: {
      conversations,
      messagesIn: inbound,
      messagesOut: outbound,
      uniqueCustomers: customers,
      newContacts,
      resolved: byStatus.RESOLVED,
      resolutionRate: rate(byStatus.RESOLVED, conversations),
      medianFirstResponseSecs: frt.medianSecs,
      avgFirstResponseSecs: frt.avgSecs,
      responseRate: rate(frt.answered, frt.sampled),
      messageDeliveryRate: rate(outDelivered, outbound),
      messageFailed: outFailed,
      broadcasts: bc._count._all,
      broadcastRecipients: num(s.totalCount),
      broadcastSent: bSent,
      broadcastDelivered: bDelivered,
      broadcastRead: bRead,
      broadcastFailed: num(s.failedCount),
      broadcastReplied: num(s.repliedCount),
      broadcastDeliveryRate: rate(bDelivered, bSent),
      broadcastReadRate: rate(bRead, bDelivered),
    },
  };
}

// ─── Handler ─────────────────────────────────────────────────────────────────

export async function GET(req: NextRequest) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const orgId = auth.member.organizationId;

  const org = await prisma.organization.findUnique({ where: { id: orgId }, select: { timezone: true } });
  const tz = safeTimeZone(org?.timezone);

  // ── Resolve the date range (inclusive local days) ──
  const sp = req.nextUrl.searchParams;
  const today = localDay(tz, new Date());
  const fromParam = sp.get("from");
  const toParam = sp.get("to");
  let fromDay: string;
  let toDay: string;
  let preset: string | null = null;

  if (fromParam || toParam) {
    if (!fromParam || !toParam || !isValidDay(fromParam) || !isValidDay(toParam)) {
      return NextResponse.json({ error: "from and to must both be valid dates (YYYY-MM-DD)" }, { status: 400 });
    }
    if (fromParam > toParam) return NextResponse.json({ error: "from must be on or before to" }, { status: 400 });
    if (fromParam > today) return NextResponse.json({ error: "from cannot be in the future" }, { status: 400 });
    fromDay = fromParam;
    toDay = toParam > today ? today : toParam;
    if (dayDiff(fromDay, toDay) + 1 > MAX_DAYS) {
      return NextResponse.json({ error: `Date range cannot exceed ${MAX_DAYS} days` }, { status: 400 });
    }
  } else {
    preset = sp.get("range") ?? "30d";
    const days = PRESETS[preset];
    if (!days) return NextResponse.json({ error: "range must be one of 7d, 30d, 90d" }, { status: 400 });
    toDay = today;
    fromDay = addDays(today, -(days - 1));
  }

  const days = dayDiff(fromDay, toDay) + 1;
  const current: Period = { start: localMidnightUtc(tz, fromDay), end: localMidnightUtc(tz, addDays(toDay, 1)) };
  const prevFrom = addDays(fromDay, -days);
  const previous: Period = { start: localMidnightUtc(tz, prevFrom), end: current.start };

  // Single offset for SQL bucketing (exact for zones without DST, e.g. IST).
  const offset = tzOffsetMinutes(tz, current.end);
  const local = Prisma.sql`DATE_ADD(createdAt, INTERVAL ${offset} MINUTE)`;
  const created = { gte: current.start, lt: current.end };

  try {
    const [
      cur, prev,
      dailyMsgRows, dailyConvRows, dailyContactRows,
      heatRows, agentMsgRows, agentConvGroups, topContactRows, broadcastList,
    ] = await Promise.all([
      periodSummary(orgId, current),
      periodSummary(orgId, previous),

      prisma.$queryRaw<{ d: string; inbound: bigint; outbound: bigint }[]>`
        SELECT DATE_FORMAT(${local}, '%Y-%m-%d') AS d,
          SUM(CASE WHEN direction = 'INBOUND' THEN 1 ELSE 0 END) AS inbound,
          SUM(CASE WHEN direction = 'OUTBOUND' THEN 1 ELSE 0 END) AS outbound
        FROM Message
        WHERE organizationId = ${orgId} AND createdAt >= ${current.start} AND createdAt < ${current.end}
        GROUP BY d`,

      prisma.$queryRaw<{ d: string; n: bigint }[]>`
        SELECT DATE_FORMAT(${local}, '%Y-%m-%d') AS d, COUNT(*) AS n
        FROM Conversation
        WHERE organizationId = ${orgId} AND createdAt >= ${current.start} AND createdAt < ${current.end}
        GROUP BY d`,

      prisma.$queryRaw<{ d: string; n: bigint }[]>`
        SELECT DATE_FORMAT(${local}, '%Y-%m-%d') AS d, COUNT(*) AS n
        FROM Contact
        WHERE organizationId = ${orgId} AND createdAt >= ${current.start} AND createdAt < ${current.end}
        GROUP BY d`,

      // Inbound by local weekday (1=Sun..7=Sat) × hour.
      prisma.$queryRaw<{ dow: number | bigint; h: number | bigint; n: bigint }[]>`
        SELECT DAYOFWEEK(${local}) AS dow, HOUR(${local}) AS h, COUNT(*) AS n
        FROM Message
        WHERE organizationId = ${orgId} AND direction = 'INBOUND'
          AND createdAt >= ${current.start} AND createdAt < ${current.end}
        GROUP BY dow, h`,

      prisma.$queryRaw<{ uid: string | null; replies: bigint; convs: bigint }[]>`
        SELECT sentByUserId AS uid, COUNT(*) AS replies, COUNT(DISTINCT conversationId) AS convs
        FROM Message
        WHERE organizationId = ${orgId} AND direction = 'OUTBOUND'
          AND createdAt >= ${current.start} AND createdAt < ${current.end}
        GROUP BY sentByUserId
        ORDER BY replies DESC
        LIMIT 50`,

      prisma.conversation.groupBy({
        by: ["assignedAgentId", "status"],
        where: { organizationId: orgId, assignedAgentId: { not: null }, createdAt: created },
        _count: { _all: true },
      }),

      prisma.$queryRaw<{ contactId: string; total: bigint; inbound: bigint; lastAt: Date }[]>`
        SELECT c.contactId AS contactId, COUNT(*) AS total,
          SUM(CASE WHEN m.direction = 'INBOUND' THEN 1 ELSE 0 END) AS inbound,
          MAX(m.createdAt) AS lastAt
        FROM Message m JOIN Conversation c ON c.id = m.conversationId
        WHERE m.organizationId = ${orgId} AND m.createdAt >= ${current.start} AND m.createdAt < ${current.end}
        GROUP BY c.contactId
        ORDER BY total DESC
        LIMIT 10`,

      prisma.broadcast.findMany({
        where: { organizationId: orgId, createdAt: created },
        orderBy: { createdAt: "desc" },
        take: 15,
        select: {
          id: true, name: true, status: true, createdAt: true, startedAt: true,
          totalCount: true, sentCount: true, deliveredCount: true, readCount: true, failedCount: true, repliedCount: true,
          template: { select: { name: true } },
        },
      }),
    ]);

    // ── Daily series (zero-filled) ──
    const msgMap = new Map(dailyMsgRows.map((r) => [String(r.d), r]));
    const convMap = new Map(dailyConvRows.map((r) => [String(r.d), num(r.n)]));
    const contactMap = new Map(dailyContactRows.map((r) => [String(r.d), num(r.n)]));
    const daily = Array.from({ length: days }, (_, i) => {
      const d = addDays(fromDay, i);
      const m = msgMap.get(d);
      return {
        date: d,
        inbound: num(m?.inbound),
        outbound: num(m?.outbound),
        conversations: convMap.get(d) ?? 0,
        newContacts: contactMap.get(d) ?? 0,
      };
    });

    // ── Heatmap: rows Mon..Sun, 24 hours ──
    const heatmap = Array.from({ length: 7 }, () => Array<number>(24).fill(0));
    for (const r of heatRows) {
      const dow = num(r.dow); // 1=Sun
      const row = (dow + 5) % 7; // Mon=0 .. Sun=6
      const h = num(r.h);
      if (row >= 0 && row < 7 && h >= 0 && h < 24) heatmap[row][h] = num(r.n);
    }
    const hourly = Array.from({ length: 24 }, (_, h) => ({ hour: h, inbound: heatmap.reduce((a, row) => a + row[h], 0) }));

    // ── Agents ──
    const frtByAgent = new Map<string, number[]>();
    for (const r of cur.frt.perResponder) {
      if (!r.responder) continue;
      const list = frtByAgent.get(r.responder) ?? [];
      list.push(r.secs);
      frtByAgent.set(r.responder, list);
    }
    const assigned = new Map<string, { assigned: number; resolved: number }>();
    for (const g of agentConvGroups) {
      if (!g.assignedAgentId) continue;
      const a = assigned.get(g.assignedAgentId) ?? { assigned: 0, resolved: 0 };
      a.assigned += g._count._all;
      if (g.status === "RESOLVED") a.resolved += g._count._all;
      assigned.set(g.assignedAgentId, a);
    }
    const agentIds = [...new Set([
      ...agentMsgRows.map((r) => r.uid).filter((x): x is string => !!x),
      ...assigned.keys(),
    ])];

    const [users, contacts] = await Promise.all([
      agentIds.length
        ? prisma.user.findMany({ where: { id: { in: agentIds } }, select: { id: true, name: true, email: true, avatar: true } })
        : Promise.resolve([]),
      topContactRows.length
        ? prisma.contact.findMany({
            where: { organizationId: orgId, id: { in: topContactRows.map((r) => r.contactId) } },
            select: { id: true, name: true, phone: true, stage: true },
          })
        : Promise.resolve([]),
    ]);
    const userMap = new Map(users.map((u) => [u.id, u]));
    const contactById = new Map(contacts.map((c) => [c.id, c]));

    const msgByAgent = new Map(agentMsgRows.map((r) => [r.uid, r]));
    const agents = agentIds
      .map((id) => {
        const u = userMap.get(id);
        const m = msgByAgent.get(id);
        const a = assigned.get(id);
        const frts = frtByAgent.get(id) ?? [];
        return {
          id,
          name: u?.name || u?.email || "Former member",
          email: u?.email ?? null,
          avatar: u?.avatar ?? null,
          replies: num(m?.replies),
          conversationsHandled: num(m?.convs),
          assigned: a?.assigned ?? 0,
          resolved: a?.resolved ?? 0,
          firstResponses: frts.length,
          avgFirstResponseSecs: frts.length ? Math.round(frts.reduce((x, y) => x + y, 0) / frts.length) : null,
        };
      })
      .sort((a, b) => b.replies - a.replies || b.assigned - a.assigned)
      .slice(0, 25);
    const automatedRow = msgByAgent.get(null);
    const automated = automatedRow ? { replies: num(automatedRow.replies), conversationsHandled: num(automatedRow.convs) } : null;

    const topContacts = topContactRows.map((r) => {
      const c = contactById.get(r.contactId);
      const total = num(r.total);
      const inbound = num(r.inbound);
      return {
        id: r.contactId,
        name: c?.name ?? null,
        phone: c?.phone ?? "",
        stage: c?.stage ?? null,
        total,
        inbound,
        outbound: total - inbound,
        lastAt: r.lastAt,
      };
    });

    const broadcasts = broadcastList.map((b) => ({
      id: b.id, name: b.name, status: b.status, createdAt: b.createdAt, startedAt: b.startedAt,
      template: b.template?.name ?? null,
      totalCount: b.totalCount, sentCount: b.sentCount, deliveredCount: b.deliveredCount,
      readCount: b.readCount, failedCount: b.failedCount, repliedCount: b.repliedCount,
      deliveryRate: rate(b.deliveredCount, b.sentCount),
      readRate: rate(b.readCount, b.deliveredCount),
    }));

    const ck = cur.kpis;
    const pk = prev.kpis;
    const trends = Object.fromEntries(
      (Object.keys(ck) as (keyof typeof ck)[]).map((k) => [k, trend(ck[k], pk[k])]),
    ) as Record<keyof typeof ck, number | null>;

    return NextResponse.json({
      range: {
        preset, from: fromDay, to: toDay, days, timezone: tz,
        previous: { from: prevFrom, to: addDays(fromDay, -1) },
      },
      kpis: ck,
      previous: pk,
      trends,
      firstResponse: {
        sampled: cur.frt.sampled, answered: cur.frt.answered, capped: cur.frt.capped,
        medianSecs: cur.frt.medianSecs, avgSecs: cur.frt.avgSecs,
        within5m: cur.frt.within5m, within1h: cur.frt.within1h,
      },
      conversationsByStatus: cur.byStatus,
      daily,
      hourly,
      heatmap,
      agents,
      automated,
      topContacts,
      broadcasts,
      generatedAt: new Date().toISOString(),
    });
  } catch (e) {
    console.error("[analytics/insights]", e);
    return NextResponse.json({ error: "Failed to load analytics" }, { status: 500 });
  }
}
