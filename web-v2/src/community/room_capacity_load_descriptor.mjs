export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ROOM_CAPACITY_LOAD_INPUT");
  }
  const items = payload.items;
  if (Array.isArray(items) === false) {
    throw new TypeError("INVALID_ROOM_CAPACITY_LOAD_INPUT");
  }
  if (items.length > 200) {
    throw new TypeError("INVALID_ROOM_CAPACITY_LOAD_INPUT");
  }
  let totalConfiguredSlots = 0;
  let totalOccupants = 0;
  let totalFreeSlots = 0;
  let fullRooms = 0;
  let overfilledRooms = 0;
  for (const room of items) {
    if (typeof room !== "object" || room === null || Array.isArray(room) === true) {
      throw new TypeError("INVALID_ROOM_CAPACITY_LOAD_INPUT");
    }
    const configuredSlots = room.configuredSlots;
    const occupants = room.occupants;
    if (Number.isInteger(configuredSlots) === false || configuredSlots < 0 || configuredSlots > 10000) {
      throw new TypeError("INVALID_ROOM_CAPACITY_LOAD_INPUT");
    }
    if (Number.isInteger(occupants) === false || occupants < 0 || occupants > 10000) {
      throw new TypeError("INVALID_ROOM_CAPACITY_LOAD_INPUT");
    }
    totalConfiguredSlots = totalConfiguredSlots + configuredSlots;
    totalOccupants = totalOccupants + occupants;
    if (configuredSlots > occupants) {
      totalFreeSlots = totalFreeSlots + (configuredSlots - occupants);
    }
    if (configuredSlots > 0 && occupants >= configuredSlots) {
      fullRooms = fullRooms + 1;
    }
    if (occupants > configuredSlots) {
      overfilledRooms = overfilledRooms + 1;
    }
  }
  const totalRooms = items.length;
  return {
    totalRooms: totalRooms,
    totalConfiguredSlots: totalConfiguredSlots,
    totalOccupants: totalOccupants,
    totalFreeSlots: totalFreeSlots,
    fullRooms: fullRooms,
    overfilledRooms: overfilledRooms,
    isEmpty: totalRooms === 0,
    isOverloaded: overfilledRooms > 0
  };
}
