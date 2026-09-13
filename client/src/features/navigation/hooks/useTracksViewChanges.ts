import { useEffect, useState } from "react";

/**
 * Android snapshots a child-view marker into a bitmap. It has to track view
 * changes until that snapshot is drawn — or the marker comes out blank — and
 * then stop, or it re-snapshots on every frame. iOS's Google Maps SDK has a
 * related quirk: a marker left untracked indefinitely while siblings churn
 * around it (other markers, polylines redrawing) can silently drop out of the
 * map entirely. Re-tracking briefly on every real change guards against both.
 */
const TRACK_VIEW_CHANGES_MS = 600;

export const useTracksViewChanges = (renderKey: string): boolean => {
  const [tracksViewChanges, setTracksViewChanges] = useState(true);

  useEffect(() => {
    setTracksViewChanges(true);
    const timer = setTimeout(() => setTracksViewChanges(false), TRACK_VIEW_CHANGES_MS);
    return () => clearTimeout(timer);
  }, [renderKey]);

  return tracksViewChanges;
};
