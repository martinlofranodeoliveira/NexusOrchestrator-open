const test = require('node:test');
const assert = require('node:assert/strict');

const { analyzeLocalSupervisorSnapshot } = require('../services/localSupervisor');

function buildHealthySnapshot() {
  return {
    ok: true,
    instanceId: 'martinlofranodeoliveira',
    status: {
      tasks: {
        total: 35,
        byStatus: {
          backlog: 5,
          done: 29,
          in_progress: 1,
        },
      },
      runs: {
        active: 1,
      },
      lanes: {
        active: 1,
        agents: [
          {
            laneId: 'dev:GH-30',
            taskId: 'GH-30',
            agentId: 'dev',
            state: 'running',
            updatedAt: '2026-04-12T16:00:00.000Z',
          },
        ],
      },
      attention: {
        healthy: true,
        flaggedCount: 0,
        criticalCount: 0,
        tasks: [
          {
            id: 'GH-30',
            stale: false,
            severity: 'ok',
            reason: 'running',
            lastActivityAt: '2026-04-12T16:00:00.000Z',
          },
        ],
      },
    },
  };
}

test('analyzeLocalSupervisorSnapshot marks healthy runtime as ok', () => {
  const result = analyzeLocalSupervisorSnapshot(buildHealthySnapshot(), {}, {
    checkedAt: '2026-04-12T16:10:00.000Z',
  });

  assert.equal(result.ok, true);
  assert.equal(result.severity, 'ok');
  assert.equal(result.shouldRestart, false);
  assert.equal(result.stableProblemCount, 0);
});

test('analyzeLocalSupervisorSnapshot requests immediate restart when health is unreachable', () => {
  const result = analyzeLocalSupervisorSnapshot(null, {}, {
    checkedAt: '2026-04-12T16:10:00.000Z',
    unreachableDetail: 'connect ECONNREFUSED 127.0.0.1:4000',
  });

  assert.equal(result.ok, false);
  assert.equal(result.severity, 'critical');
  assert.equal(result.shouldRestart, true);
  assert.equal(result.issues[0].code, 'health_unreachable');
});

test('analyzeLocalSupervisorSnapshot waits one cycle before restarting a repeated flagged lane', () => {
  const snapshot = buildHealthySnapshot();
  snapshot.status.attention.healthy = false;
  snapshot.status.attention.flaggedCount = 1;
  snapshot.status.attention.tasks = [
    {
      id: 'GH-30',
      stale: true,
      severity: 'warning',
      reason: 'stale',
      lastActivityAt: '2026-04-12T16:00:00.000Z',
    },
  ];

  const firstPass = analyzeLocalSupervisorSnapshot(snapshot, {}, {
    checkedAt: '2026-04-12T16:10:00.000Z',
  });
  const secondPass = analyzeLocalSupervisorSnapshot(snapshot, firstPass, {
    checkedAt: '2026-04-12T16:20:00.000Z',
  });

  assert.equal(firstPass.ok, false);
  assert.equal(firstPass.shouldRestart, false);
  assert.equal(firstPass.stableProblemCount, 1);
  assert.equal(secondPass.shouldRestart, true);
  assert.equal(secondPass.stableProblemCount, 2);
});

test('analyzeLocalSupervisorSnapshot resets stable problem counter when the lane progresses', () => {
  const snapshot = buildHealthySnapshot();
  snapshot.status.attention.healthy = false;
  snapshot.status.attention.flaggedCount = 1;
  snapshot.status.attention.tasks = [
    {
      id: 'GH-30',
      stale: true,
      severity: 'warning',
      reason: 'stale',
      lastActivityAt: '2026-04-12T16:00:00.000Z',
    },
  ];

  const firstPass = analyzeLocalSupervisorSnapshot(snapshot, {}, {
    checkedAt: '2026-04-12T16:10:00.000Z',
  });

  const progressedSnapshot = buildHealthySnapshot();
  progressedSnapshot.status.attention.healthy = false;
  progressedSnapshot.status.attention.flaggedCount = 1;
  progressedSnapshot.status.attention.tasks = [
    {
      id: 'GH-30',
      stale: true,
      severity: 'warning',
      reason: 'stale',
      lastActivityAt: '2026-04-12T16:10:01.000Z',
    },
  ];
  progressedSnapshot.status.lanes.agents[0].updatedAt = '2026-04-12T16:10:01.000Z';

  const secondPass = analyzeLocalSupervisorSnapshot(progressedSnapshot, firstPass, {
    checkedAt: '2026-04-12T16:20:00.000Z',
  });

  assert.equal(secondPass.shouldRestart, false);
  assert.equal(secondPass.stableProblemCount, 1);
});

test('analyzeLocalSupervisorSnapshot flags stalled active lanes for restart after repeated cycles', () => {
  const snapshot = buildHealthySnapshot();
  snapshot.status.attention.tasks = [
    {
      id: 'GH-30',
      status: 'in_progress',
      stale: false,
      severity: 'ok',
      reason: 'running',
      lastActivityAt: '2026-04-12T16:00:00.000Z',
      execution: {
        running: true,
        preparing: false,
        queued: false,
      },
    },
  ];

  const firstPass = analyzeLocalSupervisorSnapshot(snapshot, {}, {
    checkedAt: '2026-04-12T16:10:00.000Z',
    progressStallMs: 120000,
  });
  const secondPass = analyzeLocalSupervisorSnapshot(snapshot, firstPass, {
    checkedAt: '2026-04-12T16:11:00.000Z',
    progressStallMs: 120000,
  });

  assert.equal(firstPass.ok, false);
  assert.equal(firstPass.issues[0].code, 'execution_stalled');
  assert.equal(firstPass.shouldRestart, false);
  assert.equal(secondPass.shouldRestart, true);
});
