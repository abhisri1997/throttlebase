import test from "node:test";
import assert from "node:assert/strict";
import { decodeHtmlEntities, parseInstructionHtml } from "./instructionText";

const NOTE_DIV = '<div style="font-size:0.9em">';

test("separates Google's note from the instruction instead of gluing them together", () => {
  const parsed = parseInstructionHtml(
    `Turn <b>left</b> onto <b>MG Rd</b>${NOTE_DIV}Pass by Indian Oil (on the left)</div>`,
  );

  assert.deepEqual(parsed, {
    primary: "Turn left onto MG Rd",
    roadName: "MG Rd",
    note: "Pass by Indian Oil (on the left)",
  });
});

test("reproduces the run-on banner from the screenshots, now split", () => {
  const parsed = parseInstructionHtml(
    `Head <b>southwest</b> on <b>Kurinji Andavar Temple Rd</b> toward <b>Chettiar Park Rd</b>${NOTE_DIV}Pass by Stunning View Modern Amenities</div>`,
  );

  assert.equal(
    parsed.primary,
    "Head southwest on Kurinji Andavar Temple Rd toward Chettiar Park Rd",
  );
  assert.equal(parsed.roadName, "Kurinji Andavar Temple Rd");
  assert.equal(parsed.note, "Pass by Stunning View Modern Amenities");
});

test("keeps destination notes and joins several notes", () => {
  assert.equal(
    parseInstructionHtml(`Turn <b>left</b>${NOTE_DIV}Destination will be on the right</div>`)
      .note,
    "Destination will be on the right",
  );

  assert.equal(
    parseInstructionHtml(`Continue${NOTE_DIV}Toll road</div>${NOTE_DIV}Pass by a lake</div>`)
      .note,
    "Toll road · Pass by a lake",
  );
});

test("decodes entities and drops word-break hints without adding spaces", () => {
  const parsed = parseInstructionHtml(
    "Continue onto <b>NH<wbr/>83</b> &amp; keep&nbsp;left at <b>Anna&#39;s Corner</b>",
  );

  assert.equal(parsed.primary, "Continue onto NH83 & keep left at Anna's Corner");
  assert.equal(parsed.roadName, "NH83");
});

test("leaves malformed numeric entities alone", () => {
  assert.equal(decodeHtmlEntities("&#99999999; &#x41;"), "&#99999999; A");
});

test("falls back safely on empty input and note-only steps", () => {
  assert.deepEqual(parseInstructionHtml(undefined), {
    primary: "Continue",
    roadName: null,
    note: null,
  });

  assert.deepEqual(parseInstructionHtml(`${NOTE_DIV}Restricted usage road</div>`), {
    primary: "Restricted usage road",
    roadName: null,
    note: null,
  });
});
