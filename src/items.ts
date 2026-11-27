// 아이템 인스턴스 · 랜덤 옵션 · 강화 · 파생 능력치 계산 (기획서 5.2, 8장)
import { HOME } from './homes';
import {
  AFFIX_NAMES, AffixKey, BASE_BY_ID, BASE_ITEMS, BaseItem, CLASSES, ClassId, CONSUMABLES, EquipSlot, MATERIALS,
  RACES, RARITY, Rarity, StatKey, Stats,
} from './data';

export interface ItemInst {
  uid: number;
  base: string;
  rarity: Rarity;
  ilvl: number;
  plus: number;
  affixes: [AffixKey, number][];
}

export type InvEntry =
  | { t: 'eq'; item: ItemInst }
  | { t: 'use'; id: string; n: number }
  | { t: 'mat'; id: string; n: number };

let uidSeq = Date.now() % 100000;
export function nextUid(): number {
  return ++uidSeq;
}

export function rollRarity(luck = 0): Rarity {
  const r = Math.random() * 100 - luck;
  if (r < 1.2) return 4;
  if (r < 5) return 3;
  if (r < 15) return 2;
  if (r < 40) return 1;
  return 0;
}

const AFFIX_POOL: { k: AffixKey; base: number; per: number }[] = [
  { k: 'str', base: 1, per: 0.35 }, { k: 'dex', base: 1, per: 0.35 }, { k: 'int', base: 1, per: 0.35 },
  { k: 'vit', base: 1, per: 0.35 }, { k: 'wis', base: 1, per: 0.35 }, { k: 'atkPct', base: 3, per: 0.5 },
  { k: 'crit', base: 1, per: 0.25 }, { k: 'hp', base: 10, per: 4 }, { k: 'mp', base: 6, per: 2.5 },
  { k: 'ms', base: 2, per: 0.2 }, { k: 'def', base: 1, per: 0.5 }, { k: 'aspd', base: 3, per: 0.4 },
];

export function makeItem(baseId: string, ilvl: number, rarity: Rarity): ItemInst {
  const affixes: [AffixKey, number][] = [];
  const used = new Set<AffixKey>();
  const n = rarity === 4 ? 4 : rarity;
  for (let i = 0; i < n; i++) {
    let a = AFFIX_POOL[(Math.random() * AFFIX_POOL.length) | 0];
    let guard = 0;
    while (used.has(a.k) && guard++ < 20) a = AFFIX_POOL[(Math.random() * AFFIX_POOL.length) | 0];
    used.add(a.k);
    const v = Math.max(1, Math.round((a.base + a.per * ilvl) * (0.7 + Math.random() * 0.6) * (rarity === 4 ? 1.4 : 1)));
    affixes.push([a.k, v]);
  }
  return { uid: nextUid(), base: baseId, rarity, ilvl, plus: 0, affixes };
}

/** 몬스터 처치/상자 드롭용 랜덤 장비. 내 클래스가 쓸 수 있는 것을 더 자주 준다. */
export function randomDrop(level: number, cls: ClassId, luck = 0): ItemInst {
  const pool = BASE_ITEMS.filter((b) => b.tier <= level + 2 && b.tier >= level - 6);
  const mine = pool.filter((b) => !b.cls || b.cls.includes(cls));
  const pickFrom = Math.random() < 0.8 && mine.length ? mine : pool.length ? pool : BASE_ITEMS;
  const b = pickFrom[(Math.random() * pickFrom.length) | 0];
  return makeItem(b.id, Math.max(1, level + ((Math.random() * 3) | 0) - 1), rollRarity(luck));
}

export function baseOf(it: ItemInst): BaseItem {
  return BASE_BY_ID[it.base];
}

export function plusMul(it: ItemInst): number {
  return 1 + it.plus * 0.08;
}

export function itemName(it: ItemInst): string {
  return (it.plus ? `+${it.plus} ` : '') + baseOf(it).name;
}

export function itemPrice(it: ItemInst): number {
  const b = baseOf(it);
  return Math.round(b.price * (1 + it.rarity * 0.6) * (1 + it.ilvl * 0.05) * (1 + it.plus * 0.2));
}

export function canEquip(it: ItemInst, cls: ClassId): boolean {
  const b = baseOf(it);
  return !b.cls || b.cls.includes(cls);
}

export function slotFor(it: ItemInst): EquipSlot {
  return baseOf(it).slot;
}

export function itemTooltip(it: ItemInst, cls?: ClassId): string {
  const b = baseOf(it);
  const m = plusMul(it);
  const lines: string[] = [];
  lines.push(`<b style="color:${RARITY[it.rarity].color}">${itemName(it)}</b>`);
  lines.push(`<span class="dim">${RARITY[it.rarity].name} · 아이템 레벨 ${it.ilvl}</span>`);
  if (b.atk) lines.push(`물리 공격력 ${Math.round(b.atk * m)}`);
  if (b.matk) lines.push(`마법 공격력 ${Math.round(b.matk * m)}`);
  if (b.def) lines.push(`방어력 ${Math.round(b.def * m)}`);
  if (b.hp) lines.push(`최대 HP +${Math.round(b.hp * m)}`);
  if (b.mp) lines.push(`최대 MP +${Math.round(b.mp * m)}`);
  for (const [k, v] of it.affixes) lines.push(`<span style="color:#9fd0ff">+${v} ${AFFIX_NAMES[k]}</span>`);
  if (b.cls) {
    const ok = !cls || b.cls.includes(cls);
    lines.push(`<span style="color:${ok ? '#aaa' : '#f66'}">착용: ${b.cls.map((c) => CLASSES[c].name).join(', ')}</span>`);
  }
  return lines.join('<br>');
}

export function entryIcon(e: InvEntry): string {
  if (e.t === 'eq') return baseOf(e.item).icon;
  if (e.t === 'use') return CONSUMABLES[e.id].icon;
  return MATERIALS[e.id].icon;
}

// ── 캐릭터 저장 데이터 ──────────────────────────────────────────────
export interface QuestState {
  id: string;
  stage: number;
  count: number;
  done: boolean;
}

export interface Hero {
  name: string;
  race: keyof typeof RACES;
  cls: ClassId;
  gender: 'm' | 'f';
  level: number;
  xp: number;
  alloc: Stats; // 직접 찍은 능력치
  points: number;
  skillPts: number;
  skillLv: Record<string, number>;
  equip: Partial<Record<EquipSlot, ItemInst>>;
  inv: (InvEntry | null)[];
  /** 마을 보관함 */
  stash?: (InvEntry | null)[];
  quick: (string | null)[]; // 소모품 id 3칸
  gold: number;
  soul: number;
  quests: QuestState[];
  flags: Record<string, boolean | number | string>;
  map: string;
  x: number;
  y: number;
  hp: number;
  mp: number;
  playtime: number;
  kills: number;
}

export const INV_SIZE = 30;
export const STASH_SIZE = 60;

/** 칸 배열에 넣는다 (같은 소모품·재료는 합친다). 실패하면 false */
export function putInto(arr: (InvEntry | null)[], e: InvEntry): boolean {
  if (e.t !== 'eq') {
    const same = arr.find((s) => s && s.t === e.t && s.id === e.id) as { n: number } | undefined;
    if (same) { same.n += e.n; return true; }
  }
  const i = arr.indexOf(null);
  if (i < 0) return false;
  arr[i] = e;
  return true;
}

/** 한 칸을 다른 배열로 옮긴다 */
export function moveEntry(from: (InvEntry | null)[], i: number, to: (InvEntry | null)[]): boolean {
  const e = from[i];
  if (!e || !putInto(to, e)) return false;
  from[i] = null;
  return true;
}

/** 정리: 같은 것끼리 합치고 장비 → 소모품 → 재료 순, 장비는 부위·등급 순으로 앞에서부터 채운다 */
export function sortEntries(arr: (InvEntry | null)[]): void {
  const items = arr.filter((e): e is InvEntry => !!e);
  const merged: InvEntry[] = [];
  for (const e of items) {
    if (e.t !== 'eq') {
      const same = merged.find((s) => s.t === e.t && s.id === e.id) as { n: number } | undefined;
      if (same) { same.n += e.n; continue; }
    }
    merged.push(e);
  }
  const ord = { eq: 0, use: 1, mat: 2 } as const;
  const SL = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'ring', 'amulet'];
  merged.sort((a, b) => {
    if (a.t !== b.t) return ord[a.t] - ord[b.t];
    if (a.t === 'eq' && b.t === 'eq') {
      return SL.indexOf(slotFor(a.item)) - SL.indexOf(slotFor(b.item)) || b.item.rarity - a.item.rarity || b.item.ilvl - a.item.ilvl;
    }
    return (a as { id: string }).id.localeCompare((b as { id: string }).id);
  });
  arr.fill(null);
  merged.forEach((e, i) => (arr[i] = e));
}

export function newHero(name: string, race: Hero['race'], cls: ClassId, gender: 'm' | 'f'): Hero {
  const c = CLASSES[cls];
  const h: Hero = {
    name, race, cls, gender, level: 1, xp: 0,
    alloc: { str: 0, dex: 0, int: 0, vit: 0, wis: 0 }, points: 0, skillPts: 0,
    skillLv: Object.fromEntries(c.skills.map((s) => [s.id, s.unlock <= 1 ? 1 : 0])),
    equip: {}, inv: new Array(INV_SIZE).fill(null), quick: ['hp_s', 'mp_s', 'antidote'],
    gold: 60, soul: 0, quests: [], flags: {}, map: HOME[race].map, x: -1, y: -1, hp: -1, mp: -1, playtime: 0, kills: 0,
  };
  h.equip.weapon = makeItem(c.weapons[0], 1, 0);
  h.equip.offhand = makeItem(c.offhand, 1, 0);
  const light = cls === 'mage' || cls === 'cleric';
  h.equip.body = makeItem(light ? 'cloth_robe' : 'leather_armor', 1, 0);
  addToInv(h, { t: 'use', id: 'hp_s', n: 5 });
  addToInv(h, { t: 'use', id: 'mp_s', n: 3 });
  addToInv(h, { t: 'use', id: 'antidote', n: 1 });
  addToInv(h, { t: 'use', id: 'recall', n: 1 });
  return h;
}

export function addToInv(h: Hero, e: InvEntry): boolean {
  if (e.t !== 'eq') {
    for (const s of h.inv) {
      if (s && s.t === e.t && s.id === e.id) {
        s.n += e.n;
        return true;
      }
    }
  }
  const i = h.inv.indexOf(null);
  if (i < 0) return false;
  h.inv[i] = e;
  return true;
}

export function countOf(h: Hero, t: 'use' | 'mat', id: string): number {
  let n = 0;
  for (const s of h.inv) if (s && s.t === t && s.id === id) n += s.n;
  return n;
}

export function removeCount(h: Hero, t: 'use' | 'mat', id: string, n: number): boolean {
  if (countOf(h, t, id) < n) return false;
  for (let i = 0; i < h.inv.length && n > 0; i++) {
    const s = h.inv[i];
    if (s && s.t === t && s.id === id) {
      const k = Math.min(n, s.n);
      s.n -= k;
      n -= k;
      if (s.n <= 0) h.inv[i] = null;
    }
  }
  return true;
}

// ── 파생 능력치 (기획서 5.2 공식) ───────────────────────────────────
export interface Derived {
  stats: Stats;
  maxHp: number;
  maxMp: number;
  patk: number;
  matk: number;
  def: number;
  crit: number; // 0~0.6
  evade: number; // 0~0.4
  aspd: number; // 배율
  ms: number; // px/s
  atkPct: number;
  mpRegen: number;
  hpRegen: number;
  maxSt: number;
}

export function derive(h: Hero, buffs: { atkPct?: number; defPct?: number; ms?: number } = {}): Derived {
  const c = CLASSES[h.cls];
  const r = RACES[h.race];
  const st: Stats = { ...c.base };
  for (const k of Object.keys(st) as StatKey[]) {
    st[k] += (r.mods[k] ?? 0) + h.alloc[k] + Math.floor((h.level - 1) * (c.main.includes(k) ? 0.5 : 0.2));
  }
  let watk = 0, wmatk = 0, def = 0, hp = 0, mp = 0, atkPct = 0, crit = 0, ms = 0, aspd = 0;
  for (const it of Object.values(h.equip)) {
    if (!it) continue;
    const b = baseOf(it);
    const m = plusMul(it);
    watk += (b.atk ?? 0) * m;
    wmatk += (b.matk ?? 0) * m;
    def += (b.def ?? 0) * m;
    hp += (b.hp ?? 0) * m;
    mp += (b.mp ?? 0) * m;
    for (const [k, v] of it.affixes) {
      if (k in st) st[k as StatKey] += v;
      else if (k === 'atkPct') atkPct += v;
      else if (k === 'crit') crit += v;
      else if (k === 'hp') hp += v;
      else if (k === 'mp') mp += v;
      else if (k === 'ms') ms += v;
      else if (k === 'def') def += v;
      else if (k === 'aspd') aspd += v;
    }
  }
  for (const k of Object.keys(st) as StatKey[]) st[k] = Math.max(1, st[k]);
  const maxHp = Math.round(100 + st.vit * 12 + h.level * 8 + hp);
  const maxMp = Math.round(30 + st.int * 5 + st.wis * 2 + h.level * 3 + mp * 0.7);
  atkPct += buffs.atkPct ?? 0;
  let defv = def + st.vit * 0.5;
  if (h.race === 'dwarf') defv *= 1.1;
  defv *= 1 + (buffs.defPct ?? 0) / 100;
  let msv = 64 * (1 + ms / 100 + st.dex * 0.002 + (buffs.ms ?? 0) / 100);
  if (h.race === 'elf') msv *= 1.08;
  return {
    stats: st,
    maxHp, maxMp,
    patk: (watk + st.str * 1.5 + st.dex * 0.5) * (1 + atkPct / 100),
    matk: (wmatk + st.int * 1.8 + st.wis * 0.4) * (1 + atkPct / 100),
    def: defv,
    crit: Math.min(0.6, 0.05 + st.dex * 0.002 + crit / 100),
    evade: Math.min(0.4, 0.03 + st.dex * 0.0015),
    aspd: 1 + st.dex * 0.006 + aspd / 100,
    ms: msv,
    atkPct,
    mpRegen: (0.55 + st.int * 0.045 + st.wis * 0.035) * RACES[h.race].mana.regen,
    hpRegen: 0.6 + st.vit * 0.05,
    maxSt: 100,
  };
}
