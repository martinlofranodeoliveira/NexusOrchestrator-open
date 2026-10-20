const test = require('node:test');
const assert = require('node:assert/strict');
const { PassThrough } = require('node:stream');

const { consumeRuntimeEventBuffer } = require('../services/runtimeEventProtocol');
const {
  emitRunnerEvent,
  emitLoopResult,
  resolveCompletionMarker,
  resolveRejectionMarker,
} = require('../services/autonomousToolLoopRunner');

function collectStreamOutput(run) {
  const stream = new PassThrough();
  let output = '';
  stream.on('data', (chunk) => {
    output += chunk.toString();
  });
  run(stream);
  stream.end();
  return output;
}

test('emitLoopResult upgrades a bare completion promise into the runtime marker', () => {
  const output = collectStreamOutput((stream) => {
    emitLoopResult(stream, {
      text: 'NEXUS_TASK_COMPLETE',
      iterations: 1,
      provider: 'azure_openai',
      model: 'gpt-5.4',
    });
  });

  assert.match(output, /<promise>NEXUS_TASK_COMPLETE<\/promise>/);
  assert.match(
    output,
    /\[SYSTEM\] Loop multi-provider finalizado em 1 iteração\(ões\) usando azure_openai\/gpt-5\.4\./,
  );
});

test('emitLoopResult preserves normal final text without fabricating a completion marker', () => {
  const completionMarker = resolveCompletionMarker();
  const output = collectStreamOutput((stream) => {
    emitLoopResult(stream, {
      text: 'Workspace validado sem bloqueios.',
      iterations: 3,
      provider: 'azure_openai',
      model: 'gpt-5.4',
    });
  });

  assert.match(output, /Workspace validado sem bloqueios\./);
  assert.equal(output.includes(completionMarker), false);
});

test('emitLoopResult upgrades a bare rejection promise into the runtime marker', () => {
  const output = collectStreamOutput((stream) => {
    emitLoopResult(stream, {
      text: 'NEXUS_TASK_REJECTED',
      iterations: 2,
      provider: 'azure_openai',
      model: 'gpt-5.4',
    });
  });

  assert.match(output, new RegExp(resolveRejectionMarker().replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});

test('emitRunnerEvent encodes structured status events and preserves log text', () => {
  const output = collectStreamOutput((stream) => {
    emitRunnerEvent(stream, {
      type: 'status',
      message: 'Aguardando resposta do modelo azure_openai/gpt-5.4 há 30s (timeout 300s).',
      iteration: 2,
    });
  });

  const decoded = consumeRuntimeEventBuffer('', output);

  assert.equal(decoded.events.length, 1);
  assert.deepEqual(decoded.events[0], {
    type: 'status',
    message: 'Aguardando resposta do modelo azure_openai/gpt-5.4 há 30s (timeout 300s).',
    iteration: 2,
  });
  assert.match(decoded.text, /\[SYSTEM\] Aguardando resposta do modelo azure_openai\/gpt-5\.4 há 30s/);
});

test('emitRunnerEvent reports a same-runtime fallback as internal retry instead of automatic failover', () => {
  const output = collectStreamOutput((stream) => {
    emitRunnerEvent(stream, {
      type: 'runtime_fallback',
      fromProvider: 'azure_openai',
      fromModel: 'gpt-5.4',
      fromReasoningEffort: 'xhigh',
      toProvider: 'azure_openai',
      toModel: 'gpt-5.4',
      toReasoningEffort: 'xhigh',
      fallbackDepth: 1,
      chainLength: 2,
      message: 'Recuperacao interna sem trocar de runtime.',
    });
  });

  const decoded = consumeRuntimeEventBuffer('', output);

  assert.equal(decoded.events.length, 1);
  assert.deepEqual(decoded.events[0], {
    type: 'runtime.fallback',
    fromProvider: 'azure_openai',
    fromModel: 'gpt-5.4',
    fromReasoningEffort: 'xhigh',
    toProvider: 'azure_openai',
    toModel: 'gpt-5.4',
    toReasoningEffort: 'xhigh',
    fallbackDepth: 1,
    chainLength: 2,
    message: 'Recuperacao interna sem trocar de runtime.',
  });
  assert.match(decoded.text, /\[SYSTEM\] Retentativa interna no mesmo runtime azure_openai\/gpt-5\.4\./);
  assert.equal(decoded.text.includes('Failover automático'), false);
});
