export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html?: string;
}

export interface EmailSender {
  send(mail: OutgoingEmail): Promise<{ messageId: string }>;
}
