export function runFeature(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_EXTERNAL_FLEET_EFFECTIVE_INPUT");
  }
  const enabled = payload.enabled;
  const state = payload.state;
  const updatedAtMs = payload.updatedAtMs;
  if (enabled !== true && enabled !== false) {
    throw new TypeError("INVALID_EXTERNAL_FLEET_EFFECTIVE_INPUT");
  }
  if (state !== "live" && state !== "stale" && state !== "unavailable") {
    throw new TypeError("INVALID_EXTERNAL_FLEET_EFFECTIVE_INPUT");
  }
  if (updatedAtMs !== null && (Number.isInteger(updatedAtMs) === false || updatedAtMs < 0 || updatedAtMs > 9007199254740991)) {
    throw new TypeError("INVALID_EXTERNAL_FLEET_EFFECTIVE_INPUT");
  }
  const hasTimestamp = Number.isInteger(updatedAtMs);
  const effective = enabled === false ? "disabled" : state;
  const isDisabled = effective === "disabled";
  const isLive = effective === "live";
  const isDegraded = effective === "stale" || effective === "unavailable";
  return { enabled, state, updatedAtMs, effective, hasTimestamp, isDisabled, isLive, isDegraded };
}
