const DEFAULT_MCP_PROTOCOL_VERSION = '2024-11-05';
const DEFAULT_REMOTE_MCP_TIMEOUT_MS = 45000;

let requestSequence = 0;

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

function nextRequestId() {
  requestSequence += 1;
  return `nexus-mcp-${requestSequence}`;
}

function buildBaseHeaders(headers = {}, sessionId = null) {
  const normalizedHeaders = {
    Accept: 'application/json, text/event-stream',
    'Content-Type': 'application/json',
    'MCP-Protocol-Version': DEFAULT_MCP_PROTOCOL_VERSION,
    'User-Agent': 'NexusOrchestrator/remote-mcp-client',
    ...(headers || {}),
  };

  if (trimString(sessionId)) {
    normalizedHeaders['Mcp-Session-Id'] = trimString(sessionId);
  }

  return normalizedHeaders;
}

function parseSseJsonPayload(rawText) {
  const events = [];
  let dataLines = [];

  const flush = () => {
    if (dataLines.length === 0) return;
    const payload = dataLines.join('\n').trim();
    dataLines = [];
    if (!payload || payload === '[DONE]') return;

    try {
      events.push(JSON.parse(payload));
    } catch (_error) {
      // Ignore malformed chunks and keep looking for the last valid JSON envelope.
    }
  };

  String(rawText || '')
    .split(/\r?\n/)
    .forEach((line) => {
      if (!line.trim()) {
        flush();
        return;
      }

      if (line.startsWith('data:')) {
        dataLines.push(line.slice(5).trimStart());
      }
    });

  flush();
  return events.length > 0 ? events[events.length - 1] : null;
}

async function parseJsonRpcHttpResponse(response) {
  if (response.status === 204) {
    return null;
  }

  const rawText = String(await response.text()).trim();
  if (!rawText) {
    return null;
  }

  const contentType = String(response.headers?.get?.('content-type') || '').toLowerCase();

  if (contentType.includes('text/event-stream')) {
    const parsedSsePayload = parseSseJsonPayload(rawText);
    if (parsedSsePayload) {
      return parsedSsePayload;
    }
  }

  try {
    return JSON.parse(rawText);
  } catch (_error) {
    const parsedSsePayload = parseSseJsonPayload(rawText);
    if (parsedSsePayload) {
      return parsedSsePayload;
    }
    throw new Error(`Resposta MCP inválida: ${rawText.slice(0, 400)}`);
  }
}

function unwrapJsonRpcEnvelope(envelope) {
  if (!envelope) {
    return null;
  }

  if (envelope.error) {
    const message = trimString(envelope.error.message) || 'falha MCP remota';
    const code = Number(envelope.error.code);
    throw new Error(Number.isFinite(code) ? `MCP ${code}: ${message}` : `MCP: ${message}`);
  }

  return envelope.result ?? null;
}

async function postJsonRpcMessage(url, payload, options = {}) {
  const fetchImpl = options.fetchImpl || global.fetch;
  if (typeof fetchImpl !== 'function') {
    throw new Error('fetch indisponível no runtime Node atual para acessar o MCP remoto.');
  }

  const timeoutMs = clampInteger(
    options.timeoutMs,
    1000,
    120000,
    DEFAULT_REMOTE_MCP_TIMEOUT_MS,
  );
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutHandle = controller
    ? setTimeout(() => controller.abort(), timeoutMs)
    : null;

  try {
    const response = await fetchImpl(url, {
      method: 'POST',
      headers: buildBaseHeaders(options.headers, options.sessionId),
      body: JSON.stringify(payload),
      signal: controller?.signal,
    });

    if (!response.ok) {
      const errorText = trimString(await response.text());
      throw new Error(
        `MCP HTTP ${response.status}: ${errorText || response.statusText || 'falha desconhecida'}`,
      );
    }

    return {
      sessionId:
        trimString(response.headers?.get?.('mcp-session-id'))
        || trimString(response.headers?.get?.('Mcp-Session-Id'))
        || trimString(options.sessionId)
        || null,
      envelope: await parseJsonRpcHttpResponse(response),
    };
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}

async function createRemoteMcpSession(options = {}) {
  const url = trimString(options.url);
  if (!url) {
    throw new Error('URL do MCP remoto ausente.');
  }

  const initializeResponse = await postJsonRpcMessage(url, {
    jsonrpc: '2.0',
    id: nextRequestId(),
    method: 'initialize',
    params: {
      protocolVersion: DEFAULT_MCP_PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: {
        name: 'NexusOrchestrator',
        version: '1.0.0',
      },
    },
  }, options);

  const sessionId = trimString(initializeResponse.sessionId);
  const initializeResult = unwrapJsonRpcEnvelope(initializeResponse.envelope) || {};

  await postJsonRpcMessage(url, {
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  }, {
    ...options,
    sessionId,
  });

  return {
    sessionId,
    initializeResult,
    async call(method, params = {}) {
      const response = await postJsonRpcMessage(url, {
        jsonrpc: '2.0',
        id: nextRequestId(),
        method,
        params,
      }, {
        ...options,
        sessionId,
      });

      return unwrapJsonRpcEnvelope(response.envelope);
    },
  };
}

async function listRemoteMcpTools(options = {}) {
  const session = await createRemoteMcpSession(options);
  const result = await session.call('tools/list', {});
  return Array.isArray(result?.tools) ? result.tools : [];
}

async function callRemoteMcpTool(toolName, toolArgs = {}, options = {}) {
  const name = trimString(toolName);
  if (!name) {
    throw new Error('Nome da tool MCP remota ausente.');
  }

  const session = await createRemoteMcpSession(options);
  return session.call('tools/call', {
    name,
    arguments: toolArgs && typeof toolArgs === 'object' ? toolArgs : {},
  });
}

module.exports = {
  DEFAULT_MCP_PROTOCOL_VERSION,
  DEFAULT_REMOTE_MCP_TIMEOUT_MS,
  callRemoteMcpTool,
  createRemoteMcpSession,
  listRemoteMcpTools,
  parseSseJsonPayload,
  postJsonRpcMessage,
};
