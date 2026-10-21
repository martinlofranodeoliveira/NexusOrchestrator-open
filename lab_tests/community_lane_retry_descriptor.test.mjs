import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/lane_retry_descriptor.mjs";

describe("lane retry descriptor", () => {
  it("zero input is clean", () => {
    assert.deepEqual(runFeature({ retryCount: 0, recoveryCount: 0 }), {
      retryCount: 0,
      recoveryCount: 0,
      totalAttempts: 0,
      hasRetries: false,
      hasRecovery: false,
      isClean: true
    });
  });
  it("retry-only input sums literally", () => {
    assert.deepEqual(runFeature({ retryCount: 2, recoveryCount: 0 }), {
      retryCount: 2,
      recoveryCount: 0,
      totalAttempts: 2,
      hasRetries: true,
      hasRecovery: false,
      isClean: false
    });
  });
  it("mixed input sums literally", () => {
    assert.deepEqual(runFeature({ retryCount: 1, recoveryCount: 3 }), {
      retryCount: 1,
      recoveryCount: 3,
      totalAttempts: 4,
      hasRetries: true,
      hasRecovery: true,
      isClean: false
    });
  });
  it("boundary maximum is accepted", () => {
    assert.deepEqual(runFeature({ retryCount: 10000, recoveryCount: 10000 }), {
      retryCount: 10000,
      recoveryCount: 10000,
      totalAttempts: 20000,
      hasRetries: true,
      hasRecovery: true,
      isClean: false
    });
  });
  it("recovery-only input derives flags literally", () => {
    assert.deepEqual(runFeature({ retryCount: 0, recoveryCount: 5 }), {
      retryCount: 0,
      recoveryCount: 5,
      totalAttempts: 5,
      hasRetries: false,
      hasRecovery: true,
      isClean: false
    });
  });
  it("malformed inputs throw without echo", () => {
    const bad = [
      undefined,
      null,
      0,
      "x",
      true,
      [],
      [1],
      {},
      { retryCount: 0 },
      { recoveryCount: 0 },
      { retryCount: null, recoveryCount: 0 },
      { retryCount: 0, recoveryCount: null },
      { retryCount: 1.5, recoveryCount: 0 },
      { retryCount: 0, recoveryCount: 2.5 },
      { retryCount: NaN, recoveryCount: 0 },
      { retryCount: 0, recoveryCount: NaN },
      { retryCount: Infinity, recoveryCount: 0 },
      { retryCount: 0, recoveryCount: Infinity },
      { retryCount: -1, recoveryCount: 0 },
      { retryCount: 0, recoveryCount: -1 },
      { retryCount: 10001, recoveryCount: 0 },
      { retryCount: 0, recoveryCount: 10001 },
      { retryCount: "1", recoveryCount: 0 },
      { retryCount: 0, recoveryCount: "3" }
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.equal(err.message, "INVALID_LANE_RETRY_INPUT");
        return true;
      });
    }
  });
  it("extra properties ignored, input unmutated, fresh object", () => {
    const input = { retryCount: 2, recoveryCount: 3, extra: 99 };
    const before = { retryCount: 2, recoveryCount: 3, extra: 99 };
    const first = runFeature(input);
    assert.deepEqual(input, before);
    assert.deepEqual(first, {
      retryCount: 2,
      recoveryCount: 3,
      totalAttempts: 5,
      hasRetries: true,
      hasRecovery: true,
      isClean: false
    });
    assert.equal("extra" in first, false);
    const second = runFeature({ retryCount: 2, recoveryCount: 3 });
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
  });
  it("implementation is pure", () => {
    const text = runFeature.toString();
    assert.ok(text.includes("retryCount"));
    assert.equal(text.includes("process"), false);
    assert.equal(text.includes("Date"), false);
    assert.equal(text.includes("Reflect"), false);
    assert.equal(text.includes("Proxy"), false);
    assert.equal(text.includes("fetch"), false);
    assert.equal(text.includes("console"), false);
    assert.equal(text.includes("require"), false);
  });
});
