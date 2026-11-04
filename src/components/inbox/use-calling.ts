"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import { REALTIME_ENABLED } from "@/lib/pusher";
import type { PendingCall } from "./call-store";

export interface CallingStatusResponse {
  calling: {
    enabled: boolean;
    reason: string | null;
    code: number | string | null;
    businessInitiatedAllowed: boolean;
    userInitiatedAllowed: boolean;
    docsUrl: string;
  };
  permission: {
    status: "no_permission" | "temporary" | "permanent" | "unknown";
    expirationTime: number | null;
    canStartCall: boolean | null;
    canRequestPermission: boolean | null;
    error?: string;
  } | null;
  windowOpen: boolean;
  blockedReason: string | null;
  canCall: boolean;
  canRequestPermission: boolean;
  phone: string;
  whatsappAccountId?: string;
  canManageCalling?: boolean;
}

/** Calling eligibility + customer permission for a conversation (fetched when `enabled`). */
export function useCallingStatus(conversationId: string, enabled: boolean) {
  return useQuery({
    queryKey: ["call-status", conversationId],
    queryFn: () => axios.get("/api/calls/status", { params: { conversationId } }).then((r) => r.data as CallingStatusResponse),
    enabled,
    staleTime: 60_000,
    retry: false,
  });
}

/** Ringing incoming calls. Polls every 2 s without Pusher (8 s with it, as a safety net). */
export function usePendingCalls(enabled = true) {
  return useQuery({
    queryKey: ["calls-pending"],
    queryFn: () => axios.get("/api/calls/pending").then((r) => r.data.calls as PendingCall[]),
    enabled,
    refetchInterval: REALTIME_ENABLED ? 8_000 : 2_000,
    refetchIntervalInBackground: true,
    staleTime: 0,
    retry: false,
  });
}

const VIDEO_BASE_KEY = "chatflow.videoMeetBase";
export const DEFAULT_VIDEO_BASE = process.env.NEXT_PUBLIC_VIDEO_MEET_BASE || "https://meet.jit.si/";

export function getVideoBase(): string {
  if (typeof window === "undefined") return DEFAULT_VIDEO_BASE;
  try {
    return window.localStorage.getItem(VIDEO_BASE_KEY) || DEFAULT_VIDEO_BASE;
  } catch {
    return DEFAULT_VIDEO_BASE;
  }
}

/** Saves a custom meeting base URL for this browser (empty resets to the default). Returns an error message or null. */
export function setVideoBase(v: string): string | null {
  const t = v.trim();
  try {
    if (!t) {
      window.localStorage.removeItem(VIDEO_BASE_KEY);
      return null;
    }
    const u = new URL(t);
    if (u.protocol !== "https:") return "The link must start with https://";
    window.localStorage.setItem(VIDEO_BASE_KEY, u.toString());
    return null;
  } catch {
    return "Enter a valid https:// link";
  }
}

/**
 * Meeting link for a new call. Jitsi-style bases (ending in "/") get a unique room appended: https://meet.jit.si/ChatFlow-<random>.
 * A base with a path (e.g. a personal Zoom / Meet link) is used as is.
 */
export function newMeetingUrl(base = getVideoBase()): string {
  const rand = Array.from(crypto.getRandomValues(new Uint8Array(9)), (b) => "abcdefghijkmnpqrstuvwxyz23456789"[b % 32]).join("");
  return base.endsWith("/") ? `${base}ChatFlow-${rand}` : base;
}
