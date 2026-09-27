import test from "node:test";
import assert from "node:assert/strict";
import { PEER_COLORS, peerAppearance } from "./peerAppearance";

const UUIDS = [
  "6f9619ff-8b86-d011-b42d-00c04fc964ff",
  "6f9619ff-8b86-d011-b42d-00c04fc964fe",
  "a1b2c3d4-e5f6-4a5b-8c9d-0e1f2a3b4c5d",
  "00000000-0000-0000-0000-000000000001",
  "00000000-0000-0000-0000-000000000002",
];

test("the same rider always looks the same", () => {
  const first = peerAppearance("rider-1", "Abhinav");
  const second = peerAppearance("rider-1", "Abhinav");

  assert.deepEqual(first, second);
});

test("a rider keeps their colour when they change their display name", () => {
  const before = peerAppearance("rider-1", "Abhinav");
  const after = peerAppearance("rider-1", "Abhinav Kumar");

  assert.equal(before.color, after.color);
});

test("every colour comes from the palette", () => {
  for (const id of UUIDS) {
    assert.ok(
      (PEER_COLORS as readonly string[]).includes(peerAppearance(id).color),
      `${id} produced a colour outside the palette`,
    );
  }
});

test("ids differing by one character do not collide", () => {
  // Summing character codes would give these two the same colour.
  const [a, b] = UUIDS;
  assert.notEqual(peerAppearance(a!).color, peerAppearance(b!).color);
});

test("a realistic crew spreads across the palette", () => {
  const colors = new Set(UUIDS.map((id) => peerAppearance(id).color));

  assert.ok(
    colors.size >= 4,
    `five riders should not share colours this heavily; got ${colors.size} distinct`,
  );
});

test("the initial comes from the display name", () => {
  assert.equal(peerAppearance("x", "Abhinav").initial, "A");
  assert.equal(peerAppearance("x", "  priya ").initial, "P");
  assert.equal(peerAppearance("x", "abhi").initial, "A");
});

test("a missing or blank name still yields something drawable", () => {
  assert.equal(peerAppearance("x").initial, "?");
  assert.equal(peerAppearance("x", "   ").initial, "?");
});
