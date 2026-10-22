import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/github_sync_readiness_descriptor.mjs";

describe("github sync readiness descriptor", () => {
  it("handles all four boolean combinations", () => {
    assert.deepStrictEqual(runFeature({ githubConfigured: false, projectSyncEnabled: false }), {
      githubConfigured: false,
      projectSyncEnabled: false,
      ready: false,
      partial: false,
      idle: true,
      needsSetup: true
    });
    assert.deepStrictEqual(runFeature({ githubConfigured: false, projectSyncEnabled: true }), {
      githubConfigured: false,
      projectSyncEnabled: true,
      ready: false,
      partial: true,
      idle: false,
      needsSetup: true
    });
    assert.deepStrictEqual(runFeature({ githubConfigured: true, projectSyncEnabled: false }), {
      githubConfigured: true,
      projectSyncEnabled: false,
      ready: false,
      partial: true,
      idle: false,
      needsSetup: true
    });
    assert.deepStrictEqual(runFeature({ githubConfigured: true, projectSyncEnabled: true }), {
      githubConfigured: true,
      projectSyncEnabled: true,
      ready: true,
      partial: false,
      idle: false,
      needsSetup: false
    });
  });

  it("rejects malformed shapes without echoing input", () => {
    const badInputs = [
      null,
      undefined,
      [],
      [{ githubConfigured: true, projectSyncEnabled: true }],
      "ready",
      42,
      true,
      {},
      { githubConfigured: true },
      { projectSyncEnabled: false },
      { githubConfigured: "true", projectSyncEnabled: true },
      { githubConfigured: true, projectSyncEnabled: 1 },
      { githubConfigured: null, projectSyncEnabled: false },
      { githubConfigured: false, projectSyncEnabled: null }
    ];
    for (const value of badInputs) {
      let threw = false;
      try {
        runFeature(value);
      } catch (err) {
        threw = true;
        assert.equal(err instanceof TypeError, true);
        assert.equal(err.message, "INVALID_GITHUB_SYNC_READINESS_INPUT");
      }
      assert.equal(threw, true);
    }
  });

  it("ignores extra properties and never mutates input", () => {
    const input = { githubConfigured: true, projectSyncEnabled: false, extra: 123 };
    const snapshot = JSON.parse(JSON.stringify(input));
    const out = runFeature(input);
    assert.deepStrictEqual(input, snapshot);
    assert.deepStrictEqual(out, {
      githubConfigured: true,
      projectSyncEnabled: false,
      ready: false,
      partial: true,
      idle: false,
      needsSetup: true
    });
    assert.equal("extra" in out, false);
  });

  it("returns fresh deterministic objects in safe JSON domain", () => {
    const first = runFeature({ githubConfigured: true, projectSyncEnabled: true });
    const second = runFeature({ githubConfigured: true, projectSyncEnabled: true });
    assert.deepStrictEqual(first, second);
    assert.notEqual(first, second);
    const idleOut = runFeature({ githubConfigured: false, projectSyncEnabled: false });
    assert.equal(idleOut.ready, false);
    assert.equal(idleOut.idle, true);
    assert.equal(idleOut.partial, false);
    assert.equal(idleOut.needsSetup, true);
    for (const value of [first, second, idleOut]) {
      const text = JSON.stringify(value);
      assert.equal(text.length <= 65536, true);
      assert.deepStrictEqual(JSON.parse(text), value);
    }
    const inText = JSON.stringify({ githubConfigured: false, projectSyncEnabled: true });
    assert.equal(inText.length <= 65536, true);
  });
});
