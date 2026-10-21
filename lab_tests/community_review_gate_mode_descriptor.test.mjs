import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/review_gate_mode_descriptor.mjs";

describe("review gate mode descriptor", () => {
  it("describes enabled advisory", () => {
    assert.deepEqual(runFeature({ enabled: true, mode: "advisory" }), {
      enabled: true,
      mode: "advisory",
      isAdvisory: true,
      isRequired: false,
      isInactive: false
    });
  });
  it("describes enabled required", () => {
    assert.deepEqual(runFeature({ enabled: true, mode: "required" }), {
      enabled: true,
      mode: "required",
      isAdvisory: false,
      isRequired: true,
      isInactive: false
    });
  });
  it("describes disabled advisory as inactive", () => {
    assert.deepEqual(runFeature({ enabled: false, mode: "advisory" }), {
      enabled: false,
      mode: "advisory",
      isAdvisory: false,
      isRequired: false,
      isInactive: true
    });
  });
  it("describes disabled required as inactive", () => {
    assert.deepEqual(runFeature({ enabled: false, mode: "required" }), {
      enabled: false,
      mode: "required",
      isAdvisory: false,
      isRequired: false,
      isInactive: true
    });
  });
  it("rejects malformed shapes without echoing input", () => {
    const bad = [
      null,
      undefined,
      0,
      1,
      "advisory",
      true,
      false,
      [],
      [{ enabled: true, mode: "advisory" }],
      {},
      { enabled: true },
      { mode: "advisory" },
      { enabled: "true", mode: "advisory" },
      { enabled: 1, mode: "advisory" },
      { enabled: null, mode: "advisory" },
      { enabled: true, mode: "strict" },
      { enabled: true, mode: "" },
      { enabled: true, mode: null },
      { enabled: true, mode: 1 },
      { enabled: false, mode: "strict" },
      { enabled: false, mode: null },
      { enabled: false },
      { mode: "required" }
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (error) => {
        assert.equal(error instanceof TypeError, true);
        assert.equal(error.message, "INVALID_REVIEW_GATE_MODE_INPUT");
        assert.equal(String(error.message).includes("advisory,required"), false);
        return true;
      });
    }
  });
  it("ignores extra properties, never mutates input and returns fresh objects", () => {
    const input = { enabled: true, mode: "advisory", extra: 123, tasks: ["x"] };
    const before = JSON.stringify(input);
    const first = runFeature(input);
    assert.deepEqual(first, {
      enabled: true,
      mode: "advisory",
      isAdvisory: true,
      isRequired: false,
      isInactive: false
    });
    assert.equal(JSON.stringify(input), before);
    assert.equal("extra" in first, false);
    const second = runFeature(input);
    assert.deepEqual(second, first);
    assert.notEqual(first, second);
    first.isAdvisory = false;
    const third = runFeature(input);
    assert.equal(third.isAdvisory, true);
  });
  it("is deterministic", () => {
    const a = runFeature({ enabled: true, mode: "required" });
    const b = runFeature({ enabled: true, mode: "required" });
    assert.deepEqual(a, b);
    assert.notEqual(a, b);
  });
});
