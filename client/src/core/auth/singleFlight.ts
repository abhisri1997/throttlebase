/**
 * Collapses concurrent calls into one.
 *
 * This is load-bearing for refresh, not an optimisation. The backend rotates
 * the refresh token on every use and treats a second presentation of an
 * already-rotated token as theft, revoking the whole family. An app that
 * fires two refreshes at once — a screen and a background location task
 * waking together, say — would log itself out.
 *
 * Callers that arrive while a call is in flight receive the same promise.
 */
export const createSingleFlight = <T>(): ((run: () => Promise<T>) => Promise<T>) => {
  let inFlight: Promise<T> | null = null;

  return (run: () => Promise<T>): Promise<T> => {
    if (inFlight) {
      return inFlight;
    }

    const promise = run();

    // Cleared on both paths, so one failed refresh does not wedge the app
    // into never refreshing again.
    inFlight = promise.finally(() => {
      inFlight = null;
    }) as Promise<T>;

    return inFlight;
  };
};
