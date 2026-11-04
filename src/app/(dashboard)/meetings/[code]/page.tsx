import type { Metadata } from "next";
import { MeetingRoom } from "@/components/meetings/meeting-room";

/**
 * Agent view of a ChatFlow video meeting (inside the dashboard; session auth).
 * Lives at /meetings/<code> because /meet/<code> is the public guest page (route groups can't share a path).
 */

export const metadata: Metadata = { title: "Video meeting · ChatFlow" };

export default async function AgentMeetingPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  return <MeetingRoom code={code} variant="agent" exitHref="/inbox" />;
}
