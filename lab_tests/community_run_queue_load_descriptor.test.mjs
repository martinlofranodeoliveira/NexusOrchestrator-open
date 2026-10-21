import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/run_queue_load_descriptor.mjs";

describe("runFeature queue load descriptor", () => {
  it("returns idle descriptor for all zeros without mutating input", () => {
    const input = { active: 0, preparing: 0, queued: 0 };
    const snapshot = JSON.stringify(input);
    const out = runFeature(input);
    assert.deepStrictEqual(out, { active: 0, preparing: 0, queued: 0, total: 0, idle: true, hasBacklog: false });
    assert.equal(JSON.stringify(input), snapshot);
  });
  it("returns total 3 idle false hasBacklog false", () => {
    const input = { active: 2, preparing: 1, queued: 0 };
    const out = runFeature(input);
    assert.equal(out.active, 2);
    assert.equal(out.preparing, 1);
    assert.equal(out.queued, 0);
    assert.equal(out.total, 3);
    assert.equal(out.idle, false);
    assert.equal(out.hasBacklog, false);
    assert.deepStrictEqual(input, { active: 2, preparing: 1, queued: 0 });
  });
  it("returns total 5 idle false hasBacklog true", () => {
    const input = { active: 1, preparing: 0, queued: 4 };
    const out = runFeature(input);
    assert.deepStrictEqual(out, { active: 1, preparing: 0, queued: 4, total: 5, idle: false, hasBacklog: true });
  });
  it("throws INVALID_RUN_QUEUE_LOAD_INPUT without echoing input", () => {
    const bad = [
      {},
      { active: 0 },
      { active: 0, preparing: 0 },
      { active: 0, preparing: 0, queued: 1.5 },
      { active: "1", preparing: 0, queued: 0 },
      { active: 0, preparing: Number.NaN, queued: 0 },
      { active: 0, preparing: 0, queued: Number.POSITIVE_INFINITY },
      { active: -1, preparing: 0, queued: 0 },
      { active: 0, preparing: 10001, queued: 0 },
      { active: 10001, preparing: 0, queued: 0 },
      { active: 0, preparing: -1, queued: 0 },
      { active: null, preparing: 0, queued: 0 },
      { active: 0, preparing: undefined, queued: 0 },
      { active: true, preparing: 0, queued: 0 },
      null,
      undefined,
      0,
      "x",
      true,
      [],
      [{ active: 0, preparing: 0, queued: 0 }]
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.equal(err.message, "INVALID_RUN_QUEUE_LOAD_INPUT");
        assert.equal(String(err), "TypeError: INVALID_RUN_QUEUE_LOAD_INPUT");
        return true;
      });
    }
    assert.throws(() => runFeature({ active: 9999, preparing: 0, queued: "bad" }), (err) => {
      assert.equal(err.message, "INVALID_RUN_QUEUE_LOAD_INPUT");
      assert.equal(err.message.includes("9999"), false);
      return true;
    });
  });
  it("never mutates malformed input", () => {
    const input = { active: 1, preparing: 1 };
    const snapshot = JSON.stringify(input);
    assert.throws(() => runFeature(input), TypeError);
    assert.equal(JSON.stringify(input), snapshot);
    const arr = [];
    assert.throws(() => runFeature(arr), TypeError);
    assert.deepStrictEqual(arr, []);
    const withExtra = { active: 1, preparing: 1, queued: 1.5, extra: 1 };
    const before = JSON.stringify(withExtra);
    assert.throws(() => runFeature(withExtra), TypeError);
    assert.equal(JSON.stringify(withExtra), before);
  });
  it("ignores extra properties returns fresh deterministic objects", () => {
    const input = { active: 1, preparing: 1, queued: 1, extra: 99 };
    const a = runFeature(input);
    const b = runFeature(input);
    assert.deepStrictEqual(a, { active: 1, preparing: 1, queued: 1, total: 3, idle: false, hasBacklog: true });
    assert.deepStrictEqual(b, a);
    assert.notStrictEqual(a, b);
    assert.deepStrictEqual(input, { active: 1, preparing: 1, queued: 1, extra: 99 });
    a.total = 999;
    const c = runFeature({ active: 1, preparing: 1, queued: 1 });
    assert.equal(c.total, 3);
  });
  it("handles boundaries frozen null-prototype and negative zero", () => {
    const frozen = Object.freeze({ active: 1, preparing: 0, queued: 4 });
    assert.deepStrictEqual(runFeature(frozen), { active: 1, preparing: 0, queued: 4, total: 5, idle: false, hasBacklog: true });
    const bare = Object.create(null);
    bare.active = 2;
    bare.preparing = 1;
    bare.queued = 0;
    assert.deepStrictEqual(runFeature(bare), { active: 2, preparing: 1, queued: 0, total: 3, idle: false, hasBacklog: false });
    const negZero = runFeature({ active: -0, preparing: -0, queued: -0 });
    assert.deepStrictEqual(negZero, { active: 0, preparing: 0, queued: 0, total: 0, idle: true, hasBacklog: false });
    assert.equal(Object.is(negZero.active, 0), true);
    const edge = runFeature({ active: 10000, preparing: 10000, queued: 10000 });
    assert.equal(edge.total, 30000);
    assert.equal(edge.idle, false);
    assert.equal(edge.hasBacklog, true);
  });
});
