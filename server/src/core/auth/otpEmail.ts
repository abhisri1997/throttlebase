import type { OutgoingEmail } from "../../ports/EmailSender.js";

/**
 * The OTP email. Deliberately contains no links, images or tracking pixels:
 * a code-only message is harder to phish with and less likely to be
 * classified as marketing.
 */
export const buildOtpEmail = (input: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): OutgoingEmail => {
  const { to, code, expiresInMinutes } = input;

  const text = [
    `${code} is your ThrottleBase code.`,
    "",
    `It expires in ${expiresInMinutes} minutes and can only be used once.`,
    "If you didn't ask to sign in, you can ignore this email.",
  ].join("\n");

  const html = [
    "<p>Your ThrottleBase sign-in code:</p>",
    `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</p>`,
    `<p>It expires in ${expiresInMinutes} minutes and can only be used once.</p>`,
    "<p>If you didn't ask to sign in, you can ignore this email.</p>",
  ].join("");

  return {
    to,
    subject: `${code} is your ThrottleBase code`,
    text,
    html,
  };
};
