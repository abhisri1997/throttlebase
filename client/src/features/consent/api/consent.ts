import { Platform } from "react-native";
import Constants from "expo-constants";
import { apiClient } from "../../../api/client";
import type { ConsentOverview, ConsentPurpose, ConsentSource, ConsentSummary } from "../core/consent";

/** Sent with each answer, so the ledger shows which build asked. */
const clientInfo = () => ({
  app_version: Constants.expoConfig?.version,
  platform: Platform.OS === "ios" || Platform.OS === "android" || Platform.OS === "web" ? Platform.OS : undefined,
});

/**
 * Bounded, because the app waits on it at launch: with no signal the rider
 * is let in rather than left on a spinner (core/consent.ts, ageGate).
 */
export const fetchConsents = async (): Promise<ConsentOverview> => {
  const { data } = await apiClient.get("/api/consents", { timeout: 10_000 });
  return data as ConsentOverview;
};

export interface ConsentAnswer {
  purpose: ConsentPurpose;
  granted: boolean;
  /** The version of the notice the rider was shown. */
  noticeVersion: string;
  source: ConsentSource;
}

export const answerConsent = async (answer: ConsentAnswer): Promise<ConsentSummary[]> => {
  const { data } = await apiClient.put(`/api/consents/${answer.purpose}`, {
    granted: answer.granted,
    notice_version: answer.noticeVersion,
    source: answer.source,
    ...clientInfo(),
  });
  return (data as { consents: ConsentSummary[] }).consents;
};

export const declareAge = async (isAdult: boolean, source: "onboarding" | "settings"): Promise<void> => {
  await apiClient.post("/api/consents/declarations", {
    kind: "age_18_plus",
    answer: isAdult,
    source,
    app_version: clientInfo().app_version,
  });
};
