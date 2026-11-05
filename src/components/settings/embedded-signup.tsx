"use client";

import { useEffect, useRef, useState } from "react";
import axios from "axios";
import { toast } from "sonner";
import { Icon } from "@/components/ui/icon";

/* eslint-disable @typescript-eslint/no-explicit-any */
declare global {
  interface Window { FB?: any; fbAsyncInit?: () => void }
}
/* eslint-enable @typescript-eslint/no-explicit-any */

export interface EmbeddedSignupConfig { appId: string; configId: string; graphVersion: string }
export interface EmbeddedSignupResult {
  account: { displayName: string };
  webhookSubscribed: boolean;
  registered: boolean;
  registerError: string | null;
  pin: string | null;
}

let sdkPromise: Promise<void> | null = null;
function loadFacebookSdk(appId: string, version: string) {
  if (sdkPromise) return sdkPromise;
  sdkPromise = new Promise<void>((resolve, reject) => {
    window.fbAsyncInit = () => {
      window.FB.init({ appId, autoLogAppEvents: true, xfbml: false, version });
      resolve();
    };
    const s = document.createElement("script");
    s.src = "https://connect.facebook.net/en_US/sdk.js";
    s.async = true;
    s.defer = true;
    s.crossOrigin = "anonymous";
    s.onerror = () => { sdkPromise = null; reject(new Error("Could not load the Facebook SDK")); };
    document.body.appendChild(s);
  });
  return sdkPromise;
}

const err = (e: unknown) => (e as { response?: { data?: { error?: string } } })?.response?.data?.error ?? (e as Error)?.message ?? "Something went wrong";

/** Meta Embedded Signup: the customer logs in with Facebook and shares their WhatsApp Business Account. */
export function EmbeddedSignupButton({ config, onConnected }: { config: EmbeddedSignupConfig; onConnected: (r: EmbeddedSignupResult) => void }) {
  const [busy, setBusy] = useState(false);
  const session = useRef<{ wabaId?: string; phoneNumberId?: string } | null>(null);

  // Preload the SDK so FB.login opens synchronously on click (avoids popup blockers).
  useEffect(() => {
    loadFacebookSdk(config.appId, config.graphVersion).catch(() => {});
  }, [config.appId, config.graphVersion]);

  // Session info (WABA + phone number ids) arrives from Facebook via postMessage.
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      let host = "";
      try { host = new URL(event.origin).hostname; } catch { return; }
      if (host !== "facebook.com" && !host.endsWith(".facebook.com")) return;
      let data: { type?: string; event?: string; data?: Record<string, string> };
      try { data = typeof event.data === "string" ? JSON.parse(event.data) : event.data; } catch { return; }
      if (data?.type !== "WA_EMBEDDED_SIGNUP") return;
      if (data.event?.startsWith("FINISH")) {
        session.current = { wabaId: data.data?.waba_id, phoneNumberId: data.data?.phone_number_id };
      } else if (data.event === "CANCEL") {
        toast.info("WhatsApp signup was cancelled");
      } else if (data.event === "ERROR") {
        toast.error(`Facebook signup error: ${data.data?.error_message ?? "unknown error"}`);
      }
    };
    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const finish = async (code: string) => {
    // The session-info message usually lands just before the login callback; wait briefly for it.
    for (let i = 0; i < 15 && !session.current; i++) await new Promise((r) => setTimeout(r, 200));
    try {
      const r = await axios.post("/api/settings/whatsapp/embedded-signup", { code, ...session.current });
      onConnected(r.data);
    } catch (e) {
      toast.error(err(e));
    } finally {
      setBusy(false);
    }
  };

  const start = () => {
    if (!window.FB) {
      toast.info("Facebook is still loading, please try again in a moment");
      loadFacebookSdk(config.appId, config.graphVersion).catch((e) => toast.error(err(e)));
      return;
    }
    session.current = null;
    setBusy(true);
    // FB.login requires a non-async callback.
    window.FB.login(
      (response: { authResponse?: { code?: string } }) => {
        const code = response?.authResponse?.code;
        if (code) void finish(code);
        else setBusy(false);
      },
      { config_id: config.configId, response_type: "code", override_default_response_type: true, extras: { setup: {} } },
    );
  };

  return (
    <button onClick={start} disabled={busy}
      className="self-start inline-flex items-center gap-2 rounded-xl bg-[#1877F2] px-4 py-2.5 text-sm font-semibold text-white hover:bg-[#166fe0] disabled:opacity-60">
      {busy ? <span className="w-4 h-4 rounded-full border-2 border-white border-t-transparent animate-spin" /> : <Icon name="link" className="w-4 h-4" />}
      {busy ? "Connecting…" : "Connect with Facebook"}
    </button>
  );
}
