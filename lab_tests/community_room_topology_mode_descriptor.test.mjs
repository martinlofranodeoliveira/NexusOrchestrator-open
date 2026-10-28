import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/room_topology_mode_descriptor.mjs";

function throwsInvalid(fn) {
  assert.throws(fn, (e) => {
    return e instanceof TypeError && e.message === "INVALID_ROOM_TOPOLOGY_MODE_INPUT";
  });
}

describe("room topology mode descriptor", () => {
  it("empty byTopology returns empty descriptor without mutating input", () => {
    const input = { byTopology: {} };
    const snap = JSON.stringify(input);
    const out = runFeature(input);
    assert.deepStrictEqual(out, {
      distinctTopologies: 0,
      totalRooms: 0,
      topTopology: null,
      topCount: 0,
      isEmpty: true,
      isSingleTopology: false
    });
    assert.strictEqual(JSON.stringify(input), snap);
  });

  it("single entry echoes key and value", () => {
    const out = runFeature({ byTopology: { solo: 7 } });
    assert.deepStrictEqual(out, {
      distinctTopologies: 1,
      totalRooms: 7,
      topTopology: "solo",
      topCount: 7,
      isEmpty: false,
      isSingleTopology: true
    });
  });

  it("multiple entries sum and pick maximum", () => {
    const out = runFeature({ byTopology: { grid: 3, hub: 5 } });
    assert.deepStrictEqual(out, {
      distinctTopologies: 2,
      totalRooms: 8,
      topTopology: "hub",
      topCount: 5,
      isEmpty: false,
      isSingleTopology: false
    });
  });

  it("ties resolve to lexicographically smallest key", () => {
    const out = runFeature({ byTopology: { grid: 4, hub: 4 } });
    assert.strictEqual(out.topTopology, "grid");
    assert.strictEqual(out.topCount, 4);
    assert.strictEqual(out.totalRooms, 8);
    const rev = runFeature({ byTopology: { hub: 4, grid: 4 } });
    assert.strictEqual(rev.topTopology, "grid");
    assert.strictEqual(rev.topCount, 4);
  });

  it("all-zero counts return null top and empty", () => {
    const out = runFeature({ byTopology: { a: 0, b: 0 } });
    assert.deepStrictEqual(out, {
      distinctTopologies: 2,
      totalRooms: 0,
      topTopology: null,
      topCount: 0,
      isEmpty: true,
      isSingleTopology: false
    });
  });

  it("single zero is not single topology", () => {
    const out = runFeature({ byTopology: { solo: 0 } });
    assert.strictEqual(out.isEmpty, true);
    assert.strictEqual(out.isSingleTopology, false);
    assert.strictEqual(out.topTopology, null);
    assert.strictEqual(out.topCount, 0);
  });

  it("extra properties are ignored and input never mutated", () => {
    const input = { byTopology: { a: 2 }, extra: 999 };
    const snap = JSON.stringify(input);
    const out = runFeature(input);
    assert.strictEqual(out.distinctTopologies, 1);
    assert.strictEqual(out.totalRooms, 2);
    assert.strictEqual(out.topTopology, "a");
    assert.strictEqual(JSON.stringify(input), snap);
  });

  it("deterministic fresh objects", () => {
    const input = { byTopology: { grid: 2, hub: 2 } };
    const a = runFeature(input);
    const b = runFeature(input);
    assert.deepStrictEqual(a, b);
    assert.notStrictEqual(a, b);
  });

  it("rejects malformed shapes", () => {
    throwsInvalid(() => runFeature(null));
    throwsInvalid(() => runFeature(undefined));
    throwsInvalid(() => runFeature([]));
    throwsInvalid(() => runFeature(42));
    throwsInvalid(() => runFeature("x"));
    throwsInvalid(() => runFeature({}));
    throwsInvalid(() => runFeature({ byTopology: null }));
    throwsInvalid(() => runFeature({ byTopology: [] }));
    throwsInvalid(() => runFeature({ byTopology: 5 }));
    throwsInvalid(() => runFeature({ byTopology: "x" }));
  });

  it("rejects bad keys, values and too many entries", () => {
    throwsInvalid(() => runFeature({ byTopology: { "": 1 } }));
    throwsInvalid(() => runFeature({ byTopology: { ["k".repeat(65)]: 1 } }));
    throwsInvalid(() => runFeature({ byTopology: { a: 1.5 } }));
    throwsInvalid(() => runFeature({ byTopology: { a: NaN } }));
    throwsInvalid(() => runFeature({ byTopology: { a: Infinity } }));
    throwsInvalid(() => runFeature({ byTopology: { a: -1 } }));
    throwsInvalid(() => runFeature({ byTopology: { a: 10001 } }));
    throwsInvalid(() => runFeature({ byTopology: { a: "1" } }));
    const big = {};
    for (let i = 0; i < 51; i++) {
      big["k" + i] = 1;
    }
    throwsInvalid(() => runFeature({ byTopology: big }));
  });

  it("error message does not echo input", () => {
    try {
      runFeature({ byTopology: { secretkey: -5 } });
      assert.fail("should throw");
    } catch (e) {
      assert.ok(e instanceof TypeError);
      assert.strictEqual(e.message, "INVALID_ROOM_TOPOLOGY_MODE_INPUT");
      assert.ok(!e.message.includes("secretkey"));
    }
  });
});
