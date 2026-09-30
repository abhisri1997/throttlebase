import test from "node:test";
import assert from "node:assert/strict";
import { overviewCamera } from "./overviewCamera";

const viewport = { width: 400, height: 800, paddingTop: 100, paddingBottom: 200, margin: 48 };

test("centres on the route and zooms so all of it fits", () => {
  // About 5 km north–south around Bengaluru.
  const camera = overviewCamera(
    [
      { latitude: 12.9, longitude: 77.6 },
      { latitude: 12.945, longitude: 77.62 },
    ],
    viewport,
  );
  assert.ok(camera);
  assert.ok(Math.abs(camera.center.latitude - 12.9225) < 0.001);
  assert.ok(Math.abs(camera.center.longitude - 77.61) < 1e-9);
  // Tall and narrow: height decides. 404 units for ~0.000124 of the world's height.
  assert.ok(camera.zoom > 13 && camera.zoom < 14, `zoom ${camera.zoom}`);
});

test("a longer route zooms further out", () => {
  const short = overviewCamera([{ latitude: 12.9, longitude: 77.6 }, { latitude: 12.91, longitude: 77.61 }], viewport)!;
  const long = overviewCamera([{ latitude: 12.9, longitude: 77.6 }, { latitude: 13.4, longitude: 78.1 }], viewport)!;
  assert.ok(long.zoom < short.zoom);
});

test("a single point gets a close zoom rather than infinity", () => {
  const camera = overviewCamera([{ latitude: 12.9, longitude: 77.6 }], viewport)!;
  assert.equal(camera.zoom, 16);
  assert.ok(Math.abs(camera.center.latitude - 12.9) < 1e-9);
  assert.equal(camera.center.longitude, 77.6);
});

test("nothing to frame gives no camera", () => {
  assert.equal(overviewCamera([], viewport), null);
});
