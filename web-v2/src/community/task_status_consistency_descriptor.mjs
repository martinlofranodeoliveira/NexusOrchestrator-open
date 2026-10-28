export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
  }
  const total = payload.total;
  const byStatus = payload.byStatus;
  if (Number.isInteger(total) === false) {
    throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
  }
  if (total < 0) {
    throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
  }
  if (total > 10000) {
    throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
  }
  if (byStatus === null) {
    throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
  }
  if (typeof byStatus !== "object") {
    throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
  }
  if (Array.isArray(byStatus) === true) {
    throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
  }
  const entries = Object.entries(byStatus);
  if (entries.length > 50) {
    throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
  }
  let summed = 0;
  for (const pair of entries) {
    const statusKey = pair[0];
    const statusValue = pair[1];
    if (typeof statusKey !== "string") {
      throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
    }
    if (statusKey.length < 1) {
      throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
    }
    if (statusKey.length > 64) {
      throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
    }
    if (Number.isInteger(statusValue) === false) {
      throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
    }
    if (statusValue < 0) {
      throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
    }
    if (statusValue > 10000) {
      throw new TypeError("INVALID_TASK_STATUS_CONSISTENCY_INPUT");
    }
    summed = summed + statusValue;
  }
  const distinctStatusCount = entries.length;
  const matches = summed === total;
  const surplus = summed > total ? summed - total : 0;
  const deficit = total > summed ? total - summed : 0;
  return {
    total: total,
    summed: summed,
    distinctStatusCount: distinctStatusCount,
    matches: matches,
    surplus: surplus,
    deficit: deficit
  };
}
