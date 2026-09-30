import test from "node:test";
import assert from "node:assert/strict";
import { createClientIpResolver } from "./clientIp.js";

/**
 * Production traffic reaches the API through Cloudflare and then Railway's
 * edge, or straight through Railway's edge on the *.up.railway.app domain.
 * Only Railway's X-Real-IP (the address that connected to it) and, when that
 * address is Cloudflare's, Cloudflare's CF-Connecting-IP can be trusted.
 */

const CLOUDFLARE_V4 = "172.68.10.20";
const CLOUDFLARE_V6 = "2606:4700:10::6816:1";
const RIDER = "49.36.1.2";

const behindRailway = createClientIpResolver({ behindRailway: true });
const local = createClientIpResolver({ behindRailway: false });

const request = (
  headers: Record<string, string | undefined>,
  remoteAddress = "10.0.0.5",
) => ({ headers, socket: { remoteAddress } });

test("through Cloudflare, the rider's address comes from CF-Connecting-IP", () => {
  const ip = behindRailway(request({ "x-real-ip": CLOUDFLARE_V4, "cf-connecting-ip": RIDER }));

  assert.equal(ip, RIDER);
});

test("an X-Forwarded-For the client wrote is never used", () => {
  const ip = behindRailway(
    request({
      "x-real-ip": CLOUDFLARE_V4,
      "cf-connecting-ip": RIDER,
      "x-forwarded-for": "203.0.113.9, 172.68.10.20",
    }),
  );

  assert.equal(ip, RIDER);
});

test("straight to Railway, a forged CF-Connecting-IP is ignored", () => {
  // Arrange: the *.up.railway.app domain skips Cloudflare, so the client can
  // send any CF-Connecting-IP it likes; Railway reports who really connected.
  const ip = behindRailway(request({ "x-real-ip": RIDER, "cf-connecting-ip": "203.0.113.9" }));

  assert.equal(ip, RIDER);
});

test("Cloudflare's IPv6 edge is recognised too", () => {
  const ip = behindRailway(request({ "x-real-ip": CLOUDFLARE_V6, "cf-connecting-ip": RIDER }));

  assert.equal(ip, RIDER);
});

test("through Cloudflare without a usable CF-Connecting-IP, the edge address is used", () => {
  assert.equal(behindRailway(request({ "x-real-ip": CLOUDFLARE_V4 })), CLOUDFLARE_V4);
  assert.equal(
    behindRailway(request({ "x-real-ip": CLOUDFLARE_V4, "cf-connecting-ip": "not-an-ip" })),
    CLOUDFLARE_V4,
  );
});

test("behind Railway with no X-Real-IP, the socket address is used", () => {
  assert.equal(behindRailway(request({}, "::ffff:100.64.0.7")), "100.64.0.7");
});

test("locally every forwarding header is ignored", () => {
  const ip = local(
    request(
      { "x-real-ip": "203.0.113.9", "cf-connecting-ip": "203.0.113.9", "x-forwarded-for": "203.0.113.9" },
      "::ffff:127.0.0.1",
    ),
  );

  assert.equal(ip, "127.0.0.1");
});

test("an unreadable address gives null rather than a made-up one", () => {
  assert.equal(local(request({}, "")), null);
  assert.equal(behindRailway(request({ "x-real-ip": "garbage" }, "")), null);
});
