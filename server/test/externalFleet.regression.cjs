const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const http = require('node:http');
const { createExternalFleet } = require('../services/externalFleet');
const { createFleetServer } = require('../fleetServer');

function projection(t, entries = {}) {
  const directory = fs.mkdtempSync(path.join(os.homedir(), 'nexus-public-'));
  fs.chmodSync(directory, 0o700);
  t.after(() => fs.rmSync(directory, { force: true, recursive: true }));
  const filename = path.join(directory, 'view.json');
  const time = 1900000000000;
  fs.writeFileSync(filename, JSON.stringify({ schemaVersion: 1, updatedAtMs: time, agents: [], tasks: [], events: [], ...entries }), { mode: 0o600 });
  return { filename, time };
}

function call(port, method, target, headers) {
  return new Promise((resolve, reject) => {
    const req = http.request({ host: '127.0.0.1', port, method, path: target, headers }, response => {
      let text = '';
      response.setEncoding('utf8'); response.on('data', chunk => { text += chunk; });
      response.on('end', () => resolve({ status: response.statusCode, text }));
    });
    req.on('error', reject); req.end();
  });
}

// These public protocol examples are independent of the private acceptance oracle.
test('empty configured projection is a live empty fleet, never a demo fleet', t => {
  const input = projection(t);
  const view = createExternalFleet({ snapshotPath: input.filename, clock: () => input.time }).refresh();
  assert.deepEqual(view.agents, []);
  assert.deepEqual(view.tasks, []);
  assert.equal(view.operations.settings.externalFleet.state, 'live');
  assert.equal(view.operations.agents.total, 0);
});

test('queued and published records use board states and public delivery links', t => {
  const task = { id: 'delivery-9', title: 'Release a documented command', status: 'published', assignee: null, repo: 'sample/tool', url: 'https://github.com/sample/tool/commit/987' };
  const input = projection(t, { tasks: [task, { ...task, id: 'proposal-10', status: 'queued', url: '' }] });
  const view = createExternalFleet({ snapshotPath: input.filename, clock: () => input.time }).refresh();
  assert.deepEqual(view.tasks.map(row => row.state), ['done', 'ready']);
  assert.equal(view.tasks[0].githubUrl, task.url);
  assert.deepEqual(view.operations.tasks.byStatus, { done: 1, ready: 1 });
});

test('aged projection withdraws execution claims and assignments', t => {
  const input = projection(t, {
    agents: [{ id: 'builder', name: 'Builder', role: 'developer', status: 'testing', model: 'sample/model', task: 'Check the release', repo: 'sample/tool' }],
    tasks: [{ id: 'check', title: 'Check the release', status: 'implementing', assignee: 'builder', repo: 'sample/tool', url: '' }],
  });
  const view = createExternalFleet({ snapshotPath: input.filename, clock: () => input.time + 60000 }).refresh();
  assert.equal(view.source.state, 'stale');
  assert.equal(view.operations.runs.active, 0);
  assert.equal(view.agents[0].state, 'unavailable');
  assert.equal(view.agents[0].llmProvider, 'external');
  assert.equal(view.agents[0].currentModel, 'sample/model');
  assert.equal(view.tasks[0].assignee, null);
});

test('untrusted URL schemes and nonprivate sources never appear in the view', t => {
  const input = projection(t, { tasks: [{ id: 'bad-link', title: 'Example', status: 'queued', assignee: null, repo: 'sample/tool', url: 'file:///etc/passwd' }] });
  const adapter = createExternalFleet({ snapshotPath: input.filename, clock: () => input.time });
  assert.equal(adapter.refresh().source.state, 'unavailable');
  fs.writeFileSync(input.filename, JSON.stringify({ schemaVersion: 1, updatedAtMs: input.time, agents: [], tasks: [], events: [] }));
  fs.chmodSync(input.filename, 0o640);
  assert.equal(adapter.refresh().source.state, 'unavailable');
});

test('optional HTTP entry exposes status but rejects application writes and foreign hosts', async t => {
  const input = projection(t), app = createFleetServer({ snapshotPath: input.filename, clock: () => input.time, port: 0 });
  await app.listen(); t.after(() => app.close());
  const port = app.server.address().port;
  const health = await call(port, 'GET', '/health');
  assert.equal(JSON.parse(health.text).status.readOnly, true);
  assert.equal((await call(port, 'POST', '/api/tasks')).status, 405);
  assert.equal((await call(port, 'GET', '/api/status', { Host: 'untrusted.invalid' })).status, 403);
  assert.equal((await call(port, 'GET', '/api/status', { Origin: 'https://untrusted.invalid' })).status, 403);
});

test('status API rejects malformed targets and close is safe to repeat', async t => {
  const input = projection(t), app = createFleetServer({ snapshotPath: input.filename, clock: () => input.time, port: 0 });
  await app.listen(); t.after(() => app.close());
  const port = app.server.address().port;
  assert.equal((await call(port, 'GET', 'http://[')).status, 400);
  const response = await call(port, 'GET', '/api/operations');
  assert.equal(response.status, 200);
  assert.equal(JSON.parse(response.text).settings.externalFleet.enabled, true);
  await app.close(); await app.close();
  assert.equal(app.server.listening, false);
});
