export function runFeature(payload) {
  if (payload === null || typeof payload !== "object" || Array.isArray(payload)) {
    throw new TypeError("INVALID_ROOM_TEMPLATE_COUNT_INPUT");
  }
  const count = payload.roomTemplatesConfigured;
  if (Number.isSafeInteger(count) === false) {
    throw new TypeError("INVALID_ROOM_TEMPLATE_COUNT_INPUT");
  }
  if (count < 0 || count > 10000) {
    throw new TypeError("INVALID_ROOM_TEMPLATE_COUNT_INPUT");
  }
  return {
    roomTemplatesConfigured: count,
    hasTemplates: count > 0,
    empty: count === 0,
    single: count === 1,
    many: count > 1
  };
}
