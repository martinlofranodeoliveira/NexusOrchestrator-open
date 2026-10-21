import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/validator_readiness_descriptor.mjs";

describe("validator readiness descriptor", () => {
  it("ready when all flags true and not removed", () => {
    const out = runFeature({ enabled: true, available: true, ready: true, removed: false });
    assert.deepEqual(out, {
      enabled: true,
      available: true,
      ready: true,
      removed: false,
      isReady: true,
      isDisabled: false,
      isUnavailable: false
    });
  });

  it("disabled when enabled false regardless of other flags", () => {
    const out = runFeature({ enabled: false, available: true, ready: true, removed: false });
    assert.deepEqual(out, {
      enabled: false,
      available: true,
      ready: true,
      removed: false,
      isReady: false,
      isDisabled: true,
      isUnavailable: false
    });
    const second = runFeature({ enabled: false, available: false, ready: false, removed: false });
    assert.equal(second.isDisabled, true);
    assert.equal(second.isReady, false);
    assert.equal(second.isUnavailable, false);
    const third = runFeature({ enabled: false, available: false, ready: true, removed: true });
    assert.equal(third.isDisabled, true);
    assert.equal(third.isReady, false);
    assert.equal(third.isUnavailable, false);
  });

  it("unavailable when enabled, not removed and available false", () => {
    const out = runFeature({ enabled: true, available: false, ready: true, removed: false });
    assert.deepEqual(out, {
      enabled: true,
      available: false,
      ready: true,
      removed: false,
      isReady: false,
      isDisabled: false,
      isUnavailable: true
    });
  });

  it("unavailable when ready false and disabled when removed true", () => {
    const a = runFeature({ enabled: true, available: true, ready: false, removed: false });
    assert.equal(a.isReady, false);
    assert.equal(a.isDisabled, false);
    assert.equal(a.isUnavailable, true);
    const b = runFeature({ enabled: true, available: true, ready: true, removed: true });
    assert.equal(b.isReady, false);
    assert.equal(b.isDisabled, true);
    assert.equal(b.isUnavailable, false);
  });

  it("ignores extra properties", () => {
    const out = runFeature({ enabled: true, available: true, ready: true, removed: false, extra: 123 });
    assert.equal(out.isReady, true);
    assert.deepEqual(Object.keys(out).sort(), ["available", "enabled", "isDisabled", "isReady", "isUnavailable", "ready", "removed"]);
  });

  it("rejects malformed inputs without echoing input", () => {
    const bad = [
      null,
      undefined,
      0,
      "x",
      true,
      [],
      [{ enabled: true, available: true, ready: true, removed: false }],
      {},
      { enabled: true, available: true, ready: true },
      { enabled: true, available: true, ready: true, removed: 0 },
      { enabled: "true", available: true, ready: true, removed: false },
      { enabled: 1, available: true, ready: true, removed: false },
      { enabled: true, available: 1, ready: true, removed: false },
      { enabled: true, available: true, ready: null, removed: false },
      { enabled: new Boolean(true), available: true, ready: true, removed: false }
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.equal(err.message, "INVALID_VALIDATOR_READINESS_INPUT");
        return true;
      });
    }
  });

  it("preserves input and returns fresh deterministic objects", () => {
    const input = { enabled: true, available: true, ready: true, removed: false };
    const before = JSON.stringify(input);
    const first = runFeature(input);
    const second = runFeature(input);
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
  });
});
