import test from "node:test";
import assert from "node:assert/strict";
import { segmentRide, STOP_MIN_S, WALKED_AWAY_M } from "./segmentRide.js";
import { haversineMeters } from "../../utils/polyline.js";

import {
  at,
  crawl,
  doing,
  inch,
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

test("a walk with no riding in it is no riding at all", () => {
  const { riding, stops, ridingTimeS, ridingDistanceM } = segmentRide(track(walkOutAndBack(100)));

  assert.deepEqual(riding, []);
  assert.deepEqual(stops, []);
  assert.equal(ridingTimeS, 0);
  assert.equal(ridingDistanceM, 0);
});

test("a few fixes far apart count only the steps covered at riding pace", () => {
  // The phone barely reported: one step ridden at 30 km/h, and a long silence
  // that covered 400 m in an hour (the phone left somewhere, not a ride).
  const sparse: Leg = (from) => {
    const rode = { ...from, eastM: from.eastM + 5_000, tMs: from.tMs + 10 * 60_000 };
    const idle = { ...rode, eastM: rode.eastM + 400, tMs: rode.tMs + 60 * 60_000 };
    return { samples: [at(rode, null, RIDING_ACCURACY_M), at(idle, null, RIDING_ACCURACY_M)], end: idle };
  };

  const { ridingTimeS, ridingDistanceM } = segmentRide(track(sparse));

  assert.ok(Math.abs(ridingTimeS - 600) < 5, `rode ${ridingTimeS} s, not the hour of silence`);
  assert.ok(Math.abs(ridingDistanceM - 5_000) < 30, `rode ${ridingDistanceM} m`);
});

/* ---------------------------- motion readings ----------------------------- */

test("a rider who walked off indoors is at a stop, though GPS barely moved", () => {
  const legs = (activity?: "walking"): Leg[] => {
    const shuffle = walkOutAndBack(20);
    const onFoot = activity ? doing(activity, shuffle) : shuffle;
    return [ride(3000), wait(2), onFoot, wait(2), onFoot, wait(2), ride(3000)];
  };

  const { stops } = segmentRide(track(...legs("walking")));

  assert.equal(stops.length, 1);
  assert.equal(stops[0]!.walkedAway, true, "the phone felt the walking");
  assert.ok(stops[0]!.farthestM < WALKED_AWAY_M, `GPS put them ${stops[0]!.farthestM} m from the bike`);
  assert.equal(segmentRide(track(...legs())).stops[0]!.walkedAway, false, "GPS alone can't tell");
});

test("one walking reading is not enough to say the rider got off", () => {
  const { stops } = segmentRide(track(ride(3000), wait(3), doing("walking", inch(1)), wait(3), ride(3000)));

  assert.equal(stops.length, 1);
  assert.equal(stops[0]!.walkedAway, false, "one reading could be the rider shifting on the bike");
});

test("walking at a stop makes it one, though the rider rode on from further along the parking", () => {
  // Riding ends, the bike rolls ~60 m on to its spot, and the rider rides off from there.
  const rollIn: Leg = (from) => {
    const creep = { ...from, eastM: from.eastM + 25, tMs: from.tMs + 11_000 };
    const spot = { ...from, eastM: from.eastM + 58, tMs: from.tMs + 52_000 };
    return { samples: [at(creep, 2, RIDING_ACCURACY_M), at(spot, 0, RIDING_ACCURACY_M)], end: spot };
  };
  const pause = walkOutAndBack(20);

  const withReadings = segmentRide(track(ride(3000), rollIn, wait(3), doing("walking", pause), wait(3), ride(3000)));
  const gpsOnly = segmentRide(track(ride(3000), rollIn, wait(3), pause, wait(3), ride(3000)));

  assert.equal(withReadings.stops.length, 1);
  assert.equal(withReadings.stops[0]!.walkedAway, true);
  assert.equal(gpsOnly.stops.length, 0, "without the readings it looks like a jam");
});

test("a standstill the phone felt as riding is part of the ride, though GPS alone would call it a stop", () => {
  const withReadings = segmentRide(track(ride(3000), doing("automotive", inch(6)), ride(3000)));
  const gpsOnly = segmentRide(track(ride(3000), inch(6), ride(3000)));

  assert.equal(withReadings.stops.length, 0, "the rider never got off");
  assert.equal(withReadings.riding.length, 1);
  assert.ok(minutes(withReadings.ridingTimeS) > 14, `rode ${minutes(withReadings.ridingTimeS)} min`);
  assert.equal(gpsOnly.stops.length, 1, "edging a few metres in six minutes reads as a stop");
});

test("readings of standing still say nothing either way", () => {
  const { stops } = segmentRide(track(ride(3000), doing("stationary", inch(6)), ride(3000)));

  assert.equal(stops.length, 1, "GPS decides, as without readings");
  assert.equal(stops[0]!.walkedAway, false);
});

test("walking readings on a pause under five minutes still leave it part of the ride", () => {
  const { stops } = segmentRide(track(ride(3000), wait(1), doing("walking", walkOutAndBack(20)), wait(2), ride(3000)));

  assert.equal(stops.length, 0);
});

test("a long stop beside the bike stays a stop when the phone felt the ride either side of it", () => {
  // Nothing is recorded while parked, so the only readings in the pause are
  // from pulling away: they say nothing about the eight minutes before.
  const { stops } = segmentRide(track(doing("automotive", ride(3000)), wait(8), doing("automotive", ride(3000))));

  assert.equal(stops.length, 1);
});
