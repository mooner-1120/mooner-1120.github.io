// 타일맵: 지형, 충돌, 오브젝트, 길찾기(A*)
import { anim, drawFrame, frame } from './assets';

export const TS = 16;

export const enum T {
  Grass = 0, Flower, Dirt, Cobble, Water, DGrass, Ash, Lava, Floor, Wall, Void,
}

export interface MapObj {
  sprite: string;
  x: number; // 발 위치(가운데 아래)
  y: number;
  frames?: string[];
  fps?: number;
  /** 막히는 타일 범위 (발 기준, 타일 단위 반폭/높이) */
  solid?: { w: number; h: number };
  flip?: boolean;
  layer?: 'ground'; // 바닥에 깔리는 것(그림자 없이 먼저 그림)
  light?: number; // 어두운 맵에서 빛 반경
  tag?: string;
  /** 이 플래그가 켜져 있어야 보인다 */
  req?: string;
}

export interface Exit {
  x: number; y: number; w: number; h: number; // 타일 단위
  to: string;
  spawn: string;
  label: string;
  locked?: string; // 플래그 이름 — 켜져 있어야 열림
  lockMsg?: string;
}

export interface SpawnDef {
  id: string;
  x: number;
  y: number;
  respawn?: number; // 초
  tag?: string;
  req?: string;
  hide?: string;
}

export interface NpcDef {
  id: string;
  name: string;
  sprite: string;
  x: number;
  y: number;
  wander?: number;
  /** 이 플래그가 켜져 있어야 나타난다 */
  req?: string;
  /** 이 플래그 중 하나라도 켜지면 사라진다 */
  hide?: string[];
}

export interface Chest {
  x: number;
  y: number;
  id: string;
  tier: number;
}

export class GameMap {
  ground: Uint8Array;
  variant: Uint8Array;
  solid: Uint8Array;
  objects: MapObj[] = [];
  exits: Exit[] = [];
  spawns: SpawnDef[] = [];
  npcs: NpcDef[] = [];
  chests: Chest[] = [];
  points: Record<string, [number, number]> = {};
  dark = false;
  ambient = '#000';
  bgm = 'field';
  safe = false;
  wallStyle: 'dungeon' | 'none' = 'none';
  groundCanvas: HTMLCanvasElement | null = null;
  /** 출구 칸: 길찾기가 목적지가 아니면 피해 간다 (지나가다 다른 지역으로 빠지지 않게) */
  avoid: Uint8Array = new Uint8Array(0);
  animCells: number[] = [];

  constructor(
    public id: string,
    public name: string,
    public w: number,
    public h: number,
    fill: T = T.Grass,
  ) {
    this.ground = new Uint8Array(w * h).fill(fill);
    this.variant = new Uint8Array(w * h);
    this.solid = new Uint8Array(w * h);
    for (let i = 0; i < w * h; i++) this.variant[i] = (Math.random() * 256) | 0;
  }

  idx(x: number, y: number): number {
    return y * this.w + x;
  }
  inb(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.w && y < this.h;
  }
  get(x: number, y: number): T {
    return this.inb(x, y) ? (this.ground[this.idx(x, y)] as T) : T.Void;
  }
  set(x: number, y: number, t: T): void {
    if (this.inb(x, y)) this.ground[this.idx(x, y)] = t;
  }
  fillRect(x0: number, y0: number, w: number, h: number, t: T): void {
    for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) this.set(x, y, t);
  }
  blocked(tx: number, ty: number): boolean {
    if (!this.inb(tx, ty)) return true;
    const i = this.idx(tx, ty);
    if (this.solid[i]) return true;
    const g = this.ground[i];
    return g === T.Water || g === T.Wall || g === T.Void || g === T.Lava;
  }
  /** 원(발) 충돌: 반경 r 사각형이 막힌 타일과 겹치나 */
  hits(px: number, py: number, r: number): boolean {
    const x0 = Math.floor((px - r) / TS), x1 = Math.floor((px + r - 0.01) / TS);
    const y0 = Math.floor((py - r * 0.6) / TS), y1 = Math.floor((py + r * 0.4 - 0.01) / TS);
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.blocked(x, y)) return true;
    return false;
  }

  addObj(o: MapObj): MapObj {
    this.objects.push(o);
    if (o.solid) {
      // solid.w 칸 너비(발 x 가운데 정렬), solid.h 칸 높이(발 y 위로)
      const ty = Math.floor((o.y - 1) / TS);
      const x0 = Math.round(o.x / TS - o.solid.w / 2);
      for (let y = ty - o.solid.h + 1; y <= ty; y++)
        for (let x = x0; x < x0 + o.solid.w; x++) if (this.inb(x, y)) this.solid[this.idx(x, y)] = 1;
    }
    return o;
  }

  /** 시야(사거리 안 투사체용): 두 점 사이에 막힌 타일이 있나 */
  los(ax: number, ay: number, bx: number, by: number): boolean {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(d / 6);
    for (let i = 1; i < n; i++) {
      const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
      const tx = Math.floor(x / TS), ty = Math.floor(y / TS);
      const g = this.get(tx, ty);
      if (g === T.Wall || g === T.Void || this.solid[this.idx(tx, ty)]) return false;
    }
    return true;
  }

  // ── A* (8방향, 모서리 끼임 방지) ─────────────────────────────────
  findPath(sx: number, sy: number, gx: number, gy: number, maxNodes = 3000): [number, number][] | null {
    const W = this.w;
    let stx = Math.floor(sx / TS), sty = Math.floor(sy / TS);
    let gtx = Math.floor(gx / TS), gty = Math.floor(gy / TS);
    if (!this.inb(gtx, gty)) return null;
    if (this.blocked(gtx, gty)) {
      // 목표가 막혀 있으면 가장 가까운 빈 칸
      let best: [number, number] | null = null, bd = 1e9;
      for (let r = 1; r <= 3 && !best; r++)
        for (let y = gty - r; y <= gty + r; y++)
          for (let x = gtx - r; x <= gtx + r; x++)
            if (!this.blocked(x, y)) {
              const d = Math.hypot(x - stx, y - sty);
              if (d < bd) { bd = d; best = [x, y]; }
            }
      if (!best) return null;
      [gtx, gty] = best;
    }
    if (stx === gtx && sty === gty) return [[gx, gy]];
    const start = sty * W + stx, goal = gty * W + gtx;
    const g = new Map<number, number>();
    const came = new Map<number, number>();
    const open: [number, number][] = []; // [f, node] 이진 힙
    const push = (f: number, n: number) => {
      open.push([f, n]);
      let i = open.length - 1;
      while (i > 0) {
        const p = (i - 1) >> 1;
        if (open[p][0] <= open[i][0]) break;
        [open[p], open[i]] = [open[i], open[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = open[0];
      const last = open.pop()!;
      if (open.length) {
        open[0] = last;
        let i = 0;
        for (;;) {
          const l = i * 2 + 1, r = l + 1;
          let m = i;
          if (l < open.length && open[l][0] < open[m][0]) m = l;
          if (r < open.length && open[r][0] < open[m][0]) m = r;
          if (m === i) break;
          [open[m], open[i]] = [open[i], open[m]];
          i = m;
        }
      }
      return top;
    };
    const h = (n: number) => {
      const dx = Math.abs((n % W) - gtx), dy = Math.abs(((n / W) | 0) - gty);
      return dx + dy + (Math.SQRT2 - 2) * Math.min(dx, dy);
    };
    g.set(start, 0);
    push(h(start), start);
    let expanded = 0;
    const closed = new Set<number>();
    while (open.length) {
      const [, cur] = pop();
      if (cur === goal) break;
      if (closed.has(cur)) continue;
      closed.add(cur);
      if (++expanded > maxNodes) return null;
      const cx = cur % W, cy = (cur / W) | 0;
      for (let dy = -1; dy <= 1; dy++)
        for (let dx = -1; dx <= 1; dx++) {
          if (!dx && !dy) continue;
          const nx = cx + dx, ny = cy + dy;
          if (this.blocked(nx, ny) || this.avoided(nx, ny, gtx, gty, stx, sty)) continue;
          if (dx && dy && (this.blocked(cx + dx, cy) || this.blocked(cx, cy + dy))) continue;
          const n = ny * W + nx;
          const ng = g.get(cur)! + (dx && dy ? Math.SQRT2 : 1);
          if (ng < (g.get(n) ?? 1e9)) {
            g.set(n, ng);
            came.set(n, cur);
            push(ng + h(n), n);
          }
        }
    }
    if (!came.has(goal)) return null;
    const cells: number[] = [];
    for (let n = goal; n !== start; n = came.get(n)!) cells.push(n);
    cells.reverse();
    const pts: [number, number][] = cells.map((n) => [(n % W) * TS + TS / 2, ((n / W) | 0) * TS + TS / 2]);
    pts[pts.length - 1] = [gx, gy];
    if (this.blocked(Math.floor(gx / TS), Math.floor(gy / TS))) pts[pts.length - 1] = [gtx * TS + 8, gty * TS + 8];
    // 직선으로 갈 수 있는 중간점은 건너뛴다
    const out: [number, number][] = [];
    let ax = sx, ay = sy;
    for (let i = 0; i < pts.length; i++) {
      const nxt = pts[i + 1];
      if (nxt && this.clearLine(ax, ay, nxt[0], nxt[1])) continue;
      out.push(pts[i]);
      [ax, ay] = pts[i];
    }
    return out;
  }

  clearLine(ax: number, ay: number, bx: number, by: number, r = 5): boolean {
    const d = Math.hypot(bx - ax, by - ay);
    const n = Math.ceil(d / 4);
    const gtx = Math.floor(bx / TS), gty = Math.floor(by / TS);
    for (let i = 1; i <= n; i++) {
      const x = ax + ((bx - ax) * i) / n, y = ay + ((by - ay) * i) / n;
      if (this.hits(x, y, r)) return false;
      if (this.avoided(Math.floor(x / TS), Math.floor(y / TS), gtx, gty, Math.floor(ax / TS), Math.floor(ay / TS))) return false;
    }
    return true;
  }

  // ── 지형 미리 그리기 ─────────────────────────────────────────────
  markExits(): void {
    this.avoid = new Uint8Array(this.w * this.h);
    // 출구 칸 + 주변 1칸 (출구 판정이 1칸 정도 넉넉하므로)
    for (const e of this.exits)
      for (let y = e.y - 1; y < e.y + e.h + 1; y++) for (let x = e.x - 1; x < e.x + e.w + 1; x++) if (this.inb(x, y)) this.avoid[this.idx(x, y)] = 1;
  }

  private avoided(x: number, y: number, gx: number, gy: number, sx = -99, sy = -99): boolean {
    if (!this.inb(x, y) || !this.avoid.length || !this.avoid[this.idx(x, y)]) return false;
    // 목적지가 속한 출구는 허용
    const inside = (e: Exit, tx: number, ty: number) => tx >= e.x - 1 && tx < e.x + e.w + 1 && ty >= e.y - 1 && ty < e.y + e.h + 1;
    for (const e of this.exits) if (inside(e, x, y) && !inside(e, gx, gy) && !inside(e, sx, sy)) return true;
    return false;
  }

  prerender(): void {
    this.markExits();
    const cv = document.createElement('canvas');
    cv.width = this.w * TS;
    cv.height = this.h * TS;
    const g = cv.getContext('2d')!;
    g.imageSmoothingEnabled = false;
    this.animCells = [];
    for (let y = 0; y < this.h; y++)
      for (let x = 0; x < this.w; x++) {
        const t = this.get(x, y);
        if (t === T.Water || t === T.Lava) {
          this.animCells.push(this.idx(x, y));
          continue;
        }
        this.drawCell(g, x, y, t, 0);
      }
    this.groundCanvas = cv;
  }

  private isGrassy(t: T): boolean {
    return t === T.Grass || t === T.Flower || t === T.DGrass;
  }

  drawCell(g: CanvasRenderingContext2D, x: number, y: number, t: T, time: number): void {
    const v = this.variant[this.idx(x, y)];
    const px = x * TS, py = y * TS;
    const tile = (n: string) => drawFrame(g, n, px, py, { ax: 0, ay: 0 });
    const mask = (pred: (t: T) => boolean) => {
      let m = 0;
      if (pred(this.get(x, y - 1))) m |= 1;
      if (pred(this.get(x + 1, y))) m |= 2;
      if (pred(this.get(x, y + 1))) m |= 4;
      if (pred(this.get(x - 1, y))) m |= 8;
      return m;
    };
    switch (t) {
      case T.Grass:
        tile(v < 40 ? 't_grass_1' : v < 80 ? 't_grass_2' : v < 120 ? 't_grass_3' : v < 135 ? 't_grass_flower_0' : 't_grass_0');
        break;
      case T.Flower:
        tile(v % 2 ? 't_grass_flower_0' : 't_grass_flower_1');
        break;
      case T.DGrass:
        tile(v % 2 ? 't_dgrass_0' : 't_dgrass_1');
        break;
      case T.Dirt:
      case T.Cobble: {
        tile(t === T.Dirt ? (v % 2 ? 't_dirt_0' : 't_dirt_1') : v % 2 ? 't_cobble_0' : 't_cobble_1');
        const m = mask((n) => this.isGrassy(n));
        if (m) tile('e_grass_' + m);
        break;
      }
      case T.Water: {
        tile('t_water_' + (Math.floor(time * 2 + (x + y) * 0.3) % 3));
        const m = mask((n) => n !== T.Water && n !== T.Void);
        if (m) tile('e_shore_' + m);
        break;
      }
      case T.Ash: {
        tile(v % 2 ? 't_ash_0' : 't_ash_1');
        const m = mask((n) => this.isGrassy(n));
        if (m) tile('e_grass_' + m);
        break;
      }
      case T.Lava: {
        tile('t_lava_' + (Math.floor(time * 2 + (x * 7 + y) * 0.2) % 3));
        const m = mask((n) => n === T.Ash);
        if (m) tile('e_ashedge_' + m);
        break;
      }
      case T.Floor: {
        const f = v < 215 ? 'floor_1' : 'floor_' + (2 + (v % 7));
        tile(f);
        break;
      }
      case T.Wall:
        this.drawWall(g, x, y, v);
        break;
      case T.Void:
        g.fillStyle = '#0d0a0c';
        g.fillRect(px, py, TS, TS);
        break;
    }
  }

  private floorish(t: T): boolean {
    return t === T.Floor || t === T.Dirt || t === T.Grass || t === T.Cobble || t === T.Ash;
  }

  private drawWall(g: CanvasRenderingContext2D, x: number, y: number, v: number): void {
    const px = x * TS, py = y * TS;
    const below = this.get(x, y + 1);
    if (this.floorish(below)) {
      // 정면 벽돌
      const n = v < 12 ? 'wall_hole_1' : v < 22 ? 'wall_hole_2' : v < 30 ? 'wall_banner_red' : v < 36 ? 'wall_banner_blue' : 'wall_mid';
      drawFrame(g, 'wall_mid', px, py, { ax: 0, ay: 0 });
      if (n !== 'wall_mid') drawFrame(g, n, px, py, { ax: 0, ay: 0 });
      // 위 칸에 벽 윗면 띠
      drawFrame(g, 'wall_top_mid', px, py - TS, { ax: 0, ay: 0 });
      return;
    }
    // 벽 안쪽(천장): 어둠 + 바닥과 닿은 쪽에 돌 테두리
    const above = this.get(x, y - 1);
    const faceBelow = this.get(x, y + 1) === T.Wall && this.floorish(this.get(x, y + 2));
    g.fillStyle = '#1a1316';
    g.fillRect(px, py, TS, TS);
    const lt = '#8b7468', md = '#5a4842';
    if (this.floorish(this.get(x + 1, y)) || (this.get(x + 1, y) === T.Wall && this.floorish(this.get(x + 1, y + 1)) && !faceBelow)) {
      g.fillStyle = md; g.fillRect(px + 12, py, 4, TS);
      g.fillStyle = lt; g.fillRect(px + 13, py, 2, TS);
    }
    if (this.floorish(this.get(x - 1, y)) || (this.get(x - 1, y) === T.Wall && this.floorish(this.get(x - 1, y + 1)) && !faceBelow)) {
      g.fillStyle = md; g.fillRect(px, py, 4, TS);
      g.fillStyle = lt; g.fillRect(px + 1, py, 2, TS);
    }
    if (this.floorish(above)) {
      g.fillStyle = md; g.fillRect(px, py, TS, 4);
      g.fillStyle = lt; g.fillRect(px, py + 1, TS, 2);
    }
  }

  drawGround(g: CanvasRenderingContext2D, cx: number, cy: number, vw: number, vh: number, time: number): void {
    if (this.groundCanvas) g.drawImage(this.groundCanvas, 0, 0);
    const x0 = Math.floor(cx / TS) - 1, y0 = Math.floor(cy / TS) - 1;
    const x1 = x0 + Math.ceil(vw / TS) + 2, y1 = y0 + Math.ceil(vh / TS) + 2;
    for (const i of this.animCells) {
      const x = i % this.w, y = (i / this.w) | 0;
      if (x < x0 || x > x1 || y < y0 || y > y1) continue;
      this.drawCell(g, x, y, this.ground[i] as T, time);
    }
  }

  objFrame(o: MapObj, time: number): string {
    if (o.frames) return o.frames[Math.floor(time * (o.fps ?? 6)) % o.frames.length];
    return o.sprite;
  }

  objHeight(o: MapObj): number {
    const f = frame(o.sprite);
    return f ? f[3] : 16;
  }
}

export function animFrames(base: string, kind: string): string[] {
  return anim(base, kind);
}
