import test from "node:test";
import assert from "node:assert/strict";
import express from "express";
import type { AddressInfo } from "node:net";
import mapsRoutes from "../routes/maps.routes.js";

/**
 * Guards the one property no unit test of the service layer can cover: that
 * every /api/maps route is behind authentication.
 *
 * These endpoints spend money per request, so an unauthenticated route here is
 * a billable open proxy. The assertions deliberately check for 401 rather than
 * 404, which would only prove the route was missing.
 */

const startTestServer = async (): Promise<{ baseUrl: string; close: () => Promise<void> }> => {
  const app = express();
  app.use(express.json());
  app.use("/api/maps", mapsRoutes);

  const server = app.listen(0);
  await new Promise((resolve) => server.once("listening", resolve));

  const { port } = server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
      }),
  };
};

const ROUTES: { method: "GET" | "POST"; path: string }[] = [
  { method: "POST", path: "/api/maps/directions" },
  { method: "GET", path: "/api/maps/reverse-geocode?lat=12.9&lng=77.5" },
  { method: "POST", path: "/api/maps/places/autocomplete" },
  { method: "GET", path: "/api/maps/places/some-place-id" },
];

test("every maps route rejects a request with no token", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  for (const route of ROUTES) {
    const response = await fetch(`${server.baseUrl}${route.path}`, {
      method: route.method,
      headers: { "Content-Type": "application/json" },
      ...(route.method === "POST" ? { body: JSON.stringify({}) } : {}),
    });

    assert.equal(
      response.status,
      401,
      `${route.method} ${route.path} should require authentication`,
    );
  }
});

test("rejects a malformed bearer token before any work is done", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  const response = await fetch(`${server.baseUrl}/api/maps/directions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: "Bearer not-a-real-jwt",
    },
    body: JSON.stringify({ origin: { lat: 1, lng: 2 }, destination: { lat: 3, lng: 4 } }),
  });

  assert.equal(response.status, 401);
});

test("does not leak validation details to an unauthenticated caller", async (t) => {
  const server = await startTestServer();
  t.after(() => server.close());

  // An invalid body AND no token: auth must win, so a caller cannot probe the
  // request schema without an account.
  const response = await fetch(`${server.baseUrl}/api/maps/directions`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ origin: "nonsense" }),
  });

  assert.equal(response.status, 401);
  const body = (await response.json()) as Record<string, unknown>;
  assert.equal(body.details, undefined);
});
