const os = require('os');
const path = require('path');

function normalizeInstanceValue(value) {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || null;
}

function resolveNexusInstanceId(env = process.env) {
  return (
    normalizeInstanceValue(env.NEXUS_INSTANCE_ID) ||
    normalizeInstanceValue(env.NEXUS_INSTANCE_OWNER) ||
    normalizeInstanceValue(env.GITHUB_OWNER) ||
    normalizeInstanceValue(env.USER) ||
    normalizeInstanceValue(env.USERNAME) ||
    normalizeInstanceValue(os.hostname()) ||
    'default'
  );
}

function resolveNexusInstanceOwner(env = process.env) {
  return (
    normalizeInstanceValue(env.NEXUS_INSTANCE_OWNER) ||
    normalizeInstanceValue(env.GITHUB_OWNER) ||
    resolveNexusInstanceId(env)
  );
}

function resolveTaskOwnerId(task) {
  return normalizeInstanceValue(task?.ownerId || task?.owner || null);
}

function resolveTaskInstanceId(task) {
  return normalizeInstanceValue(
    task?.ownerInstanceId || task?.instanceId || task?.instance || task?.ownerId || task?.owner || null,
  );
}

function buildTaskOwnershipMetadata(env = process.env) {
  return {
    ownerId: resolveNexusInstanceOwner(env),
    ownerInstanceId: resolveNexusInstanceId(env),
  };
}

function isTaskOwnedByInstance(task, instanceId) {
  const normalizedInstanceId = normalizeInstanceValue(instanceId);
  const taskInstanceId = resolveTaskInstanceId(task);
  return Boolean(normalizedInstanceId && taskInstanceId && normalizedInstanceId === taskInstanceId);
}

function isTaskOwnedByForeignInstance(task, instanceId) {
  const normalizedInstanceId = normalizeInstanceValue(instanceId);
  const taskInstanceId = resolveTaskInstanceId(task);
  return Boolean(normalizedInstanceId && taskInstanceId && normalizedInstanceId !== taskInstanceId);
}

function buildInstanceScopedPath(baseDir, instanceId, env = process.env) {
  const normalizedBaseDir = String(baseDir || '').trim();
  if (!normalizedBaseDir) return null;

  if (String(env.NEXUS_DISABLE_INSTANCE_PATH_NAMESPACE || 'false').toLowerCase() === 'true') {
    return path.resolve(normalizedBaseDir);
  }

  const normalizedInstanceId = resolveNexusInstanceId({
    ...env,
    NEXUS_INSTANCE_ID: instanceId || env.NEXUS_INSTANCE_ID,
  });
  const resolvedBaseDir = path.resolve(normalizedBaseDir);

  if (path.basename(resolvedBaseDir) === normalizedInstanceId) {
    return resolvedBaseDir;
  }

  return path.join(resolvedBaseDir, normalizedInstanceId);
}

module.exports = {
  buildInstanceScopedPath,
  buildTaskOwnershipMetadata,
  isTaskOwnedByForeignInstance,
  isTaskOwnedByInstance,
  normalizeInstanceValue,
  resolveNexusInstanceId,
  resolveNexusInstanceOwner,
  resolveTaskInstanceId,
  resolveTaskOwnerId,
};
