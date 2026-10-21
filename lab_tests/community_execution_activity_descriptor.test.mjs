import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/execution_activity_descriptor.mjs";

describe("execution_activity_descriptor", () => {
  it("all false returns idle descriptor with fresh output", () => {
    const input = { running: false, preparing: false, queued: false };
    const before = { running: false, preparing: false, queued: false };
    const out = runFeature(input);
    assert.deepEqual(out, {
      running: false,
      preparing: false,
      queued: false,
      active: false,
      idle: true,
      hasQueued: false
    });
    assert.deepEqual(input, before);
    assert.notEqual(out, input);
  });

  it("running true returns active without queued", () => {
    const out = runFeature({ running: true, preparing: false, queued: false });
    assert.equal(out.running, true);
    assert.equal(out.preparing, false);
    assert.equal(out.queued, false);
    assert.equal(out.active, true);
    assert.equal(out.idle, false);
    assert.equal(out.hasQueued, false);
  });

  it("queued true returns active with hasQueued", () => {
    const out = runFeature({ running: false, preparing: true, queued: true });
    assert.deepEqual(out, {
      running: false,
      preparing: true,
      queued: true,
      active: true,
      idle: false,
      hasQueued: true
    });
  });

  it("preparing only is active and not idle", () => {
    const out = runFeature({ running: false, preparing: true, queued: false });
    assert.equal(out.active, true);
    assert.equal(out.idle, false);
    assert.equal(out.hasQueued, false);
  });

  it("throws for null, array, missing and non-boolean", () => {
    const bad = [
      null,
      undefined,
      42,
      "x",
      true,
      [],
      {},
      { running: false, preparing: false },
      { running: false, preparing: false, queued: 1 },
      { running: "false", preparing: false, queued: false },
      { running: false, preparing: null, queued: false },
      new Date()
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.equal(err.message, "INVALID_EXECUTION_ACTIVITY_INPUT");
        assert.equal(String(err.message).includes("running"), false);
        return true;
      });
    }
  });

  it("ignores extras, preserves input and returns fresh object", () => {
    const input = { running: false, preparing: false, queued: true, extra: 123 };
    const out = runFeature(input);
    assert.equal(out.active, true);
    assert.equal(out.idle, false);
    assert.equal(out.hasQueued, true);
    assert.equal("extra" in out, false);
    assert.deepEqual(Object.keys(out).sort(), ["active", "hasQueued", "idle", "preparing", "queued", "running"]);
    assert.deepEqual(input, { running: false, preparing: false, queued: true, extra: 123 });
    assert.notEqual(out, input);
    const again = runFeature({ running: false, preparing: false, queued: true });
    assert.deepEqual(out, again);
    assert.notEqual(out, again);
  });
});
