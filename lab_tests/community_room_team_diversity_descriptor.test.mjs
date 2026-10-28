import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/room_team_diversity_descriptor.mjs";

const CODE = "INVALID_ROOM_TEAM_DIVERSITY_INPUT";

function expectInvalid(payload, marker) {
  let error = null;
  try {
    runFeature(payload);
  } catch (err) {
    error = err;
  }
  assert.ok(error instanceof TypeError, "should throw TypeError");
  assert.equal(error.message, CODE);
  if (marker !== undefined) {
    assert.equal(error.message.includes(marker), false, "must not echo input");
  }
}

describe("room team diversity descriptor", () => {
  it("exposes runFeature function", () => {
    assert.equal(typeof runFeature, "function");
  });

  it("handles empty items", () => {
    assert.deepStrictEqual(runFeature({ items: [] }), {
      totalRooms: 0,
      distinctTeamCount: 0,
      teams: [],
      teamCounts: {},
      isEmpty: true,
      isSingleTeam: false,
      isMultiTeam: false
    });
  });

  it("handles single room single team", () => {
    assert.deepStrictEqual(runFeature({ items: [{ team: "solo" }] }), {
      totalRooms: 1,
      distinctTeamCount: 1,
      teams: ["solo"],
      teamCounts: { solo: 1 },
      isEmpty: false,
      isSingleTeam: true,
      isMultiTeam: false
    });
  });

  it("groups counts in first-seen order", () => {
    const out = runFeature({ items: [{ team: "atlas" }, { team: "atlas" }, { team: "pixel" }] });
    assert.deepStrictEqual(out, {
      totalRooms: 3,
      distinctTeamCount: 2,
      teams: ["atlas", "pixel"],
      teamCounts: { atlas: 2, pixel: 1 },
      isEmpty: false,
      isSingleTeam: false,
      isMultiTeam: true
    });
    const reverse = runFeature({ items: [{ team: "pixel" }, { team: "atlas" }, { team: "pixel" }] });
    assert.deepStrictEqual(reverse.teams, ["pixel", "atlas"]);
    assert.deepStrictEqual(reverse.teamCounts, { pixel: 2, atlas: 1 });
    assert.equal(reverse.totalRooms, 3);
    assert.equal(reverse.distinctTeamCount, 2);
  });

  it("sets flags for empty single and multi", () => {
    const empty = runFeature({ items: [] });
    assert.equal(empty.isEmpty, true);
    assert.equal(empty.isSingleTeam, false);
    assert.equal(empty.isMultiTeam, false);
    const single = runFeature({ items: [{ team: "a" }, { team: "a" }] });
    assert.equal(single.isEmpty, false);
    assert.equal(single.isSingleTeam, true);
    assert.equal(single.isMultiTeam, false);
    const multi = runFeature({ items: [{ team: "a" }, { team: "b" }] });
    assert.equal(multi.isEmpty, false);
    assert.equal(multi.isSingleTeam, false);
    assert.equal(multi.isMultiTeam, true);
  });

  it("ignores extra properties and never reads other fields", () => {
    const out = runFeature({ items: [{ team: "atlas", name: "room one", extra: 123 }], extraTop: true });
    assert.deepStrictEqual(out.teams, ["atlas"]);
    assert.deepStrictEqual(out.teamCounts, { atlas: 1 });
    assert.equal(out.totalRooms, 1);
  });

  it("returns fresh objects without mutating input", () => {
    const input = { items: [{ team: "atlas" }, { team: "pixel" }] };
    const before = JSON.stringify(input);
    const first = runFeature(input);
    assert.equal(JSON.stringify(input), before);
    first.teams.push("mutated");
    const second = runFeature(input);
    assert.deepStrictEqual(second.teams, ["atlas", "pixel"]);
    assert.notStrictEqual(first.teams, second.teams);
    assert.notStrictEqual(first.teamCounts, second.teamCounts);
    assert.notStrictEqual(first, second);
  });

  it("throws without echo for bad shapes", () => {
    expectInvalid(null);
    expectInvalid([]);
    expectInvalid("atlas");
    expectInvalid(42);
    expectInvalid(undefined);
    expectInvalid({});
    expectInvalid({ items: "atlas" });
    expectInvalid({ items: null });
    expectInvalid({ items: [{ team: "SECRET_MARKER_BAD" }, null] }, "SECRET_MARKER_BAD");
  });

  it("throws for bad elements and teams", () => {
    expectInvalid({ items: [null] });
    expectInvalid({ items: [[]] }, "[");
    expectInvalid({ items: [{}] });
    expectInvalid({ items: [{ team: 42 }] });
    expectInvalid({ items: [{ team: "" }] });
    expectInvalid({ items: [{ team: "x".repeat(65) }] }, "xxx");
    expectInvalid({ items: [{ notTeam: "atlas" }] });
  });

  it("enforces length boundaries", () => {
    const ok = [];
    for (let i = 0; i < 200; i += 1) {
      ok.push({ team: "t" });
    }
    const out = runFeature({ items: ok });
    assert.equal(out.totalRooms, 200);
    assert.equal(out.distinctTeamCount, 1);
    const tooMany = [];
    for (let i = 0; i < 201; i += 1) {
      tooMany.push({ team: "t" });
    }
    expectInvalid({ items: tooMany });
    assert.deepStrictEqual(runFeature({ items: [{ team: "a" }] }).teams, ["a"]);
    assert.deepStrictEqual(runFeature({ items: [{ team: "x".repeat(64) }] }).teams, ["x".repeat(64)]);
  });
});
