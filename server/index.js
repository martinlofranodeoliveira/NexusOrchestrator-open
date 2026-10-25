const { openEditionOptIn } = require("./services/openEditionDefaults");
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const { spawn, spawnSync } = require('child_process');
dotenv.config({ path: path.resolve(__dirname, '..', '.env'), quiet: true });
const { generateCreativeContent } = require('./services/marketingService');
const {
  fetchGitHubTasks,
  moveGitHubTask,
  createGitHubTask,
  createGitHubPhaseRelease,
  syncGitHubProjectStatusByNodeId,
} = require('./services/githubService');
const {
  buildGitHubCollaborationMirrorId,
  resolveGitHubCollaborationParentTaskId,
} = require('./services/githubTaskTopology');
const {
  cleanGeminiOutput,
  createGeminiEnv,
  DEFAULT_GEMINI_MODEL,
  GEMINI_EXECUTABLE,
  GEMINI_FLASH_LITE_MODEL,
  GEMINI_PRO_MODEL,
  getRalphIncludeDirectories,
  runGeminiPrompt,
} = require('./services/geminiCli');
const {
  defaultModelForProvider,
  detectProviderFromModel,
  getGlobalDefaultLlmProvider,
  listModelsForProvider,
  modelTierForProvider,
  normalizeLlmProvider,
  normalizeModelName: normalizeRegisteredModelName,
  resolveAgentAutonomousModel,
  resolveAgentReasoningEffort,
  resolveAgentPromptModel,
  resolveConfiguredLlm,
} = require('./services/modelRegistry');
const {
  clearRuntimeCandidateCooldown,
  formatRuntimeCandidate,
  getProviderRuntimeSnapshot,
  markRuntimeCandidateFailure,
  normalizeFallbackModels,
  normalizeRuntimeCandidate,
  readProviderFallbackEntries,
  resolveAgentRuntimePlan,
} = require('./services/providerRuntime');
const { runPrompt } = require('./services/llmService');
const { runMeeting } = require('./services/meetingService');
const {
  buildDefaultAgentPrompt,
  buildRoleAcceptanceTests,
  buildRoleExecutionPolicy: buildAgentRoleExecutionPolicy,
} = require('./services/agentProfiles');
const {
  buildSuggestedVerificationCommands,
  detectVerificationCommand,
} = require('./services/reviewEvidence');
const {
  ensureReviewWorkspaceRuntime,
} = require('./services/reviewWorkspaceRuntime');
const {
  getOpencodeRuntimeStatus,
} = require('./services/opencodeRuntime');
const {
  getFigmaBridgeStatus,
} = require('./services/figmaBridge');
const {
  getStitchBridgeStatus,
  listStitchTools,
} = require('./services/stitchBridge');
const {
  PRIMARY_TEAM,
  REVIEW_TEAM,
  buildDefaultAgentBlueprints,
  buildRoomOccupancy,
  findRoomForAgent,
  normalizeFloor: normalizeCatalogFloor,
  normalizeTeam: normalizeCatalogTeam,
  resolveBuiltinRoomTopology,
  resolveRoomTemplates,
} = require('./services/roomCatalog');
const {
  resolveOpencodeReviewGateConfig,
  runOpencodeReviewGate,
} = require('./services/opencodeReviewGate');
const {
  buildTaskContractPromptSection,
  ensureTaskContractFiles,
} = require('./services/taskContract');
const {
  buildTaskBranchName,
  cleanupTaskWorkspace,
  discoverProjectContext,
  evaluateDependencyStartRefAgainstBase,
  ensureTaskWorkspace,
  integrateTaskWorkspaceChanges,
  isTaskBranchCandidateCompatible,
  listManagedWorkspaces,
  normalizeTaskBranchRefName,
  promotePublishedTaskBranchToBase,
  resolveTaskBranchAbsorption,
  resolveTaskBranchBase,
  resolveWorkspaceIntegrationMode,
} = require('./services/projectWorkspace');
const {
  buildCanonicalLaneId,
  buildLaneEvent,
  evaluateLaneRecordIdentity,
  evaluateRunCloseout,
  buildRecoveryRecipe: resolveRecoveryRecipe,
  normalizeFailureClass: normalizeLaneFailureClass,
  resolveEffectiveLaneDisposition,
  validateTaskPacket: validateLaneTaskPacket,
} = require('./services/laneRuntime');
const {
  evaluatePrimaryRunLaunch,
  isPrimaryTaskFailurePenaltyEligible,
  planPrimaryTaskReservationReconciliation,
  shouldPrimaryTaskFailurePenaltyApplyToAgent,
  shouldBlockPrimaryTaskDispatchDueToPublishedBranch,
} = require('./services/primaryTaskRuntime');
const {
  getPrimaryLaneSnapshotUpdatedAt: selectPrimaryLaneSnapshotUpdatedAt,
  getPrimaryTaskLastActivityMs: selectPrimaryTaskLastActivityMs,
} = require('./services/taskActivity');
const { loadRuntimeState, saveRuntimeState } = require('./services/runtimeState');
const {
  classifyGitLabPipelineStatus,
  ensureGitLabBranchPipeline,
  findGitLabBranchPipeline,
  getGitLabPipeline,
} = require('./services/gitlabMirror');
const { consumeRuntimeEventBuffer } = require('./services/runtimeEventProtocol');
const { runHookPipeline } = require('./services/hookRunner');
const {
  buildTaskOwnershipMetadata,
  isTaskOwnedByForeignInstance,
  isTaskOwnedByInstance,
  resolveNexusInstanceId,
  resolveNexusInstanceOwner,
  resolveTaskInstanceId,
  resolveTaskOwnerId,
} = require('./services/instanceIdentity');
const {
  isAutoDispatchCandidateStatus,
  isImplementationDispatchCandidateStatus,
  normalizeCollaborationDispatchStatus,
  resolveBacklogAutoDispatchEnabled,
  resolveBacklogAutoPromotionEnabled,
  resolvePrimaryReadySlotTarget,
} = require('./services/dispatchPolicy');
const {
  arePrimaryTaskDependenciesSatisfied,
  buildCompletedPrimaryTaskDependencyKeySet,
  countPrimaryImplementationFronts,
  collectPrimaryTaskDependencyKeys,
  hasAnyActivePrimaryTasks,
  normalizePrimaryTaskDependencyToken,
  selectNextDependencyReadyBacklogTask,
} = require('./services/primaryTaskDispatch');
const {
  resolveBranchAbsorptionStatusDecision,
  shouldBypassPublishedBranchLock,
} = require('./services/primaryTaskSyncPolicy');
const {
  buildPhaseKey,
  normalizePhaseValue,
  resolvePhaseBranchName,
} = require('./services/phaseRelease');
const {
  buildSkillsPrompt,
  defaultSkillRoots,
  discoverSkills,
  normalizeSkillList,
  resolveApplicableSkills,
} = require('./services/skillsRegistry');
const {
  shouldBlockAgentOnImplementationDispatch,
  shouldRebalanceAssignedImplementationTask,
} = require('./services/taskRoleFit');
const {
  detectAdminPendingMarker,
  detectCompletionMarker,
  detectRejectionMarker,
  resolveAdminPendingMarker,
  resolveAdminPendingPromise,
  resolveCompletionMarker,
  resolveCompletionPromise,
  resolveRejectionMarker,
  resolveRejectionPromise,
} = require('./services/runSignals');

const { setupObservability, logger, metrics } = require('./observability');

const app = express();
setupObservability(app);

const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", 
    methods: ["GET", "POST"]
  }
});

const WORKSPACE_ROOT = path.resolve(__dirname, '..', '..');
const FRONTEND_DIST_DIR = path.resolve(__dirname, '..', 'dist', 'webview');
const FRONTEND_INDEX_FILE = path.join(FRONTEND_DIST_DIR, 'index.html');
const RALPH_MAX_ITERATIONS = Number(process.env.RALPH_MAX_ITERATIONS || 8);
const RALPH_ADMIN_PENDING_PROMISE = resolveAdminPendingPromise(process.env);
const RALPH_ADMIN_PENDING_MARKER = resolveAdminPendingMarker(process.env);
const RALPH_COMPLETION_PROMISE = resolveCompletionPromise(process.env);
const RALPH_COMPLETION_MARKER = resolveCompletionMarker(process.env);
const RALPH_REJECTION_PROMISE = resolveRejectionPromise(process.env);
const RALPH_REJECTION_MARKER = resolveRejectionMarker(process.env);
const RALPH_EXTENSION_ENABLED =
  String(process.env.NEXUS_ENABLE_RALPH_EXTENSION || 'false').toLowerCase() === 'true';
const RALPH_EXTENSION_FAILURE_LIMIT = Number(process.env.NEXUS_RALPH_FAILURE_LIMIT || 1);
const TRANSIENT_MODEL_RETRY_LIMIT = Number(process.env.NEXUS_TRANSIENT_MODEL_RETRY_LIMIT || 3);
const COMMAND_PARSING_RECOVERY_LIMIT = Number(
  process.env.NEXUS_COMMAND_PARSING_RECOVERY_LIMIT || 2,
);
const TRANSIENT_MODEL_RETRY_DELAY_MS = Number(process.env.NEXUS_TRANSIENT_MODEL_RETRY_DELAY_MS || 8000);
const TRANSIENT_MODEL_RETRY_MAX_DELAY_MS = Number(process.env.NEXUS_TRANSIENT_MODEL_RETRY_MAX_DELAY_MS || 30000);
const LOOP_CONTINUATION_DELAY_MS = Number(process.env.NEXUS_LOOP_CONTINUATION_DELAY_MS || 1500);
const AUTO_DISPATCH_DELAY_MS = Number(process.env.NEXUS_AUTO_DISPATCH_DELAY_MS || 1200);
const AUTO_DISPATCH_HEARTBEAT_MS = Number(process.env.NEXUS_AUTO_DISPATCH_HEARTBEAT_MS || 10000);
const STALE_TASK_MONITOR_INTERVAL_MS = Number(
  process.env.NEXUS_STALE_TASK_MONITOR_INTERVAL_MS || 30000,
);
const ACTIVE_TASK_STALE_MS = Number(process.env.NEXUS_ACTIVE_TASK_STALE_MS || 3 * 60 * 1000);
const REVIEW_TASK_STALE_MS = Number(process.env.NEXUS_REVIEW_TASK_STALE_MS || 5 * 60 * 1000);
const STALE_TASK_ALERT_COOLDOWN_MS = Number(
  process.env.NEXUS_STALE_TASK_ALERT_COOLDOWN_MS || 2 * 60 * 1000,
);
const PRIMARY_TASK_FAILURE_PENALTY_WINDOW_MS = Number(
  process.env.NEXUS_PRIMARY_TASK_FAILURE_PENALTY_WINDOW_MS || 20 * 60 * 1000,
);
const LANE_EVENT_HISTORY_LIMIT = Math.max(
  4,
  Number(process.env.NEXUS_LANE_EVENT_HISTORY_LIMIT || 10),
);
const OPERATIONAL_LANE_SNAPSHOT_LIMIT = Math.max(
  4,
  Number(process.env.NEXUS_OPERATIONAL_LANE_SNAPSHOT_LIMIT || 12),
);
const BOOTSTRAP_DEMO_TASKS_ENABLED =
  openEditionOptIn(process.env.NEXUS_BOOTSTRAP_DEMO_TASKS);
const AUTO_DISPATCH_ENABLED = openEditionOptIn(process.env.NEXUS_AUTO_DISPATCH);
const ORPHAN_TASK_RESCUE_ENABLED =
  openEditionOptIn(process.env.NEXUS_ORPHAN_TASK_RESCUE);
const LOOP_SIGNAL_BUFFER_LIMIT = Math.max(
  4096,
  RALPH_COMPLETION_MARKER.length * 12,
  RALPH_REJECTION_MARKER.length * 12,
);
const ACTION_BUFFER_LIMIT = 4000;
const GITHUB_TASKS_CONFIGURED = Boolean(
  process.env.GITHUB_TOKEN && process.env.GITHUB_OWNER && process.env.GITHUB_REPO,
);
const GITHUB_PROJECT_OWNER = String(
  process.env.GITHUB_PROJECT_OWNER || process.env.GITHUB_OWNER || '',
).trim();
const PROJECT_SYNC_ENABLED = Number.isInteger(
  Number.parseInt(process.env.GITHUB_PROJECT_NUMBER || '', 10),
) && Number.parseInt(process.env.GITHUB_PROJECT_NUMBER || '', 10) > 0;
const CURRENT_INSTANCE_ID = resolveNexusInstanceId();
const CURRENT_INSTANCE_OWNER = resolveNexusInstanceOwner();
const WORKSPACE_INTEGRATION_MODE = resolveWorkspaceIntegrationMode(process.env);
const initialRuntimeState = loadRuntimeState();
const activeAgentRuns = new Map();
const preparingAgentRuns = new Map();
const queuedAgentRuns = new Map();
const agentLaneRuntime = new Map(
  (initialRuntimeState.laneSnapshots || [])
    .map((record) => rehydratePersistedLaneRecord(record))
    .filter(Boolean)
    .map((record) => [record.agentId, record]),
);
const recentLaneFailures = (initialRuntimeState.recentLaneFailures || [])
  .map((record) => rehydratePersistedLaneRecord(record))
  .filter(Boolean)
  .slice(0, OPERATIONAL_LANE_SNAPSHOT_LIMIT);
const primaryTaskRuntimeMeta = new Map(
  (initialRuntimeState.primaryTaskRuntimeMeta || []).map((entry) => {
    const { taskId, ...runtimeMeta } = entry || {};
    return [taskId, { ...runtimeMeta }];
  }),
);
let phaseReleaseReconciliationInFlight = null;
const warnedResumeIssues = new Set();
const ralphRuntimeState = {
  installed: false,
  disabled: false,
  failureCount: 0,
  lastFailureAt: null,
  lastFailureTaskId: null,
  disabledAt: null,
  disabledReason: null,
};
const persistedCollaborationSequenceFloor =
  initialRuntimeState.collaborationTasks.reduce((maxValue, task) => {
    const match = /^NX-HELP-(\d+)$/i.exec(String(task.id || '').trim());
    if (!match) return maxValue;
    return Math.max(maxValue, Number(match[1]) + 1);
  }, 1);
const persistedLocalPrimaryTaskSequenceFloor =
  (initialRuntimeState.localPrimaryTasks || []).reduce((maxValue, task) => {
    const match = /^NX-TASK-(\d+)$/i.exec(String(task?.id || '').trim());
    if (!match) return maxValue;
    return Math.max(maxValue, Number(match[1]) + 1);
  }, 1);
let projectContextCache = null;
let collaborationTaskSequence = Math.max(
  initialRuntimeState.collaborationTaskSequence || 1,
  persistedCollaborationSequenceFloor,
);
let collaborationTasks = initialRuntimeState.collaborationTasks || [];
let localPrimaryTaskSequence = Math.max(
  initialRuntimeState.localPrimaryTaskSequence || 1,
  persistedLocalPrimaryTaskSequenceFloor,
);
let syncTasksInFlight = null;
let autoDispatchTimer = null;
let projectBoardResyncPending = PROJECT_SYNC_ENABLED;
let laneEventSequence = Math.max(
  1,
  ...(initialRuntimeState.laneSnapshots || [])
    .flatMap((record) => (Array.isArray(record?.events) ? record.events : []))
    .map((event) => Number(event?.seq || 0) + 1)
    .filter(Number.isFinite),
);

app.use(express.static(FRONTEND_DIST_DIR));
app.use(cors());
app.use(express.json());

function resolveProjectContext(forceRefresh = false) {
  if (!forceRefresh && projectContextCache && fs.existsSync(projectContextCache.projectDir)) {
    return projectContextCache;
  }

  projectContextCache = discoverProjectContext({
    configuredProjectDir: process.env.PROJECT_DIR,
    strictProjectDir: process.env.NEXUS_PROJECT_DIR_STRICT,
    workspaceRoot: WORKSPACE_ROOT,
    owner: process.env.GITHUB_OWNER,
    repoName: process.env.GITHUB_REPO || path.basename(WORKSPACE_ROOT),
  });
  projectContextCache = {
    ...projectContextCache,
    instanceId: CURRENT_INSTANCE_ID,
    ownerId: CURRENT_INSTANCE_OWNER,
  };

  return projectContextCache;
}

function resolveProjectDir() {
  return resolveProjectContext().projectDir;
}

function buildCurrentTaskOwnership() {
  return buildTaskOwnershipMetadata({
    NEXUS_INSTANCE_ID: CURRENT_INSTANCE_ID,
    NEXUS_INSTANCE_OWNER: CURRENT_INSTANCE_OWNER,
  });
}

function formatAgentDisplayName(agent) {
  const baseName = String(agent?.name || agent?.id || 'Agent').trim() || 'Agent';
  const scopeLabel = String(CURRENT_INSTANCE_OWNER || CURRENT_INSTANCE_ID || '').trim();
  return scopeLabel ? `${baseName} @ ${scopeLabel}` : baseName;
}

function serializeAgentForClient(agent) {
  return {
    ...agent,
    ownerId: CURRENT_INSTANCE_OWNER,
    instanceId: CURRENT_INSTANCE_ID,
    displayName: formatAgentDisplayName(agent),
  };
}

function getVisibleAgents() {
  return agents.map((agent) => serializeAgentForClient(agent));
}

function resolvePrimaryTaskOwnerId(task) {
  return resolveTaskOwnerId(task);
}

function resolvePrimaryTaskOwnerInstanceId(task) {
  return resolveTaskInstanceId(task);
}

function resolveCurrentPrimaryTaskBaseBranch(projectContext) {
  const gitRoot = String(projectContext?.gitRoot || '').trim();
  if (!gitRoot) {
    return null;
  }

  return String(resolveTaskBranchBase(gitRoot, process.env) || '').trim() || null;
}

function resolvePrimaryTaskFailureBaseBranch(runtimeMeta) {
  const explicitFailureBaseBranch = String(runtimeMeta?.lastFailedBaseBranch || '').trim();
  if (explicitFailureBaseBranch) {
    return explicitFailureBaseBranch;
  }

  const failureMessage = String(runtimeMeta?.lastFailureMessage || '').trim();
  if (!failureMessage) {
    return null;
  }

  const syncTargetMatch = failureMessage.match(/\bsincronizou com ([A-Za-z0-9._/-]+)/i);
  if (syncTargetMatch && syncTargetMatch[1]) {
    return String(syncTargetMatch[1]).trim() || null;
  }

  return null;
}

function hasPrimaryTaskPublishedBaseMismatch(taskId, runtimeMeta, projectContext) {
  if (!taskId || isInternalTaskId(taskId)) {
    return false;
  }

  const currentBaseBranch = resolveCurrentPrimaryTaskBaseBranch(projectContext);
  const publishedBaseBranch = String(runtimeMeta?.publishedBaseBranch || '').trim();
  return Boolean(currentBaseBranch && publishedBaseBranch && currentBaseBranch !== publishedBaseBranch);
}

function shouldAutoResetStalePublishedPrimaryTaskBranch(task, runtimeMeta, projectContext) {
  if (!task || isInternalTaskId(task.id)) {
    return false;
  }

  if (resolveWorkspaceIntegrationMode(process.env) !== 'branch') {
    return false;
  }

  if (String(process.env.NEXUS_TASK_BRANCH_RESET_STALE_PUBLISHED || 'true').trim().toLowerCase() === 'false') {
    return false;
  }

  if (!['backlog', 'ready', 'in_progress'].includes(String(task.status || '').trim())) {
    return false;
  }

  if (!String(runtimeMeta?.publishedBranchRef || '').trim()) {
    return false;
  }

  if (Boolean(runtimeMeta?.publishedBranchIntegrated)) {
    return false;
  }

  if (String(runtimeMeta?.publishedBranchReason || '').trim() !== 'branch-has-unabsorbed-commits') {
    return false;
  }

  if (String(runtimeMeta?.lastLaneStatus || '').trim().toLowerCase() === 'running') {
    return false;
  }

  if (hasPrimaryTaskPublishedBaseMismatch(task.id, runtimeMeta, projectContext)) {
    return true;
  }

  return Boolean(resolveCurrentPrimaryTaskBaseBranch(projectContext));
}

function shouldForceFreshPrimaryTaskBranch(task, runtimeMeta, projectContext, retryCount = 0) {
  if (!task || isInternalTaskId(task.id)) {
    return false;
  }

  if (resolveWorkspaceIntegrationMode(process.env) !== 'branch') {
    return false;
  }

  if (Number(retryCount || 0) !== 0) {
    return false;
  }

  const lastFailureClass = String(runtimeMeta?.lastFailureClass || '').trim().toLowerCase();
  if (lastFailureClass === 'integration' || lastFailureClass === 'pipeline') {
    return true;
  }

  if (hasPrimaryTaskPublishedBaseMismatch(task.id, runtimeMeta, projectContext)) {
    return true;
  }

  return shouldAutoResetStalePublishedPrimaryTaskBranch(task, runtimeMeta, projectContext);
}

function isForeignOwnedPrimaryTask(task) {
  return Boolean(task && isTaskOwnedByForeignInstance(task, CURRENT_INSTANCE_ID));
}

function isCurrentInstancePrimaryTask(task) {
  return Boolean(task && isTaskOwnedByInstance(task, CURRENT_INSTANCE_ID));
}

function canCurrentInstanceManagePrimaryTask(task) {
  if (!task) return false;
  if (!isPrimaryActiveStatus(task.status)) return true;
  return !isForeignOwnedPrimaryTask(task);
}

function isPrimaryTaskDispatchBlocked(task) {
  if (!task || isInternalTaskId(task.id)) {
    return false;
  }
  if (!isPrimaryTaskPublishedBranchLocked(task)) {
    return false;
  }
  if (hasLivePrimaryTaskExecution(task.id)) {
    return false;
  }
  if (isPrimaryActiveStatus(task.status) && isForeignOwnedPrimaryTask(task)) {
    return false;
  }
  const runtimeMeta = getPrimaryTaskRuntimeMeta(task.id);
  const projectContext = resolveProjectContext();
  const hasPublishedBaseMismatch = hasPrimaryTaskPublishedBaseMismatch(
    task.id,
    runtimeMeta,
    projectContext,
  );
  const shouldAutoResetStalePublishedBranch = shouldAutoResetStalePublishedPrimaryTaskBranch(
    task,
    runtimeMeta,
    projectContext,
  );
  const forceFreshBranch = shouldForceFreshPrimaryTaskBranch(
    task,
    runtimeMeta,
    projectContext,
    0,
  );

  return shouldBlockPrimaryTaskDispatchDueToPublishedBranch(task, runtimeMeta, {
    hasLiveExecution: hasLivePrimaryTaskExecution(task.id),
    isForeignOwned: isPrimaryActiveStatus(task.status) && isForeignOwnedPrimaryTask(task),
    hasPublishedBaseMismatch,
    shouldAutoResetStalePublishedBranch,
    forceFreshBranch,
  });
}

function countCurrentInstancePrimaryImplementationFronts() {
  return countPrimaryImplementationFronts(
    githubTasks.filter((task) => {
      if (!canCurrentInstanceManagePrimaryTask(task)) {
        return false;
      }
      if (String(task?.status || '').trim() === 'ready') {
        return !isPrimaryTaskDispatchBlocked(task);
      }
      return String(task?.status || '').trim() === 'in_progress';
    }),
  );
}

function promoteNextDependencyReadyBacklogTask(completedTask, reason = 'dependency-unblocked') {
  if (resolveBacklogAutoDispatchEnabled(process.env)) {
    return [];
  }
  if (!resolveBacklogAutoPromotionEnabled(process.env)) {
    return [];
  }

  const promotedTasks = [];
  const primaryReadySlotTarget = resolvePrimaryReadySlotTarget(process.env);

  while (countCurrentInstancePrimaryImplementationFronts() < primaryReadySlotTarget) {
    const nextTask = selectNextDependencyReadyBacklogTask(githubTasks, {
      completedTask,
      canManageTask: canCurrentInstanceManagePrimaryTask,
    });
    if (!nextTask) {
      break;
    }

    const updatedTask = updatePrimaryTaskRecord(nextTask.id, {
      ...nextTask,
      status: 'ready',
      assignee: null,
      ...buildPrimaryTaskOwnershipPatch('ready'),
    });

    if (!updatedTask) {
      break;
    }

    syncPrimaryTaskStatus(updatedTask.id, updatedTask.status, updatedTask.assignee, reason);
    const sourceTaskLabel = completedTask?.id || completedTask?.backlogRef || null;
    io.emit('agent_log', {
      id: 'ceo',
      log: sourceTaskLabel
        ? `🧭 ${updatedTask.id} foi promovida automaticamente para Ready após a conclusão de ${sourceTaskLabel}.`
        : `🧭 ${updatedTask.id} foi promovida automaticamente para Ready via desbloqueio automático (${reason}).`,
    });
    promotedTasks.push(updatedTask);
  }

  return promotedTasks;
}

function resolvePrimaryTaskDependencyStartRefs(task) {
  if (WORKSPACE_INTEGRATION_MODE !== 'branch') {
    return [];
  }

  const projectContext = resolveProjectContext();
  const gitRoot = projectContext?.gitRoot || null;
  const baseBranch = gitRoot ? resolveTaskBranchBase(gitRoot, process.env) : null;

  const dependencyTokens = Array.isArray(task?.dependencies)
    ? task.dependencies
        .map((value) => normalizePrimaryTaskDependencyToken(value))
        .filter(Boolean)
    : [];
  if (dependencyTokens.length === 0) {
    return [];
  }

  const refs = [];
  dependencyTokens.forEach((dependencyToken) => {
    const completedDependencyTask = githubTasks
      .filter((candidate) => String(candidate?.status || '').trim() === 'done')
      .find((candidate) => collectPrimaryTaskDependencyKeys(candidate).has(dependencyToken));
    if (!completedDependencyTask) {
      return;
    }

    const dependencyBranch = buildTaskBranchName(
      {
        taskId: completedDependencyTask.id,
        taskTitle: completedDependencyTask.title,
      },
      process.env,
    );
    if (!dependencyBranch || refs.includes(dependencyBranch)) {
      return;
    }

    if (gitRoot && baseBranch) {
      const dependencyStartPlan = evaluateDependencyStartRefAgainstBase(
        gitRoot,
        baseBranch,
        dependencyBranch,
        process.env,
      );
      if (!dependencyStartPlan?.include) {
        return;
      }
    }

    refs.push(dependencyBranch);
  });

  return refs;
}

function buildPrimaryTaskOwnershipPatch(status, overrides = {}) {
  if (!isPrimaryActiveStatus(status)) {
    return {
      ownerId: null,
      ownerInstanceId: null,
    };
  }

  const currentOwnership = buildCurrentTaskOwnership();
  return {
    ownerId:
      Object.prototype.hasOwnProperty.call(overrides, 'ownerId')
        ? overrides.ownerId
        : currentOwnership.ownerId,
    ownerInstanceId:
      Object.prototype.hasOwnProperty.call(overrides, 'ownerInstanceId')
        ? overrides.ownerInstanceId
        : currentOwnership.ownerInstanceId,
  };
}

function truncateText(value, maxLength = 320) {
  const text = String(value || '').replace(/\s+/g, ' ').trim();
  if (!text) return null;
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function extractPromptErrorDetails(error) {
  const raw = String(error?.stderr || error?.message || '').trim();
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw);
    return truncateText(
      parsed?.error?.message || parsed?.message || parsed?.detail || raw,
      280,
    );
  } catch (_error) {
    return truncateText(raw, 280);
  }
}

function resolveHttpErrorStatus(error, fallback = 500) {
  const statusCode = Number(error?.statusCode || error?.status || 0);
  return statusCode >= 400 && statusCode < 600 ? statusCode : fallback;
}

function rehydratePersistedLaneRecord(record) {
  if (!record || typeof record !== 'object') return null;

  const agentId = String(record.agentId || '').trim();
  const laneId = String(record.laneId || '').trim();
  if (!agentId || !laneId) return null;

  const state = String(record.state || '').trim();
  const terminal = isTerminalLaneState(state);
  const now = new Date().toISOString();
  const normalizedState = terminal ? state : 'retry_scheduled';
  const normalizedDetail = terminal
    ? truncateText(record.detail, 320)
    : 'Execucao interrompida por reinicio do orquestrador; aguardando retomada segura.';

  return {
    ...record,
    agentId,
    laneId,
    state: normalizedState,
    detail: normalizedDetail,
    updatedAt: terminal ? record.updatedAt || now : now,
    finishedAt: terminal ? record.finishedAt || record.updatedAt || now : null,
    events: Array.isArray(record.events) ? record.events.slice(-LANE_EVENT_HISTORY_LIMIT) : [],
  };
}

function buildRoleExecutionPolicy(agent, options = {}) {
  return buildAgentRoleExecutionPolicy(agent, options);
}

function validateTaskPacket(packet) {
  return validateLaneTaskPacket(packet);
}

function normalizeTaskList(values, limit = 8) {
  const rawValues = Array.isArray(values)
    ? values
    : typeof values === 'string'
      ? values.split(/\r?\n|;/)
      : [];
  const normalized = [...new Set(
    rawValues
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];

  return normalized.slice(0, Math.max(1, limit));
}

function normalizeTaskTextField(value, limit = 4000) {
  const text = String(value || '').trim();
  if (!text) return null;
  return text.slice(0, Math.max(1, limit));
}

function normalizeTaskMetadataPayload(payload = {}) {
  const metadata = {
    backlogRef: normalizeTaskTextField(payload.backlogRef, 120),
    summary: normalizeTaskTextField(payload.summary, 1200),
    objective: normalizeTaskTextField(payload.objective, 2000),
    phase: normalizeTaskTextField(payload.phase, 80),
    suggestedSquad: normalizeTaskTextField(payload.suggestedSquad, 120),
    approvedScope: normalizeTaskList(payload.approvedScope || payload.scope, 12),
    acceptanceCriteria: normalizeTaskList(payload.acceptanceCriteria || payload.acceptance, 16),
    dependencies: normalizeTaskList(payload.dependencies, 12),
    externalAccessGaps: normalizeTaskList(payload.externalAccessGaps, 8),
    outOfScope: normalizeTaskList(payload.outOfScope, 10),
    executionRules: normalizeTaskList(payload.executionRules, 16),
  };

  return Object.fromEntries(
    Object.entries(metadata).filter(([, value]) =>
      Array.isArray(value) ? value.length > 0 : value !== null && value !== undefined,
    ),
  );
}

function mergeTaskLists(...lists) {
  return normalizeTaskList(lists.flat());
}

function formatTaskBriefList(values, limit = 6) {
  const normalized = normalizeTaskList(values, limit);
  if (normalized.length === 0) return null;
  return normalized.map((value) => `- ${value}`).join('\n');
}

function buildTaskScopeSummary(requestKind, taskId, parentTaskId, approvedScope = []) {
  const genericScope =
    requestKind === 'collaboration'
      ? `Subtarefa delimitada vinculada a ${parentTaskId || taskId || 'task principal'}`
      : `Entrega principal para ${taskId || 'task sem id'} no repositório atual`;
  const approvedLines = normalizeTaskList(approvedScope, 4);
  if (approvedLines.length === 0) {
    return genericScope;
  }

  return `${genericScope}. Recorte aprovado: ${approvedLines.join('; ')}`;
}

function resolveTaskPacketContext(taskId, options = {}) {
  const normalizedTaskId = String(taskId || '').trim() || null;
  const requestKind = String(options.requestKind || 'primary').trim() || 'primary';
  const visibleTask = normalizedTaskId ? findVisibleTask(normalizedTaskId) : null;
  const explicitParentTaskId = String(options.parentTaskId || '').trim() || null;
  const sourceTask =
    visibleTask &&
    isInternalTaskId(normalizedTaskId) &&
    visibleTask.source === 'github' &&
    visibleTask.sourceTaskId
      ? githubTasks.find((task) => task.id === visibleTask.sourceTaskId) || null
      : null;
  const directPrimaryTask =
    normalizedTaskId && !isInternalTaskId(normalizedTaskId)
      ? githubTasks.find((task) => task.id === normalizedTaskId) || null
      : null;
  const currentTask = sourceTask || visibleTask || directPrimaryTask || null;
  const parentTaskId =
    explicitParentTaskId ||
    (visibleTask && isInternalTaskId(normalizedTaskId) ? visibleTask.parentTaskId || null : null);
  const parentTask = parentTaskId
    ? githubTasks.find((task) => task.id === parentTaskId) || null
    : null;
  const includeParentContext = requestKind === 'collaboration';

  return {
    visibleTask,
    currentTask,
    parentTask,
    backlogRef:
      currentTask?.backlogRef ||
      parentTask?.backlogRef ||
      visibleTask?.parentTaskRef ||
      null,
    summary: currentTask?.summary || visibleTask?.summary || null,
    objective: currentTask?.objective || currentTask?.summary || parentTask?.objective || null,
    parentTaskRef:
      visibleTask?.parentTaskRef ||
      currentTask?.parentTaskRef ||
      parentTask?.backlogRef ||
      null,
    parentTaskTitle: parentTask?.title || null,
    parentObjective: parentTask?.objective || parentTask?.title || null,
    phase: currentTask?.phase || parentTask?.phase || null,
    suggestedSquad: currentTask?.suggestedSquad || parentTask?.suggestedSquad || null,
    approvedScope: mergeTaskLists(
      currentTask?.approvedScope,
      includeParentContext ? parentTask?.approvedScope : null,
    ),
    acceptanceCriteria: mergeTaskLists(
      currentTask?.acceptanceCriteria,
      includeParentContext ? parentTask?.acceptanceCriteria : null,
    ),
    dependencies: mergeTaskLists(
      currentTask?.dependencies,
      includeParentContext ? parentTask?.dependencies : null,
    ),
    externalAccessGaps: mergeTaskLists(
      currentTask?.externalAccessGaps,
      includeParentContext ? parentTask?.externalAccessGaps : null,
    ),
    outOfScope: mergeTaskLists(
      currentTask?.outOfScope,
      includeParentContext ? parentTask?.outOfScope : null,
    ),
    executionRules: mergeTaskLists(
      currentTask?.executionRules,
      includeParentContext ? parentTask?.executionRules : null,
    ),
    githubUrl: currentTask?.githubUrl || visibleTask?.githubUrl || parentTask?.githubUrl || null,
    githubNodeId:
      currentTask?.githubNodeId || visibleTask?.githubNodeId || parentTask?.githubNodeId || null,
    sourceTaskId: visibleTask?.sourceTaskId || null,
  };
}

function buildTaskBacklogBrief(taskPacket = {}) {
  const sections = [];
  const headerLines = [
    taskPacket.backlogRef ? `Backlog aprovado: ${taskPacket.backlogRef}` : null,
    taskPacket.phase ? `Fase: ${taskPacket.phase}` : null,
    taskPacket.suggestedSquad ? `Squad sugerido: ${taskPacket.suggestedSquad}` : null,
    taskPacket.parentTaskRef ? `Card pai: ${taskPacket.parentTaskRef}` : null,
    taskPacket.parentTaskTitle ? `Titulo do card pai: ${taskPacket.parentTaskTitle}` : null,
  ].filter(Boolean);

  if (headerLines.length > 0) {
    sections.push(headerLines.join('\n'));
  }

  if (taskPacket.summary && taskPacket.summary !== taskPacket.objective) {
    sections.push(`Resumo operacional:\n- ${taskPacket.summary}`);
  }

  if (taskPacket.parentObjective && taskPacket.parentObjective !== taskPacket.objective) {
    sections.push(`Objetivo do card pai:\n- ${taskPacket.parentObjective}`);
  }

  const approvedScope = formatTaskBriefList(taskPacket.approvedScope, 6);
  if (approvedScope) {
    sections.push(`Escopo aprovado:\n${approvedScope}`);
  }

  const acceptanceCriteria = formatTaskBriefList(taskPacket.acceptanceCriteria, 6);
  if (acceptanceCriteria) {
    sections.push(`Criterios de aceite do backlog:\n${acceptanceCriteria}`);
  }

  const executionRules = formatTaskBriefList(taskPacket.executionRules, 6);
  if (executionRules) {
    sections.push(`Regras de execucao declaradas:\n${executionRules}`);
  }

  const externalAccessGaps = formatTaskBriefList(taskPacket.externalAccessGaps, 5);
  if (externalAccessGaps) {
    sections.push(`Dependencias externas ainda pendentes:\n${externalAccessGaps}`);
  }

  const outOfScope = formatTaskBriefList(taskPacket.outOfScope, 5);
  if (outOfScope) {
    sections.push(`Fora de escopo explicito:\n${outOfScope}`);
  }

  if (sections.length === 0) return null;
  return `Contexto estruturado do backlog:\n${sections.join('\n\n')}`;
}

function isBootstrapFoundationPacket(taskPacket = {}) {
  const normalized = normalizeTaskText(
    [
      taskPacket.backlogRef,
      taskPacket.title,
      taskPacket.summary,
      taskPacket.objective,
    ]
      .filter(Boolean)
      .join(' '),
  );

  return (
    String(taskPacket.backlogRef || '').trim().toUpperCase() === 'GTMNY-001' ||
    (normalized.includes('bootstrap') &&
      normalized.includes('monorepo') &&
      normalized.includes('workspace'))
  );
}

function isBootstrapDocumentationPacket(taskPacket = {}) {
  const normalized = normalizeTaskText(
    [taskPacket.title, taskPacket.summary, taskPacket.objective].filter(Boolean).join(' '),
  );

  return (
    normalized.includes('documentar convencoes') ||
    (normalized.includes('validar') && normalized.includes('bootstrap')) ||
    normalized.includes('workspace conventions')
  );
}

function isFlutterFoundationPacket(taskPacket = {}) {
  const normalized = normalizeTaskText(
    [taskPacket.title, taskPacket.summary, taskPacket.objective].filter(Boolean).join(' '),
  );

  return (
    String(taskPacket.backlogRef || '').trim().toUpperCase() === 'GTMNY-002' ||
    normalized.includes('gtmny-002') ||
    (normalized.includes('flutter') &&
      (normalized.includes('shell') || normalized.includes('shells')) &&
      (normalized.includes('naveg') || normalized.includes('navigation') || normalized.includes('router')))
  );
}

function isDataModelingPacket(taskPacket = {}) {
  const normalized = normalizeTaskText(
    [taskPacket.backlogRef, taskPacket.title, taskPacket.summary, taskPacket.objective]
      .filter(Boolean)
      .join(' '),
  );

  return (
    String(taskPacket.backlogRef || '').trim().toUpperCase() === 'GTMNY-004' ||
    normalized.includes('gtmny-004') ||
    (normalized.includes('modelagem') && normalized.includes('migration'))
  );
}

function isGameFactoryPacket(taskPacket = {}) {
  const backlogRef = String(taskPacket.backlogRef || '').trim();
  if (/^GAME-\d+/i.test(backlogRef)) return true;

  const normalized = normalizeTaskText(
    [
      taskPacket.phase,
      taskPacket.title,
      taskPacket.summary,
      taskPacket.objective,
      Array.isArray(taskPacket.approvedScope) ? taskPacket.approvedScope.join(' ') : '',
    ]
      .filter(Boolean)
      .join(' '),
  );

  return (
    normalized.includes('autonomous game factory') ||
    normalized.includes('playable html5 game') ||
    normalized.includes('browser game')
  );
}

function listMissingBootstrapArtifacts(projectDir) {
  if (!projectDir) return [];

  return [
    '.editorconfig',
    '.env.example',
    'melos.yaml',
    'Makefile',
    'docs/WORKSPACE_CONVENTIONS.md',
    'scripts/bootstrap.sh',
    'apps/mobile/pubspec.yaml',
    'services/api/pyproject.toml',
  ].filter((relativePath) => !fs.existsSync(path.join(projectDir, relativePath)));
}

function listMissingFlutterFoundationArtifacts(projectDir) {
  if (!projectDir) return [];

  return [
    'apps/mobile/pubspec.yaml',
    'apps/mobile/lib/main.dart',
    'apps/mobile/lib/app/app.dart',
    'apps/mobile/lib/app/router/app_router.dart',
    'apps/mobile/lib/app/theme/app_theme.dart',
    'apps/mobile/lib/shell/responsive_shell.dart',
    'apps/mobile/lib/features/home/presentation/home_screen.dart',
    'apps/mobile/test/app_test.dart',
  ].filter((relativePath) => !fs.existsSync(path.join(projectDir, relativePath)));
}

function listMissingDataModelingArtifacts(projectDir) {
  if (!projectDir) return [];

  return [
    'services/api/alembic.ini',
    'services/api/alembic/env.py',
    'services/api/src/app/db/base.py',
    'services/api/src/app/db/models/__init__.py',
    'services/api/src/app/db/models/user.py',
    'services/api/src/app/db/models/profile.py',
    'services/api/src/app/db/models/interaction.py',
    'services/api/src/app/db/models/message.py',
  ].filter((relativePath) => !fs.existsSync(path.join(projectDir, relativePath)));
}

function buildInspectionRecoveryGuidance(taskPacket = {}, projectDir = '', options = {}) {
  const reviewMode = Boolean(options.reviewMode);

  if (reviewMode && isDataModelingPacket(taskPacket)) {
    return [
      'Immediate recovery plan for this data-modeling review lane:',
      '- Pare de pedir edição material; esta lane é de validação.',
      '- Revise apenas o diff e os arquivos relevantes em services/api.',
      '- Rode `make check` na raiz.',
      '- Em `services/api`, prepare `.venv` local se necessário, rode `python -m pip install -e .[dev]`, depois `python -m pytest tests/test_*models.py -vv -s`.',
      '- Valide a migration com `DATABASE_URL=sqlite+pysqlite:////tmp/example_gh4_review.db alembic upgrade head` e depois `alembic downgrade base` no mesmo banco temporário.',
      `- Se houver falha material, registre a evidência e emita exatamente ${RALPH_REJECTION_MARKER} em linha isolada.`,
    ].join('\n');
  }

  if (reviewMode && isFlutterFoundationPacket(taskPacket)) {
    return [
      'Immediate recovery plan for this Flutter review lane:',
      '- Esta lane é de validação, não de implementação.',
      '- Leia apenas os arquivos Flutter realmente tocados pela task.',
      '- Rode `flutter analyze`, `flutter test` e `flutter build web` em `apps/mobile`.',
      `- Se encontrar falha material, registre a evidência e emita exatamente ${RALPH_REJECTION_MARKER} em linha isolada.`,
    ].join('\n');
  }

  if (reviewMode) {
    return [
      'Immediate recovery plan for this review lane:',
      '- Esta lane é de validação, não de implementação.',
      '- Leia apenas o contexto mínimo, rode os checks relevantes e decida aprovar ou reprovar.',
      `- Para aprovar, emita exatamente ${RALPH_COMPLETION_MARKER} em linha isolada.`,
      `- Para reprovar por falha material, emita exatamente ${RALPH_REJECTION_MARKER} em linha isolada depois de registrar a evidência.`,
    ].join('\n');
  }

  if (isBootstrapFoundationPacket(taskPacket)) {
    const missingArtifacts = listMissingBootstrapArtifacts(projectDir);
    const candidateLine =
      missingArtifacts.length > 0
        ? `- Create at least one real scaffold artifact now. Strong candidates currently missing: ${missingArtifacts.slice(0, 8).join(', ')}.`
        : '- Create or update one real scaffold artifact now in the root workspace or documentation.';

    return [
      'Immediate recovery plan for this bootstrap foundation task:',
      candidateLine,
      '- Lightweight workspace manifests and conventions are in scope for GTMNY-001.',
      '- Do not read more backlog files before the next edit.',
      '- After editing, run the smallest relevant validation for the new artifact.',
    ].join('\n');
  }

  if (isBootstrapDocumentationPacket(taskPacket)) {
    return [
      'Immediate recovery plan for this bootstrap documentation task:',
      '- Edit README.md or docs/WORKSPACE_CONVENTIONS.md now.',
      '- Document naming rules, directory ownership, environment strategy and bootstrap validation steps tied to real files.',
      '- If the primary lane has not finished every artifact yet, draft the conventions/checklist skeleton instead of reading more backlog files.',
    ].join('\n');
  }

  if (isFlutterFoundationPacket(taskPacket)) {
    const missingArtifacts = listMissingFlutterFoundationArtifacts(projectDir);
    const candidateLine =
      missingArtifacts.length > 0
        ? `- Crie agora o scaffold Flutter real. Fortes candidatos ainda ausentes: ${missingArtifacts.slice(0, 8).join(', ')}.`
        : '- Atualize agora o scaffold Flutter existente com navegação, shell responsivo e tema base.';

    return [
      'Immediate recovery plan for this Flutter foundation task:',
      candidateLine,
      '- Esta issue é de implementação real do app Flutter, não de rediscovery do backlog.',
      '- Pare de reler docs/BACKLOG_CATALOG.md, docs/ACCESS_MATRIX.md e ops/backlog_seed.json antes da próxima edição.',
      '- Mantenha o escopo somente em bootstrap do app, shell mobile/web, roteamento base, tema e uma home placeholder.',
      '- Depois da primeira edição material, rode `cd apps/mobile && flutter pub get`, `flutter analyze` e `flutter test`.',
    ].join('\n');
  }

  if (isDataModelingPacket(taskPacket)) {
    const missingArtifacts = listMissingDataModelingArtifacts(projectDir);
    const candidateLine =
      missingArtifacts.length > 0
        ? `- Implemente agora a modelagem real do backend. Fortes candidatos ainda ausentes: ${missingArtifacts.slice(0, 8).join(', ')}.`
        : '- Edite agora a modelagem existente em services/api/alembic e services/api/src/app/db para fechar entidades e migrations iniciais.';

    return [
      'Immediate recovery plan for this data-modeling task:',
      candidateLine,
      '- Esta issue é de modelagem e migrations reais, não de rediscovery do backlog ou leitura repetida do scaffold da API.',
      '- Pare de reler docs/BACKLOG_CATALOG.md, ops/backlog_seed.json e arquivos estruturais fora de services/api antes da próxima edição.',
      '- Mantenha o escopo somente em usuários, perfis, preferências, fotos, interações, mensagens e base local de migrations.',
      '- Depois da primeira edição material, rode `make check` e `cd services/api && . .venv/bin/activate && python -m pytest tests/test_health.py -vv -s`.',
    ].join('\n');
  }

  if (isGameFactoryPacket(taskPacket)) {
    const scope = Array.isArray(taskPacket.approvedScope) ? taskPacket.approvedScope.join('; ') : '';
    return [
      'Immediate recovery plan for this game factory task:',
      '- Stop inspecting. Create the requested game files now with write_file/edit_file.',
      scope
        ? `- Required files from approved scope: ${scope}.`
        : '- Required files: games/<slug>/index.html, games/<slug>/manifest.json, games/<slug>/README.md, and games/index.json.',
      '- Prefer small complete files: index.html shell, style.css, and game.js. Do not cram the whole game into one oversized HTML response.',
      '- Create at least one real local visual asset under games/<slug>/assets/ and list it in manifest.json assets.',
      '- Create CrazyGames cover files under games/<slug>/crazygames/: cover-landscape.png, cover-portrait.png, cover-square.png, and declare them in manifest.json crazyGames.covers. Use `node scripts/create-raster-asset.mjs ...` for valid PNG placeholders.',
      '- Add defensive CrazyGames SDK lifecycle calls when available: gameplayStart on active play, gameplayStop on pause/menu/game over; local offline play must still work.',
      '- Plan image assets with Qwen-Image-2512 first: `node scripts/create-asset-request.mjs <slug> image hero-background "<polished game art prompt>"`.',
      '- Plan 3D assets with TRELLIS.2 only when useful: `node scripts/create-asset-request.mjs <slug> 3d main-prop "<single foreground object prompt>"`. On this 16GB VRAM machine, use reduced resolution locally or remote/Azure for high-fidelity assets.',
      '- Use write_file directly for the first file; it creates parent directories automatically.',
      '- Every file you write must be complete, not a partial chunk. Keep each CSS/JS/HTML file concise enough for one response.',
      '- Hard file budgets for local Qwen aliases: index.html <= 2600 chars, style.css <= 3600 chars, game.js <= 5200 chars, manifest.json <= 1200 chars.',
      '- After manifest.json exists, run `node scripts/sync-game-catalog.mjs <slug>` instead of hand-editing games/index.json.',
      '- The validator rejects incomplete HTML: index.html must end with </html>, include body and script, and avoid network URLs except the optional CrazyGames SDK.',
      '- The validator also rejects games without local visual assets, active loop, controls, score/progress and restart flow.',
      '- Do not repeatedly rewrite index.html. Required order: asset -> covers -> game files -> manifest/README -> catalog sync -> npm test -> npm run quality -> npm run crazygames:check -> npm run build.',
      '- After the files exist, run `npm test`, `npm run quality`, `npm run crazygames:check` and then `npm run build` from the workspace root.',
    ].join('\n');
  }

  return null;
}

function buildTaskKickoffPlan(taskPacket = {}, projectDir = '', options = {}) {
  const reviewMode = Boolean(options.reviewMode);
  const suggestedVerificationCommands = reviewMode
    ? buildSuggestedVerificationCommands(projectDir)
    : [];

  if (reviewMode && isDataModelingPacket(taskPacket)) {
    return [
      'Plano de início recomendado para esta review de modelagem:',
      '- Leia apenas README.md, docs/PROJECT_SCOPE.md, services/api/README.md e os arquivos realmente tocados em services/api.',
      '- Confirme o recorte do baseline de domínio e a migration entregue.',
      '- Rode `make check`, depois valide pytest de modelos e alembic upgrade/downgrade em SQLite temporário.',
      `- Se a entrega passar, aprove emitindo ${RALPH_COMPLETION_MARKER}; se falhar materialmente, reprove emitindo ${RALPH_REJECTION_MARKER}.`,
    ].join('\n');
  }

  if (reviewMode && isFlutterFoundationPacket(taskPacket)) {
    return [
      'Plano de início recomendado para esta review Flutter:',
      '- Leia apenas os arquivos do app realmente tocados pela task.',
      '- Rode `flutter analyze`, `flutter test` e `flutter build web` em `apps/mobile`.',
      `- Aprove apenas com ${RALPH_COMPLETION_MARKER}; reprove com ${RALPH_REJECTION_MARKER} se houver falha material.`,
    ].join('\n');
  }

  if (reviewMode) {
    return [
      'Plano de início recomendado para esta lane de review:',
      '- Leia apenas o contexto mínimo e os arquivos realmente relevantes.',
      '- Defina a menor estratégia de validação completa para esta entrega.',
      suggestedVerificationCommands.length > 0
        ? `- Priorize estes checks do workspace: ${suggestedVerificationCommands.map((command) => `\`${command}\``).join(', ')}.`
        : '- Rode pelo menos um check material de verdade antes de aprovar.',
      '- Rode os checks locais relevantes e decida com base em evidência.',
      '- Aprovação sem pelo menos um check material bem-sucedido será rejeitada automaticamente.',
      `- Aprove apenas com ${RALPH_COMPLETION_MARKER}; reprove apenas com ${RALPH_REJECTION_MARKER}.`,
    ].join('\n');
  }

  if (isBootstrapFoundationPacket(taskPacket)) {
    const missingArtifacts = listMissingBootstrapArtifacts(projectDir);
    const artifactLine =
      missingArtifacts.length > 0
        ? `- Crie imediatamente um artefato estrutural real desta lista: ${missingArtifacts.slice(0, 6).join(', ')}.`
        : '- Crie ou atualize imediatamente um artefato estrutural real do workspace.';

    return [
      'Plano de início recomendado para esta task de fundação:',
      '- Leia README.md e docs/PROJECT_SCOPE.md uma única vez para alinhar o escopo.',
      artifactLine,
      '- Mantenha o artefato mínimo, estrutural e sem implementar feature de produto.',
      '- Rode o menor check relevante depois da edição e continue a partir do diff real.',
    ].join('\n');
  }

  if (isBootstrapDocumentationPacket(taskPacket)) {
    return [
      'Plano de início recomendado para esta subtarefa de documentação/validação:',
      '- Leia somente os arquivos que vai documentar agora.',
      '- Atualize README.md ou docs/WORKSPACE_CONVENTIONS.md com naming, ownership dos diretórios, ambientes e passos de validação.',
      '- Se a lane principal ainda não criou todos os artefatos, documente o checklist e o esqueleto esperado em vez de voltar ao backlog.',
    ].join('\n');
  }

  if (isFlutterFoundationPacket(taskPacket)) {
    const missingArtifacts = listMissingFlutterFoundationArtifacts(projectDir);
    const artifactLine =
      missingArtifacts.length > 0
        ? `- Crie imediatamente estes artefatos base do app Flutter: ${missingArtifacts.slice(0, 6).join(', ')}.`
        : '- Atualize imediatamente o scaffold Flutter existente com shell responsivo, router e tema base.';

    return [
      'Plano de início recomendado para esta task Flutter de fundação:',
      '- Leia apenas README.md, docs/PROJECT_SCOPE.md e apps/mobile/README.md para alinhar o escopo.',
      artifactLine,
      '- Entregue um app mínimo mas executável, com home placeholder e pontos de extensão claros para design system.',
      '- Não volte para backlog/catalog/access matrix antes de existir diff real em apps/mobile.',
      '- Rode `flutter pub get`, `flutter analyze` e `flutter test` dentro de apps/mobile após editar.',
    ].join('\n');
  }

  if (isDataModelingPacket(taskPacket)) {
    const missingArtifacts = listMissingDataModelingArtifacts(projectDir);
    const artifactLine =
      missingArtifacts.length > 0
        ? `- Crie imediatamente estes artefatos base de modelagem: ${missingArtifacts.slice(0, 6).join(', ')}.`
        : '- Atualize imediatamente a modelagem existente em services/api/alembic e services/api/src/app/db.';

    return [
      'Plano de início recomendado para esta task de modelagem:',
      '- Leia apenas README.md, docs/PROJECT_SCOPE.md e services/api/README.md para alinhar o escopo.',
      artifactLine,
      '- Entregue somente entidades principais do MVP e migrations locais coerentes para Postgres/Supabase.',
      '- Não volte para backlog/catalog/access matrix antes de existir diff real em services/api.',
      '- Rode `make check` e os testes locais do serviço após editar.',
    ].join('\n');
  }

  if (isGameFactoryPacket(taskPacket)) {
    const scope = Array.isArray(taskPacket.approvedScope) ? taskPacket.approvedScope.join('; ') : '';
    return [
      'Plano de início recomendado para esta task de game factory:',
      '- Leia no máximo games/index.json e package.json.',
      scope
        ? `- Em seguida crie imediatamente estes arquivos com write_file/edit_file: ${scope}.`
        : '- Em seguida crie imediatamente games/<slug>/index.html, manifest.json, README.md e assets/*.png.',
      '- Prefira arquivos pequenos e completos: index.html, style.css e game.js. Nao coloque o jogo inteiro em um HTML gigante.',
      '- Crie capas CrazyGames em games/<slug>/crazygames/: cover-landscape.png, cover-portrait.png e cover-square.png, e declare em manifest.json crazyGames.covers. Use `node scripts/create-raster-asset.mjs ...` para placeholders PNG validos.',
      '- Integre chamadas defensivas do SDK CrazyGames quando disponivel: gameplayStart ao iniciar/resumir e gameplayStop em pause/menu/game over; o jogo local offline deve continuar funcionando.',
      '- Planeje assets 2D com Qwen-Image-2512 primeiro: `node scripts/create-asset-request.mjs <slug> image hero-background "<prompt visual de alta qualidade>"`.',
      '- Planeje assets 3D com TRELLIS.2 apenas quando agregar gameplay ou producao: `node scripts/create-asset-request.mjs <slug> 3d main-prop "<prompt de objeto unico>"`. Nesta GPU 16GB, use resolucao reduzida local ou remoto/Azure para alta fidelidade.',
      '- Depois que manifest.json existir, rode `node scripts/sync-game-catalog.mjs <slug>` para atualizar games/index.json de forma deterministica.',
      '- Nao use bash/redirecionamento para criar arquivos de jogo; use write_file/edit_file. Bash fica para scripts deterministicos, `npm test` e `npm run build`.',
      '- Cada arquivo escrito deve estar completo em uma chamada write_file; nao entregue arquivo parcial.',
      '- Limites duros para caber nos aliases locais: index.html <= 2600 chars, style.css <= 3600 chars, game.js <= 5200 chars, manifest.json <= 1200 chars.',
      '- O validador reprova HTML incompleto: termine com </html>, inclua body/script e nao use URLs externas exceto o SDK opcional da CrazyGames.',
      '- O validador tambem reprova jogo sem asset local declarado, loop ativo, controles, pontuacao/progresso e fluxo de restart.',
      '- Nao reescreva index.html em loop: siga asset -> capas -> arquivos do jogo -> manifest/README -> catalog sync -> npm test -> npm run quality -> npm run crazygames:check -> npm run build.',
      '- O primeiro artefato deve ser um jogo jogável self-contained, não uma página explicativa.',
    ].join('\n');
  }

  return null;
}

function resolveTaskSpecificReadOnlyLimit(taskPacket = {}, options = {}) {
  if (options.reviewMode) {
    return null;
  }

  if (isFlutterFoundationPacket(taskPacket)) {
    return 1;
  }

  if (isDataModelingPacket(taskPacket)) {
    return 2;
  }

  if (isBootstrapFoundationPacket(taskPacket) || isBootstrapDocumentationPacket(taskPacket)) {
    return 2;
  }

  if (isGameFactoryPacket(taskPacket)) {
    return 1;
  }

  return null;
}

function buildRecoveryRecipe(failureClass, detail = '', context = {}) {
  return resolveRecoveryRecipe(failureClass, detail, {
    ...context,
    transientRetryLimit: TRANSIENT_MODEL_RETRY_LIMIT,
    commandRecoveryLimit: COMMAND_PARSING_RECOVERY_LIMIT,
  });
}

function normalizeFailureClass(failureClass, detail = '') {
  return normalizeLaneFailureClass(failureClass, detail);
}

function normalizeRecoverySteps(steps) {
  if (!Array.isArray(steps)) return [];

  return steps
    .map((step) => String(step || '').trim())
    .filter(Boolean);
}

function buildRecoverySnapshot(recipe, overrides = {}) {
  const overrideData = overrides && typeof overrides === 'object' ? overrides : {};
  const rawFailureClass = String(
    overrideData.failureClass !== undefined ? overrideData.failureClass : recipe?.failureClass || '',
  ).trim();
  const maxAttemptsValue =
    overrideData.maxAttempts !== undefined ? Number(overrideData.maxAttempts) : Number(recipe?.maxAttempts);
  const attemptValue = Number(overrideData.attempt);
  const resultValue = truncateText(overrideData.result, 120);
  const steps = normalizeRecoverySteps(
    overrideData.steps !== undefined ? overrideData.steps : recipe?.steps,
  );

  const hasUsefulFields = Boolean(
    recipe ||
      overrideData.scenario ||
      overrideData.failureClass ||
      steps.length > 0 ||
      Number.isFinite(maxAttemptsValue) ||
      Number.isFinite(attemptValue) ||
      resultValue ||
      overrideData.escalated === true ||
      overrideData.escalated === false,
  );
  if (!hasUsefulFields) {
    return null;
  }

  return {
    scenario: String(overrideData.scenario || recipe?.scenario || '').trim() || null,
    failureClass: rawFailureClass ? normalizeFailureClass(rawFailureClass, '') : null,
    maxAttempts: Number.isFinite(maxAttemptsValue) ? Math.max(1, Math.trunc(maxAttemptsValue)) : null,
    escalationPolicy:
      String(overrideData.escalationPolicy || recipe?.escalationPolicy || '').trim() || null,
    steps,
    attempt: Number.isFinite(attemptValue) ? Math.max(1, Math.trunc(attemptValue)) : null,
    result: resultValue || null,
    escalated:
      overrideData.escalated === true
        ? true
        : overrideData.escalated === false
          ? false
          : resultValue === 'escalated',
  };
}

function extractRecoveryMetadataFromLaneRecord(record) {
  const latestEvent = Array.isArray(record?.events) ? record.events[record.events.length - 1] : null;
  const eventData = latestEvent?.data && typeof latestEvent.data === 'object' ? latestEvent.data : null;
  return eventData?.recovery && typeof eventData.recovery === 'object' ? eventData.recovery : null;
}

function withRecoveryRecipe(record) {
  if (!record) return null;

  const eventRecovery = extractRecoveryMetadataFromLaneRecord(record);
  const failureClass =
    record.failureClass || eventRecovery?.failureClass || record.packet?.failureClass || null;
  if (!failureClass && !eventRecovery && record.state !== 'failed' && record.state !== 'retry_scheduled') {
    return record;
  }

  const recoveryRecipe = failureClass
    ? buildRecoveryRecipe(failureClass, record.failureMessage || record.detail || '', {
        state: record.state,
        requestKind: record.requestKind,
        taskId: record.taskId,
      })
    : null;
  const recovery = buildRecoverySnapshot(recoveryRecipe, eventRecovery || {});
  if (!recovery) {
    return record;
  }

  return {
    ...record,
    recovery,
  };
}

function buildTaskPacket(agent, taskTitle, taskId = null, options = {}) {
  const trimmedTask = String(taskTitle || '').replace(/\s+/g, ' ').trim();
  const requestKind = options.requestKind || 'primary';
  const requester = options.requestedBy ? findAgentById(options.requestedBy) : null;
  const reviewMode = isReviewTaskTitle(trimmedTask) || options.taskStatus === 'in_review';
  const taskContext = resolveTaskPacketContext(taskId, options);
  const projectContext = resolveProjectContext();
  const repoName = path.basename(projectContext.projectDir || WORKSPACE_ROOT);
  const acceptanceTests = mergeTaskLists(
    buildRoleAcceptanceTests(agent, {
      reviewMode,
      requestKind,
      taskTitle: trimmedTask,
    }),
    taskContext.acceptanceCriteria,
  );
  const skillIds = normalizeSkillList(options.skillIds);
  const runtimeTargets = Array.isArray(options.runtimeTargets)
    ? options.runtimeTargets
        .map((entry) => String(entry || '').trim())
        .filter(Boolean)
    : [];
  const branchIntegrationMode = WORKSPACE_INTEGRATION_MODE === 'branch';
  const packet = {
    packetId: options.requestId || `${agent?.id || 'agent'}:${taskId || trimmedTask || 'task'}`,
    taskId: taskId || null,
    title: trimmedTask || null,
    requestKind,
    phase: reviewMode ? 'review' : 'implementation',
    boardStatus:
      options.taskStatus ||
      taskContext.visibleTask?.status ||
      taskContext.currentTask?.status ||
      taskContext.parentTask?.status ||
      null,
    assigneeId: agent?.id || null,
    agentRole: agent?.role || null,
    parentTaskId: options.parentTaskId || null,
    requestedBy: requester
      ? {
          id: requester.id,
          name: requester.name || requester.id,
          role: requester.role || null,
        }
      : null,
    objective: taskContext.objective || trimmedTask || 'Executar task atribuida',
    scope: buildTaskScopeSummary(
      requestKind,
      taskId,
      options.parentTaskId || taskContext.parentTaskRef || taskContext.parentTaskTitle,
      taskContext.approvedScope,
    ),
    repo: repoName,
    branchPolicy:
      branchIntegrationMode
        ? 'Trabalhe apenas no workspace isolado do Nexus e mantenha a entrega compatível com a branch da task; não sobrescreva mudanças externas nem altere arquivos fora do escopo.'
        : 'Trabalhe apenas no workspace isolado do Nexus; não sobrescreva mudanças externas nem altere arquivos fora do escopo.',
    acceptanceTests,
    commitPolicy:
      requestKind === 'collaboration'
        ? 'Entregue um resultado reaproveitavel no recorte combinado; a integracao final fica com o agente solicitante ou com o Nexus.'
        : branchIntegrationMode
          ? 'Produza mudanças materiais integráveis; a integração final é feita pelo Nexus na branch da task e publicada no remoto ao concluir a lane.'
          : 'Produza mudanças materiais integráveis; a integração final é feita pelo Nexus ao concluir a lane.',
    reportingContract:
      reviewMode
        ? `Use REQUEST_HELP apenas para subtarefas objetivas. Em review, aprove emitindo ${RALPH_COMPLETION_PROMISE} somente no fechamento real e reprove emitindo ${RALPH_REJECTION_PROMISE} somente quando houver falha material comprovada. Se faltar credencial, acesso, aprovacao, segredo, ambiente externo ou decisao humana sem a qual o recorte nao pode ser concluido com seguranca, pare e emita ${RALPH_ADMIN_PENDING_PROMISE} em uma linha separada.`
        : `Use REQUEST_HELP apenas para subtarefas objetivas e emita ${RALPH_COMPLETION_PROMISE} somente no fechamento real. Se faltar credencial, acesso, aprovacao, segredo, ambiente externo ou decisao humana sem a qual o recorte nao pode ser concluido com seguranca, pare e emita ${RALPH_ADMIN_PENDING_PROMISE} em uma linha separada.`,
    escalationPolicy:
      'Escalone apenas em ambiguidade destrutiva, bloqueio operacional real ou risco de perda de trabalho.',
    recoveryHint: options.recoveryHint ? truncateText(options.recoveryHint, 280) : null,
    collaborationScope:
      requestKind === 'collaboration' ? 'bounded_subtask' : 'primary_delivery',
    backlogRef: taskContext.backlogRef,
    summary: taskContext.summary,
    sourceTaskId: taskContext.sourceTaskId,
    parentTaskRef: taskContext.parentTaskRef,
    parentTaskTitle: taskContext.parentTaskTitle,
    parentObjective: taskContext.parentObjective,
    phase: taskContext.phase,
    suggestedSquad: taskContext.suggestedSquad,
    approvedScope: taskContext.approvedScope,
    acceptanceCriteria: taskContext.acceptanceCriteria,
    dependencies: taskContext.dependencies,
    externalAccessGaps: taskContext.externalAccessGaps,
    outOfScope: taskContext.outOfScope,
    executionRules: taskContext.executionRules,
    githubUrl: taskContext.githubUrl,
    githubNodeId: taskContext.githubNodeId,
    skillIds,
    runtimeTargets,
    acceptance:
      reviewMode
        ? [
            'Validar a entrega ponta a ponta.',
            'Rodar checks relevantes e registrar evidencias do resultado.',
            'Se houver falha material, reprovar e devolver para implementacao em vez de reimplementar.',
            'Concluir apenas quando o card puder seguir para done sem pendencias.',
            `Emitir ${RALPH_COMPLETION_PROMISE} apenas para aprovar no fechamento real.`,
            `Emitir ${RALPH_REJECTION_PROMISE} apenas para reprovar com evidencia material.`,
            `Emitir ${RALPH_ADMIN_PENDING_PROMISE} quando faltar acao humana/admin sem a qual o card nao pode prosseguir com seguranca.`,
          ]
        : requestKind === 'collaboration'
          ? [
              'Executar checks locais relevantes para a subtarefa.',
              'Entregar um resultado reaproveitavel para o agente solicitante.',
              'Nao extrapolar o escopo delimitado da colaboracao.',
              `Emitir ${RALPH_COMPLETION_PROMISE} apenas no fechamento real.`,
              `Se a subtarefa depender de acao humana/admin para seguir, emitir ${RALPH_ADMIN_PENDING_PROMISE} e explicar o bloqueio.`,
            ]
        : [
            'Implementar a task de ponta a ponta no workspace atual.',
            'Rodar checks locais relevantes.',
            branchIntegrationMode
              ? 'Integrar mudanças materiais na branch da task e publicar o resultado.'
              : 'Integrar mudanças materiais ao repositório principal.',
            `Emitir ${RALPH_COMPLETION_PROMISE} apenas no fechamento real.`,
            `Emitir ${RALPH_ADMIN_PENDING_PROMISE} quando a task depender de acao humana/admin sem caminho tecnico seguro para concluir o recorte.`,
          ],
  };

  const validationErrors = validateTaskPacket(packet);
  if (validationErrors.length > 0) {
    packet.validationErrors = validationErrors;
  }

  return packet;
}

function isTerminalLaneState(state) {
  return ['completed', 'failed', 'cancelled'].includes(String(state || '').trim());
}

function serializeLaneRecord(record) {
  if (!record) return null;

  return {
    laneId: record.laneId,
    agentId: record.agentId,
    instanceId: record.instanceId || CURRENT_INSTANCE_ID,
    agentName: record.agentName,
    agentRole: record.agentRole,
    taskId: record.taskId,
    taskTitle: record.taskTitle,
    requestKind: record.requestKind,
    state: record.state,
    detail: record.detail || null,
    updatedAt: record.updatedAt,
    startedAt: record.startedAt || null,
    finishedAt: record.finishedAt || null,
    retryCount: Number(record.retryCount || 0),
    commandRecoveryCount: Number(record.commandRecoveryCount || 0),
    failureClass: record.failureClass || null,
    failureMessage: record.failureMessage || null,
    packet: record.taskPacket || null,
    events: Array.isArray(record.events) ? record.events.slice(-4) : [],
  };
}

function resolveLaneRuntimeTarget(record) {
  if (!record) return null;

  const events = Array.isArray(record.events) ? record.events : [];
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const data = events[index]?.data;
    const runtimeTarget = [
      data?.currentRuntimeTarget,
      data?.initialRuntimeTarget,
      data?.primaryRuntimeTarget,
    ]
      .map((value) => String(value || '').trim())
      .find(Boolean);
    if (runtimeTarget) {
      return runtimeTarget;
    }
  }

  return Array.isArray(record.taskPacket?.runtimeTargets)
    ? record.taskPacket.runtimeTargets
        .map((value) => String(value || '').trim())
        .find(Boolean) || null
    : null;
}

function countActiveRuntimeTargets() {
  const counts = new Map();

  agentLaneRuntime.forEach((record) => {
    if (!record || isTerminalLaneState(record.state)) return;
    const runtimeTarget = resolveLaneRuntimeTarget(record);
    if (!runtimeTarget) return;
    counts.set(runtimeTarget, Number(counts.get(runtimeTarget) || 0) + 1);
  });

  return counts;
}

function patchAgentFieldsIfChanged(agentId, patch = {}) {
  const agent = findAgentById(agentId);
  if (!agent) return false;

  const patchEntries = Object.entries(patch);
  if (patchEntries.length === 0) return false;

  const changed = patchEntries.some(([key, value]) => agent[key] !== value);
  if (!changed) return false;

  agents = agents.map((candidate) =>
    candidate.id === agentId ? { ...candidate, ...patch } : candidate,
  );
  io.emit('agents_update', getVisibleAgents());
  refreshOperationalMetrics();
  return true;
}

function setAgentLaneState(agentId, runRequest, state, detail, extra = {}) {
  const agent = findAgentById(agentId);
  if (!agent) return null;

  const now = new Date().toISOString();
  const previous = agentLaneRuntime.get(agentId) || null;
  const nextTaskId = runRequest?.taskId || previous?.taskId || null;
  const nextRequestKind = runRequest?.requestKind || previous?.requestKind || 'primary';
  const nextDetail = truncateText(detail || extra.detail || '', 320);
  const requestedRequestId = runRequest?.requestId || null;
  const laneIdentity = evaluateLaneRecordIdentity({
    previous,
    agentId,
    requestId: requestedRequestId,
    taskId: nextTaskId,
    requestKind: nextRequestKind,
  });
  const laneBaseline = laneIdentity.canReuseRuntimeState ? previous : null;
  const nextRequestId = requestedRequestId || laneBaseline?.requestId || null;
  const sameLane = Boolean(laneBaseline);

  const nextFailureClass =
    extra.failureClass !== undefined
      ? extra.failureClass
      : state === 'failed'
        ? laneBaseline?.failureClass || 'unknown'
        : null;
  const nextFailureMessage =
    extra.failureMessage !== undefined
      ? truncateText(extra.failureMessage, 220)
      : state === 'failed'
        ? nextDetail
        : null;
  const nextRetryCount = Number.isFinite(Number(extra.retryCount))
    ? Number(extra.retryCount)
    : Number(runRequest?.retryCount || laneBaseline?.retryCount || 0);
  const nextCommandRecoveryCount = Number.isFinite(Number(extra.commandRecoveryCount))
    ? Number(extra.commandRecoveryCount)
    : Number(runRequest?.commandRecoveryCount || laneBaseline?.commandRecoveryCount || 0);
  const customEventData =
    extra.data && typeof extra.data === 'object' && !Array.isArray(extra.data) ? extra.data : null;
  const customRecoveryData =
    extra.recovery && typeof extra.recovery === 'object'
      ? extra.recovery
      : customEventData?.recovery && typeof customEventData.recovery === 'object'
        ? customEventData.recovery
        : null;
  const requestedEventName = String(extra.eventName || extra.event || '').trim() || null;
  const requestedEventStatus = String(extra.eventStatus || extra.status || '').trim() || null;

  const taskPacket = buildTaskPacket(
    agent,
    runRequest?.taskTitle || laneBaseline?.taskTitle || '',
    nextTaskId,
    {
      ...(laneBaseline?.taskPacket || {}),
      ...(runRequest || {}),
      taskStatus: extra.taskStatus || runRequest?.taskStatus || laneBaseline?.taskPacket?.boardStatus,
    },
  );
  const recoveryRecipe = nextFailureClass
    ? buildRecoveryRecipe(nextFailureClass, nextFailureMessage || nextDetail || '', {
        taskId: nextTaskId,
        requestKind: nextRequestKind,
        taskStatus:
          extra.taskStatus || runRequest?.taskStatus || laneBaseline?.taskPacket?.boardStatus || null,
      })
    : null;
  const recoverySnapshot = buildRecoverySnapshot(recoveryRecipe, customRecoveryData || {});
  const eventData = {
    taskId: nextTaskId,
    requestKind: nextRequestKind,
    boardStatus:
      extra.taskStatus || runRequest?.taskStatus || laneBaseline?.taskPacket?.boardStatus || null,
    retryCount: nextRetryCount,
    commandRecoveryCount: nextCommandRecoveryCount,
    ...(customEventData || {}),
  };
  if (recoverySnapshot) {
    eventData.recovery = recoverySnapshot;
  } else if (!Object.prototype.hasOwnProperty.call(eventData, 'recovery')) {
    eventData.recovery = null;
  }

  const previewEvent = buildLaneEvent({
    seq: 0,
    state,
    event: requestedEventName,
    status: requestedEventStatus,
    detail: nextDetail,
    emittedAt: now,
    failureClass: nextFailureClass || null,
    data: eventData,
  });
  const latestEvent = Array.isArray(laneBaseline?.events)
    ? laneBaseline.events[laneBaseline.events.length - 1]
    : null;

  if (
    sameLane &&
    laneBaseline.state === state &&
    laneBaseline.detail === nextDetail &&
    laneBaseline.failureClass === nextFailureClass &&
    laneBaseline.failureMessage === nextFailureMessage &&
    Number(laneBaseline.retryCount || 0) === nextRetryCount &&
    Number(laneBaseline.commandRecoveryCount || 0) === nextCommandRecoveryCount &&
    latestEvent?.event === previewEvent.event &&
    latestEvent?.status === previewEvent.status &&
    latestEvent?.state === previewEvent.state &&
    latestEvent?.detail === previewEvent.detail &&
    latestEvent?.failureClass === previewEvent.failureClass &&
    JSON.stringify(latestEvent?.data || null) === JSON.stringify(previewEvent.data || null)
  ) {
    return previous;
  }

  const event = buildLaneEvent({
    seq: laneEventSequence++,
    state,
    event: requestedEventName,
    status: requestedEventStatus,
    detail: nextDetail,
    emittedAt: now,
    failureClass: nextFailureClass || null,
    data: eventData,
  });
  const nextRecord = {
    laneId:
      laneIdentity.canonicalLaneId
      || buildCanonicalLaneId(agentId, nextRequestId, nextTaskId, `lane-${Date.now()}`),
    agentId,
    instanceId: laneBaseline?.instanceId || CURRENT_INSTANCE_ID,
    agentName: agent.name,
    agentRole: agent.role,
    taskId: nextTaskId,
    taskTitle: runRequest?.taskTitle || laneBaseline?.taskTitle || null,
    requestKind: nextRequestKind,
    parentTaskId:
      Object.prototype.hasOwnProperty.call(runRequest || {}, 'parentTaskId')
        ? runRequest.parentTaskId || null
        : laneBaseline?.parentTaskId || null,
    requestId: nextRequestId,
    state,
    detail: nextDetail,
    updatedAt: now,
    startedAt: laneBaseline?.startedAt || now,
    queuedAt: laneBaseline?.queuedAt || (state === 'queued' ? now : null),
    preparingAt:
      laneBaseline?.preparingAt || (state === 'preparing_workspace' ? now : null),
    runningAt: laneBaseline?.runningAt || (state === 'running' ? now : null),
    integratingAt: laneBaseline?.integratingAt || (state === 'integrating' ? now : null),
    finishedAt: isTerminalLaneState(state) ? now : null,
    retryCount: nextRetryCount,
    commandRecoveryCount: nextCommandRecoveryCount,
    failureClass: nextFailureClass || null,
    failureMessage: nextFailureMessage || null,
    taskPacket,
    events: [...(laneBaseline?.events || []), event].slice(-LANE_EVENT_HISTORY_LIMIT),
  };

  agentLaneRuntime.set(agentId, nextRecord);
  patchAgentFieldsIfChanged(agentId, {
    laneState: nextRecord.state,
    laneUpdatedAt: nextRecord.updatedAt,
    laneTaskId: nextRecord.taskId,
    laneTaskKind: nextRecord.requestKind,
    laneFailureClass: nextRecord.failureClass,
    laneFailureMessage: nextRecord.failureMessage,
  });

  if (nextRecord.requestKind === 'primary' && nextRecord.taskId && !isInternalTaskId(nextRecord.taskId)) {
    touchPrimaryTaskRuntimeMeta(nextRecord.taskId, {
      lastLaneStatus: nextRecord.state,
      lastLaneUpdatedAt: nextRecord.updatedAt,
    });
  }

  if (state === 'failed') {
    recentLaneFailures.unshift({
      laneId: nextRecord.laneId,
      agentId: nextRecord.agentId,
      agentName: nextRecord.agentName,
      agentRole: nextRecord.agentRole,
      taskId: nextRecord.taskId,
      taskTitle: nextRecord.taskTitle,
      requestKind: nextRecord.requestKind,
      state: nextRecord.state,
      updatedAt: nextRecord.updatedAt,
      failureClass: nextRecord.failureClass || 'unknown',
      failureMessage: nextRecord.failureMessage || nextRecord.detail || null,
      retryCount: nextRecord.retryCount,
      commandRecoveryCount: nextRecord.commandRecoveryCount,
      taskPacket: nextRecord.taskPacket,
      events: nextRecord.events.slice(-4),
    });
    recentLaneFailures.splice(OPERATIONAL_LANE_SNAPSHOT_LIMIT);
  }

  persistRuntimeState();

  return nextRecord;
}

function bumpCount(counts, key) {
  const normalizedKey = String(key || 'unknown').trim() || 'unknown';
  counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
}

function refreshOperationalMetrics() {
  const agentCounts = {};
  agents.forEach((agent) => bumpCount(agentCounts, agent.status));
  metrics.setAgentCounts(agentCounts);

  const taskCounts = {};
  getVisibleTasks().forEach((task) => bumpCount(taskCounts, task.status));
  metrics.setTaskCounts(taskCounts);

  let queuedRuns = 0;
  queuedAgentRuns.forEach((runs) => {
    queuedRuns += runs.length;
  });
  metrics.setRunCounts({
    active: activeAgentRuns.size,
    preparing: countPreparingRuns(),
    queued: queuedRuns,
  });
  emitOperationalUpdate();
}

function markRalphInstallationStatus(installed) {
  ralphRuntimeState.installed = Boolean(installed);
}

function disableRalphExtensionForSession(reason) {
  if (ralphRuntimeState.disabled) {
    return;
  }

  ralphRuntimeState.disabled = true;
  ralphRuntimeState.disabledAt = new Date().toISOString();
  ralphRuntimeState.disabledReason = String(reason || 'falha operacional');
  io.emit('agent_log', {
    id: 'ceo',
    log: `🛡️ Extensão Ralph desativada nesta sessão: ${ralphRuntimeState.disabledReason}. O orquestrador seguirá no loop nativo do Gemini.`,
  });
  refreshOperationalMetrics();
}

function recordRalphOperationalFailure(taskId, reason) {
  ralphRuntimeState.failureCount += 1;
  ralphRuntimeState.lastFailureAt = new Date().toISOString();
  ralphRuntimeState.lastFailureTaskId = taskId || null;

  if (ralphRuntimeState.failureCount >= RALPH_EXTENSION_FAILURE_LIMIT) {
    disableRalphExtensionForSession(
      reason ||
        `limite de falhas (${ralphRuntimeState.failureCount}/${RALPH_EXTENSION_FAILURE_LIMIT}) atingido`,
    );
  } else {
    refreshOperationalMetrics();
  }
}

function normalizePrimaryTaskRecord(task, previousTask = null) {
  const now = new Date().toISOString();
  const previousStatus = String(previousTask?.status || '').trim() || null;
  const nextStatus = String(task?.status || previousStatus || 'backlog').trim() || 'backlog';
  const previousAssignee = previousTask?.assignee ? String(previousTask.assignee).trim() : null;
  const nextAssignee = task?.assignee ? String(task.assignee).trim() : null;
  const explicitOwnerId = Object.prototype.hasOwnProperty.call(task || {}, 'ownerId');
  const explicitOwnerInstanceId = Object.prototype.hasOwnProperty.call(task || {}, 'ownerInstanceId');
  const previousOwnerId = resolvePrimaryTaskOwnerId(previousTask);
  const previousOwnerInstanceId = resolvePrimaryTaskOwnerInstanceId(previousTask);
  let nextOwnerId = explicitOwnerId ? resolvePrimaryTaskOwnerId(task) : previousOwnerId;
  let nextOwnerInstanceId = explicitOwnerInstanceId
    ? resolvePrimaryTaskOwnerInstanceId(task)
    : previousOwnerInstanceId;
  const explicitUpdatedAt = Object.prototype.hasOwnProperty.call(task || {}, 'updatedAt');
  const baseUpdatedAt =
    (explicitUpdatedAt ? String(task.updatedAt || '') : '') ||
    previousTask?.updatedAt ||
    now;

  if (!isPrimaryActiveStatus(nextStatus)) {
    nextOwnerId = null;
    nextOwnerInstanceId = null;
  }

  const normalizedTask = {
    ...previousTask,
    ...task,
    status: nextStatus,
    assignee: nextAssignee,
    ownerId: nextOwnerId,
    ownerInstanceId: nextOwnerInstanceId,
    createdAt: task?.createdAt || previousTask?.createdAt || now,
    updatedAt: baseUpdatedAt,
    statusChangedAt:
      nextStatus !== previousStatus
        ? now
        : task?.statusChangedAt || previousTask?.statusChangedAt || baseUpdatedAt,
    assigneeChangedAt:
      nextAssignee !== previousAssignee
        ? now
        : task?.assigneeChangedAt || previousTask?.assigneeChangedAt || baseUpdatedAt,
    startedAt:
      nextStatus === 'in_progress' || nextStatus === 'in_review'
        ? task?.startedAt || previousTask?.startedAt || now
        : task?.startedAt || previousTask?.startedAt || null,
    completedAt:
      nextStatus === 'done'
        ? task?.completedAt || previousTask?.completedAt || now
        : task?.completedAt || null,
  };

  return normalizedTask;
}

function upsertPrimaryTaskRecord(task) {
  if (!task?.id || isInternalTaskId(task.id)) return null;

  const existingTask = githubTasks.find((entry) => entry.id === task.id) || null;
  if (existingTask) {
    return updatePrimaryTaskRecord(task.id, {
      ...existingTask,
      ...task,
    });
  }

  const normalizedTask = normalizePrimaryTaskRecord(task);
  githubTasks = [...githubTasks.filter((entry) => entry.id !== normalizedTask.id), normalizedTask];
  emitTasksUpdate();
  return normalizedTask;
}

function touchPrimaryTaskRuntimeMeta(taskId, patch = {}) {
  if (!taskId || isInternalTaskId(taskId)) return null;

  const current = primaryTaskRuntimeMeta.get(taskId) || {};
  const next = {
    ...current,
    ...patch,
  };
  primaryTaskRuntimeMeta.set(taskId, next);
  return next;
}

function getPrimaryTaskRuntimeMeta(taskId) {
  return primaryTaskRuntimeMeta.get(taskId) || null;
}

function buildPrimaryTaskOpencodeReviewGateMeta(result = {}) {
  return {
    at: new Date().toISOString(),
    enabled: Boolean(result.enabled),
    mode: String(result.mode || '').trim() || 'advisory',
    status: String(result.status || '').trim() || 'unknown',
    verdict: String(result.verdict || '').trim() || 'unknown',
    blocking: Boolean(result.blocking),
    reason: String(result.reason || '').trim() || null,
    summary: truncateText(result.summary, 220),
    findings: (Array.isArray(result.findings) ? result.findings : [])
      .map((entry) => truncateText(entry, 180))
      .filter(Boolean)
      .slice(0, 5),
    evidence: (Array.isArray(result.evidence) ? result.evidence : [])
      .map((entry) => truncateText(entry, 180))
      .filter(Boolean)
      .slice(0, 5),
    confidence: String(result.confidence || '').trim() || 'medium',
    recommendedNextStatus: String(result.recommendedNextStatus || '').trim() || null,
    durationMs: Number.isFinite(Number(result.durationMs)) ? Math.max(0, Number(result.durationMs)) : 0,
    timedOut: Boolean(result.timedOut),
    command: String(result.command || '').trim() || null,
    model: String(result.model || '').trim() || null,
    agent: String(result.agent || '').trim() || null,
    variant: String(result.variant || '').trim() || null,
    permissionAskedCount: Math.max(0, Number(result.permissionAskedCount || 0)),
    exitCode:
      Number.isInteger(result.exitCode) || Number.isFinite(Number(result.exitCode))
        ? Number(result.exitCode)
        : null,
  };
}

function shouldMoveOpencodeGateResultToAdminPending(result = {}) {
  if (String(result.mode || '').trim() !== 'required') {
    return false;
  }

  const normalizedStatus = String(result.status || '').trim();
  const normalizedReason = String(result.reason || '').trim();
  const normalizedRecommendedNextStatus = String(result.recommendedNextStatus || '').trim();

  if (normalizedRecommendedNextStatus === 'pendente_admin') {
    if (
      normalizedStatus === 'skipped'
      || ['validator-binary-unavailable', 'validator-not-ready', 'missing-model-candidate'].includes(normalizedReason)
    ) {
      return true;
    }
    return false;
  }

  if (normalizedStatus === 'skipped') {
    return true;
  }

  return false;
}

function resetPrimaryTaskPublishedStateForRework(taskId, pipeline = null) {
  if (!taskId || isInternalTaskId(taskId)) return null;

  clearPrimaryTaskGitLabCiGate(taskId, {
    gitlabCiGateStatus: 'failed',
    pipeline,
    preserveArmedAt: false,
  });
  setPrimaryTaskPublishedBranchState(taskId, null);
  touchPrimaryTaskRuntimeMeta(taskId, {
    publishedCommitSha: null,
  });
  persistRuntimeState();
  return getPrimaryTaskRuntimeMeta(taskId);
}

function setPrimaryTaskPublishedBranchState(taskId, assessment = null) {
  if (!taskId || isInternalTaskId(taskId)) return null;

  const runtimeMeta = primaryTaskRuntimeMeta.get(taskId) || {};
  const next = { ...runtimeMeta };
  const branchRef = String(assessment?.branchRef || '').trim() || null;

  if (branchRef) {
    const now = new Date().toISOString();
    next.publishedBranchName = String(assessment?.branchName || '').trim() || null;
    next.publishedBranchRef = branchRef;
    next.publishedBaseBranch = String(assessment?.baseBranch || '').trim() || null;
    next.publishedBranchIntegrated = Boolean(assessment?.integrated);
    next.publishedBranchReason = String(assessment?.reason || '').trim() || null;
    next.publishedBranchLockedAt = next.publishedBranchLockedAt || now;
    next.publishedBranchUpdatedAt = now;
  } else {
    delete next.publishedBranchName;
    delete next.publishedBranchRef;
    delete next.publishedBaseBranch;
    delete next.publishedBranchIntegrated;
    delete next.publishedBranchReason;
    delete next.publishedBranchLockedAt;
    delete next.publishedBranchUpdatedAt;
  }

  if (Object.keys(next).length === 0) {
    primaryTaskRuntimeMeta.delete(taskId);
    return null;
  }

  primaryTaskRuntimeMeta.set(taskId, next);
  return next;
}

function isPrimaryTaskPublishedBranchLocked(taskOrTaskId) {
  const taskId =
    typeof taskOrTaskId === 'string'
      ? String(taskOrTaskId).trim()
      : String(taskOrTaskId?.id || '').trim();
  if (!taskId || isInternalTaskId(taskId)) {
    return false;
  }

  const runtimeMeta = getPrimaryTaskRuntimeMeta(taskId);
  return Boolean(runtimeMeta?.publishedBranchLockedAt && runtimeMeta?.publishedBranchRef);
}

function buildPrimaryTaskPublishedBranchRef(branchName, remoteName = resolveTaskBranchRemote(process.env)) {
  const normalizedBranchName = String(branchName || '').trim();
  if (!normalizedBranchName) return null;
  const normalizedRemoteName = String(remoteName || 'origin').trim() || 'origin';
  return `refs/remotes/${normalizedRemoteName}/${normalizedBranchName}`;
}

function buildPrimaryTaskGitLabPipelinePatch(pipeline = null) {
  if (!pipeline || pipeline.enabled === false) {
    return {
      gitlabPipelineId: null,
      gitlabPipelineStatus: null,
      gitlabPipelineStatusClass: null,
      gitlabPipelineUrl: null,
      gitlabPipelineSha: null,
      gitlabPipelineBranch: null,
      gitlabPipelineProjectPath: null,
      gitlabPipelineUpdatedAt: null,
      gitlabPipelineFinishedAt: null,
      gitlabPipelineCheckedAt: new Date().toISOString(),
    };
  }

  return {
    gitlabPipelineId: pipeline.pipelineId || null,
    gitlabPipelineStatus: pipeline.status || null,
    gitlabPipelineStatusClass:
      pipeline.statusClass || classifyGitLabPipelineStatus(pipeline.status || null),
    gitlabPipelineUrl: pipeline.webUrl || null,
    gitlabPipelineSha: pipeline.sha || null,
    gitlabPipelineBranch: pipeline.branchName || pipeline.ref || null,
    gitlabPipelineProjectPath: pipeline.projectPath || null,
    gitlabPipelineUpdatedAt: pipeline.updatedAt || null,
    gitlabPipelineFinishedAt: pipeline.finishedAt || null,
    gitlabPipelineCheckedAt: new Date().toISOString(),
  };
}

function updatePrimaryTaskGitLabPipelineState(taskId, pipeline = null, extra = {}) {
  if (!taskId || isInternalTaskId(taskId)) return null;
  const next = touchPrimaryTaskRuntimeMeta(taskId, {
    ...buildPrimaryTaskGitLabPipelinePatch(pipeline),
    ...extra,
  });
  persistRuntimeState();
  return next;
}

function isPrimaryTaskAwaitingGitLabCi(taskOrTaskId) {
  const taskId =
    typeof taskOrTaskId === 'string'
      ? String(taskOrTaskId).trim()
      : String(taskOrTaskId?.id || '').trim();
  if (!taskId || isInternalTaskId(taskId)) {
    return false;
  }

  return Boolean(getPrimaryTaskRuntimeMeta(taskId)?.awaitingGitLabCi);
}

function armPrimaryTaskGitLabCiGate(taskId, integrationResult, pipeline = null) {
  if (!taskId || isInternalTaskId(taskId)) return null;
  const remoteName = String(integrationResult?.remote || resolveTaskBranchRemote(process.env)).trim() || 'origin';
  const branchName = String(integrationResult?.targetBranch || '').trim() || null;
  const branchRef = buildPrimaryTaskPublishedBranchRef(branchName, remoteName);
  const branchPatch = branchRef
    ? {
        publishedBranchName: branchName,
        publishedBranchRef: branchRef,
        publishedBaseBranch: integrationResult?.baseBranch || null,
        publishedCommitSha: integrationResult?.commitSha || null,
        publishedBranchIntegrated: false,
        publishedBranchReason: 'branch-has-unabsorbed-commits',
        publishedBranchLockedAt: getPrimaryTaskRuntimeMeta(taskId)?.publishedBranchLockedAt || new Date().toISOString(),
        publishedBranchUpdatedAt: new Date().toISOString(),
      }
    : {
        publishedCommitSha: integrationResult?.commitSha || null,
      };

  return updatePrimaryTaskGitLabPipelineState(taskId, pipeline, {
    ...branchPatch,
    awaitingGitLabCi: true,
    gitlabCiGateStatus:
      pipeline?.statusClass === 'success'
        ? 'success'
        : pipeline?.statusClass === 'failed' || pipeline?.statusClass === 'blocked'
          ? 'failed'
          : 'pending',
    gitlabCiGateArmedAt: new Date().toISOString(),
    gitlabCiGateResolvedAt: null,
  });
}

function clearPrimaryTaskGitLabCiGate(taskId, options = {}) {
  if (!taskId || isInternalTaskId(taskId)) return null;
  const next = touchPrimaryTaskRuntimeMeta(taskId, {
    awaitingGitLabCi: false,
    gitlabCiGateStatus: options.gitlabCiGateStatus || null,
    gitlabCiGateResolvedAt: options.resolveTime || new Date().toISOString(),
    gitlabCiGateArmedAt:
      Object.prototype.hasOwnProperty.call(options, 'preserveArmedAt') && !options.preserveArmedAt
        ? null
        : getPrimaryTaskRuntimeMeta(taskId)?.gitlabCiGateArmedAt || null,
    ...buildPrimaryTaskGitLabPipelinePatch(options.pipeline || null),
  });
  persistRuntimeState();
  return next;
}

function getPublishedPrimaryTaskReleaseStatus(taskOrTaskId) {
  const taskId =
    typeof taskOrTaskId === 'string'
      ? String(taskOrTaskId).trim()
      : String(taskOrTaskId?.id || '').trim();
  const runtimeMeta = getPrimaryTaskRuntimeMeta(taskId);
  if (runtimeMeta?.publishedBranchIntegrated) return 'done';
  if (runtimeMeta?.awaitingGitLabCi) return 'in_review';
  return 'backlog';
}

function rememberPrimaryTaskCompletedBy(taskId, agentId) {
  if (!taskId || !agentId || isInternalTaskId(taskId)) return;
  touchPrimaryTaskRuntimeMeta(taskId, {
    lastCompletedByAgentId: agentId,
  });
  persistRuntimeState();
}

function clearPrimaryTaskCompletionMemory(taskId) {
  if (!taskId || isInternalTaskId(taskId)) return;
  const runtimeMeta = primaryTaskRuntimeMeta.get(taskId);
  if (!runtimeMeta?.lastCompletedByAgentId) return;

  delete runtimeMeta.lastCompletedByAgentId;
  if (Object.keys(runtimeMeta).length === 0) {
    primaryTaskRuntimeMeta.delete(taskId);
  } else {
    primaryTaskRuntimeMeta.set(taskId, runtimeMeta);
  }
  persistRuntimeState();
}

function clearPrimaryTaskFailureMemory(taskId) {
  if (!taskId || isInternalTaskId(taskId)) return;
  const runtimeMeta = primaryTaskRuntimeMeta.get(taskId);
  if (!runtimeMeta) return;

  delete runtimeMeta.lastFailedByAgentId;
  delete runtimeMeta.lastFailureClass;
  delete runtimeMeta.lastFailureAt;
  delete runtimeMeta.lastFailureMessage;
  delete runtimeMeta.failureCount;

  if (Object.keys(runtimeMeta).length === 0) {
    primaryTaskRuntimeMeta.delete(taskId);
  } else {
    primaryTaskRuntimeMeta.set(taskId, runtimeMeta);
  }
  persistRuntimeState();
}

function recordPrimaryTaskFailure(taskId, agentId, failureClass, message, laneStatus = 'failed', options = {}) {
  if (!taskId || isInternalTaskId(taskId)) return null;

  const current = getPrimaryTaskRuntimeMeta(taskId) || {};
  const now = new Date().toISOString();
  const hasExplicitFailedBaseBranch = Object.prototype.hasOwnProperty.call(options || {}, 'failedBaseBranch');
  const failedBaseBranch = hasExplicitFailedBaseBranch
    ? String(options.failedBaseBranch || '').trim() || null
    : null;
  touchPrimaryTaskRuntimeMeta(taskId, {
    lastFailedByAgentId: agentId || current.lastFailedByAgentId || null,
    lastFailureClass: String(failureClass || 'unknown').trim() || 'unknown',
    lastFailureAt: now,
    lastFailureMessage: truncateText(message, 220),
    lastFailedBaseBranch: failedBaseBranch,
    failureCount: Math.max(1, Number(current.failureCount || 0) + 1),
    lastLaneStatus: laneStatus,
    lastLaneUpdatedAt: now,
  });
  persistRuntimeState();
  return getPrimaryTaskRuntimeMeta(taskId);
}

function getRecentPrimaryTaskFailurePenalty(taskId, agentId = null) {
  if (!taskId || isInternalTaskId(taskId)) {
    return null;
  }

  const runtimeMeta = getPrimaryTaskRuntimeMeta(taskId);
  const recentFailureAtMs = Date.parse(String(runtimeMeta?.lastFailureAt || ''));
  if (
    !Number.isFinite(recentFailureAtMs) ||
    Date.now() - recentFailureAtMs > PRIMARY_TASK_FAILURE_PENALTY_WINDOW_MS
  ) {
    return null;
  }

  const failureClass = String(runtimeMeta?.lastFailureClass || '').trim().toLowerCase();
  if (!isPrimaryTaskFailurePenaltyEligible(failureClass)) {
    return null;
  }

  const currentBaseBranch = resolveCurrentPrimaryTaskBaseBranch(resolveProjectContext());
  const failedBaseBranch = resolvePrimaryTaskFailureBaseBranch(runtimeMeta);
  if (currentBaseBranch && failedBaseBranch && currentBaseBranch !== failedBaseBranch) {
    return null;
  }

  const failedByAgentId = String(runtimeMeta?.lastFailedByAgentId || '').trim() || null;
  if (
    !shouldPrimaryTaskFailurePenaltyApplyToAgent(failureClass, {
      failedByAgentId,
      agentId,
    })
  ) {
    return null;
  }

  return {
    failureClass,
    failedByAgentId,
    ageMs: Math.max(0, Date.now() - recentFailureAtMs),
    lastFailureAt: runtimeMeta?.lastFailureAt || null,
    lastFailureMessage: runtimeMeta?.lastFailureMessage || null,
  };
}

function hasRecentPrimaryTaskFailureCooldown(taskId, agentId = null) {
  return Boolean(getRecentPrimaryTaskFailurePenalty(taskId, agentId));
}

function formatDurationMs(durationMs) {
  const totalSeconds = Math.max(0, Math.floor(durationMs / 1000));
  if (totalSeconds < 60) return `${totalSeconds}s`;
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  if (minutes < 60) return `${minutes}m${seconds ? ` ${seconds}s` : ''}`;
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return `${hours}h${remainingMinutes ? ` ${remainingMinutes}m` : ''}`;
}

function getPrimaryTaskExecutionState(task) {
  const taskId = task?.id ? String(task.id).trim() : null;
  if (!taskId) {
    return {
      running: false,
      preparing: false,
      queued: false,
    };
  }

  let running = false;
  let preparing = false;
  let queued = false;

  activeAgentRuns.forEach((run) => {
    if (run?.taskId === taskId) {
      running = true;
    }
  });

  forEachLivePreparingRun((run) => {
    if (run?.taskId === taskId) {
      preparing = true;
    }
  });

  queuedAgentRuns.forEach((runs) => {
    if (runs.some((run) => run?.taskId === taskId)) {
      queued = true;
    }
  });

  agentLaneRuntime.forEach((lane) => {
    if (!lane || lane.requestKind !== 'primary' || lane.taskId !== taskId) {
      return;
    }

    const state = String(lane.state || '').trim();
    if (state === 'running') {
      running = true;
      return;
    }
    if (state === 'preparing_workspace') {
      preparing = true;
      return;
    }
    if (state === 'queued' || state === 'retry_scheduled') {
      queued = true;
    }
  });

  return {
    running,
    preparing,
    queued,
  };
}

function getPrimaryLaneSnapshotUpdatedAt(taskId) {
  return selectPrimaryLaneSnapshotUpdatedAt(agentLaneRuntime.values(), taskId);
}

function getPrimaryTaskLastActivityMs(task) {
  return selectPrimaryTaskLastActivityMs({
    task,
    runtimeMeta: getPrimaryTaskRuntimeMeta(task.id),
    lanes: agentLaneRuntime.values(),
  });
}

function getPrimaryTaskStaleThreshold(task) {
  return task?.status === 'in_review' ? REVIEW_TASK_STALE_MS : ACTIVE_TASK_STALE_MS;
}

function buildPrimaryTaskAttentionRecord(task, nowMs = Date.now()) {
  if (!task || !isPrimaryActiveStatus(task.status)) return null;
  if (isForeignOwnedPrimaryTask(task)) return null;

  const execution = getPrimaryTaskExecutionState(task);
  const lastActivityMs = getPrimaryTaskLastActivityMs(task);
  const lastActivityAgeMs = Number.isFinite(lastActivityMs) ? Math.max(0, nowMs - lastActivityMs) : null;
  const staleThresholdMs = getPrimaryTaskStaleThreshold(task);
  const running = execution.running || execution.preparing;
  const activeWithoutAssignee = !task.assignee;
  const waitingWithoutExecution = Boolean(task.assignee) && !running && !execution.queued;
  const silentWhileRunning = Boolean(
    running && Number.isFinite(lastActivityAgeMs) && lastActivityAgeMs >= staleThresholdMs,
  );
  const stale = Boolean(
    waitingWithoutExecution &&
      Number.isFinite(lastActivityAgeMs) &&
      lastActivityAgeMs >= staleThresholdMs,
  );

  let reason = 'running';
  let severity = 'ok';

  if (stale) {
    reason = task.status === 'in_review' ? 'stalled_review' : 'stalled_execution';
    severity = 'critical';
  } else if (silentWhileRunning) {
    reason = task.status === 'in_review' ? 'silent_review' : 'silent_execution';
    severity = 'medium';
  } else if (activeWithoutAssignee) {
    reason = 'active_without_assignee';
    severity = 'high';
  } else if (waitingWithoutExecution) {
    reason = 'awaiting_resume';
    severity = 'medium';
  } else if (execution.queued) {
    reason = 'queued';
    severity = 'info';
  }

  return {
    id: task.id,
    title: task.title,
    status: task.status,
    assignee: task.assignee || null,
    githubUrl: task.githubUrl || null,
    lastActivityAt: Number.isFinite(lastActivityMs) ? new Date(lastActivityMs).toISOString() : null,
    lastActivityAgeMs,
    staleThresholdMs,
    stale,
    severity,
    reason,
    execution,
  };
}

function shouldEmitStaleAlert(taskId, nowMs) {
  const runtimeMeta = getPrimaryTaskRuntimeMeta(taskId);
  const previousAlertMs = runtimeMeta?.lastAlertAt ? Date.parse(runtimeMeta.lastAlertAt) : NaN;
  return !Number.isFinite(previousAlertMs) || nowMs - previousAlertMs >= STALE_TASK_ALERT_COOLDOWN_MS;
}

function getPrimaryTaskLastAlertMs(taskId) {
  const runtimeMeta = getPrimaryTaskRuntimeMeta(taskId);
  const parsed = Date.parse(String(runtimeMeta?.lastAlertAt || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function getOperationalStatusSnapshot() {
  const opencodeValidator = getOpencodeRuntimeStatus({
    projectDir: resolveProjectDir(),
  });
  const opencodeReviewGate = resolveOpencodeReviewGateConfig(process.env);
  const roomOccupancy = buildRoomOccupancy(ROOM_TEMPLATES, agents);
  const roomCountsByTopology = roomOccupancy.reduce((acc, room) => {
    bumpCount(acc, room.topology || 'unspecified');
    return acc;
  }, {});
  const roomCountsBySpecialization = roomOccupancy.reduce((acc, room) => {
    bumpCount(acc, room.specializationRole || 'mixed');
    return acc;
  }, {});
  let queuedRuns = 0;
  queuedAgentRuns.forEach((runs) => {
    queuedRuns += runs.length;
  });
  const laneSnapshots = Array.from(agentLaneRuntime.values())
    .sort((left, right) => {
      const leftTerminal = isTerminalLaneState(left.state) ? 1 : 0;
      const rightTerminal = isTerminalLaneState(right.state) ? 1 : 0;
      if (leftTerminal !== rightTerminal) return leftTerminal - rightTerminal;

      const leftUpdatedAt = Date.parse(String(left.updatedAt || '')) || 0;
      const rightUpdatedAt = Date.parse(String(right.updatedAt || '')) || 0;
      return rightUpdatedAt - leftUpdatedAt;
    })
    .map(serializeLaneRecord)
    .map(withRecoveryRecipe)
    .filter(Boolean);
  const laneCounts = laneSnapshots.reduce((acc, lane) => {
    bumpCount(acc, lane.state);
    return acc;
  }, {});
  const activeLaneCount = laneSnapshots.filter((lane) => !isTerminalLaneState(lane.state)).length;
  const recentFailures = recentLaneFailures
    .slice(0, OPERATIONAL_LANE_SNAPSHOT_LIMIT)
    .map(serializeLaneRecord)
    .map(withRecoveryRecipe)
    .filter(Boolean);

  const attentionTasks = githubTasks
    .filter((task) => isPrimaryActiveStatus(task.status))
    .map((task) => buildPrimaryTaskAttentionRecord(task))
    .filter(Boolean);
  const criticalTasks = attentionTasks.filter((task) => task.severity === 'critical');
  const flaggedTasks = attentionTasks.filter((task) =>
    ['critical', 'high', 'medium'].includes(task.severity),
  );
  const activeWithoutAssigneeTasks = attentionTasks.filter(
    (task) => task.reason === 'active_without_assignee',
  );
  const waitingTasks = attentionTasks.filter((task) => task.reason === 'awaiting_resume');
  const queuedTasks = attentionTasks.filter((task) => task.reason === 'queued');

  return {
    instanceId: CURRENT_INSTANCE_ID,
    ownerId: CURRENT_INSTANCE_OWNER,
    agents: {
      total: agents.length,
      byStatus: agents.reduce((acc, agent) => {
        bumpCount(acc, agent.status);
        return acc;
      }, {}),
    },
    tasks: {
      total: githubTasks.length,
      byStatus: githubTasks.reduce((acc, task) => {
        bumpCount(acc, task.status);
        return acc;
      }, {}),
    },
    collaboration: {
      total: collaborationTasks.length,
      byStatus: collaborationTasks.reduce((acc, task) => {
        bumpCount(acc, task.status);
        return acc;
      }, {}),
    },
    rooms: {
      totalConfigured: ROOM_TEMPLATES.length,
      byTeam: roomOccupancy.reduce((acc, room) => {
        bumpCount(acc, room.team);
        return acc;
      }, {}),
      byTopology: roomCountsByTopology,
      bySpecializationRole: roomCountsBySpecialization,
      items: roomOccupancy,
    },
    runs: {
      active: activeAgentRuns.size,
      preparing: countPreparingRuns(),
      queued: queuedRuns,
    },
    lanes: {
      totalTracked: laneSnapshots.length,
      active: activeLaneCount,
      byState: laneCounts,
      agents: laneSnapshots.slice(0, OPERATIONAL_LANE_SNAPSHOT_LIMIT),
      recentFailures,
    },
    settings: {
      boardProvider: GITHUB_TASKS_CONFIGURED ? 'github' : 'local',
      githubConfigured: GITHUB_TASKS_CONFIGURED,
      githubOwner: process.env.GITHUB_OWNER || null,
      githubRepo: process.env.GITHUB_REPO || null,
      githubProjectOwner: GITHUB_PROJECT_OWNER || null,
      projectSyncEnabled: PROJECT_SYNC_ENABLED,
      bootstrapDemoTasksEnabled: BOOTSTRAP_DEMO_TASKS_ENABLED,
      autoDispatchEnabled: AUTO_DISPATCH_ENABLED,
      orphanTaskRescueEnabled: ORPHAN_TASK_RESCUE_ENABLED,
      activeTaskStaleMs: ACTIVE_TASK_STALE_MS,
      reviewTaskStaleMs: REVIEW_TASK_STALE_MS,
      staleTaskMonitorIntervalMs: STALE_TASK_MONITOR_INTERVAL_MS,
      staleTaskAlertCooldownMs: STALE_TASK_ALERT_COOLDOWN_MS,
      primaryTaskFailurePenaltyWindowMs: PRIMARY_TASK_FAILURE_PENALTY_WINDOW_MS,
      roomTemplatesConfigured: ROOM_TEMPLATES.length,
      builtinRoomTopology: resolveBuiltinRoomTopology(process.env),
      roomTemplateSource: process.env.NEXUS_ROOM_TEMPLATES_FILE
        ? 'file'
        : (process.env.NEXUS_ROOM_TEMPLATES_JSON || process.env.NEXUS_ROOM_TEMPLATES)
          ? 'env'
          : 'builtin',
      ralphExtensionConfigured: RALPH_EXTENSION_ENABLED,
      ralphExtensionInstalled: ralphRuntimeState.installed,
      ralphExtensionActive:
        RALPH_EXTENSION_ENABLED && ralphRuntimeState.installed && !ralphRuntimeState.disabled,
      ralphExtensionFailureLimit: RALPH_EXTENSION_FAILURE_LIMIT,
      ralphExtensionFailureCount: ralphRuntimeState.failureCount,
      ralphExtensionDisabled: ralphRuntimeState.disabled,
      ralphExtensionDisabledAt: ralphRuntimeState.disabledAt,
      ralphExtensionDisabledReason: ralphRuntimeState.disabledReason,
      ralphExtensionLastFailureAt: ralphRuntimeState.lastFailureAt,
      ralphExtensionLastFailureTaskId: ralphRuntimeState.lastFailureTaskId,
      opencodeValidator,
      opencodeReviewGate,
    },
    attention: {
      healthy: flaggedTasks.length === 0,
      totalActivePrimaryTasks: attentionTasks.length,
      flaggedCount: flaggedTasks.length,
      criticalCount: criticalTasks.length,
      activeWithoutAssigneeCount: activeWithoutAssigneeTasks.length,
      waitingWithoutExecutionCount: waitingTasks.length,
      queuedCount: queuedTasks.length,
      tasks: attentionTasks.slice(0, 20),
      criticalTasks: criticalTasks.slice(0, 10),
    },
  };
}

function emitOperationalUpdate() {
  io.emit('operations_update', getOperationalStatusSnapshot());
}

const ROOM_TEMPLATES = Object.freeze(resolveRoomTemplates(process.env));

function normalizeModelName(rawModel, providerHint = null) {
  return normalizeRegisteredModelName(rawModel, providerHint);
}

function normalizeAgentTeam(team) {
  return normalizeCatalogTeam(team);
}

function normalizeAgentFloor(floor, team = PRIMARY_TEAM) {
  return normalizeCatalogFloor(floor, team);
}

function resolveAgentRoomTemplate(agent = {}) {
  return findRoomForAgent(ROOM_TEMPLATES, agent);
}

function normalizeAgentMcps(mcps) {
  return [...new Set(
    (Array.isArray(mcps) ? mcps : [])
      .map((value) => String(value || '').trim())
      .filter(Boolean),
  )];
}

function normalizeAgentFallbackModels(fallbackModels, providerHint = null) {
  return normalizeFallbackModels(fallbackModels, providerHint, { source: 'agent' });
}

function normalizeAgentConfig(agent = {}) {
  const configured = resolveConfiguredLlm(agent);
  const team = normalizeAgentTeam(agent.team);
  const floor = normalizeAgentFloor(agent.floor, team);
  const roomTemplate = resolveAgentRoomTemplate({
    roomId: agent.roomId,
    team,
    floor,
    role: agent.role,
    specializationRole: agent.specializationRole,
    archetypeId: agent.archetypeId,
    id: agent.id,
  });
  const effectiveTeam = roomTemplate?.team || team;
  const effectiveFloor = roomTemplate?.floor || floor;
  const fallbackTask =
    effectiveTeam === REVIEW_TEAM ? 'Cobertura de review e gargalos' : 'Aguardando ordens...';
  const configuredTask = String(agent.task || '').trim();
  const shouldUseRoomDefault =
    !configuredTask
    || configuredTask === 'Aguardando ordens...'
    || configuredTask === 'Cobertura de review e gargalos';
  const baseAgent = {
    ...agent,
    team: effectiveTeam,
    floor: effectiveFloor,
    roomId: roomTemplate?.id || String(agent.roomId || '').trim() || null,
    roomName: roomTemplate?.name || String(agent.roomName || '').trim() || null,
    roomTopology: roomTemplate?.topology || String(agent.roomTopology || '').trim() || null,
    archetypeId:
      roomTemplate?.archetypeId || String(agent.archetypeId || '').trim() || null,
    specializationRole:
      roomTemplate?.specializationRole
      || String(agent.specializationRole || agent.role || '').trim()
      || null,
    task: shouldUseRoomDefault ? roomTemplate?.defaultTask || fallbackTask : configuredTask,
    llmProvider: configured.llmProvider,
    model: configured.model,
  };
  return {
    ...baseAgent,
    prompt: String(agent.prompt || '').trim() || buildDefaultAgentPrompt(baseAgent),
    reasoningEffort: resolveAgentReasoningEffort(baseAgent),
    mcps: normalizeAgentMcps(agent.mcps),
    fallbackModels: normalizeAgentFallbackModels(agent.fallbackModels, configured.llmProvider),
    skills: normalizeSkillList(agent.skills),
    fallbackActive: Boolean(agent.fallbackActive),
    fallbackDepth: Math.max(0, Number(agent.fallbackDepth || 0)),
    fallbackReason: String(agent.fallbackReason || '').trim() || null,
  };
}

function chooseModelForTask(agent, taskTitle) {
  return resolveAgentAutonomousModel(agent, taskTitle).model;
}

function isReviewTaskTitle(taskTitle = '') {
  return /^\s*\[review\b/i.test(String(taskTitle || '').trim());
}

function isTransientModelFailure(output = '') {
  const normalized = String(output || '').toLowerCase();
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
    'access denied due to invalid subscription key',
    'invalid subscription key or wrong api endpoint',
    'wrong api endpoint',
    'provider-auth',
  ].some((pattern) => normalized.includes(pattern));
}

function isProviderFailureOutput(output = '') {
  const normalized = String(output || '').toLowerCase();
  if (!normalized) return false;

  return [
    'access denied due to invalid subscription key',
    'invalid subscription key or wrong api endpoint',
    'wrong api endpoint',
    'provider-auth',
    'provider autônomo não suportado',
    'deploymentnotfound',
    'provider/modelo',
  ].some((pattern) => normalized.includes(pattern));
}

function resolveProviderRetryPreferredCandidate(agent, taskTitle, fallbackModels = []) {
  const autonomousTarget = resolveAgentAutonomousModel(agent, taskTitle);
  const primaryCandidate = normalizeRuntimeCandidate(
    {
      provider: autonomousTarget.provider,
      model: autonomousTarget.model,
      reasoningEffort: resolveAgentReasoningEffort({
        ...(agent || {}),
        llmProvider: autonomousTarget.provider,
        model: autonomousTarget.model,
      }),
    },
    autonomousTarget.provider,
    {
      agent,
      source: 'primary',
    },
  );
  const primaryKey = formatRuntimeCandidate(primaryCandidate);

  return normalizeFallbackModels(fallbackModels, autonomousTarget.provider, {
    agent,
    source: 'retry_override',
  })
    .map((candidate) =>
      normalizeRuntimeCandidate(candidate, autonomousTarget.provider, {
        agent,
        source: 'retry_override',
      }),
    )
    .find((candidate) => {
      const key = formatRuntimeCandidate(candidate);
      return Boolean(key && key !== primaryKey);
    }) || null;
}

function isAutonomousIterationLimitOutput(output = '') {
  const normalized = String(output || '').toLowerCase();
  if (!normalized) return false;

  return (
    normalized.includes('loop autonomo excedeu o limite') ||
    normalized.includes('loop autônomo excedeu o limite')
  );
}

function isCommandParsingFailureOutput(output = '') {
  const normalized = String(output || '').toLowerCase();
  if (!normalized) return false;

  return [
    'bash command parsing error detected',
    'syntax errors:',
    'missing pgrep output',
    'error node:',
    'regex parse error:',
    'invalid regular expression pattern provided',
    'backreferences are not supported',
    'unterminated group',
  ].some((pattern) => normalized.includes(pattern));
}

function isRalphExtensionFailureOutput(output = '') {
  const normalized = String(output || '').toLowerCase();
  if (!normalized) return false;

  return [
    'hook(s) [ralph-loop] failed',
    'hook execution for afteragent',
    'path not in workspace',
  ].some((pattern) => normalized.includes(pattern));
}

function inspectWorkspaceState(workspacePath) {
  const result = spawnSync('git', ['-C', workspacePath, 'status', '--porcelain'], {
    encoding: 'utf8',
    maxBuffer: 4 * 1024 * 1024,
    timeout: 15000,
  });

  if (result.status === 0) {
    return {
      accessible: true,
      dirty: Boolean(String(result.stdout || '').trim()),
      details: String(result.stdout || '').trim(),
    };
  }

  return {
    accessible: false,
    dirty: true,
    details: String(result.stderr || result.stdout || 'workspace inacessível').trim(),
  };
}

function appendSlidingBuffer(previousValue, nextChunk, limit = LOOP_SIGNAL_BUFFER_LIMIT) {
  const nextValue = `${previousValue || ''}${nextChunk || ''}`;
  if (nextValue.length <= limit) {
    return nextValue;
  }

  return nextValue.slice(-limit);
}

function deriveCommandRecoveryHint(signalText = '', previousHint = null) {
  const normalized = String(signalText || '').toLowerCase();
  const hints = [];

  if (normalized.includes("<<'eof'") || normalized.includes('<<"eof"') || normalized.includes('<<eof')) {
    hints.push(
      'A ultima tentativa usou heredoc cru. Nunca comece uma linha com <<EOF e nao tente criar/editar arquivo via bash; use apenas edit_file ou write_file.',
    );
  }

  if (normalized.includes('missing pgrep output')) {
    hints.push(
      'Nao dependa de pgrep sem verificar se existe. Use ps, grep ou outro fallback portavel quando necessario.',
    );
  }

  if (normalized.includes('syntax errors:')) {
    hints.push(
      'Quebre a operacao em comandos menores, com quoting explicito e sem shell complexo desnecessario.',
    );
  }

  if (
    normalized.includes('regex parse error:') ||
    normalized.includes('invalid regular expression pattern provided') ||
    normalized.includes('backreferences are not supported')
  ) {
    hints.push(
      'Evite regex com backreference em rg/grep sem suporte. Escape parenteses corretamente ou use um padrao simples sem grupos nao fechados.',
    );
  }

  const baseHint =
    previousHint ||
    'A ultima tentativa falhou por parsing de shell. Use comandos completos e explicitos, prefira edit_file/write_file e evite heredoc cru.';

  return [baseHint, ...hints]
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' ');
}

function deriveIterationLimitRecoveryHint({
  previousHint = null,
  successfulVerificationCommands = [],
} = {}) {
  const normalizedCommands = [...new Set(
    (Array.isArray(successfulVerificationCommands) ? successfulVerificationCommands : [])
      .map((command) => String(command || '').trim())
      .filter(Boolean),
  )];
  const hints = [
    previousHint,
    normalizedCommands.length > 0
      ? `A ultima tentativa ja executou com sucesso: ${normalizedCommands.slice(0, 3).join(' ; ')}.`
      : 'A ultima tentativa ja concluiu verificacoes materiais com sucesso.',
    'O workspace ja contem mudanca material. Nao reinicie discovery nem releia arquivos sem necessidade.',
    'Nao rode probes ad-hoc nem diagnosticos extras so para ganhar mais confianca; conclua com base na evidencia material ja obtida.',
    `Leia so o minimo para confirmar o estado atual e, se o objetivo ja estiver cumprido, finalize emitindo exatamente ${RALPH_COMPLETION_MARKER}.`,
  ];

  return hints
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index)
    .join(' ');
}

function emitHookDiagnostics(agentId, hookName, hookResult) {
  if (!hookResult) return;

  (hookResult.notes || []).forEach((note) => {
    io.emit('agent_log', {
      id: agentId,
      log: `[HOOK:${hookName}] ${note}`,
    });
  });

  (hookResult.errors || []).forEach((error) => {
    io.emit('agent_log', {
      id: agentId,
      log: `[HOOK:${hookName}:ERROR] ${error.sourceId}: ${error.message}`,
    });
  });
}

function deriveHookedAgent(agent, payload = {}) {
  const patch =
    payload && typeof payload.agent === 'object'
      ? payload.agent
      : payload && typeof payload.agentPatch === 'object'
        ? payload.agentPatch
        : null;

  return patch ? normalizeAgentConfig({ ...agent, ...patch }) : normalizeAgentConfig(agent);
}

function buildExecutionPrompt(agent, taskTitle, taskId = null, options = {}) {
  const trimmedTask = String(taskTitle || '').replace(/\s+/g, ' ').trim();
  if (!trimmedTask) return null;

  const requestKind = options.requestKind || 'primary';
  const requester = options.requestedBy ? findAgentById(options.requestedBy) : null;
  const reviewMode = isReviewTaskTitle(trimmedTask) || options.taskStatus === 'in_review';
  const commandRecoveryCount = Math.max(0, Number(options.commandRecoveryCount || 0));
  const shellRecoveryMode = commandRecoveryCount > 0;
  const taskPacket = buildTaskPacket(agent, trimmedTask, taskId, options);
  const backlogBrief = buildTaskBacklogBrief(taskPacket);
  const kickoffPlan = buildTaskKickoffPlan(taskPacket, options.workspaceDir || '', {
    reviewMode,
  });
  const contractVerificationCommands =
    Array.isArray(options.contractVerificationCommands) && options.contractVerificationCommands.length > 0
      ? options.contractVerificationCommands
      : buildSuggestedVerificationCommands(options.workspaceDir || resolveProjectDir() || '');
  const suggestedVerificationCommands = reviewMode
    ? contractVerificationCommands
    : [];
  const taskContract = ensureTaskContractFiles({
    projectDir: resolveProjectDir(),
    workspaceDir: options.workspaceDir || '',
    taskPacket,
    verificationCommands: contractVerificationCommands,
    progress: {
      phase: reviewMode ? 'in_review' : 'agreed',
      detail: reviewMode
        ? 'Contrato persistente carregado para a lane de review.'
        : 'Contrato agreed gerado pelo harness antes da implementacao.',
      boardStatus: options.taskStatus || taskPacket.boardStatus || null,
      laneState: reviewMode ? 'preparing_workspace' : 'queued',
      agentId: agent?.id || null,
      agentRole: agent?.role || null,
    },
  });
  const taskContractPrompt = buildTaskContractPromptSection(taskContract);
  const finalChecklist = buildRoleAcceptanceTests(agent, {
    reviewMode,
    requestKind,
    taskTitle: trimmedTask,
  })
    .map((item) => `- ${item}`)
    .join('\n');
  const enabledMcps = normalizeAgentMcps(agent?.mcps);
  const mcpCapabilityNotes = [];

  if (enabledMcps.length > 0) {
    mcpCapabilityNotes.push(`MCPs/capacidades habilitados para esta lane: ${enabledMcps.join(', ')}.`);
  }

  if (enabledMcps.includes('figma')) {
    mcpCapabilityNotes.push(
      [
        'Bridge Figma habilitado (somente leitura).',
        '- Use `figma_get_file` para descobrir páginas e validar o `fileKey`/`node-id`.',
        '- Use `figma_get_node_context` como ferramenta principal para extrair layout, textos, cores, bounds e estrutura do node alvo.',
        '- Use `figma_get_image_refs` apenas para conferência visual pontual depois de entender a estrutura.',
      ].join('\n'),
    );
  }

  if (enabledMcps.includes('stitch')) {
    mcpCapabilityNotes.push(
      [
        'Bridge Stitch MCP habilitado.',
        '- Use `stitch_status` para validar autenticação e prontidão local antes de operar.',
        '- Use `stitch_list_tools` para descobrir o catálogo remoto disponível na conta atual.',
        '- Use `stitch_call_tool` apenas com o nome exato da tool remota e argumentos mínimos.',
        '- Em review técnico, apenas chamadas `list_*` e `get_*` são permitidas; criação/edição fica bloqueada pelo harness.',
      ].join('\n'),
    );
  }

  return [
    agent?.prompt ? `Prompt do agente:\n${agent.prompt}` : `Você é ${agent?.name || 'um agente'} (${agent?.role || 'dev'}).`,
    taskId ? `Task ID: ${taskId}` : null,
    requestKind === 'collaboration' ? 'Modo: colaboração entre agentes.' : 'Modo: execução principal.',
    reviewMode ? 'Etapa atual: review técnico e validação final.' : null,
    options.parentTaskId ? `Task pai: ${options.parentTaskId}` : null,
    requester ? `Solicitado por: ${requester.name} (${requester.id})` : null,
    `Tarefa: ${trimmedTask}`,
    buildRoleExecutionPolicy(agent, { reviewMode, requestKind }),
    options.runtimeTargets && options.runtimeTargets.length > 0
      ? `Runtime planejado: ${options.runtimeTargets.join(' -> ')}`
      : null,
    options.skillIds && options.skillIds.length > 0
      ? `Skills ativas: ${options.skillIds.join(', ')}`
      : null,
    mcpCapabilityNotes.length > 0 ? mcpCapabilityNotes.join('\n\n') : null,
    backlogBrief,
    taskContractPrompt,
    kickoffPlan,
    reviewMode && suggestedVerificationCommands.length > 0
      ? `Checks sugeridos para este workspace:\n${suggestedVerificationCommands.map((command) => `- ${command}`).join('\n')}`
      : null,
    `Task packet operacional (JSON):\n${JSON.stringify(taskPacket, null, 2)}`,
    options.skillsPrompt ? `Skills locais aplicadas:\n${options.skillsPrompt}` : null,
    options.recoveryHint ? `Contexto de recuperação: ${options.recoveryHint}` : null,
    [
      'Regras permanentes de execução no workspace:',
      '- Para criar ou editar arquivos, prefira tool calls estruturados como `write_file` e `edit_file`.',
      '- Não use heredoc (`<<EOF`, `<< \'EOF\'`), redirecionamento (`>`, `>>`) ou `tee` para gravar arquivos.',
      '- Se precisar de `bash`, use apenas comandos completos de leitura, teste ou diagnóstico.',
      '- Não dependa de `pgrep` sem fallback portável (`ps`, `grep`, etc.).',
    ].join('\n'),
    shellRecoveryMode
      ? [
          `Modo de recuperacao de shell ativo: tentativa ${commandRecoveryCount}.`,
          '- Nesta tentativa, use tool calls estruturados para editar arquivos: `write_file` ou `edit_file`.',
          '- Nao emita texto cru que pareca comando shell e nao tente criar arquivo com heredoc, redirecionamento (`>`, `>>`) ou `tee`.',
          '- Se precisar de `bash`, use apenas comandos completos de leitura, teste ou diagnostico; nunca use `pgrep` sem fallback portavel.',
          '- Se o shell continuar falhando, pare de insistir em bash mutante e finalize a recuperacao com a menor acao estruturada possivel.',
        ].join('\n')
      : null,
    reviewMode
      ? 'Fluxo obrigatório:\n1. Ler apenas o contexto mínimo e os arquivos realmente relevantes antes de revisar.\n2. Definir a menor estratégia de validação completa para esta lane.\n3. Revisar com foco no seu papel.\n4. Rodar as verificações relevantes.\n5. Se houver falha material, registrar a evidência e devolver para implementação.\n6. Só então concluir a lane.'
      : 'Fluxo obrigatório:\n1. Ler apenas o contexto mínimo e os arquivos realmente relevantes antes de editar.\n2. Definir a menor abordagem completa para esta task ou subtarefa.\n3. Implementar ou revisar com foco no seu papel.\n4. Rodar as verificações relevantes.\n5. Corrigir qualquer falha encontrada no mesmo ciclo.\n6. Só então concluir a lane.',
    'Ordem de execução obrigatória: contexto mínimo -> mudança material -> teste/check -> correção -> próximo passo.',
    'Depois de no máximo 2 rodadas de discovery, pare de explorar e produza mudança material. Se o recorte continuar grande, delegue uma subtarefa objetiva com REQUEST_HELP e continue executando sua parte.',
    `Checklist final do papel:\n${finalChecklist}`,
    'Antes de editar, analise o código e entenda o contexto relevante.',
    'Antes de usar replace/edit, leia o trecho exato atual do arquivo. Se uma edição falhar, releia o arquivo atualizado e tente outra abordagem sem parar o trabalho.',
    'Para editar arquivos, prefira ferramentas estruturadas como edit_file e write_file. Evite despejar conteúdo bruto no shell sem um comando explícito.',
    'Nao use heredoc para criar ou editar arquivo nesta lane. Para mutacao de arquivo, use edit_file ou write_file.',
    'É proibido iniciar uma linha de shell com <<EOF, <<\'EOF\' ou equivalente. Use bash apenas para leitura, teste e diagnostico.',
    'Antes de depender de utilitários opcionais de shell como pgrep, jq ou rg, confirme que existem ou use um fallback compatível.',
    shellRecoveryMode
      ? 'Recuperacao de shell ativa: qualquer tentativa de criar/editar arquivo via bash sera tratada como erro de prompt. Use write_file/edit_file.'
      : null,
    reviewMode
      ? 'Revise a implementação já existente, rode testes/checks e aprove ou reprove com base em evidência. Não reimplemente a task dentro da lane de review.'
      : 'Implemente a tarefa de ponta a ponta no repositório atual.',
    reviewMode
      ? 'Use as ferramentas disponíveis para leitura, checks e diagnostico. Edicao de codigo nao faz parte desta lane.'
      : 'Use as ferramentas disponíveis para editar arquivos e executar os comandos necessários.',
    reviewMode
      ? 'Rode as verificações locais relevantes e só alegue sucesso se a evidência mostrar que o card pode seguir para done.'
      : 'Rode as verificações locais relevantes e corrija qualquer erro encontrado antes de alegar sucesso.',
    reviewMode
      ? 'Aprovação sem pelo menos um check material executado com sucesso é inválida e a lane será reaberta.'
      : null,
    reviewMode
      ? `Se um check material ja passou e cobre o recorte principal, pare de abrir probes extras e conclua com ${RALPH_COMPLETION_MARKER} ou ${RALPH_REJECTION_MARKER} com base nessa evidencia.`
      : null,
    'Você está em um workspace isolado. Não sobrescreva trabalho de outros agentes fora do seu escopo.',
    requestKind === 'collaboration'
      ? 'Você está ajudando outro agente em uma subtarefa limitada. Foque apenas no recorte pedido e entregue algo aproveitável.'
      : 'Você é o responsável direto por esta task principal.',
    reviewMode
      ? 'Não deixe o card parado em review. Se houver falha material, registre a evidência e devolva o card para implementação.'
      : 'Não pare em reunião, triagem ou movimentação de card. Entregue a task pronta.',
    'Se a task principal for ampla, quebre a execução em subtarefas dentro do mesmo escopo e use REQUEST_HELP para especialistas específicos; não transforme isso em reunião infinita.',
    'Se um comando falhar por parsing, quoting ou sintaxe de shell, corrija a execução imediatamente e continue até estabilizar a task.',
    'Se precisar de outro especialista, emita exatamente [REQUEST_HELP: "id_do_agente" WITH "subtarefa objetiva"] em uma linha separada.',
    'Peça ajuda apenas para uma subtarefa delimitada e continue avançando no que for possível sem bloquear a execução.',
    reviewMode
      ? `Aprove apenas emitindo exatamente ${RALPH_COMPLETION_MARKER} em linha isolada. Reprove apenas emitindo exatamente ${RALPH_REJECTION_MARKER} em linha isolada depois de registrar a evidência.`
      : `Só finalize quando puder emitir exatamente ${RALPH_COMPLETION_MARKER}.`,
  ].filter(Boolean).join('\n\n');
}

function buildRalphPrompt(agent, taskTitle, taskId = null, options = {}) {
  const executionPrompt = buildExecutionPrompt(agent, taskTitle, taskId, options);
  if (!executionPrompt) return null;

  const trimmedTask = String(taskTitle || '').replace(/\s+/g, ' ').trim();
  if (trimmedTask.startsWith('/ralph:loop')) {
    return trimmedTask;
  }

  const escapedTask = executionPrompt.replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\s+/g, ' ').trim();
  return `/ralph:loop "${escapedTask}" --max-iterations ${RALPH_MAX_ITERATIONS} ` +
    `--completion-promise ${RALPH_COMPLETION_PROMISE}`;
}

function ensureWorkspaceGeminiSettings(projectDir, ralphIncludeDirs) {
  if (!projectDir || !Array.isArray(ralphIncludeDirs) || ralphIncludeDirs.length === 0) {
    return;
  }

  const geminiDir = path.join(projectDir, '.gemini');
  const settingsPath = path.join(geminiDir, 'settings.json');
  let existingSettings = {};

  if (fs.existsSync(settingsPath)) {
    try {
      existingSettings = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
    } catch (error) {
      console.warn(`[NEXUS] Ignorando .gemini/settings.json inválido em ${settingsPath}:`, error.message);
    }
  }

  const nextSettings = {
    ...existingSettings,
    general: {
      ...(existingSettings.general || {}),
      previewFeatures: true,
    },
    ide: {
      ...(existingSettings.ide || {}),
      enabled: false,
    },
    hooksConfig: {
      ...(existingSettings.hooksConfig || {}),
      enabled: true,
    },
    context: {
      ...(existingSettings.context || {}),
      includeDirectories: Array.from(new Set([
        ...((existingSettings.context && existingSettings.context.includeDirectories) || []),
        ...ralphIncludeDirs,
      ])),
    },
  };

  fs.mkdirSync(geminiDir, { recursive: true });
  fs.writeFileSync(settingsPath, `${JSON.stringify(nextSettings, null, 2)}\n`, 'utf8');
}

function isInternalTaskId(taskId) {
  return /^NX-(HELP|MANUAL)-/i.test(String(taskId || ''));
}

function getRuntimeStateSnapshot() {
  return {
    instanceId: CURRENT_INSTANCE_ID,
    ownerId: CURRENT_INSTANCE_OWNER,
    workspaceIntegrationMode: WORKSPACE_INTEGRATION_MODE,
    collaborationTaskSequence,
    collaborationTasks,
    localPrimaryTaskSequence,
    localPrimaryTasks: githubTasks
      .filter((task) => !isGitHubBackedTaskId(task.id))
      .map((task) => serializePrimaryTaskForRuntimeSnapshot(task)),
    primaryTaskCache: githubTasks
      .filter((task) => !isInternalTaskId(task.id))
      .map((task) => serializePrimaryTaskForRuntimeSnapshot(task)),
    primaryTaskRuntimeMeta: Array.from(primaryTaskRuntimeMeta.entries())
      .map(([taskId, runtimeMeta]) => ({
        taskId,
        lastCompletedByAgentId: runtimeMeta?.lastCompletedByAgentId || null,
        lastFailedByAgentId: runtimeMeta?.lastFailedByAgentId || null,
        lastFailureClass: runtimeMeta?.lastFailureClass || null,
        lastFailureAt: runtimeMeta?.lastFailureAt || null,
        lastFailureMessage: runtimeMeta?.lastFailureMessage || null,
        failureCount: Number(runtimeMeta?.failureCount || 0),
        lastLaneStatus: runtimeMeta?.lastLaneStatus || null,
        lastLaneUpdatedAt: runtimeMeta?.lastLaneUpdatedAt || null,
        publishedBranchName: runtimeMeta?.publishedBranchName || null,
        publishedBranchRef: runtimeMeta?.publishedBranchRef || null,
        publishedBaseBranch: runtimeMeta?.publishedBaseBranch || null,
        publishedCommitSha: runtimeMeta?.publishedCommitSha || null,
        publishedBranchIntegrated:
          runtimeMeta?.publishedBranchIntegrated === undefined
            ? null
            : Boolean(runtimeMeta.publishedBranchIntegrated),
        publishedBranchReason: runtimeMeta?.publishedBranchReason || null,
        publishedBranchLockedAt: runtimeMeta?.publishedBranchLockedAt || null,
        publishedBranchUpdatedAt: runtimeMeta?.publishedBranchUpdatedAt || null,
        awaitingGitLabCi: Boolean(runtimeMeta?.awaitingGitLabCi),
        gitlabCiGateStatus: runtimeMeta?.gitlabCiGateStatus || null,
        gitlabCiGateArmedAt: runtimeMeta?.gitlabCiGateArmedAt || null,
        gitlabCiGateResolvedAt: runtimeMeta?.gitlabCiGateResolvedAt || null,
        gitlabPipelineId: runtimeMeta?.gitlabPipelineId || null,
        gitlabPipelineStatus: runtimeMeta?.gitlabPipelineStatus || null,
        gitlabPipelineStatusClass: runtimeMeta?.gitlabPipelineStatusClass || null,
        gitlabPipelineUrl: runtimeMeta?.gitlabPipelineUrl || null,
        gitlabPipelineSha: runtimeMeta?.gitlabPipelineSha || null,
        gitlabPipelineBranch: runtimeMeta?.gitlabPipelineBranch || null,
        gitlabPipelineProjectPath: runtimeMeta?.gitlabPipelineProjectPath || null,
        gitlabPipelineUpdatedAt: runtimeMeta?.gitlabPipelineUpdatedAt || null,
        gitlabPipelineFinishedAt: runtimeMeta?.gitlabPipelineFinishedAt || null,
        gitlabPipelineCheckedAt: runtimeMeta?.gitlabPipelineCheckedAt || null,
      }))
      .filter(
        (entry) =>
          entry.taskId &&
          (entry.lastCompletedByAgentId ||
            entry.lastFailedByAgentId ||
            entry.lastFailureClass ||
            entry.failureCount > 0 ||
            entry.lastLaneStatus ||
            entry.publishedBranchRef ||
            entry.publishedBranchLockedAt ||
            entry.publishedCommitSha ||
            entry.awaitingGitLabCi ||
            entry.gitlabCiGateStatus ||
            entry.gitlabPipelineId ||
            entry.gitlabPipelineStatus),
      ),
    laneSnapshots: Array.from(agentLaneRuntime.values())
      .map(serializeLaneRecord)
      .filter(Boolean)
      .slice(0, OPERATIONAL_LANE_SNAPSHOT_LIMIT),
    recentLaneFailures: recentLaneFailures
      .map(serializeLaneRecord)
      .filter(Boolean)
      .slice(0, OPERATIONAL_LANE_SNAPSHOT_LIMIT),
    providerRuntime: getProviderRuntimeSnapshot(),
  };
}

function persistRuntimeState() {
  try {
    saveRuntimeState(getRuntimeStateSnapshot());
  } catch (error) {
    console.error('[STATE] Falha ao persistir estado do Nexus:', error.message);
  }
}

function getGitHubBackedPrimaryTasks() {
  return githubTasks.filter((task) => isGitHubBackedTaskId(task?.id) && !isInternalTaskId(task?.id));
}

function collectPhaseReleaseCandidates(tasks = getGitHubBackedPrimaryTasks()) {
  const grouped = new Map();

  tasks.forEach((task) => {
    const phase = normalizePhaseValue(task?.phase);
    const phaseKey = buildPhaseKey(phase, process.env);
    const branchName = resolvePhaseBranchName(phase, process.env);
    if (!phase || !phaseKey || !branchName) {
      return;
    }

    const current = grouped.get(phaseKey) || {
      phase,
      phaseKey,
      branchName,
      tasks: [],
    };
    current.tasks.push(task);
    grouped.set(phaseKey, current);
  });

  return Array.from(grouped.values());
}

async function reconcilePhaseReleases(reason = 'manual') {
  if (phaseReleaseReconciliationInFlight) {
    return phaseReleaseReconciliationInFlight;
  }

  const currentRun = (async () => {
    if (!GITHUB_TASKS_CONFIGURED) {
      return [];
    }

    const createdReleases = [];
    const candidates = collectPhaseReleaseCandidates();
    for (const candidate of candidates) {
      if (!candidate.tasks.every((task) => String(task?.status || '').trim() === 'done')) {
        continue;
      }

      const release = await createGitHubPhaseRelease({
        phase: candidate.phase,
        branchName: candidate.branchName,
        tasks: candidate.tasks,
      });

      if (release?.created) {
        createdReleases.push({
          phase: candidate.phase,
          branchName: candidate.branchName,
          tagName: release.tagName,
          htmlUrl: release.htmlUrl,
        });
        io.emit('agent_log', {
          id: 'ceo',
          log: `🏷️ Release da etapa publicada (${candidate.phase} -> ${candidate.branchName}) [${release.tagName}] via ${reason}.`,
        });
      }
    }

    return createdReleases;
  })();

  phaseReleaseReconciliationInFlight = currentRun.finally(() => {
    if (phaseReleaseReconciliationInFlight === currentRun) {
      phaseReleaseReconciliationInFlight = null;
    }
  });

  return phaseReleaseReconciliationInFlight;
}

function normalizeCollaborationTaskRecord(task, previousTask = null) {
  const now = new Date().toISOString();
  const status = String(task.status || previousTask?.status || 'backlog');
  const hasExplicitUpdatedAt = Object.prototype.hasOwnProperty.call(task || {}, 'updatedAt');
  const normalizedTask = {
    ...previousTask,
    ...task,
    status,
    kind: task.kind || previousTask?.kind || 'collaboration',
    githubUrl:
      Object.prototype.hasOwnProperty.call(task || {}, 'githubUrl')
        ? task.githubUrl || null
        : previousTask?.githubUrl || null,
    githubNodeId:
      Object.prototype.hasOwnProperty.call(task || {}, 'githubNodeId')
        ? task.githubNodeId || null
        : previousTask?.githubNodeId || null,
    sourceTaskId:
      Object.prototype.hasOwnProperty.call(task || {}, 'sourceTaskId')
        ? task.sourceTaskId || null
        : previousTask?.sourceTaskId || null,
    source:
      Object.prototype.hasOwnProperty.call(task || {}, 'source')
        ? task.source || null
        : previousTask?.source || null,
    collaborationKey:
      Object.prototype.hasOwnProperty.call(task || {}, 'collaborationKey')
        ? task.collaborationKey || null
        : previousTask?.collaborationKey || null,
    parentTaskRef:
      Object.prototype.hasOwnProperty.call(task || {}, 'parentTaskRef')
        ? task.parentTaskRef || null
        : previousTask?.parentTaskRef || null,
    createdAt: task.createdAt || previousTask?.createdAt || now,
    updatedAt: hasExplicitUpdatedAt ? task.updatedAt || previousTask?.updatedAt || now : now,
  };

  if (status === 'in_progress') {
    normalizedTask.startedAt = task.startedAt || previousTask?.startedAt || now;
    normalizedTask.completedAt = null;
  } else if (status === 'done') {
    normalizedTask.startedAt = task.startedAt || previousTask?.startedAt || now;
    normalizedTask.completedAt = task.completedAt || previousTask?.completedAt || now;
  } else {
    normalizedTask.completedAt = null;
    normalizedTask.startedAt = task.startedAt || previousTask?.startedAt || null;
  }

  return normalizedTask;
}

function getVisibleTasks() {
  return [...githubTasks, ...collaborationTasks];
}

function extractGameFactorySlugFromTask(task = {}) {
  const text = [
    task.summary,
    task.objective,
    Array.isArray(task.approvedScope) ? task.approvedScope.join('\n') : '',
    Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria.join('\n') : '',
    Array.isArray(task.executionRules) ? task.executionRules.join('\n') : '',
  ]
    .filter(Boolean)
    .join('\n');
  return text.match(/games\/([a-z0-9-]+)\//i)?.[1] || null;
}

function readGameFactoryCatalogSlugs() {
  try {
    const catalogPath = path.join(resolveProjectDir(), 'games', 'index.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    if (!Array.isArray(catalog)) return new Set();
    return new Set(
      catalog
        .map((entry) => String(entry?.slug || '').trim())
        .filter(Boolean),
    );
  } catch (_error) {
    return new Set();
  }
}

function reconcileGameFactoryTasksFromCatalog(reason = 'catalog-reconcile') {
  const catalogSlugs = readGameFactoryCatalogSlugs();
  if (catalogSlugs.size === 0) return [];

  const reconciled = [];
  githubTasks.forEach((task) => {
    const backlogRef = String(task?.backlogRef || '').trim();
    const status = String(task?.status || '').trim();
    if (!/^GAME-\d+/i.test(backlogRef) || ['done', 'pendente_admin', 'in_review'].includes(status)) {
      return;
    }

    const slug = extractGameFactorySlugFromTask(task);
    if (!slug || !catalogSlugs.has(slug)) return;

    const updatedTask = updatePrimaryTaskRecord(task.id, {
      ...task,
      status: 'done',
      assignee: null,
      ownerId: null,
      ownerInstanceId: null,
    });
    if (updatedTask) {
      clearPrimaryTaskCompletionMemory(updatedTask.id);
      clearPrimaryTaskFailureMemory(updatedTask.id);
      primaryTaskRuntimeMeta.delete(updatedTask.id);
      reconciled.push({ id: updatedTask.id, backlogRef, slug });
    }
  });

  if (reconciled.length > 0) {
    persistRuntimeState();
    io.emit('agent_log', {
      id: 'ceo',
      log:
        `🧩 Game factory reconciliou ${reconciled.length} card(s) como Done pelo catálogo validado ` +
        `(${reason}): ${reconciled.map((entry) => entry.backlogRef).join(', ')}.`,
    });
  }

  return reconciled;
}

function emitTasksUpdate() {
  persistRuntimeState();
  io.emit('tasks_update', getVisibleTasks());
  refreshOperationalMetrics();
}

function findInternalTask(taskId) {
  return collaborationTasks.find((task) => task.id === taskId) || null;
}

function findVisibleTask(taskId) {
  return githubTasks.find((task) => task.id === taskId) || findInternalTask(taskId);
}

function isGitHubMirroredCollaborationTask(task) {
  return Boolean(task && task.source === 'github' && task.sourceTaskId && isGitHubBackedTaskId(task.sourceTaskId));
}

function resolveGitHubTaskMirrorId(taskOrTaskId) {
  if (typeof taskOrTaskId === 'string') {
    const internalTask = findInternalTask(taskOrTaskId);
    if (isGitHubMirroredCollaborationTask(internalTask)) {
      return internalTask.sourceTaskId;
    }
    return isGitHubBackedTaskId(taskOrTaskId) ? taskOrTaskId : null;
  }

  if (isGitHubMirroredCollaborationTask(taskOrTaskId)) {
    return taskOrTaskId.sourceTaskId;
  }

  return isGitHubBackedTaskId(taskOrTaskId?.id) ? taskOrTaskId.id : null;
}

function syncGitHubMirroredTaskStatus(taskOrTaskId, status, assigneeId, reason, metadata = {}) {
  const sourceTaskId = resolveGitHubTaskMirrorId(taskOrTaskId);
  if (!sourceTaskId) return;
  const ownerMetadata = isPrimaryActiveStatus(status)
    ? buildPrimaryTaskOwnershipPatch(status, metadata)
    : {
        ownerId: null,
        ownerInstanceId: null,
      };

  moveGitHubTask(sourceTaskId, status, assigneeId, {
    ...ownerMetadata,
    ...metadata,
  })
    .then((synced) => {
      if (synced) return;

      io.emit('agent_log', {
        id: 'ceo',
        log: `⚠️ Falha ao sincronizar ${sourceTaskId} no GitHub (${reason}). O orquestrador vai tentar novamente no próximo ciclo.`,
      });
    })
    .catch((error) => {
      io.emit('agent_log', {
        id: 'ceo',
        log: `⚠️ Falha ao sincronizar ${sourceTaskId} no GitHub (${reason}): ${error.message}`,
      });
    });
}

function buildGitHubMirroredCollaborationTask(task, primaryTasks = [], previousTask = null) {
  const sourceTaskId = String(task?.id || '').trim();
  const id = buildGitHubCollaborationMirrorId(sourceTaskId);
  if (!id) return null;

  const parentTaskId =
    resolveGitHubCollaborationParentTaskId(task, primaryTasks) || previousTask?.parentTaskId || null;
  if (!parentTaskId) return null;
  const parentTask = parentTaskId
    ? primaryTasks.find((entry) => entry.id === parentTaskId) || null
    : null;
  const collaborationTitle = String(task?.summary || '').trim()
    ? `[${sourceTaskId}] ${String(task.summary).trim()}`
    : task.title;

  return normalizeCollaborationTaskRecord(
    {
      id,
      title: collaborationTitle,
      status: task.status || 'backlog',
      assignee: task.assignee || null,
      requesterId: previousTask?.requesterId || parentTask?.assignee || null,
      parentTaskId,
      kind: 'collaboration',
      sourceTaskId,
      source: 'github',
      githubUrl: task.githubUrl || null,
      githubNodeId: task.githubNodeId || null,
      collaborationKey: task.collaborationKey || null,
      parentTaskRef: task.parentTaskRef || null,
      backlogRef: task.backlogRef || parentTask?.backlogRef || task.parentTaskRef || null,
      summary: task.summary || previousTask?.summary || null,
      objective: task.objective || previousTask?.objective || null,
      phase: task.phase || parentTask?.phase || previousTask?.phase || null,
      suggestedSquad:
        task.suggestedSquad || parentTask?.suggestedSquad || previousTask?.suggestedSquad || null,
      approvedScope:
        Array.isArray(task.approvedScope) && task.approvedScope.length > 0
          ? task.approvedScope
          : previousTask?.approvedScope || [],
      acceptanceCriteria:
        Array.isArray(task.acceptanceCriteria) && task.acceptanceCriteria.length > 0
          ? task.acceptanceCriteria
          : previousTask?.acceptanceCriteria || [],
      dependencies:
        Array.isArray(task.dependencies) && task.dependencies.length > 0
          ? task.dependencies
          : previousTask?.dependencies || [],
      externalAccessGaps:
        Array.isArray(task.externalAccessGaps) && task.externalAccessGaps.length > 0
          ? task.externalAccessGaps
          : previousTask?.externalAccessGaps || [],
      outOfScope:
        Array.isArray(task.outOfScope) && task.outOfScope.length > 0
          ? task.outOfScope
          : previousTask?.outOfScope || [],
      executionRules:
        Array.isArray(task.executionRules) && task.executionRules.length > 0
          ? task.executionRules
          : previousTask?.executionRules || [],
      ownerId: task.ownerId || previousTask?.ownerId || null,
      ownerInstanceId: task.ownerInstanceId || previousTask?.ownerInstanceId || null,
      createdAt: task.createdAt || previousTask?.createdAt || null,
      updatedAt: task.updatedAt || previousTask?.updatedAt || null,
      startedAt: task.startedAt || previousTask?.startedAt || null,
      completedAt: task.completedAt || previousTask?.completedAt || null,
    },
    previousTask,
  );
}

function nextLocalPrimaryTaskId() {
  const nextId = `NX-TASK-${String(localPrimaryTaskSequence).padStart(4, '0')}`;
  localPrimaryTaskSequence += 1;
  persistRuntimeState();
  return nextId;
}

function createLocalPrimaryTaskRecord(payload) {
  const ownership =
    payload.assignee && isPrimaryActiveStatus(payload.status || 'backlog')
      ? buildPrimaryTaskOwnershipPatch(payload.status || 'backlog', payload)
      : { ownerId: null, ownerInstanceId: null };
  const task = normalizePrimaryTaskRecord({
    id: payload.id || nextLocalPrimaryTaskId(),
    title: payload.title,
    status: payload.status || 'backlog',
    assignee: payload.assignee || null,
    ...normalizeTaskMetadataPayload(payload),
    ownerId: ownership.ownerId,
    ownerInstanceId: ownership.ownerInstanceId,
    githubUrl: null,
    githubNodeId: null,
  });

  githubTasks = [...githubTasks.filter((entry) => entry.id !== task.id), task];
  persistRuntimeState();
  emitTasksUpdate();
  return task;
}

async function createPrimaryTaskRecord(payload = {}) {
  const title = String(payload.title || '').trim();
  if (!title) return null;

  const requestedStatus = String(payload.status || 'backlog').trim() || 'backlog';
  const requestedAssignee = String(payload.assignee || '').trim() || null;
  const taskMetadata = normalizeTaskMetadataPayload(payload);
  const resolvedAssignee = requestedAssignee
    ? (() => {
        const agent = findAgentById(requestedAssignee);
        return agent && agent.role !== 'ceo' ? agent.id : null;
      })()
    : null;
  const preferGitHub = payload.preferGitHub !== false && GITHUB_TASKS_CONFIGURED;
  let task = null;

  if (preferGitHub) {
    const createdGitHubTask = await createGitHubTask(title, resolvedAssignee, {
      ...taskMetadata,
      status: requestedStatus,
      ownerId: null,
      ownerInstanceId: null,
    });
    if (createdGitHubTask) {
      task = upsertPrimaryTaskRecord(createdGitHubTask);
    } else {
      io.emit('agent_log', {
        id: 'ceo',
        log: `⚠️ Falha ao criar ticket no GitHub para "${title}". O Nexus vai registrar a task localmente para não perder o fluxo.`,
      });
    }
  }

  if (!task) {
    task = createLocalPrimaryTaskRecord({
      id: payload.id || null,
      title,
      status: requestedStatus,
      assignee: resolvedAssignee,
      ...taskMetadata,
    });
  }

  if (!task) return null;

  if (task.status !== requestedStatus || task.assignee !== resolvedAssignee) {
    const ownershipPatch =
      resolvedAssignee && isPrimaryActiveStatus(requestedStatus)
        ? buildPrimaryTaskOwnershipPatch(requestedStatus)
        : { ownerId: null, ownerInstanceId: null };
    task = updatePrimaryTaskRecord(task.id, {
      ...task,
      status: requestedStatus,
      assignee: resolvedAssignee,
      ownerId: ownershipPatch.ownerId,
      ownerInstanceId: ownershipPatch.ownerInstanceId,
    }) || task;
  }

  if (isGitHubBackedTaskId(task.id)) {
    syncPrimaryTaskStatus(task.id, task.status, task.assignee, 'criacao', {
      ownerId: task.ownerId || null,
      ownerInstanceId: task.ownerInstanceId || null,
    });
  }

  scheduleAutonomousDispatch(`nova-task:${task.id}`);
  return task;
}

function nextCollaborationTaskId() {
  const nextId = `NX-HELP-${String(collaborationTaskSequence).padStart(4, '0')}`;
  collaborationTaskSequence += 1;
  persistRuntimeState();
  return nextId;
}

function createCollaborationTaskRecord(payload) {
  const existingTask = collaborationTasks.find((task) =>
    task.status !== 'done' &&
    task.assignee === payload.assignee &&
    task.parentTaskId === payload.parentTaskId &&
    task.title === payload.title,
  );
  if (existingTask) return existingTask;

  const task = normalizeCollaborationTaskRecord({
    id: payload.id || nextCollaborationTaskId(),
    title: payload.title,
    status: payload.status || 'backlog',
    assignee: payload.assignee || null,
    requesterId: payload.requesterId || null,
    parentTaskId: payload.parentTaskId || null,
    kind: payload.kind || 'collaboration',
    githubUrl: null,
  });

  collaborationTasks = [...collaborationTasks, task];
  persistRuntimeState();
  emitTasksUpdate();
  return task;
}

function updateInternalTask(taskId, updater) {
  let updatedTask = null;
  collaborationTasks = collaborationTasks.map((task) => {
    if (task.id !== taskId) return task;
    const nextTask = typeof updater === 'function' ? updater(task) : { ...task, ...updater };
    updatedTask = normalizeCollaborationTaskRecord(nextTask, task);
    return updatedTask;
  });

  if (updatedTask) {
    persistRuntimeState();
    emitTasksUpdate();
  }

  return updatedTask;
}

function getQueuedRuns(agentId) {
  return queuedAgentRuns.get(agentId) || [];
}

function setQueuedRuns(agentId, runs) {
  if (runs.length > 0) {
    queuedAgentRuns.set(agentId, runs);
    refreshOperationalMetrics();
    return;
  }

  queuedAgentRuns.delete(agentId);
  refreshOperationalMetrics();
}

function isLivePreparingRun(run) {
  return Boolean(run) && run.cancelled !== true;
}

function forEachLivePreparingRun(visitor) {
  preparingAgentRuns.forEach((run, agentId) => {
    if (isLivePreparingRun(run)) {
      visitor(run, agentId);
    }
  });
}

function countPreparingRuns() {
  let total = 0;
  forEachLivePreparingRun(() => {
    total += 1;
  });
  return total;
}

function getPreparingRun(agentId, options = {}) {
  const run = preparingAgentRuns.get(agentId) || null;
  if (!run) {
    return null;
  }
  if (options.includeCancelled) {
    return run;
  }
  return isLivePreparingRun(run) ? run : null;
}

function terminateTrackedProcess(processHandle) {
  if (!processHandle || processHandle.exitCode !== null || processHandle.signalCode) {
    return;
  }

  try {
    processHandle.kill('SIGTERM');
  } catch (_error) {
    return;
  }

  const hardKillTimer = setTimeout(() => {
    if (processHandle.exitCode === null && !processHandle.signalCode) {
      try {
        processHandle.kill('SIGKILL');
      } catch (_killError) {}
    }
  }, 1000);
  hardKillTimer.unref?.();
}

function abortPreparingRunWorkspace(preparingRun) {
  if (!preparingRun) {
    return;
  }

  const abortController = preparingRun.workspacePrepAbortController || null;
  if (abortController && !abortController.signal.aborted) {
    try {
      abortController.abort();
    } catch (_error) {}
  }

  if (preparingRun.workspacePrepProcesses instanceof Set) {
    Array.from(preparingRun.workspacePrepProcesses).forEach((processHandle) => {
      terminateTrackedProcess(processHandle);
    });
  }
}

function clearPreparingRunWorkspaceTracking(preparingRun) {
  if (!preparingRun || typeof preparingRun !== 'object') {
    return;
  }

  if (preparingRun.workspacePrepProcesses instanceof Set) {
    preparingRun.workspacePrepProcesses.clear();
  }
  preparingRun.workspacePrepAbortController = null;
}

function isPreparationAbortError(error, preparingRun) {
  if (preparingRun?.cancelled) {
    return true;
  }

  const errorName = String(error?.name || '').trim();
  const errorCode = String(error?.code || '').trim();
  return errorName === 'AbortError' || errorCode === 'ABORT_ERR';
}

function isAgentOccupied(agentId) {
  return activeAgentRuns.has(agentId) || preparingAgentRuns.has(agentId);
}

function buildRunRequestKey(runRequest) {
  return [
    runRequest.requestKind || 'task',
    runRequest.id,
    runRequest.taskId || runRequest.taskTitle || 'task',
    runRequest.parentTaskId || '',
  ].join('::');
}

function hasScheduledRun(agentId, taskId) {
  return getQueuedRuns(agentId).some((run) => run.taskId === taskId);
}

function findPendingRunForAgent(agentId) {
  return getQueuedRuns(agentId)[0] || null;
}

function findQueuedRun(agentId, predicate) {
  return getQueuedRuns(agentId).find(predicate) || null;
}

function removeQueuedRuns(agentId, predicate) {
  const queue = getQueuedRuns(agentId);
  if (queue.length === 0) return [];

  const removed = [];
  const kept = [];

  queue.forEach((run) => {
    if (predicate(run)) {
      removed.push(run);
      return;
    }
    kept.push(run);
  });

  setQueuedRuns(agentId, kept);
  return removed;
}

function queueRalphRun(runRequest, options = {}) {
  const queue = getQueuedRuns(runRequest.id);
  const dedupedQueue = queue.filter((candidate) => buildRunRequestKey(candidate) !== buildRunRequestKey(runRequest));
  if (options.position === 'front') {
    dedupedQueue.unshift(runRequest);
  } else {
    dedupedQueue.push(runRequest);
  }
  setQueuedRuns(runRequest.id, dedupedQueue);

  if (!isAgentOccupied(runRequest.id) && !getPreparingRun(runRequest.id)) {
    setAgentLaneState(
      runRequest.id,
      runRequest,
      'queued',
      runRequest.requestKind === 'collaboration'
        ? 'Colaboracao enfileirada aguardando execucao.'
        : 'Task enfileirada aguardando execucao.',
      {
        retryCount: runRequest.retryCount,
        commandRecoveryCount: runRequest.commandRecoveryCount,
      },
    );
  }
}

function stopAgentRun(agentId, reason, options = {}) {
  const targetTaskId = options.taskId || null;
  const removedQueuedRuns = removeQueuedRuns(
    agentId,
    (run) => !targetTaskId || run.taskId === targetTaskId,
  );
  let stoppedActive = false;

  if (removedQueuedRuns.length > 0 && reason) {
    io.emit('agent_log', { id: agentId, log: `${reason} [SYSTEM] Task removida da fila.` });
    removedQueuedRuns.forEach((run) => {
      setAgentLaneState(agentId, run, 'cancelled', truncateText(reason, 220), {
        taskStatus: run.taskStatus || null,
      });
    });
  }

  const activeRun = activeAgentRuns.get(agentId);
  if (activeRun && (!targetTaskId || activeRun.taskId === targetTaskId)) {
    activeRun.stoppedBySystem = true;
    setAgentLaneState(agentId, activeRun, 'cancelled', truncateText(reason, 220), {
      taskStatus: activeRun.taskStatus || null,
      retryCount: activeRun.retryCount,
      commandRecoveryCount: activeRun.commandRecoveryCount,
    });
    activeRun.process.kill();
    stoppedActive = true;

    if (reason) {
      io.emit('agent_log', { id: agentId, log: reason });
    }

    return { removedQueuedRuns, stoppedActive };
  }

  const preparingRun = getPreparingRun(agentId, { includeCancelled: true });
  if (!preparingRun || (targetTaskId && preparingRun.taskId !== targetTaskId)) {
    return { removedQueuedRuns, stoppedActive };
  }

  preparingRun.cancelled = true;
  abortPreparingRunWorkspace(preparingRun);
  setAgentLaneState(agentId, preparingRun, 'cancelled', truncateText(reason, 220), {
    taskStatus: preparingRun.taskStatus || null,
    retryCount: preparingRun.retryCount,
    commandRecoveryCount: preparingRun.commandRecoveryCount,
  });
  stoppedActive = true;
  refreshOperationalMetrics();

  if (reason) {
    io.emit('agent_log', { id: agentId, log: reason });
  }

  return { removedQueuedRuns, stoppedActive };
}

function stopTaskRuns(taskId, reason) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId) return [];

  const affectedAgentIds = new Set([
    ...activeAgentRuns.keys(),
    ...preparingAgentRuns.keys(),
    ...queuedAgentRuns.keys(),
  ]);

  const stopped = [];
  affectedAgentIds.forEach((agentId) => {
    const result = stopAgentRun(agentId, reason, { taskId: normalizedTaskId });
    if (result.stoppedActive || result.removedQueuedRuns.length > 0) {
      stopped.push({ agentId, ...result });
    }
  });

  return stopped;
}

function startNextQueuedRalphRun(agentId) {
  if (isAgentOccupied(agentId)) return;

  const queue = getQueuedRuns(agentId);
  const nextRun = queue.shift();
  setQueuedRuns(agentId, queue);

  if (!nextRun) {
    scheduleAutonomousDispatch(`fila-vazia:${agentId}`);
    return;
  }
  startRalphForAgent(nextRun.id, nextRun.taskTitle, nextRun.taskId, {
    ...nextRun,
    queueIfBusy: false,
    fromQueue: true,
  });
}

function isDefaultMeetingAgent(agent) {
  return agent.role !== 'ceo' && !String(agent.id || '').startsWith('agent_');
}

function validateTaskClaim(task, agent, agentsToWork) {
  if (!task) {
    return 'Task não encontrada.';
  }
  if (!canCurrentInstanceManagePrimaryTask(task)) {
    return `Task ${task.id} pertence a outra instância (${resolvePrimaryTaskOwnerInstanceId(task) || 'desconhecida'}).`;
  }

  const existingActiveTask = findAssignedActivePrimaryTask(agent.id, task.id);
  if (existingActiveTask) {
    return `${agent.name} já está executando ${existingActiveTask.id}.`;
  }

  if (
    !isImplementationDispatchCandidateStatus(task.status) &&
    !agentsToWork.some((work) => work.taskId === task.id)
  ) {
    return `Task ${task.id} já não está disponível (${task.status}).`;
  }

  if (agentsToWork.some((work) => work.taskId === task.id)) {
    return `Task ${task.id} já foi assumida nesta reunião.`;
  }

  if (agentsToWork.some((work) => work.id === agent.id)) {
    return `${agent.name} já assumiu uma task nesta reunião.`;
  }

  if (task.assignee && task.assignee !== agent.id) {
    return `Task ${task.id} está atribuída a ${task.assignee}, não a ${agent.id}.`;
  }

  return null;
}

function claimTaskForMeeting(task, agent, agentsToWork, reason = 'reuniao') {
  const claimError = validateTaskClaim(task, agent, agentsToWork);
  if (claimError) {
    return { ok: false, error: claimError };
  }

  if (!canAgentStartPrimaryTaskNow(agent.id, task.id)) {
    return { ok: false, error: `${agent.name} já possui execução reservada fora da reunião.` };
  }

  const updatedTask = updatePrimaryTaskRecord(task.id, {
    ...task,
    status: 'in_progress',
    assignee: agent.id,
    ...buildPrimaryTaskOwnershipPatch('in_progress'),
  });
  if (!updatedTask) {
    return { ok: false, error: `Task ${task.id} não pôde ser atualizada.` };
  }

  syncPrimaryTaskStatus(task.id, 'in_progress', agent.id, reason, {
    ownerId: updatedTask.ownerId || null,
    ownerInstanceId: updatedTask.ownerInstanceId || null,
  });
  agentsToWork.push({ id: agent.id, taskId: task.id, taskTitle: updatedTask.title || task.title });
  return { ok: true, task: updatedTask };
}

function selectMeetingFallbackAssignment(meetingTasks, activeAgents, agentsToWork) {
  const participantIds = new Set(activeAgents.map((agent) => agent.id));
  const claimedTaskIds = new Set(agentsToWork.map((work) => work.taskId));
  const claimedAgentIds = new Set(agentsToWork.map((work) => work.id));

  const prioritizedTasks = [...meetingTasks]
    .filter((task) => !claimedTaskIds.has(task.id))
    .sort((left, right) => {
      const leftAssignedToParticipant = left.assignee && participantIds.has(left.assignee) ? 1 : 0;
      const rightAssignedToParticipant = right.assignee && participantIds.has(right.assignee) ? 1 : 0;
      if (leftAssignedToParticipant !== rightAssignedToParticipant) {
        return rightAssignedToParticipant - leftAssignedToParticipant;
      }

      const leftUnassigned = left.assignee ? 0 : 1;
      const rightUnassigned = right.assignee ? 0 : 1;
      if (leftUnassigned !== rightUnassigned) {
        return rightUnassigned - leftUnassigned;
      }

      const leftReady = left.status === 'ready' ? 1 : 0;
      const rightReady = right.status === 'ready' ? 1 : 0;
      if (leftReady !== rightReady) {
        return rightReady - leftReady;
      }

      return String(left.id).localeCompare(String(right.id));
    });

  for (const task of prioritizedTasks) {
    const preferredAgents = [];
    if (task.assignee && participantIds.has(task.assignee)) {
      const assignedParticipant = activeAgents.find((agent) => agent.id === task.assignee);
      if (assignedParticipant) {
        preferredAgents.push(assignedParticipant);
      }
    }

    activeAgents.forEach((agent) => {
      if (!preferredAgents.some((candidate) => candidate.id === agent.id)) {
        preferredAgents.push(agent);
      }
    });

    for (const agent of preferredAgents) {
      if (!agent || claimedAgentIds.has(agent.id)) {
        continue;
      }

      if (!canAgentStartPrimaryTaskNow(agent.id, task.id)) {
        continue;
      }

      if (!validateTaskClaim(task, agent, agentsToWork)) {
        return { task, agent };
      }
    }
  }

  return null;
}

function isGitHubBackedTaskId(taskId) {
  return /^GH-\d+$/i.test(String(taskId || '').trim());
}

function buildDefaultPrimaryTasks() {
  return [
    { id: 'T-101', title: 'Setup CI/CD Pipeline', status: 'backlog', assignee: null },
    { id: 'T-102', title: 'Fix Login Bug', status: 'in_progress', assignee: 'dev' },
    { id: 'T-103', title: 'Write unit tests', status: 'done', assignee: 'qa' },
    { id: 'T-104', title: 'Design Database Schema', status: 'ready', assignee: null },
  ].map((task) => normalizePrimaryTaskRecord(task));
}

function serializePrimaryTaskForRuntimeSnapshot(task) {
  return {
    id: task.id,
    title: task.title,
    status: task.status,
    assignee: task.assignee || null,
    ownerId: task.ownerId || null,
    ownerInstanceId: task.ownerInstanceId || null,
    githubUrl: task.githubUrl || null,
    githubNodeId: task.githubNodeId || null,
    createdAt: task.createdAt || null,
    updatedAt: task.updatedAt || null,
    statusChangedAt: task.statusChangedAt || null,
    assigneeChangedAt: task.assigneeChangedAt || null,
    startedAt: task.startedAt || null,
    completedAt: task.completedAt || null,
    backlogRef: task.backlogRef || null,
    priority: task.priority || null,
    objective: task.objective || null,
    phase: task.phase || null,
    suggestedSquad: task.suggestedSquad || null,
    approvedScope: Array.isArray(task.approvedScope) ? task.approvedScope : [],
    acceptanceCriteria: Array.isArray(task.acceptanceCriteria) ? task.acceptanceCriteria : [],
    dependencies: Array.isArray(task.dependencies) ? task.dependencies : [],
    externalAccessGaps: Array.isArray(task.externalAccessGaps) ? task.externalAccessGaps : [],
    outOfScope: Array.isArray(task.outOfScope) ? task.outOfScope : [],
    executionRules: Array.isArray(task.executionRules) ? task.executionRules : [],
    branchName: task.branchName || null,
  };
}

function buildInitialPrimaryTasks() {
  const sanitizePersistedPrimaryTaskForBoot = (task) => {
    const normalizedTask = normalizePrimaryTaskRecord(task);
    if (!normalizedTask) {
      return normalizedTask;
    }
    if (!GITHUB_TASKS_CONFIGURED || !isGitHubBackedTaskId(normalizedTask.id)) {
      return normalizedTask;
    }
    if (!isPrimaryActiveStatus(normalizedTask.status)) {
      return normalizedTask;
    }

    return normalizePrimaryTaskRecord(
      {
        ...normalizedTask,
        status: 'backlog',
        assignee: null,
        ownerId: null,
        ownerInstanceId: null,
        startedAt: null,
        completedAt: null,
      },
      normalizedTask,
    );
  };

  const persistedPrimaryTaskCache = Array.isArray(initialRuntimeState.primaryTaskCache)
    ? initialRuntimeState.primaryTaskCache
        .map((task) => sanitizePersistedPrimaryTaskForBoot(task))
        .filter(Boolean)
    : [];

  if (persistedPrimaryTaskCache.length > 0) {
    return persistedPrimaryTaskCache;
  }

  const persistedLocalTasks = Array.isArray(initialRuntimeState.localPrimaryTasks)
    ? initialRuntimeState.localPrimaryTasks
        .map((task) => normalizePrimaryTaskRecord(task))
        .filter(Boolean)
    : [];

  if (persistedLocalTasks.length > 0) {
    return persistedLocalTasks;
  }

  if (GITHUB_TASKS_CONFIGURED || !BOOTSTRAP_DEMO_TASKS_ENABLED) {
    return [];
  }

  return buildDefaultPrimaryTasks();
}

const DEFAULT_AGENT_BLUEPRINTS = Object.freeze([
  ...buildDefaultAgentBlueprints(process.env),
]);

function buildDefaultAgentRoster() {
  const defaultProvider = getGlobalDefaultLlmProvider();
  return DEFAULT_AGENT_BLUEPRINTS.map((blueprint) => {
    const provider = normalizeLlmProvider(blueprint.llmProvider) || defaultProvider;
    return normalizeAgentConfig({
      ...blueprint,
      status: 'idle',
      llmProvider: provider,
      model:
        normalizeRegisteredModelName(blueprint.model, provider) ||
        modelTierForProvider(provider, blueprint.modelTier) ||
        defaultModelForProvider(provider),
    });
  });
}

let agents = buildDefaultAgentRoster();

let githubTasks = buildInitialPrimaryTasks();

function findAgentById(id) {
  return agents.find((agent) => agent.id === id);
}

function isKnownRunnableAgentId(id) {
  const agent = findAgentById(id);
  return Boolean(agent && agent.role !== 'ceo');
}

function getAgentTeam(agent) {
  return agent?.team === REVIEW_TEAM ? REVIEW_TEAM : PRIMARY_TEAM;
}

function isReviewTeamAgent(agent) {
  return getAgentTeam(agent) === REVIEW_TEAM;
}

function isPrimaryTeamAgent(agent) {
  return getAgentTeam(agent) === PRIMARY_TEAM;
}

function countDispatchableReadyTasks() {
  return githubTasks.filter(
    (task) =>
      String(task.status || '').trim() === 'ready' &&
      canCurrentInstanceManagePrimaryTask(task) &&
      !isPrimaryTaskDispatchBlocked(task),
  ).length;
}

function countPendingReviewTasks() {
  return githubTasks.filter(
    (task) =>
      String(task.status || '').trim() === 'in_review' &&
      canCurrentInstanceManagePrimaryTask(task) &&
      !isPrimaryTaskDispatchBlocked(task),
  ).length;
}

function countRunnableAgentsForTeam(team) {
  return agents.filter(
    (agent) =>
      agent.role !== 'ceo' &&
      getAgentTeam(agent) === team &&
      canAgentStartPrimaryTaskNow(agent.id),
  ).length;
}

function shouldReviewTeamAssistImplementation(task) {
  const status = String(task?.status || '').trim();
  if (!isImplementationDispatchCandidateStatus(status)) return false;

  const readyCount = countDispatchableReadyTasks();
  const primaryRunnableCount = countRunnableAgentsForTeam(PRIMARY_TEAM);
  const pendingReviewCount = countPendingReviewTasks();

  if (primaryRunnableCount === 0) {
    return readyCount > 0;
  }

  if (readyCount > primaryRunnableCount) {
    return true;
  }

  return readyCount >= Math.max(3, primaryRunnableCount + 1) && pendingReviewCount === 0;
}

function hasActiveRun(agentId, taskId) {
  const run = activeAgentRuns.get(agentId);
  return Boolean(run && run.taskId === taskId);
}

function buildPrimaryTaskRunTitle(task) {
  if (!task) return '';
  return task.status === 'in_review' ? `[Review ${task.id}] ${task.title}` : task.title;
}

function findAssignedPrimaryTask(agentId, options = {}) {
  const excludedTaskId = options.excludedTaskId || null;
  const statuses = new Set(options.statuses || ['in_progress', 'in_review']);

  return githubTasks.find(
    (task) =>
      task.assignee === agentId &&
      statuses.has(task.status) &&
      canCurrentInstanceManagePrimaryTask(task) &&
      task.id !== excludedTaskId,
  ) || null;
}

function findAssignedInProgressTask(agentId, excludedTaskId = null) {
  return findAssignedPrimaryTask(agentId, {
    excludedTaskId,
    statuses: ['in_progress'],
  });
}

function findAssignedActivePrimaryTask(agentId, excludedTaskId = null) {
  return findAssignedPrimaryTask(agentId, {
    excludedTaskId,
    statuses: ['in_progress', 'in_review'],
  });
}

function canAgentStartPrimaryTaskNow(agentId, excludedTaskId = null) {
  return (
    !isAgentOccupied(agentId) &&
    !hasQueuedWork(agentId) &&
    !findAssignedActivePrimaryTask(agentId, excludedTaskId)
  );
}

function buildTaskScoringText(task) {
  if (!task) return '';

  const approvedScope = Array.isArray(task.approvedScope) ? task.approvedScope.join(' ') : '';
  const dependencies = Array.isArray(task.dependencies) ? task.dependencies.join(' ') : '';
  return normalizeTaskText([
    task.id,
    task.title,
    task.summary,
    task.objective,
    task.scope,
    task.suggestedSquad,
    approvedScope,
    dependencies,
    task.phase,
  ].filter(Boolean).join(' '));
}

function normalizeTaskText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s[\]-]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function parseTaskNumber(taskId) {
  const match = /^GH-(\d+)$/i.exec(String(taskId || '').trim());
  return match ? Number(match[1]) : 0;
}

function getRoleTaskKeywords(role) {
  switch (role) {
    case 'pm':
      return [
        'billing',
        'regras de negocio',
        'regra de negocio',
        'detalhamento',
        'discovery',
        'prd',
        'copy',
        'ux',
        'mcp',
        'documentacao',
        'portal',
        'guia',
        'visao geral',
      ];
    case 'architect':
      return [
        'arquitet',
        'adapter',
        'adapters',
        'ambiente',
        'configuracao',
        'configuracao por ambiente',
        'contract',
        'contrato',
        'contratos',
        'interface',
        'interfaces',
        'microserv',
        'mensager',
        'mcp',
        'sdk',
        'server functions',
        'modelo de dados',
        'orm',
        'schema',
        'plataforma',
        'sistema assincrono',
        'workflows',
        'servidor',
      ];
    case 'sm':
      return [
        'processo',
        'quality gates',
        'runbook',
        'backup',
        'restore',
        'rto',
        'rpo',
        'checklist',
        'plano',
        'ready',
        'playbook',
        'coverage',
        'cobertura',
        'teste',
      ];
    case 'dev':
      return [
        'adapter',
        'adapters',
        'feature',
        'integracao',
        'sync',
        'oauth',
        'frontend',
        'flutter',
        'mobile',
        'onboarding',
        'cadastro',
        'perfil',
        'mock',
        'storage',
        'realtime',
        'backend',
        'api',
        'workflow',
        'automation',
        'ux',
        'custom',
        'phone',
        'stripe',
        'portal',
      ];
    case 'qa':
      return [
        'test',
        'teste',
        'qa',
        'valida',
        'regress',
        'e2e',
        'auditoria',
        'logs de erro',
        'quality gate',
        'cobertura',
        'review',
      ];
    case 'devops':
      return [
        'ci/cd',
        'deploy',
        'release',
        'docker',
        'cloud',
        'infra',
        'iac',
        'build',
        'pipeline',
        'actions',
        'secret',
        'observabilidade',
        'apm',
        'datadog',
        'sentry',
        'log rotation',
      ];
    default:
      return [];
  }
}

function countKeywordMatches(text, keywords) {
  return keywords.reduce((count, keyword) => (text.includes(keyword) ? count + 1 : count), 0);
}

function scoreSuggestedSquadFit(agent, task) {
  const squad = normalizeTaskText(task?.suggestedSquad || '');
  if (!squad) return 0;

  let score = 0;
  if (/\bdevops\b/.test(squad) && agent.role === 'devops') score += 220;
  if (/\bqa\b/.test(squad) && agent.role === 'qa') score += 180;
  if (/(^|\s)architect|\barchitecture\b/.test(squad) && agent.role === 'architect') score += 240;
  if (/\bbackend\b/.test(squad)) {
    if (agent.role === 'dev') score += 220;
    if (agent.role === 'architect') score += 160;
  }
  if (/\bmobile\b/.test(squad)) {
    if (agent.role === 'dev') score += 180;
    if (agent.role === 'pm') score += 80;
  }
  if (/\bproduct\b/.test(squad) && agent.role === 'pm') score += 120;
  if (/\bdata\b/.test(squad)) {
    if (agent.role === 'dev') score += 80;
    if (agent.role === 'architect') score += 100;
  }
  if (/\bsecurity\b/.test(squad)) {
    if (agent.role === 'architect') score += 120;
    if (agent.role === 'qa') score += 80;
    if (agent.role === 'devops') score += 80;
  }

  return score;
}

function isOrphanedPrimaryTask(task) {
  if (!task || !['in_progress', 'in_review'].includes(String(task.status || '').trim())) {
    return false;
  }
  if (isForeignOwnedPrimaryTask(task)) {
    return false;
  }

  const assignee = String(task.assignee || '').trim();
  if (!assignee) return false;

  const assignedAgent = findAgentById(assignee);
  return !assignedAgent || assignedAgent.role === 'ceo';
}

function scoreTaskForAgent(agent, task) {
  if (!agent || agent.role === 'ceo' || !task) return Number.NEGATIVE_INFINITY;
  if (!canCurrentInstanceManagePrimaryTask(task)) return Number.NEGATIVE_INFINITY;

  const status = String(task.status || '').trim();
  if (!isAutoDispatchCandidateStatus(status)) {
    return Number.NEGATIVE_INFINITY;
  }

  if (task.assignee) {
    if (task.assignee === agent.id) {
      // Strong preference for cards explicitly assigned to the agent.
    } else if (isKnownRunnableAgentId(task.assignee)) {
      return Number.NEGATIVE_INFINITY;
    } else {
      // Do not steal cards already assigned to another human/external agent.
      return Number.NEGATIVE_INFINITY;
    }
  }

  const text = buildTaskScoringText(task);
  if (
    task.assignee !== agent.id &&
    shouldBlockAgentOnImplementationDispatch(agent, task, { text })
  ) {
    return Number.NEGATIVE_INFINITY;
  }
  const runtimeMeta = getPrimaryTaskRuntimeMeta(task.id);
  const recentFailureAtMs = Date.parse(String(runtimeMeta?.lastFailureAt || ''));
  const recentFailureClass = String(runtimeMeta?.lastFailureClass || '').trim().toLowerCase();
  const recentFailureAffectsAgent = Boolean(
    Number.isFinite(recentFailureAtMs) &&
      Date.now() - recentFailureAtMs <= PRIMARY_TASK_FAILURE_PENALTY_WINDOW_MS &&
      shouldPrimaryTaskFailurePenaltyApplyToAgent(recentFailureClass, {
        failedByAgentId: runtimeMeta?.lastFailedByAgentId || null,
        agentId: agent.id,
      }),
  );
  const keywords = getRoleTaskKeywords(agent.role);
  const keywordMatches = countKeywordMatches(text, keywords);
  const reviewTeamAgent = isReviewTeamAgent(agent);
  const implementationOverflow = shouldReviewTeamAssistImplementation(task);
  let score = 0;

  if (task.assignee === agent.id) score += 1000;
  if (status === 'ready') score += 240;
  if (status === 'backlog' && isImplementationDispatchCandidateStatus(status)) score += 120;
  if (reviewTeamAgent && isImplementationDispatchCandidateStatus(status) && task.assignee !== agent.id) {
    if (!implementationOverflow) {
      return Number.NEGATIVE_INFINITY;
    }
    score += 110;
  } else if (isPrimaryTeamAgent(agent) && isImplementationDispatchCandidateStatus(status)) {
    score += 180;
  }
  if (status === 'in_review') {
    if (reviewTeamAgent) {
      score += 360;
    } else {
      score += 40;
    }
    if (agent.role === 'qa') {
      score += 260;
    } else if (agent.role === 'architect') {
      score += 180;
    } else if (agent.role === 'dev' || agent.role === 'devops') {
      score += 120;
    } else if (agent.role === 'sm' || agent.role === 'pm') {
      score += 80;
    } else {
      return Number.NEGATIVE_INFINITY;
    }
  }

  score += keywordMatches * 85;
  score += scoreSuggestedSquadFit(agent, task);

  if (agent.role === 'dev') {
    score += 45;
  }

  if (agent.role === 'qa' && /(test|teste|qa|valida|regress|e2e|review|logs de erro)/.test(text)) {
    score += 120;
  }

  if (agent.role === 'devops' && /(ci\/cd|deploy|release|docker|pipeline|cloud|infra|build|log rotation|secret|observabilidade|apm)/.test(text)) {
    score += 140;
  }

  if (agent.role === 'architect' && /(arquitet|mcp|sdk|schema|orm|modelo de dados|servidor|plataforma|assincrono)/.test(text)) {
    score += 130;
  }

  if (recentFailureAffectsAgent && recentFailureClass === 'review') {
    return Number.NEGATIVE_INFINITY;
  }

  if (
    recentFailureAffectsAgent &&
    ['integration', 'workspace', 'branch_divergence', 'shell'].includes(recentFailureClass)
  ) {
    return Number.NEGATIVE_INFINITY;
  }

  if (recentFailureAffectsAgent && task.assignee !== agent.id) {
    const failureCount = Math.max(1, Number(runtimeMeta?.failureCount || 1));
    let failurePenalty = 240;

    if (recentFailureClass === 'integration') {
      failurePenalty = 420;
    } else if (recentFailureClass === 'workspace') {
      failurePenalty = 360;
    } else if (recentFailureClass === 'shell') {
      failurePenalty = 300;
    } else if (recentFailureClass === 'provider') {
      failurePenalty = 180;
    } else if (recentFailureClass === 'review') {
      failurePenalty = 520;
    }

    score -= failurePenalty + Math.min(240, (failureCount - 1) * 80);
  }

  if (status === 'in_review' && runtimeMeta?.lastCompletedByAgentId === agent.id) {
    score -= 220;
  }

  if (text.includes('[p0]')) score += 80;
  if (text.includes('[p1]')) score += 50;

  // Stable tiebreaker favoring older cards after score.
  score -= parseTaskNumber(task.id) / 10000;

  return score;
}

function getReservedPrimaryTaskIds() {
  const reserved = new Set();

  activeAgentRuns.forEach((run) => {
    if (!isInternalTaskId(run.taskId)) {
      reserved.add(run.taskId);
    }
  });

  forEachLivePreparingRun((run) => {
    if (!isInternalTaskId(run.taskId)) {
      reserved.add(run.taskId);
    }
  });

  queuedAgentRuns.forEach((runs) => {
    runs.forEach((run) => {
      if (!isInternalTaskId(run.taskId)) {
        reserved.add(run.taskId);
      }
    });
  });

  return reserved;
}

function getReservedPrimaryTaskIdsByAgent() {
  const reservedByAgent = new Map();

  const remember = (agentId, taskId) => {
    if (!taskId || isInternalTaskId(taskId)) return;
    if (!reservedByAgent.has(agentId)) {
      reservedByAgent.set(agentId, new Set());
    }
    reservedByAgent.get(agentId).add(taskId);
  };

  activeAgentRuns.forEach((run, agentId) => remember(agentId, run.taskId));
  forEachLivePreparingRun((run, agentId) => remember(agentId, run.taskId));
  queuedAgentRuns.forEach((runs, agentId) => {
    runs.forEach((run) => remember(agentId, run.taskId));
  });

  return reservedByAgent;
}

function getExecutingPrimaryTaskIdsByAgent() {
  const executingByAgent = new Map();

  const remember = (agentId, taskId) => {
    if (!taskId || isInternalTaskId(taskId)) return;
    if (!executingByAgent.has(agentId)) {
      executingByAgent.set(agentId, new Set());
    }
    executingByAgent.get(agentId).add(taskId);
  };

  activeAgentRuns.forEach((run, agentId) => remember(agentId, run.taskId));
  forEachLivePreparingRun((run, agentId) => remember(agentId, run.taskId));

  return executingByAgent;
}

function collectPrimaryTaskReservations() {
  const reservations = [];
  const seen = new Set();
  const remember = (agentId, taskId, phase) => {
    if (!taskId || isInternalTaskId(taskId)) return;
    const key = `${agentId || ''}::${taskId}::${phase || ''}`;
    if (seen.has(key)) return;
    seen.add(key);
    reservations.push({
      agentId,
      instanceId: CURRENT_INSTANCE_ID,
      taskId,
      phase,
    });
  };

  activeAgentRuns.forEach((run, agentId) => remember(agentId, run.taskId, 'running'));
  forEachLivePreparingRun((run, agentId) => remember(agentId, run.taskId, 'preparing'));
  queuedAgentRuns.forEach((runs, agentId) => {
    runs.forEach((run) => remember(agentId, run.taskId, 'queued'));
  });
  agentLaneRuntime.forEach((lane, agentId) => {
    if (!lane || lane.requestKind !== 'primary') return;
    if (!['running', 'queued', 'retry_scheduled', 'preparing_workspace'].includes(String(lane.state || '').trim())) {
      return;
    }

    const phase =
      lane.state === 'preparing_workspace'
        ? 'preparing'
        : lane.state === 'running'
          ? 'running'
          : 'queued';
    remember(agentId, lane.taskId, phase);
  });

  return reservations;
}

function buildPrimaryReservationStopReason(entry) {
  if (!entry) {
    return '[SYSTEM] Reserva obsoleta encerrada.';
  }

  switch (entry.code) {
    case 'assignee_changed':
      return `[SYSTEM] Reserva obsoleta encerrada: ${entry.taskId} esta atribuida a ${entry.assignee}, nao a ${entry.agentId}.`;
    case 'foreign_instance_owner':
      return `[SYSTEM] Reserva obsoleta encerrada: ${entry.taskId} pertence a outra instância (${entry.ownerInstanceId || 'desconhecida'}).`;
    case 'inactive_task':
      return `[SYSTEM] Reserva obsoleta encerrada: ${entry.taskId} esta em ${entry.status || 'estado indefinido'} e nao aceita execucao ativa.`;
    case 'unassigned_task':
      return `[SYSTEM] Reserva obsoleta encerrada: ${entry.taskId} perdeu o assignee ativo.`;
    case 'missing_task':
    default:
      return `[SYSTEM] Reserva obsoleta encerrada: ${entry.reason || `task ${entry.taskId} nao esta mais disponivel`}.`;
  }
}

function reconcilePrimaryTaskReservations(reason = 'scheduler') {
  const plannedCancellations = planPrimaryTaskReservationReconciliation({
    tasks: githubTasks,
    reservations: collectPrimaryTaskReservations(),
  });
  if (plannedCancellations.length === 0) {
    return false;
  }

  let changed = false;
  const handled = new Set();

  plannedCancellations.forEach((entry) => {
    const key = `${entry.agentId}::${entry.taskId}`;
    if (handled.has(key)) {
      return;
    }
    handled.add(key);

    const stopResult = stopAgentRun(
      entry.agentId,
      truncateText(`${buildPrimaryReservationStopReason(entry)} [${reason}]`, 220),
      { taskId: entry.taskId },
    );

    if (!stopResult.stoppedActive && stopResult.removedQueuedRuns.length === 0) {
      return;
    }

    changed = true;
    const agent = findAgentById(entry.agentId);
    io.emit('agent_log', {
      id: 'ceo',
      log: `🧹 Reserva obsoleta (${reason}): ${entry.taskId} foi removida de ${agent?.name || entry.agentId}${entry.phase ? ` (${entry.phase})` : ''}.`,
    });

    if (!stopResult.stoppedActive && !syncAgentAutonomousStatus(entry.agentId)) {
      updateAgent(entry.agentId, 'idle', 'Aguardando ordens...');
    }
  });

  return changed;
}

function hasQueuedWork(agentId) {
  return getQueuedRuns(agentId).length > 0;
}

function getPrimaryResetStatus(task) {
  return task?.status === 'in_review' ? 'in_review' : 'ready';
}

function isPrimaryActiveStatus(status) {
  return ['in_progress', 'in_review'].includes(String(status || '').trim());
}

function getRecoverablePrimaryTaskLane(taskId) {
  if (!taskId || isInternalTaskId(taskId)) {
    return null;
  }

  const candidates = Array.from(agentLaneRuntime.entries())
    .map(([agentId, lane]) => {
      if (!lane || lane.requestKind !== 'primary' || lane.taskId !== taskId) {
        return null;
      }

      const state = String(lane.state || '').trim();
      if (!['running', 'queued', 'retry_scheduled', 'preparing_workspace'].includes(state)) {
        return null;
      }

      return {
        ...lane,
        agentId: String(lane.agentId || agentId || '').trim() || null,
      };
    })
    .filter(Boolean)
    .sort((left, right) => {
      const leftAt = Date.parse(String(left?.updatedAt || left?.startedAt || left?.finishedAt || ''));
      const rightAt = Date.parse(String(right?.updatedAt || right?.startedAt || right?.finishedAt || ''));
      return (Number.isFinite(rightAt) ? rightAt : 0) - (Number.isFinite(leftAt) ? leftAt : 0);
    });

  return candidates[0] || null;
}

function rehydratePrimaryTaskRecordFromLane(task, lane, previousTask = null) {
  if (!task?.id || !lane) {
    return task;
  }

  const laneBoardStatus = String(lane.taskPacket?.boardStatus || '').trim();
  const nextStatus = isPrimaryActiveStatus(laneBoardStatus)
    ? laneBoardStatus
    : String(previousTask?.status || '').trim() === 'in_review'
      ? 'in_review'
      : 'in_progress';
  const assigneeId =
    String(lane.agentId || lane.taskPacket?.assigneeId || task?.assignee || previousTask?.assignee || '').trim()
    || null;
  const ownershipPatch = buildPrimaryTaskOwnershipPatch(nextStatus);

  return normalizePrimaryTaskRecord(
    {
      ...task,
      status: nextStatus,
      assignee: assigneeId,
      ownerId: ownershipPatch.ownerId,
      ownerInstanceId: ownershipPatch.ownerInstanceId,
      startedAt: task?.startedAt || previousTask?.startedAt || lane.startedAt || null,
      completedAt: null,
    },
    previousTask,
  );
}

function hasLivePrimaryTaskExecution(taskId) {
  if (!taskId || isInternalTaskId(taskId)) {
    return false;
  }

  const hasActiveRun = Array.from(activeAgentRuns.values()).some(
    (run) => run && run.taskId === taskId,
  );
  if (hasActiveRun) {
    return true;
  }

  const hasPreparingRun = Array.from(preparingAgentRuns.values()).some(
    (run) => isLivePreparingRun(run) && run.taskId === taskId,
  );
  if (hasPreparingRun) {
    return true;
  }

  const hasQueuedRun = Array.from(queuedAgentRuns.values()).some((runs) =>
    Array.isArray(runs) && runs.some((run) => run && run.taskId === taskId),
  );
  if (hasQueuedRun) {
    return true;
  }

  return Boolean(getRecoverablePrimaryTaskLane(taskId));
}

function forcePrimaryTaskDone(task, previousTask = null) {
  return normalizePrimaryTaskRecord(
    {
      ...task,
      status: 'done',
      assignee: null,
      ownerId: null,
      ownerInstanceId: null,
      completedAt:
        task?.completedAt
        || previousTask?.completedAt
        || task?.updatedAt
        || new Date().toISOString(),
    },
    previousTask,
  );
}

function forcePrimaryTaskReview(task, previousTask = null) {
  return normalizePrimaryTaskRecord(
    {
      ...task,
      status: 'in_review',
      assignee: null,
      ownerId: null,
      ownerInstanceId: null,
      startedAt: task?.startedAt || previousTask?.startedAt || new Date().toISOString(),
      completedAt: null,
    },
    previousTask,
  );
}

function forcePrimaryTaskBacklog(task, previousTask = null) {
  return normalizePrimaryTaskRecord(
    {
      ...task,
      status: 'backlog',
      assignee: null,
      ownerId: null,
      ownerInstanceId: null,
      startedAt: null,
      completedAt: null,
    },
    previousTask,
  );
}

function rehydratePrimaryTaskRecordFromPreviousTask(task, previousTask = null) {
  const previousStatus = String(previousTask?.status || '').trim();
  if (!task || !isPrimaryActiveStatus(previousStatus)) {
    return task;
  }

  const ownershipPatch = buildPrimaryTaskOwnershipPatch(previousStatus, {
    ownerId: resolvePrimaryTaskOwnerId(previousTask),
    ownerInstanceId: resolvePrimaryTaskOwnerInstanceId(previousTask),
  });

  return normalizePrimaryTaskRecord(
    {
      ...task,
      status: previousStatus,
      assignee:
        String(previousTask?.assignee || '').trim()
        || String(task?.assignee || '').trim()
        || null,
      ownerId: ownershipPatch.ownerId,
      ownerInstanceId: ownershipPatch.ownerInstanceId,
      startedAt: previousTask?.startedAt || task?.startedAt || new Date().toISOString(),
      completedAt: null,
    },
    previousTask,
  );
}

function sanitizePrimaryTaskBranchMetadata(task, previousTask = null) {
  if (!task?.id || isInternalTaskId(task.id)) {
    return task;
  }

  const currentBranchName = String(task.branchName || '').trim() || null;
  if (!currentBranchName) {
    return task;
  }

  const branchOptions = {
    taskId: task.id,
    taskTitle: task.title || '',
  };
  if (isTaskBranchCandidateCompatible(currentBranchName, branchOptions, process.env)) {
    const normalizedBranchName = normalizeTaskBranchRefName(currentBranchName);
    if (!normalizedBranchName || normalizedBranchName === currentBranchName) {
      return task;
    }
    return normalizePrimaryTaskRecord(
      {
        ...task,
        branchName: normalizedBranchName,
      },
      previousTask,
    );
  }

  const canonicalBranchName = buildTaskBranchName(branchOptions, process.env);
  if (!canonicalBranchName || canonicalBranchName === currentBranchName) {
    return task;
  }

  return normalizePrimaryTaskRecord(
    {
      ...task,
      branchName: canonicalBranchName,
    },
    previousTask,
  );
}

async function reconcileRemotePrimaryTaskRecord(task, previousTask = null, projectContext = null) {
  const normalizedTask = sanitizePrimaryTaskBranchMetadata(
    normalizePrimaryTaskRecord(task, previousTask),
    previousTask,
  );
  if (!normalizedTask?.id || isInternalTaskId(normalizedTask.id)) {
    return normalizedTask;
  }
  const explicitRemoteStatus = Object.prototype.hasOwnProperty.call(task || {}, 'status')
    ? String(task.status || '').trim() || null
    : null;
  const remoteStatusIsExplicitlyNonActive =
    explicitRemoteStatus
      ? !['in_progress', 'in_review'].includes(explicitRemoteStatus)
      : false;

  const recoverableLane = remoteStatusIsExplicitlyNonActive
    ? null
    : getRecoverablePrimaryTaskLane(normalizedTask.id);
  if (recoverableLane) {
    return rehydratePrimaryTaskRecordFromLane(normalizedTask, recoverableLane, previousTask);
  }

  if (hasLivePrimaryTaskExecution(normalizedTask.id)) {
    return normalizedTask;
  }

  if (String(previousTask?.status || '').trim() === 'done') {
    return forcePrimaryTaskDone(normalizedTask, previousTask);
  }

  const gitRoot = String(projectContext?.gitRoot || '').trim();
  if (!gitRoot) {
    return normalizedTask;
  }

  const runtimeMeta = getPrimaryTaskRuntimeMeta(normalizedTask.id);
  const knownPublishedBranchName =
    String(runtimeMeta?.publishedBranchName || '').trim() || null;
  const branchAbsorption = await resolveTaskBranchAbsorption(
    gitRoot,
    {
      taskId: normalizedTask.id,
      taskTitle: normalizedTask.title,
      branchName:
        normalizedTask.branchName ||
        previousTask?.branchName ||
        knownPublishedBranchName ||
        null,
    },
    process.env,
  );
  setPrimaryTaskPublishedBranchState(normalizedTask.id, branchAbsorption);

  const taskWithBranchMetadata =
    branchAbsorption.branchName && branchAbsorption.branchName !== normalizedTask.branchName
      ? normalizePrimaryTaskRecord(
          {
            ...normalizedTask,
            branchName: branchAbsorption.branchName,
          },
          previousTask,
        )
      : normalizedTask;

  if (!branchAbsorption.branchRef) {
    if (isPrimaryActiveStatus(taskWithBranchMetadata.status) && isForeignOwnedPrimaryTask(taskWithBranchMetadata)) {
      return taskWithBranchMetadata;
    }
    return taskWithBranchMetadata;
  }

  const statusDecision = resolveBranchAbsorptionStatusDecision({
    remoteStatus: explicitRemoteStatus,
    previousStatus: previousTask?.status || null,
    branchRef: branchAbsorption.branchRef,
    integrated: branchAbsorption.integrated,
  });

  if (statusDecision === 'done') {
    return forcePrimaryTaskDone(taskWithBranchMetadata, previousTask);
  }

  if (statusDecision === 'preserve_previous') {
    return rehydratePrimaryTaskRecordFromPreviousTask(taskWithBranchMetadata, previousTask);
  }

  if (statusDecision === 'preserve') {
    return taskWithBranchMetadata;
  }

  return forcePrimaryTaskBacklog(taskWithBranchMetadata, previousTask);
}

function pruneQueuedPrimaryRunsForTask(taskId) {
  const normalizedTaskId = String(taskId || '').trim();
  if (!normalizedTaskId || isInternalTaskId(normalizedTaskId)) {
    return [];
  }

  const removed = [];
  queuedAgentRuns.forEach((runs, agentId) => {
    const kept = [];
    runs.forEach((run) => {
      if (
        run?.requestKind === 'primary' &&
        String(run.taskId || '').trim() === normalizedTaskId
      ) {
        removed.push({ agentId, run });
        return;
      }
      kept.push(run);
    });

    if (kept.length !== runs.length) {
      setQueuedRuns(agentId, kept);
    }
  });

  return removed;
}

function updatePrimaryTaskRecord(taskId, updater) {
  let updatedTask = null;
  let previousTaskSnapshot = null;
  githubTasks = githubTasks.map((task) => {
    if (task.id !== taskId) return task;
    previousTaskSnapshot = task;
    const nextTask = typeof updater === 'function' ? updater(task) : { ...task, ...updater };
    updatedTask = normalizePrimaryTaskRecord(nextTask, task);
    if (task.status !== updatedTask.status) {
      metrics.trackTaskTransition(task.status, updatedTask.status);
    }
    return updatedTask;
  });

  if (updatedTask) {
    const previousStatus = String(previousTaskSnapshot?.status || '').trim();
    const nextStatus = String(updatedTask.status || '').trim();
    const previousAssignee = String(previousTaskSnapshot?.assignee || '').trim() || null;
    const nextAssignee = String(updatedTask.assignee || '').trim() || null;
    const shouldPruneQueuedRuns =
      !isPrimaryActiveStatus(nextStatus) ||
      (previousAssignee && previousAssignee !== nextAssignee) ||
      (isPrimaryActiveStatus(previousStatus) && isPrimaryActiveStatus(nextStatus) && !nextAssignee);

    if (shouldPruneQueuedRuns) {
      pruneQueuedPrimaryRunsForTask(updatedTask.id);
    }
    emitTasksUpdate();
  }

  return updatedTask;
}

function syncPrimaryTaskStatus(taskId, status, assigneeId, reason, metadata = {}) {
  if (!isGitHubBackedTaskId(taskId)) return;
  let effectiveStatus = status;
  let effectiveAssigneeId = assigneeId;
  let effectiveMetadata = { ...metadata };
  const currentTask = githubTasks.find((task) => task.id === taskId) || null;
  const runtimeMeta = getPrimaryTaskRuntimeMeta(taskId);

  if (
    isPrimaryTaskPublishedBranchLocked(taskId) &&
    !shouldBypassPublishedBranchLock({
      taskStatus: effectiveStatus || currentTask?.status,
      branchRef: runtimeMeta?.publishedBranchRef,
      integrated: runtimeMeta?.publishedBranchIntegrated,
    })
  ) {
    const releaseStatus = getPublishedPrimaryTaskReleaseStatus(taskId);
    if (
      releaseStatus &&
      effectiveStatus !== 'done' &&
      effectiveStatus !== releaseStatus
    ) {
      effectiveStatus = releaseStatus;
      effectiveAssigneeId = null;
      effectiveMetadata = {
        ...effectiveMetadata,
        ownerId: null,
        ownerInstanceId: null,
      };
    }
  }
  const ownerMetadata = isPrimaryActiveStatus(effectiveStatus)
    ? {
        ownerId:
          Object.prototype.hasOwnProperty.call(effectiveMetadata, 'ownerId')
            ? effectiveMetadata.ownerId
            : resolvePrimaryTaskOwnerId(currentTask),
        ownerInstanceId:
          Object.prototype.hasOwnProperty.call(effectiveMetadata, 'ownerInstanceId')
            ? effectiveMetadata.ownerInstanceId
            : resolvePrimaryTaskOwnerInstanceId(currentTask),
      }
    : {
        ownerId: null,
        ownerInstanceId: null,
      };

  moveGitHubTask(taskId, effectiveStatus, effectiveAssigneeId, ownerMetadata)
    .then((synced) => {
      if (synced) return;

      io.emit('agent_log', {
        id: 'ceo',
        log: `⚠️ Falha ao sincronizar ${taskId} no GitHub (${reason}). O orquestrador vai tentar novamente no próximo ciclo.`,
      });
    })
    .catch((error) => {
      io.emit('agent_log', {
        id: 'ceo',
        log: `⚠️ Falha ao sincronizar ${taskId} no GitHub (${reason}): ${error.message}`,
      });
    });
}

function releasePrimaryTaskToPool(task, reason, options = {}) {
  if (!task) return null;

  const nextStatus = options.status || getPrimaryResetStatus(task);
  const nextAssignee = Object.prototype.hasOwnProperty.call(options, 'assignee')
    ? options.assignee
    : null;
  const ownershipPatch =
    Object.prototype.hasOwnProperty.call(options, 'ownerId') ||
    Object.prototype.hasOwnProperty.call(options, 'ownerInstanceId')
      ? {
          ownerId: options.ownerId ?? null,
          ownerInstanceId: options.ownerInstanceId ?? null,
        }
      : buildPrimaryTaskOwnershipPatch(nextStatus, {
          ownerId: null,
          ownerInstanceId: null,
        });
  const updatedTask = updatePrimaryTaskRecord(task.id, {
    ...task,
    status: nextStatus,
    assignee: nextAssignee,
    ownerId: ownershipPatch.ownerId,
    ownerInstanceId: ownershipPatch.ownerInstanceId,
  });

  if (!updatedTask) return null;

  if (reason) {
    io.emit('agent_log', {
      id: 'ceo',
      log: `${reason} ${updatedTask.id} voltou para ${updatedTask.status}${updatedTask.assignee ? ` com ${updatedTask.assignee}` : ' sem assignee'}.`,
    });
  }

  metrics.trackTaskReset(options.metricReason || 'reconciliacao', updatedTask.status);
  syncPrimaryTaskStatus(updatedTask.id, updatedTask.status, updatedTask.assignee, 'reconciliacao', {
    ownerId: updatedTask.ownerId || null,
    ownerInstanceId: updatedTask.ownerInstanceId || null,
  });
  return updatedTask;
}

async function finalizeVerifiedPrimaryTask(taskOrTaskId, options = {}) {
  const sourceTask = typeof taskOrTaskId === 'string'
    ? githubTasks.find((entry) => entry.id === taskOrTaskId) || null
    : taskOrTaskId || null;
  if (!sourceTask || isInternalTaskId(sourceTask.id)) return null;

  const completedByAgentId = String(
    options.completedByAgentId
      || getPrimaryTaskRuntimeMeta(sourceTask.id)?.lastCompletedByAgentId
      || sourceTask.assignee || '',
  ).trim() || null;
  const updatedTask = updatePrimaryTaskRecord(sourceTask.id, {
    ...sourceTask,
    status: 'done',
    assignee: completedByAgentId,
    ownerId: null,
    ownerInstanceId: null,
  });
  if (!updatedTask) return null;

  if (isGitHubBackedTaskId(updatedTask.id)) {
    const synced = await moveGitHubTask(updatedTask.id, 'done', completedByAgentId, {
      ownerId: null,
      ownerInstanceId: null,
    });
    if (!synced) {
      io.emit('agent_log', {
        id: 'ceo',
        log:
          `⚠️ ${updatedTask.id} foi concluída, mas o GitHub Project não confirmou o update para Done. O próximo sync vai reforçar esse estado.`,
      });
    }
  }

  clearPrimaryTaskCompletionMemory(updatedTask.id);
  clearPrimaryTaskFailureMemory(updatedTask.id);
  primaryTaskRuntimeMeta.delete(updatedTask.id);
  persistRuntimeState();

  ensureTaskContractFiles({
    projectDir: resolveProjectDir(),
    workspaceDir: resolveProjectDir(),
    taskPacket: buildTaskPacketFromCurrentState(updatedTask.id) || null,
    verificationCommands: [],
    progress: {
      phase: 'verified',
      detail: options.detail || 'Task verificada e consolidada como done.',
      boardStatus: 'done',
      laneState: 'completed',
      agentId: completedByAgentId,
      agentRole: options.agentRole || null,
    },
  });
  promoteNextDependencyReadyBacklogTask(updatedTask, "dependency-unblocked");
  reconcilePhaseReleases(`task-done:${updatedTask.id}`).catch((error) => {
    io.emit('agent_log', {
      id: 'ceo',
      log: `⚠️ Falha ao reconciliar releases por etapa após concluir ${updatedTask.id}: ${error.message}`,
    });
  });
  io.emit('agent_log', {
    id: options.logActorId || 'ceo',
    log: options.logMessage || `[SYSTEM] ${updatedTask.id} concluída e movida para Done.`,
  });
  return updatedTask;
}

async function requeuePrimaryTaskAfterGitLabFailure(taskOrTaskId, message, options = {}) {
  const sourceTask = typeof taskOrTaskId === 'string'
    ? githubTasks.find((entry) => entry.id === taskOrTaskId) || null
    : taskOrTaskId || null;
  if (!sourceTask || isInternalTaskId(sourceTask.id)) return null;

  const projectContext = resolveProjectContext();
  const failureClass = options.failureClass || "pipeline";
  const runtimeMeta = getPrimaryTaskRuntimeMeta(sourceTask.id) || {};
  clearPrimaryTaskGitLabCiGate(sourceTask.id, {
    gitlabCiGateStatus: 'failed',
    pipeline: options.pipeline || null,
    preserveArmedAt: false,
  });
  setPrimaryTaskPublishedBranchState(sourceTask.id, null);
  touchPrimaryTaskRuntimeMeta(sourceTask.id, { publishedCommitSha: null });
  persistRuntimeState();

  recordPrimaryTaskFailure(
    sourceTask.id,
    options.failedByAgentId || runtimeMeta.lastCompletedByAgentId || null,
    failureClass,
    message,
    'failed',
    { failedBaseBranch: resolveCurrentPrimaryTaskBaseBranch(projectContext) },
  );

  const releasedTask = releasePrimaryTaskToPool(
    sourceTask,
    options.releaseMessage || "⚠️ Gate GitLab",
    {
      status: 'ready',
      assignee: null,
      ownerId: null,
      ownerInstanceId: null,
      metricReason: options.metricReason || 'gitlab_pipeline_failed',
    },
  );
  if (releasedTask) {
    scheduleAutonomousDispatch(`gitlab-gate-failed:${releasedTask.id}`);
  }
  io.emit('agent_log', { id: 'ceo', log: `⚠️ ${message}` });
  return releasedTask;
}

async function refreshPrimaryTaskGitLabPipeline(task, runtimeMeta = getPrimaryTaskRuntimeMeta(task?.id)) {
  if (!task || !runtimeMeta?.publishedBranchName) return null;

  const branchName = runtimeMeta.publishedBranchName;
  const commitSha = runtimeMeta.publishedCommitSha || runtimeMeta.gitlabPipelineSha || null;
  let pipeline = null;

  if (runtimeMeta.gitlabPipelineId) {
    try {
      pipeline = await getGitLabPipeline({
        env: process.env,
        pipelineId: runtimeMeta.gitlabPipelineId,
      });
    } catch (_pipelineFetchError) {
      pipeline = null;
    }
  }

  if (!pipeline?.found) {
    try {
      pipeline = await findGitLabBranchPipeline({
        env: process.env,
        branchName,
        commitSha,
      });
    } catch (_pipelineFindError) {
      pipeline = null;
    }
  }

  if (!pipeline?.found) {
    pipeline = await ensureGitLabBranchPipeline({
      env: process.env,
      branchName,
      commitSha,
    });
  }

  updatePrimaryTaskGitLabPipelineState(task.id, pipeline, {
    awaitingGitLabCi: true,
    gitlabCiGateStatus:
      pipeline?.statusClass === 'success'
        ? 'success'
        : pipeline?.statusClass === 'failed' || pipeline?.statusClass === 'blocked'
          ? 'failed'
          : 'pending',
  });
  return pipeline;
}

let publishedBranchPipelineReconcileInFlight = null;

async function reconcilePublishedBranchPipelines(reason = "scheduler") {
  if (WORKSPACE_INTEGRATION_MODE !== "branch") return false;
  const candidates = githubTasks.filter(
    (task) =>
      isGitHubBackedTaskId(task.id)
      && canCurrentInstanceManagePrimaryTask(task)
      && isPrimaryTaskAwaitingGitLabCi(task.id),
  );
  if (candidates.length <= 0) return false;
  if (publishedBranchPipelineReconcileInFlight) {
    return publishedBranchPipelineReconcileInFlight;
  }

  publishedBranchPipelineReconcileInFlight = (async () => {
    let changed = false;
    const projectContext = resolveProjectContext();

    for (const task of candidates) {
      if (hasLivePrimaryTaskExecution(task.id)) {
        continue;
      }
      const runtimeMeta = getPrimaryTaskRuntimeMeta(task.id);
      if (!runtimeMeta?.publishedBranchName) {
        continue;
      }

      let pipeline = null;
      try {
        pipeline = await refreshPrimaryTaskGitLabPipeline(task, runtimeMeta);
      } catch (error) {
        io.emit('agent_log', {
          id: 'ceo',
          log: `⚠️ Falha ao consultar pipeline GitLab de ${task.id} (${reason}): ${error.message}`,
        });
        continue;
      }

      const statusClass = pipeline?.statusClass || classifyGitLabPipelineStatus(pipeline?.status || null);
      if (statusClass === "success") {
        const promotion = await promotePublishedTaskBranchToBase(projectContext, {
          taskId: task.id,
          taskTitle: task.title,
          branchName: runtimeMeta.publishedBranchName,
          baseBranch: runtimeMeta.publishedBaseBranch || null,
          env: process.env,
        });

        if (!promotion?.promoted) {
          await requeuePrimaryTaskAfterGitLabFailure(
            task,
            `Merge automático pós-CI falhou em ${task.id}: ${promotion?.details || promotion?.reason || "desconhecido"}.`,
            {
              failureClass: 'integration',
              pipeline,
              metricReason: 'gitlab_merge_failed',
              releaseMessage: '⚠️ Merge pós-CI falhou',
            },
          );
          changed = true;
          continue;
        }

        setPrimaryTaskPublishedBranchState(task.id, {
          branchName: runtimeMeta.publishedBranchName,
          branchRef: runtimeMeta.publishedBranchRef || buildPrimaryTaskPublishedBranchRef(runtimeMeta.publishedBranchName),
          baseBranch: promotion.baseBranch || runtimeMeta.publishedBaseBranch || null,
          integrated: true,
          reason: 'branch-already-merged',
        });
        await finalizeVerifiedPrimaryTask(task, {
          completedByAgentId: runtimeMeta.lastCompletedByAgentId || null,
          detail: 'Pipeline GitLab aprovado e branch absorvida na base principal.',
          logMessage:
            `✅ ${task.id} passou no GitLab CI e foi absorvida em ${promotion.baseBranch || runtimeMeta.publishedBaseBranch || "main"}.`,
        });
        changed = true;
        continue;
      }

      if (statusClass === "failed" || statusClass === "blocked") {
        await requeuePrimaryTaskAfterGitLabFailure(
          task,
          `Pipeline GitLab de ${task.id} terminou em ${pipeline?.status || "estado inválido"}.`,
          {
            failureClass: 'pipeline',
            pipeline,
            metricReason: 'gitlab_pipeline_failed',
            releaseMessage: '⚠️ Pipeline GitLab falhou',
          },
        );
        changed = true;
        continue;
      }

      if (task.status !== "in_review" || task.assignee || resolvePrimaryTaskOwnerId(task) || resolvePrimaryTaskOwnerInstanceId(task)) {
        const updatedTask = updatePrimaryTaskRecord(task.id, {
          ...task,
          status: 'in_review',
          assignee: null,
          ownerId: null,
          ownerInstanceId: null,
        }) || task;
        syncPrimaryTaskStatus(updatedTask.id, updatedTask.status, updatedTask.assignee, `gitlab-ci:${reason}`, {
          ownerId: null,
          ownerInstanceId: null,
        });
        changed = true;
      }
    }

    return changed;
  })().finally(() => {
    publishedBranchPipelineReconcileInFlight = null;
  });

  return publishedBranchPipelineReconcileInFlight;
}

function canContinueTask(taskId, agentId, requestKind) {
  if (!taskId) return false;

  if (requestKind === 'collaboration' || isInternalTaskId(taskId)) {
    const task = findInternalTask(taskId);
    return Boolean(task && task.status !== 'done' && task.assignee === agentId);
  }

  const task = githubTasks.find((entry) => entry.id === taskId);
  return Boolean(
    task &&
    ['in_progress', 'in_review', 'ready', 'backlog'].includes(task.status) &&
    task.assignee === agentId &&
    (!isPrimaryActiveStatus(task.status) || isCurrentInstancePrimaryTask(task) || !resolvePrimaryTaskOwnerInstanceId(task)),
  );
}

function selectRescueAgentForTask(task) {
  if (!ORPHAN_TASK_RESCUE_ENABLED || !isOrphanedPrimaryTask(task)) {
    return null;
  }
  if (isPrimaryTaskDispatchBlocked(task)) {
    return null;
  }

  const scoringTask = {
    ...task,
    assignee: null,
    status: task.status === 'in_review' ? 'in_review' : 'ready',
  };

  const candidates = agents
    .filter(
      (agent) =>
        agent.role !== 'ceo' &&
        !isAgentOccupied(agent.id) &&
        !hasQueuedWork(agent.id) &&
        !findAssignedActivePrimaryTask(agent.id),
    )
    .map((agent) => ({
      agent,
      score: scoreTaskForAgent(agent, scoringTask),
    }))
    .filter((entry) => Number.isFinite(entry.score) && entry.score >= 150)
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.agent || null;
}

function reconcilePrimaryTaskAssignments(reason = 'scheduler') {
  let changed = false;
  const executingByAgent = getExecutingPrimaryTaskIdsByAgent();
  const reservedByAgent = getReservedPrimaryTaskIdsByAgent();
  const activeTasksByAgent = new Map();

  githubTasks
    .filter((task) => ['in_progress', 'in_review'].includes(task.status))
    .forEach((task) => {
      if (!canCurrentInstanceManagePrimaryTask(task)) {
        return;
      }

      if (!task.assignee) {
        if (task.status === 'in_progress') {
          releasePrimaryTaskToPool(
            task,
            `🧹 Rebalanceamento (${reason}): card ativo sem responsável.`,
            { status: 'ready', assignee: null },
          );
          changed = true;
        }
        return;
      }

      if (!isKnownRunnableAgentId(task.assignee)) {
        return;
      }

      if (!activeTasksByAgent.has(task.assignee)) {
        activeTasksByAgent.set(task.assignee, []);
      }

      activeTasksByAgent.get(task.assignee).push(task);
    });

  activeTasksByAgent.forEach((tasks, agentId) => {
    const executingTaskIds = executingByAgent.get(agentId) || new Set();
    const reservedTaskIds = reservedByAgent.get(agentId) || new Set();
    const agent = findAgentById(agentId);
    const sortedTasks = [...tasks].sort((left, right) => {
      const leftReserved = reservedTaskIds.has(left.id) ? 0 : 1;
      const rightReserved = reservedTaskIds.has(right.id) ? 0 : 1;
      if (leftReserved !== rightReserved) return leftReserved - rightReserved;
      const leftExecuting = executingTaskIds.has(left.id) ? 0 : 1;
      const rightExecuting = executingTaskIds.has(right.id) ? 0 : 1;
      if (leftExecuting !== rightExecuting) return leftExecuting - rightExecuting;
      if (left.status === right.status) return left.id.localeCompare(right.id);
      if (left.status === 'in_review') return -1;
      if (right.status === 'in_review') return 1;
      return left.id.localeCompare(right.id);
    });

    let keptReservedSlot = false;
    let keptPassiveSlot = false;
    for (const task of sortedTasks) {
      if (reservedTaskIds.has(task.id)) {
        if (!keptReservedSlot) {
          keptReservedSlot = true;
          continue;
        }

        removeQueuedRuns(agentId, (run) => run.taskId === task.id);
        releasePrimaryTaskToPool(
          task,
          `🧹 Rebalanceamento (${reason}): ${agent?.name || agentId} tinha múltiplos cards primários reservados.`,
          {
            status: getPrimaryResetStatus(task),
            assignee: null,
          },
        );
        changed = true;
        continue;
      }

      if (executingTaskIds.has(task.id)) {
        continue;
      }

      if (!keptPassiveSlot && !keptReservedSlot && executingTaskIds.size === 0 && !isAgentOccupied(agentId)) {
        keptPassiveSlot = true;
        continue;
      }

      removeQueuedRuns(agentId, (run) => run.taskId === task.id);
      releasePrimaryTaskToPool(
        task,
        `🧹 Rebalanceamento (${reason}): ${agent?.name || agentId} estava com múltiplos cards ativos sem execução real.`,
        {
          status: getPrimaryResetStatus(task),
          assignee: null,
        },
      );
      changed = true;
    }
  });

  return changed;
}

function selectReviewerForTask(task, excludedAgentId = null) {
  const scoringTask = {
    ...task,
    status: 'in_review',
    assignee: null,
  };

  const candidates = agents
    .filter((agent) => agent.role !== 'ceo' && agent.id !== excludedAgentId)
    .map((agent) => ({
      agent,
      score: (() => {
        let score = scoreTaskForAgent(agent, scoringTask);
        if (!Number.isFinite(score)) return score;

        if (isReviewTeamAgent(agent)) {
          score += 300;
        }

        const assignedPrimaryTask = findAssignedActivePrimaryTask(agent.id, task.id);
        const queuedPrimaryCount = getQueuedRuns(agent.id).filter(
          (run) => run.requestKind === 'primary',
        ).length;

        if (canAgentStartPrimaryTaskNow(agent.id, task.id)) {
          score += 320;
        } else {
          if (isAgentOccupied(agent.id)) score -= 140;
          if (assignedPrimaryTask) {
            score -= assignedPrimaryTask.status === 'in_review' ? 260 : 180;
          }
          score -= queuedPrimaryCount * 180;
        }

        return score;
      })(),
    }))
    .filter((entry) => Number.isFinite(entry.score) && entry.score >= 150)
    .sort((left, right) => right.score - left.score);

  return candidates[0]?.agent || null;
}

function startOrQueuePrimaryReview(task, reviewer, options = {}) {
  if (!task || !reviewer) return null;

  const updatedTask = updatePrimaryTaskRecord(task.id, {
    ...task,
    status: 'in_review',
    assignee: reviewer.id,
    ...buildPrimaryTaskOwnershipPatch('in_review'),
  });
  if (!updatedTask) return null;

  const canStartNow = canAgentStartPrimaryTaskNow(reviewer.id, updatedTask.id);
  touchPrimaryTaskRuntimeMeta(updatedTask.id, {
    lastRecoveredAt: new Date().toISOString(),
    lastAlertAt: null,
  });
  syncPrimaryTaskStatus(
    updatedTask.id,
    updatedTask.status,
    updatedTask.assignee,
    options.syncReason || 'review-coverage',
  );

  startRalphForAgent(reviewer.id, buildPrimaryTaskRunTitle(updatedTask), updatedTask.id, {
    requestKind: 'primary',
    taskStatus: 'in_review',
    forceQueue: !canStartNow,
    queuePosition: 'front',
  });

  return {
    updatedTask,
    canStartNow,
  };
}

function handoffPrimaryTaskToReview(task, completedByAgentId) {
  if (!task || isInternalTaskId(task.id)) {
    return task;
  }

  const reviewer = selectReviewerForTask(task, completedByAgentId);
  const reviewDispatch = reviewer
    ? startOrQueuePrimaryReview(task, reviewer, { syncReason: 'handoff-review' })
    : null;
  const updatedTask = reviewer
    ? reviewDispatch?.updatedTask || null
    : updatePrimaryTaskRecord(task.id, {
        ...task,
        status: 'in_review',
        assignee: null,
      });

  if (!updatedTask) return null;

  const reviewerCanStart = Boolean(reviewDispatch?.canStartNow);
  io.emit('agent_log', {
    id: 'ceo',
    log: reviewer
      ? `🧪 ${updatedTask.id} saiu de implementação e entrou em review com ${reviewer.name}${reviewerCanStart ? '.' : ' na fila prioritária, assim que ele liberar.'}`
      : `🧪 ${updatedTask.id} saiu de implementação e entrou em review aguardando um revisor.`,
  });

  rememberPrimaryTaskCompletedBy(updatedTask.id, completedByAgentId);
  touchPrimaryTaskRuntimeMeta(updatedTask.id, {
    lastRecoveredAt: new Date().toISOString(),
    lastAlertAt: null,
  });
  metrics.trackReviewHandoff();

  if (!reviewer) {
    syncPrimaryTaskStatus(updatedTask.id, updatedTask.status, updatedTask.assignee, 'handoff-review');
    scheduleAutonomousDispatch(`handoff-review:${updatedTask.id}`);
  }

  return updatedTask;
}

function ensureReviewCoverage(reason = 'scheduler') {
  let changed = false;
  const reservedTaskIds = getReservedPrimaryTaskIds();

  githubTasks
    .filter((task) => task.status === 'in_review' && canCurrentInstanceManagePrimaryTask(task))
    .forEach((task) => {
      if (isPrimaryTaskDispatchBlocked(task)) {
        return;
      }
      if (getRecoverablePrimaryTaskLane(task.id)) {
        return;
      }
      if (reservedTaskIds.has(task.id)) {
        return;
      }

      const executionState = getPrimaryTaskExecutionState(task);
      if (executionState.running || executionState.preparing || executionState.queued) {
        return;
      }

      if (task.assignee && !isKnownRunnableAgentId(task.assignee)) {
        return;
      }

      const reviewer = selectReviewerForTask(
        task,
        getPrimaryTaskRuntimeMeta(task.id)?.lastCompletedByAgentId || null,
      );

      if (!reviewer) {
        return;
      }

      const dispatchResult = startOrQueuePrimaryReview(task, reviewer, {
        syncReason: 'review-coverage',
      });
      if (!dispatchResult?.updatedTask) {
        return;
      }

      io.emit('agent_log', {
        id: 'ceo',
        log:
          task.assignee && task.assignee === reviewer.id
            ? `🧪 Cobertura de review (${reason}): ${dispatchResult.updatedTask.id} voltou para a fila ativa de ${reviewer.name}${dispatchResult.canStartNow ? '.' : ' em prioridade.'}`
            : `🧪 Cobertura de review (${reason}): ${dispatchResult.updatedTask.id} foi atribuído para ${reviewer.name}${dispatchResult.canStartNow ? '.' : ' em fila prioritária.'}`,
      });
      changed = true;
    });

  return changed;
}

function monitorStalledPrimaryTasks(reason = 'watchdog') {
  let changed = false;
  const nowMs = Date.now();

  githubTasks
    .filter((task) => ['in_progress', 'in_review'].includes(task.status) && canCurrentInstanceManagePrimaryTask(task))
    .forEach((task) => {
      if (isPrimaryTaskDispatchBlocked(task)) {
        const releaseStatus = getPublishedPrimaryTaskReleaseStatus(task);
        if (
          task.status !== releaseStatus ||
          task.assignee ||
          resolvePrimaryTaskOwnerId(task) ||
          resolvePrimaryTaskOwnerInstanceId(task)
        ) {
          const releasedTask = releasePrimaryTaskToPool(
            task,
            `🧊 Watchdog (${reason}): ${task.id} ficou protegida por branch publicada e foi retirada da execução automática.`,
            {
              status: releaseStatus,
              assignee: null,
              ownerId: null,
              ownerInstanceId: null,
              metricReason: 'published_branch_lock',
            },
          );
          if (releasedTask) {
            changed = true;
          }
        }
        return;
      }

      const lastActivityMs = getPrimaryTaskLastActivityMs(task);
      if (!Number.isFinite(lastActivityMs)) {
        return;
      }

      const staleMs = nowMs - lastActivityMs;
      const thresholdMs = getPrimaryTaskStaleThreshold(task);
      if (staleMs < thresholdMs) {
        return;
      }

      const executionState = getPrimaryTaskExecutionState(task);
      if (executionState.running || executionState.preparing) {
        const previousAlertMs = getPrimaryTaskLastAlertMs(task.id);
        if (!Number.isFinite(previousAlertMs)) {
          const nowIso = new Date(nowMs).toISOString();
          touchPrimaryTaskRuntimeMeta(task.id, { lastAlertAt: nowIso });
          io.emit('agent_log', {
            id: 'ceo',
            log: `⏱️ Watchdog (${reason}): ${task.id} está há ${formatDurationMs(staleMs)} sem novos logs, mas ainda possui execução ativa.`,
          });
          changed = true;
          return;
        }

        if (nowMs - previousAlertMs < STALE_TASK_ALERT_COOLDOWN_MS) {
          return;
        }

        const nowIso = new Date(nowMs).toISOString();
        touchPrimaryTaskRuntimeMeta(task.id, {
          lastAlertAt: nowIso,
          lastRecoveredAt: nowIso,
        });

        const stopResult = task.assignee
          ? stopAgentRun(
              task.assignee,
              `[SYSTEM] Watchdog (${reason}): ${task.id} ficou ${formatDurationMs(staleMs)} sem novos logs. Encerrando a execução atual para retomada segura.`,
              { taskId: task.id },
            )
          : { removedQueuedRuns: [], stoppedActive: false };
        if (task.assignee && !stopResult.stoppedActive && !syncAgentAutonomousStatus(task.assignee)) {
          updateAgent(task.assignee, 'idle', 'Aguardando redistribuição após watchdog.');
        }

        const releasedTask = releasePrimaryTaskToPool(
          task,
          `♻️ Watchdog (${reason}): ${task.id} estava ativo, porém silencioso por ${formatDurationMs(staleMs)}.`,
          {
            status: task.status === 'in_review' ? 'in_review' : 'ready',
            assignee: null,
            metricReason: task.status === 'in_review' ? 'watchdog_review_running' : 'watchdog_running',
          },
        );
        if (releasedTask) {
          scheduleAutonomousDispatch(`watchdog-running:${task.id}`);
          changed = true;
        }
        return;
      }

      if (!shouldEmitStaleAlert(task.id, nowMs)) {
        return;
      }

      const nowIso = new Date(nowMs).toISOString();
      touchPrimaryTaskRuntimeMeta(task.id, { lastAlertAt: nowIso, lastRecoveredAt: nowIso });

      if (task.status === 'in_review') {
        let reviewer = selectReviewerForTask(task, task.assignee || null);
        if (!reviewer && task.assignee && isKnownRunnableAgentId(task.assignee)) {
          reviewer = findAgentById(task.assignee);
        }

        if (reviewer) {
          const dispatchResult = startOrQueuePrimaryReview(task, reviewer, {
            syncReason: 'watchdog-review',
          });
          if (dispatchResult?.updatedTask) {
            io.emit('agent_log', {
              id: 'ceo',
              log: `🧪 Watchdog (${reason}): review ${dispatchResult.updatedTask.id} estava parado há ${formatDurationMs(staleMs)}. ${reviewer.name}${dispatchResult.canStartNow ? ' retomou imediatamente.' : ' assumiu em fila prioritária.'}`,
            });
            changed = true;
          }
          return;
        }

        const releasedTask = releasePrimaryTaskToPool(
          task,
          `🧪 Watchdog (${reason}): review ${task.id} estava parado há ${formatDurationMs(staleMs)}.`,
          {
            status: 'in_review',
            assignee: null,
            metricReason: 'watchdog_review',
          },
        );
        if (releasedTask) {
          scheduleAutonomousDispatch(`watchdog-review:${task.id}`);
          changed = true;
        }
        return;
      }

      const releasedTask = releasePrimaryTaskToPool(
        task,
        `⏱️ Watchdog (${reason}): ${task.id} ficou ${formatDurationMs(staleMs)} sem execução real.`,
        {
          status: 'ready',
          assignee: null,
          metricReason: 'watchdog_ready',
        },
      );
      if (releasedTask) {
        scheduleAutonomousDispatch(`watchdog-primary:${task.id}`);
        changed = true;
      }
    });

  return changed;
}

async function rescueOrphanedPrimaryTasks(reason = 'scheduler') {
  if (!ORPHAN_TASK_RESCUE_ENABLED) return false;

  let rescuedAny = false;
  const reservedTaskIds = getReservedPrimaryTaskIds();
  const orphanTasks = githubTasks.filter(
    (task) =>
      isOrphanedPrimaryTask(task) &&
      canCurrentInstanceManagePrimaryTask(task) &&
      !isPrimaryTaskDispatchBlocked(task) &&
      !reservedTaskIds.has(task.id),
  );

  for (const task of orphanTasks) {
    const rescueAgent = selectRescueAgentForTask(task);
    if (!rescueAgent) continue;

    const previousAssignee = task.assignee;
    reservedTaskIds.add(task.id);
    const rescuedTask = updatePrimaryTaskRecord(task.id, {
      ...task,
      assignee: rescueAgent.id,
      ...buildPrimaryTaskOwnershipPatch(task.status),
    });
    if (!rescuedTask) continue;
    touchPrimaryTaskRuntimeMeta(task.id, {
      lastRecoveredAt: new Date().toISOString(),
      lastAlertAt: null,
    });

    io.emit('agent_log', {
      id: 'ceo',
      log: `🛟 Resgate automático (${reason}): ${task.id} estava órfã com ${previousAssignee}. ${rescueAgent.name} assumiu.`,
    });

    syncPrimaryTaskStatus(task.id, task.status, rescueAgent.id, 'resgate');

    const runTitle = rescuedTask.status === 'in_review' ? `[Review ${rescuedTask.id}] ${rescuedTask.title}` : rescuedTask.title;
    startRalphForAgent(rescueAgent.id, runTitle, rescuedTask.id, {
      requestKind: 'primary',
      taskStatus: rescuedTask.status,
    });
    rescuedAny = true;
  }

  return rescuedAny;
}

function scheduleAutonomousDispatch(reason = 'scheduler') {
  if (!AUTO_DISPATCH_ENABLED) return;
  if (autoDispatchTimer) return;

  autoDispatchTimer = setTimeout(() => {
    autoDispatchTimer = null;
    Promise.resolve()
      .then(() => reconcilePrimaryTaskReservations(reason))
      .then(() => monitorStalledPrimaryTasks(`auto-dispatch:${reason}`))
      .then(() => reconcilePrimaryTaskAssignments(reason))
      .then(() => rescueOrphanedPrimaryTasks(reason))
      .then(() => ensureReviewCoverage(reason))
      .then(() => reconcilePublishedBranchPipelines(`auto-dispatch:${reason}`))
      .then(() => resumeAutonomousWorkFromTasks(`auto-dispatch:${reason}`))
      .then(() => resumePrimaryLanesFromSnapshots(`auto-dispatch:${reason}`))
      .then(() => resumeCollaborationWorkFromState(`auto-dispatch:${reason}`))
      .then(() => dispatchAutonomousWork(reason))
      .then(() => dispatchCollaborationWork(reason))
      .catch((error) => {
      console.error(`[DISPATCH] Falha no auto-dispatch (${reason}):`, error.message);
      io.emit('agent_log', {
        id: 'ceo',
        log: `⚠️ Falha no auto-dispatch (${reason}): ${error.message}`,
      });
      });
  }, Math.max(0, AUTO_DISPATCH_DELAY_MS));
}

async function claimTaskForAgent(task, agent, reason, nextStatus = 'in_progress') {
  if (!task || !agent) return false;

  const currentTask = githubTasks.find((entry) => entry.id === task.id);
  if (!currentTask) return false;
  if (!canCurrentInstanceManagePrimaryTask(currentTask)) return false;
  if (isPrimaryTaskDispatchBlocked(currentTask)) return false;

  if (!['backlog', 'ready', 'in_review'].includes(currentTask.status)) {
    return false;
  }

  if (currentTask.assignee && currentTask.assignee !== agent.id) {
    return false;
  }

  if (hasRecentPrimaryTaskFailureCooldown(currentTask.id, agent.id)) {
    return false;
  }

  const updatedTask = updatePrimaryTaskRecord(currentTask.id, {
    ...currentTask,
    status: nextStatus,
    assignee: agent.id,
    ...buildPrimaryTaskOwnershipPatch(nextStatus),
  });
  if (!updatedTask) return false;
  touchPrimaryTaskRuntimeMeta(updatedTask.id, {
    lastRecoveredAt: new Date().toISOString(),
    lastAlertAt: null,
  });

  io.emit('agent_log', {
    id: 'ceo',
    log:
      nextStatus === 'in_review'
        ? `🧪 Auto-dispatch (${reason}): ${agent.name} assumiu o review de ${currentTask.id}.`
        : `🚀 Auto-dispatch (${reason}): ${agent.name} assumiu ${currentTask.id}.`,
  });

  syncPrimaryTaskStatus(currentTask.id, nextStatus, agent.id, 'auto-dispatch', {
    ownerId: updatedTask.ownerId || null,
    ownerInstanceId: updatedTask.ownerInstanceId || null,
  });

  const runTitle =
    nextStatus === 'in_review' ? `[Review ${currentTask.id}] ${currentTask.title}` : currentTask.title;
  startRalphForAgent(agent.id, runTitle, updatedTask.id, {
    requestKind: 'primary',
    taskStatus: nextStatus,
  });
  return true;
}

async function dispatchAutonomousWork(reason = 'scheduler') {
  if (!AUTO_DISPATCH_ENABLED) return;
  const completedPrimaryTaskKeys = buildCompletedPrimaryTaskDependencyKeySet(githubTasks);

  if (!resolveBacklogAutoDispatchEnabled(process.env)) {
    const primaryReadySlotTarget = resolvePrimaryReadySlotTarget(process.env);
    const currentImplementationFrontCount = countCurrentInstancePrimaryImplementationFronts();
    const hasDispatchableImplementationTask = githubTasks.some((task) => (
      isImplementationDispatchCandidateStatus(task.status) &&
      canCurrentInstanceManagePrimaryTask(task) &&
      !isPrimaryTaskDispatchBlocked(task) &&
      arePrimaryTaskDependenciesSatisfied(task, completedPrimaryTaskKeys)
    ));
    if (
      currentImplementationFrontCount < primaryReadySlotTarget &&
      !hasDispatchableImplementationTask
    ) {
      promoteNextDependencyReadyBacklogTask(null, `scheduler-unblock:${reason}`);
    }
  }

  const reservedTaskIds = getReservedPrimaryTaskIds();
  const runnableAgents = agents.filter(
    (agent) =>
      agent.role !== 'ceo' &&
      !isAgentOccupied(agent.id) &&
      !hasQueuedWork(agent.id) &&
      !findAssignedActivePrimaryTask(agent.id),
  );

  if (runnableAgents.length === 0) {
    return;
  }

  const availableTasks = githubTasks.filter((task) => {
    if (!isAutoDispatchCandidateStatus(task.status)) return false;
    if (!canCurrentInstanceManagePrimaryTask(task)) return false;
    if (isPrimaryTaskDispatchBlocked(task)) return false;
    if (!arePrimaryTaskDependenciesSatisfied(task, completedPrimaryTaskKeys)) return false;
    if (reservedTaskIds.has(task.id)) return false;
    if (task.assignee && task.assignee !== '' && task.assignee !== null && task.assignee !== undefined) {
      return task.assignee === '' || isKnownRunnableAgentId(task.assignee) || findAgentById(task.assignee);
    }
    return true;
  });

  const candidates = [];
  for (const agent of runnableAgents) {
    for (const task of availableTasks) {
      const score = scoreTaskForAgent(agent, task);
      if (!Number.isFinite(score) || score < 150) {
        continue;
      }

      candidates.push({
        agent,
        task,
        score,
        preferredStatus: task.status === 'in_review' ? 'in_review' : 'in_progress',
      });
    }
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) {
      return right.score - left.score;
    }

    if (left.task.id !== right.task.id) {
      return String(left.task.id).localeCompare(String(right.task.id));
    }

    return String(left.agent.id).localeCompare(String(right.agent.id));
  });

  const claimedTaskIds = new Set();
  const claimedAgentIds = new Set();

  for (const candidate of candidates) {
    if (claimedTaskIds.has(candidate.task.id) || claimedAgentIds.has(candidate.agent.id)) {
      continue;
    }

    const claimed = await claimTaskForAgent(
      candidate.task,
      candidate.agent,
      reason,
      candidate.preferredStatus,
    );
    if (!claimed) {
      continue;
    }

    claimedTaskIds.add(candidate.task.id);
    claimedAgentIds.add(candidate.agent.id);
  }
}

function updateAgentIfChanged(id, status, task, extraFields = {}) {
  const agent = findAgentById(id);
  if (!agent) return;

  const nextAgent = {
    ...agent,
    status,
    task: task === undefined ? agent.task : task,
    ...extraFields,
  };

  const changed = Object.keys(nextAgent).some((key) => nextAgent[key] !== agent[key]);
  if (!changed) return;

  updateAgent(id, status, task, extraFields);
}

function syncAgentAutonomousStatus(agentId) {
  const agent = findAgentById(agentId);
  if (!agent || agent.role === 'ceo') return false;

  const activeRun = activeAgentRuns.get(agentId);
  if (activeRun) {
    setAgentLaneState(
      agentId,
      activeRun,
      'running',
      activeRun.requestKind === 'collaboration'
        ? 'Colaboracao em execucao.'
        : 'Task em execucao.',
      {
        retryCount: activeRun.retryCount,
        commandRecoveryCount: activeRun.commandRecoveryCount,
      },
    );
    updateAgentIfChanged(
      agentId,
      activeRun.requestKind === 'collaboration' ? 'helping' : 'coding',
      activeRun.taskTitle || 'Trabalhando no loop...',
      {
        currentModel: agent.currentModel || chooseModelForTask(agent, activeRun.taskTitle),
        queueLength: getQueuedRuns(agentId).length,
      },
    );
    return true;
  }

  const preparingRun = getPreparingRun(agentId);
  if (preparingRun) {
    setAgentLaneState(
      agentId,
      preparingRun,
      'preparing_workspace',
      preparingRun.requestKind === 'collaboration'
        ? 'Preparando workspace de colaboracao.'
        : 'Preparando workspace da task.',
      {
        retryCount: preparingRun.retryCount,
        commandRecoveryCount: preparingRun.commandRecoveryCount,
      },
    );
    updateAgentIfChanged(
      agentId,
      preparingRun.requestKind === 'collaboration' ? 'helping' : 'coding',
      preparingRun.requestKind === 'collaboration'
        ? `Preparando ajuda: ${preparingRun.taskTitle}`
        : `Preparando: ${preparingRun.taskTitle}`,
      {
        currentModel: agent.currentModel || chooseModelForTask(agent, preparingRun.taskTitle),
        activeTaskId: preparingRun.taskId,
        activeTaskKind: preparingRun.requestKind,
        queueLength: getQueuedRuns(agentId).length,
      },
    );
    return true;
  }

  const pendingRun = findPendingRunForAgent(agentId);
  if (pendingRun) {
    setAgentLaneState(
      agentId,
      pendingRun,
      'queued',
      pendingRun.requestKind === 'collaboration'
        ? 'Colaboracao aguardando execucao na fila.'
        : 'Task aguardando execucao na fila.',
      {
        retryCount: pendingRun.retryCount,
        commandRecoveryCount: pendingRun.commandRecoveryCount,
      },
    );
    updateAgentIfChanged(
      agentId,
      'thinking',
      pendingRun.requestKind === 'collaboration'
        ? `Fila de ajuda: ${pendingRun.taskTitle}`
        : `Na fila: ${pendingRun.taskTitle}`,
      {
        currentModel: agent.currentModel || chooseModelForTask(agent, pendingRun.taskTitle),
        queueLength: getQueuedRuns(agentId).length,
      },
    );
    return true;
  }

  const assignedTask = findAssignedActivePrimaryTask(agentId);
  if (assignedTask) {
    setAgentLaneState(
      agentId,
      {
        id: agentId,
        taskId: assignedTask.id,
        taskTitle: buildPrimaryTaskRunTitle(assignedTask),
        requestKind: 'primary',
        taskStatus: assignedTask.status,
        requestId: `${agentId}:${assignedTask.id}:resume`,
      },
      'retry_scheduled',
      assignedTask.status === 'in_review'
        ? 'Review aguardando retomada pelo scheduler.'
        : 'Card aguardando retomada pelo scheduler.',
      {
        taskStatus: assignedTask.status,
      },
    );
    updateAgentIfChanged(
      agentId,
      'coding',
      assignedTask.status === 'in_review'
        ? `Retomando review ${assignedTask.id}: ${assignedTask.title}`
        : `Retomando ${assignedTask.id}: ${assignedTask.title}`,
      {
        currentModel: agent.currentModel || chooseModelForTask(agent, assignedTask.title),
        queueLength: getQueuedRuns(agentId).length,
      },
    );
    return true;
  }

  return false;
}

function queueCollaborationRequest(requestPayload) {
  const requester = findAgentById(requestPayload.requesterId);
  const targetAgent = findAgentById(requestPayload.targetAgentId);
  if (!targetAgent || targetAgent.role === 'ceo') {
    io.emit('agent_log', {
      id: 'ceo',
      log: `⚠️ Pedido de ajuda ignorado: agente alvo inválido (${requestPayload.targetAgentId}).`,
    });
    return null;
  }

  if (requestPayload.targetAgentId === requestPayload.requesterId) {
    io.emit('agent_log', {
      id: 'ceo',
      log: `⚠️ ${requester?.name || requestPayload.requesterId} tentou pedir ajuda para si mesmo. Ignorado.`,
    });
    return null;
  }

  const collaborationTask = createCollaborationTaskRecord({
    title: `[Ajuda ${requestPayload.parentTaskId || 'NX'}] ${requestPayload.summary}`,
    assignee: requestPayload.targetAgentId,
    requesterId: requestPayload.requesterId,
    parentTaskId: requestPayload.parentTaskId || null,
    status: 'backlog',
  });

  const runRequest = {
    id: requestPayload.targetAgentId,
    taskId: collaborationTask.id,
    taskTitle: collaborationTask.title,
    requestKind: 'collaboration',
    parentTaskId: requestPayload.parentTaskId || null,
    requestedBy: requestPayload.requesterId,
    queueIfBusy: true,
  };

  const targetBusy = isAgentOccupied(requestPayload.targetAgentId);
  const targetQueued = Boolean(findQueuedRun(
    requestPayload.targetAgentId,
    (queuedRun) => queuedRun.taskId === collaborationTask.id,
  ));

  if (targetBusy || targetQueued) {
    queueRalphRun(runRequest);
    syncAgentAutonomousStatus(requestPayload.targetAgentId);
    io.emit('agent_log', {
      id: 'ceo',
      log: `🤝 ${requester?.name || requestPayload.requesterId} pediu ajuda para ${targetAgent.name}. A colaboração ${collaborationTask.id} entrou na fila de ${targetAgent.id}.`,
    });
    return collaborationTask;
  }

  io.emit('agent_log', {
    id: 'ceo',
    log: `🤝 ${requester?.name || requestPayload.requesterId} pediu ajuda para ${targetAgent.name}. Iniciando colaboração ${collaborationTask.id}.`,
  });
  startRalphForAgent(requestPayload.targetAgentId, collaborationTask.title, collaborationTask.id, runRequest);
  return collaborationTask;
}

function processAutonomousActions(agentId, runContext, output) {
  const requestHelpRegex = /\[REQUEST_HELP:\s*"([^"]+)"(?:\s+ON\s+"([^"]+)")?\s+WITH\s+"([^"]+)"\s*\]/g;
  const createTicketRegex = /\[CREATE_TICKET:\s*"(.*?)"\s+TO\s+"(.*?)"\s*\]/g;
  const actionBuffer = `${runContext.pendingActionBuffer || ''}\n${output}`.slice(-ACTION_BUFFER_LIMIT);
  runContext.pendingActionBuffer = actionBuffer;
  runContext.handledActions = runContext.handledActions || new Set();

  let match;
  while ((match = requestHelpRegex.exec(actionBuffer)) !== null) {
    const [, targetAgentId, explicitParentTaskId, summary] = match;
    const actionKey = `REQUEST_HELP::${targetAgentId}::${explicitParentTaskId || runContext.taskId || ''}::${summary}`;
    if (runContext.handledActions.has(actionKey)) continue;
    runContext.handledActions.add(actionKey);

    queueCollaborationRequest({
      requesterId: agentId,
      targetAgentId,
      parentTaskId: explicitParentTaskId || runContext.parentTaskId || runContext.taskId,
      summary,
    });
  }

  while ((match = createTicketRegex.exec(actionBuffer)) !== null) {
    const [, title, targetAgentId] = match;
    if (!isKnownRunnableAgentId(targetAgentId)) {
      continue;
    }

    const actionKey = `CREATE_TICKET::${targetAgentId}::${title}`;
    if (runContext.handledActions.has(actionKey)) continue;
    runContext.handledActions.add(actionKey);

    queueCollaborationRequest({
      requesterId: agentId,
      targetAgentId,
      parentTaskId: runContext.parentTaskId || runContext.taskId,
      summary: title,
    });
  }
}

function rememberResumeWarning(key, message) {
  if (warnedResumeIssues.has(key)) return;
  warnedResumeIssues.add(key);
  io.emit('agent_log', { id: 'ceo', log: message });
}

function clearResolvedResumeWarnings() {
  for (const key of Array.from(warnedResumeIssues)) {
    const parts = key.split(':');
    const taskId = parts[parts.length - 1];
    const task = githubTasks.find((entry) => entry.id === taskId);
    if (
      !task ||
      !['in_progress', 'in_review'].includes(task.status) ||
      !task.assignee ||
      isForeignOwnedPrimaryTask(task) ||
      isKnownRunnableAgentId(task.assignee)
    ) {
      warnedResumeIssues.delete(key);
    }
  }
}

function getCollaborationResumePriority(task) {
  if (task.status === 'in_progress') return 0;
  if (task.status === 'ready') return 1;
  if (task.status === 'backlog') return 2;
  return 3;
}

function reconcileCollaborationTasksWithParents() {
  let changed = false;
  collaborationTasks = collaborationTasks.map((task) => {
    if (!task.parentTaskId || task.status === 'done') {
      return task;
    }

    const parentTask = githubTasks.find((entry) => entry.id === task.parentTaskId);
    if (!parentTask || parentTask.status !== 'done') {
      return task;
    }

    changed = true;
    const nextTask = normalizeCollaborationTaskRecord(
      {
        ...task,
        status: 'done',
      },
      task,
    );
    if (isGitHubMirroredCollaborationTask(nextTask)) {
      syncGitHubMirroredTaskStatus(nextTask, 'done', nextTask.assignee || null, 'parent-done');
    }
    return nextTask;
  });

  if (changed) {
    persistRuntimeState();
    emitTasksUpdate();
  }
}

function resumeCollaborationWorkFromState(source = 'runtime-state') {
  reconcileCollaborationTasksWithParents();

  const resumableTasksByAgent = new Map();
  collaborationTasks
    .filter((task) => task.status !== 'done' && task.assignee)
    .sort((left, right) => {
      const priorityDiff = getCollaborationResumePriority(left) - getCollaborationResumePriority(right);
      if (priorityDiff !== 0) return priorityDiff;
      const leftDate = left.startedAt || left.updatedAt || left.createdAt || '';
      const rightDate = right.startedAt || right.updatedAt || right.createdAt || '';
      return leftDate.localeCompare(rightDate);
    })
    .forEach((task) => {
      if (!isKnownRunnableAgentId(task.assignee)) {
        rememberResumeWarning(
          `internal-orphan:${task.id}`,
          `⚠️ Colaboração ${task.id} aponta para assignee inválido (${task.assignee}).`,
        );
        return;
      }

      if (!resumableTasksByAgent.has(task.assignee)) {
        resumableTasksByAgent.set(task.assignee, []);
      }

      resumableTasksByAgent.get(task.assignee).push(task);
    });

  resumableTasksByAgent.forEach((tasks, agentId) => {
    tasks.forEach((task, index) => {
      if (
        hasActiveRun(agentId, task.id) ||
        hasScheduledRun(agentId, task.id) ||
        getPreparingRun(agentId)?.taskId === task.id
      ) {
        syncAgentAutonomousStatus(agentId);
        return;
      }

      const runRequest = {
        id: agentId,
        taskId: task.id,
        taskTitle: task.title,
        requestKind: 'collaboration',
        parentTaskId: task.parentTaskId || null,
        requestedBy: task.requesterId || null,
        queueIfBusy: true,
      };
      const agent = findAgentById(agentId);

      if (index === 0 && !isAgentOccupied(agentId)) {
        updateAgentIfChanged(
          agentId,
          'helping',
          `Retomando ajuda ${task.id}: ${task.title}`,
          {
            currentModel: agent?.currentModel || chooseModelForTask(agent, task.title),
            queueLength: getQueuedRuns(agentId).length,
          },
        );
        io.emit('agent_log', {
          id: 'ceo',
          log: `♻️ Retomando colaboração ${task.id} para ${agent?.name || agentId} após ${source}.`,
        });
        startRalphForAgent(agentId, task.title, task.id, runRequest);
        return;
      }

      queueRalphRun(runRequest);
      io.emit('agent_log', {
        id: 'ceo',
        log: `♻️ ${agent?.name || agentId} retomará a colaboração ${task.id} em fila.`,
      });
      syncAgentAutonomousStatus(agentId);
    });
  });
}

function resumeAutonomousWorkFromTasks(source = 'sync') {
  clearResolvedResumeWarnings();

  const resumableTasksByAgent = new Map();
  const reservedTaskIds = getReservedPrimaryTaskIds();
  let rebalancedAssignments = false;

  githubTasks.forEach((task) => {
    if (!['in_progress', 'in_review'].includes(task.status) || !task.assignee) {
      return;
    }
    if (!canCurrentInstanceManagePrimaryTask(task)) {
      return;
    }
    if (isPrimaryTaskDispatchBlocked(task)) {
      const releaseStatus = getPublishedPrimaryTaskReleaseStatus(task);
      releasePrimaryTaskToPool(
        task,
        `🧊 Trava de rerun (${source}): branch publicada detectada para ${task.id}.`,
        {
          status: releaseStatus,
          assignee: null,
          ownerId: null,
          ownerInstanceId: null,
          metricReason: 'published_branch_lock',
        },
      );
      return;
    }

    if (!isKnownRunnableAgentId(task.assignee)) {
      rememberResumeWarning(
        `orphan:${task.id}`,
        `⚠️ Task ${task.id} está em ${task.status} com assignee desconhecido (${task.assignee}). O loop autônomo não pode ser retomado; o resgate automático será tentado.`,
      );
      return;
    }

    if (!resumableTasksByAgent.has(task.assignee)) {
      resumableTasksByAgent.set(task.assignee, []);
    }

    resumableTasksByAgent.get(task.assignee).push(task);
  });

  resumableTasksByAgent.forEach((tasks, agentId) => {
    tasks.forEach((task, index) => {
      const agent = findAgentById(agentId);
      if (hasRecentPrimaryTaskFailureCooldown(task.id, agentId)) {
        removeQueuedRuns(agentId, (run) => run.taskId === task.id);
        const releasedTask = releasePrimaryTaskToPool(
          task,
          `🧯 Cooldown (${source}): ${task.id} aguarda novo ciclo seguro após falha recente.`,
          {
            status: getPrimaryResetStatus(task),
            assignee: null,
            metricReason: 'recent_failure_penalty',
          },
        );
        if (releasedTask) {
          rebalancedAssignments = true;
        }
        if (!syncAgentAutonomousStatus(agentId)) {
          updateAgentIfChanged(agentId, 'idle', 'Aguardando ordens...', {
            activeTaskId: null,
            activeTaskKind: null,
            queueLength: getQueuedRuns(agentId).length,
            workspacePath: null,
            workspaceMode: null,
          });
        }
        return;
      }
      const existingLaneSnapshot = agentLaneRuntime.get(agentId);
      if (
        existingLaneSnapshot &&
        existingLaneSnapshot.requestKind === 'primary' &&
        existingLaneSnapshot.taskId === task.id &&
        ['retry_scheduled', 'queued', 'running', 'preparing_workspace'].includes(
          String(existingLaneSnapshot.state || '').trim(),
        )
      ) {
        syncAgentAutonomousStatus(agentId);
        return;
      }

      const scoringText = buildTaskScoringText(task);
      if (
        shouldRebalanceAssignedImplementationTask(agent, task, { text: scoringText })
      ) {
        removeQueuedRuns(agentId, (run) => run.taskId === task.id);
        const releasedTask = releasePrimaryTaskToPool(
          task,
          `🧹 Rebalanceamento (${source}): ${agent?.name || agentId} nao deve retomar ${task.id} como executor primario de implementacao.`,
          {
            status: 'ready',
            assignee: null,
            metricReason: 'resume_role_mismatch',
          },
        );
        if (releasedTask) {
          rebalancedAssignments = true;
        }
        if (!syncAgentAutonomousStatus(agentId)) {
          updateAgentIfChanged(agentId, 'idle', 'Aguardando ordens...', {
            activeTaskId: null,
            activeTaskKind: null,
            queueLength: getQueuedRuns(agentId).length,
            workspacePath: null,
            workspaceMode: null,
          });
        }
        return;
      }

      const alreadyReservedGlobally = reservedTaskIds.has(task.id);
      if (
        hasActiveRun(agentId, task.id) ||
        hasScheduledRun(agentId, task.id) ||
        getPreparingRun(agentId)?.taskId === task.id
      ) {
        syncAgentAutonomousStatus(agentId);
        return;
      }

      if (alreadyReservedGlobally) {
        return;
      }

      if (index === 0 && !isAgentOccupied(agentId)) {
        updateAgentIfChanged(
          agentId,
          'coding',
          task.status === 'in_review'
            ? `Retomando review ${task.id}: ${task.title}`
            : `Retomando ${task.id}: ${task.title}`,
          { currentModel: agent?.currentModel || chooseModelForTask(agent, task.title) },
        );

        io.emit('agent_log', {
          id: 'ceo',
          log:
            task.status === 'in_review'
              ? `♻️ Retomando review autônomo de ${agent?.name || agentId} para ${task.id} após ${source}.`
              : `♻️ Retomando loop autônomo de ${agent?.name || agentId} para ${task.id} após ${source}.`,
        });
        startRalphForAgent(
          agentId,
          task.status === 'in_review' ? `[Review ${task.id}] ${task.title}` : task.title,
          task.id,
          { requestKind: 'primary', taskStatus: task.status },
        );
        return;
      }

      removeQueuedRuns(agentId, (queuedRun) => queuedRun.taskId === task.id);
      releasePrimaryTaskToPool(
        task,
        `🧹 Rebalanceamento (${source}): ${agent?.name || agentId} já está ocupado.`,
        {
          status: getPrimaryResetStatus(task),
          assignee: null,
        },
      );
    });
  });

  if (rebalancedAssignments) {
    pruneObsoleteLaneRuntimeSnapshots(`rebalance:${source}`);
    scheduleAutonomousDispatch(`resume-rebalance:${source}`);
  }
}

function resumePrimaryLanesFromSnapshots(source = 'runtime-state') {
  const resumableLanes = Array.from(agentLaneRuntime.values())
    .filter((lane) => {
      if (!lane || lane.requestKind !== 'primary') return false;
      const state = String(lane.state || '').trim();
      return ['retry_scheduled', 'queued', 'running', 'preparing_workspace'].includes(state);
    })
    .sort((left, right) => {
      const leftTask = githubTasks.find((task) => task.id === left.taskId) || null;
      const rightTask = githubTasks.find((task) => task.id === right.taskId) || null;
      if (leftTask?.status === 'in_review' && rightTask?.status !== 'in_review') return -1;
      if (rightTask?.status === 'in_review' && leftTask?.status !== 'in_review') return 1;
      return String(left.updatedAt || '').localeCompare(String(right.updatedAt || ''));
    });

  resumableLanes.forEach((lane) => {
    const agentId = lane.agentId;
    const task = githubTasks.find((entry) => entry.id === lane.taskId) || null;
    if (
      !task ||
      !['in_progress', 'in_review'].includes(String(task.status || '').trim()) ||
      task.assignee !== agentId ||
      !canCurrentInstanceManagePrimaryTask(task)
    ) {
      return;
    }

    if (hasRecentPrimaryTaskFailureCooldown(task.id, agentId)) {
      const releasedTask = releasePrimaryTaskToPool(
        task,
        `🧯 Cooldown (${source}): ${task.id} nao sera retomada antes de novo ciclo seguro.`,
        {
          status: getPrimaryResetStatus(task),
          assignee: null,
          metricReason: 'recent_failure_penalty',
        },
      );
      if (releasedTask) {
        pruneObsoleteLaneRuntimeSnapshots(`cooldown:${source}:${task.id}`);
        scheduleAutonomousDispatch(`cooldown:${task.id}`);
      }
      if (!syncAgentAutonomousStatus(agentId)) {
        updateAgentIfChanged(agentId, 'idle', 'Aguardando ordens...', {
          activeTaskId: null,
          activeTaskKind: null,
          queueLength: getQueuedRuns(agentId).length,
          workspacePath: null,
          workspaceMode: null,
        });
      }
      return;
    }

    if (
      hasActiveRun(agentId, task.id) ||
      hasScheduledRun(agentId, task.id) ||
      getPreparingRun(agentId)?.taskId === task.id
    ) {
      syncAgentAutonomousStatus(agentId);
      return;
    }

    const runTitle = buildPrimaryTaskRunTitle(task);
    const runRequest = {
      requestKind: 'primary',
      taskStatus: task.status,
      retryCount: Number(lane.retryCount || 0),
      commandRecoveryCount: Number(lane.commandRecoveryCount || 0),
      requestId: `${agentId}:${task.id}:lane-resume:${Date.now()}`,
    };
    const agent = findAgentById(agentId);

    if (!isAgentOccupied(agentId) && !hasQueuedWork(agentId)) {
      io.emit('agent_log', {
        id: 'ceo',
        log:
          task.status === 'in_review'
            ? `♻️ Retomando lane persistida de ${agent?.name || agentId} para review ${task.id} após ${source}.`
            : `♻️ Retomando lane persistida de ${agent?.name || agentId} para ${task.id} após ${source}.`,
      });
      startRalphForAgent(agentId, runTitle, task.id, runRequest);
      return;
    }

    queueRalphRun({
      id: agentId,
      taskId: task.id,
      taskTitle: runTitle,
      ...runRequest,
      queueIfBusy: true,
    });
    io.emit('agent_log', {
      id: 'ceo',
      log: `🕒 Lane persistida de ${agent?.name || agentId} para ${task.id} voltou para a fila após ${source}.`,
    });
  });
}

function pruneObsoleteLaneRuntimeSnapshots(source = 'sync') {
  let changed = false;

  for (const [agentId, lane] of Array.from(agentLaneRuntime.entries())) {
    if (!lane || !agentId) {
      agentLaneRuntime.delete(agentId);
      changed = true;
      continue;
    }

    if (lane.requestKind === 'primary') {
      const task = githubTasks.find((entry) => entry.id === lane.taskId) || null;
      const shouldKeep = Boolean(
        task &&
          ['in_progress', 'in_review'].includes(String(task.status || '').trim()) &&
          task.assignee === agentId &&
          canCurrentInstanceManagePrimaryTask(task),
      );

      if (!shouldKeep && !activeAgentRuns.has(agentId) && !getPreparingRun(agentId)) {
        agentLaneRuntime.delete(agentId);
        changed = true;
        io.emit('agent_log', {
          id: 'ceo',
          log: `🧹 Snapshot de lane ${lane.laneId} removido (${source}) por não corresponder mais ao estado real da task.`,
        });
      }
      continue;
    }

    if (lane.requestKind === 'collaboration') {
      const task = collaborationTasks.find((entry) => entry.id === lane.taskId) || null;
      const shouldKeep = Boolean(
        task &&
          task.status !== 'done' &&
          (!task.assignee || task.assignee === agentId),
      );

      if (!shouldKeep && !activeAgentRuns.has(agentId) && !getPreparingRun(agentId)) {
        agentLaneRuntime.delete(agentId);
        changed = true;
        io.emit('agent_log', {
          id: 'ceo',
          log: `🧹 Snapshot de colaboração ${lane.laneId} removido (${source}) por não corresponder mais ao estado interno.`,
        });
      }
    }
  }

  if (changed) {
    persistRuntimeState();
  }
}

function syncGitHubBackedCollaborationTasks(remoteGitHubTasks, primaryTasks) {
  const mirroredTasks = remoteGitHubTasks
    .filter((task) => task.kind === 'github_collaboration')
    .map((task) => {
      const existingTask =
        collaborationTasks.find(
          (entry) => entry.source === 'github' && entry.sourceTaskId === task.id,
        ) || null;
      return buildGitHubMirroredCollaborationTask(task, primaryTasks, existingTask);
    })
    .filter(Boolean);

  const mirroredById = new Map(mirroredTasks.map((task) => [task.id, task]));
  collaborationTasks = collaborationTasks
    .filter((task) => task.source !== 'github' || mirroredById.has(task.id))
    .map((task) => {
      if (task.source !== 'github') return task;
      return mirroredById.get(task.id) || task;
    });

  mirroredTasks.forEach((task) => {
    if (!collaborationTasks.find((entry) => entry.id === task.id)) {
      collaborationTasks.push(task);
    }
  });
}

function scoreCollaborationTaskForAgent(agent, task) {
  if (!agent || agent.role === 'ceo' || !task) return Number.NEGATIVE_INFINITY;
  if (!['backlog', 'ready', 'in_progress'].includes(String(task.status || '').trim())) {
    return Number.NEGATIVE_INFINITY;
  }
  if (task.source === 'github' && !task.parentTaskId) {
    return Number.NEGATIVE_INFINITY;
  }

  const parentTask = task.parentTaskId
    ? githubTasks.find((entry) => entry.id === task.parentTaskId) || null
    : null;
  if (parentTask && !canCurrentInstanceManagePrimaryTask(parentTask)) {
    return Number.NEGATIVE_INFINITY;
  }
  if (parentTask && parentTask.assignee === agent.id) {
    return Number.NEGATIVE_INFINITY;
  }

  if (task.assignee) {
    if (task.assignee !== agent.id) {
      return Number.NEGATIVE_INFINITY;
    }
  }

  const syntheticTask = {
    id: task.sourceTaskId || task.id,
    title: `${task.title} ${parentTask?.title || ''}`.trim(),
    status: normalizeCollaborationDispatchStatus(task.status),
    assignee: task.assignee || null,
  };

  let score = scoreTaskForAgent(agent, syntheticTask);
  if (!Number.isFinite(score)) return score;

  if (task.source === 'github') {
    score += 120;
  }
  if (task.assignee === agent.id) {
    score += 180;
  }
  if (parentTask && ['in_progress', 'in_review'].includes(parentTask.status)) {
    score += 90;
  }

  return score;
}

async function claimCollaborationTaskForAgent(task, agent, reason) {
  if (!task || !agent) return false;

  const currentTask = findInternalTask(task.id);
  if (!currentTask || currentTask.status === 'done') return false;
  if (currentTask.assignee && currentTask.assignee !== agent.id) return false;

  const updatedTask = updateInternalTask(currentTask.id, {
    ...currentTask,
    status: 'in_progress',
    assignee: agent.id,
  });
  if (!updatedTask) return false;

  if (isGitHubMirroredCollaborationTask(updatedTask)) {
    syncGitHubMirroredTaskStatus(updatedTask, 'in_progress', agent.id, `auto-dispatch-collaboration:${reason}`);
  }

  io.emit('agent_log', {
    id: 'ceo',
    log: `🤝 Auto-dispatch (${reason}): ${agent.name} assumiu a colaboração ${updatedTask.id}${updatedTask.parentTaskId ? ` de ${updatedTask.parentTaskId}` : ''}.`,
  });

  startRalphForAgent(agent.id, updatedTask.title, updatedTask.id, {
    requestKind: 'collaboration',
    parentTaskId: updatedTask.parentTaskId || null,
    requestedBy: updatedTask.requesterId || null,
    taskStatus: updatedTask.status,
  });
  return true;
}

async function dispatchCollaborationWork(reason = 'scheduler') {
  if (!AUTO_DISPATCH_ENABLED) return;

  const runnableAgents = agents.filter(
    (agent) =>
      agent.role !== 'ceo' &&
      !isAgentOccupied(agent.id) &&
      !hasQueuedWork(agent.id) &&
      !findAssignedActivePrimaryTask(agent.id),
  );

  if (runnableAgents.length === 0) {
    return;
  }

  const availableTasks = collaborationTasks.filter((task) => {
    if (task.status === 'done') return false;
    if (!['backlog', 'ready', 'in_progress'].includes(String(task.status || '').trim())) return false;
    if (task.assignee && !isKnownRunnableAgentId(task.assignee)) return false;
    if (task.source === 'github' && !task.parentTaskId) return false;
    if (task.parentTaskId) {
      const parentTask = githubTasks.find((entry) => entry.id === task.parentTaskId);
      if (!parentTask || !['in_progress', 'in_review', 'ready'].includes(parentTask.status)) {
        return false;
      }
    }
    return true;
  });

  const candidates = [];
  for (const agent of runnableAgents) {
    for (const task of availableTasks) {
      if (hasActiveRun(agent.id, task.id) || hasScheduledRun(agent.id, task.id)) {
        continue;
      }

      const score = scoreCollaborationTaskForAgent(agent, task);
      if (!Number.isFinite(score) || score < 150) {
        continue;
      }

      candidates.push({ agent, task, score });
    }
  }

  candidates.sort((left, right) => {
    if (right.score !== left.score) return right.score - left.score;
    if (left.task.id !== right.task.id) return String(left.task.id).localeCompare(String(right.task.id));
    return String(left.agent.id).localeCompare(String(right.agent.id));
  });

  const claimedTaskIds = new Set();
  const claimedAgentIds = new Set();
  for (const candidate of candidates) {
    if (claimedTaskIds.has(candidate.task.id) || claimedAgentIds.has(candidate.agent.id)) {
      continue;
    }

    const claimed = await claimCollaborationTaskForAgent(candidate.task, candidate.agent, reason);
    if (!claimed) {
      continue;
    }

    claimedTaskIds.add(candidate.task.id);
    claimedAgentIds.add(candidate.agent.id);
  }
}

function syncTasks() {
  if (syncTasksInFlight) {
    return syncTasksInFlight;
  }

  const currentSync = (async () => {
    const ghTasks = await fetchGitHubTasks();
    if (ghTasks) {
      const previousTasksById = new Map(githubTasks.map((task) => [task.id, task]));
      const localTasks = githubTasks.filter((task) => !isGitHubBackedTaskId(task.id));
      const projectContext = resolveProjectContext();
      const remotePrimaryTasks = [];
      const remoteStatusCorrections = [];

      for (const task of ghTasks.filter((entry) => entry.kind !== 'github_collaboration')) {
        const previousTask = previousTasksById.get(task.id) || null;
        const normalizedTask = await reconcileRemotePrimaryTaskRecord(
          task,
          previousTask,
          projectContext,
        );
        remotePrimaryTasks.push(normalizedTask);

        if (
          normalizedTask?.id
          && ['done', 'backlog'].includes(normalizedTask.status)
          && String(task?.status || '').trim() !== normalizedTask.status
          && !hasLivePrimaryTaskExecution(normalizedTask.id)
          && !(isPrimaryActiveStatus(normalizedTask.status) && isForeignOwnedPrimaryTask(normalizedTask))
        ) {
          remoteStatusCorrections.push(() =>
            moveGitHubTask(normalizedTask.id, normalizedTask.status, null, {
              ownerId: null,
              ownerInstanceId: null,
            }).catch((error) => {
              io.emit('agent_log', {
                id: 'ceo',
                log: `⚠️ Falha ao corrigir ${normalizedTask.id} para ${normalizedTask.status} no GitHub: ${error.message}`,
              });
            }),
          );
        }
      }

      githubTasks = [...remotePrimaryTasks, ...localTasks];
      syncGitHubBackedCollaborationTasks(ghTasks, remotePrimaryTasks);

      remoteStatusCorrections.forEach((runCorrection) => {
        Promise.resolve()
          .then(runCorrection)
          .catch((error) => {
            io.emit('agent_log', {
              id: 'ceo',
              log: `⚠️ Falha no agendamento de correção remota de status: ${error.message}`,
            });
          });
      });

      if (projectBoardResyncPending) {
        const syncableTasks = [
          ...githubTasks.filter((task) => isGitHubBackedTaskId(task.id) && task.githubNodeId && task.status),
          ...collaborationTasks.filter(
            (task) => isGitHubMirroredCollaborationTask(task) && task.githubNodeId && task.status,
          ),
        ];
        let allProjectFieldsSynced = true;

        for (const task of syncableTasks) {
          const synced = await syncGitHubProjectStatusByNodeId(task.githubNodeId, task.status);
          if (!synced) {
            allProjectFieldsSynced = false;
          }
        }

        if (allProjectFieldsSynced) {
          projectBoardResyncPending = false;
        }
      }
    }
    reconcilePrimaryTaskReservations('sync');
    reconcilePrimaryTaskAssignments('sync');
    ensureReviewCoverage('sync');
    pruneObsoleteLaneRuntimeSnapshots('sincronização com GitHub');
    emitTasksUpdate();
    resumeAutonomousWorkFromTasks('sincronização com GitHub');
    resumePrimaryLanesFromSnapshots('sincronização com GitHub');
    resumeCollaborationWorkFromState('sincronização com estado interno');
    scheduleAutonomousDispatch('sincronização com GitHub');
  })();

  const trackedSync = currentSync.finally(() => {
    if (syncTasksInFlight === trackedSync) {
      syncTasksInFlight = null;
    }
  });

  syncTasksInFlight = trackedSync;
  return trackedSync;
}

async function reconcileManagedWorkspaces(reason = 'startup') {
  const projectContext = resolveProjectContext();
  const managedWorkspaces = listManagedWorkspaces(projectContext);
  if (managedWorkspaces.length === 0) {
    return;
  }

  const githubTasksById = new Map(githubTasks.map((task) => [task.id, task]));
  const collaborationTasksById = new Map(collaborationTasks.map((task) => [task.id, task]));

  for (const workspaceEntry of managedWorkspaces) {
    const metadata = workspaceEntry.metadata || {};
    if (metadata.instanceId && metadata.instanceId !== CURRENT_INSTANCE_ID) {
      continue;
    }
    const taskId = String(metadata.taskId || '').trim();
    if (!taskId) {
      continue;
    }

    const activeRun = Array.from(activeAgentRuns.values()).find((run) => run.taskId === taskId);
    const preparingRun = Array.from(preparingAgentRuns.values()).find(
      (run) => isLivePreparingRun(run) && run.taskId === taskId,
    );
    if (activeRun || preparingRun) {
      continue;
    }

    let keepWorkspace = false;
    if (isInternalTaskId(taskId)) {
      const task = collaborationTasksById.get(taskId);
      keepWorkspace = Boolean(task && task.status !== 'done' && task.assignee === metadata.agentId);
    } else {
      const task = githubTasksById.get(taskId);
      keepWorkspace = Boolean(
        task &&
          ['in_progress', 'in_review'].includes(task.status) &&
          task.assignee === metadata.agentId,
      );
    }

    if (keepWorkspace) {
      continue;
    }

    const workspaceInspection = inspectWorkspaceState(workspaceEntry.path);
    if (workspaceInspection.dirty) {
      io.emit('agent_log', {
        id: 'ceo',
        log: `📦 Workspace preservado para revisão manual: ${taskId} (${workspaceEntry.path})${workspaceInspection.accessible ? ' com mudanças locais.' : `; estado não inspecionável: ${workspaceInspection.details}`}`,
      });
      continue;
    }

    try {
      await cleanupTaskWorkspace(projectContext, {
        isolated: true,
        path: workspaceEntry.path,
      });
      io.emit('agent_log', {
        id: 'ceo',
        log: `🧹 Workspace órfão removido após ${reason}: ${taskId} (${workspaceEntry.path})`,
      });
    } catch (error) {
      io.emit('agent_log', {
        id: 'ceo',
        log: `⚠️ Falha ao limpar workspace órfão ${taskId}: ${error.message}`,
      });
    }
  }
}

// Fetch periodically
setInterval(() => {
  syncTasks().catch((error) => {
    console.error('[SYNC] Falha no sync periódico:', error.message);
  });
}, 30000);

setInterval(() => {
  scheduleAutonomousDispatch('heartbeat');
}, AUTO_DISPATCH_HEARTBEAT_MS);

setInterval(() => {
  Promise.resolve()
    .then(() => reconcilePublishedBranchPipelines('interval'))
    .catch((error) => {
      console.error('[GITLAB] Falha ao reconciliar pipelines publicados:', error.message);
      io.emit('agent_log', {
        id: 'ceo',
        log: `⚠️ Falha ao reconciliar pipelines GitLab: ${error.message}`,
      });
    });
}, AUTO_DISPATCH_HEARTBEAT_MS);

setInterval(() => {
  try {
    monitorStalledPrimaryTasks('intervalo');
  } catch (error) {
    console.error('[WATCHDOG] Falha ao monitorar cards estagnados:', error.message);
    io.emit('agent_log', {
      id: 'ceo',
      log: `⚠️ Falha no watchdog de cards: ${error.message}`,
    });
  }
}, STALE_TASK_MONITOR_INTERVAL_MS);

const updateAgent = (id, status, task, extraFields = {}) => {
  const normalizedExtraFields = { ...extraFields };
  if (
    normalizedExtraFields.currentModel &&
    !Object.prototype.hasOwnProperty.call(normalizedExtraFields, 'currentProvider')
  ) {
    normalizedExtraFields.currentProvider =
      detectProviderFromModel(normalizedExtraFields.currentModel) || null;
  }
  if (status === 'idle') {
    if (!Object.prototype.hasOwnProperty.call(normalizedExtraFields, 'workspacePath')) {
      normalizedExtraFields.workspacePath = null;
    }
    if (!Object.prototype.hasOwnProperty.call(normalizedExtraFields, 'workspaceMode')) {
      normalizedExtraFields.workspaceMode = null;
    }
    if (!Object.prototype.hasOwnProperty.call(normalizedExtraFields, 'activeTaskId')) {
      normalizedExtraFields.activeTaskId = null;
    }
    if (!Object.prototype.hasOwnProperty.call(normalizedExtraFields, 'activeTaskKind')) {
      normalizedExtraFields.activeTaskKind = null;
    }
    if (!Object.prototype.hasOwnProperty.call(normalizedExtraFields, 'queueLength')) {
      normalizedExtraFields.queueLength = getQueuedRuns(id).length;
    }
    if (!Object.prototype.hasOwnProperty.call(normalizedExtraFields, 'currentReasoningEffort')) {
      normalizedExtraFields.currentReasoningEffort = null;
    }
    if (!Object.prototype.hasOwnProperty.call(normalizedExtraFields, 'fallbackActive')) {
      normalizedExtraFields.fallbackActive = false;
    }
    if (!Object.prototype.hasOwnProperty.call(normalizedExtraFields, 'fallbackDepth')) {
      normalizedExtraFields.fallbackDepth = 0;
    }
    if (!Object.prototype.hasOwnProperty.call(normalizedExtraFields, 'fallbackReason')) {
      normalizedExtraFields.fallbackReason = null;
    }
  }

  agents = agents.map(agent => 
    agent.id === id
      ? normalizeAgentConfig({
          ...agent,
          status: status,
          task: task === undefined ? agent.task : task,
          ...normalizedExtraFields,
        })
      : agent
  );
  io.emit('agents_update', getVisibleAgents());
  refreshOperationalMetrics();

  if (status === 'idle' || status === 'error') {
    scheduleAutonomousDispatch(`status:${id}:${status}`);
  }
};

app.get('/api/tasks', (req, res) => {
  reconcileGameFactoryTasksFromCatalog('api/tasks');
  res.json(getVisibleTasks());
  syncTasks().catch((error) => {
    console.error('[SYNC] Falha ao atualizar tasks após /api/tasks:', error.message);
  });
});

app.post('/api/tasks', async (req, res) => {
  const title = String(req.body?.title || '').trim();
  const requestedStatus = String(req.body?.status || 'backlog').trim().toLowerCase() || 'backlog';
  const assigneeId = String(req.body?.assigneeId || '').trim() || null;
  const provider = String(req.body?.provider || req.body?.source || '').trim().toLowerCase();
  const validStatuses = new Set([
    'backlog',
    'ready',
    'in_progress',
    'in_review',
    'done',
  ]);

  if (!title) {
    return res.status(400).json({ error: 'Campo obrigatório: title' });
  }

  if (!validStatuses.has(requestedStatus)) {
    return res.status(400).json({ error: `Status inválido: ${requestedStatus}` });
  }

  if (assigneeId) {
    const assignee = findAgentById(assigneeId);
    if (!assignee || assignee.role === 'ceo') {
      return res.status(400).json({ error: `Assignee inválido: ${assigneeId}` });
    }
  }

  try {
    const createdTask = await createPrimaryTaskRecord({
      title,
      status: requestedStatus,
      assignee: assigneeId,
      preferGitHub: provider !== 'local',
      ...normalizeTaskMetadataPayload(req.body || {}),
    });

    if (!createdTask) {
      return res.status(500).json({ error: 'Não foi possível criar a task.' });
    }

    if (assigneeId && isPrimaryActiveStatus(createdTask.status)) {
      startRalphForAgent(assigneeId, buildPrimaryTaskRunTitle(createdTask), createdTask.id, {
        requestKind: 'primary',
        taskStatus: createdTask.status,
        queueIfBusy: true,
      });
    } else {
      scheduleAutonomousDispatch(`api-create:${createdTask.id}`);
    }

    return res.status(201).json({
      success: true,
      task: createdTask,
      provider: isGitHubBackedTaskId(createdTask.id) ? 'github' : 'local',
      source: isGitHubBackedTaskId(createdTask.id) ? 'github' : 'local',
    });
  } catch (error) {
    console.error('[TASKS] Falha ao criar task:', error.message);
    return res.status(500).json({ error: `Falha ao criar task: ${error.message}` });
  }
});

app.get('/health', (req, res) => {
  const projectContext = resolveProjectContext();
  const opencodeValidator = getOpencodeRuntimeStatus({
    projectDir: projectContext.projectDir,
  });
  const figmaBridge = getFigmaBridgeStatus({
    env: process.env,
  });
  const stitchBridge = getStitchBridgeStatus({
    env: process.env,
  });
  const opencodeReviewGate = resolveOpencodeReviewGateConfig(process.env);
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    instanceId: CURRENT_INSTANCE_ID,
    ownerId: CURRENT_INSTANCE_OWNER,
    workspaceIntegrationMode: WORKSPACE_INTEGRATION_MODE,
    projectDir: projectContext.projectDir,
    projectSource: projectContext.source,
    gitRoot: projectContext.gitRoot || null,
    figmaBridge,
    stitchBridge,
    opencodeValidator,
    opencodeReviewGate,
    status: getOperationalStatusSnapshot(),
  });
});

app.get('/api/runtime', (req, res) => {
  const projectDir = resolveProjectDir();
  const figmaBridge = getFigmaBridgeStatus({
    env: process.env,
  });
  const stitchBridge = getStitchBridgeStatus({
    env: process.env,
  });
  const opencodeReviewGate = resolveOpencodeReviewGateConfig(process.env);
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    projectDir,
    figmaBridge,
    stitchBridge,
    opencodeValidator: getOpencodeRuntimeStatus({
      projectDir,
    }),
    opencodeReviewGate,
    runtime: getRuntimeStateSnapshot(),
    operations: getOperationalStatusSnapshot(),
  });
});

app.get('/api/figma/status', (req, res) => {
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    figmaBridge: getFigmaBridgeStatus({
      env: process.env,
    }),
  });
});

app.get('/api/stitch/status', async (req, res) => {
  const stitchBridge = getStitchBridgeStatus({
    env: process.env,
    probeAdc: true,
  });
  const includeTools = ['1', 'true', 'yes'].includes(
    String(req.query.includeTools || req.query.tools || '').trim().toLowerCase(),
  );

  if (!includeTools) {
    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      stitchBridge,
    });
  }

  if (!stitchBridge.ready) {
    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      stitchBridge,
      tools: null,
      toolFetchError: 'stitch bridge not ready',
    });
  }

  try {
    const tools = await listStitchTools({
      env: process.env,
      timeoutMs: 20000,
    });
    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      stitchBridge,
      tools,
      toolFetchError: null,
    });
  } catch (error) {
    return res.json({
      ok: true,
      timestamp: new Date().toISOString(),
      stitchBridge,
      tools: null,
      toolFetchError: error.message,
    });
  }
});

app.get('/api/opencode/status', (req, res) => {
  const projectContext = resolveProjectContext();
  const opencodeReviewGate = resolveOpencodeReviewGateConfig(process.env);
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    projectDir: projectContext.projectDir,
    opencodeValidator: getOpencodeRuntimeStatus({
      projectDir: projectContext.projectDir,
      useCache: false,
    }),
    opencodeReviewGate,
  });
});

app.get('/api/rooms', (req, res) => {
  const rooms = buildRoomOccupancy(ROOM_TEMPLATES, agents);
  res.json({
    ok: true,
    timestamp: new Date().toISOString(),
    totalConfigured: ROOM_TEMPLATES.length,
    byTeam: rooms.reduce((acc, room) => {
      bumpCount(acc, room.team);
      return acc;
    }, {}),
    byTopology: rooms.reduce((acc, room) => {
      bumpCount(acc, room.topology || 'unspecified');
      return acc;
    }, {}),
    bySpecializationRole: rooms.reduce((acc, room) => {
      bumpCount(acc, room.specializationRole || 'mixed');
      return acc;
    }, {}),
    rooms,
  });
});

app.get('/api/skills', (req, res) => {
  const projectContext = resolveProjectContext();
  const skills = discoverSkills(defaultSkillRoots(projectContext.projectDir)).map((skill) => ({
    id: skill.id,
    title: skill.title,
    description: skill.description,
    roles: skill.roles,
    teams: skill.teams,
    taskKeywords: skill.taskKeywords,
  }));

  res.json({
    ok: true,
    projectDir: projectContext.projectDir,
    skills,
  });
});

app.post('/api/tasks/move', async (req, res) => {
  const { taskId, newStatus } = req.body || {};
  const previousTask = findVisibleTask(taskId);
  if (!previousTask) {
    return res.status(404).json({ error: 'Task não encontrada' });
  }
  if (!isInternalTaskId(taskId) && isForeignOwnedPrimaryTask(previousTask)) {
    return res.status(409).json({
      error: `Task ${taskId} pertence a outra instância (${resolvePrimaryTaskOwnerInstanceId(previousTask) || 'desconhecida'}).`,
    });
  }

  const hasExplicitAssignee = Object.prototype.hasOwnProperty.call(req.body || {}, 'assigneeId');
  const requestedAssigneeId = hasExplicitAssignee
    ? String(req.body.assigneeId || '').trim() || null
    : null;
  const resolvedAssigneeId = hasExplicitAssignee
    ? requestedAssigneeId
    : ['backlog', 'ready'].includes(newStatus)
      ? null
      : previousTask.assignee || null;

  let updatedTask = null;
  if (isInternalTaskId(taskId)) {
    updatedTask = updateInternalTask(taskId, (task) => ({
      ...task,
      status: newStatus,
      assignee: resolvedAssigneeId,
    }));
  } else {
    const ownershipPatch =
      resolvedAssigneeId && isPrimaryActiveStatus(newStatus)
        ? buildPrimaryTaskOwnershipPatch(newStatus)
        : { ownerId: null, ownerInstanceId: null };
    updatedTask = updatePrimaryTaskRecord(taskId, {
      ...previousTask,
      status: newStatus,
      assignee: resolvedAssigneeId,
      ownerId: ownershipPatch.ownerId,
      ownerInstanceId: ownershipPatch.ownerInstanceId,
    });
  }

  const previousAssigneeId = previousTask.assignee || null;
  const effectiveAssigneeId = updatedTask?.assignee || null;
  const taskStateChanged =
    previousTask?.status !== newStatus || previousAssigneeId !== effectiveAssigneeId;
  const stoppedTaskRuns = taskStateChanged
    ? stopTaskRuns(
        taskId,
        `[SYSTEM] ${taskId} foi movida manualmente para ${newStatus}. Encerrando loops relacionados antes da reconciliação.`,
      )
    : [];
  const affectedAgentIds = new Set(stoppedTaskRuns.map((entry) => entry.agentId));

  if (effectiveAssigneeId && isPrimaryActiveStatus(newStatus)) {
    const taskBecameActive =
      previousTask?.status !== newStatus || previousTask?.assignee !== effectiveAssigneeId;

    if (taskBecameActive && updatedTask) {
      startRalphForAgent(effectiveAssigneeId, buildPrimaryTaskRunTitle(updatedTask), updatedTask.id, {
        requestKind: isInternalTaskId(updatedTask.id) ? 'collaboration' : 'primary',
        parentTaskId: updatedTask.parentTaskId || null,
        requestedBy: updatedTask.requesterId || null,
        taskStatus: updatedTask.status,
      });
    } else {
      syncAgentAutonomousStatus(effectiveAssigneeId);
    }
  }

  affectedAgentIds.delete(effectiveAssigneeId);
  affectedAgentIds.forEach((agentId) => {
    if (!syncAgentAutonomousStatus(agentId)) {
      updateAgent(agentId, 'idle', 'Aguardando ordens...');
    }
  });

  if (!isInternalTaskId(taskId)) {
    reconcilePrimaryTaskReservations(`task-move:${taskId}:${newStatus}`);
  }

  if (!isInternalTaskId(taskId) && newStatus === 'done') {
    clearPrimaryTaskCompletionMemory(taskId);
    primaryTaskRuntimeMeta.delete(taskId);
    persistRuntimeState();
  }

  if (isInternalTaskId(taskId) && updatedTask && isGitHubMirroredCollaborationTask(updatedTask)) {
    syncGitHubMirroredTaskStatus(updatedTask, newStatus, effectiveAssigneeId, 'task-move');
  }

  // Sync to GitHub if possible
  if (isGitHubBackedTaskId(taskId)) {
    const synced = await moveGitHubTask(taskId, newStatus, effectiveAssigneeId, {
      ownerId: updatedTask?.ownerId || null,
      ownerInstanceId: updatedTask?.ownerInstanceId || null,
    });
    if (!synced) {
      io.emit('agent_log', {
        id: 'ceo',
        log: `⚠️ Falha ao mover ${taskId} no GitHub para ${newStatus}. O estado local foi preservado e a sincronização será tentada novamente.`,
      });
    }
  }

  if (!isInternalTaskId(taskId) && newStatus === 'done') {
    reconcilePhaseReleases(`task-move:${taskId}:${newStatus}`).catch((error) => {
      io.emit('agent_log', {
        id: 'ceo',
        log: `⚠️ Falha ao reconciliar releases por etapa após mover ${taskId} para done: ${error.message}`,
      });
    });
  }

  scheduleAutonomousDispatch(`task-move:${taskId}:${newStatus}`);
  
  res.json({ success: true });
});

// Rota para adicionar um novo agente genérico
app.post('/api/add_agent', (req, res) => {
  const {
    name,
    role,
    model,
    llmProvider,
    prompt,
    reasoningEffort,
    mcps,
    team,
    floor,
    roomId,
    fallbackModels,
    skills,
  } = req.body || {};
  const newId = 'agent_' + (agents.length + 1);
  const configuredLlm = resolveConfiguredLlm({ llmProvider, model });
  const normalizedTeam = normalizeAgentTeam(team);
  const newAgent = {
    id: newId,
    name: name || 'New Agent',
    role: role || 'dev',
    team: normalizedTeam,
    floor: normalizeAgentFloor(floor, normalizedTeam),
    roomId: String(roomId || '').trim() || null,
    status: 'idle',
    task: normalizedTeam === REVIEW_TEAM ? 'Cobertura de review e gargalos' : 'Aguardando ordens...',
    llmProvider: configuredLlm.llmProvider,
    model: configuredLlm.model,
    prompt,
    reasoningEffort,
    mcps,
    fallbackModels,
    skills,
  };
  const createdAgent = normalizeAgentConfig(newAgent);
  agents.push(createdAgent);
  io.emit('agents_update', getVisibleAgents());
  scheduleAutonomousDispatch(`novo-agente:${newId}`);
  res.status(200).json({ success: true, agent: createdAgent });
});

app.patch('/api/agents/:id', (req, res) => {
  const agentId = String(req.params.id || '').trim();
  const currentAgent = findAgentById(agentId);
  if (!currentAgent) {
    return res.status(404).json({ error: 'Agente não encontrado' });
  }

  const body = req.body || {};
  const hasField = (field) => Object.prototype.hasOwnProperty.call(body, field);
  const nextTeam = hasField('team') ? normalizeAgentTeam(body.team) : normalizeAgentTeam(currentAgent.team);
  const configuredLlm = resolveConfiguredLlm({
    llmProvider: hasField('llmProvider') ? body.llmProvider : currentAgent.llmProvider,
    model: hasField('model') ? body.model : currentAgent.model,
  });

  const nextAgent = normalizeAgentConfig({
    ...currentAgent,
    ...(hasField('name') ? { name: String(body.name || '').trim() || currentAgent.name } : {}),
    ...(hasField('role') ? { role: String(body.role || '').trim() || currentAgent.role } : {}),
    ...(hasField('prompt') ? { prompt: body.prompt } : {}),
    ...(hasField('reasoningEffort') ? { reasoningEffort: body.reasoningEffort } : {}),
    ...(hasField('mcps') ? { mcps: body.mcps } : {}),
    ...(hasField('fallbackModels') ? { fallbackModels: body.fallbackModels } : {}),
    ...(hasField('skills') ? { skills: body.skills } : {}),
    ...(hasField('roomId') ? { roomId: String(body.roomId || '').trim() || null } : {}),
    team: nextTeam,
    floor: hasField('floor')
      ? normalizeAgentFloor(body.floor, nextTeam)
      : normalizeAgentFloor(currentAgent.floor, nextTeam),
    llmProvider: configuredLlm.llmProvider,
    model: configuredLlm.model,
  });

  agents = agents.map((candidate) => (candidate.id === agentId ? nextAgent : candidate));
  io.emit('agents_update', getVisibleAgents());
  refreshOperationalMetrics();

  if (activeAgentRuns.has(agentId)) {
    io.emit('agent_log', {
      id: agentId,
      log: '🛠️ Configuração do agente atualizada. O novo provider/modelo será usado integralmente na próxima execução.',
    });
  }

  scheduleAutonomousDispatch(`atualizacao-agente:${agentId}`);
  res.status(200).json({
    success: true,
    agent: nextAgent,
    effectiveAt: activeAgentRuns.has(agentId) ? 'next_run' : 'immediate',
  });
});

// Rota para gerar perfil de agente via IA
app.post('/api/generate_profile', (req, res) => {
  const { role, name, llmProvider, model, reasoningEffort } = req.body || {};
  const configuredLlm = resolveConfiguredLlm({ llmProvider, model });
  const configuredReasoningEffort = resolveAgentReasoningEffort({
    llmProvider: configuredLlm.llmProvider,
    model: configuredLlm.model,
    role: role || 'dev',
    reasoningEffort,
  });
  const suggestedModels = listModelsForProvider(configuredLlm.llmProvider).join(', ');
  const baselinePrompt = buildDefaultAgentPrompt({
    name: name || 'Agente',
    role: role || 'dev',
    team: PRIMARY_TEAM,
    llmProvider: configuredLlm.llmProvider,
    model: configuredLlm.model,
  });
  console.log(
    `🤖 Gerando perfil profissional para o cargo ${role} via ${configuredLlm.llmProvider}/${configuredLlm.model}...`,
  );

  const promptStr = `Você é um especialista em RH e IA. Retorne estritamente e APENAS um JSON válido. Não explique, não use markdown, não adicione nenhum texto antes ou depois.

Cargo: ${role}
Nome: ${name || 'Agente'}
Provider preferido: ${configuredLlm.llmProvider}
Modelos aceitos para este provider: ${suggestedModels}
Reasoning effort preferido: ${configuredReasoningEffort || 'auto'}
Prompt base operacional que deve ser preservado e refinado:
${baselinePrompt}

Formato obrigatório:
{
  "prompt": "system prompt detalhado de como este agente deve se comportar e trabalhar (em português, formato texto plano)",
  "llmProvider": "${configuredLlm.llmProvider}",
  "reasoningEffort": "${configuredReasoningEffort || 'auto'}",
  "mcps": ["github", "gcloud"],
  "model": "${configuredLlm.model}"
}

Lembre-se: Apenas o JSON, começando com { e terminando com }`;

  runPrompt(promptStr, {
    reasoningEffort: configuredReasoningEffort,
    llmProvider: configuredLlm.llmProvider,
    model: configuredLlm.model,
  }).then(({ stdout }) => {
    try {
      const startIndex = stdout.indexOf('{');
      const endIndex = stdout.lastIndexOf('}');
      if (startIndex === -1 || endIndex === -1) {
        throw new Error("JSON não encontrado na resposta");
      }

      let jsonStr = stdout.substring(startIndex, endIndex + 1);
      const config = JSON.parse(jsonStr);
      config.llmProvider =
        normalizeLlmProvider(config.llmProvider) ||
        detectProviderFromModel(config.model) ||
        configuredLlm.llmProvider;
      config.model = normalizeModelName(config.model, config.llmProvider) || configuredLlm.model;
      config.reasoningEffort = resolveAgentReasoningEffort({
        llmProvider: config.llmProvider,
        model: config.model,
        role: role || 'dev',
        reasoningEffort: config.reasoningEffort || configuredReasoningEffort,
      });
      res.status(200).json(config);
    } catch (e) {
      console.error("Erro ao fazer parse do JSON do perfil:", e);
      console.log("Output bruto:", stdout);
      res.status(500).json({ error: "Formato de resposta inválido da IA." });
    }
  }).catch((error) => {
    const details = extractPromptErrorDetails(error);
    console.error("Erro ao gerar perfil:", error);
    res.status(resolveHttpErrorStatus(error, 500)).json({
      error: "Falha na geração do perfil com IA.",
      ...(details ? { details } : {}),
    });
  });
});

// Rota para conversar com um agente
app.post('/api/chat', (req, res) => {
  const { agentId, message } = req.body;
  const agent = agents.find(a => a.id === agentId);
  
  if (!agent) return res.status(404).json({ error: 'Agente não encontrado' });

  console.log(`💬 Usuário enviando mensagem para ${agent.name}: "${message}"`);

  const systemPrompt = agent.prompt || buildDefaultAgentPrompt(agent);
  const promptLlm = resolveAgentPromptModel(agent, message);
  const reasoningEffort = resolveAgentReasoningEffort(agent);

  const promptStr = `Usuário disse: ${message}\n\nResponda como o agente, mantendo a personalidade. Seja direto. SE precisar delegar ou criar uma tarefa para a equipe, retorne na sua resposta EXATAMENTE: [CREATE_TICKET: "Título da Tarefa" TO "id_do_agente"]`;

  runPrompt(promptStr, {
    systemPrompt,
    reasoningEffort,
    llmProvider: promptLlm.provider,
    model: promptLlm.model,
  }).then(({ stdout }) => {
    let reply = stdout;
    // Interceptar Tickets criados pelo Agente
    const ticketRegex = /\[CREATE_TICKET:\s*"(.*?)"\s+TO\s+"(.*?)"\]/g;
    let match;
    while ((match = ticketRegex.exec(reply)) !== null) {
      const tTitle = match[1];
      const tAssignee = match[2];
      
      createPrimaryTaskRecord({
        title: tTitle,
        status: 'backlog',
        assignee: tAssignee,
        preferGitHub: true,
      }).then((task) => {
        if (!task) {
          return;
        }
        const assigneeSuffix = task.assignee
          ? ` para ${task.assignee}`
          : tAssignee
            ? ` sem assignee fixo (pedido original: ${tAssignee})`
            : '';
        io.emit('agent_log', {
          id: 'ceo',
          log: `🎫 ${agent.name} delegou uma tarefa: "${tTitle}"${assigneeSuffix}`,
        });
        scheduleAutonomousDispatch(`chat-ticket:${task.id}`);
      });
      reply = reply.replace(match[0], `\n*(Criou um ticket para ${tAssignee}: "${tTitle}")*`);
    }

    res.status(200).json({ reply: reply.trim() || "Estou processando sua solicitação..." });
  }).catch((error) => {
    const details = extractPromptErrorDetails(error);
    console.error("Erro no chat:", error);
    res.status(resolveHttpErrorStatus(error, 500)).json({
      error: "Erro ao processar resposta do agente.",
      ...(details ? { details } : {}),
    });
  });
});

// Rota para iniciar uma reunião da equipe
app.post('/api/start_meeting', async (req, res) => {
  const { topic, agentIds } = req.body;
  let activeAgents = agents.filter(isDefaultMeetingAgent);
  
  if (agentIds && Array.isArray(agentIds) && agentIds.length > 0) {
    activeAgents = agents.filter((a) => a.role !== 'ceo' && agentIds.includes(a.id));
  }

  if (activeAgents.length === 0) {
    return res.status(400).json({ error: 'Nenhum agente selecionado ou válido.' });
  }
  
  console.log(`[Reunião] Iniciando com ${activeAgents.length} agentes:`, activeAgents.map(a => a.name));
  io.emit('agent_log', { id: 'ceo', log: `\n📢 Iniciando Reunião Geral da Equipe... Tópico: ${topic}` });
  
  activeAgents.forEach(a => updateAgent(a.id, 'meeting', 'Em Reunião...'));

  const meetingTasks = githubTasks
    .filter((task) => isImplementationDispatchCandidateStatus(String(task.status || '').trim()))
    .slice(0, 5);
  const formattedTasks = meetingTasks
    .map((task) => `- [${task.id}] (${task.status}) ${task.title}`)
    .join('\n');

  const contextExtendido = meetingTasks.length > 0
    ? `${topic}\n\nTop 5 Tarefas Disponíveis:\n${formattedTasks}\n\nLíder, se a equipe estiver livre, distribua trabalho com [TAKE_TASK: "TASK-ID"].`
    : `${topic}\n\nNão há tasks disponíveis no board. Se necessário, proponha [CREATE_TICKET: "Título" TO "agent_id"].`;

  const agentsToWork = [];
  const activePrimaryWorkExists = githubTasks.some((task) =>
    ['in_progress', 'in_review'].includes(String(task.status || '').trim()),
  );
  const allowMeetingTicketCreation = meetingTasks.length === 0 && !activePrimaryWorkExists;

  runMeeting(activeAgents, contextExtendido, (msg) => {
    io.emit('agent_log', { id: 'ceo', log: msg });
  }, async (agent, reply) => {
    
    // Processar [TAKE_TASK: "TASK-ID"]
    const takeRegex = /\[TAKE_TASK:\s*["']?([A-Z][A-Z0-9-]+)["']?\s*\]/gi;
    let matchT;
    while ((matchT = takeRegex.exec(reply)) !== null) {
      const tId = String(matchT[1] || '').trim().toUpperCase();
      const task = githubTasks.find((entry) => entry.id === tId);
      const meetingClaim = claimTaskForMeeting(task, agent, agentsToWork);
      if (!meetingClaim.ok) {
        io.emit('agent_log', { id: 'ceo', log: `⚠️ Claim rejeitado para ${agent.name}: ${meetingClaim.error}` });
        continue;
      }

      io.emit('agent_log', { id: 'ceo', log: `🚀 ${agent.name} assumiu a tarefa ${tId}!` });
    }

    // Processar [CREATE_TICKET: "..." TO "id"]
    const ticketRegex = /\[CREATE_TICKET:\s*["'](.+?)["']\s+TO\s+["']([a-z0-9_-]+)["']\s*\]/gi;
    let matchC;
    while ((matchC = ticketRegex.exec(reply)) !== null) {
      if (!allowMeetingTicketCreation) {
        io.emit('agent_log', {
          id: 'ceo',
          log: `⚠️ CREATE_TICKET ignorado para ${agent.name}: ainda existem cards acionaveis ou trabalho primario em andamento no board.`,
        });
        continue;
      }

      const tTitle = matchC[1];
      const tAssignee = matchC[2];
      
      const createdTask = await createPrimaryTaskRecord({
        title: tTitle,
        status: 'backlog',
        assignee: tAssignee,
        preferGitHub: true,
      });
      if (createdTask) {
        const effectiveAssignee = createdTask.assignee || null;
        io.emit('agent_log', {
          id: 'ceo',
          log: `🎫 Ticket Auto-Criado: "${tTitle}"${effectiveAssignee ? ` para ${effectiveAssignee}` : tAssignee ? ` sem assignee fixo (pedido original: ${tAssignee})` : ''}`,
        });
        const assigneeAlreadyBusy = Boolean(
          effectiveAssignee &&
            (findAssignedActivePrimaryTask(effectiveAssignee) ||
              isAgentOccupied(effectiveAssignee) ||
              findPendingRunForAgent(effectiveAssignee)),
        );
        if (effectiveAssignee === agent.id && !agentsToWork.some((work) => work.id === agent.id) && !assigneeAlreadyBusy) {
          agentsToWork.push({ id: agent.id, taskId: createdTask.id, taskTitle: tTitle });
        } else if (effectiveAssignee === agent.id && assigneeAlreadyBusy) {
          io.emit('agent_log', {
            id: 'ceo',
            log: `⚠️ ${agent.name} criou ${createdTask.id}, mas o ticket ficará no backlog porque já existe trabalho em andamento para ${agent.id}.`,
          });
        }
      }
	    }

  }).then(() => {
    if (agentsToWork.length === 0) {
      const fallbackAssignment = selectMeetingFallbackAssignment(meetingTasks, activeAgents, agentsToWork);
      if (fallbackAssignment) {
        const fallbackClaim = claimTaskForMeeting(
          fallbackAssignment.task,
          fallbackAssignment.agent,
          agentsToWork,
          'reuniao-fallback',
        );
        if (fallbackClaim.ok) {
          io.emit('agent_log', {
            id: 'ceo',
            log: `🧭 Reunião sem claim explícito. Fallback atribuiu ${fallbackAssignment.task.id} para ${fallbackAssignment.agent.name}.`,
          });
        } else {
          io.emit('agent_log', {
            id: 'ceo',
            log: `⚠️ Fallback da reunião não conseguiu assumir ${fallbackAssignment.task.id}: ${fallbackClaim.error}`,
          });
        }
      } else if (meetingTasks.length > 0) {
        io.emit('agent_log', {
          id: 'ceo',
          log: '⚠️ Reunião terminou sem claim válido e sem fallback seguro. O scheduler retomará a distribuição.',
        });
      }
    }

    io.emit('agent_log', { id: 'ceo', log: `✅ Reunião concluída. Agentes indo para a execução!` });
    
    activeAgents.forEach(a => {
      const work = agentsToWork.find(w => w.id === a.id);
      if (work) {
        const task = githubTasks.find((entry) => entry.id === work.taskId) || null;
        const stillLaunchable = Boolean(
          task &&
            task.assignee === a.id &&
            ['in_progress', 'in_review'].includes(String(task.status || '').trim()),
        );
        if (!stillLaunchable) {
          io.emit('agent_log', {
            id: 'ceo',
            log: `⚠️ ${a.name} não iniciará ${work.taskId}: o card mudou para ${task?.status || 'indisponivel'} com assignee ${task?.assignee || 'nenhum'}.`,
          });
          if (!syncAgentAutonomousStatus(a.id)) {
            updateAgent(a.id, 'idle', 'Aguardando ordens...');
          }
          return;
        }
        const taskSnapshot = task || {
          id: work.taskId,
          title: work.taskTitle,
          status: 'in_progress',
        };
        startRalphForAgent(a.id, buildPrimaryTaskRunTitle(taskSnapshot), work.taskId, {
          requestKind: 'primary',
          taskStatus: task?.status || 'in_progress',
        });
      } else if (!syncAgentAutonomousStatus(a.id)) {
        updateAgent(a.id, 'idle', 'Aguardando ordens...');
      }
    });
    scheduleAutonomousDispatch('fim-de-reuniao');

  }).catch(e => {
    console.error("[Reunião] Erro fatal:", e);
    io.emit('agent_log', { id: 'ceo', log: `❌ Erro durante a reunião: ${e.message}` });
    activeAgents.forEach(a => updateAgent(a.id, 'idle', 'Aguardando ordens...'));
    scheduleAutonomousDispatch('erro-de-reuniao');
  });

  res.json({ success: true, message: 'Reunião iniciada.' });
});

// Rota HTTP (Webhook) para seus scripts do CRM enviarem atualizações
app.post('/api/agent_action', (req, res) => {
  const { id, status, task } = req.body;
  if (!id || !status) return res.status(400).json({ error: 'Faltam campos obrigatorios: id, status' });
  console.log(`📥 Webhook recebido: Agente ${id} mudou para ${status} - "${task}"`);
  updateAgent(id, status, task);
  res.status(200).json({ success: true, message: 'Status atualizado e enviado para a UI' });
});

async function startRalphForAgent(id, taskTitle, taskId = null, options = {}) {
  const agent = agents.find((candidate) => candidate.id === id);
  if (!agent || !taskTitle) return;

  const effectiveTaskId = taskId || `NX-MANUAL-${id}-${Date.now()}`;
  const requestKind = options.requestKind || (String(effectiveTaskId).startsWith('NX-HELP-') ? 'collaboration' : 'primary');
  const trackedPrimaryTask =
    requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)
      ? githubTasks.find((task) => task.id === effectiveTaskId) || null
      : null;
  const primaryRunEvaluation =
    requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)
      ? evaluatePrimaryRunLaunch(trackedPrimaryTask, id, { instanceId: CURRENT_INSTANCE_ID })
      : { ok: true, status: options.taskStatus || null };
  const resolvedTaskStatus =
    trackedPrimaryTask?.status || primaryRunEvaluation.status || options.taskStatus || (isReviewTaskTitle(taskTitle) ? 'in_review' : null);
  const runRequest = {
    id,
    taskId: effectiveTaskId,
    taskTitle,
    requestKind,
    taskStatus: resolvedTaskStatus,
    parentTaskId: options.parentTaskId || null,
    requestedBy: options.requestedBy || null,
    queueIfBusy: options.queueIfBusy !== false,
    forceReplace: options.forceReplace === true,
    forceQueue: options.forceQueue === true,
    fromQueue: options.fromQueue === true,
    queuePosition: options.queuePosition === 'front' ? 'front' : 'back',
    retryCount: Number(options.retryCount || 0),
    commandRecoveryCount: Number(options.commandRecoveryCount || 0),
    recoveryHint: options.recoveryHint || null,
    requestId: options.requestId || `${id}:${effectiveTaskId}:${requestKind}`,
  };

  if (!primaryRunEvaluation.ok) {
    removeQueuedRuns(
      id,
      (queuedRun) => queuedRun.requestKind === 'primary' && queuedRun.taskId === effectiveTaskId,
    );
    const rejectionDetail = truncateText(primaryRunEvaluation.reason, 220);

    setAgentLaneState(
      id,
      {
        ...runRequest,
        taskStatus: trackedPrimaryTask?.status || resolvedTaskStatus,
      },
      'cancelled',
      rejectionDetail,
      {
        taskStatus: trackedPrimaryTask?.status || resolvedTaskStatus,
        retryCount: runRequest.retryCount,
        commandRecoveryCount: runRequest.commandRecoveryCount,
        eventName: 'lane.superseded',
        eventStatus: 'superseded',
        data: {
          currentStatus: trackedPrimaryTask?.status || null,
          currentAssignee: trackedPrimaryTask?.assignee || null,
          rejectionCode: primaryRunEvaluation.code,
        },
      },
    );

    io.emit('agent_log', {
      id,
      log: `[SYSTEM] ${rejectionDetail}`,
    });

    if (!syncAgentAutonomousStatus(id)) {
      updateAgent(id, 'idle', 'Aguardando ordens...', {
        currentModel: agent.currentModel || chooseModelForTask(agent, taskTitle),
        workspacePath: null,
        workspaceMode: null,
        activeTaskId: null,
        activeTaskKind: null,
        queueLength: getQueuedRuns(id).length,
      });
    }

    scheduleAutonomousDispatch(`stale-launch:${effectiveTaskId}`);
    return;
  }

  const recentFailurePenalty =
    requestKind === 'primary' && trackedPrimaryTask
      ? getRecentPrimaryTaskFailurePenalty(effectiveTaskId, id)
      : null;
  if (recentFailurePenalty && options.ignoreFailurePenalty !== true) {
    removeQueuedRuns(
      id,
      (queuedRun) => queuedRun.requestKind === 'primary' && queuedRun.taskId === effectiveTaskId,
    );
    const cooldownDetail = truncateText(
      [
        `[SYSTEM] ${effectiveTaskId} segue em quarentena automática após falha ${recentFailurePenalty.failureClass}.`,
        `Última falha há ${formatDurationMs(recentFailurePenalty.ageMs)}.`,
        recentFailurePenalty.lastFailureMessage
          ? `Motivo anterior: ${truncateText(recentFailurePenalty.lastFailureMessage, 100)}.`
          : null,
      ]
        .filter(Boolean)
        .join(' '),
      220,
    );

    setAgentLaneState(
      id,
      {
        ...runRequest,
        taskStatus: trackedPrimaryTask.status || resolvedTaskStatus,
      },
      'cancelled',
      cooldownDetail,
      {
        taskStatus: trackedPrimaryTask.status || resolvedTaskStatus,
        retryCount: runRequest.retryCount,
        commandRecoveryCount: runRequest.commandRecoveryCount,
        eventName: 'lane.cooldown',
        eventStatus: 'suppressed',
        data: {
          failureClass: recentFailurePenalty.failureClass,
          lastFailureAt: recentFailurePenalty.lastFailureAt,
          penaltyWindowMs: PRIMARY_TASK_FAILURE_PENALTY_WINDOW_MS,
          ageMs: recentFailurePenalty.ageMs,
        },
      },
    );

    io.emit('agent_log', {
      id,
      log: cooldownDetail,
    });

    const releasedTask =
      trackedPrimaryTask.assignee === id && isPrimaryActiveStatus(trackedPrimaryTask.status)
        ? releasePrimaryTaskToPool(
            trackedPrimaryTask,
            `🧯 ${effectiveTaskId} liberada após falha recente de ${recentFailurePenalty.failureClass}; aguardando novo ciclo seguro.`,
            {
              status: getPrimaryResetStatus(trackedPrimaryTask),
              assignee: null,
              metricReason: 'recent_failure_penalty',
            },
          )
        : null;
    if (releasedTask) {
      scheduleAutonomousDispatch(`failure-penalty:${effectiveTaskId}`);
    }

    if (!syncAgentAutonomousStatus(id)) {
      updateAgent(id, 'idle', 'Aguardando ordens...', {
        currentModel: agent.currentModel || chooseModelForTask(agent, taskTitle),
        workspacePath: null,
        workspaceMode: null,
        activeTaskId: null,
        activeTaskKind: null,
        queueLength: getQueuedRuns(id).length,
      });
    }
    return;
  }

  if (runRequest.forceQueue) {
    if (
      hasActiveRun(id, effectiveTaskId) ||
      hasScheduledRun(id, effectiveTaskId) ||
      getPreparingRun(id, { includeCancelled: true })?.taskId === effectiveTaskId
    ) {
      syncAgentAutonomousStatus(id);
      return;
    }

    queueRalphRun(runRequest, {
      position: runRequest.queuePosition === 'front' ? 'front' : undefined,
    });
    if (requestKind === 'collaboration') {
      updateInternalTask(effectiveTaskId, (task) => ({ ...task, status: 'backlog', assignee: id }));
    }
    syncAgentAutonomousStatus(id);
    return;
  }

  const activeRun = activeAgentRuns.get(id);
  const preparingRun = getPreparingRun(id, { includeCancelled: true });
  const busyRun = activeRun || preparingRun;
  if (busyRun) {
    if (busyRun.taskId === effectiveTaskId) {
      syncAgentAutonomousStatus(id);
      return;
    }

    if (!runRequest.forceReplace && runRequest.queueIfBusy) {
      if (requestKind === 'primary' && trackedPrimaryTask) {
        releasePrimaryTaskToPool(
          trackedPrimaryTask,
          `🧹 ${agent.name} já está ocupado com ${busyRun.taskId}.`,
          {
            status: getPrimaryResetStatus(trackedPrimaryTask),
            assignee: null,
          },
        );
        io.emit('agent_log', {
          id,
          log: `[SYSTEM] ${trackedPrimaryTask.id} voltou para o pool para outro agente assumir quando houver capacidade.`,
        });
        syncAgentAutonomousStatus(id);
        scheduleAutonomousDispatch(`primary-released:${trackedPrimaryTask.id}`);
        return;
      }

      queueRalphRun(runRequest);
      if (requestKind === 'collaboration') {
        updateInternalTask(effectiveTaskId, (task) => ({ ...task, status: 'backlog', assignee: id }));
      }
      io.emit('agent_log', {
        id,
        log: `[SYSTEM] Nova tarefa enfileirada após ${busyRun.taskId}: ${taskTitle}`,
      });
      syncAgentAutonomousStatus(id);
      return;
    }

    if (!activeRun) {
      if (requestKind === 'primary' && trackedPrimaryTask) {
        releasePrimaryTaskToPool(
          trackedPrimaryTask,
          `🧹 ${agent.name} ainda está preparando ${preparingRun.taskId}.`,
          {
            status: getPrimaryResetStatus(trackedPrimaryTask),
            assignee: null,
          },
        );
        io.emit('agent_log', {
          id,
          log: `[SYSTEM] ${trackedPrimaryTask.id} não ficará em fila com status ativo; o card voltou para redistribuição.`,
        });
        syncAgentAutonomousStatus(id);
        scheduleAutonomousDispatch(`primary-preparing-release:${trackedPrimaryTask.id}`);
        return;
      }

      queueRalphRun(runRequest);
      if (requestKind === 'collaboration') {
        updateInternalTask(effectiveTaskId, (task) => ({ ...task, status: 'backlog', assignee: id }));
      }
      io.emit('agent_log', {
        id,
        log: `[SYSTEM] ${preparingRun.taskId} ainda está preparando workspace. A nova tarefa entrou na fila.`,
      });
      syncAgentAutonomousStatus(id);
      return;
    }

    stopAgentRun(id, `[SYSTEM] Reiniciando loop para a nova tarefa: ${taskTitle}`, {
      taskId: activeRun.taskId,
    });
  }

  if (!runRequest.fromQueue) {
    removeQueuedRuns(id, (queuedRun) => buildRunRequestKey(queuedRun) === buildRunRequestKey(runRequest));
  }

  console.log(`🚀 Iniciando tarefa para o agente ${id} (${agent?.role})...`);

  if (agent.role === 'marketing') {
    io.emit('agent_log', { id, log: '🎬 [CREATIVE ENGINE] Iniciando produção criativa...' });
    try {
      const result = await generateCreativeContent(taskTitle, agent);
      io.emit('agent_log', { id, log: result });
      io.emit('agent_log', { id, log: '✅ [SYSTEM] Produção finalizada.' });
      updateAgent(id, 'idle', 'Trabalho criativo concluído!');
    } catch (error) {
      io.emit('agent_log', { id, log: `❌ [ERROR] Falha no motor criativo: ${error.message}` });
      updateAgent(id, 'error', 'Erro na produção criativa.');
    }
    return;
  }

  const projectContext = resolveProjectContext();
  const modelResolveResult = await runHookPipeline(
    'beforeModelResolve',
    {
      agent,
      taskTitle,
      taskId: effectiveTaskId,
      requestKind,
      fallbackModels: agent.fallbackModels || [],
    },
    {
      projectDir: projectContext.projectDir,
      agent,
      taskTitle,
      taskId: effectiveTaskId,
      requestKind,
      skills: [],
    },
  );
  emitHookDiagnostics(id, 'beforeModelResolve', modelResolveResult);

  let effectiveTaskTitle = String(modelResolveResult.payload?.taskTitle || taskTitle).trim() || taskTitle;
  let effectiveAgent = deriveHookedAgent(agent, modelResolveResult.payload);
  const effectiveFallbackModels = Object.prototype.hasOwnProperty.call(
    modelResolveResult.payload || {},
    'fallbackModels',
  )
    ? normalizeAgentFallbackModels(
        modelResolveResult.payload.fallbackModels,
        effectiveAgent.llmProvider,
      )
    : effectiveAgent.fallbackModels;
  effectiveAgent = normalizeAgentConfig({
    ...effectiveAgent,
    fallbackModels: effectiveFallbackModels,
  });
  runRequest.taskTitle = effectiveTaskTitle;
  const currentPrimaryTaskMeta =
    requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)
      ? getPrimaryTaskRuntimeMeta(effectiveTaskId)
      : null;
  const providerRetryFallbackModels =
    String(currentPrimaryTaskMeta?.lastFailureClass || '').trim().toLowerCase() === 'provider'
      ? normalizeFallbackModels(
          [
            ...effectiveFallbackModels,
            ...readProviderFallbackEntries(effectiveAgent.llmProvider),
          ],
          effectiveAgent.llmProvider,
          {
            agent: effectiveAgent,
            source: 'retry_override',
          },
        )
      : effectiveFallbackModels;
  const providerRetryPreferredCandidate =
    String(currentPrimaryTaskMeta?.lastFailureClass || '').trim().toLowerCase() === 'provider' &&
    providerRetryFallbackModels.length > 0
      ? resolveProviderRetryPreferredCandidate(
          effectiveAgent,
          effectiveTaskTitle,
          providerRetryFallbackModels,
        )
      : null;

  const promptLlm = resolveAgentPromptModel(effectiveAgent, effectiveTaskTitle);
  const rawRuntimePlan = resolveAgentRuntimePlan(
    {
      ...effectiveAgent,
      fallbackModels: effectiveFallbackModels,
    },
    effectiveTaskTitle,
    {
      activeRuntimeCounts: countActiveRuntimeTargets(),
      ...(providerRetryPreferredCandidate
        ? {
            preferredCandidate: providerRetryPreferredCandidate,
            preferredReason:
              `Retentativa de provider em ${effectiveTaskId || effectiveTaskTitle}: ` +
              `promovendo ${formatRuntimeCandidate(providerRetryPreferredCandidate)} como runtime inicial.`,
          }
        : {}),
    },
  );
  const reviewStageRequested =
    resolvedTaskStatus === 'in_review' || isReviewTaskTitle(effectiveTaskTitle);
  const reviewFallbackCandidate =
    reviewStageRequested &&
    rawRuntimePlan.primaryCandidate?.provider === 'gemini' &&
    rawRuntimePlan.initialCandidate?.provider === 'gemini'
      ? rawRuntimePlan.candidates.find((candidate) => candidate && candidate.provider !== 'gemini') || null
      : null;
  const runtimePlan =
    reviewFallbackCandidate
      ? {
          ...rawRuntimePlan,
          initialCandidate: reviewFallbackCandidate,
          fallbackActive: true,
          fallbackReason:
            'Review técnico exige runtime estruturado; Gemini nativo foi trocado pelo próximo fallback não-Gemini.',
        }
      : rawRuntimePlan;
  const autonomousLlm = runtimePlan.initialCandidate;
  const reasoningEffort =
    autonomousLlm.reasoningEffort ||
    resolveAgentReasoningEffort({
      ...effectiveAgent,
      llmProvider: autonomousLlm.provider,
      model: autonomousLlm.model,
    });
  const baseModel = runtimePlan.primaryCandidate?.model || autonomousLlm.model;
  const chosenModel = autonomousLlm.model;
  const runtimeTargets = runtimePlan.candidates
    .map((candidate) => formatRuntimeCandidate(candidate))
    .filter(Boolean);
  const initialFallbackDepth = runtimePlan.fallbackActive ? 1 : 0;
  const runtimeFallbackReason = runtimePlan.fallbackActive
    ? 'Runtime inicial alternado para o próximo candidato disponível da cadeia.'
    : runtimePlan.fallbackReason;
  metrics.trackModelSelection(chosenModel, autonomousLlm.provider);
  const workspacePrepAbortController =
    typeof AbortController === 'function' ? new AbortController() : null;
  const workspacePrepProcesses = new Set();
  const launchContext = {
    taskId: effectiveTaskId,
    taskTitle: effectiveTaskTitle,
    requestKind,
    taskStatus: resolvedTaskStatus,
    parentTaskId: runRequest.parentTaskId,
    requestedBy: runRequest.requestedBy,
    requestId: runRequest.requestId,
    retryCount: runRequest.retryCount,
    commandRecoveryCount: runRequest.commandRecoveryCount,
    cancelled: false,
    workspacePrepAbortController,
    workspacePrepProcesses,
  };

  preparingAgentRuns.set(id, launchContext);
  setAgentLaneState(
    id,
    {
      ...runRequest,
      taskId: effectiveTaskId,
      taskTitle: effectiveTaskTitle,
      requestKind,
      taskStatus: resolvedTaskStatus,
    },
    'preparing_workspace',
    requestKind === 'collaboration'
      ? 'Preparando workspace da colaboracao.'
      : 'Preparando workspace da task.',
    {
      taskStatus: resolvedTaskStatus,
      retryCount: runRequest.retryCount,
      commandRecoveryCount: runRequest.commandRecoveryCount,
      data: {
        runtimeTargets,
        primaryRuntimeTarget: formatRuntimeCandidate(runtimePlan.primaryCandidate),
        initialRuntimeTarget: formatRuntimeCandidate(autonomousLlm),
      },
    },
  );
  if (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)) {
    touchPrimaryTaskRuntimeMeta(effectiveTaskId, {
      lastRunStartedAt: new Date().toISOString(),
      lastAssignedAgentId: id,
      lastAlertAt: null,
    });
  }
  updateAgent(
    id,
    requestKind === 'collaboration' ? 'helping' : 'coding',
    requestKind === 'collaboration'
      ? `Preparando ajuda: ${effectiveTaskTitle}`
      : `Preparando: ${effectiveTaskTitle}`,
    {
      currentModel: chosenModel,
      currentProvider: autonomousLlm.provider,
      currentReasoningEffort: reasoningEffort,
      llmProvider: promptLlm.provider,
      model: promptLlm.model,
      workspacePath: null,
      workspaceMode: 'preparing',
      activeTaskId: effectiveTaskId,
      activeTaskKind: requestKind,
      queueLength: getQueuedRuns(id).length,
      fallbackActive: runtimePlan.fallbackActive,
      fallbackDepth: initialFallbackDepth,
      fallbackReason: runtimeFallbackReason,
    },
  );

  let workspaceInfo;
  const currentPrimaryTaskRecord =
    requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)
      ? githubTasks.find((task) => task.id === effectiveTaskId) || null
      : null;
  const dependencyStartRefs = currentPrimaryTaskRecord
    ? resolvePrimaryTaskDependencyStartRefs(currentPrimaryTaskRecord)
    : [];
  const forceFreshBranch =
    requestKind === 'primary'
    && shouldForceFreshPrimaryTaskBranch(
      currentPrimaryTaskRecord || { id: effectiveTaskId, status: runRequest.taskStatus || null },
      currentPrimaryTaskMeta,
      projectContext,
      runRequest.retryCount,
    );
  try {
    workspaceInfo = await ensureTaskWorkspace(projectContext, {
      agentId: id,
      instanceId: CURRENT_INSTANCE_ID,
      ownerId: CURRENT_INSTANCE_OWNER,
      taskId: effectiveTaskId,
      taskTitle: effectiveTaskTitle,
      phase: currentPrimaryTaskRecord?.phase || runRequest.phase || null,
      requestKind,
      parentTaskId: runRequest.parentTaskId,
      requestedBy: runRequest.requestedBy,
      requestId: runRequest.requestId,
      dependencyStartRefs,
      forceFreshBranch,
      workspaceRunContext: {
        signal: workspacePrepAbortController?.signal || null,
        registerProcess: (processHandle) => {
          if (processHandle) {
            workspacePrepProcesses.add(processHandle);
          }
        },
        unregisterProcess: (processHandle) => {
          if (processHandle) {
            workspacePrepProcesses.delete(processHandle);
          }
        },
      },
    });
  } catch (error) {
    if (preparingAgentRuns.get(id) === launchContext) {
      preparingAgentRuns.delete(id);
    }
    const cancelledDuringPreparation = isPreparationAbortError(error, launchContext);
    clearPreparingRunWorkspaceTracking(launchContext);
    if (cancelledDuringPreparation) {
      startNextQueuedRalphRun(id);
      if (!syncAgentAutonomousStatus(id)) {
        updateAgent(id, 'idle', 'Preparação cancelada pelo orquestrador.', {
          currentModel: baseModel,
          currentProvider: autonomousLlm.provider,
          currentReasoningEffort: reasoningEffort,
          workspacePath: null,
          workspaceMode: null,
          activeTaskId: null,
          activeTaskKind: null,
          queueLength: getQueuedRuns(id).length,
          fallbackActive: runtimePlan.fallbackActive,
          fallbackDepth: initialFallbackDepth,
          fallbackReason: runtimeFallbackReason,
        });
      }
      return;
    }
    const workspaceFailureClass =
      String(error.failureClass || '').trim().toLowerCase() === 'integration'
        ? 'integration'
        : 'workspace';
    const workspaceFailureMessage =
      workspaceFailureClass === 'integration'
        ? truncateText(
            `Workspace bloqueado por drift da base em ${effectiveTaskId}: ${error.message}`,
            320,
          )
        : `Falha ao preparar workspace: ${error.message}`;
    setAgentLaneState(
      id,
      {
        ...runRequest,
        taskId: effectiveTaskId,
        taskTitle: effectiveTaskTitle,
        requestKind,
        taskStatus: resolvedTaskStatus,
      },
      'failed',
      workspaceFailureMessage,
      {
        taskStatus: resolvedTaskStatus,
        failureClass: workspaceFailureClass,
        failureMessage: workspaceFailureMessage,
        retryCount: runRequest.retryCount,
        commandRecoveryCount: runRequest.commandRecoveryCount,
      },
    );
    if (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)) {
      recordPrimaryTaskFailure(
        effectiveTaskId,
        id,
        workspaceFailureClass,
        workspaceFailureMessage,
        'failed',
        {
          failedBaseBranch: resolveCurrentPrimaryTaskBaseBranch(projectContext),
        },
      );
      if (workspaceFailureClass === 'integration') {
        const releasedTask = releasePrimaryTaskToPool(
          currentPrimaryTaskRecord,
          `⚠️ ${effectiveTaskId} nao iniciou porque a branch da task divergiu da base aprovada.`,
          {
            status: 'ready',
            assignee: id,
            metricReason: 'workspace_base_sync_failure',
          },
        );
        if (releasedTask) {
          scheduleAutonomousDispatch(`workspace-base-sync:${effectiveTaskId}`);
        }
      }
    }
    if (requestKind === 'collaboration') {
      updateInternalTask(effectiveTaskId, (task) => ({ ...task, status: 'backlog', assignee: id }));
    }
    io.emit('agent_log', {
      id,
      log:
        workspaceFailureClass === 'integration'
          ? `[SYSTEM] Workspace bloqueado por conflito com a base: ${error.message}`
          : `[ERROR] Falha ao preparar workspace isolado: ${error.message}`,
    });
    updateAgent(
      id,
      workspaceFailureClass === 'integration' ? 'idle' : 'error',
      workspaceFailureClass === 'integration'
        ? 'Workspace bloqueado por drift da base.'
        : 'Falha ao preparar workspace isolado.',
      {
      currentModel: chosenModel,
      currentProvider: autonomousLlm.provider,
      currentReasoningEffort: reasoningEffort,
      workspacePath: null,
      workspaceMode: null,
      activeTaskId: effectiveTaskId,
      activeTaskKind: requestKind,
      queueLength: getQueuedRuns(id).length,
      fallbackActive: runtimePlan.fallbackActive,
      fallbackDepth: initialFallbackDepth,
      fallbackReason: runtimeFallbackReason,
      },
    );
    startNextQueuedRalphRun(id);
    return;
  }

  if (preparingAgentRuns.get(id) === launchContext) {
    preparingAgentRuns.delete(id);
  }
  clearPreparingRunWorkspaceTracking(launchContext);

  if (launchContext.cancelled) {
    try {
      await cleanupTaskWorkspace(projectContext, workspaceInfo);
    } catch (error) {
      io.emit('agent_log', { id, log: `[WARNING] Falha ao limpar workspace cancelado: ${error.message}` });
    }

    startNextQueuedRalphRun(id);
    if (!syncAgentAutonomousStatus(id)) {
      updateAgent(id, 'idle', 'Preparação cancelada pelo orquestrador.', {
        currentModel: baseModel,
        workspacePath: null,
        workspaceMode: null,
        activeTaskId: null,
        activeTaskKind: null,
        queueLength: getQueuedRuns(id).length,
      });
    }
    return;
  }

  if (reviewStageRequested) {
    try {
      const reviewRuntime = ensureReviewWorkspaceRuntime(workspaceInfo.path);
      if (reviewRuntime.prepared) {
        io.emit('agent_log', {
          id,
          log: reviewRuntime.reused
            ? `[SYSTEM] Runtime de review reutilizado em ${reviewRuntime.reviewVenvDir}.`
            : `[SYSTEM] Runtime de review preparado em ${reviewRuntime.reviewVenvDir}.`,
        });
      }
    } catch (error) {
      const reviewRuntimeFailureMessage = truncateText(
        `Falha ao preparar runtime de review: ${error.message}`,
        320,
      );

      setAgentLaneState(
        id,
        {
          ...runRequest,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          taskStatus: resolvedTaskStatus,
        },
        'failed',
        reviewRuntimeFailureMessage,
        {
          taskStatus: resolvedTaskStatus,
          failureClass: 'workspace',
          failureMessage: reviewRuntimeFailureMessage,
          retryCount: runRequest.retryCount,
          commandRecoveryCount: runRequest.commandRecoveryCount,
        },
      );

      if (requestKind === 'primary' && currentPrimaryTaskRecord?.status === 'in_review') {
        const releasedTask = releasePrimaryTaskToPool(
          currentPrimaryTaskRecord,
          `⚠️ Review ${effectiveTaskId} falhou ao preparar o runtime de validacao e seguira em review para nova tentativa.`,
          {
            status: 'in_review',
            assignee: null,
            metricReason: 'review_runtime_prep_failure',
          },
        );
        if (releasedTask) {
          scheduleAutonomousDispatch(`review-runtime:${effectiveTaskId}`);
        }
      }

      io.emit('agent_log', {
        id,
        log: `[ERROR] ${reviewRuntimeFailureMessage}`,
      });
      updateAgent(
        id,
        'error',
        'Falha ao preparar runtime de review.',
        {
          currentModel: chosenModel,
          currentProvider: autonomousLlm.provider,
          currentReasoningEffort: reasoningEffort,
          workspacePath: workspaceInfo.path,
          workspaceMode: workspaceInfo.workspaceKind,
          activeTaskId: effectiveTaskId,
          activeTaskKind: requestKind,
          queueLength: getQueuedRuns(id).length,
          fallbackActive: runtimePlan.fallbackActive,
          fallbackDepth: initialFallbackDepth,
          fallbackReason: runtimeFallbackReason,
        },
      );
      startNextQueuedRalphRun(id);
      return;
    }
  }

  const conflictingRun = Array.from(activeAgentRuns.entries()).find(([, currentRun]) =>
    currentRun.workspaceInfo?.workspaceKey === workspaceInfo.workspaceKey,
  );
  if (conflictingRun && runRequest.queueIfBusy) {
    queueRalphRun(runRequest);
    io.emit('agent_log', {
      id,
      log: `[SYSTEM] Workspace ${workspaceInfo.path} já está em uso. A tarefa entrou na fila de ${id}.`,
    });
    return;
  }

  const projectDir = workspaceInfo.path;
  console.log(`📂 Rodando loop autônomo no diretório: ${projectDir}`);
  if (runtimeFallbackReason) {
    io.emit('agent_log', {
      id,
      log: `[SYSTEM] ${runtimeFallbackReason} Configurado: ${promptLlm.provider}/${promptLlm.model}. Runtime inicial desta lane: ${autonomousLlm.provider}/${chosenModel}.`,
    });
  }

  const isGeminiRuntime = autonomousLlm.provider === 'gemini';
  const ralphIncludeDirs = getRalphIncludeDirectories();
  const installedRalphDir = ralphIncludeDirs.find((dir) =>
    dir.includes(`${path.sep}.gemini${path.sep}extensions${path.sep}ralph`),
  );
  markRalphInstallationStatus(Boolean(installedRalphDir));
  const useRalphExtension = Boolean(
    isGeminiRuntime &&
      installedRalphDir &&
      RALPH_EXTENSION_ENABLED &&
      !ralphRuntimeState.disabled &&
      Number(runRequest.commandRecoveryCount || 0) === 0,
  );
  const effectiveRalphDirs = useRalphExtension ? [installedRalphDir] : [];

  const resolvedSkills = resolveApplicableSkills({
    projectDir,
    taskTitle: effectiveTaskTitle,
    agent: effectiveAgent,
    skillRoots: defaultSkillRoots(projectDir),
  });
  const skillIds = resolvedSkills.map((skill) => skill.id);
  const skillsPrompt = buildSkillsPrompt(resolvedSkills);
  const laneHookContext = {
    projectDir,
    workspaceDir: projectDir,
    agent: effectiveAgent,
    taskTitle: effectiveTaskTitle,
    taskId: effectiveTaskId,
    taskStatus: resolvedTaskStatus,
    requestKind,
    runtimeTargets,
    commandRecoveryCount: Number(runRequest.commandRecoveryCount || 0),
    recoveryHint: runRequest.recoveryHint || null,
    skills: resolvedSkills,
  };
  const laneStartHookResult = await runHookPipeline(
    'beforeLaneStart',
    {
      taskId: effectiveTaskId,
      taskTitle: effectiveTaskTitle,
      taskStatus: resolvedTaskStatus,
      requestKind,
      workspaceDir: projectDir,
      runtimeTargets,
      initialRuntimeTarget: formatRuntimeCandidate(autonomousLlm),
      commandRecoveryCount: Number(runRequest.commandRecoveryCount || 0),
      recoveryHint: runRequest.recoveryHint || null,
      skillIds,
    },
    laneHookContext,
  );
  emitHookDiagnostics(id, 'beforeLaneStart', laneStartHookResult);
  const contractVerificationCommands = buildSuggestedVerificationCommands(projectDir);

  const promptBuildOptions = {
    ...runRequest,
    taskId: effectiveTaskId,
    taskTitle: effectiveTaskTitle,
    taskStatus: resolvedTaskStatus,
    workspaceDir: projectDir,
    contractVerificationCommands,
    skillIds,
    skillsPrompt,
    runtimeTargets,
  };
  const liveTaskPacket = buildTaskPacket(
    effectiveAgent,
    effectiveTaskTitle,
    effectiveTaskId,
    promptBuildOptions,
  );
  const inspectionRecoveryGuidance = buildInspectionRecoveryGuidance(
    liveTaskPacket,
    projectDir,
    {
      reviewMode: resolvedTaskStatus === 'in_review' || isReviewTaskTitle(effectiveTaskTitle),
    },
  );
  const taskSpecificReadOnlyLimit = resolveTaskSpecificReadOnlyLimit(liveTaskPacket, {
    reviewMode: resolvedTaskStatus === 'in_review' || isReviewTaskTitle(effectiveTaskTitle),
  });
  let autonomousPrompt = useRalphExtension
    ? buildRalphPrompt(effectiveAgent, effectiveTaskTitle, effectiveTaskId, promptBuildOptions)
    : buildExecutionPrompt(effectiveAgent, effectiveTaskTitle, effectiveTaskId, promptBuildOptions);
  const promptHookResult = await runHookPipeline(
    'beforePromptBuild',
    {
      prompt: autonomousPrompt,
      taskId: effectiveTaskId,
      taskTitle: effectiveTaskTitle,
      taskStatus: resolvedTaskStatus,
      requestKind,
      workspaceDir: projectDir,
      runtimeTargets,
      commandRecoveryCount: Number(runRequest.commandRecoveryCount || 0),
      recoveryHint: runRequest.recoveryHint || null,
      skillIds,
    },
    laneHookContext,
  );
  emitHookDiagnostics(id, 'beforePromptBuild', promptHookResult);
  if (promptHookResult.payload?.prompt) {
    autonomousPrompt = String(promptHookResult.payload.prompt).trim();
  }
  if (promptHookResult.payload?.promptPrefix) {
    autonomousPrompt = `${String(promptHookResult.payload.promptPrefix).trim()}\n\n${autonomousPrompt}`;
  }
  if (promptHookResult.payload?.promptSuffix) {
    autonomousPrompt = `${autonomousPrompt}\n\n${String(promptHookResult.payload.promptSuffix).trim()}`;
  }
  let runnerProcess;
  let runnerModeLabel = isGeminiRuntime ? 'Loop nativo Gemini' : `Loop multi-provider (${autonomousLlm.provider})`;
  let runnerLogPrefix = isGeminiRuntime ? 'RALPH' : 'AUTONOMY';

  if (isGeminiRuntime) {
    const geminiArgs = [];

    if (useRalphExtension) {
      ensureWorkspaceGeminiSettings(projectDir, effectiveRalphDirs);
      geminiArgs.push('--extensions', 'ralph');
      effectiveRalphDirs.forEach((directory) => {
        geminiArgs.push('--include-directories', directory);
      });
      runnerModeLabel = 'Ralph loop';
    } else {
      geminiArgs.push('--extensions', 'none');
      if (ralphRuntimeState.disabled && ralphRuntimeState.disabledReason) {
        io.emit('agent_log', {
          id,
          log: `[SYSTEM] Loop nativo do Gemini ativo. Ralph desativado nesta sessão: ${ralphRuntimeState.disabledReason}.`,
        });
      }
    }

    geminiArgs.push('--yolo', '--model', chosenModel, '-p', autonomousPrompt);
    runnerProcess = spawn(GEMINI_EXECUTABLE, geminiArgs, {
      cwd: projectDir,
      env: createGeminiEnv({ GITHUB_TOKEN: process.env.GITHUB_TOKEN }),
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  } else {
    const runnerScriptPath = path.join(__dirname, 'services', 'autonomousToolLoopRunner.js');
    const runtimeFallbackChain = runtimePlan.candidates
      .slice(runtimePlan.fallbackActive ? 0 : 1)
      .filter((candidate) => candidate && candidate.provider !== 'gemini')
      .filter(
        (candidate) =>
          formatRuntimeCandidate(candidate) !== formatRuntimeCandidate(autonomousLlm),
      )
      .map((candidate) => ({
        provider: candidate.provider,
        model: candidate.model,
        reasoningEffort: candidate.reasoningEffort || null,
      }));
    const ignoredGeminiFallbacks = runtimePlan.candidates.filter(
      (candidate) => candidate.provider === 'gemini' && !isGeminiRuntime,
    );
    if (ignoredGeminiFallbacks.length > 0) {
      io.emit('agent_log', {
        id,
        log:
          `[SYSTEM] ${ignoredGeminiFallbacks.length} fallback(s) Gemini nao rodam inline ` +
          'nesta lane multi-provider; eles ficam armados para a proxima retentativa/restart da lane.',
      });
    }
    const runnerConfig = JSON.stringify({
      provider: autonomousLlm.provider,
      model: chosenModel,
      reasoningEffort,
      fallbackChain: runtimeFallbackChain,
      prompt: autonomousPrompt,
      cwd: projectDir,
      taskTitle: effectiveTaskTitle,
      taskId: effectiveTaskId,
      taskStatus: resolvedTaskStatus,
      requestKind,
      commandRecoveryCount: Number(runRequest.commandRecoveryCount || 0),
      recoveryHint: runRequest.recoveryHint || null,
      agent: {
        id: effectiveAgent.id,
        role: effectiveAgent.role,
        team: effectiveAgent.team,
        llmProvider: effectiveAgent.llmProvider,
        model: effectiveAgent.model,
        reasoningEffort: effectiveAgent.reasoningEffort,
        mcps: effectiveAgent.mcps,
        skills: effectiveAgent.skills,
      },
      approvalMode: process.env.NEXUS_EXEC_APPROVAL_MODE || 'warn',
      maxIterations: Number(process.env.NEXUS_AUTONOMOUS_MAX_ITERATIONS || 32),
      inspectionRecoveryGuidance,
      readOnlyStreakLimit: taskSpecificReadOnlyLimit,
    });
    runnerProcess = spawn(process.execPath, [runnerScriptPath], {
      cwd: projectDir,
      env: {
        ...process.env,
        NEXUS_AUTONOMOUS_RUNNER_CONFIG: runnerConfig,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });
  }

  if (requestKind === 'collaboration') {
    updateInternalTask(effectiveTaskId, (task) => ({ ...task, status: 'in_progress', assignee: id }));
  }

  updateAgent(
    id,
    requestKind === 'collaboration' ? 'helping' : 'coding',
    effectiveTaskTitle,
    {
      currentModel: chosenModel,
      currentProvider: autonomousLlm.provider,
      currentReasoningEffort: reasoningEffort,
      llmProvider: promptLlm.provider,
      model: promptLlm.model,
      workspacePath: projectDir,
      workspaceMode: workspaceInfo.workspaceKind,
      activeTaskId: effectiveTaskId,
      activeTaskKind: requestKind,
      queueLength: getQueuedRuns(id).length,
      fallbackActive: runtimePlan.fallbackActive,
      fallbackDepth: initialFallbackDepth,
      fallbackReason: runtimeFallbackReason,
    },
  );
  io.emit('agent_log', {
    id,
    log: `🧠 [AUTONOMIA] Runtime ${autonomousLlm.provider}/${chosenModel}. ${runnerModeLabel} iniciado em ${projectDir}.${skillIds.length > 0 ? ` Skills: ${skillIds.join(', ')}.` : ''}`,
  });

  let adminPendingDetected = false;
  let completionDetected = false;
  let reviewRejected = false;
  const runContext = {
    process: runnerProcess,
    taskId: effectiveTaskId,
    taskTitle: effectiveTaskTitle,
    requestKind,
    parentTaskId: runRequest.parentTaskId,
    requestedBy: runRequest.requestedBy,
    stoppedBySystem: false,
    usesRalphExtension: useRalphExtension,
    workspaceInfo,
    projectContext,
    pendingActionBuffer: '',
    recentSignalBuffer: '',
    handledActions: new Set(),
    retryCount: runRequest.retryCount,
    transientFailureDetected: false,
    commandRecoveryCount: runRequest.commandRecoveryCount,
    commandParsingFailureDetected: false,
    commandParsingFailureCount: 0,
    commandRecoveryForced: false,
    lastCommandParsingFailureAt: null,
    lastNormalOutputAt: null,
    recoveryHint: runRequest.recoveryHint || null,
    lastErrorOutput: '',
    internalEventBuffer: '',
    pendingToolCall: null,
    successfulVerificationCommands: [],
    failedVerificationCommands: [],
    runtimePlan,
    runtimeCandidate: {
      provider: autonomousLlm.provider,
      model: chosenModel,
      reasoningEffort,
    },
    initialFallbackDepth,
    currentFallbackDepth: initialFallbackDepth,
    effectiveAgent,
    skillIds,
    hookContext: laneHookContext,
  };
  activeAgentRuns.set(id, runContext);
  setAgentLaneState(
    id,
    {
      ...runRequest,
      taskId: effectiveTaskId,
      taskTitle: effectiveTaskTitle,
      requestKind,
      taskStatus: resolvedTaskStatus,
    },
    'running',
    requestKind === 'collaboration'
      ? 'Colaboracao em execucao.'
      : 'Loop autonomo iniciado.',
    {
      taskStatus: resolvedTaskStatus,
      retryCount: runContext.retryCount,
      commandRecoveryCount: runContext.commandRecoveryCount,
      data: {
        runtimeTargets,
        initialRuntimeTarget: formatRuntimeCandidate(autonomousLlm),
        currentRuntimeTarget: formatRuntimeCandidate(autonomousLlm),
        skillIds,
      },
    },
  );
  ensureTaskContractFiles({
    projectDir: resolveProjectDir(),
    workspaceDir: projectDir,
    taskPacket: liveTaskPacket,
    verificationCommands: contractVerificationCommands,
    progress: {
      phase:
        resolvedTaskStatus === 'in_review' || isReviewTaskTitle(effectiveTaskTitle)
          ? 'in_review'
          : 'implementing',
      detail:
        resolvedTaskStatus === 'in_review' || isReviewTaskTitle(effectiveTaskTitle)
          ? 'Review iniciado com contrato persistente ativo.'
          : requestKind === 'collaboration'
            ? 'Colaboracao iniciada com contrato persistente ativo.'
            : 'Implementacao iniciada com contrato persistente ativo.',
      boardStatus: resolvedTaskStatus || liveTaskPacket.boardStatus || null,
      laneState: 'running',
      agentId: id,
      agentRole: effectiveAgent?.role || null,
    },
  });
  if (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)) {
    touchPrimaryTaskRuntimeMeta(effectiveTaskId, {
      lastRunStartedAt: new Date().toISOString(),
      lastAssignedAgentId: id,
      lastAlertAt: null,
      });
  }

  const recordLaneProgress = (detail, progressData = {}) => {
    const message = String(detail || '').trim();
    if (!message) return;

    setAgentLaneState(
      id,
      {
        ...runRequest,
        taskId: effectiveTaskId,
        taskTitle: effectiveTaskTitle,
        requestKind,
        taskStatus: resolvedTaskStatus,
      },
      'running',
      message,
      {
        taskStatus: resolvedTaskStatus,
        retryCount: runContext.retryCount,
        commandRecoveryCount: runContext.commandRecoveryCount,
        data: {
          runtimeTargets,
          currentRuntimeTarget: formatRuntimeCandidate(runContext.runtimeCandidate),
          fallbackDepth: runContext.currentFallbackDepth,
          skillIds,
          ...(progressData && typeof progressData === 'object' ? progressData : {}),
        },
      },
    );

    if (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)) {
      touchPrimaryTaskRuntimeMeta(effectiveTaskId, {
        lastOutputAt: new Date().toISOString(),
        lastAssignedAgentId: id,
      });
    }
  };

  const resolveRuntimeReasoningEffort = (candidate, fallbackValue = null) => {
    if (candidate && Object.prototype.hasOwnProperty.call(candidate, 'reasoningEffort')) {
      return candidate.reasoningEffort;
    }
    return fallbackValue;
  };

  const handleLoopOutput = (rawOutput, isError = false) => {
    const rawText = rawOutput.toString();
    if (!rawText) return;
    const protocolChunk = consumeRuntimeEventBuffer(runContext.internalEventBuffer, rawText);
    runContext.internalEventBuffer = protocolChunk.buffer;
    (protocolChunk.events || []).forEach((event) => {
      if (event.type === 'runtime.selected') {
        runContext.runtimeCandidate = {
          provider: event.provider || runContext.runtimeCandidate?.provider || autonomousLlm.provider,
          model: event.model || runContext.runtimeCandidate?.model || chosenModel,
          reasoningEffort: Object.prototype.hasOwnProperty.call(event, 'reasoningEffort')
            ? event.reasoningEffort
            : resolveRuntimeReasoningEffort(runContext.runtimeCandidate, reasoningEffort),
        };
        runContext.currentFallbackDepth =
          Number(runContext.initialFallbackDepth || 0) + Number(event.fallbackDepth || 0);
        updateAgent(
          id,
          requestKind === 'collaboration' ? 'helping' : 'coding',
          effectiveTaskTitle,
          {
            currentProvider: runContext.runtimeCandidate.provider,
            currentModel: runContext.runtimeCandidate.model,
            currentReasoningEffort: runContext.runtimeCandidate.reasoningEffort,
            fallbackActive: runContext.currentFallbackDepth > 0,
            fallbackDepth: runContext.currentFallbackDepth,
            fallbackReason:
              runContext.currentFallbackDepth > 0
                ? 'Lane em fallback chain.'
                : runtimeFallbackReason,
            workspacePath: projectDir,
            workspaceMode: workspaceInfo.workspaceKind,
            activeTaskId: effectiveTaskId,
            activeTaskKind: requestKind,
            queueLength: getQueuedRuns(id).length,
          },
        );
        return;
      }

      if (event.type === 'runtime.fallback') {
        if (!event.internalRecovery) {
          markRuntimeCandidateFailure(
            {
              provider: event.fromProvider,
              model: event.fromModel,
            },
            {
              reason: event.message || 'falha de provider/modelo',
              agentId: id,
              taskId: effectiveTaskId,
            },
          );
        }
        runContext.runtimeCandidate = {
          provider: event.toProvider || runContext.runtimeCandidate?.provider || autonomousLlm.provider,
          model: event.toModel || runContext.runtimeCandidate?.model || chosenModel,
          reasoningEffort: Object.prototype.hasOwnProperty.call(event, 'toReasoningEffort')
            ? event.toReasoningEffort
            : resolveRuntimeReasoningEffort(runContext.runtimeCandidate, reasoningEffort),
        };
        runContext.currentFallbackDepth =
          Number(runContext.initialFallbackDepth || 0) + Number(event.fallbackDepth || 0);
        setAgentLaneState(
          id,
          {
            ...runRequest,
            taskId: effectiveTaskId,
            taskTitle: effectiveTaskTitle,
            requestKind,
            taskStatus: resolvedTaskStatus,
          },
          'running',
          `Failover automático para ${runContext.runtimeCandidate.provider}/${runContext.runtimeCandidate.model}.`,
          {
            taskStatus: resolvedTaskStatus,
            retryCount: runContext.retryCount,
            commandRecoveryCount: runContext.commandRecoveryCount,
            data: {
              runtimeTargets,
              currentRuntimeTarget: formatRuntimeCandidate(runContext.runtimeCandidate),
              failedRuntimeTarget:
                event.fromProvider && event.fromModel
                  ? formatRuntimeCandidate({
                      provider: event.fromProvider,
                      model: event.fromModel,
                    })
                  : null,
              fallbackDepth: runContext.currentFallbackDepth,
              skillIds,
            },
          },
        );
        updateAgent(
          id,
          requestKind === 'collaboration' ? 'helping' : 'coding',
          effectiveTaskTitle,
          {
            currentProvider: runContext.runtimeCandidate.provider,
            currentModel: runContext.runtimeCandidate.model,
            currentReasoningEffort: runContext.runtimeCandidate.reasoningEffort,
            fallbackActive: true,
            fallbackDepth: runContext.currentFallbackDepth,
            fallbackReason: event.message || 'Lane em fallback chain.',
            workspacePath: projectDir,
            workspaceMode: workspaceInfo.workspaceKind,
            activeTaskId: effectiveTaskId,
            activeTaskKind: requestKind,
            queueLength: getQueuedRuns(id).length,
          },
        );
        return;
      }

      if (event.type === 'tool.policy') {
        io.emit('agent_log', {
          id,
          log: `[SYSTEM] Guardrail ${event.verdict} para ${event.toolName}: ${event.message || 'regra acionada'}`,
        });
        return;
      }

      if (event.type === 'status') {
        recordLaneProgress(
          event.message || `Iteração ${event.iteration || '?'} em execução.`,
          {
            progressType: 'status',
            iteration: Number.isFinite(Number(event.iteration))
              ? Number(event.iteration)
              : null,
          },
        );
        return;
      }

      if (event.type === 'tool_call') {
        const toolName = String(event.toolName || '').trim();
        runContext.pendingToolCall = {
          toolName: toolName || null,
          verification: detectVerificationCommand(toolName, event.input),
        };
        recordLaneProgress(
          toolName ? `Executando ${toolName}.` : 'Executando ferramenta da lane.',
          {
            progressType: 'tool_call',
            toolName: toolName || null,
            iteration: Number.isFinite(Number(event.iteration))
              ? Number(event.iteration)
              : null,
          },
        );
        return;
      }

      if (event.type === 'tool_result') {
        const toolName = String(event.toolName || '').trim();
        const pendingToolCall = runContext.pendingToolCall;
        if (pendingToolCall?.verification?.matched && pendingToolCall.verification.command) {
          const collection = event.isError
            ? runContext.failedVerificationCommands
            : runContext.successfulVerificationCommands;
          if (!collection.includes(pendingToolCall.verification.command)) {
            collection.push(pendingToolCall.verification.command);
          }
        }
        runContext.pendingToolCall = null;
        recordLaneProgress(
          event.isError
            ? (toolName ? `Erro em ${toolName}.` : 'Ferramenta retornou erro.')
            : (toolName ? `Ferramenta concluída: ${toolName}.` : 'Ferramenta concluída.'),
          {
            progressType: 'tool_result',
            toolName: toolName || null,
            toolError: Boolean(event.isError),
            iteration: Number.isFinite(Number(event.iteration))
              ? Number(event.iteration)
              : null,
          },
        );
        return;
      }

      if (event.type === 'assistant_text') {
        recordLaneProgress('Modelo respondeu e prosseguiu com a task.', {
          progressType: 'assistant_text',
          iteration: Number.isFinite(Number(event.iteration))
            ? Number(event.iteration)
            : null,
        });
      }
    });

    const loopText = protocolChunk.text;
    if (!loopText) return;

    runContext.recentSignalBuffer = appendSlidingBuffer(runContext.recentSignalBuffer, loopText);
    const recentSignalText = runContext.recentSignalBuffer;
    const currentChunkHasCommandFailure = isCommandParsingFailureOutput(loopText);

    if (!adminPendingDetected && detectAdminPendingMarker(recentSignalText, process.env)) {
      adminPendingDetected = true;
    }

    if (!adminPendingDetected && !reviewRejected && detectRejectionMarker(recentSignalText, process.env)) {
      reviewRejected = true;
    }

    if (!adminPendingDetected && !completionDetected && !reviewRejected && detectCompletionMarker(recentSignalText, process.env)) {
      completionDetected = true;
    }

    if (!runContext.transientFailureDetected && isTransientModelFailure(recentSignalText)) {
      runContext.transientFailureDetected = true;
    }

    if (isCommandParsingFailureOutput(recentSignalText)) {
      if (!runContext.commandParsingFailureDetected) {
        runContext.commandParsingFailureDetected = true;
        runContext.recoveryHint = deriveCommandRecoveryHint(recentSignalText, runContext.recoveryHint);
      }
      if (currentChunkHasCommandFailure) {
        runContext.commandParsingFailureCount = Number(runContext.commandParsingFailureCount || 0) + 1;
      }
      runContext.lastCommandParsingFailureAt = Date.now();
      if (runContext.usesRalphExtension) {
        recordRalphOperationalFailure(
          effectiveTaskId,
          `falha de parsing de shell detectada em ${effectiveTaskId}`,
        );
      }
    }

    if (runContext.usesRalphExtension && isRalphExtensionFailureOutput(recentSignalText)) {
      recordRalphOperationalFailure(
        effectiveTaskId,
        `falha operacional da extensão Ralph detectada em ${effectiveTaskId}`,
      );
    }

    const output = cleanGeminiOutput(loopText);
    const cleanedOutputHasCommandFailure = Boolean(
      output && isCommandParsingFailureOutput(output),
    );

    if (cleanedOutputHasCommandFailure && !currentChunkHasCommandFailure) {
      runContext.commandParsingFailureDetected = true;
      runContext.recoveryHint = deriveCommandRecoveryHint(output, runContext.recoveryHint);
      runContext.commandParsingFailureCount = Number(runContext.commandParsingFailureCount || 0) + 1;
      runContext.lastCommandParsingFailureAt = Date.now();
      if (runContext.usesRalphExtension) {
        recordRalphOperationalFailure(
          effectiveTaskId,
          `falha de parsing de shell detectada em ${effectiveTaskId}`,
        );
      }
    }

    if (
      runContext.commandParsingFailureDetected &&
      Number(runContext.commandParsingFailureCount || 0) >= 1 &&
      !runContext.commandRecoveryForced &&
      canContinueTask(effectiveTaskId, id, requestKind)
    ) {
      runContext.commandRecoveryForced = true;
      io.emit('agent_log', {
        id,
        log: `[SYSTEM] Falha de parsing de shell detectada em ${effectiveTaskId}. Encerrando o loop atual para reiniciar com instrução corretiva.`,
      });
      setImmediate(() => {
        if (!runnerProcess.killed) {
          runnerProcess.kill();
        }
      });
    }

    if (!output) return;

    if (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)) {
      touchPrimaryTaskRuntimeMeta(effectiveTaskId, {
        lastOutputAt: new Date().toISOString(),
        lastAssignedAgentId: id,
      });
    }

    processAutonomousActions(id, runContext, output);

    if (isError) {
      runContext.lastErrorOutput = output;
    } else {
      runContext.lastNormalOutputAt = Date.now();
    }

    if (isError) {
      console.error(`[${runnerLogPrefix} ${id} ERR]:`, output);
      io.emit('agent_log', { id, log: `[ERROR] ${output}` });
    } else {
      console.log(`[${runnerLogPrefix} ${id}]:`, output);
      io.emit('agent_log', { id, log: output });
    }

    const normalizedOutput = output.toLowerCase();
    const activeRuntimeModel = runContext.runtimeCandidate?.model || chosenModel;
    const activeRuntimeProvider = runContext.runtimeCandidate?.provider || autonomousLlm.provider;
    const activeRuntimeReasoning = resolveRuntimeReasoningEffort(
      runContext.runtimeCandidate,
      reasoningEffort,
    );
    if (
      isError ||
      normalizedOutput.includes('unknown argument') ||
      normalizedOutput.includes('error') ||
      normalizedOutput.includes('failed')
    ) {
      updateAgent(id, 'error', 'Detectou um erro, tentando consertar...', {
        currentModel: activeRuntimeModel,
        currentProvider: activeRuntimeProvider,
        currentReasoningEffort: activeRuntimeReasoning,
        workspacePath: projectDir,
        activeTaskId: effectiveTaskId,
        activeTaskKind: requestKind,
        fallbackActive: runContext.currentFallbackDepth > 0,
        fallbackDepth: runContext.currentFallbackDepth,
        fallbackReason:
          runContext.currentFallbackDepth > 0
            ? 'Lane em fallback chain.'
            : runtimeFallbackReason,
      });
    } else {
      updateAgent(
        id,
        requestKind === 'collaboration' ? 'helping' : 'coding',
        effectiveTaskTitle,
        {
          currentModel: activeRuntimeModel,
          currentProvider: activeRuntimeProvider,
          currentReasoningEffort: activeRuntimeReasoning,
          workspacePath: projectDir,
          activeTaskId: effectiveTaskId,
          activeTaskKind: requestKind,
          queueLength: getQueuedRuns(id).length,
          fallbackActive: runContext.currentFallbackDepth > 0,
          fallbackDepth: runContext.currentFallbackDepth,
          fallbackReason:
            runContext.currentFallbackDepth > 0
              ? 'Lane em fallback chain.'
              : runtimeFallbackReason,
        },
      );
    }
  };

  runnerProcess.stdout.on('data', (data) => handleLoopOutput(data, false));
  runnerProcess.stderr.on('data', (data) => handleLoopOutput(data, true));

  runnerProcess.on('error', (error) => {
    if (activeAgentRuns.get(id) === runContext) {
      activeAgentRuns.delete(id);
    }
    markRuntimeCandidateFailure(runContext.runtimeCandidate, {
      reason: error.message,
      agentId: id,
      taskId: effectiveTaskId,
    });
    setAgentLaneState(
      id,
      {
        ...runRequest,
        taskId: effectiveTaskId,
        taskTitle: effectiveTaskTitle,
        requestKind,
        taskStatus: resolvedTaskStatus,
      },
      'failed',
      `Falha ao iniciar o loop autonomo: ${error.message}`,
      {
        taskStatus: resolvedTaskStatus,
        failureClass: 'provider',
        failureMessage: error.message,
        retryCount: runContext.retryCount,
        commandRecoveryCount: runContext.commandRecoveryCount,
      },
    );
    if (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)) {
      recordPrimaryTaskFailure(
        effectiveTaskId,
        id,
        'provider',
        `Falha ao iniciar o loop autonomo: ${error.message}`,
      );
    }
    if (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)) {
      touchPrimaryTaskRuntimeMeta(effectiveTaskId, {
        lastOutputAt: new Date().toISOString(),
      });
    }

    console.error(`[${runnerLogPrefix} ${id}] Falha ao iniciar:`, error);
    io.emit('agent_log', { id, log: `[ERROR] ${error.message}` });
    if (requestKind === 'collaboration') {
      updateInternalTask(effectiveTaskId, (task) => ({ ...task, status: 'backlog', assignee: id }));
    }
    updateAgent(id, 'error', 'Falha ao iniciar o loop autônomo.', {
      currentModel: runContext.runtimeCandidate?.model || baseModel,
      currentProvider: runContext.runtimeCandidate?.provider || autonomousLlm.provider,
      currentReasoningEffort: resolveRuntimeReasoningEffort(
        runContext.runtimeCandidate,
        reasoningEffort,
      ),
      fallbackActive: runContext.currentFallbackDepth > 0,
      fallbackDepth: runContext.currentFallbackDepth,
      fallbackReason:
        runContext.currentFallbackDepth > 0 ? 'Lane em fallback chain.' : runtimeFallbackReason,
    });
    startNextQueuedRalphRun(id);
    scheduleAutonomousDispatch(`erro-ao-iniciar:${id}`);
  });

  runnerProcess.on('close', async (code) => {
    const stoppedBySystem = runContext.stoppedBySystem;
    const closeOwnsActiveRun = activeAgentRuns.get(id) === runContext;
    if (closeOwnsActiveRun) {
      runContext.closing = true;
    }
    const releaseClosedRun = () => {
      if (activeAgentRuns.get(id) === runContext) {
        activeAgentRuns.delete(id);
      }
      runContext.closing = false;
    };
    if (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)) {
      touchPrimaryTaskRuntimeMeta(effectiveTaskId, {
        lastOutputAt: new Date().toISOString(),
      });
    }

    console.log(`✅ Loop autônomo para ${id} finalizado (código ${code})`);
    io.emit('agent_log', { id, log: `[SYSTEM] Loop finalizado com código ${code}` });

    let shouldCleanupWorkspace = false;
    let completionOutcomeHandled = false;
    const currentPrimaryTask =
      requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)
        ? githubTasks.find((task) => task.id === effectiveTaskId) || trackedPrimaryTask
        : null;
    const isReviewStage =
      currentPrimaryTask?.status === 'in_review' ||
      runRequest.taskStatus === 'in_review' ||
      isReviewTaskTitle(effectiveTaskTitle);
    const terminalSignalText = [
      String(runContext.lastErrorOutput || '').trim(),
      String(runContext.recentSignalBuffer || '').trim(),
    ]
      .filter(Boolean)
      .join('\n');
    if (!runContext.transientFailureDetected && isTransientModelFailure(terminalSignalText)) {
      runContext.transientFailureDetected = true;
    }
    const canContinueCurrentTask = canContinueTask(effectiveTaskId, id, requestKind);
    const closeoutPreflight = evaluateRunCloseout({
      completionDetected,
      reviewRejected,
      stoppedBySystem,
      exitCode: code,
      retryCount: runContext.retryCount,
      transientRetryLimit: TRANSIENT_MODEL_RETRY_LIMIT,
      commandRecoveryCount: runContext.commandRecoveryCount,
      commandRecoveryLimit: COMMAND_PARSING_RECOVERY_LIMIT,
      transientFailureDetected: runContext.transientFailureDetected,
      commandParsingFailureDetected: runContext.commandParsingFailureDetected,
      commandRecoveryForced: runContext.commandRecoveryForced,
      lastNormalOutputAt: runContext.lastNormalOutputAt,
      lastCommandParsingFailureAt: runContext.lastCommandParsingFailureAt,
      lastErrorOutput: runContext.lastErrorOutput,
      recoveryHint: runContext.recoveryHint,
      successfulVerificationCount: runContext.successfulVerificationCommands.length,
      failedVerificationCount: runContext.failedVerificationCommands.length,
      transientRetryDelayMs: TRANSIENT_MODEL_RETRY_DELAY_MS,
      transientRetryMaxDelayMs: TRANSIENT_MODEL_RETRY_MAX_DELAY_MS,
      loopContinuationDelayMs: LOOP_CONTINUATION_DELAY_MS,
      canContinue: canContinueCurrentTask,
      currentPrimaryTask: Boolean(currentPrimaryTask),
      isReviewStage,
      integrationResult: null,
    });
    const nextRetryCount =
      closeoutPreflight.transientRecovery?.attempt || Number(runContext.retryCount || 0) + 1;
    const retryDelayMs =
      closeoutPreflight.transientRecovery?.delayMs ||
      Math.min(
        TRANSIENT_MODEL_RETRY_DELAY_MS * nextRetryCount,
        TRANSIENT_MODEL_RETRY_MAX_DELAY_MS,
      );
    const commandRecoveryAttempt =
      closeoutPreflight.commandRecovery?.attempt ||
      Number(runContext.commandRecoveryCount || 0) + 1;
    const commandRecoveryBudget =
      closeoutPreflight.commandRecovery?.recipe?.maxAttempts ||
      COMMAND_PARSING_RECOVERY_LIMIT;
    const transientRecoveryBudget =
      closeoutPreflight.transientRecovery?.recipe?.maxAttempts ||
      TRANSIENT_MODEL_RETRY_LIMIT;
    const closeoutDisposition = closeoutPreflight.disposition;
    const tracksTaskOwnership =
      requestKind === 'collaboration' ||
      (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId));
    const completionSuperseded =
      !stoppedBySystem && completionDetected && tracksTaskOwnership && !canContinueCurrentTask;
    const closeoutCompletionDisposition = completionSuperseded
      ? 'superseded'
      : closeoutPreflight.completionDisposition;
    let settledCompletionDisposition = closeoutCompletionDisposition;
    const finalizeLaneHooks = async (disposition, outcome) => {
      const hookResult = await runHookPipeline(
        'afterLaneClose',
        {
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          exitCode: code,
          completionDetected,
          reviewRejected,
          disposition,
          outcome,
          completionDisposition: settledCompletionDisposition,
          currentRuntimeTarget: formatRuntimeCandidate(runContext.runtimeCandidate),
          fallbackDepth: runContext.currentFallbackDepth,
          skillIds,
        },
        runContext.hookContext,
      );
      emitHookDiagnostics(id, 'afterLaneClose', hookResult);
    };
    if (stoppedBySystem) {
      // Only the run still owning this agent may change its lane or queue.
      // A replacement can already be active when the old process closes.
      if (closeOwnsActiveRun) {
        setAgentLaneState(
          id,
          { ...runRequest, taskId: effectiveTaskId, taskTitle: effectiveTaskTitle },
          'cancelled',
          'Loop pausado pelo orquestrador.',
          {
            taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
            retryCount: runContext.retryCount,
            commandRecoveryCount: runContext.commandRecoveryCount,
          },
        );
      }
      releaseClosedRun();
      if (closeOwnsActiveRun) {
        startNextQueuedRalphRun(id);
        if (!isAgentOccupied(id)) {
          // Syncing an assigned primary task here would replace cancellation
          // with retry_scheduled even though no successor has started.
          updateAgent(id, 'idle', 'Loop pausado pelo orquestrador.', {
            currentModel: baseModel,
            currentProvider: autonomousLlm.provider,
            workspacePath: null,
            workspaceMode: null,
            activeTaskId: null,
            activeTaskKind: null,
            queueLength: getQueuedRuns(id).length,
          });
        }
      }
      try {
        await cleanupTaskWorkspace(projectContext, workspaceInfo);
      } catch (error) {
        io.emit('agent_log', { id, log: `[WARNING] Falha ao limpar workspace: ${error.message}` });
      }
      await finalizeLaneHooks('cancelled', 'cancelled');
      return;
    }

    if (!adminPendingDetected && closeoutDisposition === 'retry_transient') {
      shouldCleanupWorkspace = !closeoutPreflight.preserveWorkspace;
      markRuntimeCandidateFailure(runContext.runtimeCandidate, {
        reason: runContext.lastErrorOutput || 'falha transitória de provider/modelo',
        agentId: id,
        taskId: effectiveTaskId,
      });
      if (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)) {
        recordPrimaryTaskFailure(
          effectiveTaskId,
          id,
          'provider',
          runContext.lastErrorOutput || 'Falha transitória de provider/modelo.',
        );
      }
      queueRalphRun(
        {
          ...runRequest,
          retryCount: nextRetryCount,
          queueIfBusy: true,
        },
        { position: 'front' },
      );
      io.emit('agent_log', {
        id,
        log: `[SYSTEM] Falha transitória do modelo detectada. Retentativa agendada em ${Math.ceil(retryDelayMs / 1000)}s (${nextRetryCount}/${transientRecoveryBudget}).`,
      });
      updateAgent(
        id,
        requestKind === 'collaboration' ? 'helping' : 'coding',
        `Retentativa agendada: ${effectiveTaskTitle}`,
        {
          currentModel: runContext.runtimeCandidate?.model || chosenModel,
          currentProvider: runContext.runtimeCandidate?.provider || autonomousLlm.provider,
          currentReasoningEffort: resolveRuntimeReasoningEffort(
            runContext.runtimeCandidate,
            reasoningEffort,
          ),
          workspacePath: null,
          workspaceMode: null,
          activeTaskId: effectiveTaskId,
          activeTaskKind: requestKind,
          queueLength: getQueuedRuns(id).length,
          fallbackActive: runContext.currentFallbackDepth > 0,
          fallbackDepth: runContext.currentFallbackDepth,
          fallbackReason:
            runContext.currentFallbackDepth > 0
              ? 'Lane em fallback chain.'
              : runtimeFallbackReason,
        },
      );
      setAgentLaneState(
        id,
        {
          ...runRequest,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          taskStatus: resolvedTaskStatus,
        },
        'retry_scheduled',
        `Retentativa de provider agendada em ${Math.ceil(retryDelayMs / 1000)}s.`,
        {
          taskStatus: resolvedTaskStatus,
          failureClass: 'provider',
          retryCount: nextRetryCount,
          commandRecoveryCount: runContext.commandRecoveryCount,
          data: {
            runtimeTargets,
            currentRuntimeTarget: formatRuntimeCandidate(runContext.runtimeCandidate),
            fallbackDepth: runContext.currentFallbackDepth,
            skillIds,
          },
          recovery: {
            attempt: nextRetryCount,
            result: 'scheduled_retry',
            escalated: false,
          },
        },
      );
      setTimeout(() => {
        if (!isAgentOccupied(id)) {
          startNextQueuedRalphRun(id);
        }
      }, retryDelayMs);
    }

    if (adminPendingDetected && currentPrimaryTask) {
      shouldCleanupWorkspace = true;
      completionOutcomeHandled = true;
      const adminPendingMessage =
        `Task ${effectiveTaskId} exige acao humana/admin antes de seguir. O agente estacionou o card em ${RALPH_ADMIN_PENDING_PROMISE}.`;
      const parkedTask = releasePrimaryTaskToPool(
        currentPrimaryTask,
        `🛑 ${effectiveTaskId} depende de ação humana/admin e saiu da execução automática.`,
        {
          status: 'pendente_admin',
          assignee: null,
          ownerId: null,
          ownerInstanceId: null,
          metricReason: 'admin_pending',
        },
      );
      ensureTaskContractFiles({
        projectDir: resolveProjectDir(),
        workspaceDir: projectDir,
        taskPacket: liveTaskPacket,
        verificationCommands: contractVerificationCommands,
        progress: {
          phase: 'blocked',
          detail: adminPendingMessage,
          boardStatus: 'pendente_admin',
          laneState: 'blocked',
          agentId: id,
          agentRole: effectiveAgent?.role || null,
        },
      });
      setAgentLaneState(
        id,
        {
          ...runRequest,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          taskStatus: parkedTask?.status || 'pendente_admin',
        },
        'failed',
        adminPendingMessage,
        {
          taskStatus: parkedTask?.status || 'pendente_admin',
          failureClass: 'admin',
          failureMessage: adminPendingMessage,
          retryCount: runContext.retryCount,
          commandRecoveryCount: runContext.commandRecoveryCount,
          recovery: {
            result: 'admin_pending',
            escalated: true,
          },
        },
      );
      if (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)) {
        recordPrimaryTaskFailure(
          effectiveTaskId,
          id,
          'admin',
          adminPendingMessage,
          'blocked',
        );
      }
      io.emit('agent_log', {
        id,
        log: `[SYSTEM] ${effectiveTaskId} movida para pendente admin após sinal explícito ${RALPH_ADMIN_PENDING_PROMISE}.`,
      });

      releaseClosedRun();
      startNextQueuedRalphRun(id);
      if (!isAgentOccupied(id) && !syncAgentAutonomousStatus(id)) {
        updateAgent(
          id,
          'idle',
          'Aguardando nova task; card estacionado em pendente admin.',
          {
            currentModel: baseModel,
            currentProvider: autonomousLlm.provider,
            workspacePath: null,
            activeTaskId: null,
            activeTaskKind: null,
            queueLength: getQueuedRuns(id).length,
          },
        );
      }
      if (shouldCleanupWorkspace) {
        try {
          await cleanupTaskWorkspace(projectContext, workspaceInfo);
        } catch (error) {
          io.emit('agent_log', { id, log: `[WARNING] Falha ao limpar workspace: ${error.message}` });
        }
      }
      await finalizeLaneHooks('admin_pending', 'blocked');
      return;
    }

    if (
      completionDetected &&
      effectiveTaskId &&
      closeoutCompletionDisposition !== 'rejected_command_failure' &&
      closeoutCompletionDisposition !== 'superseded'
    ) {
      shouldCleanupWorkspace = true;
      let integrationResult = null;

      if (currentPrimaryTask) {
        setAgentLaneState(
          id,
          {
            ...runRequest,
            taskId: effectiveTaskId,
            taskTitle: effectiveTaskTitle,
            requestKind,
            taskStatus: currentPrimaryTask.status,
          },
          'integrating',
          isReviewStage
            ? 'Aplicando resultado final do review.'
            : 'Integrando mudancas reais ao repositório principal.',
          {
            taskStatus: currentPrimaryTask.status,
            retryCount: runContext.retryCount,
            commandRecoveryCount: runContext.commandRecoveryCount,
          },
        );
        integrationResult = await integrateTaskWorkspaceChanges(projectContext, workspaceInfo, {
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          agentId: id,
          stage: isReviewStage ? 'review' : 'implementation',
        });
      }

      const completionCloseout = evaluateRunCloseout({
        completionDetected,
        reviewRejected,
        stoppedBySystem,
        exitCode: code,
        retryCount: runContext.retryCount,
        transientRetryLimit: TRANSIENT_MODEL_RETRY_LIMIT,
        commandRecoveryCount: runContext.commandRecoveryCount,
        commandRecoveryLimit: COMMAND_PARSING_RECOVERY_LIMIT,
        transientFailureDetected: runContext.transientFailureDetected,
        commandParsingFailureDetected: runContext.commandParsingFailureDetected,
        commandRecoveryForced: runContext.commandRecoveryForced,
        lastNormalOutputAt: runContext.lastNormalOutputAt,
        lastCommandParsingFailureAt: runContext.lastCommandParsingFailureAt,
        successfulVerificationCount: runContext.successfulVerificationCommands.length,
        failedVerificationCount: runContext.failedVerificationCommands.length,
        canContinue: canContinueCurrentTask,
        currentPrimaryTask: Boolean(currentPrimaryTask),
        isReviewStage,
        integrationResult,
      });
      const completionDisposition = completionCloseout.completionDisposition;
      settledCompletionDisposition = completionDisposition;
      const completionHadNoIntegratedChanges =
        completionDisposition === 'rejected_no_integrated_changes';
      const completionHadBlockingIntegrationFailure =
        completionDisposition === 'rejected_integration_failure';
      const completionAlreadyMergedIntoBase = Boolean(
        integrationResult?.integrated &&
          String(integrationResult.reason || '').trim() === 'branch-already-merged',
      );

      if (integrationResult?.integrated) {
        setAgentLaneState(
          id,
          {
            ...runRequest,
            taskId: effectiveTaskId,
            taskTitle: effectiveTaskTitle,
            requestKind,
            taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          },
          'integrating',
          `Commit autônomo ${integrationResult.commitSha.slice(0, 7)} criado no workspace isolado.`,
          {
            taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
            retryCount: runContext.retryCount,
            commandRecoveryCount: runContext.commandRecoveryCount,
            eventName: 'lane.commit.created',
            eventStatus: 'green',
            data: {
              commitSha: integrationResult.commitSha,
              targetBranch: integrationResult.targetBranch || null,
              changedFiles: integrationResult.changedFiles || [],
              integrationReason: integrationResult.reason || null,
            },
          },
        );
        setAgentLaneState(
          id,
          {
            ...runRequest,
            taskId: effectiveTaskId,
            taskTitle: effectiveTaskTitle,
            requestKind,
            taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          },
          'integrating',
          'Mudanças reconciliadas no repositório principal.',
          {
            taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
            retryCount: runContext.retryCount,
            commandRecoveryCount: runContext.commandRecoveryCount,
            eventName: 'lane.reconciled',
            eventStatus: 'reconciled',
            data: {
              commitSha: integrationResult.commitSha,
              targetBranch: integrationResult.targetBranch || null,
              changedFiles: integrationResult.changedFiles || [],
              integrationReason: integrationResult.reason || null,
            },
          },
        );
        io.emit('agent_log', {
          id: 'ceo',
          log: `📦 ${effectiveTaskId} integrou mudanças reais no repositório base (${integrationResult.commitSha.slice(0, 7)})${integrationResult.targetBranch ? ` em ${integrationResult.targetBranch}` : ''}.`,
        });
        if (integrationResult.gitlabMirror?.enabled) {
          const gitlabPipeline = integrationResult.gitlabMirror.pipeline || null;
          io.emit('agent_log', {
            id: 'ceo',
            log:
              integrationResult.gitlabMirror.mirrored
                ? `🪞 ${effectiveTaskId} espelhada no GitLab em ${integrationResult.gitlabMirror.projectPath}:${integrationResult.gitlabMirror.branchName}.${gitlabPipeline?.enabled ? ` Pipeline ${gitlabPipeline.triggered ? 'disparado' : 'confirmado'}${gitlabPipeline.pipelineId ? ` (#${gitlabPipeline.pipelineId})` : ''}${gitlabPipeline.status ? ` em ${gitlabPipeline.status}` : ''}.` : ''}`
                : `⚠️ ${effectiveTaskId} integrou no GitHub, mas o espelho GitLab falhou: ${integrationResult.gitlabMirror.details || integrationResult.gitlabMirror.reason}.`,
          });
        }
        if (currentPrimaryTask && integrationResult.targetBranch) {
          updatePrimaryTaskGitLabPipelineState(effectiveTaskId, integrationResult.gitlabMirror?.pipeline || null, {
            publishedBranchName: integrationResult.targetBranch || null,
            publishedBranchRef: buildPrimaryTaskPublishedBranchRef(
              integrationResult.targetBranch,
              integrationResult.remote || null,
            ),
            publishedBaseBranch: integrationResult.baseBranch || null,
            publishedCommitSha: integrationResult.commitSha || null,
            publishedBranchIntegrated: String(integrationResult.reason || '').trim() === 'branch-already-merged',
            publishedBranchReason:
              String(integrationResult.reason || '').trim() === 'branch-already-merged'
                ? 'branch-already-merged'
                : 'branch-has-unabsorbed-commits',
            publishedBranchLockedAt:
              getPrimaryTaskRuntimeMeta(effectiveTaskId)?.publishedBranchLockedAt || new Date().toISOString(),
            publishedBranchUpdatedAt: new Date().toISOString(),
          });
        }
      }

      if (['rejected_no_integrated_changes', 'rejected_integration_failure'].includes(completionDisposition)) {
        completionOutcomeHandled = true;
        const integrationFailureMessage = completionHadNoIntegratedChanges
          ? `Finalizacao rejeitada: ${effectiveTaskId} nao integrou mudancas materiais.`
          : `Falha de integracao automatica em ${effectiveTaskId}: ${integrationResult?.details || integrationResult?.reason || 'desconhecida'}.`;
        if (currentPrimaryTask) {
          recordPrimaryTaskFailure(
            effectiveTaskId,
            id,
            'integration',
            integrationFailureMessage,
          );
          const releasedTask = releasePrimaryTaskToPool(
            currentPrimaryTask,
            completionHadNoIntegratedChanges
              ? `⚠️ ${effectiveTaskId} reportou conclusão sem mudanças integradas no repositório principal.`
              : `⚠️ ${effectiveTaskId} concluiu, mas a integração automática falhou.`,
            {
              status: 'ready',
              assignee: null,
              metricReason: completionHadNoIntegratedChanges
                ? 'empty_completion_requeue'
                : 'integration_failure_requeue',
            },
          );
          if (releasedTask) {
            scheduleAutonomousDispatch(
              completionHadNoIntegratedChanges
                ? `empty-completion:${effectiveTaskId}`
                : `integration-failure:${effectiveTaskId}`,
            );
          }
        }
        setAgentLaneState(
          id,
          {
            ...runRequest,
            taskId: effectiveTaskId,
            taskTitle: effectiveTaskTitle,
            requestKind,
            taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          },
          'failed',
          integrationFailureMessage,
          {
            taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
            failureClass: 'integration',
            failureMessage: integrationFailureMessage,
            retryCount: runContext.retryCount,
            commandRecoveryCount: runContext.commandRecoveryCount,
            recovery: {
              attempt: 1,
              result: 'escalated',
              escalated: true,
            },
          },
        );

        io.emit('agent_log', {
          id,
          log: completionHadNoIntegratedChanges
            ? `[SYSTEM] Finalização de ${effectiveTaskId} rejeitada: nenhuma mudança foi integrada ao repositório principal.`
            : `[SYSTEM] Finalização de ${effectiveTaskId} bloqueada por falha de integração: ${integrationResult?.details || integrationResult?.reason || 'desconhecida'}.`,
        });
      } else if (isInternalTaskId(effectiveTaskId)) {
        completionOutcomeHandled = true;
        clearRuntimeCandidateCooldown(runContext.runtimeCandidate);
        const completedInternalTask = updateInternalTask(
          effectiveTaskId,
          (task) => ({ ...task, status: 'done', assignee: id }),
        );
        if (isGitHubMirroredCollaborationTask(completedInternalTask)) {
          syncGitHubMirroredTaskStatus(completedInternalTask, 'done', id, 'lane-complete');
        }
        setAgentLaneState(
          id,
          {
            ...runRequest,
            taskId: effectiveTaskId,
            taskTitle: effectiveTaskTitle,
            requestKind,
            taskStatus: 'done',
          },
          'completed',
          'Colaboracao concluida com entrega aproveitavel.',
          {
            taskStatus: 'done',
            retryCount: runContext.retryCount,
            commandRecoveryCount: runContext.commandRecoveryCount,
          },
        );
        io.emit('agent_log', {
          id: 'ceo',
          log: `🤝 Colaboração ${effectiveTaskId} concluída por ${effectiveAgent.name}.`,
        });
      } else if (!currentPrimaryTask) {
        completionOutcomeHandled = true;
        clearRuntimeCandidateCooldown(runContext.runtimeCandidate);
        setAgentLaneState(
          id,
          {
            ...runRequest,
            taskId: effectiveTaskId,
            taskTitle: effectiveTaskTitle,
            requestKind,
            taskStatus: resolvedTaskStatus,
          },
          'completed',
          'Execucao autonoma concluida com sucesso.',
          {
            taskStatus: resolvedTaskStatus,
            retryCount: runContext.retryCount,
            commandRecoveryCount: runContext.commandRecoveryCount,
          },
        );
        io.emit('agent_log', {
          id,
          log: `[SYSTEM] Execução autônoma ${effectiveTaskId} concluída com sucesso.`,
        });
      } else if (completionAlreadyMergedIntoBase && completionDisposition === 'accepted') {
        completionOutcomeHandled = true;
        clearRuntimeCandidateCooldown(runContext.runtimeCandidate);
        await finalizeVerifiedPrimaryTask(effectiveTaskId, {
          completedByAgentId: id,
          detail: 'Task absorvida na branch base e consolidada como done.',
          agentRole: effectiveAgent?.role || null,
          logActorId: id,
          logMessage: `[SYSTEM] ${effectiveTaskId} já estava absorvida na branch base. O card foi movido diretamente para Done.`,
        });
        setAgentLaneState(
          id,
          {
            ...runRequest,
            taskId: effectiveTaskId,
            taskTitle: effectiveTaskTitle,
            requestKind,
            taskStatus: 'done',
          },
          'completed',
          'Task já absorvida na base e marcada como done.',
          {
            taskStatus: 'done',
            retryCount: runContext.retryCount,
            commandRecoveryCount: runContext.commandRecoveryCount,
          },
        );
      } else if (isReviewStage && completionDisposition === 'accepted') {
        completionOutcomeHandled = true;
        clearRuntimeCandidateCooldown(runContext.runtimeCandidate);
        clearPrimaryTaskFailureMemory(effectiveTaskId);
        const opencodeReviewGate = await runOpencodeReviewGate({
          env: process.env,
          workspaceDir: projectDir,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          targetBranch: integrationResult?.targetBranch || null,
          baseBranch: integrationResult?.baseBranch || null,
          gitlabProjectPath:
            integrationResult?.gitlabMirror?.projectPath
            || process.env.GITLAB_PROJECT_PATH
            || null,
          verificationCommands: contractVerificationCommands,
          successfulVerificationCommands: runContext.successfulVerificationCommands,
          failedVerificationCommands: runContext.failedVerificationCommands,
        });
        if (opencodeReviewGate.enabled) {
          touchPrimaryTaskRuntimeMeta(effectiveTaskId, {
            lastOpencodeReviewGate: buildPrimaryTaskOpencodeReviewGateMeta(opencodeReviewGate),
          });
          persistRuntimeState();
          io.emit('agent_log', {
            id,
            log:
              opencodeReviewGate.blocking
                ? `[SYSTEM] OpenCode review gate bloqueou ${effectiveTaskId}: ${opencodeReviewGate.summary || 'sem resumo objetivo'}.`
                : `[SYSTEM] OpenCode review gate ${effectiveTaskId}: ${opencodeReviewGate.verdict} (${opencodeReviewGate.summary || 'sem resumo objetivo'}).`,
          });
        }

        if (opencodeReviewGate.blocking) {
          const shouldParkInAdminPending = shouldMoveOpencodeGateResultToAdminPending(opencodeReviewGate);
          const opencodeGateMessage = shouldParkInAdminPending
            ? `OpenCode review gate de ${effectiveTaskId} exigiu intervencao humana/admin: ${opencodeReviewGate.summary || 'sem resumo objetivo'}.`
            : `OpenCode review gate bloqueou a promocao de ${effectiveTaskId}: ${opencodeReviewGate.summary || 'sem resumo objetivo'}.`;

          resetPrimaryTaskPublishedStateForRework(
            effectiveTaskId,
            integrationResult?.gitlabMirror?.pipeline || null,
          );

          if (shouldParkInAdminPending) {
            const parkedTask = releasePrimaryTaskToPool(
              currentPrimaryTask,
              `🛑 OpenCode gate ${effectiveTaskId} exige acao humana/admin.`,
              {
                status: 'pendente_admin',
                assignee: null,
                ownerId: null,
                ownerInstanceId: null,
                metricReason: 'opencode_review_gate_admin_pending',
              },
            );
            ensureTaskContractFiles({
              projectDir: resolveProjectDir(),
              workspaceDir: projectDir,
              taskPacket: liveTaskPacket,
              verificationCommands: contractVerificationCommands,
              progress: {
                phase: 'blocked',
                detail: opencodeGateMessage,
                boardStatus: parkedTask?.status || 'pendente_admin',
                laneState: 'failed',
                agentId: id,
                agentRole: effectiveAgent?.role || null,
              },
            });
            recordPrimaryTaskFailure(
              effectiveTaskId,
              id,
              'admin',
              opencodeGateMessage,
              'blocked',
            );
            setAgentLaneState(
              id,
              {
                ...runRequest,
                taskId: effectiveTaskId,
                taskTitle: effectiveTaskTitle,
                requestKind,
                taskStatus: parkedTask?.status || 'pendente_admin',
              },
              'failed',
              opencodeGateMessage,
              {
                taskStatus: parkedTask?.status || 'pendente_admin',
                failureClass: 'admin',
                failureMessage: opencodeGateMessage,
                retryCount: runContext.retryCount,
                commandRecoveryCount: runContext.commandRecoveryCount,
                recovery: {
                  result: 'admin_pending',
                  escalated: true,
                },
              },
            );
          } else {
            const releasedTask = releasePrimaryTaskToPool(
              currentPrimaryTask,
              `⚠️ OpenCode gate ${effectiveTaskId} reprovou a promocao automatica.`,
              {
                status: 'ready',
                assignee: null,
                ownerId: null,
                ownerInstanceId: null,
                metricReason: 'opencode_review_gate_requeue',
              },
            );
            if (releasedTask) {
              scheduleAutonomousDispatch(`opencode-review-gate:${effectiveTaskId}`);
            }
            ensureTaskContractFiles({
              projectDir: resolveProjectDir(),
              workspaceDir: projectDir,
              taskPacket: liveTaskPacket,
              verificationCommands: contractVerificationCommands,
              progress: {
                phase: 'rejected',
                detail: opencodeGateMessage,
                boardStatus: 'ready',
                laneState: 'failed',
                agentId: id,
                agentRole: effectiveAgent?.role || null,
              },
            });
            recordPrimaryTaskFailure(
              effectiveTaskId,
              id,
              'review',
              opencodeGateMessage,
            );
            setAgentLaneState(
              id,
              {
                ...runRequest,
                taskId: effectiveTaskId,
                taskTitle: effectiveTaskTitle,
                requestKind,
                taskStatus: 'ready',
              },
              'failed',
              opencodeGateMessage,
              {
                taskStatus: 'ready',
                failureClass: 'review',
                failureMessage: opencodeGateMessage,
                retryCount: runContext.retryCount,
                commandRecoveryCount: runContext.commandRecoveryCount,
                recovery: {
                  result: 'opencode_review_gate',
                  escalated: false,
                },
              },
            );
          }
        } else {

          const gitlabPipeline = integrationResult?.gitlabMirror?.pipeline || null;
          const shouldAwaitGitLabGate =
            WORKSPACE_INTEGRATION_MODE === 'branch'
            && Boolean(integrationResult?.targetBranch)
            && Boolean(integrationResult?.gitlabMirror?.enabled)
            && Boolean(integrationResult?.gitlabMirror?.mirrored);

          if (shouldAwaitGitLabGate && (gitlabPipeline?.statusClass === 'failed' || gitlabPipeline?.statusClass === 'blocked')) {
            await requeuePrimaryTaskAfterGitLabFailure(
              currentPrimaryTask,
              `Pipeline GitLab de ${effectiveTaskId} terminou em ${gitlabPipeline?.status || 'estado inválido'}.`,
              {
                failureClass: 'pipeline',
                pipeline: gitlabPipeline,
                metricReason: 'gitlab_pipeline_failed',
                releaseMessage: '⚠️ Pipeline GitLab falhou',
              },
            );
            setAgentLaneState(
              id,
              {
                ...runRequest,
                taskId: effectiveTaskId,
                taskTitle: effectiveTaskTitle,
                requestKind,
                taskStatus: 'ready',
              },
              'failed',
              'Review aprovado, mas o pipeline GitLab falhou e a task voltou para correção.',
              {
                taskStatus: 'ready',
                failureClass: 'pipeline',
                retryCount: runContext.retryCount,
                commandRecoveryCount: runContext.commandRecoveryCount,
              },
            );
          } else if (shouldAwaitGitLabGate) {
            armPrimaryTaskGitLabCiGate(effectiveTaskId, integrationResult, gitlabPipeline);
            updatePrimaryTaskRecord(effectiveTaskId, {
              ...currentPrimaryTask,
              status: 'in_review',
              assignee: null,
              ownerId: null,
              ownerInstanceId: null,
            });
            syncPrimaryTaskStatus(effectiveTaskId, 'in_review', null, 'gitlab-ci-gate', {
              ownerId: null,
              ownerInstanceId: null,
            });
            ensureTaskContractFiles({
              projectDir: resolveProjectDir(),
              workspaceDir: projectDir,
              taskPacket: liveTaskPacket,
              verificationCommands: contractVerificationCommands,
              progress: {
                phase: 'in_review',
                detail: 'Review aprovado; aguardando pipeline GitLab antes do merge e do done.',
                boardStatus: 'in_review',
                laneState: 'completed',
                agentId: id,
                agentRole: effectiveAgent?.role || null,
              },
            });
            setAgentLaneState(
              id,
              {
                ...runRequest,
                taskId: effectiveTaskId,
                taskTitle: effectiveTaskTitle,
                requestKind,
                taskStatus: 'in_review',
              },
              'completed',
              'Review aprovado; aguardando pipeline GitLab antes do merge e do done.',
              {
                taskStatus: 'in_review',
                retryCount: runContext.retryCount,
                commandRecoveryCount: runContext.commandRecoveryCount,
              },
            );
            io.emit('agent_log', {
              id,
              log: `[SYSTEM] Review ${effectiveTaskId} aprovado. O Nexus vai aguardar o GitLab CI antes de mover para Done.`,
            });
            scheduleAutonomousDispatch(`gitlab-ci-gate:${effectiveTaskId}`);
          } else {
            await finalizeVerifiedPrimaryTask(effectiveTaskId, {
              completedByAgentId: id,
              detail: 'Review aprovado com evidencia material e card movido para done.',
              agentRole: effectiveAgent?.role || null,
              logActorId: id,
              logMessage: `[SYSTEM] Review ${effectiveTaskId} finalizado com sucesso e movido para Done.`,
            });
            setAgentLaneState(
              id,
              {
                ...runRequest,
                taskId: effectiveTaskId,
                taskTitle: effectiveTaskTitle,
                requestKind,
                taskStatus: 'done',
              },
              'completed',
              'Review aprovado e card movido para done.',
              {
                taskStatus: 'done',
                retryCount: runContext.retryCount,
                commandRecoveryCount: runContext.commandRecoveryCount,
              },
            );
          }
        }
      } else {
        completionOutcomeHandled = true;
        clearRuntimeCandidateCooldown(runContext.runtimeCandidate);
        clearPrimaryTaskFailureMemory(effectiveTaskId);
        ensureTaskContractFiles({
          projectDir: resolveProjectDir(),
          workspaceDir: projectDir,
          taskPacket: liveTaskPacket,
          verificationCommands: contractVerificationCommands,
          progress: {
            phase: 'in_review',
            detail: 'Implementacao concluida e encaminhada para review automatico.',
            boardStatus: 'in_review',
            laneState: 'completed',
            agentId: id,
            agentRole: effectiveAgent?.role || null,
          },
        });
        setAgentLaneState(
          id,
          {
            ...runRequest,
            taskId: effectiveTaskId,
            taskTitle: effectiveTaskTitle,
            requestKind,
            taskStatus: 'in_review',
          },
          'completed',
          'Implementacao concluida e encaminhada para review automatico.',
          {
            taskStatus: 'in_review',
            retryCount: runContext.retryCount,
            commandRecoveryCount: runContext.commandRecoveryCount,
          },
        );
        handoffPrimaryTaskToReview(currentPrimaryTask, id);
        io.emit('agent_log', {
          id,
          log: `[SYSTEM] Implementação ${effectiveTaskId} concluída. Encaminhando para review automático.`,
        });
      }
    } else if (closeoutCompletionDisposition === 'superseded') {
      shouldCleanupWorkspace = true;
      completionOutcomeHandled = true;
      setAgentLaneState(
        id,
        {
          ...runRequest,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
        },
        'cancelled',
        'Loop concluiu apos a task mudar de dono ou sair do estado ativo; o fechamento foi descartado.',
        {
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          retryCount: runContext.retryCount,
          commandRecoveryCount: runContext.commandRecoveryCount,
          eventName: 'lane.superseded',
          eventStatus: 'superseded',
        },
      );
      io.emit('agent_log', {
        id,
        log: `[SYSTEM] Fechamento de ${effectiveTaskId} descartado porque a task mudou de dono ou saiu do estado ativo.`,
      });
    } else if (
      closeoutDisposition === 'terminal' &&
      !completionDetected &&
      isInternalTaskId(effectiveTaskId)
    ) {
      updateInternalTask(effectiveTaskId, (task) => ({ ...task, status: 'backlog', assignee: id }));
    }

    const effectiveCloseoutDisposition = resolveEffectiveLaneDisposition({
      disposition: closeoutDisposition,
      completionDisposition: settledCompletionDisposition,
      completionOutcomeHandled,
    });

    if (effectiveCloseoutDisposition === 'retry_transient') {
      if (shouldCleanupWorkspace) {
        try {
          await cleanupTaskWorkspace(projectContext, workspaceInfo);
        } catch (error) {
          io.emit('agent_log', { id, log: `[WARNING] Falha ao limpar workspace: ${error.message}` });
        }
      }
      await finalizeLaneHooks('retry_transient', 'requeued');
      releaseClosedRun();
      return;
    }

    if (effectiveCloseoutDisposition === 'retry_command_recovery') {
      queueRalphRun(
        {
          ...runRequest,
          queueIfBusy: true,
          retryCount: 0,
          commandRecoveryCount: commandRecoveryAttempt,
          recoveryHint:
            runContext.recoveryHint ||
            'A última tentativa falhou por parsing de shell. Use comandos completos e explícitos, prefira edit_file/write_file e evite heredoc cru.',
          requestId: `${runRequest.requestId}:shell-recovery:${Date.now()}`,
        },
        { position: 'front' },
      );
      io.emit('agent_log', {
        id,
        log: `[SYSTEM] Falha de parsing de shell detectada. Reexecutando ${effectiveTaskId} com instrução corretiva (${commandRecoveryAttempt}/${commandRecoveryBudget}).`,
      });
      updateAgent(
        id,
        requestKind === 'collaboration' ? 'helping' : 'coding',
        `Recuperando ${effectiveTaskId}: ${effectiveTaskTitle}`,
        {
          currentModel: runContext.runtimeCandidate?.model || chosenModel,
          currentProvider: runContext.runtimeCandidate?.provider || autonomousLlm.provider,
          currentReasoningEffort: resolveRuntimeReasoningEffort(
            runContext.runtimeCandidate,
            reasoningEffort,
          ),
          workspacePath: projectDir,
          workspaceMode: workspaceInfo.workspaceKind,
          activeTaskId: effectiveTaskId,
          activeTaskKind: requestKind,
          queueLength: getQueuedRuns(id).length,
          fallbackActive: runContext.currentFallbackDepth > 0,
          fallbackDepth: runContext.currentFallbackDepth,
          fallbackReason:
            runContext.currentFallbackDepth > 0
              ? 'Lane em fallback chain.'
              : runtimeFallbackReason,
        },
      );
      setAgentLaneState(
        id,
        {
          ...runRequest,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
        },
        'retry_scheduled',
        `Recuperacao de shell agendada (${commandRecoveryAttempt}/${commandRecoveryBudget}).`,
        {
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          failureClass: 'shell',
          retryCount: 0,
          commandRecoveryCount: commandRecoveryAttempt,
          recovery: {
            attempt: commandRecoveryAttempt,
            result: 'scheduled_retry',
            escalated: false,
          },
        },
      );
      setTimeout(() => {
        if (!isAgentOccupied(id)) {
          startNextQueuedRalphRun(id);
        }
      }, Math.max(0, LOOP_CONTINUATION_DELAY_MS));
      await finalizeLaneHooks('retry_command_recovery', 'requeued');
      releaseClosedRun();
      return;
    }

    if (settledCompletionDisposition === 'rejected_command_failure') {
      shouldCleanupWorkspace = true;
      const shellFailureMessage = `Finalizacao rejeitada: ${effectiveTaskId} terminou com falha de shell nao recuperada.`;

      if (isInternalTaskId(effectiveTaskId)) {
        updateInternalTask(effectiveTaskId, (task) => ({ ...task, status: 'backlog', assignee: id }));
        io.emit('agent_log', {
          id: 'ceo',
          log: `⚠️ ${effectiveTaskId} concluiu com erro de comando. A colaboração voltou para backlog para nova tentativa.`,
        });
      } else if (currentPrimaryTask) {
        const releasedTask = releasePrimaryTaskToPool(
          currentPrimaryTask,
          `⚠️ ${effectiveTaskId} reportou conclusão após erro de comando. A finalização foi rejeitada automaticamente.`,
          {
            status: 'ready',
            assignee: null,
            metricReason: 'command_failure_requeue',
          },
        );
        if (releasedTask) {
          scheduleAutonomousDispatch(`command-failure:${effectiveTaskId}`);
        }
        recordPrimaryTaskFailure(
          effectiveTaskId,
          id,
          'shell',
          shellFailureMessage,
        );
      }
      ensureTaskContractFiles({
        projectDir: resolveProjectDir(),
        workspaceDir: projectDir,
        taskPacket: liveTaskPacket,
        verificationCommands: contractVerificationCommands,
        progress: {
          phase: 'rejected',
          detail: shellFailureMessage,
          boardStatus: currentPrimaryTask?.status || resolvedTaskStatus || null,
          laneState: 'failed',
          agentId: id,
          agentRole: effectiveAgent?.role || null,
        },
      });
      setAgentLaneState(
        id,
        {
          ...runRequest,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
        },
        'failed',
        shellFailureMessage,
        {
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          failureClass: 'shell',
          failureMessage: shellFailureMessage,
          retryCount: runContext.retryCount,
          commandRecoveryCount: runContext.commandRecoveryCount,
          recovery: {
            attempt: commandRecoveryAttempt,
            result: 'escalated',
            escalated: true,
          },
        },
      );

      io.emit('agent_log', {
        id,
        log: `[SYSTEM] Finalização de ${effectiveTaskId} ignorada devido a erro de comando. O card será retomado com segurança.`,
      });

      releaseClosedRun();
      startNextQueuedRalphRun(id);
      if (!isAgentOccupied(id) && !syncAgentAutonomousStatus(id)) {
        updateAgent(
          id,
          'idle',
          'Aguardando redistribuição após recuperação de erro.',
          {
            currentModel: baseModel,
            currentProvider: autonomousLlm.provider,
            workspacePath: null,
            activeTaskId: null,
            activeTaskKind: null,
            queueLength: getQueuedRuns(id).length,
          },
        );
      }

      if (shouldCleanupWorkspace) {
        try {
          await cleanupTaskWorkspace(projectContext, workspaceInfo);
        } catch (error) {
          io.emit('agent_log', { id, log: `[WARNING] Falha ao limpar workspace: ${error.message}` });
        }
      }
      await finalizeLaneHooks('rejected_command_failure', 'requeued');
      return;
    }

    if (effectiveCloseoutDisposition === 'review_rejected') {
      shouldCleanupWorkspace = true;
      const reviewRejectionMessage =
        `Review rejeitou ${effectiveTaskId} com evidencia objetiva e devolveu o card para implementacao.`;

      if (currentPrimaryTask) {
        const releasedTask = releasePrimaryTaskToPool(
          currentPrimaryTask,
          `⚠️ Review ${effectiveTaskId} reprovou a entrega e devolveu a task para implementação.`,
          {
            status: 'ready',
            assignee: null,
            metricReason: 'review_rejected_requeue',
          },
        );
        if (releasedTask) {
          scheduleAutonomousDispatch(`review-rejected:${effectiveTaskId}`);
        }
        recordPrimaryTaskFailure(
          effectiveTaskId,
          id,
          'review',
          reviewRejectionMessage,
        );
      }
      ensureTaskContractFiles({
        projectDir: resolveProjectDir(),
        workspaceDir: projectDir,
        taskPacket: liveTaskPacket,
        verificationCommands: contractVerificationCommands,
        progress: {
          phase: 'rejected',
          detail: reviewRejectionMessage,
          boardStatus: 'ready',
          laneState: 'failed',
          agentId: id,
          agentRole: effectiveAgent?.role || null,
        },
      });

      setAgentLaneState(
        id,
        {
          ...runRequest,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
        },
        'failed',
        reviewRejectionMessage,
        {
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          failureClass: 'review',
          failureMessage: reviewRejectionMessage,
          retryCount: runContext.retryCount,
          commandRecoveryCount: runContext.commandRecoveryCount,
          recovery: {
            result: 'review_rejected',
            escalated: false,
          },
        },
      );

      io.emit('agent_log', {
        id,
        log: `[SYSTEM] Review ${effectiveTaskId} reprovado com evidência objetiva. O card voltou para implementação.`,
      });

      releaseClosedRun();
      startNextQueuedRalphRun(id);
      if (!isAgentOccupied(id) && !syncAgentAutonomousStatus(id)) {
        updateAgent(
          id,
          'idle',
          'Review reprovado; aguardando redistribuição.',
          {
            currentModel: baseModel,
            currentProvider: autonomousLlm.provider,
            workspacePath: null,
            activeTaskId: null,
            activeTaskKind: null,
            queueLength: getQueuedRuns(id).length,
          },
        );
      }

      if (shouldCleanupWorkspace) {
        try {
          await cleanupTaskWorkspace(projectContext, workspaceInfo);
        } catch (error) {
          io.emit('agent_log', { id, log: `[WARNING] Falha ao limpar workspace: ${error.message}` });
        }
      }
      await finalizeLaneHooks('review_rejected', 'requeued');
      return;
    }

    if (effectiveCloseoutDisposition === 'review_missing_evidence') {
      shouldCleanupWorkspace = true;
      const failedChecks = runContext.failedVerificationCommands || [];
      const reviewEvidenceMessage =
        failedChecks.length > 0
          ? `Review de ${effectiveTaskId} executou checks com falha e tentou aprovar sem evidência suficiente. A task permanecerá em review.`
          : reviewRejected
            ? `Review de ${effectiveTaskId} tentou reprovar a entrega sem executar check material suficiente. A task permanecerá em review.`
            : `Review de ${effectiveTaskId} tentou aprovar sem executar check material bem-sucedido. A task permanecerá em review.`;

      if (currentPrimaryTask) {
        const releasedTask = releasePrimaryTaskToPool(
          currentPrimaryTask,
          `⚠️ Review ${effectiveTaskId} não apresentou evidência executável suficiente. O card seguirá em review para nova validação.`,
          {
            status: 'in_review',
            assignee: null,
            metricReason: 'review_missing_evidence_requeue',
          },
        );
        if (releasedTask) {
          scheduleAutonomousDispatch(`review-missing-evidence:${effectiveTaskId}`);
        }
      }
      ensureTaskContractFiles({
        projectDir: resolveProjectDir(),
        workspaceDir: projectDir,
        taskPacket: liveTaskPacket,
        verificationCommands: contractVerificationCommands,
        progress: {
          phase: 'in_review',
          detail: reviewEvidenceMessage,
          boardStatus: 'in_review',
          laneState: 'failed',
          agentId: id,
          agentRole: effectiveAgent?.role || null,
        },
      });

      setAgentLaneState(
        id,
        {
          ...runRequest,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
        },
        'failed',
        reviewEvidenceMessage,
        {
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          failureClass: 'review',
          failureMessage: reviewEvidenceMessage,
          retryCount: runContext.retryCount,
          commandRecoveryCount: runContext.commandRecoveryCount,
          recovery: {
            result: 'review_missing_evidence',
            escalated: false,
          },
        },
      );

      io.emit('agent_log', {
        id,
        log: `[SYSTEM] Review ${effectiveTaskId} não executou verificação material suficiente. O card seguirá em review e será redistribuído.`,
      });

      releaseClosedRun();
      startNextQueuedRalphRun(id);
      if (!isAgentOccupied(id) && !syncAgentAutonomousStatus(id)) {
        updateAgent(
          id,
          'idle',
          'Review sem evidência suficiente; aguardando redistribuição.',
          {
            currentModel: baseModel,
            currentProvider: autonomousLlm.provider,
            workspacePath: null,
            activeTaskId: null,
            activeTaskKind: null,
            queueLength: getQueuedRuns(id).length,
          },
        );
      }

      if (shouldCleanupWorkspace) {
        try {
          await cleanupTaskWorkspace(projectContext, workspaceInfo);
        } catch (error) {
          io.emit('agent_log', { id, log: `[WARNING] Falha ao limpar workspace: ${error.message}` });
        }
      }
      await finalizeLaneHooks('review_missing_evidence', 'requeued');
      return;
    }

    if (effectiveCloseoutDisposition === 'continue_incomplete') {
      const iterationLimitRecoveryHint =
        isAutonomousIterationLimitOutput(runContext.lastErrorOutput) &&
        runContext.successfulVerificationCommands.length > 0 &&
        runContext.failedVerificationCommands.length <= 0
          ? deriveIterationLimitRecoveryHint({
              previousHint: runContext.recoveryHint,
              successfulVerificationCommands: runContext.successfulVerificationCommands,
            })
          : runContext.recoveryHint;
      const continueMessage = iterationLimitRecoveryHint && iterationLimitRecoveryHint !== runContext.recoveryHint
        ? `[SYSTEM] Loop atingiu o limite de iteracoes apos checks relevantes. Continuando ${effectiveTaskId} com instrucao explicita de fechamento.`
        : `[SYSTEM] Loop encerrou sem ${RALPH_COMPLETION_PROMISE}. Continuando ${effectiveTaskId} automaticamente.`;
      queueRalphRun(
        {
          ...runRequest,
          queueIfBusy: true,
          retryCount: 0,
          recoveryHint: iterationLimitRecoveryHint || null,
          requestId: `${runRequest.requestId}:continue:${Date.now()}`,
        },
        { position: 'front' },
      );
      io.emit('agent_log', {
        id,
        log: continueMessage,
      });
      updateAgent(
        id,
        requestKind === 'collaboration' ? 'helping' : 'coding',
        `Continuando ${effectiveTaskId}: ${effectiveTaskTitle}`,
        {
          currentModel: runContext.runtimeCandidate?.model || chosenModel,
          currentProvider: runContext.runtimeCandidate?.provider || autonomousLlm.provider,
          currentReasoningEffort: resolveRuntimeReasoningEffort(
            runContext.runtimeCandidate,
            reasoningEffort,
          ),
          workspacePath: projectDir,
          workspaceMode: workspaceInfo.workspaceKind,
          activeTaskId: effectiveTaskId,
          activeTaskKind: requestKind,
          queueLength: getQueuedRuns(id).length,
          fallbackActive: runContext.currentFallbackDepth > 0,
          fallbackDepth: runContext.currentFallbackDepth,
          fallbackReason:
            runContext.currentFallbackDepth > 0
              ? 'Lane em fallback chain.'
              : runtimeFallbackReason,
        },
      );
      setAgentLaneState(
        id,
        {
          ...runRequest,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
        },
        'retry_scheduled',
        iterationLimitRecoveryHint && iterationLimitRecoveryHint !== runContext.recoveryHint
          ? 'Loop atingiu o limite de iteracoes apos validacoes bem-sucedidas; continuacao corretiva enfileirada.'
          : `Loop encerrado sem ${RALPH_COMPLETION_PROMISE}; continuacao automatica enfileirada.`,
        {
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          retryCount: 0,
          commandRecoveryCount: runContext.commandRecoveryCount,
          recovery: {
            result: 'continued',
            escalated: false,
          },
        },
      );
      setTimeout(() => {
        if (!isAgentOccupied(id)) {
          startNextQueuedRalphRun(id);
        }
      }, Math.max(0, LOOP_CONTINUATION_DELAY_MS));
      await finalizeLaneHooks('continue_incomplete', 'requeued');
      releaseClosedRun();
      return;
    }

    const genericFailureMessage = truncateText(
      runContext.lastErrorOutput || `Loop encerrado com codigo ${code}.`,
      220,
    );
    const shouldMarkGenericFailure = !completionDetected && !stoppedBySystem && code !== 0;
    if (shouldMarkGenericFailure) {
      markRuntimeCandidateFailure(runContext.runtimeCandidate, {
        reason: genericFailureMessage,
        agentId: id,
        taskId: effectiveTaskId,
      });
      setAgentLaneState(
        id,
        {
          ...runRequest,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
        },
        'failed',
        genericFailureMessage,
        {
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          failureClass:
            runContext.transientFailureDetected || isProviderFailureOutput(genericFailureMessage)
              ? 'provider'
              : 'unknown',
          failureMessage: genericFailureMessage,
          retryCount: runContext.retryCount,
          commandRecoveryCount: runContext.commandRecoveryCount,
          recovery: {
            result: 'terminal_failure',
            escalated: true,
          },
        },
      );
      if (requestKind === 'primary' && !isInternalTaskId(effectiveTaskId)) {
        recordPrimaryTaskFailure(
          effectiveTaskId,
          id,
          runContext.transientFailureDetected ? 'provider' : 'unknown',
          genericFailureMessage,
        );
        if (currentPrimaryTask?.status === 'in_review') {
          const releasedTask = releasePrimaryTaskToPool(
            currentPrimaryTask,
            `⚠️ Review ${effectiveTaskId} falhou com evidência objetiva e voltou para implementação.`,
            {
              status: 'ready',
              assignee: null,
              metricReason: 'review_failure_requeue',
            },
          );
          if (releasedTask) {
            scheduleAutonomousDispatch(`review-failure:${effectiveTaskId}`);
          }
        }
      }
    }

    releaseClosedRun();
    startNextQueuedRalphRun(id);
    if (isAgentOccupied(id)) {
      if (shouldCleanupWorkspace) {
        try {
          await cleanupTaskWorkspace(projectContext, workspaceInfo);
        } catch (error) {
          io.emit('agent_log', { id, log: `[WARNING] Falha ao limpar workspace: ${error.message}` });
        }
      }
      return;
    }

    if (completionOutcomeHandled) {
      const settledLane = agentLaneRuntime.get(id);
      if (!syncAgentAutonomousStatus(id)) {
        updateAgent(
          id,
          'idle',
          settledLane?.state === 'failed'
            ? 'Aguardando redistribuição após falha controlada.'
            : requestKind === 'collaboration'
              ? 'Colaboração concluída.'
            : 'Task concluída com autonomia!',
          {
            currentModel: baseModel,
            currentProvider: autonomousLlm.provider,
            workspacePath: null,
            activeTaskId: null,
            activeTaskKind: null,
            queueLength: getQueuedRuns(id).length,
          },
        );
      }
    } else if (completionDetected && settledCompletionDisposition === 'accepted') {
      updateAgent(
        id,
        'idle',
        requestKind === 'collaboration' ? 'Colaboração concluída.' : 'Task concluída com autonomia!',
        {
          currentModel: baseModel,
          workspacePath: null,
          activeTaskId: null,
          activeTaskKind: null,
          queueLength: getQueuedRuns(id).length,
        },
      );
      const existingLane = agentLaneRuntime.get(id);
      if (
        !getQueuedRuns(id).length &&
        !(
          existingLane &&
          existingLane.taskId === effectiveTaskId &&
          existingLane.state === 'completed'
        )
      ) {
        setAgentLaneState(
          id,
          {
            ...runRequest,
            taskId: effectiveTaskId,
            taskTitle: effectiveTaskTitle,
            requestKind,
            taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          },
          'completed',
          requestKind === 'collaboration'
            ? 'Colaboracao concluida.'
            : 'Task concluida com autonomia.',
          {
            taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
            retryCount: runContext.retryCount,
            commandRecoveryCount: runContext.commandRecoveryCount,
          },
        );
      }
    } else if (!completionDetected && (code === 0 || stoppedBySystem)) {
      const supersededWithoutCompletion = !stoppedBySystem && !canContinueCurrentTask;
      setAgentLaneState(
        id,
        {
          ...runRequest,
          taskId: effectiveTaskId,
          taskTitle: effectiveTaskTitle,
          requestKind,
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
        },
        'cancelled',
        stoppedBySystem
          ? 'Loop pausado pelo orquestrador.'
          : 'Loop encerrado sem conclusão; a lane foi fechada sem aceitar fechamento automático.',
        {
          taskStatus: currentPrimaryTask?.status || resolvedTaskStatus,
          retryCount: runContext.retryCount,
          commandRecoveryCount: runContext.commandRecoveryCount,
          eventName: supersededWithoutCompletion ? 'lane.superseded' : 'lane.closed',
          eventStatus: supersededWithoutCompletion ? 'superseded' : 'closed',
        },
      );
      if (!syncAgentAutonomousStatus(id)) {
        updateAgent(
          id,
          'idle',
          stoppedBySystem
            ? 'Loop pausado pelo orquestrador.'
            : 'Lane fechada sem conclusão confirmada.',
          {
            currentModel: baseModel,
            currentProvider: autonomousLlm.provider,
            workspacePath: null,
            activeTaskId: null,
            activeTaskKind: null,
            queueLength: getQueuedRuns(id).length,
          },
        );
      }
    } else if (!syncAgentAutonomousStatus(id)) {
      updateAgent(id, 'error', 'Loop interrompido com erro.', {
        currentModel: baseModel,
        currentProvider: runContext.runtimeCandidate?.provider || autonomousLlm.provider,
        currentReasoningEffort: resolveRuntimeReasoningEffort(
          runContext.runtimeCandidate,
          reasoningEffort,
        ),
        workspacePath: projectDir,
        activeTaskId: effectiveTaskId,
        activeTaskKind: requestKind,
        queueLength: getQueuedRuns(id).length,
        fallbackActive: runContext.currentFallbackDepth > 0,
        fallbackDepth: runContext.currentFallbackDepth,
        fallbackReason:
          runContext.currentFallbackDepth > 0
            ? 'Lane em fallback chain.'
            : runtimeFallbackReason,
      });
    }

    if (shouldCleanupWorkspace) {
      try {
        await cleanupTaskWorkspace(projectContext, workspaceInfo);
      } catch (error) {
        io.emit('agent_log', { id, log: `[WARNING] Falha ao limpar workspace: ${error.message}` });
      }
    }

    await finalizeLaneHooks(
      effectiveCloseoutDisposition,
      completionOutcomeHandled ? 'completed' : 'closed',
    );
    scheduleAutonomousDispatch(`fim-de-loop:${id}`);
  });
}

// Rota para iniciar um loop autônomo do Ralph pela API
app.post('/api/start_ralph', async (req, res) => {
  const {
    id,
    task,
    taskId,
    requestKind,
    parentTaskId,
    requestedBy,
    queueIfBusy,
    forceReplace,
  } = req.body || {};
  if (!task) return res.status(400).json({ error: 'Falta a tarefa' });
  startRalphForAgent(id, task, taskId, {
    requestKind,
    parentTaskId,
    requestedBy,
    queueIfBusy,
    forceReplace,
  });
  res.status(200).json({ success: true, message: 'Loop autônomo iniciado com sucesso' });
});

app.post('/api/request_help', (req, res) => {
  const requesterId = String(req.body?.requesterId || '').trim();
  const targetAgentId = String(req.body?.targetAgentId || '').trim();
  const summary = String(req.body?.summary || '').trim();
  const parentTaskId = String(req.body?.parentTaskId || '').trim() || null;

  if (!requesterId || !targetAgentId || !summary) {
    return res.status(400).json({
      error: 'Campos obrigatórios: requesterId, targetAgentId, summary',
    });
  }

  const collaborationTask = queueCollaborationRequest({
    requesterId,
    targetAgentId,
    parentTaskId,
    summary,
  });

  if (!collaborationTask) {
    return res.status(400).json({ error: 'Não foi possível criar a colaboração.' });
  }

  res.status(200).json({
    success: true,
    task: collaborationTask,
  });
});

io.on('connection', (socket) => {
  console.log('🔗 Painel visual conectado (Pixel Agents UI)');
  metrics.setActiveConnections(io.engine.clientsCount);
  socket.emit('agents_update', getVisibleAgents());
  socket.emit('tasks_update', getVisibleTasks());
  socket.emit('operations_update', getOperationalStatusSnapshot());

  socket.on('request_initial_state', () => {
    console.log('🔄 Reenviando estado inicial para o cliente');
    socket.emit('agents_update', getVisibleAgents());
    socket.emit('tasks_update', getVisibleTasks());
    socket.emit('operations_update', getOperationalStatusSnapshot());
  });

  socket.on('agent_action', (data) => {
    console.log(`🤖 Ação via UI: Agente ${data.id} mudou o status para: ${data.status}`);
    updateAgent(data.id, data.status, data.task);
  });

  socket.on('disconnect', () => {
    metrics.setActiveConnections(io.engine.clientsCount);
  });
});

function sendFrontendIndex(res) {
  res.sendFile(FRONTEND_INDEX_FILE, (error) => {
    if (!error || res.headersSent) {
      return;
    }

    res.status(error.statusCode || 500).json({
      error: 'Frontend build não encontrado.',
      expectedPath: FRONTEND_INDEX_FILE,
    });
  });
}

app.get('/', (req, res) => {
  sendFrontendIndex(res);
});

app.get('/{*path}', (req, res) => {
  sendFrontendIndex(res);
});

const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '127.0.0.1';

server.on('error', (error) => {
  console.error(`❌ Falha ao iniciar o backend em ${HOST}:${PORT}`, error);
  process.exit(1);
});

server.listen(PORT, HOST, () => {
  const projectContext = resolveProjectContext(true);
  console.log(`🧠 NexusOrchestrator Backend rodando na porta ${PORT}`);
  console.log(`🚀 API Webhook pronta em http://${HOST}:${PORT}/api/agent_action`);
  console.log(`🗂️ Projeto alvo resolvido para ${projectContext.projectDir} (${projectContext.source})`);
  console.log(
    `🔁 Modo de loop autônomo padrão: ${RALPH_EXTENSION_ENABLED ? 'Ralph (experimental, com circuit breaker)' : 'Gemini nativo (estável)'}`,
  );
  metrics.setActiveConnections(0);
  refreshOperationalMetrics();
  syncTasks()
    .then(() => reconcileManagedWorkspaces('boot'))
    .then(() => reconcilePublishedBranchPipelines('boot'))
    .then(() => {
      scheduleAutonomousDispatch('boot');
      reconcilePhaseReleases('boot').catch((error) => {
        console.error('[RELEASE] Falha ao reconciliar releases por etapa no boot:', error.message);
      });
    })
    .catch((error) => {
      console.error('[SYNC] Falha no sync inicial:', error.message);
    });
});
