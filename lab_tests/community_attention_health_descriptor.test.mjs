import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/attention_health_descriptor.mjs";

describe("attention health descriptor", () => {
  it("healthy with zero counts needs no review", () => {
    const input = { healthy: true, flaggedCount: 0, criticalCount: 0 };
    const before = { healthy: true, flaggedCount: 0, criticalCount: 0 };
    const result = runFeature(input);
    assert.deepEqual(result, {
      healthy: true,
      flaggedCount: 0,
      criticalCount: 0,
      hasFlagged: false,
      hasCritical: false,
      needsReview: false
    });
    assert.deepEqual(input, before);
    assert.notEqual(result, input);
  });

  it("flagged and critical counts trigger review", () => {
    const result = runFeature({ healthy: true, flaggedCount: 2, criticalCount: 1 });
    assert.equal(result.healthy, true);
    assert.equal(result.flaggedCount, 2);
    assert.equal(result.criticalCount, 1);
    assert.equal(result.hasFlagged, true);
    assert.equal(result.hasCritical, true);
    assert.equal(result.needsReview, true);
  });

  it("unhealthy alone triggers review", () => {
    const result = runFeature({ healthy: false, flaggedCount: 0, criticalCount: 0 });
    assert.equal(result.hasFlagged, false);
    assert.equal(result.hasCritical, false);
    assert.equal(result.needsReview, true);
    assert.equal(result.healthy, false);
  });

  it("ignores extra properties and preserves input", () => {
    const input = { healthy: true, flaggedCount: 1, criticalCount: 0, note: "x" };
    const result = runFeature(input);
    assert.deepEqual(result, {
      healthy: true,
      flaggedCount: 1,
      criticalCount: 0,
      hasFlagged: true,
      hasCritical: false,
      needsReview: true
    });
    assert.equal(input.note, "x");
  });

  it("rejects malformed inputs without echo", () => {
    const bad = [
      null,
      undefined,
      1,
      "x",
      true,
      [],
      [{ healthy: true, flaggedCount: 0, criticalCount: 0 }],
      {},
      { healthy: true, flaggedCount: 0 },
      { healthy: true, criticalCount: 0 },
      { flaggedCount: 0, criticalCount: 0 },
      { healthy: 1, flaggedCount: 0, criticalCount: 0 },
      { healthy: "true", flaggedCount: 0, criticalCount: 0 },
      { healthy: true, flaggedCount: 1.5, criticalCount: 0 },
      { healthy: true, flaggedCount: "2", criticalCount: 0 },
      { healthy: true, flaggedCount: NaN, criticalCount: 0 },
      { healthy: true, flaggedCount: Infinity, criticalCount: 0 },
      { healthy: true, flaggedCount: -1, criticalCount: 0 },
      { healthy: true, flaggedCount: 10001, criticalCount: 0 },
      { healthy: true, flaggedCount: 0, criticalCount: -1 },
      { healthy: true, flaggedCount: 0, criticalCount: 10001 },
      { healthy: true, flaggedCount: 1, criticalCount: 2 },
      { healthy: true, flaggedCount: 0, criticalCount: 1 }
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.equal(err.message, "INVALID_ATTENTION_HEALTH_INPUT");
        return true;
      });
    }
  });

  it("is pure deterministic with fresh objects", () => {
    const first = runFeature({ healthy: true, flaggedCount: 2, criticalCount: 1 });
    const second = runFeature({ healthy: true, flaggedCount: 2, criticalCount: 1 });
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    const frozen = Object.freeze({ healthy: false, flaggedCount: 0, criticalCount: 0 });
    const out = runFeature(frozen);
    assert.equal(out.needsReview, true);
  });
});
