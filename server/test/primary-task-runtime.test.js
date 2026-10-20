const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isPrimaryTaskFailurePenaltyEligible,
  shouldBlockPrimaryTaskDispatchDueToPublishedBranch,
  shouldPrimaryTaskFailurePenaltyApplyToAgent,
} = require('../services/primaryTaskRuntime');

test('published integrated branch does not block ready task redispatch', () => {
  const blocked = shouldBlockPrimaryTaskDispatchDueToPublishedBranch(
    {
      id: 'GH-16',
      status: 'ready',
    },
    {
      publishedBranchRef: 'refs/heads/nexus/tasks/gh-16',
      publishedBranchLockedAt: '2026-04-11T17:10:14.072Z',
      publishedBranchIntegrated: true,
      publishedBranchReason: 'branch-already-merged',
    },
    {},
  );

  assert.equal(blocked, false);
});

test('fresh-branch recovery does not block ready task redispatch', () => {
  const blocked = shouldBlockPrimaryTaskDispatchDueToPublishedBranch(
    {
      id: 'GH-16',
      status: 'ready',
    },
    {
      publishedBranchRef: 'refs/heads/nexus/tasks/gh-16',
      publishedBranchLockedAt: '2026-04-11T17:10:14.072Z',
      publishedBranchIntegrated: false,
      publishedBranchReason: 'branch-has-unabsorbed-commits',
    },
    {
      forceFreshBranch: true,
    },
  );

  assert.equal(blocked, false);
});

test('fresh-branch recovery does not block in-progress task resume', () => {
  const blocked = shouldBlockPrimaryTaskDispatchDueToPublishedBranch(
    {
      id: 'GH-30',
      status: 'in_progress',
    },
    {
      publishedBranchRef: 'refs/heads/nexus/tasks/gh-30',
      publishedBranchLockedAt: '2026-04-12T13:10:20.913Z',
      publishedBranchIntegrated: false,
      publishedBranchReason: 'branch-has-unabsorbed-commits',
    },
    {
      forceFreshBranch: true,
    },
  );

  assert.equal(blocked, false);
});

test('unabsorbed published branch still blocks ready task without recovery path', () => {
  const blocked = shouldBlockPrimaryTaskDispatchDueToPublishedBranch(
    {
      id: 'GH-17',
      status: 'ready',
    },
    {
      publishedBranchRef: 'refs/heads/nexus/tasks/gh-17',
      publishedBranchLockedAt: '2026-04-11T17:35:29.745Z',
      publishedBranchIntegrated: false,
      publishedBranchReason: 'branch-has-unabsorbed-commits',
    },
    {},
  );

  assert.equal(blocked, true);
});

test('unabsorbed published branch still blocks in-progress task without fresh-branch recovery', () => {
  const blocked = shouldBlockPrimaryTaskDispatchDueToPublishedBranch(
    {
      id: 'GH-30',
      status: 'in_progress',
    },
    {
      publishedBranchRef: 'refs/heads/nexus/tasks/gh-30',
      publishedBranchLockedAt: '2026-04-12T13:10:20.913Z',
      publishedBranchIntegrated: false,
      publishedBranchReason: 'branch-has-unabsorbed-commits',
    },
    {},
  );

  assert.equal(blocked, true);
});

test('review failures are eligible for task failure penalty', () => {
  assert.equal(isPrimaryTaskFailurePenaltyEligible('review'), true);
});

test('shell failures are eligible for task failure penalty', () => {
  assert.equal(isPrimaryTaskFailurePenaltyEligible('shell'), true);
});

test('review failure penalty applies across agents', () => {
  const applies = shouldPrimaryTaskFailurePenaltyApplyToAgent('review', {
    failedByAgentId: 'dev_review',
    agentId: 'dev',
  });

  assert.equal(applies, true);
});

test('integration failure penalty remains scoped to the failing agent', () => {
  const appliesToDifferentAgent = shouldPrimaryTaskFailurePenaltyApplyToAgent('integration', {
    failedByAgentId: 'dev_review',
    agentId: 'dev',
  });
  const appliesToSameAgent = shouldPrimaryTaskFailurePenaltyApplyToAgent('integration', {
    failedByAgentId: 'dev',
    agentId: 'dev',
  });

  assert.equal(appliesToDifferentAgent, false);
  assert.equal(appliesToSameAgent, true);
});

test('shell failure penalty remains scoped to the failing agent', () => {
  const appliesToDifferentAgent = shouldPrimaryTaskFailurePenaltyApplyToAgent('shell', {
    failedByAgentId: 'dev2',
    agentId: 'dev',
  });
  const appliesToSameAgent = shouldPrimaryTaskFailurePenaltyApplyToAgent('shell', {
    failedByAgentId: 'dev2',
    agentId: 'dev2',
  });

  assert.equal(appliesToDifferentAgent, false);
  assert.equal(appliesToSameAgent, true);
});
