export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_LANE_LOAD_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_LANE_LOAD_INPUT");
  }
  if (Array.isArray(payload)) {
    throw new TypeError("INVALID_LANE_LOAD_INPUT");
  }
  const collected = new Map();
  for (const entry of Object.entries(payload)) {
    const name = entry[0];
    const value = entry[1];
    if (name === "totalTracked") {
      collected.set(name, value);
    }
    if (name === "active") {
      collected.set(name, value);
    }
  }
  const totalTracked = collected.get("totalTracked");
  const active = collected.get("active");
  if (Number.isInteger(totalTracked) === false) {
    throw new TypeError("INVALID_LANE_LOAD_INPUT");
  }
  if (Number.isInteger(active) === false) {
    throw new TypeError("INVALID_LANE_LOAD_INPUT");
  }
  if (totalTracked < 0) {
    throw new TypeError("INVALID_LANE_LOAD_INPUT");
  }
  if (totalTracked > 10000) {
    throw new TypeError("INVALID_LANE_LOAD_INPUT");
  }
  if (active < 0) {
    throw new TypeError("INVALID_LANE_LOAD_INPUT");
  }
  if (active > 10000) {
    throw new TypeError("INVALID_LANE_LOAD_INPUT");
  }
  if (active > totalTracked) {
    throw new TypeError("INVALID_LANE_LOAD_INPUT");
  }
  const idleCount = totalTracked - active;
  const empty = totalTracked === 0;
  const idle = active === 0;
  const hasActive = active > 0;
  return {
    totalTracked: totalTracked,
    active: active,
    idleCount: idleCount,
    empty: empty,
    idle: idle,
    hasActive: hasActive
  };
}
