export function runFeature(payload) {
  if (payload === null || typeof payload !== "object") {
    throw new TypeError("INVALID_STALE_THRESHOLD_ORDER_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_STALE_THRESHOLD_ORDER_INPUT");
  }
  const activeTaskStaleMs = payload.activeTaskStaleMs;
  const reviewTaskStaleMs = payload.reviewTaskStaleMs;
  if (Number.isInteger(activeTaskStaleMs) === false) {
    throw new TypeError("INVALID_STALE_THRESHOLD_ORDER_INPUT");
  }
  if (Number.isInteger(reviewTaskStaleMs) === false) {
    throw new TypeError("INVALID_STALE_THRESHOLD_ORDER_INPUT");
  }
  if (activeTaskStaleMs < 0 || activeTaskStaleMs > 1000000000) {
    throw new TypeError("INVALID_STALE_THRESHOLD_ORDER_INPUT");
  }
  if (reviewTaskStaleMs < 0 || reviewTaskStaleMs > 1000000000) {
    throw new TypeError("INVALID_STALE_THRESHOLD_ORDER_INPUT");
  }
  const equal = activeTaskStaleMs === reviewTaskStaleMs;
  const activeIsLower = activeTaskStaleMs < reviewTaskStaleMs;
  const reviewIsLower = reviewTaskStaleMs < activeTaskStaleMs;
  const minThreshold = activeTaskStaleMs < reviewTaskStaleMs ? activeTaskStaleMs : reviewTaskStaleMs;
  const maxThreshold = activeTaskStaleMs > reviewTaskStaleMs ? activeTaskStaleMs : reviewTaskStaleMs;
  return {
    activeTaskStaleMs: activeTaskStaleMs,
    reviewTaskStaleMs: reviewTaskStaleMs,
    minThreshold: minThreshold,
    maxThreshold: maxThreshold,
    equal: equal,
    activeIsLower: activeIsLower,
    reviewIsLower: reviewIsLower
  };
}
