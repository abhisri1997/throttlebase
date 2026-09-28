import test from "node:test";
import assert from "node:assert/strict";
import { areaNameFromGeocode, type GeocodeResultLike } from "./areaName.js";

const component = (long_name: string, ...types: string[]) => ({ long_name, types });

test("a city neighbourhood reads as neighbourhood and city", () => {
  const results: GeocodeResultLike[] = [
    {
      address_components: [
        component("27th Main Road", "route"),
        component("HSR Layout", "sublocality_level_1", "sublocality", "political"),
        component("Bengaluru", "locality", "political"),
        component("Karnataka", "administrative_area_level_1", "political"),
      ],
    },
  ];

  assert.equal(areaNameFromGeocode(results), "HSR Layout, Bengaluru");
});

test("a town on the highway reads as the town", () => {
  const results: GeocodeResultLike[] = [
    {
      address_components: [
        component("NH766", "route"),
        component("Gundlupet", "locality", "political"),
        component("Chamarajanagar", "administrative_area_level_3", "political"),
      ],
    },
  ];

  assert.equal(areaNameFromGeocode(results), "Gundlupet");
});

test("the area is found even when the first result is only a plus code", () => {
  const results: GeocodeResultLike[] = [
    { address_components: [component("VM27+4J8", "plus_code")] },
    {
      address_components: [
        component("Electronic City", "sublocality_level_1", "political"),
        component("Bengaluru", "locality", "political"),
      ],
    },
  ];

  assert.equal(areaNameFromGeocode(results), "Electronic City, Bengaluru");
});

test("open country falls back to the taluk or district", () => {
  const results: GeocodeResultLike[] = [
    {
      address_components: [
        component("Sulthan Bathery", "administrative_area_level_3", "political"),
        component("Wayanad", "administrative_area_level_2", "political"),
      ],
    },
  ];

  assert.equal(areaNameFromGeocode(results), "Sulthan Bathery");
});

test("a neighbourhood named like its city is not repeated", () => {
  const results: GeocodeResultLike[] = [
    {
      address_components: [
        component("Mysuru", "sublocality_level_1", "political"),
        component("Mysuru", "locality", "political"),
      ],
    },
  ];

  assert.equal(areaNameFromGeocode(results), "Mysuru");
});

test("nothing usable gives no name", () => {
  assert.equal(areaNameFromGeocode([]), null);
  assert.equal(areaNameFromGeocode([{ address_components: [component("VM27+4J8", "plus_code")] }]), null);
});
