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
      if (!edge || m.get(x, y) === T.Dirt || m.get(x, y) === T.Water || m.get(x, y) === T.Lava) continue;
      if ((x + y) % 2 === 0 || r() < 0.5) tree(m, x, y, kinds[(r() * kinds.length) | 0]);
      else m.solid[m.idx(x, y)] = 1;
    }
}


/** 기억의 틈 (1장 이후 보인다) */
function memory(m: GameMap, id: string, tx: number, ty: number) {
  for (let y = ty - 1; y <= ty + 1; y++) for (let x = tx - 1; x <= tx + 1; x++) if (m.inb(x, y)) m.solid[m.idx(x, y)] = 0;
  m.objects = m.objects.filter((o) => !(Math.abs(o.x / TS - tx - 0.5) < 1.6 && Math.abs(o.y / TS - ty - 1) < 1.6));
  m.addObj({ sprite: 'portal', x: px(tx), y: foot(ty), tag: 'memory:' + id, req: 'ch1_clear', light: 50 });
}
/** 프롤로그: 성소 주변의 잿빛 짐승 세 마리 */
function homeBeasts(m: GameMap, cx: number, cy: number) {
  for (const [dx, dy] of [[-4, 3], [4, 3], [0, 6]]) m.spawns.push({ id: 'ash_beast', x: px(cx + dx), y: px(cy + dy), req: 'pro_beasts', hide: 'pro_s0' });
}
/** 동굴 파기: 벽으로 채운 맵에 통로와 방을 판다 */
function carvePath(m: GameMap, pts: [number, number][], w = 3, t: T = T.Floor) {
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
    for (let k = 0; k <= n; k++) m.fillRect(Math.round(ax + ((bx - ax) * k) / n) - (w >> 1), Math.round(ay + ((by - ay) * k) / n) - (w >> 1), w, w, t);
  }
}
function carveRoom(m: GameMap, cx: number, cy: number, rx: number, ry: number, t: T = T.Floor) {
  for (let y = cy - ry; y <= cy + ry; y++) for (let x = cx - rx; x <= cx + rx; x++) if (Math.hypot((x - cx) / rx, (y - cy) / ry) < 1) m.set(x, y, t);
}
/** 시작 지점에서 걸어갈 수 있는 곳에만 적을 놓는다 */
function reachableZone(m: GameMap, r: () => number, from: [number, number], respawn = 50) {
  return (id: string, cx: number, cy: number, n: number, spread = 4) => {
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 25; k++) {
        const x = cx + (r() * 2 - 1) * spread, y = cy + (r() * 2 - 1) * spread;
        if (m.blocked(Math.floor(x), Math.floor(y))) continue;
        const path = m.findPath(px(from[0]), px(from[1]), x * TS + 8, y * TS + 8, 30000);
        const last = path?.[path.length - 1];
        if (!last || Math.hypot(last[0] - (x * TS + 8), last[1] - (y * TS + 8)) > 20) continue;
        m.spawns.push({ id, x: x * TS + 8, y: y * TS + 8, respawn });
        break;
      }
  };
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
    { id: 'elder', name: '촌장 에드릭', sprite: 'wizzard_m', x: px(25), y: px(15) },
    { id: 'captain', name: '경비대장 레아', sprite: 'knight_f', x: px(40), y: px(16) },
    { id: 'smith', name: '대장장이 하겐', sprite: 'dwarf_m', x: px(28), y: px(13) },
    { id: 'merchant', name: '행상인 시스', sprite: 'lizard_f', x: px(27), y: px(21) },
    { id: 'alchemist', name: '연금술사 리엘', sprite: 'elf_f', x: px(17), y: px(23) },
    { id: 'priest', name: '신관 마렌', sprite: 'wizzard_f', x: px(22), y: px(6) },
    { id: 'stranger', name: '두건 쓴 방랑자', sprite: 'doc', x: px(6), y: px(21) },
    { id: 'villager1', name: '마을 주민', sprite: 'villager_m', x: px(13), y: px(17), wander: 40 },
    { id: 'villager2', name: '마을 주민', sprite: 'villager_f', x: px(31), y: px(23), wander: 40 },
    { id: 'villager3', name: '꼬마 피핀', sprite: 'angel', x: px(20), y: px(16), wander: 30 },
    { id: 'mordain', name: '섭정 재상 모르데인', sprite: 'mordain', x: px(21), y: px(17), req: 'vargon_dead', hide: ['ch4_clear'] },
    { id: 'garto', name: '가르토', sprite: 'bandit_king', x: px(16), y: px(20), req: 'garto_hasvel', hide: ['garto_dead'] },
  );
  homeBeasts(m, 23, 19);
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
  // 고향 마을로 가는 길: 북쪽 실바넬(엘프)·아이언후드(드워프), 남쪽 붉은 평원(오크)·그림자 은신처(마족)
  road([[40, 0], [39, 12], [33, 22], [26, 30]], 1);
  road([[74, 0], [73, 14], [70, 33]], 1);
  road([[32, 65], [33, 52], [40, 32]], 1);
  road([[86, 65], [80, 50], [72, 34]], 1);
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
  // 고향 마을 길목 정리
  for (const [cx, cy] of [[40, 1], [74, 1], [32, 64], [86, 64]]) {
    for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 2; x <= cx + 2; x++) {
      if (!m.inb(x, y)) continue;
      m.solid[m.idx(x, y)] = 0;
      if (Math.abs(x - cx) <= 1) m.set(x, y, T.Dirt);
    }
    m.objects = m.objects.filter((o) => !(Math.abs(o.x / TS - cx - 0.5) < 3.5 && Math.abs(o.y / TS - cy - 0.5) < 4.5));
  }
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
  m.exits.push({ x: 63, y: 54, w: 3, h: 2, to: 'rift', spawn: 'start', label: '균열의 틈', locked: 'rift_open', lockMsg: '붉은 균열이 일렁인다. 아직은 닫혀 있다.' });
  memory(m, 'mem_fest', 14, 37);
  obj(m, 'o_sign', 6, 31, 0, 0, { tag: 'sign_field' });
  m.points.west = [px(2), px(33)];
  m.points.elf = [px(40), px(3)];
  m.points.dwarf = [px(74), px(3)];
  m.points.orc = [px(32), px(62)];
  m.points.demon = [px(86), px(62)];
  m.exits.push(
    { x: 39, y: 0, w: 3, h: 1, to: 'elfhome', spawn: 'gate', label: '실바넬 숲 마을' },
    { x: 73, y: 0, w: 3, h: 1, to: 'dwarfhome', spawn: 'gate', label: '아이언후드 광산 마을' },
    { x: 31, y: 65, w: 3, h: 1, to: 'orchome', spawn: 'gate', label: '붉은 평원 야영지' },
    { x: 85, y: 65, w: 3, h: 1, to: 'demonhome', spawn: 'gate', label: '그림자 은신처' },
  );
  for (const [x, y] of [[38, 4], [72, 4], [30, 61], [88, 61]]) obj(m, 'o_sign', x, y, 0, 0, { tag: 'sign_home' });
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
  // 6장: 재의 사도 신도들이 평원을 떠돈다
  const before = m.spawns.length;
  zone('ash_acolyte', 40, 30, 3); zone('ash_acolyte', 56, 34, 2); zone('ash_acolyte', 24, 30, 2);
  for (const s of m.spawns.slice(before)) s.req = 'ch6_open';
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
  { const rm = mid[Math.min(1, mid.length - 1)]; memory(m, 'mem_night', rm.x + (rm.w >> 1), rm.y + (rm.h >> 1)); }
  // 6장: 보스 방 아래로 내려가는 예배당 계단
  m.fillRect(51, 47, 3, 4, T.Floor);
  m.addObj({ sprite: 'portal', x: px(52), y: foot(50), tag: 'portal', req: 'chapel_open', light: 60 });
  m.points.chapel = [px(52), px(45)];
  m.exits.push({ x: 51, y: 50, w: 3, h: 1, to: 'chapel', spawn: 'south', label: '잿빛 예배당', locked: 'chapel_open', lockMsg: '무덤 아래에서 재 냄새가 올라온다. 아직은 내려갈 이유가 없다.' });
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
  m.npcs.push({ id: 'garto', name: '가르토', sprite: 'bandit_king', x: px(43), y: px(14), req: 'king_dead', hide: ['garto_hasvel'] });
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
  // 북쪽: 균열의 땅 (5장)
  m.fillRect(28, 0, 4, 18, T.Ash);
  m.objects = m.objects.filter((o) => !(o.x > 27 * TS && o.x < 33 * TS && o.y < 19 * TS));
  for (let y = 0; y < 18; y++) for (let x = 28; x < 32; x++) m.solid[m.idx(x, y)] = 0;
  m.points.north = [px(30), px(4)];
  m.exits.push({ x: 28, y: 0, w: 4, h: 1, to: 'riftland', spawn: 'south', label: '균열의 땅', locked: 'ch4_clear', lockMsg: '균열 너머로 붉은 하늘이 보인다. 아직 갈 때가 아니다.' });
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// 종족별 고향 마을 (시작 지점)
function homeCommon(m: GameMap, exit: { x: number; y: number; w: number; h: number }, gate: [number, number], start: [number, number], label = '솔라리온 평원', spawn = 'west') {
  m.safe = true;
  m.points.start = [px(start[0]), px(start[1])];
  m.points.statue = [px(start[0]), px(start[1])];
  m.points.gate = [px(gate[0]), px(gate[1])];
  m.exits.push({ ...exit, to: 'field', spawn, label });
}

export function buildElfHome(): GameMap {
  const m = new GameMap('elfhome', '실바넬 숲 마을', 40, 32, T.DGrass);
  m.bgm = 'village';
  const r = rng(301);
  // 숲길 + 공터
  for (let y = 0; y < 32; y++) for (let x = 0; x < 40; x++) if (Math.hypot((x - 20) / 11, (y - 15) / 8) < 1) m.set(x, y, r() < 0.15 ? T.Flower : T.Grass);
  m.fillRect(19, 22, 3, 10, T.Dirt);
  m.fillRect(12, 14, 16, 2, T.Dirt);
  // 개울
  for (let y = 0; y < 32; y++) { const cx = 6 + Math.sin(y * 0.35) * 1.5; for (let x = Math.floor(cx - 1); x <= Math.ceil(cx + 1); x++) m.set(x, y, T.Water); }
  m.fillRect(5, 14, 4, 2, T.Dirt);
  m.fillRect(9, 14, 3, 2, T.Dirt);
  border(m, r, 2, [3, 0, 2]);
  for (let i = 0; i < 70; i++) {
    const x = 2 + ((r() * 36) | 0), y = 2 + ((r() * 28) | 0);
    if (m.get(x, y) === T.DGrass && !m.solid[m.idx(x, y)] && Math.hypot((x - 20) / 13, (y - 15) / 10) > 1) tree(m, x, y, r() < 0.5 ? 3 : r() < 0.5 ? 0 : 2);
  }
  obj(m, 'o_house_green', 13, 11, 4, 2);
  obj(m, 'o_house_green', 27, 11, 4, 2);
  obj(m, 'o_house_green', 29, 21, 4, 2);
  obj(m, 'o_statue', 20, 13, 1, 1, { tag: 'save' });
  obj(m, 'o_stall_blue', 13, 20, 2, 1);
  obj(m, 'o_well', 25, 18, 2, 1);
  for (const [x, y] of [[16, 18], [24, 21], [11, 17]]) obj(m, 'o_bush_1', x, y, 1, 1);
  homeCommon(m, { x: 19, y: 31, w: 3, h: 1 }, [20, 28], [20, 16], '솔라리온 평원', 'elf');
  // 북쪽 숲길 → 실바넬의 썩은 숲 (2장)
  m.fillRect(19, 0, 3, 8, T.Dirt);
  for (let y = 0; y < 9; y++) for (let x = 17; x < 24; x++) m.solid[m.idx(x, y)] = 0;
  m.objects = m.objects.filter((o) => !(o.x > 17 * TS && o.x < 24 * TS && o.y < 10 * TS));
  m.points.north = [px(20), px(3)];
  m.exits.push({ x: 19, y: 0, w: 3, h: 1, to: 'forest', spawn: 'south', label: '실바넬의 썩은 숲', locked: 'ch1_clear', lockMsg: '숲지기: "북쪽 숲은 썩어 들어가 위험해요. 도적왕 일이 끝나면 장로님께서 부르실 거예요." (1장 클리어 후 개방)' });
  m.npcs.push(
    { id: 'elf_leader', name: '여왕 엘라리엔', sprite: 'elf_queen', x: px(22), y: px(13) },
    { id: 'orwen', name: '현자 오르웬', sprite: 'orwen', x: px(24), y: px(9), req: 'orwen_shown' },
    { id: 'elf_merchant', name: '약초상 미렐', sprite: 'elf_f', x: px(15), y: px(21) },
    { id: 'elf_guard', name: '숲지기 아엘린', sprite: 'elf_f', x: px(22), y: px(27) },
    { id: 'elf_villager', name: '엘프 주민', sprite: 'elf_m', x: px(25), y: px(16), wander: 40 },
  );
  homeBeasts(m, 20, 16);
  return m;
}

export function buildDwarfHome(): GameMap {
  const m = new GameMap('dwarfhome', '아이언후드 광산 마을', 40, 30, T.Wall);
  m.bgm = 'village';
  m.dark = true;
  m.ambient = 'rgba(12,8,6,0.6)';
  m.wallStyle = 'dungeon';
  const r = rng(302);
  m.fillRect(3, 4, 34, 22, T.Floor);
  m.fillRect(19, 26, 3, 4, T.Floor);
  m.fillRect(6, 13, 28, 3, T.Cobble);
  m.fillRect(18, 6, 4, 20, T.Cobble);
  // 돌기둥 덩어리
  for (const [x, y, w, h] of [[3, 4, 3, 3], [34, 4, 3, 2], [3, 22, 2, 4], [35, 21, 2, 5]]) m.fillRect(x, y, w, h, T.Wall);
  obj(m, 'o_smithy', 10, 10, 4, 2);
  obj(m, 'o_smithy', 29, 10, 4, 2);
  obj(m, 'o_smithy', 10, 22, 4, 2);
  obj(m, 'o_statue', 20, 17, 1, 1, { tag: 'save' });
  for (const [x, y] of [[15, 6], [16, 6], [26, 22], [27, 22], [33, 17], [7, 18]]) obj(m, r() < 0.5 ? 'o_barrel' : 'crate', x, y, 1, 1);
  for (const x of [8, 14, 26, 32]) m.addObj({ sprite: 'column', x: px(x), y: foot(19), solid: { w: 1, h: 1 } });
  for (const x of [6, 12, 18, 23, 29, 34]) torch(m, x, 3, x % 2 === 0);
  campfire(m, 26, 17);
  homeCommon(m, { x: 19, y: 29, w: 3, h: 1 }, [20, 26], [20, 19], '솔라리온 평원', 'dwarf');
  m.fillRect(19, 0, 3, 5, T.Floor);
  m.points.north = [px(20), px(5)];
  m.exits.push({ x: 19, y: 0, w: 3, h: 1, to: 'forge', spawn: 'south', label: '태초의 용광로', locked: 'forge_open', lockMsg: '육중한 용광로 문이 잠겨 있다. 옛 대장장이 가문의 열쇠가 필요하다.' });
  homeBeasts(m, 20, 21);
  m.npcs.push(
    { id: 'dwarf_leader', name: '길드장 브론 딥해머', sprite: 'dwarf_guild', x: px(22), y: px(16) },
    { id: 'dwarf_smith', name: '대장장이 헬가', sprite: 'dwarf_f', x: px(29), y: px(12) },
    { id: 'dwarf_miner', name: '광부 토르비', sprite: 'dwarf_m', x: px(12), y: px(18), wander: 40 },
  );
  return m;
}

export function buildOrcHome(): GameMap {
  const m = new GameMap('orchome', '붉은 평원 야영지', 42, 32, T.Dirt);
  m.bgm = 'fort';
  const r = rng(303);
  for (let i = 0; i < 160; i++) { const x = (r() * 42) | 0, y = (r() * 32) | 0; if (r() < 0.5) m.set(x, y, T.Grass); }
  for (let y = 0; y < 32; y++) for (let x = 0; x < 42; x++) if (x < 2 || y < 2 || x >= 40 || y >= 30) m.set(x, y, T.Grass);
  border(m, r, 2, [4, 4, 1]);
  m.fillRect(19, 0, 3, 4, T.Dirt);
  for (let y = 0; y < 3; y++) for (let x = 19; x < 22; x++) m.solid[m.idx(x, y)] = 0;
  m.objects = m.objects.filter((o) => !(o.x > 18 * TS && o.x < 23 * TS && o.y < 4 * TS));
  // 투기장 (울타리 고리)
  for (let x = 25; x <= 36; x++) for (const y of [17, 27]) if (x !== 30 && x !== 31) obj(m, 'o_fence_h', x, y, 1, 1);
  for (let y = 18; y <= 26; y++) for (const x of [25, 36]) m.addObj({ sprite: 'o_fence_v', x: px(x), y: foot(y), solid: { w: 1, h: 1 } });
  obj(m, 'o_tent_red', 8, 8, 2, 1);
  obj(m, 'o_tent_red', 14, 7, 2, 1);
  obj(m, 'o_tent', 8, 18, 2, 1);
  obj(m, 'o_tent_red', 32, 8, 2, 1);
  obj(m, 'o_tent', 13, 26, 2, 1);
  campfire(m, 19, 14);
  campfire(m, 30, 22);
  obj(m, 'o_statue', 20, 10, 1, 1, { tag: 'save' });
  for (const [x, y] of [[5, 13], [24, 9], [36, 12], [16, 22]]) m.addObj({ sprite: 'skull', x: px(x), y: foot(y) - 4, layer: 'ground' });
  for (const [x, y] of [[26, 6], [27, 6], [5, 24]]) obj(m, 'o_barrel', x, y, 1, 1);
  homeCommon(m, { x: 19, y: 0, w: 3, h: 1 }, [20, 3], [20, 12], '솔라리온 평원', 'orc');
  m.fillRect(19, 28, 3, 4, T.Dirt);
  for (let y = 28; y < 32; y++) for (let x = 18; x < 23; x++) m.solid[m.idx(x, y)] = 0;
  m.objects = m.objects.filter((o) => !(o.x > 17 * TS && o.x < 23 * TS && o.y > 28 * TS));
  m.points.south = [px(20), px(27)];
  m.exits.push({ x: 19, y: 31, w: 3, h: 1, to: 'redplains', spawn: 'north', label: '붉은 평원 전장', locked: 'ch3_clear', lockMsg: '전쟁 중인 평원이다. 족장 그롬마가 아직 길을 열지 않았다.' });
  homeBeasts(m, 20, 14);
  m.npcs.push(
    { id: 'orc_leader', name: '족장 그롬마', sprite: 'orc_shaman', x: px(22), y: px(10) },
    { id: 'orc_shaman', name: '주술사 모그', sprite: 'orc_m', x: px(16), y: px(15) },
    { id: 'vesper_visit', name: '베스페라', sprite: 'demon_f', x: px(24), y: px(14), req: 'karkush_dead', hide: ['ch4_clear'] },
    { id: 'royal_captain', name: '왕국군 대장', sprite: 'royal_guard', x: px(18), y: px(6), req: 'c4_4_s0', hide: ['ch4_clear'] },
    { id: 'orc_arena', name: '투기장지기 크락', sprite: 'masked_orc', x: px(30), y: px(19) },
    { id: 'orc_villager', name: '오크 전사', sprite: 'orc_f', x: px(12), y: px(20), wander: 40 },
  );
  return m;
}

export function buildDemonHome(): GameMap {
  const m = new GameMap('demonhome', '그림자 은신처', 36, 30, T.Ash);
  m.bgm = 'title';
  m.dark = true;
  m.ambient = 'rgba(30,6,20,0.5)';
  const r = rng(304);
  for (let y = 0; y < 30; y++) for (let x = 0; x < 36; x++) {
    const n = Math.sin(x * 0.4 + 1) * Math.cos(y * 0.45) + Math.sin((x + y) * 0.2);
    if (n > 1.3 && Math.hypot(x - 18, y - 14) > 7) m.set(x, y, T.Lava);
  }
  for (let y = 0; y < 30; y++) for (let x = 0; x < 36; x++) if (x < 2 || y < 2 || x >= 34 || y >= 28) m.set(x, y, T.Lava);
  m.fillRect(16, 0, 3, 6, T.Ash);
  m.fillRect(14, 5, 8, 18, T.Ash);
  m.fillRect(6, 11, 24, 6, T.Ash);
  for (let i = 0; i < 26; i++) {
    const x = 3 + ((r() * 30) | 0), y = 3 + ((r() * 24) | 0);
    if (m.get(x, y) === T.Ash && Math.hypot(x - 18, y - 14) > 5 && Math.abs(x - 17) > 2) obj(m, r() < 0.6 ? 'o_crystal' : 'o_tree_dead', x, y, 1, 1);
  }
  m.addObj({ sprite: 'portal', x: px(26), y: foot(12), tag: 'portal', light: 60 });
  obj(m, 'o_tent_red', 10, 12, 2, 1);
  obj(m, 'o_tent', 25, 18, 2, 1);
  obj(m, 'o_statue', 18, 12, 1, 1, { tag: 'save' });
  campfire(m, 14, 16);
  for (const [x, y] of [[8, 16], [28, 14]]) m.addObj({ sprite: 'o_crystal', x: px(x), y: foot(y), solid: { w: 1, h: 1 }, light: 50 });
  homeCommon(m, { x: 16, y: 0, w: 3, h: 1 }, [17, 3], [18, 14], '솔라리온 평원', 'demon');
  m.npcs.push(
    { id: 'demon_leader', name: '잿불 결사의 베스페라', sprite: 'demon_f', x: px(20), y: px(12) },
    { id: 'sera', name: '세라', sprite: 'sera', x: px(16), y: px(18), wander: 24, hide: ['sera_taken'] },
    { id: 'eira', name: '에이라', sprite: 'eira', x: px(23), y: px(15), req: 'eira_saved' },
    { id: 'imp_merchant', name: '임프 상인 키키', sprite: 'imp', x: px(12), y: px(15) },
    { id: 'demon_exile', name: '망명자 리스', sprite: 'demon_m', x: px(22), y: px(18), wander: 30 },
  );
  homeBeasts(m, 18, 16);
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// 2장: 실바넬의 썩은 숲 → 타락한 고목의 심장(보스)
export function buildForest(): GameMap {
  const W = 70, H = 58;
  const m = new GameMap('forest', '실바넬의 썩은 숲', W, H, T.DGrass);
  m.bgm = 'dungeon';
  m.dark = true;
  m.ambient = 'rgba(18,8,28,0.62)';
  const r = rng(505);
  // 구불구불한 숲길: 남쪽 입구 → 북쪽 심장부
  const pts: [number, number][] = [[35, 57], [34, 48], [24, 42], [18, 32], [26, 24], [42, 22], [52, 14], [44, 6], [35, 2], [35, 0]];
  for (let i = 0; i < pts.length - 1; i++) {
    const [ax, ay] = pts[i], [bx, by] = pts[i + 1];
    const n = Math.max(Math.abs(bx - ax), Math.abs(by - ay)) * 2;
    for (let k = 0; k <= n; k++) m.fillRect(Math.round(ax + ((bx - ax) * k) / n) - 1, Math.round(ay + ((by - ay) * k) / n) - 1, 3, 3, T.Dirt);
  }
  // 공터로 가는 샛길 (동쪽 늪가·북서쪽 공터·동쪽 숲)
  const spur = (a: [number, number], b2: [number, number]) => {
    const n = Math.max(Math.abs(b2[0] - a[0]), Math.abs(b2[1] - a[1])) * 2;
    for (let k = 0; k <= n; k++) m.fillRect(Math.round(a[0] + ((b2[0] - a[0]) * k) / n) - 1, Math.round(a[1] + ((b2[1] - a[1]) * k) / n), 2, 2, T.Dirt);
  };
  spur([34, 48], [46, 46]); spur([46, 46], [58, 40]);
  spur([18, 32], [21, 19]); spur([21, 19], [12, 14]);
  spur([42, 22], [52, 13]);
  // 공터 (전투 구역)
  const clearings: [number, number, number][] = [[34, 47, 6], [20, 33, 7], [44, 22, 7], [52, 12, 5], [12, 14, 6], [58, 40, 6]];
  for (const [cx, cy, rr] of clearings)
    for (let y = cy - rr; y <= cy + rr; y++) for (let x = cx - rr; x <= cx + rr; x++)
      if (m.inb(x, y) && Math.hypot(x - cx, (y - cy) * 1.2) < rr && m.get(x, y) !== T.Dirt) m.set(x, y, r() < 0.12 ? T.Ash : T.Grass);
  // 썩은 웅덩이
  for (const [cx, cy] of [[14, 22], [56, 30], [26, 52]])
    for (let y = cy - 3; y <= cy + 3; y++) for (let x = cx - 4; x <= cx + 4; x++) if (Math.hypot((x - cx) / 4, (y - cy) / 2.6) < 1) m.set(x, y, T.Water);
  // 빽빽한 나무
  for (let y = 0; y < H; y++)
    for (let x = 0; x < W; x++) {
      if (m.get(x, y) !== T.DGrass) continue;
      const near = [-1, 0, 1].some((d) => m.get(x + d, y) === T.Dirt || m.get(x, y + d) === T.Dirt);
      if (near) continue;
      if (x < 2 || y < 1 || x >= W - 2 || y >= H - 1 || r() < 0.33) tree(m, x, y, r() < 0.55 ? 3 : r() < 0.5 ? 4 : 2);
      else if (r() < 0.3) m.solid[m.idx(x, y)] = 1;
    }
  // 빛나는 수정 (숲의 정기)
  for (const [x, y] of [[33, 44], [22, 30], [46, 20], [13, 12], [60, 38]]) m.addObj({ sprite: 'o_crystal', x: px(x), y: foot(y), solid: { w: 1, h: 1 }, light: 60, flip: x % 2 === 0 });
  for (const [x, y] of [[36, 46], [19, 35], [43, 25], [11, 16]]) obj(m, r() < 0.5 ? 'o_stump' : 'o_bush_1', x, y, 1, 1);
  m.points.south = [px(35), px(54)];
  m.points.grove = [px(35), px(4)];
  m.points.start = m.points.south;
  m.exits.push({ x: 34, y: 57, w: 3, h: 1, to: 'elfhome', spawn: 'north', label: '실바넬 숲 마을' });
  m.exits.push({ x: 34, y: 0, w: 3, h: 1, to: 'grove', spawn: 'south', label: '타락한 고목의 심장', locked: 'grove_open', lockMsg: '뒤엉킨 가시덩굴이 길을 막고 있다. 엘프 장로의 정화 의식이 필요하다.' });
  const zone = (id: string, cx: number, cy: number, n: number, spread = 4) => {
    for (let i = 0; i < n; i++)
      for (let k = 0; k < 25; k++) {
        const x = cx + (r() * 2 - 1) * spread, y = cy + (r() * 2 - 1) * spread;
        if (m.blocked(Math.floor(x), Math.floor(y))) continue;
        // 입구에서 실제로 걸어갈 수 있는 자리만
        const path = m.findPath(px(35), px(54), x * TS + 8, y * TS + 8, 20000);
        const last = path?.[path.length - 1];
        if (!last || Math.hypot(last[0] - (x * TS + 8), last[1] - (y * TS + 8)) > 20) continue;
        m.spawns.push({ id, x: x * TS + 8, y: y * TS + 8, respawn: 45 });
        break;
      }
  };
  zone('blight_wolf', 34, 46, 3); zone('swampy', 26, 50, 2);
  zone('pumpkin_dude', 20, 33, 2); zone('muddy', 20, 30, 2); zone('slug', 15, 22, 2);
  zone('forest_spirit', 44, 22, 3); zone('blight_wolf', 46, 25, 2);
  zone('forest_spirit', 12, 14, 3); zone('slug', 58, 40, 2); zone('swampy', 58, 36, 2);
  zone('forest_spirit', 52, 12, 2); zone('pumpkin_dude', 50, 14, 2);
  m.spawns.push({ id: 'dryad', x: px(58), y: px(40), respawn: 120 });
  memory(m, 'mem_priest', 21, 36);
  m.chests.push({ x: 12, y: 10, id: 'forest1', tier: 10 }, { x: 61, y: 42, id: 'forest2', tier: 11 });
  for (const c of m.chests) m.solid[m.idx(c.x, c.y)] = 0;
  return m;
}

export function buildGrove(): GameMap {
  const W = 32, H = 28;
  const m = new GameMap('grove', '타락한 고목의 심장', W, H, T.DGrass);
  m.bgm = 'boss';
  m.dark = true;
  m.ambient = 'rgba(30,8,36,0.55)';
  const r = rng(606);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const d = Math.hypot((x - 16) / 13, (y - 13) / 11);
    if (d < 1) m.set(x, y, r() < 0.18 ? T.Ash : T.Grass);
    else if (r() < 0.6) tree(m, x, y, r() < 0.5 ? 3 : 4);
    else m.solid[m.idx(x, y)] = 1;
  }
  m.fillRect(15, 22, 3, 6, T.Dirt);
  for (let y = 22; y < H; y++) for (let x = 14; x < 19; x++) m.solid[m.idx(x, y)] = 0;
  m.objects = m.objects.filter((o) => !(o.x > 14 * TS && o.x < 19 * TS && o.y > 22 * TS));
  for (const [x, y] of [[8, 8], [24, 8], [7, 17], [25, 17]]) m.addObj({ sprite: 'o_crystal', x: px(x), y: foot(y), solid: { w: 1, h: 1 }, light: 70 });
  m.addObj({ sprite: 'o_tree_dark', x: px(16), y: foot(4), solid: { w: 1, h: 1 } });
  m.points.south = [px(16), px(24)];
  m.points.start = m.points.south;
  m.points.boss = [px(16), px(10)];
  m.exits.push({ x: 15, y: 27, w: 3, h: 1, to: 'forest', spawn: 'grove', label: '썩은 숲으로 돌아가기' });
  m.spawns.push({ id: 'forest_lord', x: px(16), y: px(9), tag: 'boss' });
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// 3장: 태초의 용광로
export function buildForge(): GameMap {
  const W = 56, H = 46;
  const m = new GameMap('forge', '태초의 용광로', W, H, T.Wall);
  m.dark = true;
  m.ambient = 'rgba(30,10,4,0.62)';
  m.bgm = 'dungeon';
  m.wallStyle = 'dungeon';
  const r = rng(707);
  carvePath(m, [[28, 45], [28, 38], [16, 32], [12, 22], [22, 16], [36, 18], [44, 26], [40, 34], [28, 38]], 4);
  carvePath(m, [[22, 16], [28, 10]], 4);
  for (const [x, y, rx, ry] of [[28, 39, 5, 3], [15, 31, 5, 4], [12, 22, 5, 4], [36, 18, 5, 4], [44, 27, 5, 4], [40, 34, 4, 3]] as const) carveRoom(m, x, y, rx, ry);
  carveRoom(m, 28, 8, 10, 6);
  // 용암 웅덩이 (길은 막지 않는다)
  for (const [x, y] of [[20, 27], [34, 27], [8, 18], [48, 20], [28, 5]] as const) for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 2; xx <= x + 2; xx++) if (m.get(xx, yy) === T.Floor && Math.hypot(xx - x, (yy - y) * 1.6) < 2.4) m.set(xx, yy, T.Lava);
  for (const [x, y] of [[24, 37], [32, 37], [12, 28], [8, 22], [38, 15], [46, 25], [20, 4], [36, 4]] as const) torch(m, x, y, true);
  for (const [x, y] of [[18, 30], [41, 33], [14, 20]] as const) obj(m, r() < 0.5 ? 'o_barrel' : 'crate', x, y, 1, 1);
  for (const x of [20, 36]) m.addObj({ sprite: 'column', x: px(x), y: foot(10), solid: { w: 1, h: 1 } });
  m.points.south = [px(28), px(42)];
  m.points.start = m.points.south;
  m.points.boss = [px(28), px(8)];
  m.exits.push({ x: 27, y: 45, w: 3, h: 1, to: 'dwarfhome', spawn: 'north', label: '아이언후드 광산 마을' });
  const zone = reachableZone(m, r, [28, 42]);
  zone('magma_slime', 28, 38, 2); zone('stone_golem', 15, 31, 2); zone('forge_spirit', 12, 22, 2);
  zone('magma_slime', 36, 18, 2); zone('stone_golem', 44, 27, 2); zone('forge_spirit', 40, 34, 2); zone('magma_slime', 22, 16, 1);
  m.spawns.push({ id: 'forge_golem', x: px(28), y: px(8), tag: 'boss' });
  memory(m, 'mem_child', 44, 29);
  m.chests.push({ x: 10, y: 23, id: 'forge1', tier: 15 });
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// 4장: 붉은 평원 전장 → 카르쿠쉬의 전쟁 진영
export function buildRedPlains(): GameMap {
  const W = 76, H = 56;
  const m = new GameMap('redplains', '붉은 평원 전장', W, H, T.Dirt);
  m.bgm = 'fort';
  const r = rng(808);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = Math.sin(x * 0.17) * Math.cos(y * 0.21) + Math.sin((x + y) * 0.07);
    if (n > 0.9) m.set(x, y, T.Grass);
    else if (n < -1.1) m.set(x, y, T.Ash);
  }
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) m.set(x, y, T.Grass);
  border(m, r, 2, [4, 4, 1]);
  carvePath(m, [[38, 0], [38, 10], [30, 22], [38, 34], [56, 30], [75, 28]], 3, T.Dirt);
  for (let y = 0; y < 3; y++) for (let x = 36; x < 41; x++) m.solid[m.idx(x, y)] = 0;
  for (let y = 26; y < 31; y++) for (let x = W - 3; x < W; x++) m.solid[m.idx(x, y)] = 0;
  m.objects = m.objects.filter((o) => !((o.x / TS > 35 && o.x / TS < 41 && o.y / TS < 4) || (o.x / TS > W - 4 && o.y / TS > 25 && o.y / TS < 32)));
  // 투기장 (가운데 남쪽)
  const ax = 22, ay = 40;
  for (let x = ax - 7; x <= ax + 7; x++) for (const y of [ay - 5, ay + 5]) if (x !== ax && x !== ax + 1) obj(m, 'o_fence_h', x, y, 1, 1);
  for (let y = ay - 4; y <= ay + 4; y++) for (const x of [ax - 7, ax + 7]) m.addObj({ sprite: 'o_fence_v', x: px(x), y: foot(y), solid: { w: 1, h: 1 } });
  carvePath(m, [[30, 22], [ax, ay - 6]], 2, T.Dirt);
  for (let i = 0; i < 40; i++) {
    const x = 4 + ((r() * (W - 8)) | 0), y = 4 + ((r() * (H - 8)) | 0);
    if (m.get(x, y) !== T.Dirt && !m.solid[m.idx(x, y)] && Math.hypot(x - ax, y - ay) > 9) obj(m, r() < 0.4 ? 'o_rock_1' : r() < 0.6 ? 'o_tree_dead' : 'o_bush_0', x, y, 1, 1);
  }
  for (const [x, y] of [[50, 14], [58, 40], [12, 18]] as const) { obj(m, 'o_tent_red', x, y, 2, 1); campfire(m, x + 3, y + 1); }
  for (const [x, y] of [[44, 24], [16, 30], [60, 22]] as const) m.addObj({ sprite: 'skull', x: px(x), y: foot(y) - 4, layer: 'ground' });
  m.points.north = [px(38), px(3)];
  m.points.start = m.points.north;
  m.points.east = [px(W - 4), px(28)];
  m.points.arena = [px(ax), px(ay)];
  m.exits.push({ x: 37, y: 0, w: 3, h: 1, to: 'orchome', spawn: 'south', label: '붉은 평원 야영지' });
  m.exits.push({ x: W - 1, y: 26, w: 1, h: 5, to: 'warcamp', spawn: 'west', label: '카르쿠쉬의 전쟁 진영', locked: 'arena_won', lockMsg: '카르쿠쉬의 진영 입구를 전사들이 막고 있다. 투기장에서 부족들의 인정을 받아야 한다.' });
  const zone = reachableZone(m, r, [38, 3]);
  zone('warband', 34, 16, 3); zone('war_shaman', 46, 26, 2); zone('war_boar', 14, 14, 2); zone('warband', 56, 32, 3);
  zone('war_shaman', 62, 16, 2); zone('war_boar', 48, 44, 2); zone('warband', 12, 26, 2);
  m.spawns.push({ id: 'arena_champion', x: px(ax), y: px(ay) });
  memory(m, 'mem_siblings', 64, 46);
  m.chests.push({ x: 6, y: 48, id: 'red1', tier: 18 });
  return m;
}

export function buildWarCamp(): GameMap {
  const W = 34, H = 28;
  const m = new GameMap('warcamp', '카르쿠쉬의 전쟁 진영', W, H, T.Dirt);
  m.bgm = 'boss';
  const r = rng(909);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot((x - 18) / 15, (y - 14) / 11) > 1) m.set(x, y, T.Grass);
  border(m, r, 2, [4, 4]);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (m.get(x, y) === T.Grass && Math.hypot((x - 18) / 15, (y - 14) / 11) > 1.08 && !m.solid[m.idx(x, y)]) m.solid[m.idx(x, y)] = 1;
  carvePath(m, [[0, 14], [6, 14]], 3, T.Dirt);
  for (let y = 12; y < 17; y++) for (let x = 0; x < 7; x++) m.solid[m.idx(x, y)] = 0;
  m.objects = m.objects.filter((o) => !(o.x / TS < 7 && o.y / TS > 11 && o.y / TS < 18));
  for (const [x, y] of [[12, 6], [24, 6], [10, 22], [26, 22]] as const) campfire(m, x, y);
  obj(m, 'o_tent_red', 28, 13, 2, 1);
  m.points.west = [px(3), px(14)];
  m.points.start = m.points.west;
  m.points.boss = [px(20), px(14)];
  m.exits.push({ x: 0, y: 12, w: 1, h: 5, to: 'redplains', spawn: 'east', label: '붉은 평원 전장' });
  m.spawns.push({ id: 'karkush', x: px(22), y: px(14), tag: 'boss' });
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// 5장: 균열의 땅 → 흑요 요새 → 왕좌의 방
export function buildRiftLand(): GameMap {
  const W = 70, H = 62;
  const m = new GameMap('riftland', '균열의 땅', W, H, T.Ash);
  m.bgm = 'boss';
  m.dark = true;
  m.ambient = 'rgba(46,8,12,0.42)';
  const r = rng(1010);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const n = Math.sin(x * 0.21 + 2) * Math.cos(y * 0.19) + Math.sin((x - y) * 0.11);
    if (n > 1.1) m.set(x, y, T.Lava);
    if (x < 2 || y < 2 || x >= W - 2 || y >= H - 2) m.set(x, y, T.Lava);
  }
  carvePath(m, [[35, 61], [35, 50], [24, 40], [30, 28], [44, 22], [35, 12], [35, 0]], 4, T.Ash);
  carvePath(m, [[24, 40], [10, 50], [8, 56]], 3, T.Ash);
  carveRoom(m, 35, 8, 7, 5, T.Ash);
  for (let i = 0; i < 50; i++) {
    const x = 3 + ((r() * (W - 6)) | 0), y = 3 + ((r() * (H - 6)) | 0);
    if (m.get(x, y) === T.Ash && Math.abs(x - 35) > 3 && Math.hypot(x - 35, y - 8) > 8) obj(m, r() < 0.5 ? 'o_crystal' : r() < 0.6 ? 'o_tree_dead' : 'o_rock_1', x, y, 1, 1);
  }
  // 흑요 요새 성문 (북쪽)
  obj(m, 'o_fort', 35, 2, 0, 0);
  m.points.south = [px(35), px(57)];
  m.points.start = m.points.south;
  m.points.north = [px(35), px(6)];
  m.points.gate = [px(35), px(10)];
  m.exits.push({ x: 34, y: 61, w: 3, h: 1, to: 'rift', spawn: 'north', label: '균열의 틈' });
  m.exits.push({ x: 33, y: 0, w: 5, h: 2, to: 'obsidian', spawn: 'south', label: '흑요 요새', locked: 'vargon_resolved', lockMsg: '관문을 바르곤이 지키고 있다.' });
  m.npcs.push({ id: 'vargon', name: '선봉대장 바르곤', sprite: 'big_demon', x: px(35), y: px(9), req: 'rift_march', hide: ['vargon_fight', 'vargon_resolved'] });
  m.spawns.push({ id: 'vargon2', x: px(35), y: px(9), tag: 'boss', req: 'vargon_fight', hide: 'vargon_resolved' });
  const zone = reachableZone(m, r, [35, 57], 60);
  zone('legion_imp', 30, 46, 2); zone('legion_blade', 24, 38, 2); zone('rift_spirit', 30, 28, 2);
  zone('legion_blade', 44, 22, 2); zone('legion_imp', 40, 16, 2); zone('rift_spirit', 12, 50, 2);
  memory(m, 'mem_eira', 8, 56);
  return m;
}

export function buildObsidian(): GameMap {
  const W = 50, H = 42;
  const m = new GameMap('obsidian', '흑요 요새', W, H, T.Wall);
  m.dark = true;
  m.ambient = 'rgba(24,6,14,0.7)';
  m.bgm = 'dungeon';
  m.wallStyle = 'dungeon';
  const r = rng(1111);
  m.fillRect(20, 30, 10, 11, T.Floor); // 입구 홀
  m.fillRect(6, 18, 38, 10, T.Floor); // 벽화 회랑
  m.fillRect(22, 27, 6, 4, T.Floor); // 홀 ↔ 회랑
  m.fillRect(22, 4, 6, 15, T.Floor); // 왕좌로 가는 계단
  m.fillRect(36, 30, 8, 8, T.Floor); // 감옥
  m.fillRect(30, 33, 6, 3, T.Floor);
  m.fillRect(6, 28, 6, 8, T.Floor); // 서쪽 방
  for (const x of [10, 18, 32, 40]) for (const y of [20, 26]) m.addObj({ sprite: 'column', x: px(x), y: foot(y), solid: { w: 1, h: 1 } });
  // 벽화 세 점 (회랑 북쪽 벽)
  const murals: [string, number][] = [['mural1', 10], ['mural2', 25], ['mural3', 40]];
  for (const [id, x] of murals) {
    m.addObj({ sprite: 'wall_banner_red', x: px(x), y: foot(17), layer: 'ground', tag: 'mural:' + id, light: 40 });
  }
  for (const x of [8, 16, 34, 42]) torch(m, x, 17, x > 25);
  torch(m, 22, 29, true); torch(m, 27, 29, true);
  m.addObj({ sprite: 'o_grave_1', x: px(41), y: foot(31), solid: { w: 1, h: 1 } });
  m.points.south = [px(25), px(38)];
  m.points.start = m.points.south;
  m.points.north = [px(25), px(6)];
  m.exits.push({ x: 24, y: 40, w: 3, h: 1, to: 'riftland', spawn: 'north', label: '균열의 땅' });
  m.exits.push({ x: 23, y: 3, w: 4, h: 1, to: 'throne', spawn: 'south', label: '왕좌의 방', locked: 'murals_seen', lockMsg: '계단 위 문에 노르하임 문양이 빛난다. 벽화들을 먼저 살펴봐야 할 것 같다.' });
  m.npcs.push({ id: 'eira', name: '에이라', sprite: 'eira', x: px(40), y: px(34), req: 'eira_known', hide: ['eira_saved'] });
  const zone = reachableZone(m, r, [25, 38], 70);
  zone('royal_guard', 25, 33, 2, 2); zone('legion_blade', 12, 22, 2); zone('royal_guard', 34, 22, 2); zone('legion_imp', 9, 31, 1, 2); zone('royal_guard', 25, 10, 2, 2);
  m.chests.push({ x: 7, y: 34, id: 'obs1', tier: 23 });
  return m;
}

export function buildThrone(): GameMap {
  const W = 32, H = 28;
  const m = new GameMap('throne', '왕좌의 방', W, H, T.Wall);
  m.dark = true;
  m.ambient = 'rgba(40,8,8,0.45)';
  m.bgm = 'boss';
  m.wallStyle = 'dungeon';
  m.fillRect(4, 4, 24, 20, T.Cobble);
  m.fillRect(14, 24, 4, 4, T.Floor);
  for (const x of [7, 24]) for (const y of [8, 14, 20]) m.addObj({ sprite: 'column', x: px(x), y: foot(y), solid: { w: 1, h: 1 } });
  for (const x of [8, 15, 23]) m.addObj({ sprite: 'wall_banner_red', x: px(x), y: foot(3), layer: 'ground' });
  for (const x of [5, 26]) torch(m, x, 3, true);
  m.addObj({ sprite: 'o_statue', x: px(16), y: foot(5), solid: { w: 1, h: 1 } });
  m.points.south = [px(16), px(24)];
  m.points.start = m.points.south;
  m.points.boss = [px(16), px(11)];
  m.exits.push({ x: 14, y: 27, w: 4, h: 1, to: 'obsidian', spawn: 'north', label: '흑요 요새' });
  m.spawns.push({ id: 'ash_king', x: px(16), y: px(11), tag: 'boss' });
  m.spawns.push({ id: 'belkar', x: px(16), y: px(10), tag: 'boss', req: 'mordain_dead' });
  m.npcs.push({ id: 'sera', name: '세라', sprite: 'sera', x: px(18), y: px(9), req: 'belkar_dead' });
  // 7장: 왕좌 뒤 숨겨진 계단 → 불의 요람
  m.fillRect(25, 0, 3, 4, T.Cobble);
  m.addObj({ sprite: 'portal', x: px(26), y: foot(1), tag: 'portal', req: 'cradle_open', light: 60 });
  m.points.north = [px(26), px(5)];
  m.exits.push({ x: 25, y: 0, w: 3, h: 1, to: 'cradle', spawn: 'south', label: '불의 요람', locked: 'cradle_open', lockMsg: '왕좌 뒤 벽에 희미한 불꽃 문양이 있다. 아직 열리지 않는다.' });
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// 6장: 잿빛 예배당 (지하 묘지 아래, 재의 사도 본거지)
export function buildChapel(): GameMap {
  const W = 40, H = 44;
  const m = new GameMap('chapel', '잿빛 예배당', W, H, T.Wall);
  m.dark = true;
  m.ambient = 'rgba(20,18,22,0.78)';
  m.bgm = 'dungeon';
  m.wallStyle = 'dungeon';
  const r = rng(6060);
  m.fillRect(16, 35, 8, 7, T.Floor); // 입구
  m.fillRect(18, 42, 4, 2, T.Floor);
  m.fillRect(19, 28, 2, 8, T.Floor); // 복도
  m.fillRect(8, 12, 24, 16, T.Cobble); // 본당
  m.fillRect(2, 16, 6, 7, T.Floor); // 서쪽 납골실
  m.fillRect(32, 16, 6, 7, T.Floor); // 동쪽 납골실
  m.fillRect(13, 3, 14, 9, T.Cobble); // 제단
  for (const x of [11, 16, 24, 29]) for (const y of [15, 20, 25]) m.addObj({ sprite: 'column', x: px(x), y: foot(y), solid: { w: 1, h: 1 } });
  for (const x of [15, 20, 25]) m.addObj({ sprite: 'wall_banner_red', x: px(x), y: foot(2), layer: 'ground' });
  for (const x of [14, 26]) torch(m, x, 2, true);
  for (const x of [9, 30]) torch(m, x, 11, false);
  m.addObj({ sprite: 'o_statue', x: px(20), y: foot(4), solid: { w: 1, h: 1 } });
  for (const [x, y] of [[3, 17], [6, 22], [33, 17], [36, 22]] as const) m.addObj({ sprite: r() < 0.5 ? 'o_grave_0' : 'o_grave_1', x: px(x), y: foot(y), solid: { w: 1, h: 1 } });
  m.points.south = [px(20), px(39)];
  m.points.start = m.points.south;
  m.points.boss = [px(20), px(8)];
  m.exits.push({ x: 18, y: 43, w: 4, h: 1, to: 'crypt', spawn: 'chapel', label: '잊혀진 지하 묘지' });
  const zone = reachableZone(m, r, [20, 39], 70);
  zone('ash_acolyte', 20, 37, 2, 2); zone('ash_knight', 14, 18, 2); zone('ash_knight', 26, 18, 2);
  zone('ash_acolyte', 20, 24, 2); zone('ash_acolyte', 4, 19, 1, 2); zone('ash_knight', 35, 19, 1, 2);
  m.spawns.push({ id: 'cassian', x: px(20), y: px(7), tag: 'boss' });
  m.chests.push({ x: 3, y: 21, id: 'chapel1', tier: 26 }, { x: 36, y: 21, id: 'chapel2', tier: 26 });
  return m;
}

// 7장: 불의 요람 (왕좌의 방 뒤, 첫 불꽃이 태어난 곳)
export function buildCradle(): GameMap {
  const W = 60, H = 56;
  const m = new GameMap('cradle', '불의 요람', W, H, T.Lava);
  m.bgm = 'boss';
  m.dark = true;
  m.ambient = 'rgba(60,20,6,0.4)';
  const r = rng(7070);
  carvePath(m, [[30, 55], [30, 46], [16, 38], [22, 28], [40, 24], [44, 16], [30, 12]], 4, T.Ash);
  carvePath(m, [[16, 38], [8, 44]], 3, T.Ash);
  carvePath(m, [[40, 24], [52, 30]], 3, T.Ash);
  carveRoom(m, 30, 9, 11, 7, T.Ash);
  carveRoom(m, 8, 45, 4, 3, T.Ash);
  carveRoom(m, 52, 31, 4, 3, T.Ash);
  for (let i = 0; i < 40; i++) {
    const x = 3 + ((r() * (W - 6)) | 0), y = 3 + ((r() * (H - 6)) | 0);
    if (m.get(x, y) === T.Ash && Math.hypot(x - 30, y - 9) > 9 && Math.abs(x - 30) + Math.abs(y - 50) > 5) obj(m, r() < 0.6 ? 'o_crystal' : 'o_rock_1', x, y, 1, 1);
  }
  // 요람의 비석 세 개
  const stones: [string, number, number][] = [['origin1', 8, 44], ['origin2', 52, 30], ['origin3', 22, 28]];
  for (const [id, x, y] of stones) {
    for (let yy = y - 1; yy <= y + 1; yy++) for (let xx = x - 1; xx <= x + 1; xx++) m.solid[m.idx(xx, yy)] = 0;
    m.objects = m.objects.filter((o) => !(Math.abs(o.x / TS - x - 0.5) < 1.6 && Math.abs(o.y / TS - y - 1) < 1.6));
    m.addObj({ sprite: 'o_grave_1', x: px(x), y: foot(y - 1), tag: 'origin:' + id, light: 50 });
  }
  m.points.south = [px(30), px(52)];
  m.points.start = m.points.south;
  m.points.boss = [px(30), px(9)];
  m.exits.push({ x: 28, y: 55, w: 5, h: 1, to: 'throne', spawn: 'north', label: '왕좌의 방' });
  const zone = reachableZone(m, r, [30, 52], 70);
  zone('ember_drake', 30, 46, 2); zone('ember_drake', 18, 36, 2); zone('cinder_golem', 22, 26, 1);
  zone('rift_spirit', 38, 24, 2); zone('ember_drake', 48, 28, 2); zone('cinder_golem', 44, 17, 1); zone('ember_drake', 10, 44, 1);
  m.spawns.push({ id: 'ashar', x: px(30), y: px(8), tag: 'boss', req: 'origin_seen' });
  m.npcs.push({ id: 'ashar_soul', name: '요람의 불꽃', sprite: 'fire_spirit', x: px(30), y: px(9), req: 'ashar_dead' });
  m.chests.push({ x: 53, y: 32, id: 'cradle1', tier: 30 });
  return m;
}

// ═══════════════════════════════════════════════════════════════════
// 튜토리얼: 잿불의 꿈 (밤의 성소 앞 공터)
export function buildTutorial(): GameMap {
  const W = 36, H = 30;
  const m = new GameMap('tutorial', '잿불의 꿈', W, H, T.DGrass);
  m.safe = true;
  m.dark = true;
  m.ambient = 'rgba(14,8,26,0.55)';
  m.bgm = 'title';
  const r = rng(4040);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (Math.hypot((x - 18) / 13, (y - 15) / 10) < 1) m.set(x, y, r() < 0.1 ? T.Flower : T.Grass);
  m.fillRect(17, 0, 3, 8, T.Dirt);
  m.fillRect(16, 19, 5, 8, T.Dirt);
  border(m, r, 2, [3, 2]);
  for (let y = 0; y < 3; y++) for (let x = 16; x < 21; x++) m.solid[m.idx(x, y)] = 0;
  m.objects = m.objects.filter((o) => !(o.x > 15 * TS && o.x < 21 * TS && o.y < 4 * TS));
  for (let i = 0; i < 26; i++) {
    const x = 3 + ((r() * 30) | 0), y = 3 + ((r() * 24) | 0);
    if (m.get(x, y) === T.DGrass && !m.solid[m.idx(x, y)]) tree(m, x, y, r() < 0.5 ? 3 : 2);
  }
  obj(m, 'o_statue', 18, 9, 1, 1);
  campfire(m, 18, 11);
  m.points.start = [px(18), px(24)];
  m.points.mark = [px(25), px(17)];
  m.points.exit = [px(18), px(1)];
  m.npcs.push({ id: 'tutor', name: '성소의 불꽃', sprite: 'fire_spirit', x: px(14), y: px(12) });
  for (const [x, y] of [[9, 15], [11, 19], [8, 18]]) m.spawns.push({ id: 'dummy', x: px(x), y: px(y), respawn: 2 });
  m.addObj({ sprite: 'portal', x: px(18), y: foot(1), tag: 'portal', light: 60, req: 'tut_done' });
  m.exits.push({ x: 17, y: 0, w: 3, h: 1, to: 'HOME', spawn: 'start', label: '꿈에서 깨어나기', locked: 'tut_done', lockMsg: '성소의 불꽃: "아직 꿈에서 깰 때가 아니다. 시험을 마쳐라."' });
  return m;
}

export const MAP_BUILDERS: Record<string, () => GameMap> = {
  village: buildVillage, field: buildField, crypt: buildCrypt, fort: buildFort, rift: buildRift,
  elfhome: buildElfHome, dwarfhome: buildDwarfHome, orchome: buildOrcHome, demonhome: buildDemonHome,
  forest: buildForest, grove: buildGrove,
  tutorial: buildTutorial,
  forge: buildForge, redplains: buildRedPlains, warcamp: buildWarCamp, riftland: buildRiftLand, obsidian: buildObsidian, throne: buildThrone,
  chapel: buildChapel, cradle: buildCradle,
};
