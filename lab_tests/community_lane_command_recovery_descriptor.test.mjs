import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runFeature } from '../web-v2/src/community/lane_command_recovery_descriptor.mjs';

const INVALID = 'INVALID_LANE_COMMAND_RECOVERY_INPUT';

function rejectsInvalid(payload) {
  assert.throws(() => runFeature(payload), (err) => {
    assert.equal(err instanceof TypeError, true);
    assert.equal(err.message, INVALID);
    return true;
  });
}

describe('lane command recovery descriptor examples', () => {
  it('handles all zeros', () => {
    assert.deepStrictEqual(runFeature({ retryCount: 0, commandRecoveryCount: 0 }), {
      retryCount: 0,
      commandRecoveryCount: 0,
      totalRecoveries: 0,
      hasRetries: false,
      hasCommandRecoveries: false,
      hasAnyRecovery: false
    });
  });
  it('handles mixed recoveries', () => {
    assert.deepStrictEqual(runFeature({ retryCount: 2, commandRecoveryCount: 1 }), {
      retryCount: 2,
      commandRecoveryCount: 1,
      totalRecoveries: 3,
      hasRetries: true,
      hasCommandRecoveries: true,
      hasAnyRecovery: true
    });
  });
  it('handles command-only recoveries', () => {
    assert.deepStrictEqual(runFeature({ retryCount: 0, commandRecoveryCount: 5 }), {
      retryCount: 0,
      commandRecoveryCount: 5,
      totalRecoveries: 5,
      hasRetries: false,
      hasCommandRecoveries: true,
      hasAnyRecovery: true
    });
  });
});

describe('lane command recovery descriptor flags and totals', () => {
  it('sets retry-only flags', () => {
    const out = runFeature({ retryCount: 4, commandRecoveryCount: 0 });
    assert.equal(out.totalRecoveries, 4);
    assert.equal(out.hasRetries, true);
    assert.equal(out.hasCommandRecoveries, false);
    assert.equal(out.hasAnyRecovery, true);
  });
  it('supports maximum boundary without overflow', () => {
    const out = runFeature({ retryCount: 1000000, commandRecoveryCount: 1000000 });
    assert.equal(out.retryCount, 1000000);
    assert.equal(out.commandRecoveryCount, 1000000);
    assert.equal(out.totalRecoveries, 2000000);
    assert.equal(out.hasRetries, true);
    assert.equal(out.hasCommandRecoveries, true);
    assert.equal(out.hasAnyRecovery, true);
  });
  it('supports asymmetric maximum', () => {
    const out = runFeature({ retryCount: 1000000, commandRecoveryCount: 0 });
    assert.equal(out.totalRecoveries, 1000000);
    assert.equal(out.hasRetries, true);
    assert.equal(out.hasCommandRecoveries, false);
    assert.equal(out.hasAnyRecovery, true);
  });
  it('is deterministic and returns fresh objects', () => {
    const input = { retryCount: 3, commandRecoveryCount: 7 };
    const first = runFeature(input);
    const second = runFeature(input);
    assert.deepStrictEqual(first, second);
    assert.notEqual(first, second);
  });
  it('ignores extra properties and never mutates input', () => {
    const input = { retryCount: 2, commandRecoveryCount: 3, extra: 99, note: 'x' };
    const snapshot = { retryCount: 2, commandRecoveryCount: 3, extra: 99, note: 'x' };
    const out = runFeature(input);
    assert.deepStrictEqual(input, snapshot);
    assert.deepStrictEqual(out, {
      retryCount: 2,
      commandRecoveryCount: 3,
      totalRecoveries: 5,
      hasRetries: true,
      hasCommandRecoveries: true,
      hasAnyRecovery: true
    });
    assert.equal(Object.keys(out).length, 6);
  });
  it('accepts null-prototype and frozen inputs without mutation', () => {
    const plain = Object.assign({}, { retryCount: 1, commandRecoveryCount: 2 });
    const frozen = Object.freeze({ retryCount: 1, commandRecoveryCount: 2 });
    assert.deepStrictEqual(runFeature(plain), {
      retryCount: 1,
      commandRecoveryCount: 2,
      totalRecoveries: 3,
      hasRetries: true,
      hasCommandRecoveries: true,
      hasAnyRecovery: true
    });
    const out = runFeature(frozen);
    assert.equal(out.totalRecoveries, 3);
    assert.deepStrictEqual(frozen, { retryCount: 1, commandRecoveryCount: 2 });
  });
  it('treats negative zero as zero', () => {
    const out = runFeature({ retryCount: -0, commandRecoveryCount: -0 });
    assert.equal(out.retryCount, 0);
    assert.equal(out.commandRecoveryCount, 0);
    assert.equal(out.totalRecoveries, 0);
    assert.equal(out.hasRetries, false);
    assert.equal(out.hasCommandRecoveries, false);
    assert.equal(out.hasAnyRecovery, false);
  });
});

describe('lane command recovery descriptor input validation', () => {
  it('rejects null, undefined, arrays and primitives', () => {
    rejectsInvalid(null);
    rejectsInvalid(undefined);
    rejectsInvalid([]);
    rejectsInvalid([1, 2]);
    rejectsInvalid(0);
    rejectsInvalid('x');
    rejectsInvalid(true);
    rejectsInvalid(() => 1);
  });
  it('rejects missing and inherited fields', () => {
    rejectsInvalid({});
    rejectsInvalid({ retryCount: 1 });
    rejectsInvalid({ commandRecoveryCount: 1 });
    rejectsInvalid({ retryCount: 1, commandRecoveryCount: undefined });
    const proto = { retryCount: 1, commandRecoveryCount: 2 };
    rejectsInvalid(Object.create(proto));
  });
  it('rejects non-integer and non-finite values', () => {
    rejectsInvalid({ retryCount: 1.5, commandRecoveryCount: 0 });
    rejectsInvalid({ retryCount: 0, commandRecoveryCount: 2.5 });
    rejectsInvalid({ retryCount: NaN, commandRecoveryCount: 0 });
    rejectsInvalid({ retryCount: 0, commandRecoveryCount: NaN });
    rejectsInvalid({ retryCount: Infinity, commandRecoveryCount: 0 });
    rejectsInvalid({ retryCount: 0, commandRecoveryCount: -Infinity });
    rejectsInvalid({ retryCount: '1', commandRecoveryCount: 0 });
    rejectsInvalid({ retryCount: 0, commandRecoveryCount: null });
    rejectsInvalid({ retryCount: true, commandRecoveryCount: 0 });
  });
  it('rejects out-of-range values', () => {
    rejectsInvalid({ retryCount: -1, commandRecoveryCount: 0 });
    rejectsInvalid({ retryCount: 0, commandRecoveryCount: -1 });
    rejectsInvalid({ retryCount: 1000001, commandRecoveryCount: 0 });
    rejectsInvalid({ retryCount: 0, commandRecoveryCount: 1000001 });
    rejectsInvalid({ retryCount: 2000000, commandRecoveryCount: 2000000 });
  });
  it('uses exact error message without echoing input', () => {
    try {
      runFeature({ retryCount: -5, commandRecoveryCount: 0 });
      assert.fail('should throw');
    } catch (err) {
      assert.equal(err instanceof TypeError, true);
      assert.equal(err.message, INVALID);
      assert.equal(err.message.includes('-5'), false);
    }
  });
});
