function normalizeDispatchStatus(status) {
  return String(status || '').trim().toLowerCase();
}

function resolvePrimaryReadySlotTarget(env = process.env) {
  const raw = Number.parseInt(String(env.NEXUS_PRIMARY_READY_SLOT_TARGET || '2').trim(), 10);
  if (!Number.isFinite(raw)) {
    return 2;
  }
  return Math.max(1, raw);
}

function resolveBacklogAutoDispatchEnabled(env = process.env) {
  const raw = String(env.NEXUS_AUTO_DISPATCH_FROM_BACKLOG || 'true').trim().toLowerCase();
  return raw === 'true';
}

function resolveBacklogAutoPromotionEnabled(env = process.env) {
  const raw = String(env.NEXUS_AUTO_PROMOTE_READY_FROM_BACKLOG || 'true').trim().toLowerCase();
  return raw === 'true';
}

function isImplementationDispatchCandidateStatus(status, env = process.env) {
  const normalized = normalizeDispatchStatus(status);
  if (normalized === 'ready') return true;
  if (normalized === 'backlog') return resolveBacklogAutoDispatchEnabled(env);
  return false;
}

function isAutoDispatchCandidateStatus(status, env = process.env) {
  const normalized = normalizeDispatchStatus(status);
  if (normalized === 'in_review') return true;
  return isImplementationDispatchCandidateStatus(normalized, env);
}

function normalizeCollaborationDispatchStatus(status) {
  const normalized = normalizeDispatchStatus(status);
  if (normalized === 'in_review') return 'in_review';
  if (normalized === 'done') return 'done';
  return 'ready';
}

module.exports = {
  isAutoDispatchCandidateStatus,
  isImplementationDispatchCandidateStatus,
  normalizeCollaborationDispatchStatus,
  normalizeDispatchStatus,
  resolveBacklogAutoDispatchEnabled,
  resolveBacklogAutoPromotionEnabled,
  resolvePrimaryReadySlotTarget,
};
