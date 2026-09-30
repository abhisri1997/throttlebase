/**
 * The camera that shows the rest of a route, worked out here rather than
 * with the map's own fit-to-coordinates.
 *
 * On Android, fitting while the map's padding also changes (overview drops
 * the follow mode's look-ahead) and the tilt resets left the camera where it
 * was: the button lit up but the map never zoomed out. One camera move with
 * a centre and zoom behaves the same on both platforms.
 *
 * Web Mercator, 256-unit tiles: the units map SDKs use for zoom on both
 * platforms (points on iOS, dp on Android), so the view size is in the same
 * units as layout.
 */
import type { LatLng } from "../types/navigation";

export interface OverviewViewport {
  /** The map's size, as laid out. */
  width: number;
  height: number;
  /** Map padding already applied (the camera centres within what's left). */
  paddingTop: number;
  paddingBottom: number;
  /** Space kept clear around the route inside the visible area. */
  margin: number;
}

export interface OverviewCamera {
  center: LatLng;
  zoom: number;
}

const TILE_SIZE = 256;
const MAX_ZOOM = 18;
const MIN_ZOOM = 2;

/** Mercator y of a latitude, in [0, 1] of the world's height. */
const mercatorY = (latitude: number): number => {
  const clamped = Math.max(-85.05112878, Math.min(85.05112878, latitude));
  const sin = Math.sin((clamped * Math.PI) / 180);
  return 0.5 - Math.log((1 + sin) / (1 - sin)) / (4 * Math.PI);
};

const latitudeOfMercatorY = (y: number): number =>
  (Math.atan(Math.sinh(Math.PI * (1 - 2 * y))) * 180) / Math.PI;

export const overviewCamera = (
  coordinates: readonly LatLng[],
  viewport: OverviewViewport,
): OverviewCamera | null => {
  if (coordinates.length === 0) return null;

  let minLng = Infinity;
  let maxLng = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const { latitude, longitude } of coordinates) {
    minLng = Math.min(minLng, longitude);
    maxLng = Math.max(maxLng, longitude);
    const y = mercatorY(latitude);
    minY = Math.min(minY, y);
    maxY = Math.max(maxY, y);
  }

  const center: LatLng = {
    latitude: latitudeOfMercatorY((minY + maxY) / 2),
    longitude: (minLng + maxLng) / 2,
  };

  const usableWidth = viewport.width - 2 * viewport.margin;
  const usableHeight = viewport.height - viewport.paddingTop - viewport.paddingBottom - 2 * viewport.margin;
  const spanX = (maxLng - minLng) / 360;
  const spanY = maxY - minY;

  // A single point, or a view with no room: a close, fixed zoom.
  if (usableWidth <= 0 || usableHeight <= 0 || (spanX === 0 && spanY === 0)) {
    return { center, zoom: 16 };
  }

  const zoomFor = (pixels: number, span: number): number =>
    span === 0 ? MAX_ZOOM : Math.log2(pixels / (TILE_SIZE * span));
  const zoom = Math.min(zoomFor(usableWidth, spanX), zoomFor(usableHeight, spanY));

  return { center, zoom: Math.max(MIN_ZOOM, Math.min(MAX_ZOOM, zoom)) };
};
