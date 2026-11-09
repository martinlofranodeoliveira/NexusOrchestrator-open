import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { runFeature } from '../web-v2/src/community/room_floor_occupancy_descriptor.mjs';

const INVALID = 'INVALID_ROOM_FLOOR_OCCUPANCY_INPUT';

function checkInvalid(input) {
  assert.throws(() => runFeature(input), (err) => {
    assert.equal(err instanceof TypeError, true);
    assert.equal(err.message, INVALID);
    return true;
  });
}

describe('room floor occupancy descriptor', () => {
  it('acceptance example grouped floors', () => {
    assert.deepEqual(runFeature({ rooms: [{ floor: 0, occupants: 2 }, { floor: 1, occupants: 3 }, { floor: 0, occupants: 1 }] }), {
      totalRooms: 3,
      distinctFloors: 2,
      totalOccupants: 6,
      maxFloorOccupants: 3,
      minFloorOccupants: 3,
      averageFloorOccupants: 3,
      busiestFloor: 0,
      quietestFloor: 0,
      hasOccupants: true,
      isEmpty: false
    });
  });
  it('acceptance empty rooms', () => {
    assert.deepEqual(runFeature({ rooms: [] }), {
      totalRooms: 0,
      distinctFloors: 0,
      totalOccupants: 0,
      maxFloorOccupants: 0,
      minFloorOccupants: 0,
      averageFloorOccupants: 0,
      busiestFloor: null,
      quietestFloor: null,
      hasOccupants: false,
      isEmpty: true
    });
  });
  it('acceptance uneven floors', () => {
    assert.deepEqual(runFeature({ rooms: [{ floor: 2, occupants: 0 }, { floor: 2, occupants: 5 }, { floor: 3, occupants: 1 }] }), {
      totalRooms: 3,
      distinctFloors: 2,
      totalOccupants: 6,
      maxFloorOccupants: 5,
      minFloorOccupants: 1,
      averageFloorOccupants: 3,
      busiestFloor: 2,
      quietestFloor: 3,
      hasOccupants: true,
      isEmpty: false
    });
  });
  it('tie breaks to lowest floor', () => {
    const out = runFeature({ rooms: [{ floor: 5, occupants: 4 }, { floor: 2, occupants: 4 }] });
    assert.equal(out.busiestFloor, 2);
    assert.equal(out.quietestFloor, 2);
    assert.equal(out.maxFloorOccupants, 4);
    assert.equal(out.minFloorOccupants, 4);
    assert.equal(out.averageFloorOccupants, 4);
  });
  it('rejects invalid payload shapes', () => {
    checkInvalid(null);
    checkInvalid(undefined);
    checkInvalid(42);
    checkInvalid('rooms');
    checkInvalid([]);
    checkInvalid({});
    checkInvalid({ rooms: null });
    checkInvalid({ rooms: 'no' });
    checkInvalid({ rooms: {} });
  });
  it('rejects invalid entries and ranges', () => {
    checkInvalid({ rooms: [null] });
    checkInvalid({ rooms: [[]] });
    checkInvalid({ rooms: [42] });
    checkInvalid({ rooms: [{ occupants: 1 }] });
    checkInvalid({ rooms: [{ floor: 1 }] });
    checkInvalid({ rooms: [{ floor: 1.5, occupants: 1 }] });
    checkInvalid({ rooms: [{ floor: -1, occupants: 1 }] });
    checkInvalid({ rooms: [{ floor: 201, occupants: 1 }] });
    checkInvalid({ rooms: [{ floor: 1, occupants: -1 }] });
    checkInvalid({ rooms: [{ floor: 1, occupants: 100001 }] });
    checkInvalid({ rooms: [{ floor: '1', occupants: 1 }] });
    checkInvalid({ rooms: [{ floor: 1, occupants: 1.2 }] });
  });
  it('rejects too many rooms', () => {
    const rooms = [];
    for (let i = 0; i < 1001; i += 1) {
      rooms.push({ floor: 0, occupants: 0 });
    }
    checkInvalid({ rooms });
  });
  it('ignores extras and preserves input', () => {
    const input = { rooms: [{ floor: 1, occupants: 2, note: 'x' }], extra: 99 };
    const before = JSON.stringify(input);
    const out = runFeature(input);
    assert.equal(out.totalRooms, 1);
    assert.equal(out.distinctFloors, 1);
    assert.equal(out.totalOccupants, 2);
    assert.equal(JSON.stringify(input), before);
    assert.notEqual(out, input);
  });
  it('all zero occupants is empty', () => {
    const out = runFeature({ rooms: [{ floor: 0, occupants: 0 }, { floor: 4, occupants: 0 }] });
    assert.equal(out.hasOccupants, false);
    assert.equal(out.isEmpty, true);
    assert.equal(out.maxFloorOccupants, 0);
    assert.equal(out.minFloorOccupants, 0);
    assert.equal(out.averageFloorOccupants, 0);
    assert.equal(out.busiestFloor, 0);
    assert.equal(out.quietestFloor, 0);
  });
});
