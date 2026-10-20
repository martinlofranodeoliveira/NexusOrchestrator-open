const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildSuggestedVerificationCommands,
  detectVerificationCommand,
} = require('../services/reviewEvidence');

test('detectVerificationCommand recognizes material backend and mobile checks', () => {
  assert.equal(
    detectVerificationCommand('bash', {
      command: 'make check && ./scripts/run_backend_checks.sh',
    }).matched,
    true,
  );
  assert.equal(
    detectVerificationCommand('bash', {
      command: 'cd apps/mobile && flutter analyze && flutter test',
    }).matched,
    true,
  );
  assert.equal(
    detectVerificationCommand('bash', {
      command: 'cd services/api && python -m pytest -q',
    }).matched,
    true,
  );
  assert.equal(
    detectVerificationCommand('bash', {
      command: 'cd services/api && ../../.venv-review/bin/python -m pytest -q',
    }).matched,
    true,
  );
});

test('detectVerificationCommand ignores pure inspection commands', () => {
  assert.equal(
    detectVerificationCommand('bash', {
      command: 'find services/api -maxdepth 3 -type f | sort',
    }).matched,
    false,
  );
  assert.equal(
    detectVerificationCommand('bash', {
      command: 'git diff --stat',
    }).matched,
    false,
  );
});

test('buildSuggestedVerificationCommands prioritizes repo-native checks when present', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-review-evidence-'));
  fs.writeFileSync(path.join(tempRoot, 'Makefile'), '.PHONY: check\ncheck:\n\t@echo ok\n', 'utf8');
  fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'scripts', 'run_backend_checks.sh'), '#!/usr/bin/env sh\n', 'utf8');
  fs.mkdirSync(path.join(tempRoot, 'apps', 'mobile'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'apps', 'mobile', 'pubspec.yaml'), 'name: sample\n', 'utf8');

  const suggestions = buildSuggestedVerificationCommands(tempRoot);

  assert.deepEqual(suggestions, [
    'make check',
    './scripts/run_backend_checks.sh',
    'cd apps/mobile && flutter analyze && flutter test',
  ]);
});

test('buildSuggestedVerificationCommands falls back to a local service pytest flow without forcing APP_ENV', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-review-evidence-fallback-'));
  fs.mkdirSync(path.join(tempRoot, 'services', 'api'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'services', 'api', 'pyproject.toml'), '[project]\nname = "sample"\n', 'utf8');

  const suggestions = buildSuggestedVerificationCommands(tempRoot);

  assert.deepEqual(suggestions, [
    "cd services/api && python3 -m venv .venv && .venv/bin/python -m pip install -e '.[dev]' && .venv/bin/python -m pytest -q",
  ]);
});

test('buildSuggestedVerificationCommands prefers review venv pytest over mutable backend bootstrap when available', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-review-evidence-review-venv-'));
  fs.mkdirSync(path.join(tempRoot, '.venv-review', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, '.venv-review', 'bin', 'python'), '', 'utf8');
  fs.mkdirSync(path.join(tempRoot, 'services', 'api'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'services', 'api', 'pyproject.toml'), '[project]\nname = "sample"\n', 'utf8');
  fs.mkdirSync(path.join(tempRoot, 'scripts'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'scripts', 'run_backend_checks.sh'), '#!/usr/bin/env sh\n', 'utf8');

  const suggestions = buildSuggestedVerificationCommands(tempRoot);

  assert.deepEqual(suggestions, [
    'cd services/api && ../../.venv-review/bin/python -m pytest -q',
  ]);
});

test('buildSuggestedVerificationCommands uses the existing api venv before bootstrapping a new one', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-review-evidence-api-venv-'));
  fs.mkdirSync(path.join(tempRoot, 'services', 'api', '.venv', 'bin'), { recursive: true });
  fs.writeFileSync(path.join(tempRoot, 'services', 'api', '.venv', 'bin', 'python'), '', 'utf8');
  fs.writeFileSync(path.join(tempRoot, 'services', 'api', 'pyproject.toml'), '[project]\nname = "sample"\n', 'utf8');

  const suggestions = buildSuggestedVerificationCommands(tempRoot);

  assert.deepEqual(suggestions, [
    'cd services/api && .venv/bin/python -m pytest -q',
  ]);
});
