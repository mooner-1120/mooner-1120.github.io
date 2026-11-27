// 설정 창: 키 바꾸기, 키보드 전투 보조, 음량
import { setVolumes, sfx, volume } from './audio';
import { ACTIONS, ActionId, bind, keyLabel, keyOf, resetKeys, saveKeys, settings } from './keys';

let capturing: ActionId | null = null;
let rerender: (() => void) | null = null;
let notice = '';

// 키 입력 대기 중에는 다른 곳(게임·메뉴)으로 키가 가지 않게 가장 먼저 가로챈다
window.addEventListener(
  'keydown',
  (e) => {
    if (!capturing) return;
    e.preventDefault();
    e.stopImmediatePropagation();
    if (e.code === 'Escape') {
      capturing = null;
      notice = '';
    } else {
      const id = capturing;
      capturing = null;
      const swapped = bind(id, e.code);
      const name = ACTIONS.find((a) => a.id === id)!.label;
      notice = swapped
        ? `'${name}'을(를) ${keyLabel(e.code)}로 바꿨습니다. 원래 이 키를 쓰던 '${ACTIONS.find((a) => a.id === swapped)!.label}'은(는) ${keyOf(swapped)}로 맞바꿨습니다.`
        : `'${name}'을(를) ${keyLabel(e.code)}로 바꿨습니다.`;
      sfx('ui');
    }
    rerender?.();
  },
  true,
);

export function settingsOpen(): boolean {
  return capturing !== null;
}

/** el 안에 설정 화면을 그린다. onChange 는 키가 바뀌었을 때(스킬바 글자 갱신 등) */
export function renderSettings(el: HTMLElement, onClose: () => void, onChange: () => void = () => {}): void {
  rerender = () => { renderSettings(el, onClose, onChange); onChange(); };
  const groups = [...new Set(ACTIONS.map((a) => a.group))];
  el.innerHTML = `
    <div class="panel settings">
      <div class="tabs"><span class="ttl">설정</span><button class="x" id="setClose">✕</button></div>
      <div class="mbody">
        <section>
          <h4>조작</h4>
          <label class="chk"><input type="checkbox" id="setAuto" ${settings.autoTarget ? 'checked' : ''}> 가까운 적 자동 인식 <span class="dim small">(키보드 전투용 — 공격 키를 누르면 인식한 적을 공격)</span></label>
          <p class="dim small">마우스 조작은 그대로 쓸 수 있습니다. 바꾸고 싶은 키 버튼을 누른 뒤 새 키를 누르세요. 이미 쓰는 키를 고르면 두 동작의 키를 맞바꿉니다. 취소는 Esc.</p>
          ${notice ? `<p class="notice">${notice}</p>` : ''}
          <div class="keygrid">
            ${groups.map((g) => `<div class="kgroup"><div class="kg">${g}</div>${ACTIONS.filter((a) => a.group === g).map((a) => `
              <div class="krow"><span>${a.label}</span><button class="btn keybtn ${capturing === a.id ? 'wait' : ''}" data-k="${a.id}">${capturing === a.id ? '키를 누르세요…' : keyOf(a.id)}</button></div>`).join('')}</div>`).join('')}
          </div>
          <div class="krow fixed"><span>메뉴 / 창 닫기</span><b>Esc (고정)</b></div>
          <button class="btn" id="setReset">키 설정 기본값으로</button>
        </section>
        <section>
          <h4>소리</h4>
          <div class="vol"><label>효과음 <input type="range" id="vS" min="0" max="1" step="0.05" value="${volume.sfx}"></label>
          <label>배경음 <input type="range" id="vM" min="0" max="1" step="0.05" value="${volume.music}"></label></div>
        </section>
      </div>
    </div>`;
  const $ = (s: string) => el.querySelector(s) as HTMLElement;
  $('#setClose').onclick = () => { capturing = null; notice = ''; rerender = null; sfx('ui'); onClose(); };
  ($('#setAuto') as HTMLInputElement).onchange = (e) => { settings.autoTarget = (e.target as HTMLInputElement).checked; saveKeys(); };
  $('#setReset').onclick = () => { resetKeys(); notice = '키 설정을 기본값으로 되돌렸습니다.'; sfx('ui'); rerender?.(); };
  el.querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) => (b.onclick = () => {
    sfx('ui');
    capturing = b.dataset.k as ActionId;
    notice = '';
    rerender?.();
  }));
  const vol = () => {
    setVolumes(+($('#vS') as HTMLInputElement).value, +($('#vM') as HTMLInputElement).value);
    try { localStorage.setItem('ashen_crown_settings', JSON.stringify(volume)); } catch { /* */ }
  };
  $('#vS').oninput = vol;
  $('#vM').oninput = vol;
}

/** 지금 키 설정으로 만든 조작법 표 */
export function helpHtml(): string {
  const k = keyOf;
  return `
  <table class="keys">
    <tr><td>좌클릭 (바닥)</td><td>이동 (누르고 있으면 커서 방향으로 계속)</td></tr>
    <tr><td>좌클릭 (적 근처)</td><td>추적 + 기본 공격 자동 반복</td></tr>
    <tr><td>좌클릭 (NPC/상자/출구)</td><td>대화 / 열기 / 이동</td></tr>
    <tr><td>${k('up')} ${k('down')} ${k('left')} ${k('right')}</td><td>키보드 이동</td></tr>
    <tr><td>${k('attack')}</td><td>가장 가까운 적 공격 (청록 표시)</td></tr>
    <tr><td>${k('nextTarget')}</td><td>다른 적 고르기 (고른 적은 쓰러뜨릴 때까지 유지)</td></tr>
    <tr><td>${k('roll')}</td><td>회피 구르기 (무적 0.2초)</td></tr>
    <tr><td>${k('skill1')} ${k('skill2')} ${k('skill3')} ${k('skill4')}</td><td>클래스 스킬 (마우스면 커서, 키보드면 인식한 적)</td></tr>
    <tr><td>${k('race')}</td><td>종족 스킬</td></tr>
    <tr><td>${k('item1')} ${k('item2')} ${k('item3')}</td><td>소모품 퀵슬롯</td></tr>
    <tr><td>${k('interact')}</td><td>상호작용 (NPC, 상자, 여신상)</td></tr>
    <tr><td>${k('inv')} · ${k('stat')} · ${k('skillWin')} · ${k('quest')}</td><td>가방 · 능력치 · 스킬 · 퀘스트</td></tr>
    <tr><td>${k('stop')} / Esc</td><td>멈추기 / 메뉴</td></tr>
  </table>
  <p class="dim small">키는 설정에서 바꿀 수 있습니다. 빨간 범위 표시는 적의 공격 예고입니다. 구르기로 피하세요! 모바일: 화면을 탭해 이동·공격, 아래 버튼으로 스킬(가까운 적 자동 조준).</p>`;
}
