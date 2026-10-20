const test = require('node:test');
const assert = require('node:assert/strict');
const { spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildTaskBranchName,
  discoverProjectContext,
  evaluateDependencyStartRefAgainstBase,
  ensureProjectControlPlaneSnapshot,
  ensureTaskWorkspace,
  integrateTaskWorkspaceChanges,
  promotePublishedTaskBranchToBase,
  resolveTaskBranchAbsorption,
  resolveTaskBranchBase,
  resolveTaskBranchStartPoint,
  resolveWorkspaceIntegrationMode,
  syncBranchBackedWorktreeWithBase,
  syncBranchBackedWorktreeWithRefs,
  stripWorkspaceMetadataChanges,
} = require('../services/projectWorkspace');

function runGit(cwd, args) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
  });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return (result.stdout || '').trim();
}

test('stripWorkspaceMetadataChanges removes only Nexus worktree metadata entries', () => {
  const filtered = stripWorkspaceMetadataChanges([
    'M .nexus-worktree.json',
    'M .gemini/settings.json',
    'M index.html',
    '?? .nexus-worktree.json',
    '?? .gemini/settings.json',
    'A styles.css',
  ].join('\n'));

  assert.equal(filtered, ['M index.html', 'A styles.css'].join('\n'));
});

test('resolveWorkspaceIntegrationMode normalizes branch aliases', () => {
  assert.equal(
    resolveWorkspaceIntegrationMode({ NEXUS_WORKTREE_INTEGRATION_MODE: 'branch_push' }),
    'branch',
  );
  assert.equal(
    resolveWorkspaceIntegrationMode({ NEXUS_WORKTREE_INTEGRATION_MODE: 'cherry-pick' }),
    'cherry-pick',
  );
});

test('discoverProjectContext can strictly honor configured project dir', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-project-context-strict-'));
  const configuredDir = path.join(tempRoot, 'game-factory');
  const remoteMatchDir = path.join(tempRoot, 'example-project');

  try {
    fs.mkdirSync(configuredDir, { recursive: true });
    fs.mkdirSync(remoteMatchDir, { recursive: true });
    runGit(configuredDir, ['init', '--initial-branch=main']);
    runGit(remoteMatchDir, ['init', '--initial-branch=main']);
    runGit(remoteMatchDir, ['remote', 'add', 'origin', 'developer@example.invalid:martin/example-project.git']);

    const result = discoverProjectContext({
      configuredProjectDir: configuredDir,
      workspaceRoot: tempRoot,
      owner: 'martin',
      repoName: 'example-project',
      strictProjectDir: 'true',
    });

    assert.equal(result.projectDir, configuredDir);
    assert.equal(result.gitRoot, configuredDir);
    assert.match(result.source, /^strict-configured:/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('resolveTaskBranchBase prefers the repository default branch over the current worktree branch', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-base-detect-'));
  const repoDir = path.join(tempRoot, 'repo');

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);
    runGit(repoDir, ['checkout', '-b', 'feature/base']);

    assert.equal(resolveTaskBranchBase(repoDir, {}), 'main');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('resolveTaskBranchStartPoint returns null when the requested base branch does not exist', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-startpoint-'));
  const repoDir = path.join(tempRoot, 'repo');

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);
    runGit(repoDir, ['checkout', '-b', 'feature/base']);

    assert.equal(resolveTaskBranchStartPoint(repoDir, 'release/missing', {}), null);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('evaluateDependencyStartRefAgainstBase skips dependency branches already contained in the base', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-dependency-contained-'));
  const repoDir = path.join(tempRoot, 'repo');

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'v1\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);
    runGit(repoDir, ['branch', 'nexus/tasks/gh-2/mobile-base']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'v2\n', 'utf8');
    runGit(repoDir, ['commit', '-am', 'base update']);

    const result = evaluateDependencyStartRefAgainstBase(
      repoDir,
      'main',
      'nexus/tasks/gh-2/mobile-base',
    );

    assert.equal(result.include, false);
    assert.equal(result.reason, 'already-contained');
    assert.equal(result.leftOnly, 1);
    assert.equal(result.rightOnly, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('evaluateDependencyStartRefAgainstBase keeps dependency branches that are strictly ahead of the base', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-dependency-ahead-'));
  const repoDir = path.join(tempRoot, 'repo');

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'v1\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(repoDir, ['checkout', '-b', 'nexus/tasks/gh-9/discovery']);
    fs.writeFileSync(path.join(repoDir, 'discovery.txt'), 'feed\n', 'utf8');
    runGit(repoDir, ['add', 'discovery.txt']);
    runGit(repoDir, ['commit', '-m', 'discovery feature']);

    const result = evaluateDependencyStartRefAgainstBase(
      repoDir,
      'main',
      'nexus/tasks/gh-9/discovery',
    );

    assert.equal(result.include, true);
    assert.equal(result.reason, 'ahead-only');
    assert.equal(result.leftOnly, 0);
    assert.equal(result.rightOnly, 1);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('evaluateDependencyStartRefAgainstBase skips divergent dependency branches to protect the integration base', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-dependency-diverged-'));
  const repoDir = path.join(tempRoot, 'repo');

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'v1\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(repoDir, ['checkout', '-b', 'nexus/tasks/gh-7/onboarding']);
    fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'legacy\n', 'utf8');
    runGit(repoDir, ['add', 'feature.txt']);
    runGit(repoDir, ['commit', '-m', 'legacy dependency']);

    runGit(repoDir, ['checkout', 'main']);
    fs.writeFileSync(path.join(repoDir, 'README.md'), 'v2\n', 'utf8');
    runGit(repoDir, ['commit', '-am', 'base integration branch advanced']);

    const result = evaluateDependencyStartRefAgainstBase(
      repoDir,
      'main',
      'nexus/tasks/gh-7/onboarding',
    );

    assert.equal(result.include, false);
    assert.equal(result.reason, 'diverged-from-base');
    assert.equal(result.leftOnly, 1);
    assert.equal(result.rightOnly, 1);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('buildTaskBranchName is deterministic per task and ignores agent id', () => {
  const env = { NEXUS_TASK_BRANCH_PREFIX: 'collab/tasks' };
  const fromDev = buildTaskBranchName(
    { taskId: 'GH-42', taskTitle: 'Landing Page Pública', agentId: 'dev' },
    env,
  );
  const fromQa = buildTaskBranchName(
    { taskId: 'GH-42', taskTitle: 'Landing Page Pública', agentId: 'qa' },
    env,
  );

  assert.equal(fromDev, fromQa);
  assert.match(fromDev, /^collab\/tasks\/gh-42\/landing-page-publica$/);
});

test('buildTaskBranchName normalizes review titles back to the implementation branch name', () => {
  const env = { NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks' };
  const implementationBranch = buildTaskBranchName(
    { taskId: 'GH-1', taskTitle: 'GTMNY-001 Bootstrap do monorepo e convencoes do workspace' },
    env,
  );
  const reviewBranch = buildTaskBranchName(
    { taskId: 'GH-1', taskTitle: '[Review GH-1] GTMNY-001 Bootstrap do monorepo e convencoes do workspace' },
    env,
  );

  assert.equal(reviewBranch, implementationBranch);
});

test('ensureTaskWorkspace replaces a stale phase worktree that still holds the task branch', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-stage-handoff-'));
  const repoDir = path.join(tempRoot, 'repo');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const reviewWorkspace = await ensureTaskWorkspace(projectContext, {
      agentId: 'architect_review',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-9',
      taskTitle: '[Review GH-9] TTM-009 Research-first scalp playbook and signal validation framework',
      requestKind: 'primary',
      env,
    });

    const primaryWorkspace = await ensureTaskWorkspace(projectContext, {
      agentId: 'qa',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-9',
      taskTitle: 'TTM-009 Research-first scalp playbook and signal validation framework',
      requestKind: 'primary',
      env,
    });

    const worktreeList = runGit(repoDir, ['worktree', 'list', '--porcelain']);

    assert.equal(primaryWorkspace.metadata.branchName, reviewWorkspace.metadata.branchName);
    assert.notEqual(primaryWorkspace.path, reviewWorkspace.path);
    assert.equal(fs.existsSync(primaryWorkspace.path), true);
    assert.equal(fs.existsSync(reviewWorkspace.path), false);
    assert.equal(worktreeList.replace(/\\/g, '/').includes(path.resolve(primaryWorkspace.path.replace(/\\/g, '/'))), true);
    assert.equal(worktreeList.replace(/\\/g, '/').includes(path.resolve(reviewWorkspace.path.replace(/\\/g, '/'))), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureTaskWorkspace removes a stale worktree from another agent before reusing the same task branch', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-agent-reassign-'));
  const repoDir = path.join(tempRoot, 'repo');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const firstWorkspace = await ensureTaskWorkspace(projectContext, {
      agentId: 'dev_2',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-20',
      taskTitle: 'Inventariar jornadas criticas e pontos de insercao',
      requestKind: 'primary',
      env,
    });

    const reassignedWorkspace = await ensureTaskWorkspace(projectContext, {
      agentId: 'qa_3',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-20',
      taskTitle: 'Inventariar jornadas criticas e pontos de insercao',
      requestKind: 'primary',
      env,
    });

    const worktreeList = runGit(repoDir, ['worktree', 'list', '--porcelain']);

    assert.equal(firstWorkspace.metadata.branchName, reassignedWorkspace.metadata.branchName);
    assert.notEqual(firstWorkspace.path, reassignedWorkspace.path);
    assert.equal(fs.existsSync(reassignedWorkspace.path), true);
    assert.equal(fs.existsSync(firstWorkspace.path), false);
    assert.equal(worktreeList.replace(/\\/g, '/').includes(path.resolve(reassignedWorkspace.path.replace(/\\/g, '/'))), true);
    assert.equal(worktreeList.replace(/\\/g, '/').includes(path.resolve(firstWorkspace.path.replace(/\\/g, '/'))), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureTaskWorkspace removes a stale managed worktree even when its metadata file is missing', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-missing-metadata-'));
  const repoDir = path.join(tempRoot, 'repo');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    const branchName = buildTaskBranchName(
      {
        taskId: 'GH-25',
        taskTitle: 'TTM-013 [P0] Add Arc MCP server to development workflow',
      },
      env,
    );

    runGit(repoDir, ['checkout', '-b', branchName]);
    runGit(repoDir, ['commit', '--allow-empty', '-m', 'task baseline']);
    runGit(repoDir, ['checkout', 'main']);

    const managedRoot = path.join(env.NEXUS_WORKTREE_ROOT, env.NEXUS_INSTANCE_ID);
    const staleWorkspacePath = path.join(managedRoot, 'stale-gh-25-without-metadata');
    fs.mkdirSync(managedRoot, { recursive: true });
    runGit(repoDir, ['worktree', 'add', staleWorkspacePath, branchName]);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const workspace = await ensureTaskWorkspace(projectContext, {
      agentId: 'dev',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-25',
      taskTitle: 'TTM-013 [P0] Add Arc MCP server to development workflow',
      requestKind: 'primary',
      env,
    });

    const worktreeList = runGit(repoDir, ['worktree', 'list', '--porcelain']);

    assert.equal(fs.existsSync(staleWorkspacePath), false);
    assert.equal(fs.existsSync(workspace.path), true);
    assert.equal(worktreeList.replace(/\\/g, '/').includes(path.resolve(staleWorkspacePath.replace(/\\/g, '/'))), false);
    assert.equal(worktreeList.replace(/\\/g, '/').includes(path.resolve(workspace.path.replace(/\\/g, '/'))), true);
    assert.equal(workspace.metadata.branchName, branchName);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureProjectControlPlaneSnapshot mirrors .nexus into the worktree and drops runtime noise', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-control-plane-'));
  const sourceRoot = path.join(tempRoot, 'source');
  const worktreeRoot = path.join(tempRoot, 'worktree');

  try {
    fs.mkdirSync(path.join(sourceRoot, '.nexus', 'skills', 'bootstrap-foundation'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(sourceRoot, '.nexus', 'runtime'), { recursive: true });
    fs.mkdirSync(path.join(worktreeRoot, '.nexus'), { recursive: true });

    fs.writeFileSync(path.join(sourceRoot, '.nexus', 'hooks.js'), 'module.exports = {};\n', 'utf8');
    fs.writeFileSync(
      path.join(sourceRoot, '.nexus', 'skills', 'bootstrap-foundation', 'SKILL.md'),
      '# Bootstrap\n',
      'utf8',
    );
    fs.writeFileSync(path.join(sourceRoot, '.nexus', 'runtime', 'temp.json'), '{}\n', 'utf8');
    fs.writeFileSync(path.join(worktreeRoot, '.nexus', 'stale.txt'), 'stale\n', 'utf8');

    ensureProjectControlPlaneSnapshot(sourceRoot, worktreeRoot);

    assert.equal(
      fs.readFileSync(path.join(worktreeRoot, '.nexus', 'hooks.js'), 'utf8').replace(/\r\n/g, '\n'),
      'module.exports = {};\n',
    );
    assert.ok(
      fs.existsSync(path.join(worktreeRoot, '.nexus', 'skills', 'bootstrap-foundation', 'SKILL.md')),
    );
    assert.equal(fs.existsSync(path.join(worktreeRoot, '.nexus', 'stale.txt')), false);
    assert.equal(fs.existsSync(path.join(worktreeRoot, '.nexus', 'runtime')), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('syncBranchBackedWorktreeWithBase fast-forwards a stale task branch to include the current base', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-branch-sync-'));
  const repoDir = path.join(tempRoot, 'repo');
  const worktreeDir = path.join(tempRoot, 'worktree');

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=martin']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'v1\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);
    runGit(repoDir, ['branch', 'nexus/tasks/gh-1/bootstrap']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'v2\n', 'utf8');
    runGit(repoDir, ['commit', '-am', 'base update']);

    runGit(repoDir, ['worktree', 'add', worktreeDir, 'nexus/tasks/gh-1/bootstrap']);
    assert.equal(runGit(worktreeDir, ['rev-parse', '--short', 'HEAD']).length > 0, true);
    assert.equal(fs.readFileSync(path.join(worktreeDir, 'README.md'), 'utf8').replace(/\r\n/g, '\n'), 'v1\n');

    const result = await syncBranchBackedWorktreeWithBase(repoDir, worktreeDir, 'martin');

    assert.equal(result.synced, true);
    assert.equal(result.reason, 'fast-forwarded');
    assert.equal(fs.readFileSync(path.join(worktreeDir, 'README.md'), 'utf8').replace(/\r\n/g, '\n'), 'v2\n');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('syncBranchBackedWorktreeWithBase clears control-plane drift before fast-forwarding', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-branch-sync-drift-'));
  const repoDir = path.join(tempRoot, 'repo');
  const worktreeDir = path.join(tempRoot, 'worktree');

  try {
    fs.mkdirSync(path.join(repoDir, '.nexus', 'skills', 'project-scope'), { recursive: true });
    runGit(tempRoot, ['init', '--initial-branch=martin', repoDir]);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'v1\n', 'utf8');
    fs.writeFileSync(path.join(repoDir, '.nexus', 'hooks.js'), 'module.exports = {};\n', 'utf8');
    fs.writeFileSync(
      path.join(repoDir, '.nexus', 'skills', 'project-scope', 'SKILL.md'),
      '# Scope\n',
      'utf8',
    );
    runGit(repoDir, ['add', '.']);
    runGit(repoDir, ['commit', '-m', 'initial']);
    runGit(repoDir, ['branch', 'nexus/tasks/gh-1/bootstrap']);

    fs.mkdirSync(path.join(repoDir, '.nexus', 'skills', 'bootstrap-foundation'), { recursive: true });
    fs.writeFileSync(path.join(repoDir, '.nexus', 'hooks.js'), 'module.exports = { updated: true };\n', 'utf8');
    fs.writeFileSync(
      path.join(repoDir, '.nexus', 'skills', 'bootstrap-foundation', 'SKILL.md'),
      '# Bootstrap\n',
      'utf8',
    );
    runGit(repoDir, ['add', '.']);
    runGit(repoDir, ['commit', '-m', 'base control-plane update']);

    runGit(repoDir, ['worktree', 'add', worktreeDir, 'nexus/tasks/gh-1/bootstrap']);
    fs.writeFileSync(path.join(worktreeDir, '.nexus', 'hooks.js'), 'module.exports = { drift: true };\n', 'utf8');
    fs.mkdirSync(path.join(worktreeDir, '.nexus', 'skills', 'bootstrap-foundation'), { recursive: true });
    fs.writeFileSync(
      path.join(worktreeDir, '.nexus', 'skills', 'bootstrap-foundation', 'SKILL.md'),
      '# Drift Bootstrap\n',
      'utf8',
    );

    const result = await syncBranchBackedWorktreeWithBase(repoDir, worktreeDir, 'martin');

    assert.equal(result.synced, true);
    assert.equal(result.reason, 'fast-forwarded');
    assert.equal(
      fs.readFileSync(path.join(worktreeDir, '.nexus', 'hooks.js'), 'utf8').replace(/\r\n/g, '\n'),
      'module.exports = { updated: true };\n',
    );
    assert.equal(
      fs.readFileSync(path.join(worktreeDir, '.nexus', 'skills', 'bootstrap-foundation', 'SKILL.md'), 'utf8').replace(/\r\n/g, '\n'),
      '# Bootstrap\n',
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('syncBranchBackedWorktreeWithRefs applies completed dependency branches on top of the current base', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-dependency-sync-'));
  const repoDir = path.join(tempRoot, 'repo');
  const worktreeDir = path.join(tempRoot, 'worktree');

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=martin']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'v1\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);
    runGit(repoDir, ['branch', 'nexus/tasks/gh-1/bootstrap']);
    runGit(repoDir, ['branch', 'nexus/tasks/gh-2/mobile-base']);

    runGit(repoDir, ['checkout', 'nexus/tasks/gh-1/bootstrap']);
    fs.writeFileSync(path.join(repoDir, 'melos.yaml'), 'name: workspace\n', 'utf8');
    runGit(repoDir, ['add', 'melos.yaml']);
    runGit(repoDir, ['commit', '-m', 'bootstrap workspace']);

    runGit(repoDir, ['checkout', 'martin']);
    fs.writeFileSync(path.join(repoDir, 'README.md'), 'v2\n', 'utf8');
    runGit(repoDir, ['commit', '-am', 'base update']);

    runGit(repoDir, ['worktree', 'add', worktreeDir, 'nexus/tasks/gh-2/mobile-base']);
    assert.equal(fs.existsSync(path.join(worktreeDir, 'melos.yaml')), false);
    assert.equal(fs.readFileSync(path.join(worktreeDir, 'README.md'), 'utf8').replace(/\r\n/g, '\n'), 'v1\n');

    const result = await syncBranchBackedWorktreeWithRefs(
      repoDir,
      worktreeDir,
      ['martin', 'nexus/tasks/gh-1/bootstrap'],
    );

    assert.equal(result.synced, true);
    assert.equal(fs.readFileSync(path.join(worktreeDir, 'README.md'), 'utf8').replace(/\r\n/g, '\n'), 'v2\n');
    assert.equal(fs.readFileSync(path.join(worktreeDir, 'melos.yaml'), 'utf8').replace(/\r\n/g, '\n'), 'name: workspace\n');
    assert.equal(
      result.refs.some((entry) => entry.requestedRef === 'nexus/tasks/gh-1/bootstrap' && entry.synced),
      true,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureTaskWorkspace aborts promptly when workspace preparation is cancelled during a base merge', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-prep-abort-'));
  const repoDir = path.join(tempRoot, 'repo');
  const fakeBinDir = path.join(tempRoot, 'fake-bin');
  const fakeGitPath = path.join(fakeBinDir, 'git');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };
  const branchName = buildTaskBranchName(
    {
      taskId: 'GH-16',
      taskTitle: 'GTMNY-016 Chat realtime com historico persistido',
    },
    env,
  );
  const realGit = spawnSync('which', ['git'], { encoding: 'utf8' }).stdout.trim();

  try {
    assert.ok(realGit, 'git real não encontrado para o teste');
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(repoDir, ['checkout', '-b', branchName]);
    fs.writeFileSync(path.join(repoDir, 'task.txt'), 'task\n', 'utf8');
    runGit(repoDir, ['add', 'task.txt']);
    runGit(repoDir, ['commit', '-m', 'task change']);

    runGit(repoDir, ['checkout', 'main']);
    fs.writeFileSync(path.join(repoDir, 'base.txt'), 'base update\n', 'utf8');
    runGit(repoDir, ['add', 'base.txt']);
    runGit(repoDir, ['commit', '-m', 'base update']);

    fs.mkdirSync(fakeBinDir, { recursive: true });
    fs.writeFileSync(
      fakeGitPath,
      [
        '#!/usr/bin/env sh',
        'set -eu',
        `REAL_GIT=${JSON.stringify(realGit)}`,
        'case " $* " in',
        '  *" merge --no-edit "*)',
        '    sleep 5',
        '    ;;',
        'esac',
        'exec "$REAL_GIT" "$@"',
        '',
      ].join('\n'),
      'utf8',
    );
    fs.chmodSync(fakeGitPath, 0o755);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };
    const originalPath = process.env.PATH || '';
    const abortController = new AbortController();
    const abortTimer = setTimeout(() => {
      abortController.abort();
    }, 150);
    const startedAt = Date.now();
    process.env.PATH = `${fakeBinDir}:${originalPath}`;

    try {
      await assert.rejects(
        ensureTaskWorkspace(projectContext, {
          agentId: 'dev',
          instanceId: 'tester',
          ownerId: 'tester',
          taskId: 'GH-16',
          taskTitle: 'GTMNY-016 Chat realtime com historico persistido',
          requestKind: 'primary',
          env,
          workspaceRunContext: {
            signal: abortController.signal,
          },
        }),
        (error) => {
          const signal = `${error?.name || ''} ${error?.code || ''} ${error?.message || ''}`;
          assert.match(signal, /AbortError|ABORT_ERR|aborted/i);
          return true;
        },
      );
    } finally {
      clearTimeout(abortTimer);
      process.env.PATH = originalPath;
    }

    assert.ok(Date.now() - startedAt < 4000, 'cancelamento do preparo demorou além do esperado');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureTaskWorkspace rebuilds and snapshots stale task branches when base sync hits a merge conflict', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-base-sync-conflict-'));
  const repoDir = path.join(tempRoot, 'repo');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };
  const branchName = buildTaskBranchName(
    {
      taskId: 'GH-9',
      taskTitle: 'GTMNY-009 Discovery engine: schema, ranking e endpoint inicial',
    },
    env,
  );

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'initial\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(repoDir, ['checkout', '-b', branchName]);
    fs.writeFileSync(path.join(repoDir, 'README.md'), 'task-version\n', 'utf8');
    runGit(repoDir, ['commit', '-am', 'task change']);

    runGit(repoDir, ['checkout', 'main']);
    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base-version\n', 'utf8');
    runGit(repoDir, ['commit', '-am', 'base change']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const workspace = await ensureTaskWorkspace(projectContext, {
      agentId: 'architect',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-9',
      taskTitle: 'GTMNY-009 Discovery engine: schema, ranking e endpoint inicial',
      requestKind: 'primary',
      env,
    });

    assert.equal(workspace.metadata.baseBranch, 'main');
    assert.match(String(workspace.metadata.baseSync.reason || ''), /^(already-up-to-date|merged)$/);
    assert.equal(workspace.metadata.branchResetReason, 'base-sync-merge-conflict');
    assert.match(String(workspace.metadata.preservedBranchName || ''), /^nexus\/archive\/gh-9\/base-conflict-/);
    assert.equal(fs.readFileSync(path.join(workspace.path, 'README.md'), 'utf8').replace(/\r\n/g, '\n'), 'base-version\n');
    assert.equal(
      runGit(repoDir, ['show', `${workspace.metadata.preservedBranchName}:README.md`]),
      'task-version',
    );
    assert.equal(
      runGit(repoDir, ['branch', '--list', 'nexus/recovery/*'])
        .split(/\r?\n/)
        .map((line) => line.trim())
        .filter(Boolean)
        .length,
      0,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureTaskWorkspace resets a rejected task branch before reusing it and force-pushes the rebuilt history', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-reset-branch-'));
  const repoDir = path.join(tempRoot, 'repo');
  const remoteDir = path.join(tempRoot, 'remote.git');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_REMOTE: 'origin',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };
  const branchName = buildTaskBranchName(
    {
      taskId: 'GH-3',
      taskTitle: 'GTMNY-003 API FastAPI base com configuracao, healthcheck e contratos',
    },
    env,
  );

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(tempRoot, ['init', '--bare', remoteDir]);
    runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
    runGit(repoDir, ['push', '-u', 'origin', 'main']);

    runGit(repoDir, ['checkout', '-b', branchName]);
    fs.writeFileSync(path.join(repoDir, 'stale.txt'), 'stale\n', 'utf8');
    runGit(repoDir, ['add', 'stale.txt']);
    runGit(repoDir, ['commit', '-m', 'stale branch']);
    runGit(repoDir, ['push', '-u', 'origin', branchName]);
    runGit(repoDir, ['checkout', 'main']);

    const managedRoot = path.join(env.NEXUS_WORKTREE_ROOT, env.NEXUS_INSTANCE_ID);
    const staleWorkspacePath = path.join(managedRoot, 'stale-gh-3');
    fs.mkdirSync(managedRoot, { recursive: true });
    runGit(repoDir, ['worktree', 'add', staleWorkspacePath, branchName]);
    fs.writeFileSync(
      path.join(staleWorkspacePath, '.nexus-worktree.json'),
      JSON.stringify({
        taskId: 'GH-3',
        agentId: 'architect',
        requestKind: 'primary',
        instanceId: 'tester',
        ownerId: 'tester',
        branchName,
        publishStatus: 'pushed',
      }, null, 2),
      'utf8',
    );

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const workspace = await ensureTaskWorkspace(projectContext, {
      agentId: 'architect',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-3',
      taskTitle: 'GTMNY-003 API FastAPI base com configuracao, healthcheck e contratos',
      requestKind: 'primary',
      forceFreshBranch: true,
      env,
    });

    assert.equal(fs.existsSync(staleWorkspacePath), false);
    assert.equal(workspace.metadata.requiresForcePush, true);
    assert.equal(fs.existsSync(path.join(workspace.path, 'stale.txt')), false);

    fs.writeFileSync(path.join(workspace.path, 'clean.txt'), 'clean\n', 'utf8');
    const integration = await integrateTaskWorkspaceChanges(projectContext, workspace, {
      agentId: 'architect',
      taskId: 'GH-3',
      taskTitle: 'GTMNY-003 API FastAPI base com configuracao, healthcheck e contratos',
      requestKind: 'primary',
      stage: 'implementation',
      env,
    });

    assert.equal(integration.integrated, true);
    runGit(repoDir, ['fetch', 'origin', branchName]);

    const cleanResult = spawnSync(
      'git',
      ['-C', repoDir, 'show', `origin/${branchName}:clean.txt`],
      { encoding: 'utf8' },
    );
    assert.equal(cleanResult.status, 0, cleanResult.stderr || cleanResult.stdout);
    assert.equal(cleanResult.stdout.trim(), 'clean');

    const staleResult = spawnSync(
      'git',
      ['-C', repoDir, 'show', `origin/${branchName}:stale.txt`],
      { encoding: 'utf8' },
    );
    assert.notEqual(staleResult.status, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureTaskWorkspace rebuilds a task branch when the tracked base branch changed', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-base-mismatch-'));
  const repoDir = path.join(tempRoot, 'repo');
  const remoteDir = path.join(tempRoot, 'remote.git');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_REMOTE: 'origin',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };
  const branchName = buildTaskBranchName(
    {
      taskId: 'GH-10',
      taskTitle: 'GTMNY-010 Feed de descoberta em Flutter com swipe e cards de perfil',
    },
    env,
  );

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(repoDir, ['checkout', '-b', 'martin']);
    fs.writeFileSync(path.join(repoDir, 'stale-base.txt'), 'legacy\n', 'utf8');
    runGit(repoDir, ['add', 'stale-base.txt']);
    runGit(repoDir, ['commit', '-m', 'legacy base']);
    runGit(repoDir, ['checkout', '-b', branchName]);
    runGit(repoDir, ['commit', '--allow-empty', '-m', 'stale task branch']);
    runGit(repoDir, ['checkout', 'main']);

    runGit(tempRoot, ['init', '--bare', remoteDir]);
    runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
    runGit(repoDir, ['push', '-u', 'origin', 'main']);
    runGit(repoDir, ['push', '-u', 'origin', branchName]);

    const managedRoot = path.join(env.NEXUS_WORKTREE_ROOT, env.NEXUS_INSTANCE_ID);
    const staleWorkspacePath = path.join(managedRoot, 'stale-gh-10');
    fs.mkdirSync(managedRoot, { recursive: true });
    runGit(repoDir, ['worktree', 'add', staleWorkspacePath, branchName]);
    fs.writeFileSync(
      path.join(staleWorkspacePath, '.nexus-worktree.json'),
      JSON.stringify({
        taskId: 'GH-10',
        agentId: 'dev',
        requestKind: 'primary',
        instanceId: 'tester',
        ownerId: 'tester',
        branchName,
        baseBranch: 'martin',
        publishStatus: 'pushed',
      }, null, 2),
      'utf8',
    );

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const workspace = await ensureTaskWorkspace(projectContext, {
      agentId: 'dev',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-10',
      taskTitle: 'GTMNY-010 Feed de descoberta em Flutter com swipe e cards de perfil',
      requestKind: 'primary',
      env,
    });

    assert.equal(workspace.metadata.baseBranch, 'main');
    assert.equal(workspace.metadata.requiresForcePush, true);
    assert.equal(workspace.metadata.branchResetReason, 'base-branch-changed');
    assert.equal(fs.existsSync(staleWorkspacePath), false);
    assert.equal(fs.existsSync(path.join(workspace.path, 'stale-base.txt')), false);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureTaskWorkspace honors an explicit task base branch before any phase base branch map', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-explicit-base-over-phase-'));
  const repoDir = path.join(tempRoot, 'repo');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_LOCAL_PROJECT_BRANCH_BASE_MODE: 'explicit',
    NEXUS_PHASE_TASK_BASE_BRANCH_MAP: '1=martin,2=martin',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'initial\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const workspace = await ensureTaskWorkspace(projectContext, {
      agentId: 'architect',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-1',
      taskTitle: 'TTM-001 Base operativa do sistema',
      requestKind: 'primary',
      phase: 'Fase 1 - Fundacao e Infraestrutura',
      env,
    });

    assert.equal(workspace.metadata.baseBranch, 'main');
    assert.equal(fs.readFileSync(path.join(workspace.path, 'README.md'), 'utf8').replace(/\r\n/g, '\n'), 'initial\n');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureTaskWorkspace fast-forwards a reused task worktree when the remote task branch is ahead', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-remote-ahead-'));
  const repoDir = path.join(tempRoot, 'repo');
  const remoteDir = path.join(tempRoot, 'remote.git');
  const remoteCloneDir = path.join(tempRoot, 'remote-clone');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_REMOTE: 'origin',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };
  const taskOptions = {
    agentId: 'dev',
    instanceId: 'tester',
    ownerId: 'tester',
    taskId: 'GH-42',
    taskTitle: 'GTMNY-040 Completar moderação operacional do MVP',
    requestKind: 'primary',
    env,
  };
  const branchName = buildTaskBranchName(taskOptions, env);

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(tempRoot, ['init', '--bare', remoteDir]);
    runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
    runGit(repoDir, ['push', '-u', 'origin', 'main']);

    runGit(repoDir, ['checkout', '-b', branchName]);
    fs.writeFileSync(path.join(repoDir, 'task.txt'), 'local\n', 'utf8');
    runGit(repoDir, ['add', 'task.txt']);
    runGit(repoDir, ['commit', '-m', 'task baseline']);
    runGit(repoDir, ['push', '-u', 'origin', branchName]);
    runGit(repoDir, ['checkout', 'main']);

    runGit(tempRoot, ['clone', remoteDir, remoteCloneDir]);
    runGit(remoteCloneDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(remoteCloneDir, ['config', 'user.email', 'nexus-tests@example.com']);
    runGit(remoteCloneDir, ['checkout', '--track', `origin/${branchName}`]);
    fs.writeFileSync(path.join(remoteCloneDir, 'remote-ahead.txt'), 'remote\n', 'utf8');
    runGit(remoteCloneDir, ['add', 'remote-ahead.txt']);
    runGit(remoteCloneDir, ['commit', '-m', 'remote ahead']);
    runGit(remoteCloneDir, ['push', 'origin', branchName]);

    const managedRoot = path.join(env.NEXUS_WORKTREE_ROOT, env.NEXUS_INSTANCE_ID);
    const staleWorkspacePath = path.join(managedRoot, 'stale-gh-42');
    fs.mkdirSync(managedRoot, { recursive: true });
    runGit(repoDir, ['worktree', 'add', staleWorkspacePath, branchName]);
    fs.writeFileSync(
      path.join(staleWorkspacePath, '.nexus-worktree.json'),
      JSON.stringify({
        taskId: 'GH-42',
        agentId: 'dev',
        requestKind: 'primary',
        instanceId: 'tester',
        ownerId: 'tester',
        branchName,
        baseBranch: 'main',
      }, null, 2),
      'utf8',
    );

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const workspace = await ensureTaskWorkspace(projectContext, taskOptions);

    assert.equal(workspace.path.toLowerCase().replace(/\\/g, '/'), staleWorkspacePath.toLowerCase().replace(/\\/g, '/'));
    assert.equal(fs.existsSync(path.join(workspace.path, 'remote-ahead.txt')), true);
    assert.equal(
      runGit(repoDir, ['rev-list', '--left-right', '--count', `${branchName}...origin/${branchName}`]),
      '0\t0',
    );
    assert.ok(
      workspace.metadata.baseSync.refs.some(
        (entry) =>
          entry.requestedRef === `origin/${branchName}` &&
          ['fast-forwarded', 'already-up-to-date'].includes(entry.reason),
      ),
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureTaskWorkspace preserves published branch metadata on rerun of the same task branch', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-preserve-publish-'));
  const repoDir = path.join(tempRoot, 'repo');
  const remoteDir = path.join(tempRoot, 'remote.git');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_REMOTE: 'origin',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(tempRoot, ['init', '--bare', remoteDir]);
    runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
    runGit(repoDir, ['push', '-u', 'origin', 'main']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const taskOptions = {
      agentId: 'dev',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-11',
      taskTitle: 'GTMNY-011 Preferencias de busca e filtros do discovery',
      requestKind: 'primary',
      env,
    };

    const firstWorkspace = await ensureTaskWorkspace(projectContext, taskOptions);
    fs.writeFileSync(path.join(firstWorkspace.path, 'feature.txt'), 'published\n', 'utf8');
    const integration = await integrateTaskWorkspaceChanges(projectContext, firstWorkspace, {
      ...taskOptions,
      stage: 'implementation',
    });

    assert.equal(integration.integrated, true);

    const rerunWorkspace = await ensureTaskWorkspace(projectContext, taskOptions);
    assert.equal(rerunWorkspace.path, firstWorkspace.path);
    assert.equal(rerunWorkspace.metadata.publishStatus, 'pushed');
    assert.equal(rerunWorkspace.metadata.publishedCommitSha, integration.commitSha);
    assert.ok(rerunWorkspace.metadata.publishedAt);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('integrateTaskWorkspaceChanges treats an already-published clean task branch as integrated', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-published-clean-'));
  const repoDir = path.join(tempRoot, 'repo');
  const remoteDir = path.join(tempRoot, 'remote.git');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_REMOTE: 'origin',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(tempRoot, ['init', '--bare', remoteDir]);
    runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
    runGit(repoDir, ['push', '-u', 'origin', 'main']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const taskOptions = {
      agentId: 'dev',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-11',
      taskTitle: 'GTMNY-011 Preferencias de busca e filtros do discovery',
      requestKind: 'primary',
      env,
    };

    const workspace = await ensureTaskWorkspace(projectContext, taskOptions);
    fs.writeFileSync(path.join(workspace.path, 'feature.txt'), 'published\n', 'utf8');
    const publishedIntegration = await integrateTaskWorkspaceChanges(projectContext, workspace, {
      ...taskOptions,
      stage: 'implementation',
    });

    assert.equal(publishedIntegration.integrated, true);

    const cleanIntegration = await integrateTaskWorkspaceChanges(projectContext, workspace, {
      ...taskOptions,
      stage: 'implementation',
    });

    assert.equal(cleanIntegration.integrated, true);
    assert.equal(cleanIntegration.reason, 'branch-already-published');
    assert.equal(cleanIntegration.commitSha, publishedIntegration.commitSha);
    assert.equal(
      cleanIntegration.changedFiles.some((entry) => entry.includes('feature.txt')),
      true,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('integrateTaskWorkspaceChanges treats a task branch already absorbed into base as integrated', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-published-merged-'));
  const repoDir = path.join(tempRoot, 'repo');
  const remoteDir = path.join(tempRoot, 'remote.git');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_REMOTE: 'origin',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(tempRoot, ['init', '--bare', remoteDir]);
    runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
    runGit(repoDir, ['push', '-u', 'origin', 'main']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const taskOptions = {
      agentId: 'dev',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-12',
      taskTitle: 'GTMNY-012 Likes, dislikes e super like do discovery',
      requestKind: 'primary',
      env,
    };

    const workspace = await ensureTaskWorkspace(projectContext, taskOptions);
    fs.writeFileSync(path.join(workspace.path, 'feature.txt'), 'published\n', 'utf8');
    const publishedIntegration = await integrateTaskWorkspaceChanges(projectContext, workspace, {
      ...taskOptions,
      stage: 'implementation',
    });

    assert.equal(publishedIntegration.integrated, true);

    runGit(repoDir, ['checkout', 'main']);
    runGit(repoDir, ['merge', '--no-ff', taskOptions.taskTitle ? buildTaskBranchName(taskOptions, env) : 'HEAD', '-m', 'merge task branch']);
    runGit(repoDir, ['push', 'origin', 'main']);

    const mergedIntegration = await integrateTaskWorkspaceChanges(projectContext, workspace, {
      ...taskOptions,
      stage: 'implementation',
    });

    assert.equal(mergedIntegration.integrated, true);
    assert.equal(mergedIntegration.reason, 'branch-already-merged');
    assert.equal(mergedIntegration.commitSha, publishedIntegration.commitSha);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('integrateTaskWorkspaceChanges ignores review venv artifacts and reuses the published task branch', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-generated-artifacts-'));
  const repoDir = path.join(tempRoot, 'repo');
  const remoteDir = path.join(tempRoot, 'remote.git');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_REMOTE: 'origin',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(tempRoot, ['init', '--bare', remoteDir]);
    runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
    runGit(repoDir, ['push', '-u', 'origin', 'main']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const taskOptions = {
      agentId: 'qa_review',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-14',
      taskTitle: 'TTM-014 Review-only acceptance lane',
      requestKind: 'primary',
      env,
    };

    const workspace = await ensureTaskWorkspace(projectContext, taskOptions);
    fs.writeFileSync(path.join(workspace.path, 'feature.txt'), 'published\n', 'utf8');
    const publishedIntegration = await integrateTaskWorkspaceChanges(projectContext, workspace, {
      ...taskOptions,
      stage: 'implementation',
    });

    assert.equal(publishedIntegration.integrated, true);

    fs.mkdirSync(path.join(workspace.path, '.venv-review', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(workspace.path, '.venv-review', 'bin', 'python'), '', 'utf8');

    const reviewIntegration = await integrateTaskWorkspaceChanges(projectContext, workspace, {
      ...taskOptions,
      stage: 'review',
    });

    assert.equal(reviewIntegration.integrated, true);
    assert.equal(reviewIntegration.reason, 'branch-already-published');
    assert.equal(reviewIntegration.commitSha, publishedIntegration.commitSha);
    assert.equal(
      reviewIntegration.changedFiles.some((entry) => entry.includes('feature.txt')),
      true,
    );
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('resolveTaskBranchAbsorption treats patch-equivalent task commits as already integrated', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-branch-absorption-equivalent-'));
  const repoDir = path.join(tempRoot, 'repo');
  const env = {
    ...process.env,
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_BASE: 'main',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    const taskOptions = {
      taskId: 'GH-13',
      taskTitle: 'GTMNY-013 Cache de discovery e expiracao local',
    };
    const branchName = buildTaskBranchName(taskOptions, env);
    runGit(repoDir, ['checkout', '-b', branchName]);

    fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'line-1\n', 'utf8');
    runGit(repoDir, ['add', 'feature.txt']);
    runGit(repoDir, ['commit', '-m', 'task change 1']);
    const firstCommit = runGit(repoDir, ['rev-parse', 'HEAD']);

    fs.appendFileSync(path.join(repoDir, 'feature.txt'), 'line-2\n', 'utf8');
    runGit(repoDir, ['add', 'feature.txt']);
    runGit(repoDir, ['commit', '-m', 'task change 2']);
    const secondCommit = runGit(repoDir, ['rev-parse', 'HEAD']);

    runGit(repoDir, ['checkout', 'main']);
    runGit(repoDir, ['cherry-pick', firstCommit, secondCommit]);

    const absorption = await resolveTaskBranchAbsorption(repoDir, taskOptions, env);

    assert.equal(absorption.integrated, true);
    assert.match(absorption.reason, /^branch-already-(absorbed|merged)$/);
    assert.deepEqual(absorption.unabsorbedCommitShas, []);
    assert.equal(absorption.branchName, branchName);
    assert.equal(absorption.baseBranch, 'main');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('resolveTaskBranchAbsorption reports task commits that are still missing from the base branch', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-branch-absorption-missing-'));
  const repoDir = path.join(tempRoot, 'repo');
  const env = {
    ...process.env,
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_BASE: 'main',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    const taskOptions = {
      taskId: 'GH-14',
      taskTitle: 'GTMNY-014 Matches e entrada para chat',
    };
    const branchName = buildTaskBranchName(taskOptions, env);
    runGit(repoDir, ['checkout', '-b', branchName]);

    fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'pending\n', 'utf8');
    runGit(repoDir, ['add', 'feature.txt']);
    runGit(repoDir, ['commit', '-m', 'task change pending']);

    runGit(repoDir, ['checkout', 'main']);

    const absorption = await resolveTaskBranchAbsorption(repoDir, taskOptions, env);

    assert.equal(absorption.integrated, false);
    assert.equal(absorption.reason, 'branch-has-unabsorbed-commits');
    assert.equal(absorption.unabsorbedCommitShas.length, 1);
    assert.equal(absorption.branchName, branchName);
    assert.equal(absorption.baseBranch, 'main');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('resolveTaskBranchAbsorption falls back to the task-id branch prefix when the issue title changes', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-branch-absorption-title-drift-'));
  const repoDir = path.join(tempRoot, 'repo');
  const env = {
    ...process.env,
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_BASE: 'main',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    const originalTask = {
      taskId: 'GH-15',
      taskTitle: 'GTMNY-015 Testes de carga do endpoint de discovery',
    };
    const branchName = buildTaskBranchName(originalTask, env);
    runGit(repoDir, ['checkout', '-b', branchName]);

    fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'published\n', 'utf8');
    runGit(repoDir, ['add', 'feature.txt']);
    runGit(repoDir, ['commit', '-m', 'task change']);

    runGit(repoDir, ['checkout', 'main']);

    const absorption = await resolveTaskBranchAbsorption(
      repoDir,
      {
        taskId: 'GH-15',
        taskTitle: 'GTMNY-015 Titulo renomeado depois da publicacao',
      },
      env,
    );

    assert.equal(absorption.integrated, false);
    assert.equal(absorption.reason, 'branch-has-unabsorbed-commits');
    assert.equal(absorption.branchName, branchName);
    assert.equal(absorption.unabsorbedCommitShas.length, 1);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('resolveTaskBranchAbsorption ignores stale branch prefixes from unrelated backlog families', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-branch-absorption-stale-family-'));
  const repoDir = path.join(tempRoot, 'repo');
  const env = {
    ...process.env,
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_BASE: 'main',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    const staleBranchName = 'nexus/tasks/gh-39/gtmny-037-migrar-discovery-geoes';
    runGit(repoDir, ['checkout', '-b', staleBranchName]);

    fs.writeFileSync(path.join(repoDir, 'stale.txt'), 'legacy\n', 'utf8');
    runGit(repoDir, ['add', 'stale.txt']);
    runGit(repoDir, ['commit', '-m', 'legacy branch from another backlog family']);

    runGit(repoDir, ['checkout', 'main']);

    const taskOptions = {
      taskId: 'GH-39',
      taskTitle: 'ARC-HACK-001 [P0] Implement Circle payment intent and verification flow for priced agent actions',
    };
    const expectedCanonicalBranchName = buildTaskBranchName(taskOptions, env);
    const absorption = await resolveTaskBranchAbsorption(repoDir, taskOptions, env);

    assert.equal(absorption.integrated, false);
    assert.equal(absorption.reason, 'branch-not-found');
    assert.equal(absorption.branchRef, null);
    assert.equal(absorption.branchName, expectedCanonicalBranchName);
    assert.deepEqual(absorption.unabsorbedCommitShas, []);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('promotePublishedTaskBranchToBase fast-forwards a published task branch into the base branch', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-promote-fast-forward-'));
  const repoDir = path.join(tempRoot, 'repo');
  const remoteDir = path.join(tempRoot, 'remote.git');
  const branchName = 'nexus/tasks/gh-40/realtime-chat';
  const env = {
    ...process.env,
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(tempRoot, ['init', '--bare', remoteDir]);
    runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
    runGit(repoDir, ['push', '-u', 'origin', 'main']);

    runGit(repoDir, ['checkout', '-b', branchName]);
    fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'branch payload\n', 'utf8');
    runGit(repoDir, ['add', 'feature.txt']);
    runGit(repoDir, ['commit', '-m', 'task change']);
    const branchCommit = runGit(repoDir, ['rev-parse', 'HEAD']);
    runGit(repoDir, ['push', '-u', 'origin', branchName]);
    runGit(repoDir, ['checkout', 'main']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const promotion = await promotePublishedTaskBranchToBase(projectContext, {
      taskId: 'GH-40',
      branchName,
      baseBranch: 'main',
      pushRemote: 'origin',
      env,
    });

    assert.equal(promotion.promoted, true);
    assert.equal(promotion.reason, 'fast-forwarded');
    assert.equal(promotion.targetBranch, branchName);
    assert.equal(promotion.baseBranch, 'main');
    assert.equal(promotion.commitSha, branchCommit);

    runGit(repoDir, ['fetch', 'origin', 'main']);
    assert.equal(runGit(repoDir, ['rev-parse', 'origin/main']), branchCommit);
    assert.equal(runGit(repoDir, ['show', 'origin/main:feature.txt']), 'branch payload');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('promotePublishedTaskBranchToBase short-circuits when the published branch is already merged', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-promote-already-merged-'));
  const repoDir = path.join(tempRoot, 'repo');
  const remoteDir = path.join(tempRoot, 'remote.git');
  const branchName = 'nexus/tasks/gh-41/onboarding-final';
  const env = {
    ...process.env,
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(tempRoot, ['init', '--bare', remoteDir]);
    runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
    runGit(repoDir, ['push', '-u', 'origin', 'main']);

    runGit(repoDir, ['checkout', '-b', branchName]);
    fs.writeFileSync(path.join(repoDir, 'feature.txt'), 'already merged\n', 'utf8');
    runGit(repoDir, ['add', 'feature.txt']);
    runGit(repoDir, ['commit', '-m', 'task change']);
    const branchCommit = runGit(repoDir, ['rev-parse', 'HEAD']);
    runGit(repoDir, ['push', '-u', 'origin', branchName]);

    runGit(repoDir, ['checkout', 'main']);
    runGit(repoDir, ['merge', '--ff-only', branchName]);
    runGit(repoDir, ['push', 'origin', 'main']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const promotion = await promotePublishedTaskBranchToBase(projectContext, {
      taskId: 'GH-41',
      branchName,
      baseBranch: 'main',
      pushRemote: 'origin',
      env,
    });

    assert.equal(promotion.promoted, true);
    assert.equal(promotion.reason, 'branch-already-merged');
    assert.equal(promotion.targetBranch, branchName);
    assert.equal(promotion.baseBranch, 'main');
    assert.equal(promotion.commitSha, branchCommit);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('integrateTaskWorkspaceChanges ignores project control-plane drift when publishing a task branch', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-ignore-control-plane-'));
  const repoDir = path.join(tempRoot, 'repo');
  const remoteDir = path.join(tempRoot, 'remote.git');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_REMOTE: 'origin',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };

  try {
    fs.mkdirSync(path.join(repoDir, '.nexus'), { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    fs.writeFileSync(path.join(repoDir, '.nexus', 'hooks.js'), 'module.exports = { stable: true };\n', 'utf8');
    runGit(repoDir, ['add', '.']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(tempRoot, ['init', '--bare', remoteDir]);
    runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
    runGit(repoDir, ['push', '-u', 'origin', 'main']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const workspace = await ensureTaskWorkspace(projectContext, {
      agentId: 'dev',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-2',
      taskTitle: 'GTMNY-002 App Flutter base com navegacao, tema e shells mobile/web',
      requestKind: 'primary',
      env,
    });

    fs.writeFileSync(path.join(workspace.path, 'feature.txt'), 'real task output\n', 'utf8');
    fs.writeFileSync(
      path.join(workspace.path, '.nexus', 'hooks.js'),
      'module.exports = { drift: true };\n',
      'utf8',
    );
    fs.mkdirSync(path.join(workspace.path, '.nexus', 'contracts', 'gh-2'), { recursive: true });
    fs.writeFileSync(
      path.join(workspace.path, '.nexus', 'contracts', 'gh-2', 'spec.md'),
      '# contract drift\n',
      'utf8',
    );

    const integration = await integrateTaskWorkspaceChanges(projectContext, workspace, {
      agentId: 'dev',
      taskId: 'GH-2',
      taskTitle: 'GTMNY-002 App Flutter base com navegacao, tema e shells mobile/web',
      requestKind: 'primary',
      stage: 'implementation',
      env,
    });

    assert.equal(integration.integrated, true);
    assert.equal(
      integration.changedFiles.some((entry) => entry.includes('.nexus/hooks.js')),
      false,
    );
    assert.equal(
      integration.changedFiles.some((entry) => entry.includes('.nexus/contracts/')),
      false,
    );

    const branchName = workspace.metadata.branchName;
    runGit(repoDir, ['fetch', 'origin', branchName]);
    assert.equal(
      runGit(repoDir, ['show', `origin/${branchName}:feature.txt`]),
      'real task output',
    );
    assert.equal(
      runGit(repoDir, ['show', `origin/${branchName}:.nexus/hooks.js`]),
      'module.exports = { stable: true };',
    );
    const contractResult = spawnSync(
      'git',
      ['-C', repoDir, 'show', `origin/${branchName}:.nexus/contracts/gh-2/spec.md`],
      { encoding: 'utf8' },
    );
    assert.notEqual(contractResult.status, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('integrateTaskWorkspaceChanges excludes generated runtime artifacts from autonomous commits', async () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-workspace-ignore-generated-artifacts-'));
  const repoDir = path.join(tempRoot, 'repo');
  const remoteDir = path.join(tempRoot, 'remote.git');
  const env = {
    ...process.env,
    NEXUS_WORKTREE_INTEGRATION_MODE: 'branch',
    NEXUS_TASK_BRANCH_PREFIX: 'nexus/tasks',
    NEXUS_TASK_BRANCH_REMOTE: 'origin',
    NEXUS_TASK_BRANCH_BASE: 'main',
    NEXUS_WORKTREE_ROOT: path.join(tempRoot, 'managed-worktrees'),
    NEXUS_INSTANCE_ID: 'tester',
    NEXUS_INSTANCE_OWNER: 'tester',
  };

  try {
    fs.mkdirSync(repoDir, { recursive: true });
    runGit(repoDir, ['init', '--initial-branch=main']);
    runGit(repoDir, ['config', 'user.name', 'Nexus Tests']);
    runGit(repoDir, ['config', 'user.email', 'nexus-tests@example.com']);

    fs.writeFileSync(path.join(repoDir, 'README.md'), 'base\n', 'utf8');
    runGit(repoDir, ['add', 'README.md']);
    runGit(repoDir, ['commit', '-m', 'initial']);

    runGit(tempRoot, ['init', '--bare', remoteDir]);
    runGit(repoDir, ['remote', 'add', 'origin', remoteDir]);
    runGit(repoDir, ['push', '-u', 'origin', 'main']);

    const projectContext = {
      projectDir: repoDir,
      gitRoot: repoDir,
      isolatedWorktreesSupported: true,
      instanceId: 'tester',
    };

    const workspace = await ensureTaskWorkspace(projectContext, {
      agentId: 'qa',
      instanceId: 'tester',
      ownerId: 'tester',
      taskId: 'GH-15',
      taskTitle: 'GTMNY-015 Testes de carga do endpoint de discovery',
      requestKind: 'primary',
      env,
    });

    fs.writeFileSync(path.join(workspace.path, 'feature.txt'), 'real task output\n', 'utf8');
    fs.mkdirSync(path.join(workspace.path, 'services', 'api', '.review-venv', 'bin'), {
      recursive: true,
    });
    fs.writeFileSync(
      path.join(workspace.path, 'services', 'api', '.review-venv', 'bin', 'python'),
      '# mock runtime\n',
      'utf8',
    );

    const integration = await integrateTaskWorkspaceChanges(projectContext, workspace, {
      agentId: 'qa',
      taskId: 'GH-15',
      taskTitle: 'GTMNY-015 Testes de carga do endpoint de discovery',
      requestKind: 'primary',
      stage: 'review',
      env,
    });

    assert.equal(integration.integrated, true);
    assert.equal(
      integration.changedFiles.some((entry) => entry.includes('.review-venv')),
      false,
    );
    assert.deepEqual(integration.blockedFiles, ['services/api/.review-venv/bin/python']);

    const branchName = workspace.metadata.branchName;
    runGit(repoDir, ['fetch', 'origin', branchName]);
    assert.equal(runGit(repoDir, ['show', `origin/${branchName}:feature.txt`]), 'real task output');

    const blockedResult = spawnSync(
      'git',
      ['-C', repoDir, 'show', `origin/${branchName}:services/api/.review-venv/bin/python`],
      { encoding: 'utf8' },
    );
    assert.notEqual(blockedResult.status, 0);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
