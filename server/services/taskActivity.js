function parseTimestampMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function getMostRecentTimestampMs(values = []) {
  let latestMs = null;

  values.forEach((value) => {
    const parsed = parseTimestampMs(value);
    if (!Number.isFinite(parsed)) {
      return;
    }
    if (!Number.isFinite(latestMs) || parsed > latestMs) {
      latestMs = parsed;
    }
  });

  return Number.isFinite(latestMs) ? latestMs : null;
}

function getPrimaryLaneSnapshotUpdatedAt(lanes, taskId) {
  if (!taskId) return null;

  let latestLaneUpdatedAt = null;
  let latestLaneUpdatedAtMs = null;

  for (const lane of lanes || []) {
    if (!lane || lane.requestKind !== 'primary' || lane.taskId !== taskId) {
      continue;
    }

    const parsedUpdatedAt = parseTimestampMs(lane.updatedAt);
    if (!Number.isFinite(parsedUpdatedAt)) {
      continue;
    }

    if (!Number.isFinite(latestLaneUpdatedAtMs) || parsedUpdatedAt > latestLaneUpdatedAtMs) {
      latestLaneUpdatedAt = lane.updatedAt;
      latestLaneUpdatedAtMs = parsedUpdatedAt;
    }
  }

  return latestLaneUpdatedAt || null;
}

function getPrimaryTaskLastActivityMs({ task, runtimeMeta, lanes }) {
  return getMostRecentTimestampMs([
    getPrimaryLaneSnapshotUpdatedAt(lanes, task?.id),
    runtimeMeta?.lastOutputAt,
    runtimeMeta?.lastRunStartedAt,
    runtimeMeta?.lastLaneUpdatedAt,
    runtimeMeta?.lastRecoveredAt,
    task?.updatedAt,
    task?.statusChangedAt,
    task?.assigneeChangedAt,
    task?.startedAt,
    task?.createdAt,
  ]);
}

module.exports = {
  getMostRecentTimestampMs,
  getPrimaryLaneSnapshotUpdatedAt,
  getPrimaryTaskLastActivityMs,
  parseTimestampMs,
};
