const fs = require('fs');
const path = require('path');

const VERIFICATION_COMMAND_PATTERNS = Object.freeze([
  /(^|[;&|]\s*)(?:\.\/scripts\/run_backend_checks\.sh|bash\s+\.\/scripts\/run_backend_checks\.sh)\b/i,
  /(^|[;&|]\s*)make\s+(?:check|test|verify)\b/i,
  /(^|[;&|]\s*)(?:python|python3)\s+-m\s+pytest\b/i,
  /(^|[;&|]\s*)(?:[\w./-]*python(?:3(?:\.\d+)?)?(?:\.exe)?)\s+-m\s+pytest\b/i,
  /(^|[;&|]\s*)pytest\b/i,
  /(^|[;&|]\s*)flutter\s+(?:analyze|test|build)\b/i,
  /(^|[;&|]\s*)dart\s+(?:analyze|test)\b/i,
  /(^|[;&|]\s*)npm\s+(?:test|run\s+(?:test|lint|check|build))\b/i,
  /(^|[;&|]\s*)pnpm\s+(?:test|lint|check|build|run\s+(?:test|lint|check|build))\b/i,
  /(^|[;&|]\s*)yarn\s+(?:test|lint|check|build)\b/i,
  /(^|[;&|]\s*)go\s+test\b/i,
  /(^|[;&|]\s*)cargo\s+(?:test|clippy)\b/i,
  /(^|[;&|]\s*)ruff\b/i,
  /(^|[;&|]\s*)mypy\b/i,
  /(^|[;&|]\s*)(?:vitest|jest)\b/i,
  /(^|[;&|]\s*)gradle\b.*\b(?:test|check)\b/i,
  /(^|[;&|]\s*)mvn\b.*\b(?:test|verify)\b/i,
]);

function normalizeShellCommand(command = '') {
  return String(command || '').replace(/\s+/g, ' ').trim();
}

function detectVerificationCommand(toolName, input = {}) {
  if (String(toolName || '').trim() !== 'bash') {
    return { matched: false, command: null };
  }

  const command = normalizeShellCommand(
    typeof input === 'object' && input
      ? input.command || input.cmd || ''
      : '',
  );
  if (!command) {
    return { matched: false, command: null };
  }

  return {
    matched: VERIFICATION_COMMAND_PATTERNS.some((pattern) => pattern.test(command)),
    command,
  };
}

function readFileSafe(filePath) {
  try {
    return fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    return '';
  }
}

function fileExists(filePath) {
  try {
    return fs.existsSync(filePath);
  } catch (_error) {
    return false;
  }
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function makeTargetExists(projectDir, targetName) {
  const makefilePath = path.join(projectDir, 'Makefile');
  if (!fileExists(makefilePath)) return false;
  const content = readFileSafe(makefilePath);
  return new RegExp(`^${escapeRegex(targetName)}:`, 'm').test(content);
}

function uniqueCommands(commands = []) {
  return [...new Set(
    (Array.isArray(commands) ? commands : [])
      .map((command) => normalizeShellCommand(command))
      .filter(Boolean),
  )];
}

function buildSuggestedVerificationCommands(projectDir = '') {
  const root = String(projectDir || '').trim();
  if (!root) return [];

  const suggestions = [];
  const reviewVenvPythonPosix = path.join(root, '.venv-review', 'bin', 'python');
  const reviewVenvPythonWindows = path.join(root, '.venv-review', 'Scripts', 'python.exe');
  const apiVenvPythonPosix = path.join(root, 'services', 'api', '.venv', 'bin', 'python');
  const apiVenvPythonWindows = path.join(root, 'services', 'api', '.venv', 'Scripts', 'python.exe');
  const reviewVenvPythonCommand = fileExists(reviewVenvPythonPosix)
    ? '../../.venv-review/bin/python'
    : fileExists(reviewVenvPythonWindows)
      ? '../../.venv-review/Scripts/python.exe'
      : null;
  const apiVenvPythonCommand = fileExists(apiVenvPythonPosix)
    ? '.venv/bin/python'
    : fileExists(apiVenvPythonWindows)
      ? '.venv/Scripts/python.exe'
      : null;

  if (makeTargetExists(root, 'check')) {
    suggestions.push('make check');
  }

  const backendCheckScript = path.join(root, 'scripts', 'run_backend_checks.sh');
  if (reviewVenvPythonCommand && fileExists(path.join(root, 'services', 'api', 'pyproject.toml'))) {
    suggestions.push(`cd services/api && ${reviewVenvPythonCommand} -m pytest -q`);
  } else if (apiVenvPythonCommand && fileExists(path.join(root, 'services', 'api', 'pyproject.toml'))) {
    suggestions.push(`cd services/api && ${apiVenvPythonCommand} -m pytest -q`);
  } else if (fileExists(backendCheckScript)) {
    suggestions.push('./scripts/run_backend_checks.sh');
  } else if (fileExists(path.join(root, 'services', 'api', 'pyproject.toml'))) {
    suggestions.push(
      "cd services/api && python3 -m venv .venv && .venv/bin/python -m pip install -e '.[dev]' && .venv/bin/python -m pytest -q",
    );
  }

  if (fileExists(path.join(root, 'apps', 'mobile', 'pubspec.yaml'))) {
    suggestions.push('cd apps/mobile && flutter analyze && flutter test');
  }

  return uniqueCommands(suggestions);
}

module.exports = {
  buildSuggestedVerificationCommands,
  detectVerificationCommand,
  normalizeShellCommand,
};
