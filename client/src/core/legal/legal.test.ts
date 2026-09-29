import test from "node:test";
import assert from "node:assert/strict";
import { list, paragraph, placeholdersIn, toMarkdown, type LegalDocument } from "./legalDocument";
import { isLegalPath, LEGAL_PAGES } from "./legalPages";
import { PRIVACY_POLICY } from "./privacyPolicy";
import { TERMS } from "./terms";

const sample = (status: LegalDocument["status"]): LegalDocument => ({
  title: "Sample",
  version: "2026-09-29",
  status,
  summary: ["Short point."],
  sections: [
    { heading: "First", blocks: [paragraph("Contact [CONTACT EMAIL]."), list("one", "two")] },
  ],
});

test("the legal pages are open at /privacy and /terms, with or without a trailing slash", () => {
  assert.equal(isLegalPath("/privacy"), true);
  assert.equal(isLegalPath("/terms/"), true);
  assert.equal(isLegalPath("/privacy-settings"), false);
  assert.equal(isLegalPath("/"), false);
  assert.equal(isLegalPath("/feed"), false);
  assert.equal(LEGAL_PAGES.get("/privacy"), PRIVACY_POLICY);
  assert.equal(LEGAL_PAGES.get("/terms"), TERMS);
});

test("a document renders as Markdown with its summary, sections and lists", () => {
  const markdown = toMarkdown(sample("final"));
  assert.equal(
    markdown,
    [
      "# Sample",
      "",
      "Version 2026-09-29",
      "",
      "## In short",
      "",
      "- Short point.",
      "",
      "## First",
      "",
      "Contact [CONTACT EMAIL].",
      "",
      "- one",
      "- two",
      "",
    ].join("\n"),
  );
});

test("a draft is marked as not legal advice", () => {
  assert.match(toMarkdown(sample("draft")), /DRAFT — NOT LEGAL ADVICE/);
  assert.doesNotMatch(toMarkdown(sample("final")), /DRAFT/);
});

test("placeholders left for a human are listed once each", () => {
  assert.deepEqual(placeholdersIn(sample("draft")), ["[CONTACT EMAIL]"]);
});

for (const document of [PRIVACY_POLICY, TERMS]) {
  test(`${document.title}: dated version, a grievance officer, and no empty sections`, () => {
    assert.match(document.version, /^\d{4}-\d{2}-\d{2}$/);
    assert.ok(document.summary.length > 0);
    assert.ok(document.sections.some((section) => section.heading === "Grievance Officer"));
    for (const section of document.sections) {
      assert.ok(section.blocks.length > 0, `"${section.heading}" is empty`);
    }
    const headings = document.sections.map((section) => section.heading);
    assert.equal(new Set(headings).size, headings.length, "duplicate headings");
  });

  test(`${document.title}: can't be marked final while a placeholder is left`, () => {
    if (document.status === "final") assert.deepEqual(placeholdersIn(document), []);
  });
}
