const test = require('node:test');
const assert = require('node:assert/strict');

const {
  callRemoteMcpTool,
  listRemoteMcpTools,
  parseSseJsonPayload,
} = require('../services/remoteMcpClient');

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

test('parseSseJsonPayload keeps the last valid JSON-RPC event', () => {
  const payload = parseSseJsonPayload([
    'event: message',
    'data: {"jsonrpc":"2.0","id":"1","result":{"step":"first"}}',
    '',
    'data: {"jsonrpc":"2.0","id":"2","result":{"step":"second"}}',
    '',
  ].join('\n'));

  assert.deepEqual(payload, {
    jsonrpc: '2.0',
    id: '2',
    result: {
      step: 'second',
    },
  });
});

test('listRemoteMcpTools initializes a remote session and returns the exposed tools', async () => {
  const calls = [];
  const tools = await listRemoteMcpTools({
    url: 'https://example.test/mcp',
    headers: {
      'X-Test-Header': 'demo',
    },
    async fetchImpl(url, options) {
      calls.push({
        url,
        headers: options.headers,
        body: options.body ? JSON.parse(options.body) : null,
      });

      const method = calls[calls.length - 1].body?.method;
      if (method === 'initialize') {
        return createResponse(200, {
          'content-type': 'application/json',
          'mcp-session-id': 'session-123',
        }, {
          jsonrpc: '2.0',
          id: calls[calls.length - 1].body.id,
          result: {
            serverInfo: {
              name: 'stitch',
            },
          },
        });
      }

      if (method === 'notifications/initialized') {
        return createResponse(204, {}, null);
      }

      if (method === 'tools/list') {
        return createResponse(200, {
          'content-type': 'application/json',
        }, {
          jsonrpc: '2.0',
          id: calls[calls.length - 1].body.id,
          result: {
            tools: [
              { name: 'list_projects' },
              { name: 'get_screen' },
            ],
          },
        });
      }

      throw new Error(`Método inesperado: ${method}`);
    },
  });

  assert.deepEqual(tools.map((tool) => tool.name), ['list_projects', 'get_screen']);
  assert.equal(calls.length, 3);
  assert.equal(calls[0].headers['X-Test-Header'], 'demo');
  assert.equal(calls[1].headers['Mcp-Session-Id'], 'session-123');
  assert.equal(calls[2].headers['Mcp-Session-Id'], 'session-123');
});

test('callRemoteMcpTool accepts event-stream responses from the remote MCP server', async () => {
  const calls = [];
  const result = await callRemoteMcpTool('list_projects', {
    filter: 'owned',
  }, {
    url: 'https://example.test/mcp',
    async fetchImpl(_url, options) {
      calls.push({
        headers: options.headers,
        body: options.body ? JSON.parse(options.body) : null,
      });

      const method = calls[calls.length - 1].body?.method;
      if (method === 'initialize') {
        return createResponse(200, {
          'content-type': 'application/json',
          'mcp-session-id': 'session-456',
        }, {
          jsonrpc: '2.0',
          id: calls[calls.length - 1].body.id,
          result: {},
        });
      }

      if (method === 'notifications/initialized') {
        return createResponse(204, {}, null);
      }

      if (method === 'tools/call') {
        return createResponse(200, {
          'content-type': 'text/event-stream',
        }, [
          'data: {"jsonrpc":"2.0","id":"ignore","result":{"progress":"starting"}}',
          '',
          `data: ${JSON.stringify({
            jsonrpc: '2.0',
            id: calls[calls.length - 1].body.id,
            result: {
              projects: [
                { name: 'projects/demo-1' },
              ],
            },
          })}`,
          '',
        ].join('\n'));
      }

      throw new Error(`Método inesperado: ${method}`);
    },
  });

  assert.deepEqual(result, {
    projects: [
      { name: 'projects/demo-1' },
    ],
  });
  assert.equal(calls[2].body.params.name, 'list_projects');
  assert.deepEqual(calls[2].body.params.arguments, { filter: 'owned' });
});
