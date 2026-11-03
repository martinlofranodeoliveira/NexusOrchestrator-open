export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null) {
    throw new TypeError("INVALID_FLEET_SERVICE_ACTIVITY_INPUT");
  }
  if (Array.isArray(payload)) {
    throw new TypeError("INVALID_FLEET_SERVICE_ACTIVITY_INPUT");
  }
  const collected = new Map();
  for (const entry of Object.entries(payload)) {
    const key = entry[0];
    const value = entry[1];
    if (key === "serviceConnected") {
      collected.set("serviceConnected", value);
    }
    if (key === "agentWorking") {
      collected.set("agentWorking", value);
    }
  }
  const serviceConnected = collected.get("serviceConnected");
  const agentWorking = collected.get("agentWorking");
  if (typeof serviceConnected !== "boolean") {
    throw new TypeError("INVALID_FLEET_SERVICE_ACTIVITY_INPUT");
  }
  if (typeof agentWorking !== "boolean") {
    throw new TypeError("INVALID_FLEET_SERVICE_ACTIVITY_INPUT");
  }
  const status = serviceConnected === false ? "disconnected" : agentWorking === true ? "working" : "idle";
  const isDisconnected = status === "disconnected";
  const isIdleConnected = serviceConnected === true && agentWorking === false;
  const isWorking = status === "working";
  return {
    serviceConnected: serviceConnected,
    agentWorking: agentWorking,
    status: status,
    isDisconnected: isDisconnected,
    isIdleConnected: isIdleConnected,
    isWorking: isWorking
  };
}
