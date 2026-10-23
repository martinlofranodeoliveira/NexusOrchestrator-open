import { test } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/attention_waiting_share_descriptor.mjs";

const MESSAGE = "INVALID_ATTENTION_WAITING_SHARE_INPUT";

function rejectsInvalid(payload) {
  let snapshot = null;
  let hasSnapshot = false;
  if (payload !== null && typeof payload === "object" && Array.isArray(payload) === false) {
    snapshot = JSON.stringify(payload);
    hasSnapshot = true;
  }
  assert.throws(() => runFeature(payload), (err) => {
    assert.ok(err instanceof TypeError);
    assert.strictEqual(err.message, MESSAGE);
    return true;
  });
  if (hasSnapshot) {
    assert.strictEqual(JSON.stringify(payload), snapshot);
  }
}

test("zero empty totals", () => {
  assert.deepStrictEqual(runFeature({ totalActivePrimaryTasks: 0, waitingWithoutExecutionCount: 0 }), {
    totalActivePrimaryTasks: 0,
    waitingWithoutExecutionCount: 0,
    readyCount: 0,
    hasWaiting: false,
    allWaiting: false,
    noneWaiting: true
  });
});

test("partial waiting", () => {
  assert.deepStrictEqual(runFeature({ totalActivePrimaryTasks: 4, waitingWithoutExecutionCount: 1 }), {
    totalActivePrimaryTasks: 4,
    waitingWithoutExecutionCount: 1,
    readyCount: 3,
    hasWaiting: true,
    allWaiting: false,
    noneWaiting: false
  });
});

test("full waiting", () => {
  assert.deepStrictEqual(runFeature({ totalActivePrimaryTasks: 3, waitingWithoutExecutionCount: 3 }), {
    totalActivePrimaryTasks: 3,
    waitingWithoutExecutionCount: 3,
    readyCount: 0,
    hasWaiting: true,
    allWaiting: true,
    noneWaiting: false
  });
});

test("none waiting with positive total", () => {
  assert.deepStrictEqual(runFeature({ totalActivePrimaryTasks: 5, waitingWithoutExecutionCount: 0 }), {
    totalActivePrimaryTasks: 5,
    waitingWithoutExecutionCount: 0,
    readyCount: 5,
    hasWaiting: false,
    allWaiting: false,
    noneWaiting: true
  });
});

test("boundary maximum values", () => {
  assert.deepStrictEqual(runFeature({ totalActivePrimaryTasks: 10000, waitingWithoutExecutionCount: 10000 }), {
    totalActivePrimaryTasks: 10000,
    waitingWithoutExecutionCount: 10000,
    readyCount: 0,
    hasWaiting: true,
    allWaiting: true,
    noneWaiting: false
  });
  assert.deepStrictEqual(runFeature({ totalActivePrimaryTasks: 10000, waitingWithoutExecutionCount: 0 }), {
    totalActivePrimaryTasks: 10000,
    waitingWithoutExecutionCount: 0,
    readyCount: 10000,
    hasWaiting: false,
    allWaiting: false,
    noneWaiting: true
  });
});

test("ignores extra properties and preserves input", () => {
  const input = { totalActivePrimaryTasks: 6, waitingWithoutExecutionCount: 2, extra: 99, note: "x" };
  const snapshot = JSON.stringify(input);
  const out = runFeature(input);
  assert.deepStrictEqual(out, {
    totalActivePrimaryTasks: 6,
    waitingWithoutExecutionCount: 2,
    readyCount: 4,
    hasWaiting: true,
    allWaiting: false,
    noneWaiting: false
  });
  assert.strictEqual(JSON.stringify(input), snapshot);
  assert.strictEqual("extra" in out, false);
});

test("returns fresh objects deterministically", () => {
  const input = { totalActivePrimaryTasks: 4, waitingWithoutExecutionCount: 1 };
  const first = runFeature(input);
  const second = runFeature(input);
  assert.deepStrictEqual(first, second);
  assert.notStrictEqual(first, second);
});

test("rejects null array and non-object shapes", () => {
  rejectsInvalid(null);
  rejectsInvalid(undefined);
  rejectsInvalid([]);
  rejectsInvalid([{ totalActivePrimaryTasks: 1, waitingWithoutExecutionCount: 0 }]);
  rejectsInvalid("x");
  rejectsInvalid(42);
  rejectsInvalid(true);
  rejectsInvalid({});
  rejectsInvalid({ totalActivePrimaryTasks: 1 });
  rejectsInvalid({ waitingWithoutExecutionCount: 0 });
});

test("rejects non-integer non-finite and out-of-range", () => {
  rejectsInvalid({ totalActivePrimaryTasks: 1.5, waitingWithoutExecutionCount: 0 });
  rejectsInvalid({ totalActivePrimaryTasks: 2, waitingWithoutExecutionCount: 0.5 });
  rejectsInvalid({ totalActivePrimaryTasks: NaN, waitingWithoutExecutionCount: 0 });
  rejectsInvalid({ totalActivePrimaryTasks: 2, waitingWithoutExecutionCount: NaN });
  rejectsInvalid({ totalActivePrimaryTasks: Infinity, waitingWithoutExecutionCount: 0 });
  rejectsInvalid({ totalActivePrimaryTasks: 2, waitingWithoutExecutionCount: Infinity });
  rejectsInvalid({ totalActivePrimaryTasks: "2", waitingWithoutExecutionCount: 0 });
  rejectsInvalid({ totalActivePrimaryTasks: 2, waitingWithoutExecutionCount: "0" });
  rejectsInvalid({ totalActivePrimaryTasks: -1, waitingWithoutExecutionCount: 0 });
  rejectsInvalid({ totalActivePrimaryTasks: 10001, waitingWithoutExecutionCount: 0 });
  rejectsInvalid({ totalActivePrimaryTasks: 5, waitingWithoutExecutionCount: -1 });
  rejectsInvalid({ totalActivePrimaryTasks: 5, waitingWithoutExecutionCount: 10001 });
});

test("rejects waiting above total without echo", () => {
  rejectsInvalid({ totalActivePrimaryTasks: 2, waitingWithoutExecutionCount: 3 });
  rejectsInvalid({ totalActivePrimaryTasks: 0, waitingWithoutExecutionCount: 1 });
  try {
    runFeature({ totalActivePrimaryTasks: 1, waitingWithoutExecutionCount: 2 });
    assert.fail("should throw");
  } catch (err) {
    assert.ok(err instanceof TypeError);
    assert.strictEqual(err.message, MESSAGE);
  }
});
