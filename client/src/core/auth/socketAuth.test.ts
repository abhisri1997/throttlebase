import test from "node:test";
import assert from "node:assert/strict";
import {
  handshakeRetryDelayMs,
  HANDSHAKE_RETRY_MAX_MS,
  HANDSHAKE_RETRY_RESET_MS,
  keepSocketAuthenticated,
  type AuthenticatingSocket,
  type SocketAuthClock,
} from "./socketAuth";

/** Stands in for a Socket.IO socket: records connects, fires connect_error. */
class FakeSocket implements AuthenticatingSocket {
  auth: unknown = undefined;
  active = true;
  connected = false;
  connects = 0;
  private errorListeners: Array<(error: Error) => void> = [];

  connect(): void {
    this.connects += 1;
    this.active = true;
  }

  on(_event: "connect_error", listener: (error: Error) => void): void {
    this.errorListeners.push(listener);
  }

  /** What Socket.IO does when the handshake middleware says no. */
  refuseHandshake(): void {
    this.active = false;
    this.connected = false;
    for (const listener of this.errorListeners) listener(new Error("Invalid or expired token."));
  }

  /** What Socket.IO does when the transport fails: it stays active and retries. */
  failTransport(): void {
    this.connected = false;
    for (const listener of this.errorListeners) listener(new Error("websocket error"));
  }

  /** Runs the auth function the way Socket.IO does on a connection attempt. */
  async handshake(): Promise<object> {
    const auth = this.auth as (send: (data: object) => void) => void;
    return await new Promise((resolve) => auth(resolve));
  }
}

class FakeClock implements SocketAuthClock {
  time = 0;
  private timers = new Map<number, { at: number; run: () => void }>();
  private nextId = 1;

  now(): number {
    return this.time;
  }
  setTimeout(run: () => void, delayMs: number): unknown {
    const id = this.nextId++;
    this.timers.set(id, { at: this.time + delayMs, run });
    return id;
  }
  clearTimeout(handle: unknown): void {
    this.timers.delete(handle as number);
  }
  get pendingDelays(): number[] {
    return [...this.timers.values()].map((timer) => timer.at - this.time);
  }

  /** Moves time on, running due timers, then lets their promises settle. */
  async advance(ms: number): Promise<void> {
    this.time += ms;
    for (const [id, timer] of [...this.timers]) {
      if (timer.at <= this.time) {
        this.timers.delete(id);
        timer.run();
      }
    }
    await new Promise((resolve) => setImmediate(resolve));
  }
}

const setup = (tokens: Array<string | null>) => {
  const socket = new FakeSocket();
  const clock = new FakeClock();
  let call = 0;
  const getToken = async (): Promise<string | null> =>
    tokens[Math.min(call++, tokens.length - 1)] ?? null;
  const stop = keepSocketAuthenticated(socket, getToken, clock);
  return { socket, clock, stop };
};

test("every connection attempt presents the token current at that moment", async () => {
  // Arrange: the token is refreshed between the first connect and a reconnect.
  const { socket } = setup(["access-1", "access-2"]);

  // Act
  const first = await socket.handshake();
  const reconnect = await socket.handshake();

  // Assert: the reconnect does not reuse the token from the first connect.
  assert.deepEqual(first, { token: "access-1" });
  assert.deepEqual(reconnect, { token: "access-2" });
});

test("signed out, the handshake carries no token", async () => {
  const { socket } = setup([null]);

  assert.deepEqual(await socket.handshake(), {});
});

test("a token lookup that fails still answers the handshake", async () => {
  const socket = new FakeSocket();
  keepSocketAuthenticated(socket, () => Promise.reject(new Error("storage")), new FakeClock());

  assert.deepEqual(await socket.handshake(), {});
});

test("a refused handshake is retried, since Socket.IO itself gives up", async () => {
  // Arrange
  const { socket, clock } = setup(["access-2"]);

  // Act: the server turns a stale token down.
  socket.refuseHandshake();
  await clock.advance(999);
  assert.equal(socket.connects, 0, "not before the delay");
  await clock.advance(1);

  // Assert
  assert.equal(socket.connects, 1);
});

test("a transport failure is left to Socket.IO's own reconnection", async () => {
  const { socket, clock } = setup(["access-1"]);

  socket.failTransport();
  await clock.advance(HANDSHAKE_RETRY_MAX_MS);

  assert.equal(socket.connects, 0);
  assert.deepEqual(clock.pendingDelays, []);
});

test("repeated refusals back off, up to a cap", async () => {
  const { socket, clock } = setup(["access-1"]);
  const delays: number[] = [];

  for (let i = 0; i < 7; i++) {
    socket.refuseHandshake();
    const [delay] = clock.pendingDelays;
    delays.push(delay as number);
    await clock.advance(delay as number);
  }

  assert.deepEqual(delays, [1_000, 2_000, 4_000, 8_000, 16_000, 30_000, 30_000]);
});

test("a refusal after a healthy stretch is retried quickly again", async () => {
  // Arrange: back off a few times.
  const { socket, clock } = setup(["access-1"]);
  for (let i = 0; i < 4; i++) {
    socket.refuseHandshake();
    await clock.advance(clock.pendingDelays[0] as number);
  }

  // Act: connected for a good while, then refused once more.
  await clock.advance(HANDSHAKE_RETRY_RESET_MS + 1);
  socket.refuseHandshake();

  // Assert
  assert.deepEqual(clock.pendingDelays, [1_000]);
});

test("signed out by the time the retry is due, it does not reconnect", async () => {
  const { socket, clock } = setup([null]);

  socket.refuseHandshake();
  await clock.advance(1_000);

  assert.equal(socket.connects, 0);
});

test("a refusal while a retry is pending does not stack a second retry", async () => {
  const { socket, clock } = setup(["access-1"]);

  socket.refuseHandshake();
  socket.refuseHandshake();

  assert.equal(clock.pendingDelays.length, 1);
});

test("a socket that reconnected on its own is not connected twice", async () => {
  const { socket, clock } = setup(["access-1"]);

  socket.refuseHandshake();
  socket.connected = true;
  await clock.advance(1_000);

  assert.equal(socket.connects, 0);
});

test("stopping cancels a pending retry", async () => {
  const { socket, clock, stop } = setup(["access-1"]);

  socket.refuseHandshake();
  stop();
  await clock.advance(HANDSHAKE_RETRY_MAX_MS);

  assert.equal(socket.connects, 0);
  socket.refuseHandshake();
  assert.deepEqual(clock.pendingDelays, [], "no retries once stopped");
});

test("the retry delay doubles from one second and stops at the cap", () => {
  assert.equal(handshakeRetryDelayMs(0), 1_000);
  assert.equal(handshakeRetryDelayMs(3), 8_000);
  assert.equal(handshakeRetryDelayMs(50), HANDSHAKE_RETRY_MAX_MS);
});
