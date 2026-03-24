type ValidationIssue = {
  message?: unknown;
  path?: unknown;
};

const FIELD_LABELS: Record<string, string> = {
  email: "Email",
  password: "Password",
  display_name: "Display name",
  username: "Username",
  rider_id: "Rider",
  title: "Title",
  description: "Description",
  subject: "Subject",
  category: "Category",
  scheduled_at: "Scheduled time",
  max_capacity: "Capacity",
};

const toFieldLabel = (value: unknown): string | null => {
  if (typeof value !== "string" || !value.trim()) {
    return null;
  }

  const key = value.trim();
  if (FIELD_LABELS[key]) {
    return FIELD_LABELS[key];
  }

  return key.replace(/_/g, " ").replace(/\b\w/g, (char) => char.toUpperCase());
};

const toIssueMessage = (issue: ValidationIssue): string | null => {
  const rawMessage =
    typeof issue?.message === "string" ? issue.message.trim() : "";
  if (!rawMessage) {
    return null;
  }

  const path = Array.isArray(issue?.path) ? issue.path : [];
  const fieldLabel = toFieldLabel(path[0]);
  if (!fieldLabel) {
    return rawMessage;
  }

  return `${fieldLabel}: ${rawMessage}`;
};

const uniqueMessages = (messages: string[]): string[] => {
  return Array.from(new Set(messages.filter(Boolean)));
};

const getIssueMessages = (issues: unknown): string[] => {
  if (!Array.isArray(issues)) {
    return [];
  }

  const messages = issues
    .map((issue) => toIssueMessage((issue || {}) as ValidationIssue))
    .filter((msg): msg is string => Boolean(msg));

  return uniqueMessages(messages);
};

const toAxiosLikeError = (error: unknown): any => error as any;

export const getApiErrorMessage = (
  error: unknown,
  fallback = "Something went wrong. Please try again.",
): string => {
  const err = toAxiosLikeError(error);

  if (!err?.response) {
    const rawMessage = typeof err?.message === "string" ? err.message : "";
    if (rawMessage.toLowerCase().includes("network")) {
      return "Unable to reach the server. Check your connection and try again.";
    }

    return rawMessage || fallback;
  }

  const data = err.response?.data ?? {};
  const detailMessages = getIssueMessages(data?.details);
  const errorMessages = getIssueMessages(data?.errors);
  const messages = uniqueMessages([...detailMessages, ...errorMessages]);

  if (messages.length === 1) {
    return messages[0];
  }

  if (messages.length > 1) {
    return `Please fix the following:\n• ${messages.slice(0, 4).join("\n• ")}`;
  }

  if (typeof data?.error === "string" && data.error.trim()) {
    return data.error.trim();
  }

  if (typeof data?.message === "string" && data.message.trim()) {
    return data.message.trim();
  }

  if ((err.response?.status ?? 0) >= 500) {
    return "Server error. Please try again in a moment.";
  }

  return fallback;
};
