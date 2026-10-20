const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildOpencodeReviewCommand,
  getOpencodeRuntimeStatus,
  resolveOpencodeExecutionEnv,
  resolveOpencodeRuntimeConfig,
} = require('../services/opencodeRuntime');

test('resolveOpencodeRuntimeConfig keeps OpenCode removed even when env flags try to enable it', () => {
  const config = resolveOpencodeRuntimeConfig({
    NEXUS_OPENCODE_VALIDATOR_ENABLED: 'true',
    NEXUS_OPENCODE_DEFAULT_MODEL: 'google/gemini-2.5-pro',
    NEXUS_OPENCODE_DEFAULT_AGENT: 'plan',
  });

  assert.equal(config.enabled, false);
  assert.equal(config.removed, true);
  assert.equal(config.defaultModel, null);
  assert.equal(config.defaultAgent, null);
  assert.equal(config.reviewFormat, 'json');
});

test('getOpencodeRuntimeStatus does not probe the opencode binary after removal', () => {
  let binaryProbeCount = 0;

  const status = getOpencodeRuntimeStatus({
    env: {
      NEXUS_OPENCODE_VALIDATOR_ENABLED: 'true',
      NEXUS_OPENCODE_COMMAND: 'opencode',
    },
    projectDir: '/tmp/nexus-project',
    binaryChecker() {
      binaryProbeCount += 1;
      return {
        ok: true,
        detail: 'should-not-run',
      };
    },
    useCache: false,
  });

  assert.equal(binaryProbeCount, 0);
  assert.equal(status.enabled, false);
  assert.equal(status.available, false);
  assert.equal(status.ready, false);
  assert.equal(status.removed, true);
  assert.match(status.disabledReason, /removido|removida/i);
});

test('buildOpencodeReviewCommand no longer inherits model defaults from env', () => {
  const spec = buildOpencodeReviewCommand({
    env: {
      NEXUS_OPENCODE_COMMAND: '/usr/local/bin/opencode',
      NEXUS_OPENCODE_DEFAULT_MODEL: 'google/gemini-2.5-pro',
      NEXUS_OPENCODE_DEFAULT_AGENT: 'plan',
      NEXUS_OPENCODE_PRINT_LOGS: 'true',
    },
    workspaceDir: '/tmp/nexus-project',
    prompt: 'revise o diff atual',
  });

  assert.equal(spec.command, '/usr/local/bin/opencode');
  assert.equal(spec.model, null);
  assert.equal(spec.agent, null);
  assert.equal(spec.printLogs, false);
  assert.deepEqual(spec.args, [
    'run',
    '--format',
    'json',
    '--dir',
    '/tmp/nexus-project',
    '--pure',
    'revise o diff atual',
  ]);
});

test('resolveOpencodeExecutionEnv still maps Azure aliases for legacy callers without enabling OpenCode', () => {
  const env = resolveOpencodeExecutionEnv({
    NEXUS_DEFAULT_LLM_PROVIDER: 'azure_openai',
    NEXUS_AZURE_OPENAI_DEFAULT_MODEL: 'gpt-5.4',
    AZURE_OPENAI_ENDPOINT: 'https://nexus-validator.openai.azure.com/',
    AZURE_OPENAI_API_KEY: 'secret',
    AZURE_OPENAI_API_VERSION: '2025-04-01-preview',
  });

  assert.equal(env.AZURE_RESOURCE_NAME, 'nexus-validator');
  assert.equal(env.AZURE_API_KEY, 'secret');
  assert.equal(env.AZURE_API_VERSION, '2025-04-01-preview');
  assert.equal(env.OPENCODE_DEFAULT_MODEL, 'azure/gpt-5.4');
});
