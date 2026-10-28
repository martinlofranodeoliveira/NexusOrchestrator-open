import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/task_status_plurality_descriptor.mjs";

describe("task_status_plurality_descriptor", () => {
  it("returns empty descriptor for all zeros", () => {
    const result = runFeature({ todo: 0, doing: 0, done: 0, blocked: 0, other: 0 });
    assert.deepStrictEqual(result, {
      todo: 0,
      doing: 0,
      done: 0,
      blocked: 0,
      other: 0,
      total: 0,
      topCount: 0,
      dominant: null,
      isEmpty: true,
      isTie: false
    });
  });

  it("returns single leader with first contract example", () => {
    const result = runFeature({ blocked: 0, doing: 1, done: 0, other: 0, todo: 2 });
    assert.deepStrictEqual(result, {
      todo: 2,
      doing: 1,
      done: 0,
      blocked: 0,
      other: 0,
      total: 3,
      topCount: 2,
      dominant: "todo",
      isEmpty: false,
      isTie: false
    });
  });

  it("returns tie with fixed-order dominant for second contract example", () => {
    const result = runFeature({ blocked: 2, doing: 1, done: 2, other: 0, todo: 1 });
    assert.deepStrictEqual(result, {
      todo: 1,
      doing: 1,
      done: 2,
      blocked: 2,
      other: 0,
      total: 6,
      topCount: 2,
      dominant: "done",
      isEmpty: false,
      isTie: true
    });
  });

  it("picks first bucket in fixed order on ties", () => {
    const a = runFeature({ todo: 1, doing: 1, done: 0, blocked: 0, other: 0 });
    assert.equal(a.dominant, "todo");
    assert.equal(a.isTie, true);
    assert.equal(a.topCount, 1);
    assert.equal(a.total, 2);
    const b = runFeature({ todo: 0, doing: 0, done: 3, blocked: 3, other: 1 });
    assert.equal(b.dominant, "done");
    assert.equal(b.isTie, true);
    const c = runFeature({ todo: 2, doing: 2, done: 2, blocked: 2, other: 2 });
    assert.equal(c.dominant, "todo");
    assert.equal(c.isTie, true);
    assert.equal(c.total, 10);
    assert.equal(c.topCount, 2);
  });

  it("returns sole max bucket without tie", () => {
    const result = runFeature({ todo: 0, doing: 0, done: 0, blocked: 7, other: 2 });
    assert.equal(result.dominant, "blocked");
    assert.equal(result.isTie, false);
    assert.equal(result.isEmpty, false);
    assert.equal(result.total, 9);
    assert.equal(result.topCount, 7);
  });

  it("echoes counts, ignores extras, and does not mutate input", () => {
    const input = { todo: 1, doing: 2, done: 3, blocked: 4, other: 5, extra: 999 };
    const snapshot = { todo: 1, doing: 2, done: 3, blocked: 4, other: 5, extra: 999 };
    const result = runFeature(input);
    assert.equal(result.todo, 1);
    assert.equal(result.doing, 2);
    assert.equal(result.done, 3);
    assert.equal(result.blocked, 4);
    assert.equal(result.other, 5);
    assert.equal(result.total, 15);
    assert.equal(result.topCount, 5);
    assert.equal(result.dominant, "other");
    assert.deepStrictEqual(input, snapshot);
    assert.notStrictEqual(result, input);
    assert.equal("extra" in result, false);
  });

  it("works on frozen input and stays deterministic", () => {
    const input = Object.freeze({ todo: 2, doing: 0, done: 1, blocked: 0, other: 0 });
    const first = runFeature(input);
    const second = runFeature({ todo: 2, doing: 0, done: 1, blocked: 0, other: 0 });
    assert.deepStrictEqual(first, second);
    assert.notStrictEqual(first, second);
    assert.equal(first.dominant, "todo");
    assert.equal(first.isTie, false);
  });

  it("accepts boundary values 0 and 10000", () => {
    const result = runFeature({ todo: 10000, doing: 0, done: 0, blocked: 0, other: 0 });
    assert.equal(result.total, 10000);
    assert.equal(result.topCount, 10000);
    assert.equal(result.dominant, "todo");
    assert.equal(result.isTie, false);
  });

  it("throws INVALID_TASK_STATUS_PLURALITY_INPUT for malformed shapes", () => {
    const badCases = [
      null,
      undefined,
      42,
      "todo",
      [],
      [{ todo: 1, doing: 0, done: 0, blocked: 0, other: 0 }],
      {},
      { todo: 1, doing: 0, done: 0, blocked: 0 },
      { todo: 1, doing: 0, done: 0, blocked: 0, other: 1.5 },
      { todo: 1, doing: 0, done: 0, blocked: 0, other: Number.NaN },
      { todo: 1, doing: 0, done: 0, blocked: 0, other: Number.POSITIVE_INFINITY },
      { todo: -1, doing: 0, done: 0, blocked: 0, other: 0 },
      { todo: 0, doing: 0, done: 0, blocked: 0, other: 10001 },
      { todo: "1", doing: 0, done: 0, blocked: 0, other: 0 },
      { todo: null, doing: 0, done: 0, blocked: 0, other: 0 }
    ];
    for (const bad of badCases) {
      let error = null;
      try {
        runFeature(bad);
      } catch (err) {
        error = err;
      }
      assert.ok(error instanceof TypeError);
      assert.equal(error.message, "INVALID_TASK_STATUS_PLURALITY_INPUT");
    }
  });
});
