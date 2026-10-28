export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
  }
  if (payload.byTopology === undefined) {
    throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
  }
  const byTopology = payload.byTopology;
  if (byTopology === null) {
    throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
  }
  if (typeof byTopology !== "object") {
    throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
  }
  if (Array.isArray(byTopology) === true) {
    throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
  }
  let distinctTopologies = 0;
  let totalRooms = 0;
  let topTopology = null;
  let topCount = 0;
  for (const entry of Object.entries(byTopology)) {
    const k = entry[0];
    const v = entry[1];
    if (typeof k !== "string") {
      throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
    }
    if (k.length < 1) {
      throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
    }
    if (k.length > 64) {
      throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
    }
    if (typeof v !== "number") {
      throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
    }
    if (Number.isInteger(v) === false) {
      throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
    }
    if (Number.isFinite(v) === false) {
      throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
    }
    if (v < 0) {
      throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
    }
    if (v > 10000) {
      throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
    }
    distinctTopologies = distinctTopologies + 1;
    if (distinctTopologies > 50) {
      throw new TypeError("INVALID_ROOM_TOPOLOGY_MODE_INPUT");
    }
    totalRooms = totalRooms + v;
    if (v > topCount) {
      topCount = v;
      topTopology = k;
    } else {
      if (v === topCount) {
        if (v !== 0) {
          if (topTopology === null) {
            topCount = v;
            topTopology = k;
          } else {
            if (k < topTopology) {
              topTopology = k;
            }
          }
        }
      }
    }
  }
  let finalTop = topTopology;
  let finalCount = topCount;
  if (totalRooms === 0) {
    finalTop = null;
    finalCount = 0;
  }
  let isEmpty = false;
  if (totalRooms === 0) {
    isEmpty = true;
  }
  let isSingle = false;
  if (distinctTopologies === 1) {
    if (totalRooms > 0) {
      isSingle = true;
    }
  }
  return {
    distinctTopologies: distinctTopologies,
    totalRooms: totalRooms,
    topTopology: finalTop,
    topCount: finalCount,
    isEmpty: isEmpty,
    isSingleTopology: isSingle
  };
}
