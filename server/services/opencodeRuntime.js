const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const {
  defaultModelForProvider,
  getGlobalDefaultLlmProvider,
  normalizeLlmProvider,
  normalizeModelName,
} = require('./modelRegistry');

const STATUS_CACHE_TTL_MS = 15_000;
const OPENCODE_REMOVED_MESSAGE = 'OpenCode foi removido do fluxo do Nexus.';
const statusCache = {
  key: null,
  at: 0,
  value: null,
};

function normalizeNonEmpty(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function normalizeReviewFormat(value) {
  return String(value || '').trim().toLowerCase() === 'default' ? 'default' : 'json';
}

function deriveAzureResourceName(endpoint) {
  const normalized = normalizeNonEmpty(endpoint);
  if (!normalized) return null;

  try {
    const parsed = new URL(normalized);
    const hostname = String(parsed.hostname || '').trim().toLowerCase();
    const suffix = '.openai.azure.com';
    if (hostname.endsWith(suffix)) {
      return hostname.slice(0, -suffix.length) || null;
    }
  } catch (_error) {
    return null;
  }

  return null;
}

function buildProviderScopedModel(provider, model) {
  const normalizedProvider = normalizeLlmProvider(provider);
  const normalizedModel = normalizeModelName(model, normalizedProvider);
  if (!normalizedProvider || !normalizedModel) return null;

  switch (normalizedProvider) {
    case 'azure_openai':
      return `azure/${normalizedModel}`;
    case 'openai':
      return `openai/${normalizedModel}`;
    case 'anthropic':
      return `anthropic/${normalizedModel}`;
    case 'xai':
      return `xai/${normalizedModel}`;
    case 'gemini':
      return `google/${normalizedModel}`;
    default:
      return null;
  }
}

function getDefaultProviderFromEnv(env = process.env) {
  return normalizeLlmProvider(env.NEXUS_DEFAULT_LLM_PROVIDER) || getGlobalDefaultLlmProvider();
}

function getProviderDefaultModelFromEnv(provider, env = process.env) {
  switch (normalizeLlmProvider(provider)) {
    case 'azure_openai':
      return normalizeNonEmpty(
        env.NEXUS_AZURE_OPENAI_DEFAULT_MODEL
          || env.AZURE_OPENAI_DEPLOYMENT
          || env.NEXUS_OPENAI_DEFAULT_MODEL
          || 'azure-openai-deployment',
      );
    case 'openai':
      return normalizeNonEmpty(env.NEXUS_OPENAI_DEFAULT_MODEL) || defaultModelForProvider('openai');
    case 'anthropic':
      return (
        normalizeNonEmpty(env.NEXUS_ANTHROPIC_DEFAULT_MODEL) || defaultModelForProvider('anthropic')
      );
    case 'xai':
      return normalizeNonEmpty(env.NEXUS_XAI_DEFAULT_MODEL) || defaultModelForProvider('xai');
    case 'gemini':
      return normalizeNonEmpty(env.NEXUS_GEMINI_DEFAULT_MODEL) || defaultModelForProvider('gemini');
    case 'openai_compat':
    default:
      return null;
  }
}

function deriveDefaultOpencodeModel(env = process.env) {
  const provider = getDefaultProviderFromEnv(env);
  if (provider === 'openai_compat') {
    return null;
  }
  return buildProviderScopedModel(provider, getProviderDefaultModelFromEnv(provider, env));
}

function resolveOpencodeExecutionEnv(env = process.env) {
  const resolved = { ...env };

  if (!normalizeNonEmpty(resolved.GOOGLE_GENERATIVE_AI_API_KEY) && normalizeNonEmpty(resolved.GEMINI_API_KEY)) {
    resolved.GOOGLE_GENERATIVE_AI_API_KEY = normalizeNonEmpty(resolved.GEMINI_API_KEY);
  }

  if (!normalizeNonEmpty(resolved.AZURE_API_KEY) && normalizeNonEmpty(resolved.AZURE_OPENAI_API_KEY)) {
    resolved.AZURE_API_KEY = normalizeNonEmpty(resolved.AZURE_OPENAI_API_KEY);
  }

  if (!normalizeNonEmpty(resolved.AZURE_RESOURCE_NAME) && normalizeNonEmpty(resolved.AZURE_OPENAI_ENDPOINT)) {
    const resourceName = deriveAzureResourceName(resolved.AZURE_OPENAI_ENDPOINT);
    if (resourceName) {
      resolved.AZURE_RESOURCE_NAME = resourceName;
    }
  }

  if (!normalizeNonEmpty(resolved.AZURE_API_VERSION) && normalizeNonEmpty(resolved.AZURE_OPENAI_API_VERSION)) {
    resolved.AZURE_API_VERSION = normalizeNonEmpty(resolved.AZURE_OPENAI_API_VERSION);
  }

  if (
    !normalizeNonEmpty(resolved.OPENCODE_DEFAULT_MODEL)
    && !normalizeNonEmpty(resolved.NEXUS_OPENCODE_DEFAULT_MODEL)
  ) {
    const derivedModel = deriveDefaultOpencodeModel(resolved);
    if (derivedModel) {
      resolved.OPENCODE_DEFAULT_MODEL = derivedModel;
    }
  }

  return resolved;
}

function isEnvSatisfied(expression, env) {
  if (expression.includes('|')) {
    return expression
      .split('|')
      .map((entry) => entry.trim())
      .some((entry) => normalizeNonEmpty(env[entry]));
  }
  return Boolean(normalizeNonEmpty(env[expression]));
}

function checkBinary(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 15_000,
  });

  return {
    ok: result.status === 0,
    detail: String(result.stdout || result.stderr || '').trim() || null,
  };
}

function resolveOpencodeRuntimeConfig(env = process.env) {
  return {
    enabled: false,
    command: normalizeNonEmpty(env.NEXUS_OPENCODE_COMMAND) || 'opencode',
    defaultModel: null,
    defaultAgent: null,
    defaultVariant: null,
    reviewFormat: 'json',
    pure: true,
    skipPermissions: false,
    printLogs: false,
    removed: true,
    disabledReason: OPENCODE_REMOVED_MESSAGE,
  };
}

function parseProviderModel(value) {
  const normalized = normalizeNonEmpty(value);
  if (!normalized || !normalized.includes('/')) return null;
  const [providerId, ...rest] = normalized.split('/');
  const modelId = rest.join('/').trim();
  if (!providerId || !modelId) return null;
  return {
    providerId: providerId.trim().toLowerCase(),
    modelId,
  };
}

function buildEnvHint(expression, scope, optional, env) {
  return {
    expression,
    scope,
    optional,
    ok: isEnvSatisfied(expression, env),
  };
}

function resolveProviderEnvHints(providerId, env = process.env) {
  switch (String(providerId || '').trim().toLowerCase()) {
    case 'google':
      return [
        buildEnvHint('GOOGLE_GENERATIVE_AI_API_KEY|GEMINI_API_KEY', 'auth', false, env),
      ];
    case 'google-vertex':
      return [
        buildEnvHint('GOOGLE_CLOUD_PROJECT|GCP_PROJECT|GCLOUD_PROJECT', 'metadata', false, env),
        buildEnvHint('GOOGLE_APPLICATION_CREDENTIALS', 'auth', true, env),
        buildEnvHint('GOOGLE_VERTEX_LOCATION|GOOGLE_CLOUD_LOCATION|VERTEX_LOCATION', 'metadata', true, env),
      ];
    case 'azure':
      return [
        buildEnvHint('AZURE_RESOURCE_NAME|AZURE_OPENAI_ENDPOINT', 'metadata', false, env),
        buildEnvHint('AZURE_API_KEY|AZURE_OPENAI_API_KEY', 'auth', false, env),
        buildEnvHint('AZURE_API_VERSION|AZURE_OPENAI_API_VERSION', 'metadata', true, env),
      ];
    case 'openai':
      return [
        buildEnvHint('OPENAI_API_KEY', 'auth', false, env),
      ];
    case 'anthropic':
      return [
        buildEnvHint('ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN', 'auth', false, env),
      ];
    case 'xai':
      return [
        buildEnvHint('XAI_API_KEY', 'auth', false, env),
      ];
    default:
      return [];
  }
}

function resolveOpencodePaths(options = {}) {
  const env = options.env || process.env;
  const homeDir = path.resolve(
    String(options.homeDir || env.HOME || env.USERPROFILE || os.homedir()),
  );
  const configHome = normalizeNonEmpty(env.XDG_CONFIG_HOME) || path.join(homeDir, '.config');
  const dataHome = normalizeNonEmpty(env.XDG_DATA_HOME) || path.join(homeDir, '.local', 'share');
  const projectDir = normalizeNonEmpty(options.projectDir)
    ? path.resolve(String(options.projectDir))
    : null;

  const globalConfigCandidates = [
    path.join(configHome, 'opencode', 'opencode.jsonc'),
    path.join(configHome, 'opencode', 'opencode.json'),
    path.join(dataHome, 'opencode', 'opencode.jsonc'),
    path.join(dataHome, 'opencode', 'opencode.json'),
  ];
  const projectConfigCandidates = projectDir
    ? [
        path.join(projectDir, 'opencode.jsonc'),
        path.join(projectDir, 'opencode.json'),
      ]
    : [];

  return {
    homeDir,
    authFile: path.join(dataHome, 'opencode', 'auth.json'),
    globalConfigFile: globalConfigCandidates.find((candidate) => fs.existsSync(candidate)) || null,
    projectConfigFile: projectConfigCandidates.find((candidate) => fs.existsSync(candidate)) || null,
  };
}

function readCredentialCount(authFile) {
  if (!authFile || !fs.existsSync(authFile)) return 0;

  try {
    const payload = JSON.parse(fs.readFileSync(authFile, 'utf8'));
    if (Array.isArray(payload)) return payload.length;
    if (!payload || typeof payload !== 'object') return 0;
    if (Array.isArray(payload.credentials)) return payload.credentials.length;
    if (payload.credentials && typeof payload.credentials === 'object') {
      return Object.keys(payload.credentials).length;
    }
    if (payload.providers && typeof payload.providers === 'object') {
      return Object.keys(payload.providers).length;
    }
    return Object.keys(payload).filter((key) => key !== 'version').length;
  } catch (_error) {
    return null;
  }
}

function buildStatusCacheKey(config, projectDir, homeDir) {
  return JSON.stringify({
    command: config.command,
    enabled: config.enabled,
    defaultModel: config.defaultModel,
    defaultAgent: config.defaultAgent,
    defaultVariant: config.defaultVariant,
    reviewFormat: config.reviewFormat,
    pure: config.pure,
    skipPermissions: config.skipPermissions,
    printLogs: config.printLogs,
    projectDir,
    homeDir,
  });
}

function getOpencodeRuntimeStatus(options = {}) {
  const env = resolveOpencodeExecutionEnv(options.env || process.env);
  const projectDir = path.resolve(String(options.projectDir || process.cwd()));
  const config = resolveOpencodeRuntimeConfig(env);
  const paths = resolveOpencodePaths({
    env,
    homeDir: options.homeDir,
    projectDir,
  });
  const cacheKey = buildStatusCacheKey(config, projectDir, paths.homeDir);
  const shouldUseCache =
    options.useCache !== false && typeof options.binaryChecker !== 'function';

  if (!config.enabled) {
    const status = {
      enabled: false,
      command: config.command,
      available: false,
      version: null,
      error: OPENCODE_REMOVED_MESSAGE,
      defaultModel: null,
      defaultAgent: null,
      defaultVariant: null,
      reviewFormat: config.reviewFormat,
      pure: config.pure,
      skipPermissions: config.skipPermissions,
      printLogs: config.printLogs,
      modelProviderId: null,
      modelId: null,
      authFile: paths.authFile,
      authFileExists: false,
      credentialCount: 0,
      globalConfigFile: null,
      projectConfigFile: null,
      authConfigured: false,
      ready: false,
      providerEnvHints: [],
      removed: true,
      disabledReason: OPENCODE_REMOVED_MESSAGE,
    };

    if (shouldUseCache) {
      statusCache.key = cacheKey;
      statusCache.at = Date.now();
      statusCache.value = status;
    }

    return status;
  }

  if (
    shouldUseCache &&
    statusCache.key === cacheKey &&
    statusCache.value &&
    Date.now() - statusCache.at < STATUS_CACHE_TTL_MS
  ) {
    return statusCache.value;
  }

  const binary = (typeof options.binaryChecker === 'function' ? options.binaryChecker : checkBinary)(
    config.command,
    ['--version'],
  );
  const credentialCount = readCredentialCount(paths.authFile);
  const parsedModel = parseProviderModel(config.defaultModel);
  const providerEnvHints = resolveProviderEnvHints(parsedModel?.providerId, env);
  const requiredMetadataHints = providerEnvHints.filter(
    (hint) => hint.scope === 'metadata' && !hint.optional,
  );
  const requiredAuthHints = providerEnvHints.filter(
    (hint) => hint.scope === 'auth' && !hint.optional,
  );
  const metadataReady = requiredMetadataHints.every((hint) => hint.ok);
  const authReady = requiredAuthHints.length === 0
    ? true
    : (typeof credentialCount === 'number' && credentialCount > 0)
      || requiredAuthHints.every((hint) => hint.ok);
  const authConfigured =
    (typeof credentialCount === 'number' && credentialCount > 0)
    || providerEnvHints.some((hint) => hint.scope === 'auth' && hint.ok);
  const ready = binary.ok && (!config.enabled || (!parsedModel || (metadataReady && authReady)));

  const status = {
    enabled: config.enabled,
    command: config.command,
    available: binary.ok,
    version: binary.ok ? binary.detail : null,
    error: binary.ok ? null : binary.detail,
    defaultModel: config.defaultModel,
    defaultAgent: config.defaultAgent,
    defaultVariant: config.defaultVariant,
    reviewFormat: config.reviewFormat,
    pure: config.pure,
    skipPermissions: config.skipPermissions,
    printLogs: config.printLogs,
    modelProviderId: parsedModel?.providerId || null,
    modelId: parsedModel?.modelId || null,
    authFile: paths.authFile,
    authFileExists: fs.existsSync(paths.authFile),
    credentialCount,
    globalConfigFile: paths.globalConfigFile,
    projectConfigFile: paths.projectConfigFile,
    authConfigured,
    ready,
    providerEnvHints,
  };

  if (shouldUseCache) {
    statusCache.key = cacheKey;
    statusCache.at = Date.now();
    statusCache.value = status;
  }

  return status;
}

function buildOpencodeReviewCommand(options = {}) {
  const env = resolveOpencodeExecutionEnv(options.env || process.env);
  const config = resolveOpencodeRuntimeConfig(env);
  const cwd = path.resolve(String(options.workspaceDir || options.projectDir || process.cwd()));
  const prompt =
    normalizeNonEmpty(options.prompt)
    || normalizeNonEmpty(options.message)
    || null;
  const model = normalizeNonEmpty(options.model) || config.defaultModel;
  const agent = normalizeNonEmpty(options.agent) || config.defaultAgent;
  const variant = normalizeNonEmpty(options.variant) || config.defaultVariant;
  const format = normalizeReviewFormat(options.format || config.reviewFormat);
  const pure = typeof options.pure === 'boolean'
    ? Boolean(options.pure)
    : config.pure;
  const skipPermissions = typeof options.skipPermissions === 'boolean'
    ? Boolean(options.skipPermissions)
    : config.skipPermissions;
  const printLogs = typeof options.printLogs === 'boolean'
    ? Boolean(options.printLogs)
    : config.printLogs;
  const title = normalizeNonEmpty(options.title);
  const files = Array.isArray(options.files)
    ? options.files
        .map((entry) => normalizeNonEmpty(entry))
        .filter(Boolean)
        .map((entry) => path.resolve(cwd, entry))
    : [];

  const args = ['run'];
  if (model) args.push('--model', model);
  if (agent) args.push('--agent', agent);
  args.push('--format', format);
  if (variant) args.push('--variant', variant);
  if (title) args.push('--title', title);
  args.push('--dir', cwd);
  if (pure) args.push('--pure');
  if (skipPermissions) args.push('--dangerously-skip-permissions');
  if (printLogs) args.push('--print-logs');
  files.forEach((file) => {
    args.push('--file', file);
  });
  if (prompt) args.push(prompt);

  return {
    command: config.command,
    args,
    cwd,
    prompt,
    model,
    agent,
    variant,
    format,
    pure,
    skipPermissions,
    printLogs,
    title,
    files,
  };
}

function spawnOpencodeReview(options = {}) {
  const spec = buildOpencodeReviewCommand(options);
  return spawn(spec.command, spec.args, {
    cwd: spec.cwd,
    env: resolveOpencodeExecutionEnv(options.env || process.env),
    stdio: options.stdio || 'inherit',
  });
}

module.exports = {
  buildOpencodeReviewCommand,
  buildProviderScopedModel,
  deriveAzureResourceName,
  deriveDefaultOpencodeModel,
  getOpencodeRuntimeStatus,
  parseProviderModel,
  readCredentialCount,
  resolveOpencodePaths,
  resolveOpencodeExecutionEnv,
  resolveOpencodeRuntimeConfig,
  resolveProviderEnvHints,
  spawnOpencodeReview,
};
