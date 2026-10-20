const fs = require('fs');
const path = require('path');

const PRIMARY_TEAM = 'primary';
const REVIEW_TEAM = 'review';
const DEFAULT_PRIMARY_TASK = 'Aguardando ordens...';
const DEFAULT_REVIEW_TASK = 'Cobertura de review e gargalos';
const DEFAULT_BUILTIN_ROOM_TOPOLOGY = 'role_cells';
const DEFAULT_PRIMARY_ROOM_REPLICAS = 7;
const DEFAULT_REVIEW_ROOM_REPLICAS = 7;

const MODEL_TIERS = new Set(['fast', 'balanced', 'reasoning']);
const BUILTIN_ROOM_TOPOLOGIES = new Set(['hq', 'role_cells']);

const DEFAULT_ROLE_LABELS = Object.freeze({
  ceo: 'Você (CEO)',
  pm: 'Product Manager',
  architect: 'Software Architect',
  sm: 'Scrum Master',
  dev: 'Software Engineer',
  qa: 'QA Tester',
  devops: 'CI/CD Pipeline',
  marketing: 'Marketing / Creative',
});

const DEFAULT_HQ_ROOM_TEMPLATES = Object.freeze([
  Object.freeze({
    id: 'primary_hq',
    name: 'Primary HQ',
    team: PRIMARY_TEAM,
    floor: 1,
    topology: 'hq',
    defaultTask: DEFAULT_PRIMARY_TASK,
    description: 'Sala principal de implementacao e coordenacao.',
    agents: Object.freeze([
      Object.freeze({ id: 'ceo', name: 'Você (CEO)', role: 'ceo', modelTier: 'reasoning' }),
      Object.freeze({ id: 'pm', name: 'Product Manager', role: 'pm', modelTier: 'balanced' }),
      Object.freeze({ id: 'architect', name: 'Software Architect', role: 'architect', modelTier: 'reasoning' }),
      Object.freeze({ id: 'sm', name: 'Scrum Master', role: 'sm', modelTier: 'balanced' }),
      Object.freeze({ id: 'dev', name: 'Software Engineer', role: 'dev', modelTier: 'balanced' }),
      Object.freeze({ id: 'dev2', name: 'Software Engineer 2', role: 'dev', modelTier: 'balanced' }),
      Object.freeze({ id: 'qa', name: 'QA Tester', role: 'qa', modelTier: 'balanced' }),
      Object.freeze({ id: 'devops', name: 'CI/CD Pipeline', role: 'devops', modelTier: 'reasoning' }),
    ]),
  }),
  Object.freeze({
    id: 'review_hq',
    name: 'Review HQ',
    team: REVIEW_TEAM,
    floor: 2,
    topology: 'hq',
    defaultTask: DEFAULT_REVIEW_TASK,
    description: 'Sala dedicada a review, QA e resgate operacional.',
    agents: Object.freeze([
      Object.freeze({ id: 'pm_review', name: 'PM Review Squad', role: 'pm', modelTier: 'reasoning' }),
      Object.freeze({ id: 'architect_review', name: 'Architect Review Squad', role: 'architect', modelTier: 'reasoning' }),
      Object.freeze({ id: 'sm_review', name: 'Scrum Review Squad', role: 'sm', modelTier: 'reasoning' }),
      Object.freeze({ id: 'dev_review', name: 'Engineer Review Squad', role: 'dev', modelTier: 'reasoning' }),
      Object.freeze({ id: 'qa_review', name: 'QA Review Squad', role: 'qa', modelTier: 'reasoning' }),
      Object.freeze({ id: 'devops_review', name: 'DevOps Review Squad', role: 'devops', modelTier: 'reasoning' }),
    ]),
  }),
]);

const DEFAULT_ROLE_ROOM_SPECS = Object.freeze([
  Object.freeze({
    roomId: 'ceo_command',
    name: 'CEO Command',
    team: PRIMARY_TEAM,
    floor: 1,
    defaultTask: 'Orquestrando estratégia, prioridade e desbloqueios',
    description: 'Sala do arquétipo CEO. Singleton de comando e integração executiva.',
    archetypeId: 'ceo',
    role: 'ceo',
    modelTier: 'reasoning',
    replicaCount: 1,
    namePrefix: 'Você (CEO)',
    linkedArchetypes: Object.freeze(['pm', 'architect', 'sm', 'devops']),
  }),
  Object.freeze({
    roomId: 'pm_primary_cell',
    name: 'PM Strategy Cell',
    team: PRIMARY_TEAM,
    floor: 1,
    defaultTask: 'Refinando backlog, escopo e critérios de aceite',
    description: 'Sala dedicada a Product Managers focados em escopo, copy e fluxo do produto.',
    archetypeId: 'pm',
    role: 'pm',
    modelTier: 'balanced',
    namePrefix: 'Product Manager',
    linkedArchetypes: Object.freeze(['ceo', 'architect', 'sm', 'dev', 'qa']),
  }),
  Object.freeze({
    roomId: 'architect_primary_cell',
    name: 'Architecture Cell',
    team: PRIMARY_TEAM,
    floor: 1,
    defaultTask: 'Protegendo contratos, integrações e desenho técnico',
    description: 'Sala dos arquitetos responsáveis por contratos, SDKs, MCPs e integridade estrutural.',
    archetypeId: 'architect',
    role: 'architect',
    modelTier: 'reasoning',
    namePrefix: 'Software Architect',
    linkedArchetypes: Object.freeze(['ceo', 'pm', 'dev', 'devops', 'architect_review']),
  }),
  Object.freeze({
    roomId: 'sm_primary_cell',
    name: 'Flow Control Cell',
    team: PRIMARY_TEAM,
    floor: 1,
    defaultTask: 'Removendo gargalos, filas e ambiguidades operacionais',
    description: 'Sala dos Scrum Masters operacionais para preservar fluxo, retomada e orquestração.',
    archetypeId: 'sm',
    role: 'sm',
    modelTier: 'balanced',
    namePrefix: 'Scrum Master',
    linkedArchetypes: Object.freeze(['ceo', 'pm', 'devops', 'sm_review']),
  }),
  Object.freeze({
    roomId: 'dev_primary_cell',
    name: 'Engineering Cell A',
    team: PRIMARY_TEAM,
    floor: 1,
    defaultTask: 'Implementando mudanças materiais e integráveis',
    description: 'Sala do arquétipo dev principal para execução ponta a ponta.',
    archetypeId: 'dev',
    role: 'dev',
    modelTier: 'balanced',
    namePrefix: 'Software Engineer',
    linkedArchetypes: Object.freeze(['pm', 'architect', 'qa', 'devops', 'dev_review']),
  }),
  Object.freeze({
    roomId: 'dev_secondary_cell',
    name: 'Engineering Cell B',
    team: PRIMARY_TEAM,
    floor: 1,
    defaultTask: 'Implementando mudanças materiais e integráveis',
    description: 'Sala do segundo arquétipo dev para paralelismo sem gargalo.',
    archetypeId: 'dev2',
    role: 'dev',
    modelTier: 'balanced',
    namePrefix: 'Software Engineer 2',
    linkedArchetypes: Object.freeze(['pm', 'architect', 'qa', 'devops', 'dev_review']),
  }),
  Object.freeze({
    roomId: 'qa_primary_cell',
    name: 'QA Validation Cell',
    team: PRIMARY_TEAM,
    floor: 1,
    defaultTask: 'Blindando regressão e validando comportamento',
    description: 'Sala dedicada a cobertura de QA, regressão, cenários negativos e evidência.',
    archetypeId: 'qa',
    role: 'qa',
    modelTier: 'balanced',
    namePrefix: 'QA Tester',
    linkedArchetypes: Object.freeze(['pm', 'dev', 'dev2', 'qa_review']),
  }),
  Object.freeze({
    roomId: 'devops_primary_cell',
    name: 'DevOps Pipeline Cell',
    team: PRIMARY_TEAM,
    floor: 1,
    defaultTask: 'Sustentando CI, release, logs e integração contínua',
    description: 'Sala dos especialistas em CI/CD, ambientes, rollout e observabilidade.',
    archetypeId: 'devops',
    role: 'devops',
    modelTier: 'reasoning',
    namePrefix: 'CI/CD Pipeline',
    linkedArchetypes: Object.freeze(['ceo', 'architect', 'sm', 'devops_review']),
  }),
  Object.freeze({
    roomId: 'pm_review_cell',
    name: 'PM Review Cell',
    team: REVIEW_TEAM,
    floor: 2,
    defaultTask: DEFAULT_REVIEW_TASK,
    description: 'Sala dedicada à revisão funcional e de produto.',
    archetypeId: 'pm_review',
    role: 'pm',
    modelTier: 'reasoning',
    namePrefix: 'PM Review Squad',
    linkedArchetypes: Object.freeze(['pm', 'qa_review', 'architect_review']),
  }),
  Object.freeze({
    roomId: 'architect_review_cell',
    name: 'Architecture Review Cell',
    team: REVIEW_TEAM,
    floor: 2,
    defaultTask: DEFAULT_REVIEW_TASK,
    description: 'Sala dedicada à revisão de contratos, integrações e riscos estruturais.',
    archetypeId: 'architect_review',
    role: 'architect',
    modelTier: 'reasoning',
    namePrefix: 'Architect Review Squad',
    linkedArchetypes: Object.freeze(['architect', 'pm_review', 'devops_review']),
  }),
  Object.freeze({
    roomId: 'sm_review_cell',
    name: 'Flow Review Cell',
    team: REVIEW_TEAM,
    floor: 2,
    defaultTask: DEFAULT_REVIEW_TASK,
    description: 'Sala dedicada à revisão operacional, retomada e disciplina de fluxo.',
    archetypeId: 'sm_review',
    role: 'sm',
    modelTier: 'reasoning',
    namePrefix: 'Scrum Review Squad',
    linkedArchetypes: Object.freeze(['sm', 'devops_review']),
  }),
  Object.freeze({
    roomId: 'dev_review_cell',
    name: 'Engineering Review Cell',
    team: REVIEW_TEAM,
    floor: 2,
    defaultTask: DEFAULT_REVIEW_TASK,
    description: 'Sala dedicada à revisão técnica, bugs, edge cases e qualidade do diff.',
    archetypeId: 'dev_review',
    role: 'dev',
    modelTier: 'reasoning',
    namePrefix: 'Engineer Review Squad',
    linkedArchetypes: Object.freeze(['dev', 'dev2', 'qa_review', 'architect_review']),
  }),
  Object.freeze({
    roomId: 'qa_review_cell',
    name: 'QA Review Cell',
    team: REVIEW_TEAM,
    floor: 2,
    defaultTask: DEFAULT_REVIEW_TASK,
    description: 'Sala dedicada à validação final, regressão e bloqueio de falsos verdes.',
    archetypeId: 'qa_review',
    role: 'qa',
    modelTier: 'reasoning',
    namePrefix: 'QA Review Squad',
    linkedArchetypes: Object.freeze(['qa', 'pm_review', 'dev_review']),
  }),
  Object.freeze({
    roomId: 'devops_review_cell',
    name: 'DevOps Review Cell',
    team: REVIEW_TEAM,
    floor: 2,
    defaultTask: DEFAULT_REVIEW_TASK,
    description: 'Sala dedicada à revisão de pipeline, integração, rollout e operações.',
    archetypeId: 'devops_review',
    role: 'devops',
    modelTier: 'reasoning',
    namePrefix: 'DevOps Review Squad',
    linkedArchetypes: Object.freeze(['devops', 'architect_review', 'sm_review']),
  }),
]);

function normalizeNonEmpty(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeStringList(values) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((value) => normalizeNonEmpty(value))
      .filter(Boolean),
  )];
}

function normalizeTeam(value) {
  return String(value || '').trim().toLowerCase() === REVIEW_TEAM ? REVIEW_TEAM : PRIMARY_TEAM;
}

function normalizeFloor(value, team = PRIMARY_TEAM) {
  const parsed = Number(value);
  if (Number.isFinite(parsed) && parsed > 0) {
    return Math.trunc(parsed);
  }
  return team === REVIEW_TEAM ? 2 : 1;
}

function normalizeModelTier(value, fallback = 'balanced') {
  const normalized = String(value || '').trim().toLowerCase();
  return MODEL_TIERS.has(normalized) ? normalized : fallback;
}

function sanitizeIdFragment(value, fallback = 'room') {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return normalized || fallback;
}

function normalizePositiveInteger(value, fallback, options = {}) {
  const min = Number.isFinite(Number(options.min)) ? Number(options.min) : 1;
  const max = Number.isFinite(Number(options.max)) ? Number(options.max) : 500;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(parsed)));
}

function normalizeOptionalPositiveInteger(value) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return null;
  return Math.trunc(parsed);
}

function resolveBuiltinRoomTopology(env = process.env) {
  const configured = String(
    env.NEXUS_DEFAULT_ROOM_TOPOLOGY || env.NEXUS_BUILTIN_ROOM_TOPOLOGY || '',
  )
    .trim()
    .toLowerCase();
  return BUILTIN_ROOM_TOPOLOGIES.has(configured) ? configured : DEFAULT_BUILTIN_ROOM_TOPOLOGY;
}

function cloneRoomTemplates(templates = []) {
  return (Array.isArray(templates) ? templates : []).map((room) => ({
    ...room,
    interlinkedRoomIds: normalizeStringList(room.interlinkedRoomIds),
    agents: (Array.isArray(room.agents) ? room.agents : []).map((agent) => ({
      ...agent,
      interlinkedRoomIds: normalizeStringList(agent.interlinkedRoomIds),
    })),
  }));
}

function resolveBuiltinReplicaCount(spec, env = process.env) {
  if (Number.isFinite(Number(spec.replicaCount)) && Number(spec.replicaCount) > 0) {
    return Math.trunc(Number(spec.replicaCount));
  }

  const archetypeEnvKey = `NEXUS_ROOM_REPLICAS_${sanitizeIdFragment(spec.archetypeId, 'agent').toUpperCase()}`;
  const teamDefault =
    spec.team === REVIEW_TEAM
      ? normalizePositiveInteger(
          env.NEXUS_REVIEW_ROOM_REPLICAS || env.NEXUS_ROLE_ROOM_REPLICAS,
          DEFAULT_REVIEW_ROOM_REPLICAS,
        )
      : normalizePositiveInteger(
          env.NEXUS_PRIMARY_ROOM_REPLICAS || env.NEXUS_ROLE_ROOM_REPLICAS,
          DEFAULT_PRIMARY_ROOM_REPLICAS,
        );

  return normalizePositiveInteger(env[archetypeEnvKey], teamDefault);
}

function buildBuiltinRoleCellTemplates(env = process.env) {
  const roomIdByArchetype = new Map(
    DEFAULT_ROLE_ROOM_SPECS.map((spec) => [spec.archetypeId, spec.roomId]),
  );

  return DEFAULT_ROLE_ROOM_SPECS.map((spec) => {
    const replicaTarget = resolveBuiltinReplicaCount(spec, env);
    const room = {
      id: spec.roomId,
      name: spec.name,
      team: spec.team,
      floor: spec.floor,
      topology: 'role_cells',
      archetypeId: spec.archetypeId,
      specializationRole: spec.role,
      defaultTask: spec.defaultTask,
      description: spec.description || null,
      interlinkedRoomIds: normalizeStringList(
        spec.linkedArchetypes.map((entry) => roomIdByArchetype.get(entry) || null),
      ),
      replicaTarget,
    };

    const agents = [];
    for (let index = 1; index <= replicaTarget; index += 1) {
      agents.push({
        id: index === 1 ? spec.archetypeId : `${spec.archetypeId}_${index}`,
        name: index === 1 ? spec.namePrefix : `${spec.namePrefix} ${index}`,
        role: spec.role,
        modelTier: normalizeModelTier(spec.modelTier, spec.role === 'ceo' ? 'reasoning' : 'balanced'),
        archetypeId: spec.archetypeId,
        specializationRole: spec.role,
        replicaIndex: index,
        roomId: room.id,
        roomName: room.name,
        roomTopology: room.topology,
        team: room.team,
        floor: room.floor,
        task: room.defaultTask,
      });
    }

    return {
      ...room,
      agents,
      configuredSlots: agents.length,
    };
  });
}

function buildBuiltinRoomTemplates(env = process.env) {
  const topology = resolveBuiltinRoomTopology(env);
  if (topology === 'hq') {
    return cloneRoomTemplates(DEFAULT_HQ_ROOM_TEMPLATES).map((room) => ({
      ...room,
      configuredSlots: room.agents.length,
      topology: room.topology || 'hq',
      replicaTarget: room.agents.length,
      interlinkedRoomIds: normalizeStringList(room.interlinkedRoomIds),
      specializationRole:
        room.specializationRole
        || (new Set(room.agents.map((agent) => String(agent.role || '').trim()).filter(Boolean)).size === 1
          ? String(room.agents[0]?.role || '').trim() || null
          : null),
    }));
  }

  return buildBuiltinRoleCellTemplates(env);
}

const DEFAULT_ROOM_TEMPLATES = Object.freeze(buildBuiltinRoomTemplates({}));

function resolveRoomTemplatePayload(env = process.env) {
  const explicitFile = normalizeNonEmpty(env.NEXUS_ROOM_TEMPLATES_FILE);
  if (explicitFile) {
    const resolvedFile = path.resolve(explicitFile);
    if (fs.existsSync(resolvedFile)) {
      return JSON.parse(fs.readFileSync(resolvedFile, 'utf8'));
    }
    return null;
  }

  const inlinePayload = normalizeNonEmpty(env.NEXUS_ROOM_TEMPLATES_JSON || env.NEXUS_ROOM_TEMPLATES);
  if (!inlinePayload) return null;
  return JSON.parse(inlinePayload);
}

function buildGeneratedRoomAgents(room, roles = []) {
  const generated = [];

  (Array.isArray(roles) ? roles : []).forEach((entry) => {
    const role = normalizeNonEmpty(entry?.role) || 'dev';
    const count = Math.max(0, Math.trunc(Number(entry?.count) || 0));
    const modelTier = normalizeModelTier(entry?.modelTier, role === 'ceo' ? 'reasoning' : 'balanced');
    const archetypeId = normalizeNonEmpty(entry?.archetypeId || entry?.idPrefix || role) || role;
    const idPrefix = sanitizeIdFragment(entry?.idPrefix || archetypeId, role);
    const namePrefix = normalizeNonEmpty(entry?.namePrefix) || DEFAULT_ROLE_LABELS[role] || role;

    for (let index = 1; index <= count; index += 1) {
      generated.push({
        id: `${room.id}_${idPrefix}${count > 1 ? `_${index}` : ''}`,
        name: count > 1 ? `${namePrefix} ${index}` : namePrefix,
        role,
        modelTier,
        archetypeId,
        specializationRole: role,
        replicaIndex: index,
        llmProvider: normalizeNonEmpty(entry?.llmProvider) || null,
        model: normalizeNonEmpty(entry?.model) || null,
        reasoningEffort: normalizeNonEmpty(entry?.reasoningEffort) || null,
        fallbackModels: normalizeStringList(entry?.fallbackModels),
        skills: normalizeStringList(entry?.skills),
        prompt: normalizeNonEmpty(entry?.prompt) || null,
      });
    }
  });

  return generated;
}

function normalizeRoomAgentEntries(room, rawAgents = [], rawRoles = []) {
  const directAgents = (Array.isArray(rawAgents) ? rawAgents : [])
    .map((entry, index) => {
      const role = normalizeNonEmpty(entry?.role) || 'dev';
      const configuredId =
        normalizeNonEmpty(entry?.id)
        || `${room.id}_${sanitizeIdFragment(entry?.idPrefix || role, role)}${index > 0 ? `_${index + 1}` : ''}`;
      const archetypeId =
        normalizeNonEmpty(entry?.archetypeId)
        || configuredId.replace(/_\d+$/u, '');
      return {
        id: configuredId,
        name: normalizeNonEmpty(entry?.name) || DEFAULT_ROLE_LABELS[role] || `Agent ${index + 1}`,
        role,
        modelTier: normalizeModelTier(entry?.modelTier, role === 'ceo' ? 'reasoning' : 'balanced'),
        archetypeId,
        specializationRole: normalizeNonEmpty(entry?.specializationRole) || role,
        replicaIndex: normalizeOptionalPositiveInteger(entry?.replicaIndex) || index + 1,
        mcps: normalizeStringList(entry?.mcps),
        llmProvider: normalizeNonEmpty(entry?.llmProvider) || null,
        model: normalizeNonEmpty(entry?.model) || null,
        reasoningEffort: normalizeNonEmpty(entry?.reasoningEffort) || null,
        fallbackModels: normalizeStringList(entry?.fallbackModels),
        skills: normalizeStringList(entry?.skills),
        prompt: normalizeNonEmpty(entry?.prompt) || null,
      };
    });

  const generatedAgents = buildGeneratedRoomAgents(room, rawRoles);
  return [...directAgents, ...generatedAgents].map((agent) => ({
    ...agent,
    roomId: room.id,
    roomName: room.name,
    roomTopology: room.topology || null,
    team: room.team,
    floor: room.floor,
    task: room.defaultTask,
  }));
}

function inferSpecializationRole(agents = []) {
  const roles = [...new Set(
    (Array.isArray(agents) ? agents : [])
      .map((agent) => normalizeNonEmpty(agent?.specializationRole || agent?.role))
      .filter(Boolean),
  )];
  return roles.length === 1 ? roles[0] : null;
}

function inferArchetypeId(agents = []) {
  const archetypes = [...new Set(
    (Array.isArray(agents) ? agents : [])
      .map((agent) => normalizeNonEmpty(agent?.archetypeId))
      .filter(Boolean),
  )];
  return archetypes.length === 1 ? archetypes[0] : null;
}

function normalizeRoomTemplate(entry, fallbackIndex) {
  const team = normalizeTeam(entry?.team);
  const id = sanitizeIdFragment(entry?.id || entry?.name, `room_${fallbackIndex + 1}`);
  const room = {
    id,
    name: normalizeNonEmpty(entry?.name) || `Room ${fallbackIndex + 1}`,
    team,
    floor: normalizeFloor(entry?.floor, team),
    topology: normalizeNonEmpty(entry?.topology) || null,
    archetypeId: normalizeNonEmpty(entry?.archetypeId) || null,
    specializationRole: normalizeNonEmpty(entry?.specializationRole) || null,
    defaultTask:
      normalizeNonEmpty(entry?.defaultTask)
      || (team === REVIEW_TEAM ? DEFAULT_REVIEW_TASK : DEFAULT_PRIMARY_TASK),
    description: normalizeNonEmpty(entry?.description) || null,
    interlinkedRoomIds: normalizeStringList(entry?.interlinkedRoomIds),
    replicaTarget: normalizeOptionalPositiveInteger(entry?.replicaTarget),
  };

  const agents = normalizeRoomAgentEntries(room, entry?.agents, entry?.roles);
  const configuredSlots = Math.max(agents.length, room.replicaTarget || 0);

  return {
    ...room,
    agents,
    configuredSlots,
    replicaTarget: room.replicaTarget || configuredSlots,
    archetypeId: room.archetypeId || inferArchetypeId(agents),
    specializationRole: room.specializationRole || inferSpecializationRole(agents),
  };
}

function resolveRoomTemplates(env = process.env) {
  let payload = null;
  try {
    payload = resolveRoomTemplatePayload(env);
  } catch (_error) {
    payload = null;
  }

  if (!Array.isArray(payload) || payload.length === 0) {
    return buildBuiltinRoomTemplates(env);
  }

  return payload
    .map((entry, index) => normalizeRoomTemplate(entry, index))
    .filter((room) => room.agents.length > 0);
}

function buildDefaultAgentBlueprints(env = process.env) {
  return resolveRoomTemplates(env).flatMap((room) =>
    room.agents.map((agent) => ({
      ...agent,
      team: room.team,
      floor: room.floor,
      task: room.defaultTask,
      roomId: room.id,
      roomName: room.name,
      roomTopology: room.topology || null,
      specializationRole: room.specializationRole || agent.specializationRole || agent.role || null,
      archetypeId: room.archetypeId || agent.archetypeId || null,
    })),
  );
}

function buildAgentArchetypeCandidates(agent = {}) {
  const candidates = new Set();
  [agent.archetypeId, agent.id].forEach((value) => {
    const normalized = normalizeNonEmpty(value);
    if (!normalized) return;
    candidates.add(normalized);
    candidates.add(normalized.replace(/_\d+$/u, ''));
  });
  return [...candidates].filter(Boolean);
}

function findRoomForAgent(rooms, agent = {}) {
  const list = Array.isArray(rooms) ? rooms : [];
  if (list.length === 0) return null;

  const explicitRoomId = normalizeNonEmpty(agent.roomId);
  if (explicitRoomId) {
    const explicitRoom = list.find((room) => room.id === explicitRoomId);
    if (explicitRoom) return explicitRoom;
  }

  const team = normalizeTeam(agent.team);
  const floor = normalizeFloor(agent.floor, team);
  const archetypeCandidates = buildAgentArchetypeCandidates(agent);
  for (const archetypeId of archetypeCandidates) {
    const exactArchetypeRoom =
      list.find((room) => room.team === team && room.archetypeId === archetypeId)
      || list.find((room) => room.archetypeId === archetypeId);
    if (exactArchetypeRoom) return exactArchetypeRoom;
  }

  const specializationRole = normalizeNonEmpty(agent.specializationRole || agent.role);
  if (specializationRole) {
    const roleRoom =
      list.find(
        (room) =>
          room.team === team &&
          room.floor === floor &&
          room.specializationRole === specializationRole,
      )
      || list.find((room) => room.team === team && room.specializationRole === specializationRole)
      || list.find((room) => room.specializationRole === specializationRole);
    if (roleRoom) return roleRoom;
  }

  return (
    list.find((room) => room.team === team && room.floor === floor)
    || list.find((room) => room.team === team)
    || list.find((room) => room.floor === floor)
    || list[0]
  );
}

function buildRoomOccupancy(rooms, agents = []) {
  const list = Array.isArray(rooms) ? rooms : [];
  const currentAgents = Array.isArray(agents) ? agents : [];

  return list.map((room) => {
    const occupants = currentAgents.filter((agent) => String(agent?.roomId || '').trim() === room.id);
    const configuredSlots = room.configuredSlots || room.agents.length;
    return {
      id: room.id,
      name: room.name,
      team: room.team,
      floor: room.floor,
      topology: room.topology || null,
      archetypeId: room.archetypeId || null,
      specializationRole: room.specializationRole || inferSpecializationRole(room.agents),
      defaultTask: room.defaultTask,
      description: room.description || null,
      configuredSlots,
      replicaTarget: room.replicaTarget || configuredSlots,
      occupants: occupants.length,
      availableSlots: Math.max(0, configuredSlots - occupants.length),
      interlinkedRoomIds: normalizeStringList(room.interlinkedRoomIds),
      roles: room.agents.reduce((acc, agent) => {
        const key = String(agent.role || 'dev').trim() || 'dev';
        acc[key] = (acc[key] || 0) + 1;
        return acc;
      }, {}),
    };
  });
}

module.exports = {
  DEFAULT_BUILTIN_ROOM_TOPOLOGY,
  DEFAULT_HQ_ROOM_TEMPLATES,
  DEFAULT_PRIMARY_ROOM_REPLICAS,
  DEFAULT_PRIMARY_TASK,
  DEFAULT_REVIEW_ROOM_REPLICAS,
  DEFAULT_REVIEW_TASK,
  DEFAULT_ROLE_ROOM_SPECS,
  DEFAULT_ROOM_TEMPLATES,
  PRIMARY_TEAM,
  REVIEW_TEAM,
  buildDefaultAgentBlueprints,
  buildRoomOccupancy,
  findRoomForAgent,
  normalizeFloor,
  normalizeTeam,
  resolveBuiltinRoomTopology,
  resolveRoomTemplates,
};
