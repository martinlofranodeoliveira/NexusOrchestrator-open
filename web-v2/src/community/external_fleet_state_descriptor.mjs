export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("INVALID_FLEET_STATE_INPUT");
  }
  const state = payload.state;
  if (typeof state !== "string") {
    throw new TypeError("INVALID_FLEET_STATE_INPUT");
  }
  if (state !== "live" && state !== "stale" && state !== "unavailable") {
    throw new TypeError("INVALID_FLEET_STATE_INPUT");
  }
  if (state === "live") {
    return { state: "live", level: 2, isLive: true, isStale: false, isUnavailable: false };
  }
  if (state === "stale") {
    return { state: "stale", level: 1, isLive: false, isStale: true, isUnavailable: false };
  }
  return { state: "unavailable", level: 0, isLive: false, isStale: false, isUnavailable: true };
}
