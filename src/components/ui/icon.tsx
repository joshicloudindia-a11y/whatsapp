import type { CSSProperties } from "react";

/**
 * Google Material Symbols (Rounded) — the only icon set used in the app.
 * Glyphs are loaded as a subset font in app/layout.tsx; every name used here
 * MUST be listed in MATERIAL_ICON_NAMES below, otherwise it renders as text.
 */
export const MATERIAL_ICON_NAMES = [
  "add", "admin_panel_settings", "alt_route", "apartment", "arrow_back", "arrow_forward", "block", "bolt", "campaign", "cancel", "casino", "celebration", "chat", "check", "check_circle", "chevron_left", "chevron_right", "close", "code", "contacts", "content_copy", "credit_card", "dashboard", "delete", "description", "done_all", "edit", "emoji_events", "error", "expand_less", "expand_more", "flag", "folder_open", "forum", "group", "help", "history", "home", "hourglass_top", "http", "inbox", "info", "key", "label", "language", "lock", "lock_open", "login", "logout", "mail", "mark_email_read", "menu", "monitoring", "more_horiz", "move_to_inbox", "outbox", "person", "person_add", "person_remove", "power_settings_new", "radio_button_unchecked", "refresh", "remove", "rocket_launch", "schedule", "search", "sell", "settings", "shield", "shield_person", "smart_toy", "smartphone", "star", "support_agent", "task_alt", "timer", "trending_down", "trending_up", "tune", "visibility", "visibility_off", "warning", "wifi", "workspace_premium",
] as const;

export type IconName = (typeof MATERIAL_ICON_NAMES)[number];

export const MATERIAL_SYMBOLS_HREF =
  "https://fonts.googleapis.com/css2?family=Material+Symbols+Rounded:opsz,wght,FILL,GRAD@20..48,300..600,0..1,0" +
  `&icon_names=${[...MATERIAL_ICON_NAMES].sort().join(",")}&display=block`;

/** Derives glyph size from a Tailwind `w-*` class so existing sizing keeps working. */
function fontSizeFrom(className?: string): string | undefined {
  const m = className?.match(/(?:^|\s)w-(?:\[(\d+(?:\.\d+)?)px\]|(\d+(?:\.\d+)?))(?=\s|$)/);
  if (!m) return undefined;
  const px = m[1] ? Number(m[1]) : Number(m[2]) * 4;
  return `${Math.round(px * 1.25)}px`;
}

export function Icon({
  name, className, style, filled = false, title,
}: { name: IconName | string; className?: string; style?: CSSProperties; filled?: boolean; title?: string }) {
  return (
    <span
      aria-hidden={title ? undefined : true}
      role={title ? "img" : undefined}
      aria-label={title}
      className={`material-symbols-rounded mi ${className ?? ""}`}
      style={{
        fontSize: fontSizeFrom(className),
        fontVariationSettings: `'FILL' ${filled ? 1 : 0}, 'wght' 450, 'opsz' 24`,
        ...style,
      }}
    >
      {name}
    </span>
  );
}
