export function runFeature(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_GITHUB_SYNC_READINESS_INPUT");
  }
  const githubConfigured = payload.githubConfigured;
  const projectSyncEnabled = payload.projectSyncEnabled;
  if (githubConfigured !== true && githubConfigured !== false) {
    throw new TypeError("INVALID_GITHUB_SYNC_READINESS_INPUT");
  }
  if (projectSyncEnabled !== true && projectSyncEnabled !== false) {
    throw new TypeError("INVALID_GITHUB_SYNC_READINESS_INPUT");
  }
  const ready = githubConfigured === true && projectSyncEnabled === true;
  const idle = githubConfigured === false && projectSyncEnabled === false;
  const partial = githubConfigured !== projectSyncEnabled;
  const needsSetup = ready === false;
  return {
    githubConfigured: githubConfigured,
    projectSyncEnabled: projectSyncEnabled,
    ready: ready,
    partial: partial,
    idle: idle,
    needsSetup: needsSetup
  };
}
