import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/room_template_count_descriptor.mjs";

describe("room_template_count_descriptor", () => {
  it("describes 0 as empty", () => {
    const input = { roomTemplatesConfigured: 0 };
    const snapshot = { roomTemplatesConfigured: 0 };
    const result = runFeature(input);
    assert.deepStrictEqual(result, {
      roomTemplatesConfigured: 0,
      hasTemplates: false,
      empty: true,
      single: false,
      many: false
    });
    assert.deepStrictEqual(input, snapshot);
    assert.notStrictEqual(result, input);
  });

  it("describes 1 as single", () => {
    const input = { roomTemplatesConfigured: 1 };
    const result = runFeature(input);
    assert.deepStrictEqual(result, {
      roomTemplatesConfigured: 1,
      hasTemplates: true,
      empty: false,
      single: true,
      many: false
    });
    assert.strictEqual(result.roomTemplatesConfigured, 1);
  });

  it("describes 4 as many", () => {
    const input = { roomTemplatesConfigured: 4 };
    const result = runFeature(input);
    assert.deepStrictEqual(result, {
      roomTemplatesConfigured: 4,
      hasTemplates: true,
      empty: false,
      single: false,
      many: true
    });
  });

  it("accepts boundary 10000", () => {
    const result = runFeature({ roomTemplatesConfigured: 10000 });
    assert.strictEqual(result.roomTemplatesConfigured, 10000);
    assert.strictEqual(result.hasTemplates, true);
    assert.strictEqual(result.empty, false);
    assert.strictEqual(result.single, false);
    assert.strictEqual(result.many, true);
  });

  it("rejects malformed inputs without echo", () => {
    const bad = [
      {},
      { roomTemplatesConfigured: undefined },
      { roomTemplatesConfigured: null },
      { roomTemplatesConfigured: "1" },
      { roomTemplatesConfigured: 1.5 },
      { roomTemplatesConfigured: NaN },
      { roomTemplatesConfigured: Infinity },
      { roomTemplatesConfigured: -Infinity },
      { roomTemplatesConfigured: -1 },
      { roomTemplatesConfigured: -100 },
      { roomTemplatesConfigured: 10001 },
      { roomTemplatesConfigured: 20000 },
      { roomTemplatesConfigured: true },
      { roomTemplatesConfigured: Number.MAX_SAFE_INTEGER + 1 }
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.strictEqual(err.message, "INVALID_ROOM_TEMPLATE_COUNT_INPUT");
        return true;
      });
    }
    const payloadCases = [null, undefined, [], [{ roomTemplatesConfigured: 1 }], 0, 1, "x", true, new Date(0)];
    for (const value of payloadCases) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.strictEqual(err.message, "INVALID_ROOM_TEMPLATE_COUNT_INPUT");
        return true;
      });
    }
    assert.throws(() => runFeature(function () {}), (err) => {
      assert.ok(err instanceof TypeError);
      assert.strictEqual(err.message, "INVALID_ROOM_TEMPLATE_COUNT_INPUT");
      return true;
    });
  });

  it("does not echo large out-of-range input", () => {
    try {
      runFeature({ roomTemplatesConfigured: 99999 });
      assert.fail("expected throw");
    } catch (err) {
      assert.ok(err instanceof TypeError);
      assert.strictEqual(err.message, "INVALID_ROOM_TEMPLATE_COUNT_INPUT");
      assert.strictEqual(err.message.includes("99999"), false);
    }
  });

  it("ignores extra properties and preserves input with fresh output", () => {
    const input = { roomTemplatesConfigured: 2, extra: "hi", other: 123 };
    const result = runFeature(input);
    assert.deepStrictEqual(result, {
      roomTemplatesConfigured: 2,
      hasTemplates: true,
      empty: false,
      single: false,
      many: true
    });
    assert.deepStrictEqual(Object.keys(result).sort(), ["empty", "hasTemplates", "many", "roomTemplatesConfigured", "single"]);
    assert.deepStrictEqual(input, { roomTemplatesConfigured: 2, extra: "hi", other: 123 });
    assert.notStrictEqual(result, input);
    result.hasTemplates = false;
    assert.strictEqual(input.hasTemplates, undefined);
    assert.deepStrictEqual(input, { roomTemplatesConfigured: 2, extra: "hi", other: 123 });
  });

  it("is pure and deterministic", () => {
    const first = runFeature({ roomTemplatesConfigured: 4 });
    const second = runFeature({ roomTemplatesConfigured: 4 });
    assert.deepStrictEqual(first, second);
    assert.notStrictEqual(first, second);
    const zeroA = runFeature({ roomTemplatesConfigured: 0 });
    const zeroB = runFeature({ roomTemplatesConfigured: 0 });
    assert.deepStrictEqual(zeroA, zeroB);
  });
});
