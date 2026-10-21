import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runFeature } from '../web-v2/src/community/room_interlink_count_descriptor.mjs';

function expectInvalid(input) {
  let err = null;
  try {
    runFeature(input);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof TypeError);
  assert.equal(err.message, 'INVALID_ROOM_INTERLINK_COUNT_INPUT');
}

describe('room interlink count descriptor', () => {
  it('empty list returns isolated descriptor', () => {
    assert.deepEqual(runFeature({ interlinkedRoomIds: [] }), { linkCount: 0, hasLinks: false, isIsolated: true });
  });
  it('single entry returns linked descriptor without mutating input', () => {
    const input = { interlinkedRoomIds: ['room-a'] };
    const before = JSON.stringify(input);
    const out = runFeature(input);
    assert.deepEqual(out, { linkCount: 1, hasLinks: true, isIsolated: false });
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(input, { interlinkedRoomIds: ['room-a'] });
  });
  it('multiple entries return count and ignore extra properties', () => {
    const out = runFeature({ extra: 123, interlinkedRoomIds: ['room-a', 'room-b'] });
    assert.deepEqual(out, { linkCount: 2, hasLinks: true, isIsolated: false });
  });
  it('allows LF CR TAB inside entries', () => {
    const out = runFeature({ interlinkedRoomIds: ['a\tb', 'c\nd', 'e\rf'] });
    assert.equal(out.linkCount, 3);
    assert.equal(out.hasLinks, true);
    assert.equal(out.isIsolated, false);
  });
  it('allows paired surrogates and unicode', () => {
    const out = runFeature({ interlinkedRoomIds: ['room-\u00e9-\u4e2d', '\uD83D\uDE00'] });
    assert.equal(out.linkCount, 2);
  });
  it('rejects missing field and malformed shapes', () => {
    expectInvalid({});
    expectInvalid(null);
    expectInvalid(undefined);
    expectInvalid('x');
    expectInvalid(42);
    expectInvalid(true);
    expectInvalid([]);
    expectInvalid(['room-a']);
    expectInvalid({ interlinkedRoomIds: null });
    expectInvalid({ interlinkedRoomIds: 'room-a' });
    expectInvalid({ interlinkedRoomIds: {} });
    expectInvalid({ interlinkedRoomIds: 7 });
  });
  it('rejects out-of-range count', () => {
    const big = [];
    for (let i = 0; i < 101; i += 1) {
      big.push('r-' + String(i));
    }
    expectInvalid({ interlinkedRoomIds: big });
  });
  it('accepts boundary counts 0 and 100', () => {
    assert.equal(runFeature({ interlinkedRoomIds: [] }).linkCount, 0);
    const hundred = [];
    for (let i = 0; i < 100; i += 1) {
      hundred.push('r-' + String(i));
    }
    const out = runFeature({ interlinkedRoomIds: hundred });
    assert.equal(out.linkCount, 100);
    assert.equal(out.hasLinks, true);
    assert.equal(out.isIsolated, false);
  });
  it('rejects non-string empty overlong entries', () => {
    expectInvalid({ interlinkedRoomIds: [42] });
    expectInvalid({ interlinkedRoomIds: [null] });
    expectInvalid({ interlinkedRoomIds: [''] });
    expectInvalid({ interlinkedRoomIds: ['x'.repeat(65)] });
    expectInvalid({ interlinkedRoomIds: ['ok', 5] });
  });
  it('accepts 64 length entry', () => {
    const out = runFeature({ interlinkedRoomIds: ['x'.repeat(64)] });
    assert.equal(out.linkCount, 1);
  });
  it('rejects disallowed C0 controls', () => {
    expectInvalid({ interlinkedRoomIds: ['a\u0000b'] });
    expectInvalid({ interlinkedRoomIds: ['a\u0008b'] });
    expectInvalid({ interlinkedRoomIds: ['a\u000Bb'] });
    expectInvalid({ interlinkedRoomIds: ['a\u000Cb'] });
    expectInvalid({ interlinkedRoomIds: ['a\u001Fb'] });
  });
  it('rejects unpaired surrogates', () => {
    expectInvalid({ interlinkedRoomIds: ['\uD800'] });
    expectInvalid({ interlinkedRoomIds: ['\uDC00'] });
    expectInvalid({ interlinkedRoomIds: ['ok-\uD83D'] });
  });
  it('throws without echoing input', () => {
    const secret = 'SECRET-ROOM-XYZ-123';
    let err = null;
    try {
      runFeature({ interlinkedRoomIds: [secret + '\u0000'] });
    } catch (e) {
      err = e;
    }
    assert.ok(err instanceof TypeError);
    assert.equal(err.message, 'INVALID_ROOM_INTERLINK_COUNT_INPUT');
    assert.equal(err.message.includes(secret), false);
  });
  it('returns fresh object without backend inference', () => {
    const a = runFeature({ interlinkedRoomIds: [] });
    const b = runFeature({ interlinkedRoomIds: [] });
    assert.notEqual(a, b);
    assert.deepEqual(Object.keys(a).sort(), ['hasLinks', 'isIsolated', 'linkCount']);
    const c = runFeature({ interlinkedRoomIds: ['room-a'] });
    assert.deepEqual(Object.keys(c).sort(), ['hasLinks', 'isIsolated', 'linkCount']);
  });
});
