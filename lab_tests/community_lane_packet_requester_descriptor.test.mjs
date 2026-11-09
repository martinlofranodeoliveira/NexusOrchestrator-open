import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { runFeature } from "../web-v2/src/community/lane_packet_requester_descriptor.mjs";

function assertInvalid(input) {
  let err = null;
  try {
    runFeature(input);
  } catch (e) {
    err = e;
  }
  assert.ok(err instanceof TypeError);
  assert.equal(err.message, "INVALID_LANE_PACKET_REQUESTER_INPUT");
}

describe("lane packet requester descriptor", () => {
  it("matches mixed contract example", () => {
    const input = { lanes: [{ packet: null }, { packet: { requestedBy: null } }, { packet: { requestedBy: { id: "u1", name: "Ada" } } }] };
    assert.deepStrictEqual(runFeature(input), {
      hasPacket: true,
      hasRequester: true,
      isBare: false,
      packetWithoutRequester: 1,
      totalLanes: 3,
      withPacket: 2,
      withRequester: 1,
      withoutPacket: 1
    });
  });

  it("matches empty lanes example", () => {
    assert.deepStrictEqual(runFeature({ lanes: [] }), {
      hasPacket: false,
      hasRequester: false,
      isBare: true,
      packetWithoutRequester: 0,
      totalLanes: 0,
      withPacket: 0,
      withRequester: 0,
      withoutPacket: 0
    });
  });

  it("matches extra-property contract example", () => {
    const input = { lanes: [{ note: "x", packet: { phase: "review", requestedBy: { id: "u9", name: "Bo" } } }] };
    assert.deepStrictEqual(runFeature(input), {
      hasPacket: true,
      hasRequester: true,
      isBare: false,
      packetWithoutRequester: 0,
      totalLanes: 1,
      withPacket: 1,
      withRequester: 1,
      withoutPacket: 0
    });
  });

  it("handles all-bare lanes", () => {
    const out = runFeature({ lanes: [{ packet: null }, { packet: null }] });
    assert.equal(out.totalLanes, 2);
    assert.equal(out.withPacket, 0);
    assert.equal(out.withoutPacket, 2);
    assert.equal(out.withRequester, 0);
    assert.equal(out.packetWithoutRequester, 0);
    assert.equal(out.hasPacket, false);
    assert.equal(out.hasRequester, false);
    assert.equal(out.isBare, true);
  });

  it("handles all-requested lanes", () => {
    const out = runFeature({ lanes: [{ packet: { requestedBy: { id: "a" } } }, { packet: { requestedBy: { id: "b" } } }] });
    assert.equal(out.totalLanes, 2);
    assert.equal(out.withPacket, 2);
    assert.equal(out.withoutPacket, 0);
    assert.equal(out.withRequester, 2);
    assert.equal(out.packetWithoutRequester, 0);
    assert.equal(out.hasPacket, true);
    assert.equal(out.hasRequester, true);
    assert.equal(out.isBare, false);
  });

  it("handles packets without requester", () => {
    const out = runFeature({ lanes: [{ packet: { requestedBy: null } }, { packet: { requestedBy: null } }] });
    assert.equal(out.withPacket, 2);
    assert.equal(out.withRequester, 0);
    assert.equal(out.packetWithoutRequester, 2);
    assert.equal(out.hasPacket, true);
    assert.equal(out.hasRequester, false);
    assert.equal(out.isBare, false);
  });

  it("ignores extra properties and preserves input", () => {
    const input = {
      extra: 1,
      lanes: [
        { packet: null, note: "keep" },
        { packet: { requestedBy: null, phase: "x" }, other: [1] },
        { packet: { requestedBy: { id: "u1", extra: true } } }
      ]
    };
    const before = JSON.stringify(input);
    const out = runFeature(input);
    assert.equal(JSON.stringify(input), before);
    assert.equal(out.totalLanes, 3);
    assert.equal(out.withPacket, 2);
    assert.equal(out.withRequester, 1);
    assert.equal(out.withoutPacket, 1);
    assert.equal(out.packetWithoutRequester, 1);
  });

  it("returns fresh deterministic result", () => {
    const input = { lanes: [{ packet: null }, { packet: { requestedBy: { id: "u1" } } }] };
    const a = runFeature(input);
    const b = runFeature(input);
    assert.deepStrictEqual(a, b);
    assert.notStrictEqual(a, b);
    a.totalLanes = 999;
    const c = runFeature(input);
    assert.equal(c.totalLanes, 2);
  });

  it("rejects invalid payload shapes", () => {
    assertInvalid(null);
    assertInvalid(undefined);
    assertInvalid([]);
    assertInvalid("x");
    assertInvalid(42);
    assertInvalid({});
    assertInvalid({ lanes: "x" });
    assertInvalid({ lanes: null });
    assertInvalid({ lanes: {} });
  });

  it("rejects invalid entries and packets", () => {
    assertInvalid({ lanes: [null] });
    assertInvalid({ lanes: [[]] });
    assertInvalid({ lanes: ["x"] });
    assertInvalid({ lanes: [{}] });
    assertInvalid({ lanes: [{ packet: undefined }] });
    assertInvalid({ lanes: [{ packet: 1 }] });
    assertInvalid({ lanes: [{ packet: "p" }] });
    assertInvalid({ lanes: [{ packet: [] }] });
    assertInvalid({ lanes: [{ packet: { } }] });
    assertInvalid({ lanes: [{ packet: { requestedBy: undefined } }] });
    assertInvalid({ lanes: [{ packet: { requestedBy: 1 } }] });
    assertInvalid({ lanes: [{ packet: { requestedBy: [] } }] });
    assertInvalid({ lanes: [{ packet: { requestedBy: "r" } }] });
  });

  it("rejects over-1000 lanes but allows 1000", () => {
    const big = [];
    for (let i = 0; i < 1001; i++) {
      big.push({ packet: null });
    }
    assertInvalid({ lanes: big });
    const ok = [];
    for (let i = 0; i < 1000; i++) {
      ok.push({ packet: null });
    }
    const out = runFeature({ lanes: ok });
    assert.equal(out.totalLanes, 1000);
    assert.equal(out.isBare, true);
  });
});
