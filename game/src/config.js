// Vice Rush — every tuning number, colour and city constant in one place.
// The world is a fixed 2560x1920 logical city; the renderer scales a camera view
// of it to the window, so no rule below depends on the screen size.

export const WORLD = { width: 2560, height: 1920 };

/** The simulation's fixed step, in seconds: 60 updates a second whatever the display's rate. */
export const STEP = 1 / 60;

/** Road grid: vertical and horizontal road centrelines, road width and lane offset. */
export const ROADS = {
  vertical: [320, 640, 960, 1280, 1600, 1920, 2240],
  horizontal: [320, 640, 960, 1280, 1600],
  width: 96,
  lane: 24,
};

/** The beach strip along the south edge: sand, then water at the very bottom. */
export const BEACH = { sandY: 1760, waterY: 1872 };

/** Named places the missions and the minimap point at. */
export const PLACES = {
  hideout: { x: 1120, y: 480, label: 'Hideout' },
  docks: { x: 200, y: 1470, label: 'The Docks' },
  motel: { x: 2360, y: 1120, label: 'Motel Palm' },
  bank: { x: 1440, y: 800, label: 'Bank of Solmar' },
  park: { x: 1120, y: 800, label: 'Coral Park' },
  spray: { x: 800, y: 200, label: 'Fresh Coat' },
  port: { x: 480, y: 1600, label: 'Port Gate' },
  hospital: { x: 1760, y: 480, label: 'St. Lumen Hospital' },
};

export const PLAYER = {
  radius: 13,
  walkSpeed: 210,
  runSpeed: 320,
  health: 100,
  punchRange: 34,
  punchDamage: 25,
  punchCooldown: 0.45,
};

export const PISTOL = {
  damage: 34,
  range: 520,
  bulletSpeed: 900,
  magSize: 12,
  reloadTime: 1.1,
  fireCooldown: 0.22,
  spread: 0.045,
};

export const CAR = {
  length: 46,
  width: 22,
  accel: 420,
  brake: 700,
  reverseMax: 150,
  maxSpeed: 520,
  sportsMax: 640,
  turnRate: 2.6,
  grip: 6.0,
  handbrakeGrip: 1.6,
  health: 100,
};

export const TRAFFIC = { count: 20, speed: 150, speedJitter: 40, followGap: 70 };

export const PEDS = { count: 32, speed: 55, fleeSpeed: 130 };

export const POLICE = {
  carSpeed: 560,
  carTurn: 3.1,
  footSpeed: 235,
  bustTime: 1.5,
  ramDamage: 8,
  spawnDistance: 700,
};

export const WANTED = {
  maxStars: 5,
  stealCar: 25,
  hitPed: 30,
  shoot: 20,
  killPed: 45,
  killCop: 80,
  decayPerSecond: 3.5,
  decayDelay: 6,
};

export const MONEY = { sprayCost: 200, bustedLoss: 0.2, wastedLoss: 0.2 };

export const PALETTE = {
  backdrop: '#1a2233',
  grass: '#7fae62',
  parkGrass: '#69a357',
  sand: '#eed9a4',
  water: '#2f9dc4',
  waterDeep: '#1f7ea8',
  sidewalk: '#cfc0a0',
  road: '#3c414d',
  roadLine: '#e8c84a',
  curb: '#9a8c6c',
  buildingRoof: '#8a6f5c',
  text: '#f4f1e8',
  muted: '#b9b3a4',
  panel: 'rgba(16, 20, 30, 0.82)',
  accent: '#ffb02e',
  danger: '#ff5252',
  policeBlue: '#3f8cff',
  policeRed: '#ff4040',
  mission: '#ffd23e',
  health: '#58d68d',
  cash: '#7be495',
};

/** Pastel roof colours for the city's buildings. */
export const ROOF_COLORS = ['#e8a798', '#a8c8a0', '#a0b8d8', '#e8c89a', '#d8a0c0', '#b8a8d8', '#f0b890', '#98d0c0'];

export const FONT = 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif';

/** Where the save (cash, mission progress, best) is kept between visits (this browser only). */
export const SAVE_KEY = 'vice-rush.save.v1';
export const BEST_KEY = 'vice-rush.best.v1';
