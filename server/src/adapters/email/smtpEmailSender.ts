import nodemailer from "nodemailer";
import type { EmailSender, OutgoingEmail } from "../../ports/EmailSender.js";

export interface SmtpConfig {
  host: string;
  port: number;
  /** True for implicit TLS on 465; false for STARTTLS on 587. */
  secure: boolean;
  user: string;
  pass: string;
  from: string;
  replyTo?: string;
}

const CONNECTION_TIMEOUT_MS = 10_000;
const SOCKET_TIMEOUT_MS = 15_000;

/**
 * SMTP delivery, which every provider speaks.
 *
 * Choosing SMTP over a vendor HTTP API is the portability decision: changing
 * provider becomes a change of four environment variables rather than a new
 * adapter.
 */
export const createSmtpEmailSender = (config: SmtpConfig): EmailSender => {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    // Sign-in codes arrive in bursts; a pool avoids a TLS handshake per code.
    pool: true,
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });

  return {
    send: async (mail: OutgoingEmail): Promise<{ messageId: string }> => {
      const info = await transport.sendMail({
        from: config.from,
        // Replies go somewhere a human reads, not to the no-reply sender.
        ...(config.replyTo ? { replyTo: config.replyTo } : {}),
        to: mail.to,
        subject: mail.subject,
        text: mail.text,
        ...(mail.html ? { html: mail.html } : {}),
      });

      return { messageId: info.messageId };
    },
  };
};

/**
 * Proves the credentials and TLS mode work, at boot.
 *
 * Without this, a wrong password surfaces as riders silently never receiving
 * a code — the worst possible place to discover it.
 */
export const verifySmtpTransport = async (config: SmtpConfig): Promise<void> => {
  const transport = nodemailer.createTransport({
    host: config.host,
    port: config.port,
    secure: config.secure,
    auth: { user: config.user, pass: config.pass },
    connectionTimeout: CONNECTION_TIMEOUT_MS,
    socketTimeout: SOCKET_TIMEOUT_MS,
  });

  try {
    await transport.verify();
  } finally {
    transport.close();
  }
};
