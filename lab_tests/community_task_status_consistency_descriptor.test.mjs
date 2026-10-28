import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/task_status_consistency_descriptor.mjs";

function expectInvalid(payload) {
  assert.throws(() => runFeature(payload), (err) => err instanceof TypeError && err.message === "INVALID_TASK_STATUS_CONSISTENCY_INPUT");
}

describe("task_status_consistency_descriptor", () => {
  it("balanced input matches with zero surplus and deficit", () => {
    assert.deepEqual(runFeature({ total: 3, byStatus: { done: 2, todo: 1 } }), {
      total: 3,
      summed: 3,
      distinctStatusCount: 2,
      matches: true,
      surplus: 0,
      deficit: 0
    });
  });

  it("balanced empty input matches", () => {
    assert.deepEqual(runFeature({ total: 0, byStatus: {} }), {
      total: 0,
      summed: 0,
      distinctStatusCount: 0,
      matches: true,
      surplus: 0,
      deficit: 0
    });
  });

  it("over-counted input reports surplus", () => {
    assert.deepEqual(runFeature({ total: 2, byStatus: { done: 1, todo: 2 } }), {
      total: 2,
      summed: 3,
      distinctStatusCount: 2,
      matches: false,
      surplus: 1,
      deficit: 0
    });
  });

  it("under-counted input reports deficit", () => {
    assert.deepEqual(runFeature({ total: 5, byStatus: { todo: 2 } }), {
      total: 5,
      summed: 2,
      distinctStatusCount: 1,
      matches: false,
      surplus: 0,
      deficit: 3
    });
  });

  it("empty byStatus under-counted reports full deficit", () => {
    assert.deepEqual(runFeature({ total: 5, byStatus: {} }), {
      total: 5,
      summed: 0,
      distinctStatusCount: 0,
      matches: false,
      surplus: 0,
      deficit: 5
    });
  });

  it("ignores extra payload properties", () => {
    assert.deepEqual(runFeature({ total: 3, byStatus: { done: 2, todo: 1 }, extra: 99 }), {
      total: 3,
      summed: 3,
      distinctStatusCount: 2,
      matches: true,
      surplus: 0,
      deficit: 0
    });
  });

  it("rejects malformed payloads without echoing input", () => {
    expectInvalid(null);
    expectInvalid(undefined);
    expectInvalid([]);
    expectInvalid(42);
    expectInvalid("x");
    expectInvalid({});
    expectInvalid({ byStatus: {} });
    expectInvalid({ total: 0 });
    expectInvalid({ total: 1.5, byStatus: {} });
    expectInvalid({ total: "3", byStatus: {} });
    expectInvalid({ total: -1, byStatus: {} });
    expectInvalid({ total: 10001, byStatus: {} });
    expectInvalid({ total: NaN, byStatus: {} });
    expectInvalid({ total: Infinity, byStatus: {} });
    expectInvalid({ total: 0, byStatus: null });
    expectInvalid({ total: 0, byStatus: [] });
    expectInvalid({ total: 0, byStatus: 5 });
    expectInvalid({ total: 0, byStatus: "x" });
    expectInvalid({ total: 0, byStatus: { "": 1 } });
    expectInvalid({ total: 0, byStatus: { a: 1.5 } });
    expectInvalid({ total: 0, byStatus: { a: "1" } });
    expectInvalid({ total: 0, byStatus: { a: -1 } });
    expectInvalid({ total: 0, byStatus: { a: 10001 } });
    expectInvalid({ total: 0, byStatus: { a: NaN } });
    const overlongKey = "k".repeat(65);
    const badByStatus = Object.fromEntries([[overlongKey, 1]]);
    const badPayload = Object.fromEntries([["total", 1], ["byStatus", badByStatus]]);
    expectInvalid(badPayload);
    const manyByStatus = {
      s00: 1, s01: 1, s02: 1, s03: 1, s04: 1, s05: 1, s06: 1, s07: 1, s08: 1, s09: 1,
      s10: 1, s11: 1, s12: 1, s13: 1, s14: 1, s15: 1, s16: 1, s17: 1, s18: 1, s19: 1,
      s20: 1, s21: 1, s22: 1, s23: 1, s24: 1, s25: 1, s26: 1, s27: 1, s28: 1, s29: 1,
      s30: 1, s31: 1, s32: 1, s33: 1, s34: 1, s35: 1, s36: 1, s37: 1, s38: 1, s39: 1,
      s40: 1, s41: 1, s42: 1, s43: 1, s44: 1, s45: 1, s46: 1, s47: 1, s48: 1, s49: 1,
      s50: 1
    };
    expectInvalid({ total: 51, byStatus: manyByStatus });
    try {
      runFeature({ total: 0, byStatus: { secretMarkerValue: "bad" } });
      assert.fail("should have thrown");
    } catch (err) {
      assert.equal(err.message, "INVALID_TASK_STATUS_CONSISTENCY_INPUT");
      assert.equal(String(err).includes("secretMarkerValue"), false);
    }
  });

  it("never mutates input, returns fresh deterministic object", () => {
    const input = { total: 3, byStatus: { done: 2, todo: 1 } };
    const snapshot = JSON.parse(JSON.stringify(input));
    const first = runFeature(input);
    const second = runFeature(input);
    assert.deepEqual(input, snapshot);
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.notEqual(first, input);
    assert.deepEqual(first, {
      total: 3,
      summed: 3,
      distinctStatusCount: 2,
      matches: true,
      surplus: 0,
      deficit: 0
    });
  });
});
