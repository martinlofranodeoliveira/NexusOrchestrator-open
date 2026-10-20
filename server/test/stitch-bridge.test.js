const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildToolExecutor,
  createToolDefinitions,
} = require('../services/autonomousToolLoop');
const {
  getStitchBridgeStatus,
  normalizeStitchMcpUrl,
  normalizeStitchToolArgs,
  resolveStitchRequestHeaders,
} = require('../services/stitchBridge');

function createWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-stitch-bridge-'));
}

function createHeaders(initialHeaders = {}) {
  const normalized = new Map(
    Object.entries(initialHeaders).map(([key, value]) => [String(key).toLowerCase(), value]),
  );
  return {
    get(name) {
      return normalized.get(String(name).toLowerCase()) ?? null;
    },
  };
}

function createResponse(status, headers, body) {
  let serializedBody = '';
  if (typeof body === 'string') {
    serializedBody = body;
  } else if (body != null) {
    serializedBody = JSON.stringify(body);
  }

  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 204 ? 'No Content' : 'OK',
    headers: createHeaders(headers),
    async text() {
      return serializedBody;
    },
  };
}

test('normalizeStitchMcpUrl trims the trailing slash and preserves the default endpoint', () => {
  assert.equal(
    normalizeStitchMcpUrl('https://stitch.googleapis.com/mcp/'),
    'https://stitch.googleapis.com/mcp',
  );
});

test('getStitchBridgeStatus reports readiness when an API key is configured', () => {
  const status = getStitchBridgeStatus({
    env: {
      STITCH_API_KEY: 'stitch-key',
      NEXUS_STITCH_MCP_URL: 'https://stitch.googleapis.com/mcp/',
    },
    binaryChecker() {
      return {
        ok: false,
        detail: 'gcloud not installed',
      };
    },
  });

  assert.equal(status.ready, true);
  assert.equal(status.authMode, 'api_key');
  assert.equal(status.apiKeySource, 'STITCH_API_KEY');
  assert.equal(status.mcpUrl, 'https://stitch.googleapis.com/mcp');
});

test('getStitchBridgeStatus does not probe ADC unless explicitly requested', () => {
  let binaryCheckerCalls = 0;
  let adcResolverCalls = 0;
  const status = getStitchBridgeStatus({
    env: {
      GCLOUD_PROJECT_ID: 'zellolife',
    },
    binaryChecker() {
      binaryCheckerCalls += 1;
      return {
        ok: true,
        detail: 'gcloud ok',
      };
    },
    adcTokenResolver() {
      adcResolverCalls += 1;
      return {
        ok: true,
        token: 'token-123',
        detail: null,
      };
    },
  });

  assert.equal(status.ready, false);
  assert.equal(status.adcCandidate, true);
  assert.equal(status.adcChecked, false);
  assert.equal(status.gcloudAvailable, null);
  assert.equal(binaryCheckerCalls, 0);
  assert.equal(adcResolverCalls, 0);
});

test('resolveStitchRequestHeaders supports access token mode with project binding', () => {
  const resolved = resolveStitchRequestHeaders({
    env: {
      STITCH_ACCESS_TOKEN: 'token-123',
      STITCH_GOOGLE_CLOUD_PROJECT: 'forma5k-local',
    },
  });

  assert.equal(resolved.authMode, 'access_token');
  assert.equal(resolved.projectId, 'forma5k-local');
  assert.equal(resolved.headers.Authorization, 'Bearer token-123');
  assert.equal(resolved.headers['X-Goog-User-Project'], 'forma5k-local');
});

test('normalizeStitchToolArgs accepts direct objects and JSON strings', () => {
  assert.deepEqual(normalizeStitchToolArgs({
    toolArgs: {
      prompt: 'landing page editorial',
    },
  }), {
    prompt: 'landing page editorial',
  });

  assert.deepEqual(normalizeStitchToolArgs({
    toolArgsJson: '{"projectId":"demo","selectedScreenIds":["a"]}',
  }), {
    projectId: 'demo',
    selectedScreenIds: ['a'],
  });
});

test('createToolDefinitions exposes Stitch tools only when the stitch mcp is enabled', () => {
  const baseTools = createToolDefinitions({
    enabledMcps: [],
  }).map((tool) => tool.name);
  const stitchTools = createToolDefinitions({
    enabledMcps: ['stitch'],
  }).map((tool) => tool.name);

  assert.equal(baseTools.includes('stitch_status'), false);
  assert.equal(stitchTools.includes('stitch_status'), true);
  assert.equal(stitchTools.includes('stitch_list_tools'), true);
  assert.equal(stitchTools.includes('stitch_call_tool'), true);
});

test('buildToolExecutor can list Stitch tools through the remote MCP bridge', async () => {
  const workspaceDir = createWorkspace();
  const calls = [];

  try {
    const executeTool = buildToolExecutor(workspaceDir, {
      env: {
        STITCH_API_KEY: 'stitch-key',
      },
      async fetchImpl(_url, options) {
        const body = options.body ? JSON.parse(options.body) : null;
        calls.push({
          headers: options.headers,
          body,
        });

        if (body?.method === 'initialize') {
          return createResponse(200, {
            'content-type': 'application/json',
            'mcp-session-id': 'session-789',
          }, {
            jsonrpc: '2.0',
            id: body.id,
            result: {},
          });
        }

        if (body?.method === 'notifications/initialized') {
          return createResponse(204, {}, null);
        }

        if (body?.method === 'tools/list') {
          return createResponse(200, {
            'content-type': 'application/json',
          }, {
            jsonrpc: '2.0',
            id: body.id,
            result: {
              tools: [
                { name: 'list_projects' },
                { name: 'get_project' },
              ],
            },
          });
        }

        throw new Error(`Método inesperado: ${body?.method}`);
      },
    });

    const output = await executeTool('stitch_list_tools', {});
    const payload = JSON.parse(output);

    assert.deepEqual(payload.map((tool) => tool.name), ['list_projects', 'get_project']);
    assert.equal(calls[0].headers['X-Goog-Api-Key'], 'stitch-key');
    assert.equal(calls[2].headers['Mcp-Session-Id'], 'session-789');
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});

test('buildToolExecutor blocks mutating Stitch calls during review mode', async () => {
  const workspaceDir = createWorkspace();

  try {
    const executeTool = buildToolExecutor(workspaceDir, {
      reviewMode: true,
    });

    await assert.rejects(
      () => executeTool('stitch_call_tool', {
        toolName: 'create_project',
        toolArgs: {
          title: 'FORMA 5K',
        },
      }),
      /operacoes mutantes no Stitch/i,
    );
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});
