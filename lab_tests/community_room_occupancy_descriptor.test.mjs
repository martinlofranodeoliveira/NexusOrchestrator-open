import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeRoomOccupancy, runFeature } from "../web-v2/src/community/room_occupancy_descriptor.mjs";

function assertInvalid(value) {
  assert.throws(
    () => describeRoomOccupancy(value),
    (error) => {
      assert.ok(error instanceof TypeError);
      assert.equal(error.message, "INVALID_ROOM_OCCUPANCY_INPUT");
      return true;
    }
  );
}

describe("describeRoomOccupancy validation", () => {
  it("rejects non-objects, null and arrays", () => {
    assertInvalid(undefined);
    assertInvalid(null);
    assertInvalid(0);
    assertInvalid(4);
    assertInvalid("room");
    assertInvalid(true);
    assertInvalid([]);
    assertInvalid([{ configuredSlots: 1, occupants: 1 }]);
    assertInvalid(() => 1);
  });

  it("rejects missing fields and non-integers", () => {
    assertInvalid({});
    assertInvalid({ configuredSlots: 4 });
    assertInvalid({ occupants: 2 });
    assertInvalid({ configuredSlots: "4", occupants: 0 });
    assertInvalid({ configuredSlots: 4, occupants: "0" });
    assertInvalid({ configuredSlots: 1.5, occupants: 0 });
    assertInvalid({ configuredSlots: 2, occupants: 2.2 });
    assertInvalid({ configuredSlots: NaN, occupants: 0 });
    assertInvalid({ configuredSlots: 0, occupants: NaN });
    assertInvalid({ configuredSlots: Infinity, occupants: 0 });
    assertInvalid({ configuredSlots: 0, occupants: Infinity });
    assertInvalid({ configuredSlots: null, occupants: 0 });
    assertInvalid({ configuredSlots: 0, occupants: null });
    assertInvalid({ configuredSlots: true, occupants: 0 });
  });

  it("rejects out-of-range integers and does not echo input", () => {
    assertInvalid({ configuredSlots: -1, occupants: 0 });
    assertInvalid({ configuredSlots: 0, occupants: -1 });
    assertInvalid({ configuredSlots: 10001, occupants: 0 });
    assertInvalid({ configuredSlots: 0, occupants: 10001 });
    try {
      describeRoomOccupancy({ configuredSlots: 99999, occupants: 99999 });
      assert.fail("expected throw");
    } catch (error) {
      assert.ok(error instanceof TypeError);
      assert.equal(error.message, "INVALID_ROOM_OCCUPANCY_INPUT");
      assert.equal(String(error.stack).includes("99999"), false);
    }
  });
});

describe("describeRoomOccupancy computation", () => {
  it("describes an empty room", () => {
    assert.deepEqual(describeRoomOccupancy({ configuredSlots: 4, occupants: 0 }), {
      configuredSlots: 4,
      occupants: 0,
      freeSlots: 4,
      empty: true,
      full: false,
      overfilled: false
    });
  });

  it("describes a full room", () => {
    assert.deepEqual(describeRoomOccupancy({ configuredSlots: 4, occupants: 4 }), {
      configuredSlots: 4,
      occupants: 4,
      freeSlots: 0,
      empty: false,
      full: true,
      overfilled: false
    });
  });

  it("describes an overfilled room with clamped freeSlots", () => {
    assert.deepEqual(describeRoomOccupancy({ configuredSlots: 2, occupants: 5 }), {
      configuredSlots: 2,
      occupants: 5,
      freeSlots: 0,
      empty: false,
      full: true,
      overfilled: true
    });
  });

  it("handles zero capacity literally", () => {
    assert.deepEqual(describeRoomOccupancy({ configuredSlots: 0, occupants: 0 }), {
      configuredSlots: 0,
      occupants: 0,
      freeSlots: 0,
      empty: true,
      full: false,
      overfilled: false
    });
    assert.deepEqual(describeRoomOccupancy({ configuredSlots: 0, occupants: 1 }), {
      configuredSlots: 0,
      occupants: 1,
      freeSlots: 0,
      empty: false,
      full: false,
      overfilled: true
    });
  });

  it("returns a fresh object, ignores extras and never mutates input", () => {
    const input = { configuredSlots: 5, occupants: 2, team: "pixel", extra: 99 };
    const snapshot = { configuredSlots: 5, occupants: 2, team: "pixel", extra: 99 };
    const first = describeRoomOccupancy(input);
    assert.deepEqual(input, snapshot);
    assert.deepEqual(first, {
      configuredSlots: 5,
      occupants: 2,
      freeSlots: 3,
      empty: false,
      full: false,
      overfilled: false
    });
    assert.equal("team" in first, false);
    assert.equal("extra" in first, false);
    const second = describeRoomOccupancy(input);
    assert.notEqual(first, second);
    assert.deepEqual(first, second);
  });

  it("preserves integer bounds", () => {
    assert.deepEqual(describeRoomOccupancy({ configuredSlots: 10000, occupants: 10000 }), {
      configuredSlots: 10000,
      occupants: 10000,
      freeSlots: 0,
      empty: false,
      full: true,
      overfilled: false
    });
  });

  it("exposes runFeature alias with identical behavior", () => {
    assert.deepEqual(runFeature({ configuredSlots: 4, occupants: 0 }), {
      configuredSlots: 4,
      occupants: 0,
      freeSlots: 4,
      empty: true,
      full: false,
      overfilled: false
    });
  });
});
