const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { runDoctor } = require('../services/doctorService');

test('runDoctor reports OpenCode as removed without failing the doctor check', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-doctor-opencode-'));

  try {
    fs.mkdirSync(path.join(tempRoot, '.git'), { recursive: true });
    const result = runDoctor({
      env: {
        NEXUS_OPENCODE_VALIDATOR_ENABLED: 'true',
      },
      projectDir: tempRoot,
      workspaceRoot: tempRoot,
      binaryChecker() {
        return {
          ok: true,
          detail: 'ok',
        };
      },
    });

    const validatorCheck = result.checks.find((check) => check.key === 'opencode_validator_binary');
    const gateCheck = result.checks.find((check) => check.key === 'opencode_review_gate');
    assert.equal(result.ok, true);
    assert.equal(Boolean(validatorCheck), true);
    assert.equal(Boolean(gateCheck), true);
    assert.equal(validatorCheck.ok, true);
    assert.equal(validatorCheck.severity, 'info');
    assert.match(validatorCheck.summary, /removido/i);
    assert.equal(gateCheck.ok, true);
    assert.equal(gateCheck.severity, 'info');
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('runDoctor reports figma bridge readiness without turning missing token into a hard error', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-doctor-figma-'));

  try {
    fs.mkdirSync(path.join(tempRoot, '.git'), { recursive: true });
    const result = runDoctor({
      env: {},
      projectDir: tempRoot,
      workspaceRoot: tempRoot,
      binaryChecker() {
        return {
          ok: true,
          detail: 'ok',
        };
      },
      opencodeStatus: {
        enabled: false,
        available: false,
        command: 'opencode',
        version: null,
        defaultModel: null,
        defaultAgent: 'plan',
        reviewFormat: 'json',
        authConfigured: false,
        ready: false,
      },
      figmaBridge: {
        enabled: true,
        ready: false,
        tokenConfigured: false,
        tokenSource: null,
        apiBaseUrl: 'https://api.figma.com/v1',
      },
    });

    const figmaCheck = result.checks.find((check) => check.key === 'figma_bridge');
    assert.equal(result.ok, true);
    assert.equal(Boolean(figmaCheck), true);
    assert.equal(figmaCheck.ok, true);
    assert.equal(figmaCheck.severity, 'info');
    assert.match(figmaCheck.summary, /figma bridge/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('runDoctor reports stitch bridge readiness without turning missing credentials into a hard error', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-doctor-stitch-'));

  try {
    fs.mkdirSync(path.join(tempRoot, '.git'), { recursive: true });
    const result = runDoctor({
      env: {},
      projectDir: tempRoot,
      workspaceRoot: tempRoot,
      binaryChecker() {
        return {
          ok: true,
          detail: 'ok',
        };
      },
      opencodeStatus: {
        enabled: false,
        available: false,
        command: 'opencode',
        version: null,
        defaultModel: null,
        defaultAgent: 'plan',
        reviewFormat: 'json',
        authConfigured: false,
        ready: false,
      },
      stitchBridge: {
        enabled: true,
        ready: false,
        authMode: 'none',
        projectId: null,
        mcpUrl: 'https://stitch.googleapis.com/mcp',
      },
    });

    const stitchCheck = result.checks.find((check) => check.key === 'stitch_bridge');
    assert.equal(result.ok, true);
    assert.equal(Boolean(stitchCheck), true);
    assert.equal(stitchCheck.ok, true);
    assert.equal(stitchCheck.severity, 'info');
    assert.match(stitchCheck.summary, /stitch bridge/i);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
