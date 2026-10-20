const test = require('node:test');
const assert = require('node:assert/strict');

const {
  defaultReasoningEffortForProvider,
  detectProviderFromModel,
  getGlobalDefaultLlmProvider,
  listModelsForProvider,
  modelTierForProvider,
  normalizeLlmProvider,
  normalizeModelName,
  normalizeReasoningEffort,
  resolveAgentAutonomousModel,
  resolveAgentReasoningEffort,
  resolveConfiguredLlm,
} = require('../services/modelRegistry');

test('resolveConfiguredLlm infers provider families from model names', () => {
  assert.deepEqual(resolveConfiguredLlm({ model: 'claude-sonnet-4-6' }), {
    llmProvider: 'anthropic',
    model: 'claude-sonnet-4-6',
  });
  assert.deepEqual(resolveConfiguredLlm({ model: 'gpt-5' }), {
    llmProvider: 'openai',
    model: 'gpt-5',
  });
  assert.deepEqual(resolveConfiguredLlm({ model: 'grok-mini' }), {
    llmProvider: 'xai',
    model: 'grok-3-mini',
  });
});

test('normalizeModelName resolves claw-style aliases for anthropic and xai', () => {
  assert.equal(normalizeModelName('sonnet'), 'claude-sonnet-4-6');
  assert.equal(normalizeModelName('opus'), 'claude-opus-4-6');
  assert.equal(normalizeModelName('grok-mini'), 'grok-3-mini');
  assert.equal(normalizeModelName('gpt5', 'openai'), 'gpt-5');
});

test('azure openai provider aliases preserve explicit deployment names', () => {
  assert.equal(normalizeLlmProvider('azure'), 'azure_openai');
  assert.equal(normalizeLlmProvider('azure-openai'), 'azure_openai');
  assert.equal(
    resolveConfiguredLlm({ llmProvider: 'azure', model: 'gpt-5.4-codex-prod' }).llmProvider,
    'azure_openai',
  );
  assert.equal(
    normalizeModelName('gpt-5.4-codex-prod', 'azure_openai'),
    'gpt-5.4-codex-prod',
  );
});

test('openai-compatible aliases support local providers such as ollama', () => {
  assert.equal(normalizeLlmProvider('ollama'), 'openai_compat');
  assert.deepEqual(resolveConfiguredLlm({
    llmProvider: 'ollama',
    model: 'qwen2.5-coder:14b',
  }), {
    llmProvider: 'openai_compat',
    model: 'qwen2.5-coder:14b',
  });
});

test('reasoning effort normalization supports azure/openai aliases and x-high', () => {
  assert.equal(normalizeReasoningEffort('x-high', 'openai'), 'xhigh');
  assert.equal(normalizeReasoningEffort('HIGH', 'azure'), 'high');
  assert.equal(normalizeReasoningEffort('medium', 'gemini'), null);
});

test('detectProviderFromModel distinguishes configured provider families', () => {
  assert.equal(detectProviderFromModel('gemini-3.1-pro-preview'), 'gemini');
  assert.equal(detectProviderFromModel('claude-sonnet-4-6'), 'anthropic');
  assert.equal(detectProviderFromModel('gpt-5.4'), 'openai');
  assert.equal(detectProviderFromModel('grok-3'), 'xai');
  assert.equal(detectProviderFromModel('qwen2.5-coder:14b'), 'openai_compat');
});

test('resolveAgentAutonomousModel preserves supported autonomous providers', () => {
  const result = resolveAgentAutonomousModel(
    {
      id: 'dev',
      role: 'dev',
      llmProvider: 'openai',
      model: 'gpt-5.4',
    },
    'Implementar dashboard financeiro',
  );

  assert.equal(result.requestedProvider, 'openai');
  assert.equal(result.requestedModel, 'gpt-5.4');
  assert.equal(result.provider, 'openai');
  assert.equal(result.model, 'gpt-5.4');
  assert.equal(result.fallbackReason, null);
});

test('listModelsForProvider returns stable catalog for the UI', () => {
  assert.deepEqual(listModelsForProvider('anthropic'), [
    'claude-sonnet-4-6',
    'claude-opus-4-6',
    'claude-haiku-4-5-20251213',
  ]);
  assert.ok(listModelsForProvider('azure').length >= 1);
  assert.ok(listModelsForProvider('openai_compat').length >= 1);
});

test('global default provider and tier helpers honor dynamic provider settings', () => {
  const previous = process.env.NEXUS_DEFAULT_LLM_PROVIDER;
  process.env.NEXUS_DEFAULT_LLM_PROVIDER = 'ollama';

  try {
    assert.equal(getGlobalDefaultLlmProvider(), 'openai_compat');
    assert.equal(modelTierForProvider('openai', 'reasoning'), 'gpt-5.4');
  } finally {
    if (previous === undefined) {
      delete process.env.NEXUS_DEFAULT_LLM_PROVIDER;
    } else {
      process.env.NEXUS_DEFAULT_LLM_PROVIDER = previous;
    }
  }
});

test('reasoning-tier OpenAI and Azure roles default to xhigh unless overridden', () => {
  assert.equal(defaultReasoningEffortForProvider('openai', 'reasoning'), 'xhigh');
  assert.equal(defaultReasoningEffortForProvider('azure_openai', 'reasoning'), 'xhigh');
  assert.equal(defaultReasoningEffortForProvider('openai', 'balanced'), null);
});

test('resolveAgentReasoningEffort honors explicit agent setting before provider defaults', () => {
  assert.equal(
    resolveAgentReasoningEffort({
      llmProvider: 'openai',
      modelTier: 'reasoning',
      reasoningEffort: 'high',
    }),
    'high',
  );
  assert.equal(
    resolveAgentReasoningEffort({
      llmProvider: 'azure_openai',
      modelTier: 'reasoning',
    }),
    'xhigh',
  );
});
