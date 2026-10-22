import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/lane_failure_presence_descriptor.mjs";

describe("lane failure presence descriptor", () => {
  it("null/null returns clear descriptor without mutating input", () => {
    const input = { failureClass: null, failureMessage: null };
    const snapshot = { failureClass: null, failureMessage: null };
    const result = runFeature(input);
    assert.deepEqual(result, {
      failureClass: null,
      failureMessage: null,
      hasFailureClass: false,
      hasFailureMessage: false,
      failed: false,
      clear: true
    });
    assert.deepEqual(input, snapshot);
    assert.notStrictEqual(result, input);
  });

  it("mixed string and empty string sets presence as OR/NOR", () => {
    const first = runFeature({ failureClass: "TIMEOUT", failureMessage: "" });
    assert.deepEqual(first, {
      failureClass: "TIMEOUT",
      failureMessage: "",
      hasFailureClass: true,
      hasFailureMessage: false,
      failed: true,
      clear: false
    });
    const second = runFeature({ failureClass: "", failureMessage: "boom" });
    assert.equal(second.hasFailureClass, false);
    assert.equal(second.hasFailureMessage, true);
    assert.equal(second.failed, true);
    assert.equal(second.clear, false);
    const bothEmpty = runFeature({ failureClass: "", failureMessage: "" });
    assert.equal(bothEmpty.hasFailureClass, false);
    assert.equal(bothEmpty.hasFailureMessage, false);
    assert.equal(bothEmpty.failed, false);
    assert.equal(bothEmpty.clear, true);
  });

  it("both non-empty strings return failed descriptor with preserved values", () => {
    const input = { failureClass: "RETRY_EXHAUSTED", failureMessage: "lane failed after retries" };
    const result = runFeature(input);
    assert.deepEqual(result, {
      failureClass: "RETRY_EXHAUSTED",
      failureMessage: "lane failed after retries",
      hasFailureClass: true,
      hasFailureMessage: true,
      failed: true,
      clear: false
    });
    assert.notStrictEqual(result, input);
  });

  it("ignores extra properties and preserves boundary length 500", () => {
    const long500 = "x".repeat(500);
    const input = { failureClass: long500, failureMessage: null, extra: 123 };
    const result = runFeature(input);
    assert.equal(result.failureClass, long500);
    assert.equal(result.failureMessage, null);
    assert.equal(result.hasFailureClass, true);
    assert.equal(result.hasFailureMessage, false);
    assert.equal(result.failed, true);
    assert.equal(result.clear, false);
    assert.deepEqual(input, { failureClass: long500, failureMessage: null, extra: 123 });
  });

  it("rejects malformed payloads with exact TypeError without echo", () => {
    const long501 = "y".repeat(501);
    const badInputs = [
      null,
      undefined,
      [],
      [{ failureClass: null, failureMessage: null }],
      {},
      { failureClass: null },
      { failureMessage: null },
      { failureClass: 1, failureMessage: null },
      { failureClass: null, failureMessage: 2 },
      { failureClass: true, failureMessage: null },
      { failureClass: null, failureMessage: {} },
      { failureClass: undefined, failureMessage: null },
      { failureClass: long501, failureMessage: null },
      { failureClass: null, failureMessage: long501 },
      "text",
      42,
      new Date()
    ];
    for (const bad of badInputs) {
      assert.throws(() => runFeature(bad), (err) => {
        assert.ok(err instanceof TypeError);
        assert.equal(err.message, "INVALID_LANE_FAILURE_PRESENCE_INPUT");
        return true;
      });
    }
    const secret = "SECRET-UNIQUE-VALUE-987";
    try {
      runFeature({ failureClass: 12345, failureMessage: secret });
      assert.fail("expected throw");
    } catch (err) {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message, "INVALID_LANE_FAILURE_PRESENCE_INPUT");
      assert.equal(err.message.includes(secret), false);
    }
  });
});
