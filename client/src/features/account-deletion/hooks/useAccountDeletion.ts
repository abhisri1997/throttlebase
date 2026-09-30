import { useState } from "react";
import { useRouter } from "expo-router";
import { authService } from "../../../services/auth";
import { useCurrentRider } from "../../../services/useCurrentRider";
import { confirmDestructive } from "../../../utils/confirmDestructive";

export type DeletionStage = "start" | "code" | "deleted" | "no-account";

type Busy = "sending" | "deleting" | null;

const messageOf = (error: unknown): string =>
  (error as Error)?.message || "Something went wrong. Please try again.";

/**
 * The deletion flow behind /delete-account, signed in or not.
 *
 * Signed in, the code goes to the address on the rider's account. Signed out
 * (the website, no app needed), the person types the address, and the server
 * answers the same whether or not it has an account; only the code in that
 * inbox can delete it.
 */
export const useAccountDeletion = () => {
  const router = useRouter();
  const { isSignedIn, rider } = useCurrentRider();

  const [stage, setStage] = useState<DeletionStage>("start");
  // Fixed when the code is sent: a session that ends mid-flow must not
  // switch it to the signed-out path, whose address field is empty.
  const [usesAccount, setUsesAccount] = useState(false);
  const [typedEmail, setTypedEmail] = useState("");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState<Busy>(null);
  const [error, setError] = useState<string | null>(null);

  const signedInFlow = stage === "start" ? isSignedIn : usesAccount;
  const email = signedInFlow ? rider?.email ?? null : typedEmail.trim();

  const run = async (label: Exclude<Busy, null>, action: () => Promise<void>) => {
    setBusy(label);
    setError(null);
    try {
      await action();
    } catch (failure) {
      setError(messageOf(failure));
    } finally {
      setBusy(null);
    }
  };

  const sendCode = () =>
    run("sending", async () => {
      const viaAccount = stage === "start" ? isSignedIn : usesAccount;
      if (viaAccount) {
        await authService.requestDeletionCode();
      } else {
        await authService.requestDeletionCodeFor(typedEmail);
      }
      setUsesAccount(viaAccount);
      setCode("");
      setStage("code");
    });

  const deleteAccount = async () => {
    const confirmed = await confirmDestructive({
      title: "Delete your account?",
      message: "This can't be undone.",
      confirmLabel: "Delete",
    });
    if (!confirmed) return;

    await run("deleting", async () => {
      if (usesAccount) {
        await authService.deleteAccount(code);
        setStage("deleted");
        router.replace("/(auth)/sign-in");
        return;
      }
      const result = await authService.deleteAccountByEmail(typedEmail, code);
      setStage(result.deleted ? "deleted" : "no-account");
    });
  };

  const startOver = () => {
    setStage("start");
    setCode("");
    setError(null);
  };

  return {
    isSignedIn: signedInFlow,
    email,
    typedEmail,
    setTypedEmail,
    code,
    setCode,
    stage,
    busy,
    error,
    sendCode,
    deleteAccount,
    startOver,
  };
};
