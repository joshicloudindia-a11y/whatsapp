import nodemailer from "nodemailer";

const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST,
  port: Number(process.env.SMTP_PORT),
  secure: false,
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
});

interface MailOptions {
  to: string;
  subject: string;
  html: string;
}

export async function sendMail({ to, subject, html }: MailOptions) {
  return transporter.sendMail({
    from: process.env.SMTP_FROM,
    to,
    subject,
    html,
  });
}

export function verificationEmailHtml(name: string, link: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#25D366;">Verify your email</h2>
      <p>Hi ${name},</p>
      <p>Click the button below to verify your email address and activate your ChatFlow account.</p>
      <a href="${link}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Verify Email</a>
      <p style="color:#888;font-size:12px;margin-top:24px;">This link expires in 24 hours. If you didn't create an account, ignore this email.</p>
    </div>
  `;
}

export function passwordResetEmailHtml(name: string, link: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#25D366;">Reset your password</h2>
      <p>Hi ${name},</p>
      <p>Click the button below to reset your password.</p>
      <a href="${link}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Reset Password</a>
      <p style="color:#888;font-size:12px;margin-top:24px;">This link expires in 1 hour. If you didn't request a password reset, ignore this email.</p>
    </div>
  `;
}

export function invitationEmailHtml(orgName: string, inviterName: string, link: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
      <h2 style="color:#25D366;">You're invited to join ${orgName}</h2>
      <p>${inviterName} has invited you to join their ChatFlow workspace.</p>
      <a href="${link}" style="display:inline-block;background:#25D366;color:#fff;padding:12px 24px;border-radius:6px;text-decoration:none;font-weight:bold;">Accept Invitation</a>
      <p style="color:#888;font-size:12px;margin-top:24px;">This invitation expires in 7 days.</p>
    </div>
  `;
}
