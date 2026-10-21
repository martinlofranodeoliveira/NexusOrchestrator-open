export function runFeature(payload) {
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_TASK_STALE_AGE_INPUT");
  }
  if (payload === null) {
    throw new TypeError("INVALID_TASK_STALE_AGE_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_TASK_STALE_AGE_INPUT");
  }
  const staleThresholdMs = payload.staleThresholdMs;
  const lastActivityAgeMs = payload.lastActivityAgeMs;
  if (Number.isInteger(staleThresholdMs) === false) {
    throw new TypeError("INVALID_TASK_STALE_AGE_INPUT");
  }
  if (Number.isFinite(staleThresholdMs) === false) {
    throw new TypeError("INVALID_TASK_STALE_AGE_INPUT");
  }
  if (staleThresholdMs < 1) {
    throw new TypeError("INVALID_TASK_STALE_AGE_INPUT");
  }
  if (staleThresholdMs > 9007199254740991) {
    throw new TypeError("INVALID_TASK_STALE_AGE_INPUT");
  }
  if (lastActivityAgeMs === null) {
    return {
      staleThresholdMs: staleThresholdMs,
      lastActivityAgeMs: null,
      hasKnownAge: false,
      isStale: false,
      overdueMs: 0,
      needsReview: false
    };
  }
  if (Number.isInteger(lastActivityAgeMs) === false) {
    throw new TypeError("INVALID_TASK_STALE_AGE_INPUT");
  }
  if (Number.isFinite(lastActivityAgeMs) === false) {
    throw new TypeError("INVALID_TASK_STALE_AGE_INPUT");
  }
  if (lastActivityAgeMs < 0) {
    throw new TypeError("INVALID_TASK_STALE_AGE_INPUT");
  }
  if (lastActivityAgeMs > 9007199254740991) {
    throw new TypeError("INVALID_TASK_STALE_AGE_INPUT");
  }
  if (lastActivityAgeMs < staleThresholdMs) {
    return {
      staleThresholdMs: staleThresholdMs,
      lastActivityAgeMs: lastActivityAgeMs,
      hasKnownAge: true,
      isStale: false,
      overdueMs: 0,
      needsReview: false
    };
  }
  const overdueMs = lastActivityAgeMs - staleThresholdMs;
  return {
    staleThresholdMs: staleThresholdMs,
    lastActivityAgeMs: lastActivityAgeMs,
    hasKnownAge: true,
    isStale: true,
    overdueMs: overdueMs,
    needsReview: true
  };
}
