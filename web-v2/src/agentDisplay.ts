import type { BackendAgent } from './operationalState.js';
import type { OperationsSnapshot } from './operationsTypes.js';

interface DisplayContext {
  ownerId?: string | null;
  instanceId?: string | null;
}

interface TaskOwnershipLike {
  ownerId?: string | null;
  ownerInstanceId?: string | null;
}

function normalizeValue(value: string | null | undefined): string | null {
  const normalized = String(value || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return normalized || null;
}

export function resolveInstanceLabel(
  context?: DisplayContext | OperationsSnapshot | null,
): string | null {
  const ownerId = String(context?.ownerId || '').trim();
  if (ownerId) return ownerId;
  const instanceId = String(context?.instanceId || '').trim();
  return instanceId || null;
}

export function getAgentDisplayName(
  agent: Pick<BackendAgent, 'id' | 'name' | 'displayName' | 'ownerId' | 'instanceId'>,
  context?: DisplayContext | OperationsSnapshot | null,
): string {
  const explicitDisplayName = String(agent.displayName || '').trim();
  if (explicitDisplayName) return explicitDisplayName;

  const baseName = String(agent.name || agent.id || 'Agent').trim() || 'Agent';
  const scopeLabel = resolveInstanceLabel({
    ownerId: agent.ownerId || context?.ownerId || null,
    instanceId: agent.instanceId || context?.instanceId || null,
  });

  return scopeLabel ? `${baseName} @ ${scopeLabel}` : baseName;
}

export function getTaskOwnerLabel(task: TaskOwnershipLike): string | null {
  const ownerId = String(task.ownerId || '').trim();
  if (ownerId) return ownerId;
  const ownerInstanceId = String(task.ownerInstanceId || '').trim();
  return ownerInstanceId || null;
}

export function isForeignOwnedTask(
  task: TaskOwnershipLike,
  currentInstanceId: string | null | undefined,
): boolean {
  const taskOwnerInstanceId = normalizeValue(task.ownerInstanceId);
  const current = normalizeValue(currentInstanceId);
  return Boolean(taskOwnerInstanceId && current && taskOwnerInstanceId !== current);
}
