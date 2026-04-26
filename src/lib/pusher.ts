import PusherClient from "pusher-js";

// Server-side Pusher (lazy to avoid build-time errors)
let _pusherServer: any = null;

export function getPusherServer() {
  if (!_pusherServer) {
    const Pusher = require("pusher");
    _pusherServer = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return _pusherServer;
}

export const pusherServer = {
  trigger: (...args: Parameters<any["trigger"]>) => getPusherServer().trigger(...args),
};

export const pusherClient = typeof window !== "undefined"
  ? new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY ?? "placeholder", {
      cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap2",
    })
  : null as any;

export const PUSHER_EVENTS = {
  NEW_MESSAGE: "new-message",
  MESSAGE_STATUS_UPDATE: "message-status-update",
  CONVERSATION_UPDATED: "conversation-updated",
  CONVERSATION_ASSIGNED: "conversation-assigned",
  NEW_CONVERSATION: "new-conversation",
  CONTACT_UPDATED: "contact-updated",
  BROADCAST_PROGRESS: "broadcast-progress",
} as const;

export function orgChannel(organizationId: string) {
  return `private-org-${organizationId}`;
}

export function conversationChannel(conversationId: string) {
  return `private-conversation-${conversationId}`;
}
