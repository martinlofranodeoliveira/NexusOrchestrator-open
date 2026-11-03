import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/task_board_page_window_descriptor.mjs";

describe("task board page window descriptor", () => {
  it("empty board returns empty window and preserves input", () => {
    const input = { total: 0, pageSize: 10, pageIndex: 0 };
    const before = JSON.stringify(input);
    const result = runFeature(input);
    assert.deepEqual(result, {
      total: 0,
      pageSize: 10,
      pageIndex: 0,
      pageCount: 0,
      start: 0,
      end: 0,
      count: 0,
      hasPrev: false,
      hasNext: false,
      isEmpty: true
    });
    assert.equal(JSON.stringify(input), before);
  });

  it("first page of 25 items", () => {
    const result = runFeature({ total: 25, pageSize: 10, pageIndex: 0 });
    assert.deepEqual(result, {
      total: 25,
      pageSize: 10,
      pageIndex: 0,
      pageCount: 3,
      start: 0,
      end: 10,
      count: 10,
      hasPrev: false,
      hasNext: true,
      isEmpty: false
    });
  });

  it("last partial page of 25 items", () => {
    const result = runFeature({ total: 25, pageSize: 10, pageIndex: 2 });
    assert.deepEqual(result, {
      total: 25,
      pageSize: 10,
      pageIndex: 2,
      pageCount: 3,
      start: 20,
      end: 25,
      count: 5,
      hasPrev: true,
      hasNext: false,
      isEmpty: false
    });
  });

  it("out-of-range page clamps to total", () => {
    const result = runFeature({ total: 25, pageSize: 10, pageIndex: 5 });
    assert.deepEqual(result, {
      total: 25,
      pageSize: 10,
      pageIndex: 5,
      pageCount: 3,
      start: 25,
      end: 25,
      count: 0,
      hasPrev: true,
      hasNext: false,
      isEmpty: true
    });
  });

  it("ignores extra properties", () => {
    const result = runFeature({ total: 25, pageSize: 10, pageIndex: 0, extra: "ignored" });
    assert.equal(result.total, 25);
    assert.equal(result.pageSize, 10);
    assert.equal(result.pageIndex, 0);
    assert.equal(result.pageCount, 3);
    assert.equal(result.start, 0);
    assert.equal(result.end, 10);
  });

  it("rejects malformed inputs without echoing input", () => {
    const badInputs = [
      null,
      undefined,
      42,
      "nope",
      true,
      [1, 2, 3],
      {},
      { total: 10, pageSize: 10 },
      { total: 10, pageIndex: 0 },
      { pageSize: 10, pageIndex: 0 },
      { total: 10.5, pageSize: 10, pageIndex: 0 },
      { total: 10, pageSize: 2.5, pageIndex: 0 },
      { total: 10, pageSize: 10, pageIndex: 0.5 },
      { total: "10", pageSize: 10, pageIndex: 0 },
      { total: null, pageSize: 10, pageIndex: 0 },
      { total: -1, pageSize: 10, pageIndex: 0 },
      { total: 10001, pageSize: 10, pageIndex: 0 },
      { total: 10, pageSize: 0, pageIndex: 0 },
      { total: 10, pageSize: 1001, pageIndex: 0 },
      { total: 10, pageSize: 10, pageIndex: -1 },
      { total: 10, pageSize: 10, pageIndex: 10001 },
      { total: Number.NaN, pageSize: 10, pageIndex: 0 },
      { total: Number.POSITIVE_INFINITY, pageSize: 10, pageIndex: 0 }
    ];
    for (const value of badInputs) {
      assert.throws(() => runFeature(value), (error) => {
        assert.ok(error instanceof TypeError);
        assert.equal(error.message, "INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
        return true;
      });
    }
  });

  it("never mutates input", () => {
    const input = { total: 25, pageSize: 10, pageIndex: 1, extra: 7 };
    const before = JSON.stringify(input);
    runFeature(input);
    assert.equal(JSON.stringify(input), before);
  });

  it("is deterministic with fresh output objects", () => {
    const first = runFeature({ total: 25, pageSize: 10, pageIndex: 1 });
    const second = runFeature({ total: 25, pageSize: 10, pageIndex: 1 });
    assert.deepEqual(first, second);
    assert.notEqual(first, second);
    assert.deepEqual(first, {
      total: 25,
      pageSize: 10,
      pageIndex: 1,
      pageCount: 3,
      start: 10,
      end: 20,
      count: 10,
      hasPrev: true,
      hasNext: true,
      isEmpty: false
    });
  });
});
