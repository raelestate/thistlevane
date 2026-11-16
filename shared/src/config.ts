/**
 * Game configuration lives in assets/data/game-config.json. Nothing here
 * hardcodes values; this file only describes and validates the shape so a
 * typo in the JSON fails loudly at startup instead of misbehaving at runtime.
 */

export interface GameConfig {
  simulation: { tickRate: number };
  movement: MovementRules;
  network: {
    wsPath: string;
    port: number;
    maxMessageBytes: number;
    maxMessagesPerSecond: number;
    maxInputCredits: number;
    maxQueuedInputs: number;
    /** Inputs are buffered this many ticks before the server starts consuming them, smoothing network jitter. */
    inputJitterBufferTicks: number;
    /** Clients receive entities within this many tiles of their player (area of interest). */
    interestRadiusTiles: number;
    idleFillAfterTicks: number;
    heartbeatMs: number;
    maxBufferedBytes: number;
  };
  players: { maxNameLength: number; defaultName: string };
  combat: { playerRespawnTicks: number };
  world: {
    startZone: string;
    layers: {
      collision: string;
      spawns: string;
      spawnType: string;
      mobSpawnType: string;
      portals: string;
      portalType: string;
      aboveCharactersProperty: string;
    };
  };
  client: {
    interpolationDelayMs: number;
    targetViewWidth: number;
    targetViewHeight: number;
    cameraLerp: number;
    maxFrameMs: number;
    backgroundColor: string;
    /** KeyboardEvent.code values per action. */
    controls: Record<'up' | 'down' | 'left' | 'right' | 'run' | 'attack', string[]>;
    nameLabel: {
      fontFamily: string;
      fontSizePx: number;
      color: string;
      localColor: string;
      strokeColor: string;
      strokeThickness: number;
      offsetY: number;
    };
    effects: { bumpCooldownMs: number };
    /** Only a window of the (huge) map is held in the renderer at a time. */
    chunk: { windowWidth: number; windowHeight: number; refillMarginTiles: number };
  };
}

export interface MovementRules {
  walkTicksPerTile: number;
  runTicksPerTile: number;
  /** Ticks a direction must be held after turning from standstill before walking starts. 0 = no delay. */
  turnDelayTicks: number;
  playersBlockEachOther: boolean;
}

/** The subset of config both sides must agree on exactly. Sent by the server on join. */
export interface GameRules {
  tickRate: number;
  movement: MovementRules;
}

export function rulesFromConfig(config: GameConfig): GameRules {
  return { tickRate: config.simulation.tickRate, movement: { ...config.movement } };
}

export function tickMs(rules: Pick<GameRules, 'tickRate'>): number {
  return 1000 / rules.tickRate;
}

// ---------------- validation ----------------

export class ConfigError extends Error {}

type Check = 'posInt' | 'nonNegInt' | 'posNumber' | 'unit' | 'string' | 'bool' | 'keyList';
interface Schema {
  [key: string]: Check | Schema;
}

const SCHEMA: Schema = {
  simulation: { tickRate: 'posInt' },
  movement: { walkTicksPerTile: 'posInt', runTicksPerTile: 'posInt', turnDelayTicks: 'nonNegInt', playersBlockEachOther: 'bool' },
  network: {
    wsPath: 'string', port: 'nonNegInt', maxMessageBytes: 'posInt', maxMessagesPerSecond: 'posInt',
    maxInputCredits: 'posInt', maxQueuedInputs: 'posInt', inputJitterBufferTicks: 'nonNegInt', interestRadiusTiles: 'posInt', idleFillAfterTicks: 'posInt',
    heartbeatMs: 'posInt', maxBufferedBytes: 'posInt',
  },
  players: { maxNameLength: 'posInt', defaultName: 'string' },
  combat: { playerRespawnTicks: 'posInt' },
  world: {
    startZone: 'string',
    layers: {
      collision: 'string', spawns: 'string', spawnType: 'string', mobSpawnType: 'string',
      portals: 'string', portalType: 'string', aboveCharactersProperty: 'string',
    },
  },
  client: {
    interpolationDelayMs: 'nonNegInt', targetViewWidth: 'posInt', targetViewHeight: 'posInt',
    cameraLerp: 'unit', maxFrameMs: 'posInt', backgroundColor: 'string',
    controls: { up: 'keyList', down: 'keyList', left: 'keyList', right: 'keyList', run: 'keyList', attack: 'keyList' },
    nameLabel: {
      fontFamily: 'string', fontSizePx: 'posInt', color: 'string', localColor: 'string',
      strokeColor: 'string', strokeThickness: 'nonNegInt', offsetY: 'nonNegInt',
    },
    effects: { bumpCooldownMs: 'nonNegInt' },
    chunk: { windowWidth: 'posInt', windowHeight: 'posInt', refillMarginTiles: 'posInt' },
  },
};

function check(value: unknown, kind: Check): boolean {
  switch (kind) {
    case 'posInt': return Number.isInteger(value) && (value as number) > 0;
    case 'nonNegInt': return Number.isInteger(value) && (value as number) >= 0;
    case 'posNumber': return typeof value === 'number' && value > 0;
    case 'unit': return typeof value === 'number' && value > 0 && value <= 1;
    case 'string': return typeof value === 'string' && value.length > 0;
    case 'bool': return typeof value === 'boolean';
    case 'keyList': return Array.isArray(value) && value.every((v) => typeof v === 'string' && v.length > 0);
  }
}

function validateSection(obj: unknown, schema: Schema, path: string): void {
  if (typeof obj !== 'object' || obj === null) throw new ConfigError(`${path} must be an object`);
  for (const [key, kind] of Object.entries(schema)) {
    const value = (obj as Record<string, unknown>)[key];
    if (typeof kind === 'object') validateSection(value, kind, `${path}.${key}`);
    else if (!check(value, kind)) throw new ConfigError(`${path}.${key} must be ${kind} (got ${JSON.stringify(value)})`);
  }
}

export function validateGameConfig(raw: unknown, source = 'game-config.json'): GameConfig {
  validateSection(raw, SCHEMA, source);
  return raw as GameConfig;
}
