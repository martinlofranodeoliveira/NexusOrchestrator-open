import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/lane_event_failure_count_descriptor.mjs";

const INVALID = "INVALID_LANE_EVENT_FAILURE_COUNT_INPUT";

function throwsInvalid(fn) {
  try {
    fn();
  } catch (err) {
    assert.ok(err instanceof TypeError);
    assert.equal(err.message, INVALID);
    return;
  }
  assert.fail("expected TypeError");
}

describe("lane_event_failure_count_descriptor", () => {
  it("empty list returns all clear without mutating input", () => {
    const input = { events: [] };
    const before = JSON.stringify(input);
    const out = runFeature(input);
    assert.deepEqual(out, { total: 0, failedCount: 0, clearCount: 0, hasFailures: false, allClear: true });
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(input, { events: [] });
  });

  it("mixed null, empty and non-empty counts only non-empty strings", () => {
    const input = { events: [{ failureClass: null }, { failureClass: "" }, { failureClass: "TIMEOUT" }] };
    const before = JSON.stringify(input);
    const out = runFeature(input);
    assert.deepEqual(out, { total: 3, failedCount: 1, clearCount: 2, hasFailures: true, allClear: false });
    assert.equal(JSON.stringify(input), before);
  });

  it("all-failed list returns fresh output object", () => {
    const input = { events: [{ failureClass: "AUTH" }, { failureClass: "NETWORK" }] };
    const first = runFeature(input);
    assert.deepEqual(first, { total: 2, failedCount: 2, clearCount: 0, hasFailures: true, allClear: false });
    const second = runFeature(input);
    assert.deepEqual(second, first);
    assert.notEqual(first, second);
    first.total = 999;
    assert.equal(runFeature(input).total, 2);
    assert.deepEqual(input, { events: [{ failureClass: "AUTH" }, { failureClass: "NETWORK" }] });
  });

  it("ignores extra properties and preserves input", () => {
    const input = { events: [{ failureClass: null, note: "x" }, { failureClass: "E", other: 1 }], extra: 42 };
    const out = runFeature(input);
    assert.deepEqual(out, { total: 2, failedCount: 1, clearCount: 1, hasFailures: true, allClear: false });
    assert.deepEqual(input, { events: [{ failureClass: null, note: "x" }, { failureClass: "E", other: 1 }], extra: 42 });
  });

  it("accepts boundary lengths 200 and 500", () => {
    const many = [];
    for (let i = 0; i < 200; i += 1) {
      many.push({ failureClass: null });
    }
    const out = runFeature({ events: many });
    assert.equal(out.total, 200);
    assert.equal(out.failedCount, 0);
    assert.equal(out.clearCount, 200);
    assert.equal(out.hasFailures, false);
    assert.equal(out.allClear, true);
    const s500 = "x".repeat(500);
    const out2 = runFeature({ events: [{ failureClass: s500 }] });
    assert.deepEqual(out2, { total: 1, failedCount: 1, clearCount: 0, hasFailures: true, allClear: false });
  });

  it("is deterministic and synchronous", () => {
    const input = { events: [{ failureClass: null }, { failureClass: "A" }] };
    const a = runFeature(input);
    const b = runFeature(input);
    assert.deepEqual(a, b);
    assert.notEqual(a, b);
    assert.equal(typeof runFeature, "function");
    assert.ok(!(a instanceof Promise));
  });

  it("throws INVALID for malformed shapes without echoing input", () => {
    throwsInvalid(() => runFeature(null));
    throwsInvalid(() => runFeature(undefined));
    throwsInvalid(() => runFeature([]));
    throwsInvalid(() => runFeature("x"));
    throwsInvalid(() => runFeature(42));
    throwsInvalid(() => runFeature({}));
    throwsInvalid(() => runFeature({ events: null }));
    throwsInvalid(() => runFeature({ events: "x" }));
    throwsInvalid(() => runFeature({ events: {} }));
    throwsInvalid(() => runFeature({ events: [{ failureClass: null }] , extra: 1 }) && runFeature(null));
    const tooMany = [];
    for (let i = 0; i < 201; i += 1) {
      tooMany.push({ failureClass: null });
    }
    throwsInvalid(() => runFeature({ events: tooMany }));
    throwsInvalid(() => runFeature({ events: [null] }));
    throwsInvalid(() => runFeature({ events: ["x"] }));
    throwsInvalid(() => runFeature({ events: [[]] }));
    throwsInvalid(() => runFeature({ events: [{}] }));
    throwsInvalid(() => runFeature({ events: [{ other: 1 }] }));
    throwsInvalid(() => runFeature({ events: [{ failureClass: undefined }] }));
    throwsInvalid(() => runFeature({ events: [{ failureClass: 1 }] }));
    throwsInvalid(() => runFeature({ events: [{ failureClass: true }] }));
    throwsInvalid(() => runFeature({ events: [{ failureClass: {} }] }));
    throwsInvalid(() => runFeature({ events: [{ failureClass: [] }] }));
    throwsInvalid(() => runFeature({ events: [{ failureClass: "x".repeat(501) }] }));
  });
});
