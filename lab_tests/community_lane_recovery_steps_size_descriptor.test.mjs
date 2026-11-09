import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/lane_recovery_steps_size_descriptor.mjs";

function assertInvalid(payload) {
  let err = null;
  try {
    runFeature(payload);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof TypeError, "expected TypeError");
  assert.equal(err.message, "INVALID_LANE_RECOVERY_STEPS_INPUT");
}

describe("lane recovery steps size descriptor", () => {
  it("mixed sizes 2,0,1 summarizes correctly", () => {
    const out = runFeature({ lanes: [{ steps: ["check", "retry"] }, { steps: [] }, { steps: ["escalate"] }] });
    assert.equal(out.totalLanes, 3);
    assert.equal(out.totalSteps, 3);
    assert.equal(out.lanesWithSteps, 2);
    assert.equal(out.lanesEmpty, 1);
    assert.equal(out.maxSteps, 2);
    assert.equal(out.minSteps, 0);
    assert.equal(out.averageSteps, 1);
    assert.equal(out.hasSteps, true);
    assert.equal(out.isEmpty, false);
  });

  it("empty lanes array returns zeros", () => {
    const out = runFeature({ lanes: [] });
    assert.deepEqual(out, {
      totalLanes: 0,
      totalSteps: 0,
      lanesWithSteps: 0,
      lanesEmpty: 0,
      maxSteps: 0,
      minSteps: 0,
      averageSteps: 0,
      hasSteps: false,
      isEmpty: true
    });
  });

  it("all empty steps arrays report empty", () => {
    const out = runFeature({ lanes: [{ steps: [] }, { steps: [] }] });
    assert.equal(out.totalSteps, 0);
    assert.equal(out.hasSteps, false);
    assert.equal(out.isEmpty, true);
    assert.equal(out.maxSteps, 0);
    assert.equal(out.minSteps, 0);
    assert.equal(out.lanesEmpty, 2);
    assert.equal(out.lanesWithSteps, 0);
  });

  it("single lane with three steps", () => {
    const out = runFeature({ lanes: [{ steps: ["a", "b", "c"] }] });
    assert.equal(out.totalLanes, 1);
    assert.equal(out.totalSteps, 3);
    assert.equal(out.averageSteps, 3);
    assert.equal(out.maxSteps, 3);
    assert.equal(out.minSteps, 3);
    assert.equal(out.hasSteps, true);
    assert.equal(out.isEmpty, false);
  });

  it("ignores extra properties and never mutates input", () => {
    const input = { lanes: [{ steps: ["a"], extra: 1 }], extraTop: true };
    const before = JSON.stringify(input);
    const out = runFeature(input);
    assert.equal(JSON.stringify(input), before);
    assert.equal(out.totalLanes, 1);
    assert.equal(out.totalSteps, 1);
    assert.notEqual(out, input);
    const second = runFeature(JSON.parse(before));
    assert.deepEqual(out, second);
  });

  it("allows LF CR TAB inside step text", () => {
    const out = runFeature({ lanes: [{ steps: ["a\tb\nc\rd"] }] });
    assert.equal(out.totalSteps, 1);
    assert.equal(out.hasSteps, true);
  });

  it("rejects invalid shapes without echoing input", () => {
    assertInvalid(null);
    assertInvalid(undefined);
    assertInvalid([]);
    assertInvalid("x");
    assertInvalid(42);
    assertInvalid({});
    assertInvalid({ lanes: "no" });
    assertInvalid({ lanes: null });
    assertInvalid({ lanes: [{ steps: [] }, null] });
    assertInvalid({ lanes: [[]] });
    assertInvalid({ lanes: [42] });
    assertInvalid({ lanes: [{}] });
    assertInvalid({ lanes: [{ steps: "x" }] });
    assertInvalid({ lanes: [{ steps: null }] });
    assertInvalid({ lanes: [{ steps: ["ok", 1] }] });
    assertInvalid({ lanes: [{ steps: [""] }] });
    assertInvalid({ lanes: [{ steps: ["\u0000"] }] });
    assertInvalid({ lanes: [{ steps: ["\u001B"] }] });
    assertInvalid({ lanes: [{ steps: ["\uD800"] }] });
    assertInvalid({ lanes: [{ steps: ["a".repeat(129)] }] });
    const bigSteps = [];
    for (let i = 0; i < 51; i += 1) bigSteps.push("a");
    assertInvalid({ lanes: [{ steps: bigSteps }] });
    const bigLanes = [];
    for (let i = 0; i < 1001; i += 1) bigLanes.push({ steps: [] });
    assertInvalid({ lanes: bigLanes });
  });

  it("error message never echoes step text", () => {
    try {
      runFeature({ lanes: [{ steps: ["\u0000secret"] }] });
      assert.fail("should throw");
    } catch (e) {
      assert.ok(e instanceof TypeError);
      assert.equal(e.message, "INVALID_LANE_RECOVERY_STEPS_INPUT");
      assert.ok(!String(e.message).includes("secret"));
    }
  });
});
