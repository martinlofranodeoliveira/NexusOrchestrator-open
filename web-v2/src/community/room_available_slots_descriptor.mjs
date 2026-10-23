export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("INVALID_ROOM_AVAILABILITY_INPUT");
  }
  const configuredSlots = payload.configuredSlots;
  const occupants = payload.occupants;
  const availableSlots = payload.availableSlots;
  if (Number.isInteger(configuredSlots) === false || Number.isInteger(occupants) === false || Number.isInteger(availableSlots) === false) {
    throw new TypeError("INVALID_ROOM_AVAILABILITY_INPUT");
  }
  if (configuredSlots < 0 || configuredSlots > 10000 || occupants < 0 || occupants > 10000 || availableSlots < 0 || availableSlots > 10000) {
    throw new TypeError("INVALID_ROOM_AVAILABILITY_INPUT");
  }
  const expectedAvailable = configuredSlots > occupants ? configuredSlots - occupants : 0;
  const matches = availableSlots === expectedAvailable;
  const understated = availableSlots < expectedAvailable;
  const overstated = availableSlots > expectedAvailable;
  return {
    configuredSlots: configuredSlots,
    occupants: occupants,
    availableSlots: availableSlots,
    expectedAvailable: expectedAvailable,
    matches: matches,
    understated: understated,
    overstated: overstated
  };
}
