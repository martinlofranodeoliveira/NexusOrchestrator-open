const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  buildTaskContractPromptSection,
  ensureTaskContractFiles,
  resolveTaskContractId,
} = require('../services/taskContract');

test('resolveTaskContractId prefers task ids and falls back to a normalized title', () => {
  assert.equal(resolveTaskContractId({ taskId: 'GH-42' }), 'gh-42');
  assert.equal(
    resolveTaskContractId({ title: 'Landing Page Publica' }),
    'task-landing-page-publica',
  );
});

test('ensureTaskContractFiles creates and mirrors the contract bundle for a task', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-task-contract-'));
  const projectDir = path.join(tempRoot, 'project');
  const workspaceDir = path.join(tempRoot, 'workspace');

  try {
    fs.mkdirSync(projectDir, { recursive: true });
    fs.mkdirSync(workspaceDir, { recursive: true });

    const taskPacket = {
      taskId: 'GH-42',
      title: 'GTMNY-042 Landing page publica',
      requestKind: 'primary',
      boardStatus: 'ready',
      objective: 'Entregar a landing page publica com CTA e hero.',
      scope: 'Implementar a landing no app web atual.',
      approvedScope: ['Hero principal', 'CTA principal', 'Cards de beneficios'],
      acceptanceCriteria: ['Landing renderiza sem erro', 'CTA principal navegavel'],
      acceptanceTests: ['Executar make check', 'Validar render da landing'],
      executionRules: ['Nao criar rotas fora do escopo'],
      branchPolicy: 'Editar apenas a branch da task.',
      commitPolicy: 'Integrar mudancas materiais.',
      reportingContract: 'Concluir apenas com evidencia real.',
      escalationPolicy: 'Escalar so em bloqueio real.',
    };

    const contract = ensureTaskContractFiles({
      projectDir,
      workspaceDir,
      taskPacket,
      verificationCommands: ['make check', 'npm run build'],
      progress: {
        phase: 'agreed',
        detail: 'Contrato criado antes da implementacao.',
        boardStatus: 'ready',
        laneState: 'queued',
        agentId: 'dev',
        agentRole: 'dev',
      },
    });

    assert.equal(contract.contractId, 'gh-42');

    const projectSpecPath = path.join(projectDir, '.nexus', 'contracts', 'gh-42', 'spec.md');
    const workspaceSpecPath = path.join(workspaceDir, '.nexus', 'contracts', 'gh-42', 'spec.md');
    const verificationPath = path.join(projectDir, '.nexus', 'contracts', 'gh-42', 'verification-contract.md');
    const progressPath = path.join(projectDir, '.nexus', 'contracts', 'gh-42', 'progress.md');

    assert.equal(fs.existsSync(projectSpecPath), true);
    assert.equal(fs.existsSync(workspaceSpecPath), true);
    assert.match(fs.readFileSync(projectSpecPath, 'utf8'), /Task ID: GH-42/);
    assert.match(fs.readFileSync(verificationPath, 'utf8'), /make check/);
    assert.match(fs.readFileSync(progressPath, 'utf8'), /Fase atual: agreed/);

    const promptSection = buildTaskContractPromptSection(contract);
    assert.match(promptSection, /\.nexus\/contracts\/gh-42\/spec\.md/);
    assert.match(promptSection, /Esses arquivos sao gerados pelo Nexus harness/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});

test('ensureTaskContractFiles deduplicates repeated progress transitions and persists the latest phase', () => {
  const tempRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'nexus-task-contract-progress-'));
  const projectDir = path.join(tempRoot, 'project');

  try {
    fs.mkdirSync(projectDir, { recursive: true });
    const taskPacket = {
      taskId: 'GH-7',
      title: 'GTMNY-007 Configuracao base por ambiente',
      objective: 'Padronizar configuracao local, staging e prod.',
      acceptanceCriteria: ['Contrato de ambiente documentado'],
      acceptanceTests: ['Executar make check'],
    };

    ensureTaskContractFiles({
      projectDir,
      taskPacket,
      verificationCommands: ['make check'],
      progress: {
        phase: 'agreed',
        detail: 'Contrato aceito pelo harness.',
        boardStatus: 'ready',
        laneState: 'queued',
        agentId: 'pm',
        agentRole: 'pm',
      },
    });

    ensureTaskContractFiles({
      projectDir,
      taskPacket,
      verificationCommands: ['make check'],
      progress: {
        phase: 'implementing',
        detail: 'Implementacao iniciada.',
        boardStatus: 'in_progress',
        laneState: 'running',
        agentId: 'dev',
        agentRole: 'dev',
      },
    });

    ensureTaskContractFiles({
      projectDir,
      taskPacket,
      verificationCommands: ['make check'],
      progress: {
        phase: 'implementing',
        detail: 'Implementacao iniciada.',
        boardStatus: 'in_progress',
        laneState: 'running',
        agentId: 'dev',
        agentRole: 'dev',
      },
    });

    ensureTaskContractFiles({
      projectDir,
      taskPacket,
      verificationCommands: ['make check'],
      progress: {
        phase: 'verified',
        detail: 'Review aprovado com evidencia real.',
        boardStatus: 'done',
        laneState: 'completed',
        agentId: 'qa',
        agentRole: 'qa',
      },
    });

    const metadataPath = path.join(projectDir, '.nexus', 'contracts', 'gh-7', 'metadata.json');
    const progressPath = path.join(projectDir, '.nexus', 'contracts', 'gh-7', 'progress.md');
    const metadata = JSON.parse(fs.readFileSync(metadataPath, 'utf8'));
    const progress = fs.readFileSync(progressPath, 'utf8');

    assert.equal(metadata.currentPhase, 'verified');
    assert.equal(metadata.history.length, 3);
    assert.match(progress, /Fase atual: verified/);
    assert.match(progress, /Review aprovado com evidencia real/);
  } finally {
    fs.rmSync(tempRoot, { recursive: true, force: true });
  }
});
