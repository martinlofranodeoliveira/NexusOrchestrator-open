const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPrimaryTaskRoleFitText,
  isGameFactoryImplementationTask,
  isImplementationHeavyPrimaryTask,
  shouldBlockAgentOnImplementationDispatch,
  shouldRebalanceAssignedImplementationTask,
} = require('../services/taskRoleFit');

test('buildPrimaryTaskRoleFitText normalizes task metadata into searchable text', () => {
  const text = buildPrimaryTaskRoleFitText({
    id: 'GH-10',
    title: 'Feed de descoberta em Flutter com swipe e cards de perfil',
    suggestedSquad: 'mobile + product',
    approvedScope: ['cards de perfil', 'gestos de swipe'],
    acceptanceCriteria: ['fluxo de swipe esta funcional'],
  });

  assert.match(text, /flutter/);
  assert.match(text, /mobile product/);
  assert.match(text, /cards de perfil/);
});

test('isImplementationHeavyPrimaryTask flags mobile implementation cards', () => {
  const task = {
    id: 'GH-10',
    title: 'Feed de descoberta em Flutter com swipe e cards de perfil',
    objective: 'Construir a tela principal do app mobile com feed, swipe e cards.',
    suggestedSquad: 'mobile + product',
    approvedScope: ['cards de perfil', 'gestos de swipe', 'consumo do endpoint de discovery'],
  };

  assert.equal(isImplementationHeavyPrimaryTask(task), true);
});

test('isImplementationHeavyPrimaryTask ignores product-only planning cards', () => {
  const task = {
    id: 'GH-200',
    title: 'Refinar PRD e copy do onboarding',
    objective: 'Documentar fluxo, regras de negocio e criterios de aceite do MVP.',
    suggestedSquad: 'product',
    approvedScope: ['prd', 'copy', 'criterios de aceite'],
  };

  assert.equal(isImplementationHeavyPrimaryTask(task), false);
});

test('shouldBlockAgentOnImplementationDispatch blocks pm, sm and architect on mobile-heavy cards', () => {
  const task = {
    id: 'GH-10',
    title: 'Feed de descoberta em Flutter com swipe e cards de perfil',
    status: 'ready',
    suggestedSquad: 'mobile + product',
    approvedScope: ['cards de perfil', 'gestos de swipe', 'consumo do endpoint de discovery'],
  };

  assert.equal(shouldBlockAgentOnImplementationDispatch({ role: 'pm' }, task), true);
  assert.equal(shouldBlockAgentOnImplementationDispatch({ role: 'sm' }, task), true);
  assert.equal(shouldBlockAgentOnImplementationDispatch({ role: 'dev' }, task), false);
  assert.equal(shouldBlockAgentOnImplementationDispatch({ role: 'architect' }, task), true);
});

test('shouldBlockAgentOnImplementationDispatch keeps architect available on backend architecture cards', () => {
  const task = {
    id: 'GH-4',
    title: 'Modelagem inicial de dados e migrations do MVP',
    status: 'ready',
    suggestedSquad: 'backend + data',
    approvedScope: ['schema inicial', 'orm', 'alembic', 'postgres'],
  };

  assert.equal(shouldBlockAgentOnImplementationDispatch({ role: 'architect' }, task), false);
});

test('shouldBlockAgentOnImplementationDispatch blocks architect on backend feature delivery cards', () => {
  const task = {
    id: 'GH-16',
    title: 'Chat realtime com historico persistido',
    status: 'ready',
    objective: 'Implementar a base do chat com persistencia de historico e caminho para realtime usando Supabase.',
    suggestedSquad: 'backend + data',
    approvedScope: ['modelo de mensagens e conversas', 'api de historico', 'integracao realtime por adapter'],
  };

  assert.equal(shouldBlockAgentOnImplementationDispatch({ role: 'architect' }, task), true);
  assert.equal(shouldBlockAgentOnImplementationDispatch({ role: 'dev' }, task), false);
});

test('game factory cards are implementation-heavy and reserved for dev primary lanes', () => {
  const task = {
    id: 'NX-TASK-0001',
    backlogRef: 'GAME-0001',
    title: 'Create playable HTML5 game: one-thumb timing arcade in neon circuit kitchen',
    status: 'ready',
    phase: 'autonomous-game-factory',
    suggestedSquad: 'primary dev + qa review',
    approvedScope: ['Add games/example/index.html', 'Update games/index.json catalog'],
  };

  assert.equal(isGameFactoryImplementationTask(task), true);
  assert.equal(isImplementationHeavyPrimaryTask(task), true);
  assert.equal(shouldBlockAgentOnImplementationDispatch({ role: 'qa' }, task), true);
  assert.equal(shouldBlockAgentOnImplementationDispatch({ role: 'architect' }, task), true);
  assert.equal(shouldBlockAgentOnImplementationDispatch({ role: 'dev' }, task), false);
  assert.equal(
    shouldBlockAgentOnImplementationDispatch({ role: 'qa' }, { ...task, status: 'in_review' }),
    false,
  );
});

test('shouldRebalanceAssignedImplementationTask only rebalances active implementation cards', () => {
  const activeTask = {
    id: 'GH-10',
    title: 'Feed de descoberta em Flutter com swipe e cards de perfil',
    status: 'in_progress',
    assignee: 'pm',
    suggestedSquad: 'mobile + product',
    approvedScope: ['cards de perfil', 'gestos de swipe', 'consumo do endpoint de discovery'],
  };
  const reviewTask = {
    ...activeTask,
    status: 'in_review',
  };

  assert.equal(shouldRebalanceAssignedImplementationTask({ role: 'pm' }, activeTask), true);
  assert.equal(shouldRebalanceAssignedImplementationTask({ role: 'pm' }, reviewTask), false);
  assert.equal(
    shouldRebalanceAssignedImplementationTask({ role: 'dev' }, activeTask),
    false,
  );
});
