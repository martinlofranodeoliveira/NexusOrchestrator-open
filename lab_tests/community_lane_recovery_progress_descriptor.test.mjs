import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/lane_recovery_progress_descriptor.mjs";

describe("lane recovery progress descriptor", () => {
  it("null attempt returns unstarted counts without mutating input", () => {
    const input = { attempt: null, maxAttempts: 3, steps: ["check", "retry"] };
    const snapshot = JSON.stringify(input);
    const result = runFeature(input);
    assert.deepEqual(result, {
      totalSteps: 2,
      attempt: null,
      maxAttempts: 3,
      remainingAttempts: 3,
      remainingSteps: 2,
      isStarted: false,
      isExhausted: false,
      isStepsExhausted: false,
      hasSteps: true
    });
    assert.equal(JSON.stringify(input), snapshot);
    assert.notStrictEqual(result, input);
  });
  it("attempt 1 returns remaining counts", () => {
    const result = runFeature({ attempt: 1, maxAttempts: 3, steps: ["check", "retry", "verify"] });
    assert.equal(result.totalSteps, 3);
    assert.equal(result.attempt, 1);
    assert.equal(result.maxAttempts, 3);
    assert.equal(result.remainingAttempts, 2);
    assert.equal(result.remainingSteps, 2);
    assert.equal(result.isStarted, true);
    assert.equal(result.isExhausted, false);
    assert.equal(result.isStepsExhausted, false);
    assert.equal(result.hasSteps, true);
  });
  it("exhausted attempt clamps remaining to zero", () => {
    const result = runFeature({ attempt: 3, maxAttempts: 2, steps: ["check"] });
    assert.equal(result.totalSteps, 1);
    assert.equal(result.remainingAttempts, 0);
    assert.equal(result.remainingSteps, 0);
    assert.equal(result.isStarted, true);
    assert.equal(result.isExhausted, true);
    assert.equal(result.isStepsExhausted, true);
    assert.equal(result.hasSteps, true);
  });
  it("rejects malformed inputs with exact message", () => {
    const cases = [
      null,
      ["check"],
      {},
      { attempt: null, maxAttempts: 3 },
      { attempt: null, steps: [] },
      { maxAttempts: 3, steps: [] },
      42,
      "nope",
      true,
      { attempt: 1.5, maxAttempts: 3, steps: [] },
      { attempt: -1, maxAttempts: 3, steps: [] },
      { attempt: 10001, maxAttempts: 3, steps: [] },
      { attempt: "1", maxAttempts: 3, steps: [] },
      { attempt: null, maxAttempts: 1.5, steps: [] },
      { attempt: null, maxAttempts: -1, steps: [] },
      { attempt: null, maxAttempts: 10001, steps: [] },
      { attempt: null, maxAttempts: null, steps: [] },
      { attempt: null, maxAttempts: 3, steps: "check" },
      { attempt: null, maxAttempts: 3, steps: [123] },
      { attempt: null, maxAttempts: 3, steps: ["x".repeat(513)] }
    ];
    for (const bad of cases) {
      assert.throws(() => runFeature(bad), (err) => err instanceof TypeError && err.message === "INVALID_LANE_RECOVERY_PROGRESS_INPUT");
    }
    const longSteps = [];
    for (const v of ["a", "b", "c"]) {
      longSteps.push(v);
    }
    while (longSteps.length <= 50) {
      longSteps.push("s");
    }
    assert.throws(() => runFeature({ attempt: null, maxAttempts: 3, steps: longSteps }), { name: "TypeError", message: "INVALID_LANE_RECOVERY_PROGRESS_INPUT" });
  });
  it("preserves input and ignores step text beyond counts", () => {
    const first = { attempt: null, maxAttempts: 2, steps: ["alpha", "beta"] };
    const second = { attempt: null, maxAttempts: 2, steps: ["gamma", "delta"] };
    const a = runFeature(first);
    const b = runFeature(second);
    assert.deepEqual(a, b);
    assert.equal(JSON.stringify(first), JSON.stringify({ attempt: null, maxAttempts: 2, steps: ["alpha", "beta"] }));
    const empty = runFeature({ attempt: null, maxAttempts: 2, steps: [], extra: 99 });
    assert.equal(empty.totalSteps, 0);
    assert.equal(empty.hasSteps, false);
    assert.equal(empty.remainingSteps, 0);
    assert.equal(empty.isStarted, false);
  });
});
