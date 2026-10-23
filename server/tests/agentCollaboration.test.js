'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { AgentCollaboration, CollaborationError } = require('../services/agentCollaboration');

const SOURCE = {
  repository: 'example/public-project', commit: 'a'.repeat(40), visibility: 'public', paths: ['src/core.js'],
};
const EVIDENCE = { ...SOURCE, paths: ['tests/core.test.js'] };
function registry() {
  return [
    { id: 'director', role: 'planner', provider: 'muse', model: 'opencode-go/muse-spark-1.3-contributor', capabilities: ['planning'], available: true, floor: 0 },
    { id: 'builder', role: 'executor', provider: 'muse', model: 'opencode-go/muse-spark-1.3-contributor', capabilities: ['code', 'review'], available: true, floor: 1 },
    { id: 'builder-two', role: 'executor', provider: 'muse', model: 'opencode-go/muse-spark-1.3-contributor', capabilities: ['code'], available: true, floor: 1 },
    { id: 'reviewer', role: 'executor', provider: 'gemini', model: 'gemini-3.8-flash-high', capabilities: ['review', 'code'], available: true, floor: 2 },
    { id: 'adviser', role: 'executor', provider: 'codex', model: 'configured-codex-model', capabilities: ['review', 'architecture'], available: true, floor: 3 },
    { id: 'local-a', role: 'executor', provider: 'local', model: 'current-local-model', capabilities: ['local-analysis'], available: true, floor: 4 },
    { id: 'local-b', role: 'executor', provider: 'local', model: 'current-local-model', capabilities: ['local-analysis'], available: true, floor: 4 },
  ];
}
function lab(options = {}) { return new AgentCollaboration({ agents: registry(), ...options }); }
function runner(instance) {
  let sequence = 0;
  return (operation, input, overrides = {}) => {
    sequence += 1;
    const expectedRevision = operation === 'request' || operation === 'availability'
      ? instance.snapshot().revision : instance.getTask(input.taskId).revision;
    return instance.apply(operation, input, { expectedRevision, idempotencyKey: `operation-${sequence}`, ...overrides });
  };
}
function request(taskId, extra = {}) {
  return { taskId, from: 'director', capability: 'code', sourceRefs: [SOURCE], ...extra };
}
function error(code) {
  return caught => caught instanceof CollaborationError && caught.code === code && caught.message === code;
}
function finish(run, receipt, status = 'completed', code = 'DELIVERED') {
  return run('settle', { taskId: receipt.taskId, agentId: receipt.agentId, claimToken: receipt.claimToken, status, code, evidenceRefs: status === 'completed' ? [EVIDENCE] : [] });
}

test('capability routing prefers Muse, then Gemini, with exact provider models and no execution', () => {
  const instance = lab();
  const run = runner(instance);
  const first = run('request', request('build'));
  assert.deepEqual(first, { operation: 'request', status: 'accepted', taskId: 'build', taskRevision: 1, stateRevision: 1, agentId: 'builder', claimToken: null, resultCode: null });
  assert.equal(instance.getTask('build').status, 'accepted');
  run('availability', { agentId: 'builder', available: false });
  run('availability', { agentId: 'builder-two', available: false });
  const second = run('request', request('build-two'));
  assert.equal(second.agentId, 'reviewer');
  assert.equal(instance.snapshot().agents.find(item => item.id === 'reviewer').model, 'gemini-3.8-flash-high');
});

test('explicit routing never substitutes another provider when requested agent is unavailable', () => {
  const instance = lab();
  const run = runner(instance);
  run('availability', { agentId: 'builder', available: false });
  const before = instance.snapshot();
  assert.throws(() => run('request', request('build', { to: 'builder' })), error('AGENT_UNAVAILABLE'));
  assert.deepEqual(instance.snapshot(), before);
});

test('pending work balances across equally preferred capable agents without inventing activity', () => {
  const instance = lab();
  const run = runner(instance);
  assert.equal(run('request', request('a')).agentId, 'builder');
  assert.equal(run('request', request('b')).agentId, 'builder-two');
  assert.equal(run('request', request('c')).agentId, 'builder');
  assert.equal(instance.snapshot().tasks.filter(item => item.claimToken !== null).length, 0);
});

test('unknown, self and unsupported targets are distinct failures without journal mutations', () => {
  const instance = lab();
  const run = runner(instance);
  assert.throws(() => run('request', request('a', { from: 'stranger' })), error('UNKNOWN_AGENT'));
  assert.throws(() => run('request', request('a', { to: 'stranger' })), error('UNKNOWN_AGENT'));
  assert.throws(() => run('request', request('a', { to: 'director' })), error('SELF_HANDOFF'));
  assert.throws(() => run('request', request('a', { capability: 'deployment' })), error('UNSUPPORTED_CAPABILITY'));
  assert.throws(() => run('request', request('a', { to: 'adviser', capability: 'code' })), error('UNSUPPORTED_CAPABILITY'));
  assert.equal(instance.snapshot().revision, 0);
});

test('request idempotency survives stale CAS but changed payload conflicts', () => {
  const instance = lab();
  const first = instance.apply('request', request('build'), { expectedRevision: 0, idempotencyKey: 'same-request' });
  const replay = instance.apply('request', request('build'), { expectedRevision: 0, idempotencyKey: 'same-request' });
  assert.deepEqual(replay, first);
  assert.equal(instance.snapshot().tasks.length, 1);
  assert.equal(instance.snapshot().revision, 1);
  assert.throws(() => instance.apply('request', request('different'), { expectedRevision: 1, idempotencyKey: 'same-request' }), error('IDEMPOTENCY_CONFLICT'));
  assert.throws(() => instance.apply('request', request('another'), { expectedRevision: 0, idempotencyKey: 'new-request' }), error('STALE_REVISION'));
});

test('task CAS prevents two independent claims and old claims cannot settle a new reservation', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('build', { to: 'builder' }));
  const first = run('claim', { taskId: 'build', agentId: 'builder', day: '2026-10-23' });
  assert.equal(first.claimToken, 'build:r2');
  assert.throws(() => run('claim', { taskId: 'build', agentId: 'builder', day: '2026-10-23' }, { expectedRevision: 1 }), error('STALE_REVISION'));
  run('release', { taskId: 'build', agentId: 'builder', claimToken: first.claimToken });
  const second = run('claim', { taskId: 'build', agentId: 'builder', day: '2026-10-23' });
  assert.equal(second.claimToken, 'build:r4');
  assert.throws(() => finish(run, first), error('STALE_CLAIM'));
  assert.equal(finish(run, second).status, 'completed');
});

test('completion needs a reservation and public evidence; accepted is not completed', () => {
  const instance = lab();
  const run = runner(instance);
  const accepted = run('request', request('build', { to: 'builder' }));
  assert.equal(accepted.status, 'accepted');
  assert.throws(() => run('settle', { taskId: 'build', agentId: 'builder', claimToken: 'build:r2', status: 'completed', code: 'DELIVERED', evidenceRefs: [EVIDENCE] }), error('STALE_CLAIM'));
  const claimed = run('claim', { taskId: 'build', agentId: 'builder', day: '2026-10-23' });
  assert.throws(() => run('settle', { taskId: 'build', agentId: 'builder', claimToken: claimed.claimToken, status: 'completed', code: 'DELIVERED', evidenceRefs: [] }), error('INVALID_INPUT'));
  assert.throws(() => run('settle', { taskId: 'build', agentId: 'reviewer', claimToken: claimed.claimToken, status: 'completed', code: 'DELIVERED', evidenceRefs: [EVIDENCE] }), error('UNAUTHORIZED_AGENT'));
  assert.equal(finish(run, claimed).status, 'completed');
  assert.equal(instance.getTask('build').result.code, 'DELIVERED');
  assert.throws(() => finish(run, claimed), error('TASK_TERMINAL'));
});

test('failed work remains failed and cannot satisfy a downstream dependency', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a', { to: 'builder' }));
  run('request', request('b', { to: 'builder-two', dependencies: ['a'] }));
  assert.throws(() => run('claim', { taskId: 'b', agentId: 'builder-two', day: '2026-10-23' }), error('DEPENDENCY_NOT_COMPLETED'));
  const claimed = run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' });
  const failed = finish(run, claimed, 'failed', 'VALIDATION_FAILED');
  assert.equal(failed.status, 'failed');
  assert.equal(instance.getTask('a').result.code, 'VALIDATION_FAILED');
  assert.throws(() => run('claim', { taskId: 'b', agentId: 'builder-two', day: '2026-10-23' }), error('DEPENDENCY_NOT_COMPLETED'));
});

test('completed dependency unblocks claim without transferring ownership', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a', { to: 'builder' }));
  run('request', request('b', { to: 'builder-two', dependencies: ['a'] }));
  finish(run, run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' }));
  assert.throws(() => run('claim', { taskId: 'b', agentId: 'builder', day: '2026-10-23' }), error('UNAUTHORIZED_AGENT'));
  assert.equal(run('claim', { taskId: 'b', agentId: 'builder-two', day: '2026-10-23' }).claimToken, 'b:r2');
});

test('dependency edits reject cycles, unknown ids and mutations to running work atomically', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a'));
  run('request', request('b', { dependencies: ['a'] }));
  const before = instance.snapshot();
  assert.throws(() => run('dependencies', { taskId: 'a', dependencies: ['b'] }), error('DEPENDENCY_CYCLE'));
  assert.throws(() => run('dependencies', { taskId: 'a', dependencies: ['missing'] }), error('UNKNOWN_DEPENDENCY'));
  assert.throws(() => run('dependencies', { taskId: 'a', dependencies: ['a'] }), error('DEPENDENCY_CYCLE'));
  assert.deepEqual(instance.snapshot(), before);
  run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' });
  assert.throws(() => run('dependencies', { taskId: 'a', dependencies: [] }), error('TASK_RUNNING'));
});

test('handoffs have at most two inherited hops and cannot reset the budget', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a', { to: 'builder', hopBudget: 2 }));
  const first = run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' });
  run('request', request('b', { from: 'builder', to: 'reviewer', capability: 'review', parentTaskId: 'a', parentClaimToken: first.claimToken }));
  const second = run('claim', { taskId: 'b', agentId: 'reviewer', day: '2026-10-23' });
  run('request', request('c', { from: 'reviewer', to: 'adviser', capability: 'architecture', parentTaskId: 'b', parentClaimToken: second.claimToken }));
  const third = run('claim', { taskId: 'c', agentId: 'adviser', day: '2026-10-23' });
  assert.equal(instance.getTask('a').remainingHops, 2);
  assert.equal(instance.getTask('b').remainingHops, 1);
  assert.equal(instance.getTask('c').remainingHops, 0);
  assert.throws(() => run('request', request('d', { from: 'adviser', to: 'local-a', capability: 'local-analysis', parentTaskId: 'c', parentClaimToken: third.claimToken })), error('HOP_LIMIT'));
  assert.throws(() => run('request', request('e', { from: 'builder', to: 'reviewer', capability: 'review', parentTaskId: 'a', parentClaimToken: first.claimToken, hopBudget: 2 })), error('HOP_LIMIT'));
  assert.throws(() => run('request', request('reset', { from: 'builder', to: 'reviewer', capability: 'review' })), error('ROOT_REQUEST_REQUIRES_PLANNER'));
});

test('handoff ancestry rejects spoofed senders, agent loops and dependency deadlocks', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a', { to: 'builder' }));
  const parent = run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' });
  assert.throws(() => run('request', request('b', { from: 'reviewer', to: 'adviser', capability: 'architecture', parentTaskId: 'a', parentClaimToken: parent.claimToken })), error('UNAUTHORIZED_HANDOFF'));
  assert.throws(() => run('request', request('b', { from: 'builder', to: 'director', capability: 'planning', parentTaskId: 'a', parentClaimToken: parent.claimToken })), error('HANDOFF_CYCLE'));
  assert.throws(() => run('request', request('b', { from: 'builder', to: 'reviewer', capability: 'review', parentTaskId: 'a', parentClaimToken: parent.claimToken, dependencies: ['a'] })), error('DEPENDENCY_CYCLE'));
  assert.equal(instance.snapshot().tasks.length, 1);
});

test('parent completion waits for help and a failed helper cannot count as a successful result', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a', { to: 'builder' }));
  const parent = run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' });
  run('request', request('b', { from: 'builder', to: 'reviewer', capability: 'review', parentTaskId: 'a', parentClaimToken: parent.claimToken }));
  assert.throws(() => finish(run, parent), error('CHILDREN_PENDING'));
  const helper = run('claim', { taskId: 'b', agentId: 'reviewer', day: '2026-10-23' });
  finish(run, helper, 'failed', 'PROVIDER_UNAVAILABLE');
  assert.throws(() => finish(run, parent), error('CHILD_FAILED'));
  assert.equal(finish(run, parent, 'failed', 'VALIDATION_FAILED').status, 'failed');
});

test('one local claim globally even with multiple registered local agents', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a', { to: 'local-a', capability: 'local-analysis' }));
  run('request', request('b', { to: 'local-b', capability: 'local-analysis' }));
  const first = run('claim', { taskId: 'a', agentId: 'local-a', day: '2026-10-23' });
  assert.throws(() => run('claim', { taskId: 'b', agentId: 'local-b', day: '2026-10-23' }), error('AGENT_UNAVAILABLE'));
  finish(run, first);
  assert.equal(run('claim', { taskId: 'b', agentId: 'local-b', day: '2026-10-23' }).agentId, 'local-b');
});

test('aggregate provider limit applies across distinct agents and each agent has one reservation', () => {
  const instance = lab({ providerLimits: { muse: 1, gemini: 1, codex: 1, local: 1 } });
  const run = runner(instance);
  run('request', request('a', { to: 'builder' }));
  run('request', request('b', { to: 'builder-two' }));
  run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' });
  assert.throws(() => run('claim', { taskId: 'b', agentId: 'builder-two', day: '2026-10-23' }), error('AGENT_UNAVAILABLE'));
  assert.equal(run('request', request('c')).agentId, 'reviewer');
});

test('Codex allowance is one reservation per supplied UTC day and cannot be reset by release or restart', () => {
  let instance = lab();
  let run = runner(instance);
  run('request', request('a', { to: 'adviser', capability: 'architecture' }));
  run('request', request('b', { to: 'adviser', capability: 'architecture' }));
  const first = run('claim', { taskId: 'a', agentId: 'adviser', day: '2026-10-23' });
  run('release', { taskId: 'a', agentId: 'adviser', claimToken: first.claimToken });
  assert.throws(() => run('claim', { taskId: 'b', agentId: 'adviser', day: '2026-10-23' }), error('DAILY_LIMIT'));
  instance = AgentCollaboration.fromState(JSON.parse(JSON.stringify(instance.exportState())));
  run = runner(instance);
  assert.throws(() => run('claim', { taskId: 'b', agentId: 'adviser', day: '2026-10-23' }, { idempotencyKey: 'after-restart' }), error('DAILY_LIMIT'));
  assert.equal(run('claim', { taskId: 'b', agentId: 'adviser', day: '2026-10-24' }, { idempotencyKey: 'next-day' }).agentId, 'adviser');
});

test('calendar input rejects impossible dates and backward days cannot reset daily accounting', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a'));
  for (const invalid of ['2026-02-29', '2026-04-31', '2026-13-01', '2026-00-10', '23-10-2026', '2026-10-23T00:00:00Z']) {
    assert.throws(() => run('claim', { taskId: 'a', agentId: 'builder', day: invalid }), error('INVALID_DAY'));
  }
  const claimed = run('claim', { taskId: 'a', agentId: 'builder', day: '2028-02-29' });
  run('release', { taskId: 'a', agentId: 'builder', claimToken: claimed.claimToken });
  assert.throws(() => run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' }), error('DAY_REGRESSION'));
});

test('snapshot is detached, deeply immutable and changes no inputs', () => {
  const agents = registry();
  const original = structuredClone(agents);
  const instance = new AgentCollaboration({ agents });
  const input = request('build');
  const savedInput = structuredClone(input);
  const run = runner(instance);
  run('request', input);
  agents[0].available = false;
  assert.deepEqual(original[0].available, true);
  assert.equal(instance.snapshot().agents[0].available, true);
  assert.deepEqual(input, savedInput);
  const snapshot = instance.snapshot();
  assert.throws(() => snapshot.tasks.push({}), TypeError);
  assert.throws(() => { snapshot.tasks[0].sourceRefs[0].paths[0] = 'oops'; }, TypeError);
  assert.deepEqual(instance.snapshot(), snapshot);
});

test('export/import replay validates availability, receipts, daily allowance and idempotent retries', () => {
  const instance = lab();
  const run = runner(instance);
  run('availability', { agentId: 'local-a', available: false });
  const input = request('build', { to: 'builder' });
  const accepted = instance.apply('request', input, { expectedRevision: 1, idempotencyKey: 'durable-request' });
  const claimed = run('claim', { taskId: 'build', agentId: 'builder', day: '2026-10-23' });
  finish(run, claimed);
  const exported = JSON.parse(JSON.stringify(instance.exportState()));
  const restored = AgentCollaboration.fromState(exported);
  assert.deepEqual(restored.snapshot(), instance.snapshot());
  assert.deepEqual(restored.apply('request', input, { expectedRevision: 0, idempotencyKey: 'durable-request' }), accepted);
  exported.tasks[0].status = 'accepted';
  assert.throws(() => AgentCollaboration.fromState(exported), error('INVALID_STATE'));
});

test('restore refuses forged success, counters, model substitutions and replay receipts', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a'));
  const baseline = JSON.parse(JSON.stringify(instance.exportState()));
  const mutations = [
    value => { value.codexClaims = 0.5; },
    value => { value.revision = 2; },
    value => { value.tasks[0].status = 'completed'; },
    value => { value.operations[0].receipt.status = 'completed'; },
    value => { value.agents[0].model = 'other-model'; },
    value => { value.operations[0].input.sourceRefs[0].visibility = 'private'; },
  ];
  for (const mutation of mutations) {
    const changed = structuredClone(baseline);
    mutation(changed);
    assert.throws(() => AgentCollaboration.fromState(changed), CollaborationError);
  }
  assert.deepEqual(instance.snapshot(), baseline);
});

test('public refs exclude content, URLs, unpinned revisions and sensitive/path traversal locations', () => {
  const invalidRefs = [
    { ...SOURCE, visibility: 'private' }, { ...SOURCE, commit: 'main' },
    { ...SOURCE, repository: 'https://github.com/example/project' },
    { ...SOURCE, token: 'must-not-be-stored' },
    ...['../secret', '/etc/passwd', '.env', '.env.local', '.git/config', 'safe/../secret', 'src\\private', '.ssh/config', 'auth.json', 'src//a.js'].map(path => ({ ...SOURCE, paths: [path] })),
  ];
  const instance = lab();
  const run = runner(instance);
  for (const ref of invalidRefs) {
    assert.throws(() => run('request', request('build', { sourceRefs: [ref] })), CollaborationError);
  }
  assert.throws(() => run('request', { ...request('build'), prompt: 'private text' }), error('INVALID_INPUT'));
  assert.equal(instance.snapshot().tasks.length, 0);
});

test('malformed IDs, duplicate capabilities, models and dangerous limits fail closed', () => {
  const instance = lab();
  const run = runner(instance);
  for (const taskId of ['', 'A', 'a/b', 'a\nb', '__proto__', 'a'.repeat(65), 1]) {
    assert.throws(() => run('request', request(taskId)), error('INVALID_INPUT'));
  }
  const changedModel = registry(); changedModel[1].model = 'muse-spark-other';
  assert.throws(() => new AgentCollaboration({ agents: changedModel }), error('MODEL_MISMATCH'));
  const unsupported = registry(); unsupported[1].provider = 'any-provider';
  assert.throws(() => new AgentCollaboration({ agents: unsupported }), error('UNSUPPORTED_PROVIDER'));
  const duplicate = registry(); duplicate[1].capabilities = ['code', 'code'];
  assert.throws(() => new AgentCollaboration({ agents: duplicate }), error('INVALID_INPUT'));
  assert.throws(() => lab({ providerLimits: { muse: 10, gemini: 1, codex: 1, local: 2 } }), error('INVALID_INPUT'));
});

test('accessors, sparse arrays, non-plain records and extra control fields are not evaluated as JSON', () => {
  const instance = lab();
  const run = runner(instance);
  let reads = 0;
  const withGetter = request('build');
  Object.defineProperty(withGetter, 'to', { enumerable: true, get() { reads += 1; return 'builder'; } });
  assert.throws(() => run('request', withGetter), error('INVALID_INPUT'));
  assert.equal(reads, 0);
  assert.throws(() => run('request', request('build', { dependencies: new Array(1) })), error('INVALID_INPUT'));
  assert.throws(() => run('request', new Date()), error('INVALID_INPUT'));
  assert.throws(() => instance.apply('request', request('build'), { expectedRevision: 0, idempotencyKey: 'x', command: 'forbidden' }), error('INVALID_INPUT'));
  const snapshot = JSON.parse(JSON.stringify(instance.snapshot()));
  Object.defineProperty(snapshot, 'tasks', { enumerable: true, get() { reads += 1; return []; } });
  assert.throws(() => AgentCollaboration.fromState(snapshot), error('INVALID_INPUT'));
  assert.equal(reads, 0);
});

test('result codes stay fixed and do not accept raw provider errors or contradictory statuses', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a'));
  const claimed = run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' });
  const input = { taskId: 'a', agentId: 'builder', claimToken: claimed.claimToken, status: 'failed', code: 'DELIVERED', evidenceRefs: [] };
  assert.throws(() => run('settle', input), error('INVALID_RESULT'));
  assert.throws(() => run('settle', { ...input, code: 'raw-secret-error' }), error('INVALID_RESULT'));
  assert.throws(() => run('settle', { ...input, code: 'CANCELLED', diagnostic: 'private provider output' }), error('INVALID_INPUT'));
  assert.equal(finish(run, claimed, 'failed', 'CANCELLED').resultCode, 'CANCELLED');
});

test('delegation regression: an unreserved parent cannot authorize a helper', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a', { to: 'builder' }));
  assert.throws(() => run('request', request('helper', {
    from: 'builder', to: 'reviewer', capability: 'review', parentTaskId: 'a',
  })), error('STALE_PARENT_CLAIM'));
  assert.equal(instance.snapshot().tasks.length, 1);
});

test('delegation regression: an old executor cannot delegate after releasing its claim', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a', { to: 'builder' }));
  const old = run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' });
  run('release', { taskId: 'a', agentId: 'builder', claimToken: old.claimToken });
  run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' });
  assert.throws(() => run('request', request('helper', {
    from: 'builder', to: 'reviewer', capability: 'review', parentTaskId: 'a',
  })), error('STALE_PARENT_CLAIM'));
  assert.equal(instance.snapshot().tasks.length, 1);
});

test('root-authority regression: planning capability does not grant executor root authority', () => {
  const agents = registry();
  agents.find(item => item.id === 'builder').capabilities.push('planning');
  const instance = new AgentCollaboration({ agents });
  const run = runner(instance);
  assert.throws(() => run('request', request('reset', {
    from: 'builder', to: 'reviewer', capability: 'review',
  })), error('ROOT_REQUEST_REQUIRES_PLANNER'));
  assert.equal(instance.snapshot().tasks.length, 0);
});

test('current parent claim fences new help while replay of an already accepted request stays idempotent', () => {
  const instance = lab();
  const run = runner(instance);
  run('request', request('a', { to: 'builder' }));
  const old = run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' });
  const firstInput = request('helper-one', {
    from: 'builder', to: 'reviewer', capability: 'review', parentTaskId: 'a', parentClaimToken: old.claimToken,
  });
  const original = run('request', firstInput, { idempotencyKey: 'accepted-help' });
  run('release', { taskId: 'a', agentId: 'builder', claimToken: old.claimToken });
  const current = run('claim', { taskId: 'a', agentId: 'builder', day: '2026-10-23' });
  const before = instance.snapshot();
  assert.throws(() => run('request', request('helper-two', {
    from: 'builder', to: 'reviewer', capability: 'review', parentTaskId: 'a', parentClaimToken: old.claimToken,
  })), error('STALE_PARENT_CLAIM'));
  assert.deepEqual(instance.snapshot(), before);
  assert.deepEqual(run('request', firstInput, { expectedRevision: 0, idempotencyKey: 'accepted-help' }), original);
  const next = run('request', request('helper-two', {
    from: 'builder', to: 'reviewer', capability: 'review', parentTaskId: 'a', parentClaimToken: current.claimToken,
  }));
  assert.equal(next.status, 'accepted');
  assert.equal(instance.getTask('helper-two').parentClaimToken, current.claimToken);
  assert.deepEqual(AgentCollaboration.fromState(JSON.parse(JSON.stringify(instance.exportState()))).snapshot(), instance.snapshot());
});

test('planner authority is explicit immutable registry policy, independent from technical capabilities', () => {
  const agents = registry();
  agents[0].capabilities.push('code');
  const instance = new AgentCollaboration({ agents });
  agents[1].role = 'planner';
  const run = runner(instance);
  assert.equal(run('request', request('objective', { from: 'director' })).status, 'accepted');
  assert.throws(() => run('request', request('forged-root', {
    from: 'builder', to: 'reviewer', capability: 'review',
  })), error('ROOT_REQUEST_REQUIRES_PLANNER'));
  assert.equal(instance.snapshot().agents.find(item => item.id === 'builder').role, 'executor');
  assert.throws(() => run('availability', { agentId: 'builder', available: true, role: 'planner' }), error('INVALID_INPUT'));
  const missingRole = registry(); delete missingRole[0].role;
  assert.throws(() => new AgentCollaboration({ agents: missingRole }), error('INVALID_INPUT'));
  const invalidRole = registry(); invalidRole[0].role = 'admin';
  assert.throws(() => new AgentCollaboration({ agents: invalidRole }), error('INVALID_ROLE'));
});

test('root requests reject unrelated claim tokens and the stricter state format rejects old snapshots', () => {
  const instance = lab();
  const run = runner(instance);
  assert.throws(() => run('request', request('root', { parentClaimToken: 'another-task:r2' })), error('UNEXPECTED_PARENT_CLAIM'));
  const state = JSON.parse(JSON.stringify(instance.exportState()));
  assert.equal(state.schemaVersion, 2);
  state.schemaVersion = 1;
  assert.throws(() => AgentCollaboration.fromState(state), error('UNSUPPORTED_STATE_VERSION'));
});
