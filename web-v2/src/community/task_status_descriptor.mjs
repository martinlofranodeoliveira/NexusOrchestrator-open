export function runFeature(payload) {
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_TASK_STATUS_INPUT");
  }
  if (payload === null) {
    throw new TypeError("INVALID_TASK_STATUS_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_TASK_STATUS_INPUT");
  }
  const status = payload.status;
  if (status === "todo") {
    return {
      status: "todo",
      level: 0,
      isTodo: true,
      isDoing: false,
      isDone: false,
      isBlocked: false
    };
  }
  if (status === "doing") {
    return {
      status: "doing",
      level: 1,
      isTodo: false,
      isDoing: true,
      isDone: false,
      isBlocked: false
    };
  }
  if (status === "done") {
    return {
      status: "done",
      level: 2,
      isTodo: false,
      isDoing: false,
      isDone: true,
      isBlocked: false
    };
  }
  if (status === "blocked") {
    return {
      status: "blocked",
      level: 3,
      isTodo: false,
      isDoing: false,
      isDone: false,
      isBlocked: true
    };
  }
  throw new TypeError("INVALID_TASK_STATUS_INPUT");
}
