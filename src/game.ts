// 게임 본체: 루프, 입력, 플레이어, 전투, 퀘스트 진행
import { sfx, music } from './audio';
import {
  CLASSES, CONSUMABLES, ENEMIES, Element, MATERIALS, RACES, SkillData, xpToNext, MAX_LEVEL, BASE_ITEMS,
} from './data';
import {
  Actor, Buff, Drop, Enemy, FloatText, Hazard, NpcEnt, Particle, Player, Projectile, Shape, StatusId, Zone,
} from './entities';
import { addToInv, countOf, derive, Derived, Hero, ItemInst, makeItem, randomDrop, removeCount, itemName } from './items';
import { MAP_BUILDERS } from './maps';
import { MEMORIES, MURALS, QUESTS, QuestDef, SELF_TALK, AMBIENT, BANTER } from './quests';
import { GameMap, TS, Exit, MapObj } from './tilemap';
import { updateEnemy } from './ai';
import { renderGame } from './render';
import { Coop } from './coop';
import { RARITY } from './data';
import { anim } from './assets';
import { actionFor, settings as keySettings, shouldPrevent, ActionId } from './keys';
import { HOME, MAP_NAME, NPC_NAME, nextHop, npcMapFor, resolveNpc } from './homes';

export interface UIHooks {
  toast(msg: string, color?: string): void;
  big(msg: string, sub?: string): void;
  talk(npc: NpcEnt): void;
  hudDirty(): void;
  onDeath(): void;
  save(): void;
  bossBar(e: Enemy | null): void;
  modalOpen(): boolean;
  showChapterClear(chapter: number): void;
  showEnding(id: string): void;
  showScene(title: string, lines: string[]): void;
  questUpdate(): void;
}

const ANG = (ax: number, ay: number, bx: number, by: number) => Math.atan2(by - ay, bx - ax);
const DIST = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);

export class Game {
  cv: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  world: HTMLCanvasElement;
  wctx: CanvasRenderingContext2D;
  light: HTMLCanvasElement;
  lctx: CanvasRenderingContext2D;
  scale = 3;
  vw = 320;
  vh = 180;
  hero!: Hero;
  der!: Derived;
  p!: Player;
  map!: GameMap;
  enemies: Enemy[] = [];
  npcs: NpcEnt[] = [];
  projs: Projectile[] = [];
  hazards: Hazard[] = [];
  zones: Zone[] = [];
  parts: Particle[] = [];
  texts: FloatText[] = [];
  drops: Drop[] = [];
  respawns: { def: import('./tilemap').SpawnDef; t: number }[] = [];
  cam = { x: 0, y: 0 };
  shakeA = 0;
  hitstop = 0;
  time = 0;
  fade = 0;
  fadeTo: (() => void) | null = null;
  mouse = { sx: 0, sy: 0, wx: 0, wy: 0, down: false, downT: 0, moved: false };
  moveKeys = new Set<string>();
  coop: Coop = new Coop(this);
  private wasMirrored = false;
  /** 마지막 조작이 키보드였나 — 그렇다면 스킬을 인식한 적에게 조준한다 */
  kbAim = false;
  running = false;
  last = 0;
  boss: Enemy | null = null;
  arenaLocked = false;
  touch = false;
  saveT = 0;
  exitMsgT = 0;
  slowmo = 0;

  constructor(cv: HTMLCanvasElement, public ui: UIHooks) {
    this.cv = cv;
    this.ctx = cv.getContext('2d')!;
    this.world = document.createElement('canvas');
    this.wctx = this.world.getContext('2d')!;
    this.light = document.createElement('canvas');
    this.lctx = this.light.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
    this.bindInput();
  }

  // ── 화면 크기: 정수 배율 픽셀 퍼펙트 ────────────────────────────
  resize(): void {
    const W = window.innerWidth, H = window.innerHeight;
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    this.cv.width = Math.round(W * dpr);
    this.cv.height = Math.round(H * dpr);
    this.cv.style.width = W + 'px';
    this.cv.style.height = H + 'px';
    const s = Math.max(1, Math.floor(Math.min(this.cv.width / 400, this.cv.height / 230)));
    this.scale = s;
    this.vw = Math.ceil(this.cv.width / s);
    this.vh = Math.ceil(this.cv.height / s);
    this.world.width = this.light.width = this.vw;
    this.world.height = this.light.height = this.vh;
    this.ctx.imageSmoothingEnabled = false;
    this.wctx.imageSmoothingEnabled = false;
  }

  dpr(): number {
    return this.cv.width / window.innerWidth;
  }

  // ── 입력 ─────────────────────────────────────────────────────────
  bindInput(): void {
    const toWorld = () => {
      const d = this.dpr();
      this.mouse.wx = (this.mouse.sx * d) / this.scale + this.cam.x;
      this.mouse.wy = (this.mouse.sy * d) / this.scale + this.cam.y;
    };
    this.cv.addEventListener('pointerdown', (e) => {
      if (!this.running) return;
      this.touch = e.pointerType === 'touch';
      this.mouse.sx = e.clientX;
      this.mouse.sy = e.clientY;
      toWorld();
      if (e.button === 2) return;
      this.mouse.down = true;
      this.mouse.downT = 0;
      this.mouse.moved = false;
      this.cv.setPointerCapture(e.pointerId);
      this.clickAt(this.mouse.wx, this.mouse.wy);
    });
    this.cv.addEventListener('pointermove', (e) => {
      if (Math.abs(e.clientX - this.mouse.sx) + Math.abs(e.clientY - this.mouse.sy) > 3) this.kbAim = false;
      this.mouse.sx = e.clientX;
      this.mouse.sy = e.clientY;
      this.mouse.moved = true;
      toWorld();
    });
    const up = () => {
      this.mouse.down = false;
      if (this.p) this.p.holdDir = null;
    };
    this.cv.addEventListener('pointerup', up);
    this.cv.addEventListener('pointercancel', up);
    this.cv.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('keydown', (e) => {
      if (!this.running) return;
      if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
      if (this.ui.modalOpen()) return;
      const act = actionFor(e.code);
      if (!act) return;
      if (shouldPrevent(e.code)) e.preventDefault();
      this.touch = false;
      if (act === 'up' || act === 'down' || act === 'left' || act === 'right') {
        this.moveKeys.add(act);
        this.kbAim = true;
        return;
      }
      if (e.repeat && act !== 'roll' && act !== 'attack') return;
      switch (act as ActionId) {
        case 'skill1': this.castSkill(0); break;
        case 'skill2': this.castSkill(1); break;
        case 'skill3': this.castSkill(2); break;
        case 'skill4': this.castSkill(3); break;
        case 'race': this.raceSkill(); break;
        case 'roll': this.doRoll(); break;
        case 'item1': this.useQuick(0); break;
        case 'item2': this.useQuick(1); break;
        case 'item3': this.useQuick(2); break;
        case 'interact': this.interact(); break;
        case 'stop': this.stopAll(); break;
        case 'attack': this.attackKey(); break;
        case 'nextTarget': this.cycleTarget(); break;
      }
    });
    window.addEventListener('keyup', (e) => {
      const act = actionFor(e.code);
      if (act) this.moveKeys.delete(act);
    });
    window.addEventListener('blur', () => { this.moveKeys.clear(); this.mouse.down = false; });
    // 마우스 움직임을 월드 좌표로 계속 갱신 (카메라가 움직여도)
    setInterval(() => this.running && toWorld(), 50);
  }

  stopAll(): void {
    this.p.path = [];
    this.p.target = null;
    this.p.moveGoal = null;
  }

  /** 클릭한 곳 근처의 적 (몸통 중심에서 거리 기준, 넉넉한 판정) */
  enemyAt(x: number, y: number, pad = 18): Enemy | null {
    let best: Enemy | null = null, bd = 1e9;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const h = (e.boss ? 30 : 14) * e.scale;
      const cy = e.y - h * 0.5;
      const d = Math.hypot(x - e.x, (y - cy) * 0.85);
      const rr = Math.max(e.r, 7) + pad + (e.boss ? 12 : 0);
      if (d < rr && d - rr < bd) { bd = d - rr; best = e; }
    }
    return best;
  }

  /** 지금 싸우던 적을 쓰러뜨리면 근처에서 덤비는 다음 적 */
  nextTarget(): Enemy | null {
    let best: Enemy | null = null, bd = 90;
    for (const e of this.enemies) if (!e.dead && e.aggro && DIST(e, this.p) < bd) { bd = DIST(e, this.p); best = e; }
    return best;
  }

  /** 출구 판정 범위: 출구 칸에서 약 1칸 바깥까지 */
  nearExit(ex: Exit, px: number, py: number, pad = 0.9): boolean {
    const tx = px / TS, ty = py / TS;
    return tx >= ex.x - pad && tx < ex.x + ex.w + pad && ty >= ex.y - pad && ty < ex.y + ex.h + pad;
  }
  npcAt(x: number, y: number): NpcEnt | null {
    for (const n of this.npcs) if (Math.hypot(x - n.x, y - (n.y - 10)) < 12) return n;
    return null;
  }

  clickAt(wx: number, wy: number): void {
    const p = this.p;
    if (!p || p.dead) return;
    const e = this.enemyAt(wx, wy, this.touch ? 26 : 18);
    if (e) {
      p.target = e;
      p.path = [];
      p.moveGoal = null;
      return;
    }
    const n = this.npcAt(wx, wy);
    if (n) {
      p.target = n;
      this.pathTo(n.x, n.y + 4);
      return;
    }
    // 상자·표지판
    for (const c of this.map.chests) {
      const cx = c.x * TS + 8, cy = c.y * TS + 8;
      if (Math.hypot(wx - cx, wy - cy) < 12) {
        this.pathTo(cx, cy + 10);
        p.target = null;
        (p as any).chestGoal = c;
        return;
      }
    }
    p.target = null;
    (p as any).chestGoal = null;
    for (const ex of this.map.exits) {
      if (this.nearExit(ex, wx, wy, 1.5)) {
        const ex2 = Math.min(Math.max(wx / TS, ex.x + 0.5), ex.x + ex.w - 0.5) * TS;
        const ey2 = Math.min(Math.max(wy / TS, ex.y + 0.5), ex.y + ex.h - 0.5) * TS;
        this.pathTo(ex2, ey2);
        this.spawnClickFx(ex2, ey2);
        return;
      }
    }
    this.pathTo(wx, wy);
    this.spawnClickFx(wx, wy);
  }

  spawnClickFx(x: number, y: number): void {
    this.parts.push({ x, y, z: 0, vx: 0, vy: 0, vz: 0, life: 0.35, max: 0.35, color: '#fdf7ed', size: 1, kind: 'ring', r: 6 });
  }

  pathTo(x: number, y: number): void {
    const p = this.p;
    if (this.map.clearLine(p.x, p.y, x, y, p.r - 1)) {
      p.path = [[x, y]];
      return;
    }
    const path = this.map.findPath(p.x, p.y, x, y);
    p.path = path ?? [];
  }

  // ── 시작 / 맵 이동 ───────────────────────────────────────────────
  start(hero: Hero): void {
    this.hero = hero;
    this.p = new Player(0, 0);
    this.p.r = 5;
    this.recalc();
    if (hero.hp < 0) hero.hp = this.der.maxHp;
    if (hero.mp < 0) hero.mp = this.der.maxMp;
    this.p.hp = Math.min(hero.hp, this.der.maxHp);
    this.p.mp = Math.min(hero.mp, this.der.maxMp);
    this.p.maxHp = this.der.maxHp;
    this.migrate();
    if (!this.hero.quests.length) { this.hero.flags.pro_beasts = true; this.startQuest('pro', true); }
    this.loadMap(hero.map, hero.x >= 0 ? [hero.x, hero.y] : 'start');
    this.running = true;
    this.last = performance.now();
    requestAnimationFrame((t) => this.loop(t));
  }

  stop(): void {
    this.running = false;
  }

  /** 예전 버전 세이브를 새 이야기 구조로 옮긴다 */
  migrate(): void {
    const h = this.hero;
    const old = (id: string) => h.quests.find((q) => q.id === id);
    if (!old('main1') && !old('main2') && !old('main3')) return;
    const done = (id: string) => ({ id, stage: QUESTS[id].stages.length, count: 0, done: true });
    const keep = h.quests.filter((q) => QUESTS[q.id] && !q.id.startsWith('main'));
    const list = [done('pro')];
    const m1 = old('main1'), m2 = old('main2'), m3 = old('main3');
    h.flags.ch1_seen = true;
    if (m3?.done) {
      list.push(done('c1_1'), done('c1_2'), done('c1_3'), done('c1_4'));
      Object.assign(h.flags, { garto_hasvel: true, pact_human: true, garto_alive: true, rift_open: true, vargon_dead: true, ch1_clear: true });
    } else if (m2?.done) {
      list.push(done('c1_1'), done('c1_2'), { id: 'c1_3', stage: h.flags.king_dead ? 1 : 0, count: 0, done: false });
    } else if (m1?.done) {
      list.push(done('c1_1'), { id: 'c1_2', stage: h.flags.crypt_cleared ? 2 : m2 && m2.stage > 0 ? 1 : 0, count: 0, done: false });
    } else {
      list.push({ id: 'c1_1', stage: m1 && m1.stage > 0 ? 2 : 1, count: m1?.count ?? 0, done: false });
    }
    h.quests = [...list, ...keep.filter((q) => !list.some((l) => l.id === q.id))];
    if (m3?.done && !h.quests.some((q) => q.id === 'c2_1')) h.quests.push({ id: 'c2_1', stage: 0, count: 0, done: false });
    if (h.flags.spirit_dead && h.quests.find((q) => q.id === 'c2_4')?.done) Object.assign(h.flags, { ch2_clear: true, pact_elf: true });
    if (h.quests.find((q) => q.id === 'c2_4')?.done && !h.quests.some((q) => q.id === 'c3_1')) h.quests.push({ id: 'c3_1', stage: 0, count: 0, done: false });
  }

  // ── 말풍선 · 혼잣말 · 수군거림 · 파티 대화 ─────────────────────
  bubbles: { who: string; text: string; t: number }[] = [];
  selfTalkT = 0;
  private selfSaid = new Set<string>();
  private ambientCd = new Map<string, number>();
  private banterCd = new Map<string, number>();
  private bubbleT = 0;

  say(who: string, text: string, t = 3.6): void {
    this.bubbles = this.bubbles.filter((b) => b.who !== who);
    this.bubbles.push({ who, text, t });
    if (who === 'me' && this.coop.on) this.coop.sendSay(text);
  }

  updateTalk(dt: number): void {
    for (const b of this.bubbles) b.t -= dt;
    this.bubbles = this.bubbles.filter((b) => b.t > 0);
    const race = this.hero.race;
    if (this.selfTalkT > 0) {
      this.selfTalkT -= dt;
      if (this.selfTalkT <= 0 && !this.selfSaid.has(this.map.id)) {
        const st = SELF_TALK[this.map.id];
        const line = st?.[race] ?? st?.any;
        if (line) { this.selfSaid.add(this.map.id); this.say('me', line); }
      }
    }
    this.bubbleT -= dt;
    if (this.bubbleT > 0) return;
    this.bubbleT = 0.5;
    // NPC 수군거림
    for (const n of this.npcs) {
      const list = AMBIENT[n.id];
      if (!list || DIST(n, this.p) > 52) continue;
      if ((this.ambientCd.get(n.id) ?? 0) > this.time) continue;
      const g = list.find((e) => (!e.race || e.race.includes(race)) && (!e.when || this.hero.flags[e.when]) && (!e.unless || !this.hero.flags[e.unless]));
      if (!g) continue;
      this.ambientCd.set(n.id, this.time + 12 + Math.random() * 10);
      this.say('npc:' + n.id, g.lines[(Math.random() * g.lines.length) | 0]);
    }
    // 파티 대화: 아이디가 작은 쪽이 먼저 말을 건다
    if (this.coop.on && this.coop.t) {
      for (const r of this.coop.othersHere()) {
        if (Math.hypot(r.x - this.p.x, r.y - this.p.y) > 70 || this.coop.t.id > r.id) continue;
        if ((this.banterCd.get(r.id) ?? 0) > this.time) continue;
        const key = [race, r.race].sort().join('|');
        const list = (BANTER[key] ?? []).map((b, i) => [b, i] as const).filter(([b]) => b[0] === race);
        this.banterCd.set(r.id, this.time + 45 + Math.random() * 30);
        if (!list.length) continue;
        const [b, i] = list[(Math.random() * list.length) | 0];
        this.say('me', b[1]);
        this.coop.sendBanter(r.id, key, i);
      }
    }
  }

  /** 파티원이 말을 걸었다: 2초 뒤 대답 */
  banterReply(key: string, i: number): void {
    const b = BANTER[key]?.[i];
    if (b) setTimeout(() => this.say('me', b[2]), 2000);
  }

  // ── 기억의 틈 · 벽화 (가까이 가면 보인다) ──────────────────────
  updateLore(): void {
    if (this.ui.modalOpen() || this.p.dead) return;
    for (const o of this.map.objects) {
      if (!o.tag || (o.req && !this.hero.flags[o.req])) continue;
      const [kind, id] = o.tag.split(':');
      if ((kind !== 'memory' && kind !== 'mural') || this.hero.flags['seen_' + id]) continue;
      if (Math.hypot(o.x - this.p.x, o.y - this.p.y) > (kind === 'mural' ? 26 : 18)) continue;
      this.hero.flags['seen_' + id] = true;
      sfx('teleport');
      if (kind === 'memory') {
        const mem = MEMORIES[id];
        this.ui.showScene(mem.title, mem.lines);
        if (mem.flag) this.hero.flags[mem.flag] = true;
        this.ui.toast(`노르하임의 기억 ${this.memoryCount()}/${Object.keys(MEMORIES).length}`, '#c37bff');
        if (this.memoryCount() >= Object.keys(MEMORIES).length) this.setFlag('memories_all');
      } else {
        const mu = MURALS[id];
        this.ui.showScene(mu.title, mu.lines);
        if (Object.keys(MURALS).every((k) => this.hero.flags['seen_' + k])) this.setFlag('murals_seen');
      }
      this.syncWorld();
      this.ui.questUpdate();
      return;
    }
  }

  recalc(): void {
    const b = { atkPct: 0, defPct: 0, ms: 0 };
    for (const bf of Object.values(this.p.buffs)) {
      b.atkPct += bf.atkPct ?? 0;
      b.defPct += bf.defPct ?? 0;
      b.ms += bf.ms ?? 0;
    }
    if (this.hero.race === 'orc' && this.p.hp > 0 && this.p.hp / this.p.maxHp <= 0.3) b.atkPct += 20;
    if (this.p.stealth > 0) b.ms += 30;
    this.der = derive(this.hero, b);
    this.p.maxHp = this.der.maxHp;
    this.p.sprite = RACES[this.hero.race].bodies[this.hero.gender];
  }

  loadMap(id: string, spawn: string | [number, number]): void {
    const m = MAP_BUILDERS[id]();
    m.prerender();
    this.map = m;
    this.hero.map = id;
    this.enemies = [];
    this.projs = [];
    this.hazards = [];
    this.zones = [];
    this.parts = [];
    this.drops = [];
    this.texts = [];
    this.respawns = [];
    this.boss = null;
    this.arenaLocked = false;
    this.ui.bossBar(null);
    this.npcs = [];
    this.syncWorld();
    this.selfTalkT = 1.2;
    const fallback = m.points.start ?? Object.values(m.points)[0];
    const pt = typeof spawn === 'string' ? m.points[spawn] ?? fallback : spawn;
    this.p.x = pt[0];
    this.p.y = pt[1];
    if (m.hits(this.p.x, this.p.y, this.p.r)) {
      const s = fallback;
      this.p.x = s[0];
      this.p.y = s[1];
    }
    this.p.path = [];
    this.p.target = null;
    this.p.dash = null;
    (this as any).exitGrace = true;
    this.p.roll = null;
    this.cam.x = this.p.x - this.vw / 2;
    this.cam.y = this.p.y - this.vh / 2;
    this.clampCam();
    music(m.bgm);
    this.ui.big(m.name, m.safe ? '안전 지역' : '');
    this.ui.hudDirty();
    this.saveHero();
    this.ui.save();
  }

  bossDefeated(id: string): boolean {
    const f = ENEMIES[id]?.flag;
    return !!f && !!this.hero.flags[f];
  }

  travel(to: string, spawn: string): void {
    if (this.fadeTo) return;
    sfx('door');
    this.fadeTo = () => this.loadMap(to, spawn);
  }

  saveHero(): void {
    const h = this.hero;
    h.x = Math.round(this.p.x);
    h.y = Math.round(this.p.y);
    h.hp = Math.round(this.p.hp);
    h.mp = Math.round(this.p.mp);
  }

  // ── 메인 루프 ────────────────────────────────────────────────────
  loop(t: number): void {
    if (!this.running) return;
    let dt = Math.min(0.05, (t - this.last) / 1000);
    this.last = t;
    if (this.fadeTo) {
      this.fade = Math.min(1, this.fade + dt * 4);
      if (this.fade >= 1) {
        const f = this.fadeTo;
        this.fadeTo = null;
        f();
      }
    } else if (this.fade > 0) this.fade = Math.max(0, this.fade - dt * 3);
    if (!this.ui.modalOpen()) {
      this.hero.playtime += dt;
      if (this.slowmo > 0) { this.slowmo -= dt; dt *= 0.35; }
      if (this.hitstop > 0) this.hitstop -= dt;
      else this.update(dt);
    }
    renderGame(this);
    requestAnimationFrame((tt) => this.loop(tt));
  }

  update(dt: number): void {
    this.time += dt;
    const p = this.p;
    if (this.mouse.down) {
      this.mouse.downT += dt;
      if (this.mouse.downT > 0.18 && !(p.target instanceof Enemy) && !(p.target instanceof NpcEnt)) {
        const dx = this.mouse.wx - p.x, dy = this.mouse.wy - p.y;
        const d = Math.hypot(dx, dy);
        p.holdDir = d > 6 ? [dx / d, dy / d] : null;
        p.path = [];
      }
    }
    this.coop.tick(dt);
    const mirrored = this.coop.mirrored;
    if (mirrored !== this.wasMirrored) {
      this.wasMirrored = mirrored;
      if (mirrored) {
        // 방장과 같은 지역: 내 몬스터는 치우고 방장의 몬스터를 받는다
        this.enemies = this.enemies.filter((e) => e.remote);
        this.hazards = this.hazards.filter((h) => h.team === 'player');
        this.projs = this.projs.filter((p) => p.team === 'player');
        this.respawns = [];
        this.boss = null;
        this.ui.bossBar(null);
      } else this.leaveSharedWorld();
    }
    this.updatePlayer(dt);
    for (const e of this.enemies) if (!e.remote) updateEnemy(this, e, dt);
    this.enemies = this.enemies.filter((e) => !(e.dead && e.deathT > 0.6));
    for (const n of this.npcs) this.updateNpc(n, dt);
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updateZones(dt);
    this.updateParticles(dt);
    this.updateDrops(dt);
    if (!mirrored) this.updateRespawns(dt);
    this.checkExits(dt);
    this.updateTalk(dt);
    this.updateLore();
    this.updateCamera(dt);
    this.saveT += dt;
    if (this.saveT > 30) {
      this.saveT = 0;
      this.saveHero();
      this.ui.save();
    }
  }

  updateCamera(dt: number): void {
    const tx = this.p.x - this.vw / 2, ty = this.p.y - 10 - this.vh / 2;
    const k = 1 - Math.exp(-dt * 8);
    this.cam.x += (tx - this.cam.x) * k;
    this.cam.y += (ty - this.cam.y) * k;
    this.clampCam();
    this.shakeA = Math.max(0, this.shakeA - dt * 30);
  }
  clampCam(): void {
    const mw = this.map.w * TS, mh = this.map.h * TS;
    this.cam.x = mw < this.vw ? (mw - this.vw) / 2 : Math.max(0, Math.min(mw - this.vw, this.cam.x));
    this.cam.y = mh < this.vh ? (mh - this.vh) / 2 : Math.max(0, Math.min(mh - this.vh, this.cam.y));
  }

  shake(a: number): void {
    this.shakeA = Math.max(this.shakeA, a);
  }

  // ── 플레이어 ────────────────────────────────────────────────────
  updatePlayer(dt: number): void {
    const p = this.p;
    const d = this.der;
    if (p.dead) {
      p.deathT += dt;
      return;
    }
    p.animT += dt;
    p.flash = Math.max(0, p.flash - dt);
    for (const k in p.cds) p.cds[k] = Math.max(0, p.cds[k] - dt);
    p.rollCd = Math.max(0, p.rollCd - dt);
    p.atkT = Math.max(0, p.atkT - dt);
    p.swingT = Math.max(0, p.swingT - dt);
    p.comboT -= dt;
    if (p.comboT <= 0) p.combo = 0;
    p.iframes = Math.max(0, p.iframes - dt);
    p.invuln = Math.max(0, p.invuln - dt);
    p.castLock = Math.max(0, p.castLock - dt);
    p.block = Math.max(0, p.block - dt);
    p.parry = Math.max(0, p.parry - dt);
    p.poisonCoat = Math.max(0, p.poisonCoat - dt);
    if (p.stealth > 0) {
      p.stealth -= dt;
      if (p.stealth <= 0) this.recalc();
    }
    // 버프
    let changed = false;
    for (const k in p.buffs) {
      const b = p.buffs[k];
      b.t -= dt;
      if (b.regen) this.healPlayer(b.regen * dt, false);
      if (b.t <= 0) {
        delete p.buffs[k];
        changed = true;
      }
    }
    if (changed) this.recalc();
    // 지연 타격
    for (const ph of p.pendingHit) ph.t -= dt;
    const due = p.pendingHit.filter((h) => h.t <= 0);
    p.pendingHit = p.pendingHit.filter((h) => h.t > 0);
    due.forEach((h) => h.fn());
    // 상태이상
    this.tickStatus(p, dt);
    // 재생
    p.regenAcc += dt;
    if (p.regenAcc >= 0.5) {
      const k = p.regenAcc;
      p.regenAcc = 0;
      const inCombat = this.enemies.some((e) => e.aggro && !e.dead);
      p.mp = Math.min(d.maxMp, p.mp + d.mpRegen * k * (inCombat ? 1 : 2.5));
      if (!inCombat || this.map.safe) this.healPlayer(d.hpRegen * k * (this.map.safe ? 8 : 2), false);
      else this.healPlayer(d.hpRegen * k * 0.3, false);
    }
    p.stRegenDelay = Math.max(0, p.stRegenDelay - dt);
    if (p.stRegenDelay <= 0) p.st = Math.min(d.maxSt, p.st + 32 * dt);

    // 오크 패시브 상태 변화 감지
    if (this.hero.race === 'orc') {
      const low = p.hp / p.maxHp <= 0.3;
      if (low !== (p as any)._orcLow) {
        (p as any)._orcLow = low;
        this.recalc();
        if (low) this.ui.toast('전사의 피가 끓어오른다! 공격력 +20%', '#ff7a5a');
      }
    }

    // 그림자 난무
    if (p.shadowDance > 0) {
      p.shadowDance -= dt;
      p.shadowTick -= dt;
      p.invuln = Math.max(p.invuln, 0.05);
      if (p.shadowTick <= 0) {
        p.shadowTick = 0.12;
        const sk = this.skill('shadow_dance');
        const near = this.enemies.filter((e) => !e.dead && DIST(e, p) < sk.range);
        if (near.length) {
          const e = near[(Math.random() * near.length) | 0];
          const a = Math.random() * Math.PI * 2;
          p.x = e.x + Math.cos(a) * (e.r + 6);
          p.y = e.y + Math.sin(a) * (e.r + 4);
          if (this.map.hits(p.x, p.y, p.r)) { p.x = e.x; p.y = e.y + e.r + 4; }
          p.flip = e.x < p.x;
          this.slashFx(e.x, e.y - 8, Math.random() * 6, '#c37bff');
          this.hitEnemy(e, this.skillDmg(sk), { element: 'dark', knock: 0, hitstop: 0.02 });
        }
      }
      return;
    }
    // 돌진 베기
    if (p.dash) {
      const ds = p.dash;
      ds.t -= dt;
      const step = ds.speed * dt;
      this.moveActor(p, ds.dx * step, ds.dy * step);
      this.parts.push({ x: p.x, y: p.y - 10, z: 0, vx: 0, vy: 0, vz: 0, life: 0.25, max: 0.25, color: '#fdf7ed', size: 1, kind: 'sprite', sprite: this.playerFrame(), ang: p.flip ? 1 : 0 });
      for (const e of this.enemies) {
        if (e.dead || ds.hit.has(e)) continue;
        if (DIST(e, p) < e.r + 12) {
          ds.hit.add(e);
          this.hitEnemy(e, ds.dmg, { knock: 90, kx: ds.dx, ky: ds.dy, hitstop: 0.06 });
        }
      }
      if (ds.t <= 0) p.dash = null;
      return;
    }
    // 구르기
    if (p.roll) {
      p.roll.t -= dt;
      const sp = 190 * (p.roll.t > 0.12 ? 1 : 0.5);
      this.moveActor(p, p.roll.dx * sp * dt, p.roll.dy * sp * dt);
      p.flip = p.roll.dx < 0;
      if (p.roll.t <= 0) p.roll = null;
      return;
    }
    // 넉백
    if (Math.abs(p.kbx) + Math.abs(p.kby) > 1) {
      this.moveActor(p, p.kbx * dt, p.kby * dt);
      p.kbx *= Math.pow(0.002, dt);
      p.kby *= Math.pow(0.002, dt);
    }
    this.updateLock();
    if (!p.canAct) return;

    // 목표 처리
    let mvx = 0, mvy = 0;
    const tgt = p.target;
    if (tgt instanceof Enemy) {
      if (tgt.dead) p.target = this.nextTarget();
      else {
        const range = CLASSES[this.hero.cls].basic.range + tgt.r;
        const dd = DIST(tgt, p);
        const ranged = CLASSES[this.hero.cls].basic.kind !== 'melee';
        const canSee = !ranged || this.map.los(p.x, p.y - 8, tgt.x, tgt.y - 8);
        if (dd > range || !canSee) {
          if (!p.path.length || (p as any)._repathT <= 0) {
            this.pathTo(tgt.x, tgt.y);
            (p as any)._repathT = 0.3;
          }
          (p as any)._repathT -= dt;
        } else {
          p.path = [];
          p.flip = tgt.x < p.x;
          if (p.atkT <= 0 && p.castLock <= 0) this.basicAttack(tgt);
        }
      }
    } else if (tgt instanceof NpcEnt) {
      if (DIST(tgt, p) < 22) {
        p.path = [];
        p.target = null;
        p.flip = tgt.x < p.x;
        this.ui.talk(tgt);
      }
    }
    const cg = (p as any).chestGoal as import('./tilemap').Chest | null;
    if (cg && Math.hypot(cg.x * TS + 8 - p.x, cg.y * TS + 8 - p.y) < 22) {
      (p as any).chestGoal = null;
      p.path = [];
      this.openChest(cg);
    }

    const kd = this.keyDir();
    if (kd) {
      // 방향키 이동: 클릭 이동과 자동 추격을 멈추고 직접 움직인다
      mvx = kd[0];
      mvy = kd[1];
      p.path = [];
      if (p.target instanceof Enemy) p.target = null;
    } else if (p.holdDir && !(p.target instanceof Enemy)) {
      mvx = p.holdDir[0];
      mvy = p.holdDir[1];
    } else if (p.path.length) {
      const [gx, gy] = p.path[0];
      const dx = gx - p.x, dy = gy - p.y;
      const dd = Math.hypot(dx, dy);
      if (dd < 3) p.path.shift();
      else {
        mvx = dx / dd;
        mvy = dy / dd;
      }
    }
    if (p.castLock > 0) mvx = mvy = 0;
    const sp = this.der.ms * p.slowMul * (p.block > 0 ? 0.4 : 1);
    p.moving = (mvx !== 0 || mvy !== 0) && p.canMove;
    if (p.moving) {
      const ox = p.x, oy = p.y;
      this.moveActor(p, mvx * sp * dt, mvy * sp * dt);
      if (Math.abs(mvx) > 0.2 && p.swingT <= 0) p.flip = mvx < 0;
      if (Math.hypot(p.x - ox, p.y - oy) < sp * dt * 0.1 && p.path.length) {
        // 막힘 → 다시 길찾기
        const g = p.path[p.path.length - 1];
        this.pathTo(g[0], g[1]);
      }
      p.stepT -= dt;
      if (p.stepT <= 0) {
        p.stepT = 0.28;
        this.parts.push({ x: p.x + (Math.random() * 4 - 2), y: p.y, z: 0, vx: 0, vy: -3, vz: 0, life: 0.4, max: 0.4, color: this.map.dark ? '#3d3438' : '#c6a37e', size: 1, kind: 'smoke' });
      }
    }
    this.pushApart();
  }

  moveActor(a: Actor, dx: number, dy: number): void {
    const m = this.map;
    const n = Math.max(1, Math.ceil(Math.max(Math.abs(dx), Math.abs(dy)) / 4));
    for (let i = 0; i < n; i++) {
      const sx = dx / n, sy = dy / n;
      if (!m.hits(a.x + sx, a.y, a.r)) a.x += sx;
      if (!m.hits(a.x, a.y + sy, a.r)) a.y += sy;
    }
  }

  pushApart(): void {
    const p = this.p;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = DIST(e, p);
      const min = e.r + p.r - 2;
      if (d < min && d > 0.01) {
        const k = (min - d) / d;
        const ex = (e.x - p.x) * k, ey = (e.y - p.y) * k;
        if (e.boss) this.moveActor(p, -ex, -ey);
        else {
          this.moveActor(p, -ex * 0.5, -ey * 0.5);
          this.moveActor(e, ex * 0.5, ey * 0.5);
        }
      }
    }
  }

  playerFrame(): string {
    const p = this.p;
    const base = p.sprite;
    const kind = p.flash > 0.05 ? 'hit' : p.moving || p.roll || p.dash ? 'run' : 'idle';
    const fr = anim(base, kind);
    if (!fr.length) return base + '_idle_anim_f0';
    return fr[Math.floor(p.animT * (kind === 'run' ? 12 : 6)) % fr.length];
  }

  // ── 멀티플레이 ───────────────────────────────────────────────
  /** 몬스터가 노릴 플레이어: 나 또는 같은 지역의 다른 플레이어 중 가까운 쪽 */
  aiTarget(e: Enemy): { x: number; y: number; r: number; dead: boolean; stealth: number; remote?: string } {
    const p = this.p;
    let best: { x: number; y: number; r: number; dead: boolean; stealth: number; remote?: string } = { x: p.x, y: p.y, r: p.r, dead: p.dead, stealth: p.stealth };
    let bd = p.dead || p.stealth > 0 ? 1e9 : DIST(e, p);
    const stick = (e as any).aiRemote as string | undefined;
    for (const r of this.coop.targets()) {
      const d = Math.hypot(r.x - e.x, r.y - e.y) - (r.id === stick ? 24 : 0);
      if (d < bd) { bd = d; best = { x: r.x, y: r.y, r: 5, dead: false, stealth: 0, remote: r.id }; }
    }
    (e as any).aiRemote = best.remote;
    return best;
  }

  bossEngaged(e: Enemy): void {
    this.boss = e;
    this.ui.bossBar(e);
    music('boss');
    this.ui.big(e.d.name, e.d.intro ?? '');
  }

  /** 방장: 참가자가 때린 피해 적용 */
  applyRemoteHit(e: Enemy, m: { base: number; element: Element; knock: number; kx?: number; ky?: number; crit: boolean; status?: [StatusId, number, number?] }): void {
    const mul = this.elemMul(e, m.element) * (m.crit ? 1.5 : 1) * (0.95 + Math.random() * 0.1);
    const dmg = Math.max(1, Math.round((m.base - e.d.def * 0.5) * mul));
    e.hp -= dmg;
    e.flash = 0.12;
    e.hpBarT = 3;
    e.aggro = true;
    this.text(e.x + (Math.random() * 8 - 4), e.y - 16 * e.scale - 6, dmg + (m.crit ? '!' : ''), '#c6e4ff', m.crit);
    const kb = (m.knock ?? 20) * (e.boss ? 0.15 : 1);
    if (kb > 0 && m.kx !== undefined && m.ky !== undefined) { e.kbx = m.kx * kb * 4; e.kby = m.ky * kb * 4; }
    if (m.status) this.applyStatus(e, m.status[0], m.status[1], m.status[2]);
    this.checkDeath(e);
  }

  /** 다른 플레이어의 기술 연출 */
  remoteFx(k: string, x: number, y: number, a: number, r: number): void {
    if (k === 'slash' || k === 'slash2') this.slashFx(x, y, a, k === 'slash2' ? '#ffe9a8' : '#fdf7ed', k === 'slash2');
    else if (k === 'meteor' || k === 'boom') this.explosion(x, y, r, 'fire');
    else if (k === 'hammer') this.hammerFx(x, y);
    else if (k === 'thorn') this.thornFx(x, y);
    else if (k === 'crack') this.crackFx({ x, y, shape: { k: 'cone', r, ang: a, spread: 0.75 }, t: 0, total: 0, team: 'player', dmg: 0, element: 'phys' });
    else this.ringFx(x, y, r, '#fdf7ed');
  }

  /** 방장과 다른 지역이 됐다: 내 몬스터로 돌아간다 */
  leaveSharedWorld(): void {
    this.enemies = [];
    this.hazards = this.hazards.filter((h) => !(h as any).remote);
    this.projs = this.projs.filter((p) => !(p as any).remote);
    this.boss = null;
    this.ui.bossBar(null);
    for (const s of this.map.spawns) {
      if (s.tag === 'boss' && this.bossDefeated(s.id)) continue;
      this.enemies.push(new Enemy(ENEMIES[s.id], s.x, s.y, s));
    }
  }

  // ── 키보드 이동 · 적 인식 ───────────────────────────────────────
  keyDir(): [number, number] | null {
    const k = this.moveKeys;
    const x = (k.has('right') ? 1 : 0) - (k.has('left') ? 1 : 0);
    const y = (k.has('down') ? 1 : 0) - (k.has('up') ? 1 : 0);
    if (!x && !y) return null;
    const d = Math.hypot(x, y);
    return [x / d, y / d];
  }

  /** 인식 가능한 적: 가까운 순서 */
  lockCandidates(range = 170): Enemy[] {
    const p = this.p;
    return this.enemies
      .filter((e) => !e.dead && DIST(e, p) < range && this.map.los(p.x, p.y - 8, e.x, e.y - 8))
      .sort((a, b) => DIST(a, p) - DIST(b, p));
  }

  updateLock(): void {
    const p = this.p;
    if (p.lock && (p.lock.dead || DIST(p.lock, p) > 200)) p.lock = null;
    if (p.target instanceof Enemy && !p.target.dead) p.lock = p.target;
    if (!p.lock && keySettings.autoTarget) p.lock = this.lockCandidates(140)[0] ?? null;
  }

  /** 공격 키: 인식한 적(없으면 가장 가까운 적)을 쫓아가 공격 */
  attackKey(): void {
    const p = this.p;
    if (!p || p.dead) return;
    this.kbAim = true;
    let t = p.lock && !p.lock.dead ? p.lock : null;
    if (!t) t = this.lockCandidates()[0] ?? null;
    if (!t) { this.ui.toast('주변에 공격할 적이 없다', '#ff9'); return; }
    p.lock = t;
    p.target = t;
    p.path = [];
  }

  /** 다른 적 인식: 가까운 순서로 돌아가며 바꾼다 */
  cycleTarget(): void {
    const p = this.p;
    if (!p || p.dead) return;
    this.kbAim = true;
    const list = this.lockCandidates();
    if (!list.length) { p.lock = null; this.ui.toast('주변에 인식할 적이 없다', '#ff9'); return; }
    const i = p.lock ? list.indexOf(p.lock) : -1;
    p.lock = list[(i + 1) % list.length];
    if (p.target instanceof Enemy) p.target = p.lock;
    sfx('ui');
  }

  // ── 공격 ────────────────────────────────────────────────────────
  aimPoint(range = 200): [number, number] {
    const p = this.p;
    if (!this.touch && !this.kbAim) return [this.mouse.wx, this.mouse.wy];
    // 터치·키보드: 현재 대상 → 인식한 적 → 가장 가까운 적 → 바라보는 방향
    let t: Enemy | null = p.target instanceof Enemy && !p.target.dead ? p.target : p.lock && !p.lock.dead ? p.lock : null;
    if (!t) {
      let bd = range;
      for (const e of this.enemies) if (!e.dead && DIST(e, p) < bd) { bd = DIST(e, p); t = e; }
    }
    if (t) return [t.x, t.y - 6];
    return [p.x + (p.flip ? -40 : 40), p.y - 6];
  }

  basicAttack(t: Enemy): void {
    const p = this.p;
    const c = CLASSES[this.hero.cls];
    const b = c.basic;
    p.atkT = b.interval / this.der.aspd;
    p.aimAng = ANG(p.x, p.y - 8, t.x, t.y - 8);
    p.swingT = p.swingDur = Math.min(0.22, p.atkT * 0.8);
    p.combo = (p.combo % b.combo) + 1;
    p.comboT = 0.9;
    const finisher = p.combo === b.combo && b.combo > 1;
    if (b.kind === 'melee') {
      sfx('swing');
      const ang = p.aimAng;
      const dmgBase = this.attackPower(false) * (finisher ? 1.5 : 1);
      p.pendingHit.push({
        t: 0.07,
        fn: () => {
          const reach = b.range + 8;
          let hitAny = false;
          for (const e of this.enemies) {
            if (e.dead) continue;
            const d = DIST(e, p);
            if (d > reach + e.r) continue;
            let da = Math.abs(((ANG(p.x, p.y - 6, e.x, e.y - 6) - ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
            if (d < e.r + 6) da = 0;
            if (da > 1.2) continue;
            hitAny = true;
            const extra = this.hero.cls === 'cleric' ? 0.35 : 0;
            this.hitEnemy(e, dmgBase, { element: 'phys', knock: finisher ? 80 : 25, hitstop: finisher ? 0.08 : 0.04, backstab: this.hero.cls === 'rogue' });
            if (extra && !e.dead) this.hitEnemy(e, this.attackPower(true) * extra, { element: 'holy', knock: 0, silentHitstop: true, color: '#ffe48a' });
            if (p.poisonCoat > 0 && !e.dead) this.applyStatus(e, 'poison', 3, this.attackPower(false) * 0.35);
          }
          this.slashFx(p.x + Math.cos(ang) * 12, p.y - 8 + Math.sin(ang) * 10, ang, finisher ? '#ffe9a8' : '#fdf7ed', finisher);
          this.coop.sendFx(finisher ? 'slash2' : 'slash', p.x + Math.cos(ang) * 12, p.y - 8 + Math.sin(ang) * 10, ang);
          if (!hitAny) p.combo = finisher ? 0 : p.combo;
        },
      });
    } else if (b.kind === 'bolt') {
      sfx('bolt');
      this.shoot(p.x, p.y - 12, t.x, t.y - 8, { speed: 200, dmg: this.attackPower(true) * 0.9, kind: 'orb', sprite: 'fx_orb_blue', element: 'light', magic: true, homing: t });
    } else {
      sfx('arrow');
      this.shoot(p.x, p.y - 10, t.x, t.y - 8, { speed: 280, dmg: this.attackPower(false), kind: 'arrow', sprite: 'weapon_arrow', element: 'phys' });
    }
  }

  attackPower(magic: boolean): number {
    let a = magic ? this.der.matk : this.der.patk;
    if (this.hero.race === 'demon') a *= 1.15;
    return a;
  }

  shoot(x: number, y: number, tx: number, ty: number, o: { speed: number; dmg: number; kind: Projectile['kind']; sprite: string; element: Element; magic?: boolean; pierce?: number; explode?: number; status?: Projectile['status']; team?: 'player' | 'enemy'; owner?: Enemy | Player; spread?: number; r?: number; life?: number; homing?: Enemy; knock?: number; crit?: boolean }): Projectile {
    const a = ANG(x, y, tx, ty) + (o.spread ?? 0);
    const pr: Projectile = {
      x, y, vx: Math.cos(a) * o.speed, vy: Math.sin(a) * o.speed, team: o.team ?? 'player', dmg: o.dmg, r: o.r ?? 4,
      life: o.life ?? 1.2, sprite: o.sprite, kind: o.kind, element: o.element, pierce: o.pierce ?? 0, hit: new Set(),
      explode: o.explode, status: o.status, owner: o.owner ?? (o.team === 'enemy' ? undefined : this.p), magic: o.magic, knock: o.knock ?? 20, crit: o.crit,
    };
    if (o.homing) (pr as any).homing = o.homing;
    this.projs.push(pr);
    if (pr.team === 'player' && this.coop.on) this.coop.sendVisualProjectile(pr);
    return pr;
  }

  // ── 스킬 ───────────────────────────────────────────────────────
  skill(id: string): SkillData {
    return CLASSES[this.hero.cls].skills.find((s) => s.id === id)!;
  }
  skillLv(s: SkillData): number {
    return this.hero.skillLv[s.id] ?? 0;
  }
  skillDmg(s: SkillData): number {
    const lv = Math.max(1, this.skillLv(s));
    const magic = this.hero.cls === 'mage' || this.hero.cls === 'cleric';
    return this.attackPower(magic) * s.coeff * (1 + (lv - 1) * 0.15);
  }

  castSkill(i: number): void {
    const p = this.p;
    if (!p || p.dead || !p.canAct || p.dash || p.shadowDance > 0) return;
    const s = CLASSES[this.hero.cls].skills[i];
    if (!s) return;
    const lv = this.skillLv(s);
    if (lv <= 0) {
      this.ui.toast(this.hero.level < s.unlock ? `${s.name}: 레벨 ${s.unlock}에 배울 수 있다` : `${s.name}: 스킬 포인트로 배워야 한다 (K)`, '#ff9');
      sfx('deny');
      return;
    }
    if ((p.cds[s.id] ?? 0) > 0) { sfx('deny'); return; }
    if (p.has('silence')) { this.ui.toast('침묵 상태라 스킬을 쓸 수 없다', '#c37bff'); sfx('deny'); return; }
    if (p.mp < s.mp) { this.ui.toast('마나가 부족하다', '#6af'); sfx('deny'); return; }
    let [ax, ay] = this.aimPoint(s.range + 40);
    const ang = ANG(p.x, p.y - 8, ax, ay);
    const dist = Math.hypot(ax - p.x, ay - p.y);
    if (s.shape === 'point' && dist > s.range) {
      ax = p.x + Math.cos(ang) * s.range;
      ay = p.y - 8 + Math.sin(ang) * s.range;
    }
    const ok = this.doSkill(s, ax, ay, ang);
    if (ok === false) return;
    p.mp -= s.mp;
    p.cds[s.id] = s.cd * (1 - Math.min(0.3, (lv - 1) * 0.04));
    p.flip = Math.cos(ang) < 0;
    p.aimAng = ang;
    if (p.stealth > 0 && s.id !== 'smoke') { p.stealth = 0; this.recalc(); }
    this.ui.hudDirty();
  }

  doSkill(s: SkillData, ax: number, ay: number, ang: number): boolean | void {
    const p = this.p;
    const dmg = this.skillDmg(s);
    const C = Math.cos(ang), S = Math.sin(ang);
    switch (s.id) {
      // ── 전사 ──
      case 'block':
        p.block = 1.2;
        p.parry = 0.3;
        p.path = [];
        sfx('block');
        break;
      case 'dash_slash':
        sfx('dash');
        p.dash = { t: s.range / 320, dx: C, dy: S, speed: 320, hit: new Set(), dmg };
        p.invuln = Math.max(p.invuln, s.range / 320);
        p.path = [];
        p.target = null;
        break;
      case 'war_cry':
        sfx('roar');
        this.addBuff('war_cry', { t: 8, max: 8, name: '전투 함성', defPct: 40, icon: 'i_shield_iron' });
        for (const e of this.enemies) if (!e.dead && DIST(e, p) < 120) { e.aggro = true; e.taunted = 3; }
        this.ringFx(p.x, p.y - 8, 60, '#ffd36a');
        this.shake(3);
        break;
      case 'earth_split': {
        sfx('boom');
        p.castLock = 0.35;
        p.swingT = p.swingDur = 0.3;
        this.hazards.push({ x: p.x, y: p.y - 4, shape: { k: 'cone', r: s.range, ang, spread: 0.75 }, t: 0.15, total: 0.15, team: 'player', dmg, element: 'phys', status: ['stun', 0.8], knock: 70, owner: p, fx: 'crack', silent: true });
        break;
      }
      // ── 도적 ──
      case 'ambush': {
        let best: Enemy | null = null, bd = 60;
        for (const e of this.enemies) {
          if (e.dead || DIST(e, p) > s.range) continue;
          const d = Math.hypot(e.x - ax, e.y - ay);
          if (d < bd) { bd = d; best = e; }
        }
        if (!best && p.target instanceof Enemy && !p.target.dead && DIST(p.target, p) < s.range) best = p.target;
        if (!best) { this.ui.toast('암습할 대상이 없다', '#ff9'); sfx('deny'); return false; }
        const e = best;
        const back = e.x < p.x ? -1 : 1; // 적이 플레이어를 보는 반대편
        const bx = e.x + back * (e.r + 6), by = e.y;
        this.smokeFx(p.x, p.y - 8, '#5f2d56');
        if (!this.map.hits(bx, by, p.r)) { p.x = bx; p.y = by; } else { p.x = e.x - back * (e.r + 6); }
        p.flip = e.x < p.x;
        sfx('teleport');
        this.smokeFx(p.x, p.y - 8, '#5f2d56');
        p.target = e;
        p.atkT = 0.3;
        p.swingT = p.swingDur = 0.18;
        p.aimAng = ANG(p.x, p.y, e.x, e.y);
        this.hitEnemy(e, dmg, { crit: true, knock: 40, hitstop: 0.1 });
        break;
      }
      case 'poison':
        sfx('buff');
        p.poisonCoat = 10;
        this.addBuff('poison_coat', { t: 10, max: 10, name: '독 바르기', icon: 'flask_green' });
        break;
      case 'smoke':
        sfx('boom');
        p.stealth = 3;
        p.nextCrit = true;
        this.recalc();
        for (const e of this.enemies) if (e.aggro) { e.aggro = false; e.state = 'return'; }
        for (let i = 0; i < 24; i++) this.smokeFx(p.x + (Math.random() * 30 - 15), p.y - 6 + (Math.random() * 16 - 8), '#7b8994');
        break;
      case 'shadow_dance':
        if (!this.enemies.some((e) => !e.dead && DIST(e, p) < s.range)) { this.ui.toast('주변에 적이 없다', '#ff9'); sfx('deny'); return false; }
        sfx('dash');
        p.shadowDance = 1.2;
        p.shadowTick = 0;
        p.path = [];
        break;
      // ── 마법사 ──
      case 'fireball':
        sfx('fire');
        this.shoot(p.x, p.y - 12, ax, ay, { speed: 170, dmg, kind: 'orb', sprite: 'fx_orb_fire', element: 'fire', magic: true, explode: 30, status: ['burn', 3, dmg * 0.12], life: s.range / 170 });
        break;
      case 'frost_zone':
        sfx('ice');
        this.zones.push({ x: ax, y: ay + 8, r: 36, t: 4, total: 4, team: 'player', kind: 'frost', tick: 0, dmg, element: 'ice' });
        break;
      case 'blink': {
        const tx = p.x + C * Math.min(s.range, Math.hypot(ax - p.x, ay - p.y + 8));
        const ty = p.y + S * Math.min(s.range, Math.hypot(ax - p.x, ay - p.y + 8));
        if (!this.blinkTo(tx, ty)) { sfx('deny'); return false; }
        break;
      }
      case 'meteor':
        sfx('fire');
        p.castLock = 0.4;
        for (let i = 0; i < 7; i++) {
          const a = Math.random() * Math.PI * 2, r = i === 0 ? 0 : 12 + Math.random() * 34;
          const mx = ax + Math.cos(a) * r, my = ay + 8 + Math.sin(a) * r * 0.8;
          const delay = 0.45 + i * 0.18;
          this.hazards.push({ x: mx, y: my, shape: { k: 'circle', r: 22 }, t: delay, total: delay, team: 'player', dmg, element: 'fire', status: ['burn', 3, dmg * 0.08], knock: 40, owner: p, fx: 'meteor', magic: true });
        }
        break;
      // ── 궁수 ──
      case 'triple':
        sfx('arrow');
        for (const sp of [-0.22, 0, 0.22]) this.shoot(p.x, p.y - 10, ax, ay, { speed: 300, dmg, kind: 'arrow', sprite: 'weapon_arrow', element: 'phys', spread: sp, pierce: 1 });
        break;
      case 'trap':
        sfx('ui');
        this.zones.push({ x: ax, y: ay + 8, r: 10, t: 20, total: 20, team: 'player', kind: 'trap', tick: 0, dmg, element: 'phys', armed: true });
        break;
      case 'back_shot': {
        sfx('roll');
        p.roll = { t: 0.25, dx: -C, dy: -S };
        p.iframes = 0.25;
        p.pendingHit.push({ t: 0.12, fn: () => { sfx('arrow'); this.shoot(p.x, p.y - 10, p.x + C * 100, p.y - 10 + S * 100, { speed: 340, dmg, kind: 'arrow', sprite: 'weapon_arrow', element: 'phys', pierce: 3, knock: 60 }); } });
        break;
      }
      case 'arrow_rain':
        sfx('arrow');
        this.zones.push({ x: ax, y: ay + 8, r: 44, t: 3, total: 3, team: 'player', kind: 'rain', tick: 0, dmg, element: 'phys' });
        break;
      // ── 성직자 ──
      case 'heal': {
        const amt = (30 + this.der.stats.wis * 6 + this.der.maxHp * 0.12) * (1 + (this.skillLv(s) - 1) * 0.15);
        this.healPlayer(amt, true);
        sfx('heal');
        for (let i = 0; i < 16; i++) this.parts.push({ x: p.x + (Math.random() * 16 - 8), y: p.y, z: Math.random() * 6, vx: 0, vy: 0, vz: 20 + Math.random() * 20, life: 0.8, max: 0.8, color: Math.random() < 0.5 ? '#97da3f' : '#fdf7ed', size: 1, kind: 'cross' });
        break;
      }
      case 'barrier':
        sfx('holy');
        p.invuln = 1.5;
        this.addBuff('barrier', { t: 1.5, max: 1.5, name: '성스러운 방벽', icon: 'i_holy_book' });
        break;
      case 'purify': {
        sfx('holy');
        let cured = 0;
        for (const k of Object.keys(p.status) as StatusId[]) if (p.has(k)) { cured++; delete p.status[k]; }
        this.healPlayer(20 + this.der.stats.wis * 2, true);
        this.ringFx(p.x, p.y - 6, s.range, '#facb3e');
        for (const e of this.enemies) if (!e.dead && DIST(e, p) < s.range + e.r) this.hitEnemy(e, dmg, { element: 'holy', knock: 50 });
        if (cured) this.ui.toast(`상태이상 ${cured}개 해제`, '#fdf7ed');
        break;
      }
      case 'judgment':
        sfx('holy');
        p.castLock = 0.3;
        this.hazards.push({ x: ax, y: ay + 8, shape: { k: 'circle', r: 40 }, t: 0.55, total: 0.55, team: 'player', dmg, element: 'holy', status: ['stun', 1.2], knock: 50, owner: p, fx: 'hammer', magic: true });
        break;
    }
  }

  blinkTo(tx: number, ty: number): boolean {
    const p = this.p;
    // 벽 안이면 가까운 쪽으로 당긴다
    for (let k = 0; k < 12; k++) {
      if (!this.map.hits(tx, ty, p.r)) break;
      tx += (p.x - tx) * 0.2;
      ty += (p.y - ty) * 0.2;
    }
    if (this.map.hits(tx, ty, p.r)) return false;
    this.teleportFx(p.x, p.y);
    p.x = tx;
    p.y = ty;
    p.path = [];
    this.teleportFx(p.x, p.y);
    sfx('teleport');
    return true;
  }

  raceSkill(): void {
    const p = this.p;
    if (!p || p.dead || !p.canAct) return;
    const r = RACES[this.hero.race];
    if ((p.cds.race ?? 0) > 0) { sfx('deny'); return; }
    switch (this.hero.race) {
      case 'human':
        sfx('buff');
        this.addBuff('will', { t: 3, max: 3, name: '불굴의 의지', dmgRed: 0.3, icon: 'i_shield_red' });
        this.ringFx(p.x, p.y - 8, 24, '#facb3e');
        break;
      case 'elf': {
        const [ax, ay] = this.aimPoint(80);
        const a = ANG(p.x, p.y, ax, ay + 8);
        if (!this.blinkTo(p.x + Math.cos(a) * 56, p.y + Math.sin(a) * 56)) return;
        for (let i = 0; i < 10; i++) this.parts.push({ x: p.x, y: p.y - 8, z: 0, vx: Math.random() * 60 - 30, vy: Math.random() * 60 - 30, vz: 0, life: 0.5, max: 0.5, color: '#97da3f', size: 1, kind: 'spark' });
        break;
      }
      case 'dwarf':
        sfx('fire');
        this.addBuff('forge', { t: 5, max: 5, name: '용광로 심장', regen: (this.der.maxHp * 0.3) / 5, icon: 'flask_big_red' });
        break;
      case 'orc':
        sfx('roar');
        this.shake(5);
        this.ringFx(p.x, p.y - 8, 56, '#da4e38');
        for (const e of this.enemies) if (!e.dead && DIST(e, p) < 56 + e.r) this.applyStatus(e, 'stun', e.boss ? 0.6 : 1.5);
        this.addBuff('roar', { t: 6, max: 6, name: '분노의 함성', atkPct: 20, icon: 'weapon_axe' });
        break;
      case 'demon': {
        const cost = this.der.maxHp * 0.2;
        if (p.hp <= cost + 1) { this.ui.toast('HP가 부족해 계약할 수 없다', '#f66'); sfx('deny'); return; }
        p.hp -= cost;
        p.mp = this.der.maxMp;
        sfx('teleport');
        this.text(p.x, p.y - 26, '-' + Math.round(cost), '#c37bff', false);
        for (let i = 0; i < 18; i++) this.parts.push({ x: p.x + Math.random() * 20 - 10, y: p.y, z: 0, vx: 0, vy: 0, vz: 30 + Math.random() * 30, life: 0.7, max: 0.7, color: i % 2 ? '#9f294e' : '#5698cc', size: 1, kind: 'spark' });
        break;
      }
    }
    p.cds.race = r.active.cd;
    this.ui.hudDirty();
  }

  addBuff(id: string, b: Buff): void {
    this.p.buffs[id] = b;
    this.recalc();
    this.ui.hudDirty();
  }

  doRoll(): void {
    const p = this.p;
    if (!p || p.dead || !p.canMove || p.roll || p.dash || p.shadowDance > 0 || p.rollCd > 0) return;
    if (p.st < 25) { this.ui.toast('스태미나가 부족하다', '#ffd36a'); sfx('deny'); return; }
    p.st -= 25;
    p.stRegenDelay = 0.6;
    const [ax, ay] = this.touch || this.kbAim ? [p.x + (p.flip ? -1 : 1) * 40, p.y] : [this.mouse.wx, this.mouse.wy];
    let dx = ax - p.x, dy = ay - p.y;
    const kd = this.keyDir();
    if (kd) { dx = kd[0]; dy = kd[1]; }
    if (this.touch && p.path.length) { dx = p.path[0][0] - p.x; dy = p.path[0][1] - p.y; }
    const d = Math.hypot(dx, dy) || 1;
    p.roll = { t: 0.3, dx: dx / d, dy: dy / d };
    p.iframes = 0.2; // 무적 프레임 0.2초 (기획서 6.1)
    p.rollCd = 0.35;
    p.path = [];
    p.block = 0;
    sfx('roll');
  }

  useQuick(i: number): void {
    const id = this.hero.quick[i];
    if (!id) return;
    this.useItem(id);
  }

  useItem(id: string): void {
    const c = CONSUMABLES[id];
    const p = this.p;
    if (!c || p.dead) return;
    if (countOf(this.hero, 'use', id) <= 0) { this.ui.toast(`${c.name}이(가) 없다`, '#f99'); sfx('deny'); return; }
    if ((p.cds['item_' + id] ?? 0) > 0) return;
    if (c.recall) {
      if (this.map.id === HOME[this.hero.race].map) { this.ui.toast('이미 고향 마을에 있다', '#ff9'); return; }
      if (this.boss && !this.boss.dead && this.boss.aggro) { this.ui.toast('보스전 중에는 귀환할 수 없다!', '#f66'); return; }
      removeCount(this.hero, 'use', id, 1);
      this.travel(HOME[this.hero.race].map, 'statue');
      this.ui.hudDirty();
      return;
    }
    if (c.bomb) {
      const [ax, ay] = this.aimPoint(120);
      this.hazards.push({ x: ax, y: ay + 8, shape: { k: 'circle', r: 28 }, t: 0.6, total: 0.6, team: 'player', dmg: 40 + this.hero.level * 12, element: 'fire', knock: 70, owner: p, fx: 'boom' });
    }
    removeCount(this.hero, 'use', id, 1);
    p.cds['item_' + id] = 0.5;
    sfx('potion');
    if (c.heal) this.healPlayer(c.heal, true);
    if (c.mana) { p.mp = Math.min(this.der.maxMp, p.mp + c.mana); this.text(p.x, p.y - 30, '+' + c.mana, '#6ab8ff', false); }
    if (c.cure) for (const k of ['poison', 'burn', 'slow'] as StatusId[]) delete p.status[k];
    if (c.buff) this.addBuff('food', { t: c.buff.dur, max: c.buff.dur, name: c.name, atkPct: c.buff.atkPct, icon: c.icon });
    this.ui.hudDirty();
  }

  healPlayer(n: number, show: boolean): void {
    const p = this.p;
    if (p.dead) return;
    const before = p.hp;
    p.hp = Math.min(this.der.maxHp, p.hp + n);
    if (show && p.hp - before >= 1) this.text(p.x, p.y - 30, '+' + Math.round(p.hp - before), '#7bf06a', false);
  }

  // ── 피해 ───────────────────────────────────────────────────────
  elemMul(e: Enemy, el: Element): number {
    if (e.d.weak?.includes(el)) return 1.5;
    if (e.d.resist?.includes(el)) return 0.5;
    return 1;
  }

  hitEnemy(e: Enemy, base: number, o: { element?: Element; knock?: number; kx?: number; ky?: number; crit?: boolean; hitstop?: number; backstab?: boolean; silentHitstop?: boolean; color?: string; status?: [StatusId, number, number?]; noCrit?: boolean } = {}): void {
    if (e.dead) return;
    const p = this.p;
    const el = o.element ?? 'phys';
    let crit = !!o.crit || (!o.noCrit && Math.random() < this.der.crit);
    if (p.nextCrit && !o.noCrit) { crit = true; p.nextCrit = false; }
    let extra = 1; // 백어택·성직자 언데드 추가 피해
    if (o.backstab) {
      const facingAway = (e.flip && p.x > e.x) || (!e.flip && p.x < e.x);
      if (facingAway) extra *= 1.3;
    }
    if (el === 'holy' && e.d.kind === 'undead' && this.hero.cls === 'cleric') extra *= 1.2;
    const mul = this.elemMul(e, el) * (crit ? 1.5 : 1) * (0.95 + Math.random() * 0.1) * extra;
    const dmg = Math.max(1, Math.round((base - e.d.def * 0.5) * mul));
    if (e.remote) {
      // 방장의 몬스터: 피해는 방장이 적용한다. 여기서는 보이기만.
      this.coop.sendHit(e, base * extra, { element: el, knock: o.knock ?? 20, kx: o.kx, ky: o.ky, crit, status: o.status });
      e.flash = 0.12;
      e.hpBarT = 3;
      this.text(e.x + (Math.random() * 8 - 4), e.y - 16 * e.scale - 6, dmg + (crit ? '!' : ''), crit ? '#ffd23e' : '#ffffff', crit || dmg > 80);
      if (!o.silentHitstop) { sfx(crit ? 'crit' : 'hit'); this.hitstop = Math.max(this.hitstop, (o.hitstop ?? 0.04)); }
      for (let i = 0; i < 4; i++) this.parts.push({ x: e.x, y: e.y - 8 * e.scale, z: 0, vx: Math.random() * 120 - 60, vy: Math.random() * 120 - 70, vz: 0, life: 0.25, max: 0.25, color: '#fdf7ed', size: 1, kind: 'spark', grav: 200 });
      return;
    }
    e.hp -= dmg;
    e.dmgTaken += dmg;
    e.flash = 0.12;
    e.hpBarT = 3;
    e.aggro = true;
    e.lastHitBy = this.time;
    const kb = (o.knock ?? 20) * (e.boss ? 0.15 : 1);
    if (kb > 0) {
      let kx = o.kx, ky = o.ky;
      if (kx === undefined || ky === undefined) {
        const a = ANG(p.x, p.y, e.x, e.y);
        kx = Math.cos(a);
        ky = Math.sin(a);
      }
      e.kbx = kx * kb * 4;
      e.kby = ky * kb * 4;
      if (kb > 40 && !e.boss && (e.state === 'windup')) { e.state = 'recover'; e.stT = 0.4; }
    }
    const big = crit || dmg > 80;
    const col = o.color ?? (crit ? '#ffd23e' : el === 'fire' ? '#ff9a4a' : el === 'ice' ? '#a8e4ff' : el === 'holy' ? '#ffe48a' : el === 'dark' ? '#d58bff' : el === 'poison' ? '#9be06a' : '#ffffff');
    this.text(e.x + (Math.random() * 8 - 4), e.y - 16 * e.scale - 6, (crit ? '' : '') + dmg + (crit ? '!' : ''), col, big);
    if (!o.silentHitstop) {
      sfx(crit ? 'crit' : 'hit');
      this.hitstop = Math.max(this.hitstop, (o.hitstop ?? 0.04) + (crit ? 0.03 : 0));
      if (crit) this.shake(2.5);
    }
    // 피격 불꽃
    for (let i = 0; i < (crit ? 10 : 5); i++)
      this.parts.push({ x: e.x, y: e.y - 8 * e.scale, z: 0, vx: Math.random() * 120 - 60, vy: Math.random() * 120 - 70, vz: 0, life: 0.25, max: 0.25, color: crit ? '#ffd23e' : '#fdf7ed', size: 1, kind: 'spark', grav: 200 });
    if (o.status) this.applyStatus(e, o.status[0], o.status[1], o.status[2]);
    this.checkDeath(e);
  }

  applyStatus(a: Actor, s: StatusId, t: number, dps?: number): void {
    if (a instanceof Enemy && a.remote) {
      this.coop.sendStatus(a, s, t, dps);
      a.status[s] = { t: Math.min(t, 0.5) };
      return;
    }
    if (a instanceof Enemy && a.boss && (s === 'stun' || s === 'root')) t *= 0.4;
    if (a instanceof Enemy && s === 'poison' && a.d.resist?.includes('poison')) return;
    const cur = a.status[s];
    if (cur && cur.t > t && (cur.dps ?? 0) >= (dps ?? 0)) return;
    a.status[s] = { t, dps, tick: 0.5 };
    if (a instanceof Enemy && (s === 'stun')) { a.state = 'recover'; a.stT = t; }
  }

  tickStatus(a: Actor, dt: number): void {
    for (const k of Object.keys(a.status) as StatusId[]) {
      const st = a.status[k]!;
      st.t -= dt;
      if (st.dps && !(a instanceof Enemy && a.remote)) {
        st.tick = (st.tick ?? 0.5) - dt;
        if (st.tick <= 0) {
          st.tick = 0.5;
          const n = Math.max(1, Math.round(st.dps * 0.5));
          if (a instanceof Enemy) {
            a.hp -= n;
            a.hpBarT = 2;
            this.text(a.x, a.y - 16 * a.scale - 4, String(n), k === 'poison' ? '#9be06a' : '#ff9a4a', false);
            if (!a.dead) this.checkDeath(a);
          } else if (a === this.p && !this.p.dead && this.p.invuln <= 0) {
            this.p.hp -= n;
            this.text(a.x, a.y - 30, '-' + n, k === 'poison' ? '#9be06a' : '#ff9a4a', false);
            if (this.p.hp <= 0) this.playerDie();
          }
        }
      }
      if (st.t <= 0) delete a.status[k];
    }
  }

  hurtPlayer(raw: number, o: { element?: Element; from?: { x: number; y: number }; knock?: number; status?: [StatusId, number, number?]; owner?: Enemy; unblockable?: boolean } = {}): boolean {
    const p = this.p;
    if (p.dead || this.fadeTo) return false;
    if (p.iframes > 0 || p.invuln > 0 || p.roll || p.dash) return false;
    // 회피율
    if (Math.random() < this.der.evade * 0.5) {
      this.text(p.x, p.y - 30, '회피', '#cfe8ff', false);
      return false;
    }
    let dmg = raw * 1.7 - this.der.def * 0.5;
    if (o.element === 'holy' && this.hero.race === 'demon') dmg *= 1.1;
    // 방패 막기 / 패링 (정면만)
    if (p.block > 0 && o.from && !o.unblockable) {
      const facing = p.flip ? -1 : 1;
      const front = (o.from.x - p.x) * facing > -4;
      if (front) {
        if (p.parry > 0 && o.owner) {
          sfx('parry');
          this.text(p.x, p.y - 32, '패링!', '#7fe3ff', true);
          this.applyStatus(o.owner, 'stun', 1.5);
          this.hitEnemy(o.owner, this.skillDmg(this.skill('block')), { knock: 60, crit: true, hitstop: 0.12 });
          this.slowmo = 0.25;
          p.block = 0;
          return false;
        }
        sfx('block');
        dmg *= 0.3;
        this.parts.push({ x: p.x + facing * 8, y: p.y - 10, z: 0, vx: 0, vy: 0, vz: 0, life: 0.2, max: 0.2, color: '#b6cbcf', size: 1, kind: 'ring', r: 6 });
      }
    }
    for (const b of Object.values(p.buffs)) if (b.dmgRed) dmg *= 1 - b.dmgRed;
    dmg = Math.max(1, Math.round(dmg * (0.95 + Math.random() * 0.1)));
    p.hp -= dmg;
    p.flash = 0.25;
    this.text(p.x, p.y - 30, '-' + dmg, '#ff5a5a', dmg > this.der.maxHp * 0.15);
    sfx('hurt');
    this.shake(Math.min(6, 2 + dmg / 20));
    this.hitstop = Math.max(this.hitstop, 0.05);
    if (o.from && (o.knock ?? 0) > 0) {
      const res = this.hero.race === 'dwarf' ? 0.3 : 1;
      const a = ANG(o.from.x, o.from.y, p.x, p.y);
      p.kbx = Math.cos(a) * (o.knock ?? 0) * 4 * res;
      p.kby = Math.sin(a) * (o.knock ?? 0) * 4 * res;
    }
    if (o.status) this.applyStatus(p, o.status[0], o.status[1], o.status[2]);
    if (p.stealth > 0) { p.stealth = 0; this.recalc(); }
    if (p.hp <= 0) this.playerDie();
    return true;
  }

  playerDie(): void {
    const p = this.p;
    if (p.dead) return;
    p.dead = true;
    p.hp = 0;
    p.deathT = 0;
    sfx('die');
    this.slowmo = 0.8;
    const lost = Math.floor(this.hero.gold * 0.1);
    this.hero.gold -= lost;
    (this as any).lostGold = lost;
    setTimeout(() => this.ui.onDeath(), 1400);
  }

  respawn(): void {
    const p = this.p;
    p.dead = false;
    p.status = {};
    p.buffs = {};
    this.recalc();
    p.hp = this.der.maxHp;
    p.mp = this.der.maxMp;
    p.st = 100;
    this.loadMap(HOME[this.hero.race].map, 'statue');
  }

  /** 체력이 0 이하(또는 항복·후퇴 지점)가 되면 처치 처리 */
  checkDeath(e: Enemy): void {
    if (!e.dead && e.hp <= e.maxHp * (e.d.retreatAt ?? 0)) this.killEnemy(e);
  }

  /** fromNet: 방장이 알려 준 처치 (참가자 쪽) */
  killEnemy(e: Enemy, fromNet = false): void {
    if (e.dead) return;
    if (!fromNet && this.coop.role === 'host') this.coop.sendKill(e);
    e.dead = true;
    e.deathT = 0;
    e.hp = 0;
    sfx('enemy_die');
    this.hero.kills++;
    for (let i = 0; i < 12; i++)
      this.parts.push({ x: e.x, y: e.y - 6, z: 0, vx: Math.random() * 80 - 40, vy: Math.random() * 40 - 30, vz: 0, life: 0.6, max: 0.6, color: e.d.kind === 'undead' ? '#d3bfa9' : e.d.kind === 'demon' ? '#9f294e' : '#8f4029', size: 1, kind: 'smoke' });
    // 경험치
    let xp = e.d.xp;
    const diff = this.hero.level - e.d.level;
    if (diff > 4) xp = Math.max(1, Math.round(xp * Math.max(0.2, 1 - (diff - 4) * 0.2)));
    if (this.hero.race === 'human') xp = Math.round(xp * 1.1);
    this.gainXp(xp);
    // 드롭
    const g = e.d.gold[0] + Math.floor(Math.random() * (e.d.gold[1] - e.d.gold[0] + 1));
    const coins = e.boss ? 8 : Math.min(4, 1 + Math.floor(g / 8));
    for (let i = 0; i < coins; i++) this.dropAt(e.x, e.y, { kind: 'gold', amount: Math.max(1, Math.round(g / coins)) });
    for (const [mat, ch] of e.d.drops ?? []) if (Math.random() < ch) this.dropAt(e.x, e.y, { kind: 'mat', amount: 1, id: mat });
    const eqChance = e.boss ? 1 : e.d.elite ? 0.5 : 0.09;
    const n = e.boss ? 3 : 1;
    for (let i = 0; i < n; i++) if (Math.random() < eqChance) this.dropAt(e.x, e.y, { kind: 'item', amount: 1, item: randomDrop(e.d.level, this.hero.cls, e.boss ? 25 : e.d.elite ? 10 : 0) });
    if (Math.random() < (e.boss ? 1 : e.d.elite ? 0.4 : 0.06)) this.dropAt(e.x, e.y, { kind: 'soul', amount: e.boss ? 3 : 1 });
    if (Math.random() < 0.08) this.dropAt(e.x, e.y, { kind: 'use', amount: 1, id: Math.random() < 0.6 ? 'hp_s' : 'mp_s' });
    // 퀘스트
    this.onKill(e.d.id);
    if (e.spawn?.respawn && !e.remote) this.respawns.push({ def: e.spawn, t: e.spawn.respawn });
    if (e.boss) this.bossKilled(e);
    if (this.p.target === e) this.p.target = this.nextTarget();
    this.ui.hudDirty();
  }

  bossKilled(e: Enemy): void {
    this.slowmo = 1.2;
    this.shake(8);
    music('victory');
    this.ui.bossBar(null);
    for (const o of this.enemies) if (!o.dead && o !== e && (o as any).summoned) this.killEnemy(o);
    if (e.d.id === 'bandit_king') this.arenaLocked = false;
    const [t1, t2] = e.d.defeat ?? [`${e.d.name} 처치!`, ''];
    this.ui.big(t1, t2);
    if (e.d.flag) this.setFlag(e.d.flag);
    setTimeout(() => music(this.map.bgm), 4500);
  }

  gainXp(n: number): void {
    const h = this.hero;
    if (h.level >= MAX_LEVEL) return;
    h.xp += n;
    this.text(this.p.x, this.p.y - 38, `+${n} EXP`, '#c6b4ff', false);
    while (h.level < MAX_LEVEL && h.xp >= xpToNext(h.level)) {
      h.xp -= xpToNext(h.level);
      h.level++;
      h.points += 3;
      h.skillPts += 1;
      // 해금 레벨에 도달한 스킬은 1레벨을 공짜로 준다
      for (const s of CLASSES[h.cls].skills) if (s.unlock === h.level && !h.skillLv[s.id]) { h.skillLv[s.id] = 1; this.ui.toast(`새 스킬: ${s.key} ${s.name}`, '#9fd0ff'); }
      this.recalc();
      this.p.hp = this.der.maxHp;
      this.p.mp = this.der.maxMp;
      sfx('levelup');
      this.ui.big(`레벨 업! Lv.${h.level}`, '능력치 포인트 +3 · 스킬 포인트 +1 (C / K)');
      this.ringFx(this.p.x, this.p.y - 10, 40, '#facb3e');
      for (let i = 0; i < 30; i++) this.parts.push({ x: this.p.x + Math.random() * 20 - 10, y: this.p.y, z: 0, vx: 0, vy: 0, vz: 30 + Math.random() * 50, life: 1, max: 1, color: i % 2 ? '#facb3e' : '#fdf7ed', size: 1, kind: 'star' });
    }
    this.ui.hudDirty();
  }

  dropAt(x: number, y: number, d: Partial<Drop> & { kind: Drop['kind']; amount: number }): void {
    const a = Math.random() * Math.PI * 2, r = 4 + Math.random() * 12;
    let dx = x + Math.cos(a) * r, dy = y + Math.sin(a) * r * 0.6;
    if (this.map.hits(dx, dy, 2)) { dx = x; dy = y; }
    this.drops.push({ x: dx, y: dy, z: 4, vz: 60 + Math.random() * 30, t: 0, magnet: false, ...d });
  }

  updateDrops(dt: number): void {
    const p = this.p;
    for (const d of this.drops) {
      d.t += dt;
      if (d.z > 0 || d.vz > 0) {
        d.vz -= 260 * dt;
        d.z = Math.max(0, d.z + d.vz * dt);
        if (d.z === 0 && d.vz < 0) d.vz = Math.abs(d.vz) > 40 ? -d.vz * 0.4 : 0;
      }
      if (p.dead || d.t < 0.4) continue;
      const dist = DIST(d, p);
      const auto = d.kind === 'gold' || d.kind === 'soul';
      if (auto && dist < 46) d.magnet = true;
      if (d.magnet) {
        const a = ANG(d.x, d.y, p.x, p.y);
        const s = 160 + d.t * 60;
        d.x += Math.cos(a) * s * dt;
        d.y += Math.sin(a) * s * dt;
      }
      if (dist < 10) this.pickup(d);
    }
    this.drops = this.drops.filter((d) => !(d as any).taken);
  }

  pickup(d: Drop): void {
    const h = this.hero;
    if (d.kind === 'gold') { h.gold += d.amount; sfx('coin'); this.text(this.p.x, this.p.y - 34, `+${d.amount}G`, '#facb3e', false); }
    else if (d.kind === 'soul') { h.soul += d.amount; sfx('pickup'); this.ui.toast(`영혼석 +${d.amount}`, '#72d6ce'); }
    else if (d.kind === 'item' && d.item) {
      if (!addToInv(h, { t: 'eq', item: d.item })) { if (!(d as any).warned) { this.ui.toast('가방이 가득 찼다!', '#f66'); (d as any).warned = true; } return; }
      sfx('pickup');
      this.ui.toast(`획득: ${itemName(d.item)}`, RARITY[d.item.rarity].color);
    } else if (d.kind === 'use' && d.id) {
      if (!addToInv(h, { t: 'use', id: d.id, n: d.amount })) return;
      sfx('pickup');
      this.ui.toast(`획득: ${CONSUMABLES[d.id].name}`, '#fdf7ed');
    } else if (d.kind === 'mat' && d.id) {
      if (!addToInv(h, { t: 'mat', id: d.id, n: d.amount })) { return; }
      sfx('pickup');
      this.ui.toast(`획득: ${MATERIALS[d.id].name}`, '#d3bfa9');
      this.checkCollect();
      this.ui.questUpdate();
    }
    (d as any).taken = true;
    this.ui.hudDirty();
  }

  openChest(c: import('./tilemap').Chest): void {
    const key = 'chest_' + c.id;
    if (this.hero.flags[key]) return;
    this.hero.flags[key] = true;
    (c as any).openT = 0;
    sfx('chest');
    const x = c.x * TS + 8, y = c.y * TS + 12;
    this.dropAt(x, y, { kind: 'item', amount: 1, item: randomDrop(c.tier, this.hero.cls, 15) });
    for (let i = 0; i < 4; i++) this.dropAt(x, y, { kind: 'gold', amount: 5 + c.tier * 4 });
    if (Math.random() < 0.6) this.dropAt(x, y, { kind: 'soul', amount: 1 });
    this.dropAt(x, y, { kind: 'use', amount: 2, id: Math.random() < 0.5 ? 'hp_s' : 'mp_s' });
  }

  updateRespawns(dt: number): void {
    for (const r of this.respawns) r.t -= dt;
    const ready = this.respawns.filter((r) => r.t <= 0);
    this.respawns = this.respawns.filter((r) => r.t > 0);
    for (const r of ready) {
      if (Math.hypot(r.def.x - this.p.x, r.def.y - this.p.y) < 160) { r.t = 5; this.respawns.push(r); continue; }
      if (r.def.hide && this.hero.flags[r.def.hide]) continue;
      this.enemies.push(new Enemy(ENEMIES[r.def.id], r.def.x, r.def.y, r.def));
    }
  }

  // ── 투사체 · 위험 지역 · 장판 ──────────────────────────────────
  updateProjectiles(dt: number): void {
    const p = this.p;
    for (const pr of this.projs) {
      const hom = (pr as any).homing as Enemy | undefined;
      if (hom && !hom.dead) {
        const a = ANG(pr.x, pr.y, hom.x, hom.y - 8);
        const cur = Math.atan2(pr.vy, pr.vx);
        let da = ((a - cur + Math.PI * 3) % (Math.PI * 2)) - Math.PI;
        da = Math.max(-6 * dt, Math.min(6 * dt, da));
        const sp = Math.hypot(pr.vx, pr.vy);
        pr.vx = Math.cos(cur + da) * sp;
        pr.vy = Math.sin(cur + da) * sp;
      }
      pr.x += pr.vx * dt;
      pr.y += pr.vy * dt;
      pr.life -= dt;
      if (pr.spin !== undefined) pr.spin += dt * 14;
      if (pr.kind === 'orb' && Math.random() < 0.6)
        this.parts.push({ x: pr.x, y: pr.y, z: 0, vx: 0, vy: 0, vz: 0, life: 0.25, max: 0.25, color: pr.element === 'fire' ? '#ee8e2e' : pr.element === 'dark' ? '#9f294e' : pr.element === 'poison' ? '#4ba747' : pr.element === 'holy' ? '#facb3e' : '#72d6ce', size: 1, kind: 'spark' });
      const tx = Math.floor(pr.x / TS), ty = Math.floor((pr.y + 8) / TS);
      const g = this.map.get(tx, ty);
      if (g === 9 /* Wall */ || g === 10 || this.map.solid[this.map.idx(tx, ty)] && this.map.objects.length && pr.kind !== 'axe' && this.solidTall(tx, ty)) {
        pr.life = 0;
      }
      if ((pr as any).visual) {
        // 다른 플레이어의 투사체: 날아가는 모습만
      } else if (pr.team === 'player') {
        for (const e of this.enemies) {
          if (e.dead || pr.hit.has(e)) continue;
          if (Math.hypot(e.x - pr.x, e.y - 7 * e.scale - pr.y) < e.r + pr.r + (e.boss ? 6 : 0)) {
            pr.hit.add(e);
            if (pr.explode) { pr.life = 0; break; }
            const a = Math.atan2(pr.vy, pr.vx);
            this.hitEnemy(e, pr.dmg, { element: pr.element, knock: pr.knock, kx: Math.cos(a), ky: Math.sin(a), status: pr.status, crit: pr.crit, hitstop: 0.03 });
            if (p.poisonCoat > 0 && !e.dead) this.applyStatus(e, 'poison', 3, this.attackPower(false) * 0.35);
            if (pr.pierce-- <= 0) { pr.life = 0; break; }
          }
        }
      } else if (!p.dead && Math.hypot(p.x - pr.x, p.y - 8 - pr.y) < p.r + pr.r) {
        if (this.hurtPlayer(pr.dmg, { element: pr.element, from: { x: pr.x - pr.vx * 0.05, y: pr.y - pr.vy * 0.05 }, knock: pr.knock, status: pr.status, owner: pr.owner as Enemy })) pr.life = 0;
        else if (p.block > 0) pr.life = 0;
      }
      if (pr.life <= 0 && !(pr as any).visual) {
        if (pr.explode) {
          this.explosion(pr.x, pr.y + 6, pr.explode, pr.element === 'fire' ? 'fire' : 'dark');
          this.hazards.push({ x: pr.x, y: pr.y + 6, shape: { k: 'circle', r: pr.explode }, t: 0, total: 0, team: pr.team, dmg: pr.dmg, element: pr.element, status: pr.status, knock: 50, silent: true, magic: pr.magic });
        } else if (pr.kind === 'orb') {
          for (let i = 0; i < 5; i++) this.parts.push({ x: pr.x, y: pr.y, z: 0, vx: Math.random() * 60 - 30, vy: Math.random() * 60 - 30, vz: 0, life: 0.3, max: 0.3, color: '#fdf7ed', size: 1, kind: 'spark' });
        }
      }
    }
    this.projs = this.projs.filter((p) => p.life > 0);
  }

  solidTall(tx: number, ty: number): boolean {
    // 나무·집 같은 큰 물체만 투사체를 막는다 (울타리·바위는 넘어간다)
    return this.map.get(tx, ty) === 9;
  }

  inShape(h: Hazard, x: number, y: number, r: number): boolean {
    const dx = x - h.x, dy = y - h.y;
    const s = h.shape;
    const d = Math.hypot(dx, dy);
    switch (s.k) {
      case 'circle': return d <= s.r + r;
      case 'ring': return d <= s.r + r && d >= s.inner - r;
      case 'cone': {
        if (d > s.r + r) return false;
        if (d < r + 4) return true;
        const da = Math.abs(((Math.atan2(dy, dx) - s.ang + Math.PI * 3) % (Math.PI * 2)) - Math.PI);
        return da <= s.spread + Math.asin(Math.min(1, r / Math.max(d, 1)));
      }
      case 'line': {
        const c = Math.cos(s.ang), sn = Math.sin(s.ang);
        const along = dx * c + dy * sn, across = -dx * sn + dy * c;
        return along >= -r && along <= s.len + r && Math.abs(across) <= s.w / 2 + r;
      }
    }
  }

  updateHazards(dt: number): void {
    for (const h of this.hazards) {
      const before = h.t;
      h.t -= dt;
      if (!h.silent && h.team === 'enemy' && before > 0.25 && h.t <= 0.25) sfx('warn');
      if (h.t > 0) continue;
      if ((h as any).fake) continue;
      // 발동
      if (h.team === 'player' && h.fx && !(h as any).remote) this.coop.sendFx(h.fx, h.x, h.y, (h.shape as any).ang ?? 0, (h.shape as any).r ?? 24);
      if (h.fx === 'meteor') { this.explosion(h.x, h.y, 22, 'fire'); this.shake(3); }
      else if (h.fx === 'thorn') { this.thornFx(h.x, h.y); this.shake(2); }
      else if (h.fx === 'boom') { this.explosion(h.x, h.y, (h.shape as any).r ?? 24, 'fire'); this.shake(4); }
      else if (h.fx === 'hammer') { this.hammerFx(h.x, h.y); this.shake(5); }
      else if (h.fx === 'crack') this.crackFx(h);
      else if (h.fx === 'slam') { this.ringFx(h.x, h.y, (h.shape as any).r ?? 30, '#c6a37e'); this.shake(4); sfx('boom'); for (let i = 0; i < 14; i++) this.smokeFx(h.x + Math.random() * 40 - 20, h.y + Math.random() * 20 - 10, '#8a7464'); }
      else if (h.fx === 'shock') { this.ringFx(h.x, h.y, (h.shape as any).r ?? 30, '#da4e38'); }
      else if (h.fx === 'claw') this.slashFx(h.x + Math.cos((h.shape as any).ang) * 12, h.y - 6 + Math.sin((h.shape as any).ang) * 10, (h.shape as any).ang, '#ff8a8a', true);
      if (h.team === 'player') {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (this.inShape(h, e.x, e.y, e.r)) this.hitEnemy(e, h.dmg, { element: h.element, status: h.status, knock: h.knock, crit: h.crit, hitstop: 0.05, kx: undefined });
        }
      } else if (!this.p.dead && this.inShape(h, this.p.x, this.p.y, this.p.r - 1)) {
        this.hurtPlayer(h.dmg, { element: h.element, from: { x: h.x, y: h.y }, knock: h.knock ?? 30, status: h.status, owner: h.owner as Enemy });
      }
    }
    this.hazards = this.hazards.filter((h) => h.t > 0);
  }

  updateZones(dt: number): void {
    for (const z of this.zones) {
      z.t -= dt;
      z.tick -= dt;
      if (z.kind === 'trap') {
        for (const e of this.enemies) {
          if (e.dead) continue;
          if (Math.hypot(e.x - z.x, e.y - z.y) < z.r + e.r) {
            sfx('block');
            this.applyStatus(e, 'root', 2.5);
            this.hitEnemy(e, z.dmg, { knock: 0 });
            z.t = 0;
            for (let i = 0; i < 8; i++) this.parts.push({ x: z.x, y: z.y, z: 0, vx: Math.random() * 60 - 30, vy: Math.random() * 40 - 20, vz: 0, life: 0.4, max: 0.4, color: '#b6cbcf', size: 1, kind: 'spark' });
            break;
          }
        }
        continue;
      }
      if (z.kind === 'rain' && Math.random() < 0.9) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * z.r;
        this.parts.push({ x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r * 0.7, z: 60, vx: -20, vy: 0, vz: -260, life: 0.25, max: 0.25, color: '#d3bfa9', size: 1, kind: 'beam' });
      }
      if (z.kind === 'frost' && Math.random() < 0.4) {
        const a = Math.random() * Math.PI * 2, r = Math.random() * z.r;
        this.parts.push({ x: z.x + Math.cos(a) * r, y: z.y + Math.sin(a) * r * 0.7, z: 0, vx: 0, vy: 0, vz: 12, life: 0.6, max: 0.6, color: '#cae6f5', size: 1, kind: 'spark' });
      }
      if (z.tick <= 0) {
        z.tick = z.kind === 'rain' ? 0.25 : 0.5;
        if (z.team === 'player') {
          for (const e of this.enemies) {
            if (e.dead || Math.hypot(e.x - z.x, (e.y - z.y) / 0.75) > z.r + e.r) continue;
            if (z.kind === 'frost') this.applyStatus(e, 'slow', 1);
            this.hitEnemy(e, z.dmg, { element: z.element, knock: 0, silentHitstop: true, noCrit: z.kind === 'frost' });
          }
        } else if (!this.p.dead && Math.hypot(this.p.x - z.x, (this.p.y - z.y) / 0.75) < z.r + this.p.r) {
          this.hurtPlayer(z.dmg, { element: z.element, status: z.kind === 'poison' ? ['poison', 3, z.dmg * 0.3] : z.kind === 'fire' ? ['burn', 2, z.dmg * 0.3] : undefined, unblockable: true });
        }
      }
    }
    this.zones = this.zones.filter((z) => z.t > 0);
  }

  // ── 연출 ───────────────────────────────────────────────────────
  text(x: number, y: number, text: string, color: string, big: boolean): void {
    this.texts.push({ x, y, vy: -28, life: big ? 1.1 : 0.8, text, color, big });
  }
  slashFx(x: number, y: number, ang: number, color: string, big = false): void {
    this.parts.push({ x, y, z: 0, vx: 0, vy: 0, vz: 0, life: 0.16, max: 0.16, color, size: big ? 2 : 1, kind: 'slash', ang, r: big ? 16 : 12 });
  }
  ringFx(x: number, y: number, r: number, color: string): void {
    this.parts.push({ x, y, z: 0, vx: 0, vy: 0, vz: 0, life: 0.4, max: 0.4, color, size: 1, kind: 'ring', r });
  }
  smokeFx(x: number, y: number, color: string): void {
    this.parts.push({ x, y, z: 0, vx: Math.random() * 30 - 15, vy: Math.random() * 20 - 15, vz: 0, life: 0.6, max: 0.6, color, size: 2, kind: 'smoke' });
  }
  teleportFx(x: number, y: number): void {
    for (let i = 0; i < 12; i++) this.parts.push({ x: x + Math.random() * 10 - 5, y, z: Math.random() * 20, vx: 0, vy: 0, vz: 40, life: 0.4, max: 0.4, color: i % 2 ? '#72d6ce' : '#fdf7ed', size: 1, kind: 'spark' });
  }
  explosion(x: number, y: number, r: number, kind: 'fire' | 'dark'): void {
    sfx('boom');
    const cols = kind === 'fire' ? ['#facb3e', '#ee8e2e', '#da4e38', '#fdf7ed'] : ['#dc4a7b', '#9f294e', '#5f2d56', '#fdf7ed'];
    this.parts.push({ x, y, z: 0, vx: 0, vy: 0, vz: 0, life: 0.3, max: 0.3, color: cols[0], size: 1, kind: 'ring', r });
    for (let i = 0; i < 26; i++) {
      const a = Math.random() * Math.PI * 2, s = 30 + Math.random() * r * 3;
      this.parts.push({ x, y: y - 4, z: 0, vx: Math.cos(a) * s, vy: Math.sin(a) * s * 0.7, vz: 0, life: 0.4 + Math.random() * 0.2, max: 0.6, color: cols[(Math.random() * cols.length) | 0], size: Math.random() < 0.3 ? 2 : 1, kind: 'spark' });
    }
    for (let i = 0; i < 6; i++) this.smokeFx(x + Math.random() * r - r / 2, y - 6, '#3f3f3f');
  }
  thornFx(x: number, y: number): void {
    sfx('hit');
    this.parts.push({ x, y, z: 0, vx: 0, vy: 0, vz: 0, life: 0.35, max: 0.35, color: '#97da3f', size: 1, kind: 'ring', r: 22 });
    for (let i = 0; i < 18; i++) {
      const a = Math.random() * Math.PI * 2, r = Math.random() * 18;
      this.parts.push({ x: x + Math.cos(a) * r, y: y + Math.sin(a) * r * 0.7, z: 0, vx: 0, vy: 0, vz: 40 + Math.random() * 40, life: 0.45, max: 0.45, color: i % 3 ? '#3d734f' : '#97da3f', size: 1, kind: 'spark', grav: 220 });
    }
  }
  hammerFx(x: number, y: number): void {
    sfx('boom');
    this.parts.push({ x, y, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, max: 0.5, color: '#facb3e', size: 1, kind: 'ring', r: 40 });
    this.parts.push({ x, y, z: 0, vx: 0, vy: 0, vz: 0, life: 0.35, max: 0.35, color: '#fdf7ed', size: 4, kind: 'beam' });
    for (let i = 0; i < 24; i++) {
      const a = Math.random() * Math.PI * 2;
      this.parts.push({ x, y: y - 4, z: 0, vx: Math.cos(a) * 90, vy: Math.sin(a) * 60, vz: 0, life: 0.5, max: 0.5, color: i % 2 ? '#facb3e' : '#fdf7ed', size: 1, kind: 'cross' });
    }
  }
  crackFx(h: Hazard): void {
    const s = h.shape as { r: number; ang: number; spread: number };
    for (let i = 0; i < 30; i++) {
      const a = s.ang + (Math.random() * 2 - 1) * s.spread, r = Math.random() * s.r;
      this.parts.push({ x: h.x + Math.cos(a) * r, y: h.y + Math.sin(a) * r, z: 0, vx: 0, vy: 0, vz: 30 + Math.random() * 50, life: 0.5, max: 0.5, color: i % 3 ? '#8a7464' : '#c6a37e', size: 2, kind: 'spark', grav: 200 });
    }
    this.parts.push({ x: h.x, y: h.y, z: 0, vx: 0, vy: 0, vz: 0, life: 0.5, max: 0.5, color: '#3b2a2a', size: 1, kind: 'slash', ang: s.ang, r: s.r });
    this.shake(5);
  }

  updateParticles(dt: number): void {
    for (const q of this.parts) {
      q.life -= dt;
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.z += q.vz * dt;
      if (q.grav) q.vy += q.grav * dt;
      if (q.kind === 'smoke') { q.vx *= 0.92; q.vy *= 0.92; }
      if (q.kind === 'beam' && q.z < 0) q.life = 0;
    }
    this.parts = this.parts.filter((q) => q.life > 0);
    for (const t of this.texts) {
      t.life -= dt;
      t.y += t.vy * dt;
      t.vy *= 0.92;
    }
    this.texts = this.texts.filter((t) => t.life > 0);
    if (this.parts.length > 900) this.parts.splice(0, this.parts.length - 900);
  }

  // ── NPC ────────────────────────────────────────────────────────
  updateNpc(n: NpcEnt, dt: number): void {
    n.animT += dt;
    n.moving = false;
    if (!n.wander) {
      n.flip = this.p.x < n.x && DIST(n, this.p) < 60;
      return;
    }
    n.wanderT -= dt;
    if (n.wanderT <= 0) {
      n.wanderT = 2 + Math.random() * 4;
      const a = Math.random() * Math.PI * 2;
      n.goal = Math.random() < 0.4 ? null : [n.homeX + Math.cos(a) * n.wander * Math.random(), n.homeY + Math.sin(a) * n.wander * Math.random()];
    }
    if (n.goal && DIST(n, this.p) > 24) {
      const dx = n.goal[0] - n.x, dy = n.goal[1] - n.y, d = Math.hypot(dx, dy);
      if (d > 2) {
        n.moving = true;
        const ox = n.x, oy = n.y;
        this.moveActor(n, (dx / d) * 22 * dt, (dy / d) * 22 * dt);
        n.flip = dx < 0;
        if (Math.hypot(n.x - ox, n.y - oy) < 0.1) n.goal = null;
      } else n.goal = null;
    }
  }

  interact(): void {
    const p = this.p;
    let best: NpcEnt | null = null, bd = 30;
    for (const n of this.npcs) if (DIST(n, p) < bd) { bd = DIST(n, p); best = n; }
    if (best) { p.flip = best.x < p.x; this.ui.talk(best); return; }
    for (const c of this.map.chests) {
      if (Math.hypot(c.x * TS + 8 - p.x, c.y * TS + 8 - p.y) < 26) { this.openChest(c); return; }
    }
    for (const o of this.map.objects) {
      if (o.tag === 'save' && Math.hypot(o.x - p.x, o.y - p.y) < 30) {
        this.saveHero();
        this.ui.save();
        this.p.hp = this.der.maxHp;
        this.p.mp = this.der.maxMp;
        sfx('holy');
        this.ui.toast('여신상에 기도했다. 저장 완료 · HP/MP 회복', '#facb3e');
        return;
      }
      if (o.tag === 'sign_home' && Math.hypot(o.x - p.x, o.y - p.y) < 30) {
        const near = this.map.exits.filter((e) => e.to.endsWith('home')).sort((a, b) => Math.hypot(a.x * TS - p.x, a.y * TS - p.y) - Math.hypot(b.x * TS - p.x, b.y * TS - p.y))[0];
        if (near) this.ui.toast(`이 길로 가면: ${near.label}`, '#fdf7ed');
        return;
      }
      if (o.tag === 'sign_field' && Math.hypot(o.x - p.x, o.y - p.y) < 30) {
        this.ui.toast('← 하스벨 마을   ↖ 잊혀진 지하 묘지   → 도적단 요새', '#fdf7ed');
        return;
      }
    }
  }

  checkExits(dt: number): void {
    const p = this.p;
    if (p.dead || this.fadeTo) return;
    this.exitMsgT -= dt;
    // 도착 직후에는 출구 범위를 한 번 벗어나야 다시 이동된다 (왔다 갔다 반복 방지)
    const near = this.map.exits.filter((ex) => this.nearExit(ex, p.x, p.y));
    if ((this as any).exitGrace) {
      if (!near.length) (this as any).exitGrace = false;
      return this.arenaCheck();
    }
    for (const ex of near) {
      {
        if (ex.locked && !this.hero.flags[ex.locked]) {
          if (this.exitMsgT <= 0) { this.ui.toast(ex.lockMsg ?? '잠겨 있다', '#ffb0a0'); this.exitMsgT = 3; }
          this.bounceFrom(ex);
          return;
        }
        if (this.boss && this.boss.aggro && !this.boss.dead) { if (this.exitMsgT <= 0) { this.ui.toast('보스에게서 도망칠 수 없다!', '#f66'); this.exitMsgT = 2; } this.bounceFrom(ex); return; }
        this.travel(ex.to, ex.spawn);
        return;
      }
    }
    this.arenaCheck();
  }

  arenaCheck(): void {
    const p = this.p;
    // 요새 보스 방 잠금
    if (this.map.id === 'fort' && !this.hero.flags.king_dead) {
      if (!this.arenaLocked && p.x > 36.5 * TS) {
        this.arenaLocked = true;
        for (let y = 17; y <= 23; y++) for (let x = 33; x <= 35; x++) this.map.solid[this.map.idx(x, y)] = 1;
        sfx('door');
        this.ui.toast('철문이 닫혔다!', '#ff8a6a');
      }
      if (!this.arenaLocked) for (let y = 17; y <= 23; y++) for (let x = 33; x <= 35; x++) this.map.solid[this.map.idx(x, y)] = 0;
    } else if (this.map.id === 'fort') for (let y = 17; y <= 23; y++) for (let x = 33; x <= 35; x++) this.map.solid[this.map.idx(x, y)] = 0;
  }

  bounceFrom(ex: Exit): void {
    const p = this.p;
    const cx = (ex.x + ex.w / 2) * TS, cy = (ex.y + ex.h / 2) * TS;
    const a = ANG(cx, cy, p.x, p.y);
    this.moveActor(p, Math.cos(a) * 6, Math.sin(a) * 6);
    p.path = [];
    p.holdDir = null;
  }

  // ── 퀘스트 ─────────────────────────────────────────────────────
  qs(id: string) {
    return this.hero.quests.find((q) => q.id === id);
  }

  startQuest(id: string, silent = false): void {
    if (this.qs(id)) return;
    this.hero.quests.push({ id, stage: 0, count: 0, done: false });
    if (!silent) { sfx('buff'); this.ui.toast(`퀘스트 수락: ${QUESTS[id].name}`, '#ffd36a'); }
    this.checkQuestFlags();
    this.ui.questUpdate();
  }

  onKill(enemyId: string): void {
    for (const q of this.hero.quests) {
      if (q.done) continue;
      const st = QUESTS[q.id]?.stages[q.stage];
      if (st?.k !== 'kill') continue;
      const ids = Array.isArray(st.enemy) ? st.enemy : [st.enemy];
      if (!ids.includes(enemyId)) continue;
      q.count++;
      if (q.count >= st.n) {
        q.count = 0;
        sfx('buff');
        this.ui.toast(`${QUESTS[q.id].name}: 목표 달성!`, '#ffd36a');
        this.advance(q);
      }
    }
    this.ui.questUpdate();
  }

  /** 단계 하나 진행: 단계 플래그(퀘스트id_s번호)를 켜고, 끝이면 완료 */
  advance(q: { id: string; stage: number; done: boolean }): boolean {
    const def = QUESTS[q.id];
    const sf = def.stageFlags?.[q.stage];
    const autoFlag = `${q.id}_s${q.stage}`;
    q.stage++;
    this.hero.flags[autoFlag] = true;
    if (sf) this.hero.flags[sf] = true;
    if (q.stage >= def.stages.length) {
      this.completeQuest(q.id);
      return true;
    }
    this.syncWorld();
    this.checkQuestFlags();
    return false;
  }

  setFlag(f: string): void {
    if (this.hero.flags[f]) return;
    this.hero.flags[f] = true;
    this.checkQuestFlags();
    this.syncWorld();
    this.ui.questUpdate();
  }

  checkQuestFlags(): void {
    let again = true;
    while (again) {
      again = false;
      for (const q of this.hero.quests) {
        if (q.done) continue;
        const st = QUESTS[q.id]?.stages[q.stage];
        if (st?.k === 'flag' && this.hero.flags[st.flag]) {
          this.ui.toast(`${QUESTS[q.id].name}: 목표 달성!`, '#ffd36a');
          this.advance(q);
          again = true;
          break;
        }
      }
    }
  }

  /** 조건 문자열 평가 (특수 조건 포함) */
  reqMet(req?: string): boolean {
    if (!req) return true;
    const f = this.hero.flags;
    if (req === 'MEM4') return this.memoryCount() >= 4;
    if (req === 'TRUE_END') return this.trueEndChecks().every((c) => c.ok);
    return !!f[req];
  }

  memoryCount(): number {
    return Object.keys(MEMORIES).filter((k) => this.hero.flags['seen_' + k]).length;
  }

  /** 진 엔딩 조건 목록 (퀘스트 창에도 보여 준다) */
  trueEndChecks(): { label: string; ok: boolean }[] {
    const f = this.hero.flags;
    return [
      { label: '인간과의 맹약 (가르토의 진실)', ok: !!f.pact_human },
      { label: '엘프와의 맹약 (실바레스 정화)', ok: !!f.pact_elf },
      { label: '드워프와의 맹약 (단조 연대기 공개)', ok: !!f.pact_dwarf },
      { label: '오크와의 맹약 (부족 통일)', ok: !!f.pact_orc },
      { label: '마족과의 맹약 (에이라 구출)', ok: !!f.pact_demon },
      { label: '가르토 생존', ok: !!f.garto_alive && !f.garto_dead },
      { label: `노르하임의 기억 (${this.memoryCount()}/${Object.keys(MEMORIES).length})`, ok: this.memoryCount() >= Object.keys(MEMORIES).length },
    ];
  }

  /** NPC에게 말을 걸었을 때 진행되는 퀘스트 (대화·수집 보고·선택) */
  talkProgress(npc: string): { quest: QuestDef; lines: string[]; choice?: { qid: string; prompt: string; options: { label: string; ok: boolean; reqText?: string }[] } } | null {
    const race = this.hero.race;
    for (const q of this.hero.quests) {
      if (q.done) continue;
      const def = QUESTS[q.id];
      const st = def?.stages[q.stage];
      if (!st) continue;
      if (st.k === 'choice' && resolveNpc(st.npc, race) === npc) {
        const intro = def.talksByRace?.[q.stage]?.[race] ?? def.talks?.[q.stage] ?? [];
        return {
          quest: def,
          lines: intro,
          choice: { qid: q.id, prompt: st.prompt, options: st.options.map((o) => ({ label: o.label, ok: this.reqMet(o.req), reqText: o.reqText })) },
        };
      }
      if (st.k === 'talk' && resolveNpc(st.npc, race) === npc) {
        // 수집 퀘스트: 앞 단계가 수집이면 재료를 회수
        const prev = def.stages[q.stage - 1];
        if (prev && prev.k === 'collect') {
          if (countOf(this.hero, 'mat', prev.mat) < prev.n) { q.stage--; continue; }
          removeCount(this.hero, 'mat', prev.mat, prev.n);
        }
        const said = def.talksByRace?.[q.stage]?.[race] ?? def.talks?.[q.stage];
        const finished = this.advance(q);
        if (finished) return { quest: def, lines: def.doneByRace?.[race] ?? def.done };
        return { quest: def, lines: said ?? ['좋아, 계속 부탁하네.'] };
      }
    }
    return null;
  }

  /** 선택지 고르기 */
  choose(qid: string, idx: number): string[] {
    const q = this.qs(qid);
    if (!q || q.done) return [];
    const def = QUESTS[qid];
    const st = def.stages[q.stage];
    if (st?.k !== 'choice') return [];
    const o = st.options[idx];
    if (!o || !this.reqMet(o.req)) return [];
    for (const f of o.flags ?? []) this.hero.flags[f] = true;
    const finished = this.advance(q);
    this.syncWorld();
    const lines = [...o.lines];
    if (finished && def.done.length) lines.push(...(def.doneByRace?.[this.hero.race] ?? def.done));
    return lines;
  }

  /** 이야기 진행에 맞춰 지금 지역의 NPC · 몬스터 · 물체를 맞춘다 */
  syncWorld(): void {
    if (!this.map) return;
    const f = this.hero.flags;
    const want = (d: { req?: string; hide?: string[] | string }) => {
      if (d.req && !f[d.req]) return false;
      const hide = Array.isArray(d.hide) ? d.hide : d.hide ? [d.hide] : [];
      return !hide.some((h) => f[h]);
    };
    // NPC
    const keep = this.npcs.filter((n) => {
      const def = this.map.npcs.find((d) => d.id === n.id && Math.abs(d.x - n.homeX) < 1 && Math.abs(d.y - n.homeY) < 1);
      return def ? want(def) : true;
    });
    for (const d of this.map.npcs) {
      if (!want(d) || keep.some((n) => n.id === d.id && Math.abs(d.x - n.homeX) < 1 && Math.abs(d.y - n.homeY) < 1)) continue;
      keep.push(new NpcEnt(d.id, d.name, d.sprite, d.x, d.y, d.wander ?? 0));
      this.teleportFx(d.x, d.y);
    }
    this.npcs = keep;
    // 몬스터 (방장이 움직이는 몬스터를 받는 중이면 건드리지 않는다)
    if (!this.coop.mirrored) {
      for (const s of this.map.spawns) {
        const active = this.enemies.some((e) => e.spawn === s && !e.dead) || this.respawns.some((r) => r.def === s);
        if (want(s) && !active && !(s as any).spawned && !(s.tag === 'boss' && this.bossDefeated(s.id))) {
          (s as any).spawned = true;
          this.enemies.push(new Enemy(ENEMIES[s.id], s.x, s.y, s));
          this.teleportFx(s.x, s.y);
        }
        if (!want(s)) {
          for (const e of this.enemies) if (e.spawn === s && !e.dead) { e.dead = true; e.deathT = 0.5; }
          this.respawns = this.respawns.filter((r) => r.def !== s);
        }
      }
    }
  }

  checkCollect(): void {
    for (const q of this.hero.quests) {
      if (q.done) continue;
      const st = QUESTS[q.id].stages[q.stage];
      if (st?.k === 'collect' && countOf(this.hero, 'mat', st.mat) >= st.n) q.stage++;
    }
  }

  completeQuest(id: string): void {
    const q = this.qs(id)!;
    const def = QUESTS[id];
    q.done = true;
    const r = def.reward;
    this.hero.gold += r.gold;
    if (r.soul) this.hero.soul += r.soul;
    for (const [it, n] of r.items ?? []) addToInv(this.hero, { t: 'use', id: it, n });
    for (const [it, n] of r.mats ?? []) { addToInv(this.hero, { t: 'mat', id: it, n }); this.ui.toast(`획득: ${MATERIALS[it]?.name ?? it}`, '#ffd36a'); }
    for (const it of r.removeMats ?? []) removeCount(this.hero, 'mat', it, countOf(this.hero, 'mat', it));
    for (const f of r.flags ?? []) this.hero.flags[f] = true;
    if (r.equip) {
      let item: ItemInst;
      if (r.equip === 'auto') {
        const lvl = this.hero.level + 1;
        item = randomDrop(lvl, this.hero.cls, 0);
        item.rarity = Math.max(item.rarity, r.rarity ?? 1) as ItemInst['rarity'];
        const better = makeItem(item.base, lvl, item.rarity);
        item = better;
      } else item = makeItem(r.equip, Math.max(this.hero.level, BASE_ITEMS.find((b) => b.id === r.equip)!.tier), (r.rarity ?? 1) as ItemInst['rarity']);
      if (!addToInv(this.hero, { t: 'eq', item })) this.dropAt(this.p.x, this.p.y, { kind: 'item', amount: 1, item });
      this.ui.toast(`보상: ${itemName(item)}`, RARITY[item.rarity].color);
    }
    sfx('levelup');
    this.ui.big('퀘스트 완료!', def.name);
    this.gainXp(r.xp);
    if (r.flag) this.hero.flags[r.flag] = true;
    this.checkQuestFlags();
    this.syncWorld();
    if (def.next) setTimeout(() => this.startQuest(def.next!), 600);
    if (def.chapterClear) setTimeout(() => this.ui.showChapterClear(def.chapterClear!), 1800);
    const ending = ['ending_1', 'ending_2', 'ending_3'].find((k) => this.hero.flags[k]);
    if (id === 'c5_5' && ending) setTimeout(() => this.ui.showEnding(ending), 1200);
    this.ui.hudDirty();
    this.ui.questUpdate();
  }

  /** NPC가 줄 수 있는 새 퀘스트 */
  offerFor(npc: string): QuestDef | null {
    for (const def of Object.values(QUESTS)) {
      if (resolveNpc(def.giver, this.hero.race) !== npc || def.autoAccept || this.qs(def.id)) continue;
      if (def.race && def.race !== this.hero.race) continue;
      if (def.requires && !this.qs(def.requires)?.done) continue;
      if (this.hero.level < 2 && def.id !== 'smith_hides') continue;
      return def;
    }
    return null;
  }

  // ── 길안내 ─────────────────────────────────────────────────────
  /** 지금 안내할 퀘스트: 직접 고른 것 → 진행 중인 메인 → 아무 진행 중 퀘스트 */
  trackedQuest() {
    const act = this.hero.quests.filter((q) => !q.done);
    const pick = act.find((q) => q.id === this.hero.flags.track) ?? act.find((q) => QUESTS[q.id].main) ?? act[0];
    return pick ?? null;
  }

  /** 안내 화살표가 가리킬 곳 (현재 맵 좌표). 다른 지역이면 그쪽 출구를 가리킨다. */
  questTarget(): { x: number; y: number; label: string; exit: boolean; npc?: boolean } | null {
    const q = this.trackedQuest();
    if (!q) return null;
    const def = QUESTS[q.id];
    const st = def.stages[q.stage];
    if (!st) return null;
    const ENEMY_MAP: Record<string, string> = {
      wolf: 'field', boar: 'field', spider: 'field', goblin: 'field', bandit: 'field', bandit_archer: 'field', masked_orc: 'field',
      skelet: 'crypt', zombie: 'crypt', tiny_zombie: 'crypt', necromancer: 'crypt',
      blight_wolf: 'forest', swampy: 'forest', muddy: 'forest', slug: 'forest', pumpkin_dude: 'forest', forest_spirit: 'forest', dryad: 'forest',
      ash_beast: HOME[this.hero.race].map, magma_slime: 'forge', stone_golem: 'forge', forge_spirit: 'forge',
      warband: 'redplains', war_shaman: 'redplains', war_boar: 'redplains', arena_champion: 'redplains',
    };
    const MAT_ENEMY: Record<string, string> = { hide: 'boar', silk: 'spider', bone: 'skelet', spirit_stone: 'forest_spirit' };
    let map = '';
    let label = '';
    let point: (() => { x: number; y: number } | null) = () => null;
    const nearestEnemy = (ids: string[]) => () => {
      let best: { x: number; y: number } | null = null, bd = 1e9;
      for (const e of this.enemies) if (!e.dead && ids.includes(e.d.id)) { const d = DIST(e, this.p); if (d < bd) { bd = d; best = { x: e.x, y: e.y - 6 }; } }
      if (best) return best;
      for (const s of this.map.spawns) if (ids.includes(s.id)) { const d = Math.hypot(s.x - this.p.x, s.y - this.p.y); if (d < bd) { bd = d; best = { x: s.x, y: s.y }; } }
      return best;
    };
    if (st.k === 'talk' || st.k === 'choice') {
      const who = resolveNpc(st.npc, this.hero.race);
      map = npcMapFor(who, this.hero.flags);
      label = NPC_NAME[who] ?? '';
      point = () => { const n = this.npcs.find((n) => n.id === who); return n ? { x: n.x, y: n.y - 14 } : null; };
    } else if (st.k === 'kill' || st.k === 'collect') {
      const ids = st.k === 'kill' ? (Array.isArray(st.enemy) ? st.enemy : [st.enemy]) : [MAT_ENEMY[st.mat] ?? ''];
      if (st.k === 'collect' && st.mat === 'bone') ids.push('zombie', 'tiny_zombie');
      map = ENEMY_MAP[ids[0]] ?? 'field';
      label = ENEMIES[ids[0]]?.name ?? '';
      // 이미 그 적이 있는 맵에 있으면 그대로 사냥
      if (this.enemies.some((e) => !e.dead && ids.includes(e.d.id)) || this.map.spawns.some((s) => ids.includes(s.id))) map = this.map.id;
      point = nearestEnemy(ids);
    } else if (st.k === 'flag') {
      const boss: Record<string, [string, string, string]> = {
        crypt_cleared: ['crypt', 'big_zombie', '묘지기 모스'], king_dead: ['fort', 'bandit_king', '도적왕 가르토'], vargon_dead: ['rift', 'big_demon', '바르곤'], spirit_dead: ['grove', 'forest_lord', '실바레스'],
        golem_dead: ['forge', 'forge_golem', '용광로 골렘'], karkush_dead: ['warcamp', 'karkush', '카르쿠쉬'], vargon_resolved: ['riftland', 'vargon2', '바르곤'],
        mordain_dead: ['throne', 'ash_king', '잿빛 왕'], belkar_dead: ['throne', 'belkar', '마왕 벨카르'],
      };
      // 벽화 · 기억은 아직 안 본 것 중 가장 가까운 곳
      const seek = (prefix: string, ids: string[], mapOf: (id: string) => string, name: string) => {
        const left = ids.filter((id) => !this.hero.flags['seen_' + id]);
        if (!left.length) return null;
        const here = left.filter((id) => mapOf(id) === this.map.id);
        if (here.length) {
          let best: MapObj | null = null, bd = 1e9;
          for (const o of this.map.objects) if (o.tag && here.some((id) => o.tag === prefix + id)) { const d = Math.hypot(o.x - this.p.x, o.y - this.p.y); if (d < bd) { bd = d; best = o; } }
          return best ? { map: this.map.id, x: best.x, y: best.y - 12, label: name } : null;
        }
        return { map: mapOf(left[0]), x: 0, y: 0, label: name };
      };
      if (st.flag === 'murals_seen' || st.flag === 'memories_all') {
        const t = st.flag === 'murals_seen'
          ? seek('mural:', Object.keys(MURALS), () => 'obsidian', '노르하임의 벽화')
          : seek('memory:', Object.keys(MEMORIES), (id) => MEMORIES[id].map, '기억의 틈');
        if (!t) return null;
        map = t.map;
        label = t.label;
        point = () => ({ x: t.x, y: t.y });
      }
      const b = boss[st.flag];
      if (!b && !map) return null;
      if (b) {
      [map, , label] = b;
      point = () => {
        const e = this.enemies.find((e) => e.d.id === b[1] && !e.dead);
        if (e) return { x: e.x, y: e.y - 12 };
        const p = this.map.points.boss;
        return p ? { x: p[0], y: p[1] } : null;
      };
      }
    }
    if (map === this.map.id) {
      const pt = point();
      return pt ? { ...pt, label, exit: false, npc: st.k === 'talk' || st.k === 'choice' } : null;
    }
    // 다른 지역: 지역 연결도를 따라 다음으로 거쳐 갈 지역의 출구를 가리킨다
    const hop = nextHop(this.map.id, map) ?? 'field';
    const ex = this.map.exits.find((e) => e.to === hop) ?? this.map.exits.find((e) => e.to === 'field');
    if (!ex) return null;
    return { x: (ex.x + ex.w / 2) * TS, y: (ex.y + ex.h / 2) * TS, label: `${MAP_NAME[ex.to] ?? ''} 방향 · ${label}`, exit: true };
  }

  npcMarker(npc: string): '!' | '?' | '' {
    for (const q of this.hero.quests) {
      if (q.done) continue;
      const st = QUESTS[q.id].stages[q.stage];
      if (st?.k === 'choice' && resolveNpc(st.npc, this.hero.race) === npc) return '?';
      if (st?.k === 'talk' && resolveNpc(st.npc, this.hero.race) === npc) {
        const prev = QUESTS[q.id].stages[q.stage - 1];
        if (prev?.k === 'collect' && countOf(this.hero, 'mat', prev.mat) < prev.n) continue;
        return '?';
      }
    }
    return this.offerFor(npc) ? '!' : '';
  }
}
