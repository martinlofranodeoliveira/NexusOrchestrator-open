import { test } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/external_fleet_effective_descriptor.mjs";

const INVALID = "INVALID_EXTERNAL_FLEET_EFFECTIVE_INPUT";

function expectInvalid(payload) {
  assert.throws(
    () => runFeature(payload),
    (err) => err instanceof TypeError && err.message === INVALID
  );
}

test("live with timestamp describes live observer badge", () => {
  assert.deepStrictEqual(runFeature({ enabled: true, state: "live", updatedAtMs: 123 }), {
    enabled: true,
    state: "live",
    updatedAtMs: 123,
    effective: "live",
    hasTimestamp: true,
    isDisabled: false,
    isLive: true,
    isDegraded: false
  });
});

test("disabled without timestamp describes disabled observer badge", () => {
  assert.deepStrictEqual(runFeature({ enabled: false, state: "live", updatedAtMs: null }), {
    enabled: false,
    state: "live",
    updatedAtMs: null,
    effective: "disabled",
    hasTimestamp: false,
    isDisabled: true,
    isLive: false,
    isDegraded: false
  });
});

test("stale without timestamp describes degraded observer badge", () => {
  assert.deepStrictEqual(runFeature({ enabled: true, state: "stale", updatedAtMs: null }), {
    enabled: true,
    state: "stale",
    updatedAtMs: null,
    effective: "stale",
    hasTimestamp: false,
    isDisabled: false,
    isLive: false,
    isDegraded: true
  });
});

test("unavailable with timestamp is degraded and has timestamp", () => {
  const result = runFeature({ enabled: true, state: "unavailable", updatedAtMs: 0 });
  assert.equal(result.effective, "unavailable");
  assert.equal(result.hasTimestamp, true);
  assert.equal(result.isDegraded, true);
  assert.equal(result.isLive, false);
  assert.equal(result.isDisabled, false);
});

test("disabled overrides stale and unavailable states", () => {
  const first = runFeature({ enabled: false, state: "stale", updatedAtMs: 5 });
  assert.equal(first.effective, "disabled");
  assert.equal(first.isDisabled, true);
  assert.equal(first.isDegraded, false);
  const second = runFeature({ enabled: false, state: "unavailable", updatedAtMs: null });
  assert.equal(second.effective, "disabled");
  assert.equal(second.isDisabled, true);
  assert.equal(second.isDegraded, false);
});

test("accepts boundary timestamps and returns fresh exact object", () => {
  const low = runFeature({ enabled: true, state: "live", updatedAtMs: 0 });
  assert.equal(low.hasTimestamp, true);
  const high = runFeature({ enabled: true, state: "live", updatedAtMs: 9007199254740991 });
  assert.equal(high.hasTimestamp, true);
  assert.deepStrictEqual(Object.keys(high).sort(), ["effective", "enabled", "hasTimestamp", "isDegraded", "isDisabled", "isLive", "state", "updatedAtMs"].sort());
});

test("preserves input, ignores extras and never returns same reference", () => {
  const payload = { enabled: true, state: "live", updatedAtMs: 42, extra: "ignore-me" };
  const before = JSON.stringify(payload);
  const result = runFeature(payload);
  assert.equal(JSON.stringify(payload), before);
  assert.equal("extra" in result, false);
  assert.notStrictEqual(result, payload);
  assert.deepStrictEqual(result, {
    enabled: true,
    state: "live",
    updatedAtMs: 42,
    effective: "live",
    hasTimestamp: true,
    isDisabled: false,
    isLive: true,
    isDegraded: false
  });
});

test("rejects null, array and non-object shapes without echoing input", () => {
  expectInvalid(null);
  expectInvalid(undefined);
  expectInvalid([]);
  expectInvalid([1, 2, 3]);
  expectInvalid("live");
  expectInvalid(42);
  expectInvalid(true);
  expectInvalid(() => {});
});

test("rejects missing fields, bad enabled and bad state", () => {
  expectInvalid({});
  expectInvalid({ enabled: true, state: "live" });
  expectInvalid({ enabled: true, updatedAtMs: null });
  expectInvalid({ state: "live", updatedAtMs: null });
  expectInvalid({ enabled: 1, state: "live", updatedAtMs: null });
  expectInvalid({ enabled: "true", state: "live", updatedAtMs: null });
  expectInvalid({ enabled: true, state: "disabled", updatedAtMs: null });
  expectInvalid({ enabled: true, state: "LIVE", updatedAtMs: null });
  expectInvalid({ enabled: true, state: "", updatedAtMs: null });
  expectInvalid({ enabled: true, state: null, updatedAtMs: null });
});

test("rejects malformed updatedAtMs values", () => {
  expectInvalid({ enabled: true, state: "live", updatedAtMs: 1.5 });
  expectInvalid({ enabled: true, state: "live", updatedAtMs: "123" });
  expectInvalid({ enabled: true, state: "live", updatedAtMs: true });
  expectInvalid({ enabled: true, state: "live", updatedAtMs: {} });
  expectInvalid({ enabled: true, state: "live", updatedAtMs: Number.NaN });
  expectInvalid({ enabled: true, state: "live", updatedAtMs: Number.POSITIVE_INFINITY });
  expectInvalid({ enabled: true, state: "live", updatedAtMs: -1 });
  expectInvalid({ enabled: true, state: "live", updatedAtMs: -0.5 });
  expectInvalid({ enabled: true, state: "live", updatedAtMs: 9007199254740992 });
  expectInvalid({ enabled: true, state: "live", updatedAtMs: undefined });
});
