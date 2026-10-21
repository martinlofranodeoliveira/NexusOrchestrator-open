export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("INVALID_ATTENTION_HEALTH_INPUT");
  }
  const healthy = payload.healthy;
  const flaggedCount = payload.flaggedCount;
  const criticalCount = payload.criticalCount;
  if (typeof healthy !== "boolean") {
    throw new TypeError("INVALID_ATTENTION_HEALTH_INPUT");
  }
  if (Number.isInteger(flaggedCount) === false) {
    throw new TypeError("INVALID_ATTENTION_HEALTH_INPUT");
  }
  if (Number.isInteger(criticalCount) === false) {
    throw new TypeError("INVALID_ATTENTION_HEALTH_INPUT");
  }
  if (flaggedCount < 0 || flaggedCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_HEALTH_INPUT");
  }
  if (criticalCount < 0 || criticalCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_HEALTH_INPUT");
  }
  if (criticalCount > flaggedCount) {
    throw new TypeError("INVALID_ATTENTION_HEALTH_INPUT");
  }
  const hasFlagged = flaggedCount > 0;
  const hasCritical = criticalCount > 0;
  const needsReview = healthy === false || hasFlagged === true;
  return {
    healthy: healthy,
    flaggedCount: flaggedCount,
    criticalCount: criticalCount,
    hasFlagged: hasFlagged,
    hasCritical: hasCritical,
    needsReview: needsReview
  };
}
