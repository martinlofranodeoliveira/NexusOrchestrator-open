const { runAutonomousToolLoop } = require('./autonomousToolLoop');
const { runCodeCorrectionLoop } = require('./codeCorrectionLoop');
const { encodeRuntimeEvent } = require('./runtimeEventProtocol');
const {
  normalizeTerminalSignalText,
  resolveCompletionMarker,
  resolveCompletionPromise,
  resolveRejectionMarker,
  resolveRejectionPromise,
} = require('./runSignals');

function logLine(stream, value) {
  const text = String(value || '').trim();
  if (!text) return;
  stream.write(`${text}\n`);
}

function stringifyShort(value) {
  try {
    return JSON.stringify(value);
  } catch (_error) {
    return String(value);
  }
}

function emitRuntimeEvent(stream, payload) {
  if (!payload || typeof payload !== 'object') return;
  stream.write(encodeRuntimeEvent(payload));
}

function normalizeIteration(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function emitRunnerEvent(stream, event = {}) {
  switch (event.type) {
    case 'status':
      emitRuntimeEvent(stream, {
        type: 'status',
        message: event.message || null,
        iteration: normalizeIteration(event.iteration),
      });
      logLine(stream, `[SYSTEM] ${event.message}`);
      break;
    case 'runtime_selected':
      emitRuntimeEvent(stream, {
        type: 'runtime.selected',
        provider: event.provider,
        model: event.model,
        reasoningEffort: event.reasoningEffort || null,
        fallbackDepth: Number(event.fallbackDepth || 0),
        fallbackActive: Boolean(event.fallbackActive),
        chainLength: Number(event.chainLength || 1),
      });
      break;
    case 'runtime_fallback':
      emitRuntimeEvent(stream, {
        type: 'runtime.fallback',
        fromProvider: event.fromProvider,
        fromModel: event.fromModel,
        fromReasoningEffort: event.fromReasoningEffort || null,
        toProvider: event.toProvider,
        toModel: event.toModel,
        toReasoningEffort: event.toReasoningEffort || null,
        fallbackDepth: Number(event.fallbackDepth || 0),
        chainLength: Number(event.chainLength || 1),
        message: event.message || null,
      });
      if (
        String(event.fromProvider || '').trim() === String(event.toProvider || '').trim() &&
        String(event.fromModel || '').trim() === String(event.toModel || '').trim()
      ) {
        logLine(
          stream,
          `[SYSTEM] Retentativa interna no mesmo runtime ${event.toProvider}/${event.toModel}. Motivo: ${event.message || 'recuperacao interna do provider/modelo'}`,
        );
        break;
      }
      logLine(
        stream,
        `[SYSTEM] Failover automático ${event.fromProvider}/${event.fromModel} -> ${event.toProvider}/${event.toModel}. Motivo: ${event.message || 'falha de provider/modelo'}`,
      );
      break;
    case 'assistant_text':
      emitRuntimeEvent(stream, {
        type: 'assistant_text',
        text: event.text || '',
        iteration: normalizeIteration(event.iteration),
      });
      logLine(stream, event.text);
      break;
    case 'tool_call':
      emitRuntimeEvent(stream, {
        type: 'tool_call',
        toolName: event.toolName || null,
        input: event.input && typeof event.input === 'object' ? event.input : {},
        iteration: normalizeIteration(event.iteration),
      });
      logLine(
        stream,
        `[TOOL] ${event.toolName} ${stringifyShort(event.input)}`,
      );
      break;
    case 'tool_result':
      emitRuntimeEvent(stream, {
        type: 'tool_result',
        toolName: event.toolName || null,
        isError: Boolean(event.isError),
        preview: event.preview || '',
        iteration: normalizeIteration(event.iteration),
      });
      logLine(
        stream,
        `[TOOL_RESULT:${event.isError ? 'ERROR' : 'OK'}] ${event.toolName}\n${event.preview}`,
      );
      break;
    case 'tool_policy':
      emitRuntimeEvent(stream, {
        type: 'tool.policy',
        toolName: event.toolName,
        verdict: event.verdict,
        message: event.message || null,
        command: event.command || null,
      });
      logLine(
        stream,
        `[SYSTEM] Guardrail ${event.verdict} para ${event.toolName}: ${event.message || 'regra acionada'}`,
      );
      break;
    default:
      break;
  }
}

function emitLoopResult(stream, result) {
  const completionPromise = resolveCompletionPromise(process.env);
  const completionMarker = resolveCompletionMarker(process.env);
  const rejectionPromise = resolveRejectionPromise(process.env);
  const rejectionMarker = resolveRejectionMarker(process.env);
  const loopText = normalizeTerminalSignalText(result?.text, process.env);

  if (loopText) {
    logLine(
      stream,
      loopText === completionPromise
        ? completionMarker
        : loopText === rejectionPromise
          ? rejectionMarker
          : loopText,
    );
  }

  logLine(
    stream,
    `[SYSTEM] Loop multi-provider finalizado em ${result.iterations} iteração(ões) usando ${result.provider}/${result.model}.`,
  );
}

async function main() {
  const config = JSON.parse(process.env.NEXUS_AUTONOMOUS_RUNNER_CONFIG || '{}');
  const provider = String(config.provider || '').trim();
  const model = String(config.model || '').trim();

  const result = await runCodeCorrectionLoop({
    runLoop: runAutonomousToolLoop,
    provider,
    model,
    reasoningEffort: config.reasoningEffort || null,
    fallbackChain: Array.isArray(config.fallbackChain) ? config.fallbackChain : [],
    cwd: config.cwd || process.cwd(),
    prompt: config.prompt || '',
    systemPrompt: config.systemPrompt || '',
    taskTitle: config.taskTitle || config.prompt || '',
    taskId: config.taskId || null,
    taskStatus: config.taskStatus || null,
    requestKind: config.requestKind || 'primary',
    commandRecoveryCount: Number(config.commandRecoveryCount || 0),
    recoveryHint: config.recoveryHint || null,
    agent: config.agent || {},
    approvalMode: config.approvalMode || process.env.NEXUS_EXEC_APPROVAL_MODE,
    maxIterations: config.maxIterations,
    inspectionRecoveryGuidance: config.inspectionRecoveryGuidance || '',
    readOnlyStreakLimit: config.readOnlyStreakLimit,
    env: process.env,
    onEvent(event) {
      emitRunnerEvent(process.stdout, event);
    },
  });

  emitLoopResult(process.stdout, result);
}

if (require.main === module) {
  main().catch((error) => {
    logLine(process.stderr, error && error.stack ? error.stack : error.message || String(error));
    process.exit(1);
  });
}

module.exports = {
  emitRunnerEvent,
  emitLoopResult,
  resolveCompletionMarker,
  resolveCompletionPromise,
  resolveRejectionMarker,
  resolveRejectionPromise,
};
