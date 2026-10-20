const {
  DEFAULT_GEMINI_MODEL: BUILTIN_DEFAULT_GEMINI_MODEL,
  GEMINI_FLASH_LITE_MODEL,
  GEMINI_PRO_MODEL,
} = require('./geminiCli');

const DEFAULT_GEMINI_MODEL =
  String(process.env.NEXUS_GEMINI_DEFAULT_MODEL || BUILTIN_DEFAULT_GEMINI_MODEL).trim()
  || BUILTIN_DEFAULT_GEMINI_MODEL;
const DEFAULT_ANTHROPIC_MODEL =
  String(process.env.NEXUS_ANTHROPIC_DEFAULT_MODEL || 'claude-sonnet-4-6').trim()
  || 'claude-sonnet-4-6';
const DEFAULT_OPENAI_MODEL =
  String(process.env.NEXUS_OPENAI_DEFAULT_MODEL || 'gpt-5').trim() || 'gpt-5';
const DEFAULT_AZURE_OPENAI_MODEL =
  String(
    process.env.NEXUS_AZURE_OPENAI_DEFAULT_MODEL ||
      process.env.AZURE_OPENAI_DEPLOYMENT ||
      process.env.NEXUS_OPENAI_DEFAULT_MODEL ||
      'azure-openai-deployment',
  ).trim() || 'azure-openai-deployment';
const DEFAULT_XAI_MODEL =
  String(process.env.NEXUS_XAI_DEFAULT_MODEL || 'grok-3-mini').trim() || 'grok-3-mini';
const DEFAULT_OPENAI_COMPAT_MODEL =
  String(
    process.env.NEXUS_OPENAI_COMPAT_DEFAULT_MODEL ||
      process.env.OLLAMA_MODEL ||
      'qwen2.5-coder:7b',
  ).trim() || 'qwen2.5-coder:7b';
const REASONING_EFFORT_VALUES = new Set(['low', 'medium', 'high', 'xhigh', 'max']);
const REASONING_EFFORT_PROVIDERS = new Set(['openai', 'azure_openai', 'openai_compat']);

function uniqueModels(models) {
  return [...new Set(models.map((value) => String(value || '').trim()).filter(Boolean))];
}

function normalizeLlmProvider(rawProvider) {
  const normalized = String(rawProvider || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized === 'gemini' || normalized === 'gemini-cli') return 'gemini';
  if (normalized === 'anthropic' || normalized === 'claude') return 'anthropic';
  if (normalized === 'openai' || normalized === 'gpt') return 'openai';
  if (
    normalized === 'azure' ||
    normalized === 'azure-openai' ||
    normalized === 'azure_openai' ||
    normalized === 'azure openai'
  ) {
    return 'azure_openai';
  }
  if (normalized === 'xai' || normalized === 'grok') return 'xai';
  if (
    normalized === 'openai_compat' ||
    normalized === 'openai-compatible' ||
    normalized === 'openai compatible' ||
    normalized === 'local-openai' ||
    normalized === 'local_openai' ||
    normalized === 'local openai' ||
    normalized === 'ollama'
  ) {
    return 'openai_compat';
  }
  return null;
}

function getGlobalDefaultLlmProvider() {
  return normalizeLlmProvider(process.env.NEXUS_DEFAULT_LLM_PROVIDER) || 'gemini';
}

function supportsReasoningEffort(provider) {
  const normalized = normalizeLlmProvider(provider);
  return Boolean(normalized && REASONING_EFFORT_PROVIDERS.has(normalized));
}

function normalizeReasoningEffort(rawValue, providerHint = null) {
  const provider = normalizeLlmProvider(providerHint);
  if (!supportsReasoningEffort(provider)) return null;

  const normalized = String(rawValue || '')
    .trim()
    .toLowerCase()
    .replace(/[_\s-]+/g, '');

  if (!normalized || normalized === 'auto' || normalized === 'default' || normalized === 'none') {
    return null;
  }

  return REASONING_EFFORT_VALUES.has(normalized) ? normalized : null;
}

function getProviderReasoningEffortEnvVar(provider) {
  const normalizedProvider = normalizeLlmProvider(provider);
  if (normalizedProvider === 'azure_openai') {
    return 'NEXUS_AZURE_OPENAI_DEFAULT_REASONING_EFFORT';
  }
  if (normalizedProvider === 'openai') {
    return 'NEXUS_OPENAI_DEFAULT_REASONING_EFFORT';
  }
  if (normalizedProvider === 'openai_compat') {
    return 'NEXUS_OPENAI_COMPAT_DEFAULT_REASONING_EFFORT';
  }
  return null;
}

function defaultReasoningEffortForProvider(provider, tier = 'balanced') {
  const normalizedProvider = normalizeLlmProvider(provider);
  if (!supportsReasoningEffort(normalizedProvider)) return null;

  const envKey = getProviderReasoningEffortEnvVar(normalizedProvider);
  const fromEnv = envKey
    ? normalizeReasoningEffort(process.env[envKey], normalizedProvider)
    : null;
  if (fromEnv) return fromEnv;

  return String(tier || 'balanced').trim().toLowerCase() === 'reasoning' ? 'xhigh' : null;
}

function getProviderTierModels(provider) {
  switch (normalizeLlmProvider(provider)) {
    case 'anthropic':
      return {
        fast:
          String(process.env.NEXUS_ANTHROPIC_FAST_MODEL || 'claude-haiku-4-5-20251213').trim()
          || 'claude-haiku-4-5-20251213',
        balanced: DEFAULT_ANTHROPIC_MODEL,
        reasoning:
          String(process.env.NEXUS_ANTHROPIC_REASONING_MODEL || 'claude-opus-4-6').trim()
          || 'claude-opus-4-6',
      };
    case 'openai':
      return {
        fast: String(process.env.NEXUS_OPENAI_FAST_MODEL || 'gpt-5.4-mini').trim() || 'gpt-5.4-mini',
        balanced: DEFAULT_OPENAI_MODEL,
        reasoning:
          String(process.env.NEXUS_OPENAI_REASONING_MODEL || 'gpt-5.4').trim() || 'gpt-5.4',
      };
    case 'azure_openai':
      return {
        fast:
          String(process.env.NEXUS_AZURE_OPENAI_FAST_MODEL || DEFAULT_AZURE_OPENAI_MODEL).trim()
          || DEFAULT_AZURE_OPENAI_MODEL,
        balanced: DEFAULT_AZURE_OPENAI_MODEL,
        reasoning:
          String(
            process.env.NEXUS_AZURE_OPENAI_REASONING_MODEL || DEFAULT_AZURE_OPENAI_MODEL,
          ).trim() || DEFAULT_AZURE_OPENAI_MODEL,
      };
    case 'xai':
      return {
        fast: String(process.env.NEXUS_XAI_FAST_MODEL || 'grok-3-mini').trim() || 'grok-3-mini',
        balanced: DEFAULT_XAI_MODEL,
        reasoning:
          String(process.env.NEXUS_XAI_REASONING_MODEL || 'grok-3').trim() || 'grok-3',
      };
    case 'openai_compat':
      return {
        fast:
          String(process.env.NEXUS_OPENAI_COMPAT_FAST_MODEL || DEFAULT_OPENAI_COMPAT_MODEL).trim()
          || DEFAULT_OPENAI_COMPAT_MODEL,
        balanced: DEFAULT_OPENAI_COMPAT_MODEL,
        reasoning:
          String(
            process.env.NEXUS_OPENAI_COMPAT_REASONING_MODEL || DEFAULT_OPENAI_COMPAT_MODEL,
          ).trim() || DEFAULT_OPENAI_COMPAT_MODEL,
      };
    case 'gemini':
    default:
      return {
        fast:
          String(process.env.NEXUS_GEMINI_FAST_MODEL || GEMINI_FLASH_LITE_MODEL).trim()
          || GEMINI_FLASH_LITE_MODEL,
        balanced: DEFAULT_GEMINI_MODEL,
        reasoning:
          String(process.env.NEXUS_GEMINI_REASONING_MODEL || GEMINI_PRO_MODEL).trim()
          || GEMINI_PRO_MODEL,
      };
  }
}

function modelTierForProvider(provider, tier = 'balanced') {
  const normalizedProvider = normalizeLlmProvider(provider) || 'gemini';
  const normalizedTier = String(tier || 'balanced').trim().toLowerCase();
  const models = getProviderTierModels(normalizedProvider);

  if (normalizedTier === 'fast') return normalizeModelName(models.fast, normalizedProvider);
  if (normalizedTier === 'reasoning') {
    return normalizeModelName(models.reasoning, normalizedProvider);
  }
  return normalizeModelName(models.balanced, normalizedProvider);
}

const PROVIDER_MODEL_OPTIONS = Object.freeze({
  gemini: uniqueModels([
    modelTierForProvider('gemini', 'fast'),
    modelTierForProvider('gemini', 'balanced'),
    modelTierForProvider('gemini', 'reasoning'),
  ]),
  anthropic: uniqueModels([
    modelTierForProvider('anthropic', 'balanced'),
    modelTierForProvider('anthropic', 'reasoning'),
    modelTierForProvider('anthropic', 'fast'),
  ]),
  openai: uniqueModels([
    modelTierForProvider('openai', 'balanced'),
    modelTierForProvider('openai', 'reasoning'),
    modelTierForProvider('openai', 'fast'),
  ]),
  azure_openai: uniqueModels([
    modelTierForProvider('azure_openai', 'balanced'),
    modelTierForProvider('azure_openai', 'reasoning'),
    modelTierForProvider('azure_openai', 'fast'),
    DEFAULT_OPENAI_MODEL,
    'gpt-5.4',
    'gpt-5.4-mini',
  ]),
  xai: uniqueModels([
    modelTierForProvider('xai', 'balanced'),
    modelTierForProvider('xai', 'reasoning'),
    modelTierForProvider('xai', 'fast'),
    'grok-2',
  ]),
  openai_compat: uniqueModels([
    modelTierForProvider('openai_compat', 'balanced'),
    modelTierForProvider('openai_compat', 'reasoning'),
    modelTierForProvider('openai_compat', 'fast'),
    process.env.OLLAMA_MODEL,
    'qwen2.5-coder:14b',
    'llama3.1:8b',
    'gpt-oss:20b',
  ]),
});

const AUTONOMOUS_PROVIDER_OPTIONS = new Set([
  'gemini',
  'anthropic',
  'openai',
  'azure_openai',
  'xai',
  'openai_compat',
]);

function defaultModelForProvider(provider) {
  switch (normalizeLlmProvider(provider)) {
    case 'anthropic':
      return DEFAULT_ANTHROPIC_MODEL;
    case 'openai':
      return DEFAULT_OPENAI_MODEL;
    case 'azure_openai':
      return DEFAULT_AZURE_OPENAI_MODEL;
    case 'xai':
      return DEFAULT_XAI_MODEL;
    case 'openai_compat':
      return DEFAULT_OPENAI_COMPAT_MODEL;
    case 'gemini':
    default:
      return DEFAULT_GEMINI_MODEL;
  }
}

function detectProviderFromModel(rawModel) {
  const normalized = String(rawModel || '').trim().toLowerCase();
  if (!normalized) return null;
  if (normalized.startsWith('gemini')) return 'gemini';
  if (normalized.startsWith('claude')) return 'anthropic';
  if (normalized.startsWith('gpt-') || normalized === 'gpt5') return 'openai';
  if (normalized.startsWith('grok')) return 'xai';
  if (normalized.includes('3.1-pro') || normalized.includes('3.1-flash-lite')) return 'gemini';
  if (normalized.includes(':')) return 'openai_compat';
  return null;
}

function normalizeModelName(rawModel, providerHint = null) {
  const trimmed = String(rawModel || '').trim();
  if (!trimmed) return null;

  const normalized = trimmed.toLowerCase();
  const provider = normalizeLlmProvider(providerHint) || detectProviderFromModel(trimmed);

  if (
    normalized.includes('gemini-3.1-pro-preview') ||
    normalized === '3.1-pro' ||
    normalized === 'gemini-pro'
  ) {
    return GEMINI_PRO_MODEL;
  }

  if (
    normalized.includes('gemini-3.1-flash-lite-preview') ||
    normalized === '3.1-flash-lite' ||
    normalized === 'gemini-flash-lite'
  ) {
    return GEMINI_FLASH_LITE_MODEL;
  }

  if (normalized === 'opus' || normalized === 'claude-opus' || normalized === 'claude-opus-4-6') {
    return 'claude-opus-4-6';
  }

  if (
    normalized === 'sonnet' ||
    normalized === 'claude-sonnet' ||
    normalized === 'claude-sonnet-4-6'
  ) {
    return 'claude-sonnet-4-6';
  }

  if (
    normalized === 'haiku' ||
    normalized === 'claude-haiku' ||
    normalized === 'claude-haiku-4-5-20251213'
  ) {
    return 'claude-haiku-4-5-20251213';
  }

  if (normalized === 'grok' || normalized === 'grok-3') {
    return 'grok-3';
  }

  if (normalized === 'grok-mini' || normalized === 'grok-3-mini') {
    return 'grok-3-mini';
  }

  if (normalized === 'grok-2') {
    return 'grok-2';
  }

  if (normalized === 'gpt5') {
    return 'gpt-5';
  }

  if (
    normalized === 'azure-openai-deployment' ||
    normalized === 'azure deployment' ||
    normalized === 'azure-deployment' ||
    normalized === 'deployment'
  ) {
    return 'azure-openai-deployment';
  }

  switch (provider) {
    case 'gemini':
      return normalized.startsWith('gemini') ? trimmed : null;
    case 'anthropic':
      return normalized.startsWith('claude-') ? trimmed : trimmed;
    case 'openai':
      return normalized.startsWith('gpt-') ? trimmed : trimmed;
    case 'azure_openai':
      return trimmed;
    case 'xai':
      return normalized.startsWith('grok-') ? trimmed : trimmed;
    case 'openai_compat':
      return trimmed;
    default:
      return null;
  }
}

function listModelsForProvider(provider) {
  const normalizedProvider = normalizeLlmProvider(provider) || 'gemini';
  return [...(PROVIDER_MODEL_OPTIONS[normalizedProvider] || PROVIDER_MODEL_OPTIONS.gemini)];
}

function supportsAutonomousProvider(provider) {
  const normalized = normalizeLlmProvider(provider);
  return Boolean(normalized && AUTONOMOUS_PROVIDER_OPTIONS.has(normalized));
}

function resolveConfiguredLlm(input = {}) {
  const llmProvider =
    normalizeLlmProvider(input.llmProvider) ||
    detectProviderFromModel(input.model) ||
    getGlobalDefaultLlmProvider();
  const model = normalizeModelName(input.model, llmProvider) || defaultModelForProvider(llmProvider);
  return {
    llmProvider,
    model,
  };
}

function chooseGeminiModelForTask(agent, taskTitle) {
  const explicitModel = normalizeModelName(agent?.model, 'gemini');
  if (explicitModel) {
    return explicitModel;
  }

  const text = `${agent?.role || ''} ${taskTitle || ''}`.toLowerCase();
  const complexKeywords = [
    'arquitet',
    'architecture',
    'refactor',
    'migra',
    'incident',
    'debug',
    'performance',
    'security',
    'schema',
    'database',
    'pipeline',
    'infra',
    'billing',
    'oauth',
  ];

  if (
    agent?.role === 'architect' ||
    agent?.role === 'ceo' ||
    complexKeywords.some((keyword) => text.includes(keyword))
  ) {
    return modelTierForProvider('gemini', 'reasoning');
  }

  return DEFAULT_GEMINI_MODEL;
}

function resolveAgentPromptModel(agent, taskTitle) {
  const configured = resolveConfiguredLlm(agent);
  if (configured.llmProvider === 'gemini') {
    return {
      provider: 'gemini',
      model: chooseGeminiModelForTask(agent, taskTitle),
    };
  }

  return {
    provider: configured.llmProvider,
    model: configured.model,
  };
}

function resolveAgentAutonomousModel(agent, taskTitle) {
  const requested = resolveAgentPromptModel(agent, taskTitle);
  if (requested.provider === 'gemini') {
    return {
      provider: 'gemini',
      model: requested.model,
      requestedProvider: 'gemini',
      requestedModel: requested.model,
      fallbackReason: null,
    };
  }

  if (supportsAutonomousProvider(requested.provider)) {
    return {
      provider: requested.provider,
      model: requested.model,
      requestedProvider: requested.provider,
      requestedModel: requested.model,
      fallbackReason: null,
    };
  }

  return {
    provider: 'gemini',
    model: chooseGeminiModelForTask({ ...agent, model: null }, taskTitle),
    requestedProvider: requested.provider,
    requestedModel: requested.model,
    fallbackReason: 'Autonomous lanes ainda usam o runner Gemini.',
  };
}

function resolveAgentReasoningEffort(agent = {}) {
  const configured = resolveConfiguredLlm(agent);
  const explicit = normalizeReasoningEffort(agent.reasoningEffort, configured.llmProvider);
  if (explicit) return explicit;
  return defaultReasoningEffortForProvider(configured.llmProvider, agent.modelTier);
}

module.exports = {
  AUTONOMOUS_PROVIDER_OPTIONS,
  DEFAULT_ANTHROPIC_MODEL,
  DEFAULT_AZURE_OPENAI_MODEL,
  DEFAULT_GEMINI_MODEL,
  DEFAULT_OPENAI_COMPAT_MODEL,
  DEFAULT_OPENAI_MODEL,
  DEFAULT_XAI_MODEL,
  PROVIDER_MODEL_OPTIONS,
  chooseGeminiModelForTask,
  defaultReasoningEffortForProvider,
  defaultModelForProvider,
  detectProviderFromModel,
  getGlobalDefaultLlmProvider,
  listModelsForProvider,
  modelTierForProvider,
  normalizeLlmProvider,
  normalizeModelName,
  normalizeReasoningEffort,
  resolveAgentAutonomousModel,
  resolveAgentReasoningEffort,
  resolveAgentPromptModel,
  resolveConfiguredLlm,
  supportsAutonomousProvider,
  supportsReasoningEffort,
};
