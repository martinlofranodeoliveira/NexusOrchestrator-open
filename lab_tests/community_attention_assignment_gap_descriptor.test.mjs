import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/attention_assignment_gap_descriptor.mjs";

describe("attention_assignment_gap_descriptor", () => {
  it("handles all-zero clear case", () => {
    assert.deepEqual(runFeature({ activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: 0 }), {
      activeWithoutAssigneeCount: 0,
      waitingWithoutExecutionCount: 0,
      totalGap: 0,
      hasGap: false,
      needsAssignment: false,
      needsExecution: false,
      clear: true
    });
  });
  it("handles assignment-only gap", () => {
    assert.deepEqual(runFeature({ activeWithoutAssigneeCount: 2, waitingWithoutExecutionCount: 0 }), {
      activeWithoutAssigneeCount: 2,
      waitingWithoutExecutionCount: 0,
      totalGap: 2,
      hasGap: true,
      needsAssignment: true,
      needsExecution: false,
      clear: false
    });
  });
  it("handles mixed gap", () => {
    assert.deepEqual(runFeature({ activeWithoutAssigneeCount: 1, waitingWithoutExecutionCount: 3 }), {
      activeWithoutAssigneeCount: 1,
      waitingWithoutExecutionCount: 3,
      totalGap: 4,
      hasGap: true,
      needsAssignment: true,
      needsExecution: true,
      clear: false
    });
  });
  it("handles execution-only and boundaries", () => {
    assert.deepEqual(runFeature({ activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: 5 }), {
      activeWithoutAssigneeCount: 0,
      waitingWithoutExecutionCount: 5,
      totalGap: 5,
      hasGap: true,
      needsAssignment: false,
      needsExecution: true,
      clear: false
    });
    assert.deepEqual(runFeature({ activeWithoutAssigneeCount: 10000, waitingWithoutExecutionCount: 10000 }), {
      activeWithoutAssigneeCount: 10000,
      waitingWithoutExecutionCount: 10000,
      totalGap: 20000,
      hasGap: true,
      needsAssignment: true,
      needsExecution: true,
      clear: false
    });
    assert.deepEqual(runFeature({ activeWithoutAssigneeCount: 10000, waitingWithoutExecutionCount: 0 }), {
      activeWithoutAssigneeCount: 10000,
      waitingWithoutExecutionCount: 0,
      totalGap: 10000,
      hasGap: true,
      needsAssignment: true,
      needsExecution: false,
      clear: false
    });
    assert.deepEqual(runFeature({ activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: 10000 }), {
      activeWithoutAssigneeCount: 0,
      waitingWithoutExecutionCount: 10000,
      totalGap: 10000,
      hasGap: true,
      needsAssignment: false,
      needsExecution: true,
      clear: false
    });
  });
  it("ignores extras, preserves input and returns fresh object", () => {
    const input = { activeWithoutAssigneeCount: 3, waitingWithoutExecutionCount: 4, extra: 99 };
    const before = { activeWithoutAssigneeCount: 3, waitingWithoutExecutionCount: 4, extra: 99 };
    const first = runFeature(input);
    const second = runFeature(input);
    assert.deepEqual(input, before);
    assert.deepEqual(first, {
      activeWithoutAssigneeCount: 3,
      waitingWithoutExecutionCount: 4,
      totalGap: 7,
      hasGap: true,
      needsAssignment: true,
      needsExecution: true,
      clear: false
    });
    assert.notStrictEqual(first, second);
    assert.deepEqual(first, second);
  });
  it("rejects malformed shapes without echoing input", () => {
    const bad = [
      null,
      undefined,
      0,
      "x",
      true,
      [],
      [{ activeWithoutAssigneeCount: 1, waitingWithoutExecutionCount: 1 }],
      {},
      { activeWithoutAssigneeCount: 1 },
      { waitingWithoutExecutionCount: 1 },
      { activeWithoutAssigneeCount: 1.5, waitingWithoutExecutionCount: 0 },
      { activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: 2.5 },
      { activeWithoutAssigneeCount: "2", waitingWithoutExecutionCount: 0 },
      { activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: null },
      { activeWithoutAssigneeCount: NaN, waitingWithoutExecutionCount: 0 },
      { activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: Infinity },
      { activeWithoutAssigneeCount: -1, waitingWithoutExecutionCount: 0 },
      { activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: -1 },
      { activeWithoutAssigneeCount: 10001, waitingWithoutExecutionCount: 0 },
      { activeWithoutAssigneeCount: 0, waitingWithoutExecutionCount: 10001 }
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.strictEqual(err.message, "INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT");
        return true;
      });
    }
  });
  it("rejects non-plain objects with and without valid counts", () => {
    const datedEmpty = new Date(0);
    assert.throws(() => runFeature(datedEmpty), (err) => {
      assert.ok(err instanceof TypeError);
      assert.strictEqual(err.message, "INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT");
      return true;
    });
    const dated = new Date(0);
    dated.activeWithoutAssigneeCount = 1;
    dated.waitingWithoutExecutionCount = 2;
    assert.throws(() => runFeature(dated), (err) => {
      assert.ok(err instanceof TypeError);
      assert.strictEqual(err.message, "INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT");
      return true;
    });
    const nullProto = Object.create(null);
    nullProto.activeWithoutAssigneeCount = 1;
    nullProto.waitingWithoutExecutionCount = 2;
    assert.throws(() => runFeature(nullProto), (err) => {
      assert.ok(err instanceof TypeError);
      assert.strictEqual(err.message, "INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT");
      return true;
    });
  });
});
