import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/lane_failure_consistency_descriptor.mjs";

const CODE = "INVALID_LANE_FAILURE_CONSISTENCY_INPUT";

function throwsCode(fn) {
  try {
    fn();
  } catch (e) {
    assert.ok(e instanceof TypeError);
    assert.equal(e.message, CODE);
    return;
  }
  assert.fail("expected throw");
}

describe("lane failure consistency descriptor", () => {
  it("mixed clean consistent mismatched", () => {
    const out = runFeature({
      lanes: [
        { failureClass: "timeout", recoveryFailureClass: "timeout", eventFailureClasses: ["timeout", null] },
        { failureClass: null, recoveryFailureClass: null, eventFailureClasses: [] },
        { failureClass: "timeout", recoveryFailureClass: "auth", eventFailureClasses: [null] }
      ]
    });
    assert.deepEqual(out, {
      totalLanes: 3,
      cleanLanes: 1,
      consistentLanes: 1,
      mismatchedLanes: 1,
      hasFailure: true,
      hasMismatch: true,
      isClean: false,
      isConsistent: false
    });
  });
  it("empty lanes", () => {
    const out = runFeature({ lanes: [] });
    assert.deepEqual(out, {
      totalLanes: 0,
      cleanLanes: 0,
      consistentLanes: 0,
      mismatchedLanes: 0,
      hasFailure: false,
      hasMismatch: false,
      isClean: true,
      isConsistent: true
    });
  });
  it("single consistent via recovery and events", () => {
    const out = runFeature({
      lanes: [{ failureClass: null, recoveryFailureClass: "io", eventFailureClasses: [null, "io"] }]
    });
    assert.deepEqual(out, {
      totalLanes: 1,
      cleanLanes: 0,
      consistentLanes: 1,
      mismatchedLanes: 0,
      hasFailure: true,
      hasMismatch: false,
      isClean: false,
      isConsistent: true
    });
  });
  it("allows LF CR TAB", () => {
    const out = runFeature({
      lanes: [{ failureClass: "a\n\r\t", recoveryFailureClass: "a\n\r\t", eventFailureClasses: [] }]
    });
    assert.equal(out.consistentLanes, 1);
    assert.equal(out.isConsistent, true);
  });
  it("rejects invalid shapes without echo", () => {
    throwsCode(() => runFeature(null));
    throwsCode(() => runFeature([]));
    throwsCode(() => runFeature(42));
    throwsCode(() => runFeature("x"));
    throwsCode(() => runFeature({}));
    throwsCode(() => runFeature({ lanes: null }));
    throwsCode(() => runFeature({ lanes: {} }));
    throwsCode(() => runFeature({ lanes: [null] }));
    throwsCode(() => runFeature({ lanes: [[]] }));
    throwsCode(() => runFeature({ lanes: [{ recoveryFailureClass: null, eventFailureClasses: [] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: null, eventFailureClasses: [] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: null, recoveryFailureClass: null }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: null, recoveryFailureClass: null, eventFailureClasses: null }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: undefined, recoveryFailureClass: null, eventFailureClasses: [] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: 1, recoveryFailureClass: null, eventFailureClasses: [] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: "", recoveryFailureClass: null, eventFailureClasses: [] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: "x".repeat(129), recoveryFailureClass: null, eventFailureClasses: [] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: "\uD800", recoveryFailureClass: null, eventFailureClasses: [] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: "\uDC00", recoveryFailureClass: null, eventFailureClasses: [] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: "a\u0001b", recoveryFailureClass: null, eventFailureClasses: [] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: "a\u0000", recoveryFailureClass: null, eventFailureClasses: [] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: null, recoveryFailureClass: "\u001F", eventFailureClasses: [] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: null, recoveryFailureClass: null, eventFailureClasses: [1] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: null, recoveryFailureClass: null, eventFailureClasses: [""] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: null, recoveryFailureClass: null, eventFailureClasses: ["\uD800"] }] }));
    throwsCode(() => runFeature({ lanes: [{ failureClass: null, recoveryFailureClass: null, eventFailureClasses: ["bad\u0007"] }] }));
    const manyEvents = [];
    for (let i = 0; i < 51; i++) manyEvents.push(null);
    throwsCode(() => runFeature({ lanes: [{ failureClass: null, recoveryFailureClass: null, eventFailureClasses: manyEvents }] }));
    const manyLanes = [];
    for (let i = 0; i < 1001; i++) manyLanes.push({ failureClass: null, recoveryFailureClass: null, eventFailureClasses: [] });
    throwsCode(() => runFeature({ lanes: manyLanes }));
  });
  it("ignores extras, never mutates, fresh eight fields, deterministic", () => {
    const input = {
      extra: 1,
      lanes: [
        { failureClass: null, recoveryFailureClass: null, eventFailureClasses: [], extraEntry: true },
        { failureClass: "t", recoveryFailureClass: "t", eventFailureClasses: ["t"], other: 2 }
      ]
    };
    const before = JSON.stringify(input);
    const a = runFeature(input);
    const b = runFeature(input);
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(Object.keys(a).sort(), ["cleanLanes", "consistentLanes", "hasFailure", "hasMismatch", "isClean", "isConsistent", "mismatchedLanes", "totalLanes"]);
    assert.deepEqual(a, b);
    assert.notEqual(a, b);
    assert.equal(a.totalLanes, 2);
    assert.equal(a.cleanLanes, 1);
    assert.equal(a.consistentLanes, 1);
    assert.equal(a.mismatchedLanes, 0);
    assert.equal(a.hasFailure, true);
    assert.equal(a.hasMismatch, false);
    assert.equal(a.isClean, false);
    assert.equal(a.isConsistent, true);
  });
});
