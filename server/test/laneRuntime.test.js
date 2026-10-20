const test = require('node:test');
const assert = require('node:assert/strict');

const { buildLaneEvent, evaluateRunCloseout } = require('../services/laneRuntime');

test('buildLaneEvent emits canonical failed event payload', () => {
  const event = buildLaneEvent({
    seq: 7,
    state: 'failed',
    detail: 'Provider unavailable',
    failureClass: 'provider',
    emittedAt: '2026-04-05T12:00:00.000Z',
    data: {
      taskId: 'NX-TASK-0001',
      requestKind: 'primary',
    },
  });

  assert.equal(event.seq, 7);
  assert.equal(event.event, 'lane.failed');
  assert.equal(event.status, 'failed');
  assert.equal(event.state, 'failed');
  assert.equal(event.emittedAt, '2026-04-05T12:00:00.000Z');
  assert.equal(event.at, '2026-04-05T12:00:00.000Z');
  assert.equal(event.failureClass, 'infra');
  assert.deepEqual(event.data, {
    taskId: 'NX-TASK-0001',
    requestKind: 'primary',
  });
});

test('buildLaneEvent uses prompt misdelivery event for prompt recovery lanes', () => {
  const event = buildLaneEvent({
    seq: 3,
    state: 'retry_scheduled',
    detail: 'Prompt entregue ao agente errado',
    failureClass: 'prompt_delivery',
    emittedAt: '2026-04-05T12:00:01.000Z',
  });

  assert.equal(event.event, 'lane.prompt_misdelivery');
  assert.equal(event.status, 'blocked');
  assert.equal(event.failureClass, 'prompt_delivery');
});

test('evaluateRunCloseout accepts completion when integration succeeded', () => {
  const result = evaluateRunCloseout({
    completionDetected: true,
    stoppedBySystem: false,
    exitCode: 0,
    retryCount: 0,
    transientRetryLimit: 3,
    commandRecoveryCount: 0,
    commandRecoveryLimit: 2,
    transientFailureDetected: false,
    commandParsingFailureDetected: false,
    commandRecoveryForced: false,
    canContinue: true,
    currentPrimaryTask: true,
    isReviewStage: false,
    integrationResult: {
      integrated: true,
      commitSha: 'abc1234',
    },
  });

  assert.equal(result.shouldRetryTransientFailure, false);
  assert.equal(result.shouldRetryCommandRecovery, false);
  assert.equal(result.completionHadNoIntegratedChanges, false);
  assert.equal(result.completionHadBlockingIntegrationFailure, false);
  assert.equal(result.completionDisposition, 'accepted');
});

test('evaluateRunCloseout rejects completion without integrated changes', () => {
  const result = evaluateRunCloseout({
    completionDetected: true,
    stoppedBySystem: false,
    exitCode: 0,
    retryCount: 0,
    transientRetryLimit: 3,
    commandRecoveryCount: 0,
    commandRecoveryLimit: 2,
    transientFailureDetected: false,
    commandParsingFailureDetected: false,
    commandRecoveryForced: false,
    canContinue: true,
    currentPrimaryTask: true,
    isReviewStage: false,
    integrationResult: {
      integrated: false,
      reason: 'clean',
    },
  });

  assert.equal(result.completionHadNoIntegratedChanges, true);
  assert.equal(result.completionHadBlockingIntegrationFailure, false);
  assert.equal(result.completionDisposition, 'rejected_no_integrated_changes');
});

test('evaluateRunCloseout schedules shell recovery before rejecting completion', () => {
  const result = evaluateRunCloseout({
    completionDetected: false,
    stoppedBySystem: false,
    exitCode: 1,
    retryCount: 0,
    transientRetryLimit: 3,
    commandRecoveryCount: 0,
    commandRecoveryLimit: 2,
    transientFailureDetected: false,
    commandParsingFailureDetected: true,
    commandRecoveryForced: false,
    lastNormalOutputAt: 0,
    lastCommandParsingFailureAt: 100,
    canContinue: true,
    currentPrimaryTask: true,
    isReviewStage: false,
    integrationResult: null,
  });

  assert.equal(result.commandFailureUnrecovered, true);
  assert.equal(result.hasBlockingCommandFailure, true);
  assert.equal(result.shouldRetryCommandRecovery, true);
  assert.equal(result.shouldRejectCompletionForCommandFailure, false);
});
