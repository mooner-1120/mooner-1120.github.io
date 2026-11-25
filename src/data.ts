// 데이터 정의 — 기획서 3~5장, 8~10장. 밸런싱은 이 파일 숫자만 바꾸면 된다.

export type StatKey = 'str' | 'dex' | 'int' | 'vit' | 'wis';
export type Stats = Record<StatKey, number>;
export type RaceId = 'human' | 'elf' | 'dwarf' | 'orc' | 'demon';
export type ClassId = 'warrior' | 'rogue' | 'mage' | 'archer' | 'cleric';
export type Element = 'phys' | 'fire' | 'ice' | 'light' | 'holy' | 'dark' | 'poison';

export const STAT_NAMES: Record<StatKey, string> = { str: '힘', dex: '민첩', int: '지능', vit: '체력', wis: '신앙' };
export const ELEMENT_NAMES: Record<Element, string> = {
  phys: '물리', fire: '화염', ice: '냉기', light: '번개', holy: '성', dark: '암흑', poison: '독',
};

export interface RaceData {
  id: RaceId;
  name: string;
  concept: string;
  mods: Partial<Stats>;
  passive: { name: string; desc: string };
  active: { name: string; desc: string; cd: number };
  bodies: { m: string; f: string };
}

export const RACES: Record<RaceId, RaceData> = {
  human: {
    id: 'human', name: '인간', concept: '균형, 적응력',
    mods: { str: 1, dex: 1, int: 1, vit: 1, wis: 1 },
    passive: { name: '적응력', desc: '경험치 획득 +10%' },
    active: { name: '불굴의 의지', desc: '3초간 받는 피해 30% 감소', cd: 30 },
    bodies: { m: 'human_m', f: 'human_f' },
  },
  elf: {
    id: 'elf', name: '엘프', concept: '민첩, 마력 친화',
    mods: { dex: 3, int: 2, vit: -1 },
    passive: { name: '숲의 감각', desc: '이동 속도 +8%, 마나 재생 +15%' },
    active: { name: '바람의 걸음', desc: '커서 방향 짧은 거리 순간 이동', cd: 10 },
    bodies: { m: 'elf_m', f: 'elf_f' },
  },
  dwarf: {
    id: 'dwarf', name: '드워프', concept: '단단함, 장인',
    mods: { vit: 3, str: 2, dex: -2 },
    passive: { name: '강철 피부', desc: '물리 방어 +10%, 넉백 저항' },
    active: { name: '용광로 심장', desc: '5초간 최대 HP의 30% 회복', cd: 40 },
    bodies: { m: 'dwarf_m', f: 'dwarf_f' },
  },
  orc: {
    id: 'orc', name: '오크', concept: '야성, 근력',
    mods: { str: 4, vit: 1, int: -2 },
    passive: { name: '전사의 피', desc: 'HP 30% 이하일 때 공격력 +20%' },
    active: { name: '분노의 함성', desc: '주변 적 1.5초 기절 + 6초간 공격력 +20%', cd: 35 },
    bodies: { m: 'orc_m', f: 'orc_f' },
  },
  demon: {
    id: 'demon', name: '마족', concept: '마력, 위험한 힘',
    mods: { int: 3, str: 1, vit: -1 },
    passive: { name: '암흑 친화', desc: '주는 피해 +15% (암흑 기운), 받는 성속성 피해 +10%' },
    active: { name: '마계의 계약', desc: '최대 HP 20%를 바쳐 마나 전부 회복', cd: 45 },
    bodies: { m: 'demon_m', f: 'demon_f' },
  },
};

export type SkillShape = 'self' | 'target' | 'dir' | 'point';
export interface SkillData {
  key: 'Q' | 'W' | 'E' | 'R';
  id: string;
  name: string;
  desc: string;
  mp: number;
  cd: number;
  coeff: number; // 피해 계수 (레벨당 +15%)
  unlock: number; // 해금 레벨
  shape: SkillShape;
  range: number;
  element: Element;
}

export interface ClassData {
  id: ClassId;
  name: string;
  role: string;
  base: Stats;
  main: StatKey[];
  basic: { name: string; kind: 'melee' | 'bolt' | 'arrow'; range: number; interval: number; combo: number; element: Element; magic: boolean };
  weapons: string[]; // 시작 무기 id
  offhand: string;
  skills: SkillData[];
  style: string;
}

export const CLASSES: Record<ClassId, ClassData> = {
  warrior: {
    id: 'warrior', name: '전사', role: '근접 탱커/딜러', style: '가드와 반격, 넉백',
    base: { str: 8, dex: 4, int: 2, vit: 7, wis: 3 }, main: ['str', 'vit'],
    basic: { name: '3연타 콤보', kind: 'melee', range: 22, interval: 0.48, combo: 3, element: 'phys', magic: false },
    weapons: ['rusty_sword'], offhand: 'wood_shield',
    skills: [
      { key: 'Q', id: 'block', name: '방패 막기', desc: '1.2초간 정면 피해 70% 감소. 막기 직후 0.3초 안에 맞으면 패링: 적 기절 + 반격', mp: 8, cd: 5, coeff: 1.6, unlock: 1, shape: 'self', range: 0, element: 'phys' },
      { key: 'W', id: 'dash_slash', name: '돌진 베기', desc: '커서 방향으로 돌진하며 경로의 적을 베고 밀쳐낸다', mp: 14, cd: 6, coeff: 1.8, unlock: 2, shape: 'dir', range: 64, element: 'phys' },
      { key: 'E', id: 'war_cry', name: '전투 함성', desc: '8초간 방어력 +40%, 주변 적의 주의를 끈다', mp: 18, cd: 18, coeff: 0, unlock: 3, shape: 'self', range: 0, element: 'phys' },
      { key: 'R', id: 'earth_split', name: '대지 가르기', desc: '커서 방향 부채꼴 광역 피해 + 0.8초 기절', mp: 35, cd: 16, coeff: 3.2, unlock: 5, shape: 'dir', range: 78, element: 'phys' },
    ],
  },
  rogue: {
    id: 'rogue', name: '도적', role: '근접 기동 딜러', style: '백어택, 연속기, 은신',
    base: { str: 4, dex: 9, int: 3, vit: 5, wis: 3 }, main: ['dex'],
    basic: { name: '빠른 2연타', kind: 'melee', range: 18, interval: 0.32, combo: 2, element: 'phys', magic: false },
    weapons: ['knife'], offhand: 'offhand_knife',
    skills: [
      { key: 'Q', id: 'ambush', name: '암습', desc: '커서 근처 적 뒤로 순간이동 후 치명타 일격', mp: 12, cd: 6, coeff: 2.2, unlock: 1, shape: 'target', range: 110, element: 'phys' },
      { key: 'W', id: 'poison', name: '독 바르기', desc: '10초간 공격이 중독(초당 피해 3초)을 건다', mp: 14, cd: 14, coeff: 0.35, unlock: 2, shape: 'self', range: 0, element: 'poison' },
      { key: 'E', id: 'smoke', name: '연막탄', desc: '3초간 은신(적이 놓침) + 이동속도 증가, 다음 공격 확정 치명타', mp: 16, cd: 15, coeff: 0, unlock: 3, shape: 'self', range: 0, element: 'phys' },
      { key: 'R', id: 'shadow_dance', name: '그림자 난무', desc: '주변 적들을 무적 상태로 1.2초간 연속으로 벤다', mp: 35, cd: 18, coeff: 0.9, unlock: 5, shape: 'self', range: 64, element: 'dark' },
    ],
  },
  mage: {
    id: 'mage', name: '마법사', role: '원거리 광역 딜러', style: '속성 마법, 마나 관리',
    base: { str: 2, dex: 4, int: 9, vit: 4, wis: 5 }, main: ['int'],
    basic: { name: '마력탄', kind: 'bolt', range: 130, interval: 0.55, combo: 1, element: 'light', magic: true },
    weapons: ['apprentice_staff'], offhand: 'tome',
    skills: [
      { key: 'Q', id: 'fireball', name: '화염구', desc: '날아가 폭발하는 화염구. 화상을 입힌다', mp: 12, cd: 3, coeff: 1.9, unlock: 1, shape: 'dir', range: 150, element: 'fire' },
      { key: 'W', id: 'frost_zone', name: '빙결 지대', desc: '지정 위치에 4초간 둔화 + 냉기 피해 장판', mp: 18, cd: 9, coeff: 0.45, unlock: 2, shape: 'point', range: 140, element: 'ice' },
      { key: 'E', id: 'blink', name: '순간 이동', desc: '커서 방향으로 짧게 순간 이동', mp: 10, cd: 6, coeff: 0, unlock: 3, shape: 'point', range: 80, element: 'phys' },
      { key: 'R', id: 'meteor', name: '유성우', desc: '지정 위치에 유성 7개가 떨어진다', mp: 45, cd: 20, coeff: 2.0, unlock: 5, shape: 'point', range: 150, element: 'fire' },
    ],
  },
  archer: {
    id: 'archer', name: '궁수', role: '원거리 단일 딜러', style: '카이팅, 조준, 함정',
    base: { str: 3, dex: 9, int: 3, vit: 5, wis: 4 }, main: ['dex'],
    basic: { name: '사격', kind: 'arrow', range: 150, interval: 0.5, combo: 1, element: 'phys', magic: false },
    weapons: ['short_bow'], offhand: 'quiver',
    skills: [
      { key: 'Q', id: 'triple', name: '삼연사', desc: '커서 방향으로 화살 3발을 부채꼴로 쏜다', mp: 10, cd: 3, coeff: 1.2, unlock: 1, shape: 'dir', range: 160, element: 'phys' },
      { key: 'W', id: 'trap', name: '덫 설치', desc: '밟은 적을 2.5초 속박하고 피해를 준다', mp: 12, cd: 8, coeff: 1.5, unlock: 2, shape: 'point', range: 90, element: 'phys' },
      { key: 'E', id: 'back_shot', name: '후퇴 사격', desc: '뒤로 구르며 커서 방향으로 강한 화살을 쏜다', mp: 12, cd: 6, coeff: 1.8, unlock: 3, shape: 'dir', range: 160, element: 'phys' },
      { key: 'R', id: 'arrow_rain', name: '폭풍 화살비', desc: '넓은 범위에 3초간 화살비를 퍼붓는다', mp: 40, cd: 18, coeff: 0.55, unlock: 5, shape: 'point', range: 150, element: 'phys' },
    ],
  },
  cleric: {
    id: 'cleric', name: '성직자', role: '서포터/회복', style: '힐, 버프, 성속성 공격',
    base: { str: 5, dex: 3, int: 4, vit: 6, wis: 8 }, main: ['wis', 'vit'],
    basic: { name: '메이스 타격', kind: 'melee', range: 20, interval: 0.55, combo: 2, element: 'holy', magic: false },
    weapons: ['mace'], offhand: 'holy_book',
    skills: [
      { key: 'Q', id: 'heal', name: '치유의 빛', desc: '신앙에 비례해 HP 회복', mp: 16, cd: 6, coeff: 1.0, unlock: 1, shape: 'self', range: 0, element: 'holy' },
      { key: 'W', id: 'barrier', name: '성스러운 방벽', desc: '1.5초간 무적 보호막', mp: 18, cd: 14, coeff: 0, unlock: 2, shape: 'self', range: 0, element: 'holy' },
      { key: 'E', id: 'purify', name: '정화', desc: '상태이상 해제 + 주변 적에게 성속성 피해', mp: 12, cd: 8, coeff: 1.0, unlock: 3, shape: 'self', range: 48, element: 'holy' },
      { key: 'R', id: 'judgment', name: '심판의 망치', desc: '지정 위치에 성속성 광역 + 기절. 언데드 2배', mp: 40, cd: 16, coeff: 3.0, unlock: 5, shape: 'point', range: 130, element: 'holy' },
    ],
  },
};

// ── 아이템 ───────────────────────────────────────────────────────────
export type Slot = 'weapon' | 'offhand' | 'head' | 'body' | 'hands' | 'feet' | 'ring' | 'amulet';
export type EquipSlot = Slot | 'ring2';
export const SLOT_NAMES: Record<EquipSlot, string> = {
  weapon: '무기', offhand: '보조', head: '머리', body: '몸', hands: '장갑', feet: '신발', ring: '반지', ring2: '반지', amulet: '목걸이',
};
export type Rarity = 0 | 1 | 2 | 3 | 4;
export const RARITY = [
  { name: '일반', color: '#e8e8e8' },
  { name: '고급', color: '#6ee06a' },
  { name: '희귀', color: '#5aa8ff' },
  { name: '영웅', color: '#c27bff' },
  { name: '전설', color: '#ffa53a' },
];

export interface BaseItem {
  id: string;
  name: string;
  slot: Slot;
  icon: string;
  cls?: ClassId[]; // 착용 가능 클래스 (없으면 전체)
  atk?: number;
  matk?: number;
  def?: number;
  hp?: number;
  mp?: number;
  tier: number; // 등장 레벨대
  price: number;
}

export const BASE_ITEMS: BaseItem[] = [
  // 무기 — 0x72 무기 스프라이트를 그대로 아이콘 겸 손에 든 그림으로 쓴다
  { id: 'rusty_sword', name: '녹슨 검', slot: 'weapon', icon: 'weapon_rusty_sword', cls: ['warrior'], atk: 6, tier: 1, price: 20 },
  { id: 'regular_sword', name: '기사의 장검', slot: 'weapon', icon: 'weapon_regular_sword', cls: ['warrior'], atk: 11, tier: 3, price: 90 },
  { id: 'axe', name: '전투 도끼', slot: 'weapon', icon: 'weapon_axe', cls: ['warrior'], atk: 14, tier: 5, price: 160 },
  { id: 'knight_sword', name: '근위대 대검', slot: 'weapon', icon: 'weapon_knight_sword', cls: ['warrior'], atk: 20, tier: 8, price: 320 },
  { id: 'red_gem_sword', name: '홍옥의 검', slot: 'weapon', icon: 'weapon_red_gem_sword', cls: ['warrior'], atk: 27, tier: 11, price: 600 },
  { id: 'knife', name: '단검', slot: 'weapon', icon: 'weapon_knife', cls: ['rogue'], atk: 5, tier: 1, price: 20 },
  { id: 'machete', name: '마체테', slot: 'weapon', icon: 'weapon_machete', cls: ['rogue'], atk: 10, tier: 3, price: 90 },
  { id: 'katana', name: '그림자 카타나', slot: 'weapon', icon: 'weapon_katana', cls: ['rogue'], atk: 15, tier: 6, price: 200 },
  { id: 'duel_sword', name: '결투용 쌍검', slot: 'weapon', icon: 'weapon_duel_sword', cls: ['rogue'], atk: 22, tier: 9, price: 420 },
  { id: 'apprentice_staff', name: '수습생 지팡이', slot: 'weapon', icon: 'weapon_green_magic_staff', cls: ['mage'], atk: 2, matk: 7, tier: 1, price: 20 },
  { id: 'red_staff', name: '화염의 지팡이', slot: 'weapon', icon: 'weapon_red_magic_staff', cls: ['mage'], atk: 3, matk: 14, tier: 4, price: 140 },
  { id: 'arch_staff', name: '대마법사의 지팡이', slot: 'weapon', icon: 'weapon_red_magic_staff', cls: ['mage'], atk: 4, matk: 24, tier: 9, price: 450 },
  { id: 'short_bow', name: '짧은 활', slot: 'weapon', icon: 'weapon_bow', cls: ['archer'], atk: 6, tier: 1, price: 20 },
  { id: 'long_bow', name: '사냥꾼의 장궁', slot: 'weapon', icon: 'weapon_bow_2', cls: ['archer'], atk: 12, tier: 4, price: 140 },
  { id: 'elf_bow', name: '은빛 장궁', slot: 'weapon', icon: 'weapon_bow_2', cls: ['archer'], atk: 21, tier: 9, price: 450 },
  { id: 'mace', name: '메이스', slot: 'weapon', icon: 'weapon_mace', cls: ['cleric'], atk: 5, matk: 4, tier: 1, price: 20 },
  { id: 'hammer', name: '성전 망치', slot: 'weapon', icon: 'weapon_hammer', cls: ['cleric'], atk: 10, matk: 8, tier: 4, price: 140 },
  { id: 'big_hammer', name: '심판자의 대망치', slot: 'weapon', icon: 'weapon_big_hammer', cls: ['cleric'], atk: 18, matk: 14, tier: 9, price: 450 },
  // 보조
  { id: 'wood_shield', name: '나무 방패', slot: 'offhand', icon: 'i_shield_red', cls: ['warrior', 'cleric'], def: 3, tier: 1, price: 18 },
  { id: 'iron_shield', name: '철 방패', slot: 'offhand', icon: 'i_shield_iron', cls: ['warrior', 'cleric'], def: 7, hp: 20, tier: 5, price: 150 },
  { id: 'offhand_knife', name: '보조 단검', slot: 'offhand', icon: 'weapon_knife', cls: ['rogue'], atk: 2, tier: 1, price: 18 },
  { id: 'offhand_cleaver', name: '보조 식칼', slot: 'offhand', icon: 'weapon_cleaver', cls: ['rogue'], atk: 6, tier: 5, price: 150 },
  { id: 'tome', name: '견습 마도서', slot: 'offhand', icon: 'i_book_blue', cls: ['mage'], matk: 3, mp: 10, tier: 1, price: 18 },
  { id: 'fire_tome', name: '화염 마도서', slot: 'offhand', icon: 'i_book_red', cls: ['mage'], matk: 8, mp: 25, tier: 5, price: 150 },
  { id: 'quiver', name: '화살통', slot: 'offhand', icon: 'i_quiver', cls: ['archer'], atk: 2, tier: 1, price: 18 },
  { id: 'holy_book', name: '성서', slot: 'offhand', icon: 'i_holy_book', cls: ['cleric'], matk: 3, mp: 10, tier: 1, price: 18 },
  // 방어구
  { id: 'cloth_hood', name: '천 두건', slot: 'head', icon: 'i_helm_cloth', def: 1, mp: 8, tier: 1, price: 15 },
  { id: 'leather_cap', name: '가죽 모자', slot: 'head', icon: 'i_helm_leather', def: 2, tier: 1, price: 15 },
  { id: 'iron_helm', name: '철 투구', slot: 'head', icon: 'i_helm_iron', def: 5, tier: 4, price: 110 },
  { id: 'gold_helm', name: '황금 투구', slot: 'head', icon: 'i_helm_gold', def: 9, hp: 30, tier: 9, price: 380 },
  { id: 'cloth_robe', name: '천 로브', slot: 'body', icon: 'i_armor_cloth', def: 2, mp: 15, tier: 1, price: 20 },
  { id: 'leather_armor', name: '가죽 갑옷', slot: 'body', icon: 'i_armor_leather', def: 4, tier: 1, price: 20 },
  { id: 'chain_mail', name: '사슬 갑옷', slot: 'body', icon: 'i_armor_iron', def: 9, tier: 4, price: 150 },
  { id: 'gold_plate', name: '황금 판금갑옷', slot: 'body', icon: 'i_armor_gold', def: 16, hp: 50, tier: 9, price: 500 },
  { id: 'cloth_gloves', name: '천 장갑', slot: 'hands', icon: 'i_gloves_cloth', def: 1, tier: 1, price: 12 },
  { id: 'leather_gloves', name: '가죽 장갑', slot: 'hands', icon: 'i_gloves_leather', def: 2, tier: 2, price: 30 },
  { id: 'iron_gauntlet', name: '철 건틀릿', slot: 'hands', icon: 'i_gloves_iron', def: 4, tier: 5, price: 120 },
  { id: 'leather_boots', name: '가죽 장화', slot: 'feet', icon: 'i_boots_leather', def: 2, tier: 1, price: 12 },
  { id: 'cloth_shoes', name: '천 신발', slot: 'feet', icon: 'i_boots_cloth', def: 1, tier: 1, price: 12 },
  { id: 'iron_boots', name: '철 장화', slot: 'feet', icon: 'i_boots_iron', def: 4, tier: 5, price: 120 },
  { id: 'gold_boots', name: '황금 장화', slot: 'feet', icon: 'i_boots_gold', def: 7, tier: 9, price: 300 },
  // 장신구
  { id: 'ruby_ring', name: '루비 반지', slot: 'ring', icon: 'i_ring_red', tier: 2, price: 80 },
  { id: 'sapphire_ring', name: '사파이어 반지', slot: 'ring', icon: 'i_ring_blue', tier: 2, price: 80 },
  { id: 'emerald_ring', name: '에메랄드 반지', slot: 'ring', icon: 'i_ring_green', tier: 4, price: 120 },
  { id: 'amethyst_ring', name: '자수정 반지', slot: 'ring', icon: 'i_ring_purple', tier: 7, price: 200 },
  { id: 'ruby_amulet', name: '루비 목걸이', slot: 'amulet', icon: 'i_amulet_red', tier: 3, price: 120 },
  { id: 'sapphire_amulet', name: '사파이어 목걸이', slot: 'amulet', icon: 'i_amulet_blue', tier: 3, price: 120 },
  { id: 'royal_amulet', name: '왕가의 목걸이', slot: 'amulet', icon: 'i_amulet_purple', tier: 8, price: 300 },
];
export const BASE_BY_ID: Record<string, BaseItem> = Object.fromEntries(BASE_ITEMS.map((b) => [b.id, b]));

export type AffixKey = StatKey | 'atkPct' | 'crit' | 'hp' | 'mp' | 'ms' | 'def' | 'aspd';
export const AFFIX_NAMES: Record<AffixKey, string> = {
  str: '힘', dex: '민첩', int: '지능', vit: '체력', wis: '신앙',
  atkPct: '공격력 %', crit: '치명타율 %', hp: '최대 HP', mp: '최대 MP', ms: '이동 속도 %', def: '방어력', aspd: '공격 속도 %',
};

export interface Consumable {
  id: string;
  name: string;
  icon: string;
  desc: string;
  price: number;
  heal?: number;
  mana?: number;
  cure?: boolean;
  buff?: { atkPct?: number; dur: number };
  recall?: boolean;
  bomb?: boolean;
}
export const CONSUMABLES: Record<string, Consumable> = {
  hp_s: { id: 'hp_s', name: '작은 체력 포션', icon: 'flask_red', desc: 'HP 80 회복', price: 15, heal: 80 },
  hp_l: { id: 'hp_l', name: '큰 체력 포션', icon: 'flask_big_red', desc: 'HP 220 회복', price: 45, heal: 220 },
  mp_s: { id: 'mp_s', name: '작은 마나 포션', icon: 'flask_blue', desc: 'MP 50 회복', price: 15, mana: 50 },
  mp_l: { id: 'mp_l', name: '큰 마나 포션', icon: 'flask_big_blue', desc: 'MP 140 회복', price: 45, mana: 140 },
  antidote: { id: 'antidote', name: '해독제', icon: 'flask_green', desc: '중독·화상·둔화 해제', price: 12, cure: true },
  meat: { id: 'meat', name: '구운 고기', icon: 'i_food', desc: '60초간 공격력 +15%', price: 30, buff: { atkPct: 15, dur: 60 } },
  bomb: { id: 'bomb', name: '폭탄', icon: 'bomb_f0', desc: '커서 위치에 던져 폭발 피해', price: 25, bomb: true },
  recall: { id: 'recall', name: '귀환 두루마리', icon: 'i_scroll', desc: '마을로 돌아간다', price: 40, recall: true },
};

export const MATERIALS: Record<string, { name: string; icon: string; price: number }> = {
  soul: { name: '영혼석', icon: 'i_soul', price: 0 },
  hide: { name: '멧돼지 가죽', icon: 'i_armor_leather', price: 6 },
  silk: { name: '거미 비단', icon: 'i_helm_cloth', price: 8 },
  bone: { name: '오래된 뼈', icon: 'skull', price: 5 },
  seal: { name: '순찰대 인장', icon: 'i_amulet_blue', price: 0 },
  spirit_stone: { name: '정령석', icon: 'fx_orb_green_0', price: 0 },
};

// ── 적 ───────────────────────────────────────────────────────────────
export type AttackKind = 'bite' | 'slash' | 'charge' | 'shoot' | 'spit' | 'cast' | 'slam';
export interface EnemyData {
  id: string;
  name: string;
  sprite: string;
  level: number;
  hp: number;
  atk: number;
  def: number;
  speed: number;
  xp: number;
  gold: [number, number];
  kind: 'wild' | 'human' | 'undead' | 'spirit' | 'demon';
  attacks: AttackKind[];
  range: number; // 공격 시작 거리
  windup: number;
  cd: number;
  aggro: number;
  radius: number;
  keepDist?: number; // 원거리: 이 거리 이하면 물러난다
  weak?: Element[];
  resist?: Element[];
  drops?: [string, number][]; // [재료 id, 확률]
  boss?: boolean;
  elite?: boolean;
  summons?: string; // 주기적으로 부르는 부하
  scale?: number;
}

export const ENEMIES: Record<string, EnemyData> = {
  wolf: { id: 'wolf', name: '늑대', sprite: 'wolf', level: 1, hp: 42, atk: 9, def: 1, speed: 58, xp: 14, gold: [2, 6], kind: 'wild', attacks: ['bite'], range: 18, windup: 0.4, cd: 1.3, aggro: 85, radius: 6, weak: ['fire'] },
  boar: { id: 'boar', name: '멧돼지', sprite: 'boar', level: 2, hp: 70, atk: 13, def: 3, speed: 42, xp: 20, gold: [3, 8], kind: 'wild', attacks: ['charge'], range: 80, windup: 0.75, cd: 2.6, aggro: 80, radius: 7, drops: [['hide', 0.55]] },
  spider: { id: 'spider', name: '거대 거미', sprite: 'spider', level: 3, hp: 60, atk: 12, def: 2, speed: 50, xp: 24, gold: [3, 9], kind: 'wild', attacks: ['bite', 'spit'], range: 70, windup: 0.5, cd: 1.6, aggro: 90, radius: 6, weak: ['fire'], drops: [['silk', 0.5]] },
  goblin: { id: 'goblin', name: '고블린 약탈자', sprite: 'goblin', level: 3, hp: 55, atk: 12, def: 2, speed: 60, xp: 22, gold: [5, 12], kind: 'human', attacks: ['slash'], range: 16, windup: 0.35, cd: 1.0, aggro: 90, radius: 5 },
  bandit: { id: 'bandit', name: '산적', sprite: 'bandit', level: 4, hp: 95, atk: 16, def: 5, speed: 46, xp: 32, gold: [8, 18], kind: 'human', attacks: ['slash'], range: 20, windup: 0.5, cd: 1.4, aggro: 100, radius: 6 },
  bandit_archer: { id: 'bandit_archer', name: '도적단 궁수', sprite: 'bandit_archer', level: 4, hp: 70, atk: 15, def: 3, speed: 44, xp: 32, gold: [8, 18], kind: 'human', attacks: ['shoot'], range: 120, windup: 0.6, cd: 1.8, aggro: 130, radius: 6, keepDist: 60 },
  masked_orc: { id: 'masked_orc', name: '도적단 광전사', sprite: 'masked_orc', level: 6, hp: 160, atk: 22, def: 7, speed: 40, xp: 55, gold: [14, 28], kind: 'human', attacks: ['slam', 'slash'], range: 24, windup: 0.75, cd: 1.8, aggro: 100, radius: 7, elite: true },
  skelet: { id: 'skelet', name: '해골 전사', sprite: 'skelet', level: 4, hp: 75, atk: 15, def: 4, speed: 44, xp: 28, gold: [4, 10], kind: 'undead', attacks: ['slash'], range: 18, windup: 0.45, cd: 1.3, aggro: 100, radius: 5, weak: ['holy'], resist: ['poison'], drops: [['bone', 0.4]] },
  zombie: { id: 'zombie', name: '구울', sprite: 'zombie', level: 5, hp: 140, atk: 18, def: 3, speed: 26, xp: 36, gold: [4, 12], kind: 'undead', attacks: ['bite'], range: 18, windup: 0.6, cd: 1.6, aggro: 80, radius: 6, weak: ['holy', 'fire'], resist: ['poison'], drops: [['bone', 0.4]] },
  tiny_zombie: { id: 'tiny_zombie', name: '썩은 망자', sprite: 'tiny_zombie', level: 4, hp: 50, atk: 11, def: 1, speed: 52, xp: 20, gold: [2, 6], kind: 'undead', attacks: ['bite'], range: 14, windup: 0.3, cd: 1.0, aggro: 90, radius: 5, weak: ['holy', 'fire'] },
  necromancer: { id: 'necromancer', name: '리치', sprite: 'necromancer', level: 6, hp: 150, atk: 20, def: 4, speed: 34, xp: 70, gold: [20, 40], kind: 'undead', attacks: ['cast'], range: 110, windup: 0.8, cd: 2.2, aggro: 130, radius: 6, keepDist: 70, weak: ['holy'], elite: true, summons: 'skelet' },
  big_zombie: { id: 'big_zombie', name: '묘지기 거대 구울', sprite: 'big_zombie', level: 7, hp: 900, atk: 26, def: 6, speed: 30, xp: 300, gold: [120, 180], kind: 'undead', attacks: ['slam', 'bite', 'spit'], range: 28, windup: 0.8, cd: 1.6, aggro: 200, radius: 11, weak: ['holy', 'fire'], boss: true },
  bandit_king: { id: 'bandit_king', name: '도적왕 가르토', sprite: 'bandit_king', level: 9, hp: 1700, atk: 32, def: 9, speed: 40, xp: 650, gold: [400, 500], kind: 'human', attacks: ['slash', 'charge', 'slam'], range: 30, windup: 0.7, cd: 1.3, aggro: 220, radius: 11, boss: true },
  // ── 2장: 실바넬의 썩은 숲 ──
  blight_wolf: { id: 'blight_wolf', name: '타락한 늑대', sprite: 'blight_wolf', level: 8, hp: 150, atk: 25, def: 5, speed: 64, xp: 55, gold: [8, 16], kind: 'wild', attacks: ['bite'], range: 18, windup: 0.35, cd: 1.1, aggro: 100, radius: 6, weak: ['fire', 'holy'] },
  swampy: { id: 'swampy', name: '썩은 슬라임', sprite: 'swampy', level: 8, hp: 170, atk: 23, def: 4, speed: 30, xp: 50, gold: [6, 14], kind: 'spirit', attacks: ['bite', 'spit'], range: 70, windup: 0.5, cd: 1.6, aggro: 90, radius: 7, weak: ['fire'], resist: ['poison'] },
  muddy: { id: 'muddy', name: '진흙 덩어리', sprite: 'muddy', level: 9, hp: 240, atk: 28, def: 9, speed: 26, xp: 62, gold: [8, 16], kind: 'spirit', attacks: ['slam'], range: 24, windup: 0.7, cd: 1.8, aggro: 80, radius: 7, weak: ['ice'] },
  slug: { id: 'slug', name: '거대 민달팽이', sprite: 'slug', level: 9, hp: 200, atk: 26, def: 6, speed: 22, xp: 58, gold: [6, 14], kind: 'wild', attacks: ['spit'], range: 90, windup: 0.6, cd: 1.7, aggro: 100, radius: 6, keepDist: 50, weak: ['fire'], resist: ['poison'] },
  pumpkin_dude: { id: 'pumpkin_dude', name: '호박 망령', sprite: 'pumpkin_dude', level: 9, hp: 190, atk: 30, def: 6, speed: 52, xp: 64, gold: [10, 20], kind: 'undead', attacks: ['slash', 'charge'], range: 20, windup: 0.45, cd: 1.3, aggro: 110, radius: 6, weak: ['fire', 'holy'] },
  forest_spirit: { id: 'forest_spirit', name: '타락한 숲정령', sprite: 'forest_spirit', level: 10, hp: 190, atk: 30, def: 6, speed: 40, xp: 75, gold: [10, 22], kind: 'spirit', attacks: ['cast'], range: 105, windup: 0.6, cd: 1.6, aggro: 120, radius: 6, keepDist: 55, weak: ['fire', 'holy'], resist: ['poison'], drops: [['spirit_stone', 0.5]] },
  dryad: { id: 'dryad', name: '미쳐 버린 드라이어드', sprite: 'dryad', level: 11, hp: 620, atk: 34, def: 8, speed: 46, xp: 220, gold: [40, 70], kind: 'spirit', attacks: ['cast', 'slash'], range: 110, windup: 0.6, cd: 1.5, aggro: 140, radius: 6, keepDist: 60, weak: ['fire'], resist: ['poison'], elite: true, summons: 'slug' },
  forest_lord: { id: 'forest_lord', name: '타락한 정령 실바레스', sprite: 'forest_lord', level: 13, hp: 4200, atk: 44, def: 12, speed: 40, xp: 2000, gold: [900, 1200], kind: 'spirit', attacks: ['slash', 'spit', 'slam', 'charge'], range: 30, windup: 0.65, cd: 1.25, aggro: 240, radius: 11, weak: ['fire', 'holy'], resist: ['poison'], boss: true },
  imp: { id: 'imp', name: '임프', sprite: 'imp', level: 9, hp: 120, atk: 26, def: 5, speed: 62, xp: 60, gold: [10, 20], kind: 'demon', attacks: ['cast'], range: 100, windup: 0.45, cd: 1.4, aggro: 120, radius: 5, keepDist: 50, weak: ['holy'] },
  chort: { id: 'chort', name: '마검사', sprite: 'chort', level: 10, hp: 230, atk: 32, def: 9, speed: 50, xp: 90, gold: [15, 30], kind: 'demon', attacks: ['slash', 'charge'], range: 22, windup: 0.5, cd: 1.3, aggro: 120, radius: 6, weak: ['holy'] },
  fire_spirit: { id: 'fire_spirit', name: '불 정령', sprite: 'fire_spirit', level: 10, hp: 180, atk: 30, def: 6, speed: 40, xp: 80, gold: [12, 25], kind: 'spirit', attacks: ['cast'], range: 100, windup: 0.6, cd: 1.6, aggro: 120, radius: 6, keepDist: 55, weak: ['ice'], resist: ['fire'] },
  big_demon: { id: 'big_demon', name: '균열의 선봉장 바르곤', sprite: 'big_demon', level: 12, hp: 3200, atk: 42, def: 12, speed: 44, xp: 1500, gold: [800, 1000], kind: 'demon', attacks: ['slash', 'cast', 'slam', 'charge'], range: 30, windup: 0.65, cd: 1.2, aggro: 240, radius: 11, weak: ['holy'], boss: true },
};

// ── 레벨 ─────────────────────────────────────────────────────────────
export const MAX_LEVEL = 50;
export function xpToNext(level: number): number {
  return Math.round(60 * Math.pow(level, 1.55) + 40);
}
