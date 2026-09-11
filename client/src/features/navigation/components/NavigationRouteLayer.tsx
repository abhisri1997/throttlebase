import React, { memo } from "react";
import { Polyline } from "../../../components/MapWrapper";
import type { NavigationColors } from "../../../theme/navigationColors";
import type { LatLng, RouteLeg } from "../types/navigation";

/**
 * Casing and fill are two stacked polylines — neither map SDK draws an outline.
 * The values must be distinct integers: Google leaves the order of equal
 * zIndex undefined, and iOS truncates it to an int.
 */
const Z_INDEX = {
  laterCasing: 1,
  laterFill: 2,
  currentCasing: 3,
  currentFill: 4,
} as const;

const CURRENT_FILL_WIDTH = 7;
const CURRENT_CASING_WIDTH = 11;
const LATER_FILL_WIDTH = 5;
const LATER_CASING_WIDTH = 8;

interface CasedLineProps {
  coordinates: LatLng[];
  fillColor: string;
  casingColor: string;
  fillWidth: number;
  casingWidth: number;
  fillZIndex: number;
  casingZIndex: number;
}

/** Round caps apply on Android only; the iOS Google provider has no cap support. */
const CasedLine = ({
  coordinates,
  fillColor,
  casingColor,
  fillWidth,
  casingWidth,
  fillZIndex,
  casingZIndex,
}: CasedLineProps) => (
  <>
    <Polyline
      coordinates={coordinates}
      strokeColor={casingColor}
      strokeWidth={casingWidth}
      zIndex={casingZIndex}
      lineCap='round'
    />
    <Polyline
      coordinates={coordinates}
      strokeColor={fillColor}
      strokeWidth={fillWidth}
      zIndex={fillZIndex}
      lineCap='round'
    />
  </>
);

export interface NavigationRouteLayerProps {
  /** The leg being ridden, from the rider forward. Road already ridden is not passed in. */
  currentLine: LatLng[];
  /** Legs after the current one. */
  laterLegs: readonly RouteLeg[];
  colors: NavigationColors;
}

/**
 * The route as Google Maps draws a multi-stop trip: the leg in progress bold
 * with a dark outline, later legs in a lighter tint beneath it, and nothing
 * behind the rider.
 */
export const NavigationRouteLayer = memo(function NavigationRouteLayer({
  currentLine,
  laterLegs,
  colors,
}: NavigationRouteLayerProps) {
  return (
    <>
      {laterLegs.map((leg) =>
        leg.polyline.length > 1 ? (
          <CasedLine
            key={`later-leg-${leg.index}`}
            coordinates={leg.polyline}
            fillColor={colors.laterFill}
            casingColor={colors.laterCasing}
            fillWidth={LATER_FILL_WIDTH}
            casingWidth={LATER_CASING_WIDTH}
            fillZIndex={Z_INDEX.laterFill}
            casingZIndex={Z_INDEX.laterCasing}
          />
        ) : null,
      )}

      {currentLine.length > 1 ? (
        <CasedLine
          coordinates={currentLine}
          fillColor={colors.routeFill}
          casingColor={colors.routeCasing}
          fillWidth={CURRENT_FILL_WIDTH}
          casingWidth={CURRENT_CASING_WIDTH}
          fillZIndex={Z_INDEX.currentFill}
          casingZIndex={Z_INDEX.currentCasing}
        />
      ) : null}
    </>
  );
});
