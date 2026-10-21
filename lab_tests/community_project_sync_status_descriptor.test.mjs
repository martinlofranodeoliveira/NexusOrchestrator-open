import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/project_sync_status_descriptor.mjs";

describe("project sync status descriptor", () => {
  it("describes ready when both flags are true", () => {
    assert.deepStrictEqual(runFeature({ githubConfigured: true, projectSyncEnabled: true }), {
      githubConfigured: true,
      projectSyncEnabled: true,
      ready: true,
      needsProvider: false,
      syncDisabled: false
    });
  });

  it("describes missing provider when github is not configured", () => {
    assert.deepStrictEqual(runFeature({ githubConfigured: false, projectSyncEnabled: false }), {
      githubConfigured: false,
      projectSyncEnabled: false,
      ready: false,
      needsProvider: true,
      syncDisabled: false
    });
    assert.deepStrictEqual(runFeature({ githubConfigured: false, projectSyncEnabled: true }), {
      githubConfigured: false,
      projectSyncEnabled: true,
      ready: false,
      needsProvider: true,
      syncDisabled: false
    });
  });

  it("describes disabled sync when provider exists but sync is off", () => {
    assert.deepStrictEqual(runFeature({ githubConfigured: true, projectSyncEnabled: false }), {
      githubConfigured: true,
      projectSyncEnabled: false,
      ready: false,
      needsProvider: false,
      syncDisabled: true
    });
  });

  it("ignores extra properties and returns a fresh object without mutating input", () => {
    const input = { githubConfigured: true, projectSyncEnabled: true, extra: 42 };
    const snapshot = { githubConfigured: true, projectSyncEnabled: true, extra: 42 };
    const result = runFeature(input);
    assert.deepStrictEqual(result, {
      githubConfigured: true,
      projectSyncEnabled: true,
      ready: true,
      needsProvider: false,
      syncDisabled: false
    });
    assert.deepStrictEqual(input, snapshot);
    assert.notStrictEqual(result, input);
  });

  it("rejects malformed shapes with exact error", () => {
    const bad = [
      null,
      undefined,
      [],
      [true],
      "x",
      42,
      true,
      {},
      { githubConfigured: true },
      { projectSyncEnabled: true },
      { githubConfigured: "true", projectSyncEnabled: true },
      { githubConfigured: true, projectSyncEnabled: 1 },
      { githubConfigured: null, projectSyncEnabled: false },
      { githubConfigured: false, projectSyncEnabled: null }
    ];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => {
        assert.ok(err instanceof TypeError);
        assert.strictEqual(err.message, "INVALID_PROJECT_SYNC_STATUS_INPUT");
        return true;
      });
    }
  });
});
