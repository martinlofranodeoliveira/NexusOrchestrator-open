import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/attention_severity_descriptor.mjs";

describe("attention severity descriptor", () => {
  it("maps ok to level 0 without attention", () => {
    const out = runFeature({ severity: "ok" });
    assert.deepStrictEqual(out, { severity: "ok", level: 0, isOk: true, needsAttention: false, isCritical: false });
  });
  it("maps info to level 1 without attention", () => {
    const out = runFeature({ severity: "info" });
    assert.deepStrictEqual(out, { severity: "info", level: 1, isOk: false, needsAttention: false, isCritical: false });
  });
  it("maps medium to level 2 with attention", () => {
    const out = runFeature({ severity: "medium" });
    assert.deepStrictEqual(out, { severity: "medium", level: 2, isOk: false, needsAttention: true, isCritical: false });
  });
  it("maps high to level 3 with attention", () => {
    const out = runFeature({ severity: "high" });
    assert.deepStrictEqual(out, { severity: "high", level: 3, isOk: false, needsAttention: true, isCritical: false });
  });
  it("maps critical to level 4 with critical flag", () => {
    const out = runFeature({ severity: "critical" });
    assert.deepStrictEqual(out, { severity: "critical", level: 4, isOk: false, needsAttention: true, isCritical: true });
  });
  it("rejects malformed shapes without echoing input", () => {
    const bad = [undefined, null, 0, "ok", true, [], ["ok"], {}, { severity: undefined }, { severity: null }, { severity: 2 }, { severity: "urgent" }, { severity: "OK" }, { severity: "" }, { level: 2 }];
    for (const input of bad) {
      assert.throws(() => runFeature(input), (err) => {
        assert.strictEqual(err instanceof TypeError, true);
        assert.strictEqual(err.message, "INVALID_ATTENTION_SEVERITY_INPUT");
        return true;
      });
    }
    try {
      runFeature({ severity: "urgent" });
      assert.fail("expected throw");
    } catch (err) {
      assert.strictEqual(err.message, "INVALID_ATTENTION_SEVERITY_INPUT");
      assert.strictEqual(err.message.includes("urgent"), false);
    }
  });
  it("rejects inherited severity and accepts null-prototype records", () => {
    const inherited = Object.create({ severity: "ok" });
    assert.throws(() => runFeature(inherited), (err) => {
      assert.strictEqual(err instanceof TypeError, true);
      assert.strictEqual(err.message, "INVALID_ATTENTION_SEVERITY_INPUT");
      return true;
    });
    const input = Object.create(null);
    input.severity = "medium";
    const out = runFeature(input);
    assert.deepStrictEqual(out, { severity: "medium", level: 2, isOk: false, needsAttention: true, isCritical: false });
  });
  it("ignores extras, preserves input and returns fresh objects", () => {
    const input = { severity: "medium", extra: "keep", count: 7 };
    const before = { severity: "medium", extra: "keep", count: 7 };
    const first = runFeature(input);
    assert.deepStrictEqual(first, { severity: "medium", level: 2, isOk: false, needsAttention: true, isCritical: false });
    assert.deepStrictEqual(input, before);
    const second = runFeature({ severity: "ok", note: "x" });
    assert.deepStrictEqual(second, { severity: "ok", level: 0, isOk: true, needsAttention: false, isCritical: false });
    assert.strictEqual("note" in second, false);
    const a = runFeature({ severity: "critical" });
    const b = runFeature({ severity: "critical" });
    assert.deepStrictEqual(a, b);
    assert.notStrictEqual(a, b);
  });
});
