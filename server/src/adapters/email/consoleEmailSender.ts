import type { EmailSender, OutgoingEmail } from "../../ports/EmailSender.js";

/**
 * Prints mail instead of sending it.
 *
 * This is the development default: no provider account, no domain
 * verification, and the sign-in code is visible in the server log, which is
 * all a developer needs to complete a login.
 */
export const createConsoleEmailSender = (): EmailSender => ({
  send: (mail: OutgoingEmail): Promise<{ messageId: string }> => {
    const messageId = `console-${Date.now()}`;

    console.log(
      `[email:console] to=${mail.to} subject="${mail.subject}"\n${mail.text}`,
    );

    return Promise.resolve({ messageId });
  },
});
