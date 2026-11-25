// 시작: 타이틀 → 세이브 슬롯 → 캐릭터 생성(종족 → 클래스 → 외형 → 이름) → 게임
import './style.css';
import { anim, iconURL, loadAssets } from './assets';
import { music, sfx, unlockAudio } from './audio';
import { CLASSES, ClassId, RACES, RaceId, STAT_NAMES, StatKey, BASE_BY_ID } from './data';
import { Game } from './game';
import { newHero } from './items';
import { QUESTS } from './quests';
import { HOME, MAP_NAME } from './homes';
import { deleteSlot, fmtTime, HELP_HTML, loadSettings, loadSlot, SKILL_ICONS, RACE_ICONS, UI } from './ui';

const app = document.getElementById('app')!;
app.innerHTML = `<canvas id="game"></canvas><div id="ui"></div><div id="loading">불러오는 중…</div>`;

const MAPS = MAP_NAME;

let ui: UI;
let game: Game;

async function boot() {
  await loadAssets();
  loadSettings();
  document.getElementById('loading')!.remove();
  ui = new UI(document.getElementById('ui')!);
  game = new Game(document.getElementById('game') as HTMLCanvasElement, ui);
  ui.g = game;
  (window as any).__game = game;
  ui.onQuit = () => { game.stop(); document.getElementById('hud')!.classList.add('hidden'); title(); };
  title();
}

const screen = () => document.getElementById('screen')!;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const img = (n: string, s = 2, cls = '') => `<img class="px ${cls}" src="${iconURL(n, s)}" alt="">`;

/** 스프라이트 애니메이션 <img> 들을 돌려 준다 */
let animTimer = 0;
function animateSprites(root: HTMLElement) {
  clearInterval(animTimer);
  let f = 0;
  animTimer = window.setInterval(() => {
    f++;
    root.querySelectorAll<HTMLImageElement>('img[data-anim]').forEach((el) => {
      const [base, kind, sc] = el.dataset.anim!.split('|');
      const fr = anim(base, kind);
      if (fr.length) el.src = iconURL(fr[f % fr.length], +sc);
    });
  }, 140);
}
const animImg = (base: string, kind = 'idle', s = 4, cls = '') => `<img class="px ${cls}" data-anim="${base}|${kind}|${s}" src="${iconURL(anim(base, kind)[0] ?? base, s)}" alt="">`;

function title() {
  music('title');
  const lineup = ['human_m', 'elf_f', 'dwarf_m', 'orc_m', 'demon_f'];
  const foes = ['wolf', 'skelet', 'bandit', 'big_demon', 'spider'];
  screen().className = 'on title';
  screen().innerHTML = `
    <div class="titlebg"></div>
    <div class="tcenter">
      <div class="logo"><span class="en">ASHEN CROWN</span><span class="ko">잿빛 왕관</span></div>
      <div class="tag">몰락한 왕국의 왕관을 둘러싼 픽셀 액션 RPG</div>
      <div class="lineup">${lineup.map((b) => animImg(b, 'idle', 4)).join('')}</div>
      <div class="foes">${foes.map((b) => animImg(b, 'run', 3, 'flip')).join('')}</div>
      <div class="tbtns">
        <button class="btn big" id="tNew">새 게임</button>
        <button class="btn big" id="tLoad">이어하기</button>
        <button class="btn" id="tHelp">조작법</button>
      </div>
      <div class="credit">그래픽: 0x72 DungeonTileset II (CC0) + 같은 스타일로 직접 그린 스프라이트 · 글꼴: Galmuri (OFL)</div>
    </div>`;
  animateSprites(screen());
  const go = (fn: () => void) => () => { unlockAudio(); music('title'); sfx('ui'); fn(); };
  document.getElementById('tNew')!.onclick = go(() => slots('new'));
  document.getElementById('tLoad')!.onclick = go(() => slots('load'));
  document.getElementById('tHelp')!.onclick = go(help);
}

function help() {
  screen().className = 'on';
  screen().innerHTML = `<div class="panel center help2"><h2>조작법</h2>${HELP_HTML}<button class="btn big" id="back">돌아가기</button></div>`;
  document.getElementById('back')!.onclick = () => { sfx('ui'); title(); };
}

function slots(mode: 'new' | 'load') {
  screen().className = 'on';
  const rows = [0, 1, 2].map((i) => {
    const s = loadSlot(i);
    if (!s) return `<div class="slotrow empty" data-i="${i}"><b>슬롯 ${i + 1}</b><span class="dim">비어 있음</span></div>`;
    const h = s.hero;
    return `<div class="slotrow" data-i="${i}">${img(RACES[h.race].bodies[h.gender] + '_idle_anim_f0', 3)}
      <div><b>슬롯 ${i + 1} · ${esc(h.name)}</b><br>Lv.${h.level} ${RACES[h.race].name} ${CLASSES[h.cls].name}<br><span class="dim">${MAPS[h.map] ?? ''} · ${fmtTime(h.playtime)} · ${new Date(s.t).toLocaleString('ko-KR')}</span></div>
      <button class="btn sm del" data-d="${i}">삭제</button></div>`;
  }).join('');
  screen().innerHTML = `<div class="panel center slots"><h2>${mode === 'new' ? '새 게임 — 슬롯 선택' : '이어하기'}</h2>${rows}<button class="btn" id="back">돌아가기</button></div>`;
  document.getElementById('back')!.onclick = () => { sfx('ui'); title(); };
  const ask = (el: HTMLElement, msg: string, yes: () => void) => {
    el.onclick = null;
    el.innerHTML = `<div><b>${msg}</b></div><button class="btn sm" data-y>예</button><button class="btn sm" data-n>아니오</button>`;
    (el.querySelector('[data-y]') as HTMLElement).onclick = (ev) => { ev.stopPropagation(); sfx('ui'); yes(); };
    (el.querySelector('[data-n]') as HTMLElement).onclick = (ev) => { ev.stopPropagation(); sfx('ui'); slots(mode); };
  };
  screen().querySelectorAll<HTMLElement>('.slotrow').forEach((el) => (el.onclick = (ev) => {
    if ((ev.target as HTMLElement).dataset.d) return;
    const i = +el.dataset.i!;
    const s = loadSlot(i);
    sfx('ui');
    if (mode === 'load') { if (s) startGame(i, s.hero); return; }
    if (s) ask(el, `슬롯 ${i + 1}의 ${esc(s.hero.name)}을(를) 지우고 새로 시작할까요?`, () => create(i));
    else create(i);
  }));
  screen().querySelectorAll<HTMLElement>('[data-d]').forEach((b) => (b.onclick = (ev) => {
    ev.stopPropagation();
    const i = +b.dataset.d!;
    ask(b.closest('.slotrow') as HTMLElement, `슬롯 ${i + 1}을(를) 삭제할까요?`, () => { deleteSlot(i); slots(mode); });
  }));
}

function create(slot: number) {
  const st = { step: 0, race: 'human' as RaceId, cls: 'warrior' as ClassId, gender: 'm' as 'm' | 'f', name: '' };
  const render = () => {
    const steps = ['종족', '클래스', '외형', '이름'];
    let body = '';
    if (st.step === 0) {
      body = `<div class="cards">${(Object.keys(RACES) as RaceId[]).map((r) => {
        const d = RACES[r];
        const mods = (Object.entries(d.mods) as [StatKey, number][]).map(([k, v]) => `<span class="${v > 0 ? 'up' : 'down'}">${STAT_NAMES[k]} ${v > 0 ? '+' : ''}${v}</span>`).join(' ');
        return `<div class="card ${st.race === r ? 'sel' : ''}" data-r="${r}">${animImg(d.bodies[st.gender], 'idle', 4)}<h3>${d.name}</h3><div class="dim">${d.concept}</div><div class="home">시작: ${HOME[r].name}</div><div class="mods">${mods}</div>
          <div class="pas"><b>${d.passive.name}</b><br>${d.passive.desc}</div><div class="pas">${img(RACE_ICONS[r], 1)} <b>${d.active.name}</b><br>${d.active.desc}</div></div>`;
      }).join('')}</div>`;
    } else if (st.step === 1) {
      body = `<div class="cards">${(Object.keys(CLASSES) as ClassId[]).map((c) => {
        const d = CLASSES[c];
        const w = BASE_BY_ID[d.weapons[0]];
        return `<div class="card ${st.cls === c ? 'sel' : ''}" data-c="${c}"><div class="cw">${animImg(RACES[st.race].bodies[st.gender], 'idle', 3)}${img(w.icon, 3)}</div><h3>${d.name}</h3><div class="dim">${d.role}</div><div class="small">${d.style}</div>
          <div class="sks">${d.skills.map((s) => `<div>${img(SKILL_ICONS[s.id], 1)} <b>${s.key}</b> ${s.name}</div>`).join('')}</div>
          <div class="small dim">주 능력치: ${d.main.map((k) => STAT_NAMES[k]).join(', ')}</div></div>`;
      }).join('')}</div>`;
    } else if (st.step === 2) {
      body = `<div class="cards two">${(['m', 'f'] as const).map((g) => `<div class="card ${st.gender === g ? 'sel' : ''}" data-g="${g}">${animImg(RACES[st.race].bodies[g], 'idle', 6)}${animImg(RACES[st.race].bodies[g], 'run', 6)}<h3>${g === 'm' ? '외형 A (남)' : '외형 B (여)'}</h3></div>`).join('')}</div>`;
    } else {
      const r = RACES[st.race], c = CLASSES[st.cls];
      const base = { ...c.base };
      for (const k of Object.keys(base) as StatKey[]) base[k] += r.mods[k] ?? 0;
      body = `<div class="final">
        <div class="cw big">${animImg(r.bodies[st.gender], 'idle', 6)}${img(BASE_BY_ID[c.weapons[0]].icon, 6)}</div>
        <div><h3>${r.name} ${c.name}</h3>
          <div class="statline">${(Object.keys(base) as StatKey[]).map((k) => `<span>${STAT_NAMES[k]} <b>${base[k]}</b></span>`).join('')}</div>
          <label class="nm">이름 <input id="nameIn" maxlength="10" value="${esc(st.name)}" placeholder="이름을 입력하세요"></label>
          <p class="dim small">종족에 따라 NPC의 대사, 상점 가격, 종족 전용 퀘스트가 달라집니다.</p></div></div>`;
    }
    screen().className = 'on';
    screen().innerHTML = `<div class="panel create">
      <div class="steps">${steps.map((s, i) => `<span class="${i === st.step ? 'on' : i < st.step ? 'done' : ''}">${i + 1}. ${s}</span>`).join('')}</div>
      ${body}
      <div class="nav"><button class="btn" id="prev">${st.step === 0 ? '취소' : '이전'}</button><button class="btn big" id="next">${st.step === 3 ? '모험 시작!' : '다음'}</button></div>
    </div>`;
    animateSprites(screen());
    const sel = (attr: string, fn: (v: string) => void) => screen().querySelectorAll<HTMLElement>(`[data-${attr}]`).forEach((el) => {
      el.onclick = () => { sfx('ui'); fn(el.dataset[attr]!); render(); };
      el.ondblclick = () => { st.step++; render(); };
    });
    sel('r', (v) => (st.race = v as RaceId));
    sel('c', (v) => (st.cls = v as ClassId));
    sel('g', (v) => (st.gender = v as 'm' | 'f'));
    const nameIn = document.getElementById('nameIn') as HTMLInputElement | null;
    if (nameIn) {
      nameIn.oninput = () => (st.name = nameIn.value);
      nameIn.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('next')!.click(); };
      setTimeout(() => nameIn.focus(), 50);
    }
    document.getElementById('prev')!.onclick = () => { sfx('ui'); if (st.step === 0) slots('new'); else { st.step--; render(); } };
    document.getElementById('next')!.onclick = () => {
      sfx('ui');
      if (st.step < 3) { st.step++; render(); return; }
      const name = st.name.trim() || ({ human: '아서', elf: '실리안', dwarf: '브롬', orc: '그롬', demon: '아자젤' } as Record<RaceId, string>)[st.race];
      startGame(slot, newHero(name, st.race, st.cls, st.gender));
    };
  };
  render();
}

function startGame(slot: number, hero: ReturnType<typeof newHero>) {
  clearInterval(animTimer);
  screen().className = '';
  screen().innerHTML = '';
  ui.slot = slot;
  game.start(hero);
  ui.attach(game);
  if (!hero.flags.intro) {
    hero.flags.intro = true;
    const leader = game.npcs.find((n) => n.id === HOME[hero.race].leader);
    const lines = QUESTS.main1.offerByRace?.[hero.race] ?? QUESTS.main1.offer;
    if (leader) setTimeout(() => ui.showTalk(leader, lines, () => ui.closeModal()), 900);
  }
  ui.save();
}

boot().catch((e) => {
  console.error(e);
  document.getElementById('loading')!.textContent = '불러오기 실패: ' + e;
});
