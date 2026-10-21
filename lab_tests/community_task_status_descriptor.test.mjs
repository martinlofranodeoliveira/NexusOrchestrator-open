import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/task_status_descriptor.mjs";

describe("task_status_descriptor runFeature", () => {
  it("exposes runFeature as a function", () => {
    assert.equal(typeof runFeature, "function");
  });

  it("maps todo to level 0 with only isTodo true", () => {
    assert.deepStrictEqual(runFeature({ status: "todo" }), {
      status: "todo",
      level: 0,
      isTodo: true,
      isDoing: false,
      isDone: false,
      isBlocked: false
    });
  });

  it("maps doing to level 1 with only isDoing true", () => {
    assert.deepStrictEqual(runFeature({ status: "doing" }), {
      status: "doing",
      level: 1,
      isTodo: false,
      isDoing: true,
      isDone: false,
      isBlocked: false
    });
  });

  it("maps done to level 2 with only isDone true", () => {
    assert.deepStrictEqual(runFeature({ status: "done" }), {
      status: "done",
      level: 2,
      isTodo: false,
      isDoing: false,
      isDone: true,
      isBlocked: false
    });
  });

  it("maps blocked to level 3 with only isBlocked true", () => {
    assert.deepStrictEqual(runFeature({ status: "blocked" }), {
      status: "blocked",
      level: 3,
      isTodo: false,
      isDoing: false,
      isDone: false,
      isBlocked: true
    });
  });

  it("ignores extra properties and does not mutate input", () => {
    const input = { status: "done", title: "Write docs", extra: 42 };
    const snapshot = { status: "done", title: "Write docs", extra: 42 };
    const out = runFeature(input);
    assert.deepStrictEqual(out, {
      status: "done",
      level: 2,
      isTodo: false,
      isDoing: false,
      isDone: true,
      isBlocked: false
    });
    assert.deepStrictEqual(input, snapshot);
  });

  it("returns a fresh object on each call", () => {
    const first = runFeature({ status: "todo" });
    const second = runFeature({ status: "todo" });
    assert.deepStrictEqual(first, second);
    assert.notStrictEqual(first, second);
  });

  it("is deterministic for repeated calls", () => {
    assert.deepStrictEqual(runFeature({ status: "blocked" }), runFeature({ status: "blocked" }));
  });

  it("throws TypeError for missing status and non-plain shapes", () => {
    const badInputs = [{}, { status: undefined }, { level: 0 }, null, undefined, [], [{ status: "todo" }], "todo", 0, true];
    for (const value of badInputs) {
      assert.throws(() => runFeature(value), (err) => err instanceof TypeError && err.message === "INVALID_TASK_STATUS_INPUT");
    }
  });

  it("throws TypeError for non-string or unknown status without echoing input", () => {
    const badInputs = [{ status: 0 }, { status: null }, { status: ["todo"] }, { status: "Todo" }, { status: "TODO" }, { status: "archived" }, { status: "" }, { status: "todo " }];
    for (const value of badInputs) {
      try {
        runFeature(value);
        assert.fail("expected TypeError");
      } catch (err) {
        assert.ok(err instanceof TypeError);
        assert.equal(err.message, "INVALID_TASK_STATUS_INPUT");
        assert.equal(String(err).includes("archived"), false);
      }
    }
  });

  it("throws TypeError for array carrying a valid status", () => {
    const arr = ["todo"];
    arr.status = "todo";
    assert.throws(() => runFeature(arr), (err) => err instanceof TypeError && err.message === "INVALID_TASK_STATUS_INPUT");
  });
});
