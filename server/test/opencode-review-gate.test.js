const test = require('node:test');
const assert = require('node:assert/strict');

const {
  GATE_RESULT_END,
  GATE_RESULT_START,
  buildOpencodeReviewGateInlineConfig,
  buildOpencodeReviewGatePrompt,
  parseOpencodeReviewGateOutput,
  resolveOpencodeReviewGateConfig,
  runOpencodeReviewGate,
} = require('../services/opencodeReviewGate');

test('resolveOpencodeReviewGateConfig keeps the OpenCode gate removed', () => {
  assert.deepEqual(
    resolveOpencodeReviewGateConfig({
      NEXUS_OPENCODE_VALIDATOR_ENABLED: 'true',
      NEXUS_OPENCODE_REVIEW_GATE_ENABLED: 'true',
      NEXUS_OPENCODE_REVIEW_GATE_MODE: 'required',
      NEXUS_OPENCODE_REVIEW_TIMEOUT_MS: '420000',
    }),
    {
      enabled: false,
      mode: 'disabled',
      timeoutMs: 0,
      removed: true,
      disabledReason: 'OpenCode review gate foi removido do fluxo do Nexus.',
    },
  );
});

test('runOpencodeReviewGate skips without spawning or blocking promotion', async () => {
  let spawnCount = 0;

  const result = await runOpencodeReviewGate({
    env: {
      NEXUS_OPENCODE_VALIDATOR_ENABLED: 'true',
      NEXUS_OPENCODE_REVIEW_GATE_ENABLED: 'true',
    },
    workspaceDir: '/tmp/nexus-opencode-removed',
    spawnImpl() {
      spawnCount += 1;
      throw new Error('should not spawn');
    },
  });

  assert.equal(spawnCount, 0);
  assert.equal(result.enabled, false);
  assert.equal(result.status, 'skipped');
  assert.equal(result.verdict, 'skipped');
  assert.equal(result.blocking, false);
  assert.equal(result.recommendedNextStatus, 'done');
  assert.equal(result.reason, 'gate-disabled');
});

test('buildOpencodeReviewGateInlineConfig still documents the old read-only permission shape', () => {
  const config = buildOpencodeReviewGateInlineConfig();

  assert.equal(config.permission['*'], 'deny');
  assert.equal(config.permission.read, 'allow');
  assert.equal(config.permission.edit, 'deny');
  assert.equal(config.permission.bash['git diff*'], 'allow');
  assert.equal(config.permission.bash['rm *'], undefined);
});

test('buildOpencodeReviewGatePrompt emits deterministic markers and task context', () => {
  const prompt = buildOpencodeReviewGatePrompt({
    taskId: 'GH-77',
    taskTitle: 'Fechar review gate',
    workspaceDir: '/tmp/nexus',
    targetBranch: 'task/gh-77',
    baseBranch: 'main',
    verificationCommands: ['make check', 'cd services/api && pytest -q'],
  });

  assert.match(prompt, /GH-77/);
  assert.match(prompt, /task\/gh-77/);
  assert.match(prompt, new RegExp(GATE_RESULT_START));
  assert.match(prompt, new RegExp(GATE_RESULT_END));
  assert.match(prompt, /make check/);
});

test('parseOpencodeReviewGateOutput extracts structured verdict from json events', () => {
  const payload = {
    verdict: 'rejected',
    summary: 'CI vai quebrar no backend.',
    findings: ['faltou pytest para a rota nova'],
    evidence: ['python -m pytest -q'],
    confidence: 'high',
    recommended_next_status: 'ready',
  };
  const stdout = `${JSON.stringify({
    type: 'message.part.updated',
    properties: {
      sessionID: 'ses_123',
      time: Date.now(),
      part: {
        id: 'prt_123',
        sessionID: 'ses_123',
        messageID: 'msg_123',
        type: 'text',
        text: `${GATE_RESULT_START}\n${JSON.stringify(payload)}\n${GATE_RESULT_END}`,
      },
    },
  })}\n`;

  const result = parseOpencodeReviewGateOutput({
    stdout,
    stderr: '',
    exitCode: 0,
  });

  assert.equal(result.status, 'completed');
  assert.equal(result.verdict, 'rejected');
  assert.equal(result.summary, 'CI vai quebrar no backend.');
  assert.deepEqual(result.findings, ['faltou pytest para a rota nova']);
  assert.deepEqual(result.evidence, ['python -m pytest -q']);
  assert.equal(result.recommendedNextStatus, 'ready');
  assert.equal(result.parsed, true);
});
