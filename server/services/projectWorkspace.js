const { AsyncLocalStorage } = require('async_hooks');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const {
  buildInstanceScopedPath,
  resolveNexusInstanceId,
  resolveNexusInstanceOwner,
} = require('./instanceIdentity');
const {
  ensureGitLabBranchPipeline,
  mirrorBranchToGitLab,
} = require('./gitlabMirror');
const { resolvePhaseTaskBaseBranchName } = require('./phaseRelease');

let worktreeMutationQueue = Promise.resolve();
const workspaceGitRunContext = new AsyncLocalStorage();
const NEXUS_GIT_USER_NAME = process.env.NEXUS_GIT_USER_NAME || 'Nexus Orchestrator';
const NEXUS_GIT_USER_EMAIL = process.env.NEXUS_GIT_USER_EMAIL || 'nexus-orchestrator@local';
const WORKTREE_METADATA_FILENAME = '.nexus-worktree.json';
const CURRENT_INSTANCE_ID = resolveNexusInstanceId();
const CURRENT_INSTANCE_OWNER = resolveNexusInstanceOwner();
const CONTROL_PLANE_SNAPSHOT_ENTRIES = ['.nexus'];
const CONTROL_PLANE_SNAPSHOT_IGNORED_SEGMENTS = new Set(['runtime', 'node_modules']);
const GENERATED_WORKSPACE_SEGMENTS = new Set([
  '.venv',
  '.venv-review',
  '.review-venv',
  'venv',
  '__pycache__',
  '.pytest_cache',
  '.mypy_cache',
  '.ruff_cache',
]);
const GENERATED_WORKSPACE_SUFFIXES = ['.pyc', '.pyo', '.pyd'];

function buildGitIdentityEnv() {
  return {
    ...process.env,
    GIT_AUTHOR_NAME: NEXUS_GIT_USER_NAME,
    GIT_AUTHOR_EMAIL: NEXUS_GIT_USER_EMAIL,
    GIT_COMMITTER_NAME: NEXUS_GIT_USER_NAME,
    GIT_COMMITTER_EMAIL: NEXUS_GIT_USER_EMAIL,
  };
}

function translateWindowsPath(inputPath) {
  const match = /^([a-zA-Z]):\\(.*)$/.exec(inputPath || '');
  if (!match) return inputPath;
  return `/mnt/${match[1].toLowerCase()}/${match[2].replace(/\\/g, '/')}`;
}

function normalizeSegment(value) {
  return String(value || '').trim().toLowerCase().replace(/\.git$/i, '');
}

function normalizeBoolean(value, fallback = false) {
  if (value === undefined || value === null || value === '') return Boolean(fallback);
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return Boolean(fallback);
}

function parseRemoteRef(remoteUrl) {
  const value = String(remoteUrl || '').trim();
  if (!value) return null;

  const match = value.match(/[:/]([^/:]+)\/([^/]+?)(?:\.git)?$/);
  if (!match) return null;

  return {
    owner: normalizeSegment(match[1]),
    repo: normalizeSegment(match[2]),
  };
}

function buildCandidatePaths(configuredProjectDir, workspaceRoot, repoName) {
  const candidates = new Set();

  const addCandidate = (candidate) => {
    if (!candidate) return;
    const trimmed = String(candidate).trim();
    if (!trimmed) return;
    candidates.add(trimmed);

    if (/^[a-zA-Z]:\\/.test(trimmed)) {
      candidates.add(translateWindowsPath(trimmed));
    }

    if (!path.isAbsolute(trimmed)) {
      candidates.add(path.resolve(workspaceRoot, trimmed));
    }
  };

  addCandidate(configuredProjectDir);
  addCandidate(workspaceRoot);
  addCandidate(path.join(workspaceRoot, repoName));
  addCandidate(path.join(path.dirname(workspaceRoot), repoName));
  addCandidate(path.join('/mnt/c/SITES', repoName));
  addCandidate(path.join('/mnt/c/SITES/CRM', repoName));
  addCandidate(path.join('/mnt/c/SITES/gemini', repoName));

  const sitesRoot = '/mnt/c/SITES';
  if (fs.existsSync(sitesRoot)) {
    fs.readdirSync(sitesRoot, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .forEach((entry) => addCandidate(path.join(sitesRoot, entry.name, repoName)));
  }

  return Array.from(candidates)
    .map((candidate) => path.resolve(candidate))
    .filter((candidate, index, all) => all.indexOf(candidate) === index)
    .filter((candidate) => fs.existsSync(candidate));
}

function runGit(cwd, args, extraOptions = {}) {
  const result = spawnSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
    ...extraOptions,
  });

  if (result.status === 0) {
    return (result.stdout || '').trim();
  }

  const message = (result.stderr || result.stdout || `git ${args.join(' ')} failed`).trim();
  const error = new Error(message);
  error.status = result.status;
  error.stdout = result.stdout;
  error.stderr = result.stderr;
  throw error;
}

function resolveWorkspaceGitRunContext(extraOptions = {}) {
  if (extraOptions?.workspaceRunContext && typeof extraOptions.workspaceRunContext === 'object') {
    return extraOptions.workspaceRunContext;
  }
  return workspaceGitRunContext.getStore() || null;
}

function tryRunGit(cwd, args, extraOptions = {}) {
  try {
    return runGit(cwd, args, extraOptions);
  } catch (error) {
    return null;
  }
}

function runGitAsync(cwd, args, extraOptions = {}) {
  return new Promise((resolve, reject) => {
    const workspaceRunContext = resolveWorkspaceGitRunContext(extraOptions);
    const spawnOptions = {
      stdio: ['ignore', 'pipe', 'pipe'],
      ...extraOptions,
    };
    delete spawnOptions.workspaceRunContext;
    if (!spawnOptions.signal && workspaceRunContext?.signal) {
      spawnOptions.signal = workspaceRunContext.signal;
    }

    const gitProcess = spawn('git', ['-C', cwd, ...args], {
      ...spawnOptions,
    });
    const trackedProcessMeta = { cwd, args: [...args] };
    if (typeof workspaceRunContext?.registerProcess === 'function') {
      workspaceRunContext.registerProcess(gitProcess, trackedProcessMeta);
    }

    let stdout = '';
    let stderr = '';
    let settled = false;

    const finish = (handler) => (value) => {
      if (settled) {
        return;
      }
      settled = true;
      if (typeof workspaceRunContext?.unregisterProcess === 'function') {
        workspaceRunContext.unregisterProcess(gitProcess, trackedProcessMeta);
      }
      handler(value);
    };
    const resolveOnce = finish(resolve);
    const rejectOnce = finish(reject);

    gitProcess.stdout.on('data', (data) => {
      stdout += data.toString();
    });

    gitProcess.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    gitProcess.on('error', rejectOnce);

    gitProcess.on('close', (code) => {
      if (code === 0) {
        resolveOnce(stdout.trim());
        return;
      }

      const message = (stderr || stdout || `git ${args.join(' ')} failed`).trim();
      const error = new Error(message);
      error.status = code;
      error.stdout = stdout;
      error.stderr = stderr;
      rejectOnce(error);
    });
  });
}

async function tryRunGitAsync(cwd, args, extraOptions = {}) {
  try {
    return await runGitAsync(cwd, args, extraOptions);
  } catch (error) {
    return null;
  }
}

function getGitRoot(candidatePath) {
  if (!candidatePath || !fs.existsSync(candidatePath)) return null;
  return tryRunGit(candidatePath, ['rev-parse', '--show-toplevel']);
}

function repoMatchesRemote(gitRoot, owner, repoName) {
  const normalizedRepo = normalizeSegment(repoName);
  const normalizedOwner = normalizeSegment(owner);
  const remotesOutput = tryRunGit(gitRoot, ['remote', '-v']) || '';

  return remotesOutput.split(/\r?\n/).some((line) => {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 2) return false;
    const remote = parseRemoteRef(parts[1]);
    if (!remote) return false;
    if (remote.repo !== normalizedRepo) return false;
    if (normalizedOwner && remote.owner !== normalizedOwner) return false;
    return true;
  });
}

function discoverProjectContext(options = {}) {
  const workspaceRoot = path.resolve(options.workspaceRoot || process.cwd());
  const repoName = normalizeSegment(options.repoName || path.basename(workspaceRoot) || 'repo');
  const owner = options.owner || '';
  const configuredProjectDir = options.configuredProjectDir || '';
  const tried = [];
  const candidates = buildCandidatePaths(configuredProjectDir, workspaceRoot, repoName);
  const strictProjectDir = normalizeBoolean(options.strictProjectDir);

  if (strictProjectDir && configuredProjectDir) {
    const strictCandidate = path.resolve(translateWindowsPath(String(configuredProjectDir).trim()));
    if (fs.existsSync(strictCandidate)) {
      const gitRoot = getGitRoot(strictCandidate);
      tried.push({ candidate: strictCandidate, gitRoot, strict: true });
      return {
        projectDir: strictCandidate,
        gitRoot,
        isolatedWorktreesSupported: Boolean(gitRoot),
        source: `strict-configured:${strictCandidate}`,
        tried,
      };
    }
  }

  for (const candidate of candidates) {
    const gitRoot = getGitRoot(candidate);
    tried.push({ candidate, gitRoot });
    if (gitRoot && repoMatchesRemote(gitRoot, owner, repoName)) {
      return {
        projectDir: gitRoot,
        gitRoot,
        isolatedWorktreesSupported: true,
        source: `remote-match:${candidate}`,
        tried,
      };
    }
  }

  for (const candidate of candidates) {
    const gitRoot = getGitRoot(candidate);
    if (gitRoot && normalizeSegment(path.basename(gitRoot)) === repoName) {
      return {
        projectDir: gitRoot,
        gitRoot,
        isolatedWorktreesSupported: true,
        source: `name-match:${candidate}`,
        tried,
      };
    }
  }

  const fallback = candidates[0] || workspaceRoot;
  const gitRoot = getGitRoot(fallback);

  return {
    projectDir: fallback,
    gitRoot,
    isolatedWorktreesSupported: Boolean(gitRoot),
    source: candidates.length > 0 ? `fallback:${fallback}` : 'workspace-root',
    tried,
  };
}

function getManagedWorktreeRoot(projectContext) {
  const env = projectContext?.env || process.env;
  const configuredRoot = String(env.NEXUS_WORKTREE_ROOT || '').trim();
  const instanceId = projectContext?.instanceId || CURRENT_INSTANCE_ID;
  if (configuredRoot) {
    const translated = translateWindowsPath(configuredRoot);
    return buildInstanceScopedPath(translated, instanceId, env);
  }

  const projectDir = projectContext.gitRoot || projectContext.projectDir;
  if (process.platform !== 'win32' && String(projectDir || '').startsWith('/mnt/')) {
    return buildInstanceScopedPath(
      path.join(os.homedir(), '.nexus-worktrees', path.basename(projectDir)),
      instanceId,
      env,
    );
  }

  return buildInstanceScopedPath(
    path.join(path.dirname(projectDir), '.nexus-worktrees', path.basename(projectDir)),
    instanceId,
    env,
  );
}

function slugify(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[^\w\s-]/g, '')
    .trim()
    .toLowerCase()
    .replace(/[\s_]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
}

function buildWorktreeName(options = {}) {
  const taskKey = options.taskId || options.requestId || options.taskTitle || 'task';
  const pieces = [
    options.requestKind || 'task',
    options.instanceId || CURRENT_INSTANCE_ID,
    options.agentId || 'agent',
    taskKey,
  ]
    .map((part) => slugify(part))
    .filter(Boolean);

  const titleSlug = slugify(options.taskTitle || '').slice(0, 36);
  if (titleSlug) {
    pieces.push(titleSlug);
  }

  const rawName = pieces.join('-').slice(0, 96) || 'task';
  const hash = crypto
    .createHash('sha1')
    .update(JSON.stringify({
      agentId: options.agentId,
      taskId: options.taskId,
      taskTitle: options.taskTitle,
      requestKind: options.requestKind,
      parentTaskId: options.parentTaskId,
      requestId: options.requestId,
    }))
    .digest('hex')
    .slice(0, 8);

  return `${rawName}-${hash}`;
}

function resolveWorkspaceIntegrationMode(env = process.env) {
  const normalized = String(
    env.NEXUS_WORKTREE_INTEGRATION_MODE || env.NEXUS_TASK_INTEGRATION_MODE || 'cherry-pick',
  )
    .trim()
    .toLowerCase();

  if (['branch', 'task-branch', 'branch-push', 'branch_push'].includes(normalized)) {
    return 'branch';
  }

  return 'cherry-pick';
}

function sanitizeBranchSegment(value) {
  return slugify(value).slice(0, 48) || 'task';
}

function normalizeTaskTitleForBranch(options = {}) {
  const taskId = String(options.taskId || '').trim();
  const rawTitle = String(options.taskTitle || '').trim();
  if (!rawTitle) return '';

  const reviewPrefixPattern = taskId
    ? new RegExp(`^\\[review\\s+${taskId.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\]\\s*`, 'i')
    : /^\[review[^\]]*\]\s*/i;

  return rawTitle.replace(reviewPrefixPattern, '').trim();
}

function escapeRegExp(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function buildTaskBranchName(options = {}, env = process.env) {
  const rawPrefix = String(env.NEXUS_TASK_BRANCH_PREFIX || 'nexus/tasks').trim();
  const normalizedPrefix = rawPrefix
    .split('/')
    .map((segment) => sanitizeBranchSegment(segment))
    .filter(Boolean)
    .join('/');

  const branchSegments = [
    normalizedPrefix || 'nexus/tasks',
    sanitizeBranchSegment(options.taskId || options.requestId || 'task'),
  ];
  const titleSegment = sanitizeBranchSegment(normalizeTaskTitleForBranch(options)).slice(0, 32);
  if (titleSegment) {
    branchSegments.push(titleSegment);
  }
  return branchSegments.join('/');
}

function buildTaskBranchPrefix(options = {}, env = process.env) {
  const rawPrefix = String(env.NEXUS_TASK_BRANCH_PREFIX || 'nexus/tasks').trim();
  const normalizedPrefix = rawPrefix
    .split('/')
    .map((segment) => sanitizeBranchSegment(segment))
    .filter(Boolean)
    .join('/');
  const taskSegment = sanitizeBranchSegment(options.taskId || options.id || options.requestId || 'task');
  return [normalizedPrefix || 'nexus/tasks', taskSegment].filter(Boolean).join('/');
}

function resolveTaskBranchName(options = {}, env = process.env) {
  const explicitBranchName =
    String(
      options.branchName
      || options.targetBranch
      || options.remoteBranch
      || '',
    ).trim();
  if (explicitBranchName) {
    return explicitBranchName;
  }

  const taskId = String(options.taskId || options.id || options.requestId || '').trim();
  if (!taskId) {
    return '';
  }

  return buildTaskBranchName(
    {
      taskId,
      taskTitle: options.taskTitle || options.title || '',
    },
    env,
  );
}

function normalizeTaskBranchRefName(branchName, remoteName = '') {
  const normalizedRemoteName = String(remoteName || '').trim();
  let normalizedBranchName = String(branchName || '').trim();
  if (!normalizedBranchName) {
    return '';
  }

  normalizedBranchName = normalizedBranchName.replace(/^refs\/heads\//, '');
  if (normalizedRemoteName) {
    const remotePattern = escapeRegExp(normalizedRemoteName);
    normalizedBranchName = normalizedBranchName
      .replace(new RegExp(`^refs/remotes/${remotePattern}/`), '')
      .replace(new RegExp(`^${remotePattern}/`), '');
  } else {
    normalizedBranchName = normalizedBranchName.replace(/^refs\/remotes\/[^/]+\//, '');
  }

  return normalizedBranchName.trim();
}

function extractTaskTrackingSlug(options = {}) {
  const normalizedTitle = normalizeTaskTitleForBranch(options);
  const trackingMatch = normalizedTitle.match(/\b([a-z0-9]+(?:-[a-z0-9]+)*-\d+)\b/i);
  return trackingMatch ? slugify(trackingMatch[1]) : '';
}

function isTaskBranchCandidateCompatible(candidateBranchName, options = {}, env = process.env) {
  const remoteName = String(options.remoteName || resolveTaskBranchRemote(env)).trim();
  const normalizedCandidateBranch = normalizeTaskBranchRefName(candidateBranchName, remoteName);
  if (!normalizedCandidateBranch) {
    return false;
  }

  const canonicalBranchName = buildTaskBranchName(
    {
      taskId: options.taskId || options.id || options.requestId || '',
      taskTitle: options.taskTitle || options.title || '',
    },
    env,
  );
  if (normalizedCandidateBranch === canonicalBranchName) {
    return true;
  }

  const branchPrefix = buildTaskBranchPrefix(options, env);
  if (!branchPrefix || !normalizedCandidateBranch.startsWith(`${branchPrefix}/`)) {
    return false;
  }

  const trackingSlug = extractTaskTrackingSlug(options);
  if (!trackingSlug) {
    return true;
  }

  const branchSuffix = normalizedCandidateBranch.slice(branchPrefix.length + 1);
  return branchSuffix.includes(trackingSlug);
}

function resolveExistingGitRef(gitRoot, candidates = []) {
  for (const candidate of candidates) {
    const refName = String(candidate || '').trim();
    if (!refName) {
      continue;
    }
    if (tryRunGit(gitRoot, ['rev-parse', '--verify', refName])) {
      return refName;
    }
  }
  return null;
}

function parseGitCherryOutput(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => ({
      direction: line.slice(0, 1),
      sha: line.slice(1).trim(),
    }))
    .filter((entry) => ['+', '-'].includes(entry.direction) && entry.sha);
}

function listMatchingTaskBranchRefs(gitRoot, branchPrefix, remoteName = 'origin') {
  const normalizedPrefix = String(branchPrefix || '').trim().replace(/\/+$/, '');
  if (!normalizedPrefix) {
    return [];
  }

  const refs = [];
  const localOutput =
    tryRunGit(gitRoot, ['for-each-ref', '--format=%(refname:short)', `refs/heads/${normalizedPrefix}`])
    || '';
  refs.push(
    ...localOutput
      .split(/\r?\n/)
      .map((line) => String(line || '').trim())
      .filter(Boolean),
  );

  if (remoteName) {
    const remoteOutput =
      tryRunGit(
        gitRoot,
        ['for-each-ref', '--format=%(refname:short)', `refs/remotes/${remoteName}/${normalizedPrefix}`],
      )
      || '';
    refs.push(
      ...remoteOutput
        .split(/\r?\n/)
        .map((line) => String(line || '').trim())
        .filter(Boolean),
    );
  }

  return Array.from(new Set(refs)).sort((left, right) => {
    if (left.length !== right.length) {
      return left.length - right.length;
    }
    return left.localeCompare(right);
  });
}

async function resolveTaskBranchAbsorption(gitRoot, options = {}, env = process.env) {
  const canonicalBranchName = buildTaskBranchName(
    {
      taskId: options.taskId || options.id || options.requestId || '',
      taskTitle: options.taskTitle || options.title || '',
    },
    env,
  );
  const branchName = resolveTaskBranchName(options, env);
  const branchPrefix = buildTaskBranchPrefix(options, env);
  const remoteName = String(options.remoteName || resolveTaskBranchRemote(env)).trim();
  const baseBranch = String(options.baseBranch || resolveTaskBranchBase(gitRoot, env) || '').trim();
  const compatibleBranchCandidates = [];
  const appendCompatibleBranchCandidate = (candidateBranchName) => {
    const normalizedCandidate = normalizeTaskBranchRefName(candidateBranchName, remoteName);
    if (!normalizedCandidate) {
      return;
    }
    if (!isTaskBranchCandidateCompatible(normalizedCandidate, { ...options, remoteName }, env)) {
      return;
    }
    if (!compatibleBranchCandidates.includes(normalizedCandidate)) {
      compatibleBranchCandidates.push(normalizedCandidate);
    }
  };

  appendCompatibleBranchCandidate(branchName);
  appendCompatibleBranchCandidate(canonicalBranchName);
  listMatchingTaskBranchRefs(gitRoot, branchPrefix, remoteName).forEach(appendCompatibleBranchCandidate);
  const effectiveBranchName = canonicalBranchName || compatibleBranchCandidates[0] || branchName || null;

  if (!gitRoot || !effectiveBranchName || !baseBranch) {
    return {
      integrated: false,
      reason: 'missing-context',
      branchName: effectiveBranchName || null,
      branchRef: null,
      baseBranch: baseBranch || null,
      baseRef: null,
      absorbedCommitShas: [],
      unabsorbedCommitShas: [],
    };
  }

  const branchRef = resolveExistingGitRef(gitRoot, [
    ...compatibleBranchCandidates.flatMap((candidateBranchName) => [
      `refs/heads/${candidateBranchName}`,
      remoteName ? `refs/remotes/${remoteName}/${candidateBranchName}` : null,
      candidateBranchName,
      remoteName ? `${remoteName}/${candidateBranchName}` : null,
    ]),
  ]);
  if (!branchRef) {
    return {
      integrated: false,
      reason: 'branch-not-found',
      branchName: effectiveBranchName || branchPrefix,
      branchRef: null,
      baseBranch,
      baseRef: null,
      absorbedCommitShas: [],
      unabsorbedCommitShas: [],
    };
  }

  const baseRef = resolveExistingGitRef(gitRoot, [
    `refs/heads/${baseBranch}`,
    remoteName ? `refs/remotes/${remoteName}/${baseBranch}` : null,
    baseBranch,
    remoteName ? `${remoteName}/${baseBranch}` : null,
  ]);
  if (!baseRef) {
    return {
      integrated: false,
      reason: 'base-not-found',
      branchName: effectiveBranchName,
      branchRef,
      baseBranch,
      baseRef: null,
      absorbedCommitShas: [],
      unabsorbedCommitShas: [],
    };
  }

  const cherryEntries = parseGitCherryOutput(
    (await tryRunGitAsync(gitRoot, ['cherry', baseRef, branchRef])) || '',
  );
  const absorbedCommitShas = cherryEntries
    .filter((entry) => entry.direction === '-')
    .map((entry) => entry.sha);
  const unabsorbedCommitShas = cherryEntries
    .filter((entry) => entry.direction === '+')
    .map((entry) => entry.sha);
  const integrated = unabsorbedCommitShas.length === 0;
  const mergedIntoBase = integrated
    ? await (async () => {
        try {
          await runGitAsync(gitRoot, ['merge-base', '--is-ancestor', branchRef, baseRef], {
            env: buildGitIdentityEnv(),
          });
          return true;
        } catch (_error) {
          return false;
        }
      })()
    : false;

  return {
    integrated,
    reason: integrated
      ? (mergedIntoBase ? 'branch-already-merged' : 'branch-already-absorbed')
      : 'branch-has-unabsorbed-commits',
    branchName: normalizeTaskBranchRefName(branchRef, remoteName),
    branchRef,
    baseBranch,
    baseRef,
    absorbedCommitShas,
    unabsorbedCommitShas,
  };
}

function parseWorktreeList(output) {
  const worktrees = [];
  let current = null;

  output.split(/\r?\n/).forEach((line) => {
    if (line.startsWith('worktree ')) {
      if (current) worktrees.push(current);
      current = { path: path.resolve(line.slice('worktree '.length).trim()) };
      return;
    }

    if (!current) {
      return;
    }

    if (line.startsWith('branch ')) {
      current.branchName = String(line.slice('branch '.length).trim())
        .replace(/^refs\/heads\//, '')
        .trim() || null;
      return;
    }

    if (line === 'detached') {
      current.detached = true;
    }
  });

  if (current) worktrees.push(current);
  return worktrees;
}

function isRegisteredWorktree(gitRoot, worktreePath) {
  const output = tryRunGit(gitRoot, ['worktree', 'list', '--porcelain']) || '';
  const registeredPaths = parseWorktreeList(output).map((entry) => entry.path);
  return registeredPaths.includes(path.resolve(worktreePath));
}

async function isRegisteredWorktreeAsync(gitRoot, worktreePath) {
  const output = await tryRunGitAsync(gitRoot, ['worktree', 'list', '--porcelain']) || '';
  const registeredPaths = parseWorktreeList(output).map((entry) => entry.path);
  return registeredPaths.includes(path.resolve(worktreePath));
}

function pathExistsOrSymlink(targetPath) {
  try {
    fs.lstatSync(targetPath);
    return true;
  } catch (error) {
    return false;
  }
}

function ensureRemoved(targetPath) {
  fs.rmSync(targetPath, { recursive: true, force: true });
}

function getProtectedBranchNames(gitRoot) {
  const protectedNames = new Set([
    'main',
    'master',
    'development',
    'develop',
    'homolog',
    'staging',
    'production',
  ]);

  const currentBranch = tryRunGit(gitRoot, ['branch', '--show-current']);
  if (currentBranch) {
    protectedNames.add(String(currentBranch).trim());
  }

  return protectedNames;
}

function canDeleteTemporaryBranch(gitRoot, branchName) {
  const normalizedBranchName = String(branchName || '').trim();
  if (!normalizedBranchName) return false;

  const protectedNames = getProtectedBranchNames(gitRoot);
  if (protectedNames.has(normalizedBranchName)) {
    return false;
  }

  return Boolean(tryRunGit(gitRoot, ['rev-parse', '--verify', `refs/heads/${normalizedBranchName}`]));
}

function hasConfiguredRemote(gitRoot, remoteName) {
  return Boolean(
    remoteName &&
      tryRunGit(gitRoot, ['remote', 'get-url', String(remoteName).trim()]),
  );
}

function localBranchExists(gitRoot, branchName) {
  return Boolean(
    branchName && tryRunGit(gitRoot, ['rev-parse', '--verify', `refs/heads/${branchName}`]),
  );
}

async function remoteBranchExistsAsync(gitRoot, remoteName, branchName) {
  if (!hasConfiguredRemote(gitRoot, remoteName) || !branchName) {
    return false;
  }

  return Boolean(
    await tryRunGitAsync(gitRoot, ['ls-remote', '--exit-code', '--heads', remoteName, branchName]),
  );
}

function resolveTaskBranchRemote(env = process.env) {
  return String(env.NEXUS_TASK_BRANCH_REMOTE || 'origin').trim() || 'origin';
}

function resolveRemoteDefaultBranch(gitRoot, remoteName = 'origin') {
  const normalizedRemoteName = String(remoteName || '').trim() || 'origin';
  const remoteHeadRef =
    tryRunGit(gitRoot, ['symbolic-ref', '--quiet', '--short', `refs/remotes/${normalizedRemoteName}/HEAD`])
    || tryRunGit(gitRoot, ['rev-parse', '--abbrev-ref', `${normalizedRemoteName}/HEAD`]);

  const normalizedHeadRef = String(remoteHeadRef || '')
    .trim()
    .replace(/^refs\/remotes\//, '');
  if (normalizedHeadRef) {
    if (normalizedHeadRef.startsWith(`${normalizedRemoteName}/`)) {
      return normalizedHeadRef.slice(normalizedRemoteName.length + 1);
    }
    return normalizedHeadRef;
  }

  const fallbackBranches = ['main', 'master', 'develop', 'trunk'];
  for (const branchName of fallbackBranches) {
    if (
      tryRunGit(gitRoot, ['rev-parse', '--verify', `refs/heads/${branchName}`])
      || tryRunGit(gitRoot, ['rev-parse', '--verify', `refs/remotes/${normalizedRemoteName}/${branchName}`])
    ) {
      return branchName;
    }
  }

  return null;
}

function resolveTaskBranchBase(gitRoot, env = process.env) {
  const explicitBase = String(env.NEXUS_TASK_BRANCH_BASE || '').trim();
  const explicitBaseMode = explicitBase.toLowerCase();
  if (explicitBase && !['__current__', 'auto', 'current'].includes(explicitBaseMode)) {
    return explicitBase;
  }

  if (explicitBase && ['__current__', 'current'].includes(explicitBaseMode)) {
    return (
      tryRunGit(gitRoot, ['branch', '--show-current'])
      || resolveRemoteDefaultBranch(gitRoot, resolveTaskBranchRemote(env))
      || 'main'
    );
  }

  return (
    resolveRemoteDefaultBranch(gitRoot, resolveTaskBranchRemote(env))
    || tryRunGit(gitRoot, ['branch', '--show-current'])
    || 'main'
  );
}

function shouldSyncTaskBranchWithBase(env = process.env) {
  return String(env.NEXUS_TASK_BRANCH_SYNC_BASE || 'true').trim().toLowerCase() !== 'false';
}

function resolveTaskBranchStartPoint(gitRoot, baseBranch, env = process.env) {
  const normalizedBaseBranch = String(baseBranch || '').trim();
  const remoteName = resolveTaskBranchRemote(env);
  const candidateRefs = [];

  if (normalizedBaseBranch) {
    candidateRefs.push(normalizedBaseBranch);
    if (!normalizedBaseBranch.startsWith('refs/heads/')) {
      candidateRefs.push(`refs/heads/${normalizedBaseBranch}`);
    }
    if (!normalizedBaseBranch.startsWith('refs/remotes/')) {
      candidateRefs.push(`refs/remotes/${remoteName}/${normalizedBaseBranch}`);
    }
    if (!normalizedBaseBranch.startsWith(`${remoteName}/`)) {
      candidateRefs.push(`${remoteName}/${normalizedBaseBranch}`);
    }
  }

  for (const candidateRef of candidateRefs) {
    const resolvedRef = tryRunGit(gitRoot, ['rev-parse', '--verify', candidateRef]);
    if (resolvedRef) {
      return resolvedRef;
    }
  }

  if (normalizedBaseBranch) {
    return null;
  }

  const fallbackBaseBranch = resolveRemoteDefaultBranch(gitRoot, remoteName);
  if (fallbackBaseBranch) {
    return resolveTaskBranchStartPoint(gitRoot, fallbackBaseBranch, env);
  }

  return null;
}

function evaluateDependencyStartRefAgainstBase(gitRoot, baseRef, candidateRef, env = process.env) {
  const normalizedBaseRef = String(baseRef || '').trim() || null;
  const normalizedCandidateRef = String(candidateRef || '').trim() || null;
  const candidateStartPoint = normalizedCandidateRef
    ? resolveTaskBranchStartPoint(gitRoot, normalizedCandidateRef, env)
    : null;

  if (!normalizedCandidateRef || !candidateStartPoint) {
    return {
      include: false,
      reason: 'missing-candidate',
      baseRef: normalizedBaseRef,
      candidateRef: normalizedCandidateRef,
      baseStartPoint: null,
      candidateStartPoint: candidateStartPoint || null,
      leftOnly: null,
      rightOnly: null,
    };
  }

  const baseStartPoint = normalizedBaseRef
    ? resolveTaskBranchStartPoint(gitRoot, normalizedBaseRef, env)
    : null;
  if (!normalizedBaseRef || !baseStartPoint) {
    return {
      include: true,
      reason: 'missing-base',
      baseRef: normalizedBaseRef,
      candidateRef: normalizedCandidateRef,
      baseStartPoint: baseStartPoint || null,
      candidateStartPoint,
      leftOnly: null,
      rightOnly: null,
    };
  }

  const rawCounts = tryRunGit(gitRoot, [
    'rev-list',
    '--left-right',
    '--count',
    `${baseStartPoint}...${candidateStartPoint}`,
  ]);
  const [leftOnlyToken, rightOnlyToken] = String(rawCounts || '').trim().split(/\s+/);
  const leftOnly = Number(leftOnlyToken);
  const rightOnly = Number(rightOnlyToken);

  if (!Number.isFinite(leftOnly) || !Number.isFinite(rightOnly)) {
    return {
      include: true,
      reason: 'unknown-divergence',
      baseRef: normalizedBaseRef,
      candidateRef: normalizedCandidateRef,
      baseStartPoint,
      candidateStartPoint,
      leftOnly: null,
      rightOnly: null,
    };
  }

  if (rightOnly === 0) {
    return {
      include: false,
      reason: 'already-contained',
      baseRef: normalizedBaseRef,
      candidateRef: normalizedCandidateRef,
      baseStartPoint,
      candidateStartPoint,
      leftOnly,
      rightOnly,
    };
  }

  if (leftOnly === 0) {
    return {
      include: true,
      reason: 'ahead-only',
      baseRef: normalizedBaseRef,
      candidateRef: normalizedCandidateRef,
      baseStartPoint,
      candidateStartPoint,
      leftOnly,
      rightOnly,
    };
  }

  return {
    include: false,
    reason: 'diverged-from-base',
    baseRef: normalizedBaseRef,
    candidateRef: normalizedCandidateRef,
    baseStartPoint,
    candidateStartPoint,
    leftOnly,
    rightOnly,
  };
}

function shouldAutoResetTaskBranchOnBaseConflict(env = process.env) {
  return String(env.NEXUS_TASK_BRANCH_AUTO_RESET_ON_BASE_CONFLICT || 'true').trim().toLowerCase() !== 'false';
}

function buildBaseConflictBackupBranchName(branchName, taskId, timestamp = new Date()) {
  const taskSegment = sanitizeBranchSegment(taskId || path.basename(String(branchName || '').trim()) || 'task');
  const stamp = timestamp.toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  const hash = crypto
    .createHash('sha1')
    .update(`${String(branchName || '').trim()}:${taskSegment}:${stamp}`)
    .digest('hex')
    .slice(0, 8);
  return `nexus/archive/${taskSegment}/base-conflict-${stamp}-${hash}`;
}

function ensureUniqueLocalBranchName(gitRoot, branchName) {
  const normalizedBranchName = String(branchName || '').trim();
  if (!normalizedBranchName) return null;

  let candidate = normalizedBranchName;
  let suffix = 1;
  while (localBranchExists(gitRoot, candidate)) {
    candidate = `${normalizedBranchName}-${suffix}`;
    suffix += 1;
  }
  return candidate;
}

function shouldBlockOnBaseSyncFailure(baseSyncResult) {
  const reason = String(baseSyncResult?.reason || '').trim().toLowerCase();
  return reason === 'merge-conflict';
}

function buildRecoverySnapshotBranchName(branchName, reason = 'base-sync') {
  const normalizedBranch = String(branchName || '')
    .split('/')
    .map((segment) => sanitizeBranchSegment(segment))
    .filter(Boolean)
    .join('/');
  const normalizedReason = sanitizeBranchSegment(reason).slice(0, 24) || 'base-sync';
  const hash = crypto.randomBytes(4).toString('hex');

  return ['nexus', 'recovery', normalizedBranch || 'task', `${normalizedReason}-${hash}`].join('/');
}

async function createRecoverySnapshotBranch(gitRoot, branchName, reason = 'base-sync') {
  const normalizedBranch = String(branchName || '').trim();
  if (!localBranchExists(gitRoot, normalizedBranch)) {
    return null;
  }

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const candidate = buildRecoverySnapshotBranchName(normalizedBranch, `${reason}-${attempt + 1}`);
    if (localBranchExists(gitRoot, candidate)) {
      continue;
    }

    await runGitAsync(gitRoot, ['branch', candidate, normalizedBranch], {
      env: buildGitIdentityEnv(),
    });
    return candidate;
  }

  return null;
}

function buildBaseSyncFailureMessage(branchName, baseBranch, baseSync = {}) {
  const normalizedBranch = String(branchName || '').trim() || 'branch da task';
  const normalizedBase = String(baseBranch || '').trim() || 'base atual';
  const reason = String(baseSync.reason || '').trim() || 'falha desconhecida';
  const recoveryBranch = String(baseSync.recoveryBranch || '').trim() || null;
  const detailLine = String(baseSync.details || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  const fragments = [
    `A branch ${normalizedBranch} nao sincronizou com ${normalizedBase} (${reason}).`,
  ];

  if (recoveryBranch) {
    fragments.push(`Snapshot salvo em ${recoveryBranch}.`);
  }
  if (detailLine) {
    fragments.push(`Detalhe: ${detailLine}`);
  }

  return fragments.join(' ');
}

function normalizeStartRefs(refs = []) {
  const seen = new Set();
  return (Array.isArray(refs) ? refs : [])
    .map((ref) => String(ref || '').trim())
    .filter(Boolean)
    .filter((ref) => {
      if (seen.has(ref)) return false;
      seen.add(ref);
      return true;
    });
}

async function worktreeAlreadyContainsRef(worktreePath, ref) {
  if (!ref) return false;

  try {
    await runGitAsync(worktreePath, ['merge-base', '--is-ancestor', ref, 'HEAD']);
    return true;
  } catch (_error) {
    return false;
  }
}

async function cleanWorkspaceControlPlaneDrift(worktreePath) {
  await tryRunGitAsync(
    worktreePath,
    ['restore', '--worktree', '--staged', '--source=HEAD', '--', '.nexus'],
    { env: buildGitIdentityEnv() },
  );
  await tryRunGitAsync(
    worktreePath,
    ['clean', '-fd', '--', '.nexus'],
    { env: buildGitIdentityEnv() },
  );
}

async function preserveDirtyTaskBranchSnapshot(worktreePath, options = {}) {
  const rawWorkspaceStatus = (await tryRunGitAsync(worktreePath, ['status', '--porcelain'])) || '';
  const workspaceStatus = stripWorkspaceMetadataChanges(
    stripWorkspaceHousekeepingChanges(rawWorkspaceStatus),
  );
  if (!String(workspaceStatus).trim()) {
    if (String(rawWorkspaceStatus).trim()) {
      await cleanWorkspaceControlPlaneDrift(worktreePath);
    }
    return { preserved: false, reason: 'clean' };
  }

  const unresolvedConflicts = (await tryRunGitAsync(
    worktreePath,
    ['diff', '--name-only', '--diff-filter=U'],
  )) || '';
  if (String(unresolvedConflicts).trim()) {
    return { preserved: false, reason: 'unmerged-conflicts' };
  }

  await cleanWorkspaceControlPlaneDrift(worktreePath);
  await runGitAsync(worktreePath, ['add', '-A'], { env: buildGitIdentityEnv() });
  await tryRunGitAsync(worktreePath, ['reset', 'HEAD', '--', WORKTREE_METADATA_FILENAME], {
    env: buildGitIdentityEnv(),
  });
  const stagedChanges = stripWorkspaceMetadataChanges(
    (await tryRunGitAsync(worktreePath, ['diff', '--cached', '--name-status'])) || '',
  );
  if (!String(stagedChanges).trim()) {
    return { preserved: false, reason: 'nothing-staged' };
  }

  const taskId = String(options.taskId || '').trim() || 'task';
  const normalizedTitle = String(options.taskTitle || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 72);
  const message = [
    `nexus(backup): preserve ${taskId} before base reset`,
    normalizedTitle || null,
  ]
    .filter(Boolean)
    .join(': ');

  await runGitAsync(worktreePath, ['commit', '-m', message, '--no-verify'], {
    env: buildGitIdentityEnv(),
  });
  return { preserved: true, reason: 'committed' };
}

async function rebuildTaskBranchFromBase(
  gitRoot,
  worktreePath,
  branchName,
  baseBranch,
  remoteName,
  options = {},
) {
  const dirtySnapshotResult = await preserveDirtyTaskBranchSnapshot(worktreePath, options);
  const backupBranchName = ensureUniqueLocalBranchName(
    gitRoot,
    buildBaseConflictBackupBranchName(branchName, options.taskId),
  );

  await runGitAsync(gitRoot, ['branch', backupBranchName, branchName], {
    env: buildGitIdentityEnv(),
  });

  if (await isRegisteredWorktreeAsync(gitRoot, worktreePath)) {
    await tryRunGitAsync(gitRoot, ['worktree', 'remove', '--force', worktreePath]);
  }
  ensureRemoved(worktreePath);
  await tryRunGitAsync(gitRoot, ['worktree', 'prune']);

  const branchWorkspaceResult = await ensureBranchBackedWorktree(
    gitRoot,
    worktreePath,
    branchName,
    baseBranch,
    remoteName,
    { forceFreshStart: true },
  );

  return {
    backupBranchName,
    dirtySnapshotResult,
    branchWorkspaceResult,
  };
}

async function syncBranchBackedWorktreeWithBase(gitRoot, worktreePath, baseBranch, env = process.env) {
  return syncBranchBackedWorktreeWithRefs(gitRoot, worktreePath, [baseBranch], env);
}

async function resolveTaskBranchSyncRefs(
  gitRoot,
  branchName,
  baseBranch,
  dependencyStartRefs = [],
  remoteName,
  env = process.env,
) {
  const syncRefs = [];
  const normalizedBranchName = String(branchName || '').trim();
  const normalizedBaseBranch = String(baseBranch || '').trim();
  const normalizedRemoteName = String(remoteName || '').trim();

  if (normalizedRemoteName && hasConfiguredRemote(gitRoot, normalizedRemoteName)) {
    if (normalizedBranchName) {
      await tryRunGitAsync(
        gitRoot,
        ['fetch', '--quiet', normalizedRemoteName, normalizedBranchName],
        { env: buildGitIdentityEnv() },
      );
      const remoteBranchRef = `${normalizedRemoteName}/${normalizedBranchName}`;
      if (resolveTaskBranchStartPoint(gitRoot, remoteBranchRef, env)) {
        syncRefs.push(remoteBranchRef);
      }
    }

    if (normalizedBaseBranch) {
      await tryRunGitAsync(
        gitRoot,
        ['fetch', '--quiet', normalizedRemoteName, normalizedBaseBranch],
        { env: buildGitIdentityEnv() },
      );
    }
  }

  return normalizeStartRefs([
    ...syncRefs,
    normalizedBaseBranch,
    ...normalizeStartRefs(dependencyStartRefs),
  ]);
}

async function syncBranchBackedWorktreeWithRefs(gitRoot, worktreePath, refs = [], env = process.env) {
  if (!shouldSyncTaskBranchWithBase(env)) {
    return { synced: false, reason: 'disabled' };
  }

  const requestedRefs = normalizeStartRefs(refs);
  if (requestedRefs.length === 0) {
    return { synced: false, reason: 'missing-base' };
  }

  const results = [];

  for (const requestedRef of requestedRefs) {
    const baseRef = resolveTaskBranchStartPoint(gitRoot, requestedRef);
    if (!baseRef) {
      return {
        synced: results.some((entry) => entry.synced),
        reason: 'missing-base',
        baseRef: requestedRef,
        refs: results,
      };
    }

    if (await worktreeAlreadyContainsRef(worktreePath, baseRef)) {
      results.push({
        requestedRef,
        baseRef,
        synced: false,
        reason: 'already-up-to-date',
      });
      continue;
    }

    const rawWorkspaceStatus =
      (await tryRunGitAsync(worktreePath, ['status', '--porcelain'])) || '';
    const workspaceStatus = stripWorkspaceHousekeepingChanges(rawWorkspaceStatus);
    if (String(workspaceStatus).trim()) {
      return {
        synced: results.some((entry) => entry.synced),
        reason: 'dirty-worktree',
        baseRef,
        refs: results,
      };
    }

    if (String(rawWorkspaceStatus).trim()) {
      await cleanWorkspaceControlPlaneDrift(worktreePath);
    }

    try {
      await runGitAsync(worktreePath, ['merge', '--ff-only', baseRef], {
        env: buildGitIdentityEnv(),
      });
      results.push({
        requestedRef,
        baseRef,
        synced: true,
        reason: 'fast-forwarded',
      });
      continue;
    } catch (_fastForwardError) {
      try {
        await runGitAsync(worktreePath, ['merge', '--no-edit', baseRef], {
          env: buildGitIdentityEnv(),
        });
        results.push({
          requestedRef,
          baseRef,
          synced: true,
          reason: 'merged-base',
        });
      } catch (mergeError) {
        await tryRunGitAsync(worktreePath, ['merge', '--abort'], {
          env: buildGitIdentityEnv(),
        });
        return {
          synced: results.some((entry) => entry.synced),
          reason: 'merge-conflict',
          baseRef,
          details: mergeError.message,
          refs: results,
        };
      }
    }
  }

  const latestResult = results[results.length - 1] || null;
  return {
    synced: results.some((entry) => entry.synced),
    reason: latestResult?.reason || 'already-up-to-date',
    baseRef: latestResult?.baseRef || requestedRefs[0] || null,
    refs: results,
  };
}

function loadWorkspaceMetadata(worktreePath) {
  const metadataPath = path.join(path.resolve(worktreePath), WORKTREE_METADATA_FILENAME);
  if (!pathExistsOrSymlink(metadataPath)) return null;

  try {
    return JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
  } catch (error) {
    return null;
  }
}

function updateWorkspaceMetadata(worktreePath, patch = {}) {
  const current = loadWorkspaceMetadata(worktreePath) || {};
  const next = {
    ...current,
    ...patch,
  };
  writeWorkspaceMetadata(worktreePath, next);
  return next;
}

function enqueueWorktreeMutation(action) {
  const queuedRun = worktreeMutationQueue.then(() => action(), () => action());
  worktreeMutationQueue = queuedRun.catch(() => {});
  return queuedRun;
}

function ensureSharedRuntimeLinks(sourceRoot, worktreePath) {
  const links = [];
  const rootRuntimeEntries = ['node_modules', '.env', '.env.local', '.env.development'];

  rootRuntimeEntries.forEach((entry) => {
    const source = path.join(sourceRoot, entry);
    if (pathExistsOrSymlink(source)) {
      links.push({ source, target: path.join(worktreePath, entry) });
    }
  });

  fs.readdirSync(sourceRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .forEach((entry) => {
      ['node_modules', '.env', '.env.local', '.env.development'].forEach((runtimeEntry) => {
        const source = path.join(sourceRoot, entry.name, runtimeEntry);
        if (pathExistsOrSymlink(source)) {
          links.push({
            source,
            target: path.join(worktreePath, entry.name, runtimeEntry),
          });
        }
      });
    });

  links.forEach(({ source, target }) => {
    const sourceStats = fs.lstatSync(source);
    if (pathExistsOrSymlink(target)) {
      try {
        const targetStats = fs.lstatSync(target);
        if (targetStats.isSymbolicLink()) {
          const currentTarget = fs.readlinkSync(target);
          if (path.resolve(path.dirname(target), currentTarget) === path.resolve(source)) {
            return;
          }
        }
      } catch (error) {}

      return;
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.symlinkSync(source, target, sourceStats.isDirectory() ? 'dir' : 'file');
  });
}

function shouldCopyControlPlaneSource(rootSource, candidateSource) {
  const relative = path.relative(rootSource, candidateSource);
  if (!relative) return true;

  const segments = relative
    .split(path.sep)
    .map((segment) => segment.trim())
    .filter(Boolean);
  return !segments.some((segment) => CONTROL_PLANE_SNAPSHOT_IGNORED_SEGMENTS.has(segment));
}

function ensureProjectControlPlaneSnapshot(sourceRoot, worktreePath) {
  CONTROL_PLANE_SNAPSHOT_ENTRIES.forEach((entry) => {
    const source = path.join(sourceRoot, entry);
    const target = path.join(worktreePath, entry);

    if (!pathExistsOrSymlink(source)) {
      if (pathExistsOrSymlink(target)) {
        ensureRemoved(target);
      }
      return;
    }

    if (pathExistsOrSymlink(target)) {
      ensureRemoved(target);
    }

    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.cpSync(source, target, {
      recursive: true,
      force: true,
      dereference: false,
      filter: (candidateSource) => shouldCopyControlPlaneSource(source, candidateSource),
    });
  });
}

function isWorkspaceMetadataChangeLine(line) {
  const normalizedLine = String(line || '').trim();
  if (!normalizedLine) return false;
  return (
    normalizedLine.endsWith(WORKTREE_METADATA_FILENAME) ||
    normalizedLine.endsWith('.gemini/settings.json')
  );
}

function isWorkspaceControlPlaneChangeLine(line) {
  const normalizedLine = String(line || '').trim();
  if (!normalizedLine) return false;

  return (
    normalizedLine.includes('.nexus/hooks.js') ||
    normalizedLine.includes('.nexus/contracts/') ||
    normalizedLine.includes('.nexus/skills/')
  );
}

function extractWorkspaceChangePath(line) {
  const normalizedLine = String(line || '').trim();
  if (!normalizedLine) return null;

  const tabParts = normalizedLine.split('\t').map((part) => part.trim()).filter(Boolean);
  if (tabParts.length > 1) {
    return tabParts[tabParts.length - 1] || null;
  }

  const fallbackParts = normalizedLine.split(/\s+/).filter(Boolean);
  if (fallbackParts.length <= 1) {
    return null;
  }

  return fallbackParts.slice(1).join(' ').trim() || null;
}

function normalizeWorkspaceChangePath(filePath) {
  return String(filePath || '').trim().replace(/\\/g, '/');
}

function isGeneratedWorkspaceArtifactPath(filePath) {
  const normalizedPath = normalizeWorkspaceChangePath(filePath);
  if (!normalizedPath) return false;

  const loweredPath = normalizedPath.toLowerCase();
  const segments = loweredPath.split('/').filter(Boolean);
  if (segments.some((segment) => GENERATED_WORKSPACE_SEGMENTS.has(segment))) {
    return true;
  }
  if (segments.some((segment) => segment.endsWith('.egg-info'))) {
    return true;
  }

  return GENERATED_WORKSPACE_SUFFIXES.some((suffix) => loweredPath.endsWith(suffix));
}

function isGeneratedWorkspaceArtifactChangeLine(line) {
  return isGeneratedWorkspaceArtifactPath(extractWorkspaceChangePath(line));
}

function listGeneratedWorkspaceArtifactPaths(output) {
  return [...new Set(
    String(output || '')
      .split(/\r?\n/)
      .map((line) => extractWorkspaceChangePath(line))
      .map((filePath) => normalizeWorkspaceChangePath(filePath))
      .filter(Boolean)
      .filter((filePath) => isGeneratedWorkspaceArtifactPath(filePath)),
  )];
}

async function unstageWorkspacePaths(worktreePath, filePaths = []) {
  const uniquePaths = [...new Set(
    (Array.isArray(filePaths) ? filePaths : [])
      .map((filePath) => normalizeWorkspaceChangePath(filePath))
      .filter(Boolean),
  )];
  if (uniquePaths.length <= 0) {
    return;
  }

  for (let index = 0; index < uniquePaths.length; index += 100) {
    const batch = uniquePaths.slice(index, index + 100);
    await tryRunGitAsync(worktreePath, ['reset', 'HEAD', '--', ...batch], {
      env: buildGitIdentityEnv(),
    });
  }
}

function stripWorkspaceMetadataChanges(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isWorkspaceMetadataChangeLine(line))
    .join('\n');
}

function stripWorkspaceHousekeepingChanges(output) {
  return String(output || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !isWorkspaceMetadataChangeLine(line))
    .filter((line) => !isWorkspaceControlPlaneChangeLine(line))
    .filter((line) => !isGeneratedWorkspaceArtifactChangeLine(line))
    .join('\n');
}

function parseMeaningfulWorkspaceChanges(output) {
  return stripWorkspaceHousekeepingChanges(output)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function countMeaningfulWorkspaceChanges(worktreePath) {
  const statusOutput = tryRunGit(worktreePath, ['status', '--short', '--untracked-files=all']) || '';
  return parseMeaningfulWorkspaceChanges(statusOutput).length;
}

function isReusableWorkspaceCandidate(entry, options = {}, context = {}) {
  if (!entry?.path || !entry?.metadata) return false;
  if (!pathExistsOrSymlink(entry.path)) return false;

  const metadata = entry.metadata;
  const instanceId = String(context.instanceId || options.instanceId || CURRENT_INSTANCE_ID).trim();
  const ownerId = String(context.ownerId || options.ownerId || CURRENT_INSTANCE_OWNER).trim();
  const expectedTaskId = String(options.taskId || '').trim();
  const expectedAgentId = String(options.agentId || '').trim();
  const expectedRequestKind = String(options.requestKind || 'task').trim();
  const expectedParentTaskId = String(options.parentTaskId || '').trim();
  const expectedBranchName = String(context.branchName || '').trim();
  const expectedBaseBranch = String(context.baseBranch || '').trim();
  const publishStatus = String(metadata.publishStatus || '').trim().toLowerCase();

  if (!expectedTaskId || String(metadata.taskId || '').trim() !== expectedTaskId) return false;
  if (!expectedAgentId || String(metadata.agentId || '').trim() !== expectedAgentId) return false;
  if (String(metadata.requestKind || 'task').trim() !== expectedRequestKind) return false;
  if (String(metadata.instanceId || '').trim() !== instanceId) return false;
  if (ownerId && String(metadata.ownerId || '').trim() && String(metadata.ownerId || '').trim() !== ownerId) {
    return false;
  }
  if (expectedParentTaskId && String(metadata.parentTaskId || '').trim() !== expectedParentTaskId) {
    return false;
  }
  if (expectedBranchName && String(metadata.branchName || '').trim() && String(metadata.branchName || '').trim() !== expectedBranchName) {
    return false;
  }
  if (expectedBaseBranch && String(metadata.baseBranch || '').trim() && String(metadata.baseBranch || '').trim() !== expectedBaseBranch) {
    return false;
  }
  if (publishStatus === 'pushed') return false;

  return true;
}

function findReusableTaskWorkspace(projectContext, options = {}, context = {}) {
  const gitRoot = projectContext.gitRoot || getGitRoot(projectContext.projectDir);
  if (!gitRoot) return null;

  const candidates = listManagedWorkspaces({
    ...projectContext,
    instanceId: context.instanceId || options.instanceId || CURRENT_INSTANCE_ID,
  })
    .filter((entry) => isReusableWorkspaceCandidate(entry, options, context))
    .map((entry) => {
      const metadataTimestamp = Date.parse(entry.metadata?.updatedAt || entry.metadata?.createdAt || '') || 0;
      let filesystemTimestamp = 0;
      try {
        filesystemTimestamp = fs.statSync(entry.path).mtimeMs || 0;
      } catch (_error) {}

      return {
        ...entry,
        meaningfulChangeCount: countMeaningfulWorkspaceChanges(entry.path),
        registered: isRegisteredWorktree(gitRoot, entry.path),
        freshness: Math.max(metadataTimestamp, filesystemTimestamp),
      };
    })
    .filter((entry) => entry.registered)
    .sort((left, right) => {
      if (right.meaningfulChangeCount !== left.meaningfulChangeCount) {
        return right.meaningfulChangeCount - left.meaningfulChangeCount;
      }
      return right.freshness - left.freshness;
    });

  return candidates[0] || null;
}

function ensureWorkspaceMetadataIgnored(worktreePath) {
  const gitDir = tryRunGit(worktreePath, ['rev-parse', '--git-dir']);
  if (!gitDir) return;

  const excludePath = path.resolve(worktreePath, gitDir, 'info', 'exclude');
  const existing = fs.existsSync(excludePath) ? fs.readFileSync(excludePath, 'utf8') : '';
  const entries = new Set(
    existing
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  );
  if (entries.has(WORKTREE_METADATA_FILENAME) && entries.has('.gemini/settings.json')) {
    return;
  }

  fs.mkdirSync(path.dirname(excludePath), { recursive: true });
  const missingEntries = [WORKTREE_METADATA_FILENAME, '.gemini/settings.json'].filter(
    (entry) => !entries.has(entry),
  );
  const nextContent = `${existing.replace(/\s*$/, '')}${existing.trim() ? '\n' : ''}${missingEntries.join('\n')}\n`;
  fs.writeFileSync(excludePath, nextContent, 'utf8');
}

function writeWorkspaceMetadata(worktreePath, payload) {
  fs.writeFileSync(
    path.join(worktreePath, WORKTREE_METADATA_FILENAME),
    `${JSON.stringify(payload, null, 2)}\n`,
    'utf8',
  );
}

function buildAutonomousCommitMessage(options = {}) {
  const stage = options.stage === 'review' ? 'review' : 'implementation';
  const taskId = String(options.taskId || '').trim();
  const agentId = String(options.agentId || '').trim();
  const normalizedTitle = String(options.taskTitle || '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 96);

  const titleParts = [`nexus(${stage})`];
  if (taskId) titleParts.push(taskId);
  if (normalizedTitle) titleParts.push(normalizedTitle);
  if (agentId) titleParts.push(`[${agentId}]`);

  return titleParts.join(': ').replace(': [', ' [');
}

async function ensureBranchBackedWorktree(
  gitRoot,
  worktreePath,
  branchName,
  baseBranch,
  remoteName,
  options = {},
) {
  const forceFreshStart = Boolean(options.forceFreshStart);
  const remoteBranchPreviouslyExisted = await remoteBranchExistsAsync(gitRoot, remoteName, branchName);
  const startPoint = resolveTaskBranchStartPoint(gitRoot, baseBranch, options.env || process.env);
  if (!startPoint) {
    throw new Error(
      `Base da branch da task não encontrada: ${String(baseBranch || '').trim() || '(auto)'}. Configure NEXUS_TASK_BRANCH_BASE para uma branch existente.`,
    );
  }

  const managedProjectContext = options.projectContext || null;
  if (managedProjectContext && branchName) {
    await removeManagedWorkspacesForBranch(
      managedProjectContext,
      branchName,
      { keepPaths: [worktreePath] },
    );
  }

  if (forceFreshStart) {
    await runGitAsync(gitRoot, [
      'worktree',
      'add',
      '--force',
      '-B',
      branchName,
      worktreePath,
      startPoint,
    ]);
    return {
      branchReset: true,
      remoteBranchPreviouslyExisted,
    };
  }

  if (localBranchExists(gitRoot, branchName)) {
    await runGitAsync(gitRoot, ['worktree', 'add', '--force', worktreePath, branchName]);
    return {
      branchReset: false,
      remoteBranchPreviouslyExisted,
    };
  }

  if (remoteBranchPreviouslyExisted) {
    const fetchedBranch = await tryRunGitAsync(
      gitRoot,
      ['fetch', remoteName, `${branchName}:${branchName}`],
      { env: buildGitIdentityEnv() },
    );

    if (fetchedBranch === null && !localBranchExists(gitRoot, branchName)) {
      await runGitAsync(gitRoot, ['fetch', remoteName, branchName], {
        env: buildGitIdentityEnv(),
      });
      await runGitAsync(gitRoot, ['worktree', 'add', '-b', branchName, worktreePath, 'FETCH_HEAD']);
      return {
        branchReset: false,
        remoteBranchPreviouslyExisted,
      };
    }

    await runGitAsync(gitRoot, ['worktree', 'add', '--force', worktreePath, branchName]);
    return {
      branchReset: false,
      remoteBranchPreviouslyExisted,
    };
  }

  await runGitAsync(gitRoot, [
    'worktree',
    'add',
    '--force',
    '-b',
    branchName,
    worktreePath,
    startPoint,
  ]);
  return {
    branchReset: false,
    remoteBranchPreviouslyExisted,
  };
}

async function prepareWorkspaceCommit(worktreePath, options = {}) {
  const rawWorkspaceStatus = (await tryRunGitAsync(worktreePath, ['status', '--porcelain'])) || '';
  const workspaceStatus = stripWorkspaceMetadataChanges(
    stripWorkspaceHousekeepingChanges(rawWorkspaceStatus),
  );
  if (!String(workspaceStatus).trim() && String(rawWorkspaceStatus).trim()) {
    await cleanWorkspaceControlPlaneDrift(worktreePath);
  }
  if (!String(workspaceStatus).trim()) {
    return { prepared: false, reason: 'clean' };
  }

  await cleanWorkspaceControlPlaneDrift(worktreePath);
  await runGitAsync(worktreePath, ['add', '-A'], { env: buildGitIdentityEnv() });
  await tryRunGitAsync(worktreePath, ['reset', 'HEAD', '--', WORKTREE_METADATA_FILENAME], {
    env: buildGitIdentityEnv(),
  });
  const rawStagedChanges = stripWorkspaceMetadataChanges(
    (await tryRunGitAsync(worktreePath, ['diff', '--cached', '--name-status'])) || '',
  );
  const blockedGeneratedArtifacts = listGeneratedWorkspaceArtifactPaths(rawStagedChanges);
  if (blockedGeneratedArtifacts.length > 0) {
    await unstageWorkspacePaths(worktreePath, blockedGeneratedArtifacts);
  }
  const stagedChanges = stripWorkspaceMetadataChanges(
    (await tryRunGitAsync(worktreePath, ['diff', '--cached', '--name-status'])) || '',
  );
  if (!String(stagedChanges).trim()) {
    return {
      prepared: false,
      reason: blockedGeneratedArtifacts.length > 0 ? 'generated-artifacts-only' : 'nothing-staged',
      details:
        blockedGeneratedArtifacts.length > 0
          ? `Artefatos gerados foram ignorados do commit: ${blockedGeneratedArtifacts.slice(0, 10).join(', ')}`
          : null,
      blockedFiles: blockedGeneratedArtifacts,
      changedFiles: [],
    };
  }

  await runGitAsync(
    worktreePath,
    ['commit', '-m', buildAutonomousCommitMessage(options), '--no-verify'],
    { env: buildGitIdentityEnv() },
  );

  return {
    prepared: true,
    commitSha: await runGitAsync(worktreePath, ['rev-parse', 'HEAD']),
    changedFiles: stagedChanges
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
    blockedFiles: blockedGeneratedArtifacts,
  };
}

async function resolvePublishedBranchIntegration(gitRoot, workspaceMetadata = {}) {
  const branchName = String(workspaceMetadata.branchName || '').trim();
  const pushRemote = String(workspaceMetadata.pushRemote || '').trim();
  const baseBranch = String(workspaceMetadata.baseBranch || '').trim();
  if (!gitRoot || !branchName || !pushRemote || !hasConfiguredRemote(gitRoot, pushRemote)) {
    return null;
  }

  await tryRunGitAsync(gitRoot, ['fetch', '--quiet', pushRemote, branchName]);
  const remoteRef = `refs/remotes/${pushRemote}/${branchName}`;
  const remoteCommitSha = await tryRunGitAsync(gitRoot, ['rev-parse', '--verify', remoteRef]);
  const commitSha =
    String(remoteCommitSha || '').trim()
    || String(workspaceMetadata.publishedCommitSha || '').trim();
  if (!commitSha) {
    return null;
  }

  const comparisonBase =
    baseBranch
    || (await tryRunGitAsync(gitRoot, ['merge-base', remoteRef, 'HEAD']))
    || '';
  if (!comparisonBase) {
    return null;
  }

  const rawChangedFiles =
    (await tryRunGitAsync(gitRoot, ['diff', '--name-status', `${comparisonBase}...${remoteRef}`]))
    || '';
  const changedFiles = parseMeaningfulWorkspaceChanges(rawChangedFiles);
  if (changedFiles.length <= 0) {
    const mergedIntoBase = await (async () => {
      try {
        await runGitAsync(gitRoot, ['merge-base', '--is-ancestor', remoteRef, comparisonBase], {
          env: buildGitIdentityEnv(),
        });
        return true;
      } catch (_error) {
        return false;
      }
    })();

    if (!mergedIntoBase) {
      return null;
    }

    const rawAbsorbedFiles =
      (await tryRunGitAsync(gitRoot, ['diff', '--name-status', `${remoteRef}..${comparisonBase}`]))
      || '';
    return {
      integrated: true,
      reason: 'branch-already-merged',
      commitSha,
      targetBranch: branchName,
      baseBranch: baseBranch || null,
      remote: pushRemote,
      changedFiles: parseMeaningfulWorkspaceChanges(rawAbsorbedFiles),
    };
  }

  return {
    integrated: true,
    reason: 'branch-already-published',
    commitSha,
    targetBranch: branchName,
    baseBranch: baseBranch || null,
    remote: pushRemote,
    changedFiles,
  };
}

async function integrateWorkspaceByCherryPick(projectContext, workspace, options = {}) {
  const gitRoot = projectContext.gitRoot || getGitRoot(projectContext.projectDir);
  const worktreePath = path.resolve(workspace.path);
  const rootStatus = (await tryRunGitAsync(gitRoot, ['status', '--porcelain'])) || '';
  if (String(rootStatus).trim()) {
    return {
      integrated: false,
      reason: 'root-dirty',
      details: rootStatus.trim(),
    };
  }

  const preparedCommit = await prepareWorkspaceCommit(worktreePath, options);
  if (!preparedCommit.prepared) {
    return {
      integrated: false,
      reason: preparedCommit.reason,
      details: preparedCommit.details || null,
      changedFiles: preparedCommit.changedFiles || [],
      blockedFiles: preparedCommit.blockedFiles || [],
    };
  }

  const targetBranch = tryRunGit(gitRoot, ['branch', '--show-current']) || null;

  try {
    await runGitAsync(gitRoot, ['cherry-pick', '--allow-empty', preparedCommit.commitSha], {
      env: buildGitIdentityEnv(),
    });
  } catch (error) {
    await tryRunGitAsync(gitRoot, ['cherry-pick', '--abort'], {
      env: buildGitIdentityEnv(),
    });
    return {
      integrated: false,
      reason: 'cherry-pick-failed',
      details: error.message,
      commitSha: preparedCommit.commitSha,
      targetBranch,
      changedFiles: preparedCommit.changedFiles,
    };
  }

  return {
    integrated: true,
    reason: 'cherry-picked',
    commitSha: preparedCommit.commitSha,
    targetBranch,
    changedFiles: preparedCommit.changedFiles,
    blockedFiles: preparedCommit.blockedFiles || [],
  };
}

async function integrateWorkspaceByTaskBranch(projectContext, workspace, options = {}) {
  const gitRoot = projectContext.gitRoot || getGitRoot(projectContext.projectDir);
  const worktreePath = path.resolve(workspace.path);
  const workspaceMetadata = loadWorkspaceMetadata(worktreePath) || {};
  const branchName =
    String(workspaceMetadata.branchName || '').trim()
    || tryRunGit(worktreePath, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
    || null;
  const pushRemote = String(workspaceMetadata.pushRemote || resolveTaskBranchRemote()).trim() || 'origin';
  const baseBranch = String(workspaceMetadata.baseBranch || '').trim() || null;
  const requiresForcePush = Boolean(workspaceMetadata.requiresForcePush);

  const preparedCommit = await prepareWorkspaceCommit(worktreePath, options);
  if (!preparedCommit.prepared) {
    if (['clean', 'nothing-staged', 'generated-artifacts-only'].includes(String(preparedCommit.reason || '').trim())) {
      const publishedBranchIntegration = await resolvePublishedBranchIntegration(
        gitRoot,
        workspaceMetadata,
      );
      if (publishedBranchIntegration) {
        updateWorkspaceMetadata(worktreePath, {
          publishStatus: 'pushed',
          publishedCommitSha: publishedBranchIntegration.commitSha,
          publishedAt:
            String(workspaceMetadata.publishedAt || '').trim() || new Date().toISOString(),
          branchName,
          pushRemote,
          remoteBranch: branchName,
          requiresForcePush: false,
        });
        return publishedBranchIntegration;
      }
    }

    return {
      integrated: false,
      reason: preparedCommit.reason,
      details: preparedCommit.details || null,
      changedFiles: preparedCommit.changedFiles || [],
      blockedFiles: preparedCommit.blockedFiles || [],
      targetBranch: branchName,
      baseBranch,
    };
  }

  if (!branchName) {
    return {
      integrated: false,
      reason: 'branch-missing',
      details: 'Workspace branch nao encontrada para publicar a task.',
      commitSha: preparedCommit.commitSha,
      changedFiles: preparedCommit.changedFiles,
      targetBranch: null,
      baseBranch,
    };
  }

  if (!hasConfiguredRemote(gitRoot, pushRemote)) {
    return {
      integrated: false,
      reason: 'remote-missing',
      details: `Remote ${pushRemote} não encontrado.`,
      commitSha: preparedCommit.commitSha,
      changedFiles: preparedCommit.changedFiles,
      targetBranch: branchName,
      baseBranch,
    };
  }

  try {
    const pushArgs = ['push'];
    if (requiresForcePush) {
      pushArgs.push('--force-with-lease');
    }
    pushArgs.push('--set-upstream', pushRemote, `${branchName}:${branchName}`);
    await runGitAsync(worktreePath, pushArgs, { env: buildGitIdentityEnv() });
  } catch (error) {
    return {
      integrated: false,
      reason: 'push-failed',
      details: error.message,
      commitSha: preparedCommit.commitSha,
      changedFiles: preparedCommit.changedFiles,
      targetBranch: branchName,
      baseBranch,
    };
  }

  const publishedAt = new Date().toISOString();
  const previousPublishedCommitSha = String(workspaceMetadata.publishedCommitSha || '').trim() || null;
  const gitlabMirrorResult = mirrorBranchToGitLab(worktreePath, branchName, {
    env: options.env || process.env,
    forcePush: requiresForcePush,
  });
  let gitlabPipelineResult = null;
  if (gitlabMirrorResult.mirrored) {
    try {
      gitlabPipelineResult = await ensureGitLabBranchPipeline({
        env: options.env || process.env,
        branchName,
        commitSha: preparedCommit.commitSha,
      });
    } catch (error) {
      gitlabPipelineResult = {
        enabled: true,
        ensured: false,
        triggered: false,
        reason: 'pipeline-trigger-failed',
        projectPath: gitlabMirrorResult.projectPath || null,
        branchName,
        details: error.message,
      };
    }
  }
  updateWorkspaceMetadata(worktreePath, {
    publishStatus: 'pushed',
    publishedCommitSha: preparedCommit.commitSha,
    publishedAt,
    branchName,
    pushRemote,
    remoteBranch: branchName,
    requiresForcePush: false,
    gitlabMirrorStatus: gitlabMirrorResult.mirrored ? 'pushed' : gitlabMirrorResult.reason || null,
    gitlabMirrorAt: gitlabMirrorResult.mirrored ? publishedAt : null,
    gitlabMirrorProjectPath: gitlabMirrorResult.projectPath || null,
    gitlabMirrorDetails: gitlabMirrorResult.mirrored ? null : gitlabMirrorResult.details || null,
    gitlabPipelineStatus: gitlabPipelineResult?.status || gitlabPipelineResult?.reason || null,
    gitlabPipelineAt: gitlabPipelineResult ? new Date().toISOString() : null,
    gitlabPipelineId: gitlabPipelineResult?.pipelineId || null,
    gitlabPipelineUrl: gitlabPipelineResult?.webUrl || null,
    gitlabPipelineSha: gitlabPipelineResult?.sha || null,
    gitlabPipelineDetails: gitlabPipelineResult?.details || null,
  });

  return {
    integrated: true,
    reason: previousPublishedCommitSha ? 'branch-updated' : 'branch-pushed',
    commitSha: preparedCommit.commitSha,
    targetBranch: branchName,
    baseBranch,
    remote: pushRemote,
    changedFiles: preparedCommit.changedFiles,
    blockedFiles: preparedCommit.blockedFiles || [],
    gitlabMirror: {
      ...gitlabMirrorResult,
      pipeline: gitlabPipelineResult,
    },
  };
}

async function promotePublishedTaskBranchToBase(projectContext, options = {}) {
  const gitRoot = projectContext.gitRoot || getGitRoot(projectContext.projectDir);
  if (!gitRoot) return { promoted: false, reason: 'no-git-root' };

  const env = options.env || process.env;
  const branchName = String(options.branchName || resolveTaskBranchName(options, env) || '').trim();
  const baseBranch = String(options.baseBranch || resolveTaskBranchBase(gitRoot, env) || '').trim();
  const pushRemote = String(options.pushRemote || options.remoteName || resolveTaskBranchRemote(env) || 'origin').trim() || 'origin';

  if (!branchName) return { promoted: false, reason: 'branch-missing', baseBranch: baseBranch || null };
  if (!baseBranch) return { promoted: false, reason: 'base-missing', targetBranch: branchName, baseBranch: null };
  if (!hasConfiguredRemote(gitRoot, pushRemote)) {
    return { promoted: false, reason: 'remote-missing', targetBranch: branchName, baseBranch, remote: pushRemote };
  }

  return enqueueWorktreeMutation(async () => {
    const gitEnv = buildGitIdentityEnv();
    await tryRunGitAsync(gitRoot, ['fetch', '--quiet', pushRemote, branchName], { env: gitEnv });
    await tryRunGitAsync(gitRoot, ['fetch', '--quiet', pushRemote, baseBranch], { env: gitEnv });

    const remoteBranchRef = `refs/remotes/${pushRemote}/${branchName}`;
    const remoteBaseRef = `refs/remotes/${pushRemote}/${baseBranch}`;
    const branchRef =
      (await tryRunGitAsync(gitRoot, ['rev-parse', '--verify', remoteBranchRef]))
        ? remoteBranchRef
        : localBranchExists(gitRoot, branchName)
          ? `refs/heads/${branchName}`
          : null;
    const baseRef =
      (await tryRunGitAsync(gitRoot, ['rev-parse', '--verify', remoteBaseRef]))
        ? remoteBaseRef
        : localBranchExists(gitRoot, baseBranch)
          ? `refs/heads/${baseBranch}`
          : null;

    if (!branchRef) {
      return { promoted: false, reason: 'branch-ref-missing', targetBranch: branchName, baseBranch, remote: pushRemote };
    }
    if (!baseRef) {
      return { promoted: false, reason: 'base-ref-missing', targetBranch: branchName, baseBranch, remote: pushRemote };
    }

    try {
      await runGitAsync(gitRoot, ['merge-base', '--is-ancestor', branchRef, baseRef], { env: gitEnv });
      return {
        promoted: true,
        reason: 'branch-already-merged',
        commitSha: (await tryRunGitAsync(gitRoot, ['rev-parse', branchRef])) || null,
        mergedCommitSha: (await tryRunGitAsync(gitRoot, ['rev-parse', baseRef])) || null,
        targetBranch: branchName,
        baseBranch,
        remote: pushRemote,
      };
    } catch (_alreadyMergedError) {}

    const managedRoot = getManagedWorktreeRoot(projectContext);
    const mergeWorktreePath = path.join(managedRoot, `merge-${sanitizeBranchSegment(options.taskId || branchName)}-${Date.now().toString(36)}`);
    fs.mkdirSync(managedRoot, { recursive: true });
    ensureRemoved(mergeWorktreePath);

    let mergeReason = 'merged';
    try {
      await runGitAsync(gitRoot, ['worktree', 'add', '--detach', mergeWorktreePath, baseRef], { env: gitEnv });

      try {
        await runGitAsync(mergeWorktreePath, ['merge', '--ff-only', branchRef], { env: gitEnv });
        mergeReason = 'fast-forwarded';
      } catch (_fastForwardError) {
        try {
          await runGitAsync(mergeWorktreePath, ['merge', '--no-edit', branchRef], { env: gitEnv });
          mergeReason = 'merged';
        } catch (mergeError) {
          await tryRunGitAsync(mergeWorktreePath, ['merge', '--abort'], { env: gitEnv });
          return {
            promoted: false,
            reason: 'merge-conflict',
            details: mergeError.message,
            targetBranch: branchName,
            baseBranch,
            remote: pushRemote,
            commitSha: (await tryRunGitAsync(gitRoot, ['rev-parse', branchRef])) || null,
          };
        }
      }

      const mergedCommitSha = (await runGitAsync(mergeWorktreePath, ['rev-parse', 'HEAD'])) || null;
      try {
        await runGitAsync(mergeWorktreePath, ['push', pushRemote, `HEAD:refs/heads/${baseBranch}`], { env: gitEnv });
      } catch (pushError) {
        return {
          promoted: false,
          reason: 'push-failed',
          details: pushError.message,
          targetBranch: branchName,
          baseBranch,
          remote: pushRemote,
          mergedCommitSha,
          commitSha: (await tryRunGitAsync(gitRoot, ['rev-parse', branchRef])) || null,
        };
      }

      await tryRunGitAsync(gitRoot, ['fetch', '--quiet', pushRemote, baseBranch], { env: gitEnv });
      return {
        promoted: true,
        reason: mergeReason,
        targetBranch: branchName,
        baseBranch,
        remote: pushRemote,
        commitSha: (await tryRunGitAsync(gitRoot, ['rev-parse', branchRef])) || null,
        mergedCommitSha,
      };
    } finally {
      await tryRunGitAsync(gitRoot, ['worktree', 'remove', '--force', mergeWorktreePath], { env: gitEnv });
      ensureRemoved(mergeWorktreePath);
      await tryRunGitAsync(gitRoot, ['worktree', 'prune'], { env: gitEnv });
    }
  });
}

async function ensureTaskWorkspace(projectContext, options = {}) {
  const workspaceRunContext =
    options?.workspaceRunContext && typeof options.workspaceRunContext === 'object'
      ? options.workspaceRunContext
      : null;
  if (workspaceRunContext) {
    return workspaceGitRunContext.run(workspaceRunContext, () =>
      ensureTaskWorkspace(projectContext, { ...options, workspaceRunContext: null }),
    );
  }

  const gitRoot = projectContext.gitRoot || getGitRoot(projectContext.projectDir);
  if (!gitRoot) {
    return {
      isolated: false,
      workspaceKind: 'shared',
      workspaceKey: `shared:${projectContext.projectDir}`,
      path: projectContext.projectDir,
      baseProjectDir: projectContext.projectDir,
    };
  }

  const workspaceEnv = options.env || process.env;
  const integrationMode = resolveWorkspaceIntegrationMode(workspaceEnv);
  const instanceId = options.instanceId || CURRENT_INSTANCE_ID;
  const ownerId = options.ownerId || CURRENT_INSTANCE_OWNER;
  const scopedProjectContext = {
    ...projectContext,
    instanceId,
    env: workspaceEnv,
  };
  const worktreeRoot = getManagedWorktreeRoot(scopedProjectContext);
  const explicitTaskBaseBranch = String(workspaceEnv.NEXUS_TASK_BRANCH_BASE || '').trim();
  const explicitTaskBaseMode = explicitTaskBaseBranch.toLowerCase();
  const hasExplicitTaskBaseBranch =
    explicitTaskBaseBranch && !['__current__', 'auto', 'current'].includes(explicitTaskBaseMode);
  const requestedBaseBranch = String(options.baseBranch || '').trim();
  const phaseBaseBranch = resolvePhaseTaskBaseBranchName(
    options.phase,
    workspaceEnv,
  );
  const resolvedTaskBaseBranch = resolveTaskBranchBase(gitRoot, workspaceEnv);
  const baseBranch =
    requestedBaseBranch
    || (hasExplicitTaskBaseBranch ? resolvedTaskBaseBranch : null)
    || phaseBaseBranch
    || resolvedTaskBaseBranch;
  const dependencyStartRefs = normalizeStartRefs(options.dependencyStartRefs);
  const branchName =
    integrationMode === 'branch'
      ? buildTaskBranchName(options, workspaceEnv)
      : null;
  const pushRemote = integrationMode === 'branch'
    ? resolveTaskBranchRemote(workspaceEnv)
    : null;
  const requestedForceFreshBranch =
    integrationMode === 'branch' && Boolean(branchName) && Boolean(options.forceFreshBranch);
  const baseBranchMismatchDetected =
    integrationMode === 'branch'
    && Boolean(branchName)
    && listManagedWorkspaces(scopedProjectContext).some((entry) => {
      const metadata = entry?.metadata || {};
      return (
        String(metadata.taskId || '').trim() === String(options.taskId || '').trim()
        && String(metadata.agentId || '').trim() === String(options.agentId || '').trim()
        && String(metadata.requestKind || 'task').trim() === String(options.requestKind || 'task').trim()
        && String(metadata.instanceId || '').trim() === instanceId
        && String(metadata.branchName || '').trim() === branchName
        && String(metadata.baseBranch || '').trim()
        && String(metadata.baseBranch || '').trim() !== baseBranch
      );
    });
  const forceFreshBranch = requestedForceFreshBranch || baseBranchMismatchDetected;
  const reusableWorkspace = forceFreshBranch ? null : findReusableTaskWorkspace(scopedProjectContext, options, {
    instanceId,
    ownerId,
    branchName,
    baseBranch,
  });
  const worktreeName = reusableWorkspace
    ? path.basename(reusableWorkspace.path)
    : buildWorktreeName({ ...options, instanceId });
  const worktreePath = reusableWorkspace?.path || path.join(worktreeRoot, worktreeName);
  const persistedWorkspaceMetadata = loadWorkspaceMetadata(worktreePath) || {};
  const liveWorkspaceBranchName = pathExistsOrSymlink(worktreePath)
    ? tryRunGit(worktreePath, ['symbolic-ref', '--quiet', '--short', 'HEAD']) || null
    : null;
  const existingWorkspaceBranchName = String(
    persistedWorkspaceMetadata.branchName || liveWorkspaceBranchName || '',
  ).trim();
  const requiresWorkspaceReset =
    integrationMode === 'branch' &&
    Boolean(branchName) &&
    Boolean(existingWorkspaceBranchName) &&
    existingWorkspaceBranchName !== branchName;
  const existingWorkspaceMetadata = requiresWorkspaceReset ? {} : persistedWorkspaceMetadata;
  const preservePublishedState = !forceFreshBranch && !requiresWorkspaceReset;
  const metadata = {
    ...existingWorkspaceMetadata,
    agentId: options.agentId,
    instanceId,
    ownerId,
    taskId: options.taskId,
    taskTitle: options.taskTitle,
    phase: options.phase || null,
    requestKind: options.requestKind || 'task',
    parentTaskId: options.parentTaskId || null,
    requestedBy: options.requestedBy || null,
    createdAt: existingWorkspaceMetadata.createdAt || new Date().toISOString(),
    gitRoot,
    integrationMode,
    branchName,
    baseBranch,
    dependencyStartRefs,
    baseCommitSha: tryRunGit(gitRoot, ['rev-parse', 'HEAD']) || null,
    pushRemote,
    remoteBranch: branchName,
    publishStatus: preservePublishedState
      ? String(existingWorkspaceMetadata.publishStatus || '').trim() || null
      : null,
    publishedCommitSha: preservePublishedState
      ? String(existingWorkspaceMetadata.publishedCommitSha || '').trim() || null
      : null,
    publishedAt: preservePublishedState
      ? String(existingWorkspaceMetadata.publishedAt || '').trim() || null
      : null,
    requiresForcePush: forceFreshBranch || Boolean(existingWorkspaceMetadata.requiresForcePush),
    updatedAt: new Date().toISOString(),
    reusedAt: reusableWorkspace ? new Date().toISOString() : existingWorkspaceMetadata.reusedAt || null,
    reuseCount: Number(existingWorkspaceMetadata.reuseCount || 0) + (reusableWorkspace ? 1 : 0),
    cleanupPolicy: {
      removeLocalBranch:
        integrationMode === 'branch'
          ? String(process.env.NEXUS_TASK_BRANCH_REMOVE_LOCAL_ON_CLEANUP || 'false').toLowerCase() === 'true'
          : true,
    },
  };

  fs.mkdirSync(worktreeRoot, { recursive: true });
  let branchWorkspaceResult = null;

  await enqueueWorktreeMutation(async () => {
    if (forceFreshBranch && branchName) {
      await removeManagedWorkspacesForBranch(
        scopedProjectContext,
        branchName,
        { keepPaths: [] },
      );
    }

    if (requiresWorkspaceReset && pathExistsOrSymlink(worktreePath)) {
      if (await isRegisteredWorktreeAsync(gitRoot, worktreePath)) {
        await tryRunGitAsync(gitRoot, ['worktree', 'remove', '--force', worktreePath]);
      }
      ensureRemoved(worktreePath);
    }

    if (pathExistsOrSymlink(worktreePath) && !(await isRegisteredWorktreeAsync(gitRoot, worktreePath))) {
      ensureRemoved(worktreePath);
    }

    if (!pathExistsOrSymlink(worktreePath)) {
      if (integrationMode === 'branch' && branchName) {
        await removeManagedWorkspacesForBranch(
          scopedProjectContext,
          branchName,
          { keepPaths: [worktreePath] },
        );
      }
      await tryRunGitAsync(gitRoot, ['worktree', 'prune']);
      if (integrationMode === 'branch' && branchName) {
        branchWorkspaceResult = await ensureBranchBackedWorktree(
          gitRoot,
          worktreePath,
          branchName,
          baseBranch,
          pushRemote,
          {
            forceFreshStart: forceFreshBranch,
            env: options.env || process.env,
            projectContext: scopedProjectContext,
          },
        );
      } else {
        await runGitAsync(gitRoot, ['worktree', 'add', '--force', '--detach', worktreePath, 'HEAD']);
      }
    }
  });

  if (branchWorkspaceResult?.branchReset) {
    metadata.requiresForcePush = Boolean(branchWorkspaceResult.remoteBranchPreviouslyExisted);
    metadata.branchResetAt = new Date().toISOString();
    metadata.branchResetReason =
      metadata.branchResetReason
      || (baseBranchMismatchDetected ? 'base-branch-changed' : null)
      || (requestedForceFreshBranch ? 'force-fresh-branch' : null);
  }

  if (
    integrationMode === 'branch'
    && branchName
    && forceFreshBranch
    && !metadata.requiresForcePush
    && pushRemote
  ) {
    metadata.requiresForcePush = await remoteBranchExistsAsync(gitRoot, pushRemote, branchName);
  }

  metadata.branchName = tryRunGit(worktreePath, ['symbolic-ref', '--quiet', '--short', 'HEAD']) || metadata.branchName || null;
  if (integrationMode === 'branch' && branchName) {
    const syncRefs = await resolveTaskBranchSyncRefs(
      gitRoot,
      branchName,
      baseBranch,
      dependencyStartRefs,
      metadata.requiresForcePush ? null : pushRemote,
      options.env || process.env,
    );
    let baseSyncResult = await syncBranchBackedWorktreeWithRefs(
      gitRoot,
      worktreePath,
      syncRefs,
      options.env || process.env,
    );
    metadata.baseSync = {
      synced: Boolean(baseSyncResult?.synced),
      reason: baseSyncResult?.reason || null,
      baseRef: baseSyncResult?.baseRef || null,
      refs: Array.isArray(baseSyncResult?.refs) ? baseSyncResult.refs : [],
      details: baseSyncResult?.details || null,
      syncedAt: new Date().toISOString(),
    };

    if (
      shouldBlockOnBaseSyncFailure(baseSyncResult)
      && shouldAutoResetTaskBranchOnBaseConflict(options.env || process.env)
    ) {
      const branchRebuildResult = await rebuildTaskBranchFromBase(
        gitRoot,
        worktreePath,
        branchName,
        baseBranch,
        pushRemote,
        {
          taskId: options.taskId,
          taskTitle: options.taskTitle,
          env: options.env || process.env,
        },
      );

      if (branchRebuildResult?.branchWorkspaceResult?.branchReset) {
        metadata.requiresForcePush =
          metadata.requiresForcePush
          || Boolean(branchRebuildResult.branchWorkspaceResult.remoteBranchPreviouslyExisted);
      }
      metadata.branchResetAt = new Date().toISOString();
      metadata.branchResetReason = 'base-sync-merge-conflict';
      metadata.preservedBranchName = branchRebuildResult?.backupBranchName || null;
      metadata.preservedDirtyWorkspace =
        branchRebuildResult?.dirtySnapshotResult?.preserved === true;
      metadata.preservedDirtyWorkspaceReason =
        branchRebuildResult?.dirtySnapshotResult?.reason || null;
      metadata.branchName =
        tryRunGit(worktreePath, ['symbolic-ref', '--quiet', '--short', 'HEAD'])
        || metadata.branchName
        || null;

      baseSyncResult = await syncBranchBackedWorktreeWithRefs(
        gitRoot,
        worktreePath,
        syncRefs,
        options.env || process.env,
      );
      metadata.baseSync = {
        synced: Boolean(baseSyncResult?.synced),
        reason: baseSyncResult?.reason || null,
        baseRef: baseSyncResult?.baseRef || null,
        refs: Array.isArray(baseSyncResult?.refs) ? baseSyncResult.refs : [],
        details: baseSyncResult?.details || null,
        syncedAt: new Date().toISOString(),
      };
    }

    if (shouldBlockOnBaseSyncFailure(baseSyncResult)) {
      const recoveryBranch = await createRecoverySnapshotBranch(
        gitRoot,
        metadata.branchName,
        baseSyncResult?.reason || 'base-sync',
      );
      if (recoveryBranch) {
        metadata.baseSync.recoveryBranch = recoveryBranch;
      }
      ensureWorkspaceMetadataIgnored(worktreePath);
      writeWorkspaceMetadata(worktreePath, metadata);

      const error = new Error(
        buildBaseSyncFailureMessage(metadata.branchName, baseBranch, metadata.baseSync),
      );
      error.code = 'WORKSPACE_BASE_SYNC_CONFLICT';
      error.failureClass = 'integration';
      error.baseSync = metadata.baseSync;
      error.recoveryBranch = recoveryBranch || null;
      throw error;
    }
  }
  ensureSharedRuntimeLinks(gitRoot, worktreePath);
  ensureProjectControlPlaneSnapshot(gitRoot, worktreePath);
  ensureWorkspaceMetadataIgnored(worktreePath);
  writeWorkspaceMetadata(worktreePath, metadata);

  return {
    isolated: true,
    workspaceKind: 'worktree',
    workspaceKey: worktreePath,
    path: worktreePath,
    worktreeRoot,
    baseProjectDir: gitRoot,
    metadata,
  };
}

async function cleanupTaskWorkspace(projectContext, workspace) {
  if (!workspace || !workspace.isolated || !workspace.path) {
    return false;
  }

  const workspaceMetadata = loadWorkspaceMetadata(workspace.path) || {};
  const managedRoot = getManagedWorktreeRoot({
    ...projectContext,
    instanceId: workspaceMetadata.instanceId || projectContext.instanceId || CURRENT_INSTANCE_ID,
  });
  const resolvedWorkspacePath = path.resolve(workspace.path);
  const resolvedManagedRoot = path.resolve(managedRoot);
  if (!resolvedWorkspacePath.startsWith(`${resolvedManagedRoot}${path.sep}`)) {
    return false;
  }

  const gitRoot = projectContext.gitRoot || getGitRoot(projectContext.projectDir);
  if (!gitRoot) return false;
  const liveBranchName = tryRunGit(resolvedWorkspacePath, ['symbolic-ref', '--quiet', '--short', 'HEAD']);
  const branchName = workspaceMetadata?.branchName || liveBranchName || null;
  const removeLocalBranch = Boolean(
    workspaceMetadata?.cleanupPolicy?.removeLocalBranch !== undefined
      ? workspaceMetadata.cleanupPolicy.removeLocalBranch
      : workspaceMetadata?.integrationMode === 'branch'
        ? false
        : true,
  );

  await enqueueWorktreeMutation(async () => {
    try {
      await runGitAsync(gitRoot, ['worktree', 'remove', '--force', resolvedWorkspacePath]);
    } catch (error) {
      ensureRemoved(resolvedWorkspacePath);
    }

    await tryRunGitAsync(gitRoot, ['worktree', 'prune']);

    if (removeLocalBranch && canDeleteTemporaryBranch(gitRoot, branchName)) {
      await tryRunGitAsync(gitRoot, ['branch', '-D', branchName]);
    }
  });
  return true;
}

async function integrateTaskWorkspaceChanges(projectContext, workspace, options = {}) {
  if (!workspace || !workspace.isolated || !workspace.path) {
    return { integrated: false, reason: 'shared-workspace' };
  }

  const gitRoot = projectContext.gitRoot || getGitRoot(projectContext.projectDir);
  if (!gitRoot) {
    return { integrated: false, reason: 'no-git-root' };
  }

  const integrationMode =
    String(workspace?.metadata?.integrationMode || loadWorkspaceMetadata(workspace.path)?.integrationMode || '')
      .trim()
      .toLowerCase() || resolveWorkspaceIntegrationMode(options.env || process.env);
  return enqueueWorktreeMutation(async () => {
    if (integrationMode === 'branch') {
      return integrateWorkspaceByTaskBranch(projectContext, workspace, options);
    }

    return integrateWorkspaceByCherryPick(projectContext, workspace, options);
  });
}

function listManagedWorkspaces(projectContext) {
  const managedRoot = getManagedWorktreeRoot(projectContext);
  if (!fs.existsSync(managedRoot)) return [];

  return fs
    .readdirSync(managedRoot, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => path.join(managedRoot, entry.name))
    .filter((workspacePath) => pathExistsOrSymlink(path.join(workspacePath, '.nexus-worktree.json')))
    .map((workspacePath) => {
      try {
        return {
          path: workspacePath,
          metadata: JSON.parse(fs.readFileSync(path.join(workspacePath, '.nexus-worktree.json'), 'utf8')),
        };
      } catch (error) {
        return null;
      }
    })
    .filter(Boolean);
}

async function removeManagedWorkspacesForBranch(projectContext, branchName, options = {}) {
  const normalizedBranchName = String(branchName || '').trim();
  if (!normalizedBranchName) return [];

  const gitRoot = projectContext.gitRoot || getGitRoot(projectContext.projectDir);
  if (!gitRoot) return [];
  const managedRoot = path.resolve(getManagedWorktreeRoot(projectContext));

  const keepPaths = new Set(
    (Array.isArray(options.keepPaths) ? options.keepPaths : [options.keepPaths])
      .filter(Boolean)
      .map((entry) => path.resolve(entry)),
  );

  const candidates = new Set(
    listManagedWorkspaces(projectContext)
    .filter((entry) => String(entry.metadata?.branchName || '').trim() === normalizedBranchName)
    .map((entry) => path.resolve(entry.path))
    .filter((candidatePath) => !keepPaths.has(candidatePath)),
  );

  const registeredWorktrees = parseWorktreeList(
    (await tryRunGitAsync(gitRoot, ['worktree', 'list', '--porcelain'])) || '',
  );
  registeredWorktrees
    .filter((entry) => String(entry.branchName || '').trim() === normalizedBranchName)
    .map((entry) => path.resolve(entry.path))
    .filter((candidatePath) =>
      candidatePath === managedRoot || candidatePath.startsWith(`${managedRoot}${path.sep}`),
    )
    .filter((candidatePath) => !keepPaths.has(candidatePath))
    .forEach((candidatePath) => candidates.add(candidatePath));

  const removedPaths = [];
  for (const candidatePath of candidates) {
    if (await isRegisteredWorktreeAsync(gitRoot, candidatePath)) {
      await tryRunGitAsync(gitRoot, ['worktree', 'remove', '--force', candidatePath]);
    }
    ensureRemoved(candidatePath);
    removedPaths.push(candidatePath);
  }

  if (removedPaths.length > 0) {
    await tryRunGitAsync(gitRoot, ['worktree', 'prune']);
  }

  return removedPaths;
}

module.exports = {
  buildTaskBranchName,
  cleanupTaskWorkspace,
  discoverProjectContext,
  evaluateDependencyStartRefAgainstBase,
  ensureProjectControlPlaneSnapshot,
  ensureTaskWorkspace,
  getGitRoot,
  getManagedWorktreeRoot,
  integrateTaskWorkspaceChanges,
  promotePublishedTaskBranchToBase,
  resolveTaskBranchBase,
  resolveTaskBranchStartPoint,
  resolveWorkspaceIntegrationMode,
  syncBranchBackedWorktreeWithBase,
  syncBranchBackedWorktreeWithRefs,
  stripWorkspaceMetadataChanges,
  listManagedWorkspaces,
  isTaskBranchCandidateCompatible,
  normalizeTaskBranchRefName,
  removeManagedWorkspacesForBranch,
  resolveTaskBranchAbsorption,
  translateWindowsPath,
};
