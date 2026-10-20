function normalizeTaskText(value) {
  return String(value || '')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^\w\s[\]-]/g, ' ')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();
}

function buildPrimaryTaskRoleFitText(task) {
  if (!task || typeof task !== 'object') {
    return '';
  }

  const approvedScope = Array.isArray(task.approvedScope) ? task.approvedScope.join(' ') : '';
  const acceptanceCriteria = Array.isArray(task.acceptanceCriteria)
    ? task.acceptanceCriteria.join(' ')
    : '';
  const dependencies = Array.isArray(task.dependencies) ? task.dependencies.join(' ') : '';
  const externalAccessGaps = Array.isArray(task.externalAccessGaps)
    ? task.externalAccessGaps.join(' ')
    : '';
  const outOfScope = Array.isArray(task.outOfScope) ? task.outOfScope.join(' ') : '';
  const executionRules = Array.isArray(task.executionRules) ? task.executionRules.join(' ') : '';

  return normalizeTaskText([
    task.id,
    task.title,
    task.summary,
    task.objective,
    task.scope,
    task.suggestedSquad,
    approvedScope,
    acceptanceCriteria,
    dependencies,
    externalAccessGaps,
    outOfScope,
    executionRules,
    task.phase,
  ].filter(Boolean).join(' '));
}

const STRONG_IMPLEMENTATION_PATTERNS = Object.freeze([
  /\bflutter\b/,
  /\bfrontend\b/,
  /\bbackend\b/,
  /\bapi\b/,
  /\bendpoint\b/,
  /\bschema\b/,
  /\bredis\b/,
  /\bcache\b/,
  /\bdatabase\b/,
  /\bpostgres\b/,
  /\balembic\b/,
  /\bci\/cd\b/,
  /\bdeploy\b/,
  /\be2e\b/,
  /\btestes? de carga\b/,
  /\blatencia\b/,
  /\bthroughput\b/,
]);

const UI_IMPLEMENTATION_PATTERNS = Object.freeze([
  /\bmobile\b/,
  /\bnavegac/,
  /\btema\b/,
  /\bshells?\b/,
  /\bfeed\b/,
  /\bcards?\b/,
  /\bswipe\b/,
  /\bperfil\b/,
  /\bfiltros?\b/,
  /\bmatch(es)?\b/,
  /\bnotifica/,
]);

const ARCHITECTURE_IMPLEMENTATION_PATTERNS = Object.freeze([
  /\bschema\b/,
  /\borm\b/,
  /\bmodelo de dados\b/,
  /\bdatabase\b/,
  /\bpostgres\b/,
  /\balembic\b/,
  /\bplataforma\b/,
  /\bplatform\b/,
  /\bmcp\b/,
  /\bsdk\b/,
]);

function isGameFactoryImplementationTask(task, options = {}) {
  const backlogRef = String(task?.backlogRef || '').trim();
  if (/^GAME-\d+/i.test(backlogRef)) return true;

  const phase = normalizeTaskText(task?.phase);
  if (phase === 'autonomous game factory') return true;

  const text = normalizeTaskText(options.text || buildPrimaryTaskRoleFitText(task));
  return /\bhtml5 game\b|\bbrowser game\b|\bplayable game\b/.test(text);
}

function countPatternMatches(text, patterns) {
  return patterns.reduce((count, pattern) => (pattern.test(text) ? count + 1 : count), 0);
}

function isImplementationHeavyPrimaryTask(task, options = {}) {
  const text = normalizeTaskText(options.text || buildPrimaryTaskRoleFitText(task));
  if (!text) return false;
  if (isGameFactoryImplementationTask(task, { text })) return true;

  const strongHits = countPatternMatches(text, STRONG_IMPLEMENTATION_PATTERNS);
  const uiHits = countPatternMatches(text, UI_IMPLEMENTATION_PATTERNS);
  return strongHits > 0 || uiHits >= 2;
}

function isMobileUiImplementationTask(task, options = {}) {
  const text = normalizeTaskText(options.text || buildPrimaryTaskRoleFitText(task));
  if (!text) return false;
  if (!/\bflutter\b|\bmobile\b/.test(text)) return false;

  return countPatternMatches(text, UI_IMPLEMENTATION_PATTERNS) >= 2;
}

function hasArchitectureSpecificSignals(task, options = {}) {
  const text = normalizeTaskText(options.text || buildPrimaryTaskRoleFitText(task));
  if (!text) return false;

  return countPatternMatches(text, ARCHITECTURE_IMPLEMENTATION_PATTERNS) > 0;
}

function normalizeRole(roleOrAgent) {
  if (roleOrAgent && typeof roleOrAgent === 'object') {
    return String(roleOrAgent.role || '').trim().toLowerCase();
  }
  return String(roleOrAgent || '').trim().toLowerCase();
}

function shouldBlockAgentOnImplementationDispatch(roleOrAgent, task, options = {}) {
  const role = normalizeRole(roleOrAgent);
  if (!role) return false;

  const normalizedStatus = String(task?.status || '').trim().toLowerCase();
  if (normalizedStatus === 'in_review') {
    return false;
  }

  if (!isImplementationHeavyPrimaryTask(task, options)) {
    return false;
  }

  if (isGameFactoryImplementationTask(task, options)) {
    return role !== 'dev';
  }

  if (role === 'pm' || role === 'sm') {
    return true;
  }

  if (
    role === 'architect' &&
    !hasArchitectureSpecificSignals(task, options)
  ) {
    return true;
  }

  return false;
}

function shouldRebalanceAssignedImplementationTask(roleOrAgent, task, options = {}) {
  const normalizedStatus = String(task?.status || '').trim().toLowerCase();
  if (normalizedStatus !== 'in_progress') {
    return false;
  }

  if (!task?.assignee) {
    return false;
  }

  return shouldBlockAgentOnImplementationDispatch(roleOrAgent, task, options);
}

module.exports = {
  buildPrimaryTaskRoleFitText,
  isImplementationHeavyPrimaryTask,
  isGameFactoryImplementationTask,
  normalizeTaskText,
  shouldBlockAgentOnImplementationDispatch,
  shouldRebalanceAssignedImplementationTask,
};
