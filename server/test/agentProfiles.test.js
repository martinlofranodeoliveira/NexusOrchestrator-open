const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildDefaultAgentPrompt,
  buildMeetingDirective,
  buildRoleAcceptanceTests,
  buildRoleExecutionPolicy,
  getRoleProfile,
} = require('../services/agentProfiles');

test('unknown roles fall back to the default software engineer profile', () => {
  const profile = getRoleProfile('unknown-role');
  assert.equal(profile.label, 'Software Engineer');
});

test('buildDefaultAgentPrompt includes role baseline, review team discipline and verification gate', () => {
  const prompt = buildDefaultAgentPrompt({
    name: 'Lagrange',
    role: 'qa',
    team: 'review',
  });

  assert.match(prompt, /Voce e Lagrange, atuando como QA Tester no NexusOrchestrator\./);
  assert.match(prompt, /Voce integra o squad de review\./);
  assert.match(prompt, /Nao transforme review em reimplementacao\./);
  assert.match(prompt, /Se ficar bloqueado ou inseguro, reporte o bloqueio concreto; nunca finja certeza\./);
  assert.match(prompt, /casos negativos ou de borda relevantes nao ficaram sem cobertura/);
});

test('buildRoleExecutionPolicy reinforces scoped collaboration and verification-first behavior', () => {
  const policy = buildRoleExecutionPolicy(
    { role: 'dev' },
    { requestKind: 'collaboration', reviewMode: false },
  );

  assert.match(policy, /Politica do papel \(Software Engineer\):/);
  assert.match(policy, /Como esta e uma colaboracao, permaneca no recorte delimitado e devolva algo imediatamente aproveitavel\./);
  assert.match(policy, /Se a abordagem exigir reestruturacao ampla, pare de expandir o escopo e escale com fatos\./);
  assert.match(policy, /Nao faca afirmacoes de conclusao sem verificacao fresca e leitura real dos resultados\./);
});

test('buildRoleAcceptanceTests merges generic gates with role-specific verification checks', () => {
  const checks = buildRoleAcceptanceTests(
    { role: 'devops' },
    { reviewMode: true, requestKind: 'primary' },
  );

  assert.deepEqual(checks.slice(0, 2), [
    'Executar os checks locais relevantes para a mudanca.',
    'Confirmar que a entrega esta pronta para done sem pendencias funcionais ou operacionais.',
  ]);
  assert.ok(checks.includes('build e scripts relevantes executam com previsibilidade'));
  assert.ok(
    checks.includes('Se encontrar falha material, registrar a evidencia e devolver a task para implementacao.'),
  );
});

test('buildRoleExecutionPolicy keeps review lanes evidence-first and non-mutating', () => {
  const policy = buildRoleExecutionPolicy(
    { role: 'qa', team: 'review' },
    { requestKind: 'primary', reviewMode: true },
  );

  assert.match(policy, /Em review, valide a entrega com evidencias e reprove quando houver falha material/);
  assert.match(policy, /nao reimplemente a task nesta lane/);
  assert.match(policy, /pelo menos um check material executado com sucesso/);
});

test('collaboration acceptance tests stay scoped to the delegated subtask', () => {
  const checks = buildRoleAcceptanceTests(
    { role: 'dev' },
    { reviewMode: false, requestKind: 'collaboration' },
  );

  assert.ok(
    !checks.includes('Garantir que houve mudanca material integravel no repositorio principal.'),
  );
  assert.ok(checks.includes('Entregar resultado reaproveitavel para o agente solicitante sem extrapolar o escopo.'));
  assert.ok(checks.includes('Fechar apenas a subtarefa delimitada e explicitar o ponto de integracao ou handoff.'));
});

test('buildMeetingDirective returns role-aligned bullet instructions', () => {
  const directive = buildMeetingDirective({ role: 'architect' });

  assert.match(directive, /^- assuma tarefas de schema, SDK, MCP, integracao, plataforma e riscos estruturais/m);
  assert.match(directive, /^- explicite cedo riscos sistemicos e dependencias cruzadas/m);
});
