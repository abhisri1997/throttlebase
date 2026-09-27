/**
 * Features held back from the closed beta. Each is off unless its
 * EXPO_PUBLIC_FEATURE_* variable is "true" at build time; the server gates
 * the matching endpoints with its own FEATURE_* variables.
 */
export interface FeatureFlags {
  groups: boolean;
  rank: boolean;
  accountSecurity: boolean;
  support: boolean;
}

type FeatureName = keyof FeatureFlags;

const isOn = (value: string | undefined): boolean => value?.trim().toLowerCase() === "true";

export const parseFeatureFlags = (
  values: Partial<Record<FeatureName, string | undefined>>,
): FeatureFlags => ({
  groups: isOn(values.groups),
  rank: isOn(values.rank),
  accountSecurity: isOn(values.accountSecurity),
  support: isOn(values.support),
});

// Expo inlines EXPO_PUBLIC_* only where each is read literally, so they are
// listed one by one rather than looked up by name.
export const FEATURES: FeatureFlags = parseFeatureFlags({
  groups: process.env.EXPO_PUBLIC_FEATURE_GROUPS,
  rank: process.env.EXPO_PUBLIC_FEATURE_RANK,
  accountSecurity: process.env.EXPO_PUBLIC_FEATURE_ACCOUNT_SECURITY,
  support: process.env.EXPO_PUBLIC_FEATURE_SUPPORT,
});

/** First path segment of each screen that belongs to a held-back feature. */
const FEATURE_BY_SCREEN: Record<string, FeatureName> = {
  groups: "groups",
  group: "groups",
  "create-group": "groups",
  rewards: "rank",
  security: "accountSecurity",
  support: "support",
  "support-admin": "support",
};

/** Whether a pathname (as from usePathname) may be shown, deep links included. */
export const isPathEnabled = (pathname: string, flags: FeatureFlags): boolean => {
  const screen = pathname.split("/").filter(Boolean)[0];
  const feature = screen ? FEATURE_BY_SCREEN[screen] : undefined;
  return feature ? flags[feature] : true;
};
