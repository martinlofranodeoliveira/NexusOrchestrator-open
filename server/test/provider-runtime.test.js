const test = require('node:test');
const assert = require('node:assert/strict');

const {
  clearRuntimeCandidateCooldown,
  listRuntimeCooldowns,
  markRuntimeCandidateFailure,
  normalizeFallbackModels,
  resolveAgentRuntimePlan,
} = require('../services/providerRuntime');

test('normalizeFallbackModels canonicalizes provider-prefixed runtime targets', () => {
  assert.deepEqual(
    normalizeFallbackModels(
      [
        'openai:gpt-5.4-mini',
        'azure/gpt-5.4-codex-prod',
        'openai_compat:qwen2.5-coder:14b',
        'gpt-5.4-mini',
      ],
      'openai',
    ),
    [
      'openai/gpt-5.4-mini',
      'azure_openai/gpt-5.4-codex-prod',
      'openai_compat/qwen2.5-coder:14b',
    ],
  );
});

test('resolveAgentRuntimePlan skips cooled-down primary candidate in favor of the next fallback', () => {
  const primaryCandidate = {
    provider: 'openai',
    model: 'gpt-5',
  };

  try {
    markRuntimeCandidateFailure(primaryCandidate, {
      reason: 'temporary outage',
      cooldownMs: 60000,
      failureThreshold: 1,
      agentId: 'dev',
      taskId: 'NX-TASK-1',
    });

    const plan = resolveAgentRuntimePlan(
      {
        id: 'dev',
        role: 'dev',
        llmProvider: 'openai',
        model: 'gpt-5',
        fallbackModels: ['openai/gpt-5.4-mini', 'openai_compat/qwen2.5-coder:14b'],
      },
      'Implementar dashboard financeiro',
    );

    assert.equal(plan.primaryCandidate.provider, 'openai');
    assert.equal(plan.primaryCandidate.model, 'gpt-5');
    assert.equal(plan.initialCandidate.provider, 'openai');
    assert.equal(plan.initialCandidate.model, 'gpt-5.4-mini');
    assert.equal(plan.fallbackActive, true);
    assert.ok(plan.skippedCooldownCandidates.some((candidate) => candidate.model === 'gpt-5'));
    assert.ok(listRuntimeCooldowns().some((candidate) => candidate.model === 'gpt-5'));
  } finally {
    clearRuntimeCandidateCooldown(primaryCandidate);
  }
});

test('resolveAgentRuntimePlan can promote a preferred fallback candidate for provider retry', () => {
  const plan = resolveAgentRuntimePlan(
    {
      id: 'dev',
      role: 'dev',
      llmProvider: 'azure_openai',
      model: 'gpt-5.4',
      fallbackModels: ['gemini/gemini-3.1-pro-preview'],
    },
    'Implementar chat realtime',
    {
      preferredCandidate: 'gemini/gemini-3.1-pro-preview',
      preferredReason: 'Retentativa após falha transitória do Azure.',
    },
  );

  assert.equal(plan.primaryCandidate.provider, 'azure_openai');
  assert.equal(plan.primaryCandidate.model, 'gpt-5.4');
  assert.equal(plan.initialCandidate.provider, 'gemini');
  assert.equal(plan.initialCandidate.model, 'gemini-3.1-pro-preview');
  assert.equal(plan.fallbackActive, true);
  assert.equal(plan.fallbackReason, 'Retentativa após falha transitória do Azure.');
});

test('resolveAgentRuntimePlan proactively load-sheds Azure lanes to Gemini when the lane cap is reached', () => {
  process.env.NEXUS_AZURE_OPENAI_MAX_ACTIVE_LANES = '2';

  try {
    const plan = resolveAgentRuntimePlan(
      {
        id: 'dev',
        role: 'dev',
        llmProvider: 'azure_openai',
        model: 'gpt-5.4',
        fallbackModels: ['gemini/gemini-3.1-pro-preview'],
      },
      'Implementar agregador de sinais',
      {
        activeRuntimeCounts: new Map([
          ['azure_openai/gpt-5.4', 2],
        ]),
      },
    );

    assert.equal(plan.primaryCandidate.provider, 'azure_openai');
    assert.equal(plan.initialCandidate.provider, 'gemini');
    assert.equal(plan.initialCandidate.model, 'gemini-3.1-pro-preview');
    assert.equal(plan.fallbackActive, true);
    assert.match(plan.fallbackReason, /Balanceamento de carga/);
  } finally {
    delete process.env.NEXUS_AZURE_OPENAI_MAX_ACTIVE_LANES;
  }
});
