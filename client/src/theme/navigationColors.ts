/**
 * Colours for the navigation map. They follow the map style (day or night), not
 * the app theme, because the map is styled independently of the UI around it.
 *
 * Later legs use opaque tints pre-blended against the road colour rather than
 * translucency: translucent lines darken wherever they overlap, which is
 * exactly the out-and-back case, and a translucent casing bleeds through its fill.
 */
export interface NavigationColors {
  /** Leg being ridden. */
  routeFill: string;
  routeCasing: string;
  /** Legs after the current one. */
  laterFill: string;
  laterCasing: string;
  /** Straight dashed hint from the viewer to the ride start. */
  approachLine: string;
  waypointStart: string;
  waypointStop: string;
  waypointDestination: string;
  /** Waypoints already reached or skipped. */
  waypointVisited: string;
  waypointOutline: string;
  /** Other riders. Distinct from stops (amber) and the rider's own puck (blue). */
  peer: string;
  self: string;
  /** Maneuver banner: a strong green, like Google Maps, readable over either map style. */
  bannerBackground: string;
  bannerThenBackground: string;
  bannerText: string;
  bannerMutedText: string;
  /** Small status chips under the banner: loading, rerouting, off-route. */
  chipBackground: string;
  chipText: string;
  alertBackground: string;
}

export const navigationNightColors: NavigationColors = {
  routeFill: "rgb(66, 133, 244)",
  routeCasing: "rgb(20, 52, 110)",
  laterFill: "rgb(84, 118, 172)",
  laterCasing: "rgb(35, 55, 90)",
  approachLine: "rgb(148, 163, 184)",
  waypointStart: "rgb(34, 197, 94)",
  waypointStop: "rgb(245, 158, 11)",
  waypointDestination: "rgb(239, 68, 68)",
  waypointVisited: "rgb(100, 116, 139)",
  waypointOutline: "rgb(255, 255, 255)",
  peer: "rgb(168, 85, 247)",
  self: "rgb(66, 133, 244)",
  bannerBackground: "rgb(19, 115, 51)",
  bannerThenBackground: "rgb(12, 84, 36)",
  bannerText: "rgb(255, 255, 255)",
  bannerMutedText: "rgba(255, 255, 255, 0.78)",
  chipBackground: "rgba(15, 23, 42, 0.9)",
  chipText: "rgb(241, 245, 249)",
  alertBackground: "rgb(220, 38, 38)",
};

export const navigationDayColors: NavigationColors = {
  ...navigationNightColors,
  routeFill: "rgb(26, 115, 232)",
  routeCasing: "rgb(13, 71, 161)",
  laterFill: "rgb(138, 180, 248)",
  laterCasing: "rgb(90, 135, 210)",
  approachLine: "rgb(100, 116, 139)",
  waypointVisited: "rgb(148, 163, 184)",
  self: "rgb(26, 115, 232)",
  chipBackground: "rgba(255, 255, 255, 0.96)",
  chipText: "rgb(15, 23, 42)",
};
