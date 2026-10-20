const DEFAULT_AGENT_NUMERIC_IDS: Record<string, number> = {
  ceo: 1,
  pm: 2,
  architect: 3,
  sm: 4,
  dev: 5,
  qa: 6,
  devops: 7,
  pm_review: 8,
  architect_review: 9,
  sm_review: 10,
  dev_review: 11,
  qa_review: 12,
  devops_review: 13,
};

const dynamicAgentNumericIds = new Map<string, number>();
let nextDynamicNumericId = 1000;

export function getNumericAgentId(id: string, fallbackIndex?: number): number {
  const normalizedId = String(id || '').trim();
  if (!normalizedId) {
    return fallbackIndex !== undefined ? fallbackIndex + 1 : 1;
  }

  const knownId = DEFAULT_AGENT_NUMERIC_IDS[normalizedId];
  if (knownId) {
    return knownId;
  }

  const genericAgentMatch = /^agent_(\d+)$/i.exec(normalizedId);
  if (genericAgentMatch) {
    return Number.parseInt(genericAgentMatch[1], 10);
  }

  if (dynamicAgentNumericIds.has(normalizedId)) {
    return dynamicAgentNumericIds.get(normalizedId)!;
  }

  if (fallbackIndex !== undefined) {
    const fallbackId = fallbackIndex + 1;
    dynamicAgentNumericIds.set(normalizedId, fallbackId);
    return fallbackId;
  }

  const allocatedId = nextDynamicNumericId++;
  dynamicAgentNumericIds.set(normalizedId, allocatedId);
  return allocatedId;
}

export function findAgentByNumericId<T extends { id: string }>(
  agents: T[],
  numericId: number,
): T | null {
  return (
    agents.find((agent, index) => getNumericAgentId(agent.id, index) === numericId) || null
  );
}
