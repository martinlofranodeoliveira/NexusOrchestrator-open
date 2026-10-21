import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/agent_presence_descriptor.mjs";

function assertInvalid(payload) {
  try {
    runFeature(payload);
  } catch (err) {
    assert.equal(err instanceof TypeError, true);
    assert.equal(err.message, "INVALID_AGENT_PRESENCE_INPUT");
    return;
  }
  assert.fail("expected TypeError for invalid input");
}

describe("agent presence descriptor", () => {
  it("maps 0 to empty only", () => {
    assert.deepEqual(runFeature({ total: 0 }), {
      total: 0,
      isEmpty: true,
      hasAgents: false,
      isSingle: false,
      hasMultiple: false
    });
  });

  it("maps 1 to single only", () => {
    assert.deepEqual(runFeature({ total: 1 }), {
      total: 1,
      isEmpty: false,
      hasAgents: true,
      isSingle: true,
      hasMultiple: false
    });
  });

  it("maps values above 1 to multiple", () => {
    assert.deepEqual(runFeature({ total: 5 }), {
      total: 5,
      isEmpty: false,
      hasAgents: true,
      isSingle: false,
      hasMultiple: true
    });
    assert.deepEqual(runFeature({ total: 2 }), {
      total: 2,
      isEmpty: false,
      hasAgents: true,
      isSingle: false,
      hasMultiple: true
    });
    assert.deepEqual(runFeature({ total: 10000 }), {
      total: 10000,
      isEmpty: false,
      hasAgents: true,
      isSingle: false,
      hasMultiple: true
    });
  });

  it("ignores extra properties and preserves input with fresh result", () => {
    const input = { total: 3, extra: "ignored", flag: 123 };
    const snapshot = { total: 3, extra: "ignored", flag: 123 };
    const result = runFeature(input);
    assert.deepEqual(result, {
      total: 3,
      isEmpty: false,
      hasAgents: true,
      isSingle: false,
      hasMultiple: true
    });
    assert.deepEqual(Object.keys(result).sort(), ["hasAgents", "hasMultiple", "isEmpty", "isSingle", "total"]);
    assert.deepEqual(input, snapshot);
    assert.equal(result === input, false);
  });

  it("rejects malformed shapes without echoing input", () => {
    assertInvalid(undefined);
    assertInvalid(null);
    assertInvalid({});
    assertInvalid({ total: null });
    assertInvalid({ total: "5" });
    assertInvalid({ total: 1.5 });
    assertInvalid({ total: NaN });
    assertInvalid({ total: Infinity });
    assertInvalid({ total: -1 });
    assertInvalid({ total: 10001 });
    assertInvalid([]);
    assertInvalid([{ total: 1 }]);
    assertInvalid("total");
    assertInvalid(5);
    assertInvalid(true);
  });
});
