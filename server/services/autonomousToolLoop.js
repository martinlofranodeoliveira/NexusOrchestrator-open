const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const {
  DEFAULT_ANTHROPIC_VERSION,
  DEFAULT_AZURE_OPENAI_API_VERSION,
  anthropicMessagesEndpoint,
  azureChatCompletionsEndpoint,
  resolveOpenAiCompatibleRuntimeConfig,
} = require('./llmService');
const { evaluateCommandRisk } = require('./executionGuardrails');
const { runHookPipeline } = require('./hookRunner');
const {
  defaultSkillRoots,
  resolveApplicableSkills,
} = require('./skillsRegistry');
const {
  defaultModelForProvider,
  normalizeLlmProvider,
  normalizeModelName,
  normalizeReasoningEffort,
} = require('./modelRegistry');
const {
  normalizeRuntimeCandidate,
  runtimeCandidateKey,
} = require('./providerRuntime');
const {
  getFigmaFileSummary,
  getFigmaImageRefs,
  getFigmaNodeContext,
} = require('./figmaBridge');
const {
  callStitchTool,
  getStitchBridgeStatus,
  isReadOnlyStitchToolName,
  listStitchTools,
  normalizeStitchToolArgs,
} = require('./stitchBridge');

const DEFAULT_MAX_ITERATIONS = Number(process.env.NEXUS_AUTONOMOUS_MAX_ITERATIONS || 32);
const DEFAULT_MAX_TOKENS = Number(process.env.NEXUS_AUTONOMOUS_MAX_TOKENS || 4096);
const DEFAULT_BASH_TIMEOUT_MS = Number(process.env.NEXUS_AUTONOMOUS_BASH_TIMEOUT_MS || 120000);
const DEFAULT_PROVIDER_HTTP_TIMEOUT_MS = Math.max(
  1000,
  Number(
    process.env.NEXUS_AUTONOMOUS_PROVIDER_TIMEOUT_MS ||
      process.env.NEXUS_PROVIDER_HTTP_TIMEOUT_MS ||
      300000,
  ),
);
const DEFAULT_PROVIDER_WAIT_HEARTBEAT_MS = Math.max(
  1000,
  Number(
    process.env.NEXUS_AUTONOMOUS_PROVIDER_HEARTBEAT_MS ||
      process.env.NEXUS_PROVIDER_WAIT_HEARTBEAT_MS ||
      30000,
  ),
);
const DEFAULT_PROVIDER_TIMEOUT_WITH_FALLBACK_MS = Math.max(
  1000,
  Number(
    process.env.NEXUS_AUTONOMOUS_PROVIDER_TIMEOUT_WITH_FALLBACK_MS ||
      process.env.NEXUS_PROVIDER_HTTP_TIMEOUT_WITH_FALLBACK_MS ||
      90000,
  ),
);
const MAX_TOOL_OUTPUT_CHARS = Number(process.env.NEXUS_AUTONOMOUS_TOOL_OUTPUT_CHARS || 16000);
const MAX_READ_FILE_CHARS = Number(process.env.NEXUS_AUTONOMOUS_READ_FILE_CHARS || 24000);
const MAX_SEARCH_RESULTS = Number(process.env.NEXUS_AUTONOMOUS_SEARCH_RESULTS || 200);
const MAX_SEARCH_OUTPUT_CHARS = Number(process.env.NEXUS_AUTONOMOUS_SEARCH_OUTPUT_CHARS || 12000);
const MAX_HISTORY_TOOL_ARG_CHARS = Number(process.env.NEXUS_AUTONOMOUS_HISTORY_TOOL_ARG_CHARS || 1200);
const DEFAULT_READONLY_STREAK_LIMIT = 4;
const DEFAULT_EMPTY_RESPONSE_RETRIES = 2;
const CONTROL_PLANE_MUTATION_PREFIXES = Object.freeze([
  '.git',
  '.nexus',
]);
const BOOTSTRAP_FOUNDATION_ARTIFACTS = Object.freeze([
  '.editorconfig',
  '.env.example',
  'melos.yaml',
  'Makefile',
  'docs/WORKSPACE_CONVENTIONS.md',
  'scripts/bootstrap.sh',
  'apps/mobile/pubspec.yaml',
  'services/api/pyproject.toml',
]);
const AZURE_DEPLOYMENT_PLACEHOLDERS = new Set([
  '',
  'azure-openai-deployment',
  'azure deployment',
  'azure-deployment',
  'deployment',
]);
const READ_ONLY_BASH_PREFIXES = Object.freeze([
  '[',
  'cat',
  'cd',
  'command -v',
  'cut',
  'dirname',
  'echo',
  'env',
  'find',
  'git branch',
  'git diff',
  'git log',
  'git rev-parse',
  'git show',
  'git status',
  'grep',
  'head',
  'ls',
  'pwd',
  'printf',
  'printenv',
  'realpath',
  'rg',
  'sed',
  'sort',
  'stat',
  'tail',
  'test',
  'tree',
  'wc',
  'which',
]);
const REVIEW_SAFE_BASH_PREFIXES = Object.freeze([
  '.',
  'alembic',
  'cd',
  'dart --version',
  'export',
  'flutter --version',
  'git ls-remote',
  'make analyze',
  'make build',
  'make check',
  'make lint',
  'make test',
  'npm ci',
  'npm install',
  'npm run build',
  'npm run check',
  'npm run lint',
  'npm run test',
  'npm test',
  'pip install',
  'pip3 install',
  'pnpm install',
  'pnpm run build',
  'pnpm run check',
  'pnpm run lint',
  'pnpm run test',
  'pnpm test',
  'poetry install',
  'poetry run pytest',
  'printf',
  'py.test',
  'pytest',
  'python -m pip install',
  'python -m py_compile',
  'python -m pytest',
  'python -m venv',
  'python3 -m pip install',
  'python3 -m py_compile',
  'python3 -m pytest',
  'python3 -m venv',
  'ruff',
  'ruff check',
  'source',
  'set',
  'true',
  'uv run pytest',
  'uv sync',
  'yarn install',
  'yarn run build',
  'yarn run check',
  'yarn run lint',
  'yarn run test',
  'yarn test',
  'flutter analyze',
  'flutter build web',
  'flutter pub get',
  'flutter test',
  'dart analyze',
  'dart pub get',
  'dart test',
  'go test',
  'cargo clippy',
  'cargo fmt --check',
  'cargo test',
  'mypy',
]);
const SHELL_CONTROL_ONLY_CLAUSES = new Set([
  'do',
  'done',
  'then',
  'fi',
  'else',
  'esac',
]);
const BASH_MUTATION_PATTERN =
  /(^|[;&|]\s*)(?:chmod|chown|cp|git\s+(?:add|am|apply|checkout|cherry-pick|clean|commit|merge|mv|pull|push|rebase|reset|restore|revert|rm|stash|switch)|mkdir|mv|npm\s+(?:exec|install|run)|npx|pnpm\s+(?:add|exec|install|remove|run)|rm|rmdir|sed\s+-i|tee|touch|yarn\s+(?:add|dlx|install|remove|run)|bun\s+(?:add|install|remove|run)|pip\s+install|poetry\s+install|python|python3|node|dart|flutter|go\s+(?:build|run|test)|cargo\s+(?:build|run|test)|make|cmake|gradle|mvn|pytest)\b|(^|[^<])>>?|<<|>\s*[^=]/i;
const REVIEW_BASH_MUTATION_PATTERN =
  /(^|[;&|]\s*)(?:chmod|chown|cp|git\s+(?:add|am|apply|checkout|cherry-pick|clean|commit|merge|mv|pull|push|rebase|reset|restore|revert|rm|stash|switch)|mkdir|mv|rm|rmdir|sed\s+-i|tee|touch)\b/i;

function readEnvValue(key, extraEnv = {}) {
  const candidate = extraEnv && Object.prototype.hasOwnProperty.call(extraEnv, key)
    ? extraEnv[key]
    : process.env[key];
  return String(candidate || '').trim();
}

function readBooleanEnv(key, extraEnv = {}, fallback = false) {
  const raw = readEnvValue(key, extraEnv);
  if (!raw) return Boolean(fallback);
  return ['1', 'true', 'yes', 'on'].includes(raw.toLowerCase());
}

function shouldSendReasoningEffort(provider, env = {}) {
  const normalizedProvider = normalizeLlmProvider(provider);
  if (normalizedProvider === 'openai') return true;
  if (normalizedProvider === 'azure_openai') return true;
  if (normalizedProvider !== 'openai_compat') return false;
  return (
    readBooleanEnv('NEXUS_OPENAI_COMPAT_ENABLE_REASONING_EFFORT', env) ||
    Boolean(readEnvValue('NEXUS_OPENAI_COMPAT_DEFAULT_REASONING_EFFORT', env))
  );
}

function resolveProviderHttpTimeoutMs(env = process.env, override = null) {
  const explicitTimeout = Number(override);
  if (Number.isFinite(explicitTimeout) && explicitTimeout > 0) {
    return Math.max(1000, explicitTimeout);
  }

  const autonomousTimeout = Number(readEnvValue('NEXUS_AUTONOMOUS_PROVIDER_TIMEOUT_MS', env));
  if (Number.isFinite(autonomousTimeout) && autonomousTimeout > 0) {
    return Math.max(1000, autonomousTimeout);
  }

  const genericTimeout = Number(readEnvValue('NEXUS_PROVIDER_HTTP_TIMEOUT_MS', env));
  if (Number.isFinite(genericTimeout) && genericTimeout > 0) {
    return Math.max(1000, genericTimeout);
  }

  return DEFAULT_PROVIDER_HTTP_TIMEOUT_MS;
}

function resolveProviderWaitHeartbeatMs(env = process.env, timeoutMs = null) {
  const explicitHeartbeat = Number(
    readEnvValue('NEXUS_AUTONOMOUS_PROVIDER_HEARTBEAT_MS', env) ||
      readEnvValue('NEXUS_PROVIDER_WAIT_HEARTBEAT_MS', env),
  );
  if (Number.isFinite(explicitHeartbeat) && explicitHeartbeat > 0) {
    return Math.max(1000, explicitHeartbeat);
  }

  const resolvedTimeoutMs = resolveProviderHttpTimeoutMs(env, timeoutMs);
  return Math.max(
    1000,
    Math.min(DEFAULT_PROVIDER_WAIT_HEARTBEAT_MS, Math.floor(resolvedTimeoutMs / 4)),
  );
}

function truncateText(text, limit, suffix = '\n...[truncated]') {
  const raw = String(text || '');
  if (raw.length <= limit) return raw;
  return `${raw.slice(0, Math.max(0, limit - suffix.length))}${suffix}`;
}

function previewText(text, limit = 2400) {
  const trimmed = String(text || '').trim();
  if (!trimmed) return '[sem saída]';
  return truncateText(trimmed, limit);
}

function prependPathEntries(pathValue, entries) {
  const seen = new Set();
  const existingEntries = String(pathValue || '')
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
  const normalizedEntries = [...(Array.isArray(entries) ? entries : []), ...existingEntries]
    .map((entry) => String(entry || '').trim())
    .filter(Boolean)
    .filter((entry) => {
      if (seen.has(entry)) return false;
      seen.add(entry);
      return true;
    });

  return normalizedEntries.join(path.delimiter);
}

function buildCommandEnv(baseEnv = process.env) {
  const env = { ...(baseEnv || process.env) };
  const homeDir = String(env.HOME || process.env.HOME || '').trim();
  const preferredBinDirs = [
    homeDir ? path.join(homeDir, 'bin') : null,
    homeDir ? path.join(homeDir, '.local', 'bin') : null,
    homeDir ? path.join(homeDir, 'flutter-sdk', 'bin') : null,
    String(env.FLUTTER_ROOT || '').trim()
      ? path.join(String(env.FLUTTER_ROOT || '').trim(), 'bin')
      : null,
  ].filter((candidate) => candidate && fs.existsSync(candidate));

  env.PATH = prependPathEntries(env.PATH || process.env.PATH || '', preferredBinDirs);
  return env;
}

function splitShellClauses(command) {
  const raw = String(command || '');
  if (!raw.trim()) return [];

  const clauses = [];
  let current = '';
  let activeQuote = null;
  let escaped = false;

  const pushCurrent = () => {
    const normalized = current.trim();
    if (normalized) clauses.push(normalized);
    current = '';
  };

  for (let index = 0; index < raw.length; index += 1) {
    const char = raw[index];
    const next = raw[index + 1];

    if (escaped) {
      current += char;
      escaped = false;
      continue;
    }

    if (char === '\\') {
      current += char;
      if (activeQuote !== '\'') {
        escaped = true;
      }
      continue;
    }

    if (activeQuote) {
      current += char;
      if (char === activeQuote) {
        activeQuote = null;
      }
      continue;
    }

    if (char === '\'' || char === '"') {
      activeQuote = char;
      current += char;
      continue;
    }

    if ((char === '&' && next === '&') || (char === '|' && next === '|')) {
      pushCurrent();
      index += 1;
      continue;
    }

    if (char === ';' || char === '\n') {
      pushCurrent();
      continue;
    }

    if (char === '\r') {
      pushCurrent();
      if (next === '\n') {
        index += 1;
      }
      continue;
    }

    current += char;
  }

  pushCurrent();
  return clauses;
}

function stripInspectionOnlyRedirections(command) {
  return String(command || '')
    .replace(/(^|[\s;&|(])\d*>>?\s*\/dev\/null(?=$|[\s;&|)])/gi, '$1');
}

function extractClauseLeadCommand(clause) {
  let normalized = String(clause || '')
    .replace(/^\(+\s*/, '')
    .replace(/^!\s*/, '')
    .split('|')[0]
    .trim();

  let previous = null;
  while (normalized && normalized !== previous) {
    previous = normalized;
    normalized = normalized
      .replace(/^(?:do|then|time|if|elif)\s+/i, '')
      .replace(/^(?:[A-Za-z_][A-Za-z0-9_]*=(?:"[^"]*"|'[^']*'|[^'"`\s]+)\s+)*/g, '')
      .trim();
  }

  const tokens = normalized.split(/\s+/).filter(Boolean);
  if (tokens.length > 0) {
    const executable = tokens[0].replace(/^['"]|['"]$/g, '');
    if (executable.includes('/') || executable.includes('\\')) {
      tokens[0] = path.basename(executable);
    }
  }

  return tokens.join(' ').replace(/\s+/g, ' ').toLowerCase();
}

function isInspectionOnlyBashCommand(command) {
  const raw = String(command || '').trim();
  if (!raw) return false;
  const sanitized = stripInspectionOnlyRedirections(raw);
  if (BASH_MUTATION_PATTERN.test(sanitized)) return false;

  const clauses = splitShellClauses(sanitized);
  if (clauses.length === 0) return false;

  return clauses.every((clause) => {
    const lead = extractClauseLeadCommand(clause);
    if (!lead) return false;
    if (SHELL_CONTROL_ONLY_CLAUSES.has(lead)) return true;
    if (lead.startsWith('for ')) return true;
    return READ_ONLY_BASH_PREFIXES.some((prefix) => lead === prefix || lead.startsWith(`${prefix} `));
  });
}

function isLowValueMutationBashCommand(command) {
  const raw = String(command || '').trim();
  if (!raw) return false;

  const clauses = splitShellClauses(raw);
  if (clauses.length === 0) return false;

  return clauses.every((clause) => {
    const lead = extractClauseLeadCommand(clause);
    return lead === 'mkdir' || lead.startsWith('mkdir ');
  });
}

function isInspectionOnlyToolCall(toolCall) {
  const toolName = String(toolCall?.name || '').trim();
  if (
    toolName === 'read_file'
    || toolName === 'glob_search'
    || toolName === 'grep_search'
    || toolName === 'figma_get_file'
    || toolName === 'figma_get_node_context'
    || toolName === 'figma_get_image_refs'
    || toolName === 'stitch_status'
    || toolName === 'stitch_list_tools'
  ) {
    return true;
  }
  if (toolName === 'stitch_call_tool' && isReadOnlyStitchToolName(toolCall?.input?.toolName)) {
    return true;
  }
  if (toolName === 'bash') {
    return (
      isInspectionOnlyBashCommand(toolCall?.input?.command) ||
      isLowValueMutationBashCommand(toolCall?.input?.command)
    );
  }
  return false;
}

function isReviewTaskTitle(taskTitle = '') {
  return /^\s*\[review\b/i.test(String(taskTitle || '').trim());
}

function stripAllowedReviewRedirections(command) {
  return String(command || '')
    .replace(/(^|[\s;&|(])\d*>>?\s*\/dev\/null(?=$|[\s;&|)])/gi, '$1')
    .replace(/(^|[\s;&|(])\d*>>?\s*\/tmp\/[^\s;&|)]+(?=$|[\s;&|)])/gi, '$1');
}

function hasDisallowedReviewRedirection(command) {
  const raw = String(command || '').trim();
  if (!raw) return false;

  const normalized = stripAllowedReviewRedirections(raw);
  if (/(^|[^<])<<-?/i.test(normalized)) {
    return true;
  }

  return /(^|[^<])>>?|>\s*[^=]/i.test(normalized);
}

function stripAllowedBashMutationRedirections(command) {
  return String(command || '')
    .replace(/(^|[\s;&|(])\d*>>?\s*\/dev\/null(?=$|[\s;&|)])/gi, '$1')
    .replace(/(^|[\s;&|(])\d*>\s*&\d(?=$|[\s;&|)])/gi, '$1')
    .replace(/(^|[\s;&|(])\d*>\s*&-(?=$|[\s;&|)])/gi, '$1');
}

function hasUnsupportedBashMutationSyntax(command) {
  const raw = String(command || '').trim();
  if (!raw) return false;

  if (/(^|[^<])<<-?/m.test(raw)) {
    return true;
  }

  if (!/[\r\n]/.test(raw)) {
    return false;
  }

  const normalized = stripAllowedBashMutationRedirections(raw);
  return /(^|[^<])>>?\s*(?![&]|\/dev\/null\b)/m.test(normalized);
}

function isSafeReviewPythonInlineCommand(clause, lead = '') {
  const normalizedLead = String(lead || '').trim().toLowerCase();
  if (
    !normalizedLead.startsWith('python -c ')
    && !normalizedLead.startsWith('python3 -c ')
  ) {
    return false;
  }

  const normalizedClause = String(clause || '').toLowerCase();
  if (!normalizedClause.includes('print(') && !normalizedClause.includes('assert ')) {
    return false;
  }

  const blockedTokens = [
    'open(',
    '.write(',
    'write_text(',
    'write_bytes(',
    'mkdir(',
    'unlink(',
    'rmtree(',
    'remove(',
    'replace(',
    'rename(',
    'subprocess',
    'os.system',
    'popen(',
    'requests.',
    'urllib',
    'socket.',
  ];

  return !blockedTokens.some((token) => normalizedClause.includes(token));
}

function isReviewSafeBashCommand(command) {
  const raw = String(command || '').trim();
  if (!raw) return false;
  if (REVIEW_BASH_MUTATION_PATTERN.test(raw)) return false;
  if (hasDisallowedReviewRedirection(raw)) return false;

  const clauses = splitShellClauses(raw);
  if (clauses.length === 0) return false;

  return clauses.every((clause) => {
    if (isInspectionOnlyBashCommand(clause)) {
      return true;
    }

    const lead = extractClauseLeadCommand(clause);
    if (!lead) return false;
    if (SHELL_CONTROL_ONLY_CLAUSES.has(lead)) return true;
    if (lead.startsWith('for ')) return true;
    if (isSafeReviewPythonInlineCommand(clause, lead)) return true;
    return REVIEW_SAFE_BASH_PREFIXES.some(
      (prefix) => lead === prefix || lead.startsWith(`${prefix} `),
    );
  });
}

function appendReadOnlyRecoveryMessage(messages, streak, limit, guidance = null) {
  const guidanceText = String(guidance || '').trim();
  const lines = [
    `Guardrail de autonomia: você acabou de acumular ${streak} iterações seguidas apenas com leitura/inspeção sem avançar a implementação.`,
    'Pare de explorar diretórios, status e buscas repetidas.',
    'Na próxima resposta, faça uma mudança material mínima no código ou documentação ligada à task atual, rode a verificação relevante e continue.',
    'Se existir bloqueio real, emita REQUEST_HELP com uma subtarefa objetiva em vez de continuar em discovery.',
  ];
  if (guidanceText) {
    lines.push('Orientação concreta para a próxima ação:');
    lines.push(guidanceText);
  }

  messages.push({
    role: 'user',
    blocks: [
      {
        type: 'text',
        text: lines.join('\n'),
      },
    ],
  });
}

function appendInspectionFallbackMessage(messages, streak, failedRuntime, nextRuntime, guidance = null) {
  const failedRuntimeLabel = `${failedRuntime?.provider || 'runtime'}/${failedRuntime?.model || 'default'}`;
  const nextRuntimeLabel = `${nextRuntime?.provider || 'runtime'}/${nextRuntime?.model || 'default'}`;
  const guidanceText = String(guidance || '').trim();
  const lines = [
    `Recuperacao interna: ${failedRuntimeLabel} ficou preso por ${streak} iteracoes em leitura/inspecao sem mudanca material.`,
    `Troque imediatamente o plano para execucao objetiva no runtime ${nextRuntimeLabel}.`,
    'Na proxima resposta, produza diff real, rode o check relevante ou use REQUEST_HELP com uma subtarefa concreta.',
  ];
  if (guidanceText) {
    lines.push('Orientacao concreta para a retomada:');
    lines.push(guidanceText);
  }

  messages.push({
    role: 'user',
    blocks: [
      {
        type: 'text',
        text: lines.join('\n'),
      },
    ],
  });
}

function buildInspectionOnlyBlockedMessage(streak, guidance = null) {
  const lines = [
    `Discovery bloqueado: voce ja acumulou ${streak} iteracoes consecutivas apenas com leitura/inspecao.`,
    'Chamadas read_file/glob_search/grep_search/bash somente de leitura estao temporariamente bloqueadas.',
    'Na proxima acao, faca uma mudanca material com edit_file/write_file, rode um teste/check relevante ou emita REQUEST_HELP com uma subtarefa objetiva.',
  ];
  const guidanceText = String(guidance || '').trim();
  if (guidanceText) {
    lines.push('Orientacao concreta:');
    lines.push(guidanceText);
  }
  return lines.join('\n');
}

function appendEmptyResponseRecoveryMessage(messages, attempt, maxAttempts, guidance = null) {
  const guidanceText = String(guidance || '').trim();
  const lines = [
    `Recuperacao interna: sua ultima resposta veio vazia (${attempt}/${maxAttempts}) sem texto final e sem tool calls validos.`,
    'Reenvie imediatamente uma resposta util.',
    'Na proxima resposta, escolha exatamente uma destas opcoes:',
    '1. emita tool calls validos para editar/testar, ou',
    '2. responda com texto final objetivo somente se a task ja estiver realmente concluida.',
    'Nao responda vazio.',
  ];
  if (guidanceText) {
    lines.push('Se estiver em duvida, siga esta orientacao concreta:');
    lines.push(guidanceText);
  }

  messages.push({
    role: 'user',
    blocks: [
      {
        type: 'text',
        text: lines.join('\n'),
      },
    ],
  });
}

function isAzureXHighRuntimeCandidate(candidate) {
  const provider = normalizeLlmProvider(candidate?.provider);
  if (provider !== 'azure_openai') {
    return false;
  }

  return normalizeReasoningEffort(candidate?.reasoningEffort, provider) === 'xhigh';
}

function resolveEmptyResponseRetryLimitForRuntimeCandidate(
  candidate,
  baseLimit,
  hasDownstreamFallback = false,
) {
  const normalizedBaseLimit = Math.max(0, Number(baseLimit) || 0);
  if (!hasDownstreamFallback) {
    return normalizedBaseLimit;
  }

  if (isAzureXHighRuntimeCandidate(candidate)) {
    return 0;
  }

  if (normalizeLlmProvider(candidate?.provider) === 'azure_openai') {
    return Math.min(normalizedBaseLimit, 1);
  }

  return normalizedBaseLimit;
}

function resolveRequestTimeoutMsForRuntimeCandidate(
  candidate,
  env = process.env,
  override = null,
  options = {},
) {
  const baseTimeoutMs = resolveProviderHttpTimeoutMs(env, override);
  if (
    Boolean(options?.hasDownstreamFallback) &&
    normalizeLlmProvider(candidate?.provider) === 'azure_openai'
  ) {
    return Math.min(baseTimeoutMs, DEFAULT_PROVIDER_TIMEOUT_WITH_FALLBACK_MS);
  }
  return baseTimeoutMs;
}

function applyInspectionGuardToToolDefinitions(tools) {
  return (Array.isArray(tools) ? tools : [])
    .filter((tool) => ['bash', 'write_file', 'edit_file'].includes(String(tool?.name || '').trim()))
    .map((tool) => {
      if (String(tool?.name || '').trim() === 'bash') {
        return {
          ...tool,
          description:
            `${tool.description} Quando o discovery estiver bloqueado, use bash apenas para checks ` +
            'materiais como npm test, npm run build ou diagnosticos diretamente ligados ao erro atual.',
        };
      }

      const suffix =
        ' Quando o discovery estiver bloqueado, use esta ferramenta para produzir uma mudanca material agora.';
      return {
        ...tool,
        description: `${tool.description}${suffix}`,
      };
    });
}

function applyReviewInspectionGuardToToolDefinitions(tools) {
  return (Array.isArray(tools) ? tools : [])
    .filter((tool) => String(tool?.name || '').trim() === 'bash')
    .map((tool) => ({
      ...tool,
      description:
        `${tool.description} Em review com discovery bloqueado, use bash apenas para rodar checks ` +
        'ou diagnosticos permitidos; nao reescreva a implementacao.',
    }));
}

function listAllowedToolNames(toolDefinitions = []) {
  return (Array.isArray(toolDefinitions) ? toolDefinitions : [])
    .map((tool) => String(tool?.name || '').trim())
    .filter(Boolean);
}

function createAllowedToolNameSet(toolDefinitions = []) {
  return new Set(listAllowedToolNames(toolDefinitions));
}

function buildDisallowedToolMessage(toolCall, toolDefinitions = [], options = {}) {
  const toolName = String(toolCall?.name || '').trim() || '[sem nome]';
  const allowedNames = listAllowedToolNames(toolDefinitions);
  const guidanceText = String(options.guidance || '').trim();
  const lines = [
    `Tool bloqueada nesta iteracao: ${toolName}.`,
    allowedNames.length > 0
      ? `Ferramentas permitidas agora: ${allowedNames.join(', ')}.`
      : 'Nenhuma ferramenta esta disponivel nesta iteracao.',
  ];

  if (options.inspectionGuardArmed) {
    lines.push(
      'Discovery esta bloqueado nesta lane. Produza uma mudanca material com edit_file/write_file ou use REQUEST_HELP para um bloqueio real.',
    );
  } else {
    lines.push(
      'Use apenas as ferramentas realmente anunciadas pelo runtime atual. Nao invente ou force chamadas fora do schema ativo.',
    );
  }

  if (guidanceText) {
    lines.push('Orientacao concreta:');
    lines.push(guidanceText);
  }

  return lines.join('\n');
}

function isBootstrapFoundationTaskContext(options = {}) {
  const taskId = String(options.taskId || '').trim().toUpperCase();
  const taskTitle = String(options.taskTitle || options.prompt || '').trim().toLowerCase();
  return (
    taskId === 'GH-1' ||
    taskTitle.includes('gtmny-001') ||
    (taskTitle.includes('bootstrap') &&
      taskTitle.includes('monorepo') &&
      taskTitle.includes('workspace'))
  );
}

function isBootstrapDocumentationTaskContext(options = {}) {
  const taskId = String(options.taskId || '').trim().toUpperCase();
  const taskTitle = String(options.taskTitle || options.prompt || '').trim().toLowerCase();
  return (
    taskId === 'NX-HELP-GH-27' ||
    taskTitle.includes('documentar convencoes') ||
    taskTitle.includes('validar bootstrap')
  );
}

async function workspacePathExists(workspaceDir, relativePath) {
  try {
    await fs.promises.access(path.join(workspaceDir, relativePath), fs.constants.F_OK);
    return true;
  } catch (_error) {
    return false;
  }
}

async function readWorkspaceFileIfExists(workspaceDir, relativePath) {
  try {
    return await fs.promises.readFile(path.join(workspaceDir, relativePath), 'utf8');
  } catch (_error) {
    return '';
  }
}

function normalizeGitStatusPath(rawPath) {
  const text = String(rawPath || '').trim();
  if (!text) return '';
  return text.includes(' -> ')
    ? normalizeSearchPath(text.split(' -> ').pop())
    : normalizeSearchPath(text);
}

async function collectMeaningfulChangedPaths(workspaceDir) {
  let result;
  try {
    result = await runCommand('git', ['status', '--short', '--untracked-files=all'], {
      cwd: workspaceDir,
      timeoutMs: Math.min(DEFAULT_BASH_TIMEOUT_MS, 30000),
      maxOutputChars: MAX_SEARCH_OUTPUT_CHARS,
    });
  } catch (_error) {
    return [];
  }

  return String(result.stdout || '')
    .split('\n')
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => normalizeGitStatusPath(line.slice(3)))
    .filter(Boolean)
    .filter((relativePath) => relativePath !== '.nexus-worktree.json')
    .filter((relativePath) => !relativePath.startsWith('.nexus/'));
}

async function runWorkspaceValidationCommands(workspaceDir, commands = []) {
  for (const command of commands) {
    const trimmed = String(command || '').trim();
    if (!trimmed) continue;
    try {
      await runCommand('bash', ['-lc', trimmed], {
        cwd: workspaceDir,
        timeoutMs: DEFAULT_BASH_TIMEOUT_MS,
        maxOutputChars: MAX_TOOL_OUTPUT_CHARS,
      });
    } catch (error) {
      const commandResult = error.result;
      return {
        ok: false,
        command: trimmed,
        message: [
          error.message,
          commandResult?.stdout ? `stdout:\n${commandResult.stdout}` : null,
          commandResult?.stderr ? `stderr:\n${commandResult.stderr}` : null,
        ].filter(Boolean).join('\n\n'),
      };
    }
  }

  return {
    ok: true,
  };
}

function resolveExpectedGameFactorySlug(options = {}) {
  const text = [
    options.prompt,
    options.taskTitle,
    options.recoveryHint,
  ]
    .filter(Boolean)
    .join('\n');

  const pathMatch = text.match(/games\/([a-z0-9-]+)\//i);
  if (pathMatch) return pathMatch[1];

  const helperMatch = text.match(/create-compact-game\.mjs\s+([a-z0-9-]+)/i);
  if (helperMatch) return helperMatch[1];

  return null;
}

function titleCaseGameFactoryText(value = '') {
  const keepLower = new Set(['a', 'an', 'and', 'at', 'for', 'in', 'of', 'on', 'or', 'the', 'to', 'with']);
  return String(value || '')
    .replace(/[-_]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean)
    .map((word, index) => {
      const lower = word.toLowerCase();
      if (index > 0 && keepLower.has(lower)) return lower;
      return `${lower.slice(0, 1).toUpperCase()}${lower.slice(1)}`;
    })
    .join(' ');
}

function resolveGameFactoryAutoTitle(expectedSlug, options = {}) {
  const taskTitle = String(options.taskTitle || '').trim();
  const titleMatch = taskTitle.match(/playable\s+html5\s+game:\s*([^\n]+)/i);
  if (titleMatch?.[1]) {
    return titleCaseGameFactoryText(titleMatch[1]).slice(0, 96);
  }

  const withoutNumericSuffix = String(expectedSlug || '').replace(/-\d+$/u, '');
  return titleCaseGameFactoryText(withoutNumericSuffix || expectedSlug).slice(0, 96);
}

function resolveGameFactoryAutoArtPrompt(expectedSlug, options = {}) {
  const text = [
    options.prompt,
    options.taskTitle,
    options.recoveryHint,
  ]
    .filter(Boolean)
    .join('\n');
  const artDirection = text.match(/Art direction:\s*([^\n]+)/i)?.[1];
  const theme = text.match(/Theme:\s*([^\n]+)/i)?.[1];
  return [
    resolveGameFactoryAutoTitle(expectedSlug, options),
    artDirection,
    theme,
    'premium playable HTML5 game screen',
    'beautiful high contrast HUD',
    'responsive game UI',
    'no text, no logo, no watermark in background art',
  ]
    .filter(Boolean)
    .join(', ')
    .slice(0, 800);
}

function isGameFactoryAutoMaterializeEnabled(options = {}) {
  const env = options.env || process.env;
  const value = String(
    env.NEXUS_GAME_FACTORY_AUTOMATERIALIZE_ENABLED ??
      env.NEXUS_GAME_FACTORY_AUTO_MATERIALIZE_ENABLED ??
      'false',
  ).trim().toLowerCase();
  return ['1', 'true', 'yes', 'on'].includes(value);
}

async function tryMaterializeGameFactoryBaseline(
  workspaceDir,
  expectedSlug,
  options = {},
  onEvent = () => {},
) {
  if (!isGameFactoryAutoMaterializeEnabled(options)) {
    return false;
  }
  if (!expectedSlug || readGameCatalogHasSlug(workspaceDir, expectedSlug)) {
    return false;
  }
  if (
    String(options.taskStatus || '').trim() === 'in_review' ||
    isReviewTaskTitle(options.taskTitle || options.prompt)
  ) {
    return false;
  }
  if (!(await workspacePathExists(workspaceDir, 'scripts/create-compact-game.mjs'))) {
    return false;
  }

  const title = resolveGameFactoryAutoTitle(expectedSlug, options);
  const artPrompt = resolveGameFactoryAutoArtPrompt(expectedSlug, options);
  onEvent({
    type: 'status',
    message:
      `Auto-materializacao da game factory para ${expectedSlug}: ` +
      'rodando create-compact-game com asset local/ComfyUI e baseline premium validavel.',
  });

  let result;
  try {
    result = await runCommand(
      process.execPath,
      ['scripts/create-compact-game.mjs', expectedSlug, title, artPrompt],
      {
        cwd: workspaceDir,
        env: options.env || process.env,
        timeoutMs:
          Math.max(
            DEFAULT_BASH_TIMEOUT_MS,
            Number((options.env || process.env).NEXUS_GAME_FACTORY_AUTOMATERIALIZE_TIMEOUT_MS || 0),
            600000,
          ),
        maxOutputChars: MAX_TOOL_OUTPUT_CHARS,
      },
    );
  } catch (error) {
    onEvent({
      type: 'status',
      message:
        `Auto-materializacao da game factory falhou para ${expectedSlug}: ` +
        previewText(error.message || String(error), 400),
    });
    return false;
  }

  if (result.code !== 0) {
    onEvent({
      type: 'status',
      message:
        `Auto-materializacao da game factory falhou para ${expectedSlug} com exitCode ${result.code}. ` +
        previewText([result.stdout, result.stderr].filter(Boolean).join('\n'), 500),
    });
    return false;
  }

  onEvent({
    type: 'status',
    message:
      `Auto-materializacao da game factory concluida para ${expectedSlug}. ` +
      previewText(result.stdout || result.stderr || 'helper executado', 300),
  });
  return true;
}

async function tryAutoCloseoutFromWorkspace(workspaceDir, options = {}, onEvent = () => {}) {
  if (isBootstrapFoundationTaskContext(options)) {
    const missingArtifacts = [];
    for (const relativePath of BOOTSTRAP_FOUNDATION_ARTIFACTS) {
      // eslint-disable-next-line no-await-in-loop
      if (!(await workspacePathExists(workspaceDir, relativePath))) {
        missingArtifacts.push(relativePath);
      }
    }
    if (missingArtifacts.length > 0) {
      return null;
    }

    const changedPaths = await collectMeaningfulChangedPaths(workspaceDir);

    const validation = await runWorkspaceValidationCommands(workspaceDir, [
      'sh -n ./scripts/bootstrap.sh',
      './scripts/bootstrap.sh',
    ]);
    if (!validation.ok) {
      onEvent({
        type: 'status',
        message:
          `Auto-closeout do bootstrap abortado: o check "${validation.command}" falhou. ` +
          `${previewText(validation.message, 400)}`,
      });
      return null;
    }

    onEvent({
      type: 'status',
      message:
        changedPaths.length > 0
          ? 'Auto-closeout do bootstrap acionado: artefatos estruturais presentes, workspace validado e diff material detectado.'
          : 'Auto-closeout do bootstrap acionado: artefatos estruturais presentes e bootstrap validado em um workspace ja alinhado.',
    });
    return {
      ok: true,
      text: 'NEXUS_TASK_COMPLETE',
      toolCalls: [],
      finishReason: 'auto_closeout_bootstrap_foundation',
    };
  }

  if (isBootstrapDocumentationTaskContext(options)) {
    const [workspaceConventionsExists, bootstrapScriptExists] = await Promise.all([
      workspacePathExists(workspaceDir, 'docs/WORKSPACE_CONVENTIONS.md'),
      workspacePathExists(workspaceDir, 'scripts/bootstrap.sh'),
    ]);
    if (!workspaceConventionsExists || !bootstrapScriptExists) {
      return null;
    }

    const readme = await readWorkspaceFileIfExists(workspaceDir, 'README.md');
    if (!/WORKSPACE_CONVENTIONS\.md/.test(readme)) {
      return null;
    }

    const validation = await runWorkspaceValidationCommands(workspaceDir, [
      'sh -n ./scripts/bootstrap.sh',
      './scripts/bootstrap.sh',
    ]);
    if (!validation.ok) {
      onEvent({
        type: 'status',
        message:
          `Auto-closeout da documentação abortado: o check "${validation.command}" falhou. ` +
          `${previewText(validation.message, 400)}`,
      });
      return null;
    }

    onEvent({
      type: 'status',
      message:
        'Auto-closeout da documentação acionado: convenções e validação do bootstrap já estão presentes no workspace.',
    });
    return {
      ok: true,
      text: 'NEXUS_TASK_COMPLETE',
      toolCalls: [],
      finishReason: 'auto_closeout_bootstrap_documentation',
    };
  }

  if (isGameFactoryToolContext(options)) {
    const expectedSlug = resolveExpectedGameFactorySlug(options);
    if (!expectedSlug) {
      return null;
    }

    const [validateScriptExists, catalogText] = await Promise.all([
      workspacePathExists(workspaceDir, 'scripts/validate-games.mjs'),
      readWorkspaceFileIfExists(workspaceDir, 'games/index.json'),
    ]);
    if (!validateScriptExists) {
      return null;
    }

    let catalog = safeJsonParse(catalogText, []);
    if (!Array.isArray(catalog) || catalog.length < 1) {
      catalog = [];
    }
    if (!catalog.some((entry) => String(entry?.slug || '').trim() === expectedSlug)) {
      if (options.allowGameFactoryAutoMaterialize) {
        const materialized = await tryMaterializeGameFactoryBaseline(
          workspaceDir,
          expectedSlug,
          options,
          onEvent,
        );
        if (materialized) {
          catalog = safeJsonParse(await readWorkspaceFileIfExists(workspaceDir, 'games/index.json'), []);
        }
      }
    }
    if (!catalog.some((entry) => String(entry?.slug || '').trim() === expectedSlug)) {
      return null;
    }

    const validationCommands = ['npm test'];
    if (await workspacePathExists(workspaceDir, 'scripts/validate-curated-mobile.mjs')) {
      validationCommands.push(`node scripts/validate-curated-mobile.mjs ${expectedSlug}`);
    }
    validationCommands.push('npm run build');

    const validation = await runWorkspaceValidationCommands(workspaceDir, validationCommands);
    if (!validation.ok) {
      onEvent({
        type: 'status',
        message:
          `Auto-closeout da game factory abortado: o check "${validation.command}" falhou. ` +
          `${previewText(validation.message, 400)}`,
      });
      return null;
    }

    onEvent({
      type: 'status',
      message:
        `Auto-closeout da game factory acionado para ${expectedSlug}: catalogo tem o slug e os gates de qualidade passaram.`,
    });
    return {
      ok: true,
      text: 'NEXUS_TASK_COMPLETE',
      toolCalls: [],
      finishReason: 'auto_closeout_game_factory',
    };
  }

  return null;
}

function safeJsonParse(input, fallback = {}) {
  if (typeof input !== 'string') return input && typeof input === 'object' ? input : fallback;
  try {
    return JSON.parse(input);
  } catch (_error) {
    return fallback;
  }
}

function stripMarkdownFence(text) {
  const trimmed = String(text || '').trim();
  const fencedMatch = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch) {
    return fencedMatch[1].trim();
  }
  return trimmed;
}

function inferToolCallFromObject(candidate, index = 0) {
  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    return null;
  }

  const explicitName = String(
    candidate.tool || candidate.toolName || candidate.name || '',
  )
    .trim()
    .replace(/^functions\./i, '')
    .replace(/^tools?\./i, '');
  const explicitInput = candidate.input || candidate.arguments || candidate.params || candidate.args;

  const buildToolCall = (name, input) => ({
    id: `synthetic_tool_${Date.now()}_${index}`,
    name,
    input,
  });

  if (explicitName) {
    const payload = explicitInput && typeof explicitInput === 'object'
      ? explicitInput
      : { ...candidate };
    delete payload.tool;
    delete payload.toolName;
    delete payload.name;
    delete payload.input;
    delete payload.arguments;
    delete payload.params;
    delete payload.args;
    return buildToolCall(explicitName, payload);
  }

  if (typeof candidate.command === 'string' && candidate.command.trim()) {
    return buildToolCall('bash', {
      command: candidate.command,
      ...(candidate.timeoutMs ? { timeoutMs: candidate.timeoutMs } : {}),
    });
  }

  if (typeof candidate.path === 'string' && typeof candidate.content === 'string') {
    return buildToolCall('write_file', {
      path: candidate.path,
      content: candidate.content,
    });
  }

  if (
    typeof candidate.path === 'string' &&
    typeof candidate.oldText === 'string' &&
    typeof candidate.newText === 'string'
  ) {
    return buildToolCall('edit_file', {
      path: candidate.path,
      oldText: candidate.oldText,
      newText: candidate.newText,
      ...(Object.prototype.hasOwnProperty.call(candidate, 'replaceAll')
        ? { replaceAll: Boolean(candidate.replaceAll) }
        : {}),
    });
  }

  if (typeof candidate.pattern === 'string' && typeof candidate.path === 'string') {
    return buildToolCall('grep_search', {
      pattern: candidate.pattern,
      path: candidate.path,
      ...(candidate.maxResults ? { maxResults: candidate.maxResults } : {}),
    });
  }

  if (typeof candidate.pattern === 'string') {
    return buildToolCall('glob_search', {
      pattern: candidate.pattern,
    });
  }

  if (typeof candidate.path === 'string') {
    return buildToolCall('read_file', {
      path: candidate.path,
      ...(candidate.startLine ? { startLine: candidate.startLine } : {}),
      ...(candidate.endLine ? { endLine: candidate.endLine } : {}),
    });
  }

  return null;
}

function extractSyntheticToolCallsFromText(text) {
  const cleanedText = stripMarkdownFence(text);
  const parsed = safeJsonParse(cleanedText, null);
  let candidates = [];

  if (parsed) {
    candidates = Array.isArray(parsed) ? parsed : [parsed];
  } else {
    const lineCandidates = cleanedText
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean)
      .map((line) => safeJsonParse(line, null));

    if (lineCandidates.length && lineCandidates.every(Boolean)) {
      candidates = lineCandidates;
    }
  }

  if (!candidates.length) return [];

  const syntheticCalls = candidates
    .map((candidate, index) => inferToolCallFromObject(candidate, index))
    .filter(Boolean);

  return syntheticCalls.length === candidates.length ? syntheticCalls : [];
}

function shouldRetryWithMaxCompletionTokens(error) {
  const text = `${error?.message || ''}\n${error?.stderr || ''}`.toLowerCase();
  return (
    text.includes("'max_tokens' is not supported") &&
    text.includes('max_completion_tokens')
  );
}

function shouldRetryWithMaxTokens(error) {
  const text = `${error?.message || ''}\n${error?.stderr || ''}`.toLowerCase();
  return (
    text.includes("'max_completion_tokens' is not supported") &&
    text.includes('max_tokens')
  );
}

function parseContextLimitRetry(error, body, triedLimits = new Set()) {
  const text = `${error?.message || ''}\n${error?.stderr || ''}`;
  if (!/maximum context length/i.test(text)) return null;

  const field = Object.prototype.hasOwnProperty.call(body, 'max_completion_tokens')
    ? 'max_completion_tokens'
    : 'max_tokens';
  const currentLimit = Number(body[field]);
  if (!Number.isFinite(currentLimit) || currentLimit <= 1) return null;

  const maxMatch = text.match(/maximum context length is\s+(\d+)/i);
  const inputMatch = text.match(/prompt contains at least\s+(\d+)\s+input tokens/i);
  const maxContext = maxMatch ? Number.parseInt(maxMatch[1], 10) : null;
  const inputTokens = inputMatch ? Number.parseInt(inputMatch[1], 10) : null;

  let nextLimit = Math.floor(currentLimit / 2);
  if (
    Number.isFinite(maxContext) &&
    Number.isFinite(inputTokens) &&
    maxContext > 0 &&
    inputTokens > 0
  ) {
    const remainingWithMargin = maxContext - inputTokens - 128;
    const remainingHardLimit = maxContext - inputTokens - 1;
    const remaining = remainingWithMargin > 0 ? remainingWithMargin : remainingHardLimit;
    if (remaining <= 0) return null;
    nextLimit = Math.min(nextLimit, remaining);
  }

  nextLimit = Math.max(128, Math.floor(nextLimit));
  if (nextLimit >= currentLimit) return null;

  const retryKey = `${field}:${nextLimit}`;
  if (triedLimits.has(retryKey)) return null;
  triedLimits.add(retryKey);

  return {
    ...body,
    [field]: nextLimit,
  };
}

function prefersMaxCompletionTokens(model) {
  const normalized = String(model || '').trim().toLowerCase();
  return normalized.startsWith('gpt-5') && !normalized.startsWith('gpt-5-chat');
}

function withModelTokenLimit(model, body) {
  const nextBody = { ...body };
  delete nextBody.max_tokens;
  delete nextBody.max_completion_tokens;

  if (prefersMaxCompletionTokens(model)) {
    nextBody.max_completion_tokens = DEFAULT_MAX_TOKENS;
  } else {
    nextBody.max_tokens = DEFAULT_MAX_TOKENS;
  }

  return nextBody;
}

function isPathInsideWorkspace(workspaceDir, targetPath) {
  const relative = path.relative(workspaceDir, targetPath);
  return relative === '' || (!relative.startsWith('..') && !path.isAbsolute(relative));
}

function resolveWorkspacePath(workspaceDir, requestedPath) {
  const normalizedWorkspace = path.resolve(String(workspaceDir || '.'));
  const inputPath = String(requestedPath || '').trim();
  if (!inputPath) {
    throw new Error('Campo obrigatório: path.');
  }

  const resolvedPath = path.isAbsolute(inputPath)
    ? path.resolve(inputPath)
    : path.resolve(normalizedWorkspace, inputPath);
  if (!isPathInsideWorkspace(normalizedWorkspace, resolvedPath)) {
    throw new Error(`Path fora do workspace não permitido: ${inputPath}`);
  }
  return resolvedPath;
}

function formatFileSnippet(content, startLine) {
  const lines = String(content || '').split('\n');
  return lines
    .map((line, index) => `${String(startLine + index).padStart(4, ' ')} | ${line}`)
    .join('\n')
    .trim();
}

function normalizeSearchPath(value) {
  return String(value || '')
    .split(path.sep)
    .join('/')
    .replace(/^\.\/+/, '')
    .trim();
}

function isProtectedWorkspaceMutationPath(workspaceDir, requestedPath) {
  let resolvedPath;

  try {
    resolvedPath = resolveWorkspacePath(workspaceDir, requestedPath);
  } catch (_error) {
    return false;
  }

  const relativePath = normalizeSearchPath(path.relative(workspaceDir, resolvedPath) || '.');
  return CONTROL_PLANE_MUTATION_PREFIXES.some(
    (prefix) => relativePath === prefix || relativePath.startsWith(`${prefix}/`),
  );
}

function escapeRegExp(value) {
  return String(value || '').replace(/[|\\{}()[\]^$+?.]/g, '\\$&');
}

function buildGlobPatternRegExp(pattern) {
  const normalizedPattern = normalizeSearchPath(pattern);
  let expression = '^';

  for (let index = 0; index < normalizedPattern.length; index += 1) {
    const current = normalizedPattern[index];
    const next = normalizedPattern[index + 1];

    if (current === '*') {
      if (next === '*') {
        const afterDoubleStar = normalizedPattern[index + 2];
        index += 1;
        if (afterDoubleStar === '/') {
          index += 1;
          expression += '(?:.*\\/)?';
        } else {
          expression += '.*';
        }
      } else {
        expression += '[^/]*';
      }
      continue;
    }

    if (current === '?') {
      expression += '[^/]';
      continue;
    }

    expression += escapeRegExp(current);
  }

  expression += '$';
  return new RegExp(expression);
}

function matchesGlobPattern(relativePath, pattern) {
  const normalizedPath = normalizeSearchPath(relativePath);
  const normalizedPattern = normalizeSearchPath(pattern);

  if (typeof path.matchesGlob === 'function') {
    try {
      return path.matchesGlob(normalizedPath, normalizedPattern);
    } catch (_error) {
      // Fallback para runtimes sem suporte total ao padrão.
    }
  }

  return buildGlobPatternRegExp(normalizedPattern).test(normalizedPath);
}

async function collectWorkspaceFiles(workspaceDir, targetPath) {
  const root = path.resolve(targetPath);
  const results = [];
  const stack = [root];

  while (stack.length > 0) {
    const currentPath = stack.pop();
    let stats;

    try {
      stats = await fs.promises.lstat(currentPath);
    } catch (_error) {
      continue;
    }

    if (stats.isSymbolicLink()) {
      continue;
    }

    if (stats.isDirectory()) {
      let entries = [];
      try {
        entries = await fs.promises.readdir(currentPath, { withFileTypes: true });
      } catch (_error) {
        continue;
      }

      entries.sort((left, right) => left.name.localeCompare(right.name));
      for (let index = entries.length - 1; index >= 0; index -= 1) {
        const entry = entries[index];
        if (entry.name === '.git' || entry.name === 'node_modules') {
          continue;
        }
        stack.push(path.join(currentPath, entry.name));
      }
      continue;
    }

    if (stats.isFile()) {
      if (isPathInsideWorkspace(workspaceDir, currentPath)) {
        results.push(currentPath);
      }
    }
  }

  results.sort((left, right) =>
    normalizeSearchPath(path.relative(workspaceDir, left)).localeCompare(
      normalizeSearchPath(path.relative(workspaceDir, right)),
    ),
  );
  return results;
}

async function executeGlobSearchFallback(workspaceDir, pattern) {
  const files = await collectWorkspaceFiles(workspaceDir, workspaceDir);
  const matches = files
    .map((filePath) => normalizeSearchPath(path.relative(workspaceDir, filePath)))
    .filter((relativePath) => matchesGlobPattern(relativePath, pattern))
    .slice(0, MAX_SEARCH_RESULTS);

  return matches.length > 0 ? matches.join('\n') : '[sem resultados]';
}

async function executeGrepSearchFallback(workspaceDir, resolvedPath, pattern, maxResults) {
  let expression;

  try {
    expression = new RegExp(pattern);
  } catch (error) {
    throw new Error(`Pattern inválido para grep_search: ${error.message}`);
  }

  const files = await collectWorkspaceFiles(workspaceDir, resolvedPath);
  const matches = [];

  for (const filePath of files) {
    let content = '';

    try {
      content = await fs.promises.readFile(filePath, 'utf8');
    } catch (_error) {
      continue;
    }

    const relativePath = normalizeSearchPath(path.relative(workspaceDir, filePath));
    const lines = content.split('\n');

    for (let index = 0; index < lines.length; index += 1) {
      expression.lastIndex = 0;
      if (!expression.test(lines[index])) {
        continue;
      }

      matches.push(`${relativePath}:${index + 1}:${lines[index]}`);
      if (matches.length >= maxResults) {
        return truncateText(matches.join('\n'), MAX_SEARCH_OUTPUT_CHARS);
      }
    }
  }

  return matches.length > 0
    ? truncateText(matches.join('\n'), MAX_SEARCH_OUTPUT_CHARS)
    : '[sem resultados]';
}

async function runCommand(command, args, options = {}) {
  const timeoutMs = Math.max(1000, Number(options.timeoutMs) || DEFAULT_BASH_TIMEOUT_MS);
  const maxOutputChars = Math.max(1000, Number(options.maxOutputChars) || MAX_TOOL_OUTPUT_CHARS);

  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd || process.cwd(),
      env: buildCommandEnv(options.env || process.env),
      stdio: ['ignore', 'pipe', 'pipe'],
      shell: false,
    });

    let stdout = '';
    let stderr = '';
    let settled = false;
    let timedOut = false;

    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    const appendChunk = (target, chunk) => {
      const next = `${target}${chunk.toString()}`;
      return next.length > maxOutputChars ? next.slice(0, maxOutputChars) : next;
    };

    child.stdout.on('data', (chunk) => {
      stdout = appendChunk(stdout, chunk);
    });

    child.stderr.on('data', (chunk) => {
      stderr = appendChunk(stderr, chunk);
    });

    child.on('error', (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      reject(error);
    });

    child.on('close', (code, signal) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      const result = {
        code: Number.isInteger(code) ? code : 1,
        signal: signal || null,
        stdout: stdout.trim(),
        stderr: stderr.trim(),
        timedOut,
      };

      if (timedOut) {
        const error = new Error(`Comando excedeu o timeout de ${timeoutMs}ms.`);
        error.result = result;
        reject(error);
        return;
      }

      resolve(result);
    });
  });
}

async function executeReadFileTool(workspaceDir, input) {
  const filePath = resolveWorkspacePath(workspaceDir, input.path);
  const stats = await fs.promises.stat(filePath);

  if (stats.isDirectory()) {
    const entries = await fs.promises.readdir(filePath, { withFileTypes: true });
    return entries
      .slice(0, MAX_SEARCH_RESULTS)
      .map((entry) => `${entry.isDirectory() ? '[dir]' : '[file]'} ${entry.name}`)
      .join('\n');
  }

  const raw = await fs.promises.readFile(filePath, 'utf8');
  if (!raw) return '[arquivo vazio]';

  const lines = raw.split('\n');
  const startLine = Math.max(1, Number(input.startLine) || 1);
  const endLine = Math.min(
    lines.length,
    Number(input.endLine) > 0 ? Number(input.endLine) : lines.length,
  );
  const slice = lines.slice(startLine - 1, endLine);
  const snippet = formatFileSnippet(slice.join('\n'), startLine);
  return truncateText(snippet, MAX_READ_FILE_CHARS);
}

async function executeWriteFileTool(workspaceDir, input) {
  const filePath = resolveWorkspacePath(workspaceDir, input.path);
  const content = String(input.content || '');
  if (containsHistoryOmissionMarker(content)) {
    throw new Error(
      'write_file recusado: o content recebido é um marcador compactado do histórico, não conteúdo real. ' +
        'Reenvie o arquivo completo com o conteúdo literal que deve ser salvo.',
    );
  }
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content, 'utf8');
  return `Arquivo salvo em ${path.relative(workspaceDir, filePath) || path.basename(filePath)} (${content.length} chars).`;
}

async function executeEditFileTool(workspaceDir, input) {
  const filePath = resolveWorkspacePath(workspaceDir, input.path);
  const oldText = String(input.oldText || '');
  const newText = String(input.newText || '');
  const replaceAll = Boolean(input.replaceAll);

  if (containsHistoryOmissionMarker(oldText) || containsHistoryOmissionMarker(newText)) {
    throw new Error(
      'edit_file recusado: oldText/newText recebeu marcador compactado do histórico, não texto real. ' +
        'Reenvie os trechos literais completos.',
    );
  }

  if (!oldText) {
    throw new Error('edit_file requer oldText não vazio.');
  }

  const original = await fs.promises.readFile(filePath, 'utf8');
  const occurrences = original.split(oldText).length - 1;
  if (occurrences === 0) {
    throw new Error(`Trecho oldText não encontrado em ${path.relative(workspaceDir, filePath)}.`);
  }
  if (occurrences > 1 && !replaceAll) {
    throw new Error(
      `Trecho oldText apareceu ${occurrences} vezes em ${path.relative(workspaceDir, filePath)}. Use replaceAll=true ou leia mais contexto.`,
    );
  }

  const nextContent = replaceAll
    ? original.split(oldText).join(newText)
    : original.replace(oldText, newText);

  await fs.promises.writeFile(filePath, nextContent, 'utf8');
  return `Arquivo editado em ${path.relative(workspaceDir, filePath)} (${replaceAll ? occurrences : 1} substituição(ões)).`;
}

function containsHistoryOmissionMarker(value) {
  const text = String(value || '');
  return (
    /\[(?:write_file content|edit_file (?:oldText|newText)) omitted from conversation history: \d+ chars already sent to the tool\]/.test(text) ||
    /\[NEXUS_PAYLOAD_OMITTED:[^\]]+already applied by the tool; do not copy this placeholder\]/.test(text)
  );
}

async function executeBashTool(workspaceDir, input, options = {}) {
  const command = String(input.command || '').trim();
  const timeoutMs = Math.max(1000, Number(input.timeoutMs) || DEFAULT_BASH_TIMEOUT_MS);
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;

  if (!command) {
    throw new Error('bash requer command.');
  }

  if (hasUnsupportedBashMutationSyntax(command)) {
    const message =
      'Comando bash recusado: heredoc e redirecionamento de escrita multilinha causam churn no runtime. ' +
      'Use write_file/edit_file para criar ou editar arquivos e deixe bash apenas para execucao, teste e diagnostico.';
    if (onEvent) {
      onEvent({
        type: 'tool_policy',
        toolName: 'bash',
        verdict: 'block',
        message,
        command,
      });
    }
    throw new Error(message);
  }

  const policy = evaluateCommandRisk(command, {
    approvalMode: options.approvalMode,
    env: options.env || process.env,
  });
  if (policy.verdict === 'warn' || policy.verdict === 'block') {
    if (onEvent) {
      onEvent({
        type: 'tool_policy',
        toolName: 'bash',
        verdict: policy.verdict,
        message: policy.summary,
        command,
      });
    }
  }
  if (policy.verdict === 'block') {
    throw new Error(`Comando bloqueado por policy: ${policy.summary || 'padrão crítico detectado.'}`);
  }

  const result = await runCommand('bash', ['-lc', command], {
    cwd: workspaceDir,
    timeoutMs,
    maxOutputChars: MAX_TOOL_OUTPUT_CHARS,
  });

  const sections = [
    `exitCode: ${result.code}`,
    result.stdout ? `stdout:\n${result.stdout}` : null,
    result.stderr ? `stderr:\n${result.stderr}` : null,
  ].filter(Boolean);

  const output = sections.join('\n\n');
  if (result.code !== 0) {
    throw new Error(output || `Comando falhou com exitCode ${result.code}.`);
  }

  return output || `exitCode: ${result.code}`;
}

async function executeGlobSearchTool(workspaceDir, input) {
  const pattern = String(input.pattern || '').trim();
  if (!pattern) {
    throw new Error('glob_search requer pattern.');
  }

  let result;
  try {
    result = await runCommand('rg', ['--files', '-g', pattern], {
      cwd: workspaceDir,
      timeoutMs: Math.min(DEFAULT_BASH_TIMEOUT_MS, 30000),
      maxOutputChars: MAX_SEARCH_OUTPUT_CHARS,
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return executeGlobSearchFallback(workspaceDir, pattern);
    }
    throw error;
  }

  if (result.code !== 0 && !result.stdout) {
    throw new Error(result.stderr || `Nenhum arquivo encontrado para ${pattern}.`);
  }

  const lines = String(result.stdout || '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, MAX_SEARCH_RESULTS);

  return lines.length ? lines.join('\n') : '[sem resultados]';
}

async function executeGrepSearchTool(workspaceDir, input) {
  const pattern = String(input.pattern || '').trim();
  const targetPath = String(input.path || '.').trim() || '.';
  const maxResults = Math.max(1, Math.min(MAX_SEARCH_RESULTS, Number(input.maxResults) || 80));

  if (!pattern) {
    throw new Error('grep_search requer pattern.');
  }

  const resolvedPath = resolveWorkspacePath(workspaceDir, targetPath === '.' ? '.' : targetPath);
  const relativeTarget = path.relative(workspaceDir, resolvedPath) || '.';
  const args = [
    '-n',
    '--hidden',
    '--glob',
    '!.git',
    '--glob',
    '!node_modules',
    '--max-count',
    String(maxResults),
    pattern,
    relativeTarget,
  ];

  let result;
  try {
    result = await runCommand('rg', args, {
      cwd: workspaceDir,
      timeoutMs: Math.min(DEFAULT_BASH_TIMEOUT_MS, 30000),
      maxOutputChars: MAX_SEARCH_OUTPUT_CHARS,
    });
  } catch (error) {
    if (error?.code === 'ENOENT') {
      return executeGrepSearchFallback(workspaceDir, resolvedPath, pattern, maxResults);
    }
    throw error;
  }

  if (result.code !== 0 && !result.stdout) {
    return '[sem resultados]';
  }

  return truncateText(result.stdout || '[sem resultados]', MAX_SEARCH_OUTPUT_CHARS);
}

async function executeFigmaGetFileTool(input, options = {}) {
  const payload = await getFigmaFileSummary(input, {
    env: options.env || process.env,
    fetchImpl: options.fetchImpl,
  });
  return truncateText(JSON.stringify(payload, null, 2), MAX_TOOL_OUTPUT_CHARS);
}

async function executeFigmaGetNodeContextTool(input, options = {}) {
  const payload = await getFigmaNodeContext(input, {
    env: options.env || process.env,
    fetchImpl: options.fetchImpl,
  });
  return truncateText(JSON.stringify(payload, null, 2), MAX_TOOL_OUTPUT_CHARS);
}

async function executeFigmaGetImageRefsTool(input, options = {}) {
  const payload = await getFigmaImageRefs(input, {
    env: options.env || process.env,
    fetchImpl: options.fetchImpl,
  });
  return truncateText(JSON.stringify(payload, null, 2), MAX_TOOL_OUTPUT_CHARS);
}

async function executeStitchStatusTool(_input, options = {}) {
  const payload = getStitchBridgeStatus({
    env: options.env || process.env,
    probeAdc: true,
  });
  return truncateText(JSON.stringify(payload, null, 2), MAX_TOOL_OUTPUT_CHARS);
}

async function executeStitchListToolsTool(_input, options = {}) {
  const payload = await listStitchTools({
    env: options.env || process.env,
    fetchImpl: options.fetchImpl,
  });
  return truncateText(JSON.stringify(payload, null, 2), MAX_TOOL_OUTPUT_CHARS);
}

async function executeStitchCallTool(input, options = {}) {
  const toolName = String(input.toolName || '').trim();
  if (!toolName) {
    throw new Error('stitch_call_tool requer toolName.');
  }

  const payload = await callStitchTool(toolName, normalizeStitchToolArgs(input), {
    env: options.env || process.env,
    fetchImpl: options.fetchImpl,
  });
  return truncateText(JSON.stringify(payload, null, 2), MAX_TOOL_OUTPUT_CHARS);
}

function createToolDefinitions(options = {}) {
  const shellRecoveryMode = Boolean(options.shellRecoveryMode);
  const enabledMcps = new Set(
    (Array.isArray(options.enabledMcps) ? options.enabledMcps : [])
      .map((value) => String(value || '').trim().toLowerCase())
      .filter(Boolean),
  );
  let toolDefinitions = [
    {
      name: 'bash',
      description:
        shellRecoveryMode
          ? 'Modo de recuperacao de shell ativo. Use bash apenas para leitura, testes e diagnostico. Nunca crie/edite arquivos por bash, nunca use heredoc/redirecionamento e nunca use pgrep; prefira write_file/edit_file.'
          : 'Executa um comando bash dentro do workspace isolado. Use para testes, builds, git status, install e inspeções rápidas. Não use bash para criar/editar arquivos com heredoc; prefira write_file/edit_file.',
      input_schema: {
        type: 'object',
        properties: {
          command: { type: 'string', description: 'Comando completo a executar.' },
          timeoutMs: { type: 'integer', minimum: 1000, maximum: 120000 },
        },
        required: ['command'],
        additionalProperties: false,
      },
    },
    {
      name: 'read_file',
      description:
        'Lê um arquivo do workspace com numeração de linhas. Pode ler um diretório para listar entradas.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          startLine: { type: 'integer', minimum: 1 },
          endLine: { type: 'integer', minimum: 1 },
        },
        required: ['path'],
        additionalProperties: false,
      },
    },
    {
      name: 'write_file',
      description:
        'Cria ou sobrescreve um arquivo inteiro dentro do workspace. Use quando quiser substituir o conteúdo completo.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
        additionalProperties: false,
      },
    },
    {
      name: 'edit_file',
      description:
        'Edita um arquivo substituindo oldText por newText. Se houver múltiplas ocorrências, use replaceAll=true ou leia mais contexto primeiro.',
      input_schema: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          oldText: { type: 'string' },
          newText: { type: 'string' },
          replaceAll: { type: 'boolean' },
        },
        required: ['path', 'oldText', 'newText'],
        additionalProperties: false,
      },
    },
    {
      name: 'glob_search',
      description:
        'Procura arquivos por padrão glob usando rg --files. Útil para localizar arquivos e módulos rapidamente.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
    },
    {
      name: 'grep_search',
      description:
        'Procura texto em arquivos do workspace com rg -n. Útil para achar símbolos, rotas, strings e funções.',
      input_schema: {
        type: 'object',
        properties: {
          pattern: { type: 'string' },
          path: { type: 'string' },
          maxResults: { type: 'integer', minimum: 1, maximum: MAX_SEARCH_RESULTS },
        },
        required: ['pattern'],
        additionalProperties: false,
      },
    },
  ];

  if (enabledMcps.has('figma')) {
    toolDefinitions = toolDefinitions.concat([
      {
        name: 'figma_get_file',
        description:
          'Consulta metadados de um arquivo Figma ou de uma URL figma.com/design/... Requer FIGMA_ACCESS_TOKEN e serve para descobrir páginas, fileKey e nodes candidatos.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            fileKey: { type: 'string' },
            depth: { type: 'integer', minimum: 1, maximum: 6 },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'figma_get_node_context',
        description:
          'Obtém um resumo estrutural de um node do Figma com layout, textos, cores e referências de componentes. Use esta como ferramenta principal para implementar telas vindas do Figma.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            fileKey: { type: 'string' },
            nodeId: { type: 'string' },
            nodeIds: { type: 'string' },
            maxDepth: { type: 'integer', minimum: 1, maximum: 8 },
            maxChildrenPerNode: { type: 'integer', minimum: 1, maximum: 24 },
            maxTotalNodes: { type: 'integer', minimum: 10, maximum: 400 },
          },
          additionalProperties: false,
        },
      },
      {
        name: 'figma_get_image_refs',
        description:
          'Gera URLs temporárias de imagem para nodes do Figma. Útil para conferência visual pontual depois de extrair o contexto estrutural.',
        input_schema: {
          type: 'object',
          properties: {
            url: { type: 'string' },
            fileKey: { type: 'string' },
            nodeId: { type: 'string' },
            nodeIds: { type: 'string' },
            format: { type: 'string' },
            scale: { type: 'number', minimum: 0.1, maximum: 4 },
            useAbsoluteBounds: { type: 'boolean' },
          },
          additionalProperties: false,
        },
      },
    ]);
  }

  if (enabledMcps.has('stitch')) {
    toolDefinitions = toolDefinitions.concat([
      {
        name: 'stitch_status',
        description:
          'Mostra a prontidao local do bridge Stitch MCP, incluindo modo de autenticacao e disponibilidade do gcloud/ADC.',
        input_schema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: 'stitch_list_tools',
        description:
          'Lista as tools expostas pelo servidor remoto Stitch MCP. Use antes de operar no Stitch para confirmar o catalogo remoto.',
        input_schema: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
      {
        name: 'stitch_call_tool',
        description:
          'Executa uma tool remota do Stitch MCP. Use `toolName` com o nome exato da tool e passe argumentos em `toolArgs` ou `toolArgsJson`. Em review, apenas chamadas list/get sao permitidas.',
        input_schema: {
          type: 'object',
          properties: {
            toolName: { type: 'string' },
            toolArgs: { type: 'object', additionalProperties: true },
            toolArgsJson: { type: 'string' },
          },
          required: ['toolName'],
          additionalProperties: false,
        },
      },
    ]);
  }

  if (options.reviewMode) {
    toolDefinitions = toolDefinitions.filter(
      (tool) => !['write_file', 'edit_file'].includes(String(tool?.name || '').trim()),
    );
  }

  if (options.inspectionGuardArmed) {
    return options.reviewMode
      ? applyReviewInspectionGuardToToolDefinitions(toolDefinitions)
      : applyInspectionGuardToToolDefinitions(toolDefinitions);
  }

  return toolDefinitions;
}

function buildTextToolCallFallbackInstructions(toolDefinitions = []) {
  const toolNames = listAllowedToolNames(toolDefinitions);
  return [
    'Tool-use fallback for local OpenAI-compatible models:',
    'Prefer native tool_calls when the API supports them.',
    'If native tool_calls are not emitted, respond with exactly one JSON object and no markdown.',
    'Accepted JSON shape: {"tool":"tool_name","input":{...}}.',
    toolNames.length ? `Allowed tool_name values include: ${toolNames.join(', ')}.` : null,
    'For file edits, use write_file/edit_file JSON instead of prose.',
    'For commands, use {"tool":"bash","input":{"command":"..."}} and keep bash for tests, builds and diagnostics.',
    'When the task is complete, respond with final text containing NEXUS_TASK_COMPLETE and no JSON tool object.',
  ].filter(Boolean).join('\n');
}

function evaluateReviewToolPolicy(toolName, input = {}) {
  const normalizedToolName = String(toolName || '').trim();
  if (!normalizedToolName) {
    return null;
  }

  if (normalizedToolName === 'write_file' || normalizedToolName === 'edit_file') {
    return {
      verdict: 'block',
      message:
        'Lane em review tecnico: edicoes de arquivo foram bloqueadas pelo servidor. ' +
        'Valide com leitura e checks; se houver falha material, devolva a task para implementacao.',
    };
  }

  if (normalizedToolName === 'bash' && !isReviewSafeBashCommand(input.command || '')) {
    return {
      verdict: 'block',
      message:
        'Lane em review tecnico: bash mutante foi bloqueado pelo servidor. ' +
        'Use apenas leitura, setup efemero e checks/diagnosticos permitidos.',
    };
  }

  if (normalizedToolName === 'stitch_call_tool' && !isReadOnlyStitchToolName(input.toolName || '')) {
    return {
      verdict: 'block',
      message:
        'Lane em review tecnico: operacoes mutantes no Stitch foram bloqueadas pelo servidor. ' +
        'Use apenas list/get para inspecao remota nesta etapa.',
    };
  }

  return null;
}

function evaluateCommandRecoveryToolPolicy(toolName, input = {}, context = {}) {
  const normalizedToolName = String(toolName || '').trim();
  const commandRecoveryCount = Math.max(0, Number(context.commandRecoveryCount || 0));
  if (!normalizedToolName || commandRecoveryCount === 0) {
    return null;
  }

  if (normalizedToolName !== 'bash') {
    return null;
  }

  const command = String(input.command || '').trim();
  if (!command) {
    return null;
  }

  if (/\bpgrep\b/i.test(command)) {
    return {
      verdict: 'block',
      message:
        'Recuperacao de shell ativa: `pgrep` foi bloqueado porque ja causou falhas de parsing nesta lane. ' +
        'Use `ps`, `grep` ou outra verificacao portavel.',
    };
  }

  const writesToFile =
    /<</.test(command) ||
    /(?:^|[\s;(])(?:\d*)>>?\s*(?!&?\d\b|\/dev\/null\b)[^\s]/i.test(command) ||
    /\b(?:cat|tee|printf|echo)\b[\s\S]*>>?\s*(?!&?\d\b|\/dev\/null\b)[^\s]/i.test(command);
  if (writesToFile) {
    return {
      verdict: 'block',
      message:
        'Recuperacao de shell ativa: criacao/edicao de arquivos via bash foi bloqueada. ' +
        'Use `write_file` ou `edit_file` para qualquer mudanca em arquivo.',
    };
  }

  return null;
}

function evaluateWorkspaceMutationToolPolicy(workspaceDir, toolName, input = {}) {
  const normalizedToolName = String(toolName || '').trim();
  if (!['write_file', 'edit_file'].includes(normalizedToolName)) {
    return null;
  }

  if (!isProtectedWorkspaceMutationPath(workspaceDir, input.path)) {
    return null;
  }

  return {
    verdict: 'block',
    message:
      'Edicoes no control plane do Nexus foram bloqueadas pelo servidor. ' +
      'Nao altere `.nexus/**` nem `.git/**` dentro da task; entregue mudancas apenas no codigo/produto do projeto.',
  };
}

function isGameFactoryToolContext(context = {}) {
  const taskPacket = context.taskPacket && typeof context.taskPacket === 'object'
    ? context.taskPacket
    : {};
  const backlogRef = String(taskPacket.backlogRef || context.backlogRef || '').trim();
  if (/^GAME-\d+/i.test(backlogRef)) return true;

  const text = [
    context.taskTitle,
    context.taskId,
    taskPacket.phase,
    taskPacket.title,
    taskPacket.summary,
    taskPacket.objective,
    Array.isArray(taskPacket.approvedScope) ? taskPacket.approvedScope.join(' ') : '',
  ]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  return (
    text.includes('autonomous-game-factory') ||
    text.includes('game factory') ||
    text.includes('playable html5 game') ||
    text.includes('browser game')
  );
}

function createGameFactoryGuardState() {
  return {
    indexMutationsBySlug: new Map(),
  };
}

function resolveGameFactoryIndexMutation(workspaceDir, toolName, input = {}) {
  const normalizedToolName = String(toolName || '').trim();
  if (!['write_file', 'edit_file'].includes(normalizedToolName)) return null;

  let resolvedPath;
  try {
    resolvedPath = resolveWorkspacePath(workspaceDir, input.path);
  } catch (_error) {
    return null;
  }

  const relativePath = normalizeSearchPath(path.relative(workspaceDir, resolvedPath));
  const match = relativePath.match(/^games\/([^/]+)\/index\.html$/i);
  if (!match) return null;

  return {
    slug: match[1],
    relativePath,
  };
}

function resolveGameFactoryWriteTarget(workspaceDir, toolName, input = {}) {
  const normalizedToolName = String(toolName || '').trim();
  if (normalizedToolName !== 'write_file') return null;

  let resolvedPath;
  try {
    resolvedPath = resolveWorkspacePath(workspaceDir, input.path);
  } catch (_error) {
    return null;
  }

  const relativePath = normalizeSearchPath(path.relative(workspaceDir, resolvedPath));
  const match = relativePath.match(/^games\/([^/]+)\/(.+)$/i);
  if (!match) return null;

  return {
    slug: match[1],
    relativePath,
    gameRelativePath: match[2],
  };
}

function readGameCatalogHasSlug(workspaceDir, slug) {
  try {
    const catalogPath = path.join(workspaceDir, 'games', 'index.json');
    const catalog = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
    return Array.isArray(catalog) && catalog.some((entry) =>
      String(entry?.slug || '').trim() === slug,
    );
  } catch (_error) {
    return false;
  }
}

function isGameFactoryValidationCommand(command = '') {
  const normalized = String(command || '').toLowerCase();
  return (
    /\bnpm\s+test\b/.test(normalized) ||
    /\bnpm\s+run\s+(?:test|build)\b/.test(normalized) ||
    /\bnode\s+scripts\/validate-games\.mjs\b/.test(normalized)
  );
}

function evaluateGameFactoryDeterministicPathPolicy(
  workspaceDir,
  toolName,
  input = {},
  context = {},
) {
  if (!isGameFactoryToolContext(context)) return null;

  const target = resolveGameFactoryWriteTarget(workspaceDir, toolName, input);
  if (!target) return null;

  const helperPath = path.join(workspaceDir, 'scripts', 'create-compact-game.mjs');
  if (!fs.existsSync(helperPath)) return null;
  if (readGameCatalogHasSlug(workspaceDir, target.slug)) return null;

  return {
    verdict: 'block',
    message:
      `Escrita manual bloqueada para ${target.relativePath}: este workspace tem o gerador deterministico. ` +
      `Rode \`node scripts/create-compact-game.mjs ${target.slug} "<title>" "<polished game art prompt>"\`, ` +
      'depois `npm test` e `npm run build`. Edicoes manuais ficam liberadas depois que o slug existir em games/index.json.',
  };
}

function hasBalancedCurlyBraces(value = '') {
  let depth = 0;
  for (const char of String(value || '')) {
    if (char === '{') depth += 1;
    if (char === '}') depth -= 1;
    if (depth < 0) return false;
  }
  return depth === 0;
}

function isJavaScriptSyntaxValid(value = '') {
  try {
    // Syntax check only; the generated game code is not executed here.
    // eslint-disable-next-line no-new-func
    new Function(String(value || ''));
    return true;
  } catch (_error) {
    return false;
  }
}

function evaluateGameFactoryContentToolPolicy(workspaceDir, toolName, input = {}, context = {}) {
  if (!isGameFactoryToolContext(context)) return null;

  const target = resolveGameFactoryWriteTarget(workspaceDir, toolName, input);
  if (!target) return null;

  const content = String(input.content || '');
  if (target.gameRelativePath === 'index.html') {
    if (
      !/^<!doctype html>/i.test(content.trim()) ||
      !/<body[\s>]/i.test(content) ||
      !/<script[\s>]/i.test(content) ||
      !/<\/html>\s*$/i.test(content.trim())
    ) {
      return {
        verdict: 'block',
        message:
          `write_file recusado para ${target.relativePath}: index.html incompleto. ` +
          'Reenvie o arquivo completo com <!doctype html>, body, script e fechamento </html>.',
      };
    }
  }

  if (target.gameRelativePath === 'manifest.json') {
    if (content.length > 1200) {
      return {
        verdict: 'block',
        message:
          `write_file recusado para ${target.relativePath}: manifest.json grande demais para a lane GH200. ` +
          'Use JSON compacto com slug, title, description, entry, controls e assets.',
      };
    }
    let manifest;
    try {
      manifest = JSON.parse(content);
    } catch (error) {
      return {
        verdict: 'block',
        message:
          `write_file recusado para ${target.relativePath}: manifest.json nao é JSON completo (${error.message}). ` +
          'Use JSON pequeno e literal; depois rode node scripts/sync-game-catalog.mjs.',
      };
    }
    if (!manifest || typeof manifest !== 'object' || Array.isArray(manifest)) {
      return {
        verdict: 'block',
        message: `write_file recusado para ${target.relativePath}: manifest.json deve ser um objeto JSON.`,
      };
    }
  }

  if (/\.css$/i.test(target.gameRelativePath)) {
    if (content.length > 2400) {
      return {
        verdict: 'block',
        message:
          `write_file recusado para ${target.relativePath}: CSS grande demais para a lane GH200. ` +
          'Reenvie um CSS compacto, completo e abaixo de 2400 caracteres.',
      };
    }
    if (!hasBalancedCurlyBraces(content)) {
      return {
        verdict: 'block',
        message:
          `write_file recusado para ${target.relativePath}: CSS parece truncado ou com chaves desbalanceadas. ` +
          'Reenvie um CSS menor e completo.',
      };
    }
  }

  if (/\.js$/i.test(target.gameRelativePath)) {
    if (containsHistoryOmissionMarker(content)) {
      return {
        verdict: 'block',
        message:
          `write_file recusado para ${target.relativePath}: o content é placeholder de histórico, não JavaScript real. ` +
          'Escreva um game.js novo, compacto, literal e abaixo de 2200 caracteres.',
      };
    }
    if (content.length > 2600) {
      return {
        verdict: 'block',
        message:
          `write_file recusado para ${target.relativePath}: game.js grande demais para a lane GH200. ` +
          'Reenvie um JavaScript compacto, completo e abaixo de 2600 caracteres.',
      };
    }
    if (!isJavaScriptSyntaxValid(content)) {
      return {
        verdict: 'block',
        message:
          `write_file recusado para ${target.relativePath}: JavaScript incompleto ou sintaticamente inválido. ` +
          'Reenvie um game.js menor e completo.',
      };
    }
  }

  return null;
}

function evaluateGameFactoryProgressToolPolicy(
  workspaceDir,
  toolName,
  input = {},
  context = {},
  state = createGameFactoryGuardState(),
) {
  if (!isGameFactoryToolContext(context)) return null;

  const mutation = resolveGameFactoryIndexMutation(workspaceDir, toolName, input);
  if (!mutation) return null;

  const slugState = state.indexMutationsBySlug.get(mutation.slug) || {
    indexMutationsSinceValidation: 0,
    validationSucceededSinceLastIndex: false,
  };

  if (slugState.indexMutationsSinceValidation <= 0) {
    return null;
  }

  const catalogHasSlug = readGameCatalogHasSlug(workspaceDir, mutation.slug);
  if (!catalogHasSlug) {
    return {
      verdict: 'block',
      message:
        `Reescrita bloqueada para ${mutation.relativePath}: o index.html ja foi escrito nesta lane, ` +
        `mas ${mutation.slug} ainda nao esta em games/index.json. ` +
        `Finalize manifest/README/assets, ou rode \`node scripts/create-compact-game.mjs ${mutation.slug} "<title>" "<art prompt>"\`; ` +
        `depois rode \`node scripts/sync-game-catalog.mjs ${mutation.slug}\`, ` +
        'depois rode `npm test` antes de voltar a mexer no index.html.',
    };
  }

  if (
    slugState.indexMutationsSinceValidation >= 2 &&
    !slugState.validationSucceededSinceLastIndex
  ) {
    return {
      verdict: 'block',
      message:
        `Reescrita bloqueada para ${mutation.relativePath}: index.html ja mudou ` +
        `${slugState.indexMutationsSinceValidation} vezes desde a ultima validacao. ` +
        'Rode `npm test` e corrija o erro apontado pelo gate antes de reescrever esse arquivo novamente.',
    };
  }

  return null;
}

function recordGameFactoryToolSuccess(workspaceDir, toolName, input = {}, output = '', context = {}, state) {
  if (!state || !isGameFactoryToolContext(context)) return;

  const mutation = resolveGameFactoryIndexMutation(workspaceDir, toolName, input);
  if (mutation) {
    const current = state.indexMutationsBySlug.get(mutation.slug) || {
      indexMutationsSinceValidation: 0,
      validationSucceededSinceLastIndex: false,
    };
    state.indexMutationsBySlug.set(mutation.slug, {
      indexMutationsSinceValidation: current.indexMutationsSinceValidation + 1,
      validationSucceededSinceLastIndex: false,
    });
    return;
  }

  if (String(toolName || '').trim() !== 'bash') return;
  if (!isGameFactoryValidationCommand(input.command || '')) return;
  if (!/exitCode:\s*0\b/.test(String(output || ''))) return;

  state.indexMutationsBySlug.forEach((_value, slug) => {
    state.indexMutationsBySlug.set(slug, {
      indexMutationsSinceValidation: 0,
      validationSucceededSinceLastIndex: true,
    });
  });
}

function buildToolExecutor(workspaceDir, options = {}) {
  const hookContext = options.hookContext || null;
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  const gameFactoryGuardState = createGameFactoryGuardState();
  const hookTaskMetadata = hookContext
    ? {
        taskId: hookContext.taskId || null,
        taskTitle: hookContext.taskTitle || null,
        taskStatus: hookContext.taskStatus || null,
        requestKind: hookContext.requestKind || null,
        backlogRef: hookContext.backlogRef || hookContext.taskPacket?.backlogRef || null,
        agentRole: hookContext.agent?.role || null,
        agentId: hookContext.agent?.id || null,
        commandRecoveryCount: Number(hookContext.commandRecoveryCount || 0),
        recoveryHint: hookContext.recoveryHint || null,
      }
    : {};

  return async function executeTool(name, input) {
    let resolvedPayload = {
      ...hookTaskMetadata,
      toolName: String(name || '').trim(),
      input: input && typeof input === 'object' ? { ...input } : {},
      workspaceDir,
    };

    if (hookContext) {
      const hookResult = await runHookPipeline('beforeToolCall', resolvedPayload, hookContext);
      if (hookResult.invoked > 0 && hookResult.notes.length > 0) {
        hookResult.notes.forEach((note) => {
          onEvent({
            type: 'status',
            message: `Hook beforeToolCall: ${note}`,
          });
        });
      }
      if (hookResult.errors.length > 0) {
        hookResult.errors.forEach((error) => {
          onEvent({
            type: 'status',
            message: `Hook beforeToolCall falhou (${error.sourceId}): ${error.message}`,
          });
        });
      }
      resolvedPayload = hookResult.payload || resolvedPayload;
    }

    const resolvedName = String(resolvedPayload.toolName || name || '').trim();
    const resolvedInput =
      resolvedPayload.input && typeof resolvedPayload.input === 'object'
        ? resolvedPayload.input
        : {};

    if (resolvedPayload.blocked) {
      const error = new Error(
        String(resolvedPayload.reason || `Ferramenta ${resolvedName || name} bloqueada por hook.`),
      );
      error.code = 'NEXUS_HOOK_BLOCKED';
      error.blockedByHook = true;
      error.blockedToolName = resolvedName || String(name || '').trim();
      throw error;
    }

    const workspaceMutationPolicy = evaluateWorkspaceMutationToolPolicy(
      workspaceDir,
      resolvedName,
      resolvedInput,
    );
    if (workspaceMutationPolicy?.verdict === 'block') {
      onEvent({
        type: 'tool_policy',
        toolName: resolvedName,
        verdict: 'block',
        message: workspaceMutationPolicy.message,
        command: null,
      });
      throw new Error(workspaceMutationPolicy.message);
    }

    const gameFactoryDeterministicPolicy = evaluateGameFactoryDeterministicPathPolicy(
      workspaceDir,
      resolvedName,
      resolvedInput,
      hookContext || hookTaskMetadata,
    );
    if (gameFactoryDeterministicPolicy?.verdict === 'block') {
      onEvent({
        type: 'tool_policy',
        toolName: resolvedName,
        verdict: 'block',
        message: gameFactoryDeterministicPolicy.message,
        command: null,
      });
      throw new Error(gameFactoryDeterministicPolicy.message);
    }

    const gameFactoryContentPolicy = evaluateGameFactoryContentToolPolicy(
      workspaceDir,
      resolvedName,
      resolvedInput,
      hookContext || hookTaskMetadata,
    );
    if (gameFactoryContentPolicy?.verdict === 'block') {
      onEvent({
        type: 'tool_policy',
        toolName: resolvedName,
        verdict: 'block',
        message: gameFactoryContentPolicy.message,
        command: null,
      });
      throw new Error(gameFactoryContentPolicy.message);
    }

    const gameFactoryProgressPolicy = evaluateGameFactoryProgressToolPolicy(
      workspaceDir,
      resolvedName,
      resolvedInput,
      hookContext || hookTaskMetadata,
      gameFactoryGuardState,
    );
    if (gameFactoryProgressPolicy?.verdict === 'block') {
      onEvent({
        type: 'tool_policy',
        toolName: resolvedName,
        verdict: 'block',
        message: gameFactoryProgressPolicy.message,
        command: null,
      });
      throw new Error(gameFactoryProgressPolicy.message);
    }

    if (options.reviewMode) {
      const reviewPolicy = evaluateReviewToolPolicy(resolvedName, resolvedInput);
      if (reviewPolicy?.verdict === 'block') {
        onEvent({
          type: 'tool_policy',
          toolName: resolvedName,
          verdict: 'block',
          message: reviewPolicy.message,
          command:
            resolvedName === 'bash' ? String(resolvedInput.command || '').trim() || null : null,
        });
        throw new Error(reviewPolicy.message);
      }
    }

    const commandRecoveryPolicy = evaluateCommandRecoveryToolPolicy(
      resolvedName,
      resolvedInput,
      hookContext || {},
    );
    if (commandRecoveryPolicy?.verdict === 'block') {
      onEvent({
        type: 'tool_policy',
        toolName: resolvedName,
        verdict: 'block',
        message: commandRecoveryPolicy.message,
        command:
          resolvedName === 'bash' ? String(resolvedInput.command || '').trim() || null : null,
      });
      throw new Error(commandRecoveryPolicy.message);
    }

    let result;
    switch (resolvedName) {
      case 'bash':
        result = await executeBashTool(workspaceDir, resolvedInput, {
          approvalMode: options.approvalMode,
          env: options.env || process.env,
          onEvent,
        });
        break;
      case 'read_file':
        result = await executeReadFileTool(workspaceDir, resolvedInput);
        break;
      case 'write_file':
        result = await executeWriteFileTool(workspaceDir, resolvedInput);
        break;
      case 'edit_file':
        result = await executeEditFileTool(workspaceDir, resolvedInput);
        break;
      case 'glob_search':
        result = await executeGlobSearchTool(workspaceDir, resolvedInput);
        break;
      case 'grep_search':
        result = await executeGrepSearchTool(workspaceDir, resolvedInput);
        break;
      case 'figma_get_file':
        result = await executeFigmaGetFileTool(resolvedInput, {
          env: options.env || process.env,
          fetchImpl: options.fetchImpl,
        });
        break;
      case 'figma_get_node_context':
        result = await executeFigmaGetNodeContextTool(resolvedInput, {
          env: options.env || process.env,
          fetchImpl: options.fetchImpl,
        });
        break;
      case 'figma_get_image_refs':
        result = await executeFigmaGetImageRefsTool(resolvedInput, {
          env: options.env || process.env,
          fetchImpl: options.fetchImpl,
        });
        break;
      case 'stitch_status':
        result = await executeStitchStatusTool(resolvedInput, {
          env: options.env || process.env,
        });
        break;
      case 'stitch_list_tools':
        result = await executeStitchListToolsTool(resolvedInput, {
          env: options.env || process.env,
          fetchImpl: options.fetchImpl,
        });
        break;
      case 'stitch_call_tool':
        result = await executeStitchCallTool(resolvedInput, {
          env: options.env || process.env,
          fetchImpl: options.fetchImpl,
        });
        break;
      default:
        throw new Error(`Ferramenta não suportada: ${resolvedName || name}`);
    }

    recordGameFactoryToolSuccess(
      workspaceDir,
      resolvedName,
      resolvedInput,
      result,
      hookContext || hookTaskMetadata,
      gameFactoryGuardState,
    );
    return result;
  };
}

function makeTextBlock(text) {
  const value = String(text || '');
  return value ? { type: 'text', text: value } : null;
}

function translateConversationForOpenAi(messages, systemPrompt) {
  const translated = [];
  const systemText = String(systemPrompt || '').trim();

  if (systemText) {
    translated.push({ role: 'system', content: systemText });
  }

  messages.forEach((message) => {
    const role = message.role;
    if (role === 'assistant') {
      const text = message.blocks
        .filter((block) => block.type === 'text')
        .map((block) => block.text)
        .join('');
      const toolCalls = message.blocks
        .filter((block) => block.type === 'tool_use')
        .map((block) => ({
          id: block.id,
          type: 'function',
          function: {
            name: block.name,
            arguments: JSON.stringify(block.input || {}),
          },
        }));

      if (text || toolCalls.length) {
        translated.push({
          role: 'assistant',
          content: text || null,
          tool_calls: toolCalls.length ? toolCalls : undefined,
        });
      }
      return;
    }

    message.blocks.forEach((block) => {
      if (block.type === 'text') {
        translated.push({
          role: 'user',
          content: block.text,
        });
        return;
      }

      if (block.type === 'tool_result') {
        translated.push({
          role: 'tool',
          tool_call_id: block.toolUseId,
          content: block.isError
            ? `Tool error:\n${String(block.content || '').trim() || '[sem detalhes]'}`
            : block.content,
        });
      }
    });
  });

  return translated;
}

function translateConversationForAnthropic(messages) {
  return messages.map((message) => ({
    role: message.role,
    content: message.blocks
      .map((block) => {
        if (block.type === 'text') {
          return { type: 'text', text: block.text };
        }
        if (block.type === 'tool_use') {
          return {
            type: 'tool_use',
            id: block.id,
            name: block.name,
            input: block.input || {},
          };
        }
        if (block.type === 'tool_result') {
          return {
            type: 'tool_result',
            tool_use_id: block.toolUseId,
            content: [{ type: 'text', text: block.content }],
            is_error: Boolean(block.isError),
          };
        }
        return null;
      })
      .filter(Boolean),
  }));
}

function extractOpenAiResponse(payload) {
  const message = payload?.choices?.[0]?.message || {};
  const content = message.content;
  let text = '';

  if (typeof content === 'string') {
    text = content;
  } else if (Array.isArray(content)) {
    text = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (part && typeof part.text === 'string') return part.text;
        if (part && typeof part.content === 'string') return part.content;
        return '';
      })
      .join('');
  }

  let toolCalls = Array.isArray(message.tool_calls)
    ? message.tool_calls
        .map((toolCall) => {
          const name = toolCall?.function?.name;
          if (!name) return null;
          return {
            id: String(toolCall.id || `tool_${Date.now()}`),
            name,
            input: safeJsonParse(toolCall?.function?.arguments || '{}', {}),
          };
        })
        .filter(Boolean)
    : [];

  if (!toolCalls.length && text) {
    const syntheticToolCalls = extractSyntheticToolCallsFromText(text);
    if (syntheticToolCalls.length) {
      toolCalls = syntheticToolCalls;
      text = '';
    }
  }

  return {
    text: String(text || '').trim(),
    toolCalls,
    finishReason: payload?.choices?.[0]?.finish_reason || null,
    model: payload?.model || null,
  };
}

function extractAnthropicResponse(payload) {
  const content = Array.isArray(payload?.content) ? payload.content : [];
  const text = content
    .filter((block) => block?.type === 'text' && typeof block.text === 'string')
    .map((block) => block.text)
    .join('')
    .trim();
  const toolCalls = content
    .filter((block) => block?.type === 'tool_use' && block.name)
    .map((block) => ({
      id: String(block.id || `tool_${Date.now()}`),
      name: String(block.name),
      input: block.input && typeof block.input === 'object' ? block.input : {},
    }));

  return {
    text,
    toolCalls,
    finishReason: payload?.stop_reason || null,
    model: payload?.model || null,
  };
}

async function requestJson(url, options = {}, fetchImpl = global.fetch) {
  if (typeof fetchImpl !== 'function') {
    throw new Error('Global fetch indisponível neste runtime.');
  }

  const { timeoutMs, ...fetchOptions } = options || {};
  const resolvedTimeoutMs = resolveProviderHttpTimeoutMs(process.env, timeoutMs);
  const abortController = typeof AbortController === 'function' ? new AbortController() : null;
  let didTimeout = false;
  let timeoutHandle = null;

  if (abortController && !fetchOptions.signal) {
    fetchOptions.signal = abortController.signal;
    timeoutHandle = setTimeout(() => {
      didTimeout = true;
      abortController.abort();
    }, resolvedTimeoutMs);
  }

  let response;
  let rawBody = '';
  try {
    response = await fetchImpl(url, fetchOptions);
    rawBody = await response.text();
  } catch (error) {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
    if (
      didTimeout &&
      (
        error?.name === 'AbortError' ||
        error?.code === 'ABORT_ERR' ||
        (abortController && abortController.signal.aborted)
      )
    ) {
      const timeoutError = new Error(
        `Timeout ao aguardar resposta do provider após ${resolvedTimeoutMs}ms.`,
      );
      timeoutError.code = 'PROVIDER_TIMEOUT';
      timeoutError.cause = error;
      throw timeoutError;
    }
    throw error;
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }

  if (!response.ok) {
    const error = new Error(rawBody || `HTTP ${response.status}`);
    error.statusCode = response.status;
    error.stderr = rawBody;
    throw error;
  }

  try {
    return rawBody ? JSON.parse(rawBody) : {};
  } catch (error) {
    const parseError = new Error(`Resposta JSON inválida recebida de ${url}`);
    parseError.cause = error;
    parseError.stderr = rawBody;
    throw parseError;
  }
}

function resolveAzureDeployment(model, env) {
  const normalizedModel = String(normalizeModelName(model, 'azure_openai') || '').trim();
  if (!AZURE_DEPLOYMENT_PLACEHOLDERS.has(normalizedModel.toLowerCase())) {
    return normalizedModel;
  }

  const fromEnv = readEnvValue('AZURE_OPENAI_DEPLOYMENT', env);
  if (fromEnv) return fromEnv;

  throw new Error('Azure OpenAI requer AZURE_OPENAI_DEPLOYMENT ou um model/deployment explícito.');
}

async function requestJsonWithTokenFallback(url, requestOptions, body, fetchImpl) {
  const execute = (payload) => requestJson(
    url,
    {
      ...requestOptions,
      body: JSON.stringify(payload),
    },
    fetchImpl,
  );

  let currentBody = body;
  const triedContextLimits = new Set();
  let triedMaxCompletionTokens = Object.prototype.hasOwnProperty.call(body, 'max_completion_tokens');
  let triedMaxTokens = Object.prototype.hasOwnProperty.call(body, 'max_tokens');

  for (let attempt = 0; attempt < 6; attempt += 1) {
    try {
      return await execute(currentBody);
    } catch (error) {
      if (shouldRetryWithMaxCompletionTokens(error) && !triedMaxCompletionTokens) {
        const retryBody = { ...currentBody };
        triedMaxCompletionTokens = true;
        triedMaxTokens = false;
        triedContextLimits.clear();
        delete retryBody.max_tokens;
        retryBody.max_completion_tokens = DEFAULT_MAX_TOKENS;
        currentBody = retryBody;
        continue;
      }

      if (shouldRetryWithMaxTokens(error) && !triedMaxTokens) {
        const retryBody = { ...currentBody };
        triedMaxTokens = true;
        triedMaxCompletionTokens = false;
        triedContextLimits.clear();
        delete retryBody.max_completion_tokens;
        retryBody.max_tokens = DEFAULT_MAX_TOKENS;
        currentBody = retryBody;
        continue;
      }

      const reducedContextBody = parseContextLimitRetry(error, currentBody, triedContextLimits);
      if (reducedContextBody) {
        currentBody = reducedContextBody;
        continue;
      }

      throw error;
    }
  }

  return execute(currentBody);
}

function resolveOpenAiToolChoice(toolChoice) {
  return String(toolChoice || '').trim().toLowerCase() === 'required' ? 'required' : 'auto';
}

function resolveAutonomousToolChoice(provider, inspectionGuardArmed, env = {}) {
  if (!inspectionGuardArmed) return 'auto';

  const normalizedProvider = normalizeLlmProvider(provider);
  if (normalizedProvider === 'openai_compat') {
    return readBooleanEnv('NEXUS_OPENAI_COMPAT_REQUIRED_TOOL_CHOICE', env, false)
      ? 'required'
      : 'auto';
  }

  return 'required';
}

function resolveAnthropicToolChoice(toolChoice) {
  return String(toolChoice || '').trim().toLowerCase() === 'required'
    ? { type: 'any' }
    : { type: 'auto' };
}

async function sendOpenAiCompatibleTurn(provider, model, messages, tools, options = {}) {
  const env = options.env || {};
  const fetchImpl = options.fetchImpl || global.fetch;
  const runtimeConfig = resolveOpenAiCompatibleRuntimeConfig(provider, env);
  const reasoningEffort = normalizeReasoningEffort(options.reasoningEffort, provider);
  const requestTimeoutMs = resolveProviderHttpTimeoutMs(env, options.requestTimeoutMs);

  if (runtimeConfig.requiresApiKey && !runtimeConfig.apiKey) {
    throw new Error(
      provider === 'xai'
        ? 'xAI requer XAI_API_KEY.'
        : provider === 'openai_compat'
          ? 'OpenAI-compatible requer OPENAI_COMPAT_API_KEY ou OLLAMA_API_KEY quando o endpoint nao for local.'
          : 'OpenAI requer OPENAI_API_KEY.',
    );
  }

  const body = withModelTokenLimit(model, {
    model,
    messages: translateConversationForOpenAi(messages, options.systemPrompt),
    tools: tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    })),
    tool_choice: resolveOpenAiToolChoice(options.toolChoice),
  });

  if (shouldSendReasoningEffort(provider, env) && reasoningEffort) {
    body.reasoning_effort = reasoningEffort;
  }

  if (provider === 'openai_compat') {
    const enableThinking = readBooleanEnv('NEXUS_OPENAI_COMPAT_ENABLE_THINKING', env);
    if (enableThinking) body.thinking = { type: 'enabled' };
    else body.reasoning_effort = 'none';
    body.chat_template_kwargs = {
      ...(body.chat_template_kwargs && typeof body.chat_template_kwargs === 'object'
        ? body.chat_template_kwargs
        : {}),
      enable_thinking: enableThinking,
    };
  }

  const headers = {
    'content-type': 'application/json',
    'user-agent': 'nexus-orchestrator/1.0',
  };
  if (runtimeConfig.apiKey) {
    headers.authorization = `Bearer ${runtimeConfig.apiKey}`;
  }

  const payload = await requestJsonWithTokenFallback(runtimeConfig.endpoint, {
    method: 'POST',
    headers,
    timeoutMs: requestTimeoutMs,
  }, body, fetchImpl);

  return extractOpenAiResponse(payload);
}

async function sendAzureOpenAiTurn(model, messages, tools, options = {}) {
  const env = options.env || {};
  const fetchImpl = options.fetchImpl || global.fetch;
  const apiKey = readEnvValue('AZURE_OPENAI_API_KEY', env);
  const endpoint = readEnvValue('AZURE_OPENAI_ENDPOINT', env);
  const apiVersion = readEnvValue('AZURE_OPENAI_API_VERSION', env) || DEFAULT_AZURE_OPENAI_API_VERSION;
  const reasoningEffort = normalizeReasoningEffort(options.reasoningEffort, 'azure_openai');
  const deployment = resolveAzureDeployment(model, env);
  const requestTimeoutMs = resolveProviderHttpTimeoutMs(env, options.requestTimeoutMs);

  if (!apiKey) {
    throw new Error('Azure OpenAI requer AZURE_OPENAI_API_KEY.');
  }

  const url = azureChatCompletionsEndpoint(endpoint, deployment, apiVersion);
  const body = withModelTokenLimit(model, {
    messages: translateConversationForOpenAi(messages, options.systemPrompt),
    tools: tools.map((tool) => ({
      type: 'function',
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.input_schema,
      },
    })),
    tool_choice: resolveOpenAiToolChoice(options.toolChoice),
  });

  if (reasoningEffort) {
    body.reasoning_effort = reasoningEffort;
  }

  const payload = await requestJsonWithTokenFallback(url, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'api-key': apiKey,
      'user-agent': 'nexus-orchestrator/1.0',
    },
    timeoutMs: requestTimeoutMs,
  }, body, fetchImpl);

  const response = extractOpenAiResponse(payload);
  return {
    ...response,
    model: deployment,
  };
}

async function sendAnthropicTurn(model, messages, tools, options = {}) {
  const env = options.env || {};
  const fetchImpl = options.fetchImpl || global.fetch;
  const apiKey = readEnvValue('ANTHROPIC_API_KEY', env);
  const authToken = readEnvValue('ANTHROPIC_AUTH_TOKEN', env);
  const requestTimeoutMs = resolveProviderHttpTimeoutMs(env, options.requestTimeoutMs);

  if (!apiKey && !authToken) {
    throw new Error('Anthropic requer ANTHROPIC_API_KEY ou ANTHROPIC_AUTH_TOKEN.');
  }

  const endpoint = anthropicMessagesEndpoint(readEnvValue('ANTHROPIC_BASE_URL', env));
  const headers = {
    'content-type': 'application/json',
    'anthropic-version': readEnvValue('ANTHROPIC_VERSION', env) || DEFAULT_ANTHROPIC_VERSION,
    'user-agent': 'nexus-orchestrator/1.0',
  };
  if (apiKey) headers['x-api-key'] = apiKey;
  if (authToken) headers.authorization = `Bearer ${authToken}`;

  const body = {
    model,
    max_tokens: DEFAULT_MAX_TOKENS,
    system: String(options.systemPrompt || '').trim() || undefined,
    messages: translateConversationForAnthropic(messages),
    tools: tools.map((tool) => ({
      name: tool.name,
      description: tool.description,
      input_schema: tool.input_schema,
    })),
    tool_choice: resolveAnthropicToolChoice(options.toolChoice),
  };

  const payload = await requestJson(endpoint, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
    timeoutMs: requestTimeoutMs,
  }, fetchImpl);

  return extractAnthropicResponse(payload);
}

async function sendConversationTurn(provider, model, messages, tools, options = {}) {
  switch (provider) {
    case 'anthropic':
      return sendAnthropicTurn(model, messages, tools, options);
    case 'azure_openai':
      return sendAzureOpenAiTurn(model, messages, tools, options);
    case 'xai':
    case 'openai':
    case 'openai_compat':
      return sendOpenAiCompatibleTurn(provider, model, messages, tools, options);
    default:
      throw new Error(`Provider autônomo não suportado: ${provider}`);
  }
}

function emitModelWaitStatus(onEvent, provider, model, iteration, elapsedMs, timeoutMs) {
  if (typeof onEvent !== 'function') return;

  const elapsedSeconds = Math.max(0, Math.floor(Number(elapsedMs || 0) / 1000));
  const timeoutSeconds = Math.max(1, Math.ceil(Number(timeoutMs || DEFAULT_PROVIDER_HTTP_TIMEOUT_MS) / 1000));
  onEvent({
    type: 'status',
    message:
      elapsedSeconds <= 0
        ? `Aguardando resposta do modelo ${provider}/${model} (timeout ${timeoutSeconds}s).`
        : `Aguardando resposta do modelo ${provider}/${model} há ${elapsedSeconds}s (timeout ${timeoutSeconds}s).`,
    iteration,
  });
}

async function sendConversationTurnWithHeartbeats(provider, model, messages, tools, options = {}) {
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : null;
  const env = options.env || process.env;
  const timeoutMs = resolveProviderHttpTimeoutMs(env, options.requestTimeoutMs);
  const heartbeatMs = resolveProviderWaitHeartbeatMs(env, timeoutMs);
  const startedAt = Date.now();
  let heartbeatHandle = null;

  emitModelWaitStatus(onEvent, provider, model, options.iteration, 0, timeoutMs);
  heartbeatHandle = setInterval(() => {
    emitModelWaitStatus(
      onEvent,
      provider,
      model,
      options.iteration,
      Date.now() - startedAt,
      timeoutMs,
    );
  }, heartbeatMs);

  if (heartbeatHandle && typeof heartbeatHandle.unref === 'function') {
    heartbeatHandle.unref();
  }

  try {
    return await sendConversationTurn(provider, model, messages, tools, options);
  } finally {
    if (heartbeatHandle) {
      clearInterval(heartbeatHandle);
    }
  }
}

function appendAssistantMessage(messages, response) {
  const blocks = [];
  const textBlock = makeTextBlock(response.text);
  if (textBlock) blocks.push(textBlock);
  response.toolCalls.forEach((toolCall) => {
    blocks.push({
      type: 'tool_use',
      id: toolCall.id,
      name: toolCall.name,
      input: compactToolCallInputForHistory(toolCall),
    });
  });

  if (!blocks.length) {
    throw new Error('A resposta do modelo não trouxe texto nem tool calls.');
  }

  messages.push({
    role: 'assistant',
    blocks,
  });
}

function compactLargeStringForHistory(value, label) {
  const text = String(value || '');
  if (text.length <= MAX_HISTORY_TOOL_ARG_CHARS) return text;
  return `[NEXUS_PAYLOAD_OMITTED:${label}; ${text.length} chars already applied by the tool; do not copy this placeholder]`;
}

function compactToolCallInputForHistory(toolCall) {
  const name = String(toolCall?.name || '').trim();
  const input = toolCall?.input && typeof toolCall.input === 'object' ? toolCall.input : {};

  if (name === 'write_file') {
    return {
      ...input,
      content: compactLargeStringForHistory(input.content, 'write_file content'),
    };
  }

  if (name === 'edit_file') {
    return {
      ...input,
      oldText: compactLargeStringForHistory(input.oldText, 'edit_file oldText'),
      newText: compactLargeStringForHistory(input.newText, 'edit_file newText'),
    };
  }

  return input;
}

function appendToolResultMessage(messages, toolCall, output, isError) {
  messages.push({
    role: 'user',
    blocks: [
      {
        type: 'tool_result',
        toolUseId: toolCall.id,
        toolName: toolCall.name,
        content: String(output || ''),
        isError: Boolean(isError),
      },
    ],
  });
}

async function runAutonomousToolLoop(options = {}) {
  const provider = normalizeLlmProvider(options.provider);
  if (!provider || provider === 'gemini') {
    throw new Error(`Provider inválido para o loop multi-provider: ${options.provider || 'desconhecido'}`);
  }

  const workspaceDir = path.resolve(String(options.cwd || process.cwd()));
  const projectDir = path.resolve(String(options.projectDir || workspaceDir));
  const primaryCandidate = normalizeRuntimeCandidate(
    {
      provider,
      model:
        normalizeModelName(options.model, provider) || defaultModelForProvider(provider),
      reasoningEffort: options.reasoningEffort || null,
      source: 'primary',
    },
    provider,
    {
      agent: options.agent || {},
      source: 'primary',
    },
  );
  const fallbackCandidates = (Array.isArray(options.fallbackChain) ? options.fallbackChain : [])
    .map((candidate) =>
      normalizeRuntimeCandidate(candidate, provider, {
        agent: options.agent || {},
        source: 'fallback',
      }),
    )
    .filter(Boolean)
    .filter((candidate) => runtimeCandidateKey(candidate) !== runtimeCandidateKey(primaryCandidate));
  const runtimeCandidates = [primaryCandidate, ...fallbackCandidates].filter(Boolean);
  const model = String(primaryCandidate?.model || '').trim();
  const prompt = String(options.prompt || '').trim();
  const reviewMode = Boolean(
    options.reviewMode
      || options.taskStatus === 'in_review'
      || isReviewTaskTitle(options.taskTitle || prompt),
  );
  const commandRecoveryCount = Math.max(0, Number(options.commandRecoveryCount || 0));
  const shellRecoveryMode = commandRecoveryCount > 0;
  const recoverySystemSuffix = shellRecoveryMode
    ? [
        'Modo de recuperacao de shell ativo.',
        'Use somente tool calls estruturados.',
        'Nao emita texto cru que pareca comando shell.',
        'Se precisar editar arquivo, use write_file/edit_file.',
        'Se precisar de bash, limite-se a comandos completos de leitura, teste ou diagnostico sem pgrep, heredoc ou redirecionamento para arquivo.',
      ].join(' ')
    : '';
  const baseToolDefinitions = createToolDefinitions({
    reviewMode,
    shellRecoveryMode,
    enabledMcps: options.agent?.mcps,
  });
  const textToolCallFallbackInstructions = buildTextToolCallFallbackInstructions(baseToolDefinitions);
  const systemPrompt = String(
    options.systemPrompt ||
      'Você é um agente autônomo de software com acesso a ferramentas locais estruturadas. Use tool calls quando necessário e finalize apenas quando a task estiver realmente concluída.',
  ).trim() +
    (recoverySystemSuffix ? `\n\n${recoverySystemSuffix}` : '') +
    (textToolCallFallbackInstructions ? `\n\n${textToolCallFallbackInstructions}` : '');
  const maxIterations = Math.max(1, Number(options.maxIterations) || DEFAULT_MAX_ITERATIONS);
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  const resolvedSkills = resolveApplicableSkills({
    projectDir,
    taskTitle: options.taskTitle || prompt,
    agent: options.agent || {},
    skillRoots: options.skillRoots || defaultSkillRoots(projectDir),
  });
  const hookContext = {
    projectDir,
    workspaceDir,
    agent: options.agent || {},
    taskTitle: options.taskTitle || prompt,
    taskId: options.taskId || null,
    taskStatus: options.taskStatus || (reviewMode ? 'in_review' : null),
    requestKind: options.requestKind || 'primary',
    commandRecoveryCount,
    recoveryHint: options.recoveryHint || null,
    skills: resolvedSkills,
  };
  const executeTool = buildToolExecutor(workspaceDir, {
    onEvent,
    env: options.env || process.env,
    fetchImpl: options.fetchImpl,
    approvalMode: options.approvalMode || options.env?.NEXUS_EXEC_APPROVAL_MODE,
    reviewMode,
    hookContext,
  });
  const messages = [];
  const inspectionRecoveryGuidance = String(options.inspectionRecoveryGuidance || '').trim() || null;
  const requestTimeoutMs = resolveProviderHttpTimeoutMs(
    options.env || process.env,
    options.requestTimeoutMs,
  );
  const configuredReadOnlyStreakLimit = Number(options.readOnlyStreakLimit);
  const requestedReadOnlyStreakLimit =
    (Number.isFinite(configuredReadOnlyStreakLimit) && configuredReadOnlyStreakLimit > 0
      ? configuredReadOnlyStreakLimit
      : Number(readEnvValue('NEXUS_AUTONOMOUS_READONLY_STREAK_LIMIT', options.env || process.env))) ||
    DEFAULT_READONLY_STREAK_LIMIT;
  const readOnlyStreakLimit = Math.max(1, requestedReadOnlyStreakLimit);
  const configuredInspectionFallbackStreakLimit = Number(
    readEnvValue('NEXUS_AUTONOMOUS_INSPECTION_FALLBACK_STREAK_LIMIT', options.env || process.env),
  );
  const inspectionFallbackStreakLimit = Math.max(
    1,
    (Number.isFinite(configuredInspectionFallbackStreakLimit) &&
    configuredInspectionFallbackStreakLimit > 0
      ? configuredInspectionFallbackStreakLimit
      : readOnlyStreakLimit * 2),
  );
  const emptyResponseRetryLimit = Math.max(
    1,
    Number(readEnvValue('NEXUS_AUTONOMOUS_EMPTY_RESPONSE_RETRIES', options.env || process.env)) ||
      DEFAULT_EMPTY_RESPONSE_RETRIES,
  );
  let activeRuntimeIndex = 0;
  let consecutiveInspectionOnlyIterations = 0;

  if (!prompt) {
    throw new Error('Prompt autônomo vazio.');
  }
  if (!model) {
    throw new Error('Modelo autônomo inválido.');
  }

  messages.push({
    role: 'user',
    blocks: [{ type: 'text', text: prompt }],
  });

  onEvent({
    type: 'runtime_selected',
    provider: runtimeCandidates[0].provider,
    model: runtimeCandidates[0].model,
    reasoningEffort: runtimeCandidates[0].reasoningEffort || null,
    fallbackDepth: 0,
    fallbackActive: false,
    chainLength: runtimeCandidates.length,
  });

  for (let iteration = 1; iteration <= maxIterations; iteration += 1) {
    const activeRuntime = runtimeCandidates[activeRuntimeIndex];
    const inspectionGuardArmed = consecutiveInspectionOnlyIterations >= readOnlyStreakLimit;
    const activeTools = createToolDefinitions({
      inspectionGuardArmed,
      reviewMode,
      shellRecoveryMode,
      enabledMcps: options.agent?.mcps,
    });
    const allowedToolNames = createAllowedToolNameSet(activeTools);

    const preTurnAutoCloseout = await tryAutoCloseoutFromWorkspace(
      workspaceDir,
      {
        ...options,
        allowGameFactoryAutoMaterialize: iteration > 1,
      },
      onEvent,
    );
    if (preTurnAutoCloseout) {
      return {
        ok: true,
        provider: runtimeCandidates[activeRuntimeIndex].provider,
        model: runtimeCandidates[activeRuntimeIndex].model,
        text: preTurnAutoCloseout.text,
        iterations: iteration,
        finishReason: preTurnAutoCloseout.finishReason || null,
        fallbackDepth: activeRuntimeIndex,
      };
    }

    onEvent({
      type: 'status',
      message: `Iteração ${iteration}/${maxIterations} com ${activeRuntime.provider}/${activeRuntime.model}.`,
      iteration,
    });

    let response = null;
    let emptyResponseRecoveryAttempts = 0;
    // Fail over to the next runtime candidate only when the provider/model call fails.
    for (;;) {
      const currentRuntime = runtimeCandidates[activeRuntimeIndex];
      const currentEmptyResponseRetryLimit = resolveEmptyResponseRetryLimitForRuntimeCandidate(
        currentRuntime,
        emptyResponseRetryLimit,
        activeRuntimeIndex < runtimeCandidates.length - 1,
      );
      try {
        const currentRequestTimeoutMs = resolveRequestTimeoutMsForRuntimeCandidate(
          currentRuntime,
          options.env || process.env,
          requestTimeoutMs,
          {
            hasDownstreamFallback: activeRuntimeIndex < runtimeCandidates.length - 1,
          },
        );
        response = await sendConversationTurnWithHeartbeats(
          currentRuntime.provider,
          currentRuntime.model,
          messages,
          activeTools,
          {
            env: options.env || process.env,
            fetchImpl: options.fetchImpl,
            reasoningEffort: currentRuntime.reasoningEffort,
            systemPrompt,
            toolChoice: resolveAutonomousToolChoice(
              currentRuntime.provider,
              inspectionGuardArmed,
              options.env || process.env,
            ),
            requestTimeoutMs: currentRequestTimeoutMs,
            onEvent,
            iteration,
          },
        );

        if (!response.text && !response.toolCalls.length) {
          const autoCloseout = await tryAutoCloseoutFromWorkspace(
            workspaceDir,
            {
              ...options,
              allowGameFactoryAutoMaterialize: true,
            },
            onEvent,
          );
          if (autoCloseout) {
            response = autoCloseout;
            break;
          }

          if (emptyResponseRecoveryAttempts < currentEmptyResponseRetryLimit) {
            emptyResponseRecoveryAttempts += 1;
            appendEmptyResponseRecoveryMessage(
              messages,
              emptyResponseRecoveryAttempts,
              currentEmptyResponseRetryLimit,
              inspectionRecoveryGuidance,
            );
            onEvent({
              type: 'status',
              message:
                `Recuperacao interna: ${currentRuntime.provider}/${currentRuntime.model} retornou vazio ` +
                `(${emptyResponseRecoveryAttempts}/${currentEmptyResponseRetryLimit}). Solicitando nova resposta util.`,
              iteration,
            });
            continue;
          }

          const emptyResponseError = new Error(
            `Falha transitória do provider ${currentRuntime.provider}/${currentRuntime.model}: ` +
              'resposta vazia repetida sem texto nem tool calls enquanto mantinha o reasoning_effort configurado.',
          );
          emptyResponseError.code = 'NEXUS_EMPTY_MODEL_RESPONSE';
          emptyResponseError.runtimeProvider = currentRuntime.provider;
          emptyResponseError.runtimeModel = currentRuntime.model;
          throw emptyResponseError;
        }
        break;
      } catch (error) {
        if (activeRuntimeIndex >= runtimeCandidates.length - 1) {
          error.runtimeProvider = currentRuntime.provider;
          error.runtimeModel = currentRuntime.model;
          throw error;
        }

        const failedRuntime = currentRuntime;
        const nextRuntime = runtimeCandidates[activeRuntimeIndex + 1];
        activeRuntimeIndex += 1;
        onEvent({
          type: 'runtime_fallback',
          iteration,
          fromProvider: failedRuntime.provider,
          fromModel: failedRuntime.model,
          fromReasoningEffort: failedRuntime.reasoningEffort || null,
          toProvider: nextRuntime.provider,
          toModel: nextRuntime.model,
          toReasoningEffort: nextRuntime.reasoningEffort || null,
          fallbackDepth: activeRuntimeIndex,
          chainLength: runtimeCandidates.length,
          message: error?.message || String(error),
        });
      }
    }

    if (response.text) {
      onEvent({
        type: 'assistant_text',
        text: response.text,
        iteration,
      });
    }

    if (!response.toolCalls.length) {
      if (!response.text) {
        throw new Error('O modelo encerrou a iteração sem texto final e sem tool calls.');
      }

      return {
        ok: true,
        provider: runtimeCandidates[activeRuntimeIndex].provider,
        model: response.model || runtimeCandidates[activeRuntimeIndex].model,
        text: response.text,
        iterations: iteration,
        finishReason: response.finishReason || null,
        fallbackDepth: activeRuntimeIndex,
      };
    }

    const iterationInspectionOnly =
      response.toolCalls.length > 0 && response.toolCalls.every((toolCall) => isInspectionOnlyToolCall(toolCall));
    let iterationHadErrors = false;
    let blockedInspectionOnlyCalls = 0;
    let blockedDisallowedCalls = 0;
    let successfulAllowedCalls = 0;
    const pendingToolResults = [];
    for (const toolCall of response.toolCalls) {
      onEvent({
        type: 'tool_call',
        toolName: toolCall.name,
        input: toolCall.input,
        iteration,
      });

      let output;
      let isError = false;
      try {
        const toolAllowed = allowedToolNames.has(String(toolCall?.name || '').trim());
        if (inspectionGuardArmed && isInspectionOnlyToolCall(toolCall)) {
          blockedInspectionOnlyCalls += 1;
          isError = true;
          iterationHadErrors = true;
          output = buildInspectionOnlyBlockedMessage(
            consecutiveInspectionOnlyIterations,
            inspectionRecoveryGuidance,
          );
        } else if (!toolAllowed) {
          blockedDisallowedCalls += 1;
          isError = true;
          iterationHadErrors = true;
          output = buildDisallowedToolMessage(toolCall, activeTools, {
            inspectionGuardArmed,
            guidance: inspectionRecoveryGuidance,
          });
        } else {
          output = await executeTool(toolCall.name, toolCall.input || {});
          successfulAllowedCalls += 1;
        }
      } catch (error) {
        if (error?.blockedByHook && isInspectionOnlyToolCall(toolCall)) {
          blockedInspectionOnlyCalls += 1;
        } else if (error?.blockedByHook) {
          blockedDisallowedCalls += 1;
        }
        isError = true;
        iterationHadErrors = true;
        const commandResult = error.result;
        output = [
          error.message,
          commandResult?.stdout ? `stdout:\n${commandResult.stdout}` : null,
          commandResult?.stderr ? `stderr:\n${commandResult.stderr}` : null,
        ].filter(Boolean).join('\n\n');
      }

      pendingToolResults.push({
        toolCall,
        output: truncateText(output, MAX_TOOL_OUTPUT_CHARS),
        isError,
      });
      onEvent({
        type: 'tool_result',
        toolName: toolCall.name,
        isError,
        preview: previewText(output),
        iteration,
      });
    }

    appendAssistantMessage(messages, response);
    pendingToolResults.forEach((result) => {
      appendToolResultMessage(messages, result.toolCall, result.output, result.isError);
    });

    if (iterationInspectionOnly && (!iterationHadErrors || blockedInspectionOnlyCalls > 0)) {
      consecutiveInspectionOnlyIterations += 1;
      if (consecutiveInspectionOnlyIterations % readOnlyStreakLimit === 0) {
        appendReadOnlyRecoveryMessage(
          messages,
          consecutiveInspectionOnlyIterations,
          readOnlyStreakLimit,
          inspectionRecoveryGuidance,
        );
        onEvent({
          type: 'status',
          message:
            `Guardrail de autonomia: ${consecutiveInspectionOnlyIterations} iterações seguidas só com leitura/inspeção. ` +
            'Foi injetado um recovery hint para forçar mudança material ou REQUEST_HELP.',
          iteration,
        });
      }
    } else if (blockedDisallowedCalls > 0 && successfulAllowedCalls === 0) {
      appendReadOnlyRecoveryMessage(
        messages,
        consecutiveInspectionOnlyIterations,
        readOnlyStreakLimit,
        inspectionRecoveryGuidance,
      );
      onEvent({
        type: 'status',
        message:
          `Allowlist ativa recusou ${blockedDisallowedCalls} tool call(s) fora do schema da iteracao ` +
          'ate que a lane use somente ferramentas permitidas ou faca REQUEST_HELP.',
        iteration,
      });
    } else if (blockedInspectionOnlyCalls > 0) {
      appendReadOnlyRecoveryMessage(
        messages,
        consecutiveInspectionOnlyIterations,
        readOnlyStreakLimit,
        inspectionRecoveryGuidance,
      );
      onEvent({
        type: 'status',
        message:
          `Discovery bloqueado: ${blockedInspectionOnlyCalls} tool call(s) de leitura foram recusadas ` +
          'ate que a lane faça edição, teste ou REQUEST_HELP.',
        iteration,
      });
    } else {
      consecutiveInspectionOnlyIterations = 0;
    }

    const shouldFallbackForInspectionStall =
      activeRuntimeIndex < runtimeCandidates.length - 1 &&
      consecutiveInspectionOnlyIterations >= inspectionFallbackStreakLimit &&
      (
        iterationInspectionOnly ||
        blockedInspectionOnlyCalls > 0 ||
        (blockedDisallowedCalls > 0 && successfulAllowedCalls === 0)
      );
    if (shouldFallbackForInspectionStall) {
      const stalledRuntime = runtimeCandidates[activeRuntimeIndex];
      const nextRuntime = runtimeCandidates[activeRuntimeIndex + 1];
      const stalledIterations = consecutiveInspectionOnlyIterations;
      activeRuntimeIndex += 1;
      consecutiveInspectionOnlyIterations = 0;
      appendInspectionFallbackMessage(
        messages,
        stalledIterations,
        stalledRuntime,
        nextRuntime,
        inspectionRecoveryGuidance,
      );
      onEvent({
        type: 'runtime_fallback',
        iteration,
        fromProvider: stalledRuntime.provider,
        fromModel: stalledRuntime.model,
        fromReasoningEffort: stalledRuntime.reasoningEffort || null,
        toProvider: nextRuntime.provider,
        toModel: nextRuntime.model,
        toReasoningEffort: nextRuntime.reasoningEffort || null,
        internalRecovery: true,
        fallbackDepth: activeRuntimeIndex,
        chainLength: runtimeCandidates.length,
        message:
          `Recuperacao interna: ${stalledRuntime.provider}/${stalledRuntime.model} ficou ` +
          `${stalledIterations} iteracoes preso em leitura/inspecao. Trocando para ${nextRuntime.provider}/${nextRuntime.model}.`,
      });
    }
  }

  throw new Error(`Loop autônomo excedeu o limite de ${maxIterations} iterações.`);
}

module.exports = {
  buildCommandEnv,
  buildToolExecutor,
  createToolDefinitions,
  isReviewSafeBashCommand,
  prependPathEntries,
  resolveRequestTimeoutMsForRuntimeCandidate,
  runAutonomousToolLoop,
  sendConversationTurn,
  translateConversationForAnthropic,
  translateConversationForOpenAi,
};
