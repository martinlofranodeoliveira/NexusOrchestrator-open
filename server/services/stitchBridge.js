const { spawnSync } = require('child_process');

const {
  callRemoteMcpTool,
  listRemoteMcpTools,
} = require('./remoteMcpClient');

const DEFAULT_STITCH_MCP_URL = 'https://stitch.googleapis.com/mcp';
const DEFAULT_STITCH_GCLOUD_COMMAND = 'gcloud';
const DEFAULT_STITCH_REQUEST_TIMEOUT_MS = 45000;

function trimString(value) {
  return String(value || '').trim();
}

function clampInteger(value, minimum, maximum, fallback) {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }
  return Math.min(maximum, Math.max(minimum, parsed));
}

function normalizeStitchMcpUrl(rawValue = process.env.NEXUS_STITCH_MCP_URL) {
  const url = trimString(rawValue) || DEFAULT_STITCH_MCP_URL;
  return url.replace(/\/+$/, '');
}

function normalizeStitchGcloudCommand(rawValue = process.env.NEXUS_STITCH_GCLOUD_COMMAND) {
  return trimString(rawValue) || DEFAULT_STITCH_GCLOUD_COMMAND;
}

function resolveStitchProjectId(env = process.env) {
  return (
    trimString(env.STITCH_GOOGLE_CLOUD_PROJECT)
    || trimString(env.NEXUS_STITCH_GOOGLE_CLOUD_PROJECT)
    || trimString(env.GOOGLE_CLOUD_PROJECT)
    || trimString(env.GCLOUD_PROJECT_ID)
    || null
  );
}

function detectStitchApiKeySource(env = process.env) {
  if (trimString(env.STITCH_API_KEY)) {
    return 'STITCH_API_KEY';
  }
  if (trimString(env.NEXUS_STITCH_API_KEY)) {
    return 'NEXUS_STITCH_API_KEY';
  }
  return null;
}

function detectStitchAccessTokenSource(env = process.env) {
  if (trimString(env.STITCH_ACCESS_TOKEN)) {
    return 'STITCH_ACCESS_TOKEN';
  }
  if (trimString(env.NEXUS_STITCH_ACCESS_TOKEN)) {
    return 'NEXUS_STITCH_ACCESS_TOKEN';
  }
  return null;
}

function readStitchApiKey(env = process.env) {
  const source = detectStitchApiKeySource(env);
  return source ? trimString(env[source]) : null;
}

function readStitchAccessToken(env = process.env) {
  const source = detectStitchAccessTokenSource(env);
  return source ? trimString(env[source]) : null;
}

function checkBinary(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 15000,
  });

  return {
    ok: result.status === 0,
    detail: String(result.stdout || result.stderr || '').trim() || null,
  };
}

function printGcloudAdcAccessToken(options = {}) {
  const env = options.env || process.env;
  const command = normalizeStitchGcloudCommand(options.gcloudCommand || env.NEXUS_STITCH_GCLOUD_COMMAND);
  const timeoutMs = clampInteger(options.timeoutMs, 1000, 60000, 15000);
  const result = spawnSync(command, ['auth', 'application-default', 'print-access-token'], {
    encoding: 'utf8',
    timeout: timeoutMs,
    env: {
      ...env,
      CLOUDSDK_CORE_DISABLE_PROMPTS: '1',
    },
  });

  const token = trimString(result.stdout);
  return {
    ok: result.status === 0 && Boolean(token),
    token: token || null,
    detail: trimString(result.stderr || result.stdout) || null,
  };
}

function resolveStitchAuthMode(env = process.env) {
  if (detectStitchApiKeySource(env)) {
    return 'api_key';
  }
  if (detectStitchAccessTokenSource(env) && resolveStitchProjectId(env)) {
    return 'access_token';
  }
  if (resolveStitchProjectId(env)) {
    return 'adc';
  }
  return 'none';
}

function isReadOnlyStitchToolName(toolName) {
  const normalizedName = trimString(toolName).toLowerCase();
  return /^list_/.test(normalizedName) || /^get_/.test(normalizedName);
}

function normalizeStitchToolArgs(input = {}) {
  if (input && typeof input.toolArgs === 'object' && !Array.isArray(input.toolArgs)) {
    return input.toolArgs;
  }

  const rawJson = trimString(input.toolArgsJson);
  if (!rawJson) {
    return {};
  }

  let parsed;
  try {
    parsed = JSON.parse(rawJson);
  } catch (error) {
    throw new Error(`toolArgsJson inválido para Stitch: ${error.message}`);
  }

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('toolArgsJson para Stitch deve representar um objeto JSON.');
  }

  return parsed;
}

function getStitchBridgeStatus(options = {}) {
  const env = options.env || process.env;
  const probeAdc = options.probeAdc === true;
  const probeGcloud = options.probeGcloud === true || probeAdc;
  const apiKeySource = detectStitchApiKeySource(env);
  const accessTokenSource = detectStitchAccessTokenSource(env);
  const projectId = resolveStitchProjectId(env);
  const gcloudCommand = normalizeStitchGcloudCommand(
    options.gcloudCommand || env.NEXUS_STITCH_GCLOUD_COMMAND,
  );
  const binaryChecker = typeof options.binaryChecker === 'function' ? options.binaryChecker : checkBinary;
  const adcTokenResolver =
    typeof options.adcTokenResolver === 'function'
      ? options.adcTokenResolver
      : (resolverOptions) => printGcloudAdcAccessToken(resolverOptions);
  const gcloudCheck = probeGcloud
    ? binaryChecker(gcloudCommand)
    : { ok: null, detail: null };
  const authMode = resolveStitchAuthMode(env);
  const adcCandidate = !apiKeySource && !accessTokenSource && Boolean(projectId);

  let adcReady = false;
  let adcDetail = null;
  if (probeAdc && adcCandidate && gcloudCheck.ok) {
    const adcProbe = adcTokenResolver({
      env,
      gcloudCommand,
      timeoutMs: 10000,
    });
    adcReady = Boolean(adcProbe?.ok && trimString(adcProbe.token));
    adcDetail = adcProbe?.detail || null;
  }

  const ready =
    Boolean(apiKeySource)
    || Boolean(accessTokenSource && projectId)
    || adcReady;

  return {
    enabled: true,
    ready,
    mcpUrl: normalizeStitchMcpUrl(env.NEXUS_STITCH_MCP_URL),
    authMode,
    apiKeyConfigured: Boolean(apiKeySource),
    apiKeySource,
    accessTokenConfigured: Boolean(accessTokenSource),
    accessTokenSource,
    projectId,
    gcloudCommand,
    gcloudAvailable: probeGcloud ? Boolean(gcloudCheck.ok) : null,
    gcloudDetail: gcloudCheck.detail,
    adcCandidate,
    adcChecked: probeAdc,
    adcReady,
    adcDetail,
  };
}

function resolveStitchRequestHeaders(options = {}) {
  const env = options.env || process.env;
  const apiKey = readStitchApiKey(env);
  if (apiKey) {
    return {
      authMode: 'api_key',
      projectId: null,
      headers: {
        'X-Goog-Api-Key': apiKey,
      },
    };
  }

  const projectId = resolveStitchProjectId(env);
  const accessToken = readStitchAccessToken(env);
  if (accessToken && projectId) {
    return {
      authMode: 'access_token',
      projectId,
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'X-Goog-User-Project': projectId,
      },
    };
  }

  if (projectId) {
    const adcTokenResolver =
      typeof options.adcTokenResolver === 'function'
        ? options.adcTokenResolver
        : (resolverOptions) => printGcloudAdcAccessToken(resolverOptions);
    const adcResult = adcTokenResolver({
      env,
      gcloudCommand: options.gcloudCommand || env.NEXUS_STITCH_GCLOUD_COMMAND,
      timeoutMs: options.timeoutMs || 15000,
    });

    if (adcResult?.ok && trimString(adcResult.token)) {
      return {
        authMode: 'adc',
        projectId,
        headers: {
          Authorization: `Bearer ${trimString(adcResult.token)}`,
          'X-Goog-User-Project': projectId,
        },
      };
    }
  }

  throw new Error(
    'Stitch MCP sem autenticação pronta. Configure STITCH_API_KEY ou STITCH_ACCESS_TOKEN + GOOGLE_CLOUD_PROJECT, ou habilite ADC com gcloud autenticado.',
  );
}

async function listStitchTools(options = {}) {
  const requestHeaders = resolveStitchRequestHeaders(options);
  return listRemoteMcpTools({
    url: normalizeStitchMcpUrl((options.env || process.env).NEXUS_STITCH_MCP_URL),
    headers: requestHeaders.headers,
    fetchImpl: options.fetchImpl,
    timeoutMs: clampInteger(options.timeoutMs, 1000, 120000, DEFAULT_STITCH_REQUEST_TIMEOUT_MS),
  });
}

async function callStitchTool(toolName, toolArgs = {}, options = {}) {
  const requestHeaders = resolveStitchRequestHeaders(options);
  return callRemoteMcpTool(toolName, toolArgs, {
    url: normalizeStitchMcpUrl((options.env || process.env).NEXUS_STITCH_MCP_URL),
    headers: requestHeaders.headers,
    fetchImpl: options.fetchImpl,
    timeoutMs: clampInteger(options.timeoutMs, 1000, 120000, DEFAULT_STITCH_REQUEST_TIMEOUT_MS),
  });
}

module.exports = {
  DEFAULT_STITCH_GCLOUD_COMMAND,
  DEFAULT_STITCH_MCP_URL,
  callStitchTool,
  detectStitchAccessTokenSource,
  detectStitchApiKeySource,
  getStitchBridgeStatus,
  isReadOnlyStitchToolName,
  listStitchTools,
  normalizeStitchGcloudCommand,
  normalizeStitchMcpUrl,
  normalizeStitchToolArgs,
  printGcloudAdcAccessToken,
  readStitchAccessToken,
  readStitchApiKey,
  resolveStitchAuthMode,
  resolveStitchProjectId,
  resolveStitchRequestHeaders,
};
