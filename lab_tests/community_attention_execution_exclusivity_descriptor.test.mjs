import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runFeature } from '../web-v2/src/community/attention_execution_exclusivity_descriptor.mjs';

describe('attention execution exclusivity descriptor', () => {
  it('throws for null array and non-object payloads', () => {
    assert.throws(() => runFeature(null), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature([]), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature('x'), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature(5), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature(true), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature(undefined), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({}), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
  });

  it('throws for missing non-array and oversized tasks', () => {
    assert.throws(() => runFeature({}), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: 'x' }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: {} }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: null }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    const big = [];
    for (let i = 0; i < 1001; i += 1) {
      big.push({ execution: { running: false, preparing: false, queued: false } });
    }
    assert.throws(() => runFeature({ tasks: big }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
  });

  it('throws for bad entries and bad flags', () => {
    assert.throws(() => runFeature({ tasks: [null] }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: ['x'] }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: [[]] }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: [{}] }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: [{ execution: null }] }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: [{ execution: [] }] }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: [{ execution: { running: true, preparing: false } }] }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: [{ execution: { running: 1, preparing: false, queued: false } }] }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: [{ execution: { running: false, preparing: 'x', queued: false } }] }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
    assert.throws(() => runFeature({ tasks: [{ execution: { running: false, preparing: false, queued: null } }] }), { name: 'TypeError', message: 'INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT' });
  });

  it('matches documented examples', () => {
    assert.deepEqual(runFeature({ tasks: [{ execution: { preparing: false, queued: false, running: true } }, { execution: { preparing: false, queued: false, running: false } }, { execution: { preparing: false, queued: true, running: true } }] }), {
      totalTasks: 3,
      cleanCount: 1,
      idleCount: 1,
      conflictCount: 1,
      runningCount: 2,
      preparingCount: 0,
      queuedCount: 1,
      hasConflict: true,
      isClean: false
    });
    assert.deepEqual(runFeature({ tasks: [] }), {
      totalTasks: 0,
      cleanCount: 0,
      idleCount: 0,
      conflictCount: 0,
      runningCount: 0,
      preparingCount: 0,
      queuedCount: 0,
      hasConflict: false,
      isClean: true
    });
    assert.deepEqual(runFeature({ tasks: [{ execution: { preparing: true, queued: false, running: false } }, { execution: { preparing: false, queued: true, running: false } }] }), {
      totalTasks: 2,
      cleanCount: 2,
      idleCount: 0,
      conflictCount: 0,
      runningCount: 0,
      preparingCount: 1,
      queuedCount: 1,
      hasConflict: false,
      isClean: true
    });
  });

  it('counts clean idle conflict and per-flag totals', () => {
    const out = runFeature({ tasks: [{ execution: { running: true, preparing: true, queued: true } }, { execution: { running: true, preparing: true, queued: false } }, { execution: { running: false, preparing: false, queued: false } }] });
    assert.equal(out.totalTasks, 3);
    assert.equal(out.runningCount, 2);
    assert.equal(out.preparingCount, 2);
    assert.equal(out.queuedCount, 1);
    assert.equal(out.cleanCount, 0);
    assert.equal(out.idleCount, 1);
    assert.equal(out.conflictCount, 2);
    assert.equal(out.hasConflict, true);
    assert.equal(out.isClean, false);
  });

  it('ignores extras returns exact keys fresh object without mutating', () => {
    const input = { tasks: [{ execution: { running: true, preparing: false, queued: false, extra: 1 }, title: 'x' }], extra: 'y' };
    const before = JSON.stringify(input);
    const out = runFeature(input);
    assert.equal(JSON.stringify(input), before);
    assert.deepEqual(Object.keys(out).sort(), ['cleanCount', 'conflictCount', 'hasConflict', 'idleCount', 'isClean', 'preparingCount', 'queuedCount', 'runningCount', 'totalTasks'].sort());
    assert.deepEqual(out, { totalTasks: 1, cleanCount: 1, idleCount: 0, conflictCount: 0, runningCount: 1, preparingCount: 0, queuedCount: 0, hasConflict: false, isClean: true });
    const second = runFeature({ tasks: [] });
    assert.notEqual(out, second);
    out.totalTasks = 99;
    assert.equal(runFeature({ tasks: [] }).totalTasks, 0);
  });

  it('uses only allowed deterministic constructs', () => {
    const src = runFeature.toString();
    assert.equal(/\bDate\b/.test(src), false);
    assert.equal(/\bthis\b/.test(src), false);
    assert.equal(src.includes('prototype'), false);
    assert.equal(src.includes('constructor'), false);
    assert.equal(src.includes('Object.assign'), false);
    assert.equal(src.includes('Object.create'), false);
    assert.equal(src.includes('__proto__'), false);
    assert.equal(/\bprocess\b/.test(src), false);
    assert.equal(/\bconsole\b/.test(src), false);
    assert.equal(/\bfetch\b/.test(src), false);
  });
});
