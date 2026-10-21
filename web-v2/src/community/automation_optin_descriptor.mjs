export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("INVALID_AUTOMATION_OPTIN_INPUT");
  }
  const autoDispatchEnabled = payload.autoDispatchEnabled;
  const orphanRescueEnabled = payload.orphanRescueEnabled;
  const demoTasksEnabled = payload.demoTasksEnabled;
  if (typeof autoDispatchEnabled !== "boolean" || typeof orphanRescueEnabled !== "boolean" || typeof demoTasksEnabled !== "boolean") {
    throw new TypeError("INVALID_AUTOMATION_OPTIN_INPUT");
  }
  const flagMap = new Map();
  flagMap.set("autoDispatchEnabled", autoDispatchEnabled);
  flagMap.set("orphanRescueEnabled", orphanRescueEnabled);
  flagMap.set("demoTasksEnabled", demoTasksEnabled);
  for (const entry of flagMap) {
    if (typeof entry[1] !== "boolean") {
      throw new TypeError("INVALID_AUTOMATION_OPTIN_INPUT");
    }
  }
  for (const value of Object.values({ autoDispatchEnabled, orphanRescueEnabled, demoTasksEnabled })) {
    if (typeof value !== "boolean") {
      throw new TypeError("INVALID_AUTOMATION_OPTIN_INPUT");
    }
  }
  for (const entry of Object.entries({ autoDispatchEnabled, orphanRescueEnabled, demoTasksEnabled })) {
    if (typeof entry[1] !== "boolean") {
      throw new TypeError("INVALID_AUTOMATION_OPTIN_INPUT");
    }
  }
  const cachedAuto = flagMap.get("autoDispatchEnabled");
  const cachedOrphan = flagMap.get("orphanRescueEnabled");
  const cachedDemo = flagMap.get("demoTasksEnabled");
  if (typeof cachedAuto !== "boolean" || typeof cachedOrphan !== "boolean" || typeof cachedDemo !== "boolean") {
    throw new TypeError("INVALID_AUTOMATION_OPTIN_INPUT");
  }
  const enabledCount = cachedAuto === true ? (cachedOrphan === true ? (cachedDemo === true ? 3 : 2) : (cachedDemo === true ? 2 : 1)) : (cachedOrphan === true ? (cachedDemo === true ? 2 : 1) : (cachedDemo === true ? 1 : 0));
  const anyEnabled = enabledCount > 0;
  const allEnabled = enabledCount === 3;
  const allDisabled = enabledCount === 0;
  return { autoDispatchEnabled, orphanRescueEnabled, demoTasksEnabled, enabledCount, anyEnabled, allEnabled, allDisabled };
}
