import assert from 'node:assert/strict';
import { test } from 'node:test';

import { buildOperationalAgentStates, type BackendAgent, type BoardTask } from '../src/operationalState.ts';
import type { OperationsSnapshot } from '../src/operationsTypes.ts';

test('buildOperationalAgentStates ignores active tasks owned by another instance', () => {
  const backendAgents: BackendAgent[] = [
    {
      id: 'dev',
      name: 'Developer',
      status: 'idle',
    },
  ];
  const tasks: BoardTask[] = [
    {
      id: 'GH-10',
      title: 'Feed de descoberta',
      status: 'in_progress',
      assignee: 'dev',
      ownerInstanceId: 'martinlofranodeoliveira',
    },
  ];
  const snapshot: OperationsSnapshot = {
    instanceId: 'marcelonsi',
    attention: {
      tasks: [],
    },
  };

  const states = buildOperationalAgentStates(backendAgents, tasks, snapshot);
  const devState = states[5];

  assert.equal(devState.backendId, 'dev');
  assert.equal(devState.kind, 'idle');
  assert.equal(devState.taskId, null);
  assert.equal(devState.activeTaskCount, 0);
});

test('buildOperationalAgentStates keeps active tasks owned by the current instance', () => {
  const backendAgents: BackendAgent[] = [
    {
      id: 'dev',
      name: 'Developer',
      status: 'coding',
    },
  ];
  const tasks: BoardTask[] = [
    {
      id: 'GH-10',
      title: 'Feed de descoberta',
      status: 'in_progress',
      assignee: 'dev',
      ownerInstanceId: 'marcelonsi',
    },
  ];
  const snapshot: OperationsSnapshot = {
    instanceId: 'marcelonsi',
    attention: {
      tasks: [],
    },
  };

  const states = buildOperationalAgentStates(backendAgents, tasks, snapshot);
  const devState = states[5];

  assert.equal(devState.backendId, 'dev');
  assert.equal(devState.kind, 'working');
  assert.equal(devState.taskId, 'GH-10');
  assert.equal(devState.activeTaskCount, 1);
});
