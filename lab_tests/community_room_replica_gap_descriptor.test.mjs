import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/room_replica_gap_descriptor.mjs";

describe("room replica gap descriptor", () => {
  it("describes scale-up gap for 2 to 5", () => {
    const input = { configuredSlots: 2, replicaTarget: 5 };
    const result = runFeature(input);
    assert.equal(result.configuredSlots, 2);
    assert.equal(result.replicaTarget, 5);
    assert.equal(result.gap, 3);
    assert.equal(result.needsScale, true);
    assert.equal(result.atTarget, false);
    assert.equal(result.overProvisioned, false);
    assert.notStrictEqual(result, input);
  });

  it("describes at-target case", () => {
    const result = runFeature({ configuredSlots: 4, replicaTarget: 4 });
    assert.equal(result.gap, 0);
    assert.equal(result.atTarget, true);
    assert.equal(result.needsScale, false);
    assert.equal(result.overProvisioned, false);
  });

  it("describes over-provisioned gap", () => {
    const result = runFeature({ configuredSlots: 5, replicaTarget: 2 });
    assert.equal(result.gap, -3);
    assert.equal(result.overProvisioned, true);
    assert.equal(result.needsScale, false);
    assert.equal(result.atTarget, false);
  });

  it("rejects malformed inputs without echoing content", () => {
    const badInputs = [
      null,
      undefined,
      42,
      "slots",
      true,
      [],
      [{ configuredSlots: 2, replicaTarget: 5 }],
      {},
      { configuredSlots: 2 },
      { replicaTarget: 5 },
      { configuredSlots: null, replicaTarget: 5 },
      { configuredSlots: 2.5, replicaTarget: 5 },
      { configuredSlots: "2", replicaTarget: 5 },
      { configuredSlots: 2, replicaTarget: 4.2 },
      { configuredSlots: NaN, replicaTarget: 5 },
      { configuredSlots: 2, replicaTarget: Infinity },
      { configuredSlots: -1, replicaTarget: 5 },
      { configuredSlots: 2, replicaTarget: 10001 },
      { configuredSlots: 10001, replicaTarget: 10001 },
      12345678901234567890123,
    ];
    for (const bad of badInputs) {
      assert.throws(() => runFeature(bad), (err) => {
        assert.equal(err.name, "TypeError");
        assert.equal(err.message, "INVALID_ROOM_REPLICA_GAP_INPUT");
        assert.equal(String(err.message).includes("configuredSlots"), false);
        return true;
      });
    }
  });

  it("rejects non-plain objects and out-of-range integers", () => {
    const notPlain = { configuredSlots: 1, replicaTarget: 1 };
    const asMap = new Map([["configuredSlots", 1], ["replicaTarget", 1]]);
    assert.throws(() => runFeature(asMap), { name: "TypeError", message: "INVALID_ROOM_REPLICA_GAP_INPUT" });
    assert.throws(() => runFeature({ configuredSlots: 1.1, replicaTarget: 1 }), { name: "TypeError", message: "INVALID_ROOM_REPLICA_GAP_INPUT" });
    assert.throws(() => runFeature({ configuredSlots: 0, replicaTarget: -0.5 }), { name: "TypeError", message: "INVALID_ROOM_REPLICA_GAP_INPUT" });
    assert.deepEqual(notPlain, { configuredSlots: 1, replicaTarget: 1 });
  });

  it("ignores extra properties, never mutates input, returns fresh objects", () => {
    const input = { configuredSlots: 2, replicaTarget: 5, extra: "ignore-me", nested: { a: 1 } };
    const snapshot = { configuredSlots: 2, replicaTarget: 5, extra: "ignore-me", nested: { a: 1 } };
    const first = runFeature(input);
    const second = runFeature(input);
    assert.deepEqual(input, snapshot);
    assert.deepEqual(Object.keys(first).sort(), ["atTarget", "configuredSlots", "gap", "needsScale", "overProvisioned", "replicaTarget"]);
    assert.notStrictEqual(first, second);
    assert.deepEqual(first, second);
    assert.notStrictEqual(first, input);
  });

  it("is deterministic at boundaries", () => {
    assert.deepEqual(runFeature({ configuredSlots: 0, replicaTarget: 0 }), {
      configuredSlots: 0,
      replicaTarget: 0,
      gap: 0,
      needsScale: false,
      atTarget: true,
      overProvisioned: false,
    });
    assert.deepEqual(runFeature({ configuredSlots: 0, replicaTarget: 10000 }), {
      configuredSlots: 0,
      replicaTarget: 10000,
      gap: 10000,
      needsScale: true,
      atTarget: false,
      overProvisioned: false,
    });
    assert.deepEqual(runFeature({ configuredSlots: 10000, replicaTarget: 0 }), {
      configuredSlots: 10000,
      replicaTarget: 0,
      gap: -10000,
      needsScale: false,
      atTarget: false,
      overProvisioned: true,
    });
  });
});
