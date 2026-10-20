const test = require('node:test');
const assert = require('node:assert/strict');

const {
  resolveBranchAbsorptionStatusDecision,
  shouldBypassPublishedBranchLock,
} = require('../services/primaryTaskSyncPolicy');

test('resolveBranchAbsorptionStatusDecision preserves explicit backlog even when a published branch is integrated', () => {
  assert.equal(
    resolveBranchAbsorptionStatusDecision({
      remoteStatus: 'backlog',
      branchRef: 'origin/feature/gh-1',
      integrated: true,
    }),
    'backlog',
  );
});

test('resolveBranchAbsorptionStatusDecision honors explicit remote backlog even when the previous state was active', () => {
  assert.equal(
    resolveBranchAbsorptionStatusDecision({
      remoteStatus: 'backlog',
      previousStatus: 'in_progress',
      branchRef: 'origin/feature/gh-16',
      integrated: false,
    }),
    'backlog',
  );
});

test('resolveBranchAbsorptionStatusDecision preserves explicit remote done when branch is not integrated', () => {
  assert.equal(
    resolveBranchAbsorptionStatusDecision({
      remoteStatus: 'done',
      branchRef: 'origin/feature/gh-5',
      integrated: false,
    }),
    'done',
  );
});

test('resolveBranchAbsorptionStatusDecision preserves explicit remote ready when branch is not integrated', () => {
  assert.equal(
    resolveBranchAbsorptionStatusDecision({
      remoteStatus: 'ready',
      branchRef: 'origin/feature/gh-30',
      integrated: false,
    }),
    'preserve',
  );
});

test('resolveBranchAbsorptionStatusDecision preserves unlabeled published work when the branch is not integrated', () => {
  assert.equal(
    resolveBranchAbsorptionStatusDecision({
      remoteStatus: null,
      branchRef: 'origin/feature/gh-7',
      integrated: false,
    }),
    'preserve',
  );
});

test('resolveBranchAbsorptionStatusDecision still marks integrated published branches as done when no explicit status exists', () => {
  assert.equal(
    resolveBranchAbsorptionStatusDecision({
      remoteStatus: null,
      branchRef: 'origin/feature/gh-9',
      integrated: true,
    }),
    'done',
  );
});

test('resolveBranchAbsorptionStatusDecision preserves explicit local ready when remote status is missing', () => {
  assert.equal(
    resolveBranchAbsorptionStatusDecision({
      remoteStatus: null,
      previousStatus: 'ready',
      branchRef: 'origin/feature/gh-16',
      integrated: true,
    }),
    'preserve',
  );
});

test('shouldBypassPublishedBranchLock allows rerun after integrated published work is explicitly reopened', () => {
  assert.equal(
    shouldBypassPublishedBranchLock({
      taskStatus: 'ready',
      branchRef: 'origin/feature/gh-16',
      integrated: true,
    }),
    true,
  );
});

test('shouldBypassPublishedBranchLock keeps unabsorbed published work protected', () => {
  assert.equal(
    shouldBypassPublishedBranchLock({
      taskStatus: 'ready',
      branchRef: 'origin/feature/gh-17',
      integrated: false,
    }),
    false,
  );
});

test('shouldBypassPublishedBranchLock allows active implementation sync on unabsorbed published work', () => {
  assert.equal(
    shouldBypassPublishedBranchLock({
      taskStatus: 'in_progress',
      branchRef: 'origin/feature/gh-17',
      integrated: false,
    }),
    true,
  );
});

test('shouldBypassPublishedBranchLock allows active review sync on unabsorbed published work', () => {
  assert.equal(
    shouldBypassPublishedBranchLock({
      taskStatus: 'in_review',
      branchRef: 'origin/feature/gh-17',
      integrated: false,
    }),
    true,
  );
});

test('shouldBypassPublishedBranchLock does not bypass done on integrated published work', () => {
  assert.equal(
    shouldBypassPublishedBranchLock({
      taskStatus: 'done',
      branchRef: 'origin/feature/gh-16',
      integrated: true,
    }),
    false,
  );
});
