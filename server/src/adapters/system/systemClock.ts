import type { Clock } from "../../ports/Clock.js";

export const systemClock: Clock = {
  now: () => new Date(),
};
