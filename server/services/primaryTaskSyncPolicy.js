function resolveBranchAbsorptionStatusDecision({
  remoteStatus = null,
  previousStatus = null,
  branchRef = null,
  integrated = false,
} = {}) {
  const explicitRemoteStatus = String(remoteStatus || '').trim() || null;
  const explicitPreviousStatus = String(previousStatus || '').trim() || null;
  const publishedBranchRef = String(branchRef || '').trim() || null;

  if (!publishedBranchRef) {
    return 'preserve';
  }

  if (explicitRemoteStatus) {
    if (explicitRemoteStatus === 'done') {
      return 'done';
    }
    if (explicitRemoteStatus === 'backlog') {
      return 'backlog';
    }
    return 'preserve';
  }

  if (explicitPreviousStatus === 'backlog' || explicitPreviousStatus === 'ready') {
    return 'preserve';
  }

  if (integrated) {
    return 'done';
  }

  return 'preserve';
}

function shouldBypassPublishedBranchLock({ taskStatus = null, branchRef = null, integrated = false } = {}) {
  const normalizedStatus = String(taskStatus || '').trim() || null;
  const publishedBranchRef = String(branchRef || '').trim() || null;

  if (!publishedBranchRef || !normalizedStatus) {
    return false;
  }

  if (normalizedStatus === 'in_progress' || normalizedStatus === 'in_review') {
    return true;
  }

  if (!integrated) {
    return false;
  }

  return normalizedStatus !== 'done';
}

module.exports = {
  resolveBranchAbsorptionStatusDecision,
  shouldBypassPublishedBranchLock,
};
