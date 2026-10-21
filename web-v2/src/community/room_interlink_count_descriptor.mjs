export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT');
  }
  if (typeof payload !== 'object') {
    throw new TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT');
  }
  if (Array.isArray(payload)) {
    throw new TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT');
  }
  const list = payload.interlinkedRoomIds;
  if (Array.isArray(list) === false) {
    throw new TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT');
  }
  const linkCount = list.length;
  if (linkCount > 100) {
    throw new TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT');
  }
  for (const entry of list) {
    if (typeof entry !== 'string') {
      throw new TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT');
    }
    if (entry.length < 1) {
      throw new TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT');
    }
    if (entry.length > 64) {
      throw new TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT');
    }
    for (const ch of entry) {
      const code = ch.codePointAt(0);
      if (code >= 55296) {
        if (code <= 57343) {
          throw new TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT');
        }
      }
      if (code <= 31) {
        if (code !== 9) {
          if (code !== 10) {
            if (code !== 13) {
              throw new TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT');
            }
          }
        }
      }
    }
  }
  if (linkCount === 0) {
    return { linkCount: 0, hasLinks: false, isIsolated: true };
  }
  if (linkCount > 0) {
    return { linkCount: linkCount, hasLinks: true, isIsolated: false };
  }
  throw new TypeError('INVALID_ROOM_INTERLINK_COUNT_INPUT');
}
