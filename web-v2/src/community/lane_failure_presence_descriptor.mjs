export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_LANE_FAILURE_PRESENCE_INPUT");
  }
  const entries = Object.entries(payload);
  const store = new Map();
  for (const entry of entries) {
    const entryKey = entry[0];
    const entryValue = entry[1];
    if (entryKey === "failureClass") {
      store.set("failureClass", entryValue);
    }
    if (entryKey === "failureMessage") {
      store.set("failureMessage", entryValue);
    }
  }
  const failureClass = store.get("failureClass");
  const failureMessage = store.get("failureMessage");
  const failureClassIsNull = failureClass === null;
  const failureClassIsString = typeof failureClass === "string";
  if (failureClassIsNull === false && failureClassIsString === false) {
    throw new TypeError("INVALID_LANE_FAILURE_PRESENCE_INPUT");
  }
  if (failureClassIsString === true && failureClass.length > 500) {
    throw new TypeError("INVALID_LANE_FAILURE_PRESENCE_INPUT");
  }
  const failureMessageIsNull = failureMessage === null;
  const failureMessageIsString = typeof failureMessage === "string";
  if (failureMessageIsNull === false && failureMessageIsString === false) {
    throw new TypeError("INVALID_LANE_FAILURE_PRESENCE_INPUT");
  }
  if (failureMessageIsString === true && failureMessage.length > 500) {
    throw new TypeError("INVALID_LANE_FAILURE_PRESENCE_INPUT");
  }
  const hasFailureClass = typeof failureClass === "string" && failureClass.length > 0;
  const hasFailureMessage = typeof failureMessage === "string" && failureMessage.length > 0;
  const failed = hasFailureClass === true || hasFailureMessage === true;
  const clear = hasFailureClass === false && hasFailureMessage === false;
  return {
    failureClass: failureClass,
    failureMessage: failureMessage,
    hasFailureClass: hasFailureClass,
    hasFailureMessage: hasFailureMessage,
    failed: failed,
    clear: clear
  };
}
