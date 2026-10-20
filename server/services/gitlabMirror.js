const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');

function normalizeText(value) {
  const text = String(value || '').trim();
  return text || null;
}

const ACTIVE_GITLAB_PIPELINE_STATUSES = new Set([
  'created',
  'waiting_for_resource',
  'preparing',
  'pending',
  'running',
  'scheduled',
]);
const SUCCESS_GITLAB_PIPELINE_STATUSES = new Set(['success']);
const FAILED_GITLAB_PIPELINE_STATUSES = new Set(['failed', 'canceled']);
const BLOCKED_GITLAB_PIPELINE_STATUSES = new Set(['manual', 'skipped']);

function normalizeBaseUrl(value) {
  return String(value || 'https://gitlab.com').trim().replace(/\/+$/, '') || 'https://gitlab.com';
}

function normalizeGitLabPipelineStatus(status) {
  return String(status || '').trim().toLowerCase() || null;
}

function classifyGitLabPipelineStatus(status) {
  const normalizedStatus = normalizeGitLabPipelineStatus(status);
  if (!normalizedStatus) {
    return 'unknown';
  }

  if (SUCCESS_GITLAB_PIPELINE_STATUSES.has(normalizedStatus)) {
    return 'success';
  }
  if (FAILED_GITLAB_PIPELINE_STATUSES.has(normalizedStatus)) {
    return 'failed';
  }
  if (ACTIVE_GITLAB_PIPELINE_STATUSES.has(normalizedStatus)) {
    return 'active';
  }
  if (BLOCKED_GITLAB_PIPELINE_STATUSES.has(normalizedStatus)) {
    return 'blocked';
  }

  return 'unknown';
}

function splitGitLabProjectPath(projectPath) {
  const normalized = String(projectPath || '')
    .trim()
    .replace(/^\/+/, '')
    .replace(/\/+$/, '');
  const parts = normalized.split('/').filter(Boolean);
  if (parts.length < 2) {
    throw new Error('GITLAB_PROJECT_PATH deve seguir o formato grupo/projeto ou grupo/subgrupo/projeto.');
  }

  return {
    projectPath: normalized,
    namespacePath: parts.slice(0, -1).join('/'),
    projectSlug: parts[parts.length - 1],
  };
}

function buildGitLabProjectApiUrl(baseUrl, projectPath) {
  return `${normalizeBaseUrl(baseUrl)}/api/v4/projects/${encodeURIComponent(String(projectPath || '').trim())}`;
}

function buildGitLabRepoHttpUrl(baseUrl, projectPath) {
  return `${normalizeBaseUrl(baseUrl)}/${String(projectPath || '').trim().replace(/^\/+/, '')}.git`;
}

function buildGitLabAuthHeader(token) {
  const normalizedToken = String(token || '').trim();
  if (!normalizedToken) {
    throw new Error('GITLAB_TOKEN não configurado.');
  }

  const basicToken = Buffer.from(`oauth2:${normalizedToken}`, 'utf8').toString('base64');
  return `Authorization: Basic ${basicToken}`;
}

function gitRefExists(projectDir, refName, options = {}) {
  const normalizedRefName = normalizeText(refName);
  if (!normalizedRefName) {
    return false;
  }

  const spawnSyncImpl = options.spawnSyncImpl || spawnSync;
  const result = spawnSyncImpl('git', ['show-ref', '--verify', '--quiet', normalizedRefName], {
    cwd: projectDir,
    env: {
      ...process.env,
      ...(options.env || {}),
      GIT_TERMINAL_PROMPT: '0',
    },
    encoding: 'utf8',
  });

  return Number(result.status) === 0;
}

function resolveMirrorSourceRef(projectDir, branchName, options = {}) {
  const normalizedBranchName = normalizeText(branchName);
  if (!normalizedBranchName) {
    return null;
  }

  const localRef = `refs/heads/${normalizedBranchName}`;
  if (gitRefExists(projectDir, localRef, options)) {
    return localRef;
  }

  const remoteName = normalizeText(options.remoteName) || 'origin';
  const remoteRef = `refs/remotes/${remoteName}/${normalizedBranchName}`;
  if (gitRefExists(projectDir, remoteRef, options)) {
    return remoteRef;
  }

  return null;
}

function resolveGitLabMirrorConfig(env = process.env) {
  const baseUrl = normalizeBaseUrl(env.GITLAB_BASE_URL || 'https://gitlab.com');
  const projectPath = normalizeText(env.GITLAB_PROJECT_PATH);
  const token = normalizeText(env.GITLAB_TOKEN);

  if (!projectPath || !token) {
    return {
      enabled: false,
      baseUrl,
      projectPath,
      tokenConfigured: Boolean(token),
      reason: !projectPath ? 'missing-project-path' : 'missing-token',
    };
  }

  const parsed = splitGitLabProjectPath(projectPath);
  return {
    enabled: true,
    baseUrl,
    token,
    tokenConfigured: true,
    projectPath: parsed.projectPath,
    namespacePath: parsed.namespacePath,
    projectSlug: parsed.projectSlug,
    repoHttpUrl: buildGitLabRepoHttpUrl(baseUrl, parsed.projectPath),
    apiProjectUrl: buildGitLabProjectApiUrl(baseUrl, parsed.projectPath),
  };
}

async function requestGitLabJson(url, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('Fetch global não disponível para chamadas GitLab.');
  }

  const headers = {
    'user-agent': 'nexus-orchestrator/1.0',
    ...(options.headers || {}),
  };
  const body = options.body === undefined ? null : options.body;
  if (body !== null && !Object.prototype.hasOwnProperty.call(headers, 'content-type')) {
    headers['content-type'] = 'application/json';
  }

  const response = await fetchImpl(url, {
    method: options.method || 'GET',
    headers,
    body: body === null ? undefined : JSON.stringify(body),
  });
  const rawText = await response.text();
  let payload = null;

  try {
    payload = rawText ? JSON.parse(rawText) : null;
  } catch (_error) {
    payload = null;
  }

  if (!response.ok) {
    const message =
      payload?.message
        ? typeof payload.message === 'string'
          ? payload.message
          : JSON.stringify(payload.message)
        : rawText || `GitLab HTTP ${response.status}`;
    const error = new Error(message);
    error.statusCode = response.status;
    error.payload = payload;
    throw error;
  }

  return payload;
}

async function getGitLabProject(options = {}) {
  const config = options.config || resolveGitLabMirrorConfig(options.env || process.env);
  if (!config.enabled) {
    throw new Error('GitLab mirror não configurado.');
  }

  try {
    return await requestGitLabJson(config.apiProjectUrl, {
      fetchImpl: options.fetchImpl,
      headers: {
        'PRIVATE-TOKEN': config.token,
      },
    });
  } catch (error) {
    if (Number(error.statusCode) === 404) {
      return null;
    }
    throw error;
  }
}

async function resolveGitLabNamespace(options = {}) {
  const config = options.config || resolveGitLabMirrorConfig(options.env || process.env);
  if (!config.enabled) {
    throw new Error('GitLab mirror não configurado.');
  }

  const searchTerm = config.namespacePath.split('/').pop();
  const url = `${config.baseUrl}/api/v4/namespaces?search=${encodeURIComponent(searchTerm)}`;
  const namespaces = await requestGitLabJson(url, {
    fetchImpl: options.fetchImpl,
    headers: {
      'PRIVATE-TOKEN': config.token,
    },
  });

  const match = Array.isArray(namespaces)
    ? namespaces.find(
        (entry) =>
          String(entry?.full_path || '').trim() === config.namespacePath
            || String(entry?.path || '').trim() === config.namespacePath,
      ) || null
    : null;

  if (!match) {
    throw new Error(`Namespace GitLab não encontrado para ${config.namespacePath}.`);
  }

  return match;
}

async function ensureGitLabProject(options = {}) {
  const config = options.config || resolveGitLabMirrorConfig(options.env || process.env);
  if (!config.enabled) {
    throw new Error('GitLab mirror não configurado.');
  }

  const existingProject = await getGitLabProject({
    config,
    fetchImpl: options.fetchImpl,
  });
  if (existingProject) {
    return {
      created: false,
      project: existingProject,
      namespace: null,
    };
  }

  const namespace = await resolveGitLabNamespace({
    config,
    fetchImpl: options.fetchImpl,
  });
  const projectName = normalizeText(options.projectName) || config.projectSlug;
  const project = await requestGitLabJson(`${config.baseUrl}/api/v4/projects`, {
    method: 'POST',
    fetchImpl: options.fetchImpl,
    headers: {
      'PRIVATE-TOKEN': config.token,
    },
    body: {
      name: projectName,
      path: config.projectSlug,
      namespace_id: namespace.id,
      visibility: normalizeText(options.visibility) || 'private',
      initialize_with_readme: false,
    },
  });

  return {
    created: true,
    project,
    namespace,
  };
}

async function lintGitLabCiConfig(options = {}) {
  const config = options.config || resolveGitLabMirrorConfig(options.env || process.env);
  if (!config.enabled) {
    throw new Error('GitLab mirror não configurado.');
  }

  const projectDir = options.projectDir ? path.resolve(options.projectDir) : null;
  const ciPath = projectDir ? path.join(projectDir, '.gitlab-ci.yml') : null;
  const content =
    normalizeText(options.content)
      || (ciPath && fs.existsSync(ciPath)
        ? fs.readFileSync(ciPath, 'utf8')
        : null);

  if (!content) {
    throw new Error('Arquivo .gitlab-ci.yml não encontrado para lint.');
  }

  const project =
    options.project
      || (await getGitLabProject({
        config,
        fetchImpl: options.fetchImpl,
      }));
  if (!project?.id) {
    throw new Error(`Projeto GitLab não encontrado para lint: ${config.projectPath}.`);
  }

  return requestGitLabJson(`${config.baseUrl}/api/v4/projects/${project.id}/ci/lint`, {
    method: 'POST',
    fetchImpl: options.fetchImpl,
    headers: {
      'PRIVATE-TOKEN': config.token,
    },
    body: {
      content,
    },
  });
}

async function updateGitLabProject(options = {}) {
  const config = options.config || resolveGitLabMirrorConfig(options.env || process.env);
  if (!config.enabled) {
    throw new Error('GitLab mirror não configurado.');
  }

  const body = {};
  const defaultBranch = normalizeText(options.defaultBranch);
  if (defaultBranch) {
    body.default_branch = defaultBranch;
  }

  if (Object.keys(body).length <= 0) {
    return getGitLabProject({
      config,
      fetchImpl: options.fetchImpl,
    });
  }

  return requestGitLabJson(config.apiProjectUrl, {
    method: 'PUT',
    fetchImpl: options.fetchImpl,
    headers: {
      'PRIVATE-TOKEN': config.token,
    },
    body,
  });
}

async function listGitLabBranchPipelines(options = {}) {
  const config = options.config || resolveGitLabMirrorConfig(options.env || process.env);
  if (!config.enabled) {
    throw new Error('GitLab mirror não configurado.');
  }

  const branchName = normalizeText(options.branchName);
  if (!branchName) {
    throw new Error('Branch GitLab inválida para consulta de pipeline.');
  }

  const project =
    options.project
      || (await getGitLabProject({
        config,
        fetchImpl: options.fetchImpl,
      }));
  if (!project?.id) {
    throw new Error(`Projeto GitLab não encontrado para pipelines: ${config.projectPath}.`);
  }

  const perPage = Math.max(1, Number.parseInt(options.perPage || '5', 10) || 5);
  return requestGitLabJson(
    `${config.baseUrl}/api/v4/projects/${project.id}/pipelines?ref=${encodeURIComponent(branchName)}&per_page=${perPage}`,
    {
      fetchImpl: options.fetchImpl,
      headers: {
        'PRIVATE-TOKEN': config.token,
      },
    },
  );
}

function mapGitLabPipelinePayload(pipeline, config, fallbackBranchName = null, fallbackSha = null) {
  if (!pipeline || typeof pipeline !== 'object') {
    return null;
  }

  const normalizedStatus = normalizeGitLabPipelineStatus(pipeline.status);
  return {
    enabled: true,
    pipelineId: pipeline.id || null,
    status: normalizedStatus,
    statusClass: classifyGitLabPipelineStatus(normalizedStatus),
    ref: normalizeText(pipeline.ref) || fallbackBranchName || null,
    branchName: normalizeText(pipeline.ref) || fallbackBranchName || null,
    sha: normalizeText(pipeline.sha) || fallbackSha || null,
    webUrl: normalizeText(pipeline.web_url) || null,
    source: normalizeText(pipeline.source) || null,
    finishedAt: normalizeText(pipeline.finished_at) || null,
    updatedAt: normalizeText(pipeline.updated_at) || null,
    projectPath: config.projectPath,
  };
}

async function findGitLabBranchPipeline(options = {}) {
  const config = options.config || resolveGitLabMirrorConfig(options.env || process.env);
  if (!config.enabled) {
    return {
      enabled: false,
      found: false,
      reason: config.reason || 'not-configured',
    };
  }

  const branchName = normalizeText(options.branchName);
  if (!branchName) {
    throw new Error('Branch GitLab inválida para localizar pipeline.');
  }

  const commitSha = normalizeText(options.commitSha);
  const project =
    options.project
      || (await getGitLabProject({
        config,
        fetchImpl: options.fetchImpl,
      }));
  if (!project?.id) {
    throw new Error(`Projeto GitLab não encontrado para localizar pipeline: ${config.projectPath}.`);
  }

  const existingPipelines = await listGitLabBranchPipelines({
    config,
    project,
    branchName,
    fetchImpl: options.fetchImpl,
    perPage: options.perPage,
  });
  const matchingPipeline = Array.isArray(existingPipelines)
    ? existingPipelines.find((pipeline) =>
        commitSha
          ? normalizeText(pipeline?.sha) === commitSha
          : normalizeText(pipeline?.ref) === branchName,
      ) || null
    : null;

  if (!matchingPipeline) {
    return {
      enabled: true,
      found: false,
      reason: 'not-found',
      projectPath: config.projectPath,
      branchName,
      sha: commitSha,
    };
  }

  return {
    ...mapGitLabPipelinePayload(matchingPipeline, config, branchName, commitSha),
    found: true,
    reason: 'found',
  };
}

async function getGitLabPipeline(options = {}) {
  const config = options.config || resolveGitLabMirrorConfig(options.env || process.env);
  if (!config.enabled) {
    return {
      enabled: false,
      found: false,
      reason: config.reason || 'not-configured',
    };
  }

  const pipelineId = Number.parseInt(options.pipelineId || '', 10);
  if (!Number.isInteger(pipelineId) || pipelineId <= 0) {
    throw new Error('Pipeline GitLab inválido para consulta detalhada.');
  }

  const project =
    options.project
      || (await getGitLabProject({
        config,
        fetchImpl: options.fetchImpl,
      }));
  if (!project?.id) {
    throw new Error(`Projeto GitLab não encontrado para consultar pipeline: ${config.projectPath}.`);
  }

  const pipeline = await requestGitLabJson(
    `${config.baseUrl}/api/v4/projects/${project.id}/pipelines/${pipelineId}`,
    {
      fetchImpl: options.fetchImpl,
      headers: {
        'PRIVATE-TOKEN': config.token,
      },
    },
  );

  return {
    ...mapGitLabPipelinePayload(pipeline, config),
    found: true,
    reason: 'fetched',
  };
}

async function ensureGitLabBranchPipeline(options = {}) {
  const config = options.config || resolveGitLabMirrorConfig(options.env || process.env);
  if (!config.enabled) {
    return {
      enabled: false,
      ensured: false,
      triggered: false,
      reason: config.reason || 'not-configured',
    };
  }

  const branchName = normalizeText(options.branchName);
  if (!branchName) {
    throw new Error('Branch GitLab inválida para pipeline.');
  }

  const commitSha = normalizeText(options.commitSha);
  const project =
    options.project
      || (await getGitLabProject({
        config,
        fetchImpl: options.fetchImpl,
      }));
  if (!project?.id) {
    throw new Error(`Projeto GitLab não encontrado para pipeline: ${config.projectPath}.`);
  }

  const existingPipelines = await listGitLabBranchPipelines({
    config,
    project,
    branchName,
    fetchImpl: options.fetchImpl,
    perPage: options.perPage,
  });
  const matchingPipeline = Array.isArray(existingPipelines)
    ? existingPipelines.find((pipeline) =>
        commitSha
          ? normalizeText(pipeline?.sha) === commitSha
          : normalizeText(pipeline?.ref) === branchName,
      ) || null
    : null;

  if (matchingPipeline) {
    return {
      ...mapGitLabPipelinePayload(matchingPipeline, config, branchName, commitSha),
      ensured: true,
      triggered: false,
      reason: 'already-exists',
      projectPath: config.projectPath,
      branchName,
    };
  }

  const pipeline = await requestGitLabJson(
    `${config.baseUrl}/api/v4/projects/${project.id}/pipeline?ref=${encodeURIComponent(branchName)}`,
    {
      method: 'POST',
      fetchImpl: options.fetchImpl,
      headers: {
        'PRIVATE-TOKEN': config.token,
      },
    },
  );

  return {
    ...mapGitLabPipelinePayload(pipeline, config, branchName, commitSha),
    ensured: true,
    triggered: true,
    reason: 'triggered',
    projectPath: config.projectPath,
    branchName,
  };
}

function mirrorBranchToGitLab(projectDir, branchName, options = {}) {
  const config = options.config || resolveGitLabMirrorConfig(options.env || process.env);
  if (!config.enabled) {
    return {
      enabled: false,
      mirrored: false,
      reason: config.reason || 'not-configured',
    };
  }

  const normalizedProjectDir = path.resolve(String(projectDir || '').trim() || process.cwd());
  const normalizedBranchName = normalizeText(branchName);
  if (!normalizedBranchName) {
    throw new Error('Branch Git inválida para espelhamento GitLab.');
  }

  const spawnSyncImpl = options.spawnSyncImpl || spawnSync;
  const sourceRef =
    normalizeText(options.sourceRef)
      || resolveMirrorSourceRef(normalizedProjectDir, normalizedBranchName, {
        env: options.env,
        remoteName: options.remoteName,
        spawnSyncImpl,
      });
  if (!sourceRef) {
    return {
      enabled: true,
      mirrored: false,
      reason: 'missing-source-ref',
      projectPath: config.projectPath,
      branchName: normalizedBranchName,
      details: `Branch ${normalizedBranchName} nao existe localmente nem no remoto ${normalizeText(options.remoteName) || 'origin'}.`,
    };
  }

  const targetRef = normalizeText(options.targetRef) || `refs/heads/${normalizedBranchName}`;
  const gitArgs = ['-c', `http.extraHeader=${buildGitLabAuthHeader(config.token)}`, 'push'];
  if (options.forcePush) {
    gitArgs.push('--force-with-lease');
  }
  gitArgs.push(config.repoHttpUrl, `${sourceRef}:${targetRef}`);
  const result = spawnSyncImpl('git', gitArgs, {
    cwd: normalizedProjectDir,
    env: {
      ...process.env,
      ...(options.env || {}),
      GIT_TERMINAL_PROMPT: '0',
    },
    encoding: 'utf8',
  });

  if (Number(result.status) !== 0) {
    return {
      enabled: true,
      mirrored: false,
      reason: 'push-failed',
      projectPath: config.projectPath,
      branchName: normalizedBranchName,
      details:
        normalizeText(result.stderr)
          || normalizeText(result.stdout)
          || `git push saiu com código ${result.status}.`,
    };
  }

  return {
    enabled: true,
    mirrored: true,
    projectPath: config.projectPath,
    branchName: normalizedBranchName,
    remoteUrl: config.repoHttpUrl,
  };
}

module.exports = {
  ACTIVE_GITLAB_PIPELINE_STATUSES,
  BLOCKED_GITLAB_PIPELINE_STATUSES,
  FAILED_GITLAB_PIPELINE_STATUSES,
  SUCCESS_GITLAB_PIPELINE_STATUSES,
  buildGitLabAuthHeader,
  buildGitLabProjectApiUrl,
  buildGitLabRepoHttpUrl,
  classifyGitLabPipelineStatus,
  ensureGitLabBranchPipeline,
  ensureGitLabProject,
  findGitLabBranchPipeline,
  getGitLabPipeline,
  getGitLabProject,
  lintGitLabCiConfig,
  listGitLabBranchPipelines,
  mirrorBranchToGitLab,
  normalizeBaseUrl,
  normalizeGitLabPipelineStatus,
  requestGitLabJson,
  resolveGitLabMirrorConfig,
  resolveGitLabNamespace,
  splitGitLabProjectPath,
  updateGitLabProject,
};
