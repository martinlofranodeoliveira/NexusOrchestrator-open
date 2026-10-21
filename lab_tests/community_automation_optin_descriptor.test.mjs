import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/automation_optin_descriptor.mjs";

describe("automation opt-in descriptor", () => {
  it("describes all-false input", () => {
    const result = runFeature({ autoDispatchEnabled: false, orphanRescueEnabled: false, demoTasksEnabled: false });
    assert.deepEqual(result, {
      autoDispatchEnabled: false,
      orphanRescueEnabled: false,
      demoTasksEnabled: false,
      enabledCount: 0,
      anyEnabled: false,
      allEnabled: false,
      allDisabled: true
    });
  });
  it("describes mixed two-true input", () => {
    const result = runFeature({ autoDispatchEnabled: true, orphanRescueEnabled: false, demoTasksEnabled: true });
    assert.deepEqual(result, {
      autoDispatchEnabled: true,
      orphanRescueEnabled: false,
      demoTasksEnabled: true,
      enabledCount: 2,
      anyEnabled: true,
      allEnabled: false,
      allDisabled: false
    });
  });
  it("describes all-true input", () => {
    const result = runFeature({ autoDispatchEnabled: true, orphanRescueEnabled: true, demoTasksEnabled: true });
    assert.deepEqual(result, {
      autoDispatchEnabled: true,
      orphanRescueEnabled: true,
      demoTasksEnabled: true,
      enabledCount: 3,
      anyEnabled: true,
      allEnabled: true,
      allDisabled: false
    });
  });
  it("ignores extra properties without mutating input and returns fresh objects", () => {
    const input = { autoDispatchEnabled: true, orphanRescueEnabled: false, demoTasksEnabled: false, extra: 123 };
    const before = { autoDispatchEnabled: true, orphanRescueEnabled: false, demoTasksEnabled: false, extra: 123 };
    const first = runFeature(input);
    const second = runFeature(input);
    assert.equal(first.enabledCount, 1);
    assert.equal(first.anyEnabled, true);
    assert.equal(first.allEnabled, false);
    assert.equal(first.allDisabled, false);
    assert.deepEqual(input, before);
    assert.notEqual(first, second);
    assert.deepEqual(first, second);
    assert.equal("extra" in first, false);
  });
  it("rejects malformed shapes without echoing input", () => {
    const badInputs = [
      null,
      undefined,
      42,
      "flags",
      true,
      [],
      [{ autoDispatchEnabled: true, orphanRescueEnabled: true, demoTasksEnabled: true }],
      {},
      { autoDispatchEnabled: true },
      { autoDispatchEnabled: true, orphanRescueEnabled: true },
      { autoDispatchEnabled: false, orphanRescueEnabled: false, demoTasksEnabled: 0 },
      { autoDispatchEnabled: false, orphanRescueEnabled: "false", demoTasksEnabled: false },
      { autoDispatchEnabled: false, orphanRescueEnabled: false, demoTasksEnabled: null },
      { autoDispatchEnabled: 1, orphanRescueEnabled: 1, demoTasksEnabled: 1 }
    ];
    for (const bad of badInputs) {
      assert.throws(() => runFeature(bad), (err) => {
        assert.ok(err instanceof TypeError);
        assert.equal(err.message, "INVALID_AUTOMATION_OPTIN_INPUT");
        assert.equal(String(err.message).includes("autoDispatch"), false);
        return true;
      });
    }
  });
  it("is deterministic across repeated calls", () => {
    const input = { autoDispatchEnabled: false, orphanRescueEnabled: true, demoTasksEnabled: false };
    const first = runFeature(input);
    const second = runFeature(input);
    assert.deepEqual(first, second);
    assert.deepEqual(first, {
      autoDispatchEnabled: false,
      orphanRescueEnabled: true,
      demoTasksEnabled: false,
      enabledCount: 1,
      anyEnabled: true,
      allEnabled: false,
      allDisabled: false
    });
  });
});
