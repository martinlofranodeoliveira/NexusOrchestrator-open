import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/external_fleet_state_descriptor.mjs";

describe("external fleet state descriptor", () => {
  it("describes live state with fresh result and preserves input", () => {
    const input = { state: "live" };
    const snapshot = { state: "live" };
    const result = runFeature(input);
    assert.deepEqual(result, { state: "live", level: 2, isLive: true, isStale: false, isUnavailable: false });
    assert.deepEqual(input, snapshot);
    assert.notEqual(result, input);
    const again = runFeature({ state: "live" });
    assert.deepEqual(again, result);
    assert.notEqual(again, result);
  });

  it("describes stale state with fresh result and preserves input", () => {
    const input = { state: "stale" };
    const result = runFeature(input);
    assert.deepEqual(result, { state: "stale", level: 1, isLive: false, isStale: true, isUnavailable: false });
    assert.deepEqual(input, { state: "stale" });
    assert.notEqual(result, input);
  });

  it("describes unavailable state with fresh result and preserves input", () => {
    const input = { state: "unavailable" };
    const result = runFeature(input);
    assert.deepEqual(result, { state: "unavailable", level: 0, isLive: false, isStale: false, isUnavailable: true });
    assert.deepEqual(input, { state: "unavailable" });
    assert.notEqual(result, input);
  });

  it("ignores extra properties and works with frozen input", () => {
    const result = runFeature({ state: "live", extra: 42, note: "x" });
    assert.deepEqual(result, { state: "live", level: 2, isLive: true, isStale: false, isUnavailable: false });
    const frozen = Object.freeze({ state: "stale", extra: [1, 2] });
    const frozenResult = runFeature(frozen);
    assert.deepEqual(frozenResult, { state: "stale", level: 1, isLive: false, isStale: true, isUnavailable: false });
    const frozenUnavailable = Object.freeze({ state: "unavailable" });
    assert.deepEqual(runFeature(frozenUnavailable), { state: "unavailable", level: 0, isLive: false, isStale: false, isUnavailable: true });
  });

  it("rejects malformed shapes without echoing input", () => {
    const badInputs = [null, undefined, 42, "live", true, [], [{ state: "live" }], {}, { nope: "live" }, { state: null }, { state: 2 }, { state: true }, { state: ["live"] }, { state: "LIVE" }, { state: "Live" }, { state: "" }, { state: "bogus" }, { state: "live " }, { state: " live" }];
    for (const value of badInputs) {
      assert.throws(() => runFeature(value), (err) => err instanceof TypeError && err.message === "INVALID_FLEET_STATE_INPUT");
    }
    try {
      runFeature({ state: "bogus" });
      assert.fail("expected throw");
    } catch (err) {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message, "INVALID_FLEET_STATE_INPUT");
      assert.equal(err.message.includes("bogus"), false);
    }
    try {
      runFeature(null);
      assert.fail("expected throw");
    } catch (err) {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message, "INVALID_FLEET_STATE_INPUT");
    }
  });

  it("is deterministic across repeated calls", () => {
    const first = runFeature({ state: "live" });
    const second = runFeature({ state: "live" });
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
  });
});
