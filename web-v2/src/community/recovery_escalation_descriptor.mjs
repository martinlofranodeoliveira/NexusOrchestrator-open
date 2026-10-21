export function runFeature(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_RECOVERY_ESCALATION_INPUT");
  }
  const attempt = payload.attempt;
  const maxAttempts = payload.maxAttempts;
  const escalated = payload.escalated;
  if (Number.isInteger(attempt) === false || attempt < 0 || attempt > 10000) {
    throw new TypeError("INVALID_RECOVERY_ESCALATION_INPUT");
  }
  if (Number.isInteger(maxAttempts) === false || maxAttempts < 0 || maxAttempts > 10000) {
    throw new TypeError("INVALID_RECOVERY_ESCALATION_INPUT");
  }
  if (typeof escalated !== "boolean") {
    throw new TypeError("INVALID_RECOVERY_ESCALATION_INPUT");
  }
  const remainingAttempts = attempt >= maxAttempts ? 0 : maxAttempts - attempt;
  const exhausted = attempt >= maxAttempts;
  const needsEscalation = exhausted === true && escalated === false;
  return {
    attempt: attempt,
    maxAttempts: maxAttempts,
    escalated: escalated,
    remainingAttempts: remainingAttempts,
    exhausted: exhausted,
    needsEscalation: needsEscalation
  };
}
