const CANONICAL_EVENT_METADATA_BY_NAME = {
  'lane.ready': { state: 'queued', status: 'ready' },
  'lane.started': { state: 'preparing_workspace', status: 'running' },
  'lane.prompt_misdelivery': { state: 'retry_scheduled', status: 'blocked' },
  'lane.blocked': { state: 'retry_scheduled', status: 'blocked' },
  'lane.red': { state: 'retry_scheduled', status: 'red' },
  'lane.green': { state: 'running', status: 'green' },
  'lane.commit.created': { state: 'integrating', status: 'green' },
  'lane.pr.opened': { state: 'integrating', status: 'green' },
  'lane.merge.ready': { state: 'integrating', status: 'green' },
  'lane.finished': { state: 'completed', status: 'completed' },
  'lane.failed': { state: 'failed', status: 'failed' },
  'lane.reconciled': { state: 'integrating', status: 'reconciled' },
  'lane.merged': { state: 'completed', status: 'merged' },
  'lane.superseded': { state: 'cancelled', status: 'superseded' },
  'lane.closed': { state: 'cancelled', status: 'closed' },
  'branch.stale_against_main': { state: 'retry_scheduled', status: 'blocked' },
};

const CANONICAL_LANE_EVENT_BY_STATE = {
  queued: { event: 'lane.ready', status: 'ready' },
  preparing_workspace: { event: 'lane.started', status: 'running' },
  running: { event: 'lane.green', status: 'green' },
  integrating: { event: 'lane.merge.ready', status: 'green' },
  retry_scheduled: { event: 'lane.blocked', status: 'blocked' },
  completed: { event: 'lane.finished', status: 'completed' },
  failed: { event: 'lane.failed', status: 'failed' },
  cancelled: { event: 'lane.closed', status: 'closed' },
};

const CANONICAL_STATE_BY_EVENT = Object.entries(CANONICAL_EVENT_METADATA_BY_NAME).reduce(
  (acc, [eventName, metadata]) => ({
    ...acc,
    [eventName]: metadata.state,
  }),
  {},
);

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

function isAutonomousIterationLimitDetail(detail = '') {
  const normalized = String(detail || '').toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes('loop autonomo excedeu o limite') ||
    normalized.includes('loop autônomo excedeu o limite')
  );
}

function buildCanonicalLaneId(agentId, requestId, taskId, fallback = 'lane') {
  const normalizedAgentId = normalizeText(agentId) || 'agent';
  const normalizedRequestId = normalizeText(requestId);
  const normalizedTaskId = normalizeText(taskId);
  const normalizedFallback = normalizeText(fallback) || 'lane';

  return `${normalizedAgentId}:${normalizedRequestId || normalizedTaskId || normalizedFallback}`;
}

function evaluateLaneRecordIdentity({ previous = null, agentId, requestId, taskId, requestKind }) {
  const canonicalLaneId = buildCanonicalLaneId(agentId, requestId, taskId);
  const normalizedTaskId = normalizeText(taskId);
  const normalizedRequestId = normalizeText(requestId);
  const normalizedRequestKind = normalizeText(requestKind) || 'primary';
  const previousTaskId = normalizeText(previous?.taskId);
  const previousRequestId = normalizeText(previous?.requestId);
  const previousRequestKind = normalizeText(previous?.requestKind) || 'primary';
  const previousLaneId = normalizeText(previous?.laneId);
  const sameTask = Boolean(previous && previousTaskId && previousTaskId === normalizedTaskId);
  const sameRequestKind = Boolean(previous && previousRequestKind === normalizedRequestKind);
  const sameRequestIdentity = Boolean(
    !normalizedRequestId || !previous || !previousRequestId || previousRequestId === normalizedRequestId,
  );
  const laneIdMatchesCanonical = Boolean(previousLaneId && previousLaneId === canonicalLaneId);
  const canReuseRuntimeState = Boolean(
    previous &&
      sameTask &&
      sameRequestKind &&
      sameRequestIdentity &&
      laneIdMatchesCanonical,
  );

  return {
    canonicalLaneId,
    canReuseRuntimeState,
  };
}

function sanitizeStructuredData(data) {
  if (data === undefined || data === null) {
    return null;
  }

  if (Array.isArray(data)) {
    try {
      return JSON.parse(JSON.stringify(data));
    } catch (error) {
      return null;
    }
  }

  if (typeof data !== 'object') {
    return null;
  }

  try {
    return JSON.parse(JSON.stringify(data));
  } catch (error) {
    return null;
  }
}

function normalizeFailureClass(failureClass, detail = '') {
  const normalized = String(failureClass || '').trim().toLowerCase();
  const detailText = String(detail || '').toLowerCase();

  if (normalized === 'shell' || normalized === 'command') return 'tool_runtime';
  if (normalized === 'provider') return 'infra';
  if (normalized === 'workspace') return 'infra';
  if (normalized === 'integration') return 'branch_divergence';
  if (normalized === 'compile' || detailText.includes('build') || detailText.includes('compile')) {
    return 'compile';
  }
  if (normalized === 'test' || detailText.includes('test')) {
    return 'test';
  }
  if (
    normalized === 'prompt_delivery' ||
    detailText.includes('prompt misdelivery') ||
    detailText.includes('parsing de shell')
  ) {
    return 'prompt_delivery';
  }

  return normalized || 'tool_runtime';
}

function isTransientProviderFailureDetail(detail = '') {
  const normalized = String(detail || '').trim().toLowerCase();
  if (!normalized) return false;

  return [
    'status 429',
    'status 503',
    '"status":"unavailable"',
    'service unavailable',
    'resource exhausted',
    'rate limit',
    'high demand',
    'temporarily unavailable',
    'retrying with backoff',
    'provider_timeout',
    'timed out',
    'timeout ao aguardar resposta do provider',
    'retornou vazio',
    'resposta veio vazia',
    'resposta vazia repetida',
    'sem texto nem tool calls',
    'nao trouxe texto nem tool calls',
    'não trouxe texto nem tool calls',
    'returned empty response',
    'empty response',
  ].some((pattern) => normalized.includes(pattern));
}

function buildRecoveryRecipe(failureClass, detail = '', context = {}) {
  const normalizedClass = normalizeFailureClass(failureClass, detail);

  switch (normalizedClass) {
    case 'trust_gate':
      return {
        scenario: 'trust_prompt_unresolved',
        failureClass: normalizedClass,
        maxAttempts: 1,
        escalationPolicy: 'alert_human',
        steps: ['accept_trust_prompt'],
      };
    case 'infra':
      return {
        scenario: 'provider_failure',
        failureClass: normalizedClass,
        maxAttempts: Math.max(1, Number(context.transientRetryLimit || 3)),
        escalationPolicy: 'alert_human',
        steps:
          String(failureClass || '').trim().toLowerCase() === 'workspace'
            ? ['cleanup_workspace', 'recreate_workspace', 'restart_worker']
            : ['restart_worker', 'requeue_front'],
      };
    case 'branch_divergence':
      return {
        scenario: 'stale_branch',
        failureClass: normalizedClass,
        maxAttempts: 1,
        escalationPolicy: 'alert_human',
        steps: ['reconcile_worktree', 'rerun_checks', 'reintegrate_changes'],
      };
    case 'compile':
      return {
        scenario: 'compile_red_cross_crate',
        failureClass: normalizedClass,
        maxAttempts: 1,
        escalationPolicy: 'alert_human',
        steps: ['rebuild_changed_scope', 'fix_compile_errors', 'rerun_checks'],
      };
    case 'test':
      return {
        scenario: 'compile_red_cross_crate',
        failureClass: normalizedClass,
        maxAttempts: 1,
        escalationPolicy: 'alert_human',
        steps: ['reproduce_failure', 'fix_regression', 'rerun_checks'],
      };
    case 'mcp_handshake':
      return {
        scenario: 'mcp_handshake_failure',
        failureClass: normalizedClass,
        maxAttempts: 1,
        escalationPolicy: 'abort',
        steps: ['retry_mcp_handshake'],
      };
    case 'plugin_startup':
      return {
        scenario: 'partial_plugin_startup',
        failureClass: normalizedClass,
        maxAttempts: 1,
        escalationPolicy: 'log_and_continue',
        steps: ['restart_plugin', 'retry_mcp_handshake'],
      };
    case 'prompt_delivery':
    case 'tool_runtime':
    default:
      return {
        scenario: 'prompt_misdelivery',
        failureClass: normalizedClass,
        maxAttempts: Math.max(1, Number(context.commandRecoveryLimit || 2)),
        escalationPolicy: 'alert_human',
        steps:
          normalizedClass === 'prompt_delivery'
            ? ['redirect_prompt', 'replay_prompt', 'requeue_front']
            : ['inject_shell_recovery_hint', 'requeue_front'],
      };
  }
}

function resolveCanonicalLaneEvent(state, failureClass, explicitEventName = null) {
  const normalizedState = String(state || '').trim();
  const normalizedFailure = normalizeFailureClass(failureClass);
  const normalizedEventName = normalizeText(explicitEventName);

  if (normalizedEventName) {
    const eventMetadata = CANONICAL_EVENT_METADATA_BY_NAME[normalizedEventName] || null;
    return {
      event: normalizedEventName,
      status:
        eventMetadata?.status ||
        CANONICAL_LANE_EVENT_BY_STATE[normalizedState]?.status ||
        'running',
      state:
        normalizedState ||
        eventMetadata?.state ||
        CANONICAL_STATE_BY_EVENT[normalizedEventName] ||
        'retry_scheduled',
    };
  }

  if (normalizedState === 'retry_scheduled') {
    if (normalizedFailure === 'branch_divergence') {
      return {
        event: 'branch.stale_against_main',
        status: 'blocked',
        state: 'retry_scheduled',
      };
    }

    if (['prompt_delivery', 'tool_runtime'].includes(normalizedFailure)) {
      return {
        event: 'lane.prompt_misdelivery',
        status: 'blocked',
        state: 'retry_scheduled',
      };
    }
  }

  const metadata = CANONICAL_LANE_EVENT_BY_STATE[normalizedState] || {
    event: 'lane.blocked',
    status: 'blocked',
  };

  return {
    ...metadata,
    state: normalizedState || CANONICAL_STATE_BY_EVENT[metadata.event] || 'retry_scheduled',
  };
}

function buildLaneEvent({
  seq,
  state,
  event,
  status,
  detail,
  emittedAt,
  at,
  failureClass,
  data,
}) {
  const stateValue = String(state || '').trim();
  const emittedAtValue = String(emittedAt || at || '').trim() || new Date().toISOString();
  const normalizedFailureClass =
    failureClass !== undefined && failureClass !== null
      ? normalizeFailureClass(failureClass, detail)
      : null;
  const metadata = resolveCanonicalLaneEvent(stateValue, normalizedFailureClass, event);
  const structuredData = sanitizeStructuredData(data) || {};

  return {
    seq: Number.isFinite(Number(seq)) ? Math.trunc(Number(seq)) : 0,
    event: metadata.event,
    status: normalizeText(status) || metadata.status,
    state: metadata.state,
    detail: normalizeText(detail),
    emittedAt: emittedAtValue,
    at: emittedAtValue,
    failureClass: normalizedFailureClass,
    data: structuredData,
  };
}

function normalizeLaneEventRecord(event) {
  if (!event || typeof event !== 'object') return null;

  const seq = Number(event.seq);
  const emittedAt = String(event.emittedAt || event.at || '').trim();
  const detail = normalizeText(event.detail);
  const failureClass = normalizeText(event.failureClass);
  const eventName = normalizeText(event.event);
  const status = normalizeText(event.status);
  const state =
    normalizeText(event.state) ||
    (eventName ? CANONICAL_STATE_BY_EVENT[eventName] || null : null);

  if (!emittedAt || !state) {
    return null;
  }

  const canonical = buildLaneEvent({
    seq: Number.isFinite(seq) ? Math.trunc(seq) : 0,
    state,
    event: eventName,
    status,
    detail,
    emittedAt,
    failureClass,
    data: event.data,
  });
  return canonical;
}

function shouldPreserveLaneRecord(previous, nextContext = {}) {
  if (!previous || typeof previous !== 'object') return false;

  const previousTaskId = normalizeText(previous.taskId);
  const nextTaskId = normalizeText(nextContext.taskId);
  const previousRequestKind = normalizeText(previous.requestKind) || 'primary';
  const nextRequestKind = normalizeText(nextContext.requestKind) || previousRequestKind;

  return previousTaskId === nextTaskId && previousRequestKind === nextRequestKind;
}

function validateTaskPacket(packet) {
  const errors = [];
  const requiredFields = [
    'objective',
    'scope',
    'repo',
    'branchPolicy',
    'commitPolicy',
    'reportingContract',
    'escalationPolicy',
  ];

  requiredFields.forEach((field) => {
    if (!String(packet?.[field] || '').trim()) {
      errors.push(`${field} must not be empty`);
    }
  });

  const acceptanceTests = Array.isArray(packet?.acceptanceTests) ? packet.acceptanceTests : [];
  if (acceptanceTests.length === 0) {
    errors.push('acceptanceTests must contain at least one entry');
  } else {
    acceptanceTests.forEach((test, index) => {
      if (!String(test || '').trim()) {
        errors.push(`acceptanceTests contains an empty value at index ${index}`);
      }
    });
  }

  return errors;
}

function evaluateRecoveryPlan({
  failureClass,
  detail = '',
  attempts = 0,
  backoffBaseMs = 0,
  backoffMaxMs = 0,
  context = {},
}) {
  const recipe = buildRecoveryRecipe(failureClass, detail, context);
  const nextAttempt = Math.max(1, Number(attempts || 0) + 1);
  const canRetry = nextAttempt <= Math.max(1, Number(recipe.maxAttempts || 1));
  const delayMs =
    canRetry && Number(backoffBaseMs) > 0
      ? Math.min(
          Number(backoffBaseMs) * nextAttempt,
          Math.max(Number(backoffBaseMs), Number(backoffMaxMs || backoffBaseMs * nextAttempt)),
        )
      : 0;

  return {
    attempt: nextAttempt,
    canRetry,
    delayMs,
    recipe,
  };
}

function evaluateLaneCloseOutcome(input = {}) {
  // A marker buffered before termination cannot authorize closeout after stop.
  if (input.stoppedBySystem) {
    return {
      disposition: 'cancelled',
      completionDisposition: 'cancelled',
      commandFailureUnrecovered: false,
      hasBlockingCommandFailure: false,
      shouldRetryTransientFailure: false,
      shouldRetryCommandRecovery: false,
      shouldRejectCompletionForCommandFailure: false,
      shouldContinueIncompleteRun: false,
      iterationLimitExceeded: false,
      shouldRejectReview: false,
      shouldRejectReviewForMissingEvidence: false,
      completionRequiresIntegratedChanges: false,
      completionHadNoIntegratedChanges: false,
      completionHadBlockingIntegrationFailure: false,
      preserveWorkspace: false,
      transientRecovery: null,
      commandRecovery: null,
    };
  }

  const completionDetected = Boolean(input.completionDetected);
  const reviewRejected = Boolean(input.reviewRejected);
  const stoppedBySystem = Boolean(input.stoppedBySystem);
  const exitCode = Number(input.exitCode ?? input.code ?? 0);
  const canContinue = Boolean(input.canContinue);
  const successfulVerificationCount = Math.max(0, Number(input.successfulVerificationCount || 0));
  const failedVerificationCount = Math.max(0, Number(input.failedVerificationCount || 0));

  const lastNormalOutputAt = Number(input.lastNormalOutputAt);
  const lastCommandParsingFailureAt = Number(input.lastCommandParsingFailureAt);
  const commandFailureUnrecovered = Boolean(
    input.commandParsingFailureDetected &&
      (!Number.isFinite(lastNormalOutputAt) ||
        !Number.isFinite(lastCommandParsingFailureAt) ||
        lastNormalOutputAt <= lastCommandParsingFailureAt),
  );
  const transientProviderFailureDetected = Boolean(
    input.transientFailureDetected || isTransientProviderFailureDetail(input.lastErrorOutput),
  );

  const transientRecovery =
    !completionDetected &&
    !stoppedBySystem &&
    exitCode !== 0 &&
    transientProviderFailureDetected
      ? evaluateRecoveryPlan({
          failureClass: 'provider',
          detail: input.lastErrorOutput || 'Falha transitória de provider.',
          attempts: input.retryCount,
          backoffBaseMs: input.transientRetryDelayMs,
          backoffMaxMs: input.transientRetryMaxDelayMs,
          context: {
            transientRetryLimit: input.transientRetryLimit,
            commandRecoveryLimit: input.commandRecoveryLimit,
          },
        })
      : null;

  const shouldRetryTransientFailure = Boolean(transientRecovery?.canRetry);
  const hasBlockingCommandFailure = Boolean(
    !stoppedBySystem &&
      (commandFailureUnrecovered || input.commandRecoveryForced) &&
      canContinue,
  );

  const commandRecovery = hasBlockingCommandFailure
    ? evaluateRecoveryPlan({
        failureClass: 'shell',
        detail: input.recoveryHint || 'Falha de parsing de shell.',
        attempts: input.commandRecoveryCount,
        backoffBaseMs: input.loopContinuationDelayMs,
        backoffMaxMs: input.loopContinuationDelayMs,
        context: {
          transientRetryLimit: input.transientRetryLimit,
          commandRecoveryLimit: input.commandRecoveryLimit,
        },
      })
    : null;
  const shouldRetryCommandRecovery = Boolean(commandRecovery?.canRetry);
  const shouldRejectCompletionForCommandFailure = Boolean(
    completionDetected && hasBlockingCommandFailure && !shouldRetryCommandRecovery,
  );
  const iterationLimitExceeded = Boolean(
    !completionDetected &&
      !stoppedBySystem &&
      exitCode !== 0 &&
      isAutonomousIterationLimitDetail(input.lastErrorOutput),
  );
  const shouldContinueIncompleteRun = Boolean(
    !completionDetected &&
      !stoppedBySystem &&
      !shouldRetryCommandRecovery &&
      !shouldRetryTransientFailure &&
      canContinue &&
      (
        exitCode === 0 ||
        (iterationLimitExceeded &&
          successfulVerificationCount > 0 &&
          failedVerificationCount <= 0)
      ),
  );

  const integrationResult = input.integrationResult || null;
  const currentPrimaryTask = Boolean(input.currentPrimaryTask);
  const isReviewStage = Boolean(input.isReviewStage);
  const reviewProducedMaterialEvidence = Boolean(
    successfulVerificationCount > 0 || failedVerificationCount > 0,
  );
  const shouldRejectReview = Boolean(
    reviewRejected &&
      currentPrimaryTask &&
      isReviewStage &&
      reviewProducedMaterialEvidence,
  );
  const shouldRejectReviewForMissingEvidence = Boolean(
    currentPrimaryTask &&
      isReviewStage &&
      !reviewProducedMaterialEvidence &&
      (completionDetected || reviewRejected),
  );
  const completionRequiresIntegratedChanges = Boolean(currentPrimaryTask && !isReviewStage);
  const completionHadNoIntegratedChanges = Boolean(
    completionDetected &&
      completionRequiresIntegratedChanges &&
      integrationResult &&
      !integrationResult.integrated &&
      ['clean', 'nothing-staged'].includes(String(integrationResult.reason || '').trim()),
  );
  const completionHadBlockingIntegrationFailure = Boolean(
    completionDetected &&
      currentPrimaryTask &&
      integrationResult &&
      !integrationResult.integrated &&
      !['clean', 'nothing-staged'].includes(String(integrationResult.reason || '').trim()),
  );

  let disposition = 'terminal';
  if (shouldRejectReview) {
    disposition = 'review_rejected';
  } else if (shouldRejectReviewForMissingEvidence) {
    disposition = 'review_missing_evidence';
  } else if (shouldRetryTransientFailure) {
    disposition = 'retry_transient';
  } else if (shouldRetryCommandRecovery) {
    disposition = 'retry_command_recovery';
  } else if (shouldRejectCompletionForCommandFailure) {
    disposition = 'reject_completion';
  } else if (completionHadNoIntegratedChanges) {
    disposition = 'rejected_no_integrated_changes';
  } else if (completionHadBlockingIntegrationFailure) {
    disposition = 'rejected_integration_failure';
  } else if (completionDetected) {
    disposition = 'complete';
  } else if (shouldContinueIncompleteRun) {
    disposition = 'continue_incomplete';
  }

  let completionDisposition = 'not_completed';
  if (shouldRejectReview) {
    completionDisposition = 'rejected_review';
  } else if (shouldRejectReviewForMissingEvidence) {
    completionDisposition = 'rejected_review_missing_evidence';
  } else if (completionHadNoIntegratedChanges) {
    completionDisposition = 'rejected_no_integrated_changes';
  } else if (completionHadBlockingIntegrationFailure) {
    completionDisposition = 'rejected_integration_failure';
  } else if (shouldRejectCompletionForCommandFailure) {
    completionDisposition = 'rejected_command_failure';
  } else if (completionDetected) {
    completionDisposition = 'accepted';
  }

  const preserveWorkspace = Boolean(
    shouldRetryTransientFailure || shouldRetryCommandRecovery || shouldContinueIncompleteRun,
  );

  return {
    disposition,
    completionDisposition,
    commandFailureUnrecovered,
    hasBlockingCommandFailure,
    shouldRetryTransientFailure,
    shouldRetryCommandRecovery,
    shouldRejectCompletionForCommandFailure,
    shouldContinueIncompleteRun,
    iterationLimitExceeded,
    shouldRejectReview,
    shouldRejectReviewForMissingEvidence,
    completionRequiresIntegratedChanges,
    completionHadNoIntegratedChanges,
    completionHadBlockingIntegrationFailure,
    preserveWorkspace,
    transientRecovery,
    commandRecovery,
  };
}

function resolveEffectiveLaneDisposition(input = {}) {
  const normalizedDisposition = normalizeText(input.disposition) || 'terminal';
  const normalizedCompletionDisposition =
    normalizeText(input.completionDisposition) || 'not_completed';
  const completionOutcomeHandled = Boolean(input.completionOutcomeHandled);

  if (completionOutcomeHandled && normalizedCompletionDisposition === 'accepted') {
    return 'complete';
  }

  return normalizedDisposition;
}

module.exports = {
  buildCanonicalLaneId,
  buildLaneEvent,
  buildLaneEventRecord: buildLaneEvent,
  buildRecoveryRecipe,
  isTransientProviderFailureDetail,
  resolveEffectiveLaneDisposition,
  evaluateLaneRecordIdentity,
  evaluateLaneCloseOutcome,
  evaluateRunCloseout: evaluateLaneCloseOutcome,
  evaluateLaneCloseDecision: evaluateLaneCloseOutcome,
  evaluateRecoveryPlan,
  normalizeFailureClass,
  normalizeLaneEventRecord,
  shouldPreserveLaneRecord,
  validateTaskPacket,
};
