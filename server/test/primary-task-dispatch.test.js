const test = require('node:test');
const assert = require('node:assert/strict');

const {
  arePrimaryTaskDependenciesSatisfied,
  buildCompletedPrimaryTaskDependencyKeySet,
  countPrimaryImplementationFronts,
  collectPrimaryTaskDependencyKeys,
  hasAnyActivePrimaryTasks,
  isPrimaryImplementationFrontStatus,
  resolveCompletedPrimaryTaskDependencyKeys,
  selectNextDependencyReadyBacklogTask,
} = require('../services/primaryTaskDispatch');

test('collectPrimaryTaskDependencyKeys includes id and backlog reference aliases', () => {
  const keys = collectPrimaryTaskDependencyKeys({
    id: 'GH-1',
    backlogRef: 'GTMNY-001',
    parentTaskRef: 'EPIC-1',
  });

  assert.deepEqual([...keys].sort(), ['EPIC-1', 'GH-1', 'GTMNY-001']);
});

test('arePrimaryTaskDependenciesSatisfied accepts cards whose dependencies are done', () => {
  const completed = buildCompletedPrimaryTaskDependencyKeySet([
    { id: 'GH-1', backlogRef: 'GTMNY-001', status: 'done' },
  ]);

  assert.equal(
    arePrimaryTaskDependenciesSatisfied(
      { id: 'GH-2', dependencies: ['gtmny-001'] },
      completed,
    ),
    true,
  );
});

test('resolveCompletedPrimaryTaskDependencyKeys accepts a raw task list', () => {
  const completed = resolveCompletedPrimaryTaskDependencyKeys([
    { id: 'GH-1', backlogRef: 'GTMNY-001', status: 'done' },
    { id: 'GH-2', backlogRef: 'GTMNY-002', status: 'ready' },
  ]);

  assert.equal(completed.has('GH-1'), true);
  assert.equal(completed.has('GTMNY-001'), true);
  assert.equal(completed.has('GH-2'), false);
});

test('arePrimaryTaskDependenciesSatisfied accepts a full task list as dependency source', () => {
  assert.equal(
    arePrimaryTaskDependenciesSatisfied(
      { id: 'GH-5', dependencies: ['GTMNY-003', 'GTMNY-004'] },
      [
        { id: 'GH-3', backlogRef: 'GTMNY-003', status: 'done' },
        { id: 'GH-4', backlogRef: 'GTMNY-004', status: 'done' },
        { id: 'GH-5', backlogRef: 'GTMNY-005', status: 'ready' },
      ],
    ),
    true,
  );
});

test('selectNextDependencyReadyBacklogTask promotes the next sequential backlog card after completion', () => {
  const tasks = [
    { id: 'GH-1', backlogRef: 'GTMNY-001', status: 'done' },
    { id: 'GH-2', backlogRef: 'GTMNY-002', status: 'backlog', dependencies: ['GTMNY-001'] },
    { id: 'GH-3', backlogRef: 'GTMNY-003', status: 'backlog', dependencies: ['GTMNY-001'] },
  ];

  const nextTask = selectNextDependencyReadyBacklogTask(tasks, {
    completedTask: tasks[0],
  });

  assert.equal(nextTask?.id, 'GH-2');
});

test('selectNextDependencyReadyBacklogTask does not open another backlog card while one is already active', () => {
  const tasks = [
    { id: 'GH-1', backlogRef: 'GTMNY-001', status: 'done' },
    { id: 'GH-2', backlogRef: 'GTMNY-002', status: 'in_progress', dependencies: ['GTMNY-001'] },
    { id: 'GH-3', backlogRef: 'GTMNY-003', status: 'backlog', dependencies: ['GTMNY-001'] },
  ];

  const nextTask = selectNextDependencyReadyBacklogTask(tasks, {
    skipWhenAnyActiveTask: true,
  });

  assert.equal(nextTask, null);
  assert.equal(hasAnyActivePrimaryTasks(tasks), true);
});

test('selectNextDependencyReadyBacklogTask ignores backlog cards whose dependencies are incomplete', () => {
  const tasks = [
    { id: 'GH-1', backlogRef: 'GTMNY-001', status: 'done' },
    { id: 'GH-2', backlogRef: 'GTMNY-002', status: 'backlog', dependencies: ['GTMNY-999'] },
  ];

  const nextTask = selectNextDependencyReadyBacklogTask(tasks, {
    completedTask: tasks[0],
  });

  assert.equal(nextTask, null);
});

test('isPrimaryImplementationFrontStatus only counts ready and in progress tasks', () => {
  assert.equal(isPrimaryImplementationFrontStatus('ready'), true);
  assert.equal(isPrimaryImplementationFrontStatus('in_progress'), true);
  assert.equal(isPrimaryImplementationFrontStatus('in_review'), false);
  assert.equal(isPrimaryImplementationFrontStatus('done'), false);
});

test('countPrimaryImplementationFronts tracks controlled implementation fronts', () => {
  assert.equal(
    countPrimaryImplementationFronts([
      { id: 'GH-1', status: 'ready' },
      { id: 'GH-2', status: 'in_progress' },
      { id: 'GH-3', status: 'in_review' },
      { id: 'GH-4', status: 'done' },
    ]),
    2,
  );
});
