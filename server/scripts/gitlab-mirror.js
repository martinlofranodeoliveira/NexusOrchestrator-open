#!/usr/bin/env node

const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');
const {
  ensureGitLabProject,
  lintGitLabCiConfig,
  mirrorBranchToGitLab,
  resolveGitLabMirrorConfig,
  updateGitLabProject,
} = require('../services/gitlabMirror');

dotenv.config({ path: path.resolve(__dirname, '..', '..', '.env'), quiet: true });

function parseArgs(argv) {
  const args = {};
  const positional = [];
  for (let index = 0; index < argv.length; index += 1) {
    const entry = argv[index];
    if (!entry.startsWith('--')) {
      positional.push(entry);
      continue;
    }

    const [rawKey, ...rest] = entry.slice(2).split('=');
    const key = String(rawKey || '').trim();
    const nextValue = argv[index + 1];
    const value =
      rest.length > 0
        ? rest.join('=')
        : nextValue && !String(nextValue).startsWith('--')
          ? (index += 1, nextValue)
          : 'true';
    args[key] = value;
  }

  return {
    command: positional[0] || 'bootstrap',
    args,
  };
}

function resolveProjectDir(args) {
  const explicitProjectDir =
    String(args['project-dir'] || '').trim()
    || String(process.env.PROJECT_DIR || '').trim();
  if (!explicitProjectDir) {
    throw new Error('Informe --project-dir ou configure PROJECT_DIR no ambiente.');
  }

  return path.resolve(explicitProjectDir);
}

function resolveBranchList(projectDir, args) {
  const explicitBranches = String(args.branches || '').trim();
  if (explicitBranches) {
    return [...new Set(
      explicitBranches
        .split(',')
        .map((entry) => entry.trim())
        .filter(Boolean),
    )];
  }

  const currentBranch = execFileSync('git', ['branch', '--show-current'], {
    cwd: projectDir,
    encoding: 'utf8',
  }).trim();
  return currentBranch ? [currentBranch] : [];
}

async function runBootstrap(args) {
  const projectDir = resolveProjectDir(args);
  const config = resolveGitLabMirrorConfig(process.env);
  if (!config.enabled) {
    throw new Error('GitLab não configurado. Defina GITLAB_PROJECT_PATH e GITLAB_TOKEN.');
  }

  const ensuredProject = await ensureGitLabProject({
    env: process.env,
    projectName: args['project-name'] || null,
    visibility: args.visibility || 'private',
  });
  const lintResult = await lintGitLabCiConfig({
    env: process.env,
    projectDir,
  });
  const branches = resolveBranchList(projectDir, args);
  const mirrorResults = branches.map((branchName) =>
    mirrorBranchToGitLab(projectDir, branchName, {
      env: process.env,
      forcePush: String(args['force-push'] || 'false').trim().toLowerCase() === 'true',
    }),
  );
  const defaultBranch =
    String(args['default-branch'] || '').trim()
    || branches[0]
    || null;
  const updatedProject = defaultBranch
    ? await updateGitLabProject({
        env: process.env,
        defaultBranch,
      })
    : null;

  return {
    config,
    ensuredProject,
    lintResult,
    mirrorResults,
    updatedProject,
  };
}

async function runEnsureProject(args) {
  const result = await ensureGitLabProject({
    env: process.env,
    projectName: args['project-name'] || null,
    visibility: args.visibility || 'private',
  });
  return { ensuredProject: result };
}

async function runLintCi(args) {
  const projectDir = resolveProjectDir(args);
  const lintResult = await lintGitLabCiConfig({
    env: process.env,
    projectDir,
  });
  return { lintResult };
}

async function runPushBranches(args) {
  const projectDir = resolveProjectDir(args);
  const branches = resolveBranchList(projectDir, args);
  const mirrorResults = branches.map((branchName) =>
    mirrorBranchToGitLab(projectDir, branchName, {
      env: process.env,
      forcePush: String(args['force-push'] || 'false').trim().toLowerCase() === 'true',
    }),
  );
  return { mirrorResults };
}

function printBootstrapSummary(result) {
  const project = result.ensuredProject?.project || null;
  const lintStatus = result.lintResult?.status || (result.lintResult?.valid ? 'valid' : 'invalid');
  console.log(`GitLab project: ${project?.path_with_namespace || result.config.projectPath}`);
  console.log(`Project ensured: ${result.ensuredProject?.created ? 'created' : 'existing'}`);
  console.log(`CI lint: ${lintStatus}`);
  if (result.updatedProject?.default_branch) {
    console.log(`Default branch: ${result.updatedProject.default_branch}`);
  }

  result.mirrorResults.forEach((mirror) => {
    if (mirror.mirrored) {
      console.log(`Mirror push ok: ${mirror.branchName} -> ${mirror.projectPath}`);
      return;
    }

    console.log(`Mirror push failed: ${mirror.branchName} -> ${mirror.projectPath || 'gitlab'} :: ${mirror.details || mirror.reason}`);
  });
}

async function main() {
  const parsed = parseArgs(process.argv.slice(2));
  const command = parsed.command;
  const args = parsed.args;

  if (command === 'bootstrap') {
    const result = await runBootstrap(args);
    printBootstrapSummary(result);
    return;
  }

  if (command === 'ensure-project') {
    const result = await runEnsureProject(args);
    console.log(JSON.stringify(result.ensuredProject, null, 2));
    return;
  }

  if (command === 'lint-ci') {
    const result = await runLintCi(args);
    console.log(JSON.stringify(result.lintResult, null, 2));
    return;
  }

  if (command === 'push-branches') {
    const result = await runPushBranches(args);
    console.log(JSON.stringify(result.mirrorResults, null, 2));
    const failed = result.mirrorResults.some((entry) => !entry.mirrored);
    if (failed) {
      process.exitCode = 1;
    }
    return;
  }

  throw new Error(`Comando GitLab mirror desconhecido: ${command}`);
}

main().catch((error) => {
  console.error(`[gitlab-mirror] ${error.message}`);
  process.exitCode = 1;
});
