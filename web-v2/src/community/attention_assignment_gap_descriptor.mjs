export function runFeature(payload) {
  if (payload === null || typeof payload !== "object") {
    throw new TypeError("INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT");
  }
  if (payload.toString !== ({}).toString && payload.valueOf !== ({}).valueOf) {
    throw new TypeError("INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT");
  }
  const activeWithoutAssigneeCount = payload.activeWithoutAssigneeCount;
  const waitingWithoutExecutionCount = payload.waitingWithoutExecutionCount;
  if (Number.isInteger(activeWithoutAssigneeCount) === false) {
    throw new TypeError("INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT");
  }
  if (Number.isInteger(waitingWithoutExecutionCount) === false) {
    throw new TypeError("INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT");
  }
  if (activeWithoutAssigneeCount < 0 || activeWithoutAssigneeCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT");
  }
  if (waitingWithoutExecutionCount < 0 || waitingWithoutExecutionCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_ASSIGNMENT_GAP_INPUT");
  }
  const totalGap = activeWithoutAssigneeCount + waitingWithoutExecutionCount;
  const hasGap = totalGap > 0;
  const needsAssignment = activeWithoutAssigneeCount > 0;
  const needsExecution = waitingWithoutExecutionCount > 0;
  const clear = totalGap === 0;
  return {
    activeWithoutAssigneeCount: activeWithoutAssigneeCount,
    waitingWithoutExecutionCount: waitingWithoutExecutionCount,
    totalGap: totalGap,
    hasGap: hasGap,
    needsAssignment: needsAssignment,
    needsExecution: needsExecution,
    clear: clear
  };
}
