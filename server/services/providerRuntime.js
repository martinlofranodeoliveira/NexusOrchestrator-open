const {
  detectProviderFromModel,
  normalizeLlmProvider,
  normalizeModelName,
  normalizeReasoningEffort,
  resolveAgentAutonomousModel,
  resolveAgentReasoningEffort,
} = require('./modelRegistry');

const PROVIDER_RUNTIME_DEFAULT_COOLDOWN_MS = Math.max(
  1000,
  Number(process.env.NEXUS_PROVIDER_COOLDOWN_MS || 120000),
);
const PROVIDER_RUNTIME_DEFAULT_FAILURE_THRESHOLD = Math.max(
  1,
  Number(process.env.NEXUS_PROVIDER_FAILURE_THRESHOLD || 1),
);
const PROVIDER_PREFIX_PATTERN = /^(gemini(?:-cli)?|anthropic|claude|openai|gpt|azure(?:[-_\s]?openai)?|xai|grok|openai(?:[-_\s]?compat(?:ible)?)?|local(?:[-_\s]?openai)?|ollama)\s*([:/=])\s*(.+)$/i;
const runtimeCandidateCooldowns = new Map();

function splitFallbackValues(values) {
  if (Array.isArray(values)) {
    return values.flatMap((value) => splitFallbackValues(value));
  }

  if (values && typeof values === 'object') {
    return [values];
  }

  return String(values || '')
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function normalizePositiveInteger(value) {
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function formatRuntimeCandidate(candidate) {
  const provider = normalizeLlmProvider(candidate?.provider);
  const model = String(candidate?.model || '').trim();
  if (!provider || !model) return null;
  return `${provider}/${model}`;
}

function runtimeCandidateKey(candidate) {
  return formatRuntimeCandidate(candidate);
}

function attachRuntimeCandidateReasoning(agent, candidate, explicitReasoningEffort = null) {
  const provider = normalizeLlmProvider(candidate?.provider);
  const model = normalizeModelName(candidate?.model, provider);
  if (!provider || !model) return null;

  const reasoningEffort =
    normalizeReasoningEffort(explicitReasoningEffort, provider) ||
    resolveAgentReasoningEffort({
      ...(agent || {}),
      llmProvider: provider,
      model,
    });

  return {
    provider,
    model,
    reasoningEffort,
  };
}

function normalizeRuntimeCandidate(rawCandidate, providerHint = null, options = {}) {
  if (!rawCandidate) return null;

  if (typeof rawCandidate === 'object' && !Array.isArray(rawCandidate)) {
    const provider =
      normalizeLlmProvider(rawCandidate.provider || rawCandidate.llmProvider) ||
      normalizeLlmProvider(providerHint) ||
      detectProviderFromModel(rawCandidate.model);
    const model = normalizeModelName(rawCandidate.model, provider);
    if (!provider || !model) return null;

    const resolved = attachRuntimeCandidateReasoning(
      options.agent,
      { provider, model },
      rawCandidate.reasoningEffort,
    );
    if (!resolved) return null;

    return {
      ...resolved,
      source: String(rawCandidate.source || options.source || 'fallback').trim(),
      cooldownMs:
        Number.isFinite(Number(rawCandidate.cooldownMs)) && Number(rawCandidate.cooldownMs) > 0
          ? Number(rawCandidate.cooldownMs)
          : null,
    };
  }

  const trimmed = String(rawCandidate || '').trim();
  if (!trimmed) return null;

  const providerPrefixMatch = trimmed.match(PROVIDER_PREFIX_PATTERN);
  const resolvedProvider =
    normalizeLlmProvider(providerPrefixMatch ? providerPrefixMatch[1] : providerHint) ||
    detectProviderFromModel(providerPrefixMatch ? providerPrefixMatch[3] : trimmed);
  const modelText = providerPrefixMatch ? providerPrefixMatch[3] : trimmed;
  const model = normalizeModelName(modelText, resolvedProvider);
  if (!resolvedProvider || !model) return null;

  const resolved = attachRuntimeCandidateReasoning(options.agent, {
    provider: resolvedProvider,
    model,
  });
  if (!resolved) return null;

  return {
    ...resolved,
    source: String(options.source || 'fallback').trim(),
    cooldownMs: null,
  };
}

function normalizeFallbackModels(fallbackModels, providerHint = null, options = {}) {
  return splitFallbackValues(fallbackModels)
    .map((value) =>
      normalizeRuntimeCandidate(value, providerHint, {
        ...options,
        source: options.source || 'agent',
      }),
    )
    .filter(Boolean)
    .map((candidate) => formatRuntimeCandidate(candidate))
    .filter(Boolean)
    .filter((value, index, values) => values.indexOf(value) === index);
}

function providerFallbackEnvKey(provider) {
  const normalized = normalizeLlmProvider(provider);
  switch (normalized) {
    case 'anthropic':
      return 'NEXUS_ANTHROPIC_FALLBACK_CHAIN';
    case 'openai':
      return 'NEXUS_OPENAI_FALLBACK_CHAIN';
    case 'azure_openai':
      return 'NEXUS_AZURE_OPENAI_FALLBACK_CHAIN';
    case 'xai':
      return 'NEXUS_XAI_FALLBACK_CHAIN';
    case 'openai_compat':
      return 'NEXUS_OPENAI_COMPAT_FALLBACK_CHAIN';
    case 'gemini':
    default:
      return 'NEXUS_GEMINI_FALLBACK_CHAIN';
  }
}

function providerActiveLaneLimitEnvKey(provider) {
  const normalized = normalizeLlmProvider(provider);
  if (!normalized) return null;
  return `NEXUS_${normalized.toUpperCase().replace(/[^A-Z0-9]+/g, '_')}_MAX_ACTIVE_LANES`;
}

function readProviderActiveLaneLimit(provider, env = process.env) {
  const envKey = providerActiveLaneLimitEnvKey(provider);
  if (!envKey) return null;
  return normalizePositiveInteger(env[envKey]);
}

function readActiveRuntimeCount(activeRuntimeCounts, candidate) {
  const key = runtimeCandidateKey(candidate);
  if (!key || !activeRuntimeCounts) return 0;

  if (activeRuntimeCounts instanceof Map) {
    return Math.max(0, Number(activeRuntimeCounts.get(key) || 0));
  }

  if (typeof activeRuntimeCounts === 'object' && !Array.isArray(activeRuntimeCounts)) {
    return Math.max(0, Number(activeRuntimeCounts[key] || 0));
  }

  return 0;
}

function resolveLoadBalancedInitialCandidate(primaryCandidate, candidates, options = {}) {
  const activeLaneLimit = readProviderActiveLaneLimit(
    primaryCandidate?.provider,
    options.env || process.env,
  );
  if (!activeLaneLimit) return null;

  const primaryKey = runtimeCandidateKey(primaryCandidate);
  const activeCount = readActiveRuntimeCount(options.activeRuntimeCounts, primaryCandidate);
  if (!primaryKey || activeCount < activeLaneLimit) {
    return null;
  }

  const promotedCandidate = candidates.find((candidate) => {
    const key = runtimeCandidateKey(candidate);
    return key && key !== primaryKey;
  });
  if (!promotedCandidate) return null;

  return {
    candidate: promotedCandidate,
    reason:
      `Balanceamento de carga: ${primaryKey} atingiu ${activeCount}/${activeLaneLimit} ` +
      `lane(s) ativa(s); promovendo ${runtimeCandidateKey(promotedCandidate)} como runtime inicial.`,
  };
}

function readProviderFallbackEntries(provider) {
  const providerKey = providerFallbackEnvKey(provider);
  const globalFallbacks = splitFallbackValues(process.env.NEXUS_AUTONOMOUS_FALLBACK_CHAIN);
  const providerFallbacks = splitFallbackValues(providerKey ? process.env[providerKey] : '');
  return [...globalFallbacks, ...providerFallbacks];
}

function runtimeCooldownSnapshot(candidate, now = Date.now()) {
  const key = runtimeCandidateKey(candidate);
  if (!key) return null;

  const current = runtimeCandidateCooldowns.get(key);
  if (!current) return null;

  if (Number(current.cooldownUntil || 0) <= now) {
    runtimeCandidateCooldowns.delete(key);
    return null;
  }

  return {
    key,
    provider: current.provider,
    model: current.model,
    failureCount: Number(current.failureCount || 0),
    lastFailureAt: current.lastFailureAt || null,
    lastFailureReason: current.lastFailureReason || null,
    lastAgentId: current.lastAgentId || null,
    lastTaskId: current.lastTaskId || null,
    cooldownUntil: current.cooldownUntil,
    cooldownRemainingMs: Math.max(0, current.cooldownUntil - now),
  };
}

function listRuntimeCooldowns(now = Date.now()) {
  return Array.from(runtimeCandidateCooldowns.values())
    .map((candidate) => runtimeCooldownSnapshot(candidate, now))
    .filter(Boolean)
    .sort((left, right) => Number(right.cooldownRemainingMs || 0) - Number(left.cooldownRemainingMs || 0));
}

function markRuntimeCandidateFailure(candidate, metadata = {}) {
  const normalized = normalizeRuntimeCandidate(candidate, candidate?.provider, {
    source: candidate?.source || 'runtime',
  });
  if (!normalized) return null;

  const key = runtimeCandidateKey(normalized);
  const previous = runtimeCooldownsSnapshotByKey(key);
  const failureCount = Number(previous?.failureCount || 0) + 1;
  const cooldownMs = Math.max(
    1000,
    Number(metadata.cooldownMs || normalized.cooldownMs || PROVIDER_RUNTIME_DEFAULT_COOLDOWN_MS),
  );
  const failureThreshold = Math.max(
    1,
    Number(metadata.failureThreshold || PROVIDER_RUNTIME_DEFAULT_FAILURE_THRESHOLD),
  );
  const cooldownUntil =
    failureCount >= failureThreshold ? Date.now() + cooldownMs : Number(previous?.cooldownUntil || 0);

  const nextValue = {
    key,
    provider: normalized.provider,
    model: normalized.model,
    failureCount,
    lastFailureAt: new Date().toISOString(),
    lastFailureReason: String(metadata.reason || metadata.message || '').trim() || null,
    lastAgentId: String(metadata.agentId || '').trim() || null,
    lastTaskId: String(metadata.taskId || '').trim() || null,
    cooldownUntil,
  };
  runtimeCandidateCooldowns.set(key, nextValue);
  return runtimeCooldownSnapshot(nextValue);
}

function runtimeCooldownsSnapshotByKey(key, now = Date.now()) {
  if (!key) return null;
  const current = runtimeCandidateCooldowns.get(key);
  if (!current) return null;
  if (Number(current.cooldownUntil || 0) <= now) {
    runtimeCandidateCooldowns.delete(key);
    return null;
  }
  return current;
}

function clearRuntimeCandidateCooldown(candidate) {
  const key = runtimeCandidateKey(candidate);
  if (!key) return false;
  return runtimeCandidateCooldowns.delete(key);
}

function prioritizeRuntimeCandidates(candidates, now = Date.now()) {
  const available = [];
  const coolingDown = [];

  candidates.forEach((candidate) => {
    const status = runtimeCooldownSnapshot(candidate, now);
    const enrichedCandidate = {
      ...candidate,
      cooldownRemainingMs: Number(status?.cooldownRemainingMs || 0),
      failureCount: Number(status?.failureCount || 0),
      cooldownUntil: status?.cooldownUntil || null,
    };

    if (status?.cooldownRemainingMs > 0) {
      coolingDown.push(enrichedCandidate);
      return;
    }
    available.push(enrichedCandidate);
  });

  return {
    candidates: available.length > 0 ? [...available, ...coolingDown] : [...coolingDown],
    coolingDown,
  };
}

function uniqueRuntimeCandidates(candidates) {
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = runtimeCandidateKey(candidate);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveAgentRuntimePlan(agent, taskTitle, options = {}) {
  const autonomousTarget = resolveAgentAutonomousModel(agent, taskTitle);
  const primaryCandidate = normalizeRuntimeCandidate(
    {
      provider: autonomousTarget.provider,
      model: autonomousTarget.model,
      reasoningEffort: resolveAgentReasoningEffort({
        ...(agent || {}),
        llmProvider: autonomousTarget.provider,
        model: autonomousTarget.model,
      }),
      source: 'primary',
    },
    autonomousTarget.provider,
    { agent, source: 'primary' },
  );

  const fallbackEntries = [
    ...splitFallbackValues(agent?.fallbackModels),
    ...readProviderFallbackEntries(autonomousTarget.provider),
  ];
  const fallbackCandidates = fallbackEntries
    .map((entry) =>
      normalizeRuntimeCandidate(entry, autonomousTarget.provider, {
        agent,
        source: 'fallback',
      }),
    )
    .filter(Boolean);
  const preferredCandidate = normalizeRuntimeCandidate(
    options.preferredCandidate,
    autonomousTarget.provider,
    {
      agent,
      source: 'preferred',
    },
  );

  const prioritized = prioritizeRuntimeCandidates(
    uniqueRuntimeCandidates([preferredCandidate, primaryCandidate, ...fallbackCandidates].filter(Boolean)),
    options.now,
  );
  const primaryKey = runtimeCandidateKey(primaryCandidate);
  const preferredKey = runtimeCandidateKey(preferredCandidate);
  const preferredReason =
    preferredKey && primaryKey && preferredKey !== primaryKey
      ? String(options.preferredReason || '').trim() ||
        `Runtime inicial promovido para ${preferredKey} por política de retentativa.`
      : null;
  let initialCandidate = prioritized.candidates[0] || primaryCandidate;
  let fallbackReason = autonomousTarget.fallbackReason || preferredReason;
  let initialKey = runtimeCandidateKey(initialCandidate);
  let fallbackActive = Boolean(initialKey && primaryKey && initialKey !== primaryKey);

  if (!fallbackActive) {
    const loadBalanced = resolveLoadBalancedInitialCandidate(
      primaryCandidate,
      prioritized.candidates,
      options,
    );
    if (loadBalanced) {
      initialCandidate = loadBalanced.candidate;
      initialKey = runtimeCandidateKey(initialCandidate);
      fallbackActive = Boolean(initialKey && primaryKey && initialKey !== primaryKey);
      fallbackReason = loadBalanced.reason;
    }
  }

  return {
    requestedProvider: autonomousTarget.requestedProvider,
    requestedModel: autonomousTarget.requestedModel,
    fallbackReason,
    primaryCandidate,
    initialCandidate,
    candidates: prioritized.candidates,
    fallbackAvailable: prioritized.candidates.length > 1,
    fallbackActive,
    skippedCooldownCandidates: prioritized.coolingDown,
  };
}

function getProviderRuntimeSnapshot() {
  return {
    cooldowns: listRuntimeCooldowns(),
    defaults: {
      cooldownMs: PROVIDER_RUNTIME_DEFAULT_COOLDOWN_MS,
      failureThreshold: PROVIDER_RUNTIME_DEFAULT_FAILURE_THRESHOLD,
    },
  };
}

module.exports = {
  PROVIDER_RUNTIME_DEFAULT_COOLDOWN_MS,
  PROVIDER_RUNTIME_DEFAULT_FAILURE_THRESHOLD,
  clearRuntimeCandidateCooldown,
  formatRuntimeCandidate,
  getProviderRuntimeSnapshot,
  listRuntimeCooldowns,
  markRuntimeCandidateFailure,
  normalizeFallbackModels,
  normalizeRuntimeCandidate,
  prioritizeRuntimeCandidates,
  readProviderFallbackEntries,
  resolveAgentRuntimePlan,
  runtimeCandidateKey,
  runtimeCooldownSnapshot,
};
