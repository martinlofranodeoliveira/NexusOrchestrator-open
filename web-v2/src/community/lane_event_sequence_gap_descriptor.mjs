export function runFeature(payload) {
  if (payload === null) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  if (typeof payload !== "object") {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  if (Array.isArray(payload)) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  const firstSeq = payload.firstSeq;
  const lastSeq = payload.lastSeq;
  const total = payload.total;
  if (Number.isInteger(firstSeq) === false) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  if (Number.isInteger(lastSeq) === false) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  if (Number.isInteger(total) === false) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  if (firstSeq < 0) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  if (firstSeq > 1000000) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  if (lastSeq < 0) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  if (lastSeq > 1000000) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  if (total < 0) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  if (total > 1000000) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  if (firstSeq > lastSeq) {
    throw new TypeError("INVALID_LANE_EVENT_SEQUENCE_GAP_INPUT");
  }
  const expected = lastSeq - firstSeq + 1;
  const rawMissing = expected - total;
  const missing = rawMissing > 0 ? rawMissing : 0;
  const hasGap = missing > 0;
  const contiguous = missing === 0;
  return {
    firstSeq: firstSeq,
    lastSeq: lastSeq,
    total: total,
    expected: expected,
    missing: missing,
    hasGap: hasGap,
    contiguous: contiguous
  };
}
