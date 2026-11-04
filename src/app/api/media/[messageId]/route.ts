import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";
import { getMediaInfo } from "@/lib/whatsapp";

/** Largest file we will relay through the proxy. */
const MAX_BYTES = 25 * 1024 * 1024;
const MEDIA_TYPES = ["IMAGE", "VIDEO", "AUDIO", "DOCUMENT", "STICKER"];
// Meta media ids are numeric; be lenient but never treat a URL as an id.
const META_ID = /^[A-Za-z0-9_-]{4,128}$/;

const EXT: Record<string, string> = {
  "image/jpeg": "jpg", "image/png": "png", "image/webp": "webp", "video/mp4": "mp4", "video/3gpp": "3gp",
  "audio/ogg": "ogg", "audio/mpeg": "mp3", "audio/aac": "aac", "audio/amr": "amr", "audio/mp4": "m4a",
  "application/pdf": "pdf", "text/plain": "txt", "application/msword": "doc",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "application/vnd.ms-excel": "xls", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "xlsx",
  "application/vnd.ms-powerpoint": "ppt", "application/vnd.openxmlformats-officedocument.presentationml.presentation": "pptx",
};

const fail = (status: number, error: string) => NextResponse.json({ error }, { status, headers: { "Cache-Control": "no-store" } });

/** Only plain media types render inline; everything else (incl. SVG/HTML) is forced to download. */
function isInlineSafe(mime: string) {
  return /^(image\/(jpeg|png|webp|gif)|video\/|audio\/)/.test(mime);
}

function safeFilename(name: string) {
  return name.replace(/[\r\n"\\/]/g, "_").slice(0, 150) || "file";
}

export async function GET(req: NextRequest, { params }: { params: Promise<{ messageId: string }> }) {
  const auth = await requireOrgMember();
  if ("response" in auth) return auth.response;
  const { member } = auth;
  const { messageId } = await params;

  const message = await prisma.message.findFirst({
    where: { id: messageId, organizationId: member.organizationId, conversation: { organizationId: member.organizationId } },
    select: {
      type: true, mediaUrl: true, mediaType: true, content: true,
      conversation: { select: { whatsappAccount: { select: { accessToken: true, phoneNumberId: true } } } },
    },
  });
  if (!message || !MEDIA_TYPES.includes(message.type)) return fail(404, "Media not found");
  const ref = message.mediaUrl?.trim();
  if (!ref) return fail(404, "This message has no media attached");

  // Outbound sends made with a public link: just point the browser at it.
  if (/^https:\/\//i.test(ref)) return NextResponse.redirect(ref, 302);
  if (!META_ID.test(ref)) return fail(404, "Media not found");

  const { accessToken, phoneNumberId } = message.conversation.whatsappAccount;
  const lookup = await getMediaInfo(ref, accessToken, phoneNumberId);
  if (!lookup.ok) {
    const code = (lookup.error as { error?: { code?: number } })?.error?.code;
    if (lookup.status === 401 || code === 190) return fail(502, "The WhatsApp access token is invalid or expired. Reconnect the number in Settings.");
    // Meta keeps media for a limited time (about 30 days); after that the id stops resolving.
    if (lookup.status === 404 || lookup.status === 400 || code === 100) {
      return fail(410, "This media has expired on WhatsApp and can no longer be downloaded.");
    }
    return fail(502, "Could not load this media from WhatsApp. Try again shortly.");
  }
  const { info } = lookup;
  if (info.file_size && info.file_size > MAX_BYTES) return fail(413, "This file is too large to preview here (over 25 MB).");

  // Forward byte-range requests (Safari needs them to play video/audio).
  const range = req.headers.get("range");
  const upstreamHeaders: Record<string, string> = { Authorization: `Bearer ${accessToken}`, "User-Agent": "WhatsAppInboxMediaProxy/1.0" };
  if (range && /^bytes=\d*-\d*$/.test(range)) upstreamHeaders.Range = range;

  let upstream: Response;
  try {
    upstream = await fetch(info.url, { headers: upstreamHeaders, cache: "no-store" });
  } catch {
    return fail(502, "Could not reach WhatsApp to download this media.");
  }
  if (upstream.status === 404 || upstream.status === 410) return fail(410, "This media has expired on WhatsApp and can no longer be downloaded.");
  if (!upstream.ok || !upstream.body) return fail(502, "WhatsApp did not return the media file.");

  const length = Number(upstream.headers.get("content-length") ?? 0);
  if (length > MAX_BYTES) return fail(413, "This file is too large to preview here (over 25 MB).");

  const mime = (info.mime_type || upstream.headers.get("content-type") || "application/octet-stream").split(";")[0].trim().toLowerCase();
  const forceDownload = req.nextUrl.searchParams.get("download") === "1";
  const inline = !forceDownload && message.type !== "DOCUMENT" && isInlineSafe(mime);
  const ext = EXT[mime] ?? mime.split("/")[1]?.replace(/[^a-z0-9]/g, "").slice(0, 5) ?? "bin";
  const baseName = message.type === "DOCUMENT" && message.content ? message.content : `${message.type.toLowerCase()}-${messageId}`;
  const filename = safeFilename(/\.[a-z0-9]{1,5}$/i.test(baseName) ? baseName : `${baseName}.${ext}`);

  // Enforce the cap while streaming too (Content-Length may be missing).
  let seen = 0;
  const cap = new TransformStream<Uint8Array, Uint8Array>({
    transform(chunk, controller) {
      seen += chunk.byteLength;
      if (seen > MAX_BYTES) controller.error(new Error("Media exceeds size limit"));
      else controller.enqueue(chunk);
    },
  });

  const headers = new Headers({
    "Content-Type": mime,
    // ASCII fallback + RFC 5987 form so non-Latin filenames survive.
    "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="${filename.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
    "Cache-Control": "private, max-age=3600",
    "X-Content-Type-Options": "nosniff",
    "Content-Security-Policy": "sandbox",
  });
  if (length) headers.set("Content-Length", String(length));
  const partial = upstream.status === 206 && upstream.headers.get("content-range");
  if (partial) headers.set("Content-Range", partial);
  if (upstream.headers.get("accept-ranges") === "bytes") headers.set("Accept-Ranges", "bytes");

  return new Response(upstream.body.pipeThrough(cap), { status: partial ? 206 : 200, headers });
}
