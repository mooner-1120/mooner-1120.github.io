// 퀘스트와 대사 (기획서 7장, 10장, 3.1 종족별 서사)
import { RaceId } from './data';

export type Objective =
  | { k: 'talk'; npc: string; text: string }
  | { k: 'kill'; enemy: string | string[]; n: number; text: string }
  | { k: 'flag'; flag: string; text: string }
  | { k: 'collect'; mat: string; n: number; text: string };

export interface QuestDef {
  id: string;
  name: string;
  main?: boolean;
  giver: string;
  race?: RaceId;
  requires?: string; // 끝나야 받을 수 있는 퀘스트
  offer: string[]; // 제안 대사
  stages: Objective[];
  done: string[]; // 완료 대사
  reward: { xp: number; gold: number; soul?: number; items?: [string, number][]; equip?: string; rarity?: number; flag?: string };
  next?: string; // 끝나면 바로 이어 받는 퀘스트
  autoAccept?: boolean;
}

export const QUESTS: Record<string, QuestDef> = {
  main1: {
    id: 'main1', name: '변경의 늑대들', main: true, giver: 'elder', autoAccept: true,
    offer: [
      '오, 깨어났군. 쓰러진 자네를 우리 경비대가 평원에서 업어 왔다네.',
      '왕이 후계자 없이 죽고 왕관이 사라진 뒤로 아르카디아는 엉망이야. 이 변경 마을까지 늑대가 내려올 정도지.',
      '몸을 추스를 겸, 동쪽 평원의 늑대를 다섯 마리만 처치해 주겠나? 좌클릭으로 걷고, 적을 클릭하면 싸운다네.',
    ],
    stages: [
      { k: 'kill', enemy: 'wolf', n: 5, text: '평원의 늑대 처치' },
      { k: 'talk', npc: 'elder', text: '촌장 오스윈에게 보고' },
    ],
    done: ['훌륭해! 자네 솜씨라면 믿고 맡길 일이 있네.', '경비대장 레아가 순찰대 일로 골머리를 앓고 있어. 마을 동쪽 길목에서 찾아가 보게.'],
    reward: { xp: 120, gold: 60, items: [['hp_s', 3]] },
    next: 'main2',
  },
  main2: {
    id: 'main2', name: '사라진 순찰대', main: true, giver: 'elder', autoAccept: true,
    offer: [],
    stages: [
      { k: 'talk', npc: 'captain', text: '경비대장 레아와 대화' },
      { k: 'flag', flag: 'crypt_cleared', text: '지하 묘지의 묘지기 처치' },
      { k: 'talk', npc: 'captain', text: '레아에게 순찰대 인장 전달' },
    ],
    done: [
      '이건... 순찰대 인장이군. 그들은 결국 돌아오지 못했어.',
      '인장 뒷면에 도적단 요새로 가는 암호가 새겨져 있다. 도적왕 가르토 놈이 왕관 조각을 노리고 있다는 소문이 사실이었군.',
      '평원 동쪽 끝 요새의 문, 이제 이 암호로 열 수 있을 거다. 부탁한다.',
    ],
    reward: { xp: 400, gold: 150, soul: 3, equip: 'auto', rarity: 2 },
    next: 'main3',
  },
  main3: {
    id: 'main3', name: '도적왕', main: true, giver: 'captain', autoAccept: true,
    offer: [],
    stages: [
      { k: 'flag', flag: 'king_dead', text: '도적단 요새의 도적왕 가르토 처치' },
      { k: 'talk', npc: 'elder', text: '촌장 오스윈에게 보고' },
    ],
    done: [
      '가르토를 쓰러뜨렸다고? 그리고 이것이... 왕관의 조각!',
      '조각에 새겨진 문양은 엘프의 것일세. 왕관의 나머지는 실바넬 숲 어딘가에 있을 거야.',
      '...그런데 자네가 요새에 있던 사이, 남동쪽 평원에 붉은 균열이 열렸다네. 북쪽 마족의 군세가 움직인다는 징조야.',
    ],
    reward: { xp: 900, gold: 400, soul: 5, equip: 'auto', rarity: 3, flag: 'ch1_clear' },
    next: 'main4',
  },
  main4: {
    id: 'main4', name: '균열의 그림자', main: true, giver: 'elder', autoAccept: true,
    offer: [],
    stages: [{ k: 'flag', flag: 'vargon_dead', text: '균열의 틈에서 선봉장 바르곤 처치' }, { k: 'talk', npc: 'elder', text: '촌장에게 보고' }],
    done: ['균열이 닫혔군! 자네는 이 변경의 영웅일세.', '하지만 마족은 다시 올 걸세. 실바넬 숲으로 향할 준비를 하게. (2장은 다음 업데이트에서!)'],
    reward: { xp: 1500, gold: 800, soul: 10, equip: 'auto', rarity: 4 },
  },
  // ── 서브 ──
  smith_hides: {
    id: 'smith_hides', name: '대장간의 가죽', giver: 'smith',
    offer: ['어이, 손이 비면 평원의 멧돼지 가죽 다섯 장만 구해다 주게.', '갑옷 안감이 다 떨어졌거든. 대가로 영혼석을 주지.'],
    stages: [{ k: 'collect', mat: 'hide', n: 5, text: '멧돼지 가죽 모으기' }, { k: 'talk', npc: 'smith', text: '대장장이 브론에게 전달' }],
    done: ['좋은 가죽이군! 약속한 영혼석이다. 강화할 때 쓰게.'],
    reward: { xp: 150, gold: 40, soul: 3 },
  },
  alch_silk: {
    id: 'alch_silk', name: '거미줄 실험', giver: 'alchemist',
    offer: ['거대 거미의 비단에는 마력을 붙잡는 성질이 있어요.', '네 묶음만 가져다주실래요? 실험에 성공하면 포션을 나눠 드릴게요.'],
    stages: [{ k: 'collect', mat: 'silk', n: 4, text: '거미 비단 모으기' }, { k: 'talk', npc: 'alchemist', text: '연금술사 리엘에게 전달' }],
    done: ['완벽해요! 이건 제가 만든 큰 포션들이에요.'],
    reward: { xp: 160, gold: 30, items: [['hp_l', 3], ['mp_l', 3]] },
  },
  priest_undead: {
    id: 'priest_undead', name: '잠들지 못한 자들', giver: 'priest',
    offer: ['북서쪽 지하 묘지에서 죽은 자들이 깨어나고 있습니다.', '그들에게 안식을 주십시오. 언데드 열 구면 충분할 겁니다.'],
    stages: [{ k: 'kill', enemy: ['skelet', 'zombie', 'tiny_zombie', 'necromancer'], n: 10, text: '언데드 처치' }, { k: 'talk', npc: 'priest', text: '신관 마렌에게 보고' }],
    done: ['그들의 영혼이 편히 쉬기를. 신의 가호가 함께하길 빕니다.'],
    reward: { xp: 300, gold: 80, equip: 'sapphire_amulet', rarity: 2 },
  },
  // ── 종족 전용 ──
  race_human: {
    id: 'race_human', name: '왕도의 소식', giver: 'captain', race: 'human',
    offer: ['같은 왕국 사람이라 하는 말인데, 왕도로 가는 상단이 산적에게 계속 털리고 있다.', '평원 동쪽 산적 여섯만 처리해 다오. 왕도에 자네 이름을 올려 두지.'],
    stages: [{ k: 'kill', enemy: ['bandit', 'bandit_archer'], n: 6, text: '산적 처치' }, { k: 'talk', npc: 'captain', text: '레아에게 보고' }],
    done: ['왕도 기사단에 자네 이름을 추천해 두었다. 이건 경비대 보급품이다.'],
    reward: { xp: 250, gold: 120, items: [['meat', 3], ['hp_l', 2]] },
  },
  race_elf: {
    id: 'race_elf', name: '숲의 메아리', giver: 'alchemist', race: 'elf',
    offer: ['동족을 만나니 반가워요. 실바넬의 정령들이 평원의 거미들 때문에 울고 있어요.', '거미 여섯 마리를 쫓아 주세요. 숲이 당신을 기억할 거예요.'],
    stages: [{ k: 'kill', enemy: 'spider', n: 6, text: '거대 거미 처치' }, { k: 'talk', npc: 'alchemist', text: '리엘에게 보고' }],
    done: ['숲의 정령이 감사의 노래를 불러요. 이 반지를 받아 주세요.'],
    reward: { xp: 250, gold: 60, equip: 'emerald_ring', rarity: 2 },
  },
  race_dwarf: {
    id: 'race_dwarf', name: '광맥의 약탈자', giver: 'smith', race: 'dwarf',
    offer: ['아이언후드 동포여! 고블린 놈들이 우리 광맥 지도를 훔쳐 갔다네.', '평원의 고블린 여섯을 혼내 주게. 우리 대장간 할인은 덤이야.'],
    stages: [{ k: 'kill', enemy: 'goblin', n: 6, text: '고블린 약탈자 처치' }, { k: 'talk', npc: 'smith', text: '브론에게 보고' }],
    done: ['역시 아이언후드의 피! 내가 직접 두드린 투구다. 받아 두게.'],
    reward: { xp: 250, gold: 60, soul: 2, equip: 'iron_helm', rarity: 2 },
  },
  race_orc: {
    id: 'race_orc', name: '피의 결투', giver: 'merchant', race: 'orc',
    offer: ['쉬쉬, 오크 손님. 이 마을 경비대는 당신을 경계하지만 난 장사꾼이라 상관없지.', '평원의 도적단 광전사가 붉은 평원 투기장 출신이라던데... 결투로 이기면 투기장에서 이름을 알아줄 거야.'],
    stages: [{ k: 'kill', enemy: 'masked_orc', n: 1, text: '도적단 광전사와 결투' }, { k: 'talk', npc: 'merchant', text: '시스에게 보고' }],
    done: ['크크, 투기장 소문이 벌써 여기까지 왔어! 이건 승자의 몫이야.'],
    reward: { xp: 250, gold: 150, equip: 'ruby_ring', rarity: 2 },
  },
  race_demon: {
    id: 'race_demon', name: '어둠의 속삭임', giver: 'stranger', race: 'demon',
    offer: ['...같은 피의 냄새가 나는군. 인간들 틈에서 고생이 많겠어.', '지하 묘지의 오래된 뼈 여섯 개를 가져와. 균열을 여는 의식에 필요하니까. 대가는 섭섭지 않게 주지.'],
    stages: [{ k: 'collect', mat: 'bone', n: 6, text: '오래된 뼈 모으기' }, { k: 'talk', npc: 'stranger', text: '방랑자에게 전달' }],
    done: ['좋아. 이 목걸이는 마계의 계약자에게만 응답하지. 균열이 열리면... 너도 부름을 듣게 될 거다.'],
    reward: { xp: 250, gold: 80, soul: 3, equip: 'royal_amulet', rarity: 2 },
  },
};

/** 종족에 따라 달라지는 인사말 */
export function greeting(npc: string, race: RaceId, flags: Record<string, unknown>): string {
  const g: Record<string, Partial<Record<RaceId | 'any', string>>> = {
    elder: {
      any: '하스벨은 작은 마을이지만 인심은 좋다네. 무엇을 도와줄까?',
      orc: '오크 친구여, 마을 사람들이 수군대도 신경 쓰지 말게. 자네가 늑대를 몰아낸 걸 다들 봤으니까.',
      demon: '...마족이라. 솔직히 마음이 편치는 않네. 하지만 자네의 행동이 말해 주겠지.',
    },
    captain: {
      any: '경비대는 평원 동쪽을 지키고 있다. 무슨 일이지?',
      orc: '오크로군. 수상한 짓 하면 바로 칼을 뽑을 거다. ...일은 제대로 하는 것 같지만.',
      human: '왕국 사람이군! 요즘 같은 때에 반갑다.',
      demon: '마족이 왜 여기를 어슬렁거리지? ...촌장님이 보증했으니 이번만 넘어가지.',
    },
    smith: {
      any: '망치 소리 들리지? 장비를 강화하려면 말만 하게.',
      dwarf: '오오, 아이언후드의 동포! 자네에게는 15% 깎아 주지.',
      elf: '엘프로군... 흥, 나무나 껴안는 족속에게는 값을 좀 더 받아야겠어.',
    },
    merchant: { any: '쉬익, 좋은 물건 많아. 구경해.', demon: '마족 손님은 위험 수당이 붙어. 10% 더 내.' },
    alchemist: { any: '포션이 필요하신가요?', elf: '실바넬의 향기가 나네요. 동족에게는 할인해 드릴게요.' },
    priest: { any: '신의 빛이 함께하길. 상처를 치료하고 여정을 기록해 드리지요.', demon: '...마족이여, 성소에서 어둠을 숨기십시오. 그래도 치유는 베풀겠습니다. 그것이 신의 뜻이니.' },
    stranger: { any: '...볼일 없으면 가.', demon: '같은 피로군. 가까이 와.' },
    villager1: { any: '요즘 밤마다 평원에서 늑대 울음소리가 들려요.', orc: '히익, 오, 오크다...! 아, 아니에요, 안녕하세요!' },
    villager2: { any: '왕관이 사라진 뒤로 장사가 안 돼요. 왕도 가는 길에 산적이 들끓어서요.' },
    villager3: { any: '형아/누나 모험가야? 나도 크면 도적왕을 혼내 줄 거야!' },
  };
  if (flags['ch1_clear'] && npc.startsWith('villager')) return '영웅님이다! 도적왕을 쓰러뜨렸다면서요?';
  const t = g[npc];
  if (!t) return '...';
  return t[race] ?? t.any ?? '...';
}

/** 종족·상인별 가격 배율 (기획서 3.1) */
export function priceMul(npc: string, race: RaceId): number {
  if (npc === 'smith') return race === 'dwarf' ? 0.85 : race === 'elf' ? 1.15 : 1;
  if (npc === 'merchant') return race === 'demon' ? 1.1 : 1;
  if (npc === 'alchemist') return race === 'elf' ? 0.9 : 1;
  return 1;
}
