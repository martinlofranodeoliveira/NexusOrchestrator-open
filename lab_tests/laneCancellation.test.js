const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { evaluateLaneCloseOutcome, resolveEffectiveLaneDisposition } = require('../server/services/laneRuntime');

for (const [name, signals] of Object.entries({
  completion: { completionDetected: true },
  reviewRejection: { reviewRejected: true, currentPrimaryTask: true, isReviewStage: true, successfulVerificationCount: 1 },
  missingReviewEvidence: { completionDetected: true, currentPrimaryTask: true, isReviewStage: true },
  shellRecovery: { commandParsingFailureDetected: true, commandRecoveryForced: true },
  providerRecovery: { transientFailureDetected: true, lastErrorOutput: '503 service unavailable' },
  incomplete: {},
})) {
  test(`system stop takes precedence over ${name}`, () => {
    const result = evaluateLaneCloseOutcome({
      ...signals, stoppedBySystem: true, exitCode: 1, canContinue: true,
      transientRetryLimit: 3, commandRecoveryLimit: 3,
      integrationResult: { integrated: true },
    });
    assert.equal(result.disposition, 'cancelled');
    assert.equal(result.completionDisposition, 'cancelled');
    for (const key of ['shouldRetryTransientFailure', 'shouldRetryCommandRecovery',
      'shouldRejectCompletionForCommandFailure', 'shouldContinueIncompleteRun',
      'shouldRejectReview', 'shouldRejectReviewForMissingEvidence', 'preserveWorkspace']) {
      assert.equal(result[key], false, key);
    }
    assert.equal(result.transientRecovery, null);
    assert.equal(result.commandRecovery, null);
  });
}

// Execute the production close listener itself without importing the server,
// loading .env, opening a port, preparing a workspace or contacting a provider.
const source = fs.readFileSync(path.join(__dirname, '../server/index.js'), 'utf8');
const marker = "  runnerProcess.on('close', async (code) => {";
const start = source.indexOf(marker);
const end = source.indexOf("\n  });\n}\n\n// Rota para iniciar um loop", start);
assert.notEqual(start, -1);
assert.notEqual(end, -1);
const listener = source.slice(start + "  runnerProcess.on('close', ".length, end) + "\n}";

function closeHarness({ signals = {}, successor = false, queuedSuccessor = false, cleanupFails = false, canContinue = true } = {}) {
  const effects = [];
  const oldRun = { stoppedBySystem: true, retryCount: 0, commandRecoveryCount: 0,
    runtimeCandidate: { provider: 'local', model: 'offline' }, currentFallbackDepth: 0,
    successfulVerificationCommands: [], failedVerificationCommands: [], hookContext: {} };
  const nextRun = { taskId: 'next-task' };
  const active = new Map([['builder', successor ? nextRun : oldRun]]);
  const lanes = new Map([['builder', { taskId: successor ? 'next-task' : 'task', state: successor ? 'running' : 'cancelled' }]]);
  const forbidden = name => () => { throw new Error(`unexpected side effect: ${name}`); };
  const context = {
    runContext: oldRun, id: 'builder', effectiveTaskId: 'task', effectiveTaskTitle: 'Synthetic task',
    requestKind: 'primary', runRequest: { taskId: 'task', taskStatus: 'in_progress' },
    resolvedTaskStatus: 'in_progress', trackedPrimaryTask: null,
    githubTasks: [{ id: 'task', assignee: 'builder', status: 'in_progress' }],
    activeAgentRuns: active, agentLaneRuntime: lanes,
    projectContext: {}, workspaceInfo: {}, projectDir: '/synthetic',
    completionDetected: false, reviewRejected: false, adminPendingDetected: false, ...signals,
    skillIds: [], baseModel: 'offline', chosenModel: 'offline',
    autonomousLlm: { provider: 'local' }, reasoningEffort: null,
    TRANSIENT_MODEL_RETRY_LIMIT: 3, TRANSIENT_MODEL_RETRY_DELAY_MS: 1,
    TRANSIENT_MODEL_RETRY_MAX_DELAY_MS: 3, COMMAND_PARSING_RECOVERY_LIMIT: 3,
    LOOP_CONTINUATION_DELAY_MS: 1,
    console: { log() {} }, io: { emit: (...args) => effects.push(['emit', ...args]) },
    isInternalTaskId: () => false, isReviewTaskTitle: () => false,
    isTransientModelFailure: () => false, canContinueTask: () => canContinue,
    evaluateRunCloseout: evaluateLaneCloseOutcome, resolveEffectiveLaneDisposition,
    truncateText: (text, size) => String(text).slice(0, size),
    recordPrimaryTaskFailure: forbidden('review failure'),
    touchPrimaryTaskRuntimeMeta: () => effects.push(['runtime-meta']),
    formatRuntimeCandidate: () => 'local/offline',
    runHookPipeline: async (name, payload) => { effects.push(['hook', name, payload]); return {}; },
    emitHookDiagnostics: () => {},
    setAgentLaneState: (_id, _run, state) => { effects.push(['lane', state]); lanes.set('builder', { taskId: 'task', state }); },
    startNextQueuedRalphRun: () => { effects.push(['start-next']); if (queuedSuccessor) { active.set('builder', nextRun); lanes.set('builder', { taskId: 'next-task', state: 'running' }); } },
    isAgentOccupied: () => active.has('builder'),
    syncAgentAutonomousStatus: () => false,
    updateAgent: (_id, status) => effects.push(['agent', status]),
    getQueuedRuns: () => [],
    cleanupTaskWorkspace: async () => { effects.push(['cleanup']); if (cleanupFails) throw new Error('synthetic cleanup failure'); },
    scheduleAutonomousDispatch: forbidden('dispatch'), queueRalphRun: forbidden('queue'),
    releasePrimaryTaskToPool: forbidden('admin/review mutation'),
    integrateTaskWorkspaceChanges: forbidden('integration'),
    updateInternalTask: forbidden('internal task completion'),
    handoffPrimaryTaskToReview: forbidden('handoff'),
    ensureTaskContractFiles: forbidden('task contract mutation'),
    setTimeout: forbidden('retry timer'),
  };
  return { active, lanes, oldRun, nextRun, effects,
    close: vm.runInNewContext(`(${listener})`, context) };
}

for (const [name, signals] of Object.entries({
  completion: { completionDetected: true },
  admin: { adminPendingDetected: true },
  review: { reviewRejected: true },
  combined: { completionDetected: true, reviewRejected: true, adminPendingDetected: true },
})) {
  test(`production close listener discards stopped ${name} before task side effects`, async () => {
    const h = closeHarness({ signals, canContinue: name !== 'combined' });
    await h.close(null);
    assert.equal(h.active.has('builder'), false);
    assert.equal(h.oldRun.closing, false);
    assert.equal(h.lanes.get('builder').state, 'cancelled');
    assert.equal(h.effects.filter(item => item[0] === 'cleanup').length, 1);
    assert.equal(h.effects.filter(item => item[0] === 'start-next').length, 1);
    const hook = h.effects.find(item => item[0] === 'hook');
    assert.equal(hook[1], 'afterLaneClose');
    assert.equal(hook[2].disposition, 'cancelled');
    assert.equal(hook[2].completionDisposition, 'cancelled');
    assert.equal(hook[2].outcome, 'cancelled');
  });
}

test('a late stopped close listener cannot release or overwrite a successor', async () => {
  const h = closeHarness({ signals: { completionDetected: true }, successor: true });
  await h.close(null);
  assert.equal(h.active.get('builder'), h.nextRun);
  assert.equal(h.lanes.get('builder').taskId, 'next-task');
  assert.equal(h.lanes.get('builder').state, 'running');
  assert.equal(h.effects.some(item => ['lane', 'agent', 'start-next'].includes(item[0])), false);
});

test('a queued successor retains its active reservation and lane after cancelled cleanup', async () => {
  const h = closeHarness({ signals: { completionDetected: true }, queuedSuccessor: true });
  await h.close(null);
  assert.equal(h.active.get('builder'), h.nextRun);
  assert.equal(h.lanes.get('builder').taskId, 'next-task');
  assert.equal(h.effects.some(item => item[0] === 'agent'), false);
});

test('cancelled cleanup failure still releases ownership and finalizes cancellation', async () => {
  const h = closeHarness({ signals: { completionDetected: true }, cleanupFails: true });
  await h.close(null);
  assert.equal(h.active.has('builder'), false);
  assert.equal(h.lanes.get('builder').state, 'cancelled');
  assert.equal(h.effects.filter(item => item[0] === 'hook').length, 1);
});
