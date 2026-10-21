export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  const entries = Object.entries(payload);
  const store = new Map();
  for (const entry of entries) {
    const key = entry[0];
    const value = entry[1];
    store.set(key, value);
  }
  const activeWithoutAssigneeCount = store.get("activeWithoutAssigneeCount");
  const waitingWithoutExecutionCount = store.get("waitingWithoutExecutionCount");
  const queuedCount = store.get("queuedCount");
  if (Number.isSafeInteger(activeWithoutAssigneeCount) === false) {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  if (Number.isSafeInteger(waitingWithoutExecutionCount) === false) {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  if (Number.isSafeInteger(queuedCount) === false) {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  if (activeWithoutAssigneeCount < 0) {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  if (activeWithoutAssigneeCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  if (waitingWithoutExecutionCount < 0) {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  if (waitingWithoutExecutionCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  if (queuedCount < 0) {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  if (queuedCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_QUEUE_DEPTH_INPUT");
  }
  const totalWaiting = activeWithoutAssigneeCount + waitingWithoutExecutionCount + queuedCount;
  const hasBacklog = totalWaiting > 0;
  const empty = totalWaiting === 0;
  return {
    activeWithoutAssigneeCount: activeWithoutAssigneeCount,
    waitingWithoutExecutionCount: waitingWithoutExecutionCount,
    queuedCount: queuedCount,
    totalWaiting: totalWaiting,
    hasBacklog: hasBacklog,
    empty: empty
  };
}
