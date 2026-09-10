import { useCallback, useEffect, useRef } from 'react';
import { reverseGeocode } from '../utils/reverseGeocode';

/**
 * Collapses repeated pin drags into a single lookup. Each drag-end would
 * otherwise bill a separate Geocoding call, and a user nudging the pin into
 * place produces several in quick succession.
 */
export const PIN_DRAG_DEBOUNCE_MS = 400;

interface UseReverseGeocodeOptions {
  onAddress: (address: string) => void;
}

/**
 * Resolves coordinates to an address and hands the result to `onAddress`.
 *
 * Guarantees that only the newest lookup can produce a result: responses
 * arriving out of order, and any lookup still in flight when the picker
 * closes or unmounts, are discarded rather than overwriting a newer address.
 */
export function useReverseGeocode({ onAddress }: UseReverseGeocodeOptions) {
  const requestIdRef = useRef(0);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isMountedRef = useRef(true);
  const onAddressRef = useRef(onAddress);

  // Track the latest callback so the resolvers stay stable across renders.
  useEffect(() => {
    onAddressRef.current = onAddress;
  }, [onAddress]);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, []);

  const clearPendingTimer = useCallback(() => {
    if (!debounceTimerRef.current) return;
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = null;
  }, []);

  const run = useCallback(async (lat: number, lng: number) => {
    const requestId = ++requestIdRef.current;
    const address = await reverseGeocode(lat, lng);
    // A slower earlier lookup must never overwrite a newer one.
    if (!isMountedRef.current || requestId !== requestIdRef.current) return;
    onAddressRef.current(address);
  }, []);

  /** Looks up immediately. For deliberate one-off actions like a button press. */
  const resolve = useCallback(
    (lat: number, lng: number) => {
      clearPendingTimer();
      void run(lat, lng);
    },
    [clearPendingTimer, run],
  );

  /** Looks up after the drag settles, so a burst of drags costs one call. */
  const resolveDebounced = useCallback(
    (lat: number, lng: number) => {
      clearPendingTimer();
      debounceTimerRef.current = setTimeout(() => {
        debounceTimerRef.current = null;
        void run(lat, lng);
      }, PIN_DRAG_DEBOUNCE_MS);
    },
    [clearPendingTimer, run],
  );

  /** Drops any scheduled or in-flight lookup without applying its result. */
  const cancel = useCallback(() => {
    clearPendingTimer();
    requestIdRef.current++;
  }, [clearPendingTimer]);

  return { resolve, resolveDebounced, cancel };
}
