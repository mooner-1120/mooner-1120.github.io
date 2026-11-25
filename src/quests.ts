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
  offerByRace?: Partial<Record<RaceId, string[]>>;
  doneByRace?: Partial<Record<RaceId, string[]>>;
  stages: Objective[];
  done: string[]; // 완료 대사
  /** 대화 단계를 마칠 때 나오는 대사 (단계 번호 → 대사) */
  talks?: Record<number, string[]>;
  /** 대화 단계를 마치면 켜지는 플래그 */
  stageFlags?: Record<number, string>;
  reward: { xp: number; gold: number; soul?: number; items?: [string, number][]; equip?: string; rarity?: number; flag?: string };
  next?: string; // 끝나면 바로 이어 받는 퀘스트
  autoAccept?: boolean;
}

export const QUESTS: Record<string, QuestDef> = {
  main1: {
    id: 'main1', name: '변경의 늑대들', main: true, giver: 'leader', autoAccept: true,
    offer: [
      '오, 깨어났군. 쓰러진 자네를 우리 경비대가 평원에서 업어 왔다네.',
      '왕이 후계자 없이 죽고 왕관이 사라진 뒤로 아르카디아는 엉망이야. 이 변경 마을까지 늑대가 내려올 정도지.',
      '몸을 추스를 겸, 동쪽 평원의 늑대를 다섯 마리만 처치해 주겠나? 좌클릭으로 걷고, 적을 클릭하면 싸운다네.',
    ],
    offerByRace: {
      elf: [
        '깨어났구나, 젊은 숲의 아이야. 실바넬의 고목들이 불안하게 술렁이고 있다.',
        '왕관이 사라진 뒤로 남쪽 솔라리온 평원의 늑대들이 숲 가장자리까지 올라온단다.',
        '숲을 나서 평원의 늑대를 다섯 마리만 쫓아 다오. 좌클릭으로 걷고, 적을 클릭하면 싸운단다. 길은 금색 화살표가 알려 줄 거다.',
      ],
      dwarf: [
        '드디어 일어났군! 아이언후드의 망치는 오늘도 쉬지 않지.',
        '그런데 광산 입구 아래 솔라리온 평원에 늑대 떼가 들끓어서 광석 수레가 내려가질 못해.',
        '평원으로 내려가 늑대 다섯 마리를 혼내 주게. 좌클릭으로 걷고, 적을 클릭하면 싸우는 거야. 금색 화살표를 따라가게.',
      ],
      orc: [
        '일어났나, 전사. 붉은 평원의 피가 네 안에서 끓는 게 느껴진다.',
        '북쪽 인간들의 평원에 늑대가 날뛰어 우리 사냥감을 다 쫓아냈다. 우리 부족의 이름을 보여 줄 때다.',
        '늑대 다섯 마리의 머리를 가져와라. 좌클릭으로 걷고, 적을 클릭하면 싸운다. 금색 화살표가 사냥터를 가리킬 거다.',
      ],
      demon: [
        '...정신이 드나. 균열에서 떨어져 나온 우리 같은 자들은 이 은신처에 숨어 산다.',
        '인간들은 우리를 믿지 않아. 하지만 그들의 평원을 위협하는 늑대를 처치하면 이야기가 달라지겠지.',
        '북쪽 평원의 늑대 다섯 마리를 처치해. 좌클릭으로 걷고, 적을 클릭하면 싸운다. 금색 화살표를 따라가.',
      ],
    },
    stages: [
      { k: 'kill', enemy: 'wolf', n: 5, text: '평원의 늑대 처치' },
      { k: 'talk', npc: 'leader', text: '고향의 지도자에게 보고' },
    ],
    done: ['훌륭해! 자네 솜씨라면 믿고 맡길 일이 있네.', '경비대장 레아가 순찰대 일로 골머리를 앓고 있어. 마을 동쪽 길목에서 찾아가 보게.'],
    doneByRace: {
      elf: ['숲이 네 이름을 속삭이는구나. 이제 더 넓은 세상을 볼 때다.', '평원 서쪽 인간들의 하스벨 마을에 경비대장 레아가 있다. 사라진 순찰대 일로 도움을 청하고 있다더구나. 찾아가 보거라.'],
      dwarf: ['하하! 역시 아이언후드의 피야! 이제 수레가 다닐 수 있겠군.', '평원 서쪽 하스벨 마을의 경비대장 레아가 실력 있는 자를 찾는다더군. 가서 우리 드워프의 솜씨를 보여 주게.'],
      orc: ['좋다. 부족이 너를 인정한다.', '평원 서쪽 인간 마을 하스벨의 경비대장이 전사를 구한다더군. 가서 오크가 얼마나 강한지 보여 줘라.'],
      demon: ['...인간들 사이에 네 소문이 돌기 시작했다. 좋은 징조야.', '평원 서쪽 하스벨 마을의 경비대장 레아를 찾아가. 의심은 받겠지만, 그 마을에서 신뢰를 얻는 게 우리가 살 길이다.'],
    },
    reward: { xp: 120, gold: 60, items: [['hp_s', 3]] },
    next: 'main2',
  },
  main2: {
    id: 'main2', name: '사라진 순찰대', main: true, giver: 'leader', autoAccept: true,
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
    next: 'c2_1',
  },
  main4: {
    id: 'main4', name: '균열의 그림자', giver: 'elder', requires: 'main3',
    offer: ['남동쪽 평원에 열린 붉은 균열 말일세... 마족의 선봉대가 그 안에 진을 쳤다는군.', '실바넬로 떠나기 전이든 다녀온 뒤든 좋으니, 힘을 길러 균열의 선봉장을 처치해 주게. 만만한 상대가 아닐 걸세.'],
    stages: [{ k: 'flag', flag: 'vargon_dead', text: '균열의 틈에서 선봉장 바르곤 처치' }, { k: 'talk', npc: 'elder', text: '촌장에게 보고' }],
    done: ['균열이 닫혔군! 자네는 이 변경의 영웅일세.', '하지만 마족은 다시 올 걸세. 왕관을 모두 되찾기 전까지는 안심할 수 없어.'],
    reward: { xp: 1500, gold: 800, soul: 10, equip: 'auto', rarity: 4 },
  },
  // ── 2장: 엘프와의 맹약 ──
  c2_1: {
    id: 'c2_1', name: '썩어가는 숲', main: true, giver: 'elder', autoAccept: true,
    offer: [],
    stages: [
      { k: 'talk', npc: 'elf_leader', text: '실바넬 숲 마을의 장로 탈리온과 대화' },
      { k: 'kill', enemy: ['blight_wolf', 'swampy', 'muddy', 'slug', 'pumpkin_dude', 'forest_spirit'], n: 8, text: '썩은 숲의 괴물 처치' },
      { k: 'talk', npc: 'elf_guard', text: '숲지기 아엘린에게 보고' },
    ],
    talks: {
      0: [
        '...그래, 왕관의 조각을 가져왔구나. 이 문양은 틀림없이 실바넬의 것이다.',
        '천 년 전, 엘프는 솔라리온 왕에게 숲의 맹약을 맡겼다. 왕관의 한 조각이 바로 그 맹약의 증표지.',
        '왕관이 사라진 날부터 북쪽 숲이 썩기 시작했다. 맹약이 끊기자 숲의 정령이 미쳐 버린 거다.',
        '북쪽 숲길로 들어가 썩은 괴물들을 정리해 다오. 숲지기 아엘린이 숲의 상태를 살피고 있다.',
      ],
    },
    done: ['이렇게 많이... 고마워요. 하지만 썩음은 점점 깊어지고 있어요.', '숲 동쪽 늪가에서 드라이어드 한 명이 미쳐서 숲을 공격하고 있다는 소식이 있어요. 그녀가 썩음의 통로가 된 것 같아요.'],
    reward: { xp: 900, gold: 250, soul: 3 },
    next: 'c2_2',
  },
  c2_2: {
    id: 'c2_2', name: '미쳐 버린 드라이어드', main: true, giver: 'elf_guard', autoAccept: true,
    offer: [],
    stages: [
      { k: 'kill', enemy: 'dryad', n: 1, text: '썩은 숲 동쪽 늪가의 드라이어드 처치' },
      { k: 'talk', npc: 'elf_leader', text: '장로 탈리온에게 보고' },
    ],
    done: [
      '드라이어드를 잠재웠구나. 그녀도 피해자였을 뿐이다... 숲이 그녀를 다시 품어 줄 것이다.',
      '이제 근원을 쳐야 한다. 숲의 심장, 고목의 심장부에 타락한 정령 실바레스가 있다.',
      '심장부로 가는 길은 가시덩굴이 막고 있다. 정화 의식에는 숲정령의 정령석이 세 개 필요하다.',
    ],
    reward: { xp: 1000, gold: 300, equip: 'auto', rarity: 2 },
    next: 'c2_3',
  },
  c2_3: {
    id: 'c2_3', name: '정화의 의식', main: true, giver: 'elf_leader', autoAccept: true,
    offer: [],
    stages: [
      { k: 'collect', mat: 'spirit_stone', n: 3, text: '타락한 숲정령에게서 정령석 모으기' },
      { k: 'talk', npc: 'elf_leader', text: '장로 탈리온에게 정령석 전달' },
    ],
    stageFlags: { 1: 'grove_open' },
    done: [
      '(장로가 정령석을 하늘로 들어 올리자 푸른 빛이 숲 북쪽으로 뻗어 나간다)',
      '가시덩굴이 물러났다. 숲 가장 북쪽, 고목의 심장부로 가거라.',
      '실바레스는 원래 이 숲을 지키던 가장 오래된 정령이다. 부디... 그를 쉬게 해 다오.',
    ],
    reward: { xp: 900, gold: 300, items: [['hp_l', 3], ['mp_l', 3]] },
    next: 'c2_4',
  },
  c2_4: {
    id: 'c2_4', name: '엘프와의 맹약', main: true, giver: 'elf_leader', autoAccept: true,
    offer: [],
    stages: [
      { k: 'flag', flag: 'spirit_dead', text: '고목의 심장에서 타락한 정령 실바레스 처치' },
      { k: 'talk', npc: 'elf_leader', text: '장로 탈리온에게 보고' },
    ],
    done: [
      '숲이... 숨을 쉬는구나. 실바레스의 영혼도 이제 편히 잠들 것이다.',
      '실바넬은 오늘 너와 새로운 맹약을 맺는다. 이 두 번째 조각을 가져가거라.',
      '두 조각이 서로를 부르는 소리가 들리는가? 다음 조각은 아이언후드 산맥 깊은 곳, 드워프의 용광로 쪽을 가리키고 있다.',
    ],
    reward: { xp: 2500, gold: 1200, soul: 8, equip: 'auto', rarity: 4, flag: 'ch2_clear' },
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
    id: 'race_elf', name: '숲의 메아리', giver: 'elf_guard', race: 'elf',
    offer: ['실바넬의 정령들이 평원의 거미들 때문에 울고 있어요.', '거미 여섯 마리를 쫓아 주세요. 숲이 당신을 기억할 거예요.'],
    stages: [{ k: 'kill', enemy: 'spider', n: 6, text: '거대 거미 처치' }, { k: 'talk', npc: 'elf_guard', text: '숲지기 아엘린에게 보고' }],
    done: ['숲의 정령이 감사의 노래를 불러요. 이 반지를 받아 주세요.'],
    reward: { xp: 250, gold: 60, equip: 'emerald_ring', rarity: 2 },
  },
  race_dwarf: {
    id: 'race_dwarf', name: '광맥의 약탈자', giver: 'dwarf_miner', race: 'dwarf',
    offer: ['큰일이야! 고블린 놈들이 우리 광맥 지도를 훔쳐 갔어.', '평원의 고블린 여섯을 혼내 주게. 헬가 누님이 투구를 하나 두드려 줄 거야.'],
    stages: [{ k: 'kill', enemy: 'goblin', n: 6, text: '고블린 약탈자 처치' }, { k: 'talk', npc: 'dwarf_miner', text: '광부 토르비에게 보고' }],
    done: ['역시 아이언후드의 피! 내가 직접 두드린 투구다. 받아 두게.'],
    reward: { xp: 250, gold: 60, soul: 2, equip: 'iron_helm', rarity: 2 },
  },
  race_orc: {
    id: 'race_orc', name: '피의 결투', giver: 'orc_arena', race: 'orc',
    offer: ['투기장에서 도망친 배신자가 있다. 지금은 평원의 도적단에서 광전사 노릇을 하지.', '놈을 결투로 쓰러뜨려라. 그러면 투기장이 네 이름을 기억할 거다.'],
    stages: [{ k: 'kill', enemy: 'masked_orc', n: 1, text: '도적단 광전사와 결투' }, { k: 'talk', npc: 'orc_arena', text: '투기장지기 크락에게 보고' }],
    done: ['크하하! 투기장이 네 이름을 외친다! 이건 승자의 몫이다.'],
    reward: { xp: 250, gold: 150, equip: 'ruby_ring', rarity: 2 },
  },
  race_demon: {
    id: 'race_demon', name: '어둠의 속삭임', giver: 'demon_exile', race: 'demon',
    offer: ['...인간들 틈에서 고생이 많겠어.', '지하 묘지의 오래된 뼈 여섯 개를 가져와 줘. 균열을 엿보는 의식에 필요해. 대가는 섭섭지 않게 줄게.'],
    stages: [{ k: 'collect', mat: 'bone', n: 6, text: '오래된 뼈 모으기' }, { k: 'talk', npc: 'demon_exile', text: '망명자 리스에게 전달' }],
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
    elf_leader: { any: '실바넬에 온 것을 환영한다, 이방인. 숲을 해치지만 않는다면.', elf: '숲의 아이야, 지친 몸을 쉬어 가거라. 상처도 돌봐 주마.', dwarf: '...드워프로군. 도끼는 칼집에 넣어 두게. 이곳의 나무는 장작이 아니니.' },
    elf_merchant: { any: '숲에서 딴 약초로 만든 포션이에요.', elf: '동족에게는 언제나 할인이에요.', dwarf: '드워프 손님은... 음, 값을 조금 더 받을게요.' },
    elf_guard: { any: '숲길은 평원 쪽 남쪽으로 이어져요. 조심하세요.' },
    elf_villager: { any: '고목들이 밤마다 웅웅거려요. 왕관이 사라진 뒤로 계속 그래요.' },
    dwarf_leader: { any: '아이언후드에 온 걸 환영하네! 망치 소리가 시끄러워도 참게.', dwarf: '오오, 동포여! 쉬어 가게. 상처는 용광로 앞에서 금방 낫지.', elf: '엘프가 광산까지 다 오고... 세상 참 별일이군.' },
    dwarf_smith: { any: '무기든 갑옷이든 두드려 주지. 강화도 맡겨.', dwarf: '동포에겐 15% 깎아 주지!', elf: '엘프에게는... 흠, 15% 더 받겠네.' },
    dwarf_miner: { any: '광맥은 깊을수록 좋은 법이지. 평원 쪽 출구는 남쪽이야.' },
    orc_leader: { any: '붉은 평원에 발을 들였군. 약한 자는 여기서 오래 못 버틴다.', orc: '전사여, 쉬어라. 다친 곳은 모그가 고쳐 줄 거다.', human: '인간이군. 칼을 뽑지 않는다면 나도 뽑지 않겠다.' },
    orc_shaman: { any: '조상의 뼈가 말하길... 물건을 사 가라는구먼.', orc: '부족의 형제여, 영혼의 불로 상처를 태워 주마.' },
    orc_arena: { any: '투기장은 언제나 피를 원한다. 크하하!' },
    orc_villager: { any: '우르가 족장님은 부족을 통합하려고 하셔. 쉽지 않은 일이지.' },
    demon_leader: { any: '...이곳에 무슨 일이지. 길을 잃은 거라면 빨리 떠나라.', demon: '균열의 아이여, 상처를 보여라. 어둠이 치유해 줄 것이다.' },
    imp_merchant: { any: '키킥! 싸게 줄게, 진짜야! 아마도!', demon: '키킥, 동족 할인! 조금!' },
    demon_exile: { any: '우리도 그저 살고 싶을 뿐이야. 마왕의 군세와는 상관없어.' },
  };
  if (flags['ch1_clear'] && npc.startsWith('villager')) return '영웅님이다! 도적왕을 쓰러뜨렸다면서요?';
  const t = g[npc];
  if (!t) return '...';
  return t[race] ?? t.any ?? '...';
}

/** 종족·상인별 가격 배율 (기획서 3.1) */
export function priceMul(npc: string, race: RaceId): number {
  if (npc === 'elf_merchant') return race === 'elf' ? 0.85 : race === 'dwarf' ? 1.15 : 1;
  if (npc === 'dwarf_smith') return race === 'dwarf' ? 0.85 : race === 'elf' ? 1.15 : 1;
  if (npc === 'orc_shaman') return race === 'orc' ? 0.85 : race === 'human' ? 1.1 : 1;
  if (npc === 'imp_merchant') return race === 'demon' ? 0.9 : 1.2;
  if (npc === 'smith') return race === 'dwarf' ? 0.85 : race === 'elf' ? 1.15 : 1;
  if (npc === 'merchant') return race === 'demon' ? 1.1 : 1;
  if (npc === 'alchemist') return race === 'elf' ? 0.9 : 1;
  return 1;
}
