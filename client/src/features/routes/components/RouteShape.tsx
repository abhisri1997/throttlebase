import React, { useMemo } from "react";
import Svg, { Circle, Path } from "react-native-svg";
import { routeShapePoints } from "../core/routeSummary";

const START_COLOR = "#22c55e";
const DESTINATION_COLOR = "#ef4444";
const PADDING = 12;

interface RouteShapeProps {
  coordinates: readonly (readonly number[])[];
  width: number;
  height: number;
  color: string;
}

/**
 * A drawing of the route's line from its own points: no map tiles, no map API
 * calls, so a list of routes stays cheap. Green marks the start, red the end.
 */
export function RouteShape({ coordinates, width, height, color }: RouteShapeProps) {
  const points = useMemo(
    () => routeShapePoints(coordinates, { width, height, padding: PADDING }),
    [coordinates, width, height],
  );
  if (!points) return null;

  const path = points.map((point, index) => `${index === 0 ? "M" : "L"}${point.x} ${point.y}`).join(" ");
  const start = points[0]!;
  const end = points[points.length - 1]!;

  return (
    <Svg width={width} height={height} accessibilityElementsHidden importantForAccessibility='no-hide-descendants'>
      <Path d={path} stroke={color} strokeWidth={3.5} strokeLinecap='round' strokeLinejoin='round' fill='none' />
      <Circle cx={start.x} cy={start.y} r={5} fill={START_COLOR} />
      <Circle cx={end.x} cy={end.y} r={5} fill={DESTINATION_COLOR} />
    </Svg>
  );
}
