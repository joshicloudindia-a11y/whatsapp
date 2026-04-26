import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { submitTemplate } from "@/lib/whatsapp";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const status = searchParams.get("status");
  const category = searchParams.get("category");

  const where: any = { organizationId: session.user.organizationId };
  if (status) where.status = status;
  if (category) where.category = category;

  const templates = await prisma.messageTemplate.findMany({
    where,
    orderBy: { createdAt: "desc" },
  });

  return NextResponse.json({ templates });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { name, category, language, headerType, headerContent, body: templateBody, footer, buttons, submit } = body;

  const org = await prisma.organization.findUnique({
    where: { id: session.user.organizationId },
    include: { whatsappAccounts: { where: { isActive: true }, take: 1 } },
  });

  const template = await prisma.messageTemplate.create({
    data: {
      organizationId: session.user.organizationId,
      name,
      category,
      language: language ?? "en",
      status: "DRAFT",
      headerType,
      headerContent,
      body: templateBody,
      footer,
      buttons,
    },
  });

  // Submit to Meta if requested
  if (submit && org?.whatsappAccounts[0]) {
    try {
      const waAccount = org.whatsappAccounts[0];
      const components: object[] = [];

      if (headerType && headerContent) {
        components.push({ type: "HEADER", format: headerType.toUpperCase(), text: headerContent });
      }
      components.push({ type: "BODY", text: templateBody });
      if (footer) components.push({ type: "FOOTER", text: footer });
      if (buttons?.length) components.push({ type: "BUTTONS", buttons });

      const result = await submitTemplate(waAccount.wabaId, waAccount.accessToken, {
        name,
        category: category.toUpperCase(),
        language,
        components,
      });

      await prisma.messageTemplate.update({
        where: { id: template.id },
        data: {
          status: "PENDING",
          metaTemplateId: result.id,
          submittedAt: new Date(),
        },
      });
    } catch (error: any) {
      await prisma.messageTemplate.update({
        where: { id: template.id },
        data: { status: "REJECTED", rejectionReason: error.message },
      });
    }
  }

  return NextResponse.json({ template }, { status: 201 });
}
