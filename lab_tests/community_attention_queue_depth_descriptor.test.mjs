import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/attention_queue_depth_descriptor.mjs";

const INVALID = "INVALID_ATTENTION_QUEUE_DEPTH_INPUT";

function expectInvalid(payload) {
  let threw = false;
  try {
    runFeature(payload);
  } catch (err) {
    threw = true;
    assert.equal(err instanceof TypeError, true);
    assert.equal(err.message, INVALID);
  }
  assert.equal(threw, true);
}

describe("community attention queue depth descriptor", () => {
  it("exposes runFeature as a function", () => {
    assert.equal(typeof runFeature, "function");
  });

  it("matches empty example", () => {
    const result = runFeature({ activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: 0, queuedCount: 0 });
    assert.deepStrictEqual(result, {
      activeWithoutAssigneeCount: 0,
      waitingWithoutExecutionCount: 0,
      queuedCount: 0,
      totalWaiting: 0,
      hasBacklog: false,
      empty: true
    });
  });

  it("matches backlog example with total 6", () => {
    const result = runFeature({ activeWithoutAssigneeCount: 2, waitingWithoutExecutionCount: 1, queuedCount: 3 });
    assert.equal(result.activeWithoutAssigneeCount, 2);
    assert.equal(result.waitingWithoutExecutionCount, 1);
    assert.equal(result.queuedCount, 3);
    assert.equal(result.totalWaiting, 6);
    assert.equal(result.hasBacklog, true);
    assert.equal(result.empty, false);
  });

  it("matches queued-only example with total 5", () => {
    const result = runFeature({ activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: 0, queuedCount: 5 });
    assert.deepStrictEqual(result, {
      activeWithoutAssigneeCount: 0,
      waitingWithoutExecutionCount: 0,
      queuedCount: 5,
      totalWaiting: 5,
      hasBacklog: true,
      empty: false
    });
  });

  it("accepts boundaries and ignores extra properties", () => {
    const result = runFeature({
      activeWithoutAssigneeCount: 10000,
      waitingWithoutExecutionCount: 10000,
      queuedCount: 10000,
      extra: "ignored",
      note: 123
    });
    assert.equal(result.activeWithoutAssigneeCount, 10000);
    assert.equal(result.waitingWithoutExecutionCount, 10000);
    assert.equal(result.queuedCount, 10000);
    assert.equal(result.totalWaiting, 30000);
    assert.equal(result.hasBacklog, true);
    assert.equal(result.empty, false);
    assert.deepStrictEqual(Object.keys(result).sort(), ["activeWithoutAssigneeCount", "empty", "hasBacklog", "queuedCount", "totalWaiting", "waitingWithoutExecutionCount"]);
  });

  it("returns fresh object and never mutates input", () => {
    const input = { activeWithoutAssigneeCount: 1, waitingWithoutExecutionCount: 2, queuedCount: 3, extra: 9 };
    const snapshot = JSON.stringify(input);
    const result = runFeature(input);
    assert.equal(JSON.stringify(input), snapshot);
    assert.equal(result.totalWaiting, 6);
    assert.notEqual(result, input);
    assert.equal(JSON.stringify(input), snapshot);
  });

  it("rejects null, array and non-object shapes without echo", () => {
    expectInvalid(null);
    expectInvalid(undefined);
    expectInvalid([]);
    expectInvalid([1, 2, 3]);
    expectInvalid(42);
    expectInvalid("counts");
    expectInvalid(true);
    expectInvalid({});
    expectInvalid({ activeWithoutAssigneeCount: 1 });
    expectInvalid({ activeWithoutAssigneeCount: 1, waitingWithoutExecutionCount: 1 });
    expectInvalid({ activeWithoutAssigneeCount: 1, queuedCount: 1 });
    expectInvalid({ waitingWithoutExecutionCount: 1, queuedCount: 1 });
  });

  it("rejects non-integer, non-finite and out-of-range counts", () => {
    expectInvalid({ activeWithoutAssigneeCount: 1.5, waitingWithoutExecutionCount: 0, queuedCount: 0 });
    expectInvalid({ activeWithoutAssigneeCount: "1", waitingWithoutExecutionCount: 0, queuedCount: 0 });
    expectInvalid({ activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: null, queuedCount: 0 });
    expectInvalid({ activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: 0, queuedCount: false });
    expectInvalid({ activeWithoutAssigneeCount: NaN, waitingWithoutExecutionCount: 0, queuedCount: 0 });
    expectInvalid({ activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: Infinity, queuedCount: 0 });
    expectInvalid({ activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: 0, queuedCount: -Infinity });
    expectInvalid({ activeWithoutAssigneeCount: -1, waitingWithoutExecutionCount: 0, queuedCount: 0 });
    expectInvalid({ activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: -5, queuedCount: 0 });
    expectInvalid({ activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: 0, queuedCount: 10001 });
    expectInvalid({ activeWithoutAssigneeCount: 10001, waitingWithoutExecutionCount: 0, queuedCount: 0 });
  });

  it("does not mutate rejected inputs", () => {
    const bad = { activeWithoutAssigneeCount: 1, waitingWithoutExecutionCount: 2, queuedCount: 10001 };
    const before = JSON.stringify(bad);
    expectInvalid(bad);
    assert.equal(JSON.stringify(bad), before);
  });
});
