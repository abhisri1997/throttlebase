/**
 * The area a point is in, as a rider would say it: "HSR Layout, Bengaluru",
 * "Gundlupet", "Sulthan Bathery". Used to name a route's ends, where a street
 * address or a plus code ("VM27+4J8") would mean nothing on a card.
 */

export interface GeocodeResultLike {
  address_components?: Array<{ long_name?: string; types?: string[] }>;
}

/** Most specific first: a neighbourhood only reads well next to its city. */
const NEIGHBOURHOOD_TYPES = ["sublocality_level_1", "sublocality", "neighborhood"];
const TOWN_TYPES = ["locality"];
/** Outside towns: the taluk, then the district. */
const REGION_TYPES = ["administrative_area_level_3", "administrative_area_level_2"];

const findName = (results: readonly GeocodeResultLike[], types: readonly string[]): string | null => {
  for (const type of types) {
    for (const result of results) {
      const match = result.address_components?.find(
        (component) => component.long_name && component.types?.includes(type),
      );
      if (match?.long_name) return match.long_name;
    }
  }
  return null;
};

export const areaNameFromGeocode = (results: readonly GeocodeResultLike[]): string | null => {
  const neighbourhood = findName(results, NEIGHBOURHOOD_TYPES);
  const town = findName(results, TOWN_TYPES);

  if (neighbourhood && town && neighbourhood !== town) return `${neighbourhood}, ${town}`;
  return town ?? neighbourhood ?? findName(results, REGION_TYPES);
};
