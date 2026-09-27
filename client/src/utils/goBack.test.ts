import test from "node:test";
import assert from "node:assert/strict";
import type { Href } from "expo-router";
import { goBackOr } from "./goBack";

const fakeRouter = (canGoBack: boolean) => {
  const calls: string[] = [];
  return {
    calls,
    router: {
      canGoBack: () => canGoBack,
      back: () => calls.push("back"),
      replace: (href: Href) => calls.push(`replace ${String(href)}`),
    },
  };
};

test("goes back when there is a screen to return to", () => {
  const { router, calls } = fakeRouter(true);

  goBackOr(router, "/(tabs)/rides");

  assert.deepEqual(calls, ["back"]);
});

test("opens the fallback when the screen was opened directly by a link", () => {
  const { router, calls } = fakeRouter(false);

  goBackOr(router, "/(tabs)/rides");

  assert.deepEqual(calls, ["replace /(tabs)/rides"]);
});
