const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectAdminPendingMarker,
  detectCompletionMarker,
  normalizeTerminalSignalText,
  resolveAdminPendingMarker,
  resolveAdminPendingPromise,
} = require('../services/runSignals');

test('resolveAdminPendingPromise defaults to the canonical pending admin signal', () => {
  assert.equal(resolveAdminPendingPromise({}), 'NEXUS_PENDING_ADMIN');
});

test('normalizeTerminalSignalText wraps the pending admin signal as a promise marker', () => {
  assert.equal(
    normalizeTerminalSignalText('NEXUS_PENDING_ADMIN', {}),
    resolveAdminPendingMarker({}),
  );
});

test('detectAdminPendingMarker detects an isolated pending admin marker', () => {
  const marker = resolveAdminPendingMarker({});
  assert.equal(detectAdminPendingMarker(`contexto\n${marker}\nmais contexto`, {}), true);
});

test('detectCompletionMarker still ignores the pending admin signal', () => {
  const marker = resolveAdminPendingMarker({});
  assert.equal(detectCompletionMarker(marker, {}), false);
});
