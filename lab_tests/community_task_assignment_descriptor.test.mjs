import { test } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/task_assignment_descriptor.mjs";

function expectInvalid(input) {
  let thrown = null;
  try {
    runFeature(input);
  } catch (err) {
    thrown = err;
  }
  assert.ok(thrown instanceof TypeError);
  assert.equal(thrown.message, "INVALID_TASK_ASSIGNMENT_INPUT");
  assert.equal(String(thrown), "TypeError: INVALID_TASK_ASSIGNMENT_INPUT");
}

test("null assignee returns fresh unassigned descriptor without mutating input", () => {
  const input = { assignee: null };
  const out = runFeature(input);
  assert.deepEqual(out, { assignee: null, hasAssignee: false, isUnassigned: true, assigneeLength: 0 });
  assert.deepEqual(input, { assignee: null });
  assert.notEqual(out, input);
  out.assigneeLength = 99;
  const again = runFeature(input);
  assert.equal(again.assigneeLength, 0);
});

test("empty string assignee is unassigned with length 0", () => {
  const out = runFeature({ assignee: "" });
  assert.equal(out.assignee, "");
  assert.equal(out.hasAssignee, false);
  assert.equal(out.isUnassigned, true);
  assert.equal(out.assigneeLength, 0);
});

test("non-empty string assignee preserves value and length", () => {
  const out = runFeature({ assignee: "mara" });
  assert.equal(out.assignee, "mara");
  assert.equal(out.assigneeLength, 4);
  assert.equal(out.hasAssignee, true);
  assert.equal(out.isUnassigned, false);
});

test("allowed LF CR TAB and max length are valid", () => {
  const ok = runFeature({ assignee: "a\tb\nc\rd" });
  assert.equal(ok.hasAssignee, true);
  assert.equal(ok.isUnassigned, false);
  assert.equal(ok.assigneeLength, 7);
  const max = "x".repeat(1024);
  const maxOut = runFeature({ assignee: max });
  assert.equal(maxOut.assigneeLength, 1024);
  assert.equal(maxOut.hasAssignee, true);
});

test("malformed shapes throw without echoing input", () => {
  expectInvalid(null);
  expectInvalid(undefined);
  expectInvalid([]);
  expectInvalid([{ assignee: "a" }]);
  expectInvalid("mara");
  expectInvalid(42);
  expectInvalid(true);
  expectInvalid({});
  expectInvalid({ other: 1 });
  expectInvalid({ assignee: undefined });
  expectInvalid({ assignee: 42 });
  expectInvalid({ assignee: true });
  expectInvalid({ assignee: {} });
  expectInvalid({ assignee: [] });
  expectInvalid({ assignee: "x".repeat(1025) });
  expectInvalid({ assignee: "a\u0000b" });
  expectInvalid({ assignee: "a\u0007b" });
  expectInvalid({ assignee: "a\u001Fb" });
  expectInvalid({ assignee: "a\u000Bb" });
  expectInvalid({ assignee: "a\u000Cb" });
  expectInvalid({ assignee: "\uD800" });
  expectInvalid({ assignee: "\uDC00" });
  expectInvalid({ assignee: "ok\uD800bad" });
});

test("extra properties ignored, input never mutated, output fresh", () => {
  const input = { assignee: "mara", extra: 123, other: "x" };
  const snapshot = { assignee: "mara", extra: 123, other: "x" };
  const out = runFeature(input);
  assert.deepEqual(out, { assignee: "mara", hasAssignee: true, isUnassigned: false, assigneeLength: 4 });
  assert.deepEqual(input, snapshot);
  assert.deepEqual(Object.keys(out).sort(), ["assignee", "assigneeLength", "hasAssignee", "isUnassigned"]);
  assert.notEqual(out, input);
  const second = runFeature(input);
  assert.notEqual(out, second);
  assert.deepEqual(out, second);
});
