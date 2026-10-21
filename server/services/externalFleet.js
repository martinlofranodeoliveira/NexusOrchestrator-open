'use strict';

// This adapter reads one operator-produced projection. It has no runtime/control imports.
const fs = require('node:fs');
const path = require('node:path');
const { TextDecoder } = require('node:util');

const MAX_BYTES = 2 * 1024 * 1024;
const STALE_MS = 30000;
const AGENT_STATUSES = new Set(['idle', 'preparing', 'running', 'testing', 'reviewing', 'publishing', 'blocked', 'unavailable']);
const TASK_STATUSES = new Set(['queued', 'preparing', 'implementing', 'published', 'rejected', 'quarantined']);
const ACTIVE = new Set(['preparing', 'running', 'testing', 'reviewing', 'publishing']);
const SECRET = /(?:\bBearer\s+\S+|\b(?:gh[pousr]_[A-Za-z0-9_]{12,}|github_pat_[A-Za-z0-9_]+|sk-[A-Za-z0-9_-]{12,}|AIza[A-Za-z0-9_-]{20,})|-----BEGIN [A-Z ]*PRIVATE KEY-----|\b(?:password|passwd|api[_-]?key|access[_-]?token|authorization|secret)\s*[:=]|(?:^|[\s"'])\/(?:home|root|run|var)\/|\b(?:auth\.json|opencode\.db|\.env)\b)/i;
const invalid = () => { throw new Error('Invalid external fleet snapshot'); };
const signature = s => [s.dev, s.ino, s.mode, s.uid, s.gid, s.nlink, s.size, s.mtimeNs, s.ctimeNs].join(':');
const sameInode = (a, b) => a.dev === b.dev && a.ino === b.ino && a.mode === b.mode && a.uid === b.uid;

function readSnapshot(filename) {
  if (typeof filename !== 'string' || !path.isAbsolute(filename) || path.normalize(filename) !== filename) invalid();
  const parts = filename.split('/').filter(Boolean);
  if (!parts.length) invalid();
  const descriptors = [];
  const bindings = [];
  const stat = fd => fs.fstatSync(fd, { bigint: true });
  const open = (name, flags) => { const fd = fs.openSync(name, flags); descriptors.push(fd); return fd; };
  try {
    let fd = open('/', fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
    const checkDir = descriptor => {
      const info = stat(descriptor);
      if (!info.isDirectory() || ![0n, BigInt(process.getuid())].includes(info.uid) || (info.mode & 0o22n)) invalid();
      return info;
    };
    checkDir(fd);
    for (const component of parts.slice(0, -1)) {
      const named = `/proc/self/fd/${fd}/${component}`;
      const child = open(named, fs.constants.O_RDONLY | fs.constants.O_DIRECTORY | fs.constants.O_NOFOLLOW);
      bindings.push({ named, fd: child, before: checkDir(child) }); fd = child;
    }
    const named = `/proc/self/fd/${fd}/${parts.at(-1)}`;
    const leaf = open(named, fs.constants.O_RDONLY | fs.constants.O_NOFOLLOW | fs.constants.O_NONBLOCK);
    const before = stat(leaf);
    if (!before.isFile() || before.uid !== BigInt(process.getuid()) || (before.mode & 0o7777n) !== 0o600n || before.nlink !== 1n || before.size > BigInt(MAX_BYTES)) invalid();
    const buffer = Buffer.alloc(Number(before.size) + 1);
    let length = 0;
    while (length < buffer.length) { const n = fs.readSync(leaf, buffer, length, buffer.length - length, null); if (!n) break; length += n; }
    if (length !== Number(before.size) || signature(before) !== signature(stat(leaf)) || signature(before) !== signature(fs.lstatSync(named, { bigint: true }))) invalid();
    for (const binding of bindings) {
      const current = checkDir(binding.fd), namedInfo = fs.lstatSync(binding.named, { bigint: true });
      if (!sameInode(binding.before, current) || !sameInode(current, namedInfo)) invalid();
    }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(buffer.subarray(0, length)));
  } finally { for (const descriptor of descriptors.reverse()) fs.closeSync(descriptor); }
}

function exact(object, fields) {
  if (!object || typeof object !== 'object' || Array.isArray(object) || Object.keys(object).length !== fields.length || fields.some(key => !Object.hasOwn(object, key))) invalid();
}
function text(value, max, empty = false) {
  if (typeof value !== 'string' || value.length > max || (!empty && !value.trim()) || /[\x00-\x1f\x7f]/.test(value) || SECRET.test(value)) invalid();
  return value;
}
function id(value) { if (!/^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/.test(text(value, 80))) invalid(); return value; }
function repo(value) { if (value !== '' && !/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(text(value, 200))) invalid(); return value; }
function date(value, now) { if (!Number.isSafeInteger(value) || value < 0 || value > now + 5000) invalid(); return value; }
function rows(array, cap, validate) {
  if (!Array.isArray(array) || array.length > cap) invalid();
  const ids = new Set();
  return array.map(row => { const out = validate(row); if (ids.has(out.id)) invalid(); ids.add(out.id); return out; });
}
function validateSnapshot(snapshot, now) {
  exact(snapshot, ['schemaVersion', 'updatedAtMs', 'agents', 'tasks', 'events']);
  if (snapshot.schemaVersion !== 1) invalid(); date(snapshot.updatedAtMs, now);
  const agents = rows(snapshot.agents, 64, row => {
    exact(row, ['id', 'name', 'role', 'status', 'model', 'task', 'repo']);
    if (!AGENT_STATUSES.has(row.status)) invalid();
    return { id: id(row.id), name: text(row.name, 120), role: text(row.role, 64), status: row.status, model: text(row.model, 160, true), task: text(row.task, 512, true), repo: repo(row.repo) };
  });
  const tasks = rows(snapshot.tasks, 200, row => {
    exact(row, ['id', 'title', 'status', 'assignee', 'repo', 'url']);
    if (!TASK_STATUSES.has(row.status)) invalid();
    const url = text(row.url, 512, true);
    if (url) { const parsed = new URL(url); if (parsed.protocol !== 'https:' || parsed.hostname !== 'github.com' || parsed.username || parsed.password || parsed.search || parsed.hash) invalid(); }
    return { id: id(row.id), title: text(row.title, 512), status: row.status, assignee: row.assignee === null ? null : id(row.assignee), repo: repo(row.repo), url };
  });
  const events = rows(snapshot.events, 250, row => {
    exact(row, ['id', 'agentId', 'at', 'message']);
    return { id: id(row.id), agentId: id(row.agentId), at: date(row.at, now), message: text(row.message, 1024) };
  });
  return { updatedAtMs: snapshot.updatedAtMs, agents, tasks, events };
}

function byStatus(rows, key = 'status') { return rows.reduce((counts, row) => { counts[row[key]] = (counts[row[key]] || 0) + 1; return counts; }, {}); }
function providerForModel(model) {
  if (model.startsWith('opencode-go/')) return 'opencode-go';
  if (model.startsWith('gemini-')) return 'gemini';
  if (model.startsWith('gpt-') || model.startsWith('codex')) return 'codex';
  if (model.startsWith('local')) return 'local';
  return 'external';
}
function project(snapshot, now) {
  const state = snapshot ? (now - snapshot.updatedAtMs > STALE_MS ? 'stale' : 'live') : 'unavailable';
  const live = state === 'live';
  const source = { state, updatedAtMs: snapshot?.updatedAtMs ?? null, ageMs: snapshot ? Math.max(0, now - snapshot.updatedAtMs) : null };
  const agents = (snapshot?.agents || []).map(agent => ({ ...agent, llmProvider: providerForModel(agent.model), currentModel: agent.model, status: live ? agent.status : 'unavailable',
    state: live ? (['reviewing', 'publishing'].includes(agent.status) ? 'running' : agent.status) : 'unavailable', task: live ? agent.task : '' }));
  const states = { queued: 'ready', preparing: 'in_progress', implementing: 'in_progress', published: 'done', rejected: 'blocked', quarantined: 'blocked' };
  const tasks = (snapshot?.tasks || []).map(task => ({ ...task, githubUrl: task.url, assignee: live ? task.assignee : null, state: live || task.status === 'published' ? states[task.status] : 'blocked' }));
  const operations = { instanceId: 'external-fleet', readOnly: true, source,
    agents: { total: agents.length, byStatus: byStatus(agents) }, tasks: { total: tasks.length, byStatus: byStatus(tasks, 'state') },
    runs: { active: live ? agents.filter(agent => ACTIVE.has(agent.status) && agent.status !== 'preparing').length : 0,
      preparing: live ? agents.filter(agent => agent.status === 'preparing').length : 0, queued: live ? tasks.filter(task => task.status === 'queued').length : 0 },
    settings: { externalFleet: { enabled: true, state, updatedAtMs: source.updatedAtMs }, autoDispatchEnabled: false, bootstrapDemoTasksEnabled: false },
    attention: { healthy: live, flaggedCount: 0, criticalCount: 0, tasks: [], criticalTasks: [] } };
  return { source, agents, tasks, operations, events: live ? snapshot.events : [] };
}

function createExternalFleet({ snapshotPath = process.env.NEXUS_FLEET_SNAPSHOT, clock = Date.now } = {}) {
  let current = project(null, clock());
  return {
    refresh() {
      const now = clock();
      try { current = project(validateSnapshot(readSnapshot(snapshotPath), now), now); }
      catch { current = project(null, now); }
      return structuredClone(current);
    },
    getState() { return structuredClone(current); },
  };
}

module.exports = { createExternalFleet };
