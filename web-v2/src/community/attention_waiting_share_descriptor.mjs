export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ATTENTION_WAITING_SHARE_INPUT");
  }
  const totalActivePrimaryTasks = payload.totalActivePrimaryTasks;
  const waitingWithoutExecutionCount = payload.waitingWithoutExecutionCount;
  if (Number.isInteger(totalActivePrimaryTasks) === false) {
    throw new TypeError("INVALID_ATTENTION_WAITING_SHARE_INPUT");
  }
  if (Number.isInteger(waitingWithoutExecutionCount) === false) {
    throw new TypeError("INVALID_ATTENTION_WAITING_SHARE_INPUT");
  }
  if (totalActivePrimaryTasks < 0 || totalActivePrimaryTasks > 10000) {
    throw new TypeError("INVALID_ATTENTION_WAITING_SHARE_INPUT");
  }
  if (waitingWithoutExecutionCount < 0 || waitingWithoutExecutionCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_WAITING_SHARE_INPUT");
  }
  if (waitingWithoutExecutionCount > totalActivePrimaryTasks) {
    throw new TypeError("INVALID_ATTENTION_WAITING_SHARE_INPUT");
  }
  const readyCount = totalActivePrimaryTasks - waitingWithoutExecutionCount;
  const hasWaiting = waitingWithoutExecutionCount > 0;
  const allWaiting = totalActivePrimaryTasks > 0 && waitingWithoutExecutionCount === totalActivePrimaryTasks;
  const noneWaiting = waitingWithoutExecutionCount === 0;
  return {
    totalActivePrimaryTasks: totalActivePrimaryTasks,
    waitingWithoutExecutionCount: waitingWithoutExecutionCount,
    readyCount: readyCount,
    hasWaiting: hasWaiting,
    allWaiting: allWaiting,
    noneWaiting: noneWaiting
  };
}
