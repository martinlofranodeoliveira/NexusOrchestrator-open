export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ATTENTION_STALE_SEVERITY_INPUT");
  }
  const stale = payload.stale;
  const severity = payload.severity;
  if (typeof stale !== "boolean") {
    throw new TypeError("INVALID_ATTENTION_STALE_SEVERITY_INPUT");
  }
  if (typeof severity !== "string") {
    throw new TypeError("INVALID_ATTENTION_STALE_SEVERITY_INPUT");
  }
  if (severity !== "ok" && severity !== "info" && severity !== "medium" && severity !== "high" && severity !== "critical") {
    throw new TypeError("INVALID_ATTENTION_STALE_SEVERITY_INPUT");
  }
  const level = severity === "ok" ? 0 : severity === "info" ? 1 : severity === "medium" ? 2 : severity === "high" ? 3 : 4;
  const requiresAttention = stale === true || level >= 2;
  const isCritical = severity === "critical";
  const isClear = stale === false && severity === "ok";
  return { stale: stale, severity: severity, level: level, requiresAttention: requiresAttention, isCritical: isCritical, isClear: isClear };
}
