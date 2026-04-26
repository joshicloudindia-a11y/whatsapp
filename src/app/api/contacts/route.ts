import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatPhone } from "@/lib/utils";

export async function GET(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { searchParams } = req.nextUrl;
  const search = searchParams.get("search");
  const stage = searchParams.get("stage");
  const tag = searchParams.get("tag");
  const page = parseInt(searchParams.get("page") ?? "1");
  const limit = parseInt(searchParams.get("limit") ?? "50");

  const where: any = { organizationId: session.user.organizationId };

  if (search) {
    where.OR = [
      { name: { contains: search } },
      { phone: { contains: search } },
      { email: { contains: search } },
    ];
  }
  if (stage) where.stage = stage;
  if (tag) where.tags = { some: { tag } };

  const [contacts, total] = await Promise.all([
    prisma.contact.findMany({
      where,
      include: {
        tags: true,
        attributes: true,
        _count: { select: { conversations: true } },
      },
      orderBy: { createdAt: "desc" },
      skip: (page - 1) * limit,
      take: limit,
    }),
    prisma.contact.count({ where }),
  ]);

  return NextResponse.json({ contacts, total, page, limit });
}

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const body = await req.json();
  const { phone, name, email, stage, tags, attributes } = body;

  const cleanPhone = formatPhone(phone);
  if (!cleanPhone) return NextResponse.json({ error: "Invalid phone number" }, { status: 400 });

  try {
    const contact = await prisma.contact.create({
      data: {
        organizationId: session.user.organizationId,
        phone: cleanPhone,
        name,
        email,
        stage: stage ?? "LEAD",
        tags: tags?.length ? { createMany: { data: tags.map((t: string) => ({ tag: t })) } } : undefined,
        attributes: attributes?.length
          ? { createMany: { data: attributes.map((a: any) => ({ key: a.key, value: a.value })) } }
          : undefined,
      },
      include: { tags: true, attributes: true },
    });

    return NextResponse.json({ contact }, { status: 201 });
  } catch (error: any) {
    if (error.code === "P2002") {
      return NextResponse.json({ error: "Contact with this phone already exists" }, { status: 409 });
    }
    return NextResponse.json({ error: "Failed to create contact" }, { status: 500 });
  }
}
