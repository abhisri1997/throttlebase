import test from "node:test";
import assert from "node:assert/strict";
import { buildShareLinks } from "./shareLinks";

const appLinkFor = (path: string) => `throttlebase://${path.replace(/^\//, "")}`;

test("a web link is built on the configured site and preferred for sharing", () => {
  const links = buildShareLinks("/route/abc", appLinkFor, "https://throttlebase.in/");

  assert.equal(links.webLink, "https://throttlebase.in/route/abc");
  assert.equal(links.appLink, "throttlebase://route/abc");
  assert.equal(links.primaryLink, "https://throttlebase.in/route/abc");
});

test("the public site is used when none is configured", () => {
  const links = buildShareLinks("/post/1", appLinkFor, undefined);

  assert.equal(links.webLink, "https://throttlebase.in/post/1");
});

test("a blank configured site falls back to the public site", () => {
  const links = buildShareLinks("/post/1", appLinkFor, "   ");

  assert.equal(links.webLink, "https://throttlebase.in/post/1");
});
