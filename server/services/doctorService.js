const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  getGlobalDefaultLlmProvider,
  normalizeLlmProvider,
} = require('./modelRegistry');
const {
  defaultSkillRoots,
  discoverSkills,
} = require('./skillsRegistry');
const {
  getOpencodeRuntimeStatus,
} = require('./opencodeRuntime');
const {
  getFigmaBridgeStatus,
} = require('./figmaBridge');
const {
  getStitchBridgeStatus,
} = require('./stitchBridge');
const {
  resolveOpencodeReviewGateConfig,
} = require('./opencodeReviewGate');

function checkBinary(command, args = ['--version']) {
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    timeout: 15000,
  });

  return {
    ok: result.status === 0,
    detail: String(result.stdout || result.stderr || '').trim() || null,
  };
}

function checkPathWritable(targetPath) {
  const probePath = path.join(targetPath, `.nexus-doctor-${Date.now()}.tmp`);
  try {
    fs.writeFileSync(probePath, 'ok', 'utf8');
    fs.unlinkSync(probePath);
    return { ok: true, detail: 'gravacao local validada' };
  } catch (error) {
    return { ok: false, detail: error.message };
  }
}

function resolveProviderEnvCheck(provider, env) {
  switch (normalizeLlmProvider(provider)) {
    case 'anthropic':
      return {
        required: ['ANTHROPIC_API_KEY|ANTHROPIC_AUTH_TOKEN'],
      };
    case 'openai':
      return {
        required: ['OPENAI_API_KEY'],
      };
    case 'azure_openai':
      return {
        required: [
          'AZURE_OPENAI_ENDPOINT',
          'AZURE_OPENAI_API_KEY',
          'AZURE_OPENAI_API_VERSION',
          'AZURE_OPENAI_DEPLOYMENT',
        ],
      };
    case 'xai':
      return {
        required: ['XAI_API_KEY'],
      };
    case 'openai_compat':
      return {
        required: [],
      };
    case 'gemini':
    default:
      return {
        required: [],
      };
  }
}

function isEnvSatisfied(expression, env) {
  if (expression.includes('|')) {
    return expression
      .split('|')
      .map((key) => key.trim())
      .some((key) => String(env[key] || '').trim());
  }
  return Boolean(String(env[expression] || '').trim());
}

function runDoctor(options = {}) {
  const env = options.env || process.env;
  const projectDir = path.resolve(String(options.projectDir || process.cwd()));
  const workspaceRoot = path.resolve(String(options.workspaceRoot || projectDir));
  const binaryChecker = typeof options.binaryChecker === 'function'
    ? options.binaryChecker
    : checkBinary;
  const provider = normalizeLlmProvider(
    options.provider || env.NEXUS_DEFAULT_LLM_PROVIDER || getGlobalDefaultLlmProvider(),
  );
  const checks = [];

  const gitCheck = binaryChecker('git');
  checks.push({
    key: 'git_binary',
    severity: gitCheck.ok ? 'info' : 'error',
    ok: gitCheck.ok,
    summary: gitCheck.ok ? 'git disponível' : 'git indisponível',
    detail: gitCheck.detail,
  });

  const nodeCheck = binaryChecker(process.execPath, ['--version']);
  checks.push({
    key: 'node_binary',
    severity: nodeCheck.ok ? 'info' : 'error',
    ok: nodeCheck.ok,
    summary: nodeCheck.ok ? 'node disponível' : 'node indisponível',
    detail: nodeCheck.detail,
  });

  const rgCheck = binaryChecker('rg');
  checks.push({
    key: 'ripgrep_binary',
    severity: rgCheck.ok ? 'info' : 'warning',
    ok: rgCheck.ok,
    summary: rgCheck.ok ? 'rg disponível' : 'rg não encontrado',
    detail: rgCheck.ok ? rgCheck.detail : 'O loop autônomo funciona melhor com ripgrep instalado.',
  });

  const gitDirExists = fs.existsSync(path.join(projectDir, '.git'));
  checks.push({
    key: 'git_repository',
    severity: gitDirExists ? 'info' : 'warning',
    ok: gitDirExists,
    summary: gitDirExists ? 'projeto com .git' : 'projeto sem .git',
    detail: gitDirExists
      ? path.join(projectDir, '.git')
      : 'Alguns fluxos de integração e worktree dependem de um repositório git.',
  });

  const writableCheck = checkPathWritable(workspaceRoot);
  checks.push({
    key: 'workspace_writable',
    severity: writableCheck.ok ? 'info' : 'error',
    ok: writableCheck.ok,
    summary: writableCheck.ok ? 'workspace gravável' : 'workspace não gravável',
    detail: writableCheck.detail,
  });

  const providerEnv = resolveProviderEnvCheck(provider, env);
  providerEnv.required.forEach((requiredKey) => {
    const ok = isEnvSatisfied(requiredKey, env);
    checks.push({
      key: `provider_env:${requiredKey}`,
      severity: ok ? 'info' : 'error',
      ok,
      summary: ok
        ? `env ${requiredKey} presente`
        : `env ${requiredKey} ausente para provider ${provider}`,
      detail: ok ? null : `Configure ${requiredKey} antes de iniciar lanes com ${provider}.`,
    });
  });

  const skillRoots = defaultSkillRoots(projectDir);
  const discoveredSkills = discoverSkills(skillRoots);
  checks.push({
    key: 'skills_roots',
    severity: 'info',
    ok: true,
    summary: `${discoveredSkills.length} skill(s) local(is) detectada(s)`,
    detail: skillRoots.join(', '),
  });

  const approvalMode = String(env.NEXUS_EXEC_APPROVAL_MODE || 'warn').trim().toLowerCase() || 'warn';
  checks.push({
    key: 'approval_mode',
    severity: approvalMode === 'off' ? 'warning' : 'info',
    ok: true,
    summary: `approval mode: ${approvalMode}`,
    detail:
      approvalMode === 'off'
        ? 'Recomendado usar warn ou enforce em ambientes compartilhados.'
        : 'Guardrails de bash ativos.',
  });

  const opencodeStatus = options.opencodeStatus || getOpencodeRuntimeStatus({
    env,
    projectDir,
  });
  const figmaBridge = options.figmaBridge || getFigmaBridgeStatus({
    env,
  });
  const stitchBridge = options.stitchBridge || getStitchBridgeStatus({
    env,
    probeAdc: true,
  });
  const opencodeReviewGate = options.opencodeReviewGate || resolveOpencodeReviewGateConfig(env);
  checks.push({
    key: 'figma_bridge',
    severity: 'info',
    ok: true,
    summary: figmaBridge.ready
      ? 'Figma bridge pronto para uso'
      : 'Figma bridge opcional sem token configurado',
    detail: figmaBridge.ready
      ? `${figmaBridge.tokenSource} | ${figmaBridge.apiBaseUrl}`
      : `Configure FIGMA_ACCESS_TOKEN para habilitar figma_get_* nas lanes. Base: ${figmaBridge.apiBaseUrl}`,
  });
  checks.push({
    key: 'stitch_bridge',
    severity: 'info',
    ok: true,
    summary: stitchBridge.ready
      ? 'Stitch bridge pronto para uso'
      : 'Stitch bridge opcional sem credenciais prontas',
    detail: stitchBridge.ready
      ? [
          stitchBridge.authMode,
          stitchBridge.projectId ? `project ${stitchBridge.projectId}` : null,
          stitchBridge.mcpUrl,
        ]
          .filter(Boolean)
          .join(' | ')
      : `Configure STITCH_API_KEY ou STITCH_ACCESS_TOKEN + STITCH_GOOGLE_CLOUD_PROJECT; alternativamente use ADC via gcloud. MCP: ${stitchBridge.mcpUrl}`,
  });
  checks.push({
    key: 'opencode_validator_binary',
    severity: opencodeStatus.enabled
      ? (opencodeStatus.available ? 'info' : 'error')
      : 'info',
    ok: opencodeStatus.enabled ? opencodeStatus.available : true,
    summary: opencodeStatus.enabled
      ? (opencodeStatus.available
        ? 'OpenCode validator habilitado'
        : 'OpenCode validator habilitado, mas binario indisponivel')
      : 'OpenCode removido do Nexus',
    detail: opencodeStatus.available
      ? [
          opencodeStatus.command,
          opencodeStatus.version ? `version ${opencodeStatus.version}` : null,
        ]
          .filter(Boolean)
          .join(' | ')
      : (
          opencodeStatus.disabledReason
          || opencodeStatus.error
          || 'Validador externo opcional desabilitado.'
        ),
  });
  checks.push({
    key: 'opencode_validator_model',
    severity: opencodeStatus.enabled
      ? (opencodeStatus.defaultModel ? 'info' : 'warning')
      : 'info',
    ok: !opencodeStatus.enabled || Boolean(opencodeStatus.defaultModel),
    summary: opencodeStatus.defaultModel
      ? `OpenCode model default: ${opencodeStatus.defaultModel}`
      : 'OpenCode sem modelo default fixo',
    detail: opencodeStatus.defaultModel
      ? `agent=${opencodeStatus.defaultAgent} format=${opencodeStatus.reviewFormat}`
      : (opencodeStatus.disabledReason || 'Validador externo opcional desabilitado.'),
  });
  checks.push({
    key: 'opencode_validator_auth',
    severity: opencodeStatus.enabled
      ? (opencodeStatus.authConfigured ? 'info' : 'warning')
      : 'info',
    ok: !opencodeStatus.enabled || opencodeStatus.authConfigured || !opencodeStatus.defaultModel,
    summary: opencodeStatus.authConfigured
      ? 'OpenCode com credenciais/config detectadas'
      : 'OpenCode sem credenciais detectadas',
    detail: [
      opencodeStatus.authFile ? `auth=${opencodeStatus.authFile}` : null,
      opencodeStatus.globalConfigFile ? `config=${opencodeStatus.globalConfigFile}` : null,
      opencodeStatus.projectConfigFile ? `project=${opencodeStatus.projectConfigFile}` : null,
    ]
      .filter(Boolean)
      .join(' | ') || (opencodeStatus.disabledReason || 'Validador externo opcional desabilitado.'),
  });
  checks.push({
    key: 'opencode_review_gate',
    severity:
      opencodeReviewGate.enabled && opencodeReviewGate.mode === 'required' && !opencodeStatus.ready
        ? 'warning'
        : 'info',
    ok:
      !opencodeReviewGate.enabled
      || opencodeReviewGate.mode !== 'required'
      || opencodeStatus.ready,
    summary: opencodeReviewGate.enabled
      ? `OpenCode review gate automatico: ${opencodeReviewGate.mode}`
      : 'OpenCode review gate automatico desabilitado',
    detail: `timeout=${opencodeReviewGate.timeoutMs}ms`,
  });

  const errors = checks.filter((check) => !check.ok && check.severity === 'error');
  const warnings = checks.filter((check) => !check.ok && check.severity === 'warning');

  return {
    ok: errors.length === 0,
    provider,
    projectDir,
    workspaceRoot,
    summary: {
      errors: errors.length,
      warnings: warnings.length,
      info: checks.filter((check) => check.severity === 'info').length,
    },
    checks,
  };
}

module.exports = {
  runDoctor,
};
