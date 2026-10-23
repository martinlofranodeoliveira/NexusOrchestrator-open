import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/collaboration_active_share_descriptor.mjs";

describe("collaboration_active_share_descriptor", () => {
  it("describes partial share 3 total 1 active", () => {
    const out = runFeature({ totalCollaborations: 3, activeCollaborations: 1 });
    assert.deepEqual(out, {
      totalCollaborations: 3,
      activeCollaborations: 1,
      idleCount: 2,
      hasActive: true,
      allActive: false,
      noneActive: false
    });
  });

  it("handles empty 0/0 and full 2/2", () => {
    assert.deepEqual(runFeature({ totalCollaborations: 0, activeCollaborations: 0 }), {
      totalCollaborations: 0,
      activeCollaborations: 0,
      idleCount: 0,
      hasActive: false,
      allActive: false,
      noneActive: true
    });
    assert.deepEqual(runFeature({ totalCollaborations: 2, activeCollaborations: 2 }), {
      totalCollaborations: 2,
      activeCollaborations: 2,
      idleCount: 0,
      hasActive: true,
      allActive: true,
      noneActive: false
    });
  });

  it("rejects malformed inputs with exact TypeError without echo", () => {
    const bad = [
      null,
      undefined,
      [],
      [{ totalCollaborations: 1, activeCollaborations: 1 }],
      {},
      { totalCollaborations: 1 },
      { activeCollaborations: 1 },
      { totalCollaborations: 1.5, activeCollaborations: 1 },
      { totalCollaborations: 2, activeCollaborations: 1.5 },
      { totalCollaborations: "3", activeCollaborations: 1 },
      { totalCollaborations: 3, activeCollaborations: "1" },
      { totalCollaborations: NaN, activeCollaborations: 0 },
      { totalCollaborations: 1, activeCollaborations: Infinity },
      { totalCollaborations: -1, activeCollaborations: 0 },
      { totalCollaborations: 10001, activeCollaborations: 0 },
      { totalCollaborations: 1, activeCollaborations: -1 },
      { totalCollaborations: 1, activeCollaborations: 10001 },
      { totalCollaborations: 1, activeCollaborations: 2 },
      { totalCollaborations: 0, activeCollaborations: 1 },
      42,
      "x",
      true
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.equal(err.message, "INVALID_COLLABORATION_ACTIVE_SHARE_INPUT");
        return true;
      });
    }
  });

  it("never mutates input, ignores extras, returns fresh deterministic object", () => {
    const input = { totalCollaborations: 3, activeCollaborations: 1, extra: "keep" };
    const snapshot = { totalCollaborations: 3, activeCollaborations: 1, extra: "keep" };
    const first = runFeature(input);
    const second = runFeature({ totalCollaborations: 3, activeCollaborations: 1 });
    assert.deepEqual(input, snapshot);
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.notEqual(first, input);
    assert.equal("extra" in first, false);
    assert.equal(first.totalCollaborations, 3);
    assert.equal(first.activeCollaborations, 1);
    assert.equal(first.idleCount, 2);
  });

  it("stays pure with allowed constructs and JSON limits", () => {
    const src = runFeature.toString();
    assert.equal(typeof runFeature, "function");
    assert.equal(runFeature.length, 1);
    assert.match(src, /totalCollaborations/);
    assert.match(src, /activeCollaborations/);
    assert.match(src, /idleCount/);
    assert.equal(src.includes("INVALID_COLLABORATION_ACTIVE_SHARE_INPUT"), true);
    assert.equal(src.includes("import"), false);
    assert.equal(src.includes("Object.assign"), false);
    assert.equal(src.includes("Object.create"), false);
    assert.equal(src.includes("prototype"), false);
    assert.equal(src.includes("constructor"), false);
    const edge = runFeature({ totalCollaborations: 10000, activeCollaborations: 10000 });
    assert.deepEqual(edge, {
      totalCollaborations: 10000,
      activeCollaborations: 10000,
      idleCount: 0,
      hasActive: true,
      allActive: true,
      noneActive: false
    });
    assert.deepEqual(JSON.parse(JSON.stringify(edge)), edge);
  });
});
