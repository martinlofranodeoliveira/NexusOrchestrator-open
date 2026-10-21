export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_PROJECT_SYNC_STATUS_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_PROJECT_SYNC_STATUS_INPUT");
  }
  if (Array.isArray(payload)) {
    throw new TypeError("INVALID_PROJECT_SYNC_STATUS_INPUT");
  }
  if (typeof payload.githubConfigured !== "boolean") {
    throw new TypeError("INVALID_PROJECT_SYNC_STATUS_INPUT");
  }
  if (typeof payload.projectSyncEnabled !== "boolean") {
    throw new TypeError("INVALID_PROJECT_SYNC_STATUS_INPUT");
  }
  const githubConfigured = payload.githubConfigured;
  const projectSyncEnabled = payload.projectSyncEnabled;
  const ready = githubConfigured && projectSyncEnabled;
  const needsProvider = githubConfigured === false;
  const syncDisabled = githubConfigured === true && projectSyncEnabled === false;
  return {
    githubConfigured: githubConfigured,
    projectSyncEnabled: projectSyncEnabled,
    ready: ready,
    needsProvider: needsProvider,
    syncDisabled: syncDisabled
  };
}
