// 적 AI — FSM: Idle → Patrol → Chase → (Windup → Attack) → Recover / Retreat / Return (기획서 9.2)
import { sfx, music } from './audio';
import { AttackKind, ENEMIES } from './data';
import { Enemy, Hazard } from './entities';
import type { Game } from './game';

const DIST = (a: { x: number; y: number }, b: { x: number; y: number }) => Math.hypot(a.x - b.x, a.y - b.y);
const ANG = (ax: number, ay: number, bx: number, by: number) => Math.atan2(by - ay, bx - ax);

type E = Enemy & { pending?: Hazard[]; summoned?: boolean; enraged?: boolean; chargeT?: number; chargeDir?: [number, number] };

function speedOf(e: E): number {
  return e.d.speed * e.slowMul * (e.enraged ? 1.35 : 1);
}

function attackRange(e: E, a: AttackKind | 'axes' | 'meteor' | 'summon'): [number, number] {
  const R = e.d.range;
  switch (a) {
    case 'bite':
    case 'slash': return [0, Math.min(R, 30) + e.r];
    case 'slam': return [0, (e.boss ? 40 : 26) + e.r * 0.5];
    case 'charge': return [e.boss ? 50 : 30, 120];
    case 'shoot': case 'spit': case 'cast': return [0, a === 'spit' && !e.boss ? 80 : Math.max(R, 90)];
    case 'axes': return [30, 150];
    case 'meteor': return [0, 200];
    case 'summon': return [0, 220];
  }
}

function cancelPending(g: Game, e: E): void {
  if (!e.pending) return;
  const pend = e.pending;
  g.hazards = g.hazards.filter((h) => !pend.includes(h));
  e.pending = [];
}

export function updateEnemy(g: Game, en: Enemy, dt: number): void {
  const e = en as E;
  e.animT += dt;
  e.flash = Math.max(0, e.flash - dt);
  e.hpBarT -= dt;
  e.taunted -= dt;
  if (e.dead) {
    e.deathT += dt;
    return;
  }
  g.tickStatus(e, dt);
  if (e.dead) return;
  // 넉백
  if (Math.abs(e.kbx) + Math.abs(e.kby) > 1) {
    g.moveActor(e, e.kbx * dt, e.kby * dt);
    e.kbx *= Math.pow(0.001, dt);
    e.kby *= Math.pow(0.001, dt);
  }
  if (!e.canAct) {
    e.moving = false;
    if (e.pending?.length) cancelPending(g, e);
    if (e.state === 'charge') e.state = 'recover';
    return;
  }
  const p = g.aiTarget(e);
  const d = DIST(e, p);
  const visible = !p.dead && p.stealth <= 0;
  e.cd -= dt;

  // 감지
  if (!e.aggro && visible && e.state !== 'return') {
    const range = e.d.aggro * (g.map.dark ? 0.8 : 1);
    if (d < range && g.map.los(e.x, e.y - 6, p.x, p.y - 6)) {
      e.aggro = true;
      e.state = 'chase';
      // 무리 알림
      for (const o of g.enemies) if (!o.dead && !o.aggro && DIST(o, e) < 70 && o.state !== 'return') { o.aggro = true; o.state = 'chase'; }
      g.parts.push({ x: e.x, y: e.y - 16 * e.scale - 10, z: 0, vx: 0, vy: -10, vz: 0, life: 0.7, max: 0.7, color: '#ff5050', size: 1, kind: 'text', sprite: '!' });
    }
  }
  if (e.aggro && (!visible || p.dead)) {
    if (p.dead || (p.stealth > 0 && e.taunted <= 0)) {
      e.aggro = false;
      e.state = 'return';
      cancelPending(g, e);
    }
  }
  if (e.aggro && !e.boss && Math.hypot(e.x - e.homeX, e.y - e.homeY) > 280 && !e.summoned) {
    e.aggro = false;
    e.state = 'return';
  }

  // 보스 등장 / 페이즈
  if (e.boss && e.aggro) {
    if (g.boss !== e) g.bossEngaged(e);
    const r = e.hp / e.maxHp;
    const want = r < 0.33 ? 3 : r < 0.66 ? 2 : 1;
    if (want > e.phase) {
      e.phase = want;
      g.shake(7);
      sfx('roar');
      cancelPending(g, e);
      e.state = 'recover';
      e.stT = 0.6;
      e.flash = 0.4;
      const msg: Record<string, string[]> = {
        big_zombie: ['', '', '묘지기가 썩은 숨을 내뿜는다! (2페이즈)', '묘지기가 광폭해졌다! (3페이즈)'],
        bandit_king: ['', '', '"얘들아, 나와라!" 부하를 부른다! (2페이즈)', '도적왕이 분노했다! (3페이즈)'],
        big_demon: ['', '', '하늘에서 불꽃이 쏟아진다! (2페이즈)', '바르곤이 마계의 힘을 해방한다! (3페이즈)'],
        forest_lord: ['', '', '실바레스가 숲정령을 부르고 가시가 쏟아진다! (2페이즈)', '썩은 심장이 고동친다! (3페이즈)'],
      };
      g.ui.toast(msg[e.d.id]?.[want] ?? '보스가 강해졌다!', '#ff7a5a');
      if (want === 3) e.enraged = true;
      e.summonT = 1.5;
    }
    // 소환
    if (e.phase >= 2) {
      e.summonT -= dt;
      if (e.summonT <= 0) {
        const kind = e.d.id === 'big_zombie' ? 'tiny_zombie' : e.d.id === 'bandit_king' ? (Math.random() < 0.5 ? 'bandit' : 'bandit_archer') : e.d.id === 'forest_lord' ? 'forest_spirit' : 'imp';
        const alive = g.enemies.filter((o) => !o.dead && (o as E).summoned).length;
        if (alive < 4 && (e.d.id !== 'big_demon' || e.phase >= 3)) {
          for (let i = 0; i < 2; i++) summon(g, e, kind);
        }
        e.summonT = e.d.id === 'bandit_king' ? 13 : 10;
      }
    }
  }
  if (e.d.summons && !e.boss && e.aggro) {
    e.summonT -= dt;
    if (e.summonT <= 0) {
      e.summonT = 9;
      if (g.enemies.filter((o) => !o.dead && (o as E).summoned).length < 3) summon(g, e, e.d.summons);
    }
  }

  // 겹침 풀기
  for (const o of g.enemies) {
    if (o === e || o.dead) continue;
    const dd = DIST(o, e);
    const min = o.r + e.r - 2;
    if (dd < min && dd > 0.01) {
      const k = ((min - dd) / dd) * 0.5;
      if (!e.boss) g.moveActor(e, (e.x - o.x) * k, (e.y - o.y) * k);
    }
  }

  e.moving = false;
  switch (e.state) {
    case 'idle':
    case 'patrol': {
      if (e.aggro) { e.state = 'chase'; break; }
      e.stT -= dt;
      if (e.stT <= 0) {
        e.stT = 2 + Math.random() * 3;
        if (Math.random() < 0.5 && !e.boss) {
          const a = Math.random() * Math.PI * 2, r = 10 + Math.random() * 30;
          e.wanderTo = [e.homeX + Math.cos(a) * r, e.homeY + Math.sin(a) * r];
        } else e.wanderTo = null;
      }
      if (e.wanderTo) moveTo(g, e, e.wanderTo[0], e.wanderTo[1], speedOf(e) * 0.4, dt, true);
      break;
    }
    case 'return': {
      e.hp = Math.min(e.maxHp, e.hp + e.maxHp * 0.3 * dt);
      if (moveTo(g, e, e.homeX, e.homeY, speedOf(e) * 1.2, dt, true) < 6) {
        e.state = 'idle';
        e.hp = e.maxHp;
        e.phase = 1;
        e.enraged = false;
        if (g.boss === e) { g.boss = null; g.ui.bossBar(null); music(g.map.bgm); }
      }
      break;
    }
    case 'chase': {
      if (!e.aggro) { e.state = 'return'; break; }
      e.flip = p.x < e.x;
      // 원거리형은 거리 유지
      if (e.d.keepDist && d < e.d.keepDist && e.cd > 0.2) {
        const a = ANG(p.x, p.y, e.x, e.y);
        const before = [e.x, e.y];
        g.moveActor(e, Math.cos(a) * speedOf(e) * dt, Math.sin(a) * speedOf(e) * dt);
        e.moving = Math.hypot(e.x - before[0], e.y - before[1]) > 0.01;
        e.flip = p.x < e.x;
        break;
      }
      if (e.cd <= 0) {
        const choice = chooseAttack(g, e, d);
        if (choice) { beginAttack(g, e, choice); break; }
      }
      const stop = e.d.keepDist ? e.d.keepDist + 10 : e.r + p.r + 2;
      if (d > stop) moveTo(g, e, p.x, p.y, speedOf(e), dt, false);
      e.flip = p.x < e.x;
      break;
    }
    case 'windup': {
      e.stT -= dt;
      e.flip = e.aimX < e.x;
      if (e.stT <= 0) resolveAttack(g, e);
      break;
    }
    case 'charge': {
      e.chargeT = (e.chargeT ?? 0) - dt;
      const [cx, cy] = e.chargeDir ?? [0, 0];
      const sp = (e.boss ? 260 : 210) * e.slowMul;
      const bx = e.x, by = e.y;
      g.moveActor(e, cx * sp * dt, cy * sp * dt);
      e.moving = true;
      if (Math.random() < 0.6) g.parts.push({ x: e.x, y: e.y, z: 0, vx: -cx * 20, vy: -cy * 20, vz: 0, life: 0.4, max: 0.4, color: '#a98a6a', size: 2, kind: 'smoke' });
      if (!e.chargeHit && DIST(e, p) < e.r + p.r + 3) {
        e.chargeHit = true;
        if (p.remote) g.coop.sendDamage(p.remote, e.d.atk * 1.4, bx, by, 80);
        else g.hurtPlayer(e.d.atk * 1.4, { from: { x: bx, y: by }, knock: 80, owner: e });
      }
      const blocked = Math.hypot(e.x - bx, e.y - by) < sp * dt * 0.3;
      if ((e.chargeT ?? 0) <= 0 || blocked) {
        e.state = 'recover';
        e.stT = blocked ? 0.9 : 0.5;
        if (blocked) { g.shake(3); sfx('hit'); g.applyStatus(e, 'stun', e.boss ? 1.2 : 0.8); }
      }
      break;
    }
    case 'recover': {
      e.stT -= dt;
      if (e.stT <= 0) e.state = e.aggro ? 'chase' : 'return';
      break;
    }
    default:
      e.state = 'chase';
  }
}

function moveTo(g: Game, e: E, tx: number, ty: number, sp: number, dt: number, lazy: boolean): number {
  const d = Math.hypot(tx - e.x, ty - e.y);
  if (d < 2) return d;
  let gx = tx, gy = ty;
  if (!g.map.clearLine(e.x, e.y, tx, ty, e.r - 1)) {
    e.pathT -= dt;
    if (e.pathT <= 0 || !e.path.length) {
      e.pathT = 0.5 + Math.random() * 0.3;
      e.path = g.map.findPath(e.x, e.y, tx, ty, lazy ? 600 : 1500) ?? [];
    }
    if (e.path.length) {
      [gx, gy] = e.path[0];
      if (Math.hypot(gx - e.x, gy - e.y) < 4) e.path.shift();
    }
  } else e.path = [];
  const dd = Math.hypot(gx - e.x, gy - e.y) || 1;
  const bx = e.x, by = e.y;
  g.moveActor(e, ((gx - e.x) / dd) * sp * dt, ((gy - e.y) / dd) * sp * dt);
  e.moving = Math.hypot(e.x - bx, e.y - by) > 0.01;
  if (Math.abs(gx - e.x) > 1) e.flip = gx < e.x;
  return d;
}

type Atk = AttackKind | 'axes' | 'meteor' | 'summon';

function chooseAttack(g: Game, e: E, d: number): Atk | null {
  const p = g.aiTarget(e);
  const opts: Atk[] = [...e.d.attacks];
  if (e.d.id === 'bandit_king' && e.phase >= 2) opts.push('axes', 'axes');
  if ((e.d.id === 'big_demon' || e.d.id === 'forest_lord') && e.phase >= 2) opts.push('meteor');
  const los = g.map.los(e.x, e.y - 6, p.x, p.y - 6);
  const ok = opts.filter((a) => {
    const [lo, hi] = attackRange(e, a);
    if (d < lo || d > hi) return false;
    if ((a === 'shoot' || a === 'spit' || a === 'cast' || a === 'charge' || a === 'axes') && !los) return false;
    return true;
  });
  if (!ok.length) return null;
  // 근접 가능한 상황에서는 근접 공격을 선호
  const melee = ok.filter((a) => a === 'bite' || a === 'slash' || a === 'slam');
  const pool = melee.length && Math.random() < 0.6 ? melee : ok;
  return pool[(Math.random() * pool.length) | 0];
}

function beginAttack(g: Game, e: E, a: Atk): void {
  const p = g.aiTarget(e);
  e.atk = a as AttackKind;
  (e as any).atkX = a;
  e.state = 'windup';
  const wmul = e.enraged ? 0.75 : 1;
  e.stT = e.d.windup * wmul * (a === 'slam' ? 1.3 : a === 'charge' ? 1.1 : a === 'meteor' ? 0.6 : 1);
  e.aimX = p.x;
  e.aimY = p.y;
  e.pending = [];
  const ang = ANG(e.x, e.y, p.x, p.y);
  const tel = (shape: Hazard['shape'], dmg: number, extra: Partial<Hazard> = {}) => {
    const h: Hazard = { x: e.x, y: e.y, shape, t: e.stT, total: e.stT, team: 'enemy', dmg, element: 'phys', owner: e, knock: 30, ...extra };
    g.hazards.push(h);
    e.pending!.push(h);
    return h;
  };
  const atk = e.d.atk;
  switch (a) {
    case 'bite':
      tel({ k: 'cone', r: Math.min(e.d.range, 30) + e.r + 6, ang, spread: 0.6 }, atk, { fx: 'claw', status: e.d.id === 'spider' ? ['poison', 3, atk * 0.3] : undefined });
      break;
    case 'slash':
      tel({ k: 'cone', r: (e.boss ? 46 : Math.min(e.d.range, 30) + 8) + e.r, ang, spread: e.boss ? 1.0 : 0.75 }, atk * (e.boss ? 1.2 : 1), { fx: 'claw', knock: e.boss ? 60 : 30 });
      break;
    case 'slam': {
      const r = e.boss ? 58 : 34;
      tel({ k: 'circle', r }, atk * 1.4, { fx: 'slam', knock: 70, status: e.boss ? undefined : ['stun', 0.5] });
      if (e.enraged || (e.boss && e.phase >= 3)) {
        // 3페이즈: 퍼져 나가는 충격파 링
        for (let i = 1; i <= 3; i++) {
          const h: Hazard = { x: e.x, y: e.y, shape: { k: 'ring', r: r + i * 34, inner: r + i * 34 - 16 }, t: e.stT + i * 0.35, total: e.stT + i * 0.35, team: 'enemy', dmg: atk, element: 'phys', owner: e, knock: 50, fx: 'shock' };
          g.hazards.push(h);
          e.pending!.push(h);
        }
      }
      break;
    }
    case 'charge': {
      const len = e.boss ? 150 : 110;
      tel({ k: 'line', len, w: e.r * 2 + 6, ang }, 0, { silent: false, fx: 'none', dmg: 0 } as any);
      (e as any).fakeTel = true;
      e.chargeDir = [Math.cos(ang), Math.sin(ang)];
      e.chargeT = len / (e.boss ? 260 : 210);
      sfx('warn');
      break;
    }
    case 'shoot':
      tel({ k: 'line', len: 180, w: 3, ang }, 0, { dmg: 0 });
      break;
    case 'axes':
      for (const s of [-0.5, -0.25, 0, 0.25, 0.5]) tel({ k: 'line', len: 160, w: 3, ang: ang + s }, 0, { dmg: 0 });
      break;
    case 'meteor':
      for (let i = 0; i < 6; i++) {
        const aa = Math.random() * Math.PI * 2, rr = i === 0 ? 0 : 20 + Math.random() * 60;
        const thorn = e.d.id === 'forest_lord';
        const h: Hazard = { x: p.x + Math.cos(aa) * rr, y: p.y + Math.sin(aa) * rr * 0.8, shape: { k: 'circle', r: 22 }, t: 0.9 + i * 0.15, total: 0.9 + i * 0.15, team: 'enemy', dmg: atk * 1.2, element: thorn ? 'poison' : 'fire', owner: e, fx: thorn ? 'thorn' : 'meteor', knock: 30, status: thorn ? ['poison', 3, atk * 0.25] : ['burn', 2, atk * 0.2] };
        g.hazards.push(h);
      }
      e.stT = 0.6;
      break;
    case 'spit':
    case 'cast':
      e.flash = 0.15;
      break;
  }
  // 'dmg 0' 경고 표시는 발동해도 피해가 없도록 한다
  for (const h of e.pending) if (h.dmg === 0) (h as any).fake = true;
}

function resolveAttack(g: Game, e: E): void {
  const p = g.aiTarget(e);
  const a = (e as any).atkX as Atk;
  // 근접·광역은 위험 지역이 스스로 발동한다
  e.pending = e.pending?.filter((h) => !(h as any).fake && h.t > 0) ?? [];
  const recover = (t: number) => {
    e.state = 'recover';
    e.stT = t * (e.enraged ? 0.7 : 1);
    e.cd = e.d.cd * (e.enraged ? 0.7 : 1) * (0.8 + Math.random() * 0.4);
  };
  const atk = e.d.atk;
  switch (a) {
    case 'bite':
    case 'slash':
    case 'slam':
      sfx('swing');
      recover(a === 'slam' ? 0.7 : 0.35);
      break;
    case 'charge':
      e.state = 'charge';
      e.chargeHit = false;
      e.cd = e.d.cd;
      sfx('dash');
      break;
    case 'shoot': {
      sfx('arrow');
      g.shoot(e.x, e.y - 10, e.aimX, e.aimY - 8, { speed: 190, dmg: atk, kind: 'arrow', sprite: 'weapon_arrow', element: 'phys', team: 'enemy', owner: e, life: 1.4 });
      recover(0.4);
      break;
    }
    case 'axes': {
      const ang = ANG(e.x, e.y, e.aimX, e.aimY);
      for (const s of [-0.5, -0.25, 0, 0.25, 0.5]) {
        const pr = g.shoot(e.x, e.y - 14, e.x + Math.cos(ang + s) * 100, e.y - 14 + Math.sin(ang + s) * 100, { speed: 170, dmg: atk * 0.9, kind: 'axe', sprite: 'weapon_throwing_axe', element: 'phys', team: 'enemy', owner: e, life: 1.3, r: 5 });
        pr.spin = 0;
      }
      sfx('swing');
      recover(0.6);
      break;
    }
    case 'spit': {
      sfx('bolt');
      const n = e.boss && e.phase >= 2 ? 3 : 1;
      for (let i = 0; i < n; i++)
        g.shoot(e.x, e.y - 8 * e.scale, p.x, p.y - 8, { speed: 130, dmg: atk * 0.9, kind: 'orb', sprite: 'fx_orb_green', element: 'poison', team: 'enemy', owner: e, status: ['poison', 3, atk * 0.3], spread: (i - (n - 1) / 2) * 0.3, life: 1.6, knock: 10 });
      recover(0.4);
      break;
    }
    case 'cast': {
      sfx('bolt');
      const fire = e.d.id === 'fire_spirit' || e.d.id === 'big_demon' || e.d.id === 'imp';
      const green = e.d.id === 'forest_spirit' || e.d.id === 'dryad';
      const n = e.d.id === 'big_demon' ? 3 : e.d.id === 'dryad' ? 2 : 1;
      for (let i = 0; i < n; i++)
        g.shoot(e.x, e.y - 10 * e.scale, p.x, p.y - 8, {
          speed: fire ? 140 : 110, dmg: atk, kind: 'orb', sprite: fire ? 'fx_orb_fire' : green ? 'fx_orb_green' : 'fx_orb_dark', element: fire ? 'fire' : green ? 'poison' : 'dark', team: 'enemy', owner: e,
          spread: (i - (n - 1) / 2) * 0.35, life: 1.8, explode: e.d.id === 'fire_spirit' ? 20 : undefined, status: fire ? ['burn', 2, atk * 0.2] : green ? ['poison', 3, atk * 0.25] : ['slow', 1.5], knock: 15,
        });
      recover(0.5);
      break;
    }
    case 'meteor':
      recover(0.8);
      break;
    default:
      recover(0.4);
  }
}

function summon(g: Game, boss: E, id: string): void {
  for (let k = 0; k < 10; k++) {
    const a = Math.random() * Math.PI * 2, r = 30 + Math.random() * 30;
    const x = boss.x + Math.cos(a) * r, y = boss.y + Math.sin(a) * r;
    if (g.map.hits(x, y, 6)) continue;
    const m = new Enemy(ENEMIES[id], x, y, null) as E;
    m.summoned = true;
    m.aggro = true;
    m.state = 'chase';
    m.cd = 1;
    g.enemies.push(m);
    g.teleportFx(x, y);
    for (let i = 0; i < 8; i++) g.smokeFx(x + Math.random() * 10 - 5, y - 6, id === 'skelet' || id === 'tiny_zombie' ? '#5f2d56' : '#7b8994');
    return;
  }
}
