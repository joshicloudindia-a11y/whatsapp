"use client";

import { useSyncExternalStore } from "react";

/**
 * [chat] Per-user, per-browser chat preferences kept in localStorage (no DB):
 *  - muted:   `inbox:muted:<conversationId>` = "1"         → isConversationMuted() for any in-app sound/badge
 *  - cleared: `inbox:cleared:<userId>:<conversationId>` = ISO time → "Clear chat" hides older messages for me
 */
const EVENT = "inbox-prefs-change";
const mutedKey = (conversationId: string) => `inbox:muted:${conversationId}`;
const clearedKey = (userId: string, conversationId: string) => `inbox:cleared:${userId}:${conversationId}`;

function read(key: string): string | null {
  try { return window.localStorage.getItem(key); } catch { return null; }
}
function write(key: string, value: string | null) {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch { /* storage disabled */ }
  window.dispatchEvent(new Event(EVENT));
}
function subscribe(cb: () => void) {
  window.addEventListener(EVENT, cb);
  window.addEventListener("storage", cb);
  return () => { window.removeEventListener(EVENT, cb); window.removeEventListener("storage", cb); };
}

export function isConversationMuted(conversationId: string) {
  return typeof window !== "undefined" && read(mutedKey(conversationId)) === "1";
}
export const setConversationMuted = (conversationId: string, muted: boolean) => write(mutedKey(conversationId), muted ? "1" : null);
export function useConversationMuted(conversationId: string) {
  return useSyncExternalStore(subscribe, () => read(mutedKey(conversationId)) === "1", () => false);
}

export const setChatCleared = (userId: string, conversationId: string, at: Date | null) =>
  write(clearedKey(userId, conversationId), at ? at.toISOString() : null);
/** ISO timestamp before which messages are hidden for this user, or null. */
export function useChatClearedAt(userId: string | undefined, conversationId: string) {
  return useSyncExternalStore(subscribe, () => (userId ? read(clearedKey(userId, conversationId)) : null), () => null);
}

/** Recently used emojis (picker "Recent" row). */
const RECENT_KEY = "inbox:recent-emoji";
export function pushRecentEmoji(e: string) {
  const list = [e, ...(read(RECENT_KEY) ?? "").split(" ").filter((x) => x && x !== e)].slice(0, 16);
  write(RECENT_KEY, list.join(" "));
}
export function useRecentEmoji() {
  const raw = useSyncExternalStore(subscribe, () => read(RECENT_KEY) ?? "", () => "");
  return raw ? raw.split(" ") : [];
}
