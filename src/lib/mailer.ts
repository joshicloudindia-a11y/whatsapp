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

export function otpEmailHtml(name: string, otp: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:480px;margin:0 auto;background:#fff;border-radius:12px;border:1px solid #e2e8f0;padding:40px;">
      <div style="text-align:center;margin-bottom:24px;">
        <div style="display:inline-flex;align-items:center;justify-content:center;width:48px;height:48px;background:#25D366;border-radius:12px;margin-bottom:12px;">
          <span style="color:#fff;font-size:22px;">✓</span>
        </div>
        <h2 style="color:#0f172a;margin:0;font-size:20px;">Verify your email</h2>
      </div>
      <p style="color:#475569;margin:0 0 8px;">Hi ${name},</p>
      <p style="color:#475569;margin:0 0 24px;">Enter this 6-digit code to verify your ChatFlow account:</p>
      <div style="text-align:center;margin:0 0 28px;">
        <span style="display:inline-block;font-size:36px;font-weight:800;letter-spacing:10px;color:#0f172a;background:#f1f5f9;padding:16px 28px;border-radius:10px;">${otp}</span>
      </div>
      <p style="color:#94a3b8;font-size:13px;text-align:center;margin:0;">This code expires in <strong>10 minutes</strong>. If you didn't create an account, ignore this email.</p>
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
