const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

function loadRuntimeStateModule(tempDir, instanceId) {
  const runtimeStatePath = require.resolve('../services/runtimeState');
  const instanceIdentityPath = require.resolve('../services/instanceIdentity');
  const previousRuntimeDir = process.env.NEXUS_RUNTIME_STATE_DIR;
  const previousInstanceId = process.env.NEXUS_INSTANCE_ID;

  process.env.NEXUS_RUNTIME_STATE_DIR = tempDir;
  process.env.NEXUS_INSTANCE_ID = instanceId;

  delete require.cache[runtimeStatePath];
  delete require.cache[instanceIdentityPath];

  const runtimeState = require('../services/runtimeState');

  return {
    runtimeState,
    restore() {
      delete require.cache[runtimeStatePath];
      delete require.cache[instanceIdentityPath];

      if (previousRuntimeDir === undefined) {
        delete process.env.NEXUS_RUNTIME_STATE_DIR;
      } else {
        process.env.NEXUS_RUNTIME_STATE_DIR = previousRuntimeDir;
      }

      if (previousInstanceId === undefined) {
        delete process.env.NEXUS_INSTANCE_ID;
      } else {
        process.env.NEXUS_INSTANCE_ID = previousInstanceId;
      }
    },
  };
}

test('saveRuntimeState persists provider cooldown metadata without normalizeString scope errors', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-runtime-state-'));
  const instanceId = 'runtime-state-test';
  const { runtimeState, restore } = loadRuntimeStateModule(tempDir, instanceId);

  try {
    assert.doesNotThrow(() => {
      runtimeState.saveRuntimeState({
        instanceId,
        collaborationTaskSequence: 1,
        collaborationTasks: [],
        localPrimaryTaskSequence: 1,
        localPrimaryTasks: [],
        primaryTaskRuntimeMeta: [],
        laneSnapshots: [],
        recentLaneFailures: [],
        providerRuntime: {
          cooldowns: [
            {
              provider: 'azure_openai',
              model: 'gpt-5.4',
              failureCount: 2,
              lastFailureAt: '2026-04-08T03:51:11.526Z',
              lastFailureReason: 'provider timeout',
              lastAgentId: 'dev',
              lastTaskId: 'GH-1',
              cooldownUntil: Date.now() + 60_000,
              cooldownRemainingMs: 60_000,
            },
          ],
        },
      });
    });

    const persisted = runtimeState.loadRuntimeState();
    assert.equal(persisted.providerRuntime.cooldowns.length, 1);
    assert.equal(persisted.providerRuntime.cooldowns[0].provider, 'azure_openai');
    assert.equal(persisted.providerRuntime.cooldowns[0].model, 'gpt-5.4');
    assert.equal(persisted.providerRuntime.cooldowns[0].lastTaskId, 'GH-1');
  } finally {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('saveRuntimeState preserves GitHub-backed collaboration metadata', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-runtime-state-gh-collab-'));
  const instanceId = 'runtime-state-gh-collab-test';
  const { runtimeState, restore } = loadRuntimeStateModule(tempDir, instanceId);

  try {
    runtimeState.saveRuntimeState({
      instanceId,
      collaborationTaskSequence: 1,
      collaborationTasks: [
        {
          id: 'NX-HELP-GH-27',
          title: 'NX-HELP-001A GTMNY-001 Documentar convencoes e validar bootstrap do workspace',
          status: 'in_progress',
          assignee: 'architect',
          requesterId: 'dev',
          parentTaskId: 'GH-1',
          kind: 'collaboration',
          source: 'github',
          sourceTaskId: 'GH-27',
          collaborationKey: 'NX-HELP-001A',
          parentTaskRef: 'GTMNY-001',
          githubUrl: 'https://github.test/issues/27',
          githubNodeId: 'ISSUE_NODE_27',
        },
      ],
      localPrimaryTaskSequence: 1,
      localPrimaryTasks: [],
      primaryTaskRuntimeMeta: [],
      laneSnapshots: [],
      recentLaneFailures: [],
    });

    const persisted = runtimeState.loadRuntimeState();
    assert.equal(persisted.collaborationTasks.length, 1);
    assert.equal(persisted.collaborationTasks[0].source, 'github');
    assert.equal(persisted.collaborationTasks[0].sourceTaskId, 'GH-27');
    assert.equal(persisted.collaborationTasks[0].githubNodeId, 'ISSUE_NODE_27');
    assert.equal(persisted.collaborationTasks[0].parentTaskRef, 'GTMNY-001');
  } finally {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('saveRuntimeState preserves published branch protection metadata for primary tasks', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-runtime-state-branch-lock-'));
  const instanceId = 'runtime-state-branch-lock-test';
  const { runtimeState, restore } = loadRuntimeStateModule(tempDir, instanceId);

  try {
    runtimeState.saveRuntimeState({
      instanceId,
      collaborationTaskSequence: 1,
      collaborationTasks: [],
      localPrimaryTaskSequence: 1,
      localPrimaryTasks: [],
      primaryTaskRuntimeMeta: [
        {
          taskId: 'GH-8',
          publishedBranchName: 'nexus/tasks/gh-8/gtmny-008-contratos-compartilhad',
          publishedBranchRef: 'refs/remotes/origin/nexus/tasks/gh-8/gtmny-008-contratos-compartilhad',
          publishedBaseBranch: 'etapa-1-integration',
          publishedBranchIntegrated: false,
          publishedBranchReason: 'branch-has-unabsorbed-commits',
          publishedBranchLockedAt: '2026-04-10T05:10:00.000Z',
          publishedBranchUpdatedAt: '2026-04-10T05:10:10.000Z',
        },
      ],
      laneSnapshots: [],
      recentLaneFailures: [],
    });

    const persisted = runtimeState.loadRuntimeState();
    assert.equal(persisted.primaryTaskRuntimeMeta.length, 1);
    assert.equal(
      persisted.primaryTaskRuntimeMeta[0].publishedBranchName,
      'nexus/tasks/gh-8/gtmny-008-contratos-compartilhad',
    );
    assert.equal(
      persisted.primaryTaskRuntimeMeta[0].publishedBranchRef,
      'refs/remotes/origin/nexus/tasks/gh-8/gtmny-008-contratos-compartilhad',
    );
    assert.equal(persisted.primaryTaskRuntimeMeta[0].publishedBranchIntegrated, false);
    assert.equal(
      persisted.primaryTaskRuntimeMeta[0].publishedBranchReason,
      'branch-has-unabsorbed-commits',
    );
  } finally {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('saveRuntimeState preserves GitLab CI gate metadata for published primary tasks', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-runtime-state-gitlab-gate-'));
  const instanceId = 'runtime-state-gitlab-gate-test';
  const { runtimeState, restore } = loadRuntimeStateModule(tempDir, instanceId);

  try {
    runtimeState.saveRuntimeState({
      instanceId,
      collaborationTaskSequence: 1,
      collaborationTasks: [],
      localPrimaryTaskSequence: 1,
      localPrimaryTasks: [],
      primaryTaskRuntimeMeta: [
        {
          taskId: 'GH-35',
          publishedBranchName: 'nexus/tasks/gh-35/nxrel-003-consolidacao',
          publishedBranchRef: 'refs/remotes/origin/nexus/tasks/gh-35/nxrel-003-consolidacao',
          publishedBaseBranch: 'main',
          publishedCommitSha: 'abc123def456',
          awaitingGitLabCi: true,
          gitlabCiGateStatus: 'awaiting',
          gitlabCiGateArmedAt: '2026-04-16T02:40:00.000Z',
          gitlabCiGateResolvedAt: '2026-04-16T02:55:00.000Z',
          gitlabPipelineId: 2456573618,
          gitlabPipelineStatus: 'success',
          gitlabPipelineStatusClass: 'success',
          gitlabPipelineUrl: 'https://gitlab.example/pipelines/2456573618',
          gitlabPipelineSha: 'abc123def456',
          gitlabPipelineBranch: 'nexus/tasks/gh-35/nxrel-003-consolidacao',
          gitlabPipelineProjectPath: 'contato276-group/example1',
          gitlabPipelineUpdatedAt: '2026-04-16T02:54:00.000Z',
          gitlabPipelineFinishedAt: '2026-04-16T02:55:00.000Z',
          gitlabPipelineCheckedAt: '2026-04-16T02:55:10.000Z',
        },
      ],
      laneSnapshots: [],
      recentLaneFailures: [],
    });

    const persisted = runtimeState.loadRuntimeState();
    assert.equal(persisted.primaryTaskRuntimeMeta.length, 1);
    const entry = persisted.primaryTaskRuntimeMeta[0];
    assert.equal(entry.publishedCommitSha, 'abc123def456');
    assert.equal(entry.awaitingGitLabCi, true);
    assert.equal(entry.gitlabCiGateStatus, 'awaiting');
    assert.equal(entry.gitlabCiGateArmedAt, '2026-04-16T02:40:00.000Z');
    assert.equal(entry.gitlabCiGateResolvedAt, '2026-04-16T02:55:00.000Z');
    assert.equal(entry.gitlabPipelineId, 2456573618);
    assert.equal(entry.gitlabPipelineStatus, 'success');
    assert.equal(entry.gitlabPipelineStatusClass, 'success');
    assert.equal(entry.gitlabPipelineUrl, 'https://gitlab.example/pipelines/2456573618');
    assert.equal(entry.gitlabPipelineSha, 'abc123def456');
    assert.equal(entry.gitlabPipelineBranch, 'nexus/tasks/gh-35/nxrel-003-consolidacao');
    assert.equal(entry.gitlabPipelineProjectPath, 'contato276-group/example1');
    assert.equal(entry.gitlabPipelineUpdatedAt, '2026-04-16T02:54:00.000Z');
    assert.equal(entry.gitlabPipelineFinishedAt, '2026-04-16T02:55:00.000Z');
    assert.equal(entry.gitlabPipelineCheckedAt, '2026-04-16T02:55:10.000Z');
  } finally {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

test('saveRuntimeState preserves cached GitHub primary tasks for boot rehydration', () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-runtime-state-primary-cache-'));
  const instanceId = 'runtime-state-primary-cache-test';
  const { runtimeState, restore } = loadRuntimeStateModule(tempDir, instanceId);

  try {
    runtimeState.saveRuntimeState({
      instanceId,
      collaborationTaskSequence: 1,
      collaborationTasks: [],
      localPrimaryTaskSequence: 1,
      localPrimaryTasks: [],
      primaryTaskCache: [
        {
          id: 'GH-37',
          title: 'GTMNY-035 Fechar verificacao de email, social auth e handoff seguro do onboarding',
          status: 'in_progress',
          assignee: 'qa',
          ownerId: 'martinlofranodeoliveira',
          ownerInstanceId: instanceId,
          githubUrl: 'https://github.test/issues/37',
          githubNodeId: 'ISSUE_NODE_37',
          backlogRef: 'GTMNY-035',
          priority: 'p0',
          phase: 'Fase 1 - Fundacao e Infraestrutura',
          dependencies: ['GTMNY-028', 'GTMNY-029'],
          executionRules: ['nao introduzir fluxo falso para credenciais externas indisponiveis'],
          branchName: 'nexus/tasks/gh-37/gtmny-035-fechar-verificacao',
        },
      ],
      primaryTaskRuntimeMeta: [],
      laneSnapshots: [],
      recentLaneFailures: [],
    });

    const persisted = runtimeState.loadRuntimeState();
    assert.equal(persisted.primaryTaskCache.length, 1);
    const task = persisted.primaryTaskCache[0];
    assert.equal(task.id, 'GH-37');
    assert.equal(task.status, 'in_progress');
    assert.equal(task.assignee, 'qa');
    assert.equal(task.githubNodeId, 'ISSUE_NODE_37');
    assert.equal(task.backlogRef, 'GTMNY-035');
    assert.equal(task.phase, 'Fase 1 - Fundacao e Infraestrutura');
    assert.deepEqual(task.dependencies, ['GTMNY-028', 'GTMNY-029']);
    assert.equal(task.branchName, 'nexus/tasks/gh-37/gtmny-035-fechar-verificacao');
  } finally {
    restore();
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});
