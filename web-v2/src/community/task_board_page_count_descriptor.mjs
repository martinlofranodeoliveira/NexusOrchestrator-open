export function runFeature(payload) {
  if (typeof payload !== "object" || payload === null || Array.isArray(payload) === true) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_COUNT_INPUT");
  }
  const totalCount = payload.totalCount;
  const pageSize = payload.pageSize;
  if (Number.isInteger(totalCount) === false || Number.isInteger(pageSize) === false) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_COUNT_INPUT");
  }
  if (totalCount < 0 || totalCount > 10000 || pageSize < 1 || pageSize > 1000) {
    throw new TypeError("INVALID_TASK_BOARD_PAGE_COUNT_INPUT");
  }
  const remainder = totalCount % pageSize;
  const quotient = (totalCount - remainder) / pageSize;
  const totalPages = totalCount === 0 ? 0 : quotient + (remainder === 0 ? 0 : 1);
  const isEmpty = totalCount === 0;
  const isSinglePage = totalPages === 1;
  const hasMultiplePages = totalPages > 1;
  return {
    totalCount,
    pageSize,
    totalPages,
    remainder,
    isEmpty,
    isSinglePage,
    hasMultiplePages
  };
}
