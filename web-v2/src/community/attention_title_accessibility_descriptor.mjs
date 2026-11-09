export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
  }
  const tasks = payload.tasks;
  if (Array.isArray(tasks) === false) {
    throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
  }
  if (tasks.length > 1000) {
    throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
  }
  const blankMarks = [];
  const labeledMarks = [];
  for (const entry of tasks) {
    if (entry === null) {
      throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
    }
    if (typeof entry !== "object") {
      throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
    }
    if (Array.isArray(entry) === true) {
      throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
    }
    const title = entry.title;
    if (typeof title !== "string") {
      throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
    }
    if (title.length > 128) {
      throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
    }
    const rest = [];
    for (const ch of title) {
      if (ch.length > 1) {
        if (ch !== " ") {
          if (ch !== "\t") {
            if (ch !== "\n") {
              if (ch !== "\r") {
                rest.push(ch);
              }
            }
          }
        }
      } else {
        const code = ch.charCodeAt(0);
        if (code >= 55296) {
          if (code <= 57343) {
            throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
          }
        }
        if (code < 32) {
          if (code !== 9) {
            if (code !== 10) {
              if (code !== 13) {
                throw new TypeError("INVALID_ATTENTION_TITLE_ACCESSIBILITY_INPUT");
              }
            }
          }
        }
        if (ch !== " ") {
          if (ch !== "\t") {
            if (ch !== "\n") {
              if (ch !== "\r") {
                rest.push(ch);
              }
            }
          }
        }
      }
    }
    if (rest.length === 0) {
      blankMarks.push(1);
    } else {
      labeledMarks.push(1);
    }
  }
  const blankCount = blankMarks.length;
  const labeledCount = labeledMarks.length;
  const totalTasks = tasks.length;
  const hasBlank = blankCount > 0;
  const isAccessible = blankCount === 0;
  return { totalTasks: totalTasks, labeledCount: labeledCount, blankCount: blankCount, hasBlank: hasBlank, isAccessible: isAccessible };
}
