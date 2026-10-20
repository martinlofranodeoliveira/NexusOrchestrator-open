const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildCanonicalLaneId,
  buildLaneEvent,
  buildRecoveryRecipe,
  isTransientProviderFailureDetail,
  resolveEffectiveLaneDisposition,
  evaluateLaneRecordIdentity,
  evaluateLaneCloseOutcome,
  normalizeLaneEventRecord,
  shouldPreserveLaneRecord,
  validateTaskPacket,
} = require('../services/laneRuntime');

test('buildLaneEvent emits canonical prompt misdelivery events for retry lanes', () => {
  const event = buildLaneEvent({
    seq: 7,
    state: 'retry_scheduled',
    detail: 'Falha de parsing de shell detectada.',
    emittedAt: '2026-04-05T12:00:00.000Z',
    failureClass: 'shell',
    data: {
      taskId: 'NX-MANUAL-0001',
      retryCount: 1,
    },
  });

  assert.equal(event.seq, 7);
  assert.equal(event.event, 'lane.prompt_misdelivery');
  assert.equal(event.status, 'blocked');
  assert.equal(event.state, 'retry_scheduled');
  assert.equal(event.failureClass, 'tool_runtime');
  assert.deepEqual(event.data, {
    taskId: 'NX-MANUAL-0001',
    retryCount: 1,
  });
});

test('buildLaneEvent respects explicit integration milestone overrides', () => {
  const event = buildLaneEvent({
    seq: 8,
    state: 'integrating',
    event: 'lane.reconciled',
    status: 'reconciled',
    detail: 'Mudanças reconciliadas no repositório principal.',
    emittedAt: '2026-04-05T12:05:00.000Z',
    data: {
      taskId: 'NX-TASK-0008',
      commitSha: 'abc1234',
    },
  });

  assert.equal(event.event, 'lane.reconciled');
  assert.equal(event.status, 'reconciled');
  assert.equal(event.state, 'integrating');
  assert.deepEqual(event.data, {
    taskId: 'NX-TASK-0008',
    commitSha: 'abc1234',
  });
});

test('normalizeLaneEventRecord upgrades legacy event payloads', () => {
  const normalized = normalizeLaneEventRecord({
    seq: 2,
    state: 'completed',
    detail: 'Entrega aplicada.',
    at: '2026-04-05T12:00:00.000Z',
  });

  assert.equal(normalized.event, 'lane.finished');
  assert.equal(normalized.status, 'completed');
  assert.equal(normalized.emittedAt, '2026-04-05T12:00:00.000Z');
  assert.equal(normalized.at, '2026-04-05T12:00:00.000Z');
});

test('shouldPreserveLaneRecord keeps the same lane across retries of the same task', () => {
  assert.equal(
    shouldPreserveLaneRecord(
      {
        taskId: 'GH-7',
        requestKind: 'primary',
        requestId: 'dev:GH-7:primary',
      },
      {
        taskId: 'GH-7',
        requestKind: 'primary',
        requestId: 'dev:GH-7:continue:123',
      },
    ),
    true,
  );
});

test('shouldPreserveLaneRecord rotates lane state when the agent changes task', () => {
  assert.equal(
    shouldPreserveLaneRecord(
      {
        taskId: 'GH-18',
        requestKind: 'primary',
        requestId: 'architect:GH-18:primary',
      },
      {
        taskId: 'GH-5',
        requestKind: 'primary',
        requestId: 'architect:GH-5:primary',
      },
    ),
    false,
  );
});

test('evaluateLaneRecordIdentity preserves runtime state only for the same canonical lane', () => {
  const identity = evaluateLaneRecordIdentity({
    previous: {
      laneId: 'dev:dev:GH-7:primary',
      taskId: 'GH-7',
      requestId: 'dev:GH-7:primary',
      requestKind: 'primary',
    },
    agentId: 'dev',
    taskId: 'GH-7',
    requestId: 'dev:GH-7:primary',
    requestKind: 'primary',
  });

  assert.equal(identity.canonicalLaneId, 'dev:dev:GH-7:primary');
  assert.equal(identity.canReuseRuntimeState, true);
});

test('evaluateLaneRecordIdentity rotates lane state when the task changes', () => {
  const identity = evaluateLaneRecordIdentity({
    previous: {
      laneId: 'architect:architect:GH-18:primary',
      taskId: 'GH-18',
      requestId: 'architect:GH-18:primary',
      requestKind: 'primary',
    },
    agentId: 'architect',
    taskId: 'GH-5',
    requestId: 'architect:GH-5:primary',
    requestKind: 'primary',
  });

  assert.equal(identity.canonicalLaneId, 'architect:architect:GH-5:primary');
  assert.equal(identity.canReuseRuntimeState, false);
});

test('evaluateLaneRecordIdentity repairs stale lane ids from an older task', () => {
  const identity = evaluateLaneRecordIdentity({
    previous: {
      laneId: 'pm:pm:GH-7:primary',
      taskId: 'GH-8',
      requestId: 'pm:GH-8:primary',
      requestKind: 'primary',
    },
    agentId: 'pm',
    taskId: 'GH-8',
    requestId: 'pm:GH-8:primary',
    requestKind: 'primary',
  });

  assert.equal(identity.canonicalLaneId, 'pm:pm:GH-8:primary');
  assert.equal(identity.canReuseRuntimeState, false);
});

test('buildCanonicalLaneId falls back to task id when no request id exists', () => {
  assert.equal(buildCanonicalLaneId('devops', null, 'GH-6'), 'devops:GH-6');
});

test('buildRecoveryRecipe maps infra failures to provider recovery', () => {
  const recipe = buildRecoveryRecipe('provider', 'Gateway timeout', {
    transientRetryLimit: 4,
  });

  assert.equal(recipe.scenario, 'provider_failure');
  assert.equal(recipe.failureClass, 'infra');
  assert.equal(recipe.maxAttempts, 4);
  assert.deepEqual(recipe.steps, ['restart_worker', 'requeue_front']);
});

test('isTransientProviderFailureDetail detects provider timeout signatures', () => {
  assert.equal(
    isTransientProviderFailureDetail(
      'Timeout ao aguardar resposta do provider após 90000ms.',
    ),
    true,
  );
  assert.equal(
    isTransientProviderFailureDetail('provider_timeout: upstream request timed out'),
    true,
  );
});

test('evaluateLaneCloseOutcome schedules transient retries when policy budget exists', () => {
  const evaluation = evaluateLaneCloseOutcome({
    completionDetected: false,
    stoppedBySystem: false,
    exitCode: 1,
    transientFailureDetected: true,
    retryCount: 1,
    transientRetryLimit: 3,
    transientRetryDelayMs: 8000,
    transientRetryMaxDelayMs: 30000,
    commandRecoveryLimit: 2,
    canContinue: true,
  });

  assert.equal(evaluation.disposition, 'retry_transient');
  assert.equal(evaluation.shouldRetryTransientFailure, true);
  assert.equal(evaluation.preserveWorkspace, true);
  assert.equal(evaluation.transientRecovery.attempt, 2);
  assert.equal(evaluation.transientRecovery.delayMs, 16000);
  assert.equal(evaluation.transientRecovery.recipe.scenario, 'provider_failure');
});

test('evaluateLaneCloseOutcome treats repeated empty model responses as transient provider failures', () => {
  const evaluation = evaluateLaneCloseOutcome({
    completionDetected: false,
    stoppedBySystem: false,
    exitCode: 1,
    transientFailureDetected: false,
    lastErrorOutput:
      'Falha transitória do provider azure_openai/gpt-5.4: resposta vazia repetida sem texto nem tool calls.',
    retryCount: 0,
    transientRetryLimit: 2,
    transientRetryDelayMs: 5000,
    transientRetryMaxDelayMs: 15000,
    commandRecoveryLimit: 2,
    canContinue: true,
  });

  assert.equal(evaluation.disposition, 'retry_transient');
  assert.equal(evaluation.shouldRetryTransientFailure, true);
  assert.equal(evaluation.transientRecovery.attempt, 1);
  assert.equal(evaluation.transientRecovery.recipe.scenario, 'provider_failure');
});

test('evaluateLaneCloseOutcome rejects completion after unrecovered shell failure', () => {
  const evaluation = evaluateLaneCloseOutcome({
    completionDetected: true,
    stoppedBySystem: false,
    exitCode: 0,
    commandParsingFailureDetected: true,
    lastNormalOutputAt: 1000,
    lastCommandParsingFailureAt: 2000,
    commandRecoveryForced: true,
    commandRecoveryCount: 2,
    commandRecoveryLimit: 2,
    loopContinuationDelayMs: 1500,
    canContinue: true,
  });

  assert.equal(evaluation.disposition, 'reject_completion');
  assert.equal(evaluation.shouldRetryCommandRecovery, false);
  assert.equal(evaluation.shouldRejectCompletionForCommandFailure, true);
});

test('evaluateLaneCloseOutcome continues a verified lane after hitting the autonomous iteration limit', () => {
  const evaluation = evaluateLaneCloseOutcome({
    completionDetected: false,
    stoppedBySystem: false,
    exitCode: 1,
    lastErrorOutput: 'Error: Loop autônomo excedeu o limite de 24 iterações.',
    canContinue: true,
    successfulVerificationCount: 2,
    failedVerificationCount: 0,
  });

  assert.equal(evaluation.disposition, 'continue_incomplete');
  assert.equal(evaluation.shouldContinueIncompleteRun, true);
  assert.equal(evaluation.iterationLimitExceeded, true);
  assert.equal(evaluation.preserveWorkspace, true);
});

test('evaluateLaneCloseOutcome does not auto-continue iteration-limit failures with broken checks', () => {
  const evaluation = evaluateLaneCloseOutcome({
    completionDetected: false,
    stoppedBySystem: false,
    exitCode: 1,
    lastErrorOutput: 'Error: Loop autônomo excedeu o limite de 24 iterações.',
    canContinue: true,
    successfulVerificationCount: 1,
    failedVerificationCount: 1,
  });

  assert.equal(evaluation.iterationLimitExceeded, true);
  assert.equal(evaluation.shouldContinueIncompleteRun, false);
  assert.equal(evaluation.disposition, 'terminal');
});

test('evaluateLaneCloseOutcome accepts clean review completion without requiring integrated changes', () => {
  const evaluation = evaluateLaneCloseOutcome({
    completionDetected: true,
    stoppedBySystem: false,
    exitCode: 0,
    canContinue: true,
    currentPrimaryTask: true,
    isReviewStage: true,
    successfulVerificationCount: 1,
    integrationResult: {
      integrated: false,
      reason: 'clean',
    },
  });

  assert.equal(evaluation.disposition, 'complete');
  assert.equal(evaluation.completionDisposition, 'accepted');
  assert.equal(evaluation.completionRequiresIntegratedChanges, false);
  assert.equal(evaluation.completionHadNoIntegratedChanges, false);
});

test('evaluateLaneCloseOutcome requeues review completion when no material verification succeeded', () => {
  const evaluation = evaluateLaneCloseOutcome({
    completionDetected: true,
    stoppedBySystem: false,
    exitCode: 0,
    canContinue: true,
    currentPrimaryTask: true,
    isReviewStage: true,
    successfulVerificationCount: 0,
    integrationResult: {
      integrated: false,
      reason: 'clean',
    },
  });

  assert.equal(evaluation.disposition, 'review_missing_evidence');
  assert.equal(evaluation.completionDisposition, 'rejected_review_missing_evidence');
  assert.equal(evaluation.shouldRejectReviewForMissingEvidence, true);
});

test('evaluateLaneCloseOutcome returns an explicit review rejection disposition', () => {
  const evaluation = evaluateLaneCloseOutcome({
    completionDetected: false,
    reviewRejected: true,
    stoppedBySystem: false,
    exitCode: 0,
    canContinue: true,
    currentPrimaryTask: true,
    isReviewStage: true,
    failedVerificationCount: 1,
    integrationResult: null,
  });

  assert.equal(evaluation.disposition, 'review_rejected');
  assert.equal(evaluation.completionDisposition, 'rejected_review');
  assert.equal(evaluation.shouldRejectReview, true);
});

test('evaluateLaneCloseOutcome keeps review in review when rejection has no material evidence', () => {
  const evaluation = evaluateLaneCloseOutcome({
    completionDetected: false,
    reviewRejected: true,
    stoppedBySystem: false,
    exitCode: 0,
    canContinue: true,
    currentPrimaryTask: true,
    isReviewStage: true,
    successfulVerificationCount: 0,
    failedVerificationCount: 0,
    integrationResult: null,
  });

  assert.equal(evaluation.disposition, 'review_missing_evidence');
  assert.equal(evaluation.completionDisposition, 'rejected_review_missing_evidence');
  assert.equal(evaluation.shouldRejectReview, false);
  assert.equal(evaluation.shouldRejectReviewForMissingEvidence, true);
});

test('resolveEffectiveLaneDisposition short-circuits stale review requeue after accepted completion', () => {
  assert.equal(
    resolveEffectiveLaneDisposition({
      disposition: 'review_missing_evidence',
      completionDisposition: 'accepted',
      completionOutcomeHandled: true,
    }),
    'complete',
  );
});

test('resolveEffectiveLaneDisposition preserves original disposition before completion settles', () => {
  assert.equal(
    resolveEffectiveLaneDisposition({
      disposition: 'review_missing_evidence',
      completionDisposition: 'accepted',
      completionOutcomeHandled: false,
    }),
    'review_missing_evidence',
  );
});

test('validateTaskPacket reports missing fields and empty acceptance tests', () => {
  const errors = validateTaskPacket({
    objective: '',
    scope: 'Implementar algo',
    repo: '',
    acceptanceTests: ['ok', ''],
    branchPolicy: '',
    commitPolicy: 'commit',
    reportingContract: '',
    escalationPolicy: '',
  });

  assert.deepEqual(errors, [
    'objective must not be empty',
    'repo must not be empty',
    'branchPolicy must not be empty',
    'reportingContract must not be empty',
    'escalationPolicy must not be empty',
    'acceptanceTests contains an empty value at index 1',
  ]);
});
