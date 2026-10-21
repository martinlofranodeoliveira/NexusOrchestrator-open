import { test } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/room_floor_descriptor.mjs";

test("floor 0 returns ground builtin descriptor without mutating input", () => {
  const input = { floor: 0 };
  const result = runFeature(input);
  assert.deepEqual(result, { floor: 0, isBuiltinFloor: true, isGroundFloor: true, isUpperFloor: false });
  assert.deepEqual(input, { floor: 0 });
  assert.notEqual(result, input);
  assert.equal(Object.is(result.floor, 0), true);
});

test("floor 3 is builtin upper non-ground; floor 12 is non-builtin upper", () => {
  assert.deepEqual(runFeature({ floor: 3 }), { floor: 3, isBuiltinFloor: true, isGroundFloor: false, isUpperFloor: true });
  assert.deepEqual(runFeature({ floor: 12 }), { floor: 12, isBuiltinFloor: false, isGroundFloor: false, isUpperFloor: true });
});

test("builtin boundary and max range with fresh objects", () => {
  assert.deepEqual(runFeature({ floor: 8 }), { floor: 8, isBuiltinFloor: true, isGroundFloor: false, isUpperFloor: true });
  assert.deepEqual(runFeature({ floor: 9 }), { floor: 9, isBuiltinFloor: false, isGroundFloor: false, isUpperFloor: true });
  assert.deepEqual(runFeature({ floor: 10000 }), { floor: 10000, isBuiltinFloor: false, isGroundFloor: false, isUpperFloor: true });
  const a = runFeature({ floor: 1 });
  const b = runFeature({ floor: 1 });
  assert.deepEqual(a, b);
  assert.notEqual(a, b);
});

test("extra properties ignored and output keys exact", () => {
  const input = { floor: 3, title: "Lobby", team: "red", extra: 123 };
  const result = runFeature(input);
  assert.deepEqual(result, { floor: 3, isBuiltinFloor: true, isGroundFloor: false, isUpperFloor: true });
  assert.deepEqual(Object.keys(result).sort(), ["floor", "isBuiltinFloor", "isGroundFloor", "isUpperFloor"]);
  assert.deepEqual(input, { floor: 3, title: "Lobby", team: "red", extra: 123 });
  const nullProto = Object.create(null);
  nullProto.floor = 2;
  assert.deepEqual(runFeature(nullProto), { floor: 2, isBuiltinFloor: true, isGroundFloor: false, isUpperFloor: true });
  const frozen = Object.freeze({ floor: 5 });
  assert.deepEqual(runFeature(frozen), { floor: 5, isBuiltinFloor: true, isGroundFloor: false, isUpperFloor: true });
  assert.deepEqual(frozen, { floor: 5 });
  const negZero = runFeature({ floor: -0 });
  assert.equal(Object.is(negZero.floor, 0), true);
  assert.deepEqual(negZero, { floor: 0, isBuiltinFloor: true, isGroundFloor: true, isUpperFloor: false });
});

test("throws INVALID_ROOM_FLOOR_INPUT without echoing input", () => {
  const badValues = [
    null,
    [1, 2],
    [{ floor: 0 }],
    "floor",
    42,
    undefined,
    0,
    {},
    { title: "Lobby" },
    { floor: 3.5 },
    { floor: NaN },
    { floor: Infinity },
    { floor: -Infinity },
    { floor: -1 },
    { floor: 10001 },
    { floor: "3" },
    { floor: null },
    { floor: undefined },
    { floor: true },
    { floor: [3] },
    { floor: { value: 3 } }
  ];
  for (const value of badValues) {
    assert.throws(() => runFeature(value), (err) => {
      assert.equal(err instanceof TypeError, true);
      assert.equal(err.message, "INVALID_ROOM_FLOOR_INPUT");
      assert.equal(String(err.message).includes("Lobby"), false);
      return true;
    });
  }
  const inherited = Object.create({ floor: 3 });
  assert.throws(() => runFeature(inherited), (err) => err instanceof TypeError && err.message === "INVALID_ROOM_FLOOR_INPUT");
});

test("preserves input and makes no inference about teams or next steps", () => {
  const input = { floor: 4, team: "blue" };
  const snapshot = { floor: 4, team: "blue" };
  const result = runFeature(input);
  assert.deepEqual(input, snapshot);
  assert.deepEqual(result, { floor: 4, isBuiltinFloor: true, isGroundFloor: false, isUpperFloor: true });
  assert.equal("team" in result, false);
  assert.equal("occupants" in result, false);
});
