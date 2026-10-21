export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null) {
    throw new TypeError("INVALID_EXECUTION_ACTIVITY_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_EXECUTION_ACTIVITY_INPUT");
  }
  if (typeof payload.running !== "boolean") {
    throw new TypeError("INVALID_EXECUTION_ACTIVITY_INPUT");
  }
  if (typeof payload.preparing !== "boolean") {
    throw new TypeError("INVALID_EXECUTION_ACTIVITY_INPUT");
  }
  if (typeof payload.queued !== "boolean") {
    throw new TypeError("INVALID_EXECUTION_ACTIVITY_INPUT");
  }
  const active = payload.running === true || payload.preparing === true || payload.queued === true;
  const idle = payload.running === false && payload.preparing === false && payload.queued === false;
  const hasQueued = payload.queued === true;
  return {
    running: payload.running,
    preparing: payload.preparing,
    queued: payload.queued,
    active: active,
    idle: idle,
    hasQueued: hasQueued
  };
}
