// 지역 만들기 — 마을(허브), 솔라리온 평원, 잊혀진 지하 묘지, 도적단 요새, 균열의 틈
import { anim } from './assets';
import { GameMap, T, TS } from './tilemap';

function rng(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const px = (t: number) => t * TS + TS / 2;
const foot = (t: number) => (t + 1) * TS;

function tree(m: GameMap, tx: number, ty: number, kind = 0) {
  const s = ['o_tree_0', 'o_tree_1', 'o_pine_0', 'o_tree_dark', 'o_tree_dead'][kind];
  m.addObj({ sprite: s, x: px(tx), y: foot(ty) - 2, solid: { w: 1, h: 1 }, flip: (tx + ty) % 2 === 0 });
}
function obj(m: GameMap, s: string, tx: number, ty: number, sw = 1, sh = 1, extra: Partial<Parameters<GameMap['addObj']>[0]> = {}) {
  return m.addObj({ sprite: s, x: px(tx), y: foot(ty), solid: sw ? { w: sw, h: sh } : undefined, ...extra });
}
function campfire(m: GameMap, tx: number, ty: number) {
  m.addObj({ sprite: 'o_campfire_0', frames: ['o_campfire_0', 'o_campfire_1', 'o_campfire_2', 'o_campfire_3'], fps: 8, x: px(tx), y: foot(ty) - 1, solid: { w: 1, h: 1 }, light: 70 });
}
function torch(m: GameMap, tx: number, ty: number, red = false) {
  // 벽 분수(빨강/파랑)를 횃불 대신 광원으로 쓴다
  const c = red ? 'red' : 'blue';
  m.addObj({ sprite: `wall_fountain_mid_${c}_anim_f0`, frames: anim(`wall_fountain_mid_${c}`, 'x'), fps: 6, x: px(tx), y: foot(ty), light: 80, layer: 'ground' });
}
function border(m: GameMap, r: () => number, thick = 2, kinds = [0, 1, 2]) {
  for (let y = 0; y < m.h; y++)
    for (let x = 0; x < m.w; x++) {
      const edge = x < thick || y < thick || x >= m.w - thick || y >= m.h - thick;
      if (!edge || m.get(x, y) === T.Dirt) continue;
      if ((x + y) % 2 === 0 || r() < 0.5) tree(m, x, y, kinds[(r() * kinds.length) | 0]);
      else m.solid[m.idx(x, y)] = 1;
    }
}

// ═══════════════════════════════════════════════════════════════════
export function buildVillage(): GameMap {
  const m = new GameMap('village', '솔라리온 변경 마을 · 하스벨', 46, 34);
  m.safe = true;
  m.bgm = 'village';
  const r = rng(11);
  // 광장 + 길
  m.fillRect(16, 13, 14, 9, T.Cobble);
  m.fillRect(29, 16, 17, 3, T.Dirt); // 동쪽 → 평원
  m.fillRect(21, 4, 3, 9, T.Dirt); // 북쪽 → 예배당
  m.fillRect(6, 16, 10, 2, T.Dirt); // 서쪽 집들
  m.fillRect(21, 22, 3, 6, T.Dirt); // 남쪽
  // 연못
  for (let y = 24; y < 31; y++)
    for (let x = 4; x < 14; x++) if (Math.hypot((x - 8.5) / 5, (y - 27) / 3.2) < 1) m.set(x, y, T.Water);
  // 꽃밭
  for (let i = 0; i < 40; i++) {
    const x = 3 + ((r() * 40) | 0), y = 3 + ((r() * 28) | 0);
    if (m.get(x, y) === T.Grass) m.set(x, y, T.Flower);
  }
  border(m, r, 2);
  // 건물
  obj(m, 'o_chapel', 22, 4, 3, 2);
  obj(m, 'o_shop', 18, 11, 4, 2);
  obj(m, 'o_smithy', 28, 11, 4, 2);
  obj(m, 'o_house_red', 9, 14, 4, 2);
  obj(m, 'o_house_blue', 9, 22, 4, 2);
  obj(m, 'o_house_green', 34, 13, 4, 2);
  obj(m, 'o_house_red', 34, 25, 4, 2);
  obj(m, 'o_house_blue', 28, 28, 4, 2);
  // 광장 장식
  obj(m, 'o_statue', 23, 17, 1, 1, { tag: 'save' });
  obj(m, 'o_well', 18, 20, 2, 1);
  obj(m, 'o_stall_red', 27, 20, 2, 1);
  obj(m, 'o_stall_blue', 16, 22, 0, 0);
  obj(m, 'o_barrel', 32, 11, 1, 1);
  obj(m, 'o_barrel', 33, 11, 1, 1);
  obj(m, 'crate', 26, 11, 1, 1);
  obj(m, 'o_sign', 41, 15, 0, 0);
  for (let x = 6; x < 14; x++) obj(m, 'o_fence_h', x, 19, 1, 1);
  for (let x = 36; x < 42; x++) if (x !== 39) obj(m, 'o_fence_h', x, 21, 1, 1);
  for (const [x, y, k] of [[4, 5, 0], [6, 4, 1], [14, 4, 0], [30, 5, 1], [38, 5, 0], [41, 9, 2], [4, 10, 2], [15, 28, 1], [38, 30, 0], [42, 26, 2]] as const) tree(m, x, y, k);
  obj(m, 'o_bush_1', 12, 8, 1, 1);
  obj(m, 'o_bush_0', 31, 8, 1, 1);
  obj(m, 'o_bush_0', 26, 31, 1, 1);
  campfire(m, 37, 18);
  m.points.start = [px(23), px(19)];
  m.points.east = [px(43), px(17)];
  m.points.statue = [px(23), px(19)];
  m.exits.push({ x: 45, y: 15, w: 1, h: 5, to: 'field', spawn: 'west', label: '솔라리온 평원' });
  m.npcs.push(
    { id: 'elder', name: '촌장 오스윈', sprite: 'wizzard_m', x: px(25), y: px(15) },
    { id: 'captain', name: '경비대장 레아', sprite: 'knight_f', x: px(40), y: px(16) },
    { id: 'smith', name: '대장장이 브론', sprite: 'dwarf_m', x: px(28), y: px(13) },
    { id: 'merchant', name: '행상인 시스', sprite: 'lizard_f', x: px(27), y: px(21) },
    { id: 'alchemist', name: '연금술사 리엘', sprite: 'elf_f', x: px(17), y: px(23) },
    { id: 'priest', name: '신관 마렌', sprite: 'wizzard_f', x: px(22), y: px(6) },
    { id: 'stranger', name: '두건 쓴 방랑자', sprite: 'doc', x: px(6), y: px(21) },
    { id: 'villager1', name: '마을 주민', sprite: 'villager_m', x: px(13), y: px(17), wander: 40 },
    { id: 'villager2', name: '마을 주민', sprite: 'villager_f', x: px(31), y: px(23), wander: 40 },
    { id: 'villager3', name: '꼬마 피핀', sprite: 'angel', x: px(20), y: px(16), wander: 30 },
  );
  return m;
}

// ═══════════════════════════════════════════════════════════════════
export function buildField(): GameMap {
  const W = 96, H = 66;
  const m = new GameMap('field', '솔라리온 평원', W, H);
  m.bgm = 'field';
  const r = rng(77);
  // 길: 서쪽 입구 → 동쪽 요새, 중간에서 북서쪽 묘지로 갈래
  const road = (pts: [number, number][], w = 2) => {
    for (let i = 0; i < pts.length - 1; i++) {
      const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
      const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
      for (let k = 0; k <= n; k++) {
        const x = Math.round(ax + ((bx - ax) * k) / n), y = Math.round(ay + ((by - ay) * k) / n);
        m.fillRect(x - (w >> 1), y - (w >> 1), w + 1, w + 1, T.Dirt);
      }
    }
  };
  road([[0, 33], [14, 33], [26, 30], [40, 32], [55, 34], [70, 33], [86, 33], [90, 33]]);
  road([[26, 30], [24, 20], [20, 12], [20, 8]], 1);
  road([[55, 34], [58, 46], [64, 54]], 1);
  // 강: 북에서 남으로 흐르다 다리(길) 아래로
  for (let y = 0; y < H; y++) {
    const cx = 46 + Math.sin(y * 0.18) * 3;
    for (let x = Math.floor(cx - 1.6); x <= Math.ceil(cx + 1.6); x++) if (m.get(x, y) !== T.Dirt) m.set(x, y, T.Water);
  }
  // 호수 (남서)
  for (let y = 44; y < 60; y++)
    for (let x = 10; x < 30; x++) if (Math.hypot((x - 19) / 8, (y - 52) / 5.5) < 1) m.set(x, y, T.Water);
  // 숲 덩어리 (값 노이즈)
  const noise = (x: number, y: number) =>
    Math.sin(x * 0.21 + 1.3) * Math.cos(y * 0.17 + 0.4) + Math.sin((x + y) * 0.09) * 0.7 + Math.sin(x * 0.05 - y * 0.11) * 0.6;
  for (let y = 2; y < H - 2; y++)
    for (let x = 2; x < W - 2; x++) {
      const g = m.get(x, y);
      if (g !== T.Grass) continue;
      const nearRoad = [-2, -1, 0, 1, 2].some((d) => m.get(x + d, y) === T.Dirt || m.get(x, y + d) === T.Dirt);
      if (nearRoad) continue;
      const n = noise(x, y);
      if (n > 1.05 && r() < 0.6) tree(m, x, y, x > 60 ? 2 : r() < 0.5 ? 0 : 1);
      else if (n > 0.8) m.set(x, y, T.DGrass);
      else if (r() < 0.012) obj(m, r() < 0.5 ? 'o_rock_0' : 'o_bush_0', x, y, 1, 1);
      else if (r() < 0.01) m.set(x, y, T.Flower);
    }
  border(m, r, 2, [0, 1, 2]);
  // 입구 근처는 비워 둔다
  for (let y = 30; y <= 36; y++) for (let x = 0; x < 4; x++) { m.solid[m.idx(x, y)] = 0; m.set(x, y, T.Dirt); }
  m.objects = m.objects.filter((o) => !(o.x < 4 * TS && o.y > 30 * TS && o.y < 37 * TS));
  for (let y = 29; y <= 37; y++) for (let x = W - 5; x < W; x++) m.solid[m.idx(x, y)] = 0;
  // 지하 묘지 입구 (북서) — 묘비들
  m.fillRect(15, 5, 11, 7, T.Dirt);
  for (let y = 5; y < 12; y++) for (let x = 15; x < 26; x++) m.solid[m.idx(x, y)] = 0;
  m.objects = m.objects.filter((o) => !(o.x > 14 * TS && o.x < 27 * TS && o.y > 4 * TS && o.y < 13 * TS));
  // 입구 건물: 뒤쪽 벽과 양옆만 막고, 가운데 계단 칸은 비워 둔다
  obj(m, 'o_crypt', 20, 7, 0, 0);
  for (let x = 18; x <= 22; x++) for (let y = 5; y <= 6; y++) m.solid[m.idx(x, y)] = 1;
  m.solid[m.idx(19, 7)] = 1;
  m.solid[m.idx(21, 7)] = 1;
  for (const [x, y, k] of [[16, 9, 0], [17, 11, 1], [24, 9, 0], [25, 11, 1], [16, 6, 1], [25, 6, 0]] as const) obj(m, k ? 'o_grave_1' : 'o_grave_0', x, y, 1, 1);
  tree(m, 14, 4, 4); tree(m, 27, 5, 4);
  m.exits.push({ x: 20, y: 7, w: 1, h: 1, to: 'crypt', spawn: 'start', label: '잊혀진 지하 묘지' });
  // 도적단 요새 문 (동쪽 끝)
  m.fillRect(84, 26, 10, 14, T.Dirt);
  for (let y = 22; y < 44; y++) for (let x = 84; x < W; x++) m.solid[m.idx(x, y)] = 0;
  m.objects = m.objects.filter((o) => !(o.x > 83 * TS && o.y > 21 * TS && o.y < 45 * TS));
  for (let y = 22; y < 44; y++) if (y < 31 || y > 35) { m.addObj({ sprite: 'o_fence_v', x: px(90), y: foot(y), solid: { w: 1, h: 1 } }); }
  obj(m, 'o_fort', 91, 34, 0, 0);
  for (let y = 30; y <= 35; y++) for (let x = 89; x <= 93; x++) if (x !== 91 || y < 33) m.solid[m.idx(x, y)] = x >= 92 || y < 32 ? 1 : 0;
  m.exits.push({ x: 90, y: 32, w: 3, h: 3, to: 'fort', spawn: 'start', label: '도적단 요새', locked: 'crypt_cleared', lockMsg: '요새 문이 굳게 닫혀 있다. 지하 묘지에서 사라진 순찰대의 단서를 먼저 찾아야 할 것 같다.' });
  obj(m, 'o_tent_red', 80, 28, 2, 1);
  obj(m, 'o_tent', 80, 39, 2, 1);
  campfire(m, 82, 34);
  // 남동쪽 균열 (1장 클리어 후)
  m.fillRect(60, 52, 9, 7, T.Ash);
  for (let y = 51; y < 60; y++) for (let x = 59; x < 70; x++) m.solid[m.idx(x, y)] = 0;
  m.objects = m.objects.filter((o) => !(o.x > 58 * TS && o.x < 71 * TS && o.y > 50 * TS && o.y < 61 * TS));
  m.addObj({ sprite: 'o_crystal', x: px(61), y: foot(53), solid: { w: 1, h: 1 } });
  m.addObj({ sprite: 'o_crystal', x: px(67), y: foot(57), solid: { w: 1, h: 1 }, flip: true });
  m.addObj({ sprite: 'portal', x: px(64), y: foot(55), tag: 'portal', light: 60 });
  m.exits.push({ x: 63, y: 54, w: 3, h: 2, to: 'rift', spawn: 'start', label: '균열의 틈', locked: 'ch1_clear', lockMsg: '붉은 균열이 일렁이지만 아직은 들어갈 수 없다. (1장 클리어 후 개방)' });
  obj(m, 'o_sign', 6, 31, 0, 0, { tag: 'sign_field' });
  m.points.west = [px(2), px(33)];
  m.points.crypt = [px(20), px(10)];
  m.points.fort = [px(87), px(33)];
  m.points.rift = [px(64), px(57)];
  m.exits.push({ x: 0, y: 30, w: 1, h: 7, to: 'village', spawn: 'east', label: '하스벨 마을' });
  // 몬스터 배치 (지역별)
  const zone = (id: string, cx: number, cy: number, n: number, spread = 5) => {
    for (let i = 0; i < n; i++) {
      for (let k = 0; k < 20; k++) {
        const x = cx + (r() * 2 - 1) * spread, y = cy + (r() * 2 - 1) * spread;
        if (!m.blocked(Math.floor(x), Math.floor(y))) {
          m.spawns.push({ id, x: x * TS + 8, y: y * TS + 8, respawn: 40 });
          break;
        }
      }
    }
  };
  zone('wolf', 16, 24, 3); zone('wolf', 12, 40, 3); zone('wolf', 30, 38, 2);
  zone('boar', 32, 22, 2); zone('boar', 36, 42, 3); zone('boar', 8, 26, 1);
  zone('spider', 22, 16, 3, 4); zone('spider', 33, 12, 3);
  zone('goblin', 54, 22, 3); zone('goblin', 60, 42, 3); zone('wolf', 52, 50, 2);
  zone('bandit', 70, 28, 2); zone('bandit_archer', 72, 38, 2); zone('bandit', 76, 33, 2, 3); zone('bandit_archer', 66, 20, 2);
  m.spawns.push({ id: 'masked_orc', x: px(78), y: px(36), respawn: 90 });
  m.chests.push({ x: 35, y: 8, id: 'field1', tier: 3 }, { x: 70, y: 58, id: 'field2', tier: 5 }, { x: 8, y: 46, id: 'field3', tier: 2 });
  for (const c of m.chests) { m.solid[m.idx(c.x, c.y)] = 0; }
  return m;
}

// ═══════════════════════════════════════════════════════════════════
interface Room { x: number; y: number; w: number; h: number; }
export function buildCrypt(): GameMap {
  const W = 64, H = 52;
  const m = new GameMap('crypt', '잊혀진 지하 묘지', W, H, T.Wall);
  m.dark = true;
  m.ambient = 'rgba(8,4,12,0.86)';
  m.bgm = 'dungeon';
  m.wallStyle = 'dungeon';
  const r = rng(4242);
  const rooms: Room[] = [];
  const fixed: Room[] = [
    { x: 4, y: 4, w: 8, h: 6 }, // 시작
    { x: 44, y: 36, w: 16, h: 12 }, // 보스
  ];
  rooms.push(fixed[0]);
  let tries = 0;
  while (rooms.length < 9 && tries++ < 400) {
    const w = 6 + ((r() * 7) | 0), h = 5 + ((r() * 5) | 0);
    const x = 2 + ((r() * (W - w - 4)) | 0), y = 2 + ((r() * (H - h - 4)) | 0);
    const rm = { x, y, w, h };
    const ov = [...rooms, fixed[1]].some((o) => x < o.x + o.w + 3 && x + w + 3 > o.x && y < o.y + o.h + 3 && y + h + 3 > o.y);
    if (!ov) rooms.push(rm);
  }
  rooms.push(fixed[1]);
  for (const rm of rooms) m.fillRect(rm.x, rm.y, rm.w, rm.h, T.Floor);
  // 방 잇기: 시작 방에서 가까운 순서로 (최소 신장 트리 비슷하게)
  const cen = (rm: Room) => [Math.floor(rm.x + rm.w / 2), Math.floor(rm.y + rm.h / 2)];
  const order = [rooms[0]];
  const rest = rooms.slice(1, -1).sort((a, b) => cen(a)[0] + cen(a)[1] - (cen(b)[0] + cen(b)[1]));
  order.push(...rest, rooms[rooms.length - 1]);
  const corridor = (a: Room, b: Room) => {
    const [ax, ay] = cen(a), [bx, by] = cen(b);
    const hFirst = r() < 0.5;
    const hline = (y: number, x0: number, x1: number) => { for (let x = Math.min(x0, x1); x <= Math.max(x0, x1); x++) m.fillRect(x, y - 1, 1, 3, T.Floor); };
    const vline = (x: number, y0: number, y1: number) => { for (let y = Math.min(y0, y1); y <= Math.max(y0, y1); y++) m.fillRect(x - 1, y, 3, 1, T.Floor); };
    if (hFirst) { hline(ay, ax, bx); vline(bx, ay, by); } else { vline(ax, ay, by); hline(by, ax, bx); }
  };
  for (let i = 0; i < order.length - 1; i++) corridor(order[i], order[i + 1]);
  corridor(order[1], order[Math.min(4, order.length - 2)]);
  // 바닥 바로 위 벽 한 줄은 '정면 벽' 이 되도록, 1칸짜리 벽 기둥은 바닥으로
  for (let y = 1; y < H - 1; y++)
    for (let x = 1; x < W - 1; x++)
      if (m.get(x, y) === T.Wall && m.get(x, y - 1) === T.Floor && m.get(x, y + 1) === T.Floor) m.set(x, y, T.Floor);
  // 시작: 사다리(올라가는 출구)
  const s = order[0];
  m.points.start = [px(s.x + 2), px(s.y + 3)];
  m.addObj({ sprite: 'floor_ladder', x: px(s.x + 1), y: foot(s.y + 1), layer: 'ground' });
  m.exits.push({ x: s.x + 1, y: s.y + 1, w: 1, h: 1, to: 'field', spawn: 'crypt', label: '평원으로 올라가기' });
  // 횃불 & 장식
  for (const rm of order) {
    torch(m, rm.x + 1, rm.y - 1, r() < 0.5);
    if (rm.w > 7) torch(m, rm.x + rm.w - 2, rm.y - 1, r() < 0.5);
    if (r() < 0.6) m.addObj({ sprite: 'column', x: px(rm.x + 1), y: foot(rm.y + rm.h - 2), solid: { w: 1, h: 1 } });
    if (r() < 0.4) m.addObj({ sprite: 'skull', x: px(rm.x + rm.w - 2), y: foot(rm.y + 1) - 4, layer: 'ground' });
    if (r() < 0.4) m.addObj({ sprite: 'crate', x: px(rm.x + rm.w - 2), y: foot(rm.y + rm.h - 2), solid: { w: 1, h: 1 } });
  }
  // 몬스터
  const mid = order.slice(1, -1);
  mid.forEach((rm, i) => {
    const pool = i < 2 ? ['skelet', 'tiny_zombie'] : ['skelet', 'zombie', 'tiny_zombie', 'skelet'];
    const n = 2 + ((r() * 3) | 0);
    for (let k = 0; k < n; k++) m.spawns.push({ id: pool[(r() * pool.length) | 0], x: px(rm.x + 1 + ((r() * (rm.w - 2)) | 0)), y: px(rm.y + 1 + ((r() * (rm.h - 2)) | 0)) });
    if (i === Math.floor(mid.length / 2)) m.spawns.push({ id: 'necromancer', x: px(rm.x + (rm.w >> 1)), y: px(rm.y + (rm.h >> 1)) });
    if (i % 2 === 1) m.chests.push({ x: rm.x + rm.w - 2, y: rm.y + 1, id: 'crypt' + i, tier: 5 });
  });
  const b = order[order.length - 1];
  m.points.boss = [px(b.x + b.w / 2), px(b.y + b.h / 2)];
  m.spawns.push({ id: 'big_zombie', x: px(b.x + b.w / 2), y: px(b.y + 3), tag: 'boss' });
  for (let k = 0; k < 4; k++) m.addObj({ sprite: k % 2 ? 'o_grave_1' : 'o_grave_0', x: px(b.x + 2 + k * 4), y: foot(b.y + b.h - 2), solid: { w: 1, h: 1 } });
  m.chests.push({ x: b.x + b.w - 3, y: b.y + 1, id: 'crypt_boss', tier: 7 });
  return m;
}

// ═══════════════════════════════════════════════════════════════════
export function buildFort(): GameMap {
  const W = 52, H = 40;
  const m = new GameMap('fort', '도적단 요새', W, H, T.Wall);
  m.bgm = 'fort';
  const r = rng(909);
  // 마당 (흙) + 안쪽 왕좌 공간
  m.fillRect(2, 8, 30, 26, T.Dirt);
  m.fillRect(32, 18, 4, 5, T.Dirt); // 문 통로
  m.fillRect(36, 6, 14, 30, T.Cobble);
  for (let y = 8; y < 34; y++) for (let x = 2; x < 32; x++) if (r() < 0.06) m.set(x, y, T.Grass);
  m.points.start = [px(4), px(21)];
  m.exits.push({ x: 1, y: 19, w: 1, h: 4, to: 'field', spawn: 'fort', label: '평원으로 나가기' });
  m.fillRect(0, 19, 2, 4, T.Dirt);
  obj(m, 'o_tent_red', 8, 11, 2, 1);
  obj(m, 'o_tent', 15, 11, 2, 1);
  obj(m, 'o_tent', 8, 31, 2, 1);
  obj(m, 'o_tent_red', 22, 31, 2, 1);
  campfire(m, 13, 20);
  campfire(m, 24, 15);
  for (const [x, y] of [[27, 10], [28, 10], [27, 11], [5, 26], [29, 28], [30, 28]]) obj(m, r() < 0.5 ? 'o_barrel' : 'crate', x, y, 1, 1);
  for (const x of [37, 48]) for (const y of [8, 14, 20, 26, 32]) m.addObj({ sprite: 'column', x: px(x), y: foot(y), solid: { w: 1, h: 1 } });
  for (const x of [38, 42, 46]) m.addObj({ sprite: 'wall_banner_red', x: px(x), y: foot(5), layer: 'ground' });
  m.addObj({ sprite: 'o_tent_red', x: px(43), y: foot(8), solid: { w: 2, h: 1 } });
  m.points.boss = [px(43), px(16)];
  m.points.arena = [px(38), px(20)];
  const add = (id: string, x: number, y: number) => m.spawns.push({ id, x: px(x), y: px(y) });
  add('bandit', 10, 15); add('bandit', 12, 24); add('bandit_archer', 18, 10); add('bandit_archer', 20, 28);
  add('bandit', 22, 20); add('goblin', 6, 14); add('goblin', 16, 30); add('masked_orc', 27, 20);
  add('bandit_archer', 28, 13); add('bandit', 26, 26);
  m.spawns.push({ id: 'bandit_king', x: px(43), y: px(14), tag: 'boss' });
  m.chests.push({ x: 29, y: 32, id: 'fort1', tier: 7 });
  return m;
}

// ═══════════════════════════════════════════════════════════════════
export function buildRift(): GameMap {
  const W = 60, H = 48;
  const m = new GameMap('rift', '균열의 틈', W, H, T.Ash);
  m.bgm = 'boss';
  m.dark = true;
  m.ambient = 'rgba(40,6,10,0.32)';
  const r = rng(666);
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      const n = Math.sin(x * 0.25) * Math.cos(y * 0.3) + Math.sin((x - y) * 0.13);
      if (n > 1.15) m.set(x, y, T.Lava);
    }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) m.set(x, y, T.Lava);
  m.fillRect(3, 20, 8, 6, T.Ash);
  m.fillRect(40, 16, 16, 16, T.Ash);
  for (let i = 0; i < 40; i++) {
    const x = 3 + ((r() * (W - 6)) | 0), y = 3 + ((r() * (H - 6)) | 0);
    if (m.get(x, y) === T.Ash && !(x < 12 && y > 18 && y < 27) && !(x > 39 && y > 15 && y < 33))
      obj(m, r() < 0.5 ? 'o_crystal' : r() < 0.6 ? 'o_tree_dead' : 'o_rock_1', x, y, 1, 1);
  }
  m.points.start = [px(6), px(23)];
  m.points.boss = [px(48), px(24)];
  m.addObj({ sprite: 'portal', x: px(4), y: foot(22), tag: 'portal', light: 60 });
  m.exits.push({ x: 3, y: 21, w: 2, h: 2, to: 'field', spawn: 'rift', label: '평원으로 돌아가기' });
  const pool = ['imp', 'chort', 'fire_spirit', 'imp'];
  for (let i = 0; i < 16; i++) {
    for (let k = 0; k < 30; k++) {
      const x = 12 + ((r() * 30) | 0), y = 3 + ((r() * (H - 6)) | 0);
      if (!m.blocked(x, y)) { m.spawns.push({ id: pool[i % pool.length], x: px(x), y: px(y), respawn: 60 }); break; }
    }
  }
  m.spawns.push({ id: 'big_demon', x: px(50), y: px(24), tag: 'boss' });
  return m;
}

export const MAP_BUILDERS: Record<string, () => GameMap> = {
  village: buildVillage, field: buildField, crypt: buildCrypt, fort: buildFort, rift: buildRift,
};
