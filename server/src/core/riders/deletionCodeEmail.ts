import type { OutgoingEmail } from "../../ports/EmailSender.js";

/**
 * The code a rider enters to confirm deleting their account. Like the sign-in
 * email (core/auth/otpEmail.ts) it has no links or images, and it names what
 * the code does, so a rider asked to read it out knows what they'd be giving
 * away.
 */
export const buildDeletionCodeEmail = (input: {
  to: string;
  code: string;
  expiresInMinutes: number;
}): OutgoingEmail => {
  const { to, code, expiresInMinutes } = input;
  const expiry = `It expires in ${expiresInMinutes} minutes and can only be used once.`;
  const ignore =
    "If you didn't ask to delete your account, ignore this email: nothing is deleted without it.";

  const text = [
    `${code} is your code to delete your ThrottleBase account.`,
    "",
    "Entering it deletes your account. Don't share it with anyone.",
    expiry,
    ignore,
  ].join("\n");

  const html = [
    "<p>Your code to delete your ThrottleBase account:</p>",
    `<p style="font-size:28px;font-weight:700;letter-spacing:4px;margin:16px 0">${code}</p>`,
    "<p>Entering it deletes your account. Don't share it with anyone.</p>",
    `<p>${expiry}</p>`,
    `<p>${ignore}</p>`,
  ].join("");

  return {
    to,
    subject: `${code} is your code to delete your ThrottleBase account`,
    text,
    html,
  };
};
