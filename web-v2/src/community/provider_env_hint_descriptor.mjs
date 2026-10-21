export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null) {
    throw new TypeError("INVALID_PROVIDER_ENV_HINT_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_PROVIDER_ENV_HINT_INPUT");
  }
  const scope = payload.scope;
  const ok = payload.ok;
  const optional = payload.optional;
  if (scope !== "auth" && scope !== "metadata") {
    throw new TypeError("INVALID_PROVIDER_ENV_HINT_INPUT");
  }
  if (typeof ok !== "boolean") {
    throw new TypeError("INVALID_PROVIDER_ENV_HINT_INPUT");
  }
  if (typeof optional !== "boolean") {
    throw new TypeError("INVALID_PROVIDER_ENV_HINT_INPUT");
  }
  const isAuth = scope === "auth";
  const isMetadata = scope === "metadata";
  const isReady = ok === true;
  const needsSetup = ok === false && optional === false;
  return {
    scope: scope,
    ok: ok,
    optional: optional,
    isAuth: isAuth,
    isMetadata: isMetadata,
    isReady: isReady,
    needsSetup: needsSetup
  };
}
