import test from "node:test";
import assert from "node:assert/strict";
import { createGoogleMapsProvider } from "./googleMapsProvider.js";
import type { FetchLike } from "./mapsProvider.js";

const ONE_LEG_RESPONSE = {
  status: "OK",
  routes: [
    {
      overview_polyline: { points: "overview" },
      legs: [
        {
          start_location: { lat: 12.9, lng: 77.0 },
          end_location: { lat: 12.9, lng: 77.3 },
          distance: { value: 30000 },
          duration: { value: 2400 },
          steps: [
            {
              html_instructions: "Head east",
              start_location: { lat: 12.9, lng: 77.0 },
              end_location: { lat: 12.9, lng: 77.3 },
              distance: { value: 30000 },
              duration: { value: 2400 },
              polyline: { points: "abc" },
            },
          ],
        },
      ],
    },
  ],
};

/** A provider whose every request is recorded instead of sent. */
const recordingProvider = () => {
  const urls: URL[] = [];
  const fetchImpl = (async (input: string | URL | Request) => {
    urls.push(new URL(String(input)));
    return new Response(JSON.stringify(ONE_LEG_RESPONSE), { status: 200 });
  }) as FetchLike;
  return { provider: createGoogleMapsProvider({ apiKey: "test-key", fetchImpl }), urls };
};

const origin = { lat: 12.9, lng: 77.0 };
const destination = { lat: 12.9, lng: 77.3 };

test("a road to follow is sent as pass-through points, threaded between the stops", async () => {
  const { provider, urls } = recordingProvider();

  await provider.getDirections({
    origin,
    destination,
    waypoints: [{ lat: 12.9, lng: 77.12 }],
    via: [
      { lat: 12.91, lng: 77.05 },
      { lat: 12.89, lng: 77.2 },
    ],
  });

  assert.equal(
    urls[0]!.searchParams.get("waypoints"),
    "via:12.91,77.05|12.9,77.12|via:12.89,77.2",
  );
});

test("pass-through points alone still get traffic, which Google only drops for stops", async () => {
  const { provider, urls } = recordingProvider();

  await provider.getDirections({
    origin,
    destination,
    via: [
      { lat: 12.91, lng: 77.05 },
      { lat: 12.89, lng: 77.2 },
    ],
    trafficAware: true,
    preferFastest: true,
  });

  const params = urls[0]!.searchParams;
  assert.equal(params.get("departure_time"), "now");
  assert.equal(params.get("alternatives"), null, "the road is chosen, so there is no faster alternative to pick");
});

test("without a road to follow, the stops are sent as they are", async () => {
  const { provider, urls } = recordingProvider();

  await provider.getDirections({ origin, destination, waypoints: [{ lat: 12.9, lng: 77.12 }] });

  assert.equal(urls[0]!.searchParams.get("waypoints"), "12.9,77.12");
});
