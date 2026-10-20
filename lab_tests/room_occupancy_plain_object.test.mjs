import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { describeRoomOccupancy, runFeature } from "../web-v2/src/community/room_occupancy_descriptor.mjs";

function assertInvalidBoth(value) {
  for (const fn of [describeRoomOccupancy, runFeature]) {
    assert.throws(
      () => fn(value),
      (error) => {
        assert.ok(error instanceof TypeError);
        assert.equal(error.message, "INVALID_ROOM_OCCUPANCY_INPUT");
        return true;
      }
    );
  }
}

describe("room occupancy plain-object guard", () => {
  it("accepts object-literal plain records", () => {
    assert.deepEqual(describeRoomOccupancy({ configuredSlots: 4, occupants: 1 }), {
      configuredSlots: 4,
      occupants: 1,
      freeSlots: 3,
      empty: false,
      full: false,
      overfilled: false
    });
    assert.deepEqual(runFeature({ configuredSlots: 4, occupants: 1 }), {
      configuredSlots: 4,
      occupants: 1,
      freeSlots: 3,
      empty: false,
      full: false,
      overfilled: false
    });
  });

  it("accepts null-prototype records", () => {
    const input = Object.create(null);
    input.configuredSlots = 2;
    input.occupants = 2;
    assert.deepEqual(describeRoomOccupancy(input), {
      configuredSlots: 2,
      occupants: 2,
      freeSlots: 0,
      empty: false,
      full: true,
      overfilled: false
    });
    const second = Object.create(null);
    second.configuredSlots = 2;
    second.occupants = 2;
    assert.deepEqual(runFeature(second), {
      configuredSlots: 2,
      occupants: 2,
      freeSlots: 0,
      empty: false,
      full: true,
      overfilled: false
    });
  });

  it("rejects class instances with valid fields", () => {
    class SyntheticRoom {
      constructor() {
        this.configuredSlots = 4;
        this.occupants = 1;
      }
    }
    assertInvalidBoth(new SyntheticRoom());
  });

  it("rejects Date with own valid fields", () => {
    const value = new Date(0);
    value.configuredSlots = 4;
    value.occupants = 1;
    assertInvalidBoth(value);
  });

  it("rejects Map with own valid fields", () => {
    const value = new Map();
    value.configuredSlots = 4;
    value.occupants = 1;
    assertInvalidBoth(value);
  });

  it("still rejects arrays and null", () => {
    assertInvalidBoth(null);
    assertInvalidBoth([]);
    assertInvalidBoth([{ configuredSlots: 1, occupants: 1 }]);
  });

  it("does not mutate accepted plain input", () => {
    const input = { configuredSlots: 3, occupants: 1 };
    const snapshot = { configuredSlots: 3, occupants: 1 };
    describeRoomOccupancy(input);
    assert.deepEqual(input, snapshot);
  });
});
