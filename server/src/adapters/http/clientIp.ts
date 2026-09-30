import { BlockList, isIP } from "node:net";

/**
 * The address of whoever sent a request, for per-IP rate limits and the IP
 * recorded at sign-in, consent and account deletion.
 *
 * In production a request reaches us one of two ways:
 *   - api.throttlebase.in: client → Cloudflare → Railway's edge → us;
 *   - *.up.railway.app:     client → Railway's edge → us, skipping Cloudflare.
 *
 * Railway's edge sets X-Real-IP to the address that connected to it. When
 * that is Cloudflare, Cloudflare's CF-Connecting-IP holds the client, and
 * Cloudflare overwrites any value the client sent. Otherwise the connecting
 * address is the client. X-Forwarded-For is never read: its first entry is
 * whatever the client wrote, and Express's `req.ip` (trust proxy 1) is
 * Cloudflare's address for everyone.
 */

/**
 * Cloudflare's edge ranges, from https://www.cloudflare.com/ips/ (fetched
 * 2026-09-30). They change rarely; a missing range only means requests from
 * it share Cloudflare's address for rate limiting, never that a forged
 * header is believed.
 */
const CLOUDFLARE_RANGES = [
  "173.245.48.0/20",
  "103.21.244.0/22",
  "103.22.200.0/22",
  "103.31.4.0/22",
  "141.101.64.0/18",
  "108.162.192.0/18",
  "190.93.240.0/20",
  "188.114.96.0/20",
  "197.234.240.0/22",
  "198.41.128.0/17",
  "162.158.0.0/15",
  "104.16.0.0/13",
  "104.24.0.0/14",
  "172.64.0.0/13",
  "131.0.72.0/22",
  "2400:cb00::/32",
  "2606:4700::/32",
  "2803:f800::/32",
  "2405:b500::/32",
  "2405:8100::/32",
  "2a06:98c0::/29",
  "2c0f:f248::/32",
] as const;

const cloudflare = new BlockList();
for (const range of CLOUDFLARE_RANGES) {
  const [network, prefix] = range.split("/") as [string, string];
  cloudflare.addSubnet(network, Number(prefix), isIP(network) === 6 ? "ipv6" : "ipv4");
}

const IPV4_MAPPED_PREFIX = "::ffff:";

/** A valid address in canonical form, or null. `::ffff:1.2.3.4` becomes `1.2.3.4`. */
const normalise = (raw: string | undefined): string | null => {
  const value = raw?.trim() ?? "";
  const unmapped = value.toLowerCase().startsWith(IPV4_MAPPED_PREFIX)
    ? value.slice(IPV4_MAPPED_PREFIX.length)
    : value;
  if (isIP(unmapped) !== 0) return unmapped;
  return isIP(value) !== 0 ? value : null;
};

const isCloudflare = (ip: string): boolean =>
  cloudflare.check(ip, isIP(ip) === 6 ? "ipv6" : "ipv4");

const header = (
  headers: Record<string, string | string[] | undefined>,
  name: string,
): string | undefined => {
  const value = headers[name];
  return Array.isArray(value) ? value[0] : value;
};

export interface ClientIpRequest {
  headers: Record<string, string | string[] | undefined>;
  socket: { remoteAddress?: string | undefined };
}

/**
 * `behindRailway` is true where Railway's edge fronts the server (every
 * deployed environment); locally the socket address is the client.
 */
export const createClientIpResolver =
  (options: { behindRailway: boolean }) =>
  (req: ClientIpRequest): string | null => {
    const socket = normalise(req.socket.remoteAddress);
    if (!options.behindRailway) return socket;

    const peer = normalise(header(req.headers, "x-real-ip")) ?? socket;
    if (peer === null || !isCloudflare(peer)) return peer;

    return normalise(header(req.headers, "cf-connecting-ip")) ?? peer;
  };

/** Railway sets RAILWAY_ENVIRONMENT_ID in every deployed service, dev and prod alike. */
export const clientIpOf = createClientIpResolver({
  behindRailway: Boolean(process.env.RAILWAY_ENVIRONMENT_ID),
});
