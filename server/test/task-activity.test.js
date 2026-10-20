const test = require('node:test');
const assert = require('node:assert/strict');

const {
  getMostRecentTimestampMs,
  getPrimaryLaneSnapshotUpdatedAt,
  getPrimaryTaskLastActivityMs,
} = require('../services/taskActivity');

test('getPrimaryLaneSnapshotUpdatedAt picks the newest primary lane snapshot for the task', () => {
  const updatedAt = getPrimaryLaneSnapshotUpdatedAt(
    [
      {
        requestKind: 'primary',
        taskId: 'GH-2',
        updatedAt: '2026-04-08T16:10:00.000Z',
      },
      {
        requestKind: 'primary',
        taskId: 'GH-2',
        updatedAt: '2026-04-08T16:13:00.000Z',
      },
      {
        requestKind: 'primary',
        taskId: 'GH-3',
        updatedAt: '2026-04-08T16:15:00.000Z',
      },
    ],
    'GH-2',
  );

  assert.equal(updatedAt, '2026-04-08T16:13:00.000Z');
});

test('getPrimaryTaskLastActivityMs prefers the most recent signal instead of the first valid timestamp', () => {
  const task = {
    id: 'GH-2',
    updatedAt: '2026-04-08T16:05:00.000Z',
    statusChangedAt: '2026-04-08T16:06:00.000Z',
    assigneeChangedAt: '2026-04-08T16:07:00.000Z',
  };
  const runtimeMeta = {
    lastOutputAt: '2026-04-08T16:14:30.000Z',
    lastRunStartedAt: '2026-04-08T16:08:00.000Z',
  };
  const lanes = [
    {
      requestKind: 'primary',
      taskId: 'GH-2',
      updatedAt: '2026-04-08T16:09:00.000Z',
    },
  ];

  const lastActivityMs = getPrimaryTaskLastActivityMs({
    task,
    runtimeMeta,
    lanes,
  });

  assert.equal(
    lastActivityMs,
    Date.parse('2026-04-08T16:14:30.000Z'),
  );
});

test('getMostRecentTimestampMs ignores invalid values', () => {
  const lastActivityMs = getMostRecentTimestampMs([
    null,
    'invalid',
    '2026-04-08T16:00:00.000Z',
    '2026-04-08T16:22:00.000Z',
  ]);

  assert.equal(lastActivityMs, Date.parse('2026-04-08T16:22:00.000Z'));
});
