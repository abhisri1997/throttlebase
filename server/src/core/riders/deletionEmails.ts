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

/**
 * Sent instead of a code when someone asks to delete an account at an
 * address that has none. Whoever asked sees the same answer either way; only
 * the inbox's owner learns there was nothing to delete.
 */
export const buildNoAccountEmail = (input: { to: string }): OutgoingEmail => {
  const text = [
    "Someone asked to delete a ThrottleBase account at this address, but there's no ThrottleBase account here, so there's nothing to delete.",
    "",
    "If you signed up with a different address, ask again with that one. If you didn't ask, you can ignore this email.",
  ].join("\n");

  const html = text
    .split("\n")
    .filter((line) => line !== "")
    .map((line) => `<p>${line}</p>`)
    .join("");

  return {
    to: input.to,
    subject: "About deleting a ThrottleBase account",
    text,
    html,
  };
};
