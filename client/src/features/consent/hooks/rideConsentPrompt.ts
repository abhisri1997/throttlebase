import { create } from "zustand";
import type { ConsentNotice } from "../core/consent";

/**
 * The question asked before a ride's tracking starts. The tracker asks and
 * waits; RideConsentHost, mounted once at the root, shows the sheet and
 * answers.
 */
export type RideConsentOutcome =
  /** Answers were sent. */
  | "answered"
  /** "Not now": nothing recorded; the ride goes on as the rider's answers stand. */
  | "skipped";

interface RideConsentRequest {
  rideId: string;
  notices: ConsentNotice[];
  resolve: (outcome: RideConsentOutcome) => void;
}

interface RideConsentPromptState {
  request: RideConsentRequest | null;
}

export const useRideConsentPrompt = create<RideConsentPromptState>(() => ({ request: null }));

/** Resolves once the rider has answered, or put it off. */
export const askRideConsent = (rideId: string, notices: ConsentNotice[]): Promise<RideConsentOutcome> =>
  new Promise((resolve) => {
    useRideConsentPrompt.setState({
      request: {
        rideId,
        notices,
        resolve: (outcome) => {
          useRideConsentPrompt.setState({ request: null });
          resolve(outcome);
        },
      },
    });
  });
