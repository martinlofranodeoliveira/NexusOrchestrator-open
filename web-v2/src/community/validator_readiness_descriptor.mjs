export function runFeature(payload) {
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_VALIDATOR_READINESS_INPUT");
  }
  if (payload === null) {
    throw new TypeError("INVALID_VALIDATOR_READINESS_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_VALIDATOR_READINESS_INPUT");
  }
  const enabled = payload.enabled;
  const available = payload.available;
  const ready = payload.ready;
  const removed = payload.removed;
  if (typeof enabled !== "boolean") {
    throw new TypeError("INVALID_VALIDATOR_READINESS_INPUT");
  }
  if (typeof available !== "boolean") {
    throw new TypeError("INVALID_VALIDATOR_READINESS_INPUT");
  }
  if (typeof ready !== "boolean") {
    throw new TypeError("INVALID_VALIDATOR_READINESS_INPUT");
  }
  if (typeof removed !== "boolean") {
    throw new TypeError("INVALID_VALIDATOR_READINESS_INPUT");
  }
  const isReady = enabled === true && available === true && ready === true && removed === false;
  const isDisabled = enabled === false || removed === true;
  const isUnavailable = enabled === true && removed === false && (available === false || ready === false);
  return {
    enabled: enabled,
    available: available,
    ready: ready,
    removed: removed,
    isReady: isReady,
    isDisabled: isDisabled,
    isUnavailable: isUnavailable
  };
}
