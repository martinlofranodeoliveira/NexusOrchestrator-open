'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentCollaboration, CollaborationError } = require('../services/agentCollaboration');

const SOURCE = { repository: 'example/public-project', commit: 'a'.repeat(40), visibility: 'public', paths: ['src/core.js'] };
function registry() {
  return [
    { id: 'director', role: 'planner', provider: 'muse', model: 'opencode-go/muse-spark-1.3-contributor', capabilities: ['planning'], available: true, floor: 0 },
    { id: 'builder', role: 'executor', provider: 'muse', model: 'opencode-go/muse-spark-1.3-contributor', capabilities: ['code'], available: true, floor: 1 },
  ];
}
function request(taskId = 'build', extra = {}) {
  return { taskId, from: 'director', to: 'builder', capability: 'code', sourceRefs: [SOURCE], ...extra };
}
function apply(board, input) {
  return board.apply('request', input, { expectedRevision: board.snapshot().revision, idempotencyKey: `request-${input.taskId}` });
}
function error(code) { return e => e instanceof CollaborationError && e.code === code; }
function extra(array, key = '4294967295', value = 'discarded-metadata') { array[key] = value; return array; }

test('registry array rejects the first numeric key that is not an ECMAScript array index', () => {
  assert.throws(() => new AgentCollaboration({ agents: extra(registry()) }), error('INVALID_INPUT'));
});

test('arbitrarily large numeric keys are not accepted as dense array entries', () => {
  for (const key of ['4294967296', '9007199254740992', '9'.repeat(400)]) {
    assert.throws(() => new AgentCollaboration({ agents: extra(registry(), key) }), error('INVALID_INPUT'));
  }
});

test('an out-of-range getter is rejected without reading its value', () => {
  const agents = registry(); let calls = 0;
  Object.defineProperty(agents, '4294967295', { enumerable: true, get() { calls++; throw new Error('must not read'); } });
  assert.throws(() => new AgentCollaboration({ agents }), error('INVALID_INPUT'));
  assert.equal(calls, 0);
});

test('an out-of-range setter is rejected without invoking it', () => {
  const agents = registry(); let calls = 0;
  Object.defineProperty(agents, '4294967295', { enumerable: false, set() { calls++; } });
  assert.throws(() => new AgentCollaboration({ agents }), error('INVALID_INPUT'));
  assert.equal(calls, 0);
});

test('nested capability arrays reject extras before they can be silently normalized', () => {
  const agents = registry(); extra(agents[1].capabilities);
  assert.throws(() => new AgentCollaboration({ agents }), error('INVALID_INPUT'));
});

test('request refs and path arrays reject extra numeric keys atomically', () => {
  for (const input of [
    request('bad-refs', { sourceRefs: extra([SOURCE]) }),
    request('bad-paths', { sourceRefs: [{ ...SOURCE, paths: extra(['src/core.js']) }] }),
  ]) {
    const board = new AgentCollaboration({ agents: registry() }); const before = board.snapshot();
    assert.throws(() => apply(board, input), error('INVALID_INPUT'));
    assert.deepEqual(board.snapshot(), before);
  }
});

test('dependency arrays reject extra numeric keys without adding a task or operation', () => {
  const board = new AgentCollaboration({ agents: registry() }); const before = board.snapshot();
  assert.throws(() => apply(board, request('bad-deps', { dependencies: extra([]) })), error('INVALID_INPUT'));
  assert.deepEqual(board.snapshot(), before);
});

test('imported journals reject numeric non-index properties instead of erasing them before replay', () => {
  const board = new AgentCollaboration({ agents: registry() }); apply(board, request());
  for (const name of ['initialAgents', 'agents', 'tasks', 'operations']) {
    const state = JSON.parse(JSON.stringify(board.exportState())); extra(state[name]);
    assert.throws(() => AgentCollaboration.fromState(state), error('INVALID_INPUT'));
  }
});

test('frozen, dense JSON arrays retain all valid data and replay unchanged', () => {
  const agents = registry(); agents.forEach(item => Object.freeze(item.capabilities)); Object.freeze(agents);
  const board = new AgentCollaboration({ agents });
  const paths = Object.freeze(['src/core.js']);
  const receipt = apply(board, request('valid', { sourceRefs: Object.freeze([{ ...SOURCE, paths }]), dependencies: Object.freeze([]) }));
  assert.equal(receipt.status, 'accepted');
  assert.deepEqual(AgentCollaboration.fromState(board.exportState()).snapshot(), board.snapshot());
});

test('named, symbolic, sparse and indexed-accessor extras remain rejected', () => {
  for (const decorate of [
    values => { values.extra = true; },
    values => { values[Symbol('extra')] = true; },
    values => { delete values[0]; },
    values => { Object.defineProperty(values, '0', { enumerable: true, get() { throw new Error('must not read'); } }); },
  ]) {
    const agents = registry(); decorate(agents);
    assert.throws(() => new AgentCollaboration({ agents }), error('INVALID_INPUT'));
  }
});
