const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildGitLabAuthHeader,
  buildGitLabRepoHttpUrl,
  classifyGitLabPipelineStatus,
  ensureGitLabBranchPipeline,
  ensureGitLabProject,
  findGitLabBranchPipeline,
  getGitLabPipeline,
  lintGitLabCiConfig,
  listGitLabBranchPipelines,
  mirrorBranchToGitLab,
  resolveGitLabMirrorConfig,
  splitGitLabProjectPath,
  updateGitLabProject,
} = require('../services/gitlabMirror');

test('splitGitLabProjectPath extracts namespace and slug', () => {
  assert.deepEqual(splitGitLabProjectPath('contato276-group/example1'), {
    projectPath: 'contato276-group/example1',
    namespacePath: 'contato276-group',
    projectSlug: 'example1',
  });
});

test('resolveGitLabMirrorConfig builds API and repo URLs from env', () => {
  const config = resolveGitLabMirrorConfig({
    GITLAB_BASE_URL: 'https://gitlab.com/',
    GITLAB_PROJECT_PATH: 'contato276-group/example1',
    GITLAB_TOKEN: 'secret-token',
  });

  assert.equal(config.enabled, true);
  assert.equal(config.namespacePath, 'contato276-group');
  assert.equal(config.projectSlug, 'example1');
  assert.equal(config.apiProjectUrl, 'https://gitlab.com/api/v4/projects/contato276-group%2Fexample1');
  assert.equal(config.repoHttpUrl, 'https://gitlab.com/contato276-group/example1.git');
});

test('buildGitLabAuthHeader encodes oauth2 token as basic auth', () => {
  const header = buildGitLabAuthHeader('secret-token');
  const encoded = header.replace(/^Authorization: Basic\s+/i, '');
  assert.equal(Buffer.from(encoded, 'base64').toString('utf8'), 'oauth2:secret-token');
});

test('classifyGitLabPipelineStatus normalizes active, success, failed, blocked and unknown states', () => {
  assert.equal(classifyGitLabPipelineStatus('running'), 'active');
  assert.equal(classifyGitLabPipelineStatus('SUCCESS'), 'success');
  assert.equal(classifyGitLabPipelineStatus('failed'), 'failed');
  assert.equal(classifyGitLabPipelineStatus('manual'), 'blocked');
  assert.equal(classifyGitLabPipelineStatus(''), 'unknown');
  assert.equal(classifyGitLabPipelineStatus('strange-status'), 'unknown');
});

test('ensureGitLabProject creates missing project under the resolved namespace', async () => {
  const requests = [];
  const responses = [
    { ok: false, status: 404, body: { message: '404 Project Not Found' } },
    {
      ok: true,
      status: 200,
      body: [{ id: 124664571, full_path: 'contato276-group', path: 'contato276-group' }],
    },
    {
      ok: true,
      status: 201,
      body: { id: 99, path_with_namespace: 'contato276-group/example1' },
    },
  ];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    const next = responses.shift();
    return {
      ok: next.ok,
      status: next.status,
      async text() {
        return JSON.stringify(next.body);
      },
    };
  };

  const result = await ensureGitLabProject({
    env: {
      GITLAB_BASE_URL: 'https://gitlab.com',
      GITLAB_PROJECT_PATH: 'contato276-group/example1',
      GITLAB_TOKEN: 'secret-token',
    },
    fetchImpl,
  });

  assert.equal(result.created, true);
  assert.equal(result.project.path_with_namespace, 'contato276-group/example1');
  assert.equal(requests.length, 3);
  assert.match(requests[1].url, /\/api\/v4\/namespaces\?search=contato276-group$/);
  assert.equal(requests[2].options.method, 'POST');
});

test('lintGitLabCiConfig posts the file content to GitLab lint endpoint', async () => {
  const requests = [];
  const responses = [
    {
      ok: true,
      status: 200,
      body: { id: 99, path_with_namespace: 'contato276-group/example1' },
    },
    {
      ok: true,
      status: 200,
      body: {
        valid: true,
        status: 'valid',
      },
    },
  ];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    const next = responses.shift();
    return {
      ok: next.ok,
      status: next.status,
      async text() {
        return JSON.stringify(next.body);
      },
    };
  };

  const result = await lintGitLabCiConfig({
    env: {
      GITLAB_BASE_URL: 'https://gitlab.com',
      GITLAB_PROJECT_PATH: 'contato276-group/example1',
      GITLAB_TOKEN: 'secret-token',
    },
    content: 'stages:\n  - test\n',
    fetchImpl,
  });

  assert.equal(result.valid, true);
  assert.equal(result.status, 'valid');
  assert.match(requests[1].url, /\/api\/v4\/projects\/99\/ci\/lint$/);
});

test('mirrorBranchToGitLab pushes the requested branch with an auth header', () => {
  const calls = [];
  const result = mirrorBranchToGitLab('/tmp/demo', 'martin', {
    env: {
      GITLAB_BASE_URL: 'https://gitlab.com',
      GITLAB_PROJECT_PATH: 'contato276-group/example1',
      GITLAB_TOKEN: 'secret-token',
    },
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      if (args[0] === 'show-ref') {
        return {
          status: args.includes('refs/heads/martin') ? 0 : 1,
          stdout: '',
          stderr: '',
        };
      }
      return {
        status: 0,
        stdout: '',
        stderr: '',
      };
    },
  });

  assert.equal(result.mirrored, true);
  assert.ok(calls.length >= 2);
  assert.equal(calls[0].command, 'git');
  const pushCall = calls[calls.length - 1];
  assert.ok(pushCall.args.some((entry) => String(entry).startsWith('http.extraHeader=Authorization: Basic ')));
  assert.ok(pushCall.args.includes('https://gitlab.com/contato276-group/example1.git'));
  assert.ok(pushCall.args.includes('refs/heads/martin:refs/heads/martin'));
  assert.equal(pushCall.options.env.GIT_TERMINAL_PROMPT, '0');
});

test('mirrorBranchToGitLab falls back to the remote tracking ref when the local branch is absent', () => {
  const calls = [];
  const result = mirrorBranchToGitLab('/tmp/demo', 'etapa-3', {
    env: {
      GITLAB_BASE_URL: 'https://gitlab.com',
      GITLAB_PROJECT_PATH: 'contato276-group/example1',
      GITLAB_TOKEN: 'secret-token',
    },
    spawnSyncImpl(command, args, options) {
      calls.push({ command, args, options });
      if (args[0] === 'show-ref') {
        return {
          status:
            args.includes('refs/remotes/origin/etapa-3')
              ? 0
              : 1,
          stdout: '',
          stderr: '',
        };
      }
      return {
        status: 0,
        stdout: '',
        stderr: '',
      };
    },
  });

  assert.equal(result.mirrored, true);
  const pushCall = calls[calls.length - 1];
  assert.ok(pushCall.args.includes('refs/remotes/origin/etapa-3:refs/heads/etapa-3'));
});

test('buildGitLabRepoHttpUrl keeps the canonical .git suffix', () => {
  assert.equal(
    buildGitLabRepoHttpUrl('https://gitlab.com/', 'contato276-group/example1'),
    'https://gitlab.com/contato276-group/example1.git',
  );
});

test('updateGitLabProject sends the requested default branch', async () => {
  let request = null;
  const fetchImpl = async (url, options = {}) => {
    request = { url, options };
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          path_with_namespace: 'contato276-group/example1',
          default_branch: 'martin',
        });
      },
    };
  };

  const result = await updateGitLabProject({
    env: {
      GITLAB_BASE_URL: 'https://gitlab.com',
      GITLAB_PROJECT_PATH: 'contato276-group/example1',
      GITLAB_TOKEN: 'secret-token',
    },
    defaultBranch: 'martin',
    fetchImpl,
  });

  assert.equal(result.default_branch, 'martin');
  assert.equal(request.options.method, 'PUT');
  assert.match(String(request.options.body || ''), /"default_branch":"martin"/);
});

test('listGitLabBranchPipelines queries the branch ref in GitLab', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify([{ id: 77, ref: 'nexus/tasks/gh-16', status: 'running' }]);
      },
    };
  };

  const result = await listGitLabBranchPipelines({
    env: {
      GITLAB_BASE_URL: 'https://gitlab.com',
      GITLAB_PROJECT_PATH: 'contato276-group/example1',
      GITLAB_TOKEN: 'secret-token',
    },
    project: { id: 99 },
    branchName: 'nexus/tasks/gh-16',
    fetchImpl,
  });

  assert.equal(result[0].id, 77);
  assert.match(requests[0].url, /\/api\/v4\/projects\/99\/pipelines\?ref=nexus%2Ftasks%2Fgh-16&per_page=5$/);
});

test('findGitLabBranchPipeline locates the matching branch pipeline by sha', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify([
          { id: 501, ref: 'nexus/tasks/gh-16', status: 'success', sha: 'old111' },
          {
            id: 502,
            ref: 'nexus/tasks/gh-16',
            status: 'running',
            sha: 'abc123',
            web_url: 'https://gitlab/p/502',
            updated_at: '2026-04-16T03:00:00Z',
          },
        ]);
      },
    };
  };

  const result = await findGitLabBranchPipeline({
    env: {
      GITLAB_BASE_URL: 'https://gitlab.com',
      GITLAB_PROJECT_PATH: 'contato276-group/example1',
      GITLAB_TOKEN: 'secret-token',
    },
    project: { id: 99 },
    branchName: 'nexus/tasks/gh-16',
    commitSha: 'abc123',
    fetchImpl,
  });

  assert.equal(result.found, true);
  assert.equal(result.pipelineId, 502);
  assert.equal(result.status, 'running');
  assert.equal(result.statusClass, 'active');
  assert.equal(result.sha, 'abc123');
  assert.equal(result.webUrl, 'https://gitlab/p/502');
  assert.equal(requests.length, 1);
});

test('findGitLabBranchPipeline reports not-found when the branch has no matching pipeline', async () => {
  const fetchImpl = async () => ({
    ok: true,
    status: 200,
    async text() {
      return JSON.stringify([{ id: 501, ref: 'nexus/tasks/gh-16', status: 'success', sha: 'old111' }]);
    },
  });

  const result = await findGitLabBranchPipeline({
    env: {
      GITLAB_BASE_URL: 'https://gitlab.com',
      GITLAB_PROJECT_PATH: 'contato276-group/example1',
      GITLAB_TOKEN: 'secret-token',
    },
    project: { id: 99 },
    branchName: 'nexus/tasks/gh-16',
    commitSha: 'missing999',
    fetchImpl,
  });

  assert.equal(result.found, false);
  assert.equal(result.reason, 'not-found');
  assert.equal(result.branchName, 'nexus/tasks/gh-16');
  assert.equal(result.sha, 'missing999');
});

test('getGitLabPipeline fetches and normalizes a detailed pipeline payload', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify({
          id: 808,
          ref: 'nexus/tasks/gh-16',
          status: 'manual',
          sha: 'def456',
          web_url: 'https://gitlab/p/808',
          finished_at: '2026-04-16T03:30:00Z',
          updated_at: '2026-04-16T03:31:00Z',
          source: 'push',
        });
      },
    };
  };

  const result = await getGitLabPipeline({
    env: {
      GITLAB_BASE_URL: 'https://gitlab.com',
      GITLAB_PROJECT_PATH: 'contato276-group/example1',
      GITLAB_TOKEN: 'secret-token',
    },
    project: { id: 99 },
    pipelineId: 808,
    fetchImpl,
  });

  assert.equal(result.found, true);
  assert.equal(result.reason, 'fetched');
  assert.equal(result.pipelineId, 808);
  assert.equal(result.status, 'manual');
  assert.equal(result.statusClass, 'blocked');
  assert.equal(result.branchName, 'nexus/tasks/gh-16');
  assert.equal(result.sha, 'def456');
  assert.equal(result.source, 'push');
  assert.equal(result.finishedAt, '2026-04-16T03:30:00Z');
  assert.equal(result.updatedAt, '2026-04-16T03:31:00Z');
  assert.match(requests[0].url, /\/api\/v4\/projects\/99\/pipelines\/808$/);
});

test('ensureGitLabBranchPipeline reuses an existing pipeline for the same sha', async () => {
  const requests = [];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      async text() {
        return JSON.stringify([{ id: 501, ref: 'nexus/tasks/gh-16', status: 'success', sha: 'abc123', web_url: 'https://gitlab/p/501' }]);
      },
    };
  };

  const result = await ensureGitLabBranchPipeline({
    env: {
      GITLAB_BASE_URL: 'https://gitlab.com',
      GITLAB_PROJECT_PATH: 'contato276-group/example1',
      GITLAB_TOKEN: 'secret-token',
    },
    project: { id: 99 },
    branchName: 'nexus/tasks/gh-16',
    commitSha: 'abc123',
    fetchImpl,
  });

  assert.equal(result.triggered, false);
  assert.equal(result.reason, 'already-exists');
  assert.equal(result.pipelineId, 501);
  assert.equal(requests.length, 1);
});

test('ensureGitLabBranchPipeline triggers a pipeline when the branch has none for the mirrored sha', async () => {
  const requests = [];
  const responses = [
    {
      ok: true,
      status: 200,
      body: [],
    },
    {
      ok: true,
      status: 201,
      body: {
        id: 808,
        ref: 'nexus/tasks/gh-16',
        status: 'pending',
        sha: 'def456',
        web_url: 'https://gitlab/p/808',
      },
    },
  ];
  const fetchImpl = async (url, options = {}) => {
    requests.push({ url, options });
    const next = responses.shift();
    return {
      ok: next.ok,
      status: next.status,
      async text() {
        return JSON.stringify(next.body);
      },
    };
  };

  const result = await ensureGitLabBranchPipeline({
    env: {
      GITLAB_BASE_URL: 'https://gitlab.com',
      GITLAB_PROJECT_PATH: 'contato276-group/example1',
      GITLAB_TOKEN: 'secret-token',
    },
    project: { id: 99 },
    branchName: 'nexus/tasks/gh-16',
    commitSha: 'def456',
    fetchImpl,
  });

  assert.equal(result.triggered, true);
  assert.equal(result.pipelineId, 808);
  assert.equal(result.status, 'pending');
  assert.equal(requests[1].options.method, 'POST');
  assert.match(requests[1].url, /\/api\/v4\/projects\/99\/pipeline\?ref=nexus%2Ftasks%2Fgh-16$/);
});
