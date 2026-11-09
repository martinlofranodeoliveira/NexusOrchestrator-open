export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
  }
  if (typeof payload !== 'object') {
    throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
  }
  if (Array.isArray(payload)) {
    throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
  }
  let rooms = null;
  let roomsFound = false;
  for (const pair of Object.entries(payload)) {
    const pairKey = pair[0];
    const pairValue = pair[1];
    if (pairKey === 'rooms') {
      rooms = pairValue;
      roomsFound = true;
    }
  }
  if (roomsFound === false) {
    throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
  }
  if (Array.isArray(rooms) === false) {
    throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
  }
  if (rooms.length > 1000) {
    throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
  }
  const totalRooms = rooms.length;
  let totalOccupants = 0;
  const floorTotals = new Map();
  for (const entry of rooms) {
    if (entry === null) {
      throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
    }
    if (typeof entry !== 'object') {
      throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
    }
    if (Array.isArray(entry)) {
      throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
    }
    let floorValue = 0;
    let occupantsValue = 0;
    let foundFloor = false;
    let foundOccupants = false;
    for (const inner of Object.entries(entry)) {
      const innerKey = inner[0];
      const innerValue = inner[1];
      if (innerKey === 'floor') {
        floorValue = innerValue;
        foundFloor = true;
      }
      if (innerKey === 'occupants') {
        occupantsValue = innerValue;
        foundOccupants = true;
      }
    }
    if (foundFloor === false) {
      throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
    }
    if (foundOccupants === false) {
      throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
    }
    if (Number.isInteger(floorValue) === false) {
      throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
    }
    if (floorValue < 0) {
      throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
    }
    if (floorValue > 200) {
      throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
    }
    if (Number.isInteger(occupantsValue) === false) {
      throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
    }
    if (occupantsValue < 0) {
      throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
    }
    if (occupantsValue > 100000) {
      throw new TypeError('INVALID_ROOM_FLOOR_OCCUPANCY_INPUT');
    }
    totalOccupants = totalOccupants + occupantsValue;
    const current = floorTotals.get(floorValue);
    if (current === undefined) {
      floorTotals.set(floorValue, occupantsValue);
    } else {
      floorTotals.set(floorValue, current + occupantsValue);
    }
  }
  let distinctFloors = 0;
  let maxFloorOccupants = 0;
  let minFloorOccupants = 0;
  let busiestFloor = null;
  let quietestFloor = null;
  let started = false;
  for (const item of floorTotals) {
    const itemFloor = item[0];
    const itemSum = item[1];
    distinctFloors = distinctFloors + 1;
    if (started === false) {
      maxFloorOccupants = itemSum;
      minFloorOccupants = itemSum;
      busiestFloor = itemFloor;
      quietestFloor = itemFloor;
      started = true;
    } else {
      if (itemSum > maxFloorOccupants) {
        maxFloorOccupants = itemSum;
        busiestFloor = itemFloor;
      } else {
        if (itemSum === maxFloorOccupants) {
          if (itemFloor < busiestFloor) {
            busiestFloor = itemFloor;
          }
        }
      }
      if (itemSum < minFloorOccupants) {
        minFloorOccupants = itemSum;
        quietestFloor = itemFloor;
      } else {
        if (itemSum === minFloorOccupants) {
          if (itemFloor < quietestFloor) {
            quietestFloor = itemFloor;
          }
        }
      }
    }
  }
  const averageFloorOccupants = distinctFloors === 0 ? 0 : totalOccupants / distinctFloors;
  const hasOccupants = totalOccupants > 0;
  const isEmpty = totalOccupants === 0;
  return {
    totalRooms: totalRooms,
    distinctFloors: distinctFloors,
    totalOccupants: totalOccupants,
    maxFloorOccupants: maxFloorOccupants,
    minFloorOccupants: minFloorOccupants,
    averageFloorOccupants: averageFloorOccupants,
    busiestFloor: busiestFloor,
    quietestFloor: quietestFloor,
    hasOccupants: hasOccupants,
    isEmpty: isEmpty
  };
}
