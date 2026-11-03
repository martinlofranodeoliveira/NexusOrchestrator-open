import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/fleet_service_activity_descriptor.mjs";

describe("fleet service activity descriptor", () => {
  it("maps false plus false to disconnected", () => {
    assert.deepEqual(runFeature({ serviceConnected: false, agentWorking: false }), {
      serviceConnected: false,
      agentWorking: false,
      status: "disconnected",
      isDisconnected: true,
      isIdleConnected: false,
      isWorking: false
    });
  });
  it("maps false plus true to disconnected", () => {
    assert.deepEqual(runFeature({ serviceConnected: false, agentWorking: true }), {
      serviceConnected: false,
      agentWorking: true,
      status: "disconnected",
      isDisconnected: true,
      isIdleConnected: false,
      isWorking: false
    });
  });
  it("maps true plus false to idle", () => {
    assert.deepEqual(runFeature({ serviceConnected: true, agentWorking: false }), {
      serviceConnected: true,
      agentWorking: false,
      status: "idle",
      isDisconnected: false,
      isIdleConnected: true,
      isWorking: false
    });
  });
  it("maps true plus true to working", () => {
    assert.deepEqual(runFeature({ serviceConnected: true, agentWorking: true }), {
      serviceConnected: true,
      agentWorking: true,
      status: "working",
      isDisconnected: false,
      isIdleConnected: false,
      isWorking: true
    });
  });
  it("ignores extra properties and preserves input", () => {
    const input = { serviceConnected: true, agentWorking: false, extra: 123 };
    const result = runFeature(input);
    assert.deepEqual(result, {
      serviceConnected: true,
      agentWorking: false,
      status: "idle",
      isDisconnected: false,
      isIdleConnected: true,
      isWorking: false
    });
    assert.deepEqual(input, { serviceConnected: true, agentWorking: false, extra: 123 });
    assert.equal("extra" in result, false);
  });
  it("ignores inherited properties", () => {
    const proto = { serviceConnected: true, agentWorking: true };
    const input = Object.create(proto);
    assert.throws(() => runFeature(input), (err) => {
      assert.equal(err instanceof TypeError, true);
      assert.equal(err.message, "INVALID_FLEET_SERVICE_ACTIVITY_INPUT");
      return true;
    });
  });
  it("returns a fresh object on each call", () => {
    const first = runFeature({ serviceConnected: true, agentWorking: true });
    const second = runFeature({ serviceConnected: true, agentWorking: true });
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
  });
  it("rejects malformed shapes with exact TypeError", () => {
    const badValues = [
      null,
      undefined,
      0,
      "x",
      true,
      [],
      [{ serviceConnected: true, agentWorking: false }],
      {},
      { serviceConnected: true },
      { agentWorking: false },
      { serviceConnected: "true", agentWorking: false },
      { serviceConnected: true, agentWorking: 0 },
      { serviceConnected: 1, agentWorking: 1 },
      { serviceConnected: null, agentWorking: false },
      { serviceConnected: true, agentWorking: null },
      { serviceConnected: true, agentWorking: undefined }
    ];
    for (const value of badValues) {
      assert.throws(() => runFeature(value), (err) => {
        assert.equal(err instanceof TypeError, true);
        assert.equal(err.message, "INVALID_FLEET_SERVICE_ACTIVITY_INPUT");
        return true;
      });
    }
  });
  it("does not echo input in error message", () => {
    try {
      runFeature({ serviceConnected: "oops", agentWorking: false });
      assert.fail("expected throw");
    } catch (err) {
      assert.equal(err instanceof TypeError, true);
      assert.equal(err.message, "INVALID_FLEET_SERVICE_ACTIVITY_INPUT");
      assert.equal(err.message.includes("oops"), false);
    }
  });
});
