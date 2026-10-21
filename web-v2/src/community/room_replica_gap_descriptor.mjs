export function runFeature(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ROOM_REPLICA_GAP_INPUT");
  }
  const configuredSlots = payload.configuredSlots;
  const replicaTarget = payload.replicaTarget;
  if (Number.isInteger(configuredSlots) === false || Number.isSafeInteger(configuredSlots) === false || Number.isFinite(configuredSlots) === false || configuredSlots < 0 || configuredSlots > 10000) {
    throw new TypeError("INVALID_ROOM_REPLICA_GAP_INPUT");
  }
  if (Number.isInteger(replicaTarget) === false || Number.isSafeInteger(replicaTarget) === false || Number.isFinite(replicaTarget) === false || replicaTarget < 0 || replicaTarget > 10000) {
    throw new TypeError("INVALID_ROOM_REPLICA_GAP_INPUT");
  }
  const gap = replicaTarget - configuredSlots;
  const needsScale = replicaTarget > configuredSlots;
  const atTarget = replicaTarget === configuredSlots;
  const overProvisioned = configuredSlots > replicaTarget;
  return { configuredSlots, replicaTarget, gap, needsScale, atTarget, overProvisioned };
}
