import { NextRequest, NextResponse } from "next/server";
import { processDueBroadcasts } from "@/lib/broadcast-runner";
import { processDueReminders } from "@/lib/reminders";

export const maxDuration = 300;

/**
 * Starts scheduled broadcasts and resumes stalled ones for every organization,
 * and emails follow-up reminders that have become due.
 * Call every few minutes from an external scheduler with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const reminders = await processDueReminders().catch((e) => { console.error("[cron] reminders failed", e); return null; });
  const processed = await processDueBroadcasts();
  return NextResponse.json({ processed, reminders });
}
