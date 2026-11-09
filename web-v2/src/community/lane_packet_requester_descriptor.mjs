export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("INVALID_LANE_PACKET_REQUESTER_INPUT");
  }
  const laneHolders = [];
  for (const topPair of Object.entries(payload)) {
    if (topPair[0] === "lanes") {
      laneHolders.push(topPair[1]);
    }
  }
  if (laneHolders.length === 0) {
    throw new TypeError("INVALID_LANE_PACKET_REQUESTER_INPUT");
  }
  const lanes = laneHolders[0];
  if (Array.isArray(lanes) === false) {
    throw new TypeError("INVALID_LANE_PACKET_REQUESTER_INPUT");
  }
  if (lanes.length > 1000) {
    throw new TypeError("INVALID_LANE_PACKET_REQUESTER_INPUT");
  }
  const withPacketHolders = [];
  const withRequesterHolders = [];
  for (const entry of lanes) {
    if (typeof entry !== "object" || entry === null || Array.isArray(entry)) {
      throw new TypeError("INVALID_LANE_PACKET_REQUESTER_INPUT");
    }
    const packetHolders = [];
    for (const entryPair of Object.entries(entry)) {
      if (entryPair[0] === "packet") {
        packetHolders.push(entryPair[1]);
      }
    }
    if (packetHolders.length === 0) {
      throw new TypeError("INVALID_LANE_PACKET_REQUESTER_INPUT");
    }
    const packet = packetHolders[0];
    if (packet !== null) {
      if (typeof packet !== "object" || packet === null || Array.isArray(packet)) {
        throw new TypeError("INVALID_LANE_PACKET_REQUESTER_INPUT");
      }
      const requestHolders = [];
      for (const packetPair of Object.entries(packet)) {
        if (packetPair[0] === "requestedBy") {
          requestHolders.push(packetPair[1]);
        }
      }
      if (requestHolders.length === 0) {
        throw new TypeError("INVALID_LANE_PACKET_REQUESTER_INPUT");
      }
      const requestedBy = requestHolders[0];
      if (requestedBy !== null) {
        if (typeof requestedBy !== "object" || requestedBy === null || Array.isArray(requestedBy)) {
          throw new TypeError("INVALID_LANE_PACKET_REQUESTER_INPUT");
        }
        withRequesterHolders.push(entry);
      }
      withPacketHolders.push(entry);
    }
  }
  const totalLanes = lanes.length;
  const withPacket = withPacketHolders.length;
  const withRequester = withRequesterHolders.length;
  const withoutPacket = totalLanes - withPacket;
  const packetWithoutRequester = withPacket - withRequester;
  const hasPacket = withPacket > 0;
  const hasRequester = withRequester > 0;
  const isBare = withPacket === 0;
  return {
    hasPacket: hasPacket,
    hasRequester: hasRequester,
    isBare: isBare,
    packetWithoutRequester: packetWithoutRequester,
    totalLanes: totalLanes,
    withPacket: withPacket,
    withRequester: withRequester,
    withoutPacket: withoutPacket
  };
}
