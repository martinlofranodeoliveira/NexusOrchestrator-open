export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_TASK_ASSIGNMENT_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_TASK_ASSIGNMENT_INPUT");
  }
  if (Array.isArray(payload)) {
    throw new TypeError("INVALID_TASK_ASSIGNMENT_INPUT");
  }
  let hasOwnAssignee = false;
  let assigneeValue = null;
  for (const entry of Object.entries(payload)) {
    const k = entry[0];
    const v = entry[1];
    if (k === "assignee") {
      hasOwnAssignee = true;
      assigneeValue = v;
    }
  }
  if (hasOwnAssignee === false) {
    throw new TypeError("INVALID_TASK_ASSIGNMENT_INPUT");
  }
  if (assigneeValue === null) {
    return { assignee: null, hasAssignee: false, isUnassigned: true, assigneeLength: 0 };
  }
  if (typeof assigneeValue !== "string") {
    throw new TypeError("INVALID_TASK_ASSIGNMENT_INPUT");
  }
  if (assigneeValue.length > 1024) {
    throw new TypeError("INVALID_TASK_ASSIGNMENT_INPUT");
  }
  for (const ch of assigneeValue) {
    const cp = ch.codePointAt(0);
    if (cp <= 31) {
      if (cp !== 9 && cp !== 10 && cp !== 13) {
        throw new TypeError("INVALID_TASK_ASSIGNMENT_INPUT");
      }
    }
    if (cp >= 55296 && cp <= 57343) {
      throw new TypeError("INVALID_TASK_ASSIGNMENT_INPUT");
    }
  }
  const lengthValue = assigneeValue.length;
  if (lengthValue > 0) {
    return { assignee: assigneeValue, hasAssignee: true, isUnassigned: false, assigneeLength: lengthValue };
  }
  return { assignee: assigneeValue, hasAssignee: false, isUnassigned: true, assigneeLength: lengthValue };
}
