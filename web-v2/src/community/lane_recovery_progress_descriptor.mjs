export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_LANE_RECOVERY_PROGRESS_INPUT");
  }
  const attempt = payload.attempt;
  const maxAttempts = payload.maxAttempts;
  const steps = payload.steps;
  if (attempt !== null) {
    if (Number.isInteger(attempt) === false || attempt < 0 || attempt > 10000) {
      throw new TypeError("INVALID_LANE_RECOVERY_PROGRESS_INPUT");
    }
  }
  if (Number.isInteger(maxAttempts) === false || maxAttempts < 0 || maxAttempts > 10000) {
    throw new TypeError("INVALID_LANE_RECOVERY_PROGRESS_INPUT");
  }
  if (Array.isArray(steps) === false || steps.length > 50) {
    throw new TypeError("INVALID_LANE_RECOVERY_PROGRESS_INPUT");
  }
  for (const step of steps) {
    if (typeof step !== "string" || step.length > 512) {
      throw new TypeError("INVALID_LANE_RECOVERY_PROGRESS_INPUT");
    }
  }
  const totalSteps = steps.length;
  const diffAttempts = attempt === null ? maxAttempts : maxAttempts - attempt;
  const remainingAttempts = diffAttempts > 0 ? diffAttempts : 0;
  const diffSteps = attempt === null ? totalSteps : totalSteps - attempt;
  const remainingSteps = diffSteps > 0 ? diffSteps : 0;
  const isStarted = attempt !== null;
  const isExhausted = attempt !== null && attempt >= maxAttempts;
  const isStepsExhausted = attempt !== null && attempt >= totalSteps;
  const hasSteps = totalSteps > 0;
  return {
    totalSteps: totalSteps,
    attempt: attempt,
    maxAttempts: maxAttempts,
    remainingAttempts: remainingAttempts,
    remainingSteps: remainingSteps,
    isStarted: isStarted,
    isExhausted: isExhausted,
    isStepsExhausted: isStepsExhausted,
    hasSteps: hasSteps
  };
}
