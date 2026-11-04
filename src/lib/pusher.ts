import PusherClient from "pusher-js";

/**
 * Real-time updates via Pusher are OPTIONAL.
 * Without PUSHER_* / NEXT_PUBLIC_PUSHER_* env vars, server triggers are no-ops
 * and the inbox falls back to polling (see REALTIME_ENABLED).
 */
const serverConfigured = !!(process.env.PUSHER_APP_ID && process.env.PUSHER_KEY && process.env.PUSHER_SECRET && process.env.PUSHER_CLUSTER);
export const REALTIME_ENABLED = !!process.env.NEXT_PUBLIC_PUSHER_KEY;

type Trigger = (channel: string | string[], event: string, data: unknown) => Promise<unknown>;
let _pusherServer: { trigger: Trigger } | null = null;

function getPusherServer() {
  if (!_pusherServer) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const Pusher = require("pusher");
    _pusherServer = new Pusher({
      appId: process.env.PUSHER_APP_ID!,
      key: process.env.PUSHER_KEY!,
      secret: process.env.PUSHER_SECRET!,
      cluster: process.env.PUSHER_CLUSTER!,
      useTLS: true,
    });
  }
  return _pusherServer!;
}

export const pusherServer = {
  /** Never throws: real-time is best-effort and must not break message handling. */
  trigger: async (channel: string | string[], event: string, data: unknown) => {
    if (!serverConfigured) return;
    try {
      await getPusherServer().trigger(channel, event, data);
    } catch (err) {
      console.error("[pusher] trigger failed", event, err);
    }
  },
};

type Channel = { bind: (event: string, cb: (data: unknown) => void) => void };
const noopChannel: Channel = { bind: () => {} };
const noopClient = { subscribe: (): Channel => noopChannel, unsubscribe: () => {} };

export const pusherClient: { subscribe: (name: string) => Channel; unsubscribe: (name: string) => void } =
  typeof window !== "undefined" && REALTIME_ENABLED
    ? new PusherClient(process.env.NEXT_PUBLIC_PUSHER_KEY!, { cluster: process.env.NEXT_PUBLIC_PUSHER_CLUSTER ?? "ap2" })
    : noopClient;

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
