import type { Metadata, Viewport } from "next";
import { MeetingRoom } from "@/components/meetings/meeting-room";

/** Public guest page for a ChatFlow video meeting: /meet/<code>?t=<guestToken> (no login). */

export const metadata: Metadata = {
  title: "Video call",
  robots: { index: false, follow: false },
  referrer: "no-referrer",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#020617",
};

export default async function GuestMeetingPage({
  params,
  searchParams,
}: {
  params: Promise<{ code: string }>;
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { code } = await params;
  const { t } = await searchParams;
  const token = typeof t === "string" ? t : null;
  return <MeetingRoom code={code} token={token} variant="guest" />;
}
