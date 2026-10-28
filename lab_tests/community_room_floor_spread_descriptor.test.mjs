import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runFeature } from '../web-v2/src/community/room_floor_spread_descriptor.mjs';

describe('room floor spread descriptor', () => {
  it('rejects malformed inputs with exact TypeError', () => {
    const bad = [
      null,
      undefined,
      0,
      7,
      'floors',
      true,
      [],
      {},
      { floors: undefined },
      { floors: null },
      { floors: 5 },
      { floors: 'x' },
      { floors: {} },
      { floors: [[1]] },
      { floors: [1.5] },
      { floors: [NaN] },
      { floors: [Infinity] },
      { floors: [-Infinity] },
      { floors: [-1] },
      { floors: [1001] },
      { floors: ['1'] },
      { floors: [null] },
      { floors: [undefined] },
      { floors: [{}] },
      { floors: [1, 2, '3'] }
    ];
    for (const payload of bad) {
      assert.throws(() => runFeature(payload), (err) => err instanceof TypeError && err.message === 'INVALID_ROOM_FLOOR_SPREAD_INPUT');
    }
  });

  it('rejects length above 500 without echoing input', () => {
    const big = [];
    for (const v of Array.from({ length: 501 }, () => 1)) {
      big.push(v);
    }
    assert.equal(big.length, 501);
    try {
      runFeature({ floors: big });
      assert.fail('should throw');
    } catch (err) {
      assert.ok(err instanceof TypeError);
      assert.equal(err.message, 'INVALID_ROOM_FLOOR_SPREAD_INPUT');
      assert.equal(String(err).includes('501'), false);
    }
  });

  it('accepts empty floors without mutating input', () => {
    const input = { floors: [] };
    const before = JSON.stringify(input);
    const out = runFeature(input);
    assert.deepEqual(out, { count: 0, minFloor: null, maxFloor: null, span: 0, isEmpty: true, isSingleFloor: false, hasSpread: false });
    assert.equal(JSON.stringify(input), before);
    assert.notEqual(out, input);
  });

  it('computes min/max/span for unordered input', () => {
    assert.deepEqual(runFeature({ floors: [5, 0, 2] }), { count: 3, minFloor: 0, maxFloor: 5, span: 5, isEmpty: false, isSingleFloor: false, hasSpread: true });
    assert.deepEqual(runFeature({ floors: [0, 2, 5] }), { count: 3, minFloor: 0, maxFloor: 5, span: 5, isEmpty: false, isSingleFloor: false, hasSpread: true });
  });

  it('treats single-floor inputs as single floor', () => {
    assert.deepEqual(runFeature({ floors: [3, 3] }), { count: 2, minFloor: 3, maxFloor: 3, span: 0, isEmpty: false, isSingleFloor: true, hasSpread: false });
    assert.deepEqual(runFeature({ floors: [7] }), { count: 1, minFloor: 7, maxFloor: 7, span: 0, isEmpty: false, isSingleFloor: true, hasSpread: false });
  });

  it('ignores extra properties and preserves input with fresh output', () => {
    const floors = [4, 1];
    const input = { floors, extra: 123, note: 'hi' };
    const out = runFeature(input);
    assert.deepEqual(out, { count: 2, minFloor: 1, maxFloor: 4, span: 3, isEmpty: false, isSingleFloor: false, hasSpread: true });
    assert.deepEqual(input, { floors: [4, 1], extra: 123, note: 'hi' });
    assert.notEqual(out, input);
    const again = runFeature({ floors: [4, 1] });
    assert.deepEqual(again, out);
    assert.notEqual(again, out);
  });

  it('handles boundary values 0 and 1000', () => {
    assert.deepEqual(runFeature({ floors: [0] }), { count: 1, minFloor: 0, maxFloor: 0, span: 0, isEmpty: false, isSingleFloor: true, hasSpread: false });
    assert.deepEqual(runFeature({ floors: [1000] }), { count: 1, minFloor: 1000, maxFloor: 1000, span: 0, isEmpty: false, isSingleFloor: true, hasSpread: false });
    assert.deepEqual(runFeature({ floors: [0, 1000] }), { count: 2, minFloor: 0, maxFloor: 1000, span: 1000, isEmpty: false, isSingleFloor: false, hasSpread: true });
  });
});
