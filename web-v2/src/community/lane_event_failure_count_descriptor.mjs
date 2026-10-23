export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_LANE_EVENT_FAILURE_COUNT_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_LANE_EVENT_FAILURE_COUNT_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_LANE_EVENT_FAILURE_COUNT_INPUT");
  }
  const events = payload.events;
  if (Array.isArray(events) === false) {
    throw new TypeError("INVALID_LANE_EVENT_FAILURE_COUNT_INPUT");
  }
  if (events.length > 200) {
    throw new TypeError("INVALID_LANE_EVENT_FAILURE_COUNT_INPUT");
  }
  const failed = [];
  for (const entry of events) {
    if (entry === null) {
      throw new TypeError("INVALID_LANE_EVENT_FAILURE_COUNT_INPUT");
    }
    if (typeof entry !== "object") {
      throw new TypeError("INVALID_LANE_EVENT_FAILURE_COUNT_INPUT");
    }
    if (Array.isArray(entry) === true) {
      throw new TypeError("INVALID_LANE_EVENT_FAILURE_COUNT_INPUT");
    }
    const failureClass = entry.failureClass;
    if (failureClass !== null) {
      if (typeof failureClass !== "string") {
        throw new TypeError("INVALID_LANE_EVENT_FAILURE_COUNT_INPUT");
      }
      if (failureClass.length > 500) {
        throw new TypeError("INVALID_LANE_EVENT_FAILURE_COUNT_INPUT");
      }
      if (failureClass.length > 0) {
        failed.push(entry);
      }
    }
  }
  const total = events.length;
  const failedCount = failed.length;
  const clearCount = total - failedCount;
  const hasFailures = failedCount > 0;
  const allClear = failedCount === 0;
  return {
    total: total,
    failedCount: failedCount,
    clearCount: clearCount,
    hasFailures: hasFailures,
    allClear: allClear
  };
}
