export function runFeature(payload) {
  if (typeof payload !== 'object') {
    throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  }
  if (payload === null) {
    throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  }
  const roles = payload.roles;
  if (typeof roles !== 'object') {
    throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  }
  if (roles === null) {
    throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  }
  if (Array.isArray(roles) === true) {
    throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  }
  const entries = Object.entries(roles);
  if (entries.length > 100) {
    throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  }
  let roleCount = 0;
  let totalAssignments = 0;
  for (const entry of entries) {
    const key = entry[0];
    const val = entry[1];
    if (typeof key !== 'string') {
      throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
    }
    if (key.length < 1) {
      throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
    }
    if (key.length > 64) {
      throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
    }
    for (const ch of key) {
      const cp = ch.codePointAt(0);
      if (cp >= 55296) {
        if (cp <= 57343) {
          throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
        }
      }
      if (cp <= 31) {
        if (cp !== 9) {
          if (cp !== 10) {
            if (cp !== 13) {
              throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
            }
          }
        }
      }
    }
    if (typeof val !== 'number') {
      throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
    }
    if (Number.isFinite(val) === false) {
      throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
    }
    if (Number.isInteger(val) === false) {
      throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
    }
    if (Number.isSafeInteger(val) === false) {
      throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
    }
    if (val < 0) {
      throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
    }
    if (val > 10000) {
      throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
    }
    roleCount += 1;
    totalAssignments += val;
  }
  if (roleCount !== entries.length) {
    throw new TypeError('INVALID_ROOM_ROLE_DISTRIBUTION_INPUT');
  }
  const hasRoles = roleCount > 0;
  const isEmpty = roleCount === 0;
  return { roleCount: roleCount, totalAssignments: totalAssignments, hasRoles: hasRoles, isEmpty: isEmpty };
}
