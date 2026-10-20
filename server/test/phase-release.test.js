const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildPhaseKey,
  buildPhaseReleaseBody,
  buildPhaseReleaseTag,
  extractPhaseNumber,
  parsePhaseBranchMap,
  parsePhaseTaskBaseBranchMap,
  resolvePhaseBranchName,
  resolvePhaseTaskBaseBranchName,
} = require('../services/phaseRelease');

test('extractPhaseNumber parses fase labels with ordinal number', () => {
  assert.equal(extractPhaseNumber('Fase 2 - Descoberta e Interacoes'), 2);
});

test('parsePhaseBranchMap accepts shorthand numeric mappings', () => {
  const map = parsePhaseBranchMap({
    NEXUS_PHASE_BRANCH_MAP: '1=etapa-1,2=etapa-2,3=etapa-3,4=etapa-4',
  });

  assert.equal(map.get('1'), 'etapa-1');
  assert.equal(map.get('etapa-4'), 'etapa-4');
});

test('parsePhaseTaskBaseBranchMap accepts shorthand numeric mappings', () => {
  const map = parsePhaseTaskBaseBranchMap({
    NEXUS_PHASE_TASK_BASE_BRANCH_MAP: '1=martin,2=martin,3=martin,4=martin',
  });

  assert.equal(map.get('1'), 'martin');
  assert.equal(map.get('etapa-4'), 'martin');
});

test('resolvePhaseBranchName prefers configured map and falls back to etapa-N', () => {
  assert.equal(
    resolvePhaseBranchName('Fase 1 - Fundacao e Infraestrutura', {
      NEXUS_PHASE_BRANCH_MAP: '1=release/fase-1',
    }),
    'release/fase-1',
  );
  assert.equal(resolvePhaseBranchName('Stage 3 - Chat e Moderacao', {}), 'etapa-3');
});

test('resolvePhaseTaskBaseBranchName keeps task execution base separate from release branch', () => {
  const env = {
    NEXUS_PHASE_BRANCH_MAP: '1=etapa-1,2=etapa-2',
    NEXUS_PHASE_TASK_BASE_BRANCH_MAP: '1=martin,2=martin',
  };

  assert.equal(resolvePhaseBranchName('Fase 1 - Fundacao e Infraestrutura', env), 'etapa-1');
  assert.equal(resolvePhaseTaskBaseBranchName('Fase 1 - Fundacao e Infraestrutura', env), 'martin');
  assert.equal(resolvePhaseTaskBaseBranchName('Stage 3 - Chat e Moderacao', env), null);
});

test('buildPhaseKey reuses the release branch when available', () => {
  assert.equal(
    buildPhaseKey('Fase 2 - Descoberta', {
      NEXUS_PHASE_BRANCH_MAP: '2=etapa-2',
    }),
    'etapa-2',
  );
});

test('buildPhaseReleaseTag is deterministic for branch and target sha', () => {
  assert.equal(
    buildPhaseReleaseTag('etapa-1', 'abcdef1234567890'),
    'release-etapa-1-abcdef123456',
  );
});

test('buildPhaseReleaseBody lists included cards', () => {
  const body = buildPhaseReleaseBody({
    phase: 'Fase 1 - Fundacao e Infraestrutura',
    branchName: 'etapa-1',
    tasks: [
      { id: 'GH-2', title: 'GTMNY-002 App Flutter base' },
      { id: 'GH-1', title: 'GTMNY-001 Bootstrap do monorepo' },
    ],
  });

  assert.match(body, /Etapa: Fase 1 - Fundacao e Infraestrutura/);
  assert.match(body, /Branch de release: etapa-1/);
  assert.match(body, /- \[x\] GH-1 GTMNY-001 Bootstrap do monorepo/);
  assert.match(body, /- \[x\] GH-2 GTMNY-002 App Flutter base/);
});
