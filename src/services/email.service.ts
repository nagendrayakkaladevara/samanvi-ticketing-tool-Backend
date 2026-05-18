import nodemailer from "nodemailer";
import { env, isSmtpConfigured } from "../config/env";
import { logger } from "../config/logger";

export type TicketNotificationEmailPayload = {
  to: string;
  subject: string;
  text: string;
  html: string;
};

let transporter: nodemailer.Transporter | null = null;

function getTransporter(): nodemailer.Transporter | null {
  if (!isSmtpConfigured()) {
    return null;
  }

  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: env.smtpHost,
      port: env.smtpPort,
      secure: env.smtpSecure,
      auth:
        env.smtpUser && env.smtpPass
          ? {
              user: env.smtpUser,
              pass: env.smtpPass,
            }
          : undefined,
    });
  }

  return transporter;
}

export async function sendTicketNotificationEmail(
  payload: TicketNotificationEmailPayload,
): Promise<void> {
  const mailer = getTransporter();
  if (!mailer || !env.emailFrom) {
    logger.debug("SMTP not configured; skipping notification email");
    return;
  }

  await mailer.sendMail({
    from: env.emailFrom,
    to: payload.to,
    subject: payload.subject,
    text: payload.text,
    html: payload.html,
  });
}

export function dispatchTicketNotificationEmail(
  payload: TicketNotificationEmailPayload,
): void {
  void sendTicketNotificationEmail(payload).catch((error) => {
    logger.warn(
      { err: error, to: payload.to },
      "Failed to send ticket notification email",
    );
  });
}
