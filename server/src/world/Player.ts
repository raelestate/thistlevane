import {
  createPlayerState,
  type CombatStats,
  type Direction,
  type MoveIntent,
  type MovementRules,
  type PlayerInfo,
  type PlayerState,
  type WeaponDefinition,
} from '@thistlevane/shared';

export interface QueuedInput extends MoveIntent {
  seq: number;
  /** World tick the input arrived on. */
  arrivedTick: number;
}

export interface QueuedAttack {
  seq: number;
  aim: Direction;
  targetId?: string;
  arrivedTick: number;
}

export interface QueuedCast {
  seq: number;
  skillId: string;
  /** Snapped Direction — for the broadcast facing/animation only. */
  aim: Direction;
  /** Real, continuous aim angle (degrees) — for the hit-test math. See World.applySkillEffect. */
  aimDeg: number;
  targetId?: string;
  arrivedTick: number;
}

/** Server-side player: public info, authoritative movement + combat state, and input bookkeeping. */
export class Player {
  state: PlayerState;
  readonly inputQueue: QueuedInput[] = [];
  /** Highest input seq applied to `state`. Echoed to the client as `ackSeq`. */
  lastAppliedSeq = 0;
  /** Highest input seq accepted into the queue (rejects duplicates / reordering). */
  lastQueuedSeq = 0;
  /** World tick at which the last input arrived. */
  lastInputTick = 0;
  /** True while refilling the jitter buffer after the input stream paused. */
  buffering = true;
  /** Movement budget (anti speed-hack), see network.maxInputCredits. */
  inputCredits: number;
  /** Zone the player is currently in (maintained by WorldManager). */
  zoneId = '';

  /** Combat: attacks have their own, independent monotonic seq (never ride movement's). */
  readonly attackQueue: QueuedAttack[] = [];
  lastQueuedAttackSeq = 0;
  /** World tick of the last resolved attack; gates the next one via weapon.cooldownTicks. */
  lastAttackTick = -Infinity;
  /** Counts down to 0 while dead, then the player is respawned. */
  respawnTicksLeft = 0;

  /** Skill casts: own independent monotonic seq, same dedup pattern as attacks. */
  readonly castQueue: QueuedCast[] = [];
  lastQueuedCastSeq = 0;
  /** skillId → world tick it was last used (see World.drainCast). */
  readonly skillCooldowns = new Map<string, number>();
  /** Gates which of this class's skills (data/skills.json level_required) are usable — see shared/src/progression.ts. */
  level = 1;
  xp = 0;
  /** This class's resource pool (ki/mana/rage/...), 0-100. Grid characters (no class) never change it. */
  resourceCurrent = 100;

  constructor(
    readonly id: string,
    readonly name: string,
    readonly characterId: string,
    tileX: number,
    tileY: number,
    rules: MovementRules,
    maxInputCredits: number,
    readonly combat: CombatStats,
    readonly weapon: WeaponDefinition,
  ) {
    this.state = createPlayerState(id, tileX, tileY, rules);
    this.state.hp = combat.maxHp;
    this.inputCredits = maxInputCredits;
  }

  /** Teleport (zone transfer or respawn): new position, drop queued inputs/attacks; seq numbering continues. hp carries over (respawn overwrites it after calling this). */
  resetAt(tileX: number, tileY: number, rules: MovementRules): void {
    const { facing, hp } = this.state;
    this.state = { ...createPlayerState(this.id, tileX, tileY, rules), facing, hp, level: this.level };
    this.inputQueue.length = 0;
    this.attackQueue.length = 0;
    this.castQueue.length = 0;
    this.buffering = true;
  }

  get info(): PlayerInfo {
    return { id: this.id, name: this.name, characterId: this.characterId };
  }
}
