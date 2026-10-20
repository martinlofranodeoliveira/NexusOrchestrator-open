const ACTIVE_PRIMARY_TASK_STATUSES = new Set(['in_progress', 'in_review']);
const PRIMARY_TASK_FAILURE_PENALTY_CLASSES = new Set([
  'integration',
  'workspace',
  'branch_divergence',
  'review',
  'shell',
]);
const CROSS_AGENT_FAILURE_PENALTY_CLASSES = new Set(['review']);
const { isTaskOwnedByForeignInstance } = require('./instanceIdentity');

function normalizePrimaryTaskStatus(status) {
  return String(status || '').trim();
}

function evaluatePrimaryRunLaunch(task, agentId, options = {}) {
  const normalizedAgentId = String(agentId || '').trim();
  const normalizedInstanceId = String(options.instanceId || '').trim() || null;

  if (!task || !String(task.id || '').trim()) {
    return {
      ok: false,
      code: 'missing_task',
      reason: 'Task nao encontrada ou ainda nao sincronizada.',
      status: null,
      assignee: null,
    };
  }

  const taskId = String(task.id).trim();
  const status = normalizePrimaryTaskStatus(task.status);
  const assignee = String(task.assignee || '').trim() || null;

  if (!ACTIVE_PRIMARY_TASK_STATUSES.has(status)) {
    return {
      ok: false,
      code: 'inactive_task',
      reason: `Task ${taskId} esta em ${status || 'estado indefinido'} e nao aceita execucao primaria.`,
      status,
      assignee,
    };
  }

  if (!assignee) {
    return {
      ok: false,
      code: 'unassigned_task',
      reason: `Task ${taskId} nao possui assignee ativo.`,
      status,
      assignee: null,
    };
  }

  if (assignee !== normalizedAgentId) {
    return {
      ok: false,
      code: 'assignee_changed',
      reason: `Task ${taskId} esta atribuida a ${assignee}, nao a ${normalizedAgentId}.`,
      status,
      assignee,
    };
  }

  if (normalizedInstanceId && isTaskOwnedByForeignInstance(task, normalizedInstanceId)) {
    const ownerInstanceId = String(task.ownerInstanceId || task.instanceId || '').trim() || null;
    return {
      ok: false,
      code: 'foreign_instance_owner',
      reason: `Task ${taskId} pertence a outra instância (${ownerInstanceId || 'desconhecida'}), nao a ${normalizedInstanceId}.`,
      status,
      assignee,
      ownerInstanceId,
    };
  }

  return {
    ok: true,
    code: 'ok',
    reason: null,
    taskId,
    status,
    assignee,
  };
}

function shouldBlockPrimaryTaskDispatchDueToPublishedBranch(task, runtimeMeta, options = {}) {
  const taskId = String(task?.id || '').trim();
  if (!taskId) {
    return false;
  }

  const hasPublishedLock = Boolean(
    runtimeMeta?.publishedBranchLockedAt && runtimeMeta?.publishedBranchRef,
  );
  if (!hasPublishedLock) {
    return false;
  }

  if (options.hasLiveExecution) {
    return false;
  }

  const status = normalizePrimaryTaskStatus(task?.status);
  if (options.isForeignOwned && ACTIVE_PRIMARY_TASK_STATUSES.has(status)) {
    return false;
  }

  if (options.hasPublishedBaseMismatch || options.shouldAutoResetStalePublishedBranch) {
    return false;
  }

  if (status === 'in_progress' && options.forceFreshBranch) {
    return false;
  }

  if (status === 'backlog' || status === 'ready') {
    if (runtimeMeta?.publishedBranchIntegrated || options.forceFreshBranch) {
      return false;
    }
  }

  return true;
}

function normalizePrimaryTaskFailureClass(failureClass) {
  return String(failureClass || '').trim().toLowerCase();
}

function isPrimaryTaskFailurePenaltyEligible(failureClass) {
  return PRIMARY_TASK_FAILURE_PENALTY_CLASSES.has(
    normalizePrimaryTaskFailureClass(failureClass),
  );
}

function shouldPrimaryTaskFailurePenaltyApplyToAgent(failureClass, options = {}) {
  const normalizedFailureClass = normalizePrimaryTaskFailureClass(failureClass);
  if (!isPrimaryTaskFailurePenaltyEligible(normalizedFailureClass)) {
    return false;
  }

  if (CROSS_AGENT_FAILURE_PENALTY_CLASSES.has(normalizedFailureClass)) {
    return true;
  }

  const failedByAgentId = String(options.failedByAgentId || '').trim() || null;
  const agentId = String(options.agentId || '').trim() || null;
  if (!failedByAgentId || !agentId) {
    return true;
  }

  return failedByAgentId === agentId;
}

function planPrimaryTaskReservationReconciliation({ tasks = [], reservations = [] } = {}) {
  const tasksById = new Map();
  tasks.forEach((task) => {
    const taskId = String(task?.id || '').trim();
    if (!taskId) return;
    tasksById.set(taskId, task);
  });

  return reservations.reduce((planned, reservation) => {
    const taskId = String(reservation?.taskId || '').trim();
    const agentId = String(reservation?.agentId || '').trim();
    if (!taskId || !agentId) {
      return planned;
    }

    const evaluation = evaluatePrimaryRunLaunch(tasksById.get(taskId) || null, agentId, {
      instanceId: reservation?.instanceId || null,
    });
    if (evaluation.ok) {
      return planned;
    }

    planned.push({
      taskId,
      agentId,
      phase: String(reservation?.phase || '').trim() || null,
      code: evaluation.code,
      reason: evaluation.reason,
      status: evaluation.status || null,
      assignee: evaluation.assignee || null,
      ownerInstanceId: evaluation.ownerInstanceId || null,
    });
    return planned;
  }, []);
}

module.exports = {
  ACTIVE_PRIMARY_TASK_STATUSES,
  evaluatePrimaryRunLaunch,
  isPrimaryTaskFailurePenaltyEligible,
  planPrimaryTaskReservationReconciliation,
  shouldPrimaryTaskFailurePenaltyApplyToAgent,
  shouldBlockPrimaryTaskDispatchDueToPublishedBranch,
};
