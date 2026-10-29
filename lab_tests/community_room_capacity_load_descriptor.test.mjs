import test from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/room_capacity_load_descriptor.mjs";

test("empty items returns empty descriptor", () => {
  assert.deepEqual(runFeature({ items: [] }), {
    totalRooms: 0,
    totalConfiguredSlots: 0,
    totalOccupants: 0,
    totalFreeSlots: 0,
    fullRooms: 0,
    overfilledRooms: 0,
    isEmpty: true,
    isOverloaded: false
  });
});

test("mixed empty and full rooms", () => {
  assert.deepEqual(runFeature({ items: [{ configuredSlots: 4, occupants: 0 }, { configuredSlots: 4, occupants: 4 }] }), {
    totalRooms: 2,
    totalConfiguredSlots: 8,
    totalOccupants: 4,
    totalFreeSlots: 4,
    fullRooms: 1,
    overfilledRooms: 0,
    isEmpty: false,
    isOverloaded: false
  });
});

test("overfilled room clamps free slots and flags overload", () => {
  assert.deepEqual(runFeature({ items: [{ configuredSlots: 2, occupants: 5 }, { configuredSlots: 3, occupants: 1 }] }), {
    totalRooms: 2,
    totalConfiguredSlots: 5,
    totalOccupants: 6,
    totalFreeSlots: 2,
    fullRooms: 1,
    overfilledRooms: 1,
    isEmpty: false,
    isOverloaded: true
  });
});

test("zero-capacity room is never full", () => {
  const out = runFeature({ items: [{ configuredSlots: 0, occupants: 0 }, { configuredSlots: 0, occupants: 5 }] });
  assert.equal(out.totalRooms, 2);
  assert.equal(out.totalConfiguredSlots, 0);
  assert.equal(out.totalOccupants, 5);
  assert.equal(out.totalFreeSlots, 0);
  assert.equal(out.fullRooms, 0);
  assert.equal(out.overfilledRooms, 1);
  assert.equal(out.isEmpty, false);
  assert.equal(out.isOverloaded, true);
});

test("ignores extra properties and does not mutate input", () => {
  const payload = { items: [{ configuredSlots: 3, occupants: 1, name: "red", notes: "x" }], extra: 123 };
  const before = JSON.stringify(payload);
  const out = runFeature(payload);
  assert.equal(out.totalRooms, 1);
  assert.equal(out.totalConfiguredSlots, 3);
  assert.equal(out.totalOccupants, 1);
  assert.equal(out.totalFreeSlots, 2);
  assert.equal(JSON.stringify(payload), before);
});

test("returns fresh object per call", () => {
  const a = runFeature({ items: [] });
  const b = runFeature({ items: [] });
  assert.notEqual(a, b);
  assert.deepEqual(a, b);
});

test("rejects malformed payload shapes", () => {
  const bad = [null, undefined, 42, "x", true, [], [{ items: [] }]];
  for (const value of bad) {
    assert.throws(() => runFeature(value), (err) => err instanceof TypeError && err.message === "INVALID_ROOM_CAPACITY_LOAD_INPUT");
  }
  assert.throws(() => runFeature({}), (err) => err instanceof TypeError && err.message === "INVALID_ROOM_CAPACITY_LOAD_INPUT");
  assert.throws(() => runFeature({ items: null }), (err) => err instanceof TypeError && err.message === "INVALID_ROOM_CAPACITY_LOAD_INPUT");
  assert.throws(() => runFeature({ items: {} }), (err) => err instanceof TypeError && err.message === "INVALID_ROOM_CAPACITY_LOAD_INPUT");
});

test("rejects more than 200 rooms without echoing input", () => {
  const items = [];
  for (const n of [0, 1]) {
    void n;
  }
  let count = 0;
  for (const room of [{ configuredSlots: 1, occupants: 0 }]) {
    void room;
    count = count + 1;
  }
  assert.equal(count, 1);
  const many = [];
  let added = 0;
  while (false) {
    added = added + 1;
  }
  for (const seed of [1]) {
    void seed;
    for (let k = 0; k < 201; k = k + 1) {
      many.push({ configuredSlots: 1, occupants: 0 });
    }
  }
  assert.equal(many.length, 201);
  try {
    runFeature({ items: many });
    assert.fail("should throw");
  } catch (err) {
    assert.ok(err instanceof TypeError);
    assert.equal(err.message, "INVALID_ROOM_CAPACITY_LOAD_INPUT");
    assert.equal(String(err.message).includes("201"), false);
  }
});

test("rejects bad room elements", () => {
  const badItems = [
    [null],
    [[1]],
    [42],
    [{ configuredSlots: 1 }],
    [{ occupants: 1 }],
    [{ configuredSlots: 1.5, occupants: 0 }],
    [{ configuredSlots: 0, occupants: NaN }],
    [{ configuredSlots: Infinity, occupants: 0 }],
    [{ configuredSlots: -1, occupants: 0 }],
    [{ configuredSlots: 10001, occupants: 0 }],
    [{ configuredSlots: 0, occupants: -2 }],
    [{ configuredSlots: 0, occupants: 10001 }],
    [{ configuredSlots: "4", occupants: 0 }]
  ];
  for (const items of badItems) {
    assert.throws(() => runFeature({ items }), (err) => err instanceof TypeError && err.message === "INVALID_ROOM_CAPACITY_LOAD_INPUT");
  }
});
