export function runFeature(payload) {
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  if (payload === null) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  if (Array.isArray(payload) === true) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  const total = payload.total;
  const pageSize = payload.pageSize;
  const pageIndex = payload.pageIndex;
  if (Number.isInteger(total) === false) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  if (Number.isInteger(pageSize) === false) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  if (Number.isInteger(pageIndex) === false) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  if (total < 0) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  if (total > 10000) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  if (pageSize < 1) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  if (pageSize > 1000) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  if (pageIndex < 0) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  if (pageIndex > 10000) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_WINDOW_INPUT");
  }
  const remainder = total % pageSize;
  const exact = (total - remainder) / pageSize;
  const pageCount = total === 0 ? 0 : (remainder === 0 ? exact : exact + 1);
  const rawStart = pageIndex * pageSize;
  const start = rawStart < total ? rawStart : total;
  const rawEnd = start + pageSize;
  const end = rawEnd < total ? rawEnd : total;
  const count = end - start;
  const hasPrev = pageCount > 0 && pageIndex > 0;
  const hasNext = pageIndex + 1 < pageCount;
  const isEmpty = count === 0;
  return {
    total: total,
    pageSize: pageSize,
    pageIndex: pageIndex,
    pageCount: pageCount,
    start: start,
    end: end,
    count: count,
    hasPrev: hasPrev,
    hasNext: hasNext,
    isEmpty: isEmpty
  };
}
