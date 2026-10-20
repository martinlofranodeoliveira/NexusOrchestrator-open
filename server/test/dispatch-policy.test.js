const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isAutoDispatchCandidateStatus,
  isImplementationDispatchCandidateStatus,
  normalizeCollaborationDispatchStatus,
  resolveBacklogAutoDispatchEnabled,
  resolveBacklogAutoPromotionEnabled,
  resolvePrimaryReadySlotTarget,
} = require('../services/dispatchPolicy');

test('resolveBacklogAutoDispatchEnabled defaults to true for backward compatibility', () => {
  assert.equal(resolveBacklogAutoDispatchEnabled({}), true);
});

test('resolveBacklogAutoDispatchEnabled disables backlog claims when env is false', () => {
  assert.equal(
    resolveBacklogAutoDispatchEnabled({ NEXUS_AUTO_DISPATCH_FROM_BACKLOG: 'false' }),
    false,
  );
});

test('resolveBacklogAutoPromotionEnabled defaults to true for backward compatibility', () => {
  assert.equal(resolveBacklogAutoPromotionEnabled({}), true);
});

test('resolveBacklogAutoPromotionEnabled disables automatic ready promotion when env is false', () => {
  assert.equal(
    resolveBacklogAutoPromotionEnabled({ NEXUS_AUTO_PROMOTE_READY_FROM_BACKLOG: 'false' }),
    false,
  );
});

test('resolvePrimaryReadySlotTarget defaults to two controlled fronts', () => {
  assert.equal(resolvePrimaryReadySlotTarget({}), 2);
});

test('resolvePrimaryReadySlotTarget clamps invalid values to a safe minimum', () => {
  assert.equal(resolvePrimaryReadySlotTarget({ NEXUS_PRIMARY_READY_SLOT_TARGET: '0' }), 1);
  assert.equal(resolvePrimaryReadySlotTarget({ NEXUS_PRIMARY_READY_SLOT_TARGET: 'abc' }), 2);
});

test('implementation dispatch always accepts ready', () => {
  assert.equal(isImplementationDispatchCandidateStatus('ready', {}), true);
});

test('implementation dispatch rejects backlog when backlog auto-dispatch is disabled', () => {
  assert.equal(
    isImplementationDispatchCandidateStatus('backlog', {
      NEXUS_AUTO_DISPATCH_FROM_BACKLOG: 'false',
    }),
    false,
  );
});

test('auto-dispatch always accepts in_review', () => {
  assert.equal(
    isAutoDispatchCandidateStatus('in_review', {
      NEXUS_AUTO_DISPATCH_FROM_BACKLOG: 'false',
    }),
    true,
  );
});

test('auto-dispatch rejects backlog when backlog auto-dispatch is disabled', () => {
  assert.equal(
    isAutoDispatchCandidateStatus('backlog', {
      NEXUS_AUTO_DISPATCH_FROM_BACKLOG: 'false',
    }),
    false,
  );
});

test('collaboration dispatch treats backlog and in progress work as ready for bounded subtasks', () => {
  assert.equal(normalizeCollaborationDispatchStatus('backlog'), 'ready');
  assert.equal(normalizeCollaborationDispatchStatus('in_progress'), 'ready');
  assert.equal(normalizeCollaborationDispatchStatus('ready'), 'ready');
  assert.equal(normalizeCollaborationDispatchStatus('in_review'), 'in_review');
});
