export function runFeature(payload) {
  if (typeof payload !== "object") {
    throw TypeError("INVALID_ROOM_FLOOR_INPUT");
  }
  if (payload === null) {
    throw TypeError("INVALID_ROOM_FLOOR_INPUT");
  }
  if (Array.isArray(payload)) {
    throw TypeError("INVALID_ROOM_FLOOR_INPUT");
  }
  const found = new Map();
  for (const entry of Object.entries(payload)) {
    const name = entry[0];
    const value = entry[1];
    if (name === "floor") {
      found.set(name, value);
    }
  }
  const floor = found.get("floor");
  if (typeof floor !== "number") {
    throw TypeError("INVALID_ROOM_FLOOR_INPUT");
  }
  if (Number.isInteger(floor) === false) {
    throw TypeError("INVALID_ROOM_FLOOR_INPUT");
  }
  if (Number.isFinite(floor) === false) {
    throw TypeError("INVALID_ROOM_FLOOR_INPUT");
  }
  if (floor < 0) {
    throw TypeError("INVALID_ROOM_FLOOR_INPUT");
  }
  if (floor > 10000) {
    throw TypeError("INVALID_ROOM_FLOOR_INPUT");
  }
  const safeFloor = floor === 0 ? 0 : floor;
  const isGroundFloor = floor === 0;
  const isBuiltinFloor = floor >= 0 && floor <= 8;
  const isUpperFloor = floor > 0;
  return { floor: safeFloor, isBuiltinFloor: isBuiltinFloor, isGroundFloor: isGroundFloor, isUpperFloor: isUpperFloor };
}
