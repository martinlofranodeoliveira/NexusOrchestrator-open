export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_RUN_QUEUE_LOAD_INPUT");
  }
  const entries = Object.entries(payload);
  const store = new Map();
  for (const entry of entries) {
    const name = entry[0];
    const item = entry[1];
    if (name === "active") {
      store.set("active", item);
    }
    if (name === "preparing") {
      store.set("preparing", item);
    }
    if (name === "queued") {
      store.set("queued", item);
    }
  }
  const rawActive = store.get("active");
  const rawPreparing = store.get("preparing");
  const rawQueued = store.get("queued");
  if (Number.isInteger(rawActive) === false || rawActive < 0 || rawActive > 10000) {
    throw new TypeError("INVALID_RUN_QUEUE_LOAD_INPUT");
  }
  if (Number.isInteger(rawPreparing) === false || rawPreparing < 0 || rawPreparing > 10000) {
    throw new TypeError("INVALID_RUN_QUEUE_LOAD_INPUT");
  }
  if (Number.isInteger(rawQueued) === false || rawQueued < 0 || rawQueued > 10000) {
    throw new TypeError("INVALID_RUN_QUEUE_LOAD_INPUT");
  }
  const active = rawActive + 0;
  const preparing = rawPreparing + 0;
  const queued = rawQueued + 0;
  const total = active + preparing + queued;
  const idle = total === 0;
  const hasBacklog = queued > 0;
  return {
    active: active,
    preparing: preparing,
    queued: queued,
    total: total,
    idle: idle,
    hasBacklog: hasBacklog
  };
}
