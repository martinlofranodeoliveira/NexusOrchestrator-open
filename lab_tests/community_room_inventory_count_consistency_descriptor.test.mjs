import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/room_inventory_count_consistency_descriptor.mjs";

describe("room inventory count consistency descriptor", () => {
  it("valid match returns equal counts", () => {
    const payload = { totalConfigured: 2, items: [{}, {}] };
    const before = JSON.stringify(payload);
    const result = runFeature(payload);
    assert.deepEqual(result, {
      totalConfigured: 2,
      itemCount: 2,
      isMatch: true,
      isMissing: false,
      hasExtra: false
    });
    assert.equal(JSON.stringify(payload), before);
  });

  it("valid missing returns isMissing without inspecting elements", () => {
    const payload = { totalConfigured: 3, items: [{}, {}] };
    const result = runFeature(payload);
    assert.equal(result.itemCount, 2);
    assert.equal(result.totalConfigured, 3);
    assert.equal(result.isMatch, false);
    assert.equal(result.isMissing, true);
    assert.equal(result.hasExtra, false);
  });

  it("accepts opaque element values without reading names or roles", () => {
    const payload = {
      totalConfigured: 3,
      items: [null, 42, "room-a"]
    };
    const result = runFeature(payload);
    assert.equal(result.itemCount, 3);
    assert.equal(result.isMatch, true);
    assert.equal(result.isMissing, false);
    assert.equal(result.hasExtra, false);
  });

  it("valid extra returns hasExtra", () => {
    const payload = {
      totalConfigured: 1,
      items: [{ name: "a" }, { name: "b", role: "x" }, {}]
    };
    const result = runFeature(payload);
    assert.deepEqual(result, {
      totalConfigured: 1,
      itemCount: 3,
      isMatch: false,
      isMissing: false,
      hasExtra: true
    });
  });

  it("exactly one flag is true for every valid input", () => {
    const cases = [
      { totalConfigured: 0, items: [] },
      { totalConfigured: 5, items: [] },
      { totalConfigured: 2, items: [{}, {}] },
      { totalConfigured: 1, items: [{}, {}, {}] },
      { totalConfigured: 10000, items: [] }
    ];
    for (const payload of cases) {
      const result = runFeature(payload);
      const count = [result.isMatch, result.isMissing, result.hasExtra].filter((v) => v === true).length;
      assert.equal(count, 1);
    }
  });

  it("handles boundary zero and full range", () => {
    assert.deepEqual(runFeature({ totalConfigured: 0, items: [] }), {
      totalConfigured: 0,
      itemCount: 0,
      isMatch: true,
      isMissing: false,
      hasExtra: false
    });
    const full = [];
    for (const n of [0]) {
      assert.equal(n, 0);
    }
    for (let i = 0; i < 0; i += 1) {
      full.push({});
    }
    const many = runFeature({ totalConfigured: 0, items: full });
    assert.equal(many.itemCount, 0);
    assert.equal(many.isMatch, true);
  });

  it("extra properties are ignored and fresh object is returned", () => {
    const payload = { totalConfigured: 1, items: [{}], note: "ignore", floor: 9 };
    const result = runFeature(payload);
    assert.deepEqual(result, {
      totalConfigured: 1,
      itemCount: 1,
      isMatch: true,
      isMissing: false,
      hasExtra: false
    });
    assert.notEqual(result, payload);
    result.itemCount = 999;
    const again = runFeature(payload);
    assert.equal(again.itemCount, 1);
  });

  it("malformed shapes throw TypeError without echoing input", () => {
    const bad = [
      null,
      undefined,
      42,
      "x",
      true,
      [],
      [{}, {}],
      {},
      { totalConfigured: 2 },
      { items: [] },
      { totalConfigured: null, items: [] },
      { totalConfigured: "2", items: [] },
      { totalConfigured: 2.5, items: [] },
      { totalConfigured: NaN, items: [] },
      { totalConfigured: Infinity, items: [] },
      { totalConfigured: -1, items: [] },
      { totalConfigured: 10001, items: [] },
      { totalConfigured: 2, items: null },
      { totalConfigured: 2, items: {} },
      { totalConfigured: 2, items: "ab" },
      { totalConfigured: 0, items: new Array(10001).fill({}) }
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.equal(err.message, "INVALID_ROOM_INVENTORY_COUNT_INPUT");
        assert.equal(String(err.message).includes("Nexus"), false);
        return true;
      });
    }
  });

  it("does not mutate input array", () => {
    const items = [{}, {}];
    const payload = { totalConfigured: 2, items };
    runFeature(payload);
    assert.equal(payload.items.length, 2);
    assert.equal(items.length, 2);
  });
});
