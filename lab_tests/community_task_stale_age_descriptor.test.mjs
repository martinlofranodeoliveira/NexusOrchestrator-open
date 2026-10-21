import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/task_stale_age_descriptor.mjs";

describe("task_stale_age_descriptor", () => {
  it("returns not-stale descriptor when age is below threshold", () => {
    assert.deepEqual(runFeature({ staleThresholdMs: 60000, lastActivityAgeMs: 10000 }), {
      staleThresholdMs: 60000,
      lastActivityAgeMs: 10000,
      hasKnownAge: true,
      isStale: false,
      overdueMs: 0,
      needsReview: false
    });
  });
  it("returns stale descriptor when age is above threshold", () => {
    assert.deepEqual(runFeature({ staleThresholdMs: 60000, lastActivityAgeMs: 90000 }), {
      staleThresholdMs: 60000,
      lastActivityAgeMs: 90000,
      hasKnownAge: true,
      isStale: true,
      overdueMs: 30000,
      needsReview: true
    });
  });
  it("returns stale descriptor with zero overdue when age equals threshold", () => {
    assert.deepEqual(runFeature({ staleThresholdMs: 60000, lastActivityAgeMs: 60000 }), {
      staleThresholdMs: 60000,
      lastActivityAgeMs: 60000,
      hasKnownAge: true,
      isStale: true,
      overdueMs: 0,
      needsReview: true
    });
  });
  it("returns unknown-age descriptor when age is null", () => {
    assert.deepEqual(runFeature({ staleThresholdMs: 60000, lastActivityAgeMs: null }), {
      staleThresholdMs: 60000,
      lastActivityAgeMs: null,
      hasKnownAge: false,
      isStale: false,
      overdueMs: 0,
      needsReview: false
    });
  });
  it("ignores extra properties, never mutates input, returns fresh object", () => {
    const input = { staleThresholdMs: 60000, lastActivityAgeMs: 90000, extra: "keep", nested: { a: 1 } };
    const snapshot = { staleThresholdMs: 60000, lastActivityAgeMs: 90000, extra: "keep", nested: { a: 1 } };
    const first = runFeature(input);
    const second = runFeature(input);
    assert.deepEqual(input, snapshot);
    assert.deepEqual(first, {
      staleThresholdMs: 60000,
      lastActivityAgeMs: 90000,
      hasKnownAge: true,
      isStale: true,
      overdueMs: 30000,
      needsReview: true
    });
    assert.notStrictEqual(first, second);
    assert.deepEqual(first, second);
    const frozen = Object.freeze({ staleThresholdMs: 10, lastActivityAgeMs: null });
    assert.deepEqual(runFeature(frozen), {
      staleThresholdMs: 10,
      lastActivityAgeMs: null,
      hasKnownAge: false,
      isStale: false,
      overdueMs: 0,
      needsReview: false
    });
  });
  it("rejects malformed shapes without echoing input", () => {
    const bad = [
      null,
      undefined,
      42,
      "x",
      true,
      [],
      [1],
      {},
      { staleThresholdMs: 60000 },
      { lastActivityAgeMs: 10 },
      { staleThresholdMs: null, lastActivityAgeMs: 10 },
      { staleThresholdMs: 60000, lastActivityAgeMs: undefined },
      { staleThresholdMs: 0, lastActivityAgeMs: 10 },
      { staleThresholdMs: -5, lastActivityAgeMs: 10 },
      { staleThresholdMs: 1.5, lastActivityAgeMs: 10 },
      { staleThresholdMs: Infinity, lastActivityAgeMs: 10 },
      { staleThresholdMs: NaN, lastActivityAgeMs: 10 },
      { staleThresholdMs: 9007199254740992, lastActivityAgeMs: 10 },
      { staleThresholdMs: "60000", lastActivityAgeMs: 10 },
      { staleThresholdMs: 60000, lastActivityAgeMs: -1 },
      { staleThresholdMs: 60000, lastActivityAgeMs: 1.5 },
      { staleThresholdMs: 60000, lastActivityAgeMs: Infinity },
      { staleThresholdMs: 60000, lastActivityAgeMs: NaN },
      { staleThresholdMs: 60000, lastActivityAgeMs: 9007199254740992 },
      { staleThresholdMs: 60000, lastActivityAgeMs: "10" },
      { staleThresholdMs: 60000, lastActivityAgeMs: false }
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.equal(err instanceof TypeError, true);
        assert.equal(err.message, "INVALID_TASK_STALE_AGE_INPUT");
        return true;
      });
    }
  });
});
