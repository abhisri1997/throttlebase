import test from "node:test";
import assert from "node:assert/strict";
import { highlightChips, itineraryRows, routeFacts, routeHeadline, routeShapePath, splitPlaceName, viaLine } from "./routeSummary";

const route = {
  title: "Ride to home…",
  start_name: "Electronic City, Doddathoguru",
  end_name: "HSR Layout, Bengaluru",
  distance_km: "13.60",
  ridden_duration_s: 2160,
  via: ["Hosa Road Junction"],
  highlights: [],
};

test("a route is headed by where it goes", () => {
  assert.equal(routeHeadline(route), "Electronic City → HSR Layout");
});

test("a route that ends where it starts is a loop", () => {
  assert.equal(
    routeHeadline({ ...route, end_name: "Electronic City, Konappana Agrahara" }),
    "Loop from Electronic City",
  );
});

test("a route with an end it can't name falls back to its title", () => {
  assert.equal(routeHeadline({ ...route, start_name: null }), "Ride to home…");
});

test("the facts line gives distance, ride time and stops, skipping what is unknown", () => {
  assert.deepEqual(routeFacts(route), ["14 km", "36 min", "1 stop"]);
  assert.deepEqual(routeFacts({ ...route, via: ["A", "B"] }).at(-1), "2 stops");
  assert.deepEqual(routeFacts({ ...route, distance_km: null, ridden_duration_s: null, via: [] }), []);
});

test("a card shows up to three highlights and counts the rest", () => {
  const chips = highlightChips(["scenic_road", "quiet", "great_stops", "twisties", "well_lit"], 3);

  assert.deepEqual(chips.labels, ["Scenic road", "Quiet, little traffic", "Great stops"]);
  assert.equal(chips.more, 2);
});

test("an unknown highlight from a newer server is ignored", () => {
  assert.deepEqual(highlightChips(["scenic_road", "offroad"], 3), { labels: ["Scenic road"], more: 0 });
});

test("the route's shape is drawn inside the box, keeping its proportions", () => {
  // Due north for ~11 km: a tall, thin shape.
  const path = routeShapePath(
    [
      [77.6, 12.9],
      [77.6, 13.0],
    ],
    { width: 300, height: 80, padding: 10 },
  );

  assert.ok(path);
  const points = path.replace(/[ML]/g, " ").trim().split(/\s+/).map(Number);
  const [x1, y1, x2, y2] = points as [number, number, number, number];
  assert.equal(x1, x2, "a north-south line is vertical");
  assert.ok(y1 > y2, "north is up");
  assert.ok(Math.min(y1, y2) >= 10 && Math.max(y1, y2) <= 70, "stays inside the padding");
  assert.ok(Math.abs(x1 - 150) < 0.01, "centred across");
});

test("a route with fewer than two points has no shape", () => {
  assert.equal(routeShapePath([[77.6, 12.9]], { width: 300, height: 80, padding: 10 }), null);
  assert.equal(routeShapePath([], { width: 300, height: 80, padding: 10 }), null);
});

test("the itinerary runs from A through the numbered stops to B, with distances and notes", () => {
  const rows = itineraryRows({
    start_name: "Bengaluru, Kengeri",
    end_name: "Sulthan Bathery",
    distance_km: "281.40",
    stops: [
      { position: 1, name: "Mysuru", note: "Best dosa on the way", distance_from_start_km: 146 },
      { position: 2, name: null, note: null, distance_from_start_km: 205.3 },
    ],
  });

  assert.deepEqual(
    rows.map((row) => [row.marker, row.kind, row.name, row.distance, row.note]),
    [
      ["A", "start", "Bengaluru, Kengeri", "0 km", null],
      ["1", "stop", "Mysuru", "146 km", "Best dosa on the way"],
      ["2", "stop", "Stop 2", "205 km", null],
      ["B", "destination", "Sulthan Bathery", "281 km", null],
    ],
  );
});

test("an itinerary with unnamed ends still reads Start and Destination", () => {
  const rows = itineraryRows({ start_name: null, end_name: null, distance_km: null, stops: [] });

  assert.deepEqual(
    rows.map((row) => [row.marker, row.name, row.distance]),
    [
      ["A", "Start", "0 km"],
      ["B", "Destination", null],
    ],
  );
});

test("the via line names each stop by its place, not its full address", () => {
  assert.equal(
    viaLine(["Infosys Campus Building 37, Infosys Internal Road, Konappana Agrahara", "Mysuru"]),
    "via Infosys Campus Building 37 · Mysuru",
  );
  assert.equal(viaLine([]), null);
});

test("a stop named by its full address leads with the place, the rest as detail", () => {
  const rows = itineraryRows({
    start_name: "Electronic City, Doddathoguru",
    end_name: "HSR Layout, Bengaluru",
    distance_km: 14,
    stops: [
      {
        position: 1,
        name: "Infosys Campus Building 37, Infosys Internal Road, Konappana Agrahara, Karnataka, India",
        note: null,
        distance_from_start_km: null,
      },
    ],
  });

  assert.equal(rows[1]!.name, "Infosys Campus Building 37");
  assert.equal(rows[1]!.detail, "Infosys Internal Road, Konappana Agrahara, Karnataka, India");
  assert.equal(rows[1]!.distance, null);
  assert.equal(rows[0]!.detail, null, "an area name like the start's is shown whole");
});

test("a full address reads as its place, with the rest as detail", () => {
  assert.deepEqual(splitPlaceName("Infosys Campus Building 37, Infosys Internal Road, Konappana Agrahara"), {
    name: "Infosys Campus Building 37",
    detail: "Infosys Internal Road, Konappana Agrahara",
  });
  assert.deepEqual(splitPlaceName("Mysuru"), { name: "Mysuru", detail: null });
});
