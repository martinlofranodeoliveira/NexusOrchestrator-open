const DEFAULT_EXEC_APPROVAL_MODE = String(process.env.NEXUS_EXEC_APPROVAL_MODE || 'warn')
  .trim()
  .toLowerCase();

const BASE_RULES = Object.freeze([
  {
    id: 'git_reset_hard',
    severity: 'critical',
    pattern: /\bgit\s+reset\s+--hard\b/i,
    message: 'git reset --hard pode descartar trabalho local sem recuperacao.',
  },
  {
    id: 'git_checkout_discard',
    severity: 'critical',
    pattern: /\bgit\s+checkout\s+--\b/i,
    message: 'git checkout -- descarta alteracoes locais em arquivos.',
  },
  {
    id: 'git_clean_force',
    severity: 'critical',
    pattern: /\bgit\s+clean\b.*\s-f\b/i,
    message: 'git clean -f remove arquivos nao rastreados.',
  },
  {
    id: 'system_shutdown',
    severity: 'critical',
    pattern: /\b(shutdown|reboot|poweroff|halt)\b/i,
    message: 'Comandos de desligamento da maquina nao sao permitidos.',
  },
  {
    id: 'rm_root',
    severity: 'critical',
    pattern: /\brm\s+-rf?\s+(\/|~\/?$|\$HOME\b)/i,
    message: 'rm -rf em raiz ou home e destrutivo demais.',
  },
  {
    id: 'sudo',
    severity: 'critical',
    pattern: /\bsudo\b/i,
    message: 'sudo amplia blast radius e deve ser evitado por agentes autonomos.',
  },
  {
    id: 'fork_bomb',
    severity: 'critical',
    pattern: /:\s*\(\)\s*\{\s*:\s*\|\s*:\s*&\s*\};\s*:/,
    message: 'Fork bomb detectada.',
  },
  {
    id: 'rm_recursive',
    severity: 'warning',
    pattern: /\brm\s+-rf?\b/i,
    message: 'rm -rf merece confirmacao do escopo antes de executar.',
  },
  {
    id: 'remote_pipe_shell',
    severity: 'warning',
    pattern: /\b(curl|wget)\b[\s\S]*\|\s*(sh|bash)\b/i,
    message: 'Baixar e executar script remoto aumenta risco operacional.',
  },
  {
    id: 'docker_prune',
    severity: 'warning',
    pattern: /\bdocker\s+system\s+prune\b/i,
    message: 'docker system prune pode remover cache e artefatos fora do workspace imediato.',
  },
]);

function resolveApprovalMode(rawMode) {
  const normalized = String(rawMode || DEFAULT_EXEC_APPROVAL_MODE).trim().toLowerCase();
  if (normalized === 'off') return 'off';
  if (normalized === 'enforce') return 'enforce';
  return 'warn';
}

function splitCustomPatterns(rawValue) {
  return String(rawValue || '')
    .split(/[\n,;]+/)
    .map((value) => value.trim())
    .filter(Boolean);
}

function buildCustomRules(rawValue, severity) {
  return splitCustomPatterns(rawValue)
    .map((pattern, index) => {
      try {
        return {
          id: `custom_${severity}_${index + 1}`,
          severity,
          pattern: new RegExp(pattern, 'i'),
          message: `Padrao personalizado (${severity}): ${pattern}`,
        };
      } catch (_error) {
        return null;
      }
    })
    .filter(Boolean);
}

function listApprovalRules(env = process.env) {
  return [
    ...BASE_RULES,
    ...buildCustomRules(env.NEXUS_EXEC_APPROVAL_DENY_PATTERNS, 'critical'),
    ...buildCustomRules(env.NEXUS_EXEC_APPROVAL_WARN_PATTERNS, 'warning'),
  ];
}

function evaluateCommandRisk(command, options = {}) {
  const text = String(command || '').trim();
  const approvalMode = resolveApprovalMode(options.approvalMode || options.env?.NEXUS_EXEC_APPROVAL_MODE);
  if (!text || approvalMode === 'off') {
    return {
      approvalMode,
      verdict: 'allow',
      command: text,
      matchedRules: [],
      summary: null,
    };
  }

  const matchedRules = listApprovalRules(options.env || process.env)
    .filter((rule) => rule.pattern.test(text))
    .map((rule) => ({
      id: rule.id,
      severity: rule.severity,
      message: rule.message,
    }));

  const hasCritical = matchedRules.some((rule) => rule.severity === 'critical');
  const verdict = hasCritical && approvalMode === 'enforce'
    ? 'block'
    : matchedRules.length > 0
      ? 'warn'
      : 'allow';

  return {
    approvalMode,
    verdict,
    command: text,
    matchedRules,
    summary:
      matchedRules.length > 0
        ? matchedRules.map((rule) => rule.message).join(' ')
        : null,
  };
}

module.exports = {
  DEFAULT_EXEC_APPROVAL_MODE,
  evaluateCommandRisk,
  listApprovalRules,
  resolveApprovalMode,
};
