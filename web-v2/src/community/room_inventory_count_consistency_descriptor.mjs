export function runFeature(payload) {
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_ROOM_INVENTORY_COUNT_INPUT");
  }
  if (payload === null) {
    throw new TypeError("INVALID_ROOM_INVENTORY_COUNT_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ROOM_INVENTORY_COUNT_INPUT");
  }
  const totalConfigured = payload.totalConfigured;
  const items = payload.items;
  if (Number.isInteger(totalConfigured) === false) {
    throw new TypeError("INVALID_ROOM_INVENTORY_COUNT_INPUT");
  }
  if (Number.isFinite(totalConfigured) === false) {
    throw new TypeError("INVALID_ROOM_INVENTORY_COUNT_INPUT");
  }
  if (totalConfigured < 0) {
    throw new TypeError("INVALID_ROOM_INVENTORY_COUNT_INPUT");
  }
  if (totalConfigured > 10000) {
    throw new TypeError("INVALID_ROOM_INVENTORY_COUNT_INPUT");
  }
  if (Array.isArray(items) === false) {
    throw new TypeError("INVALID_ROOM_INVENTORY_COUNT_INPUT");
  }
  const itemCount = items.length;
  if (Number.isInteger(itemCount) === false) {
    throw new TypeError("INVALID_ROOM_INVENTORY_COUNT_INPUT");
  }
  if (itemCount < 0) {
    throw new TypeError("INVALID_ROOM_INVENTORY_COUNT_INPUT");
  }
  if (itemCount > 10000) {
    throw new TypeError("INVALID_ROOM_INVENTORY_COUNT_INPUT");
  }
  const isMatch = itemCount === totalConfigured;
  const isMissing = itemCount < totalConfigured;
  const hasExtra = itemCount > totalConfigured;
  return {
    totalConfigured: totalConfigured,
    itemCount: itemCount,
    isMatch: isMatch,
    isMissing: isMissing,
    hasExtra: hasExtra
  };
}
