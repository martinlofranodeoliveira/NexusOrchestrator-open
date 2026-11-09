export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
  }
  if (typeof payload !== 'object') {
    throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
  }
  const tasks = payload.tasks;
  if (tasks === undefined) {
    throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
  }
  if (Array.isArray(tasks) === false) {
    throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
  }
  if (tasks.length > 1000) {
    throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
  }
  const runningMarks = [];
  const preparingMarks = [];
  const queuedMarks = [];
  const cleanMarks = [];
  const idleMarks = [];
  const conflictMarks = [];
  for (const entry of tasks) {
    if (entry === null) {
      throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
    }
    if (typeof entry !== 'object') {
      throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
    }
    if (Array.isArray(entry) === true) {
      throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
    }
    const execution = entry.execution;
    if (execution === undefined) {
      throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
    }
    if (execution === null) {
      throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
    }
    if (typeof execution !== 'object') {
      throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
    }
    if (Array.isArray(execution) === true) {
      throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
    }
    const running = execution.running;
    const preparing = execution.preparing;
    const queued = execution.queued;
    if (typeof running !== 'boolean') {
      throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
    }
    if (typeof preparing !== 'boolean') {
      throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
    }
    if (typeof queued !== 'boolean') {
      throw new TypeError('INVALID_ATTENTION_EXECUTION_EXCLUSIVITY_INPUT');
    }
    const isRunning = running === true;
    const isPreparing = preparing === true;
    const isQueued = queued === true;
    if (isRunning === true) {
      runningMarks.push(1);
    }
    if (isPreparing === true) {
      preparingMarks.push(1);
    }
    if (isQueued === true) {
      queuedMarks.push(1);
    }
    if (isRunning === true) {
      if (isPreparing === false) {
        if (isQueued === false) {
          cleanMarks.push(1);
        }
      }
    }
    if (isPreparing === true) {
      if (isRunning === false) {
        if (isQueued === false) {
          cleanMarks.push(1);
        }
      }
    }
    if (isQueued === true) {
      if (isRunning === false) {
        if (isPreparing === false) {
          cleanMarks.push(1);
        }
      }
    }
    if (isRunning === false) {
      if (isPreparing === false) {
        if (isQueued === false) {
          idleMarks.push(1);
        }
      }
    }
    if (isRunning === true) {
      if (isPreparing === true) {
        conflictMarks.push(1);
      } else {
        if (isQueued === true) {
          conflictMarks.push(1);
        }
      }
    } else {
      if (isPreparing === true) {
        if (isQueued === true) {
          conflictMarks.push(1);
        }
      }
    }
  }
  return {
    totalTasks: tasks.length,
    cleanCount: cleanMarks.length,
    idleCount: idleMarks.length,
    conflictCount: conflictMarks.length,
    runningCount: runningMarks.length,
    preparingCount: preparingMarks.length,
    queuedCount: queuedMarks.length,
    hasConflict: conflictMarks.length > 0,
    isClean: conflictMarks.length === 0
  };
}
