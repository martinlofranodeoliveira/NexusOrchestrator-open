const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildReviewWorkspaceRuntimePlan,
  ensureReviewWorkspaceRuntime,
  resolveReviewWorkspaceRuntimePaths,
} = require('../services/reviewWorkspaceRuntime');

test('resolveReviewWorkspaceRuntimePaths targets the review venv at the workspace root', () => {
  const runtimePaths = resolveReviewWorkspaceRuntimePaths('/tmp/example-review', 'linux');

  assert.equal(runtimePaths.reviewVenvDir.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/'), '/tmp/example-review/.venv-review');
  assert.equal(runtimePaths.reviewPython.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/'), '/tmp/example-review/.venv-review/bin/python');
  assert.equal(runtimePaths.apiDir.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/'), '/tmp/example-review/services/api');
  assert.equal(runtimePaths.pyprojectPath.replace(/^[a-zA-Z]:/, '').replace(/\\/g, '/'), '/tmp/example-review/services/api/pyproject.toml');
});

test('buildReviewWorkspaceRuntimePlan skips workspaces without the backend pyproject', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-review-runtime-skip-'));

  try {
    const plan = buildReviewWorkspaceRuntimePlan(tempRoot, { platform: 'linux' });

    assert.equal(plan.action, 'skip');
    assert.equal(plan.reason, 'no-api-pyproject');
    assert.deepEqual(plan.commands, []);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('buildReviewWorkspaceRuntimePlan reuses an existing review venv when present', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-review-runtime-reuse-'));

  try {
    fs.mkdirSync(path.join(tempRoot, 'services', 'api'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'services', 'api', 'pyproject.toml'), '[project]\nname="sample"\n', 'utf8');
    fs.mkdirSync(path.join(tempRoot, '.venv-review', 'bin'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, '.venv-review', 'bin', 'python'), '', 'utf8');

    const plan = buildReviewWorkspaceRuntimePlan(tempRoot, { platform: 'linux' });

    assert.equal(plan.action, 'reuse');
    assert.equal(plan.reason, 'review-runtime-ready');
    assert.deepEqual(plan.commands, []);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureReviewWorkspaceRuntime bootstraps the review venv when the backend exists', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-review-runtime-bootstrap-'));

  try {
    fs.mkdirSync(path.join(tempRoot, 'services', 'api'), { recursive: true });
    fs.writeFileSync(path.join(tempRoot, 'services', 'api', 'pyproject.toml'), '[project]\nname="sample"\n', 'utf8');

    const calls = [];
    const result = ensureReviewWorkspaceRuntime(tempRoot, {
      platform: 'linux',
      bootstrapPython: 'python3',
      runner(command, args, options) {
        calls.push({
          command,
          args,
          cwd: options.cwd,
        });
      },
    });

    assert.equal(result.prepared, true);
    assert.equal(result.reused, false);
    assert.equal(result.reason, 'review-runtime-missing');
    assert.equal(result.reviewPython, path.join(tempRoot, '.venv-review', 'bin', 'python'));
    assert.equal(calls.length, 3);
    assert.deepEqual(calls[0], {
      command: 'python3',
      args: ['-m', 'venv', '.venv-review'],
      cwd: tempRoot,
    });
    assert.deepEqual(calls[1], {
      command: path.join(tempRoot, '.venv-review', 'bin', 'python'),
      args: ['-m', 'pip', 'install', '--upgrade', 'pip'],
      cwd: tempRoot,
    });
    assert.deepEqual(calls[2], {
      command: path.join(tempRoot, '.venv-review', 'bin', 'python'),
      args: ['-m', 'pip', 'install', '-e', '.[dev]'],
      cwd: path.join(tempRoot, 'services', 'api'),
    });
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
