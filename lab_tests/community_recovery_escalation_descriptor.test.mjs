import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/recovery_escalation_descriptor.mjs";

describe("recovery escalation descriptor", () => {
  it("describes fresh attempts without exhaustion", () => {
    assert.deepEqual(runFeature({ attempt: 0, maxAttempts: 3, escalated: false }), {
      attempt: 0,
      maxAttempts: 3,
      escalated: false,
      remainingAttempts: 3,
      exhausted: false,
      needsEscalation: false
    });
  });
  it("needs escalation when exhausted and not escalated", () => {
    assert.deepEqual(runFeature({ attempt: 3, maxAttempts: 3, escalated: false }), {
      attempt: 3,
      maxAttempts: 3,
      escalated: false,
      remainingAttempts: 0,
      exhausted: true,
      needsEscalation: true
    });
  });
  it("clamps remaining and suppresses escalation when already escalated", () => {
    assert.deepEqual(runFeature({ attempt: 5, maxAttempts: 3, escalated: true }), {
      attempt: 5,
      maxAttempts: 3,
      escalated: true,
      remainingAttempts: 0,
      exhausted: true,
      needsEscalation: false
    });
  });
  it("handles boundaries and partial progress", () => {
    assert.deepEqual(runFeature({ attempt: 0, maxAttempts: 0, escalated: false }), {
      attempt: 0,
      maxAttempts: 0,
      escalated: false,
      remainingAttempts: 0,
      exhausted: true,
      needsEscalation: true
    });
    assert.deepEqual(runFeature({ attempt: 10000, maxAttempts: 10000, escalated: true }), {
      attempt: 10000,
      maxAttempts: 10000,
      escalated: true,
      remainingAttempts: 0,
      exhausted: true,
      needsEscalation: false
    });
    assert.deepEqual(runFeature({ attempt: 1, maxAttempts: 10, escalated: false }), {
      attempt: 1,
      maxAttempts: 10,
      escalated: false,
      remainingAttempts: 9,
      exhausted: false,
      needsEscalation: false
    });
  });
  it("ignores extra properties and never mutates input", () => {
    const input = { attempt: 2, maxAttempts: 5, escalated: false, extra: "ignored" };
    const snapshot = { attempt: 2, maxAttempts: 5, escalated: false, extra: "ignored" };
    const out = runFeature(input);
    assert.equal(out.extra, undefined);
    assert.deepEqual(input, snapshot);
    assert.notEqual(out, input);
  });
  it("is deterministic and returns fresh objects", () => {
    const input = { attempt: 2, maxAttempts: 4, escalated: false };
    const a = runFeature(input);
    const b = runFeature({ attempt: 2, maxAttempts: 4, escalated: false });
    assert.deepEqual(a, b);
    assert.notEqual(a, b);
  });
  it("rejects null, arrays and non-objects without echo", () => {
    const bad = [null, undefined, 3, "x", true, [], [1], () => {}];
    for (const v of bad) {
      assert.throws(() => runFeature(v), (e) => e instanceof TypeError && e.message === "INVALID_RECOVERY_ESCALATION_INPUT");
    }
    try {
      runFeature(null);
      assert.fail("should throw");
    } catch (e) {
      assert.equal(e.message, "INVALID_RECOVERY_ESCALATION_INPUT");
      assert.equal(String(e).includes("null"), false);
    }
  });
  it("rejects missing fields and bad types", () => {
    assert.throws(() => runFeature({}), /INVALID_RECOVERY_ESCALATION_INPUT/);
    assert.throws(() => runFeature({ attempt: 0, maxAttempts: 3 }), /INVALID_RECOVERY_ESCALATION_INPUT/);
    assert.throws(() => runFeature({ attempt: 0, escalated: false }), /INVALID_RECOVERY_ESCALATION_INPUT/);
    assert.throws(() => runFeature({ attempt: 1.5, maxAttempts: 3, escalated: false }), TypeError);
    assert.throws(() => runFeature({ attempt: NaN, maxAttempts: 3, escalated: false }), TypeError);
    assert.throws(() => runFeature({ attempt: Infinity, maxAttempts: 3, escalated: false }), TypeError);
    assert.throws(() => runFeature({ attempt: "1", maxAttempts: 3, escalated: false }), TypeError);
    assert.throws(() => runFeature({ attempt: 1, maxAttempts: 2.5, escalated: false }), TypeError);
    assert.throws(() => runFeature({ attempt: -1, maxAttempts: 3, escalated: false }), TypeError);
    assert.throws(() => runFeature({ attempt: 10001, maxAttempts: 3, escalated: false }), TypeError);
    assert.throws(() => runFeature({ attempt: 1, maxAttempts: -1, escalated: false }), TypeError);
    assert.throws(() => runFeature({ attempt: 1, maxAttempts: 10001, escalated: false }), TypeError);
    assert.throws(() => runFeature({ attempt: 1, maxAttempts: 3, escalated: 0 }), TypeError);
    assert.throws(() => runFeature({ attempt: 1, maxAttempts: 3, escalated: 1 }), TypeError);
    assert.throws(() => runFeature({ attempt: 1, maxAttempts: 3, escalated: "false" }), TypeError);
    assert.throws(() => runFeature({ attempt: 1, maxAttempts: 3, escalated: null }), TypeError);
    assert.throws(() => runFeature({ attempt: 1, maxAttempts: 3, escalated: undefined }), TypeError);
  });
  it("throws exact TypeError without echoing input", () => {
    try {
      runFeature({ attempt: 9999, maxAttempts: 3, escalated: "nope" });
      assert.fail("should throw");
    } catch (e) {
      assert.equal(e instanceof TypeError, true);
      assert.equal(e.message, "INVALID_RECOVERY_ESCALATION_INPUT");
      assert.equal(e.message.includes("9999"), false);
    }
  });
});
