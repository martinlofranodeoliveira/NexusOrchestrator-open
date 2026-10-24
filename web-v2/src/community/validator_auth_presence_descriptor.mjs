export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_VALIDATOR_AUTH_PRESENCE_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_VALIDATOR_AUTH_PRESENCE_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_VALIDATOR_AUTH_PRESENCE_INPUT");
  }
  const authConfigured = payload.authConfigured;
  const authFileExists = payload.authFileExists;
  if (typeof authConfigured !== "boolean") {
    throw new TypeError("INVALID_VALIDATOR_AUTH_PRESENCE_INPUT");
  }
  if (typeof authFileExists !== "boolean") {
    throw new TypeError("INVALID_VALIDATOR_AUTH_PRESENCE_INPUT");
  }
  const isReady = authConfigured === true && authFileExists === true;
  const isMissing = authConfigured === false && authFileExists === false;
  const isPartial = authConfigured !== authFileExists;
  return {
    authConfigured: authConfigured,
    authFileExists: authFileExists,
    isReady: isReady,
    isMissing: isMissing,
    isPartial: isPartial
  };
}
