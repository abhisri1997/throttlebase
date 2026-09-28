import test from "node:test";
import assert from "node:assert/strict";
import { segmentRide, STOP_MIN_S } from "./segmentRide.js";
import { haversineMeters } from "../../utils/polyline.js";

import {
  at,
  crawl,
  INDOOR_ACCURACY_M,
  M_PER_DEG_LAT,
  M_PER_DEG_LNG,
  minutes,
  ORIGIN,
  ride,
  RIDING_ACCURACY_M,
  track,
  wait,
  walkOutAndBack,
  type Leg,
} from "./testTracks.js";

/* -------------------------------------------------------------------------- */

test("a ride without stops is all riding", () => {
  const { stops, riding, ridingTimeS, ridingDistanceM } = segmentRide(track(ride(5000)));

  assert.equal(stops.length, 0);
  assert.equal(riding.length, 1);
  assert.equal(minutes(ridingTimeS), 7.5);
  assert.ok(Math.abs(ridingDistanceM - 5000) < 30);
});

test("parking and walking off to a place is a stop, and none of it is riding", () => {
  const samples = track(ride(3000), wait(1), walkOutAndBack(300), wait(1), ride(3000));

  const { stops, riding, ridingTimeS, ridingDistanceM } = segmentRide(samples);

  assert.equal(stops.length, 1);
  const [stop] = stops;
  assert.equal(stop!.walkedAway, true);
  assert.ok(stop!.farthestM >= 280, `walked ${stop!.farthestM} m`);
  assert.ok(haversineMeters(stop!.parkedAt, { lat: ORIGIN.lat, lng: ORIGIN.lng + 3000 / M_PER_DEG_LNG }) < 5);
  assert.equal(riding.length, 2, "riding in and riding out");
  assert.ok(Math.abs(ridingTimeS - 540) < 10, `4.5 min each way, not the ~9 min on foot: ${ridingTimeS} s`);
  assert.ok(Math.abs(ridingDistanceM - 6000) < 80, `rode ${ridingDistanceM} m`);
});

test("a long stop beside the bike is a stop, though nobody walked anywhere", () => {
  const { stops } = segmentRide(track(ride(3000), wait(8), ride(3000)));

  assert.equal(stops.length, 1);
  assert.equal(stops[0]!.walkedAway, false);
  assert.ok(Math.abs(stops[0]!.durationS - 8 * 60) < 10, `stopped ${stops[0]!.durationS} s`);
});

test("a stop under five minutes is part of the ride", () => {
  const { stops, ridingTimeS } = segmentRide(track(ride(3000), wait(4), ride(3000)));

  assert.equal(STOP_MIN_S, 5 * 60);
  assert.equal(stops.length, 0);
  assert.equal(minutes(ridingTimeS), 13, "a signal or a stretch is ridden time");
});

test("ten minutes crawling through a jam is riding, not a stop", () => {
  const { stops, ridingTimeS } = segmentRide(track(ride(3000), crawl(700, 4), ride(3000)));

  assert.equal(stops.length, 0);
  assert.ok(minutes(ridingTimeS) > 18);
});

test("a jam that barely moves for minutes is still riding: the rider never got off", () => {
  const { stops } = segmentRide(track(ride(3000), crawl(40, 3), wait(6), crawl(20, 3), ride(3000)));

  assert.equal(stops.length, 0);
});

test("a GPS blip that reads fast while walking indoors does not end the stop", () => {
  const blip: Leg = (from) => ({
    samples: [at({ ...from, tMs: from.tMs + 15_000 }, 18.7, INDOOR_ACCURACY_M)],
    end: { ...from, tMs: from.tMs + 15_000 },
  });

  const { stops } = segmentRide(track(ride(3000), walkOutAndBack(200), blip, walkOutAndBack(200), ride(3000)));

  assert.equal(stops.length, 1);
});

test("riding off from somewhere else after a long pause is not a stop", () => {
  // Pushed or towed 500 m, say: the rider didn't come back to where they stopped.
  const moved: Leg = (from) => ({ samples: [], end: { ...from, eastM: from.eastM + 500, tMs: from.tMs + 8 * 60_000 } });

  assert.equal(segmentRide(track(ride(3000), moved, ride(3000))).stops.length, 0);
});

test("waiting at the start and walking about at the destination are not riding", () => {
  const { riding, ridingTimeS, stops } = segmentRide(track(wait(10), ride(5000), wait(2), walkOutAndBack(150)));

  assert.equal(stops.length, 0, "the ends are the start and destination, not stops");
  assert.ok(Math.abs(ridingTimeS - 450) < 10, `rode ${ridingTimeS} s`);
  assert.ok(
    riding.flat().every((sample) => sample.lat === ORIGIN.lat),
    "nothing from the walk at the destination",
  );
});

test("a stop is matched to the planned stop the rider walked to", () => {
  const plannedStop = {
    id: "infosys",
    // Beside the far end of the walk: 290 m in from where the bike was parked.
    lat: ORIGIN.lat + 290 / M_PER_DEG_LAT,
    lng: ORIGIN.lng + 3000 / M_PER_DEG_LNG,
  };
  const elsewhere = { id: "cafe", lat: ORIGIN.lat + 0.05, lng: ORIGIN.lng };

  const { stops } = segmentRide(track(ride(3000), walkOutAndBack(300), ride(3000)), [elsewhere, plannedStop]);

  assert.equal(stops[0]!.plannedStopId, "infosys");
});

test("a stop far from every planned stop was one the rider found", () => {
  const plannedStop = { id: "cafe", lat: ORIGIN.lat + 0.05, lng: ORIGIN.lng };

  const { stops } = segmentRide(track(ride(3000), wait(7), ride(3000)), [plannedStop]);

  assert.equal(stops[0]!.plannedStopId, null);
});

test("pulling away counts from where the rider got back on, not the first fast fix", () => {
  // As recorded at Infosys: back beside the bike, then already 63 m on by the
  // first fix at riding speed.
  const pullAway: Leg = (from) => {
    const beside = { ...from, eastM: from.eastM + 22, tMs: from.tMs + 78_000 };
    const moving = { ...from, eastM: from.eastM + 63, tMs: beside.tMs + 6_000 };
    return { samples: [at(beside, null, INDOOR_ACCURACY_M), at(moving, 23, INDOOR_ACCURACY_M)], end: moving };
  };

  const { stops } = segmentRide(track(ride(3000), walkOutAndBack(300), pullAway, ride(3000)));

  assert.equal(stops.length, 1);
});

test("pulling out in short bursts through traffic still ends the stop at the bike", () => {
  // Back at the bike, then 20-second bursts broken by traffic, so the first
  // sustained riding is far down the road.
  const burst = ride(120, 25);
  const dawdle = crawl(20, 5);
  const { stops, ridingDistanceM } = segmentRide(
    track(ride(3000), walkOutAndBack(300), burst, dawdle, burst, dawdle, burst, dawdle, ride(3000)),
  );

  assert.equal(stops.length, 1);
  assert.ok(ridingDistanceM > 6_300, `the pull-out is ridden road: ${ridingDistanceM} m`);
});

test("a slow roll on to the parking spot still finds the bike the rider came back to", () => {
  // Riding ends, then the bike rolls on ~60 m to where it is parked.
  const rollIn: Leg = (from) => {
    const creep = { ...from, eastM: from.eastM + 25, tMs: from.tMs + 11_000 };
    const spot = { ...from, eastM: from.eastM + 58, tMs: from.tMs + 52_000 };
    return { samples: [at(creep, 2, RIDING_ACCURACY_M), at(spot, 0, RIDING_ACCURACY_M)], end: spot };
  };
  const parkedSpot = { lat: ORIGIN.lat, lng: ORIGIN.lng + 3058 / M_PER_DEG_LNG };

  const { stops } = segmentRide(track(ride(3000), rollIn, walkOutAndBack(400), ride(3000)));

  assert.equal(stops.length, 1);
  assert.ok(haversineMeters(stops[0]!.parkedAt, parkedSpot) < 5, "the bike, not where riding ended");
  assert.ok(stops[0]!.farthestM >= 390, `walked ${stops[0]!.farthestM} m`);
});

test("a jump no motorcycle could make adds no distance", () => {
  // A dev simulation and a phone feeding one track at once: fixes flip between two cities.
  const teleport: Leg = (from) => {
    // Two fixes from the other source, which agree with each other, so neither reads as a lone spike.
    const away = { ...from, eastM: from.eastM + 900_000, tMs: from.tMs + 2_000 };
    const stillAway = { ...away, eastM: away.eastM + 20, tMs: away.tMs + 2_000 };
    const back = { ...from, eastM: from.eastM + 20, tMs: stillAway.tMs + 2_000 };
    return {
      samples: [at(away, 40, RIDING_ACCURACY_M), at(stillAway, 40, RIDING_ACCURACY_M), at(back, 40, RIDING_ACCURACY_M)],
      end: back,
    };
  };

  const { ridingDistanceM } = segmentRide(track(ride(3000), teleport, teleport, ride(3000)));

  assert.ok(ridingDistanceM < 6_200, `rode ${ridingDistanceM} m`);
});

test("a track with no riding in it is left as it is", () => {
  const samples = track(walkOutAndBack(100));

  const { riding, stops } = segmentRide(samples);

  assert.equal(stops.length, 0);
  assert.equal(riding.length, 1);
  assert.equal(riding[0]!.length, samples.length);
});
