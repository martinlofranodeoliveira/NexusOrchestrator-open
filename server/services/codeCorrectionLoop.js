const { spawn } = require('child_process');

const DEFAULT_TEST_TIMEOUT_MS = 300000;
const DEFAULT_RETRIES_PER_MODEL = 3;
const DEFAULT_FAILURE_FEEDBACK_CHARS = 12000;
const FAILURE_LINE_PATTERN = /(?:\bnot ok\b|\bfail(?:ed|ure)?\b|\berror\b|\bassert(?:ion)?\b|\bexpected\b|\bactual\b|syntaxerror|typeerror|referenceerror)/i;

function normalizePositiveInteger(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

function normalizeRuntimeCandidate(candidate, fallbackProvider = null) {
  if (typeof candidate === 'string') {
    const normalized = candidate.trim();
    const separator = normalized.indexOf('/');
    if (separator > 0) {
      return {
        provider: normalized.slice(0, separator),
        model: normalized.slice(separator + 1),
        reasoningEffort: null,
      };
    }
    return normalized && fallbackProvider
      ? { provider: fallbackProvider, model: normalized, reasoningEffort: null }
      : null;
  }

  if (!candidate || typeof candidate !== 'object') return null;
  const provider = String(candidate.provider || candidate.llmProvider || fallbackProvider || '').trim();
  const model = String(candidate.model || '').trim();
  if (!provider || !model) return null;
  return {
    provider,
    model,
    reasoningEffort: candidate.reasoningEffort || null,
  };
}

function buildRuntimeCandidates(options = {}) {
  const primary = normalizeRuntimeCandidate({
    provider: options.provider,
    model: options.model,
    reasoningEffort: options.reasoningEffort || null,
  });
  const candidates = [
    primary,
    ...(Array.isArray(options.fallbackChain) ? options.fallbackChain : [])
      .map((candidate) => normalizeRuntimeCandidate(candidate, primary?.provider)),
  ].filter(Boolean);
  const seen = new Set();
  return candidates.filter((candidate) => {
    const key = `${candidate.provider}/${candidate.model}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cropAroundFailure(lines, failureIndex, limit) {
  let start = Math.max(0, failureIndex - 18);
  let end = Math.min(lines.length, failureIndex + 42);
  let excerpt = lines.slice(start, end).join('\n');

  while (excerpt.length > limit && (start < failureIndex || end > failureIndex + 1)) {
    if (end - failureIndex > failureIndex - start) end -= 1;
    else start += 1;
    excerpt = lines.slice(start, end).join('\n');
  }
  return excerpt.slice(0, limit);
}

function focusValidationFailure(output, limit = DEFAULT_FAILURE_FEEDBACK_CHARS) {
  const text = String(output || '').trim();
  if (!text || text.length <= limit) return text || '[teste sem saida]';

  const lines = text.split(/\r?\n/);
  const failureIndex = lines.findIndex((line) => FAILURE_LINE_PATTERN.test(line));
  if (failureIndex < 0) {
    // A causa costuma aparecer no inicio; cortar apenas pelo fim esconde justamente esse contexto.
    return `${text.slice(0, Math.max(0, limit - 25))}\n...[saida truncada]`;
  }
  const excerpt = cropAroundFailure(lines, failureIndex, Math.max(1, limit - 50));
  return [
    failureIndex > 0 ? '...[linhas anteriores omitidas]' : null,
    excerpt,
    failureIndex + 1 < lines.length ? '...[linhas posteriores omitidas]' : null,
  ].filter(Boolean).join('\n');
}

function runValidationCommand(command, options = {}) {
  const cwd = options.cwd || process.cwd();
  const env = options.env || process.env;
  const timeoutMs = normalizePositiveInteger(options.timeoutMs, DEFAULT_TEST_TIMEOUT_MS);

  return new Promise((resolve) => {
    const child = spawn('/bin/sh', ['-lc', command], {
      cwd,
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      child.kill('SIGTERM');
    }, timeoutMs);

    child.stdout.on('data', (chunk) => { stdout += String(chunk); });
    child.stderr.on('data', (chunk) => { stderr += String(chunk); });
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({ ok: false, exitCode: null, stdout, stderr: `${stderr}\n${error.message}`.trim(), timedOut });
    });
    child.on('close', (code, signal) => {
      clearTimeout(timer);
      resolve({
        ok: code === 0 && !timedOut,
        exitCode: code,
        signal: signal || null,
        stdout,
        stderr,
        timedOut,
      });
    });
  });
}

function buildRetryPrompt(originalPrompt, validationCommand, validation, attempt, attemptsPerModel) {
  const combinedOutput = [
    validation.stdout ? `stdout:\n${validation.stdout}` : null,
    validation.stderr ? `stderr:\n${validation.stderr}` : null,
    validation.timedOut ? 'O comando excedeu o timeout configurado.' : null,
  ].filter(Boolean).join('\n\n');
  return [
    originalPrompt,
    '',
    `A validacao automatica \`${validationCommand}\` falhou (tentativa ${attempt}/${attemptsPerModel}).`,
    'Corrija a causa abaixo com uma edicao localizada e execute os testes novamente antes de concluir.',
    'Nao reescreva arquivos inteiros quando edit_file for suficiente.',
    '',
    focusValidationFailure(combinedOutput),
  ].join('\n');
}

async function runCodeCorrectionLoop(options = {}) {
  const runLoop = options.runLoop;
  if (typeof runLoop !== 'function') throw new Error('runCodeCorrectionLoop requer runLoop.');

  const env = options.env || process.env;
  const validationCommand = String(
    options.validationCommand || env.NEXUS_AUTONOMOUS_TEST_COMMAND || '',
  ).trim();
  if (!validationCommand) return runLoop(options);

  const validationRunner = options.validationRunner || runValidationCommand;
  const attemptsPerModel = normalizePositiveInteger(
    options.attemptsPerModel || env.NEXUS_AUTONOMOUS_TEST_RETRIES_PER_MODEL,
    DEFAULT_RETRIES_PER_MODEL,
  );
  const timeoutMs = normalizePositiveInteger(
    options.validationTimeoutMs || env.NEXUS_AUTONOMOUS_TEST_TIMEOUT_MS,
    DEFAULT_TEST_TIMEOUT_MS,
  );
  const candidates = buildRuntimeCandidates(options);
  const originalPrompt = String(options.prompt || '').trim();
  const onEvent = typeof options.onEvent === 'function' ? options.onEvent : () => {};
  let lastValidation = null;

  if (!candidates.length) throw new Error('Nenhum runtime disponivel para o loop de correcao.');

  for (let candidateIndex = 0; candidateIndex < candidates.length; candidateIndex += 1) {
    const candidate = candidates[candidateIndex];
    let prompt = candidateIndex > 0 && lastValidation
      ? buildRetryPrompt(
          originalPrompt,
          validationCommand,
          lastValidation,
          attemptsPerModel,
          attemptsPerModel,
        )
      : originalPrompt;

    for (let attempt = 1; attempt <= attemptsPerModel; attempt += 1) {
      let result;
      try {
        result = await runLoop({
          ...options,
          provider: candidate.provider,
          model: candidate.model,
          reasoningEffort: candidate.reasoningEffort,
          fallbackChain: [],
          prompt,
        });
      } catch (error) {
        if (candidateIndex < candidates.length - 1) {
          onEvent({
            type: 'status',
            message: `Runtime ${candidate.provider}/${candidate.model} falhou; acionando o proximo modelo local. Motivo: ${error.message}`,
          });
          break;
        }
        throw error;
      }

      onEvent({
        type: 'status',
        message: `Executando gate de correcao: ${validationCommand} (${attempt}/${attemptsPerModel}) com ${candidate.provider}/${candidate.model}.`,
      });
      lastValidation = await validationRunner(validationCommand, {
        cwd: options.cwd || process.cwd(),
        env,
        timeoutMs,
      });
      if (lastValidation.ok) {
        return {
          ...result,
          validation: {
            command: validationCommand,
            attempts: attempt,
            runtime: `${candidate.provider}/${candidate.model}`,
          },
        };
      }

      prompt = buildRetryPrompt(
        originalPrompt,
        validationCommand,
        lastValidation,
        attempt,
        attemptsPerModel,
      );
      onEvent({
        type: 'status',
        message:
          `Gate falhou com ${candidate.provider}/${candidate.model}; ` +
          (attempt < attemptsPerModel
            ? 'a falha foi devolvida ao mesmo modelo para correcao.'
            : 'as tentativas deste modelo se esgotaram.'),
      });
    }

    if (candidateIndex < candidates.length - 1) {
      const next = candidates[candidateIndex + 1];
      onEvent({
        type: 'status',
        message: `Fallback de correcao agrupado: ${candidate.provider}/${candidate.model} -> ${next.provider}/${next.model}.`,
      });
    }
  }

  const feedback = focusValidationFailure([
    lastValidation?.stdout,
    lastValidation?.stderr,
  ].filter(Boolean).join('\n'));
  const error = new Error(
    `Gate \`${validationCommand}\` continuou falhando apos ${attemptsPerModel} tentativa(s) por modelo.\n${feedback}`,
  );
  error.code = 'NEXUS_TEST_CORRECTION_EXHAUSTED';
  error.exitCode = 1;
  throw error;
}

module.exports = {
  buildRuntimeCandidates,
  focusValidationFailure,
  runCodeCorrectionLoop,
  runValidationCommand,
};
