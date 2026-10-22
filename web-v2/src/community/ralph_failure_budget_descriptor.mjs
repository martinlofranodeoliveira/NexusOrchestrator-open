export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (Array.isArray(payload)) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  const failureCount = payload.failureCount;
  const failureLimit = payload.failureLimit;
  if (typeof failureCount !== "number") {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (typeof failureLimit !== "number") {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (Number.isInteger(failureCount) === false) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (Number.isInteger(failureLimit) === false) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (Number.isFinite(failureCount) === false) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (Number.isFinite(failureLimit) === false) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (Number.isSafeInteger(failureCount) === false) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (Number.isSafeInteger(failureLimit) === false) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (failureCount < 0) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (failureCount > 10000) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (failureLimit < 0) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  if (failureLimit > 10000) {
    throw new TypeError("INVALID_RALPH_FAILURE_BUDGET_INPUT");
  }
  const remaining = failureCount < failureLimit ? failureLimit - failureCount : 0;
  const hasBudget = failureCount < failureLimit;
  const atLimit = failureCount === failureLimit;
  const overLimit = failureCount > failureLimit;
  return {
    failureCount: failureCount,
    failureLimit: failureLimit,
    remaining: remaining,
    hasBudget: hasBudget,
    atLimit: atLimit,
    overLimit: overLimit
  };
}
