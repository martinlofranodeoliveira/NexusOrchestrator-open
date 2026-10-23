export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload)) {
    throw new TypeError("INVALID_RALPH_ACTIVATION_INPUT");
  }
  const ralphExtensionConfigured = payload.ralphExtensionConfigured;
  const ralphExtensionInstalled = payload.ralphExtensionInstalled;
  const ralphExtensionActive = payload.ralphExtensionActive;
  if (typeof ralphExtensionConfigured !== "boolean" || typeof ralphExtensionInstalled !== "boolean" || typeof ralphExtensionActive !== "boolean") {
    throw new TypeError("INVALID_RALPH_ACTIVATION_INPUT");
  }
  const activationLevel = (ralphExtensionConfigured ? 1 : 0) + (ralphExtensionInstalled ? 1 : 0) + (ralphExtensionActive ? 1 : 0);
  const fullyActive = ralphExtensionConfigured && ralphExtensionInstalled && ralphExtensionActive;
  const inactive = !ralphExtensionConfigured && !ralphExtensionInstalled && !ralphExtensionActive;
  const consistent = (!ralphExtensionActive || (ralphExtensionInstalled && ralphExtensionConfigured)) && (!ralphExtensionInstalled || ralphExtensionConfigured);
  const activatable = ralphExtensionConfigured && ralphExtensionInstalled && !ralphExtensionActive;
  return {
    ralphExtensionConfigured: ralphExtensionConfigured,
    ralphExtensionInstalled: ralphExtensionInstalled,
    ralphExtensionActive: ralphExtensionActive,
    activationLevel: activationLevel,
    fullyActive: fullyActive,
    inactive: inactive,
    consistent: consistent,
    activatable: activatable
  };
}
