import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

import { OfficeState } from '../src/office/engine/officeState.ts';
import {
  buildDynamicCatalog,
  type LoadedAssetData,
} from '../src/office/layout/furnitureCatalog.ts';
import { layoutToSeats, migrateLayoutColors } from '../src/office/layout/index.ts';
import { findPath } from '../src/office/layout/tileMap.ts';
import { TileType } from '../src/office/types.ts';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function loadJson(filePath: string) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function collectManifestPaths(dirPath: string): string[] {
  const paths: string[] = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    const fullPath = path.join(dirPath, entry.name);
    if (entry.isDirectory()) {
      paths.push(...collectManifestPaths(fullPath));
      continue;
    }
    if (entry.isFile() && entry.name === 'manifest.json') {
      paths.push(fullPath);
    }
  }
  return paths;
}

function loadFurnitureAssets(): LoadedAssetData {
  const manifestsDir = path.resolve(root, 'public/assets/furniture');
  const manifests = collectManifestPaths(manifestsDir).map((manifestPath) => loadJson(manifestPath));
  const catalog: LoadedAssetData['catalog'] = [];
  const sprites: Record<string, string[][]> = {};

  for (const manifest of manifests) {
    const baseEntry = {
      label: manifest.name,
      category: manifest.category,
      canPlaceOnSurfaces: manifest.canPlaceOnSurfaces,
      backgroundTiles: manifest.backgroundTiles,
      canPlaceOnWalls: manifest.canPlaceOnWalls,
      rotationScheme: manifest.rotationScheme,
    };

    if (manifest.type === 'group' && Array.isArray(manifest.members)) {
      for (const member of manifest.members) {
        catalog.push({
          ...baseEntry,
          id: member.id,
          width: member.width,
          height: member.height,
          footprintW: member.footprintW,
          footprintH: member.footprintH,
          isDesk: manifest.category === 'desks',
          groupId: manifest.id,
          orientation: member.orientation,
          state: member.state,
          mirrorSide: member.mirrorSide,
          animationGroup: member.animationGroup,
          frame: member.frame,
        });
        sprites[member.id] = [['#000000']];
      }
      continue;
    }

    catalog.push({
      ...baseEntry,
      id: manifest.id,
      width: manifest.width,
      height: manifest.height,
      footprintW: manifest.footprintW,
      footprintH: manifest.footprintH,
      isDesk: manifest.category === 'desks',
    });
    sprites[manifest.id] = [['#000000']];
  }

  return { catalog, sprites };
}

function loadDefaultLayout() {
  return migrateLayoutColors(loadJson(path.resolve(root, 'public/assets/default-layout-1.json')));
}

function setupFurnitureCatalog(): void {
  const built = buildDynamicCatalog(loadFurnitureAssets());
  assert.equal(built, true, 'dynamic furniture catalog should load from source manifests');
}

test('default office layout migrates to the 14-room Nexus role-cell campus', () => {
  setupFurnitureCatalog();
  const layout = loadDefaultLayout();
  const seats = [...layoutToSeats(layout.furniture).values()];
  const workSeats = seats.filter((seat) => seat.zone === 'work');
  const meetingSeats = seats.filter((seat) => seat.zone === 'meeting');
  const workSeatsByRoom = Object.fromEntries(
    [...workSeats.reduce((map, seat) => {
      const key = String(seat.roomId || 'unknown');
      map.set(key, (map.get(key) || 0) + 1);
      return map;
    }, new Map<string, number>()).entries()].sort(([left], [right]) => left.localeCompare(right)),
  );

  assert.equal(layout.layoutRevision, 5);
  assert.equal(layout.cols, 54);
  assert.equal(layout.rows, 60);
  assert.equal(workSeats.length, 92);
  assert.equal(meetingSeats.length, 15);
  assert.deepEqual(workSeatsByRoom, {
    architect_primary_cell: 7,
    architect_review_cell: 7,
    ceo_command: 1,
    dev_primary_cell: 7,
    dev_review_cell: 7,
    dev_secondary_cell: 7,
    devops_primary_cell: 7,
    devops_review_cell: 7,
    pm_primary_cell: 7,
    pm_review_cell: 7,
    qa_primary_cell: 7,
    qa_review_cell: 7,
    sm_primary_cell: 7,
    sm_review_cell: 7,
  });
  assert.equal(seats.every((seat) => typeof seat.roomId === 'string' && seat.roomId.length > 0), true);
});

test('agent room affinity keeps agents inside the intended room and reuses that room for meetings', () => {
  setupFurnitureCatalog();
  const office = new OfficeState(loadDefaultLayout());

  office.setAgentAffinity(1, { team: 'primary', floor: 1, roomId: 'ceo_command' });
  office.addAgent(1, 0, 0, undefined, true);

  for (let agentId = 2; agentId <= 8; agentId += 1) {
    office.setAgentAffinity(agentId, {
      team: 'primary',
      floor: 1,
      roomId: 'pm_primary_cell',
    });
    office.addAgent(agentId, 0, 0, undefined, true);
  }

  office.setAgentAffinity(9, { team: 'review', floor: 2, roomId: 'qa_review_cell' });
  office.addAgent(9, 0, 0, undefined, true);

  const ceoSeat = office.seats.get(office.characters.get(1)?.seatId || '');
  assert.equal(ceoSeat?.roomId, 'ceo_command');
  assert.equal(ceoSeat?.floor, 1);

  for (let agentId = 2; agentId <= 8; agentId += 1) {
    const seat = office.seats.get(office.characters.get(agentId)?.seatId || '');
    assert.equal(seat?.roomId, 'pm_primary_cell');
    assert.equal(seat?.floor, 1);
    assert.equal(seat?.zone, 'work');
  }

  const reviewerSeat = office.seats.get(office.characters.get(9)?.seatId || '');
  assert.equal(reviewerSeat?.roomId, 'qa_review_cell');
  assert.equal(reviewerSeat?.floor, 2);
  assert.equal(reviewerSeat?.zone, 'work');

  office.setAgentMeeting(2, true);
  const meetingSeat = office.seats.get(office.characters.get(2)?.seatId || '');
  assert.equal(meetingSeat?.roomId, 'pm_primary_cell');
  assert.equal(meetingSeat?.zone, 'meeting');
  assert.equal(meetingSeat?.floor, 1);
});

test('pathfinding can reach a blocked seat tile without opening all seats for roaming', () => {
  const tileMap = Array.from({ length: 5 }, () => Array.from({ length: 5 }, () => TileType.FLOOR_1));
  const blockedTiles = new Set(['2,2']);
  const path = findPath(2, 4, 2, 2, tileMap, blockedTiles);

  assert.deepEqual(path, [
    { col: 2, row: 3 },
    { col: 2, row: 2 },
  ]);
});
