const fs = require('fs');
const path = require('path');

const CONTRACT_HISTORY_LIMIT = 30;
const PROGRESS_PHASES = new Set([
  'agreed',
  'implementing',
  'in_review',
  'verified',
  'rejected',
]);

function normalizeString(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeStringList(values = []) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((entry) => normalizeString(entry))
      .filter(Boolean),
  )];
}

function slugify(value) {
  const normalized = String(value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return normalized || 'task';
}

function truncateText(value, maxLength = 260) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trim()}...`;
}

function summarizeItems(items = [], limit = 3) {
  const normalized = normalizeStringList(items).slice(0, limit);
  if (normalized.length <= 0) return null;
  return normalized.join('; ');
}

function normalizeProgressPhase(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return PROGRESS_PHASES.has(normalized) ? normalized : null;
}

function resolveTaskContractId(taskPacket = {}) {
  const explicitTaskId = normalizeString(taskPacket.taskId) || normalizeString(taskPacket.backlogRef);
  if (explicitTaskId) {
    return slugify(explicitTaskId).slice(0, 80);
  }

  const title = normalizeString(taskPacket.title) || normalizeString(taskPacket.objective);
  if (!title) return null;
  return `task-${slugify(title).slice(0, 72)}`;
}

function buildRelativeContractFiles(contractId) {
  const relativeDir = path.posix.join('.nexus', 'contracts', contractId);
  return {
    relativeDir,
    files: {
      spec: path.posix.join(relativeDir, 'spec.md'),
      plan: path.posix.join(relativeDir, 'task-plan.md'),
      verification: path.posix.join(relativeDir, 'verification-contract.md'),
      progress: path.posix.join(relativeDir, 'progress.md'),
      metadata: path.posix.join(relativeDir, 'metadata.json'),
    },
  };
}

function ensureDirectory(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeFileIfChanged(filePath, content) {
  const nextContent = String(content || '');
  let currentContent = null;
  try {
    currentContent = fs.readFileSync(filePath, 'utf8');
  } catch (_error) {
    currentContent = null;
  }

  if (currentContent === nextContent) {
    return false;
  }

  ensureDirectory(path.dirname(filePath));
  fs.writeFileSync(filePath, nextContent, 'utf8');
  return true;
}

function readJsonIfExists(filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function formatMarkdownList(title, items = [], fallback = '- Nenhum item declarado.') {
  const normalized = normalizeStringList(items);
  return [
    `## ${title}`,
    normalized.length > 0
      ? normalized.map((item) => `- ${item}`).join('\n')
      : fallback,
  ].join('\n');
}

function buildTaskSnapshot(taskPacket = {}, verificationCommands = []) {
  return {
    taskId: normalizeString(taskPacket.taskId),
    title: normalizeString(taskPacket.title),
    requestKind: normalizeString(taskPacket.requestKind) || 'primary',
    boardStatus: normalizeString(taskPacket.boardStatus),
    agentRole: normalizeString(taskPacket.agentRole),
    backlogRef: normalizeString(taskPacket.backlogRef),
    summary: normalizeString(taskPacket.summary),
    objective: normalizeString(taskPacket.objective),
    scope: normalizeString(taskPacket.scope),
    parentTaskId: normalizeString(taskPacket.parentTaskId),
    parentTaskRef: normalizeString(taskPacket.parentTaskRef),
    parentTaskTitle: normalizeString(taskPacket.parentTaskTitle),
    parentObjective: normalizeString(taskPacket.parentObjective),
    phase: normalizeString(taskPacket.phase),
    suggestedSquad: normalizeString(taskPacket.suggestedSquad),
    branchPolicy: normalizeString(taskPacket.branchPolicy),
    commitPolicy: normalizeString(taskPacket.commitPolicy),
    reportingContract: normalizeString(taskPacket.reportingContract),
    escalationPolicy: normalizeString(taskPacket.escalationPolicy),
    approvedScope: normalizeStringList(taskPacket.approvedScope),
    acceptanceCriteria: normalizeStringList(taskPacket.acceptanceCriteria),
    acceptanceTests: normalizeStringList(taskPacket.acceptanceTests),
    dependencies: normalizeStringList(taskPacket.dependencies),
    externalAccessGaps: normalizeStringList(taskPacket.externalAccessGaps),
    outOfScope: normalizeStringList(taskPacket.outOfScope),
    executionRules: normalizeStringList(taskPacket.executionRules),
    runtimeTargets: normalizeStringList(taskPacket.runtimeTargets),
    verificationCommands: normalizeStringList(verificationCommands),
  };
}

function buildSpecContent(snapshot = {}) {
  const header = [
    '# Task Spec',
    '',
    '<!-- Gerado pelo Nexus harness. Use como memoria persistente da task. -->',
    '',
    `- Task ID: ${snapshot.taskId || 'sem-id'}`,
    `- Titulo: ${snapshot.title || 'sem-titulo'}`,
    `- Backlog: ${snapshot.backlogRef || 'nao informado'}`,
    `- Tipo: ${snapshot.requestKind || 'primary'}`,
    `- Status do board na geracao: ${snapshot.boardStatus || 'nao informado'}`,
    `- Fase declarada do backlog: ${snapshot.phase || 'nao informada'}`,
    `- Squad sugerido: ${snapshot.suggestedSquad || 'nao informado'}`,
    snapshot.parentTaskRef ? `- Card pai: ${snapshot.parentTaskRef}` : null,
    snapshot.parentTaskTitle ? `- Titulo do card pai: ${snapshot.parentTaskTitle}` : null,
  ]
    .filter(Boolean)
    .join('\n');

  return [
    header,
    '',
    '## Objetivo',
    snapshot.objective || 'Objetivo nao informado pelo backlog.',
    '',
    '## Resumo operacional',
    snapshot.summary || snapshot.scope || 'Resumo nao informado pelo backlog.',
    '',
    formatMarkdownList('Escopo aprovado', snapshot.approvedScope),
    '',
    formatMarkdownList('Criterios de aceite', snapshot.acceptanceCriteria),
    '',
    formatMarkdownList('Dependencias', snapshot.dependencies),
    '',
    formatMarkdownList('Pendencias externas', snapshot.externalAccessGaps),
    '',
    formatMarkdownList('Fora de escopo', snapshot.outOfScope),
    '',
  ].join('\n');
}

function buildTaskPlanContent(snapshot = {}) {
  return [
    '# Task Plan',
    '',
    '<!-- Gerado pelo Nexus harness. O agente deve ler, nao reescrever. -->',
    '',
    '## Escopo operacional',
    `- Scope summary: ${snapshot.scope || snapshot.summary || snapshot.objective || 'nao informado'}`,
    snapshot.runtimeTargets.length > 0
      ? `- Runtime planejado: ${snapshot.runtimeTargets.join(' -> ')}`
      : '- Runtime planejado: usar o runtime configurado para a lane atual.',
    '',
    '## Guardrails do harness',
    `- Branch policy: ${snapshot.branchPolicy || 'nao informado'}`,
    `- Commit policy: ${snapshot.commitPolicy || 'nao informado'}`,
    `- Reporting contract: ${snapshot.reportingContract || 'nao informado'}`,
    `- Escalation policy: ${snapshot.escalationPolicy || 'nao informado'}`,
    '',
    formatMarkdownList('Checklist final do papel', snapshot.acceptanceTests),
    '',
    formatMarkdownList('Regras de execucao declaradas', snapshot.executionRules),
    '',
    '## Sequencia obrigatoria',
    '- Ler apenas o contexto minimo necessario.',
    '- Executar mudanca material dentro do escopo aprovado.',
    '- Rodar checks do verification contract.',
    '- Corrigir qualquer falha relevante no mesmo ciclo.',
    '- Encerrar a lane apenas com evidencia objetiva.',
    '',
  ].join('\n');
}

function buildVerificationContractContent(snapshot = {}) {
  const verificationChecks = snapshot.verificationCommands.length > 0
    ? snapshot.verificationCommands
    : ['Definir e executar a menor validacao completa usando os checks reais do repositorio.'];

  return [
    '# Verification Contract',
    '',
    '<!-- Gerado pelo Nexus harness. Review usa este contrato como base de evidencia. -->',
    '',
    formatMarkdownList(
      'O que precisa ser provado',
      snapshot.acceptanceCriteria.length > 0 ? snapshot.acceptanceCriteria : snapshot.acceptanceTests,
    ),
    '',
    formatMarkdownList('Checks sugeridos pelo harness', verificationChecks),
    '',
    '## Regras de validacao',
    '- Aprovacao sem pelo menos um check material bem-sucedido e invalida.',
    '- Se houver falha material, registrar a evidencia real e reprovar.',
    '- O reviewer nao reimplementa a feature dentro da lane de review.',
    '- O executor deve usar este contrato para escolher a menor bateria de checks suficiente.',
    '',
  ].join('\n');
}

function createInitialMetadata(snapshot, contractId, relativeDir, recordedAt) {
  return {
    contractId,
    relativeDir,
    createdAt: recordedAt,
    updatedAt: recordedAt,
    currentPhase: 'agreed',
    lastDetail: null,
    lastBoardStatus: snapshot.boardStatus || null,
    lastLaneState: null,
    lastAgentId: null,
    lastAgentRole: snapshot.agentRole || null,
    task: snapshot,
    history: [],
  };
}

function applyProgressUpdate(metadata, progress = {}) {
  const now = new Date().toISOString();
  const phase = normalizeProgressPhase(progress.phase) || metadata.currentPhase || 'agreed';
  const detail = truncateText(progress.detail, 320);
  const boardStatus = normalizeString(progress.boardStatus) || null;
  const laneState = normalizeString(progress.laneState) || null;
  const agentId = normalizeString(progress.agentId) || null;
  const agentRole = normalizeString(progress.agentRole) || null;

  const currentHistory = Array.isArray(metadata.history) ? metadata.history.slice(-CONTRACT_HISTORY_LIMIT) : [];
  const previousEntry = currentHistory[currentHistory.length - 1] || null;
  const duplicated = Boolean(
    previousEntry &&
      previousEntry.phase === phase &&
      previousEntry.detail === detail &&
      previousEntry.boardStatus === boardStatus &&
      previousEntry.laneState === laneState &&
      previousEntry.agentId === agentId &&
      previousEntry.agentRole === agentRole
  );

  const nextHistory = duplicated
    ? currentHistory
    : [...currentHistory, {
        phase,
        detail,
        boardStatus,
        laneState,
        agentId,
        agentRole,
        recordedAt: now,
      }].slice(-CONTRACT_HISTORY_LIMIT);

  return {
    ...metadata,
    updatedAt: now,
    currentPhase: phase,
    lastDetail: detail,
    lastBoardStatus: boardStatus,
    lastLaneState: laneState,
    lastAgentId: agentId,
    lastAgentRole: agentRole,
    history: nextHistory,
  };
}

function buildProgressContent(metadata = {}) {
  const historyLines = Array.isArray(metadata.history) && metadata.history.length > 0
    ? metadata.history
        .map((entry) => [
          `- ${entry.recordedAt} | phase=${entry.phase}`,
          entry.boardStatus ? `board=${entry.boardStatus}` : null,
          entry.laneState ? `lane=${entry.laneState}` : null,
          entry.agentId ? `agent=${entry.agentId}` : null,
          entry.agentRole ? `role=${entry.agentRole}` : null,
          entry.detail ? `detail=${entry.detail}` : null,
        ]
          .filter(Boolean)
          .join(' | '))
        .join('\n')
    : '- Nenhuma transicao registrada ainda.';

  return [
    '# Progress',
    '',
    '<!-- Atualizado pelo Nexus harness. Use apenas como leitura. -->',
    '',
    `- Fase atual: ${metadata.currentPhase || 'agreed'}`,
    `- Ultima atualizacao: ${metadata.updatedAt || metadata.createdAt || 'nao informada'}`,
    `- Board status: ${metadata.lastBoardStatus || 'nao informado'}`,
    `- Lane state: ${metadata.lastLaneState || 'nao informado'}`,
    `- Ultimo agente: ${metadata.lastAgentId || 'nao informado'}`,
    metadata.lastDetail ? `- Ultimo detalhe: ${metadata.lastDetail}` : null,
    '',
    '## Historico',
    historyLines,
    '',
  ]
    .filter(Boolean)
    .join('\n');
}

function collectTargetRoots(projectDir, workspaceDir) {
  return [...new Set(
    [projectDir, workspaceDir]
      .map((entry) => normalizeString(entry))
      .filter(Boolean)
      .map((entry) => path.resolve(entry)),
  )];
}

function buildContractState(relativeInfo, metadata = {}, snapshot = {}, targetRoots = []) {
  return {
    contractId: metadata.contractId || null,
    relativeDir: relativeInfo.relativeDir,
    filesRelative: relativeInfo.files,
    primaryRoot: targetRoots[0] || null,
    mirroredRoots: targetRoots.slice(1),
    currentPhase: metadata.currentPhase || 'agreed',
    objective: snapshot.objective || null,
    approvedScope: snapshot.approvedScope || [],
    acceptanceCriteria: snapshot.acceptanceCriteria || [],
    acceptanceTests: snapshot.acceptanceTests || [],
    verificationCommands: snapshot.verificationCommands || [],
  };
}

function ensureTaskContractFiles(options = {}) {
  const taskPacket = options.taskPacket && typeof options.taskPacket === 'object'
    ? options.taskPacket
    : {};
  const verificationCommands = normalizeStringList(options.verificationCommands);
  const contractId = resolveTaskContractId(taskPacket);
  const targetRoots = collectTargetRoots(options.projectDir, options.workspaceDir);
  if (!contractId || targetRoots.length <= 0) {
    return null;
  }

  const relativeInfo = buildRelativeContractFiles(contractId);
  const snapshot = buildTaskSnapshot(taskPacket, verificationCommands);
  const canonicalRoot = targetRoots[0];
  const metadataPath = path.join(canonicalRoot, relativeInfo.files.metadata);
  let metadata = readJsonIfExists(metadataPath);
  if (!metadata || typeof metadata !== 'object') {
    metadata = createInitialMetadata(snapshot, contractId, relativeInfo.relativeDir, new Date().toISOString());
  }

  metadata = {
    ...metadata,
    contractId,
    relativeDir: relativeInfo.relativeDir,
    task: snapshot,
    lastBoardStatus: normalizeString(metadata.lastBoardStatus) || snapshot.boardStatus || null,
    lastAgentRole: normalizeString(metadata.lastAgentRole) || snapshot.agentRole || null,
    history: Array.isArray(metadata.history) ? metadata.history : [],
  };

  if (options.progress && typeof options.progress === 'object') {
    metadata = applyProgressUpdate(metadata, options.progress);
  } else {
    metadata.updatedAt = metadata.updatedAt || metadata.createdAt || new Date().toISOString();
    metadata.currentPhase = normalizeProgressPhase(metadata.currentPhase) || 'agreed';
  }

  const fileContents = {
    spec: buildSpecContent(snapshot),
    plan: buildTaskPlanContent(snapshot),
    verification: buildVerificationContractContent(snapshot),
    progress: buildProgressContent(metadata),
    metadata: `${JSON.stringify(metadata, null, 2)}\n`,
  };

  targetRoots.forEach((rootPath) => {
    writeFileIfChanged(path.join(rootPath, relativeInfo.files.spec), `${fileContents.spec}\n`);
    writeFileIfChanged(path.join(rootPath, relativeInfo.files.plan), `${fileContents.plan}\n`);
    writeFileIfChanged(path.join(rootPath, relativeInfo.files.verification), `${fileContents.verification}\n`);
    writeFileIfChanged(path.join(rootPath, relativeInfo.files.progress), `${fileContents.progress}\n`);
    writeFileIfChanged(path.join(rootPath, relativeInfo.files.metadata), fileContents.metadata);
  });

  return buildContractState(relativeInfo, metadata, snapshot, targetRoots);
}

function buildTaskContractPromptSection(contractState = null) {
  if (!contractState || !contractState.contractId) {
    return null;
  }

  const scopePreview = summarizeItems(contractState.approvedScope, 3);
  const acceptancePreview = summarizeItems(
    contractState.acceptanceCriteria.length > 0
      ? contractState.acceptanceCriteria
      : contractState.acceptanceTests,
    3,
  );
  const verificationPreview = summarizeItems(contractState.verificationCommands, 2);

  return [
    'Contrato persistente da task:',
    `- ID do contrato: ${contractState.contractId}`,
    `- Fase atual do contrato: ${contractState.currentPhase}`,
    `- Diretorio de leitura: ${contractState.relativeDir}`,
    `- Spec: ${contractState.filesRelative.spec}`,
    `- Plano: ${contractState.filesRelative.plan}`,
    `- Verificacao: ${contractState.filesRelative.verification}`,
    `- Progresso: ${contractState.filesRelative.progress}`,
    contractState.objective ? `- Objetivo contratado: ${contractState.objective}` : null,
    scopePreview ? `- Escopo aprovado: ${scopePreview}` : null,
    acceptancePreview ? `- Prova objetiva: ${acceptancePreview}` : null,
    verificationPreview ? `- Checks esperados: ${verificationPreview}` : null,
    '- Esses arquivos sao gerados pelo Nexus harness. Leia-os como fonte de verdade e nao amplie o escopo.',
  ]
    .filter(Boolean)
    .join('\n');
}

module.exports = {
  buildTaskContractPromptSection,
  ensureTaskContractFiles,
  resolveTaskContractId,
};
