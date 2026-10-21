import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/lane_load_descriptor.mjs";

describe("community lane load descriptor", () => {
  it("describes 5 tracked with 2 active without mutating input", () => {
    const input = { totalTracked: 5, active: 2 };
    const snapshot = { totalTracked: 5, active: 2 };
    const result = runFeature(input);
    assert.deepEqual(result, {
      totalTracked: 5,
      active: 2,
      idleCount: 3,
      empty: false,
      idle: false,
      hasActive: true
    });
    assert.deepEqual(input, snapshot);
  });

  it("describes empty synthetic load", () => {
    const result = runFeature({ totalTracked: 0, active: 0 });
    assert.deepEqual(result, {
      totalTracked: 0,
      active: 0,
      idleCount: 0,
      empty: true,
      idle: true,
      hasActive: false
    });
  });

  it("describes fully active load", () => {
    const result = runFeature({ totalTracked: 3, active: 3 });
    assert.deepEqual(result, {
      totalTracked: 3,
      active: 3,
      idleCount: 0,
      empty: false,
      idle: false,
      hasActive: true
    });
  });

  it("ignores extra properties", () => {
    const result = runFeature({ totalTracked: 5, active: 2, note: "x", extra: 1 });
    assert.deepEqual(result, {
      totalTracked: 5,
      active: 2,
      idleCount: 3,
      empty: false,
      idle: false,
      hasActive: true
    });
  });

  it("returns a fresh object on each call", () => {
    const first = runFeature({ totalTracked: 5, active: 2 });
    const second = runFeature({ totalTracked: 5, active: 2 });
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
  });

  it("is deterministic across repeated calls", () => {
    const input = { totalTracked: 4, active: 1 };
    const a = runFeature(input);
    const b = runFeature(input);
    assert.deepEqual(a, b);
    assert.deepEqual(input, { totalTracked: 4, active: 1 });
  });

  it("rejects malformed inputs with INVALID_LANE_LOAD_INPUT", () => {
    const badInputs = [
      null,
      undefined,
      [],
      [1, 2],
      {},
      { totalTracked: 5 },
      { active: 2 },
      { totalTracked: 5, active: 6 },
      { totalTracked: -1, active: 0 },
      { totalTracked: 10001, active: 0 },
      { totalTracked: 5, active: -1 },
      { totalTracked: 5, active: 10001 },
      { totalTracked: 1.5, active: 1 },
      { totalTracked: 5, active: 1.5 },
      { totalTracked: "5", active: 2 },
      { totalTracked: 5, active: "2" },
      { totalTracked: null, active: 0 },
      { totalTracked: 5, active: null },
      { totalTracked: Number.NaN, active: 0 },
      { totalTracked: 5, active: Number.POSITIVE_INFINITY },
      5,
      "x",
      true
    ];
    for (const bad of badInputs) {
      assert.throws(() => runFeature(bad), (err) => err instanceof TypeError && err.message === "INVALID_LANE_LOAD_INPUT");
    }
    const arrayWithFields = [1, 2];
    arrayWithFields.totalTracked = 2;
    arrayWithFields.active = 1;
    assert.throws(() => runFeature(arrayWithFields), (err) => err instanceof TypeError && err.message === "INVALID_LANE_LOAD_INPUT");
  });
});
