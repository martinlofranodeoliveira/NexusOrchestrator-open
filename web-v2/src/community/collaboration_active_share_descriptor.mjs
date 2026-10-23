export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_COLLABORATION_ACTIVE_SHARE_INPUT");
  }
  const totalCollaborations = payload.totalCollaborations;
  const activeCollaborations = payload.activeCollaborations;
  if (Number.isInteger(totalCollaborations) === false) {
    throw new TypeError("INVALID_COLLABORATION_ACTIVE_SHARE_INPUT");
  }
  if (Number.isInteger(activeCollaborations) === false) {
    throw new TypeError("INVALID_COLLABORATION_ACTIVE_SHARE_INPUT");
  }
  if (totalCollaborations < 0 || totalCollaborations > 10000) {
    throw new TypeError("INVALID_COLLABORATION_ACTIVE_SHARE_INPUT");
  }
  if (activeCollaborations < 0 || activeCollaborations > 10000) {
    throw new TypeError("INVALID_COLLABORATION_ACTIVE_SHARE_INPUT");
  }
  if (activeCollaborations > totalCollaborations) {
    throw new TypeError("INVALID_COLLABORATION_ACTIVE_SHARE_INPUT");
  }
  const idleCount = totalCollaborations - activeCollaborations;
  const hasActive = activeCollaborations > 0;
  const allActive = totalCollaborations > 0 && activeCollaborations === totalCollaborations;
  const noneActive = activeCollaborations === 0;
  return {
    totalCollaborations: totalCollaborations,
    activeCollaborations: activeCollaborations,
    idleCount: idleCount,
    hasActive: hasActive,
    allActive: allActive,
    noneActive: noneActive
  };
}
