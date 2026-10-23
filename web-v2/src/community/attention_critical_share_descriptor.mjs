export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
  }
  const flaggedCount = payload.flaggedCount;
  const criticalCount = payload.criticalCount;
  if (Number.isInteger(flaggedCount) === false) {
    throw new TypeError("INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
  }
  if (Number.isInteger(criticalCount) === false) {
    throw new TypeError("INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
  }
  if (flaggedCount < 0) {
    throw new TypeError("INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
  }
  if (flaggedCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
  }
  if (criticalCount < 0) {
    throw new TypeError("INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
  }
  if (criticalCount > 10000) {
    throw new TypeError("INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
  }
  if (criticalCount > flaggedCount) {
    throw new TypeError("INVALID_ATTENTION_CRITICAL_SHARE_INPUT");
  }
  const nonCriticalCount = flaggedCount - criticalCount;
  const hasCritical = criticalCount > 0;
  const noneCritical = criticalCount === 0;
  const allCritical = flaggedCount > 0 && criticalCount === flaggedCount;
  return {
    flaggedCount: flaggedCount,
    criticalCount: criticalCount,
    nonCriticalCount: nonCriticalCount,
    hasCritical: hasCritical,
    allCritical: allCritical,
    noneCritical: noneCritical
  };
}
