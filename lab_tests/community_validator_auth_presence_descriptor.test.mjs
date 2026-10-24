import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/validator_auth_presence_descriptor.mjs";

describe("validator auth presence descriptor", () => {
  it("both true returns ready", () => {
    const out = runFeature({ authConfigured: true, authFileExists: true });
    assert.deepEqual(out, {
      authConfigured: true,
      authFileExists: true,
      isReady: true,
      isMissing: false,
      isPartial: false
    });
  });

  it("both false returns missing", () => {
    const out = runFeature({ authConfigured: false, authFileExists: false });
    assert.deepEqual(out, {
      authConfigured: false,
      authFileExists: false,
      isReady: false,
      isMissing: true,
      isPartial: false
    });
  });

  it("mixed true/false returns partial", () => {
    const first = runFeature({ authConfigured: true, authFileExists: false });
    assert.deepEqual(first, {
      authConfigured: true,
      authFileExists: false,
      isReady: false,
      isMissing: false,
      isPartial: true
    });
    const second = runFeature({ authConfigured: false, authFileExists: true });
    assert.deepEqual(second, {
      authConfigured: false,
      authFileExists: true,
      isReady: false,
      isMissing: false,
      isPartial: true
    });
  });

  it("rejects malformed shapes without echoing input", () => {
    const bad = [
      null,
      undefined,
      0,
      1,
      "x",
      true,
      false,
      [],
      [true],
      {},
      { authConfigured: true },
      { authFileExists: true },
      { authConfigured: true, authFileExists: 1 },
      { authConfigured: "true", authFileExists: true },
      { authConfigured: null, authFileExists: true },
      { authConfigured: true, authFileExists: null },
      { authConfigured: 1, authFileExists: 0 },
      { authConfigured: true, authFileExists: undefined },
      function () {}
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.equal(err.message, "INVALID_VALIDATOR_AUTH_PRESENCE_INPUT");
        assert.equal(String(err.message).includes("true"), false);
        return true;
      });
    }
  });

  it("ignores extras, never mutates, returns fresh exact object", () => {
    const input = { authConfigured: true, authFileExists: false, extra: 123 };
    const snapshot = { authConfigured: true, authFileExists: false, extra: 123 };
    const out = runFeature(input);
    assert.deepEqual(input, snapshot);
    assert.deepEqual(Object.keys(out).sort(), ["authConfigured", "authFileExists", "isMissing", "isPartial", "isReady"]);
    assert.equal(out.extra, undefined);
    assert.notEqual(out, input);
    const again = runFeature({ authConfigured: true, authFileExists: false });
    assert.deepEqual(out, again);
    assert.notEqual(out, again);
  });

  it("is pure and deterministic", () => {
    const a = runFeature({ authConfigured: false, authFileExists: false });
    const b = runFeature({ authConfigured: false, authFileExists: false });
    assert.deepEqual(a, b);
    assert.notEqual(a, b);
    const c = runFeature({ authConfigured: true, authFileExists: true });
    const d = runFeature({ authConfigured: true, authFileExists: true });
    assert.deepEqual(c, d);
  });
});
