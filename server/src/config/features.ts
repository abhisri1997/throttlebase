import type { RequestHandler } from "express";

/**
 * Features held back from the closed beta. Each is off unless its variable is
 * set to "true", so a deploy that forgets the variables ships the smaller app.
 * The client reads matching EXPO_PUBLIC_FEATURE_* flags to hide the screens.
 */
export interface FeatureFlags {
  groups: boolean;
  rank: boolean;
  accountSecurity: boolean;
  support: boolean;
}

const FLAG_VARIABLES: Record<keyof FeatureFlags, string> = {
  groups: "FEATURE_GROUPS",
  rank: "FEATURE_RANK",
  accountSecurity: "FEATURE_ACCOUNT_SECURITY",
  support: "FEATURE_SUPPORT",
};

const isOn = (value: string | undefined): boolean => value?.trim().toLowerCase() === "true";

export const parseFeatureFlags = (env: Record<string, string | undefined>): FeatureFlags => ({
  groups: isOn(env[FLAG_VARIABLES.groups]),
  rank: isOn(env[FLAG_VARIABLES.rank]),
  accountSecurity: isOn(env[FLAG_VARIABLES.accountSecurity]),
  support: isOn(env[FLAG_VARIABLES.support]),
});

export const featureFlags = parseFeatureFlags(process.env);

/** A disabled feature's endpoints answer as if they did not exist. */
export const requireFeature =
  (isEnabled: boolean): RequestHandler =>
  (_req, res, next) => {
    if (!isEnabled) {
      res.status(404).json({ error: "Not found" });
      return;
    }
    next();
  };
