export function runFeature(payload) {
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
  }
  if (payload === null) {
    throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
  }
  const lanes = payload.lanes;
  if (Array.isArray(lanes) === false) {
    throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
  }
  if (lanes.length > 1000) {
    throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
  }
  const counts = new Map();
  counts.set("clean", 0);
  counts.set("consistent", 0);
  for (const entry of lanes) {
    if (typeof entry !== "object") {
      throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
    }
    if (entry === null) {
      throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
    }
    if (Array.isArray(entry) === true) {
      throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
    }
    const failureClass = entry.failureClass;
    const recoveryFailureClass = entry.recoveryFailureClass;
    const eventFailureClasses = entry.eventFailureClasses;
    const isNullFc = failureClass === null;
    const isStrFc = typeof failureClass === "string";
    if (isNullFc === false) {
      if (isStrFc === false) {
        throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
      }
      if (failureClass.length < 1) {
        throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
      }
      if (failureClass.length > 128) {
        throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
      }
      for (const ch of failureClass) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) {
          throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
        }
        if (cp >= 55296) {
          if (cp <= 57343) {
            throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
          }
        }
        if (cp < 32) {
          if (cp !== 9) {
            if (cp !== 10) {
              if (cp !== 13) {
                throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
              }
            }
          }
        }
      }
    }
    const isNullRfc = recoveryFailureClass === null;
    const isStrRfc = typeof recoveryFailureClass === "string";
    if (isNullRfc === false) {
      if (isStrRfc === false) {
        throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
      }
      if (recoveryFailureClass.length < 1) {
        throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
      }
      if (recoveryFailureClass.length > 128) {
        throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
      }
      for (const ch of recoveryFailureClass) {
        const cp = ch.codePointAt(0);
        if (cp === undefined) {
          throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
        }
        if (cp >= 55296) {
          if (cp <= 57343) {
            throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
          }
        }
        if (cp < 32) {
          if (cp !== 9) {
            if (cp !== 10) {
              if (cp !== 13) {
                throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
              }
            }
          }
        }
      }
    }
    if (Array.isArray(eventFailureClasses) === false) {
      throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
    }
    if (eventFailureClasses.length > 50) {
      throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
    }
    for (const item of eventFailureClasses) {
      const isNullItem = item === null;
      const isStrItem = typeof item === "string";
      if (isNullItem === false) {
        if (isStrItem === false) {
          throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
        }
        if (item.length < 1) {
          throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
        }
        if (item.length > 128) {
          throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
        }
        for (const ch of item) {
          const cp = ch.codePointAt(0);
          if (cp === undefined) {
            throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
          }
          if (cp >= 55296) {
            if (cp <= 57343) {
              throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
            }
          }
          if (cp < 32) {
            if (cp !== 9) {
              if (cp !== 10) {
                if (cp !== 13) {
                  throw new TypeError("INVALID_LANE_FAILURE_CONSISTENCY_INPUT");
                }
              }
            }
          }
        }
      }
    }
    const collected = [];
    if (failureClass !== null) {
      collected.push(failureClass);
    }
    if (recoveryFailureClass !== null) {
      collected.push(recoveryFailureClass);
    }
    for (const item of eventFailureClasses) {
      if (item !== null) {
        collected.push(item);
      }
    }
    const distinct = new Map();
    for (const v of collected) {
      distinct.set(v, true);
    }
    if (collected.length === 0) {
      counts.set("clean", counts.get("clean") + 1);
    } else {
      if (distinct.size === 1) {
        counts.set("consistent", counts.get("consistent") + 1);
      }
    }
  }
  const cleanCount = counts.get("clean");
  const consistentCount = counts.get("consistent");
  const total = lanes.length;
  const mismatched = total - cleanCount - consistentCount;
  const hasFailure = cleanCount < total;
  const hasMismatch = mismatched > 0;
  const isClean = cleanCount === total;
  const isConsistent = mismatched === 0;
  return {
    totalLanes: total,
    cleanLanes: cleanCount,
    consistentLanes: consistentCount,
    mismatchedLanes: mismatched,
    hasFailure: hasFailure,
    hasMismatch: hasMismatch,
    isClean: isClean,
    isConsistent: isConsistent
  };
}
