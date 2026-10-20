const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectCompletionMarker,
  detectRejectionMarker,
  normalizeTerminalSignalText,
  resolveCompletionMarker,
  resolveRejectionMarker,
} = require('../services/runSignals');

test('detectCompletionMarker only accepts an isolated completion marker line', () => {
  const marker = resolveCompletionMarker();

  assert.equal(detectCompletionMarker(`status ok\n${marker}\n`), true);
  assert.equal(detectCompletionMarker(`Nao emito ${marker} ainda.`), false);
});

test('detectRejectionMarker only accepts an isolated rejection marker line', () => {
  const marker = resolveRejectionMarker();

  assert.equal(detectRejectionMarker(`evidencia\n${marker}\n`), true);
  assert.equal(detectRejectionMarker(`Nao emito ${marker} nesta etapa.`), false);
});

test('normalizeTerminalSignalText upgrades bare terminal promises into protocol markers', () => {
  assert.equal(
    normalizeTerminalSignalText('NEXUS_TASK_COMPLETE'),
    resolveCompletionMarker(),
  );
  assert.equal(
    normalizeTerminalSignalText('NEXUS_TASK_REJECTED'),
    resolveRejectionMarker(),
  );
});
