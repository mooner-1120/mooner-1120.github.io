// 종족별 고향 마을과 NPC가 어느 지역에 사는지
import { RaceId } from './data';

export const HOME: Record<RaceId, { map: string; leader: string; name: string }> = {
  human: { map: 'village', leader: 'elder', name: '하스벨 마을' },
  elf: { map: 'elfhome', leader: 'elf_leader', name: '실바넬 숲 마을' },
  dwarf: { map: 'dwarfhome', leader: 'dwarf_leader', name: '아이언후드 광산 마을' },
  orc: { map: 'orchome', leader: 'orc_leader', name: '붉은 평원 야영지' },
  demon: { map: 'demonhome', leader: 'demon_leader', name: '그림자 은신처' },
};

export const NPC_MAP: Record<string, string> = {
  elder: 'village', captain: 'village', smith: 'village', merchant: 'village', alchemist: 'village', priest: 'village', stranger: 'village',
  elf_leader: 'elfhome', elf_merchant: 'elfhome', elf_guard: 'elfhome',
  dwarf_leader: 'dwarfhome', dwarf_smith: 'dwarfhome', dwarf_miner: 'dwarfhome',
  orc_leader: 'orchome', orc_shaman: 'orchome', orc_arena: 'orchome',
  demon_leader: 'demonhome', imp_merchant: 'demonhome', demon_exile: 'demonhome',
};

export const NPC_NAME: Record<string, string> = {
  elder: '촌장 오스윈', captain: '경비대장 레아', smith: '대장장이 브론', merchant: '행상인 시스', alchemist: '연금술사 리엘', priest: '신관 마렌', stranger: '두건 쓴 방랑자',
  elf_leader: '숲의 장로 탈리온', elf_merchant: '약초상 미렐', elf_guard: '숲지기 아엘린',
  dwarf_leader: '광산 족장 브룸가르', dwarf_smith: '대장장이 헬가', dwarf_miner: '광부 토르비',
  orc_leader: '족장 우르가', orc_shaman: '주술사 모그', orc_arena: '투기장지기 크락',
  demon_leader: '계약자 모르가스', imp_merchant: '임프 상인 키키', demon_exile: '망명자 리스',
};

export const MAP_NAME: Record<string, string> = {
  village: '하스벨 마을', field: '솔라리온 평원', crypt: '지하 묘지', fort: '도적단 요새', rift: '균열의 틈',
  elfhome: '실바넬 숲 마을', dwarfhome: '아이언후드 광산 마을', orchome: '붉은 평원 야영지', demonhome: '그림자 은신처',
};

/** 이 NPC가 여는 상점 종류 */
export const SHOP_KIND: Record<string, 'potion' | 'general' | 'gear'> = {
  merchant: 'general', alchemist: 'potion', smith: 'gear',
  elf_merchant: 'potion', dwarf_smith: 'gear', orc_shaman: 'general', imp_merchant: 'general',
};
export const SHOP_TITLE: Record<string, string> = {
  merchant: '시스의 잡화점', alchemist: '리엘의 연금 공방', smith: '브론의 대장간',
  elf_merchant: '미렐의 약초 가게', dwarf_smith: '헬가의 대장간', orc_shaman: '모그의 주술 천막', imp_merchant: '키키의 수상한 좌판',
};
/** 강화를 해 주는 대장장이 */
export const SMITHS = new Set(['smith', 'dwarf_smith']);
/** 치료·저장을 해 주는 NPC */
export const HEALERS = new Set(['priest', 'elf_leader', 'dwarf_leader', 'orc_shaman', 'demon_leader']);

/** 'leader' 같은 역할 이름을 이 캐릭터의 실제 NPC로 */
export function resolveNpc(id: string, race: RaceId): string {
  return id === 'leader' ? HOME[race].leader : id;
}
