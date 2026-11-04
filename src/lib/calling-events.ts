/** Realtime event names for calls on the org channel (shared by server and browser; no server imports here). */
export const CALL_EVENTS = {
  /** { messageId, conversationId, contact } – a customer is calling (user-initiated). */
  INCOMING: "incoming-call",
  /** { messageId, conversationId, call } – any call state change. */
  UPDATED: "call-updated",
} as const;
