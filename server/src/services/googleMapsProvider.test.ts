import test from "node:test";
import assert from "node:assert/strict";
import {
  createGoogleMapsProvider,
  PLACES_FIELD_MASK,
  PLACE_DETAILS_FIELD_MASK,
} from "./maps/googleMapsProvider.js";
import { MapsApiError } from "./maps/mapsProvider.js";

const API_KEY = "test-secret-key-do-not-leak";

/** Captures the single request the provider makes, and answers with `body`. */
const recordingFetch = (body: unknown, init: ResponseInit = {}) => {
  const calls: { url: string; init: RequestInit }[] = [];
  const fetchImpl = (async (url: string | URL | Request, requestInit?: RequestInit) => {
    calls.push({ url: String(url), init: requestInit ?? {} });
    return new Response(JSON.stringify(body), init);
  }) as unknown as typeof fetch;
  return { calls, fetchImpl };
};

const headerOf = (init: RequestInit, name: string): string | undefined =>
  (init.headers as Record<string, string> | undefined)?.[name];

/** Silences the provider's error logging for the duration of `run`. */
const withSilencedLogs = async (run: () => Promise<void>): Promise<string[]> => {
  const original = console.error;
  const lines: string[] = [];
  console.error = (...args: unknown[]) => {
    lines.push(args.map(String).join(" "));
  };
  try {
    await run();
  } finally {
    console.error = original;
  }
  return lines;
};

const DIRECTIONS_OK = {
  status: "OK",
  routes: [
    {
      overview_polyline: { points: "overview" },
      legs: [
        {
          start_location: { lat: 1, lng: 2 },
          end_location: { lat: 3, lng: 4 },
          distance: { value: 1000 },
          duration: { value: 600 },
          duration_in_traffic: { value: 720 },
          steps: [
            {
              html_instructions: "Turn <b>left</b>",
              distance: { value: 500 },
              duration: { value: 300 },
              start_location: { lat: 1, lng: 2 },
              end_location: { lat: 3, lng: 4 },
              polyline: { points: "step1" },
              maneuver: "turn-left",
            },
          ],
        },
      ],
    },
  ],
};

/* -------------------------------------------------------------------------- */
/* Field masks — these set the billing tier, so they are asserted exactly.     */
/* -------------------------------------------------------------------------- */

test("keeps the Pro-tier search field mask exactly as billed", () => {
  assert.equal(
    PLACES_FIELD_MASK,
    "places.id,places.displayName,places.formattedAddress,places.location",
  );
});

test("keeps the place-details field mask limited to the four needed fields", () => {
  assert.equal(PLACE_DETAILS_FIELD_MASK, "id,displayName,formattedAddress,location");
});

test("sends the search field mask on searchAlongRoute", async () => {
  const { calls, fetchImpl } = recordingFetch({ places: [] });
  await createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl }).searchAlongRoute({
    textQuery: "petrol pump",
    encodedPolyline: "abc",
  });

  assert.equal(headerOf(calls[0]!.init, "X-Goog-FieldMask"), PLACES_FIELD_MASK);
});

test("sends the search field mask on searchNearby", async () => {
  const { calls, fetchImpl } = recordingFetch({ places: [] });
  await createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl }).searchNearby({
    lat: 12.9,
    lng: 77.5,
    radiusMeters: 2000,
    includedTypes: ["cafe"],
  });

  assert.equal(headerOf(calls[0]!.init, "X-Goog-FieldMask"), PLACES_FIELD_MASK);
});

test("sends the details field mask on getPlaceDetails", async () => {
  const { calls, fetchImpl } = recordingFetch({
    id: "p1",
    displayName: { text: "Cafe" },
    formattedAddress: "MG Road",
    location: { latitude: 12.9, longitude: 77.5 },
  });

  await createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl }).getPlaceDetails({
    placeId: "p1",
    sessionToken: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  });

  assert.equal(headerOf(calls[0]!.init, "X-Goog-FieldMask"), PLACE_DETAILS_FIELD_MASK);
});

/* -------------------------------------------------------------------------- */
/* Error mapping                                                               */
/* -------------------------------------------------------------------------- */

test("maps HTTP 429 to a quota failure", async () => {
  const { fetchImpl } = recordingFetch({}, { status: 429 });
  const provider = createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl });

  await withSilencedLogs(async () => {
    await assert.rejects(
      () => provider.searchNearby({ lat: 1, lng: 2, radiusMeters: 10, includedTypes: [] }),
      (error: unknown) => error instanceof MapsApiError && error.kind === "quota",
    );
  });
});

test("maps HTTP 403 to a permission failure", async () => {
  const { fetchImpl } = recordingFetch({}, { status: 403 });
  const provider = createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl });

  await withSilencedLogs(async () => {
    await assert.rejects(
      () => provider.searchNearby({ lat: 1, lng: 2, radiusMeters: 10, includedTypes: [] }),
      (error: unknown) => error instanceof MapsApiError && error.kind === "denied",
    );
  });
});

test("maps an unexpected HTTP status to an upstream failure", async () => {
  const { fetchImpl } = recordingFetch({}, { status: 500 });
  const provider = createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl });

  await withSilencedLogs(async () => {
    await assert.rejects(
      () => provider.searchNearby({ lat: 1, lng: 2, radiusMeters: 10, includedTypes: [] }),
      (error: unknown) => error instanceof MapsApiError && error.kind === "upstream",
    );
  });
});

test("maps a transport failure to a network error", async () => {
  const fetchImpl = (async () => {
    throw new Error("socket hang up");
  }) as unknown as typeof fetch;
  const provider = createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl });

  await withSilencedLogs(async () => {
    await assert.rejects(
      () => provider.getDirections({ origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 } }),
      (error: unknown) => error instanceof MapsApiError && error.kind === "network",
    );
  });
});

test("maps OVER_QUERY_LIMIT on a 200 response to a quota failure", async () => {
  const { fetchImpl } = recordingFetch({ status: "OVER_QUERY_LIMIT" });
  const provider = createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl });

  await withSilencedLogs(async () => {
    await assert.rejects(
      () => provider.getDirections({ origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 } }),
      (error: unknown) =>
        error instanceof MapsApiError &&
        error.kind === "quota" &&
        error.upstreamStatus === "OVER_QUERY_LIMIT",
    );
  });
});

test("maps REQUEST_DENIED to a permission failure", async () => {
  const { fetchImpl } = recordingFetch({ status: "REQUEST_DENIED" });
  const provider = createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl });

  await withSilencedLogs(async () => {
    await assert.rejects(
      () => provider.reverseGeocode({ lat: 1, lng: 2 }),
      (error: unknown) => error instanceof MapsApiError && error.kind === "denied",
    );
  });
});

test("treats ZERO_RESULTS as an empty answer rather than an error", async () => {
  const { fetchImpl } = recordingFetch({ status: "ZERO_RESULTS", results: [] });
  const provider = createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl });

  assert.equal(await provider.reverseGeocode({ lat: 1, lng: 2 }), null);
});

test("never puts the API key in the error or the log line", async () => {
  const { fetchImpl } = recordingFetch({ status: "REQUEST_DENIED", error_message: "bad key" });
  const provider = createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl });

  const logged = await withSilencedLogs(async () => {
    await assert.rejects(
      () => provider.getDirections({ origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 } }),
      (error: unknown) => {
        assert.ok(error instanceof MapsApiError);
        assert.ok(!error.message.includes(API_KEY), "error message leaked the key");
        return true;
      },
    );
  });

  assert.ok(logged.length > 0, "expected the failure to be logged");
  assert.ok(
    logged.every((line) => !line.includes(API_KEY)),
    "a log line leaked the key",
  );
});

/* -------------------------------------------------------------------------- */
/* Request shaping                                                             */
/* -------------------------------------------------------------------------- */

test("asks for traffic and alternatives only when there are no stopovers", async () => {
  const { calls, fetchImpl } = recordingFetch(DIRECTIONS_OK);
  await createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl }).getDirections({
    origin: { lat: 1, lng: 2 },
    destination: { lat: 3, lng: 4 },
    preferFastest: true,
    trafficAware: true,
  });

  const url = calls[0]!.url;
  assert.ok(url.includes("departure_time=now"));
  assert.ok(url.includes("alternatives=true"));
});

test("drops traffic and alternatives when stopovers are present", async () => {
  const { calls, fetchImpl } = recordingFetch(DIRECTIONS_OK);
  await createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl }).getDirections({
    origin: { lat: 1, lng: 2 },
    destination: { lat: 5, lng: 6 },
    waypoints: [{ lat: 3, lng: 4 }],
    preferFastest: true,
    trafficAware: true,
  });

  const url = calls[0]!.url;
  assert.ok(!url.includes("departure_time"), "traffic was requested with stopovers");
  assert.ok(!url.includes("alternatives"), "alternatives were requested with stopovers");
  assert.ok(url.includes(`waypoints=${encodeURIComponent("3,4")}`));
});

test("maps a directions payload onto the wire contract", async () => {
  const { fetchImpl } = recordingFetch(DIRECTIONS_OK);
  const result = await createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl }).getDirections({
    origin: { lat: 1, lng: 2 },
    destination: { lat: 3, lng: 4 },
  });

  const route = result.routes[0]!;
  assert.equal(route.overviewPolyline, "overview");

  const leg = route.legs[0]!;
  assert.equal(leg.distanceMeters, 1000);
  assert.equal(leg.durationSeconds, 600);
  assert.equal(leg.durationInTrafficSeconds, 720);

  const step = leg.steps[0]!;
  assert.equal(step.instructionHtml, "Turn <b>left</b>");
  assert.equal(step.polyline, "step1");
  assert.equal(step.maneuver, "turn-left");
  assert.deepEqual(step.startLocation, { lat: 1, lng: 2 });
});

test("drops steps with no polyline rather than drawing a shortcut through them", async () => {
  const { fetchImpl } = recordingFetch({
    status: "OK",
    routes: [
      {
        legs: [
          {
            start_location: { lat: 1, lng: 2 },
            end_location: { lat: 3, lng: 4 },
            steps: [
              { start_location: { lat: 1, lng: 2 }, end_location: { lat: 3, lng: 4 } },
            ],
          },
        ],
      },
    ],
  });

  const result = await createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl }).getDirections({
    origin: { lat: 1, lng: 2 },
    destination: { lat: 3, lng: 4 },
  });

  assert.equal(result.routes[0]!.legs[0]!.steps.length, 0);
});

test("maps autocomplete predictions to the flat client shape", async () => {
  const { calls, fetchImpl } = recordingFetch({
    suggestions: [
      {
        placePrediction: {
          placeId: "p1",
          structuredFormat: {
            mainText: { text: "Indiranagar" },
            secondaryText: { text: "Bengaluru, Karnataka" },
          },
        },
      },
      // A suggestion with no place id cannot be resolved, so it is dropped.
      { placePrediction: { structuredFormat: { mainText: { text: "orphan" } } } },
    ],
  });

  const predictions = await createGoogleMapsProvider({
    apiKey: API_KEY,
    fetchImpl,
  }).autocompletePlaces({
    input: "indira",
    sessionToken: "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed",
  });

  assert.deepEqual(predictions, [
    { placeId: "p1", primaryText: "Indiranagar", secondaryText: "Bengaluru, Karnataka" },
  ]);

  const body = JSON.parse(String(calls[0]!.init.body));
  assert.deepEqual(body.includedRegionCodes, ["in"]);
  assert.equal(body.sessionToken, "1b9d6bcd-bbfd-4b2d-9b5d-ab8dfbbd4bed");
});

test("returns null details when the place has no coordinates", async () => {
  const { fetchImpl } = recordingFetch({ id: "p1", displayName: { text: "Nowhere" } });
  const details = await createGoogleMapsProvider({ apiKey: API_KEY, fetchImpl }).getPlaceDetails({
    placeId: "p1",
  });

  assert.equal(details, null);
});
