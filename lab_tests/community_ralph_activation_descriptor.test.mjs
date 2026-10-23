import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/ralph_activation_descriptor.mjs";

describe("ralph_activation_descriptor", () => {
  it("all-false returns level 0 inactive consistent not activatable", () => {
    const out = runFeature({ ralphExtensionConfigured: false, ralphExtensionInstalled: false, ralphExtensionActive: false });
    assert.deepEqual(out, {
      ralphExtensionConfigured: false,
      ralphExtensionInstalled: false,
      ralphExtensionActive: false,
      activationLevel: 0,
      fullyActive: false,
      inactive: true,
      consistent: true,
      activatable: false
    });
  });

  it("configured plus installed without active returns level 2 consistent activatable", () => {
    const out = runFeature({ ralphExtensionConfigured: true, ralphExtensionInstalled: true, ralphExtensionActive: false });
    assert.deepEqual(out, {
      ralphExtensionConfigured: true,
      ralphExtensionInstalled: true,
      ralphExtensionActive: false,
      activationLevel: 2,
      fullyActive: false,
      inactive: false,
      consistent: true,
      activatable: true
    });
  });

  it("active without configured is inconsistent but counts literally", () => {
    const out = runFeature({ ralphExtensionConfigured: false, ralphExtensionInstalled: false, ralphExtensionActive: true });
    assert.deepEqual(out, {
      ralphExtensionConfigured: false,
      ralphExtensionInstalled: false,
      ralphExtensionActive: true,
      activationLevel: 1,
      fullyActive: false,
      inactive: false,
      consistent: false,
      activatable: false
    });
  });

  it("all-true is fully active consistent not activatable", () => {
    const out = runFeature({ ralphExtensionConfigured: true, ralphExtensionInstalled: true, ralphExtensionActive: true });
    assert.equal(out.activationLevel, 3);
    assert.equal(out.fullyActive, true);
    assert.equal(out.inactive, false);
    assert.equal(out.consistent, true);
    assert.equal(out.activatable, false);
  });

  it("installed without configured is inconsistent", () => {
    const out = runFeature({ ralphExtensionConfigured: false, ralphExtensionInstalled: true, ralphExtensionActive: false });
    assert.equal(out.activationLevel, 1);
    assert.equal(out.consistent, false);
    assert.equal(out.activatable, false);
    assert.equal(out.inactive, false);
    assert.equal(out.fullyActive, false);
  });

  it("ignores extra properties", () => {
    const out = runFeature({ ralphExtensionConfigured: true, ralphExtensionInstalled: false, ralphExtensionActive: false, extra: 123, note: "hi" });
    assert.equal(out.activationLevel, 1);
    assert.equal(out.consistent, true);
    assert.equal(out.activatable, false);
    assert.deepEqual(Object.keys(out).sort(), ["activatable", "activationLevel", "consistent", "fullyActive", "inactive", "ralphExtensionActive", "ralphExtensionConfigured", "ralphExtensionInstalled"]);
  });

  it("throws exact TypeError without echo for malformed shapes", () => {
    const bad = [null, undefined, 42, "x", true, [], [1, 2], {}, { ralphExtensionConfigured: true }, { ralphExtensionConfigured: true, ralphExtensionInstalled: true }, { ralphExtensionConfigured: true, ralphExtensionInstalled: true, ralphExtensionActive: 1 }, { ralphExtensionConfigured: "true", ralphExtensionInstalled: false, ralphExtensionActive: false }, { ralphExtensionConfigured: false, ralphExtensionInstalled: null, ralphExtensionActive: false }];
    for (const value of bad) {
      assert.throws(() => runFeature(value), (err) => err instanceof TypeError && err.message === "INVALID_RALPH_ACTIVATION_INPUT");
    }
  });

  it("error message does not echo input", () => {
    try {
      runFeature({ ralphExtensionConfigured: "SECRET_FLAG", ralphExtensionInstalled: false, ralphExtensionActive: false });
      assert.fail("should throw");
    } catch (err) {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message, "INVALID_RALPH_ACTIVATION_INPUT");
      assert.equal(String(err.message).includes("SECRET_FLAG"), false);
    }
  });

  it("never mutates input", () => {
    const input = { ralphExtensionConfigured: true, ralphExtensionInstalled: true, ralphExtensionActive: false };
    const before = JSON.stringify(input);
    runFeature(input);
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(input, { ralphExtensionConfigured: true, ralphExtensionInstalled: true, ralphExtensionActive: false });
  });

  it("returns fresh deterministic object", () => {
    const input = { ralphExtensionConfigured: false, ralphExtensionInstalled: false, ralphExtensionActive: false };
    const a = runFeature(input);
    const b = runFeature(input);
    assert.deepEqual(a, b);
    assert.notEqual(a, b);
    assert.notEqual(a, input);
  });
});
