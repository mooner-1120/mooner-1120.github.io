// 게임 속 존재들 — 상태만 담고, 행동은 game.ts / ai.ts 에 있다
import { Element, EnemyData, AttackKind } from './data';
import { SpawnDef } from './tilemap';

export type Team = 'player' | 'enemy';
export type StatusId = 'poison' | 'burn' | 'slow' | 'stun' | 'root' | 'silence';
export const STATUS_NAMES: Record<StatusId, string> = { poison: '중독', burn: '화상', slow: '빙결', stun: '기절', root: '속박', silence: '침묵' };
export const STATUS_COLORS: Record<StatusId, string> = { poison: '#7bd34a', burn: '#ff8a2e', slow: '#9be3ff', stun: '#ffe26a', root: '#c08a54', silence: '#c37bff' };

export interface Status {
  t: number;
  dps?: number;
  tick?: number;
}

export class Actor {
  x = 0;
  y = 0;
  r = 5;
  hp = 1;
  maxHp = 1;
  flip = false;
  moving = false;
  animT = Math.random() * 10;
  flash = 0;
  kbx = 0;
  kby = 0;
  status: Partial<Record<StatusId, Status>> = {};
  dead = false;
  deathT = 0;
  team: Team = 'enemy';
  sprite = '';
  scale = 1;
  constructor(x: number, y: number) {
    this.x = x;
    this.y = y;
  }
  has(s: StatusId): boolean {
    return (this.status[s]?.t ?? 0) > 0;
  }
  get canAct(): boolean {
    return !this.has('stun') && !this.dead;
  }
  get canMove(): boolean {
    return this.canAct && !this.has('root');
  }
  get slowMul(): number {
    return this.has('slow') ? 0.55 : 1;
  }
}

export interface Buff {
  t: number;
  max: number;
  name: string;
  atkPct?: number;
  defPct?: number;
  ms?: number;
  dmgRed?: number;
  regen?: number; // 초당 회복
  icon: string;
}

export class Player extends Actor {
  team: Team = 'player';
  mp = 0;
  st = 100;
  path: [number, number][] = [];
  target: Enemy | NpcEnt | null = null;
  moveGoal: [number, number] | null = null;
  /** 키보드 전투에서 '인식'한 적 (공격 키를 누르면 이 적을 친다) */
  lock: Enemy | null = null;
  holdDir: [number, number] | null = null;
  atkT = 0; // 다음 공격까지
  swingT = 0; // 휘두르는 그림 진행
  swingDur = 0.2;
  swingAng = 0;
  combo = 0;
  comboT = 0;
  aimAng = 0;
  roll: { t: number; dx: number; dy: number } | null = null;
  iframes = 0;
  rollCd = 0;
  cds: Record<string, number> = {};
  buffs: Record<string, Buff> = {};
  block = 0;
  parry = 0;
  stealth = 0;
  poisonCoat = 0;
  nextCrit = false;
  invuln = 0;
  castLock = 0;
  dash: { t: number; dx: number; dy: number; speed: number; hit: Set<Enemy>; dmg: number } | null = null;
  shadowDance = 0;
  shadowTick = 0;
  pendingHit: { t: number; fn: () => void }[] = [];
  regenAcc = 0;
  stepT = 0;
  stRegenDelay = 0;
}

export type EState = 'idle' | 'patrol' | 'chase' | 'windup' | 'attack' | 'recover' | 'retreat' | 'return' | 'charge' | 'dying';

export class Enemy extends Actor {
  d: EnemyData;
  state: EState = 'idle';
  stT = 0;
  homeX: number;
  homeY: number;
  wanderTo: [number, number] | null = null;
  path: [number, number][] = [];
  pathT = 0;
  cd = 0;
  atk: AttackKind = 'bite';
  aimX = 0;
  aimY = 0;
  aggro = false;
  spawn: SpawnDef | null;
  phase = 1;
  summonT = 8;
  chargeHit = false;
  vx = 0;
  vy = 0;
  hitstun = 0;
  hpBarT = 0;
  taunted = 0;
  lastHitBy = 0;
  boss: boolean;
  label: string;
  dmgTaken = 0;
  constructor(d: EnemyData, x: number, y: number, spawn: SpawnDef | null) {
    super(x, y);
    this.d = d;
    this.homeX = x;
    this.homeY = y;
    this.hp = this.maxHp = d.hp;
    this.r = d.radius;
    this.sprite = d.sprite;
    this.spawn = spawn;
    this.boss = !!d.boss;
    this.label = d.name;
    this.cd = 0.5 + Math.random();
    this.scale = d.scale ?? 1;
  }
}

export class NpcEnt extends Actor {
  team: Team = 'player';
  wanderT = 2;
  goal: [number, number] | null = null;
  constructor(public id: string, public name: string, sprite: string, x: number, y: number, public wander = 0, public homeX = x, public homeY = y) {
    super(x, y);
    this.sprite = sprite;
    this.r = 6;
  }
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  team: Team;
  dmg: number;
  r: number;
  life: number;
  sprite: string; // '' 이면 직접 그림
  kind: 'arrow' | 'orb' | 'axe' | 'ice' | 'knife';
  element: Element;
  pierce: number;
  hit: Set<Actor>;
  status?: [StatusId, number, number?];
  explode?: number;
  knock?: number;
  crit?: boolean;
  owner?: Enemy | Player;
  spin?: number;
  trail?: string;
  magic?: boolean;
}

export type Shape =
  | { k: 'circle'; r: number }
  | { k: 'cone'; r: number; ang: number; spread: number }
  | { k: 'line'; len: number; w: number; ang: number }
  | { k: 'ring'; r: number; inner: number };

export interface Hazard {
  x: number;
  y: number;
  shape: Shape;
  t: number;
  total: number;
  team: Team;
  dmg: number;
  element: Element;
  status?: [StatusId, number, number?];
  knock?: number;
  owner?: Enemy | Player;
  fx?: string;
  silent?: boolean; // 경고 표시 없음
  crit?: boolean;
  magic?: boolean;
}

export interface Zone {
  x: number;
  y: number;
  r: number;
  t: number;
  total: number;
  team: Team;
  kind: 'frost' | 'rain' | 'trap' | 'fire' | 'poison';
  tick: number;
  dmg: number;
  element: Element;
  armed?: boolean;
}

export interface Particle {
  x: number;
  y: number;
  z: number;
  vx: number;
  vy: number;
  vz: number;
  life: number;
  max: number;
  color: string;
  size: number;
  grav?: number;
  kind?: 'spark' | 'smoke' | 'ring' | 'slash' | 'text' | 'star' | 'beam' | 'meteor' | 'cross' | 'sprite';
  ang?: number;
  r?: number;
  sprite?: string;
}

export interface FloatText {
  x: number;
  y: number;
  vy: number;
  life: number;
  text: string;
  color: string;
  big: boolean;
}

export interface Drop {
  x: number;
  y: number;
  z: number;
  vz: number;
  kind: 'gold' | 'soul' | 'item' | 'use' | 'mat';
  amount: number;
  item?: import('./items').ItemInst;
  id?: string;
  t: number;
  magnet: boolean;
}
