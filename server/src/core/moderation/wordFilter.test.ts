import test from "node:test";
import assert from "node:assert/strict";
import { BLOCKED_TERMS } from "./blockedTerms.js";
import { createWordFilter, normalizeForFilter } from "./wordFilter.js";

const filter = createWordFilter(["idiot", "go die"]);

test("clean text passes", () => {
  assert.equal(filter.findBlockedTerm("Great ride to Nandi Hills this morning!"), null);
});

test("a blocked word is found whatever its case", () => {
  assert.equal(filter.findBlockedTerm("What an IDIOT."), "idiot");
});

test("common disguises are seen through", () => {
  for (const text of ["id10t", "idi0t!", "iiidiooot", "ídíót", "i.d.i.o.t", "i d i o t"]) {
    assert.equal(filter.findBlockedTerm(text), "idiot", text);
  }
});

test("only whole words match, so innocent words containing a term pass", () => {
  const scunthorpe = createWordFilter(["ass"]);
  assert.equal(scunthorpe.findBlockedTerm("Took the pass over the ghats"), null);
  assert.equal(scunthorpe.findBlockedTerm("Class ride, massive views"), null);
  assert.equal(scunthorpe.findBlockedTerm("what an ass"), "ass");
});

test("a phrase matches only as those words in a row", () => {
  assert.equal(filter.findBlockedTerm("Just go   die."), "go die");
  assert.equal(filter.findBlockedTerm("Let's go, die-hard fans"), null);
  assert.equal(filter.findBlockedTerm("go ride and die happy"), null);
});

test("normalising strips what disguises a word", () => {
  assert.equal(normalizeForFilter("FöÖl 4 $ure"), "fol a sure");
});

test("the starting list is lower case and has no duplicates", () => {
  assert.deepEqual([...BLOCKED_TERMS], BLOCKED_TERMS.map((term) => term.toLowerCase()));
  assert.equal(new Set(BLOCKED_TERMS).size, BLOCKED_TERMS.length);
});

test("everyday riding talk passes the starting list", () => {
  const starting = createWordFilter(BLOCKED_TERMS);
  for (const text of [
    "Killer twisties on the ghat road, the rider ahead was brilliant",
    "Assemble at 6 at Hebbal flyover, grape juice stop at Nandi",
    "Therapist said I need more rides. Class weekend!",
    "Scunthorpe to Bengaluru, via the Grapevine cafe",
  ]) {
    assert.equal(starting.findBlockedTerm(text), null, text);
  }
});
