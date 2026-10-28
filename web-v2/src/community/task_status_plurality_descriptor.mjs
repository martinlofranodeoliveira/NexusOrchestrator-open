export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_TASK_STATUS_PLURALITY_INPUT");
  }
  const todoValid = Number.isInteger(payload.todo) && payload.todo >= 0 && payload.todo <= 10000;
  const doingValid = Number.isInteger(payload.doing) && payload.doing >= 0 && payload.doing <= 10000;
  const doneValid = Number.isInteger(payload.done) && payload.done >= 0 && payload.done <= 10000;
  const blockedValid = Number.isInteger(payload.blocked) && payload.blocked >= 0 && payload.blocked <= 10000;
  const otherValid = Number.isInteger(payload.other) && payload.other >= 0 && payload.other <= 10000;
  if (todoValid === false || doingValid === false || doneValid === false || blockedValid === false || otherValid === false) {
    throw new TypeError("INVALID_TASK_STATUS_PLURALITY_INPUT");
  }
  const todo = payload.todo;
  const doing = payload.doing;
  const done = payload.done;
  const blocked = payload.blocked;
  const other = payload.other;
  const total = todo + doing + done + blocked + other;
  const topCount = todo >= doing && todo >= done && todo >= blocked && todo >= other ? todo : doing >= done && doing >= blocked && doing >= other ? doing : done >= blocked && done >= other ? done : blocked >= other ? blocked : other;
  const dominant = total === 0 ? null : todo === topCount ? "todo" : doing === topCount ? "doing" : done === topCount ? "done" : blocked === topCount ? "blocked" : "other";
  const isEmpty = total === 0;
  const tieCount = (todo === topCount ? 1 : 0) + (doing === topCount ? 1 : 0) + (done === topCount ? 1 : 0) + (blocked === topCount ? 1 : 0) + (other === topCount ? 1 : 0);
  const isTie = total === 0 ? false : tieCount > 1;
  return { todo: todo, doing: doing, done: done, blocked: blocked, other: other, total: total, topCount: topCount, dominant: dominant, isEmpty: isEmpty, isTie: isTie };
}
