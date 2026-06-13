// Room Layouts — Tile maps, furniture positions, and character slots for each theme
// Rooms are 16 cols × 10 rows at 32px tiles = 512×320 px viewport

const ROOM_COLS = 16;
const ROOM_ROWS = 10;
const TILE = 32;

// Place name → { floorTiles[], wallTiles[], furniture: [{type, x, y, w, h}], slots: [{x, y}] }

const MEDIEVAL_ROOMS = {
  '广场': {
    floor: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,2,2,0,0],
      [0,1,1,1,1,1,1,1,2,2,2,2,2,2,1,0],
      [1,1,1,1,1,2,2,2,2,2,2,2,2,2,1,1],
      [1,1,1,2,2,2,2,2,2,2,3,3,3,3,1,1],
      [1,1,2,2,2,2,2,2,3,3,3,3,3,3,1,1],
      [1,2,2,2,2,2,3,3,3,3,3,3,3,3,2,1],
      [2,2,2,2,3,3,3,3,3,3,3,3,3,3,2,2],
      [2,2,2,3,3,3,3,3,3,3,3,3,3,3,2,2],
    ],
    furniture: [
      { type: 'lantern', x: 14, y: 4, w: 12, h: 16 },   // Top right lantern
      { type: 'lantern', x: 2, y: 4, w: 12, h: 16 },     // Top left lantern
      { type: 'barrel', x: 2, y: 25, w: 16, h: 20 },     // Bottom left barrel
      { type: 'barrel', x: 18, y: 24, w: 16, h: 20 },    // Bottom right barrel
      { type: 'plant', x: 100, y: 55, w: 20, h: 24 },    // Center plant
    ],
    slots: [
      { x: 60, y: 20 }, { x: 144, y: 24 }, { x: 220, y: 28 },
      { x: 300, y: 24 }, { x: 380, y: 36 },
    ],
  },
  '农场': {
    floor: [
      [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
      [0,0,1,1,1,1,1,2,2,2,1,1,1,1,0,0],
      [0,1,1,1,1,2,2,2,2,2,2,2,1,1,1,0],
      [1,1,1,1,2,2,2,2,2,3,3,2,2,1,1,1],
      [1,1,1,2,2,2,2,3,3,3,3,3,2,2,1,1],
      [1,1,2,2,2,2,3,3,3,3,3,3,2,2,1,1],
      [1,1,2,2,2,3,3,3,3,3,3,3,2,2,1,1],
      [1,1,2,2,2,3,3,3,3,3,3,3,2,2,1,1],
      [1,2,2,2,2,3,3,3,3,3,3,3,2,2,2,1],
      [2,2,2,2,3,3,3,3,3,3,3,3,2,2,2,2],
    ],
    furniture: [
      { type: 'barrel', x: 10, y: 40, w: 18, h: 22 },
      { type: 'barrel', x: 30, y: 42, w: 16, h: 20 },
      { type: 'plant', x: 380, y: 35, w: 22, h: 26 },
      { type: 'plant', x: 420, y: 38, w: 22, h: 26 },
      { type: 'lantern', x: 250, y: 8, w: 12, h: 16 },
    ],
    slots: [
      { x: 80, y: 30 }, { x: 180, y: 35 }, { x: 300, y: 38 },
      { x: 160, y: 42 }, { x: 260, y: 44 },
    ],
  },
  '医院': {
    floor: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,2,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,2,2,2,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,2,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    ],
    furniture: [
      { type: 'bed', x: 20, y: 30, w: 40, h: 30 },
      { type: 'bed', x: 380, y: 30, w: 40, h: 30 },
      { type: 'table', x: 160, y: 32, w: 36, h: 24 },
      { type: 'chair', x: 170, y: 50, w: 16, h: 22 },
      { type: 'plant', x: 440, y: 70, w: 18, h: 22 },
    ],
    slots: [
      { x: 100, y: 38 }, { x: 210, y: 42 }, { x: 320, y: 38 },
      { x: 260, y: 30 }, { x: 140, y: 28 },
    ],
  },
  '画室': {
    floor: [
      [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [1,1,1,1,1,2,1,1,1,1,2,1,1,1,1,1],
      [1,1,1,1,2,2,2,1,1,2,2,2,1,1,1,1],
      [1,1,1,1,1,2,1,1,1,1,2,1,1,1,1,1],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,1,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
    ],
    furniture: [
      { type: 'table', x: 140, y: 40, w: 40, h: 28 },
      { type: 'chair', x: 150, y: 60, w: 18, h: 24 },
      { type: 'plant', x: 20, y: 40, w: 20, h: 24 },
      { type: 'plant', x: 400, y: 42, w: 20, h: 24 },
    ],
    slots: [
      { x: 60, y: 38 }, { x: 200, y: 42 }, { x: 340, y: 38 },
      { x: 270, y: 50 }, { x: 120, y: 50 },
    ],
  },
  '酒馆': {
    floor: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
      [0,0,1,1,1,1,1,2,2,2,1,1,1,1,0,0],
      [0,1,1,1,1,2,2,2,2,2,2,2,1,1,1,0],
      [0,1,1,1,2,2,2,2,2,2,2,2,2,1,1,0],
      [0,1,1,2,2,2,2,2,2,2,2,2,2,1,1,0],
      [0,1,1,2,2,2,2,2,2,2,2,2,2,1,1,0],
      [0,1,1,1,2,2,2,2,2,2,2,2,1,1,1,0],
      [0,0,1,1,1,2,2,2,2,2,2,1,1,1,0,0],
      [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
    ],
    furniture: [
      { type: 'counter', x: 60, y: 40, w: 60, h: 30 },
      { type: 'barrel', x: 10, y: 42, w: 18, h: 22 },
      { type: 'barrel', x: 30, y: 44, w: 16, h: 20 },
      { type: 'table', x: 260, y: 50, w: 34, h: 22 },
      { type: 'chair', x: 270, y: 64, w: 14, h: 20 },
      { type: 'lantern', x: 420, y: 6, w: 12, h: 16 },
    ],
    slots: [
      { x: 160, y: 42 }, { x: 240, y: 46 }, { x: 340, y: 42 },
      { x: 200, y: 34 }, { x: 310, y: 50 },
    ],
  },
  '民居': {
    floor: [
      [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0,0],
      [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
      [0,0,0,1,1,1,1,1,1,1,1,1,1,0,0,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,1,1,1,1,1,1,1,2,1,1,1,1,1,1,0],
      [0,1,1,1,1,1,2,2,2,2,2,1,1,1,1,0],
      [0,1,1,1,1,1,1,2,2,2,1,1,1,1,1,0],
      [0,1,1,1,1,1,1,1,2,1,1,1,1,1,1,0],
      [0,0,1,1,1,1,1,1,1,1,1,1,1,1,0,0],
      [0,0,0,0,1,1,1,1,1,1,1,1,0,0,0,0],
    ],
    furniture: [
      { type: 'bed', x: 20, y: 28, w: 36, h: 28 },
      { type: 'table', x: 350, y: 36, w: 30, h: 22 },
      { type: 'chair', x: 360, y: 52, w: 14, h: 20 },
      { type: 'plant', x: 420, y: 60, w: 18, h: 22 },
      { type: 'lantern', x: 200, y: 10, w: 10, h: 14 },
    ],
    slots: [
      { x: 100, y: 44 }, { x: 260, y: 48 }, { x: 200, y: 38 },
      { x: 160, y: 34 }, { x: 310, y: 42 },
    ],
  },
};

// Space station rooms
const SPACE_ROOMS = {
  '指挥舱': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(1)),
    furniture: [
      { type: 'console', x: 40, y: 30, w: 50, h: 30 },
      { type: 'console', x: 100, y: 30, w: 40, h: 30 },
      { type: 'hologram', x: 300, y: 36, w: 30, h: 34 },
      { type: 'chair', x: 55, y: 52, w: 16, h: 22 },
      { type: 'chair', x: 112, y: 52, w: 16, h: 22 },
    ],
    slots: [
      { x: 200, y: 40 }, { x: 280, y: 44 }, { x: 160, y: 36 },
      { x: 360, y: 40 }, { x: 80, y: 32 },
    ],
  },
  '实验室': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(0)),
    furniture: [
      { type: 'console', x: 20, y: 26, w: 44, h: 28 },
      { type: 'console', x: 80, y: 26, w: 44, h: 28 },
      { type: 'hologram', x: 260, y: 34, w: 28, h: 32 },
      { type: 'plant', x: 400, y: 50, w: 22, h: 24 },
    ],
    slots: [
      { x: 180, y: 38 }, { x: 320, y: 42 }, { x: 140, y: 34 },
      { x: 240, y: 30 }, { x: 60, y: 34 },
    ],
  },
  '生态舱': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(2)),
    furniture: [
      { type: 'plant', x: 30, y: 28, w: 28, h: 30 },
      { type: 'plant', x: 75, y: 26, w: 26, h: 28 },
      { type: 'plant', x: 120, y: 30, w: 24, h: 26 },
      { type: 'plant', x: 380, y: 28, w: 28, h: 30 },
      { type: 'plant', x: 430, y: 32, w: 26, h: 28 },
      { type: 'console', x: 320, y: 60, w: 36, h: 20 },
    ],
    slots: [
      { x: 200, y: 40 }, { x: 280, y: 44 }, { x: 160, y: 50 },
      { x: 340, y: 38 }, { x: 100, y: 46 },
    ],
  },
  '生活区': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(1)),
    furniture: [
      { type: 'bed', x: 20, y: 24, w: 36, h: 26 },
      { type: 'bed', x: 70, y: 24, w: 36, h: 26 },
      { type: 'table', x: 350, y: 36, w: 32, h: 22 },
      { type: 'chair', x: 360, y: 50, w: 14, h: 20 },
      { type: 'plant', x: 420, y: 54, w: 18, h: 22 },
    ],
    slots: [
      { x: 200, y: 42 }, { x: 280, y: 46 }, { x: 160, y: 38 },
      { x: 320, y: 34 }, { x: 120, y: 40 },
    ],
  },
  '引擎室': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(3)),
    furniture: [
      { type: 'console', x: 40, y: 40, w: 50, h: 32 },
      { type: 'console', x: 340, y: 40, w: 46, h: 32 },
      { type: 'hologram', x: 200, y: 44, w: 24, h: 26 },
    ],
    slots: [
      { x: 160, y: 50 }, { x: 280, y: 50 }, { x: 220, y: 38 },
    ],
  },
  '观测台': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(1)),
    furniture: [
      { type: 'console', x: 180, y: 30, w: 48, h: 28 },
      { type: 'hologram', x: 300, y: 40, w: 30, h: 32 },
      { type: 'chair', x: 195, y: 50, w: 16, h: 22 },
    ],
    slots: [
      { x: 60, y: 44 }, { x: 260, y: 40 }, { x: 360, y: 44 },
      { x: 140, y: 50 }, { x: 320, y: 36 },
    ],
  },
};

// Ocean colony rooms
const OCEAN_ROOMS = {
  '中心广场': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(2)),
    furniture: [
      { type: 'coral', x: 20, y: 30, w: 30, h: 32 },
      { type: 'coral', x: 60, y: 28, w: 26, h: 30 },
      { type: 'hologram', x: 250, y: 36, w: 30, h: 32 },
      { type: 'lantern', x: 420, y: 10, w: 12, h: 16 },
      { type: 'plant', x: 380, y: 40, w: 22, h: 26 },
    ],
    slots: [
      { x: 140, y: 40 }, { x: 300, y: 44 }, { x: 200, y: 36 },
      { x: 360, y: 38 }, { x: 80, y: 42 },
    ],
  },
  '生物穹顶': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(1)),
    furniture: [
      { type: 'plant', x: 20, y: 20, w: 28, h: 30 },
      { type: 'plant', x: 60, y: 18, w: 30, h: 32 },
      { type: 'plant', x: 100, y: 22, w: 26, h: 28 },
      { type: 'coral', x: 340, y: 26, w: 32, h: 34 },
      { type: 'coral', x: 400, y: 24, w: 28, h: 32 },
      { type: 'console', x: 280, y: 55, w: 40, h: 22 },
    ],
    slots: [
      { x: 180, y: 40 }, { x: 260, y: 44 }, { x: 140, y: 36 },
      { x: 320, y: 38 }, { x: 220, y: 48 },
    ],
  },
  '医疗站': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(0)),
    furniture: [
      { type: 'bed', x: 20, y: 24, w: 38, h: 28 },
      { type: 'bed', x: 70, y: 24, w: 38, h: 28 },
      { type: 'table', x: 280, y: 30, w: 36, h: 24 },
      { type: 'chair', x: 290, y: 48, w: 16, h: 22 },
      { type: 'plant', x: 420, y: 50, w: 20, h: 24 },
      { type: 'hologram', x: 340, y: 36, w: 24, h: 26 },
    ],
    slots: [
      { x: 160, y: 42 }, { x: 250, y: 38 }, { x: 360, y: 44 },
      { x: 190, y: 36 }, { x: 310, y: 32 },
    ],
  },
  '工程舱': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(3)),
    furniture: [
      { type: 'console', x: 30, y: 36, w: 48, h: 30 },
      { type: 'console', x: 340, y: 36, w: 46, h: 30 },
      { type: 'barrel', x: 180, y: 45, w: 20, h: 24 },
      { type: 'hologram', x: 260, y: 44, w: 26, h: 28 },
    ],
    slots: [
      { x: 140, y: 48 }, { x: 300, y: 48 }, { x: 220, y: 40 },
      { x: 180, y: 36 }, { x: 350, y: 42 },
    ],
  },
  '居住区': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(1)),
    furniture: [
      { type: 'bed', x: 20, y: 22, w: 34, h: 26 },
      { type: 'bed', x: 65, y: 22, w: 34, h: 26 },
      { type: 'table', x: 340, y: 34, w: 32, h: 22 },
      { type: 'chair', x: 348, y: 50, w: 14, h: 20 },
      { type: 'coral', x: 420, y: 52, w: 24, h: 26 },
    ],
    slots: [
      { x: 180, y: 44 }, { x: 270, y: 46 }, { x: 150, y: 38 },
      { x: 310, y: 40 }, { x: 110, y: 42 },
    ],
  },
  '观测台': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(2)),
    furniture: [
      { type: 'console', x: 160, y: 30, w: 50, h: 28 },
      { type: 'hologram', x: 300, y: 40, w: 28, h: 32 },
      { type: 'chair', x: 175, y: 50, w: 16, h: 22 },
      { type: 'plant', x: 30, y: 50, w: 22, h: 24 },
    ],
    slots: [
      { x: 60, y: 44 }, { x: 260, y: 40 }, { x: 370, y: 44 },
      { x: 140, y: 36 }, { x: 330, y: 36 },
    ],
  },
};

// Cyberpunk rooms
const CYBERPUNK_ROOMS = {
  '霓虹广场': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(2)),
    furniture: [
      { type: 'neon_sign', x: 160, y: 4, w: 80, h: 24 },
      { type: 'hologram', x: 320, y: 40, w: 32, h: 34 },
      { type: 'barrel', x: 20, y: 44, w: 18, h: 24 },
      { type: 'console', x: 400, y: 50, w: 40, h: 22 },
      { type: 'lantern', x: 40, y: 8, w: 12, h: 16 },
    ],
    slots: [
      { x: 60, y: 42 }, { x: 200, y: 38 }, { x: 340, y: 42 },
      { x: 150, y: 44 }, { x: 280, y: 36 },
    ],
  },
  '地下诊所': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(0)),
    furniture: [
      { type: 'bed', x: 15, y: 22, w: 36, h: 28 },
      { type: 'bed', x: 60, y: 22, w: 36, h: 28 },
      { type: 'console', x: 250, y: 28, w: 44, h: 26 },
      { type: 'neon_sign', x: 300, y: 2, w: 60, h: 18 },
      { type: 'table', x: 340, y: 50, w: 30, h: 22 },
    ],
    slots: [
      { x: 150, y: 42 }, { x: 310, y: 44 }, { x: 200, y: 38 },
      { x: 120, y: 34 }, { x: 260, y: 32 },
    ],
  },
  '黑市巷': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(3)),
    furniture: [
      { type: 'neon_sign', x: 100, y: 2, w: 70, h: 20 },
      { type: 'counter', x: 30, y: 40, w: 56, h: 28 },
      { type: 'barrel', x: 380, y: 42, w: 20, h: 24 },
      { type: 'hologram', x: 260, y: 38, w: 28, h: 30 },
      { type: 'chair', x: 50, y: 60, w: 16, h: 22 },
    ],
    slots: [
      { x: 160, y: 46 }, { x: 290, y: 42 }, { x: 120, y: 38 },
      { x: 220, y: 40 }, { x: 350, y: 44 },
    ],
  },
  '数据神殿': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(1)),
    furniture: [
      { type: 'console', x: 20, y: 20, w: 50, h: 30 },
      { type: 'console', x: 80, y: 20, w: 50, h: 30 },
      { type: 'console', x: 140, y: 20, w: 44, h: 30 },
      { type: 'hologram', x: 280, y: 36, w: 32, h: 34 },
      { type: 'neon_sign', x: 360, y: 4, w: 50, h: 18 },
    ],
    slots: [
      { x: 240, y: 44 }, { x: 330, y: 40 }, { x: 180, y: 36 },
      { x: 100, y: 42 }, { x: 370, y: 44 },
    ],
  },
  '废铁酒吧': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(2)),
    furniture: [
      { type: 'counter', x: 40, y: 38, w: 60, h: 28 },
      { type: 'barrel', x: 10, y: 42, w: 18, h: 22 },
      { type: 'barrel', x: 30, y: 44, w: 16, h: 20 },
      { type: 'table', x: 260, y: 48, w: 34, h: 22 },
      { type: 'chair', x: 270, y: 62, w: 16, h: 22 },
      { type: 'neon_sign', x: 360, y: 6, w: 60, h: 20 },
      { type: 'lantern', x: 200, y: 10, w: 12, h: 16 },
    ],
    slots: [
      { x: 160, y: 44 }, { x: 300, y: 46 }, { x: 120, y: 36 },
      { x: 230, y: 40 }, { x: 340, y: 42 },
    ],
  },
  '废弃公寓': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(3)),
    furniture: [
      { type: 'bed', x: 20, y: 24, w: 34, h: 26 },
      { type: 'table', x: 320, y: 40, w: 32, h: 22 },
      { type: 'chair', x: 330, y: 56, w: 14, h: 20 },
      { type: 'console', x: 380, y: 28, w: 40, h: 24 },
      { type: 'barrel', x: 160, y: 46, w: 18, h: 22 },
    ],
    slots: [
      { x: 100, y: 44 }, { x: 220, y: 48 }, { x: 260, y: 40 },
      { x: 150, y: 38 }, { x: 310, y: 44 },
    ],
  },
};

// 办公室主题 — 工位/会议室/茶水间/总监办公室/吸烟区/走廊
const OFFICE_ROOMS = {
  '工位区': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(1)),
    furniture: [
      { type: 'desk', x: 30, y: 60, w: 50, h: 28 },
      { type: 'desk', x: 110, y: 60, w: 50, h: 28 },
      { type: 'desk', x: 190, y: 60, w: 50, h: 28 },
      { type: 'desk', x: 270, y: 60, w: 50, h: 28 },
      { type: 'desk', x: 350, y: 60, w: 50, h: 28 },
      { type: 'plant', x: 430, y: 50, w: 22, h: 26 },
      { type: 'printer', x: 430, y: 150, w: 30, h: 24 },
      { type: 'chair', x: 50, y: 100, w: 16, h: 24 },
      { type: 'chair', x: 130, y: 100, w: 16, h: 24 },
      { type: 'chair', x: 210, y: 100, w: 16, h: 24 }
    ],
    slots: [
      { x: 50, y: 100 }, { x: 130, y: 100 }, { x: 210, y: 100 },
      { x: 290, y: 100 }, { x: 370, y: 100 }, { x: 140, y: 180 }, { x: 280, y: 200 }
    ]
  },
  '会议室': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(0)),
    furniture: [
      { type: 'table', x: 120, y: 100, w: 260, h: 60 },
      { type: 'chair', x: 130, y: 80, w: 16, h: 22 },
      { type: 'chair', x: 180, y: 80, w: 16, h: 22 },
      { type: 'chair', x: 230, y: 80, w: 16, h: 22 },
      { type: 'chair', x: 280, y: 80, w: 16, h: 22 },
      { type: 'chair', x: 330, y: 80, w: 16, h: 22 },
      { type: 'chair', x: 130, y: 160, w: 16, h: 22 },
      { type: 'chair', x: 220, y: 160, w: 16, h: 22 },
      { type: 'chair', x: 320, y: 160, w: 16, h: 22 },
      { type: 'whiteboard', x: 180, y: 18, w: 140, h: 40 }
    ],
    slots: [
      { x: 150, y: 90 }, { x: 220, y: 90 }, { x: 290, y: 90 }, { x: 360, y: 90 },
      { x: 150, y: 170 }, { x: 250, y: 170 }, { x: 340, y: 170 }
    ]
  },
  '茶水间': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(2)),
    furniture: [
      { type: 'counter', x: 30, y: 80, w: 200, h: 40 },
      { type: 'cooler', x: 280, y: 60, w: 36, h: 70 },
      { type: 'table', x: 340, y: 130, w: 80, h: 30 },
      { type: 'chair', x: 350, y: 170, w: 16, h: 22 },
      { type: 'chair', x: 400, y: 170, w: 16, h: 22 },
      { type: 'plant', x: 460, y: 60, w: 20, h: 26 }
    ],
    slots: [
      { x: 90, y: 130 }, { x: 180, y: 130 }, { x: 240, y: 130 },
      { x: 360, y: 180 }, { x: 410, y: 180 }, { x: 320, y: 100 }
    ]
  },
  '总监办公室': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(0)),
    furniture: [
      { type: 'desk', x: 200, y: 70, w: 140, h: 40 },
      { type: 'chair', x: 250, y: 120, w: 18, h: 24 },
      { type: 'chair', x: 280, y: 120, w: 18, h: 24 },
      { type: 'sofa', x: 30, y: 200, w: 120, h: 50 },
      { type: 'plant', x: 420, y: 80, w: 24, h: 32 },
      { type: 'plant', x: 30, y: 70, w: 20, h: 30 }
    ],
    slots: [
      { x: 260, y: 130 }, { x: 290, y: 130 }, { x: 80, y: 220 }, { x: 130, y: 220 }, { x: 380, y: 160 }
    ]
  },
  '吸烟区': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(3)),
    furniture: [
      { type: 'barrel', x: 60, y: 180, w: 24, h: 32 },
      { type: 'barrel', x: 380, y: 180, w: 24, h: 32 },
      { type: 'plant', x: 200, y: 60, w: 24, h: 32 }
    ],
    slots: [
      { x: 120, y: 180 }, { x: 200, y: 180 }, { x: 280, y: 180 },
      { x: 100, y: 100 }, { x: 320, y: 110 }
    ]
  },
  '走廊': {
    floor: Array(ROOM_ROWS).fill(null).map(() => Array(ROOM_COLS).fill(1)),
    furniture: [
      { type: 'plant', x: 20, y: 80, w: 20, h: 28 },
      { type: 'plant', x: 460, y: 80, w: 20, h: 28 },
      { type: 'sofa', x: 180, y: 180, w: 120, h: 50 }
    ],
    slots: [
      { x: 80, y: 140 }, { x: 180, y: 140 }, { x: 280, y: 140 }, { x: 380, y: 140 },
      { x: 220, y: 200 }, { x: 280, y: 200 }
    ]
  }
};

function getRoomLayouts(theme) {
  switch (theme) {
    case 'medieval': return MEDIEVAL_ROOMS;
    case 'space': return SPACE_ROOMS;
    case 'ocean': return OCEAN_ROOMS;
    case 'cyberpunk': return CYBERPUNK_ROOMS;
    case 'office': return OFFICE_ROOMS;
    default: return MEDIEVAL_ROOMS;
  }
}

function getRoomLayout(theme, placeName, places) {
  const layouts = getRoomLayouts(theme);
  if (layouts[placeName]) return layouts[placeName];

  // Generate a generic layout for unknown places
  const idx = (places || []).indexOf(placeName);
  const seed = Math.max(0, idx);
  const rows = ROOM_ROWS;
  const cols = ROOM_COLS;
  const floor = [];
  for (let r = 0; r < rows; r++) {
    const row = [];
    for (let c = 0; c < cols; c++) {
      row.push((r + c + seed) % 4);
    }
    floor.push(row);
  }
  return {
    floor,
    furniture: [
      { type: 'table', x: 200, y: 50, w: 34, h: 24 },
      { type: 'chair', x: 210, y: 66, w: 14, h: 20 },
      { type: 'plant', x: 30, y: 55, w: 20, h: 24 },
    ],
    slots: [
      { x: 80, y: 44 }, { x: 200, y: 38 }, { x: 320, y: 44 },
      { x: 260, y: 50 }, { x: 140, y: 36 },
    ],
  };
}
