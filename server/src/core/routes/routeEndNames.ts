/**
 * Works out new area names for existing routes' ends, e.g. after migration 033
 * copied raw ride addresses ("48, Neeladri Rd, … 560100, India") onto them.
 * Pure: the caller does the lookups' I/O and the writes.
 */

export interface Point {
  lat: number;
  lng: number;
}

export interface RouteEnds {
  id: string;
  startName: string | null;
  endName: string | null;
  start: Point | null;
  end: Point | null;
}

export interface RouteEndNamesUpdate {
  id: string;
  startName: string | null;
  endName: string | null;
}

/** A lookup that fails or finds nothing keeps the name the end already has. */
const lookUp = async (
  nameArea: (point: Point) => Promise<string | null>,
  point: Point | null,
  current: string | null,
): Promise<string | null> => {
  if (!point) return current;
  try {
    return (await nameArea(point)) ?? current;
  } catch {
    return current;
  }
};

/** The routes whose names would change, with their new names. One at a time, to go easy on the maps budget. */
export const planRouteEndNames = async (
  routes: readonly RouteEnds[],
  nameArea: (point: Point) => Promise<string | null>,
): Promise<RouteEndNamesUpdate[]> => {
  const updates: RouteEndNamesUpdate[] = [];

  for (const route of routes) {
    const startName = await lookUp(nameArea, route.start, route.startName);
    const endName = await lookUp(nameArea, route.end, route.endName);
    if (startName !== route.startName || endName !== route.endName) {
      updates.push({ id: route.id, startName, endName });
    }
  }

  return updates;
};
