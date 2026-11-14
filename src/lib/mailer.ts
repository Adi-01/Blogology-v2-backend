import nodemailer from "nodemailer";
import type { Transporter } from "nodemailer";
import { env } from "@/config/env.js";
import { logger } from "@/lib/logger.js";

let transporter: Transporter | null = null;

async function getTransporter(): Promise<Transporter> {
  if (transporter) return transporter;

  if (env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS) {
    transporter = nodemailer.createTransport({
      host: env.SMTP_HOST,
      port: env.SMTP_PORT,
      secure: env.SMTP_PORT === 465,
      auth: {
        user: env.SMTP_USER,
        pass: env.SMTP_PASS,
      },
    });
    return transporter;
  }

  // Development fallback: Ethereal test account
  try {
    const testAccount = await nodemailer.createTestAccount();
    transporter = nodemailer.createTransport({
      host: "smtp.ethereal.email",
      port: 587,
      secure: false,
      auth: {
        user: testAccount.user,
        pass: testAccount.pass,
      },
    });
    logger.info("Using Ethereal dev email transport", { user: testAccount.user });
    return transporter;
  } catch (error) {
    logger.warn("Could not create Ethereal account, falling back to JSON transport", { error });
    transporter = nodemailer.createTransport({
      jsonTransport: true,
    });
    return transporter;
  }
}

export interface SendMailOptions {
  to: string;
  subject: string;
  html: string;
  text: string;
}

export async function sendEmail(options: SendMailOptions): Promise<void> {
  const mailer = await getTransporter();

  const info = await mailer.sendMail({
    from: env.SMTP_FROM,
    to: options.to,
    subject: options.subject,
    text: options.text,
    html: options.html,
  });

  // Always log clear terminal preview in development
  if (env.NODE_ENV !== "production") {
    const previewUrl = nodemailer.getTestMessageUrl(info);
    console.log("\n============================================================");
    console.log("📧 [DEV EMAIL PREVIEW]");
    console.log(`To:      ${options.to}`);
    console.log(`Subject: ${options.subject}`);
    if (previewUrl) {
      console.log(`Preview: ${previewUrl}`);
    }
    console.log("------------------------------------------------------------");
    console.log(options.text);
    console.log("============================================================\n");
  }
}

export async function sendPasswordResetEmail(
  to: string,
  name: string,
  resetUrl: string
): Promise<void> {
  const subject = "Reset your Blogology password";
  const text = `Hi ${name},\n\nWe received a request to reset your password for your Blogology account.\n\nClick the link below to set a new password:\n${resetUrl}\n\nThis link will expire in 1 hour. If you did not request this, you can safely ignore this email.\n\n— The Blogology Team`;

  const html = `
    <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 560px; margin: 0 auto; padding: 32px 20px; color: #111;">
      <h2 style="font-size: 24px; font-weight: 700; margin-bottom: 16px; letter-spacing: -0.02em;">Blogology</h2>
      <p style="font-size: 16px; line-height: 24px; margin-bottom: 24px;">Hi ${name},</p>
      <p style="font-size: 16px; line-height: 24px; margin-bottom: 24px;">We received a request to reset your password. Click the button below to choose a new password:</p>
      <div style="margin-bottom: 32px;">
        <a href="${resetUrl}" style="background-color: #000; color: #fff; padding: 12px 24px; border-radius: 9999px; text-decoration: none; font-size: 14px; font-weight: 500; display: inline-block;">
          Reset Password
        </a>
      </div>
      <p style="font-size: 14px; line-height: 20px; color: #666; margin-bottom: 16px;">This link expires in <strong>1 hour</strong>. If you did not request this reset, you can safely ignore this email.</p>
      <hr style="border: none; border-top: 1px solid #eaeaea; margin: 24px 0;" />
      <p style="font-size: 12px; color: #999;">Or copy and paste this URL into your browser:<br /><a href="${resetUrl}" style="color: #666; word-break: break-all;">${resetUrl}</a></p>
    </div>
  `;

  await sendEmail({ to, subject, text, html });
}

