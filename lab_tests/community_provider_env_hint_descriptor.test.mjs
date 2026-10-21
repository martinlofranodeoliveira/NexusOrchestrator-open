import { test } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/provider_env_hint_descriptor.mjs";

test("auth ready returns expected descriptor", () => {
  const out = runFeature({ scope: "auth", ok: true, optional: false });
  assert.deepStrictEqual(out, {
    scope: "auth",
    ok: true,
    optional: false,
    isAuth: true,
    isMetadata: false,
    isReady: true,
    needsSetup: false
  });
});

test("metadata optional returns expected descriptor", () => {
  const out = runFeature({ scope: "metadata", ok: false, optional: true });
  assert.deepStrictEqual(out, {
    scope: "metadata",
    ok: false,
    optional: true,
    isAuth: false,
    isMetadata: true,
    isReady: false,
    needsSetup: false
  });
});

test("required missing returns needsSetup true", () => {
  const out = runFeature({ scope: "auth", ok: false, optional: false });
  assert.deepStrictEqual(out, {
    scope: "auth",
    ok: false,
    optional: false,
    isAuth: true,
    isMetadata: false,
    isReady: false,
    needsSetup: true
  });
});

test("malformed inputs throw TypeError without echo", () => {
  const bad = [
    null,
    undefined,
    42,
    "auth",
    true,
    [],
    [{ scope: "auth", ok: true, optional: false }],
    {},
    { scope: "auth" },
    { scope: "auth", ok: true },
    { scope: "bogus-scope-value", ok: true, optional: false },
    { scope: "", ok: true, optional: false },
    { scope: 7, ok: true, optional: false },
    { scope: "auth", ok: "yes", optional: false },
    { scope: "auth", ok: 1, optional: false },
    { scope: "auth", ok: true, optional: 0 },
    { scope: "auth", ok: true, optional: "no" },
    { scope: "metadata", ok: null, optional: false },
    { scope: null, ok: true, optional: false }
  ];
  for (const value of bad) {
    assert.throws(() => runFeature(value), (err) => {
      assert.ok(err instanceof TypeError);
      assert.strictEqual(err.message, "INVALID_PROVIDER_ENV_HINT_INPUT");
      assert.ok(!err.message.includes("bogus-scope-value"));
      assert.ok(!err.message.includes("yes"));
      return true;
    });
  }
});

test("extra properties are ignored and succeed", () => {
  const out = runFeature({ scope: "auth", ok: false, optional: false, extra: 1 });
  assert.deepStrictEqual(out, {
    scope: "auth",
    ok: false,
    optional: false,
    isAuth: true,
    isMetadata: false,
    isReady: false,
    needsSetup: true
  });
});

test("input never mutated, output fresh and deterministic", () => {
  const input = { scope: "metadata", ok: true, optional: false };
  const before = JSON.stringify(input);
  const a = runFeature(input);
  const b = runFeature(input);
  assert.strictEqual(JSON.stringify(input), before);
  assert.deepStrictEqual(input, { scope: "metadata", ok: true, optional: false });
  assert.deepStrictEqual(a, b);
  assert.ok(a !== b);
  assert.ok(a !== input);
  assert.deepStrictEqual(a, {
    scope: "metadata",
    ok: true,
    optional: false,
    isAuth: false,
    isMetadata: true,
    isReady: true,
    needsSetup: false
  });
});
