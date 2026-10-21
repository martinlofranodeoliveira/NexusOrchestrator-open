export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("INVALID_REVIEW_GATE_MODE_INPUT");
  }
  const enabled = payload.enabled;
  const mode = payload.mode;
  if (typeof enabled !== "boolean") {
    throw new TypeError("INVALID_REVIEW_GATE_MODE_INPUT");
  }
  if (mode !== "advisory" && mode !== "required") {
    throw new TypeError("INVALID_REVIEW_GATE_MODE_INPUT");
  }
  const isAdvisory = enabled === true && mode === "advisory";
  const isRequired = enabled === true && mode === "required";
  const isInactive = enabled === false;
  return {
    enabled: enabled,
    mode: mode,
    isAdvisory: isAdvisory,
    isRequired: isRequired,
    isInactive: isInactive
  };
}
