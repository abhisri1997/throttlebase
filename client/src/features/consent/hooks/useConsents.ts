import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuthState } from "../../../services/useAuthState";
import { answerConsent, declareAge, fetchConsents, type ConsentAnswer } from "../api/consent";

export const CONSENTS_QUERY_KEY = ["consents"] as const;

/** The rider's notices, answers and 18+ declaration. Shared by every screen that asks. */
export const useConsents = () => {
  const signedIn = useAuthState().status === "signed-in";
  return useQuery({
    queryKey: CONSENTS_QUERY_KEY,
    queryFn: fetchConsents,
    enabled: signedIn,
    // Launch waits on this; one bounded try, then the rider is let in.
    retry: false,
    staleTime: 5 * 60_000,
  });
};

export const useAnswerConsent = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (answer: ConsentAnswer) => answerConsent(answer),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CONSENTS_QUERY_KEY }),
  });
};

export const useDeclareAge = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ isAdult, source }: { isAdult: boolean; source: "onboarding" | "settings" }) =>
      declareAge(isAdult, source),
    onSettled: () => queryClient.invalidateQueries({ queryKey: CONSENTS_QUERY_KEY }),
  });
};
