import { isFinishedProgress, type RiderProgress } from "../../rides/core/riderProgress";

interface StatusColors {
  primary: string;
  danger: string;
  textMuted: string;
}

/** Left early stands out; any other finish reads as done; everything else is quiet. */
export const crewStatusColor = (progress: RiderProgress, colors: StatusColors): string =>
  progress === "left_early"
    ? colors.danger
    : isFinishedProgress(progress)
      ? colors.primary
      : colors.textMuted;
