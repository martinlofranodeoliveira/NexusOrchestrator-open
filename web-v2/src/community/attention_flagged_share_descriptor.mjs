export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null) {
    throw new TypeError("INVALID_ATTENTION_FLAGGED_SHARE_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ATTENTION_FLAGGED_SHARE_INPUT");
  }
  const flaggedCount = payload.flaggedCount;
  const criticalCount = payload.criticalCount;
  if (Number.isInteger(flaggedCount) === false) {
    throw new TypeError("INVALID_ATTENTION_FLAGGED_SHARE_INPUT");
  }
  if (Number.isInteger(criticalCount) === false) {
    throw new TypeError("INVALID_ATTENTION_FLAGGED_SHARE_INPUT");
  }
  if (flaggedCount < 0 || flaggedCount > 1000000) {
    throw new TypeError("INVALID_ATTENTION_FLAGGED_SHARE_INPUT");
  }
  if (criticalCount < 0 || criticalCount > 1000000) {
    throw new TypeError("INVALID_ATTENTION_FLAGGED_SHARE_INPUT");
  }
  if (criticalCount > flaggedCount) {
    throw new TypeError("INVALID_ATTENTION_FLAGGED_SHARE_INPUT");
  }
  const nonCriticalFlagged = flaggedCount - criticalCount;
  const hasFlagged = flaggedCount > 0;
  const hasCritical = criticalCount > 0;
  const allCritical = flaggedCount > 0 && flaggedCount === criticalCount;
  return {
    flaggedCount: flaggedCount,
    criticalCount: criticalCount,
    nonCriticalFlagged: nonCriticalFlagged,
    hasFlagged: hasFlagged,
    hasCritical: hasCritical,
    allCritical: allCritical
  };
}
