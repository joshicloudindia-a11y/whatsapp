import { NextRequest, NextResponse } from "next/server";
import { requireOrgMember } from "@/lib/org-auth";
import { uploadTemplateSampleMedia } from "@/lib/whatsapp";
import { MEDIA_RULES, SAMPLE_UPLOAD_MAX_BYTES, SAMPLE_UPLOAD_MAX_LABEL, isMediaFormat, mimeFromName, sampleFileProblem } from "@/components/templates/template-utils";
import { activeAccounts, canManage, forbidden } from "../_lib";

export const maxDuration = 60;

/**
 * POST multipart { file, format: IMAGE|VIDEO|DOCUMENT, accountId? } — uploads a template header
 * sample to Meta (Resumable Upload API) and returns { handle, fileName, format }.
 * Files are capped at SAMPLE_UPLOAD_MAX_BYTES because Vercel rejects request bodies over 4.5 MB.
 */
export async function POST(req: NextRequest) {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  if (!canManage(member.role)) return forbidden();

  const tooLarge = () => NextResponse.json({ error: `Sample files can be at most ${SAMPLE_UPLOAD_MAX_LABEL}. Use a smaller sample.` }, { status: 413 });
  const declared = Number(req.headers.get("content-length") ?? 0);
  if (declared > SAMPLE_UPLOAD_MAX_BYTES + 64 * 1024) return tooLarge();

  const form = await req.formData().catch(() => null);
  if (!form) return NextResponse.json({ error: "Send the file as multipart form data" }, { status: 400 });
  const file = form.get("file");
  const format = String(form.get("format") ?? "").toUpperCase();
  if (!isMediaFormat(format)) return NextResponse.json({ error: "Choose Image, Video or Document" }, { status: 400 });
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload" }, { status: 400 });
  if (file.size > SAMPLE_UPLOAD_MAX_BYTES) return tooLarge();

  const fileName = (file.name || `sample.${MEDIA_RULES[format].mimes[0].split("/")[1]}`).replace(/[^\w.\- ]+/g, "_").slice(-120);
  const mimeType = MEDIA_RULES[format].mimes.includes(file.type) ? file.type : mimeFromName(fileName);
  const problem = sampleFileProblem(format, { type: mimeType, size: file.size, name: fileName });
  if (problem) return NextResponse.json({ error: problem }, { status: 400 });

  const accounts = await activeAccounts(member.organizationId);
  const accountId = form.get("accountId");
  const account = (typeof accountId === "string" && accounts.find((a) => a.id === accountId)) || accounts[0];
  if (!account) return NextResponse.json({ error: "Connect a WhatsApp number in Settings → WhatsApp before uploading samples" }, { status: 400 });

  try {
    const handle = await uploadTemplateSampleMedia(account.accessToken, { bytes: await file.arrayBuffer(), fileName, mimeType });
    return NextResponse.json({ handle, fileName, format });
  } catch (e) {
    const msg = String((e as Error)?.message ?? "Upload failed").slice(0, 300);
    return NextResponse.json({ error: `Meta couldn't take the sample: ${msg}` }, { status: 502 });
  }
}
