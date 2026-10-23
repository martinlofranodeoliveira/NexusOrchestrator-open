'use strict';

// Pure coordination metadata. This module does not execute agents or authorize I/O.
const PROVIDERS = Object.freeze({
  muse: Object.freeze({ priority: 1, model: 'opencode-go/muse-spark-1.3-contributor', maxSlots: 10 }),
  gemini: Object.freeze({ priority: 2, model: 'gemini-3.8-flash-high', maxSlots: 4 }),
  codex: Object.freeze({ priority: 3, model: null, maxSlots: 1 }),
  local: Object.freeze({ priority: 4, model: null, maxSlots: 1 }),
});
const DEFAULT_LIMITS = Object.freeze({ muse: 4, gemini: 1, codex: 1, local: 1 });
const MAX_AGENTS = 128;
const MAX_TASKS = 4096;
const MAX_OPERATIONS = 16384;
const MAX_STATE_BYTES = 8 * 1024 * 1024;
const RESULT_CODES = Object.freeze(['DELIVERED', 'VALIDATION_FAILED', 'PROVIDER_UNAVAILABLE', 'INVALID_RESULT', 'CANCELLED']);

class CollaborationError extends Error {
  constructor(code) {
    super(code);
    this.name = 'CollaborationError';
    this.code = code;
  }
}

function fail(code) { throw new CollaborationError(code); }
function record(value, keys, required = keys) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) fail('INVALID_INPUT');
  if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) fail('INVALID_INPUT');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || !keys.includes(key))) fail('INVALID_INPUT');
  if (Object.values(descriptors).some(item => !Object.hasOwn(item, 'value') || !item.enumerable)) fail('INVALID_INPUT');
  if (required.some(key => !Object.hasOwn(descriptors, key))) fail('INVALID_INPUT');
  return value;
}
function integer(value, min, max) {
  if (!Number.isSafeInteger(value) || value < min || value > max) fail('INVALID_INPUT');
  return value;
}
function identifier(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}$/.test(value)) fail('INVALID_INPUT');
  return value;
}
function array(value, max, min = 0) {
  if (!Array.isArray(value) || Object.getPrototypeOf(value) !== Array.prototype || value.length < min || value.length > max) fail('INVALID_INPUT');
  // Sparse arrays, extra properties and accessors are not JSON data.
  const descriptors = Object.getOwnPropertyDescriptors(value);
  if (Reflect.ownKeys(descriptors).some(key => typeof key !== 'string' || (key !== 'length' && !/^(0|[1-9][0-9]*)$/.test(key)))) fail('INVALID_INPUT');
  for (let i = 0; i < value.length; i += 1) {
    const item = descriptors[String(i)];
    if (!item || !Object.hasOwn(item, 'value') || !item.enumerable) fail('INVALID_INPUT');
  }
  return value;
}
function uniqueIds(value, max = 32) {
  const result = array(value, max).map(identifier);
  if (new Set(result).size !== result.length) fail('INVALID_INPUT');
  return result.slice().sort();
}
function claimToken(value) {
  if (typeof value !== 'string' || !/^[a-z0-9][a-z0-9._-]{0,63}:r[1-9][0-9]{0,15}$/.test(value)) fail('INVALID_INPUT');
  return value;
}
function publicRef(value) {
  record(value, ['repository', 'commit', 'visibility', 'paths']);
  if (typeof value.repository !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,38}\/[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value.repository)) fail('INVALID_PUBLIC_REF');
  if (typeof value.commit !== 'string' || !/^[a-f0-9]{40}$/.test(value.commit) || value.visibility !== 'public') fail('INVALID_PUBLIC_REF');
  const paths = array(value.paths, 32, 1).map(path => {
    if (typeof path !== 'string' || path.length > 240 || !/^[A-Za-z0-9._-]+(?:\/[A-Za-z0-9._-]+)*$/.test(path)) fail('INVALID_PUBLIC_REF');
    const parts = path.split('/');
    if (parts.some(part => part === '.' || part === '..' || /^(?:\.git|\.ssh|\.codex|\.env(?:\..*)?|auth\.json)$/i.test(part))) fail('INVALID_PUBLIC_REF');
    return path;
  });
  if (new Set(paths).size !== paths.length) fail('INVALID_PUBLIC_REF');
  return { repository: value.repository, commit: value.commit, visibility: 'public', paths: paths.slice().sort() };
}
function refs(value) { return array(value, 16, 1).map(publicRef); }
function day(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) fail('INVALID_DAY');
  const [year, month, date] = value.split('-').map(Number);
  const leap = year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0);
  const lengths = [31, leap ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
  if (year < 2000 || year > 9999 || month < 1 || month > 12 || date < 1 || date > lengths[month - 1]) fail('INVALID_DAY');
  return value;
}
function limits(value = DEFAULT_LIMITS) {
  record(value, Object.keys(PROVIDERS));
  return Object.fromEntries(Object.keys(PROVIDERS).map(provider => [provider, integer(value[provider], 1, PROVIDERS[provider].maxSlots)]));
}
function agent(value) {
  record(value, ['id', 'role', 'provider', 'model', 'capabilities', 'available', 'floor']);
  const id = identifier(value.id);
  if (!['planner', 'executor'].includes(value.role)) fail('INVALID_ROLE');
  if (typeof value.provider !== 'string' || !Object.hasOwn(PROVIDERS, value.provider)) fail('UNSUPPORTED_PROVIDER');
  const policy = PROVIDERS[value.provider];
  if (typeof value.model !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._/:+-]{0,159}$/.test(value.model)) fail('INVALID_MODEL');
  if (policy.model !== null && value.model !== policy.model) fail('MODEL_MISMATCH');
  if (typeof value.available !== 'boolean') fail('INVALID_INPUT');
  const capabilities = uniqueIds(value.capabilities);
  if (capabilities.length === 0) fail('INVALID_INPUT');
  return { id, role: value.role, provider: value.provider, model: value.model, capabilities, available: value.available, floor: integer(value.floor, 0, 100) };
}
function clone(value) { return JSON.parse(JSON.stringify(value)); }
function freeze(value) {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze);
    Object.freeze(value);
  }
  return value;
}
function canonical(value) {
  if (Array.isArray(value)) return `[${value.map(canonical).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.keys(value).sort().map(key => `${JSON.stringify(key)}:${canonical(value[key])}`).join(',')}}`;
  return JSON.stringify(value);
}
function safeTree(value, budget = { size: 0, nodes: 0 }, depth = 0) {
  budget.nodes += 1;
  if (depth > 32 || budget.nodes > 250000) fail('STATE_LIMIT');
  if (value === null || typeof value === 'boolean') return value;
  if (typeof value === 'number') {
    if (!Number.isSafeInteger(value)) fail('INVALID_STATE');
    return value;
  }
  if (typeof value === 'string') {
    budget.size += value.length;
    if (budget.size > MAX_STATE_BYTES) fail('STATE_LIMIT');
    return value;
  }
  if (Array.isArray(value)) return array(value, MAX_OPERATIONS).map(item => safeTree(item, budget, depth + 1));
  if (!value || typeof value !== 'object') fail('INVALID_STATE');
  const descriptors = Object.getOwnPropertyDescriptors(value);
  record(value, Reflect.ownKeys(descriptors));
  return Object.fromEntries(Object.entries(descriptors).map(([key, descriptor]) => {
    budget.size += key.length;
    return [key, safeTree(descriptor.value, budget, depth + 1)];
  }));
}
function normalize(operation, input) {
  switch (operation) {
    case 'request': {
      record(input, ['taskId', 'from', 'to', 'capability', 'sourceRefs', 'dependencies', 'parentTaskId', 'parentClaimToken', 'hopBudget'], ['taskId', 'from', 'capability', 'sourceRefs']);
      const parentTaskId = input.parentTaskId == null ? null : identifier(input.parentTaskId);
      const parentClaimToken = input.parentClaimToken == null ? null : claimToken(input.parentClaimToken);
      if (parentTaskId === null && parentClaimToken !== null) fail('UNEXPECTED_PARENT_CLAIM');
      return { taskId: identifier(input.taskId), from: identifier(input.from), to: input.to == null ? null : identifier(input.to), capability: identifier(input.capability), sourceRefs: refs(input.sourceRefs), dependencies: uniqueIds(input.dependencies ?? []), parentTaskId, parentClaimToken, hopBudget: input.hopBudget == null ? null : integer(input.hopBudget, 0, 2) };
    }
    case 'claim':
      record(input, ['taskId', 'agentId', 'day']);
      return { taskId: identifier(input.taskId), agentId: identifier(input.agentId), day: day(input.day) };
    case 'release':
      record(input, ['taskId', 'agentId', 'claimToken']);
      return { taskId: identifier(input.taskId), agentId: identifier(input.agentId), claimToken: claimToken(input.claimToken) };
    case 'settle': {
      record(input, ['taskId', 'agentId', 'claimToken', 'status', 'code', 'evidenceRefs']);
      if (!['completed', 'failed'].includes(input.status) || !RESULT_CODES.includes(input.code)) fail('INVALID_RESULT');
      if ((input.status === 'completed') !== (input.code === 'DELIVERED')) fail('INVALID_RESULT');
      const evidenceRefs = input.status === 'completed' ? refs(input.evidenceRefs) : array(input.evidenceRefs, 0);
      return { taskId: identifier(input.taskId), agentId: identifier(input.agentId), claimToken: claimToken(input.claimToken), status: input.status, code: input.code, evidenceRefs };
    }
    case 'dependencies':
      record(input, ['taskId', 'dependencies']);
      return { taskId: identifier(input.taskId), dependencies: uniqueIds(input.dependencies) };
    case 'availability':
      record(input, ['agentId', 'available']);
      if (typeof input.available !== 'boolean') fail('INVALID_INPUT');
      return { agentId: identifier(input.agentId), available: input.available };
    default: fail('INVALID_OPERATION');
  }
}
function dag(tasks) {
  const byId = new Map(tasks.map(task => [task.id, task]));
  const colors = new Map();
  function visit(id) {
    if (colors.get(id) === 1) fail('DEPENDENCY_CYCLE');
    if (colors.get(id) === 2) return;
    colors.set(id, 1);
    const blockers = byId.get(id).dependencies.concat(tasks.filter(task => task.parentTaskId === id).map(task => task.id));
    for (const dependency of blockers) {
      if (!byId.has(dependency)) fail('UNKNOWN_DEPENDENCY');
      visit(dependency);
    }
    colors.set(id, 2);
  }
  for (const task of tasks) visit(task.id);
}

class AgentCollaboration {
  #state;

  constructor(options) {
    record(options, ['agents', 'providerLimits'], ['agents']);
    const registry = array(options.agents, MAX_AGENTS, 1).map(agent);
    if (new Set(registry.map(item => item.id)).size !== registry.length) fail('DUPLICATE_AGENT');
    this.#state = { schemaVersion: 2, revision: 0, providerLimits: limits(options.providerLimits), currentDay: null, codexClaims: 0, initialAgents: clone(registry), agents: registry, tasks: [], operations: [] };
  }

  snapshot() { return freeze(clone(this.#state)); }
  exportState() { return this.snapshot(); }
  getTask(taskId) {
    const task = this.#state.tasks.find(item => item.id === identifier(taskId));
    if (!task) fail('UNKNOWN_TASK');
    return freeze(clone(task));
  }

  // The trusted adapter supplies a global revision for requests/availability,
  // a task revision for all task mutations, and a durable idempotency key.
  apply(operation, input, options) {
    record(options, ['expectedRevision', 'idempotencyKey']);
    const { expectedRevision, idempotencyKey } = options;
    const key = identifier(idempotencyKey);
    integer(expectedRevision, 0, Number.MAX_SAFE_INTEGER);
    const data = normalize(operation, input);
    const fingerprint = canonical({ operation, data });
    const previous = this.#state.operations.find(item => item.key === key);
    if (previous) {
      if (canonical({ operation: previous.operation, data: previous.input }) !== fingerprint) fail('IDEMPOTENCY_CONFLICT');
      return freeze(clone(previous.receipt));
    }
    if (this.#state.operations.length >= MAX_OPERATIONS) fail('OPERATION_LIMIT');
    const next = clone(this.#state);
    const task = 'taskId' in data ? next.tasks.find(item => item.id === data.taskId) : null;
    const expected = operation === 'request' || operation === 'availability' ? next.revision : task?.revision;
    if (expected === undefined) fail('UNKNOWN_TASK');
    if (expectedRevision !== expected) fail('STALE_REVISION');
    let changed;
    if (operation === 'request') changed = this._request(next, data);
    else if (operation === 'availability') {
      const target = this._agent(next, data.agentId);
      target.available = data.available;
      changed = { agentId: target.id };
    } else {
      changed = this._changeTask(next, task, operation, data);
      task.revision += 1;
    }
    next.revision += 1;
    const updated = changed.task;
    const receipt = {
      operation, status: updated?.status ?? 'accepted', taskId: updated?.id ?? null,
      taskRevision: updated?.revision ?? null, stateRevision: next.revision,
      agentId: updated?.to ?? changed.agentId, claimToken: updated?.claimToken ?? null,
      resultCode: updated?.result?.code ?? null,
    };
    next.operations.push({ key, operation, input: data, receipt });
    if (JSON.stringify(next).length > MAX_STATE_BYTES) fail('STATE_LIMIT');
    this.#state = next;
    return freeze(clone(receipt));
  }

  _agent(state, id) {
    const found = state.agents.find(item => item.id === id);
    if (!found) fail('UNKNOWN_AGENT');
    return found;
  }
  _capacity(state, target) {
    if (!target.available) return false;
    const running = state.tasks.filter(item => item.claimToken !== null && item.status === 'accepted');
    return !running.some(item => item.to === target.id)
      && running.filter(item => this._agent(state, item.to).provider === target.provider).length < state.providerLimits[target.provider];
  }
  _request(state, data) {
    if (state.tasks.length >= MAX_TASKS) fail('TASK_LIMIT');
    if (state.tasks.some(item => item.id === data.taskId)) fail('DUPLICATE_TASK');
    const sender = this._agent(state, data.from);
    let remainingHops = data.hopBudget ?? 2;
    let parent = null;
    if (data.parentTaskId !== null) {
      parent = state.tasks.find(item => item.id === data.parentTaskId);
      if (!parent) fail('UNKNOWN_TASK');
      if (parent.to !== data.from || parent.status !== 'accepted') fail('UNAUTHORIZED_HANDOFF');
      if (parent.claimToken === null || data.parentClaimToken !== parent.claimToken) fail('STALE_PARENT_CLAIM');
      if (parent.remainingHops === 0) fail('HOP_LIMIT');
      remainingHops = parent.remainingHops - 1;
      if (data.hopBudget !== null && data.hopBudget !== remainingHops) fail('HOP_LIMIT');
    } else if (sender.role !== 'planner') fail('ROOT_REQUEST_REQUIRES_PLANNER');
    let candidates = state.agents.filter(item => item.capabilities.includes(data.capability));
    if (data.to !== null) {
      const target = this._agent(state, data.to);
      if (target.id === data.from) fail('SELF_HANDOFF');
      candidates = target.capabilities.includes(data.capability) ? [target] : [];
    } else candidates = candidates.filter(item => item.id !== data.from);
    if (candidates.length === 0) fail('UNSUPPORTED_CAPABILITY');
    candidates = candidates.filter(item => this._capacity(state, item));
    if (candidates.length === 0) fail('AGENT_UNAVAILABLE');
    const backlog = target => state.tasks.filter(item => item.to === target.id && item.status === 'accepted').length;
    candidates.sort((left, right) => PROVIDERS[left.provider].priority - PROVIDERS[right.provider].priority
      || backlog(left) - backlog(right) || (left.id < right.id ? -1 : left.id === right.id ? 0 : 1));
    const target = candidates[0];
    for (let ancestor = parent; ancestor !== null; ancestor = ancestor.parentTaskId === null ? null : state.tasks.find(item => item.id === ancestor.parentTaskId)) {
      if (ancestor.from === target.id) fail('HANDOFF_CYCLE');
    }
    const task = { id: data.taskId, revision: 1, from: data.from, to: target.id, capability: data.capability, sourceRefs: data.sourceRefs, dependencies: data.dependencies, parentTaskId: data.parentTaskId, parentClaimToken: data.parentClaimToken, remainingHops, status: 'accepted', claimToken: null, result: null };
    state.tasks.push(task);
    dag(state.tasks);
    return { task };
  }
  _changeTask(state, task, operation, data) {
    if (task.status !== 'accepted') fail('TASK_TERMINAL');
    if (operation === 'dependencies') {
      if (task.claimToken !== null) fail('TASK_RUNNING');
      task.dependencies = data.dependencies;
      dag(state.tasks);
      return { task };
    }
    const target = this._agent(state, data.agentId);
    if (target.id !== task.to) fail('UNAUTHORIZED_AGENT');
    if (operation === 'claim') {
      if (task.claimToken !== null) fail('TASK_RUNNING');
      if (!task.dependencies.every(id => state.tasks.find(item => item.id === id).status === 'completed')) fail('DEPENDENCY_NOT_COMPLETED');
      if (!this._capacity(state, target)) fail('AGENT_UNAVAILABLE');
      if (state.currentDay !== null && data.day < state.currentDay) fail('DAY_REGRESSION');
      if (target.provider === 'codex' && state.currentDay === data.day && state.codexClaims >= 1) fail('DAILY_LIMIT');
      if (state.currentDay !== data.day) { state.currentDay = data.day; state.codexClaims = 0; }
      if (target.provider === 'codex') state.codexClaims += 1;
      task.claimToken = `${task.id}:r${task.revision + 1}`;
    } else {
      if (task.claimToken === null || task.claimToken !== data.claimToken) fail('STALE_CLAIM');
      if (operation === 'release') task.claimToken = null;
      else if (operation === 'settle') {
        const children = state.tasks.filter(item => item.parentTaskId === task.id);
        if (children.some(item => item.status === 'accepted')) fail('CHILDREN_PENDING');
        if (data.status === 'completed' && children.some(item => item.status !== 'completed')) fail('CHILD_FAILED');
        task.status = data.status;
        task.claimToken = null;
        task.result = { code: data.code, evidenceRefs: data.evidenceRefs };
      }
    }
    return { task };
  }

  // Replaying the exact operation journal validates all derived state, CAS,
  // accounting and receipts. An adapter must authenticate/store it atomically.
  static fromState(value) {
    value = safeTree(value);
    record(value, ['schemaVersion', 'revision', 'providerLimits', 'currentDay', 'codexClaims', 'initialAgents', 'agents', 'tasks', 'operations']);
    if (value.schemaVersion !== 2) fail('UNSUPPORTED_STATE_VERSION');
    integer(value.revision, 0, MAX_OPERATIONS);
    array(value.tasks, MAX_TASKS);
    const operations = array(value.operations, MAX_OPERATIONS);
    array(value.agents, MAX_AGENTS, 1).map(agent);
    const initial = array(value.initialAgents, MAX_AGENTS, 1).map(agent);
    const restored = new AgentCollaboration({ agents: initial, providerLimits: limits(value.providerLimits) });
    for (const op of operations) {
      record(op, ['key', 'operation', 'input', 'receipt']);
      const data = normalize(op.operation, op.input);
      const expectedRevision = op.operation === 'request' || op.operation === 'availability' ? restored.#state.revision : restored.getTask(data.taskId).revision;
      const receipt = restored.apply(op.operation, data, { expectedRevision, idempotencyKey: op.key });
      if (canonical(receipt) !== canonical(op.receipt)) fail('INVALID_STATE');
    }
    if (canonical(restored.#state) !== canonical(value)) fail('INVALID_STATE');
    return restored;
  }
}

module.exports = { AgentCollaboration, CollaborationError, PROVIDERS, DEFAULT_LIMITS };
