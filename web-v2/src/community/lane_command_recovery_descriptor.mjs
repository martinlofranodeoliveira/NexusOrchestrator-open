export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("INVALID_LANE_COMMAND_RECOVERY_INPUT");
  }
  const entries = Object.entries(payload);
  const store = new Map();
  for (const entry of entries) {
    const k = entry[0];
    const v = entry[1];
    if (k === "retryCount") {
      store.set(k, v);
    }
    if (k === "commandRecoveryCount") {
      store.set(k, v);
    }
  }
  const retryCount = store.get("retryCount");
  const commandRecoveryCount = store.get("commandRecoveryCount");
  if (typeof retryCount !== "number" || typeof commandRecoveryCount !== "number") {
    throw new TypeError("INVALID_LANE_COMMAND_RECOVERY_INPUT");
  }
  if (Number.isInteger(retryCount) === false) {
    throw new TypeError("INVALID_LANE_COMMAND_RECOVERY_INPUT");
  }
  if (Number.isInteger(commandRecoveryCount) === false) {
    throw new TypeError("INVALID_LANE_COMMAND_RECOVERY_INPUT");
  }
  if (retryCount < 0 || retryCount > 1000000) {
    throw new TypeError("INVALID_LANE_COMMAND_RECOVERY_INPUT");
  }
  if (commandRecoveryCount < 0 || commandRecoveryCount > 1000000) {
    throw new TypeError("INVALID_LANE_COMMAND_RECOVERY_INPUT");
  }
  const safeRetry = retryCount + 0;
  const safeCommand = commandRecoveryCount + 0;
  const totalRecoveries = safeRetry + safeCommand;
  const hasRetries = safeRetry > 0;
  const hasCommandRecoveries = safeCommand > 0;
  const hasAnyRecovery = totalRecoveries > 0;
  return {
    retryCount: safeRetry,
    commandRecoveryCount: safeCommand,
    totalRecoveries: totalRecoveries,
    hasRetries: hasRetries,
    hasCommandRecoveries: hasCommandRecoveries,
    hasAnyRecovery: hasAnyRecovery
  };
}
