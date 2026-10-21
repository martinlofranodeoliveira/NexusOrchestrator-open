export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null) {
    throw new TypeError("INVALID_ATTENTION_SEVERITY_INPUT");
  }
  if (Array.isArray(payload)) {
    throw new TypeError("INVALID_ATTENTION_SEVERITY_INPUT");
  }
  const store = new Map();
  for (const entry of Object.entries(payload)) {
    const k = entry[0];
    const v = entry[1];
    store.set(k, v);
  }
  const severity = store.get("severity");
  if (typeof severity !== "string") {
    throw new TypeError("INVALID_ATTENTION_SEVERITY_INPUT");
  }
  const table = new Map();
  table.set("ok", 0);
  table.set("info", 1);
  table.set("medium", 2);
  table.set("high", 3);
  table.set("critical", 4);
  const level = table.get(severity);
  if (typeof level !== "number") {
    throw new TypeError("INVALID_ATTENTION_SEVERITY_INPUT");
  }
  if (severity === "ok") {
    return { severity: "ok", level: 0, isOk: true, needsAttention: false, isCritical: false };
  }
  if (severity === "info") {
    return { severity: "info", level: 1, isOk: false, needsAttention: false, isCritical: false };
  }
  if (severity === "medium") {
    return { severity: "medium", level: 2, isOk: false, needsAttention: true, isCritical: false };
  }
  if (severity === "high") {
    return { severity: "high", level: 3, isOk: false, needsAttention: true, isCritical: false };
  }
  if (severity === "critical") {
    return { severity: "critical", level: 4, isOk: false, needsAttention: true, isCritical: true };
  }
  throw new TypeError("INVALID_ATTENTION_SEVERITY_INPUT");
}
