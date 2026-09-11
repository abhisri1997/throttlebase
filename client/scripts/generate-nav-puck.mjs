#!/usr/bin/env node
/**
 * Draws the navigation rider puck — a blue disc with a white rim, a soft
 * shadow, and a white chevron pointing north — at 1x, 2x and 3x.
 * Plain Node, no image tooling:
 *
 *   node scripts/generate-nav-puck.mjs
 */
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const OUTPUT_DIR = join(dirname(fileURLToPath(import.meta.url)), "..", "assets", "navigation");
const FILE_STEM = "rider-puck";
const SIZE_POINTS = 48;
const SCALES = [1, 2, 3];
/** Samples per pixel along each axis, for anti-aliased edges. */
const SUPERSAMPLING = 4;

// Geometry in points, relative to the centre, y pointing down.
const SHADOW_OUTER_RADIUS = 22;
const RIM_RADIUS = 17;
const DISC_RADIUS = 14;
const CHEVRON = [
  [0, -9],
  [7, 8],
  [0, 4],
  [-7, 8],
];

const SHADOW = { rgb: [0, 0, 0], alpha: 0.3 };
const RIM = { rgb: [255, 255, 255], alpha: 1 };
const DISC = { rgb: [66, 133, 244], alpha: 1 };
const ARROW = { rgb: [255, 255, 255], alpha: 1 };

const distance = (x, y) => Math.hypot(x, y);

const insidePolygon = (x, y, polygon) => {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i, i += 1) {
    const [xi, yi] = polygon[i];
    const [xj, yj] = polygon[j];
    if (yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
};

/** Each layer returns its coverage (0–1) at a point; later layers paint over earlier ones. */
const LAYERS = [
  {
    paint: SHADOW,
    coverage: (x, y) => {
      const d = distance(x, y);
      if (d <= RIM_RADIUS) return 1;
      if (d >= SHADOW_OUTER_RADIUS) return 0;
      return (1 - (d - RIM_RADIUS) / (SHADOW_OUTER_RADIUS - RIM_RADIUS)) ** 2;
    },
  },
  { paint: RIM, coverage: (x, y) => (distance(x, y) <= RIM_RADIUS ? 1 : 0) },
  { paint: DISC, coverage: (x, y) => (distance(x, y) <= DISC_RADIUS ? 1 : 0) },
  { paint: ARROW, coverage: (x, y) => (insidePolygon(x, y, CHEVRON) ? 1 : 0) },
];

/** Premultiplied RGBA of one sample, compositing every layer "over" the ones below. */
const sampleAt = (x, y) =>
  LAYERS.reduce(
    (below, { paint, coverage }) => {
      const alpha = paint.alpha * coverage(x, y);
      return [
        paint.rgb[0] * alpha + below[0] * (1 - alpha),
        paint.rgb[1] * alpha + below[1] * (1 - alpha),
        paint.rgb[2] * alpha + below[2] * (1 - alpha),
        alpha + below[3] * (1 - alpha),
      ];
    },
    [0, 0, 0, 0],
  );

const renderPixels = (scale) => {
  const size = SIZE_POINTS * scale;
  const pixels = Buffer.alloc(size * size * 4);
  const samples = SUPERSAMPLING * SUPERSAMPLING;

  for (let py = 0; py < size; py += 1) {
    for (let px = 0; px < size; px += 1) {
      const sum = [0, 0, 0, 0];
      for (let sy = 0; sy < SUPERSAMPLING; sy += 1) {
        for (let sx = 0; sx < SUPERSAMPLING; sx += 1) {
          const x = (px + (sx + 0.5) / SUPERSAMPLING) / scale - SIZE_POINTS / 2;
          const y = (py + (sy + 0.5) / SUPERSAMPLING) / scale - SIZE_POINTS / 2;
          const sample = sampleAt(x, y);
          for (let c = 0; c < 4; c += 1) sum[c] += sample[c];
        }
      }

      const alpha = sum[3] / samples;
      const offset = (py * size + px) * 4;
      // PNG stores straight (non-premultiplied) alpha.
      for (let c = 0; c < 3; c += 1) {
        pixels[offset + c] = alpha > 0 ? Math.round(sum[c] / samples / alpha) : 0;
      }
      pixels[offset + 3] = Math.round(alpha * 255);
    }
  }

  return { size, pixels };
};

const CRC_TABLE = Array.from({ length: 256 }, (_, n) => {
  let c = n;
  for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  return c >>> 0;
});

const crc32 = (buffer) => {
  let crc = 0xffffffff;
  for (const byte of buffer) crc = CRC_TABLE[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
};

const chunk = (type, data) => {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length);
  const body = Buffer.concat([Buffer.from(type, "ascii"), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body));
  return Buffer.concat([length, body, crc]);
};

const encodePng = ({ size, pixels }) => {
  const header = Buffer.alloc(13);
  header.writeUInt32BE(size, 0);
  header.writeUInt32BE(size, 4);
  header[8] = 8; // bit depth
  header[9] = 6; // RGBA

  const rowLength = size * 4;
  const raw = Buffer.alloc((rowLength + 1) * size);
  for (let row = 0; row < size; row += 1) {
    raw[row * (rowLength + 1)] = 0; // filter: none
    pixels.copy(raw, row * (rowLength + 1) + 1, row * rowLength, (row + 1) * rowLength);
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", header),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
};

mkdirSync(OUTPUT_DIR, { recursive: true });

for (const scale of SCALES) {
  const suffix = scale === 1 ? "" : `@${scale}x`;
  const file = join(OUTPUT_DIR, `${FILE_STEM}${suffix}.png`);
  writeFileSync(file, encodePng(renderPixels(scale)));
  process.stdout.write(`wrote ${file}\n`);
}
