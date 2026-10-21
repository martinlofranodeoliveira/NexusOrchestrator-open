export function runFeature(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_LANE_RETRY_INPUT");
  }
  const retryCount = payload.retryCount;
  const recoveryCount = payload.recoveryCount;
  if (Number.isInteger(retryCount) === false || retryCount < 0 || retryCount > 10000) {
    throw new TypeError("INVALID_LANE_RETRY_INPUT");
  }
  if (Number.isInteger(recoveryCount) === false || recoveryCount < 0 || recoveryCount > 10000) {
    throw new TypeError("INVALID_LANE_RETRY_INPUT");
  }
  const totalAttempts = retryCount + recoveryCount;
  const hasRetries = retryCount > 0;
  const hasRecovery = recoveryCount > 0;
  const isClean = totalAttempts === 0;
  return {
    retryCount: retryCount,
    recoveryCount: recoveryCount,
    totalAttempts: totalAttempts,
    hasRetries: hasRetries,
    hasRecovery: hasRecovery,
    isClean: isClean
  };
}
