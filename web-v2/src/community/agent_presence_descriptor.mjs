export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_AGENT_PRESENCE_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_AGENT_PRESENCE_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_AGENT_PRESENCE_INPUT");
  }
  const entries = Object.entries(payload);
  const store = new Map();
  for (const entry of entries) {
    const k = entry[0];
    const v = entry[1];
    store.set(k, v);
  }
  const total = store.get("total");
  if (Number.isInteger(total) === false) {
    throw new TypeError("INVALID_AGENT_PRESENCE_INPUT");
  }
  if (total < 0 || total > 10000) {
    throw new TypeError("INVALID_AGENT_PRESENCE_INPUT");
  }
  const isEmpty = total === 0;
  const hasAgents = total > 0;
  const isSingle = total === 1;
  const hasMultiple = total > 1;
  return {
    total: total,
    isEmpty: isEmpty,
    hasAgents: hasAgents,
    isSingle: isSingle,
    hasMultiple: hasMultiple
  };
}
