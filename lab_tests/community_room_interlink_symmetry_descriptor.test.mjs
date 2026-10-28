import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/room_interlink_symmetry_descriptor.mjs";

function expectInvalid(payload) {
  assert.throws(() => runFeature(payload), (value) => {
    return value instanceof TypeError && value.message === "INVALID_ROOM_INTERLINK_SYMMETRY_INPUT";
  });
}

describe("room interlink symmetry descriptor", () => {
  it("handles empty rooms", () => {
    assert.deepEqual(runFeature({ items: [] }), {
      totalRooms: 0,
      totalLinks: 0,
      reciprocalLinks: 0,
      missingLinks: 0,
      danglingLinks: 0,
      isEmpty: true,
      isSymmetric: false
    });
  });
  it("handles symmetric pair", () => {
    assert.deepEqual(runFeature({ items: [{ id: "room-a", interlinkedRoomIds: ["room-b"] }, { id: "room-b", interlinkedRoomIds: ["room-a"] }] }), {
      totalRooms: 2,
      totalLinks: 2,
      reciprocalLinks: 2,
      missingLinks: 0,
      danglingLinks: 0,
      isEmpty: false,
      isSymmetric: true
    });
  });
  it("handles missing and dangling links", () => {
    assert.deepEqual(runFeature({ items: [{ id: "room-a", interlinkedRoomIds: ["room-b", "room-x"] }, { id: "room-b", interlinkedRoomIds: [] }] }), {
      totalRooms: 2,
      totalLinks: 2,
      reciprocalLinks: 0,
      missingLinks: 2,
      danglingLinks: 1,
      isEmpty: false,
      isSymmetric: false
    });
  });
  it("treats link-free rooms as symmetric", () => {
    assert.deepEqual(runFeature({ items: [{ id: "solo", interlinkedRoomIds: [] }] }), {
      totalRooms: 1,
      totalLinks: 0,
      reciprocalLinks: 0,
      missingLinks: 0,
      danglingLinks: 0,
      isEmpty: false,
      isSymmetric: true
    });
  });
  it("counts self links literally", () => {
    assert.deepEqual(runFeature({ items: [{ id: "s", interlinkedRoomIds: ["s"] }] }), {
      totalRooms: 1,
      totalLinks: 1,
      reciprocalLinks: 1,
      missingLinks: 0,
      danglingLinks: 0,
      isEmpty: false,
      isSymmetric: true
    });
  });
  it("counts duplicate link entries literally", () => {
    assert.deepEqual(runFeature({ items: [{ id: "a", interlinkedRoomIds: ["b", "b"] }, { id: "b", interlinkedRoomIds: ["a"] }] }), {
      totalRooms: 2,
      totalLinks: 3,
      reciprocalLinks: 3,
      missingLinks: 0,
      danglingLinks: 0,
      isEmpty: false,
      isSymmetric: true
    });
  });
  it("ignores extra properties and preserves input", () => {
    const payload = { items: [{ id: "a", interlinkedRoomIds: ["b"], extra: 1 }, { id: "b", interlinkedRoomIds: ["a"], extra: 2 }], extra: 3 };
    const before = JSON.stringify(payload);
    const result = runFeature(payload);
    assert.equal(result.totalRooms, 2);
    assert.equal(result.totalLinks, 2);
    assert.equal(result.reciprocalLinks, 2);
    assert.equal(JSON.stringify(payload), before);
    assert.deepEqual(Object.keys(result).sort(), ["danglingLinks", "isEmpty", "isSymmetric", "missingLinks", "reciprocalLinks", "totalLinks", "totalRooms"]);
  });
  it("rejects malformed payloads", () => {
    expectInvalid(null);
    expectInvalid([]);
    expectInvalid("x");
    expectInvalid({});
    expectInvalid({ items: "x" });
    expectInvalid({ items: [{ id: "a", interlinkedRoomIds: [] }, { id: "a", interlinkedRoomIds: [] }] });
    expectInvalid({ items: [{ id: "", interlinkedRoomIds: [] }] });
    expectInvalid({ items: [{ id: "a" }] });
    expectInvalid({ items: [{ id: "a", interlinkedRoomIds: "b" }] });
    expectInvalid({ items: [{ id: "a", interlinkedRoomIds: [""] }] });
    expectInvalid({ items: [null] });
  });
});
