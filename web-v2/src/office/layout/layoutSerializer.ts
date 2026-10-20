import { getColorizedSprite } from '../colorize.js';
import type {
  FloorColor,
  FurnitureInstance,
  OfficeLayout,
  PlacedFurniture,
  Seat,
  TileType as TileTypeVal,
} from '../types.js';
import { DEFAULT_COLS, DEFAULT_ROWS, Direction, TILE_SIZE, TileType } from '../types.js';
import { getCatalogEntry, getOrientationInGroup } from './furnitureCatalog.js';

const SECOND_FLOOR_UID_PREFIX = 'g2-';
const SECOND_FLOOR_ROW_START = 33;
const DUAL_FLOOR_LAYOUT_REVISION = 3;
const ROLE_CELL_LAYOUT_REVISION = 5;
const SEAT_META_PREFIX = 'nexus-seat::';
const CAMPUS_COLS = 54;
const CAMPUS_ROWS = 60;
const ROOM_SHELL_WIDTH = 11;
const ROOM_SHELL_HEIGHT = 12;
const ROOM_COLUMN_STEP = 13;
const ROOM_DECOR_TOP_OFFSET = 1;
const PRIMARY_ROOM_START_COL = 2;
const REVIEW_ROOM_START_COL = 8;
const PRIMARY_ROOM_TOP_ROWS = [3, 17];
const REVIEW_ROOM_TOP_ROWS = [33, 47];
const CAMPUS_CORRIDOR_TILE = TileType.FLOOR_9;
const CAMPUS_CORRIDOR_COLOR: FloorColor = { h: 214, s: 30, b: -100, c: -55 };
const DECOR_STRIP_COLOR: FloorColor = { h: 209, s: 0, b: -16, c: -8 };
const PRIMARY_HUB_TILE = TileType.FLOOR_4;
const PRIMARY_HUB_COLOR: FloorColor = { h: 28, s: 22, b: -12, c: -16 };
const REVIEW_HUB_TILE = TileType.FLOOR_6;
const REVIEW_HUB_COLOR: FloorColor = { h: 210, s: 18, b: -18, c: -22 };
const CAMPUS_SPINE_TILE = TileType.FLOOR_5;
const CAMPUS_SPINE_COLOR: FloorColor = { h: 188, s: 18, b: -30, c: -18 };

type RoomVisualTheme = {
  roomTile: TileTypeVal;
  roomColor: FloorColor;
  deskLaneTile: TileTypeVal;
  deskLaneColor: FloorColor;
  loungeTile: TileTypeVal;
  loungeColor: FloorColor;
  thresholdTile: TileTypeVal;
  thresholdColor: FloorColor;
};

type CampusRoomSpec = {
  roomId: string;
  role: 'ceo' | 'pm' | 'architect' | 'sm' | 'dev' | 'qa' | 'devops';
  team: 'primary' | 'review';
  topCol: number;
  topRow: number;
  kind: 'ceo' | 'cell';
};

const CAMPUS_ROOM_SPECS: CampusRoomSpec[] = [
  {
    roomId: 'ceo_command',
    role: 'ceo',
    team: 'primary',
    topCol: PRIMARY_ROOM_START_COL + ROOM_COLUMN_STEP * 0,
    topRow: PRIMARY_ROOM_TOP_ROWS[0],
    kind: 'ceo',
  },
  {
    roomId: 'pm_primary_cell',
    role: 'pm',
    team: 'primary',
    topCol: PRIMARY_ROOM_START_COL + ROOM_COLUMN_STEP * 1,
    topRow: PRIMARY_ROOM_TOP_ROWS[0],
    kind: 'cell',
  },
  {
    roomId: 'architect_primary_cell',
    role: 'architect',
    team: 'primary',
    topCol: PRIMARY_ROOM_START_COL + ROOM_COLUMN_STEP * 2,
    topRow: PRIMARY_ROOM_TOP_ROWS[0],
    kind: 'cell',
  },
  {
    roomId: 'sm_primary_cell',
    role: 'sm',
    team: 'primary',
    topCol: PRIMARY_ROOM_START_COL + ROOM_COLUMN_STEP * 3,
    topRow: PRIMARY_ROOM_TOP_ROWS[0],
    kind: 'cell',
  },
  {
    roomId: 'dev_primary_cell',
    role: 'dev',
    team: 'primary',
    topCol: PRIMARY_ROOM_START_COL + ROOM_COLUMN_STEP * 0,
    topRow: PRIMARY_ROOM_TOP_ROWS[1],
    kind: 'cell',
  },
  {
    roomId: 'dev_secondary_cell',
    role: 'dev',
    team: 'primary',
    topCol: PRIMARY_ROOM_START_COL + ROOM_COLUMN_STEP * 1,
    topRow: PRIMARY_ROOM_TOP_ROWS[1],
    kind: 'cell',
  },
  {
    roomId: 'qa_primary_cell',
    role: 'qa',
    team: 'primary',
    topCol: PRIMARY_ROOM_START_COL + ROOM_COLUMN_STEP * 2,
    topRow: PRIMARY_ROOM_TOP_ROWS[1],
    kind: 'cell',
  },
  {
    roomId: 'devops_primary_cell',
    role: 'devops',
    team: 'primary',
    topCol: PRIMARY_ROOM_START_COL + ROOM_COLUMN_STEP * 3,
    topRow: PRIMARY_ROOM_TOP_ROWS[1],
    kind: 'cell',
  },
  {
    roomId: 'pm_review_cell',
    role: 'pm',
    team: 'review',
    topCol: REVIEW_ROOM_START_COL + ROOM_COLUMN_STEP * 0,
    topRow: REVIEW_ROOM_TOP_ROWS[0],
    kind: 'cell',
  },
  {
    roomId: 'architect_review_cell',
    role: 'architect',
    team: 'review',
    topCol: REVIEW_ROOM_START_COL + ROOM_COLUMN_STEP * 1,
    topRow: REVIEW_ROOM_TOP_ROWS[0],
    kind: 'cell',
  },
  {
    roomId: 'sm_review_cell',
    role: 'sm',
    team: 'review',
    topCol: REVIEW_ROOM_START_COL + ROOM_COLUMN_STEP * 2,
    topRow: REVIEW_ROOM_TOP_ROWS[0],
    kind: 'cell',
  },
  {
    roomId: 'dev_review_cell',
    role: 'dev',
    team: 'review',
    topCol: REVIEW_ROOM_START_COL + ROOM_COLUMN_STEP * 0,
    topRow: REVIEW_ROOM_TOP_ROWS[1],
    kind: 'cell',
  },
  {
    roomId: 'qa_review_cell',
    role: 'qa',
    team: 'review',
    topCol: REVIEW_ROOM_START_COL + ROOM_COLUMN_STEP * 1,
    topRow: REVIEW_ROOM_TOP_ROWS[1],
    kind: 'cell',
  },
  {
    roomId: 'devops_review_cell',
    role: 'devops',
    team: 'review',
    topCol: REVIEW_ROOM_START_COL + ROOM_COLUMN_STEP * 2,
    topRow: REVIEW_ROOM_TOP_ROWS[1],
    kind: 'cell',
  },
];

/** Convert flat tile array from layout into 2D grid */
export function layoutToTileMap(layout: OfficeLayout): TileTypeVal[][] {
  const map: TileTypeVal[][] = [];
  for (let r = 0; r < layout.rows; r++) {
    const row: TileTypeVal[] = [];
    for (let c = 0; c < layout.cols; c++) {
      row.push(layout.tiles[r * layout.cols + c]);
    }
    map.push(row);
  }
  return map;
}

/** Convert placed furniture into renderable FurnitureInstance[] */
export function layoutToFurnitureInstances(furniture: PlacedFurniture[]): FurnitureInstance[] {
  // Pre-compute desk zY per tile so surface items can sort in front of desks
  const deskZByTile = new Map<string, number>();
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry || !entry.isDesk) continue;
    const deskZY = item.row * TILE_SIZE + entry.sprite.length;
    for (let dr = 0; dr < entry.footprintH; dr++) {
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`;
        const prev = deskZByTile.get(key);
        if (prev === undefined || deskZY > prev) deskZByTile.set(key, deskZY);
      }
    }
  }

  const instances: FurnitureInstance[] = [];
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry) continue;
    const x = item.col * TILE_SIZE;
    const y = item.row * TILE_SIZE;
    const spriteH = entry.sprite.length;
    let zY = y + spriteH;

    // Chair z-sorting: ensure characters sitting on chairs render correctly
    if (entry.category === 'chairs') {
      if (entry.orientation === 'back') {
        // Back-facing chairs render IN FRONT of the seated character
        // (the chair back visually occludes the character behind it)
        zY = (item.row + 1) * TILE_SIZE + 1;
      } else {
        // All other chairs: cap zY to first row bottom so characters
        // at any seat tile render in front of the chair
        zY = (item.row + 1) * TILE_SIZE;
      }
    }

    // Surface items render in front of the desk they sit on
    if (entry.canPlaceOnSurfaces) {
      for (let dr = 0; dr < entry.footprintH; dr++) {
        for (let dc = 0; dc < entry.footprintW; dc++) {
          const deskZ = deskZByTile.get(`${item.col + dc},${item.row + dr}`);
          if (deskZ !== undefined && deskZ + 0.5 > zY) zY = deskZ + 0.5;
        }
      }
    }

    // Colorize sprite if this furniture has a color override
    let sprite = entry.sprite;
    if (item.color) {
      const { h, s, b: bv, c: cv } = item.color;
      sprite = getColorizedSprite(
        `furn-${item.type}-${h}-${s}-${bv}-${cv}-${item.color.colorize ? 1 : 0}`,
        entry.sprite,
        item.color,
      );
    }

    // Determine if this instance should be mirrored (side asset used in "left" orientation)
    let mirrored = false;
    if (entry.mirrorSide) {
      const orientInGroup = getOrientationInGroup(item.type);
      if (orientInGroup === 'left') {
        mirrored = true;
      }
    }

    instances.push({ sprite, x, y, zY, ...(mirrored ? { mirrored: true } : {}) });
  }
  return instances;
}

/** Get all tiles blocked by furniture footprints, optionally excluding a set of tiles.
 *  Skips top backgroundTiles rows so characters can walk through them. */
export function getBlockedTiles(
  furniture: PlacedFurniture[],
  excludeTiles?: Set<string>,
): Set<string> {
  const tiles = new Set<string>();
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry) continue;
    const bgRows = entry.backgroundTiles || 0;
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue; // skip background rows — characters can walk through
      for (let dc = 0; dc < entry.footprintW; dc++) {
        const key = `${item.col + dc},${item.row + dr}`;
        if (excludeTiles && excludeTiles.has(key)) continue;
        tiles.add(key);
      }
    }
  }
  return tiles;
}

/** Get tiles blocked for placement purposes — skips top backgroundTiles rows per item */
export function getPlacementBlockedTiles(
  furniture: PlacedFurniture[],
  excludeUid?: string,
): Set<string> {
  const tiles = new Set<string>();
  for (const item of furniture) {
    if (item.uid === excludeUid) continue;
    const entry = getCatalogEntry(item.type);
    if (!entry) continue;
    const bgRows = entry.backgroundTiles || 0;
    for (let dr = 0; dr < entry.footprintH; dr++) {
      if (dr < bgRows) continue; // skip background rows
      for (let dc = 0; dc < entry.footprintW; dc++) {
        tiles.add(`${item.col + dc},${item.row + dr}`);
      }
    }
  }
  return tiles;
}

/** Map chair orientation to character facing direction */
function orientationToFacing(orientation: string): Direction {
  switch (orientation) {
    case 'front':
      return Direction.DOWN;
    case 'back':
      return Direction.UP;
    case 'left':
      return Direction.LEFT;
    case 'right':
    case 'side':
      return Direction.RIGHT;
    default:
      return Direction.DOWN;
  }
}

function addFootprintTiles(
  tiles: Set<string>,
  item: PlacedFurniture,
  footprintW: number,
  footprintH: number,
): void {
  for (let dr = 0; dr < footprintH; dr++) {
    for (let dc = 0; dc < footprintW; dc++) {
      tiles.add(`${item.col + dc},${item.row + dr}`);
    }
  }
}

function hasNearbyTile(tileCol: number, tileRow: number, tiles: Set<string>, radius: number): boolean {
  for (let dr = -radius; dr <= radius; dr++) {
    for (let dc = -radius; dc <= radius; dc++) {
      if (tiles.has(`${tileCol + dc},${tileRow + dr}`)) {
        return true;
      }
    }
  }
  return false;
}

function inferSeatZone(
  item: PlacedFurniture,
  tileCol: number,
  tileRow: number,
  deskTiles: Set<string>,
  electronicsTiles: Set<string>,
  meetingCueTiles: Set<string>,
): 'work' | 'meeting' {
  const normalizedType = item.type.toUpperCase();
  if (normalizedType.startsWith('SOFA')) {
    return 'meeting';
  }

  const nearElectronics = hasNearbyTile(tileCol, tileRow, electronicsTiles, 2);
  const nearDesk = hasNearbyTile(tileCol, tileRow, deskTiles, 1);
  const nearMeetingCue = hasNearbyTile(tileCol, tileRow, meetingCueTiles, 2);

  if (nearElectronics || nearDesk) {
    return 'work';
  }

  if (nearMeetingCue) {
    return 'meeting';
  }

  return 'work';
}

function buildSeatMetaUid(
  roomId: string,
  zone: 'work' | 'meeting',
  suffix: string,
): string {
  return `${SEAT_META_PREFIX}${roomId}::${zone}::${suffix}`;
}

function parseSeatMetaUid(
  uid: string,
): { roomId: string | null; zone: 'work' | 'meeting' | null } {
  if (!uid.startsWith(SEAT_META_PREFIX)) {
    return { roomId: null, zone: null };
  }

  const payload = uid.slice(SEAT_META_PREFIX.length);
  const [roomId = '', zone = ''] = payload.split('::', 3);
  const normalizedZone = zone === 'meeting' || zone === 'work' ? zone : null;
  return {
    roomId: roomId || null,
    zone: normalizedZone,
  };
}

function resolveSeatTeamAndFloor(
  roomId: string | null,
  tileRow: number,
): { team?: 'primary' | 'review'; floor?: 1 | 2 } {
  if (roomId) {
    if (roomId.includes('_review_')) {
      return { team: 'review', floor: 2 };
    }
    return { team: 'primary', floor: 1 };
  }

  return tileRow >= SECOND_FLOOR_ROW_START
    ? { team: 'review', floor: 2 }
    : { team: 'primary', floor: 1 };
}

function getChairSeatOffsets(
  footprintW: number,
  footprintH: number,
  backgroundTiles = 0,
): Array<{ dc: number; dr: number }> {
  const offsets: Array<{ dc: number; dr: number }> = [];
  const startRow = Math.min(Math.max(backgroundTiles, 0), footprintH - 1);

  for (let dr = startRow; dr < footprintH; dr++) {
    for (let dc = 0; dc < footprintW; dc++) {
      offsets.push({ dc, dr });
    }
  }

  if (offsets.length > 0) {
    return offsets;
  }

  // Fallback for malformed assets: if all rows were marked as background,
  // still expose at least one seat instead of dropping the furniture entirely.
  for (let dc = 0; dc < footprintW; dc++) {
    offsets.push({ dc, dr: footprintH - 1 });
  }
  return offsets;
}

/** Generate seats from chair furniture.
 *  Facing priority: 1) chair orientation, 2) adjacent desk, 3) forward (DOWN). */
export function layoutToSeats(furniture: PlacedFurniture[]): Map<string, Seat> {
  const seats = new Map<string, Seat>();

  // Build lookup sets used to infer seat intent from the surrounding furniture.
  const deskTiles = new Set<string>();
  const electronicsTiles = new Set<string>();
  const meetingCueTiles = new Set<string>();
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry) continue;

    if (entry.isDesk) {
      addFootprintTiles(deskTiles, item, entry.footprintW, entry.footprintH);
    }

    if (entry.category === 'electronics') {
      addFootprintTiles(electronicsTiles, item, entry.footprintW, entry.footprintH);
    }

    const normalizedType = item.type.toUpperCase();
    const isMeetingCue =
      normalizedType.startsWith('SOFA') ||
      normalizedType.includes('WHITEBOARD') ||
      normalizedType.includes('COFFEE_TABLE') ||
      normalizedType.includes('SMALL_TABLE') ||
      normalizedType.includes('TABLE_');
    if (isMeetingCue) {
      addFootprintTiles(meetingCueTiles, item, entry.footprintW, entry.footprintH);
    }
  }

  const dirs: Array<{ dc: number; dr: number; facing: Direction }> = [
    { dc: 0, dr: -1, facing: Direction.UP }, // desk is above chair → face UP
    { dc: 0, dr: 1, facing: Direction.DOWN }, // desk is below chair → face DOWN
    { dc: -1, dr: 0, facing: Direction.LEFT }, // desk is left of chair → face LEFT
    { dc: 1, dr: 0, facing: Direction.RIGHT }, // desk is right of chair → face RIGHT
  ];

  // For each chair, only the actual seating surface becomes a seat.
  // Tall chairs use their non-background rows, while sofas/couches keep
  // multi-seat footprints on the occupied surface.
  for (const item of furniture) {
    const entry = getCatalogEntry(item.type);
    if (!entry || entry.category !== 'chairs') continue;

    let seatCount = 0;
    const seatOffsets = getChairSeatOffsets(
      entry.footprintW,
      entry.footprintH,
      entry.backgroundTiles || 0,
    );
    for (const { dc, dr } of seatOffsets) {
      const tileCol = item.col + dc;
      const tileRow = item.row + dr;
      const seatMeta = parseSeatMetaUid(item.uid);

      // Determine facing direction:
      // 1) Chair orientation takes priority
      // 2) Adjacent desk direction
      // 3) Default forward (DOWN)
      let facingDir: Direction = Direction.DOWN;
      if (entry.orientation) {
        facingDir = orientationToFacing(entry.orientation);
      } else {
        for (const d of dirs) {
          if (deskTiles.has(`${tileCol + d.dc},${tileRow + d.dr}`)) {
            facingDir = d.facing;
            break;
          }
        }
      }

      // First seat uses chair uid (backward compat), subsequent use uid:N
      const seatUid = seatCount === 0 ? item.uid : `${item.uid}:${seatCount}`;
      const seatZone =
        seatMeta.zone
        || inferSeatZone(item, tileCol, tileRow, deskTiles, electronicsTiles, meetingCueTiles);
      const seatAffinity = resolveSeatTeamAndFloor(seatMeta.roomId, tileRow);
      seats.set(seatUid, {
        uid: seatUid,
        seatCol: tileCol,
        seatRow: tileRow,
        facingDir,
        zone: seatZone,
        team: seatAffinity.team,
        floor: seatAffinity.floor,
        roomId: seatMeta.roomId,
        assigned: false,
      });
      seatCount++;
    }
  }

  return seats;
}

/** Get the set of tiles occupied by seats (so they can be excluded from blocked tiles) */
export function getSeatTiles(seats: Map<string, Seat>): Set<string> {
  const tiles = new Set<string>();
  for (const seat of seats.values()) {
    tiles.add(`${seat.seatCol},${seat.seatRow}`);
  }
  return tiles;
}

/** Default floor colors for the two rooms */
const DEFAULT_LEFT_ROOM_COLOR: FloorColor = { h: 35, s: 30, b: 15, c: 0 }; // warm beige
const DEFAULT_RIGHT_ROOM_COLOR: FloorColor = { h: 25, s: 45, b: 5, c: 10 }; // warm brown

function setLayoutTile(
  tiles: TileTypeVal[],
  tileColors: Array<FloorColor | null>,
  layoutCols: number,
  layoutRows: number,
  col: number,
  row: number,
  tile: TileTypeVal,
  color: FloorColor | null,
): void {
  if (col < 0 || col >= layoutCols || row < 0 || row >= layoutRows) {
    return;
  }
  const index = row * layoutCols + col;
  tiles[index] = tile;
  tileColors[index] = color;
}

function fillRectTiles(
  tiles: TileTypeVal[],
  tileColors: Array<FloorColor | null>,
  layoutCols: number,
  layoutRows: number,
  startCol: number,
  startRow: number,
  width: number,
  height: number,
  tile: TileTypeVal,
  color: FloorColor | null,
): void {
  for (let row = startRow; row < startRow + height; row += 1) {
    for (let col = startCol; col < startCol + width; col += 1) {
      setLayoutTile(tiles, tileColors, layoutCols, layoutRows, col, row, tile, color);
    }
  }
}

function buildFurnitureUid(roomId: string, suffix: string): string {
  return `${roomId}__${suffix}`;
}

function addFurnitureItem(
  furniture: PlacedFurniture[],
  roomId: string,
  suffix: string,
  type: string,
  col: number,
  row: number,
): void {
  furniture.push({
    uid: suffix.startsWith(SEAT_META_PREFIX) ? suffix : buildFurnitureUid(roomId, suffix),
    type,
    col,
    row,
  });
}

function getRoomFeatureType(role: CampusRoomSpec['role']): string {
  switch (role) {
    case 'ceo':
      return 'LARGE_PAINTING';
    case 'pm':
    case 'qa':
      return 'WHITEBOARD';
    case 'architect':
    case 'devops':
      return 'DOUBLE_BOOKSHELF';
    case 'sm':
    case 'dev':
    default:
      return 'LARGE_PAINTING';
  }
}

function getRoomAccentDecorType(role: CampusRoomSpec['role']): string {
  switch (role) {
    case 'ceo':
    case 'sm':
      return 'CLOCK';
    case 'architect':
    case 'devops':
      return 'SMALL_PAINTING_2';
    case 'pm':
    case 'qa':
    case 'dev':
    default:
      return 'SMALL_PAINTING';
  }
}

function getRoomVisualTheme(room: CampusRoomSpec): RoomVisualTheme {
  const reviewShift = room.team === 'review';

  switch (room.role) {
    case 'ceo':
      return {
        roomTile: TileType.FLOOR_4,
        roomColor: reviewShift
          ? { h: 208, s: 18, b: -20, c: -20 }
          : { h: 36, s: 34, b: -6, c: -6 },
        deskLaneTile: TileType.FLOOR_2,
        deskLaneColor: reviewShift
          ? { h: 210, s: 12, b: -24, c: -18 }
          : { h: 38, s: 26, b: -12, c: -6 },
        loungeTile: TileType.FLOOR_1,
        loungeColor: reviewShift
          ? { h: 212, s: 16, b: -26, c: -16 }
          : { h: 30, s: 20, b: -10, c: -4 },
        thresholdTile: TileType.FLOOR_5,
        thresholdColor: reviewShift
          ? { h: 196, s: 16, b: -22, c: -10 }
          : { h: 42, s: 24, b: -8, c: -6 },
      };
    case 'pm':
      return {
        roomTile: TileType.FLOOR_1,
        roomColor: reviewShift
          ? { h: 212, s: 26, b: -22, c: -16 }
          : { h: 20, s: 30, b: -14, c: -10 },
        deskLaneTile: TileType.FLOOR_5,
        deskLaneColor: reviewShift
          ? { h: 202, s: 22, b: -28, c: -12 }
          : { h: 12, s: 24, b: -18, c: -10 },
        loungeTile: TileType.FLOOR_4,
        loungeColor: reviewShift
          ? { h: 208, s: 20, b: -18, c: -14 }
          : { h: 24, s: 22, b: -6, c: -8 },
        thresholdTile: TileType.FLOOR_6,
        thresholdColor: reviewShift
          ? { h: 196, s: 18, b: -24, c: -12 }
          : { h: 18, s: 20, b: -12, c: -6 },
      };
    case 'architect':
      return {
        roomTile: TileType.FLOOR_6,
        roomColor: reviewShift
          ? { h: 214, s: 18, b: -18, c: -20 }
          : { h: 208, s: 22, b: -14, c: -16 },
        deskLaneTile: TileType.FLOOR_9,
        deskLaneColor: reviewShift
          ? { h: 208, s: 16, b: -28, c: -16 }
          : { h: 206, s: 18, b: -24, c: -14 },
        loungeTile: TileType.FLOOR_2,
        loungeColor: reviewShift
          ? { h: 210, s: 14, b: -24, c: -16 }
          : { h: 200, s: 18, b: -20, c: -12 },
        thresholdTile: TileType.FLOOR_5,
        thresholdColor: reviewShift
          ? { h: 202, s: 18, b: -20, c: -10 }
          : { h: 194, s: 16, b: -18, c: -8 },
      };
    case 'sm':
      return {
        roomTile: TileType.FLOOR_3,
        roomColor: reviewShift
          ? { h: 198, s: 22, b: -18, c: -18 }
          : { h: 156, s: 22, b: -10, c: -12 },
        deskLaneTile: TileType.FLOOR_5,
        deskLaneColor: reviewShift
          ? { h: 196, s: 20, b: -26, c: -14 }
          : { h: 150, s: 18, b: -18, c: -10 },
        loungeTile: TileType.FLOOR_1,
        loungeColor: reviewShift
          ? { h: 204, s: 18, b: -22, c: -16 }
          : { h: 164, s: 20, b: -12, c: -8 },
        thresholdTile: TileType.FLOOR_6,
        thresholdColor: reviewShift
          ? { h: 190, s: 18, b: -24, c: -12 }
          : { h: 154, s: 18, b: -14, c: -8 },
      };
    case 'qa':
      return {
        roomTile: TileType.FLOOR_8,
        roomColor: reviewShift
          ? { h: 214, s: 14, b: -18, c: -12 }
          : { h: 38, s: 24, b: -6, c: -10 },
        deskLaneTile: TileType.FLOOR_4,
        deskLaneColor: reviewShift
          ? { h: 210, s: 12, b: -24, c: -14 }
          : { h: 42, s: 18, b: -12, c: -8 },
        loungeTile: TileType.FLOOR_1,
        loungeColor: reviewShift
          ? { h: 208, s: 14, b: -22, c: -14 }
          : { h: 34, s: 20, b: -10, c: -6 },
        thresholdTile: TileType.FLOOR_5,
        thresholdColor: reviewShift
          ? { h: 200, s: 16, b: -22, c: -10 }
          : { h: 38, s: 16, b: -12, c: -6 },
      };
    case 'devops':
      return {
        roomTile: TileType.FLOOR_9,
        roomColor: reviewShift
          ? { h: 214, s: 16, b: -24, c: -18 }
          : { h: 206, s: 18, b: -20, c: -18 },
        deskLaneTile: TileType.FLOOR_6,
        deskLaneColor: reviewShift
          ? { h: 208, s: 16, b: -28, c: -14 }
          : { h: 198, s: 16, b: -24, c: -14 },
        loungeTile: TileType.FLOOR_2,
        loungeColor: reviewShift
          ? { h: 212, s: 12, b: -26, c: -16 }
          : { h: 202, s: 16, b: -22, c: -14 },
        thresholdTile: TileType.FLOOR_5,
        thresholdColor: reviewShift
          ? { h: 200, s: 16, b: -24, c: -10 }
          : { h: 194, s: 16, b: -18, c: -10 },
      };
    case 'dev':
    default:
      return {
        roomTile: TileType.FLOOR_7,
        roomColor: reviewShift
          ? { h: 210, s: 18, b: -20, c: -18 }
          : { h: 26, s: 30, b: -18, c: -14 },
        deskLaneTile: TileType.FLOOR_2,
        deskLaneColor: reviewShift
          ? { h: 208, s: 16, b: -26, c: -14 }
          : { h: 22, s: 24, b: -22, c: -12 },
        loungeTile: TileType.FLOOR_4,
        loungeColor: reviewShift
          ? { h: 206, s: 16, b: -22, c: -14 }
          : { h: 30, s: 22, b: -10, c: -8 },
        thresholdTile: TileType.FLOOR_5,
        thresholdColor: reviewShift
          ? { h: 198, s: 16, b: -22, c: -10 }
          : { h: 26, s: 18, b: -14, c: -8 },
      };
  }
}

function paintCampusPromenades(
  tiles: TileTypeVal[],
  tileColors: Array<FloorColor | null>,
): void {
  fillRectTiles(
    tiles,
    tileColors,
    CAMPUS_COLS,
    CAMPUS_ROWS,
    1,
    14,
    CAMPUS_COLS - 2,
    2,
    PRIMARY_HUB_TILE,
    PRIMARY_HUB_COLOR,
  );
  fillRectTiles(
    tiles,
    tileColors,
    CAMPUS_COLS,
    CAMPUS_ROWS,
    1,
    44,
    CAMPUS_COLS - 2,
    2,
    REVIEW_HUB_TILE,
    REVIEW_HUB_COLOR,
  );
  fillRectTiles(
    tiles,
    tileColors,
    CAMPUS_COLS,
    CAMPUS_ROWS,
    26,
    1,
    2,
    CAMPUS_ROWS - 2,
    CAMPUS_SPINE_TILE,
    CAMPUS_SPINE_COLOR,
  );
  fillRectTiles(
    tiles,
    tileColors,
    CAMPUS_COLS,
    CAMPUS_ROWS,
    22,
    27,
    10,
    6,
    CAMPUS_SPINE_TILE,
    { h: 194, s: 14, b: -22, c: -10 },
  );
}

function paintRoomShell(
  tiles: TileTypeVal[],
  tileColors: Array<FloorColor | null>,
  room: CampusRoomSpec,
): void {
  const theme = getRoomVisualTheme(room);
  const rightStripStart = room.topCol + ROOM_SHELL_WIDTH - 2;
  const topDoorCol = room.topCol + Math.floor(ROOM_SHELL_WIDTH / 2);
  const bottomDoorCol = topDoorCol;

  fillRectTiles(
    tiles,
    tileColors,
    CAMPUS_COLS,
    CAMPUS_ROWS,
    room.topCol + 1,
    room.topRow + 1,
    ROOM_SHELL_WIDTH - 2,
    ROOM_SHELL_HEIGHT - 2,
    theme.roomTile,
    theme.roomColor,
  );
  fillRectTiles(
    tiles,
    tileColors,
    CAMPUS_COLS,
    CAMPUS_ROWS,
    room.topCol + 2,
    room.topRow + 2,
    6,
    3,
    theme.deskLaneTile,
    theme.deskLaneColor,
  );
  fillRectTiles(
    tiles,
    tileColors,
    CAMPUS_COLS,
    CAMPUS_ROWS,
    room.topCol + 8,
    room.topRow + 6,
    2,
    4,
    theme.loungeTile,
    theme.loungeColor,
  );
  fillRectTiles(
    tiles,
    tileColors,
    CAMPUS_COLS,
    CAMPUS_ROWS,
    room.topCol + 4,
    room.topRow + 1,
    3,
    2,
    theme.thresholdTile,
    theme.thresholdColor,
  );
  fillRectTiles(
    tiles,
    tileColors,
    CAMPUS_COLS,
    CAMPUS_ROWS,
    rightStripStart,
    room.topRow + 1,
    1,
    ROOM_SHELL_HEIGHT - 2,
    TileType.FLOOR_9,
    DECOR_STRIP_COLOR,
  );

  for (let col = room.topCol; col < room.topCol + ROOM_SHELL_WIDTH; col += 1) {
    const isTopDoor = col === topDoorCol;
    const isBottomDoor = col === bottomDoorCol;
    setLayoutTile(
      tiles,
      tileColors,
      CAMPUS_COLS,
      CAMPUS_ROWS,
      col,
      room.topRow,
      isTopDoor ? CAMPUS_CORRIDOR_TILE : TileType.WALL,
      isTopDoor ? CAMPUS_CORRIDOR_COLOR : null,
    );
    setLayoutTile(
      tiles,
      tileColors,
      CAMPUS_COLS,
      CAMPUS_ROWS,
      col,
      room.topRow + ROOM_SHELL_HEIGHT - 1,
      isBottomDoor ? CAMPUS_CORRIDOR_TILE : TileType.WALL,
      isBottomDoor ? CAMPUS_CORRIDOR_COLOR : null,
    );
  }

  for (let row = room.topRow + 1; row < room.topRow + ROOM_SHELL_HEIGHT - 1; row += 1) {
    setLayoutTile(
      tiles,
      tileColors,
      CAMPUS_COLS,
      CAMPUS_ROWS,
      room.topCol,
      row,
      TileType.WALL,
      null,
    );
    setLayoutTile(
      tiles,
      tileColors,
      CAMPUS_COLS,
      CAMPUS_ROWS,
      room.topCol + ROOM_SHELL_WIDTH - 1,
      row,
      TileType.WALL,
      null,
    );
  }
}

function addRoomDecor(furniture: PlacedFurniture[], room: CampusRoomSpec): void {
  const decorRow = room.topRow - ROOM_DECOR_TOP_OFFSET;
  const featureType = getRoomFeatureType(room.role);
  const accentType = getRoomAccentDecorType(room.role);

  addFurnitureItem(furniture, room.roomId, 'decor-left-plant', 'HANGING_PLANT', room.topCol + 1, decorRow);
  addFurnitureItem(furniture, room.roomId, 'decor-right-plant', 'HANGING_PLANT', room.topCol + 9, decorRow);
  addFurnitureItem(furniture, room.roomId, 'decor-feature', featureType, room.topCol + 4, decorRow);
  addFurnitureItem(furniture, room.roomId, 'decor-accent', accentType, room.topCol + 7, decorRow);
}

function addStandardCellFurniture(furniture: PlacedFurniture[], room: CampusRoomSpec): void {
  const leftDeskCol = room.topCol + 2;
  const rightDeskCol = room.topCol + 6;
  const topDeskRow = room.topRow + 2;
  const sideStationRows = [room.topRow + 6, room.topRow + 8];

  addRoomDecor(furniture, room);

  addFurnitureItem(furniture, room.roomId, 'desk-a', 'DESK_FRONT', leftDeskCol, topDeskRow);
  addFurnitureItem(furniture, room.roomId, 'desk-b', 'DESK_FRONT', rightDeskCol, topDeskRow);
  addFurnitureItem(furniture, room.roomId, 'pc-a', 'PC_FRONT_OFF', leftDeskCol + 1, topDeskRow);
  addFurnitureItem(furniture, room.roomId, 'pc-b', 'PC_FRONT_OFF', rightDeskCol + 1, topDeskRow);

  sideStationRows.forEach((stationRow, index) => {
    addFurnitureItem(furniture, room.roomId, `side-pc-left-${index + 1}`, 'PC_SIDE', room.topCol + 4, stationRow);
    addFurnitureItem(
      furniture,
      room.roomId,
      `side-pc-right-${index + 1}`,
      'PC_SIDE:left',
      room.topCol + 6,
      stationRow,
    );
    addFurnitureItem(
      furniture,
      room.roomId,
      buildSeatMetaUid(room.roomId, 'work', `work-left-${index + 1}`),
      'WOODEN_CHAIR_SIDE',
      room.topCol + 3,
      stationRow,
    );
    addFurnitureItem(
      furniture,
      room.roomId,
      buildSeatMetaUid(room.roomId, 'work', `work-right-${index + 1}`),
      'WOODEN_CHAIR_SIDE:left',
      room.topCol + 7,
      stationRow,
    );
  });

  addFurnitureItem(
    furniture,
    room.roomId,
    buildSeatMetaUid(room.roomId, 'work', 'work-front-left'),
    'CUSHIONED_CHAIR_BACK',
    leftDeskCol + 1,
    room.topRow + 4,
  );
  addFurnitureItem(
    furniture,
    room.roomId,
    buildSeatMetaUid(room.roomId, 'work', 'work-front-right'),
    'CUSHIONED_CHAIR_BACK',
    rightDeskCol + 1,
    room.topRow + 4,
  );

  addFurnitureItem(furniture, room.roomId, 'corner-pc', 'PC_SIDE:left', room.topCol + 1, room.topRow + 8);
  addFurnitureItem(
    furniture,
    room.roomId,
    buildSeatMetaUid(room.roomId, 'work', 'work-corner'),
    'WOODEN_CHAIR_SIDE:left',
    room.topCol + 2,
    room.topRow + 8,
  );
  addFurnitureItem(
    furniture,
    room.roomId,
    buildSeatMetaUid(room.roomId, 'meeting', 'meeting-bench'),
    'CUSHIONED_BENCH',
    room.topCol + 9,
    room.topRow + 7,
  );
  addFurnitureItem(furniture, room.roomId, 'corner-plant', 'PLANT_2', room.topCol + 9, room.topRow + 9);
}

function addCeoCommandFurniture(furniture: PlacedFurniture[], room: CampusRoomSpec): void {
  addRoomDecor(furniture, room);
  addFurnitureItem(furniture, room.roomId, 'desk-main', 'DESK_FRONT', room.topCol + 3, room.topRow + 2);
  addFurnitureItem(furniture, room.roomId, 'pc-main', 'PC_FRONT_OFF', room.topCol + 4, room.topRow + 2);
  addFurnitureItem(
    furniture,
    room.roomId,
    buildSeatMetaUid(room.roomId, 'work', 'ceo-desk'),
    'CUSHIONED_CHAIR_BACK',
    room.topCol + 4,
    room.topRow + 4,
  );
  addFurnitureItem(
    furniture,
    room.roomId,
    buildSeatMetaUid(room.roomId, 'meeting', 'ceo-sofa'),
    'SOFA_FRONT',
    room.topCol + 7,
    room.topRow + 8,
  );
  addFurnitureItem(furniture, room.roomId, 'ceo-table', 'COFFEE_TABLE', room.topCol + 7, room.topRow + 9);
  addFurnitureItem(furniture, room.roomId, 'ceo-plant', 'PLANT', room.topCol + 9, room.topRow + 5);
  addFurnitureItem(furniture, room.roomId, 'ceo-side-table', 'SMALL_TABLE_SIDE', room.topCol + 1, room.topRow + 8);
}

export function createRoleCellCampusLayout(): OfficeLayout {
  const tiles = new Array<TileTypeVal>(CAMPUS_COLS * CAMPUS_ROWS).fill(TileType.VOID);
  const tileColors = new Array<FloorColor | null>(CAMPUS_COLS * CAMPUS_ROWS).fill(null);
  const furniture: PlacedFurniture[] = [];

  fillRectTiles(
    tiles,
    tileColors,
    CAMPUS_COLS,
    CAMPUS_ROWS,
    1,
    1,
    CAMPUS_COLS - 2,
    CAMPUS_ROWS - 2,
    CAMPUS_CORRIDOR_TILE,
    CAMPUS_CORRIDOR_COLOR,
  );
  paintCampusPromenades(tiles, tileColors);

  for (const room of CAMPUS_ROOM_SPECS) {
    paintRoomShell(tiles, tileColors, room);
    if (room.kind === 'ceo') {
      addCeoCommandFurniture(furniture, room);
    } else {
      addStandardCellFurniture(furniture, room);
    }
  }

  return {
    version: 1,
    cols: CAMPUS_COLS,
    rows: CAMPUS_ROWS,
    tiles,
    tileColors,
    furniture,
    layoutRevision: ROLE_CELL_LAYOUT_REVISION,
  };
}

/** Create a minimal fallback layout (used only when no default-layout.json exists) */
export function createDefaultLayout(): OfficeLayout {
  const W = TileType.WALL;
  const F1 = TileType.FLOOR_1;
  const F2 = TileType.FLOOR_2;

  const tiles: TileTypeVal[] = [];
  const tileColors: Array<FloorColor | null> = [];

  for (let r = 0; r < DEFAULT_ROWS; r++) {
    for (let c = 0; c < DEFAULT_COLS; c++) {
      if (r === 0 || r === DEFAULT_ROWS - 1 || c === 0 || c === DEFAULT_COLS - 1) {
        tiles.push(W);
        tileColors.push(null);
      } else if (c < 10) {
        tiles.push(F1);
        tileColors.push(DEFAULT_LEFT_ROOM_COLOR);
      } else {
        tiles.push(F2);
        tileColors.push(DEFAULT_RIGHT_ROOM_COLOR);
      }
    }
  }

  // Minimal fallback with no furniture — the default-layout.json provides the real default
  return { version: 1, cols: DEFAULT_COLS, rows: DEFAULT_ROWS, tiles, tileColors, furniture: [] };
}

/** Serialize layout to JSON string */
export function serializeLayout(layout: OfficeLayout): string {
  return JSON.stringify(layout);
}

// ── Furniture type migration ────────────────────────────────────

/** Map old hardcoded FurnitureType values to new manifest-based IDs */
const LEGACY_TYPE_MAP: Record<string, string | null> = {
  desk: 'DESK_FRONT',
  chair: 'WOODEN_CHAIR_FRONT',
  bookshelf: 'BOOKSHELF',
  plant: 'PLANT',
  cooler: null, // no equivalent in new assets — remove
  whiteboard: 'WHITEBOARD',
  pc: 'PC_FRONT_OFF',
  lamp: null, // no equivalent in new assets — remove
};

/** Migrate old furniture type strings to new manifest IDs */
function migrateFurnitureTypes(furniture: PlacedFurniture[]): PlacedFurniture[] {
  const migrated: PlacedFurniture[] = [];
  for (const item of furniture) {
    const newType = LEGACY_TYPE_MAP[item.type];
    if (newType === undefined) {
      // Not a legacy type — keep as-is
      migrated.push(item);
    } else if (newType !== null) {
      // Migrate to new type
      migrated.push({ ...item, type: newType });
    }
    // newType === null → remove the item (no equivalent)
  }
  return migrated;
}

/** Deserialize layout from JSON string, migrating old tile types if needed */
export function deserializeLayout(json: string): OfficeLayout | null {
  try {
    const obj = JSON.parse(json);
    if (obj && obj.version === 1 && Array.isArray(obj.tiles) && Array.isArray(obj.furniture)) {
      return migrateLayout(obj as OfficeLayout);
    }
  } catch {
    /* ignore parse errors */
  }
  return null;
}

/**
 * Ensure layout has tileColors. If missing, generate defaults based on tile types.
 * Exported for use by message handlers that receive layouts over the wire.
 */
export function migrateLayoutColors(layout: OfficeLayout): OfficeLayout {
  return migrateLayout(layout);
}

function isExpandedDualFloorLayout(layout: OfficeLayout): boolean {
  return (
    layout.rows >= SECOND_FLOOR_ROW_START * 2 ||
    layout.furniture.some((item) => String(item.uid || '').startsWith(SECOND_FLOOR_UID_PREFIX))
  );
}

function expandLayoutToDualFloor(layout: OfficeLayout): OfficeLayout {
  const tileColors = layout.tileColors || new Array(layout.tiles.length).fill(null);
  const duplicatedFurniture = layout.furniture.map((item) => ({
    ...item,
    uid: `${SECOND_FLOOR_UID_PREFIX}${item.uid}`,
    row: item.row + layout.rows,
  }));

  return {
    ...layout,
    rows: layout.rows * 2,
    tiles: [...layout.tiles, ...layout.tiles],
    tileColors: [...tileColors, ...tileColors],
    furniture: [...layout.furniture, ...duplicatedFurniture],
    layoutRevision: DUAL_FLOOR_LAYOUT_REVISION,
  };
}

/**
 * Migrate old layouts that use legacy tile types (TILE_FLOOR=1, WOOD_FLOOR=2, CARPET=3, DOORWAY=4)
 * to the new pattern-based system. Also migrates old furniture type strings and old VOID value.
 */
function migrateLayout(layout: OfficeLayout): OfficeLayout {
  // Migrate furniture types
  layout = { ...layout, furniture: migrateFurnitureTypes(layout.furniture) };

  // Migrate old VOID value (was 8, now 255) — only for legacy layouts since FLOOR_8 reuses value 8
  const OLD_VOID = 8;
  if (!layout.layoutRevision && layout.tiles.includes(OLD_VOID as TileTypeVal)) {
    layout = {
      ...layout,
      tiles: layout.tiles.map((t) => (t === OLD_VOID ? (TileType.VOID as TileTypeVal) : t)),
    };
  }

  if ((layout.layoutRevision || 0) < ROLE_CELL_LAYOUT_REVISION) {
    return createRoleCellCampusLayout();
  }

  if (!layout.tileColors || layout.tileColors.length !== layout.tiles.length) {
    // Check if any tiles use old values (1-4) — these map directly to FLOOR_1-4
    // but need color assignments
    const tileColors: Array<FloorColor | null> = [];
    for (const tile of layout.tiles) {
      switch (tile) {
        case 0: // WALL
          tileColors.push(null);
          break;
        case 1: // was TILE_FLOOR → FLOOR_1 beige
          tileColors.push(DEFAULT_LEFT_ROOM_COLOR);
          break;
        case 2: // was WOOD_FLOOR → FLOOR_2 brown
          tileColors.push(DEFAULT_RIGHT_ROOM_COLOR);
          break;
        case 3: // was CARPET → FLOOR_3 purple
          tileColors.push({ h: 280, s: 40, b: -5, c: 0 });
          break;
        case 4: // was DOORWAY → FLOOR_4 tan
          tileColors.push({ h: 35, s: 25, b: 10, c: 0 });
          break;
        default:
          // Floor tile types without colors — use neutral gray
          tileColors.push(tile > 0 && tile !== TileType.VOID ? { h: 0, s: 0, b: 0, c: 0 } : null);
      }
    }

    layout = { ...layout, tileColors };
  }

  if ((layout.layoutRevision || 0) < DUAL_FLOOR_LAYOUT_REVISION && !isExpandedDualFloorLayout(layout)) {
    layout = expandLayoutToDualFloor(layout);
  } else if ((layout.layoutRevision || 0) < DUAL_FLOOR_LAYOUT_REVISION) {
    layout = { ...layout, layoutRevision: DUAL_FLOOR_LAYOUT_REVISION };
  }

  return layout;
}
