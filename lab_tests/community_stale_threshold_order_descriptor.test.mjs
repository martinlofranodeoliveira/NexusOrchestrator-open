import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/stale_threshold_order_descriptor.mjs";

describe("stale threshold order descriptor", () => {
  it("describes active below review", () => {
    assert.deepEqual(runFeature({ activeTaskStaleMs: 1000, reviewTaskStaleMs: 2000 }), {
      activeTaskStaleMs: 1000,
      reviewTaskStaleMs: 2000,
      minThreshold: 1000,
      maxThreshold: 2000,
      equal: false,
      activeIsLower: true,
      reviewIsLower: false
    });
  });

  it("describes review below active", () => {
    assert.deepEqual(runFeature({ activeTaskStaleMs: 9000, reviewTaskStaleMs: 3000 }), {
      activeTaskStaleMs: 9000,
      reviewTaskStaleMs: 3000,
      minThreshold: 3000,
      maxThreshold: 9000,
      equal: false,
      activeIsLower: false,
      reviewIsLower: true
    });
  });

  it("describes equal thresholds", () => {
    assert.deepEqual(runFeature({ activeTaskStaleMs: 5000, reviewTaskStaleMs: 5000 }), {
      activeTaskStaleMs: 5000,
      reviewTaskStaleMs: 5000,
      minThreshold: 5000,
      maxThreshold: 5000,
      equal: true,
      activeIsLower: false,
      reviewIsLower: false
    });
  });

  it("supports boundary values", () => {
    assert.deepEqual(runFeature({ activeTaskStaleMs: 0, reviewTaskStaleMs: 1000000000 }), {
      activeTaskStaleMs: 0,
      reviewTaskStaleMs: 1000000000,
      minThreshold: 0,
      maxThreshold: 1000000000,
      equal: false,
      activeIsLower: true,
      reviewIsLower: false
    });
    assert.deepEqual(runFeature({ activeTaskStaleMs: 0, reviewTaskStaleMs: 0 }), {
      activeTaskStaleMs: 0,
      reviewTaskStaleMs: 0,
      minThreshold: 0,
      maxThreshold: 0,
      equal: true,
      activeIsLower: false,
      reviewIsLower: false
    });
    assert.deepEqual(runFeature({ activeTaskStaleMs: 1000000000, reviewTaskStaleMs: 1000000000 }), {
      activeTaskStaleMs: 1000000000,
      reviewTaskStaleMs: 1000000000,
      minThreshold: 1000000000,
      maxThreshold: 1000000000,
      equal: true,
      activeIsLower: false,
      reviewIsLower: false
    });
  });

  it("ignores extra properties", () => {
    assert.deepEqual(runFeature({ activeTaskStaleMs: 10, reviewTaskStaleMs: 20, extra: "yes" }), {
      activeTaskStaleMs: 10,
      reviewTaskStaleMs: 20,
      minThreshold: 10,
      maxThreshold: 20,
      equal: false,
      activeIsLower: true,
      reviewIsLower: false
    });
  });

  it("rejects malformed shapes without echoing input", () => {
    const badPayloads = [
      null,
      undefined,
      42,
      "x",
      true,
      false,
      [],
      [1000, 2000],
      {},
      { activeTaskStaleMs: 1000 },
      { reviewTaskStaleMs: 2000 },
      { activeTaskStaleMs: 1.5, reviewTaskStaleMs: 2 },
      { activeTaskStaleMs: 1, reviewTaskStaleMs: 2.5 },
      { activeTaskStaleMs: "1000", reviewTaskStaleMs: 2000 },
      { activeTaskStaleMs: 1000, reviewTaskStaleMs: "2000" },
      { activeTaskStaleMs: NaN, reviewTaskStaleMs: 5 },
      { activeTaskStaleMs: 5, reviewTaskStaleMs: Infinity },
      { activeTaskStaleMs: -Infinity, reviewTaskStaleMs: 5 },
      { activeTaskStaleMs: -1, reviewTaskStaleMs: 5 },
      { activeTaskStaleMs: 5, reviewTaskStaleMs: -1 },
      { activeTaskStaleMs: 1000000001, reviewTaskStaleMs: 5 },
      { activeTaskStaleMs: 5, reviewTaskStaleMs: 1000000001 },
      { activeTaskStaleMs: null, reviewTaskStaleMs: 5 },
      { activeTaskStaleMs: 5, reviewTaskStaleMs: null }
    ];
    for (const payload of badPayloads) {
      assert.throws(() => runFeature(payload), {
        name: "TypeError",
        message: "INVALID_STALE_THRESHOLD_ORDER_INPUT"
      });
    }
    try {
      runFeature({ activeTaskStaleMs: 987654321, reviewTaskStaleMs: "bad" });
      assert.fail("expected throw");
    } catch (err) {
      assert.equal(err.name, "TypeError");
      assert.equal(err.message, "INVALID_STALE_THRESHOLD_ORDER_INPUT");
      assert.equal(err.message.includes("987654321"), false);
      assert.equal(err.message.includes("bad"), false);
    }
  });

  it("keeps input intact and returns fresh deterministic objects", () => {
    const input = { activeTaskStaleMs: 1200, reviewTaskStaleMs: 3400 };
    const snapshot = { activeTaskStaleMs: 1200, reviewTaskStaleMs: 3400 };
    const first = runFeature(input);
    const second = runFeature(input);
    assert.deepEqual(input, snapshot);
    assert.deepEqual(first, second);
    assert.equal(first === second, false);
    assert.equal(first.activeTaskStaleMs, 1200);
    assert.equal(first.reviewTaskStaleMs, 3400);
    assert.equal(first.minThreshold, 1200);
    assert.equal(first.maxThreshold, 3400);
    assert.equal(first.equal, false);
    assert.equal(first.activeIsLower, true);
    assert.equal(first.reviewIsLower, false);
  });
});
