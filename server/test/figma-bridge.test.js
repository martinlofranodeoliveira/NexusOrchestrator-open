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
  createFigmaApiUrl,
  getFigmaBridgeStatus,
  parseFigmaUrl,
} = require('../services/figmaBridge');

function createWorkspace() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-figma-bridge-'));
}

function withFetch(mockFetch, fn) {
  const previousFetch = global.fetch;
  global.fetch = mockFetch;
  return Promise.resolve()
    .then(fn)
    .finally(() => {
      global.fetch = previousFetch;
    });
}

test('parseFigmaUrl extracts file key and node id from design URLs', () => {
  const parsed = parseFigmaUrl(
    'https://www.figma.com/design/SyntheticFigmaFile1234/FORMA-%E2%80%94-LP?node-id=238-175&m=dev',
  );

  assert.equal(parsed.fileKey, 'SyntheticFigmaFile1234');
  assert.equal(parsed.nodeId, '238:175');
  assert.deepEqual(parsed.nodeIds, ['238:175']);
});

test('createFigmaApiUrl preserves v1 base url and query params', () => {
  const url = createFigmaApiUrl('/files/demo/nodes', {
    ids: '238:175',
    depth: 4,
  }, {
    NEXUS_FIGMA_API_BASE_URL: 'https://api.figma.com/v1/',
  });

  assert.equal(url, 'https://api.figma.com/v1/files/demo/nodes?ids=238%3A175&depth=4');
});

test('getFigmaBridgeStatus reports readiness from token presence', () => {
  assert.equal(
    getFigmaBridgeStatus({
      env: {},
    }).ready,
    false,
  );

  const readyStatus = getFigmaBridgeStatus({
    env: {
      FIGMA_ACCESS_TOKEN: 'token-123',
      NEXUS_FIGMA_API_BASE_URL: 'https://api.figma.com/v1',
    },
  });

  assert.equal(readyStatus.ready, true);
  assert.equal(readyStatus.tokenSource, 'FIGMA_ACCESS_TOKEN');
});

test('createToolDefinitions exposes figma tools only when the figma mcp is enabled', () => {
  const baseTools = createToolDefinitions({
    enabledMcps: [],
  }).map((tool) => tool.name);
  const figmaTools = createToolDefinitions({
    enabledMcps: ['figma'],
  }).map((tool) => tool.name);

  assert.equal(baseTools.includes('figma_get_node_context'), false);
  assert.equal(figmaTools.includes('figma_get_file'), true);
  assert.equal(figmaTools.includes('figma_get_node_context'), true);
  assert.equal(figmaTools.includes('figma_get_image_refs'), true);
});

test('buildToolExecutor can fetch figma node context via the figma bridge', async () => {
  const workspaceDir = createWorkspace();

  try {
    await withFetch(async (url, requestOptions) => {
      assert.match(String(url), /api\.figma\.com\/v1\/files\/SyntheticFigmaFile1234\/nodes/);
      assert.equal(requestOptions.headers['X-Figma-Token'], 'token-123');
      return {
        ok: true,
        async json() {
          return {
            name: 'FORMA - LP',
            version: '42',
            lastModified: '2026-04-18T14:00:00Z',
            nodes: {
              '238:175': {
                document: {
                  id: '238:175',
                  name: 'Hero',
                  type: 'FRAME',
                  absoluteBoundingBox: {
                    x: 0,
                    y: 0,
                    width: 1440,
                    height: 960,
                  },
                  fills: [
                    {
                      type: 'SOLID',
                      color: { r: 1, g: 1, b: 1 },
                      opacity: 1,
                    },
                  ],
                  children: [
                    {
                      id: '238:176',
                      name: 'Heading',
                      type: 'TEXT',
                      characters: 'FORMA 5K',
                      absoluteBoundingBox: {
                        x: 120,
                        y: 220,
                        width: 320,
                        height: 88,
                      },
                      style: {
                        fontFamily: 'Inter',
                        fontWeight: 700,
                        fontSize: 72,
                        lineHeightPx: 80,
                        letterSpacing: 0,
                        textAlignHorizontal: 'LEFT',
                        textAlignVertical: 'TOP',
                      },
                    },
                  ],
                },
                components: {},
              },
            },
          };
        },
      };
    }, async () => {
      const executeTool = buildToolExecutor(workspaceDir, {
        env: {
          FIGMA_ACCESS_TOKEN: 'token-123',
        },
      });

      const output = await executeTool('figma_get_node_context', {
        url: 'https://www.figma.com/design/SyntheticFigmaFile1234/FORMA-%E2%80%94-LP?node-id=238-175&m=dev',
        maxDepth: 3,
      });
      const payload = JSON.parse(output);

      assert.equal(payload.fileKey, 'SyntheticFigmaFile1234');
      assert.equal(payload.nodes[0].nodeId, '238:175');
      assert.equal(payload.nodes[0].summary.children[0].characters, 'FORMA 5K');
      assert.equal(payload.nodes[0].summary.layout.bounds.width, 1440);
    });
  } finally {
    fs.rmSync(workspaceDir, { recursive: true, force: true });
  }
});
