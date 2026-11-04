import { NextRequest, NextResponse } from "next/server";
import { processDueBroadcasts } from "@/lib/broadcast-runner";

export const maxDuration = 300;

/**
 * Starts scheduled broadcasts and resumes stalled ones for every organization.
 * Call every few minutes from an external scheduler with `Authorization: Bearer <CRON_SECRET>`.
 */
export async function GET(req: NextRequest) {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  const processed = await processDueBroadcasts();
  return NextResponse.json({ processed });
}
