import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/attention_flagged_share_descriptor.mjs";

function checkInvalid(value) {
  try {
    runFeature(value);
  } catch (err) {
    assert.ok(err instanceof TypeError);
    assert.strictEqual(err.message, "INVALID_ATTENTION_FLAGGED_SHARE_INPUT");
    return;
  }
  assert.fail("expected TypeError");
}

describe("attention flagged share descriptor", () => {
  it("rejects malformed shapes", () => {
    checkInvalid(null);
    checkInvalid(undefined);
    checkInvalid([]);
    checkInvalid([{ flaggedCount: 0, criticalCount: 0 }]);
    checkInvalid("x");
    checkInvalid(42);
    checkInvalid(true);
    checkInvalid({});
    checkInvalid({ flaggedCount: 1 });
    checkInvalid({ criticalCount: 0 });
    checkInvalid({ flaggedCount: 1.5, criticalCount: 0 });
    checkInvalid({ flaggedCount: "3", criticalCount: 1 });
    checkInvalid({ flaggedCount: 3, criticalCount: "1" });
    checkInvalid({ flaggedCount: NaN, criticalCount: 0 });
    checkInvalid({ flaggedCount: Infinity, criticalCount: 0 });
    checkInvalid({ flaggedCount: 0, criticalCount: NaN });
    checkInvalid({ flaggedCount: -1, criticalCount: 0 });
    checkInvalid({ flaggedCount: 1000001, criticalCount: 0 });
    checkInvalid({ flaggedCount: 2, criticalCount: -1 });
    checkInvalid({ flaggedCount: 2, criticalCount: 1000001 });
    checkInvalid({ flaggedCount: 2, criticalCount: 1.2 });
    checkInvalid({ flaggedCount: 2, criticalCount: 3 });
  });

  it("accepts zero counts", () => {
    const out = runFeature({ flaggedCount: 0, criticalCount: 0 });
    assert.deepStrictEqual(out, {
      flaggedCount: 0,
      criticalCount: 0,
      nonCriticalFlagged: 0,
      hasFlagged: false,
      hasCritical: false,
      allCritical: false
    });
  });

  it("accepts partial critical share", () => {
    const out = runFeature({ flaggedCount: 3, criticalCount: 1 });
    assert.strictEqual(out.flaggedCount, 3);
    assert.strictEqual(out.criticalCount, 1);
    assert.strictEqual(out.nonCriticalFlagged, 2);
    assert.strictEqual(out.hasFlagged, true);
    assert.strictEqual(out.hasCritical, true);
    assert.strictEqual(out.allCritical, false);
  });

  it("accepts all critical share", () => {
    const out = runFeature({ flaggedCount: 2, criticalCount: 2 });
    assert.deepStrictEqual(out, {
      flaggedCount: 2,
      criticalCount: 2,
      nonCriticalFlagged: 0,
      hasFlagged: true,
      hasCritical: true,
      allCritical: true
    });
  });

  it("ignores extras, preserves input and returns fresh object", () => {
    const input = { flaggedCount: 3, criticalCount: 1, extra: 99 };
    const out = runFeature(input);
    assert.deepStrictEqual(input, { flaggedCount: 3, criticalCount: 1, extra: 99 });
    assert.deepStrictEqual(out, {
      flaggedCount: 3,
      criticalCount: 1,
      nonCriticalFlagged: 2,
      hasFlagged: true,
      hasCritical: true,
      allCritical: false
    });
    assert.notStrictEqual(out, input);
    const again = runFeature({ flaggedCount: 3, criticalCount: 1 });
    assert.notStrictEqual(out, again);
    assert.deepStrictEqual(out, again);
  });
});
