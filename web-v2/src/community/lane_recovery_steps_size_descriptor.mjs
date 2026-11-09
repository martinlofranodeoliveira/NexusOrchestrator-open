export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
  }
  if (Array.isArray(payload)) {
    throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
  }
  let lanes = null;
  let foundLanes = false;
  for (const pair of Object.entries(payload)) {
    if (pair[0] === "lanes") {
      lanes = pair[1];
      foundLanes = true;
    }
  }
  if (foundLanes === false) {
    throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
  }
  if (Array.isArray(lanes) === false) {
    throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
  }
  if (lanes.length > 1000) {
    throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
  }
  let totalLanes = lanes.length;
  let totalSteps = 0;
  let lanesWithSteps = 0;
  let maxSteps = 0;
  let minSteps = 0;
  let isFirst = true;
  for (const lane of lanes) {
    if (lane === null) {
      throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
    }
    if (typeof lane !== "object") {
      throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
    }
    if (Array.isArray(lane)) {
      throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
    }
    let steps = null;
    let foundSteps = false;
    for (const inner of Object.entries(lane)) {
      if (inner[0] === "steps") {
        steps = inner[1];
        foundSteps = true;
      }
    }
    if (foundSteps === false) {
      throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
    }
    if (Array.isArray(steps) === false) {
      throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
    }
    if (steps.length > 50) {
      throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
    }
    for (const step of steps) {
      if (typeof step !== "string") {
        throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
      }
      if (step.length < 1) {
        throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
      }
      if (step.length > 128) {
        throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
      }
      for (const ch of step) {
        if (ch.length === 1) {
          const code = ch.charCodeAt(0);
          if (code >= 55296) {
            if (code <= 57343) {
              throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
            }
          }
          if (code < 32) {
            let isAllowed = false;
            if (code === 9) {
              isAllowed = true;
            }
            if (code === 10) {
              isAllowed = true;
            }
            if (code === 13) {
              isAllowed = true;
            }
            if (isAllowed === false) {
              throw new TypeError("INVALID_LANE_RECOVERY_STEPS_INPUT");
            }
          }
        }
      }
    }
    totalSteps = totalSteps + steps.length;
    if (steps.length > 0) {
      lanesWithSteps = lanesWithSteps + 1;
    }
    if (isFirst === true) {
      maxSteps = steps.length;
      minSteps = steps.length;
      isFirst = false;
    } else {
      if (steps.length > maxSteps) {
        maxSteps = steps.length;
      }
      if (steps.length < minSteps) {
        minSteps = steps.length;
      }
    }
  }
  let lanesEmpty = totalLanes - lanesWithSteps;
  let averageSteps = 0;
  if (totalLanes > 0) {
    averageSteps = totalSteps / totalLanes;
  }
  let hasSteps = false;
  if (totalSteps > 0) {
    hasSteps = true;
  }
  let isEmpty = false;
  if (totalSteps === 0) {
    isEmpty = true;
  }
  return {
    totalLanes: totalLanes,
    totalSteps: totalSteps,
    lanesWithSteps: lanesWithSteps,
    lanesEmpty: lanesEmpty,
    maxSteps: maxSteps,
    minSteps: minSteps,
    averageSteps: averageSteps,
    hasSteps: hasSteps,
    isEmpty: isEmpty
  };
}
