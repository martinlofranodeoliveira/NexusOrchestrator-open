function normalizePositiveInteger(value, fallback) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function normalizeTasks(attention) {
  return Array.isArray(attention?.tasks) ? attention.tasks.filter(Boolean) : [];
}

function buildLaneFingerprints(status) {
  return Array.isArray(status?.lanes?.agents)
    ? status.lanes.agents
        .map((lane) => {
          const laneId = lane.laneId || lane.taskId || lane.agentId || 'unknown';
          const updatedAt = lane.updatedAt || lane.startedAt || lane.finishedAt || 'none';
          const state = lane.state || 'unknown';
          return `${laneId}@${updatedAt}:${state}`;
        })
        .sort()
    : [];
}

function buildFlaggedTaskFingerprints(attention) {
  return normalizeTasks(attention)
    .filter((task) => task.stale || ['warning', 'critical'].includes(String(task.severity || '').toLowerCase()))
    .map((task) => {
      const taskId = task.id || 'unknown';
      const updatedAt = task.lastActivityAt || task.updatedAt || 'none';
      const reason = task.reason || task.status || 'unknown';
      return `${taskId}@${updatedAt}:${reason}`;
    })
    .sort();
}

function buildActiveTaskFingerprints(attention) {
  return normalizeTasks(attention)
    .filter((task) => {
      const normalizedStatus = String(task.status || '').trim().toLowerCase();
      const execution = task.execution || {};
      return (
        ['in_progress', 'in_review', 'blocked'].includes(normalizedStatus) ||
        execution.running === true ||
        execution.preparing === true ||
        execution.queued === true
      );
    })
    .map((task) => {
      const taskId = task.id || 'unknown';
      const updatedAt = task.lastActivityAt || task.updatedAt || 'none';
      const execution = task.execution || {};
      const status = task.status || 'unknown';
      const executionState =
        execution.running ? 'running' :
        execution.preparing ? 'preparing' :
        execution.queued ? 'queued' :
        'idle';
      return `${taskId}@${updatedAt}:${status}:${executionState}`;
    })
    .sort();
}

function buildProblemSignature(issues, snapshot) {
  const status = snapshot?.status || {};
  const attention = status.attention || {};
  const taskCounts = status.tasks?.byStatus || {};
  const runs = status.runs || {};
  const lanes = status.lanes || {};

  return JSON.stringify({
    issues: issues.map((issue) => issue.code).sort(),
    flaggedTasks: buildFlaggedTaskFingerprints(attention),
    activeTasks: buildActiveTaskFingerprints(attention),
    activeLanes: buildLaneFingerprints(status),
    counts: {
      inProgress: Number(taskCounts.in_progress || 0),
      inReview: Number(taskCounts.in_review || 0),
      activeRuns: Number(runs.active || 0),
      activeLanes: Number(lanes.active || 0),
    },
  });
}

function buildSummary({ ok, issues, stableProblemCount, shouldRestart, restartSuppressedByCooldown }) {
  if (ok) {
    return 'Supervisor local: runtime saudavel.';
  }

  const issueSummary = issues.map((issue) => issue.summary).join(' | ');
  const stabilitySuffix =
    stableProblemCount > 1 ? ` Problema persistente por ${stableProblemCount} ciclos.` : '';
  if (shouldRestart) {
    return `Supervisor local: reinicio automatico solicitado. ${issueSummary}${stabilitySuffix}`;
  }
  if (restartSuppressedByCooldown) {
    return `Supervisor local: problema detectado, mas reinicio em cooldown. ${issueSummary}${stabilitySuffix}`;
  }
  return `Supervisor local: atencao necessaria. ${issueSummary}${stabilitySuffix}`;
}

function analyzeLocalSupervisorSnapshot(snapshot, previousReport = {}, options = {}) {
  const checkedAt = options.checkedAt || new Date().toISOString();
  const minStableCyclesBeforeRestart = normalizePositiveInteger(
    options.minStableCyclesBeforeRestart,
    2,
  );
  const restartCooldownMs = normalizePositiveInteger(options.restartCooldownMs, 5 * 60 * 1000);
  const progressStallMs = normalizePositiveInteger(options.progressStallMs, 0);
  const previousStableProblemCount = normalizePositiveInteger(previousReport.stableProblemCount, 0);
  const issues = [];

  if (!snapshot) {
    issues.push({
      code: 'health_unreachable',
      severity: 'critical',
      summary: 'health indisponivel',
      detail: options.unreachableDetail || 'Nao foi possivel consultar /health.',
      autoRestart: true,
    });
  } else if (snapshot.ok !== true || !snapshot.status) {
    issues.push({
      code: 'health_invalid',
      severity: 'critical',
      summary: 'payload de health invalido',
      detail: 'O backend respondeu, mas sem payload operacional valido.',
      autoRestart: true,
    });
  }

  const status = snapshot?.status || {};
  const attention = status.attention || {};
  const taskCounts = status.tasks?.byStatus || {};
  const runs = status.runs || {};
  const lanes = status.lanes || {};
  const nowMs = Date.parse(checkedAt) || Date.now();

  const criticalCount = Number(attention.criticalCount || 0);
  const flaggedCount = Number(attention.flaggedCount || 0);
  const flaggedTasks = buildFlaggedTaskFingerprints(attention);
  const activeTaskCount =
    Number(taskCounts.in_progress || 0) +
    Number(taskCounts.in_review || 0) +
    Number(taskCounts.blocked || 0);

  if (criticalCount > 0) {
    issues.push({
      code: 'critical_attention',
      severity: 'critical',
      summary: `${criticalCount} task(s) critica(s) sinalizada(s) pelo watchdog interno`,
      detail: flaggedTasks.length ? `Tasks: ${flaggedTasks.join(', ')}` : null,
      autoRestart: true,
    });
  } else if (flaggedCount > 0) {
    issues.push({
      code: 'flagged_attention',
      severity: 'warning',
      summary: `${flaggedCount} task(s) sinalizada(s) pelo watchdog interno`,
      detail: flaggedTasks.length ? `Tasks: ${flaggedTasks.join(', ')}` : null,
      autoRestart: true,
    });
  } else if (attention.healthy === false) {
    issues.push({
      code: 'attention_unhealthy',
      severity: 'warning',
      summary: 'watchdog interno reportou estado unhealthy',
      detail: 'O backend marcou a atencao operacional como unhealthy sem detalhamento adicional.',
      autoRestart: true,
    });
  }

  if (activeTaskCount > 0 && Number(runs.active || 0) === 0 && Number(lanes.active || 0) === 0) {
    issues.push({
      code: 'active_tasks_without_execution',
      severity: 'warning',
      summary: `${activeTaskCount} task(s) ativa(s) sem lane ou run`,
      detail: 'Existe trabalho em progresso/review sem nenhuma lane ativa no runtime.',
      autoRestart: true,
    });
  }

  if (progressStallMs > 0) {
    const activeLanes = Array.isArray(lanes.agents) ? lanes.agents.filter(Boolean) : [];
    const stalledLanes = activeLanes.filter((lane) => {
      const updatedAt = lane.updatedAt || lane.startedAt || lane.finishedAt || null;
      const updatedMs = updatedAt ? Date.parse(updatedAt) : NaN;
      return Number.isFinite(updatedMs) && nowMs - updatedMs >= progressStallMs;
    });

    if (stalledLanes.length > 0) {
      issues.push({
        code: 'execution_stalled',
        severity: 'warning',
        summary: `${stalledLanes.length} lane(s) sem progresso por pelo menos ${progressStallMs}ms`,
        detail: stalledLanes
          .map((lane) => `${lane.taskId || lane.laneId || 'unknown'}:${lane.state || 'unknown'}`)
          .join(', '),
        autoRestart: true,
      });
    }
  }

  const ok = issues.length === 0;
  const problemSignature = ok ? null : buildProblemSignature(issues, snapshot);
  const stableProblemCount = problemSignature
    ? previousReport.problemSignature === problemSignature
      ? previousStableProblemCount + 1
      : 1
    : 0;

  const lastRestartAt = previousReport.lastRestartAt || null;
  const lastRestartMs = lastRestartAt ? Date.parse(lastRestartAt) : NaN;
  const restartEligible =
    issues.some((issue) => issue.code === 'health_unreachable' || issue.code === 'health_invalid') ||
    (stableProblemCount >= minStableCyclesBeforeRestart && issues.some((issue) => issue.autoRestart));
  const restartSuppressedByCooldown =
    restartEligible &&
    Number.isFinite(lastRestartMs) &&
    nowMs - lastRestartMs < restartCooldownMs;
  const shouldRestart = restartEligible && !restartSuppressedByCooldown;

  const severity = ok
    ? 'ok'
    : issues.some((issue) => issue.severity === 'critical')
      ? 'critical'
      : 'warning';

  return {
    checkedAt,
    ok,
    severity,
    summary: buildSummary({
      ok,
      issues,
      stableProblemCount,
      shouldRestart,
      restartSuppressedByCooldown,
    }),
    issues,
    problemSignature,
    stableProblemCount,
    shouldRestart,
    restartSuppressedByCooldown,
    lastHealthyAt: ok ? checkedAt : previousReport.lastHealthyAt || null,
    lastRestartAt: previousReport.lastRestartAt || null,
    snapshotSummary: {
      instanceId: snapshot?.instanceId || null,
      tasks: status.tasks || null,
      runs: status.runs || null,
      lanes: status.lanes || null,
      attention: status.attention || null,
    },
  };
}

module.exports = {
  analyzeLocalSupervisorSnapshot,
};
