import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/attention_stale_severity_descriptor.mjs";

describe("attention stale severity descriptor", () => {
  it("stale false ok returns level 0 clear", () => {
    const out = runFeature({ stale: false, severity: "ok" });
    assert.deepStrictEqual(out, { stale: false, severity: "ok", level: 0, requiresAttention: false, isCritical: false, isClear: true });
  });
  it("stale false medium high critical require attention", () => {
    assert.deepStrictEqual(runFeature({ stale: false, severity: "medium" }), { stale: false, severity: "medium", level: 2, requiresAttention: true, isCritical: false, isClear: false });
    assert.deepStrictEqual(runFeature({ stale: false, severity: "high" }), { stale: false, severity: "high", level: 3, requiresAttention: true, isCritical: false, isClear: false });
    assert.deepStrictEqual(runFeature({ stale: false, severity: "critical" }), { stale: false, severity: "critical", level: 4, requiresAttention: true, isCritical: true, isClear: false });
  });
  it("stale true ok and info require attention and are not clear", () => {
    assert.deepStrictEqual(runFeature({ stale: true, severity: "ok" }), { stale: true, severity: "ok", level: 0, requiresAttention: true, isCritical: false, isClear: false });
    assert.deepStrictEqual(runFeature({ stale: true, severity: "info" }), { stale: true, severity: "info", level: 1, requiresAttention: true, isCritical: false, isClear: false });
  });
  it("critical is critical regardless of stale", () => {
    assert.deepStrictEqual(runFeature({ stale: false, severity: "critical" }), { stale: false, severity: "critical", level: 4, requiresAttention: true, isCritical: true, isClear: false });
    assert.deepStrictEqual(runFeature({ stale: true, severity: "critical" }), { stale: true, severity: "critical", level: 4, requiresAttention: true, isCritical: true, isClear: false });
  });
  it("stale false info is not requiring attention", () => {
    assert.deepStrictEqual(runFeature({ stale: false, severity: "info" }), { stale: false, severity: "info", level: 1, requiresAttention: false, isCritical: false, isClear: false });
  });
  it("ignores extra properties and never mutates input with fresh output", () => {
    const input = { stale: false, severity: "high", extra: 123 };
    const snapshot = JSON.stringify(input);
    const out = runFeature(input);
    assert.deepStrictEqual(out, { stale: false, severity: "high", level: 3, requiresAttention: true, isCritical: false, isClear: false });
    assert.equal(JSON.stringify(input), snapshot);
    assert.equal(Object.hasOwn(out, "extra"), false);
    const again = runFeature({ stale: false, severity: "high" });
    assert.notStrictEqual(out, again);
    assert.deepStrictEqual(out, again);
  });
  it("malformed payloads throw TypeError without echoing input", () => {
    const bad = [null, undefined, 42, "ok", true, [], [1], { stale: true }, { severity: "ok" }, {}, { stale: "false", severity: "ok" }, { stale: 0, severity: "ok" }, { stale: false, severity: null }, { stale: false, severity: "OK" }, { stale: false, severity: "low" }, { stale: false, severity: "" }, { stale: false, severity: 42 }, { stale: null, severity: "ok" }];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => err instanceof TypeError && err.message === "INVALID_ATTENTION_STALE_SEVERITY_INPUT");
    }
    assert.throws(() => runFeature({ stale: false, severity: "critical!" }), (err) => {
      assert.equal(err instanceof TypeError, true);
      assert.equal(err.message, "INVALID_ATTENTION_STALE_SEVERITY_INPUT");
      assert.equal(err.message.includes("critical!"), false);
      return true;
    });
  });
});
