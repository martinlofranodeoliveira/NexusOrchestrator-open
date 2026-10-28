export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ROOM_INTERLINK_SYMMETRY_INPUT");
  }
  const items = payload.items;
  if (Array.isArray(items) === false) {
    throw new TypeError("INVALID_ROOM_INTERLINK_SYMMETRY_INPUT");
  }
  if (items.length > 50) {
    throw new TypeError("INVALID_ROOM_INTERLINK_SYMMETRY_INPUT");
  }
  const known = new Map();
  const totalMarks = [];
  for (const element of items) {
    if (typeof element !== "object" || element === null || Array.isArray(element) === true) {
      throw new TypeError("INVALID_ROOM_INTERLINK_SYMMETRY_INPUT");
    }
    const roomId = element.id;
    if (typeof roomId !== "string" || roomId.length === 0 || roomId.length > 64) {
      throw new TypeError("INVALID_ROOM_INTERLINK_SYMMETRY_INPUT");
    }
    if (known.get(roomId) !== undefined) {
      throw new TypeError("INVALID_ROOM_INTERLINK_SYMMETRY_INPUT");
    }
    const links = element.interlinkedRoomIds;
    if (Array.isArray(links) === false) {
      throw new TypeError("INVALID_ROOM_INTERLINK_SYMMETRY_INPUT");
    }
    if (links.length > 10) {
      throw new TypeError("INVALID_ROOM_INTERLINK_SYMMETRY_INPUT");
    }
    for (const link of links) {
      if (typeof link !== "string" || link.length === 0 || link.length > 64) {
        throw new TypeError("INVALID_ROOM_INTERLINK_SYMMETRY_INPUT");
      }
    }
    known.set(roomId, links);
    for (const link of links) {
      totalMarks.push(link);
    }
  }
  const reciprocalMarks = [];
  const danglingMarks = [];
  for (const element of items) {
    const sourceId = element.id;
    const sourceLinks = element.interlinkedRoomIds;
    for (const targetId of sourceLinks) {
      const targetLinks = known.get(targetId);
      if (targetLinks === undefined) {
        danglingMarks.push(targetId);
      } else {
        const backHits = [];
        for (const back of targetLinks) {
          if (back === sourceId) {
            backHits.push(back);
          }
        }
        if (backHits.length > 0) {
          reciprocalMarks.push(targetId);
        }
      }
    }
  }
  const totalRooms = items.length;
  const totalLinks = totalMarks.length;
  const reciprocalLinks = reciprocalMarks.length;
  const danglingLinks = danglingMarks.length;
  const missingLinks = totalLinks - reciprocalLinks;
  const isEmpty = totalRooms === 0;
  const isSymmetric = totalRooms > 0 && missingLinks === 0;
  return {
    totalRooms: totalRooms,
    totalLinks: totalLinks,
    reciprocalLinks: reciprocalLinks,
    missingLinks: missingLinks,
    danglingLinks: danglingLinks,
    isEmpty: isEmpty,
    isSymmetric: isSymmetric
  };
}
