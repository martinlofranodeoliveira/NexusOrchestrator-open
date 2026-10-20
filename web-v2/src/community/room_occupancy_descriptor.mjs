export function describeRoomOccupancy(input) {
  if (typeof input !== "object" || input === null) {
    throw new TypeError("INVALID_ROOM_OCCUPANCY_INPUT");
  }
  if (Array.isArray(input)) {
    throw new TypeError("INVALID_ROOM_OCCUPANCY_INPUT");
  }
  const configuredSlots = input.configuredSlots;
  const occupants = input.occupants;
  if (Number.isInteger(configuredSlots) === false) {
    throw new TypeError("INVALID_ROOM_OCCUPANCY_INPUT");
  }
  if (Number.isInteger(occupants) === false) {
    throw new TypeError("INVALID_ROOM_OCCUPANCY_INPUT");
  }
  if (configuredSlots < 0 || configuredSlots > 10000) {
    throw new TypeError("INVALID_ROOM_OCCUPANCY_INPUT");
  }
  if (occupants < 0 || occupants > 10000) {
    throw new TypeError("INVALID_ROOM_OCCUPANCY_INPUT");
  }
  const rawFree = configuredSlots - occupants;
  const freeSlots = rawFree > 0 ? rawFree : 0;
  const empty = occupants === 0;
  const full = configuredSlots > 0 && occupants >= configuredSlots;
  const overfilled = occupants > configuredSlots;
  return {
    configuredSlots,
    occupants,
    freeSlots,
    empty,
    full,
    overfilled
  };
}

export function runFeature(payload) {
  return describeRoomOccupancy(payload);
}
