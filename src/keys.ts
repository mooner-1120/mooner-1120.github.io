// 키 설정: 동작 → 키(KeyboardEvent.code). 설정 창에서 바꾸고 브라우저에 저장한다.

export type ActionId =
  | 'up' | 'down' | 'left' | 'right'
  | 'attack' | 'nextTarget' | 'roll'
  | 'skill1' | 'skill2' | 'skill3' | 'skill4' | 'race'
  | 'item1' | 'item2' | 'item3'
  | 'interact' | 'stop'
  | 'inv' | 'stat' | 'skillWin' | 'quest';

export const ACTIONS: { id: ActionId; label: string; group: string; def: string }[] = [
  { id: 'up', label: '위로 이동', group: '이동', def: 'ArrowUp' },
  { id: 'down', label: '아래로 이동', group: '이동', def: 'ArrowDown' },
  { id: 'left', label: '왼쪽으로 이동', group: '이동', def: 'ArrowLeft' },
  { id: 'right', label: '오른쪽으로 이동', group: '이동', def: 'ArrowRight' },
  { id: 'attack', label: '기본 공격 (인식한 적)', group: '전투', def: 'KeyA' },
  { id: 'nextTarget', label: '다른 적 인식', group: '전투', def: 'Tab' },
  { id: 'roll', label: '회피 구르기', group: '전투', def: 'Space' },
  { id: 'skill1', label: '스킬 1', group: '전투', def: 'KeyQ' },
  { id: 'skill2', label: '스킬 2', group: '전투', def: 'KeyW' },
  { id: 'skill3', label: '스킬 3', group: '전투', def: 'KeyE' },
  { id: 'skill4', label: '스킬 4', group: '전투', def: 'KeyR' },
  { id: 'race', label: '종족 스킬', group: '전투', def: 'KeyT' },
  { id: 'item1', label: '퀵슬롯 1', group: '아이템', def: 'Digit1' },
  { id: 'item2', label: '퀵슬롯 2', group: '아이템', def: 'Digit2' },
  { id: 'item3', label: '퀵슬롯 3', group: '아이템', def: 'Digit3' },
  { id: 'interact', label: '상호작용 (대화·상자)', group: '기타', def: 'KeyF' },
  { id: 'stop', label: '멈추기', group: '기타', def: 'KeyS' },
  { id: 'inv', label: '가방 열기', group: '창', def: 'KeyI' },
  { id: 'stat', label: '능력치 창', group: '창', def: 'KeyC' },
  { id: 'skillWin', label: '스킬 창', group: '창', def: 'KeyK' },
  { id: 'quest', label: '퀘스트 창', group: '창', def: 'KeyJ' },
];

export const settings = {
  keys: Object.fromEntries(ACTIONS.map((a) => [a.id, a.def])) as Record<ActionId, string>,
  autoTarget: true, // 가까운 적 자동 인식
};

const STORE = 'ashen_crown_keys';

export function loadKeys(): void {
  try {
    const s = JSON.parse(localStorage.getItem(STORE) ?? 'null');
    if (s?.keys) for (const a of ACTIONS) if (typeof s.keys[a.id] === 'string') settings.keys[a.id] = s.keys[a.id];
    if (typeof s?.autoTarget === 'boolean') settings.autoTarget = s.autoTarget;
  } catch { /* 저장소를 못 쓰면 기본값 */ }
}

export function saveKeys(): void {
  try { localStorage.setItem(STORE, JSON.stringify(settings)); } catch { /* */ }
}

export function resetKeys(): void {
  for (const a of ACTIONS) settings.keys[a.id] = a.def;
  settings.autoTarget = true;
  saveKeys();
}

/** 키 하나를 동작에 묶는다. 다른 동작이 쓰던 키면 서로 맞바꾼다. */
export function bind(id: ActionId, code: string): ActionId | null {
  const old = settings.keys[id];
  let swapped: ActionId | null = null;
  for (const a of ACTIONS) if (a.id !== id && settings.keys[a.id] === code) { settings.keys[a.id] = old; swapped = a.id; }
  settings.keys[id] = code;
  saveKeys();
  return swapped;
}

export function actionFor(code: string): ActionId | null {
  for (const a of ACTIONS) if (settings.keys[a.id] === code) return a.id;
  return null;
}

/** 이 키들은 브라우저 기본 동작(스크롤, 포커스 이동)을 막는다 */
export function shouldPrevent(code: string): boolean {
  return code === 'Tab' || code === 'Space' || code.startsWith('Arrow');
}

export function keyLabel(code: string): string {
  if (!code) return '없음';
  if (code.startsWith('Key')) return code.slice(3);
  if (code.startsWith('Digit')) return code.slice(5);
  if (code.startsWith('Numpad')) return 'Num' + code.slice(6);
  const m: Record<string, string> = {
    ArrowUp: '↑', ArrowDown: '↓', ArrowLeft: '←', ArrowRight: '→', Space: 'Space', Tab: 'Tab', Enter: 'Enter',
    ShiftLeft: 'L-Shift', ShiftRight: 'R-Shift', ControlLeft: 'L-Ctrl', ControlRight: 'R-Ctrl', AltLeft: 'L-Alt', AltRight: 'R-Alt',
    Backquote: '`', Minus: '-', Equal: '=', BracketLeft: '[', BracketRight: ']', Backslash: '\\', Semicolon: ';', Quote: "'",
    Comma: ',', Period: '.', Slash: '/', CapsLock: 'Caps', Backspace: 'Back',
  };
  return m[code] ?? code;
}

export function keyOf(id: ActionId): string {
  return keyLabel(settings.keys[id]);
}
