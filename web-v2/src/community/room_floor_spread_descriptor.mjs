export function runFeature(payload) {
  if (typeof payload !== 'object' || payload === null) {
    throw new TypeError('INVALID_ROOM_FLOOR_SPREAD_INPUT');
  }
  if (Array.isArray(payload)) {
    throw new TypeError('INVALID_ROOM_FLOOR_SPREAD_INPUT');
  }
  const floors = payload.floors;
  if (Array.isArray(floors) === false) {
    throw new TypeError('INVALID_ROOM_FLOOR_SPREAD_INPUT');
  }
  if (floors.length > 500) {
    throw new TypeError('INVALID_ROOM_FLOOR_SPREAD_INPUT');
  }
  let count = 0;
  let minFloor = null;
  let maxFloor = null;
  for (const value of floors) {
    if (Number.isInteger(value) === false) {
      throw new TypeError('INVALID_ROOM_FLOOR_SPREAD_INPUT');
    }
    if (value < 0 || value > 1000) {
      throw new TypeError('INVALID_ROOM_FLOOR_SPREAD_INPUT');
    }
    if (count === 0) {
      minFloor = value;
      maxFloor = value;
    } else {
      if (value < minFloor) {
        minFloor = value;
      }
      if (value > maxFloor) {
        maxFloor = value;
      }
    }
    count = count + 1;
  }
  if (count !== floors.length) {
    throw new TypeError('INVALID_ROOM_FLOOR_SPREAD_INPUT');
  }
  const span = count === 0 ? 0 : maxFloor - minFloor;
  const isEmpty = count === 0;
  const isSingleFloor = count > 0 && span === 0;
  const hasSpread = span > 0;
  return { count, minFloor, maxFloor, span, isEmpty, isSingleFloor, hasSpread };
}
