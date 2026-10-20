const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildGitHubTaskBody,
  mapIssueToTask,
  mergeManagedLabels,
  parseIssueExecutionContext,
  resolveGitHubProjectOwner,
  resolveProjectStatusOptionName,
  resolveGitHubProjectStatusFieldNames,
} = require('../services/githubService');

test('resolveGitHubProjectOwner falls back to GITHUB_OWNER when explicit project owner is absent', () => {
  assert.equal(
    resolveGitHubProjectOwner({
      GITHUB_OWNER: 'fcollasso',
      GITHUB_PROJECT_OWNER: '',
    }),
    'fcollasso',
  );
});

test('resolveGitHubProjectOwner prefers GITHUB_PROJECT_OWNER when provided', () => {
  assert.equal(
    resolveGitHubProjectOwner({
      GITHUB_OWNER: 'fcollasso',
      GITHUB_PROJECT_OWNER: 'jhade-account',
    }),
    'jhade-account',
  );
});

test('resolveGitHubProjectOwner trims whitespace from the explicit project owner', () => {
  assert.equal(
    resolveGitHubProjectOwner({
      GITHUB_OWNER: 'fcollasso',
      GITHUB_PROJECT_OWNER: '  jhade-account  ',
    }),
    'jhade-account',
  );
});

test('resolveGitHubProjectStatusFieldNames uses Nexus Status and Status by default', () => {
  assert.deepEqual(resolveGitHubProjectStatusFieldNames({}), ['Nexus Status', 'Status']);
});

test('resolveGitHubProjectStatusFieldNames trims, preserves order and removes duplicates', () => {
  assert.deepEqual(
    resolveGitHubProjectStatusFieldNames({
      NEXUS_GITHUB_PROJECT_STATUS_FIELDS: '  Nexus Status , Status, nexus status,  , Status ',
    }),
    ['Nexus Status', 'Status'],
  );
});

test('resolveGitHubProjectStatusFieldNames accepts a single explicit field', () => {
  assert.deepEqual(
    resolveGitHubProjectStatusFieldNames({
      NEXUS_GITHUB_PROJECT_STATUS_FIELDS: 'Nexus Status',
    }),
    ['Nexus Status'],
  );
});

test('mapIssueToTask prefers canonical managed labels for status, assignee and ownership', () => {
  const task = mapIssueToTask({
    number: 42,
    title: 'NX-HELP-001A GTMNY-001 Implementar onboarding',
    state: 'open',
    labels: [
      { name: 'status: in_progress' },
      { name: 'agent: dev' },
      { name: 'owner: fcollasso' },
      { name: 'instance: marcelonsi-desktop' },
      { name: 'priority: p1' },
    ],
    assignees: [{ login: 'human-assignee' }],
    node_id: 'ISSUE_NODE_42',
    html_url: 'https://github.test/issues/42',
  });

  assert.equal(task.status, 'in_progress');
  assert.equal(task.assignee, 'dev');
  assert.equal(task.ownerId, 'fcollasso');
  assert.equal(task.ownerInstanceId, 'marcelonsi-desktop');
  assert.equal(task.priority, 'p1');
  assert.equal(task.kind, 'github_collaboration');
  assert.equal(task.collaborationKey, 'NX-HELP-001A');
  assert.equal(task.parentTaskRef, 'GTMNY-001');
  assert.equal(task.summary, 'Implementar onboarding');
});

test('mapIssueToTask ignores owner and instance labels when canonical status is present', () => {
  const task = mapIssueToTask({
    number: 43,
    title: 'Revisar entrega',
    state: 'open',
    labels: [
      { name: 'status: in_review' },
      { name: 'owner: ready-squad' },
      { name: 'instance: review-runner' },
    ],
    assignees: [],
    node_id: 'ISSUE_NODE_43',
    html_url: 'https://github.test/issues/43',
  });

  assert.equal(task.status, 'in_review');
});

test('mapIssueToTask preserves legacy fuzzy status detection when canonical status label is absent', () => {
  const task = mapIssueToTask({
    number: 44,
    title: 'Legacy card',
    state: 'open',
    labels: [{ name: 'In Review' }],
    assignees: [{ login: 'qa' }],
    node_id: 'ISSUE_NODE_44',
    html_url: 'https://github.test/issues/44',
  });

  assert.equal(task.status, 'in_review');
  assert.equal(task.assignee, null);
});

test('mapIssueToTask clears stale execution ownership on ready cards', () => {
  const task = mapIssueToTask({
    number: 45,
    title: 'Ready card',
    state: 'open',
    labels: [
      { name: 'status: ready' },
      { name: 'agent: marcelonsi' },
      { name: 'owner: martinlofranodeoliveira' },
      { name: 'instance: marcelonsi' },
    ],
    assignees: [{ login: 'marcelonsi' }],
    node_id: 'ISSUE_NODE_45',
    html_url: 'https://github.test/issues/45',
  });

  assert.equal(task.status, 'ready');
  assert.equal(task.assignee, null);
  assert.equal(task.ownerId, null);
  assert.equal(task.ownerInstanceId, null);
});

test('mapIssueToTask recognizes pendente admin labels and keeps the card unassigned', () => {
  const task = mapIssueToTask({
    number: 46,
    title: 'Aguardando credencial externa',
    state: 'open',
    labels: [
      { name: 'status: pendente_admin' },
      { name: 'agent: dev' },
      { name: 'owner: martinlofranodeoliveira' },
      { name: 'instance: nexus-local' },
    ],
    assignees: [{ login: 'dev' }],
    node_id: 'ISSUE_NODE_46',
    html_url: 'https://github.test/issues/46',
  });

  assert.equal(task.status, 'pendente_admin');
  assert.equal(task.assignee, null);
  assert.equal(task.ownerId, null);
  assert.equal(task.ownerInstanceId, null);
});

test('mergeManagedLabels canonicalizes legacy pending admin status labels', () => {
  assert.deepEqual(
    mergeManagedLabels(['bug'], {
      status: 'pendente_super_admin',
      assigneeId: null,
      ownerId: null,
      ownerInstanceId: null,
    }),
    ['bug', 'status: pendente_admin'],
  );
});

test('resolveProjectStatusOptionName prefers the new pending admin column when available', () => {
  const optionName = resolveProjectStatusOptionName(
    {
      name: 'Nexus Status',
      options: [
        { id: '1', name: 'Backlog' },
        { id: '2', name: 'Pendente ADMIN' },
        { id: '3', name: 'Done' },
      ],
    },
    'pendente_admin',
  );

  assert.equal(optionName, 'Pendente ADMIN');
});

test('resolveProjectStatusOptionName prefers pending admin over Todo on generic status fields', () => {
  const optionName = resolveProjectStatusOptionName(
    {
      name: 'Status',
      options: [
        { id: '1', name: 'Todo' },
        { id: '2', name: 'In Progress' },
        { id: '3', name: 'Pendente ADMIN' },
      ],
    },
    'pendente_admin',
  );

  assert.equal(optionName, 'Pendente ADMIN');
});

test('resolveProjectStatusOptionName does not collapse pending admin into Todo when no admin column exists', () => {
  const optionName = resolveProjectStatusOptionName(
    {
      name: 'Status',
      options: [
        { id: '1', name: 'Todo' },
        { id: '2', name: 'In Progress' },
      ],
    },
    'pendente_admin',
  );

  assert.equal(optionName, null);
});

test('mapIssueToTask lets project status override stale managed labels', () => {
  const task = mapIssueToTask(
    {
      number: 51,
      title: 'Aguardando acesso externo',
      state: 'open',
      labels: [
        { name: 'status: backlog' },
        { name: 'agent: dev2' },
      ],
      assignees: [{ login: 'dev2' }],
      node_id: 'ISSUE_NODE_51',
      html_url: 'https://github.test/issues/51',
    },
    'pendente_admin',
  );

  assert.equal(task.status, 'pendente_admin');
  assert.equal(task.assignee, null);
  assert.equal(task.ownerId, null);
  assert.equal(task.ownerInstanceId, null);
});

test('mapIssueToTask keeps canonical managed status over stale project statuses except pending admin', () => {
  const task = mapIssueToTask(
    {
      number: 52,
      title: 'Implementacao em andamento',
      state: 'open',
      labels: [
        { name: 'status: in_progress' },
        { name: 'agent: dev2' },
        { name: 'owner: martinlofranodeoliveira' },
        { name: 'instance: nexus-local' },
      ],
      assignees: [{ login: 'dev2' }],
      node_id: 'ISSUE_NODE_52',
      html_url: 'https://github.test/issues/52',
    },
    'done',
  );

  assert.equal(task.status, 'in_progress');
  assert.equal(task.assignee, 'dev2');
  assert.equal(task.ownerId, 'martinlofranodeoliveira');
  assert.equal(task.ownerInstanceId, 'nexus-local');
});

test('mapIssueToTask tags GitHub-backed collaboration issues and captures the parent task reference', () => {
  const task = mapIssueToTask({
    number: 27,
    title: 'NX-HELP-001A GTMNY-001 Documentar convencoes e validar bootstrap do workspace',
    body: 'Subissue do card GTMNY-001 para outro agente executar.',
    state: 'open',
    labels: [{ name: 'status: backlog' }],
    assignees: [],
    node_id: 'ISSUE_NODE_27',
    html_url: 'https://github.test/issues/27',
  });

  assert.equal(task.kind, 'github_collaboration');
  assert.equal(task.collaborationKey, 'NX-HELP-001A');
  assert.equal(task.parentTaskRef, 'GTMNY-001');
});

test('buildGitHubTaskBody generates a structured issue body that round-trips through the parser', () => {
  const body = buildGitHubTaskBody({
    backlogRef: 'GTMNY-035',
    objective: 'Fechar signup real e onboarding autenticado.',
    status: 'backlog',
    priority: 'p0',
    phase: 'Fase 1 - Fundacao e Infraestrutura',
    suggestedSquad: 'backend + mobile',
    approvedScope: [
      'integrar signup por email e senha com Supabase Auth',
      'ligar reset de senha e verificacao de email na shell live',
    ],
    acceptanceCriteria: [
      'signup cria sessao valida e segue para perfil',
      'reset de senha e verificacao de email ficam documentados e testados',
    ],
    dependencies: [],
    externalAccessGaps: ['Apple Sign In e Google OAuth dependem de credenciais finais'],
    outOfScope: ['visual final de Figma'],
    executionRules: ['manter o prototipo atual enquanto o foco for funcional'],
  });

  assert.match(body, /## Backlog ID/);
  assert.match(body, /## Priority/);
  assert.match(body, /## Acceptance Criteria/);
  assert.match(body, /## Agent Execution Rules/);

  const context = parseIssueExecutionContext(body);
  assert.equal(context.backlogRef, 'GTMNY-035');
  assert.equal(context.objective, 'Fechar signup real e onboarding autenticado.');
  assert.equal(context.initialStatus, 'backlog');
  assert.equal(context.priority, 'p0');
  assert.equal(context.phase, 'Fase 1 - Fundacao e Infraestrutura');
  assert.equal(context.suggestedSquad, 'backend + mobile');
  assert.deepEqual(context.approvedScope, [
    'integrar signup por email e senha com Supabase Auth',
    'ligar reset de senha e verificacao de email na shell live',
  ]);
  assert.deepEqual(context.acceptanceCriteria, [
    'signup cria sessao valida e segue para perfil',
    'reset de senha e verificacao de email ficam documentados e testados',
  ]);
  assert.deepEqual(context.dependencies, []);
  assert.deepEqual(context.externalAccessGaps, [
    'Apple Sign In e Google OAuth dependem de credenciais finais',
  ]);
  assert.deepEqual(context.outOfScope, ['visual final de Figma']);
  assert.deepEqual(context.executionRules, ['manter o prototipo atual enquanto o foco for funcional']);
});

test('parseIssueExecutionContext extracts structured backlog sections from the issue body', () => {
  const context = parseIssueExecutionContext(`
## Backlog ID
GTMNY-001

## Objective
Criar a fundacao tecnica do repositorio.

## Priority
P1

## Phase
Fase 1 - Fundacao e Infraestrutura

## Suggested Squad
architecture + devops

## Approved Scope
- definir estrutura base de apps, services e packages
- padronizar scripts raiz

## Acceptance Criteria
- estrutura raiz coerente com Flutter + FastAPI
- convencoes documentadas no repositorio

## Dependencies
- none

## Known External Access Gaps
- credencial do Firebase ainda pendente

## Explicitly Out of Scope For This Issue
- implementar features de produto

## Agent Execution Rules
- read README.md and docs/PROJECT_SCOPE.md before implementation
- do not invent features
`);

  assert.equal(context.backlogRef, 'GTMNY-001');
  assert.equal(context.objective, 'Criar a fundacao tecnica do repositorio.');
  assert.equal(context.priority, 'p1');
  assert.equal(context.phase, 'Fase 1 - Fundacao e Infraestrutura');
  assert.equal(context.suggestedSquad, 'architecture + devops');
  assert.deepEqual(context.approvedScope, [
    'definir estrutura base de apps, services e packages',
    'padronizar scripts raiz',
  ]);
  assert.deepEqual(context.acceptanceCriteria, [
    'estrutura raiz coerente com Flutter + FastAPI',
    'convencoes documentadas no repositorio',
  ]);
  assert.deepEqual(context.dependencies, []);
  assert.deepEqual(context.externalAccessGaps, ['credencial do Firebase ainda pendente']);
  assert.deepEqual(context.outOfScope, ['implementar features de produto']);
  assert.deepEqual(context.executionRules, [
    'read README.md and docs/PROJECT_SCOPE.md before implementation',
    'do not invent features',
  ]);
});

test('mapIssueToTask preserves parsed backlog context for primary issues', () => {
  const task = mapIssueToTask({
    number: 1,
    title: 'GTMNY-001 Bootstrap do monorepo e convencoes do workspace',
    body: `
## Backlog ID
GTMNY-001

## Objective
Criar a fundacao tecnica do repositorio com estrutura de diretorios e scripts raiz.

## Priority
P0

## Phase
Fase 1 - Fundacao e Infraestrutura

## Suggested Squad
architecture + devops

## Approved Scope
- definir estrutura base de apps, services, packages, infra, docs, ops e scripts

## Acceptance Criteria
- estrutura raiz do monorepo definida e coerente com Flutter + FastAPI

## Dependencies
- none

## Known External Access Gaps
- none at this stage

## Explicitly Out of Scope For This Issue
- implementar features de produto

## Agent Execution Rules
- read README.md and docs/PROJECT_SCOPE.md before implementation
`,
    state: 'open',
    labels: [{ name: 'status: ready' }],
    assignees: [],
    node_id: 'ISSUE_NODE_1',
    html_url: 'https://github.test/issues/1',
  });

  assert.equal(task.backlogRef, 'GTMNY-001');
  assert.equal(
    task.objective,
    'Criar a fundacao tecnica do repositorio com estrutura de diretorios e scripts raiz.',
  );
  assert.equal(task.priority, 'p0');
  assert.equal(task.phase, 'Fase 1 - Fundacao e Infraestrutura');
  assert.equal(task.suggestedSquad, 'architecture + devops');
  assert.deepEqual(task.approvedScope, [
    'definir estrutura base de apps, services, packages, infra, docs, ops e scripts',
  ]);
  assert.deepEqual(task.acceptanceCriteria, [
    'estrutura raiz do monorepo definida e coerente com Flutter + FastAPI',
  ]);
  assert.deepEqual(task.outOfScope, ['implementar features de produto']);
  assert.deepEqual(task.executionRules, [
    'read README.md and docs/PROJECT_SCOPE.md before implementation',
  ]);
});

test('mergeManagedLabels replaces stale managed labels and preserves unrelated labels', () => {
  assert.deepEqual(
    mergeManagedLabels(
      ['priority: p1', 'status: ready', 'agent: qa', 'owner: old-owner', 'instance: old-instance'],
      {
        status: 'in_progress',
        priority: 'p0',
        assigneeId: 'dev',
        ownerId: 'fcollasso',
        ownerInstanceId: 'fcollasso',
      },
    ),
    ['status: in_progress', 'priority: p0', 'agent: dev', 'owner: fcollasso', 'instance: fcollasso'],
  );
});
