const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function resolveReviewWorkspaceRuntimePaths(workspaceDir, platform = process.platform) {
  const root = String(workspaceDir || '').trim();
  if (!root) {
    return null;
  }

  const reviewVenvDir = path.join(root, '.venv-review');
  const reviewPython = platform === 'win32'
    ? path.join(reviewVenvDir, 'Scripts', 'python.exe')
    : path.join(reviewVenvDir, 'bin', 'python');
  const apiDir = path.join(root, 'services', 'api');
  const pyprojectPath = path.join(apiDir, 'pyproject.toml');

  return {
    workspaceDir: root,
    reviewVenvDir,
    reviewPython,
    apiDir,
    pyprojectPath,
  };
}

function buildReviewWorkspaceRuntimePlan(workspaceDir, options = {}) {
  const runtimePaths = resolveReviewWorkspaceRuntimePaths(workspaceDir, options.platform);
  if (!runtimePaths) {
    return {
      action: 'skip',
      reason: 'missing-workspace',
      runtimePaths: null,
      commands: [],
    };
  }

  if (!fs.existsSync(runtimePaths.pyprojectPath)) {
    return {
      action: 'skip',
      reason: 'no-api-pyproject',
      runtimePaths,
      commands: [],
    };
  }

  if (fs.existsSync(runtimePaths.reviewPython)) {
    return {
      action: 'reuse',
      reason: 'review-runtime-ready',
      runtimePaths,
      commands: [],
    };
  }

  const bootstrapPython = String(options.bootstrapPython || process.env.NEXUS_REVIEW_RUNTIME_PYTHON || 'python3').trim() || 'python3';

  return {
    action: 'bootstrap',
    reason: 'review-runtime-missing',
    runtimePaths,
    commands: [
      {
        command: bootstrapPython,
        args: ['-m', 'venv', '.venv-review'],
        cwd: runtimePaths.workspaceDir,
      },
      {
        command: runtimePaths.reviewPython,
        args: ['-m', 'pip', 'install', '--upgrade', 'pip'],
        cwd: runtimePaths.workspaceDir,
      },
      {
        command: runtimePaths.reviewPython,
        args: ['-m', 'pip', 'install', '-e', '.[dev]'],
        cwd: runtimePaths.apiDir,
      },
    ],
  };
}

function executeReviewWorkspaceCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    env: options.env || process.env,
    encoding: 'utf8',
    maxBuffer: 10 * 1024 * 1024,
  });

  if (result.status === 0) {
    return result;
  }

  const failure = new Error(
    [
      `${command} ${Array.isArray(args) ? args.join(' ') : ''}`.trim(),
      result.stderr || result.stdout || 'falha ao preparar runtime de review',
    ]
      .filter(Boolean)
      .join(': '),
  );
  failure.status = result.status;
  failure.stdout = result.stdout;
  failure.stderr = result.stderr;
  throw failure;
}

function ensureReviewWorkspaceRuntime(workspaceDir, options = {}) {
  const plan = buildReviewWorkspaceRuntimePlan(workspaceDir, options);
  const runtimePaths = plan.runtimePaths || null;

  if (plan.action === 'skip') {
    return {
      prepared: false,
      reused: false,
      skipped: true,
      reason: plan.reason,
      reviewPython: runtimePaths?.reviewPython || null,
      reviewVenvDir: runtimePaths?.reviewVenvDir || null,
    };
  }

  if (plan.action === 'reuse') {
    return {
      prepared: true,
      reused: true,
      skipped: false,
      reason: plan.reason,
      reviewPython: runtimePaths.reviewPython,
      reviewVenvDir: runtimePaths.reviewVenvDir,
    };
  }

  fs.mkdirSync(runtimePaths.reviewVenvDir, { recursive: true });
  const runner = typeof options.runner === 'function' ? options.runner : executeReviewWorkspaceCommand;

  plan.commands.forEach((entry) => {
    runner(entry.command, entry.args, {
      cwd: entry.cwd,
      env: options.env || process.env,
    });
  });

  return {
    prepared: true,
    reused: false,
    skipped: false,
    reason: plan.reason,
    reviewPython: runtimePaths.reviewPython,
    reviewVenvDir: runtimePaths.reviewVenvDir,
  };
}

module.exports = {
  buildReviewWorkspaceRuntimePlan,
  ensureReviewWorkspaceRuntime,
  resolveReviewWorkspaceRuntimePaths,
};
