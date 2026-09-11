/**
 * Map styles for navigation. Both hide points of interest and transit so the
 * route and the ride's own stops are what stand out. The Google provider
 * ignores `showsPointsOfInterest` (it only affects Apple Maps), so decluttering
 * has to happen here.
 *
 * Both styles are explicit, non-empty lists: on Android, switching the style
 * to null leaves the previous one in place.
 */
import {
  navigationDayColors,
  navigationNightColors,
  type NavigationColors,
} from "../../../theme/navigationColors";
import { isNavigationDaytime } from "./cameraPolicy";

export interface MapStyleRule {
  featureType?: string;
  elementType?: string;
  stylers: Record<string, string | number>[];
}

const DECLUTTER: MapStyleRule[] = [
  { featureType: "poi", elementType: "labels", stylers: [{ visibility: "off" }] },
  { featureType: "poi.business", stylers: [{ visibility: "off" }] },
  { featureType: "transit", stylers: [{ visibility: "off" }] },
];

export const NAV_DAY_STYLE: MapStyleRule[] = [
  ...DECLUTTER,
  { featureType: "road.local", elementType: "labels.icon", stylers: [{ visibility: "off" }] },
];

export const NAV_NIGHT_STYLE: MapStyleRule[] = [
  { elementType: "geometry", stylers: [{ color: "#0b1220" }] },
  { elementType: "labels.text.fill", stylers: [{ color: "#9ca3af" }] },
  { elementType: "labels.text.stroke", stylers: [{ color: "#0b1220" }] },
  { featureType: "road", elementType: "geometry", stylers: [{ color: "#1f2937" }] },
  { featureType: "road.highway", elementType: "geometry", stylers: [{ color: "#2b3a4f" }] },
  { featureType: "road", elementType: "labels.text.fill", stylers: [{ color: "#cbd5e1" }] },
  { featureType: "water", elementType: "geometry", stylers: [{ color: "#111827" }] },
  { featureType: "poi.park", elementType: "geometry", stylers: [{ color: "#10241b" }] },
  ...DECLUTTER,
];

export interface NavigationMapTheme {
  isNight: boolean;
  mapStyle: MapStyleRule[];
  colors: NavigationColors;
}

const DAY_THEME: NavigationMapTheme = {
  isNight: false,
  mapStyle: NAV_DAY_STYLE,
  colors: navigationDayColors,
};

const NIGHT_THEME: NavigationMapTheme = {
  isNight: true,
  mapStyle: NAV_NIGHT_STYLE,
  colors: navigationNightColors,
};

export const navigationMapThemeAt = (date: Date): NavigationMapTheme =>
  isNavigationDaytime(date) ? DAY_THEME : NIGHT_THEME;
