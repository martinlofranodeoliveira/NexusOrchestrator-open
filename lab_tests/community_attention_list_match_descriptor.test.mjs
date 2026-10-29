import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/attention_list_match_descriptor.mjs";

function checkThrows(value) {
  let err = null;
  try {
    runFeature(value);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof TypeError);
  assert.strictEqual(err.message, "INVALID_ATTENTION_LIST_MATCH_INPUT");
}

describe("community attention list match descriptor", () => {
  it("returns all true for empty synthetic input", () => {
    const out = runFeature({ flaggedCount: 0, criticalCount: 0, tasks: [], criticalTasks: [] });
    assert.deepStrictEqual(out, {
      flaggedCount: 0,
      criticalCount: 0,
      taskCount: 0,
      criticalTaskCount: 0,
      flaggedMatches: true,
      criticalMatches: true,
      isConsistent: true
    });
  });

  it("matches counts to list lengths", () => {
    const out = runFeature({ flaggedCount: 2, criticalCount: 1, tasks: [{}, {}], criticalTasks: [{}] });
    assert.deepStrictEqual(out, {
      flaggedCount: 2,
      criticalCount: 1,
      taskCount: 2,
      criticalTaskCount: 1,
      flaggedMatches: true,
      criticalMatches: true,
      isConsistent: true
    });
  });

  it("reports mismatched sides as false without reading contents", () => {
    const out = runFeature({ flaggedCount: 2, criticalCount: 1, tasks: [{}], criticalTasks: [{}, {}] });
    assert.strictEqual(out.taskCount, 1);
    assert.strictEqual(out.criticalTaskCount, 2);
    assert.strictEqual(out.flaggedMatches, false);
    assert.strictEqual(out.criticalMatches, false);
    assert.strictEqual(out.isConsistent, false);
  });

  it("reports single-side mismatch with isConsistent false", () => {
    const out = runFeature({ flaggedCount: 2, criticalCount: 5, tasks: [{ title: "a" }, { title: "b" }], criticalTasks: [{}] });
    assert.strictEqual(out.taskCount, 2);
    assert.strictEqual(out.criticalTaskCount, 1);
    assert.strictEqual(out.flaggedMatches, true);
    assert.strictEqual(out.criticalMatches, false);
    assert.strictEqual(out.isConsistent, false);
  });

  it("ignores extra properties and element contents", () => {
    const out = runFeature({
      flaggedCount: 1,
      criticalCount: 1,
      tasks: [{ title: "anything", extra: 123 }],
      criticalTasks: [{ foo: "bar" }],
      extraTop: "ignored"
    });
    assert.strictEqual(out.flaggedMatches, true);
    assert.strictEqual(out.criticalMatches, true);
    assert.strictEqual(out.isConsistent, true);
    assert.strictEqual(out.taskCount, 1);
    assert.strictEqual(out.criticalTaskCount, 1);
  });

  it("never mutates input and returns fresh output", () => {
    const input = { flaggedCount: 1, criticalCount: 1, tasks: [{}], criticalTasks: [{}] };
    const before = JSON.stringify(input);
    const out1 = runFeature(input);
    const out2 = runFeature(input);
    assert.strictEqual(JSON.stringify(input), before);
    assert.deepStrictEqual(out1, out2);
    assert.notStrictEqual(out1, out2);
    assert.notStrictEqual(out1, input);
  });

  it("throws without echoing input for malformed shapes", () => {
    checkThrows(null);
    checkThrows([]);
    checkThrows("x");
    checkThrows(42);
    checkThrows({});
    checkThrows({ criticalCount: 0, tasks: [], criticalTasks: [] });
    checkThrows({ flaggedCount: 0, tasks: [], criticalTasks: [] });
    checkThrows({ flaggedCount: 0, criticalCount: 0, criticalTasks: [] });
    checkThrows({ flaggedCount: 0, criticalCount: 0, tasks: [] });
    checkThrows({ flaggedCount: "2", criticalCount: 0, tasks: [], criticalTasks: [] });
    checkThrows({ flaggedCount: 1.5, criticalCount: 0, tasks: [], criticalTasks: [] });
    checkThrows({ flaggedCount: 0, criticalCount: 1.5, tasks: [], criticalTasks: [] });
    checkThrows({ flaggedCount: -1, criticalCount: 0, tasks: [], criticalTasks: [] });
    checkThrows({ flaggedCount: 0, criticalCount: -1, tasks: [], criticalTasks: [] });
    checkThrows({ flaggedCount: 10001, criticalCount: 0, tasks: [], criticalTasks: [] });
    checkThrows({ flaggedCount: 0, criticalCount: 10001, tasks: [], criticalTasks: [] });
    checkThrows({ flaggedCount: Number.NaN, criticalCount: 0, tasks: [], criticalTasks: [] });
    checkThrows({ flaggedCount: Number.POSITIVE_INFINITY, criticalCount: 0, tasks: [], criticalTasks: [] });
    checkThrows({ flaggedCount: 0, criticalCount: 0, tasks: {}, criticalTasks: [] });
    checkThrows({ flaggedCount: 0, criticalCount: 0, tasks: [], criticalTasks: {} });
    checkThrows({ flaggedCount: 1, criticalCount: 0, tasks: [null], criticalTasks: [] });
    checkThrows({ flaggedCount: 1, criticalCount: 0, tasks: [42], criticalTasks: [] });
    checkThrows({ flaggedCount: 1, criticalCount: 0, tasks: ["x"], criticalTasks: [] });
    checkThrows({ flaggedCount: 1, criticalCount: 0, tasks: [[]], criticalTasks: [] });
    checkThrows({ flaggedCount: 0, criticalCount: 1, tasks: [], criticalTasks: [null] });
    checkThrows({ flaggedCount: 0, criticalCount: 1, tasks: [], criticalTasks: [[{}]] });
  });

  it("throws for lists longer than 10000", () => {
    const big = [];
    for (let i = 0; i < 10001; i += 1) {
      big.push({});
    }
    checkThrows({ flaggedCount: 10001, criticalCount: 0, tasks: big, criticalTasks: [] });
    checkThrows({ flaggedCount: 0, criticalCount: 10001, tasks: [], criticalTasks: big });
  });
});
