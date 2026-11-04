import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { requireOrgMember } from "@/lib/org-auth";

export type StepState = "done" | "in_progress" | "todo" | "locked";

export interface OnboardingStep {
  key: "whatsapp" | "contacts" | "template" | "broadcast" | "chatbot";
  title: string;
  description: string;
  state: StepState;
  /** Short live status, e.g. "12 contacts" or "2 awaiting Meta approval". */
  status: string;
  cta: { label: string; href: string } | null;
}

const plural = (n: number, word: string) => `${n.toLocaleString("en-IN")} ${word}${n === 1 ? "" : "s"}`;

/** Live onboarding progress for the caller's organization, computed from real data. */
export async function GET() {
  const { member, response } = await requireOrgMember();
  if (!member) return response;
  const organizationId = member.organizationId;
  const isAdmin = member.role === "ADMIN";

  const [
    activeNumbers, totalNumbers, contacts, approvedTemplates, pendingTemplates, rejectedTemplates,
    sentBroadcasts, draftBroadcasts, activeBots, totalBots,
  ] = await Promise.all([
    prisma.whatsappAccount.count({ where: { organizationId, isActive: true } }),
    prisma.whatsappAccount.count({ where: { organizationId } }),
    prisma.contact.count({ where: { organizationId } }),
    prisma.messageTemplate.count({ where: { organizationId, status: "APPROVED" } }),
    prisma.messageTemplate.count({ where: { organizationId, status: "PENDING" } }),
    prisma.messageTemplate.count({ where: { organizationId, status: "REJECTED" } }),
    prisma.broadcast.count({ where: { organizationId, sentCount: { gt: 0 } } }),
    prisma.broadcast.count({ where: { organizationId, sentCount: 0 } }),
    prisma.chatbot.count({ where: { organizationId, isActive: true } }),
    prisma.chatbot.count({ where: { organizationId } }),
  ]);

  const steps: OnboardingStep[] = [
    activeNumbers > 0
      ? { key: "whatsapp", title: "Connect a WhatsApp number", description: "Your business number is live on ChatFlow.", state: "done", status: `${plural(activeNumbers, "number")} connected`, cta: { label: "Manage", href: "/settings?tab=whatsapp" } }
      : totalNumbers > 0
        ? { key: "whatsapp", title: "Connect a WhatsApp number", description: "Your number is connected but switched off.", state: "in_progress", status: "Number disabled", cta: isAdmin ? { label: "Turn on", href: "/settings?tab=whatsapp" } : null }
        : { key: "whatsapp", title: "Connect a WhatsApp number", description: "Link your Meta WhatsApp Business number to start sending and receiving messages.", state: isAdmin ? "todo" : "locked", status: isAdmin ? "Not connected" : "Ask your admin to connect", cta: isAdmin ? { label: "Connect number", href: "/settings?tab=whatsapp" } : null },

    contacts > 0
      ? { key: "contacts", title: "Add your contacts", description: "Your audience is ready for conversations and broadcasts.", state: "done", status: plural(contacts, "contact"), cta: { label: "View", href: "/contacts" } }
      : { key: "contacts", title: "Add your contacts", description: "Import a CSV or add customers one by one.", state: "todo", status: "No contacts yet", cta: { label: "Add contacts", href: "/contacts" } },

    approvedTemplates > 0
      ? { key: "template", title: "Get a template approved", description: "Approved templates let you message customers any time.", state: "done", status: `${plural(approvedTemplates, "template")} approved`, cta: { label: "View", href: "/templates" } }
      : pendingTemplates > 0
        ? { key: "template", title: "Get a template approved", description: "Meta usually reviews templates within a few minutes to 24 hours.", state: "in_progress", status: `${pendingTemplates} awaiting Meta approval`, cta: { label: "Check status", href: "/templates" } }
        : rejectedTemplates > 0
          ? { key: "template", title: "Get a template approved", description: "A template was rejected. Edit it and submit again.", state: "in_progress", status: `${plural(rejectedTemplates, "template")} rejected`, cta: { label: "Fix template", href: "/templates" } }
          : { key: "template", title: "Get a template approved", description: "Templates are required to start conversations and send broadcasts.", state: "todo", status: "No templates yet", cta: { label: "Create template", href: "/templates" } },

    sentBroadcasts > 0
      ? { key: "broadcast", title: "Send your first broadcast", description: "You're reaching customers at scale.", state: "done", status: `${plural(sentBroadcasts, "broadcast")} sent`, cta: { label: "View", href: "/broadcasts" } }
      : draftBroadcasts > 0
        ? { key: "broadcast", title: "Send your first broadcast", description: "You have a broadcast ready. Review and send it.", state: "in_progress", status: `${plural(draftBroadcasts, "draft")} not sent`, cta: { label: "Send now", href: "/broadcasts" } }
        : { key: "broadcast", title: "Send your first broadcast", description: approvedTemplates > 0 ? "Pick an approved template and an audience." : "Needs an approved template first.", state: "todo", status: "Nothing sent yet", cta: { label: "New broadcast", href: "/broadcasts" } },

    activeBots > 0
      ? { key: "chatbot", title: "Launch a chatbot", description: "Your bot is answering customers 24/7.", state: "done", status: `${plural(activeBots, "bot")} live`, cta: { label: "View", href: "/chatbots" } }
      : totalBots > 0
        ? { key: "chatbot", title: "Launch a chatbot", description: "Your bot is built but not switched on yet.", state: "in_progress", status: `${plural(totalBots, "bot")} inactive`, cta: { label: "Turn on", href: "/chatbots" } }
        : { key: "chatbot", title: "Launch a chatbot", description: "Automate FAQs, order status and lead capture.", state: "todo", status: "No chatbot yet", cta: { label: "Build chatbot", href: "/chatbots" } },
  ];

  const completed = steps.filter((s) => s.state === "done").length;
  const next = steps.find((s) => s.state === "in_progress") ?? steps.find((s) => s.state === "todo") ?? null;

  return NextResponse.json({
    organizationId,
    steps,
    completed,
    total: steps.length,
    percent: Math.round((completed / steps.length) * 100),
    nextKey: next?.key ?? null,
  });
}
