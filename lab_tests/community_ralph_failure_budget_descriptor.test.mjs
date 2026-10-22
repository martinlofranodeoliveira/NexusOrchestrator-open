import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/ralph_failure_budget_descriptor.mjs";

describe("community ralph failure budget descriptor", () => {
  it("below limit preserves values and reports remaining budget", () => {
    const input = { failureCount: 0, failureLimit: 3 };
    const result = runFeature(input);
    assert.deepStrictEqual(result, {
      failureCount: 0,
      failureLimit: 3,
      remaining: 3,
      hasBudget: true,
      atLimit: false,
      overLimit: false
    });
    assert.deepStrictEqual(input, { failureCount: 0, failureLimit: 3 });
    assert.notStrictEqual(result, input);
  });

  it("equal counts report at limit with zero remaining", () => {
    const result = runFeature({ failureCount: 3, failureLimit: 3 });
    assert.deepStrictEqual(result, {
      failureCount: 3,
      failureLimit: 3,
      remaining: 0,
      hasBudget: false,
      atLimit: true,
      overLimit: false
    });
  });

  it("count above limit reports over limit with zero remaining", () => {
    const result = runFeature({ failureCount: 5, failureLimit: 2 });
    assert.deepStrictEqual(result, {
      failureCount: 5,
      failureLimit: 2,
      remaining: 0,
      hasBudget: false,
      atLimit: false,
      overLimit: true
    });
  });

  it("boundary values behave literally", () => {
    assert.deepStrictEqual(runFeature({ failureCount: 0, failureLimit: 0 }), {
      failureCount: 0,
      failureLimit: 0,
      remaining: 0,
      hasBudget: false,
      atLimit: true,
      overLimit: false
    });
    assert.deepStrictEqual(runFeature({ failureCount: 10000, failureLimit: 10000 }), {
      failureCount: 10000,
      failureLimit: 10000,
      remaining: 0,
      hasBudget: false,
      atLimit: true,
      overLimit: false
    });
    assert.deepStrictEqual(runFeature({ failureCount: 9999, failureLimit: 10000 }), {
      failureCount: 9999,
      failureLimit: 10000,
      remaining: 1,
      hasBudget: true,
      atLimit: false,
      overLimit: false
    });
  });

  it("malformed inputs throw TypeError without echoing input", () => {
    const badInputs = [
      null,
      undefined,
      42,
      "x",
      true,
      [],
      { failureCount: 1 },
      { failureLimit: 1 },
      {},
      { failureCount: 1.5, failureLimit: 3 },
      { failureCount: "1", failureLimit: 3 },
      { failureCount: 1, failureLimit: "3" },
      { failureCount: NaN, failureLimit: 3 },
      { failureCount: 1, failureLimit: Infinity },
      { failureCount: -1, failureLimit: 3 },
      { failureCount: 0, failureLimit: 10001 },
      { failureCount: 10001, failureLimit: 0 },
      { failureCount: null, failureLimit: 3 }
    ];
    for (const bad of badInputs) {
      let threw = false;
      try {
        runFeature(bad);
      } catch (err) {
        threw = true;
        assert.ok(err instanceof TypeError);
        assert.strictEqual(err.message, "INVALID_RALPH_FAILURE_BUDGET_INPUT");
        assert.strictEqual(err.message.includes("failureCount"), false);
      }
      assert.strictEqual(threw, true);
    }
  });

  it("extra properties ignored, input preserved, fresh object returned", () => {
    const input = { failureCount: 1, failureLimit: 5, extra: 99, note: "hi" };
    const snapshot = { failureCount: 1, failureLimit: 5, extra: 99, note: "hi" };
    const result = runFeature(input);
    assert.deepStrictEqual(result, {
      failureCount: 1,
      failureLimit: 5,
      remaining: 4,
      hasBudget: true,
      atLimit: false,
      overLimit: false
    });
    assert.deepStrictEqual(input, snapshot);
    assert.strictEqual("extra" in result, false);
    assert.strictEqual("note" in result, false);
    assert.notStrictEqual(result, input);
    const again = runFeature({ failureCount: 1, failureLimit: 5 });
    assert.deepStrictEqual(again, result);
    assert.notStrictEqual(again, result);
  });
});
