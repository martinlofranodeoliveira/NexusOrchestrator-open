import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/lane_event_sequence_gap_descriptor.mjs";

describe("lane event sequence gap descriptor", () => {
  it("describes contiguous input 10-12 total 3", () => {
    const result = runFeature({ firstSeq: 10, lastSeq: 12, total: 3 });
    assert.deepEqual(result, {
      firstSeq: 10,
      lastSeq: 12,
      total: 3,
      expected: 3,
      missing: 0,
      hasGap: false,
      contiguous: true
    });
  });
  it("describes gapped input 10-14 total 3", () => {
    const result = runFeature({ firstSeq: 10, lastSeq: 14, total: 3 });
    assert.deepEqual(result, {
      firstSeq: 10,
      lastSeq: 14,
      total: 3,
      expected: 5,
      missing: 2,
      hasGap: true,
      contiguous: false
    });
  });
  it("describes single input 5-5 total 1", () => {
    const result = runFeature({ firstSeq: 5, lastSeq: 5, total: 1 });
    assert.deepEqual(result, {
      firstSeq: 5,
      lastSeq: 5,
      total: 1,
      expected: 1,
      missing: 0,
      hasGap: false,
      contiguous: true
    });
  });
  it("clamps missing to zero when total exceeds expected", () => {
    const result = runFeature({ firstSeq: 5, lastSeq: 5, total: 4 });
    assert.equal(result.expected, 1);
    assert.equal(result.missing, 0);
    assert.equal(result.hasGap, false);
    assert.equal(result.contiguous, true);
  });
  it("throws without echoing input for malformed shapes", () => {
    const badInputs = [
      null,
      undefined,
      12,
      "gap",
      [10, 12, 3],
      {},
      { firstSeq: 10, lastSeq: 12 },
      { firstSeq: 10, total: 3 },
      { lastSeq: 12, total: 3 },
      { firstSeq: 10.5, lastSeq: 12, total: 3 },
      { firstSeq: "10", lastSeq: 12, total: 3 },
      { firstSeq: 10, lastSeq: 12, total: 2.5 },
      { firstSeq: NaN, lastSeq: 12, total: 3 },
      { firstSeq: 10, lastSeq: Infinity, total: 3 },
      { firstSeq: -1, lastSeq: 2, total: 2 },
      { firstSeq: 0, lastSeq: 1000001, total: 2 },
      { firstSeq: 0, lastSeq: 1, total: 1000001 },
      { firstSeq: 14, lastSeq: 10, total: 1 }
    ];
    for (const value of badInputs) {
      assert.throws(() => runFeature(value), (error) => {
        assert.ok(error instanceof TypeError);
        assert.equal(error.message, "INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
        assert.equal("message" in error && error.message.includes("10, 12") === false, true);
        return true;
      });
    }
  });
  it("preserves input, ignores extras and returns fresh object", () => {
    const input = { firstSeq: 10, lastSeq: 12, total: 2, note: "extra" };
    const snapshot = { firstSeq: 10, lastSeq: 12, total: 2, note: "extra" };
    const result = runFeature(input);
    assert.deepEqual(input, snapshot);
    assert.deepEqual(result, {
      firstSeq: 10,
      lastSeq: 12,
      total: 2,
      expected: 3,
      missing: 1,
      hasGap: true,
      contiguous: false
    });
    assert.notEqual(result, input);
    assert.equal("note" in result, false);
  });
});
