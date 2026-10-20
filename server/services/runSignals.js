function resolveCompletionPromise(env = process.env) {
  return String(env.RALPH_COMPLETION_PROMISE || 'NEXUS_TASK_COMPLETE').trim()
    || 'NEXUS_TASK_COMPLETE';
}

function resolveCompletionMarker(env = process.env) {
  return `<promise>${resolveCompletionPromise(env)}</promise>`;
}

function resolveRejectionPromise(env = process.env) {
  return String(env.RALPH_REJECTION_PROMISE || 'NEXUS_TASK_REJECTED').trim()
    || 'NEXUS_TASK_REJECTED';
}

function resolveAdminPendingPromise(env = process.env) {
  return String(env.RALPH_ADMIN_PENDING_PROMISE || 'NEXUS_PENDING_ADMIN').trim()
    || 'NEXUS_PENDING_ADMIN';
}

function resolveRejectionMarker(env = process.env) {
  return `<promise>${resolveRejectionPromise(env)}</promise>`;
}

function resolveAdminPendingMarker(env = process.env) {
  return `<promise>${resolveAdminPendingPromise(env)}</promise>`;
}

function escapeRegex(text) {
  return String(text || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function detectIsolatedMarker(text, marker) {
  const normalizedText = String(text || '');
  const normalizedMarker = String(marker || '').trim();
  if (!normalizedText || !normalizedMarker) {
    return false;
  }

  const pattern = new RegExp(`(?:^|\\r?\\n)\\s*${escapeRegex(normalizedMarker)}\\s*(?=\\r?\\n|$)`);
  return pattern.test(normalizedText);
}

function detectCompletionMarker(text, env = process.env) {
  return detectIsolatedMarker(text, resolveCompletionMarker(env));
}

function detectRejectionMarker(text, env = process.env) {
  return detectIsolatedMarker(text, resolveRejectionMarker(env));
}

function detectAdminPendingMarker(text, env = process.env) {
  return detectIsolatedMarker(text, resolveAdminPendingMarker(env));
}

function normalizeTerminalSignalText(text, env = process.env) {
  const normalizedText = String(text || '').trim();
  if (!normalizedText) {
    return normalizedText;
  }

  if (normalizedText === resolveCompletionPromise(env)) {
    return resolveCompletionMarker(env);
  }

  if (normalizedText === resolveRejectionPromise(env)) {
    return resolveRejectionMarker(env);
  }

  if (normalizedText === resolveAdminPendingPromise(env)) {
    return resolveAdminPendingMarker(env);
  }

  return normalizedText;
}

module.exports = {
  detectAdminPendingMarker,
  detectCompletionMarker,
  detectIsolatedMarker,
  detectRejectionMarker,
  resolveAdminPendingMarker,
  resolveAdminPendingPromise,
  normalizeTerminalSignalText,
  resolveCompletionMarker,
  resolveCompletionPromise,
  resolveRejectionMarker,
  resolveRejectionPromise,
};
