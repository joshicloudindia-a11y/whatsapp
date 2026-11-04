// Human-readable labels for audit actions. Client-safe.

const LABELS: Record<string, string> = {
  "admin.login.success": "Signed in to admin panel",
  "admin.login.failed": "Failed admin sign-in",
  "admin.login.blocked": "Blocked admin sign-in",
  "admin.otp.sent": "Verification code sent",
  "admin.otp.failed": "Wrong verification code",
  "admin.logout.all": "Signed out of all devices",
  "access.denied": "Permission denied",
  "user.create": "Created user",
  "user.update": "Updated user",
  "user.delete": "Deleted user",
  "org.create": "Created organization",
  "org.update": "Updated organization",
  "org.delete": "Deleted organization",
  "plan.create": "Created plan",
  "plan.update": "Updated plan",
  "plan.delete": "Deleted plan",
  "whatsapp.create": "Connected WhatsApp number",
  "whatsapp.update": "Updated WhatsApp number",
  "whatsapp.delete": "Removed WhatsApp number",
  "role.create": "Created role",
  "role.update": "Updated role permissions",
  "role.delete": "Deleted role",
  "audit.export": "Exported audit logs",
};

const DANGER = new Set([
  "admin.login.failed", "admin.login.blocked", "admin.otp.failed", "access.denied",
  "user.delete", "org.delete", "plan.delete", "whatsapp.delete", "role.delete",
]);

export function formatAction(action: string) {
  return { label: LABELS[action] ?? action, danger: DANGER.has(action) };
}
