import type { EmailSender } from "../ports/EmailSender.js";
import { createConsoleEmailSender } from "../adapters/email/consoleEmailSender.js";
import {
  createSmtpEmailSender,
  verifySmtpTransport,
  type SmtpConfig,
} from "../adapters/email/smtpEmailSender.js";

export type EmailEnv = Record<string, string | undefined>;

const REQUIRED_SMTP_VARS = [
  "SMTP_HOST",
  "SMTP_PORT",
  "SMTP_SECURE",
  "SMTP_USER",
  "SMTP_PASS",
  "MAIL_FROM",
] as const;

export class EmailConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "EmailConfigError";
  }
}

const parseBoolean = (name: string, raw: string): boolean => {
  if (raw === "true") return true;
  if (raw === "false") return false;
  throw new EmailConfigError(`${name} must be exactly "true" or "false", got "${raw}"`);
};

const readSmtpConfig = (env: EmailEnv): SmtpConfig => {
  const missing = REQUIRED_SMTP_VARS.filter((name) => {
    const value = env[name];
    return value === undefined || value.trim() === "";
  });

  if (missing.length > 0) {
    throw new EmailConfigError(
      `EMAIL_DRIVER=smtp requires ${missing.join(", ")}. Refusing to start: a half-configured mailer means riders never receive a sign-in code.`,
    );
  }

  const port = Number(env.SMTP_PORT);
  if (!Number.isInteger(port) || port <= 0 || port > 65535) {
    throw new EmailConfigError(`SMTP_PORT must be a valid port number, got "${env.SMTP_PORT}"`);
  }

  const replyTo = env.MAIL_REPLY_TO?.trim();

  return {
    host: env.SMTP_HOST as string,
    port,
    secure: parseBoolean("SMTP_SECURE", env.SMTP_SECURE as string),
    user: env.SMTP_USER as string,
    pass: env.SMTP_PASS as string,
    from: env.MAIL_FROM as string,
    ...(replyTo ? { replyTo } : {}),
  };
};

/**
 * Picks the email adapter from configuration.
 *
 * The production guard exists because the console driver fails silently in
 * the worst way: everything looks healthy, no error is logged, and riders
 * simply cannot sign in because their codes were printed to a log nobody
 * reads. Defaulting to console in development and refusing it in production
 * makes the safe thing automatic and the dangerous thing deliberate.
 *
 * There is no silent fallback for an unrecognised driver either: a typo in
 * EMAIL_DRIVER must stop the boot, not quietly downgrade delivery.
 */
export const createEmailSender = (env: EmailEnv): EmailSender => {
  const driver = (env.EMAIL_DRIVER ?? "console").trim();
  const isProduction = env.NODE_ENV === "production";

  if (driver === "console") {
    if (isProduction && env.ALLOW_CONSOLE_EMAIL !== "true") {
      throw new EmailConfigError(
        'EMAIL_DRIVER=console is refused in production. Sign-in codes would be written to the log instead of delivered. Set EMAIL_DRIVER=smtp, or set ALLOW_CONSOLE_EMAIL=true if this is deliberate.',
      );
    }

    if (isProduction) {
      console.warn(
        "⚠️  [email] EMAIL_DRIVER=console in PRODUCTION with ALLOW_CONSOLE_EMAIL=true. Sign-in codes are being written to the log and no email is being delivered.",
      );
    }

    return createConsoleEmailSender();
  }

  if (driver === "smtp") {
    return createSmtpEmailSender(readSmtpConfig(env));
  }

  throw new EmailConfigError(
    `Unknown EMAIL_DRIVER "${driver}". Supported drivers: console, smtp.`,
  );
};

/** Boot-time connectivity check. No-op unless the SMTP driver is selected. */
export const verifyEmailSender = async (env: EmailEnv): Promise<void> => {
  if ((env.EMAIL_DRIVER ?? "console").trim() !== "smtp") {
    return;
  }
  await verifySmtpTransport(readSmtpConfig(env));
};
