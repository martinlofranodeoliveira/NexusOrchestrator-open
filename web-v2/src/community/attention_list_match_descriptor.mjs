export function runFeature(payload) {
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (payload === null) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  const flaggedCount = payload.flaggedCount;
  const criticalCount = payload.criticalCount;
  const tasks = payload.tasks;
  const criticalTasks = payload.criticalTasks;
  if (typeof flaggedCount !== "number") {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (Number.isInteger(flaggedCount) === false) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (Number.isFinite(flaggedCount) === false) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (flaggedCount < 0) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (flaggedCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (typeof criticalCount !== "number") {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (Number.isInteger(criticalCount) === false) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (Number.isFinite(criticalCount) === false) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (criticalCount < 0) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (criticalCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (Array.isArray(tasks) === false) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (Array.isArray(criticalTasks) === false) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  const taskCount = tasks.length;
  const criticalTaskCount = criticalTasks.length;
  if (taskCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  if (criticalTaskCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
  }
  for (const taskItem of tasks) {
    if (typeof taskItem !== "object") {
      throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
    }
    if (taskItem === null) {
      throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
    }
    if (Array.isArray(taskItem) === true) {
      throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
    }
  }
  for (const criticalItem of criticalTasks) {
    if (typeof criticalItem !== "object") {
      throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
    }
    if (criticalItem === null) {
      throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
    }
    if (Array.isArray(criticalItem) === true) {
      throw new TypeError("INVALID_ATTENTION_LIST_MATCH_INPUT");
    }
  }
  const flaggedMatches = flaggedCount === taskCount;
  const criticalMatches = criticalCount === criticalTaskCount;
  const isConsistent = flaggedMatches === true && criticalMatches === true;
  return {
    flaggedCount: flaggedCount,
    criticalCount: criticalCount,
    taskCount: taskCount,
    criticalTaskCount: criticalTaskCount,
    flaggedMatches: flaggedMatches,
    criticalMatches: criticalMatches,
    isConsistent: isConsistent
  };
}
