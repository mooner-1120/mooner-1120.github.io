// 협동 플레이 규칙
// - 각자 자기 캐릭터는 자기 컴퓨터에서 움직이고 위치를 알린다.
// - 방장과 같은 지역에 있으면 몬스터는 방장 컴퓨터가 움직이고(AI), 참가자는 그 모습을 받아 그린다.
//   참가자가 때린 피해는 방장에게 보내 적용하고, 처치하면 그 지역의 모두가 경험치·퀘스트·전리품을 받는다.
// - 방장과 다른 지역에 있는 참가자는 평소처럼 혼자 하는 게임으로 돌아간다.
import { sfx } from './audio';
import { ENEMIES, Element } from './data';
import { Enemy, Hazard, Projectile, StatusId } from './entities';
import type { Game } from './game';
import { hostRoom, joinRoom, makeCode, Transport } from './net';
import { baseOf } from './items';
import { RACES } from './data';

export interface Remote {
  id: string;
  name: string;
  race: string;
  cls: string;
  gender: string;
  level: number;
  map: string;
  x: number;
  y: number;
  tx: number;
  ty: number;
  flip: boolean;
  moving: boolean;
  hp: number;
  maxHp: number;
  dead: boolean;
  sprite: string;
  weapon: string;
  swing: number;
  aim: number;
  animT: number;
  seen: number;
}

const FLAG = { flip: 1, moving: 2, windup: 4, dead: 8, stun: 16, slow: 32, poison: 64, enraged: 128, charge: 256, aggro: 512, flash: 1024 };

export class Coop {
  t: Transport | null = null;
  role: 'none' | 'host' | 'guest' = 'none';
  code = '';
  players = new Map<string, Remote>();
  hostMap = '';
  private sendT = 0;
  private snapT = 0;
  private deadNids = new Set<number>();
  chatLog: { name: string; text: string; t: number; mine?: boolean }[] = [];
  onChange: () => void = () => {};

  constructor(private g: Game) {}

  get on(): boolean {
    return this.role !== 'none';
  }
  /** 참가자인데 방장과 같은 지역: 몬스터를 방장이 움직인다 */
  get mirrored(): boolean {
    return this.role === 'guest' && this.hostMap === this.g.map?.id;
  }
  /** 이 지역에 다른 플레이어가 있나 */
  othersHere(): Remote[] {
    const m = this.g.map?.id;
    return [...this.players.values()].filter((p) => p.map === m);
  }

  // ── 방 만들기 / 참가 / 나가기 ────────────────────────────────────
  async host(): Promise<string> {
    const code = makeCode();
    const t = await hostRoom(code);
    this.attach(t, 'host');
    this.code = code;
    this.hostMap = this.g.map.id;
    this.sys(`방을 만들었습니다. 참가 코드: ${code}`);
    return code;
  }

  async join(code: string): Promise<void> {
    const t = await joinRoom(code.trim().toUpperCase());
    this.attach(t, 'guest');
    this.code = code.trim().toUpperCase();
    t.send('host', { t: 'hello', ...this.me() });
    this.sys('방에 참가했습니다.');
  }

  private reconnecting = false;
  /** 참가자: 방장과 끊기면 같은 코드로 몇 번 다시 붙어 본다 */
  async reconnect(): Promise<void> {
    if (this.reconnecting || !this.t || this.role !== 'guest') return;
    this.reconnecting = true;
    const code = this.code, oldId = this.t.id;
    try { this.t.close(); } catch { /* */ }
    this.sys('방장과 연결이 잠깐 끊겼습니다. 다시 연결하는 중…');
    for (let i = 0; i < 4; i++) {
      try {
        const t = await joinRoom(code, oldId);
        this.attach(t, 'guest');
        t.send('host', { t: 'hello', ...this.me() });
        this.sys('다시 연결되었습니다.');
        this.reconnecting = false;
        return;
      } catch { await new Promise((r) => setTimeout(r, 2000)); }
    }
    this.reconnecting = false;
    this.t = null;
    const wasMirrored = this.mirrored;
    this.role = 'none';
    this.players.clear();
    this.hostMap = '';
    if (wasMirrored) this.g.leaveSharedWorld();
    this.sys('방장과 다시 연결하지 못했습니다. 혼자 하기로 돌아갑니다. (파티 창에서 다시 참가할 수 있어요)');
    this.onChange();
  }

  leave(reason = '파티를 떠났습니다.'): void {
    if (!this.t) return;
    try { this.t.send('*', { t: 'bye' }); } catch { /* */ }
    this.t.close();
    this.t = null;
    const wasMirrored = this.mirrored;
    this.role = 'none';
    this.players.clear();
    this.hostMap = '';
    if (wasMirrored) this.g.leaveSharedWorld();
    this.sys(reason);
    this.onChange();
  }

  private attach(t: Transport, role: 'host' | 'guest'): void {
    this.t = t;
    this.role = role;
    t.onMessage((from, msg) => this.handle(from, msg));
    t.onPeer((id, joined) => {
      if (joined) return;
      if (role === 'guest') { void this.reconnect(); return; }
      const p = this.players.get(id);
      this.players.delete(id);
      if (p) { this.sys(`${p.name} 님이 떠났습니다.`); this.broadcast({ t: 'left', id }); }
      this.onChange();
    });
    this.onChange();
  }

  private me() {
    const g = this.g, h = g.hero, p = g.p;
    return {
      name: h.name, race: h.race, cls: h.cls, gender: h.gender, level: h.level, map: g.map.id,
      x: Math.round(p.x), y: Math.round(p.y), flip: p.flip, moving: p.moving || !!p.roll || !!p.dash,
      hp: Math.round(p.hp), maxHp: g.der.maxHp, dead: p.dead, sprite: p.sprite,
      weapon: h.equip.weapon ? baseOf(h.equip.weapon).icon : '', swing: p.swingT > 0 ? +(1 - p.swingT / p.swingDur).toFixed(2) : -1, aim: +p.aimAng.toFixed(2),
    };
  }

  private send(msg: any): void {
    this.t?.send(this.role === 'host' ? '*' : 'host', msg);
  }
  /** 방장: 보낸 사람(except)을 빼고 모두에게 */
  private broadcast(msg: any, except?: string): void {
    if (!this.t || this.role !== 'host') return;
    for (const id of this.players.keys()) if (id !== except) this.t.send(id, msg);
  }

  // ── 매 프레임 ───────────────────────────────────────────────────
  tick(dt: number): void {
    if (!this.t) return;
    const g = this.g;
    this.sendT -= dt;
    if (this.sendT <= 0) {
      this.sendT = 1 / 15;
      const st = { t: 'ps', id: this.t.id, ...this.me() };
      if (this.role === 'host') { this.hostMap = g.map.id; this.broadcast(st); }
      else this.send(st);
    }
    // 방장: 같은 지역 참가자에게 몬스터 상태
    if (this.role === 'host') {
      this.snapT -= dt;
      const here = this.othersHere();
      if (this.snapT <= 0 && here.length) {
        this.snapT = 0.1;
        const list = g.enemies.map((e) => {
          let f = 0;
          if (e.flip) f |= FLAG.flip;
          if (e.moving || e.state === 'charge') f |= FLAG.moving;
          if (e.state === 'windup') f |= FLAG.windup;
          if (e.dead) f |= FLAG.dead;
          if (e.has('stun')) f |= FLAG.stun;
          if (e.has('slow')) f |= FLAG.slow;
          if (e.has('poison')) f |= FLAG.poison;
          if ((e as any).enraged) f |= FLAG.enraged;
          if (e.state === 'charge') f |= FLAG.charge;
          if (e.aggro) f |= FLAG.aggro;
          if (e.flash > 0.05) f |= FLAG.flash;
          return [e.nid, e.d.id, Math.round(e.x), Math.round(e.y), Math.ceil(e.hp), e.maxHp, f, e.phase];
        });
        for (const p of here) this.t.send(p.id, { t: 'es', map: g.map.id, list });
      }
      // 새로 생긴 적의 공격(경고 범위·투사체)을 같은 지역 참가자에게
      if (here.length) {
        for (const h of g.hazards) {
          if (h.team !== 'enemy' || (h as any).sent || (h as any).remote) continue;
          (h as any).sent = true;
          const msg = { t: 'hz', map: g.map.id, h: { x: Math.round(h.x), y: Math.round(h.y), shape: h.shape, t: h.t, total: h.total, dmg: h.dmg, element: h.element, status: h.status, knock: h.knock, fx: h.fx, silent: h.silent, fake: (h as any).fake } };
          for (const p of here) this.t.send(p.id, msg);
        }
        for (const pr of g.projs) {
          if (pr.team !== 'enemy' || (pr as any).sent || (pr as any).remote) continue;
          (pr as any).sent = true;
          const msg = { t: 'pj', map: g.map.id, p: { x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy, dmg: pr.dmg, r: pr.r, life: pr.life, sprite: pr.sprite, kind: pr.kind, element: pr.element, status: pr.status, explode: pr.explode, knock: pr.knock, spin: pr.spin } };
          for (const p of here) this.t.send(p.id, msg);
        }
      }
    }
    // 다른 플레이어 위치 보간
    for (const p of this.players.values()) {
      const k = Math.min(1, dt * 12);
      if (Math.hypot(p.tx - p.x, p.ty - p.y) > 80) { p.x = p.tx; p.y = p.ty; }
      p.x += (p.tx - p.x) * k;
      p.y += (p.ty - p.y) * k;
      p.animT += dt;
    }
    // 몬스터 미러 보간
    if (this.mirrored) {
      for (const e of g.enemies) {
        if (!e.remote) continue;
        const k = Math.min(1, dt * 10);
        e.x += (e.rx - e.x) * k;
        e.y += (e.ry - e.y) * k;
        e.animT += dt;
        e.flash = Math.max(0, e.flash - dt);
        if (e.dead) e.deathT += dt;
        for (const s of Object.keys(e.status) as StatusId[]) { const st = e.status[s]!; st.t -= dt; if (st.t <= 0) delete e.status[s]; }
      }
      g.enemies = g.enemies.filter((e) => !(e.dead && e.deathT > 0.6));
    }
  }

  // ── 받은 메시지 ─────────────────────────────────────────────────
  private handle(from: string, msg: any): void {
    const g = this.g;
    if (!msg || typeof msg !== 'object') return;
    switch (msg.t) {
      case 'full':
        this.leave('방이 가득 찼습니다 (최대 4명).');
        return;
      case 'hello': {
        if (this.role !== 'host') return;
        this.upsert(from, msg);
        this.sys(`${msg.name} 님이 들어왔습니다. (Lv.${msg.level} ${RACES[msg.race as keyof typeof RACES]?.name ?? ''})`);
        sfx('buff');
        // 새 참가자에게 지금 있는 사람들
        this.t!.send(from, { t: 'roster', list: [{ id: this.t!.id, ...this.me() }, ...[...this.players.values()].filter((p) => p.id !== from)] });
        this.broadcast({ t: 'ps', id: from, ...msg }, from);
        this.onChange();
        return;
      }
      case 'roster':
        for (const p of msg.list) this.upsert(p.id, p);
        this.hostMap = msg.list[0]?.map ?? '';
        this.onChange();
        return;
      case 'ps': {
        const id = msg.id ?? from;
        if (id === this.t?.id) return;
        const isNew = !this.players.has(id);
        this.upsert(id, msg);
        if (this.role === 'host') this.broadcast(msg, from);
        else if (id === from) this.hostMap = msg.map; // 방장의 위치
        if (isNew) this.onChange();
        return;
      }
      case 'left':
        this.players.delete(msg.id);
        this.onChange();
        return;
      case 'bye':
        if (this.role === 'guest') this.leave('방장이 방을 닫았습니다. 혼자 하기로 돌아갑니다.');
        return;
      case 'chat':
        this.chatLog.push({ name: msg.name, text: String(msg.text).slice(0, 120), t: g.time });
        if (this.chatLog.length > 30) this.chatLog.shift();
        sfx('ui');
        if (this.role === 'host') this.broadcast(msg, from);
        this.onChange();
        return;
      case 'es':
        if (this.mirrored && msg.map === g.map.id) this.applySnapshot(msg.list);
        return;
      case 'hz':
        if (this.mirrored && msg.map === g.map.id) g.hazards.push({ ...msg.h, team: 'enemy', remote: true } as Hazard);
        return;
      case 'pj':
        if (this.mirrored && msg.map === g.map.id) g.projs.push({ ...msg.p, team: 'enemy', pierce: 0, hit: new Set(), remote: true } as unknown as Projectile);
        return;
      case 'vp':
        // 다른 플레이어의 화살·마법 (보이기만 함)
        if (msg.map === g.map.id) g.projs.push({ ...msg.p, team: 'player', dmg: 0, pierce: 99, hit: new Set(), visual: true } as unknown as Projectile);
        if (this.role === 'host') this.broadcast(msg, from);
        return;
      case 'vfx':
        if (msg.map === g.map.id) g.remoteFx(msg.k, msg.x, msg.y, msg.a ?? 0, msg.r ?? 20);
        if (this.role === 'host') this.broadcast(msg, from);
        return;
      case 'hit': {
        // 참가자가 몬스터를 때렸다 (방장만 받음)
        if (this.role !== 'host' || msg.map !== g.map.id) return;
        const e = g.enemies.find((x) => x.nid === msg.nid && !x.dead);
        if (e) g.applyRemoteHit(e, msg);
        return;
      }
      case 'st': {
        if (this.role !== 'host' || msg.map !== g.map.id) return;
        const e = g.enemies.find((x) => x.nid === msg.nid && !x.dead);
        if (e) g.applyStatus(e, msg.s, msg.d, msg.dps);
        return;
      }
      case 'kill': {
        if (msg.map !== g.map.id || this.role !== 'guest') return;
        this.deadNids.add(msg.nid);
        let e = g.enemies.find((x) => x.nid === msg.nid);
        if (!e) { e = this.mirror(msg.nid, msg.id, msg.x, msg.y); g.enemies.push(e); }
        g.killEnemy(e, true);
        return;
      }
      case 'say':
        if (msg.id !== this.t?.id) this.g.say('p:' + msg.id, String(msg.text).slice(0, 80));
        if (this.role === 'host') this.broadcast(msg, from);
        return;
      case 'banter':
        if (msg.to === this.t?.id) this.g.banterReply(msg.key, msg.i);
        else if (this.role === 'host') this.t?.send(msg.to, msg);
        return;
      case 'dmg':
        // 방장 쪽 몬스터(돌진 등)가 나를 쳤다
        if (msg.map === g.map.id) g.hurtPlayer(msg.dmg, { from: { x: msg.x, y: msg.y }, knock: msg.knock ?? 60 });
        return;
    }
  }

  private upsert(id: string, s: any): void {
    let p = this.players.get(id);
    if (!p) {
      p = { id, name: s.name, race: s.race, cls: s.cls, gender: s.gender, level: s.level, map: s.map, x: s.x, y: s.y, tx: s.x, ty: s.y, flip: false, moving: false, hp: s.hp, maxHp: s.maxHp, dead: false, sprite: s.sprite, weapon: s.weapon, swing: -1, aim: 0, animT: 0, seen: 0 };
      this.players.set(id, p);
    }
    if (p.map !== s.map) { p.x = s.x; p.y = s.y; }
    Object.assign(p, { name: s.name, level: s.level, map: s.map, tx: s.x, ty: s.y, flip: s.flip, moving: s.moving, hp: s.hp, maxHp: s.maxHp, dead: s.dead, sprite: s.sprite, weapon: s.weapon, swing: s.swing, aim: s.aim, seen: this.g.time });
  }

  private mirror(nid: number, id: string, x: number, y: number): Enemy {
    const e = new Enemy(ENEMIES[id], x, y, null);
    e.nid = nid;
    e.remote = true;
    e.rx = x;
    e.ry = y;
    return e;
  }

  private applySnapshot(list: [number, string, number, number, number, number, number, number][]): void {
    const g = this.g;
    const seen = new Set<number>();
    const byNid = new Map(g.enemies.filter((e) => e.remote).map((e) => [e.nid, e]));
    for (const [nid, id, x, y, hp, maxHp, f, phase] of list) {
      if (this.deadNids.has(nid) || !ENEMIES[id]) continue;
      seen.add(nid);
      let e = byNid.get(nid);
      if (!e) { e = this.mirror(nid, id, x, y); g.enemies.push(e); }
      e.rx = x;
      e.ry = y;
      e.maxHp = maxHp;
      if (hp < e.hp) e.hpBarT = 2.5;
      e.hp = hp;
      e.flip = !!(f & FLAG.flip);
      e.moving = !!(f & FLAG.moving);
      e.state = f & FLAG.charge ? 'charge' : f & FLAG.windup ? 'windup' : 'chase';
      e.aggro = !!(f & FLAG.aggro);
      e.phase = phase;
      (e as any).enraged = !!(f & FLAG.enraged);
      if (f & FLAG.flash) e.flash = Math.max(e.flash, 0.1);
      const set = (s: StatusId, on: boolean) => { if (on) e!.status[s] = { t: 0.3 }; };
      set('stun', !!(f & FLAG.stun));
      set('slow', !!(f & FLAG.slow));
      set('poison', !!(f & FLAG.poison));
      if (e.boss && e.aggro && g.boss !== e) g.bossEngaged(e);
    }
    g.enemies = g.enemies.filter((e) => !e.remote || seen.has(e.nid) || e.dead);
  }

  // ── 보내기 ──────────────────────────────────────────────────────
  sendHit(e: Enemy, base: number, o: { element: Element; knock: number; kx?: number; ky?: number; crit: boolean; status?: [StatusId, number, number?] }): void {
    this.send({ t: 'hit', map: this.g.map.id, nid: e.nid, base, ...o });
  }
  sendStatus(e: Enemy, s: StatusId, d: number, dps?: number): void {
    this.send({ t: 'st', map: this.g.map.id, nid: e.nid, s, d, dps });
  }
  sendKill(e: Enemy): void {
    const msg = { t: 'kill', map: this.g.map.id, nid: e.nid, id: e.d.id, x: Math.round(e.x), y: Math.round(e.y) };
    for (const p of this.othersHere()) this.t?.send(p.id, msg);
  }
  sendDamage(to: string, dmg: number, x: number, y: number, knock: number): void {
    this.t?.send(to, { t: 'dmg', map: this.g.map.id, dmg, x, y, knock });
  }
  sendVisualProjectile(pr: Projectile): void {
    if (!this.t) return;
    this.send({ t: 'vp', map: this.g.map.id, p: { x: pr.x, y: pr.y, vx: pr.vx, vy: pr.vy, life: pr.life, sprite: pr.sprite, kind: pr.kind, r: pr.r, element: pr.element, spin: pr.spin } });
  }
  sendFx(k: string, x: number, y: number, a = 0, r = 20): void {
    if (!this.t) return;
    this.send({ t: 'vfx', map: this.g.map.id, k, x: Math.round(x), y: Math.round(y), a: +a.toFixed(2), r });
  }
  sendSay(text: string): void {
    if (!this.t) return;
    this.send({ t: 'say', id: this.t.id, text });
  }
  sendBanter(to: string, key: string, i: number): void {
    if (!this.t) return;
    this.send({ t: 'banter', to, key, i });
  }
  chat(text: string): void {
    text = text.trim().slice(0, 120);
    if (!text || !this.t) return;
    const msg = { t: 'chat', name: this.g.hero.name, text };
    this.send(msg);
    this.chatLog.push({ name: this.g.hero.name, text, t: this.g.time, mine: true });
    this.onChange();
  }
  private sys(text: string): void {
    this.chatLog.push({ name: '알림', text, t: this.g.time });
    this.onChange();
  }

  /** 방장 AI가 노릴 수 있는 다른 플레이어들 (같은 지역, 살아 있음) */
  targets(): Remote[] {
    if (this.role !== 'host') return [];
    return this.othersHere().filter((p) => !p.dead && this.g.time - p.seen < 3);
  }
}
