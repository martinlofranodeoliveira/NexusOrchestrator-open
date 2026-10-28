export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_ROOM_TEAM_DIVERSITY_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_ROOM_TEAM_DIVERSITY_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ROOM_TEAM_DIVERSITY_INPUT");
  }
  const items = payload.items;
  if (Array.isArray(items) === false) {
    throw new TypeError("INVALID_ROOM_TEAM_DIVERSITY_INPUT");
  }
  if (items.length > 200) {
    throw new TypeError("INVALID_ROOM_TEAM_DIVERSITY_INPUT");
  }
  const teams = [];
  const counts = new Map();
  for (const item of items) {
    if (item === null) {
      throw new TypeError("INVALID_ROOM_TEAM_DIVERSITY_INPUT");
    }
    if (typeof item !== "object") {
      throw new TypeError("INVALID_ROOM_TEAM_DIVERSITY_INPUT");
    }
    if (Array.isArray(item) === true) {
      throw new TypeError("INVALID_ROOM_TEAM_DIVERSITY_INPUT");
    }
    const team = item.team;
    if (typeof team !== "string") {
      throw new TypeError("INVALID_ROOM_TEAM_DIVERSITY_INPUT");
    }
    if (team.length < 1) {
      throw new TypeError("INVALID_ROOM_TEAM_DIVERSITY_INPUT");
    }
    if (team.length > 64) {
      throw new TypeError("INVALID_ROOM_TEAM_DIVERSITY_INPUT");
    }
    const current = counts.get(team);
    if (current === undefined) {
      teams.push(team);
      counts.set(team, 1);
    } else {
      counts.set(team, current + 1);
    }
  }
  const teamCounts = Object.fromEntries(counts);
  const totalRooms = items.length;
  const distinctTeamCount = teams.length;
  const isEmpty = totalRooms === 0;
  const isSingleTeam = distinctTeamCount === 1;
  const isMultiTeam = distinctTeamCount > 1;
  return {
    totalRooms: totalRooms,
    distinctTeamCount: distinctTeamCount,
    teams: teams,
    teamCounts: teamCounts,
    isEmpty: isEmpty,
    isSingleTeam: isSingleTeam,
    isMultiTeam: isMultiTeam
  };
}
