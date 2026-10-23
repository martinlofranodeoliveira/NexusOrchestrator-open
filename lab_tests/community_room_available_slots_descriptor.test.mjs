import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/room_available_slots_descriptor.mjs";

describe("room_available_slots_descriptor", () => {
  it("matches case 4,1,3 returns expected object with fresh output", () => {
    const input = { configuredSlots: 4, occupants: 1, availableSlots: 3 };
    const snapshot = { configuredSlots: 4, occupants: 1, availableSlots: 3 };
    const out = runFeature(input);
    assert.deepEqual(out, {
      configuredSlots: 4,
      occupants: 1,
      availableSlots: 3,
      expectedAvailable: 3,
      matches: true,
      understated: false,
      overstated: false
    });
    assert.deepEqual(input, snapshot);
    assert.notEqual(out, input);
  });
  it("overfilled 2,5,0 clamps to 0 and matches", () => {
    const out = runFeature({ configuredSlots: 2, occupants: 5, availableSlots: 0 });
    assert.equal(out.expectedAvailable, 0);
    assert.equal(out.matches, true);
    assert.equal(out.understated, false);
    assert.equal(out.overstated, false);
  });
  it("overstated 4,4,2 reports overstated", () => {
    const out = runFeature({ configuredSlots: 4, occupants: 4, availableSlots: 2 });
    assert.deepEqual(out, {
      configuredSlots: 4,
      occupants: 4,
      availableSlots: 2,
      expectedAvailable: 0,
      matches: false,
      understated: false,
      overstated: true
    });
  });
  it("understated case reports understated", () => {
    const out = runFeature({ configuredSlots: 4, occupants: 1, availableSlots: 1 });
    assert.equal(out.expectedAvailable, 3);
    assert.equal(out.matches, false);
    assert.equal(out.understated, true);
    assert.equal(out.overstated, false);
  });
  it("ignores extra properties and preserves boundaries", () => {
    const out = runFeature({ configuredSlots: 0, occupants: 0, availableSlots: 0, extra: 99 });
    assert.deepEqual(out, {
      configuredSlots: 0,
      occupants: 0,
      availableSlots: 0,
      expectedAvailable: 0,
      matches: true,
      understated: false,
      overstated: false
    });
    const top = runFeature({ configuredSlots: 10000, occupants: 10000, availableSlots: 0 });
    assert.equal(top.expectedAvailable, 0);
    assert.equal(top.matches, true);
  });
  it("does not mutate frozen input and returns fresh objects", () => {
    const input = Object.freeze({ configuredSlots: 4, occupants: 1, availableSlots: 3 });
    const a = runFeature(input);
    const b = runFeature(input);
    assert.notEqual(a, b);
    assert.deepEqual(a, b);
    a.matches = false;
    const c = runFeature(input);
    assert.equal(c.matches, true);
  });
  it("throws INVALID_ROOM_AVAILABILITY_INPUT for malformed shapes", () => {
    const bad = [
      null,
      undefined,
      5,
      "x",
      true,
      [],
      [{ configuredSlots: 1, occupants: 0, availableSlots: 1 }],
      {},
      { configuredSlots: 1 },
      { configuredSlots: 1, occupants: 0 },
      { configuredSlots: 1.5, occupants: 0, availableSlots: 1 },
      { configuredSlots: "4", occupants: 1, availableSlots: 3 },
      { configuredSlots: 4, occupants: NaN, availableSlots: 3 },
      { configuredSlots: 4, occupants: Infinity, availableSlots: 3 },
      { configuredSlots: -1, occupants: 0, availableSlots: 0 },
      { configuredSlots: 10001, occupants: 0, availableSlots: 0 },
      { configuredSlots: 4, occupants: 1, availableSlots: -5 },
      { configuredSlots: 4, occupants: 1, availableSlots: 10001 },
      { configuredSlots: null, occupants: 1, availableSlots: 1 },
      { configuredSlots: 4, occupants: 1.2, availableSlots: 2 }
    ];
    for (const v of bad) {
      assert.throws(() => runFeature(v), (e) => e instanceof TypeError && e.message === "INVALID_ROOM_AVAILABILITY_INPUT");
    }
  });
  it("error does not echo input and caller data untouched", () => {
    const input = { configuredSlots: 4, occupants: 1, availableSlots: 99999 };
    try {
      runFeature(input);
      assert.fail("should throw");
    } catch (e) {
      assert.ok(e instanceof TypeError);
      assert.equal(e.message, "INVALID_ROOM_AVAILABILITY_INPUT");
      assert.equal(String(e.message).includes("99999"), false);
    }
    assert.deepEqual(input, { configuredSlots: 4, occupants: 1, availableSlots: 99999 });
  });
  it("exports a sync pure function", () => {
    assert.equal(typeof runFeature, "function");
    const out = runFeature({ configuredSlots: 1, occupants: 0, availableSlots: 1 });
    assert.equal(typeof out.then, "undefined");
  });
});
