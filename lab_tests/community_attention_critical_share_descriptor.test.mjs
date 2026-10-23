import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/attention_critical_share_descriptor.mjs";

describe("attention critical share descriptor", () => {
  it("handles zero totals", () => {
    assert.deepEqual(runFeature({ flaggedCount: 0, criticalCount: 0 }), {
      flaggedCount: 0,
      criticalCount: 0,
      nonCriticalCount: 0,
      hasCritical: false,
      allCritical: false,
      noneCritical: true
    });
  });
  it("handles partial critical share", () => {
    assert.deepEqual(runFeature({ flaggedCount: 4, criticalCount: 1 }), {
      flaggedCount: 4,
      criticalCount: 1,
      nonCriticalCount: 3,
      hasCritical: true,
      allCritical: false,
      noneCritical: false
    });
  });
  it("handles all critical", () => {
    assert.deepEqual(runFeature({ flaggedCount: 3, criticalCount: 3 }), {
      flaggedCount: 3,
      criticalCount: 3,
      nonCriticalCount: 0,
      hasCritical: true,
      allCritical: true,
      noneCritical: false
    });
  });
  it("computes non-critical as difference with preserved counts", () => {
    const out = runFeature({ flaggedCount: 10, criticalCount: 4 });
    assert.equal(out.flaggedCount, 10);
    assert.equal(out.criticalCount, 4);
    assert.equal(out.nonCriticalCount, 6);
  });
  it("sets flags for none critical with nonzero flagged", () => {
    const out = runFeature({ flaggedCount: 5, criticalCount: 0 });
    assert.equal(out.hasCritical, false);
    assert.equal(out.noneCritical, true);
    assert.equal(out.allCritical, false);
    assert.equal(out.nonCriticalCount, 5);
  });
  it("does not mark empty input as all critical", () => {
    const out = runFeature({ flaggedCount: 0, criticalCount: 0 });
    assert.equal(out.allCritical, false);
  });
  it("ignores extra properties and does not mutate input", () => {
    const input = { flaggedCount: 6, criticalCount: 2, extra: "keep", other: 99 };
    const snapshot = { flaggedCount: 6, criticalCount: 2, extra: "keep", other: 99 };
    const out = runFeature(input);
    assert.deepEqual(input, snapshot);
    assert.equal(out.flaggedCount, 6);
    assert.equal(out.criticalCount, 2);
    assert.equal(out.nonCriticalCount, 4);
    assert.equal(out.hasCritical, true);
    assert.equal(out.noneCritical, false);
    assert.equal(out.allCritical, false);
  });
  it("returns a fresh object on each call", () => {
    const first = runFeature({ flaggedCount: 4, criticalCount: 1 });
    const second = runFeature({ flaggedCount: 4, criticalCount: 1 });
    assert.notEqual(first, second);
    assert.deepEqual(first, second);
    first.nonCriticalCount = 999;
    const third = runFeature({ flaggedCount: 4, criticalCount: 1 });
    assert.equal(third.nonCriticalCount, 3);
  });
  it("rejects malformed shapes without echoing input", () => {
    const bad = [
      null,
      undefined,
      0,
      "x",
      true,
      [],
      [{ flaggedCount: 1, criticalCount: 1 }],
      {},
      { flaggedCount: 1 },
      { criticalCount: 1 },
      { flaggedCount: 0, criticalCount: 0, extra: null },
      { flaggedCount: 1.5, criticalCount: 0 },
      { flaggedCount: 2, criticalCount: 1.2 },
      { flaggedCount: NaN, criticalCount: 0 },
      { flaggedCount: 2, criticalCount: NaN },
      { flaggedCount: Infinity, criticalCount: 0 },
      { flaggedCount: -1, criticalCount: 0 },
      { flaggedCount: 0, criticalCount: -1 },
      { flaggedCount: 10001, criticalCount: 0 },
      { flaggedCount: 5, criticalCount: 10001 },
      { flaggedCount: "3", criticalCount: 1 },
      { flaggedCount: 3, criticalCount: "1" },
      { flaggedCount: 2, criticalCount: 3 },
      { flaggedCount: null, criticalCount: 0 },
      { flaggedCount: 2, criticalCount: null }
    ];
    for (const value of bad) {
      if (value !== null && typeof value === "object" && Array.isArray(value) === false) {
        if (value.flaggedCount === 0 && value.criticalCount === 0) {
          continue;
        }
      }
      assert.throws(() => runFeature(value), (err) => err instanceof TypeError && err.message === "INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
    }
  });
  it("rejects critical above flagged", () => {
    assert.throws(() => runFeature({ flaggedCount: 2, criticalCount: 3 }), (err) => err instanceof TypeError && err.message === "INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
  });
  it("exposes a synchronous pure function", () => {
    assert.equal(typeof runFeature, "function");
    const out = runFeature({ flaggedCount: 1, criticalCount: 0 });
    assert.equal(out instanceof Promise, false);
  });
});
