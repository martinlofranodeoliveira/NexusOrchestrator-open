const {
  runGeminiPrompt,
} = require('./geminiCli');
const {
  defaultModelForProvider,
  normalizeLlmProvider,
  normalizeModelName,
  normalizeReasoningEffort,
  resolveConfiguredLlm,
} = require('./modelRegistry');

const DEFAULT_ANTHROPIC_VERSION = '2023-06-01';
const DEFAULT_ANTHROPIC_BASE_URL = 'https://api.anthropic.com';
const DEFAULT_OPENAI_BASE_URL = 'https://api.openai.com/v1';
const DEFAULT_OPENAI_COMPAT_BASE_URL = 'http://127.0.0.1:11434/v1';
const DEFAULT_AZURE_OPENAI_API_VERSION = '2025-04-01-preview';
const DEFAULT_XAI_BASE_URL = 'https://api.x.ai/v1';

function readEnvValue(key, extraEnv = {}) {
  const candidate = extraEnv && Object.prototype.hasOwnProperty.call(extraEnv, key)
    ? extraEnv[key]
    : process.env[key];
  return String(candidate || '').trim();
}

function readBooleanEnv(key, extraEnv = {}, fallback = false) {
  const raw = readEnvValue(key, extraEnv);
  if (!raw) return Boolean(fallback);
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function buildPromptText(prompt, systemPrompt) {
  const userPrompt = String(prompt || '').trim();
  const systemText = String(systemPrompt || '').trim();
  if (!systemText) return userPrompt;
  if (!userPrompt) return `System Prompt: ${systemText}`;
  return `System Prompt: ${systemText}\n\n${userPrompt}`;
}

function resolveReasoningEffortOption(options = {}, providerHint = null) {
  return normalizeReasoningEffort(options.reasoningEffort, providerHint);
}

function shouldSendReasoningEffort(provider, env = {}) {
  const normalizedProvider = normalizeLlmProvider(provider);
  if (normalizedProvider === 'openai') return true;
  if (normalizedProvider === 'azure_openai') return true;
  if (normalizedProvider !== 'openai_compat') return false;
  return (
    readBooleanEnv('NEXUS_OPENAI_COMPAT_ENABLE_REASONING_EFFORT', env) ||
    Boolean(readEnvValue('NEXUS_OPENAI_COMPAT_DEFAULT_REASONING_EFFORT', env))
  );
}

function anthropicMessagesEndpoint(baseUrl) {
  const trimmed = String(baseUrl || DEFAULT_ANTHROPIC_BASE_URL)
    .trim()
    .replace(/\/+$/, '');
  if (trimmed.endsWith('/v1/messages')) {
    return trimmed;
  }
  return `${trimmed}/v1/messages`;
}

function chatCompletionsEndpoint(baseUrl) {
  const trimmed = String(baseUrl || DEFAULT_OPENAI_BASE_URL)
    .trim()
    .replace(/\/+$/, '');
  if (trimmed.endsWith('/chat/completions')) {
    return trimmed;
  }
  return `${trimmed}/chat/completions`;
}

function isLikelyLocalBaseUrl(baseUrl) {
  const raw = String(baseUrl || '').trim();
  if (!raw) return false;

  try {
    const parsed = new URL(raw);
    const hostname = String(parsed.hostname || '').trim().toLowerCase();
    return ['127.0.0.1', 'localhost', '0.0.0.0', '::1'].includes(hostname);
  } catch (_error) {
    return /(127\.0\.0\.1|localhost|0\.0\.0\.0|\[::1\])/i.test(raw);
  }
}

function normalizeOpenAiCompatBaseUrl(baseUrl) {
  const trimmed = String(baseUrl || DEFAULT_OPENAI_COMPAT_BASE_URL)
    .trim()
    .replace(/\/+$/, '');

  if (/\/chat\/completions$/i.test(trimmed) || /\/v1$/i.test(trimmed)) {
    return trimmed;
  }

  if (isLikelyLocalBaseUrl(trimmed)) {
    return `${trimmed}/v1`;
  }

  return trimmed;
}

function resolveOpenAiCompatibleRuntimeConfig(provider, env = {}) {
  const normalizedProvider = normalizeLlmProvider(provider) || 'openai';

  if (normalizedProvider === 'xai') {
    return {
      provider: 'xai',
      label: 'xAI',
      apiKey: readEnvValue('XAI_API_KEY', env),
      endpoint: chatCompletionsEndpoint(readEnvValue('XAI_BASE_URL', env) || DEFAULT_XAI_BASE_URL),
      requiresApiKey: true,
    };
  }

  if (normalizedProvider === 'openai_compat') {
    const baseUrl =
      readEnvValue('OPENAI_COMPAT_BASE_URL', env) ||
      readEnvValue('OLLAMA_BASE_URL', env) ||
      DEFAULT_OPENAI_COMPAT_BASE_URL;
    return {
      provider: 'openai_compat',
      label: 'OpenAI-compatible',
      apiKey:
        readEnvValue('OPENAI_COMPAT_API_KEY', env) ||
        readEnvValue('OLLAMA_API_KEY', env) ||
        readEnvValue('OPENAI_API_KEY', env),
      endpoint: chatCompletionsEndpoint(normalizeOpenAiCompatBaseUrl(baseUrl)),
      requiresApiKey:
        readEnvValue('NEXUS_OPENAI_COMPAT_REQUIRE_API_KEY', env).toLowerCase() === 'true' ||
        !isLikelyLocalBaseUrl(baseUrl),
    };
  }

  return {
    provider: 'openai',
    label: 'OpenAI',
    apiKey: readEnvValue('OPENAI_API_KEY', env),
    endpoint: chatCompletionsEndpoint(readEnvValue('OPENAI_BASE_URL', env) || DEFAULT_OPENAI_BASE_URL),
    requiresApiKey: true,
  };
}

function azureChatCompletionsEndpoint(baseUrl, deployment, apiVersion) {
  const endpoint = String(baseUrl || '').trim();
  const deploymentName = String(deployment || '').trim();
  const version = String(apiVersion || DEFAULT_AZURE_OPENAI_API_VERSION).trim()
    || DEFAULT_AZURE_OPENAI_API_VERSION;

  if (!endpoint) {
    throw new Error('Azure OpenAI requer AZURE_OPENAI_ENDPOINT.');
  }
  if (!deploymentName) {
    throw new Error('Azure OpenAI requer AZURE_OPENAI_DEPLOYMENT.');
  }

  const [rawBase, rawQuery = ''] = endpoint.split('?');
  const trimmedBase = String(rawBase || '').trim().replace(/\/+$/, '');
  const hasApiVersion = /(?:^|&)api-version=/.test(rawQuery);
  const querySuffix = rawQuery ? `?${rawQuery}` : '';

  if (/\/openai\/deployments\/[^/]+\/chat\/completions$/i.test(trimmedBase)) {
    if (hasApiVersion) return endpoint;
    const separator = rawQuery ? '&' : '?';
    return `${trimmedBase}${querySuffix}${separator}api-version=${encodeURIComponent(version)}`;
  }

  if (/\/chat\/completions$/i.test(trimmedBase)) {
    if (hasApiVersion) return endpoint;
    const separator = rawQuery ? '&' : '?';
    return `${trimmedBase}${querySuffix}${separator}api-version=${encodeURIComponent(version)}`;
  }

  let normalizedBase = trimmedBase.replace(/\/openai\/v1$/i, '/openai');
  if (!/\/openai$/i.test(normalizedBase)) {
    normalizedBase = `${normalizedBase}/openai`;
  }

  return `${normalizedBase}/deployments/${encodeURIComponent(deploymentName)}/chat/completions?api-version=${encodeURIComponent(version)}`;
}

function isAzureDeploymentPlaceholder(model) {
  const normalized = String(model || '').trim().toLowerCase();
  return (
    !normalized ||
    normalized === 'azure-openai-deployment' ||
    normalized === 'azure deployment' ||
    normalized === 'azure-deployment' ||
    normalized === 'deployment'
  );
}

function resolveAzureDeployment(model, env = {}) {
  const explicitModel = normalizeModelName(model, 'azure_openai');
  if (explicitModel && !isAzureDeploymentPlaceholder(explicitModel)) {
    return explicitModel;
  }

  const deploymentFromEnv = readEnvValue('AZURE_OPENAI_DEPLOYMENT', env);
  if (deploymentFromEnv) {
    return deploymentFromEnv;
  }

  throw new Error('Azure OpenAI requer AZURE_OPENAI_DEPLOYMENT ou um model/deployment explicito.');
}

function extractAnthropicText(payload) {
  if (!payload) return '';
  if (typeof payload.content === 'string') {
    return payload.content.trim();
  }

  if (Array.isArray(payload.content)) {
    return payload.content
      .map((block) => {
        if (typeof block === 'string') return block.trim();
        if (block && block.type === 'text' && typeof block.text === 'string') {
          return block.text.trim();
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

function extractOpenAiText(payload) {
  const message = payload?.choices?.[0]?.message || {};
  const content = message.content;
  if (typeof content === 'string') {
    return content.trim();
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part.trim();
        if (part && typeof part.text === 'string') return part.text.trim();
        if (part && typeof part.content === 'string') return part.content.trim();
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  if (typeof payload?.choices?.[0]?.text === 'string') {
    return payload.choices[0].text.trim();
  }

  if (typeof message.final === 'string') {
    return message.final.trim();
  }

  return '';
}

function applyOpenAiCompatThinkingOptions(body, provider, env = {}) {
  if (provider !== 'openai_compat') return body;
  if (!readBooleanEnv('NEXUS_OPENAI_COMPAT_ENABLE_THINKING', env)) {
    return {
      ...body,
      reasoning_effort: 'none',
      chat_template_kwargs: {
        ...(body.chat_template_kwargs && typeof body.chat_template_kwargs === 'object'
          ? body.chat_template_kwargs
          : {}),
        enable_thinking: false,
      },
    };
  }

  return {
    ...body,
    thinking: { type: 'enabled' },
    chat_template_kwargs: {
      ...(body.chat_template_kwargs && typeof body.chat_template_kwargs === 'object'
        ? body.chat_template_kwargs
        : {}),
      enable_thinking: true,
    },
  };
}

async function requestJson(url, options) {
  if (typeof fetch !== 'function') {
    throw new Error('Global fetch indisponivel neste runtime.');
  }

  const response = await fetch(url, options);
  const rawBody = await response.text();
  if (!response.ok) {
    const error = new Error(rawBody || `HTTP ${response.status}`);
    error.statusCode = response.status;
    error.stderr = rawBody;
    throw error;
  }

  let parsed = {};
  try {
    parsed = rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    const parseError = new Error(`Resposta JSON invalida recebida de ${url}`);
    parseError.cause = error;
    parseError.stderr = rawBody;
    throw parseError;
  }

  return {
    parsed,
    rawBody,
  };
}

async function runAnthropicPrompt(prompt, options = {}) {
  const env = options.env || {};
  const apiKey = readEnvValue('ANTHROPIC_API_KEY', env);
  const authToken = readEnvValue('ANTHROPIC_AUTH_TOKEN', env);
  if (!apiKey && !authToken) {
    throw new Error('Anthropic requer ANTHROPIC_API_KEY ou ANTHROPIC_AUTH_TOKEN.');
  }

  const endpoint = anthropicMessagesEndpoint(
    readEnvValue('ANTHROPIC_BASE_URL', env) || DEFAULT_ANTHROPIC_BASE_URL,
  );
  const headers = {
    'content-type': 'application/json',
    'anthropic-version': readEnvValue('ANTHROPIC_VERSION', env) || DEFAULT_ANTHROPIC_VERSION,
    'user-agent': 'nexus-orchestrator/1.0',
  };
  if (apiKey) {
    headers['x-api-key'] = apiKey;
  }
  if (authToken) {
    headers.authorization = `Bearer ${authToken}`;
  }

  const body = {
    model: options.model || defaultModelForProvider('anthropic'),
    max_tokens: Number(options.maxTokens) > 0 ? Number(options.maxTokens) : 2048,
    messages: [
      {
        role: 'user',
        content: String(prompt || ''),
      },
    ],
  };

  if (String(options.systemPrompt || '').trim()) {
    body.system = String(options.systemPrompt).trim();
  }

  const { parsed, rawBody } = await requestJson(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  return {
    provider: 'anthropic',
    model: body.model,
    stdout: extractAnthropicText(parsed),
    rawStdout: rawBody,
    stderr: '',
  };
}

async function runOpenAiCompatPrompt(prompt, options = {}) {
  const provider = normalizeLlmProvider(options.llmProvider) || 'openai';
  const env = options.env || {};
  const runtimeConfig = resolveOpenAiCompatibleRuntimeConfig(provider, env);
  const reasoningEffort = resolveReasoningEffortOption(options, provider);

  if (runtimeConfig.requiresApiKey && !runtimeConfig.apiKey) {
    throw new Error(
      provider === 'xai'
        ? 'xAI requer XAI_API_KEY.'
        : provider === 'openai_compat'
          ? 'OpenAI-compatible requer OPENAI_COMPAT_API_KEY ou OLLAMA_API_KEY quando o endpoint nao for local.'
          : 'OpenAI requer OPENAI_API_KEY.',
    );
  }

  const body = {
    model: options.model || defaultModelForProvider(provider),
    messages: [],
  };

  if (String(options.systemPrompt || '').trim()) {
    body.messages.push({
      role: 'system',
      content: String(options.systemPrompt).trim(),
    });
  }

  body.messages.push({
    role: 'user',
    content: String(prompt || ''),
  });

  if (shouldSendReasoningEffort(provider, env) && reasoningEffort) {
    body.reasoning_effort = reasoningEffort;
  }

  Object.assign(body, applyOpenAiCompatThinkingOptions(body, provider, env));

  const headers = {
    'content-type': 'application/json',
  };
  if (runtimeConfig.apiKey) {
    headers.authorization = `Bearer ${runtimeConfig.apiKey}`;
  }

  const { parsed, rawBody } = await requestJson(runtimeConfig.endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });

  return {
    provider: runtimeConfig.provider,
    model: body.model,
    stdout: extractOpenAiText(parsed),
    rawStdout: rawBody,
    stderr: '',
  };
}

async function runAzureOpenAiPrompt(prompt, options = {}) {
  const env = options.env || {};
  const endpoint = readEnvValue('AZURE_OPENAI_ENDPOINT', env);
  const apiKey = readEnvValue('AZURE_OPENAI_API_KEY', env);
  const reasoningEffort = resolveReasoningEffortOption(options, 'azure_openai');
  const deployment = resolveAzureDeployment(
    options.model || defaultModelForProvider('azure_openai'),
    env,
  );
  const apiVersion = readEnvValue('AZURE_OPENAI_API_VERSION', env) || DEFAULT_AZURE_OPENAI_API_VERSION;

  if (!apiKey) {
    throw new Error('Azure OpenAI requer AZURE_OPENAI_API_KEY.');
  }

  const resolvedEndpoint = azureChatCompletionsEndpoint(endpoint, deployment, apiVersion);
  const body = {
    messages: [],
  };

  if (String(options.systemPrompt || '').trim()) {
    body.messages.push({
      role: 'system',
      content: String(options.systemPrompt).trim(),
    });
  }

  body.messages.push({
    role: 'user',
    content: String(prompt || ''),
  });

  if (reasoningEffort) {
    body.reasoning_effort = reasoningEffort;
  }

  const { parsed, rawBody } = await requestJson(resolvedEndpoint, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': apiKey,
      'user-agent': 'nexus-orchestrator/1.0',
    },
    body: JSON.stringify(body),
  });

  return {
    provider: 'azure_openai',
    model: deployment,
    stdout: extractOpenAiText(parsed),
    rawStdout: rawBody,
    stderr: '',
  };
}

async function runPrompt(prompt, options = {}) {
  const configured = resolveConfiguredLlm(options);
  const promptText = buildPromptText(prompt, configured.llmProvider === 'gemini' ? options.systemPrompt : null);
  const runOptions = {
    ...options,
    llmProvider: configured.llmProvider,
    model: normalizeModelName(options.model, configured.llmProvider) || configured.model,
  };

  if (configured.llmProvider === 'gemini') {
    const result = await runGeminiPrompt(promptText, runOptions);
    return {
      provider: 'gemini',
      model: runOptions.model,
      ...result,
    };
  }

  if (configured.llmProvider === 'anthropic') {
    return runAnthropicPrompt(String(prompt || ''), runOptions);
  }

  if (configured.llmProvider === 'azure_openai') {
    return runAzureOpenAiPrompt(String(prompt || ''), runOptions);
  }

  return runOpenAiCompatPrompt(String(prompt || ''), runOptions);
}

module.exports = {
  DEFAULT_ANTHROPIC_VERSION,
  DEFAULT_AZURE_OPENAI_API_VERSION,
  DEFAULT_OPENAI_COMPAT_BASE_URL,
  anthropicMessagesEndpoint,
  azureChatCompletionsEndpoint,
  buildPromptText,
  chatCompletionsEndpoint,
  extractAnthropicText,
  extractOpenAiText,
  isLikelyLocalBaseUrl,
  resolveOpenAiCompatibleRuntimeConfig,
  runPrompt,
};
