const { spawn } = require('child_process');
const path = require('path');

const { defaultModelForProvider } = require('./modelRegistry');
const {
  buildProviderScopedModel,
  buildOpencodeReviewCommand,
  getOpencodeRuntimeStatus,
  parseProviderModel,
  resolveOpencodeExecutionEnv,
} = require('./opencodeRuntime');

const GATE_RESULT_START = 'NEXUS_OPENCODE_GATE_RESULT_START';
const GATE_RESULT_END = 'NEXUS_OPENCODE_GATE_RESULT_END';
const DEFAULT_GATE_TIMEOUT_MS = 5 * 60 * 1000;
const MAX_TEXT_FIELD_LENGTH = 800;
const MAX_FINDINGS = 8;
const MAX_EVIDENCE = 8;
const OPENCODE_GATE_REMOVED_MESSAGE = 'OpenCode review gate foi removido do fluxo do Nexus.';

function normalizeNonEmpty(value) {
  const normalized = String(value || '').trim();
  return normalized || null;
}

function normalizeBoolean(value, defaultValue = false) {
  if (value === undefined || value === null || value === '') return defaultValue;
  const normalized = String(value).trim().toLowerCase();
  if (['1', 'true', 'yes', 'on'].includes(normalized)) return true;
  if (['0', 'false', 'no', 'off'].includes(normalized)) return false;
  return defaultValue;
}

function normalizePositiveInt(value, defaultValue) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (!Number.isFinite(parsed) || parsed <= 0) return defaultValue;
  return parsed;
}

function normalizeGateMode(value, defaultValue = 'required') {
  return String(value || '').trim().toLowerCase() === 'required' ? 'required' : defaultValue;
}

function truncateText(value, maxLength = MAX_TEXT_FIELD_LENGTH) {
  const normalized = String(value || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return null;
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, Math.max(0, maxLength - 3)).trimEnd()}...`;
}

function uniqueStrings(values = [], maxItems = MAX_FINDINGS) {
  return [...new Set(
    (Array.isArray(values) ? values : [])
      .map((entry) => truncateText(entry))
      .filter(Boolean),
  )].slice(0, maxItems);
}

function safeJsonParse(value) {
  try {
    return JSON.parse(String(value || ''));
  } catch (_error) {
    return null;
  }
}

function isPlainObject(value) {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function mergePlainObjects(base, override) {
  if (!isPlainObject(base)) return isPlainObject(override) ? { ...override } : base;
  if (!isPlainObject(override)) return { ...base };

  const merged = { ...base };
  Object.entries(override).forEach(([key, value]) => {
    const current = merged[key];
    if (isPlainObject(current) && isPlainObject(value)) {
      merged[key] = mergePlainObjects(current, value);
      return;
    }
    merged[key] = value;
  });
  return merged;
}

function resolveOpencodeReviewGateConfig(env = process.env) {
  return {
    enabled: false,
    mode: 'disabled',
    timeoutMs: 0,
    removed: true,
    disabledReason: OPENCODE_GATE_REMOVED_MESSAGE,
  };
}

function buildOpencodeReviewGatePermissionConfig() {
  return {
    '*': 'deny',
    read: 'allow',
    glob: 'allow',
    grep: 'allow',
    edit: 'deny',
    task: 'deny',
    skill: 'deny',
    lsp: 'deny',
    question: 'deny',
    webfetch: 'deny',
    websearch: 'deny',
    codesearch: 'deny',
    external_directory: 'deny',
    doom_loop: 'deny',
    bash: {
      '*': 'deny',
      'pwd': 'allow',
      'pwd *': 'allow',
      'ls': 'allow',
      'ls *': 'allow',
      'find *': 'allow',
      'rg *': 'allow',
      'cat *': 'allow',
      'sed *': 'allow',
      'head *': 'allow',
      'tail *': 'allow',
      'git status*': 'allow',
      'git diff*': 'allow',
      'git log*': 'allow',
      'git show*': 'allow',
      'git branch*': 'allow',
      'git rev-parse*': 'allow',
      'git ls-files*': 'allow',
      'git merge-base*': 'allow',
      'git submodule status*': 'allow',
      'make check*': 'allow',
      'make test*': 'allow',
      'make verify*': 'allow',
      './scripts/run_backend_checks.sh*': 'allow',
      'bash ./scripts/run_backend_checks.sh*': 'allow',
      'python -m pytest*': 'allow',
      'python3 -m pytest*': 'allow',
      'pytest *': 'allow',
      'npm test*': 'allow',
      'npm run test*': 'allow',
      'npm run lint*': 'allow',
      'npm run build*': 'allow',
      'pnpm test*': 'allow',
      'pnpm run test*': 'allow',
      'pnpm lint*': 'allow',
      'pnpm run lint*': 'allow',
      'pnpm build*': 'allow',
      'pnpm run build*': 'allow',
      'yarn test*': 'allow',
      'yarn lint*': 'allow',
      'yarn build*': 'allow',
      'flutter test*': 'allow',
      'flutter analyze*': 'allow',
      'dart test*': 'allow',
      'dart analyze*': 'allow',
    },
  };
}

function buildOpencodeReviewGateInlineConfig(options = {}) {
  return {
    $schema: 'https://opencode.ai/config.json',
    permission: buildOpencodeReviewGatePermissionConfig(),
    share: 'disabled',
    ...(isPlainObject(options.extraConfig) ? options.extraConfig : {}),
  };
}

function buildOpencodeReviewGatePrompt(options = {}) {
  const verificationCommands = uniqueStrings(options.verificationCommands || [], 10);
  const successfulCommands = uniqueStrings(options.successfulVerificationCommands || [], 10);
  const failedCommands = uniqueStrings(options.failedVerificationCommands || [], 10);
  const taskId = normalizeNonEmpty(options.taskId) || 'task-sem-id';
  const taskTitle = normalizeNonEmpty(options.taskTitle) || 'task sem titulo';
  const workspaceDir = path.resolve(String(options.workspaceDir || process.cwd()));
  const targetBranch = normalizeNonEmpty(options.targetBranch);
  const baseBranch = normalizeNonEmpty(options.baseBranch);
  const gitlabProjectPath = normalizeNonEmpty(options.gitlabProjectPath);

  return [
    'Voce e o validador externo automatico do NexusOrchestrator.',
    'Seu papel e revisar uma task que acabou de ser aprovada na lane de review.',
    'Nao edite arquivos. Nao escreva patches. Nao faca commit. Nao faca push.',
    'Use apenas leitura, diff e comandos locais de verificacao se isso aumentar a confianca da resposta.',
    'Bloqueie apenas por risco real: regressao funcional, CI plausivelmente quebrado, testes insuficientes para mudanca material, quebra de contrato, risco de migracao/dados ou problema de seguranca.',
    'Se faltar evidencia suficiente para aprovar ou bloquear com seguranca, use verdict=inconclusive.',
    '',
    `Task ID: ${taskId}`,
    `Titulo: ${taskTitle}`,
    `Workspace: ${workspaceDir}`,
    targetBranch ? `Branch revisada: ${targetBranch}` : null,
    baseBranch ? `Branch base: ${baseBranch}` : null,
    gitlabProjectPath ? `Projeto GitLab: ${gitlabProjectPath}` : null,
    '',
    verificationCommands.length
      ? `Comandos de verificacao esperados:\n${verificationCommands.map((command) => `- ${command}`).join('\n')}`
      : 'Comandos de verificacao esperados: nenhum comando declarado.',
    successfulCommands.length
      ? `Comandos ja vistos como bem-sucedidos nesta lane:\n${successfulCommands.map((command) => `- ${command}`).join('\n')}`
      : 'Comandos bem-sucedidos nesta lane: nenhum registrado.',
    failedCommands.length
      ? `Comandos que falharam nesta lane:\n${failedCommands.map((command) => `- ${command}`).join('\n')}`
      : 'Comandos que falharam nesta lane: nenhum registrado.',
    '',
    'Responda sem markdown extra, sem texto fora do bloco e sem cercas de codigo.',
    `Escreva exatamente neste formato:`,
    GATE_RESULT_START,
    '{"verdict":"approved|rejected|inconclusive","summary":"resumo curto","findings":["achado 1"],"evidence":["comando ou evidencia 1"],"confidence":"high|medium|low","recommended_next_status":"done|ready|in_review|pendente_admin"}',
    GATE_RESULT_END,
  ]
    .filter(Boolean)
    .join('\n');
}

function parseJsonEventLines(stdout = '') {
  const events = [];
  const plainTextLines = [];
  String(stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .forEach((line) => {
      const parsed = safeJsonParse(line);
      if (parsed && typeof parsed === 'object') {
        events.push(parsed);
        return;
      }
      plainTextLines.push(line);
    });

  return {
    events,
    plainText: plainTextLines.join('\n').trim() || null,
  };
}

function extractAssistantTextFromEvents(events = []) {
  return (Array.isArray(events) ? events : [])
    .filter((event) => String(event?.type || '').trim() === 'message.part.updated')
    .map((event) => event?.properties?.part)
    .filter((part) => part && String(part.type || '').trim() === 'text')
    .map((part) => String(part.text || ''))
    .join('')
    .trim();
}

function extractFirstErrorEvent(events = []) {
  return (Array.isArray(events) ? events : []).find(
    (event) => String(event?.type || '').trim() === 'error',
  ) || null;
}

function classifyOpencodeErrorEvent(errorEvent = null) {
  if (!errorEvent || typeof errorEvent !== 'object') {
    return {
      code: null,
      name: null,
      message: null,
      providerId: null,
    };
  }

  const errorPayload = errorEvent.error && typeof errorEvent.error === 'object'
    ? errorEvent.error
    : {};
  const rawMessage =
    errorPayload?.data?.message
    || errorPayload?.message
    || errorEvent?.message
    || null;
  const name = normalizeNonEmpty(errorPayload?.name);
  const providerId = normalizeNonEmpty(errorPayload?.data?.providerID);
  const message = truncateText(rawMessage, 1200);
  const fingerprint = `${name || ''} ${message || ''}`.toLowerCase();

  let code = null;
  if (fingerprint.includes('model not found')) {
    code = 'model-not-found';
  } else if (fingerprint.includes('provider not found')) {
    code = 'provider-not-found';
  } else if (
    name === 'ProviderAuthError'
    || fingerprint.includes('api key is missing')
    || fingerprint.includes('unauthenticated')
    || fingerprint.includes('authentication')
  ) {
    code = 'provider-auth';
  }

  return {
    code,
    name,
    message,
    providerId,
  };
}

function extractPermissionAskedCount(events = []) {
  return (Array.isArray(events) ? events : []).filter(
    (event) => String(event?.type || '').trim() === 'permission.asked',
  ).length;
}

function normalizeGateVerdict(value) {
  const normalized = String(value || '').trim().toLowerCase();
  if (normalized === 'approved') return 'approved';
  if (normalized === 'rejected') return 'rejected';
  if (normalized === 'inconclusive') return 'inconclusive';
  return 'inconclusive';
}

function normalizeRecommendedNextStatus(value, verdict) {
  const normalized = String(value || '').trim().toLowerCase();
  if (['done', 'ready', 'in_review', 'pendente_admin'].includes(normalized)) {
    return normalized;
  }
  if (verdict === 'approved') return 'done';
  if (verdict === 'rejected') return 'ready';
  return 'in_review';
}

function extractStructuredGatePayload(text = '') {
  const normalized = String(text || '');
  const startIndex = normalized.indexOf(GATE_RESULT_START);
  const endIndex = normalized.lastIndexOf(GATE_RESULT_END);
  if (startIndex === -1 || endIndex === -1 || endIndex <= startIndex) {
    return null;
  }

  let payload = normalized
    .slice(startIndex + GATE_RESULT_START.length, endIndex)
    .trim();
  payload = payload.replace(/^```(?:json)?/i, '').replace(/```$/i, '').trim();
  return safeJsonParse(payload);
}

function parseOpencodeReviewGateOutput(options = {}) {
  const stdout = String(options.stdout || '');
  const stderr = String(options.stderr || '');
  const exitCode = Number.isInteger(options.exitCode) ? options.exitCode : null;
  const eventParse = parseJsonEventLines(stdout);
  const errorInfo = classifyOpencodeErrorEvent(extractFirstErrorEvent(eventParse.events));
  const assistantText = extractAssistantTextFromEvents(eventParse.events);
  const responseText = assistantText || eventParse.plainText || stdout.trim();
  const payload = extractStructuredGatePayload(responseText);
  const verdict = normalizeGateVerdict(payload?.verdict);
  const summary = truncateText(
    payload?.summary
      || errorInfo.message
      || (verdict === 'approved'
        ? 'OpenCode aprovou a promocao automatica.'
        : verdict === 'rejected'
          ? 'OpenCode identificou risco real para bloquear a promocao.'
          : responseText || stderr || 'OpenCode nao retornou evidencia suficiente.'),
  );
  const findings = uniqueStrings(payload?.findings || []);
  const evidence = uniqueStrings(payload?.evidence || [], MAX_EVIDENCE);
  const confidence = ['high', 'medium', 'low'].includes(String(payload?.confidence || '').trim().toLowerCase())
    ? String(payload.confidence).trim().toLowerCase()
    : 'medium';
  const recommendedNextStatus = normalizeRecommendedNextStatus(
    payload?.recommended_next_status,
    verdict,
  );

  return {
    status: exitCode === 0 && !errorInfo.code && !errorInfo.name ? 'completed' : 'error',
    verdict,
    summary,
    findings,
    evidence,
    confidence,
    recommendedNextStatus,
    parsed: Boolean(payload),
    responseText: truncateText(responseText, 4000),
    stdoutPreview: truncateText(stdout, 3000),
    stderrPreview: truncateText(stderr, 3000),
    permissionAskedCount: extractPermissionAskedCount(eventParse.events),
    exitCode,
    errorCode: errorInfo.code,
    errorName: errorInfo.name,
    errorMessage: errorInfo.message,
    errorProviderId: errorInfo.providerId,
  };
}

function buildGateResultFromSkip(config, status, reason, summary) {
  const blocksPromotion = Boolean(config.enabled && config.mode === 'required');
  return {
    enabled: config.enabled,
    mode: config.mode,
    blocking: blocksPromotion,
    status: 'skipped',
    verdict: 'skipped',
    reason,
    summary,
    findings: [],
    evidence: [],
    confidence: 'low',
    recommendedNextStatus: blocksPromotion ? 'pendente_admin' : 'done',
    durationMs: 0,
    timeoutMs: config.timeoutMs,
    timedOut: false,
    command: status?.command || null,
    model: status?.defaultModel || null,
    agent: status?.defaultAgent || null,
    variant: status?.defaultVariant || null,
    format: 'json',
    workspaceDir: null,
    stdoutPreview: null,
    stderrPreview: null,
    responseText: null,
    parsed: false,
    permissionAskedCount: 0,
    exitCode: null,
  };
}

function finalizeGateResult(config, runtimeStatus, spec, attemptResult) {
  const normalized = {
    enabled: config.enabled,
    mode: config.mode,
    blocking:
      attemptResult.verdict === 'rejected'
      || (config.mode === 'required' && attemptResult.verdict !== 'approved'),
    status: attemptResult.status,
    verdict: attemptResult.verdict,
    reason: attemptResult.reason || null,
    summary: attemptResult.summary,
    findings: attemptResult.findings || [],
    evidence: attemptResult.evidence || [],
    confidence: attemptResult.confidence || 'medium',
    recommendedNextStatus: attemptResult.recommendedNextStatus,
    durationMs: attemptResult.durationMs,
    timeoutMs: config.timeoutMs,
    timedOut: Boolean(attemptResult.timedOut),
    command: runtimeStatus?.command || spec?.command || null,
    model: spec?.model || runtimeStatus?.defaultModel || null,
    agent: spec?.agent || runtimeStatus?.defaultAgent || null,
    variant: spec?.variant || runtimeStatus?.defaultVariant || null,
    format: spec?.format || 'json',
    workspaceDir: spec?.cwd || null,
    stdoutPreview: attemptResult.stdoutPreview || null,
    stderrPreview: attemptResult.stderrPreview || null,
    responseText: attemptResult.responseText || null,
    parsed: Boolean(attemptResult.parsed),
    permissionAskedCount: Number(attemptResult.permissionAskedCount || 0),
    exitCode: attemptResult.exitCode,
  };

  if (normalized.status === 'timeout' || normalized.status === 'error') {
    if (!normalized.summary) {
      normalized.summary =
        normalized.status === 'timeout'
          ? 'OpenCode excedeu o tempo limite do review gate.'
          : 'OpenCode falhou ao executar o review gate.';
    }
    if (normalized.verdict === 'approved') {
      normalized.verdict = 'inconclusive';
    }
    if (!['ready', 'in_review'].includes(normalized.recommendedNextStatus)) {
      normalized.recommendedNextStatus = 'in_review';
    }
    normalized.blocking = config.mode === 'required';
  }

  return normalized;
}

function mergeInlineConfig(env, extraConfig) {
  const existing = safeJsonParse(env.OPENCODE_CONFIG_CONTENT) || {};
  return JSON.stringify(mergePlainObjects(existing, extraConfig));
}

function appendUniqueModelCandidate(target, model) {
  const normalized = normalizeNonEmpty(model);
  if (!normalized || target.includes(normalized)) return target;
  target.push(normalized);
  return target;
}

function buildOpencodeReviewModelCandidates(options = {}) {
  const env = resolveOpencodeExecutionEnv(options.env || process.env);
  const runtimeStatus = options.runtimeStatus || null;
  const explicitReviewModel =
    normalizeNonEmpty(env.NEXUS_OPENCODE_REVIEW_MODEL)
    || normalizeNonEmpty(env.NEXUS_OPENCODE_REVIEW_DEFAULT_MODEL)
    || null;
  const preferredModel =
    normalizeNonEmpty(options.model)
    || normalizeNonEmpty(runtimeStatus?.defaultModel)
    || null;
  const candidates = [];
  const geminiApiKey =
    normalizeNonEmpty(env.GOOGLE_GENERATIVE_AI_API_KEY)
    || normalizeNonEmpty(env.GEMINI_API_KEY);
  const geminiReviewModel = geminiApiKey
    ? buildProviderScopedModel(
      'gemini',
      normalizeNonEmpty(env.NEXUS_GEMINI_DEFAULT_MODEL) || defaultModelForProvider('gemini'),
    )
    : null;
  const preferGeminiReview = normalizeBoolean(env.NEXUS_OPENCODE_REVIEW_PREFER_GEMINI, false);

  appendUniqueModelCandidate(candidates, explicitReviewModel);
  if (!explicitReviewModel && preferGeminiReview) {
    appendUniqueModelCandidate(candidates, geminiReviewModel);
  }
  appendUniqueModelCandidate(candidates, preferredModel);

  const preferredProviderId =
    parseProviderModel(explicitReviewModel || preferredModel)?.providerId || null;
  if (geminiReviewModel && preferredProviderId !== 'google') {
    appendUniqueModelCandidate(candidates, geminiReviewModel);
  }

  return candidates;
}

function shouldRetryOpencodeReviewGateWithFallback(result = {}, modelCandidates = [], attemptIndex = 0) {
  if (!Array.isArray(modelCandidates) || attemptIndex >= modelCandidates.length - 1) {
    return false;
  }

  const currentProviderId = parseProviderModel(result.model)?.providerId || null;
  const nextProviderId = parseProviderModel(modelCandidates[attemptIndex + 1])?.providerId || null;
  if (!nextProviderId || currentProviderId === nextProviderId) {
    return false;
  }

  if (result.status === 'timeout' && currentProviderId === 'azure' && nextProviderId === 'google') {
    return true;
  }

  if (result.status !== 'error') {
    return false;
  }

  if (
    ['model-not-found', 'provider-not-found', 'provider-auth'].includes(
      String(result.errorCode || '').trim(),
    )
  ) {
    return true;
  }

  return currentProviderId === 'azure' && nextProviderId === 'google';
}

function executeOpencodeReviewGateAttempt(options = {}) {
  const config = options.config;
  const runtimeStatus = options.runtimeStatus;
  const spec = options.spec;
  const gateEnv = options.gateEnv;
  const spawnImpl = typeof options.spawnImpl === 'function' ? options.spawnImpl : spawn;

  return new Promise((resolve) => {
    const startedAt = Date.now();
    const stdoutChunks = [];
    const stderrChunks = [];
    let settled = false;
    let timeoutHandle = null;
    let killHandle = null;

    const finalize = (attemptResult) => {
      if (settled) return;
      settled = true;
      if (timeoutHandle) clearTimeout(timeoutHandle);
      if (killHandle) clearTimeout(killHandle);
      resolve(
        finalizeGateResult(config, runtimeStatus, spec, {
          ...attemptResult,
          durationMs: Date.now() - startedAt,
        }),
      );
    };

    let child;
    try {
      child = spawnImpl(spec.command, spec.args, {
        cwd: spec.cwd,
        env: gateEnv,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
    } catch (error) {
      finalize({
        status: 'error',
        verdict: 'inconclusive',
        reason: 'spawn-failed',
        summary: truncateText(error.message) || 'Falha ao iniciar o OpenCode.',
        findings: [],
        evidence: [],
        confidence: 'low',
        recommendedNextStatus: 'in_review',
        stdoutPreview: null,
        stderrPreview: truncateText(error.message, 3000),
        responseText: null,
        parsed: false,
        permissionAskedCount: 0,
        exitCode: null,
        errorCode: null,
        errorName: null,
        errorMessage: truncateText(error.message, 1200),
        errorProviderId: null,
      });
      return;
    }

    child.stdout.on('data', (chunk) => {
      stdoutChunks.push(Buffer.from(chunk));
    });
    child.stderr.on('data', (chunk) => {
      stderrChunks.push(Buffer.from(chunk));
    });
    child.on('error', (error) => {
      finalize({
        status: 'error',
        verdict: 'inconclusive',
        reason: 'process-error',
        summary: truncateText(error.message) || 'OpenCode encerrou com erro de processo.',
        findings: [],
        evidence: [],
        confidence: 'low',
        recommendedNextStatus: 'in_review',
        stdoutPreview: truncateText(Buffer.concat(stdoutChunks).toString('utf8'), 3000),
        stderrPreview: truncateText(error.message, 3000),
        responseText: null,
        parsed: false,
        permissionAskedCount: 0,
        exitCode: null,
        errorCode: null,
        errorName: null,
        errorMessage: truncateText(error.message, 1200),
        errorProviderId: null,
      });
    });
    child.on('close', (exitCode) => {
      const stdout = Buffer.concat(stdoutChunks).toString('utf8');
      const stderr = Buffer.concat(stderrChunks).toString('utf8');
      const parsed = parseOpencodeReviewGateOutput({
        stdout,
        stderr,
        exitCode,
      });
      finalize({
        ...parsed,
        reason:
          parsed.status === 'completed'
            ? parsed.parsed
              ? 'completed'
              : 'missing-structured-result'
            : parsed.errorCode || (exitCode === 0 ? 'opencode-error-event' : 'non-zero-exit'),
        status: parsed.status,
        timedOut: false,
      });
    });

    timeoutHandle = setTimeout(() => {
      try {
        child.kill('SIGTERM');
      } catch (_error) {
        // best effort
      }
      killHandle = setTimeout(() => {
        try {
          child.kill('SIGKILL');
        } catch (_error) {
          // best effort
        }
      }, 5_000);
      finalize({
        status: 'timeout',
        verdict: 'inconclusive',
        reason: 'timeout',
        summary: 'OpenCode excedeu o tempo limite do review gate automatico.',
        findings: [],
        evidence: [],
        confidence: 'low',
        recommendedNextStatus: 'in_review',
        stdoutPreview: truncateText(Buffer.concat(stdoutChunks).toString('utf8'), 3000),
        stderrPreview: truncateText(Buffer.concat(stderrChunks).toString('utf8'), 3000),
        responseText: null,
        parsed: false,
        permissionAskedCount: 0,
        exitCode: null,
        timedOut: true,
        errorCode: null,
        errorName: null,
        errorMessage: null,
        errorProviderId: null,
      });
    }, config.timeoutMs);
  });
}

async function runOpencodeReviewGate(options = {}) {
  const env = resolveOpencodeExecutionEnv(options.env || process.env);
  const workspaceDir = path.resolve(String(options.workspaceDir || process.cwd()));
  const config = resolveOpencodeReviewGateConfig(env);

  if (!config.enabled) {
    return buildGateResultFromSkip(
      config,
      options.runtimeStatus || null,
      'gate-disabled',
      OPENCODE_GATE_REMOVED_MESSAGE,
    );
  }

  const runtimeStatus = options.runtimeStatus || getOpencodeRuntimeStatus({
    env,
    projectDir: workspaceDir,
    useCache: false,
  });

  if (!runtimeStatus.available) {
    return buildGateResultFromSkip(
      config,
      runtimeStatus,
      'validator-binary-unavailable',
      runtimeStatus.error || 'OpenCode indisponivel no PATH.',
    );
  }

  if (!runtimeStatus.ready) {
    return buildGateResultFromSkip(
      config,
      runtimeStatus,
      'validator-not-ready',
      'OpenCode habilitado, mas sem modelo/credenciais suficientes para validar automaticamente.',
    );
  }

  const prompt = buildOpencodeReviewGatePrompt({
    taskId: options.taskId,
    taskTitle: options.taskTitle,
    workspaceDir,
    targetBranch: options.targetBranch,
    baseBranch: options.baseBranch,
    gitlabProjectPath: options.gitlabProjectPath,
    verificationCommands: options.verificationCommands,
    successfulVerificationCommands: options.successfulVerificationCommands,
    failedVerificationCommands: options.failedVerificationCommands,
  });

  const gateEnv = {
    ...env,
    OPENCODE_CONFIG_CONTENT: mergeInlineConfig(
      env,
      buildOpencodeReviewGateInlineConfig(),
    ),
  };
  const modelCandidates = buildOpencodeReviewModelCandidates({
    env: gateEnv,
    model: options.model,
    runtimeStatus,
  });
  const spawnImpl = typeof options.spawnImpl === 'function' ? options.spawnImpl : spawn;
  const attemptedModels = [];

  const effectiveModels = modelCandidates.length ? modelCandidates : [options.model];
  let lastResult = null;

  for (let index = 0; index < effectiveModels.length; index += 1) {
    const candidateModel = effectiveModels[index];
    const spec = buildOpencodeReviewCommand({
      env: gateEnv,
      workspaceDir,
      prompt,
      model: candidateModel,
      agent: options.agent || 'plan',
      variant: options.variant,
      format: 'json',
      pure: true,
      skipPermissions: false,
      printLogs: false,
      title: normalizeNonEmpty(options.title) || `Nexus review gate ${normalizeNonEmpty(options.taskId) || 'task'}`,
    });

    const attemptResult = await executeOpencodeReviewGateAttempt({
      config,
      runtimeStatus,
      spec,
      gateEnv,
      spawnImpl,
    });

    attemptedModels.push(spec.model || null);
    lastResult = {
      ...attemptResult,
      attemptedModels: attemptedModels.filter(Boolean),
    };

    if (!shouldRetryOpencodeReviewGateWithFallback(lastResult, effectiveModels, index)) {
      return lastResult;
    }
  }

  return lastResult || buildGateResultFromSkip(
    config,
    runtimeStatus,
    'missing-model-candidate',
    'OpenCode review gate ficou sem modelo candidato para validar automaticamente.',
  );
}

module.exports = {
  GATE_RESULT_END,
  GATE_RESULT_START,
  buildOpencodeReviewGateInlineConfig,
  buildOpencodeReviewGatePermissionConfig,
  buildOpencodeReviewGatePrompt,
  parseOpencodeReviewGateOutput,
  resolveOpencodeReviewGateConfig,
  runOpencodeReviewGate,
};
