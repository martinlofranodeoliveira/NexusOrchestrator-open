const fs = require('fs');
const path = require('path');
const { normalizeLaneEventRecord } = require('./laneRuntime');
const {
  buildInstanceScopedPath,
  resolveNexusInstanceId,
  resolveTaskInstanceId,
  resolveTaskOwnerId,
} = require('./instanceIdentity');

const CURRENT_INSTANCE_ID = resolveNexusInstanceId();
const BASE_STATE_DIR = process.env.NEXUS_RUNTIME_STATE_DIR
  ? path.resolve(process.env.NEXUS_RUNTIME_STATE_DIR)
  : path.resolve(__dirname, '..', '.runtime');
const STATE_DIR = buildInstanceScopedPath(BASE_STATE_DIR, CURRENT_INSTANCE_ID);
const STATE_FILE = path.join(STATE_DIR, 'nexus-state.json');

function ensureStateDir() {
  fs.mkdirSync(STATE_DIR, { recursive: true });
}

function createDefaultState() {
  return {
    instanceId: CURRENT_INSTANCE_ID,
    collaborationTaskSequence: 1,
    collaborationTasks: [],
    localPrimaryTaskSequence: 1,
    localPrimaryTasks: [],
    primaryTaskCache: [],
    primaryTaskRuntimeMeta: [],
    laneSnapshots: [],
    recentLaneFailures: [],
    providerRuntime: {
      cooldowns: [],
    },
  };
}

function sanitizeSerializable(value) {
  if (value === undefined) return null;
  if (value === null) return null;

  try {
    return JSON.parse(JSON.stringify(value));
  } catch (error) {
    return null;
  }
}

function normalizeString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeStringList(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeString(value))
      .filter(Boolean),
  )];
}

function sanitizeLaneEvent(event) {
  const normalized = normalizeLaneEventRecord(event);
  if (!normalized) return null;
  return {
    ...normalized,
    data: sanitizeSerializable(normalized.data),
  };
}

function sanitizeTaskPacket(packet) {
  if (!packet || typeof packet !== 'object') return null;

  const acceptanceTests = normalizeStringList(packet.acceptanceTests);

  return {
    packetId: normalizeString(packet.packetId),
    taskId: normalizeString(packet.taskId),
    title: normalizeString(packet.title),
    requestKind: normalizeString(packet.requestKind),
    phase: normalizeString(packet.phase),
    boardStatus: normalizeString(packet.boardStatus),
    assigneeId: normalizeString(packet.assigneeId),
    agentRole: normalizeString(packet.agentRole),
    parentTaskId: normalizeString(packet.parentTaskId),
    objective: normalizeString(packet.objective),
    scope: normalizeString(packet.scope),
    repo: normalizeString(packet.repo),
    branchPolicy: normalizeString(packet.branchPolicy),
    acceptanceTests,
    commitPolicy: normalizeString(packet.commitPolicy),
    reportingContract: normalizeString(packet.reportingContract),
    escalationPolicy: normalizeString(packet.escalationPolicy),
    collaborationScope: normalizeString(packet.collaborationScope),
    recoveryHint: normalizeString(packet.recoveryHint),
    backlogRef: normalizeString(packet.backlogRef),
    summary: normalizeString(packet.summary),
    sourceTaskId: normalizeString(packet.sourceTaskId),
    parentTaskRef: normalizeString(packet.parentTaskRef),
    parentTaskTitle: normalizeString(packet.parentTaskTitle),
    parentObjective: normalizeString(packet.parentObjective),
    phase: normalizeString(packet.phase),
    suggestedSquad: normalizeString(packet.suggestedSquad),
    approvedScope: normalizeStringList(packet.approvedScope),
    acceptanceCriteria: normalizeStringList(packet.acceptanceCriteria),
    dependencies: normalizeStringList(packet.dependencies),
    externalAccessGaps: normalizeStringList(packet.externalAccessGaps),
    outOfScope: normalizeStringList(packet.outOfScope),
    executionRules: normalizeStringList(packet.executionRules),
    githubUrl: normalizeString(packet.githubUrl),
    githubNodeId: normalizeString(packet.githubNodeId),
    skillIds: normalizeStringList(packet.skillIds),
    runtimeTargets: normalizeStringList(packet.runtimeTargets),
    requestedBy:
      packet.requestedBy && typeof packet.requestedBy === 'object'
        ? {
            id: normalizeString(packet.requestedBy.id),
            name: normalizeString(packet.requestedBy.name),
            role: normalizeString(packet.requestedBy.role),
          }
        : null,
  };
}

function sanitizeLaneRecord(record) {
  if (!record || typeof record !== 'object') return null;

  const agentId = String(record.agentId || '').trim();
  const laneId = String(record.laneId || '').trim();
  const state = String(record.state || '').trim();
  const updatedAt = record.updatedAt ? String(record.updatedAt) : null;

  if (!agentId || !laneId || !state || !updatedAt) {
    return null;
  }

  return {
    laneId,
    agentId,
    instanceId: record.instanceId ? String(record.instanceId).trim() : CURRENT_INSTANCE_ID,
    agentName: record.agentName ? String(record.agentName) : agentId,
    agentRole: record.agentRole ? String(record.agentRole).trim() : null,
    taskId: record.taskId ? String(record.taskId).trim() : null,
    taskTitle: record.taskTitle ? String(record.taskTitle) : null,
    requestKind: record.requestKind ? String(record.requestKind).trim() : 'primary',
    state,
    detail: record.detail ? String(record.detail) : null,
    updatedAt,
    startedAt: record.startedAt ? String(record.startedAt) : null,
    finishedAt: record.finishedAt ? String(record.finishedAt) : null,
    retryCount: Number.isFinite(Number(record.retryCount)) ? Math.trunc(Number(record.retryCount)) : 0,
    commandRecoveryCount: Number.isFinite(Number(record.commandRecoveryCount))
      ? Math.trunc(Number(record.commandRecoveryCount))
      : 0,
    failureClass: record.failureClass ? String(record.failureClass).trim() : null,
    failureMessage: record.failureMessage ? String(record.failureMessage) : null,
    taskPacket: sanitizeTaskPacket(record.taskPacket || record.packet || null),
    events: Array.isArray(record.events) ? record.events.map(sanitizeLaneEvent).filter(Boolean) : [],
  };
}

function sanitizePrimaryTaskRuntimeMetaEntry(entry) {
  if (!entry || typeof entry !== 'object') return null;

  const taskId = String(entry.taskId || '').trim();
  if (!taskId) return null;

  const failureCount = Number(entry.failureCount);
  const normalizedEntry = {
    taskId,
    lastCompletedByAgentId: entry.lastCompletedByAgentId
      ? String(entry.lastCompletedByAgentId).trim()
      : null,
    lastFailedByAgentId: entry.lastFailedByAgentId
      ? String(entry.lastFailedByAgentId).trim()
      : null,
    lastFailureClass: entry.lastFailureClass ? String(entry.lastFailureClass).trim() : null,
    lastFailureAt: entry.lastFailureAt ? String(entry.lastFailureAt) : null,
    lastFailureMessage: entry.lastFailureMessage ? String(entry.lastFailureMessage) : null,
    failureCount:
      Number.isFinite(failureCount) && failureCount > 0 ? Math.trunc(failureCount) : 0,
    lastLaneStatus: entry.lastLaneStatus ? String(entry.lastLaneStatus).trim() : null,
    lastLaneUpdatedAt: entry.lastLaneUpdatedAt ? String(entry.lastLaneUpdatedAt) : null,
    publishedBranchName: entry.publishedBranchName ? String(entry.publishedBranchName).trim() : null,
    publishedBranchRef: entry.publishedBranchRef ? String(entry.publishedBranchRef).trim() : null,
    publishedBaseBranch: entry.publishedBaseBranch ? String(entry.publishedBaseBranch).trim() : null,
    publishedCommitSha: entry.publishedCommitSha ? String(entry.publishedCommitSha).trim() : null,
    publishedBranchIntegrated:
      entry.publishedBranchIntegrated === undefined || entry.publishedBranchIntegrated === null
        ? null
        : Boolean(entry.publishedBranchIntegrated),
    publishedBranchReason: entry.publishedBranchReason ? String(entry.publishedBranchReason).trim() : null,
    publishedBranchLockedAt: entry.publishedBranchLockedAt ? String(entry.publishedBranchLockedAt) : null,
    publishedBranchUpdatedAt: entry.publishedBranchUpdatedAt ? String(entry.publishedBranchUpdatedAt) : null,
    awaitingGitLabCi: Boolean(entry.awaitingGitLabCi),
    gitlabCiGateStatus: entry.gitlabCiGateStatus ? String(entry.gitlabCiGateStatus).trim() : null,
    gitlabCiGateArmedAt: entry.gitlabCiGateArmedAt ? String(entry.gitlabCiGateArmedAt) : null,
    gitlabCiGateResolvedAt: entry.gitlabCiGateResolvedAt ? String(entry.gitlabCiGateResolvedAt) : null,
    gitlabPipelineId:
      Number.isFinite(Number(entry.gitlabPipelineId)) && Number(entry.gitlabPipelineId) > 0
        ? Math.trunc(Number(entry.gitlabPipelineId))
        : null,
    gitlabPipelineStatus: entry.gitlabPipelineStatus ? String(entry.gitlabPipelineStatus).trim() : null,
    gitlabPipelineStatusClass: entry.gitlabPipelineStatusClass ? String(entry.gitlabPipelineStatusClass).trim() : null,
    gitlabPipelineUrl: entry.gitlabPipelineUrl ? String(entry.gitlabPipelineUrl) : null,
    gitlabPipelineSha: entry.gitlabPipelineSha ? String(entry.gitlabPipelineSha).trim() : null,
    gitlabPipelineBranch: entry.gitlabPipelineBranch ? String(entry.gitlabPipelineBranch).trim() : null,
    gitlabPipelineProjectPath: entry.gitlabPipelineProjectPath ? String(entry.gitlabPipelineProjectPath).trim() : null,
    gitlabPipelineUpdatedAt: entry.gitlabPipelineUpdatedAt ? String(entry.gitlabPipelineUpdatedAt) : null,
    gitlabPipelineFinishedAt: entry.gitlabPipelineFinishedAt ? String(entry.gitlabPipelineFinishedAt) : null,
    gitlabPipelineCheckedAt: entry.gitlabPipelineCheckedAt ? String(entry.gitlabPipelineCheckedAt) : null,
  };

  const hasUsefulData = Boolean(
    normalizedEntry.lastCompletedByAgentId ||
      normalizedEntry.lastFailedByAgentId ||
      normalizedEntry.lastFailureClass ||
      normalizedEntry.failureCount > 0 ||
      normalizedEntry.lastLaneStatus ||
      normalizedEntry.publishedBranchRef ||
      normalizedEntry.publishedBranchLockedAt ||
      normalizedEntry.publishedCommitSha ||
      normalizedEntry.awaitingGitLabCi ||
      normalizedEntry.gitlabCiGateStatus ||
      normalizedEntry.gitlabPipelineId ||
      normalizedEntry.gitlabPipelineStatus,
  );
  if (!hasUsefulData) return null;

  return normalizedEntry;
}

function sanitizePrimaryTask(task, options = {}) {
  if (!task || typeof task !== 'object') return null;

  const allowGitHubBacked = Boolean(options.allowGitHubBacked);
  const id = String(task.id || '').trim();
  const title = String(task.title || '').trim();
  const assignee = task.assignee ? String(task.assignee).trim() : null;
  const status = String(task.status || 'backlog').trim() || 'backlog';
  const ownerId = resolveTaskOwnerId(task);
  const ownerInstanceId = resolveTaskInstanceId(task);

  if (!id || !title || (!allowGitHubBacked && id.startsWith('GH-'))) return null;

  return {
    id,
    title,
    status,
    assignee,
    ownerId,
    ownerInstanceId,
    kind: 'primary',
    githubUrl: task.githubUrl ? String(task.githubUrl) : null,
    githubNodeId: task.githubNodeId ? String(task.githubNodeId) : null,
    createdAt: task.createdAt ? String(task.createdAt) : null,
    updatedAt: task.updatedAt ? String(task.updatedAt) : null,
    statusChangedAt: task.statusChangedAt ? String(task.statusChangedAt) : null,
    assigneeChangedAt: task.assigneeChangedAt ? String(task.assigneeChangedAt) : null,
    startedAt: task.startedAt ? String(task.startedAt) : null,
    completedAt: task.completedAt ? String(task.completedAt) : null,
    backlogRef: normalizeString(task.backlogRef),
    priority: normalizeString(task.priority),
    objective: normalizeString(task.objective),
    phase: normalizeString(task.phase),
    suggestedSquad: normalizeString(task.suggestedSquad),
    approvedScope: normalizeStringList(task.approvedScope),
    acceptanceCriteria: normalizeStringList(task.acceptanceCriteria),
    dependencies: normalizeStringList(task.dependencies),
    externalAccessGaps: normalizeStringList(task.externalAccessGaps),
    outOfScope: normalizeStringList(task.outOfScope),
    executionRules: normalizeStringList(task.executionRules),
    branchName: normalizeString(task.branchName),
  };
}

function sanitizeTask(task) {
  if (!task || typeof task !== 'object') return null;

  const id = String(task.id || '').trim();
  const title = String(task.title || '').trim();
  const assignee = task.assignee ? String(task.assignee).trim() : null;
  const requesterId = task.requesterId ? String(task.requesterId).trim() : null;
  const parentTaskId = task.parentTaskId ? String(task.parentTaskId).trim() : null;
  const status = String(task.status || 'backlog').trim() || 'backlog';
  const ownerId = resolveTaskOwnerId(task);
  const ownerInstanceId = resolveTaskInstanceId(task);
  const kind = String(task.kind || 'collaboration').trim() || 'collaboration';
  const githubUrl = normalizeString(task.githubUrl);
  const githubNodeId = normalizeString(task.githubNodeId);
  const sourceTaskId = normalizeString(task.sourceTaskId);
  const source = normalizeString(task.source);
  const collaborationKey = normalizeString(task.collaborationKey);
  const parentTaskRef = normalizeString(task.parentTaskRef);

  if (!id || !title) return null;

  return {
    id,
    title,
    status,
    assignee,
    ownerId,
    ownerInstanceId,
    requesterId,
    parentTaskId,
    kind,
    githubUrl,
    githubNodeId,
    sourceTaskId,
    source,
    collaborationKey,
    parentTaskRef,
    backlogRef: normalizeString(task.backlogRef),
    summary: normalizeString(task.summary),
    objective: normalizeString(task.objective),
    phase: normalizeString(task.phase),
    suggestedSquad: normalizeString(task.suggestedSquad),
    approvedScope: normalizeStringList(task.approvedScope),
    acceptanceCriteria: normalizeStringList(task.acceptanceCriteria),
    dependencies: normalizeStringList(task.dependencies),
    externalAccessGaps: normalizeStringList(task.externalAccessGaps),
    outOfScope: normalizeStringList(task.outOfScope),
    executionRules: normalizeStringList(task.executionRules),
    createdAt: task.createdAt ? String(task.createdAt) : null,
    updatedAt: task.updatedAt ? String(task.updatedAt) : null,
    startedAt: task.startedAt ? String(task.startedAt) : null,
    completedAt: task.completedAt ? String(task.completedAt) : null,
  };
}

function sanitizeState(rawState) {
  const baseState = createDefaultState();
  if (!rawState || typeof rawState !== 'object') {
    return baseState;
  }

  const collaborationTaskSequence = Number(rawState.collaborationTaskSequence);
  const collaborationTasks = Array.isArray(rawState.collaborationTasks)
    ? rawState.collaborationTasks.map(sanitizeTask).filter(Boolean)
    : [];
  const localPrimaryTaskSequence = Number(rawState.localPrimaryTaskSequence);
  const localPrimaryTasks = Array.isArray(rawState.localPrimaryTasks)
    ? rawState.localPrimaryTasks.map(sanitizePrimaryTask).filter(Boolean)
    : [];
  const primaryTaskCache = Array.isArray(rawState.primaryTaskCache)
    ? rawState.primaryTaskCache
        .map((task) => sanitizePrimaryTask(task, { allowGitHubBacked: true }))
        .filter(Boolean)
    : [];
  const primaryTaskRuntimeMeta = Array.isArray(rawState.primaryTaskRuntimeMeta)
    ? rawState.primaryTaskRuntimeMeta.map(sanitizePrimaryTaskRuntimeMetaEntry).filter(Boolean)
    : [];
  const laneSnapshots = Array.isArray(rawState.laneSnapshots)
    ? rawState.laneSnapshots.map(sanitizeLaneRecord).filter(Boolean)
    : [];
  const recentLaneFailures = Array.isArray(rawState.recentLaneFailures)
    ? rawState.recentLaneFailures.map(sanitizeLaneRecord).filter(Boolean)
    : [];
  const providerRuntimeCooldowns = Array.isArray(rawState.providerRuntime?.cooldowns)
    ? rawState.providerRuntime.cooldowns
        .map((entry) => {
          if (!entry || typeof entry !== 'object') return null;
          const provider = normalizeString(entry.provider);
          const model = normalizeString(entry.model);
          if (!provider || !model) return null;
          return {
            provider,
            model,
            failureCount:
              Number.isFinite(Number(entry.failureCount)) && Number(entry.failureCount) > 0
                ? Math.trunc(Number(entry.failureCount))
                : 0,
            lastFailureAt: entry.lastFailureAt ? String(entry.lastFailureAt) : null,
            lastFailureReason: normalizeString(entry.lastFailureReason),
            lastAgentId: normalizeString(entry.lastAgentId),
            lastTaskId: normalizeString(entry.lastTaskId),
            cooldownUntil: entry.cooldownUntil ? Number(entry.cooldownUntil) : null,
            cooldownRemainingMs: entry.cooldownRemainingMs
              ? Number(entry.cooldownRemainingMs)
              : null,
          };
        })
        .filter(Boolean)
    : [];

  return {
    instanceId:
      String(rawState.instanceId || '').trim() || baseState.instanceId,
    collaborationTaskSequence:
      Number.isFinite(collaborationTaskSequence) && collaborationTaskSequence > 0
        ? Math.trunc(collaborationTaskSequence)
        : baseState.collaborationTaskSequence,
    collaborationTasks,
    localPrimaryTaskSequence:
      Number.isFinite(localPrimaryTaskSequence) && localPrimaryTaskSequence > 0
        ? Math.trunc(localPrimaryTaskSequence)
        : baseState.localPrimaryTaskSequence,
    localPrimaryTasks,
    primaryTaskCache,
    primaryTaskRuntimeMeta,
    laneSnapshots,
    recentLaneFailures,
    providerRuntime: {
      cooldowns: providerRuntimeCooldowns,
    },
  };
}

function loadRuntimeState() {
  if (!fs.existsSync(STATE_FILE)) {
    return createDefaultState();
  }

  try {
    const rawState = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    const persistedInstanceId = String(rawState?.instanceId || '').trim();
    if (persistedInstanceId && persistedInstanceId !== CURRENT_INSTANCE_ID) {
      console.warn(
        `[NEXUS] Estado persistido pertence a outra instância (${persistedInstanceId}); iniciando estado limpo para ${CURRENT_INSTANCE_ID}.`,
      );
      return createDefaultState();
    }
    return sanitizeState(rawState);
  } catch (error) {
    console.warn(`[NEXUS] Falha ao carregar estado persistido: ${error.message}`);
    return createDefaultState();
  }
}

function saveRuntimeState(state) {
  ensureStateDir();
  const payload = `${JSON.stringify(sanitizeState(state), null, 2)}\n`;
  const tempFile = `${STATE_FILE}.${process.pid}.${Date.now()}.${Math.random()
    .toString(16)
    .slice(2)}.tmp`;

  try {
    fs.writeFileSync(tempFile, payload, 'utf8');
    fs.renameSync(tempFile, STATE_FILE);
  } finally {
    if (fs.existsSync(tempFile)) {
      fs.unlinkSync(tempFile);
    }
  }
}

module.exports = {
  CURRENT_INSTANCE_ID,
  STATE_FILE,
  createDefaultState,
  loadRuntimeState,
  saveRuntimeState,
};
