import type { RiderRecord, RiderRepository } from "../../ports/RiderRepository.js";
import { AuthError } from "../auth/errors.js";
import {
  assertUsernameAcceptable,
  checkUsername,
  normalizeUsername,
  type UsernameCheck,
} from "../auth/username.js";

export interface OnboardingDeps {
  riders: RiderRepository;
}

export const EXPERIENCE_LEVELS = [
  "beginner",
  "intermediate",
  "advanced",
  "expert",
] as const;

export type ExperienceLevel = (typeof EXPERIENCE_LEVELS)[number];

export interface CompleteOnboardingInput {
  riderId: string;
  username: string;
  displayName: string;
  experienceLevel: ExperienceLevel;
  locationCity: string | null;
  firstVehicle: {
    make: string;
    model: string;
    year: number | null;
    engineCapacityCc: number | null;
  } | null;
}

/** Availability check behind GET /riders/username-available. */
export const isUsernameAvailable = async (
  deps: OnboardingDeps,
  raw: string,
): Promise<UsernameCheck> => {
  const candidate = normalizeUsername(raw);
  const existing = await deps.riders.findByUsername(candidate);
  return checkUsername(raw, existing !== null);
};

export const completeOnboarding = async (
  deps: OnboardingDeps,
  input: CompleteOnboardingInput,
): Promise<RiderRecord> => {
  const username = assertUsernameAcceptable(input.username);

  const existing = await deps.riders.findByUsername(username);
  if (existing && existing.id !== input.riderId) {
    throw new AuthError("USERNAME_TAKEN", "That username is already taken.");
  }

  const displayName = input.displayName.trim();
  if (displayName.length === 0 || displayName.length > 100) {
    throw new AuthError(
      "USERNAME_INVALID",
      "Display name must be between 1 and 100 characters.",
    );
  }

  return await deps.riders.completeOnboarding({
    riderId: input.riderId,
    username,
    displayName,
    experienceLevel: input.experienceLevel,
    locationCity: input.locationCity,
    firstVehicle: input.firstVehicle,
  });
};
