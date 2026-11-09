import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/attention_title_accessibility_descriptor.mjs";

const MSG = "INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT";

function checkInvalid(input) {
  assert.throws(() => runFeature(input), (err) => {
    assert.ok(err instanceof TypeError);
    assert.strictEqual(err.message, MSG);
    return true;
  });
}

describe("attention title accessibility descriptor", () => {
  it("mixed titles report blank versus labeled without mutating input", () => {
    const input = { tasks: [{ title: "Review lane" }, { title: "" }, { title: "   " }] };
    const before = JSON.stringify(input);
    const out = runFeature(input);
    assert.deepStrictEqual(out, { totalTasks: 3, labeledCount: 1, blankCount: 2, hasBlank: true, isAccessible: false });
    assert.strictEqual(JSON.stringify(input), before);
    assert.deepStrictEqual(input, { tasks: [{ title: "Review lane" }, { title: "" }, { title: "   " }] });
  });

  it("empty tasks array returns zero counts as fresh object", () => {
    const input = { tasks: [] };
    const out = runFeature(input);
    assert.deepStrictEqual(out, { totalTasks: 0, labeledCount: 0, blankCount: 0, hasBlank: false, isAccessible: true });
    assert.notStrictEqual(out, input);
    const again = runFeature({ tasks: [] });
    assert.deepStrictEqual(again, out);
    assert.notStrictEqual(again, out);
  });

  it("contract examples match", () => {
    assert.deepStrictEqual(runFeature({ tasks: [{ title: "Review lane" }, { title: "" }, { title: "   " }] }), { totalTasks: 3, labeledCount: 1, blankCount: 2, hasBlank: true, isAccessible: false });
    assert.deepStrictEqual(runFeature({ tasks: [] }), { totalTasks: 0, labeledCount: 0, blankCount: 0, hasBlank: false, isAccessible: true });
    assert.deepStrictEqual(runFeature({ tasks: [{ title: "Triage" }, { title: "Escalate\nReview" }] }), { totalTasks: 2, labeledCount: 2, blankCount: 0, hasBlank: false, isAccessible: true });
  });

  it("empty and space/TAB/LF/CR-only titles are blank, other visible chars are labeled", () => {
    const blanks = ["", " ", "   ", "\t", "\n", "\r", " \t\n\r ", " \t "];
    for (const title of blanks) {
      const out = runFeature({ tasks: [{ title }] });
      assert.strictEqual(out.blankCount, 1);
      assert.strictEqual(out.labeledCount, 0);
      assert.strictEqual(out.hasBlank, true);
      assert.strictEqual(out.isAccessible, false);
    }
    const labeled = ["a", " x ", "0", ".", "Triage", "Escalate\nReview", "\u00a0", "\u{1F600}"];
    for (const title of labeled) {
      const out = runFeature({ tasks: [{ title }] });
      assert.strictEqual(out.blankCount, 0);
      assert.strictEqual(out.labeledCount, 1);
      assert.strictEqual(out.hasBlank, false);
      assert.strictEqual(out.isAccessible, true);
    }
  });

  it("rejects null, non-object, missing and oversized tasks without echo", () => {
    checkInvalid(null);
    checkInvalid(undefined);
    checkInvalid(42);
    checkInvalid("tasks");
    checkInvalid(true);
    checkInvalid([]);
    checkInvalid({});
    checkInvalid({ tasks: null });
    checkInvalid({ tasks: "no" });
    checkInvalid({ tasks: {} });
    checkInvalid({ tasks: 42 });
    const big = [];
    for (let i = 0; i < 1001; i += 1) {
      big.push({ title: "ok" });
    }
    checkInvalid({ tasks: big });
    try {
      runFeature({ tasks: big });
    } catch (err) {
      assert.strictEqual(err.message, MSG);
      assert.ok(!String(err.message).includes("okoko"));
    }
  });

  it("rejects bad entries and titles without echo", () => {
    checkInvalid({ tasks: [null] });
    checkInvalid({ tasks: [42] });
    checkInvalid({ tasks: ["x"] });
    checkInvalid({ tasks: [[]] });
    checkInvalid({ tasks: [{}] });
    checkInvalid({ tasks: [{ title: 123 }] });
    checkInvalid({ tasks: [{ title: null }] });
    checkInvalid({ tasks: [{ title: {} }] });
    checkInvalid({ tasks: [{ title: "x".repeat(129) }] });
    const longTitle = "y".repeat(129);
    try {
      runFeature({ tasks: [{ title: longTitle }] });
    } catch (err) {
      assert.strictEqual(err.message, MSG);
      assert.ok(!err.message.includes(longTitle));
    }
    checkInvalid({ tasks: [{ title: "\uD800" }] });
    checkInvalid({ tasks: [{ title: "\uDC00" }] });
    checkInvalid({ tasks: [{ title: "a\uD800b" }] });
    checkInvalid({ tasks: [{ title: "\u0000" }] });
    checkInvalid({ tasks: [{ title: "\u0001" }] });
    checkInvalid({ tasks: [{ title: "\u0008" }] });
    checkInvalid({ tasks: [{ title: "\u000B" }] });
    checkInvalid({ tasks: [{ title: "\u000C" }] });
    checkInvalid({ tasks: [{ title: "\u000E" }] });
    checkInvalid({ tasks: [{ title: "\u001F" }] });
    checkInvalid({ tasks: [{ title: "hi\u0007there" }] });
  });

  it("accepts boundaries and ignores extras, stays pure on frozen input", () => {
    const edge = "z".repeat(128);
    const outEdge = runFeature({ tasks: [{ title: edge }] });
    assert.strictEqual(outEdge.labeledCount, 1);
    const many = [];
    for (let i = 0; i < 1000; i += 1) {
      many.push({ title: "" });
    }
    const outMany = runFeature({ tasks: many });
    assert.strictEqual(outMany.totalTasks, 1000);
    assert.strictEqual(outMany.blankCount, 1000);
    const withExtras = runFeature({ tasks: [{ title: "Hi", extra: 123 }], extraTop: true });
    assert.deepStrictEqual(withExtras, { totalTasks: 1, labeledCount: 1, blankCount: 0, hasBlank: false, isAccessible: true });
    const frozen = Object.freeze({ tasks: Object.freeze([Object.freeze({ title: "Review lane" }), Object.freeze({ title: "" })]) });
    const outFrozen = runFeature(frozen);
    assert.deepStrictEqual(outFrozen, { totalTasks: 2, labeledCount: 1, blankCount: 1, hasBlank: true, isAccessible: false });
    const src = runFeature.toString();
    assert.ok(!src.includes("Date"));
    assert.ok(!src.includes("Math.random"));
    assert.ok(!src.includes("fetch"));
    assert.ok(!src.includes("console."));
    assert.ok(!src.includes("process"));
    assert.ok(!src.includes("require("));
    assert.ok(!src.includes("Reflect"));
    assert.ok(!src.includes("Proxy"));
    assert.ok(!src.includes("Object.assign"));
    assert.ok(!src.includes("Object.create"));
  });
});
