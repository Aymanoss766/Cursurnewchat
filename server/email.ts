import nodemailer from "nodemailer";
import { Resend } from "resend";
import { log } from "./index";

let transporter: nodemailer.Transporter | null = null;
let resendClient: Resend | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (transporter) return transporter;

  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;

  if (!host || !user || !pass) {
    return null;
  }

  transporter = nodemailer.createTransport({
    host,
    port: parseInt(process.env.SMTP_PORT || "587"),
    secure: process.env.SMTP_PORT === "465",
    auth: { user, pass },
  });

  return transporter;
}

function getResend(): Resend | null {
  if (resendClient) return resendClient;
  const key = process.env.RESEND_API_KEY;
  if (!key) return null;
  resendClient = new Resend(key);
  return resendClient;
}

export function generateVerificationCode(): string {
  return Math.floor(100000 + Math.random() * 900000).toString();
}

export type SendVerificationResult = { sent: boolean; devCode?: string };

const VERIFICATION_HTML = (code: string) => `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 32px; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); border-radius: 16px;">
    <div style="background: white; border-radius: 12px; padding: 32px; text-align: center;">
      <h1 style="color: #1a1a2e; margin: 0 0 8px; font-size: 24px;">Messenger AI Bot</h1>
      <p style="color: #666; margin: 0 0 24px; font-size: 14px;">Email Verification</p>
      <div style="background: #f8f9ff; border: 2px dashed #667eea; border-radius: 12px; padding: 24px; margin: 0 0 24px;">
        <p style="color: #888; margin: 0 0 8px; font-size: 12px; text-transform: uppercase; letter-spacing: 2px;">Your Code</p>
        <p style="color: #1a1a2e; font-size: 36px; font-weight: bold; letter-spacing: 8px; margin: 0; font-family: monospace;">${code}</p>
      </div>
      <p style="color: #888; font-size: 13px; margin: 0;">This code expires in <strong>10 minutes</strong>.</p>
    </div>
  </div>
`;

export async function sendVerificationEmail(email: string, code: string): Promise<SendVerificationResult> {
  const fromEmail = process.env.SMTP_FROM || process.env.SMTP_USER || process.env.RESEND_FROM || "onboarding@resend.dev";

  // 1. Try Resend first (easiest: just RESEND_API_KEY)
  const resend = getResend();
  if (resend) {
    try {
      const { error } = await resend.emails.send({
        from: `Messenger AI Bot <${fromEmail}>`,
        to: [email],
        subject: "Your Verification Code",
        html: VERIFICATION_HTML(code),
      });
      if (error) {
        log(`Resend failed for ${email}: ${error.message}`, "email");
        return { sent: false };
      }
      log(`Verification email sent to ${email} (Resend)`, "email");
      return { sent: true };
    } catch (error: any) {
      log(`Failed to send email to ${email}: ${error.message}`, "email");
      return { sent: false };
    }
  }

  // 2. Try SMTP
  const transport = getTransporter();
  if (transport) {
    try {
      await transport.sendMail({
        from: `"Messenger AI Bot" <${fromEmail}>`,
        to: email,
        subject: "Your Verification Code",
        html: VERIFICATION_HTML(code),
      });
      log(`Verification email sent to ${email} (SMTP)`, "email");
      return { sent: true };
    } catch (error: any) {
      log(`Failed to send email to ${email}: ${error.message}`, "email");
      return { sent: false };
    }
  }

  // 3. No email configured - return code for dev/fallback
  log(`[DEV MODE] No Resend/SMTP configured - verification code for ${email}: ${code}`, "email");
  return { sent: false, devCode: code };
}
