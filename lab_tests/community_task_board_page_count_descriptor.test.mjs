import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/task_board_page_count_descriptor.mjs";

function checkInvalid(input) {
  const before = JSON.stringify(input);
  let threw = false;
  try {
    runFeature(input);
  } catch (err) {
    threw = true;
    assert.ok(err instanceof TypeError);
    assert.equal(err.message, "INVALID_TASK_BOARD_PAGE_COUNT_INPUT");
  }
  assert.equal(threw, true);
  assert.equal(JSON.stringify(input), before);
}

describe("task_board_page_count_descriptor", () => {
  it("empty input returns zero pages", () => {
    assert.deepStrictEqual(runFeature({ totalCount: 0, pageSize: 10 }), {
      totalCount: 0,
      pageSize: 10,
      totalPages: 0,
      remainder: 0,
      isEmpty: true,
      isSinglePage: false,
      hasMultiplePages: false
    });
  });

  it("exact multiple returns single page", () => {
    assert.deepStrictEqual(runFeature({ totalCount: 10, pageSize: 10 }), {
      totalCount: 10,
      pageSize: 10,
      totalPages: 1,
      remainder: 0,
      isEmpty: false,
      isSinglePage: true,
      hasMultiplePages: false
    });
  });

  it("ceiling case returns two pages", () => {
    assert.deepStrictEqual(runFeature({ totalCount: 11, pageSize: 10 }), {
      totalCount: 11,
      pageSize: 10,
      totalPages: 2,
      remainder: 1,
      isEmpty: false,
      isSinglePage: false,
      hasMultiplePages: true
    });
  });

  it("ignores extra properties and computes boundaries", () => {
    assert.deepStrictEqual(runFeature({ totalCount: 5, pageSize: 2, extra: 123 }), {
      totalCount: 5,
      pageSize: 2,
      totalPages: 3,
      remainder: 1,
      isEmpty: false,
      isSinglePage: false,
      hasMultiplePages: true
    });
    assert.deepStrictEqual(runFeature({ totalCount: 10000, pageSize: 1000 }), {
      totalCount: 10000,
      pageSize: 1000,
      totalPages: 10,
      remainder: 0,
      isEmpty: false,
      isSinglePage: false,
      hasMultiplePages: true
    });
    assert.deepStrictEqual(runFeature({ totalCount: 1, pageSize: 1000 }), {
      totalCount: 1,
      pageSize: 1000,
      totalPages: 1,
      remainder: 1,
      isEmpty: false,
      isSinglePage: true,
      hasMultiplePages: false
    });
    assert.deepStrictEqual(runFeature({ totalCount: 0, pageSize: 1 }), {
      totalCount: 0,
      pageSize: 1,
      totalPages: 0,
      remainder: 0,
      isEmpty: true,
      isSinglePage: false,
      hasMultiplePages: false
    });
  });

  it("rejects invalid shapes without echo and never mutates", () => {
    checkInvalid(null);
    checkInvalid(undefined);
    checkInvalid([]);
    checkInvalid({});
    checkInvalid({ totalCount: 0 });
    checkInvalid({ pageSize: 10 });
    checkInvalid({ totalCount: 1.5, pageSize: 10 });
    checkInvalid({ totalCount: 5, pageSize: 2.5 });
    checkInvalid({ totalCount: "10", pageSize: 10 });
    checkInvalid({ totalCount: 10, pageSize: "10" });
    checkInvalid({ totalCount: NaN, pageSize: 10 });
    checkInvalid({ totalCount: 10, pageSize: Infinity });
    checkInvalid({ totalCount: Infinity, pageSize: 10 });
    checkInvalid({ totalCount: -1, pageSize: 10 });
    checkInvalid({ totalCount: 10001, pageSize: 10 });
    checkInvalid({ totalCount: 10, pageSize: 0 });
    checkInvalid({ totalCount: 10, pageSize: 1001 });
    checkInvalid(42);
    checkInvalid("x");
    checkInvalid(true);
  });

  it("returns fresh object each call and preserves input", () => {
    const input = { totalCount: 11, pageSize: 10 };
    const before = JSON.stringify(input);
    const a = runFeature(input);
    const b = runFeature(input);
    assert.deepStrictEqual(a, b);
    assert.notStrictEqual(a, b);
    assert.equal(JSON.stringify(input), before);
  });
});
