// DOM UI: HUD, 메뉴(장비/능력치/스킬/퀘스트), 대화, 상점, 대장간, 저장
import { sfx, setVolumes, volume } from './audio';
import { iconURL } from './assets';
import {
  BASE_ITEMS, CLASSES, CONSUMABLES, EquipSlot, MATERIALS, RACES, RARITY, SLOT_NAMES, STAT_NAMES, StatKey, xpToNext,
} from './data';
import { Enemy, NpcEnt, STATUS_COLORS, STATUS_NAMES, StatusId } from './entities';
import type { Game, UIHooks } from './game';
import {
  addToInv, baseOf, canEquip, countOf, Hero, InvEntry, itemName, itemPrice, itemTooltip, makeItem, rollRarity, slotFor, entryIcon,
  moveEntry, sortEntries, STASH_SIZE,
} from './items';
import { ENDINGS, EPILOGUE, greeting, priceMul, QUESTS } from './quests';
import { HEALERS, MAP_NAME, SHOP_KIND, SHOP_TITLE, SMITHS } from './homes';
import { actionFor, keyOf } from './keys';
import { helpHtml, renderSettings } from './settings';

export const SKILL_ICONS: Record<string, string> = {
  block: 'i_shield_iron', dash_slash: 'weapon_regular_sword', war_cry: 'i_helm_iron', earth_split: 'weapon_big_hammer',
  ambush: 'weapon_knife', poison: 'flask_green', smoke: 'bomb_f0', shadow_dance: 'weapon_katana',
  fireball: 'fx_orb_fire_0', frost_zone: 'fx_ice', blink: 'fx_orb_blue_1', meteor: 'fx_orb_fire_1',
  triple: 'weapon_arrow', trap: 'i_quiver', back_shot: 'weapon_bow', arrow_rain: 'weapon_bow_2',
  heal: 'fx_orb_green_1', barrier: 'i_holy_book', purify: 'flask_yellow', judgment: 'weapon_hammer',
};
export const RACE_ICONS: Record<string, string> = { human: 'i_shield_red', elf: 'fx_orb_green_0', dwarf: 'flask_big_red', orc: 'weapon_axe', demon: 'fx_orb_dark_1' };

const $ = <T extends HTMLElement = HTMLElement>(sel: string, root: ParentNode = document) => root.querySelector(sel) as T;
const esc = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);
const img = (n: string, s = 2, cls = '') => `<img class="px ${cls}" src="${iconURL(n, s)}" alt="">`;

export class UI implements UIHooks {
  g!: Game;
  root: HTMLElement;
  modal: string | null = null;
  slot = 0;
  dirty = true;
  bossE: Enemy | null = null;
  menuTab = 'inv';
  selInv: number | null = null;
  selEq: EquipSlot | null = null;
  shopNpc = '';
  shopStock: { kind: 'use' | 'eq'; id?: string; item?: import('./items').ItemInst }[] = [];
  smithSel: { where: 'eq' | 'inv'; key: string | number } | null = null;
  talkQueue: { lines: string[]; i: number; npc: NpcEnt; after: () => void } | null = null;
  miniCv: HTMLCanvasElement;
  miniBase: HTMLCanvasElement | null = null;
  miniMap = '';
  onQuit: () => void = () => {};

  constructor(root: HTMLElement) {
    this.root = root;
    root.innerHTML = `
      <div id="hud" class="hidden">
        <div id="charbox">
          <div id="portrait"></div>
          <div id="bars">
            <div class="nm"><span id="hname"></span> <span id="hlv"></span></div>
            <div class="bar hp"><i></i><span></span></div>
            <div class="bar mp"><i></i><span></span></div>
            <div class="bar tox hidden"><i></i><span></span></div>
            <div class="bar st"><i></i></div>
            <div id="buffs"></div>
          </div>
        </div>
        <div id="money"><span>${''}</span></div>
        <div id="topright">
          <div id="menubtns">
            <button data-m="inv" title="가방 (Tab/I)">가방</button><button data-m="stat" title="능력치 (C)">능력치</button><button data-m="skill" title="스킬 (K)">스킬</button><button data-m="quest" title="퀘스트 (J)">퀘스트</button><button data-m="party" title="함께하기 (멀티플레이)">파티</button><button data-m="settings" title="설정 (키 바꾸기)">⚙</button><button data-m="pause" title="메뉴 (Esc)">≡</button>
          </div>
          <canvas id="minimap" width="140" height="100"></canvas>
          <div id="region"></div>
          <div id="tracker"></div>
        </div>
        <div id="bossbar" class="hidden"><div class="bn"></div><div class="bb"><i></i><b></b></div></div>
        <div id="skillbar"></div>
        <div id="xpbar"><i></i></div>
        <div id="pointsAlert" class="hidden"></div>
        <div id="party"></div>
        <div id="chat"><div id="chatlog"></div><input id="chatin" maxlength="120" placeholder="Enter로 채팅 · Esc 취소" class="hidden"></div>
      </div>
      <div id="toasts"></div>
      <div id="bigmsg"></div>
      <div id="modal" class="hidden"></div>
      <div id="tooltip" class="hidden"></div>
      <div id="screen"></div>`;
    this.miniCv = $('#minimap');
    root.querySelectorAll<HTMLButtonElement>('#menubtns button').forEach((b) =>
      b.addEventListener('click', () => {
        sfx('ui');
        const m = b.dataset.m!;
        if (m === 'pause') this.openPause();
        else if (m === 'settings') this.openSettings();
        else if (m === 'party') this.openParty();
        else this.openMenu(m);
      }),
    );
    window.addEventListener('keydown', (e) => this.onKey(e));
    document.addEventListener('mousemove', (e) => {
      const t = $('#tooltip');
      if (t.classList.contains('hidden')) return;
      const x = Math.min(window.innerWidth - t.offsetWidth - 8, e.clientX + 14);
      const y = Math.min(window.innerHeight - t.offsetHeight - 8, e.clientY + 14);
      t.style.left = x + 'px';
      t.style.top = y + 'px';
    });
  }

  attach(g: Game): void {
    this.g = g;
    g.coop.onChange = () => { this.refreshParty(); if (this.modal === 'party') this.openParty(); };
    const inp = $<HTMLInputElement>('#chatin');
    inp.onkeydown = (e) => {
      e.stopPropagation();
      if (e.key === 'Enter') { g.coop.chat(inp.value); inp.value = ''; inp.blur(); inp.classList.add('hidden'); }
      else if (e.key === 'Escape') { inp.value = ''; inp.blur(); inp.classList.add('hidden'); }
    };
    this.refreshParty();
    this.buildSkillbar();
    this.miniMap = '';
    this.dirty = true;
    $('#hud').classList.remove('hidden');
    if (!(this as any)._ticking) {
      (this as any)._ticking = true;
      requestAnimationFrame(() => this.tick());
    }
  }

  get hero(): Hero {
    return this.g.hero;
  }

  onKey(e: KeyboardEvent): void {
    if (!this.g?.running) return;
    if ((e.target as HTMLElement)?.tagName === 'INPUT') return;
    const c = e.code;
    if (this.modal === 'talk' && (c === 'Space' || c === 'Enter' || c === 'KeyF')) { e.preventDefault(); this.advanceTalk(); return; }
    if (c === 'Enter' && !this.modal && this.g.coop.on) {
      e.preventDefault();
      const inp = $<HTMLInputElement>('#chatin');
      inp.classList.remove('hidden');
      inp.focus();
      return;
    }
    if (c === 'Escape') {
      e.preventDefault();
      if (this.modal && this.modal !== 'death') this.closeModal();
      else if (!this.modal) this.openPause();
      return;
    }
    const act = actionFor(c);
    const tab = act === 'inv' ? 'inv' : act === 'stat' ? 'stat' : act === 'skillWin' ? 'skill' : act === 'quest' ? 'quest' : '';
    if (tab) {
      e.preventDefault();
      if (this.modal === 'menu' && this.menuTab === tab) this.closeModal();
      else if (!this.modal || this.modal === 'menu') this.openMenu(tab);
    }
  }

  // ── UIHooks ────────────────────────────────────────────────────
  toast(msg: string, color = '#fdf7ed'): void {
    const el = document.createElement('div');
    el.className = 'toast';
    el.style.color = color;
    el.textContent = msg;
    const box = $('#toasts');
    box.appendChild(el);
    while (box.children.length > 5) box.firstChild!.remove();
    setTimeout(() => el.classList.add('out'), 2600);
    setTimeout(() => el.remove(), 3200);
  }
  big(msg: string, sub = ''): void {
    const el = $('#bigmsg');
    el.innerHTML = `<div class="t">${esc(msg)}</div>${sub ? `<div class="s">${esc(sub)}</div>` : ''}`;
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
  }
  hudDirty(): void {
    this.dirty = true;
  }
  modalOpen(): boolean {
    return !!this.modal;
  }
  questUpdate(): void {
    this.dirty = true;
  }
  bossBar(e: Enemy | null): void {
    this.bossE = e;
    $('#bossbar').classList.toggle('hidden', !e);
    if (e) $('#bossbar .bn').textContent = e.d.name;
  }
  save(): void {
    saveSlot(this.slot, this.hero);
  }
  onDeath(): void {
    const lost = (this.g as any).lostGold ?? 0;
    this.openModal('death', `
      <div class="panel center death">
        <h2>쓰러졌다…</h2>
        <p>골드 ${lost}G를 잃었다. 여신상 앞에서 다시 일어난다.</p>
        <button class="btn big" id="revive">마을에서 부활</button>
      </div>`);
    $('#revive').onclick = () => { this.closeModal(true); this.g.respawn(); };
  }
  showChapterClear(chapter = 1): void {
    sfx('levelup');
    const CH: Record<number, { title: string; body: string; next: string }> = {
      1: { title: '왕관 행방의 단서', body: '왕관은 도둑맞은 것이 아니라, 왕의 명령으로 흩어진 것이었다.<br>가르토는 마지막 명령을 지켰고, 섭정 모르데인은 보석을 원한다. 바르곤은 이상한 말을 남기고 물러났다.', next: '2장이 시작된다: 실바넬 숲 마을의 여왕 엘라리엔을 찾아가라. 대륙 곳곳에 기억의 틈이 열렸다.' },
      2: { title: '엘프와의 맹약', body: '타락한 정령 실바레스를 정화하고 생명석을 맡았다.<br>잠에서 깬 현자 오르웬: "왕관이 무엇을 먹고 빛났는지부터 알아라."', next: '3장이 시작된다: 아이언후드 광산 마을의 길드장 브론 딥해머를 찾아가라.' },
      3: { title: '드워프의 협력', body: '단조 연대기가 진실을 말했다. 왕관의 불은 노르하임에서 빼앗은 첫 불꽃이었다.<br>그 불에는 한 민족의 영혼이 묶여 있다.', next: '4장이 시작된다: 붉은 평원 야영지의 족장 그롬마를 찾아가라.' },
      4: { title: '오크 부족 통일', body: '부족들은 다시 하나가 되었다. 그리고 섭정 모르데인은 가면을 벗었다.<br>네 개의 보석과 세라가 북쪽으로 끌려갔다.', next: '최종장이 시작된다: 그림자 은신처의 베스페라와 함께 균열의 땅으로.' },
      6: { title: '재의 사도', body: '재의 대사제 카시안이 쓰러지고, 재의 경전이 진실을 하나 더 꺼냈다.<br>첫 불꽃은 노르하임의 것도 아니었다. 불을 낳은 재의 어머니가 북녘 너머 요람에 잠들어 있다.', next: '7장이 시작된다: 실바넬의 현자 오르웬에게 요람이 어디 있는지 물어라.' },
    };
    const ch = CH[chapter] ?? CH[1];
    this.openModal('clear', `
      <div class="panel center clear">
        <div class="kicker">CHAPTER ${chapter} CLEAR</div>
        <h2>${ch.title}</h2>
        <p>${ch.body}</p>
        <p class="dim">${ch.next}<br>플레이 시간 ${fmtTime(this.hero.playtime)} · 처치 ${this.hero.kills}</p>
        <button class="btn big" id="cont">계속하기</button>
      </div>`);
    $('#cont').onclick = () => this.closeModal();
  }

  talk(n: NpcEnt): void {
    const g = this.g;
    sfx('ui');
    if (n.id === 'tutor') g.tutorial.event('talk');
    const prog = g.talkProgress(n.id);
    if (prog?.choice) {
      const c = prog.choice;
      const ask = () => {
        const opts = c.options.map((o, i) => ({
          label: o.ok ? o.label : `🔒 ${o.label}`,
          fn: () => {
            if (!o.ok) { this.toast(o.reqText ?? '조건이 부족하다', '#ff9a8a'); sfx('deny'); return; }
            const lines = g.choose(c.qid, i);
            this.showTalk(n, lines.length ? lines : ['...'], () => this.closeModal());
          },
        }));
        opts.push({ label: '조금 더 생각해 본다', fn: () => this.closeModal() });
        this.showOptions(n, c.prompt, opts);
      };
      if (prog.lines.length) this.showTalk(n, prog.lines, ask);
      else ask();
      return;
    }
    if (prog) {
      // 같은 NPC에게 이어서 할 이야기(다음 단계·새 퀘스트)가 있을 때만 대화를 이어 간다
      this.showTalk(n, prog.lines, () => (g.npcMarker(n.id) ? this.talk(n) : this.closeModal()));
      return;
    }
    const offer = g.offerFor(n.id);
    if (offer) {
      this.showTalk(n, offer.offerByRace?.[this.hero.race] ?? offer.offer, () => {
        this.showOptions(n, `[${offer.race ? '종족 퀘스트' : '퀘스트'}] ${offer.name}`, [
          { label: '수락한다', fn: () => { g.startQuest(offer.id); this.closeModal(); } },
          { label: '나중에', fn: () => this.closeModal() },
        ]);
      });
      return;
    }
    this.showTalk(n, [greeting(n.id, this.hero.race, this.hero.flags)], () => this.npcServices(n));
  }

  npcServices(n: NpcEnt): void {
    const opts: { label: string; fn: () => void }[] = [];
    if (n.id === 'eira' && !this.hero.flags.eira_saved) {
      opts.push({
        label: '쇠사슬을 끊는다',
        fn: () => {
          sfx('smith_ok');
          this.g.setFlag('pact_demon');
          this.g.setFlag('eira_saved');
          this.showTalk(n, ['(쇠사슬이 끊어지자 에이라가 비틀거리며 일어선다)', '"세라... 그 아이가 살아 있는 거지? 은신처로 먼저 가 있을게. 결사의 모두에게 네 이름을 전할게."', '(잿불 결사가 너를 동족으로 받아들였다 — 마족과의 맹약)'], () => this.closeModal());
        },
      });
    }
    if (SMITHS.has(n.id)) {
      opts.push({ label: '장비 강화', fn: () => this.openSmith(n.id) });
      opts.push({ label: '장비 구매', fn: () => this.openShop(n.id) });
    } else if (SHOP_KIND[n.id]) opts.push({ label: '상점', fn: () => this.openShop(n.id) });
    if (HEALERS.has(n.id)) {
      opts.push({ label: '치료 받기', fn: () => { this.g.p.hp = this.g.der.maxHp; this.g.p.mp = this.g.der.maxMp; this.g.p.status = {}; this.g.p.manaTox = 0; this.g.p.toxSick = 0; sfx('heal'); this.toast('상처가 모두 나았다', '#7bf06a'); this.closeModal(); } });
      opts.push({ label: '여정 기록 (저장)', fn: () => { this.g.saveHero(); this.save(); sfx('holy'); this.toast('저장되었다', '#facb3e'); this.closeModal(); } });
      opts.push({ label: '능력치·스킬 초기화 (200G)', fn: () => this.respec() });
    }
    if (!opts.length) { this.closeModal(); return; }
    opts.push({ label: '닫기', fn: () => this.closeModal() });
    this.showOptions(n, '무엇을 할까?', opts);
  }

  respec(): void {
    const h = this.hero;
    if (h.gold < 200) { this.toast('골드가 부족하다', '#f66'); sfx('deny'); return; }
    h.gold -= 200;
    const pts = Object.values(h.alloc).reduce((a, b) => a + b, 0);
    for (const k of Object.keys(h.alloc) as StatKey[]) h.alloc[k] = 0;
    h.points += pts;
    let sp = 0;
    for (const s of CLASSES[h.cls].skills) {
      const lv = h.skillLv[s.id] ?? 0;
      const free = s.unlock <= h.level ? 1 : 0;
      sp += Math.max(0, lv - free);
      h.skillLv[s.id] = Math.min(lv, free);
    }
    h.skillPts += sp;
    this.g.recalc();
    sfx('holy');
    this.toast('능력치와 스킬이 초기화되었다', '#facb3e');
    this.closeModal();
    this.dirty = true;
  }

  showTalk(n: NpcEnt, lines: string[], after: () => void): void {
    this.talkQueue = { lines, i: 0, npc: n, after };
    this.renderTalk();
  }
  renderTalk(): void {
    const q = this.talkQueue!;
    this.openModal('talk', `
      <div class="dialog">
        <div class="por">${img(q.npc.sprite + '_idle_anim_f0', 4)}</div>
        <div class="body"><div class="who">${esc(q.npc.name)}</div><div class="txt">${esc(q.lines[q.i] ?? '')}</div>
        <div class="next">▼ 클릭 / Space</div></div>
      </div>`, true);
    $('#modal .dialog').onclick = () => this.advanceTalk();
  }
  advanceTalk(): void {
    const q = this.talkQueue;
    if (!q || this.modal !== 'talk') return;
    sfx('ui');
    q.i++;
    if (q.i >= q.lines.length) {
      this.talkQueue = null;
      this.modal = null;
      q.after();
      if (!this.modal) this.closeModal();
    } else this.renderTalk();
  }
  showOptions(n: NpcEnt, title: string, opts: { label: string; fn: () => void }[]): void {
    this.openModal('options', `
      <div class="dialog">
        <div class="por">${img(n.sprite + '_idle_anim_f0', 4)}</div>
        <div class="body"><div class="who">${esc(n.name)}</div><div class="txt">${esc(title)}</div>
        <div class="opts">${opts.map((o, i) => `<button class="btn" data-i="${i}">${esc(o.label)}</button>`).join('')}</div></div>
      </div>`, true);
    $('#modal').querySelectorAll<HTMLButtonElement>('.opts button').forEach((b) => (b.onclick = (ev) => { ev.stopPropagation(); sfx('ui'); opts[+b.dataset.i!].fn(); }));
  }

  /** 기억의 틈 · 벽화 장면 */
  showScene(title: string, lines: string[]): void {
    this.openModal('scene', `
      <div class="panel center scene">
        <div class="kicker">${esc(title)}</div>
        ${lines.map((l) => `<p>${esc(l)}</p>`).join('')}
        <button class="btn big" id="sceneOk">돌아오기</button>
      </div>`);
    $('#sceneOk').onclick = () => { sfx('ui'); this.closeModal(); };
  }

  showEnding(id: string): void {
    const e = ENDINGS[id];
    if (!e) return;
    sfx('levelup');
    this.openModal('ending', `
      <div class="panel center ending">
        <div class="kicker">${id.startsWith('finale') ? 'EPILOGUE · 잿빛 왕관 이후' : 'THE END'}</div>
        <h2>${esc(e.title)}</h2>
        ${e.body.map((l) => `<p>${esc(l)}</p>`).join('')}
        <p class="epi">${esc(EPILOGUE[this.hero.race])}</p>
        <p class="dim small">플레이 시간 ${fmtTime(this.hero.playtime)} · 처치 ${this.hero.kills} · Lv.${this.hero.level}<br>${id.startsWith('finale') ? '잿빛 왕관의 이야기는 여기서 끝납니다. 끝까지 함께해 주셔서 고맙습니다.' : id !== 'ending_2' ? '다른 엔딩도 있습니다. 다섯 종족과의 맹약, 단조 연대기, 가르토, 노르하임의 기억, 에이라... 퀘스트 창에서 조건을 확인해 보세요.' : '진 엔딩을 보셨습니다. 함께해 주셔서 고맙습니다.'}</p>
        <button class="btn big" id="endOk">${id.startsWith('ending') ? '계속 플레이하기 — 6장이 열렸습니다' : '계속 플레이하기'}</button>
      </div>`);
    $('#endOk').onclick = () => this.closeModal();
  }

  // ── 모달 ───────────────────────────────────────────────────────
  openModal(name: string, html: string, bottom = false): void {
    this.modal = name;
    this.root.classList.add('modal-open');
    const m = $('#modal');
    m.className = bottom ? 'bottom' : '';
    m.innerHTML = html;
    this.hideTip();
    if (this.g) { this.g.mouse.down = false; this.g.p && (this.g.p.holdDir = null); }
  }
  closeModal(force = false): void {
    if (this.modal === 'death' && !force) return;
    this.modal = null;
    this.root.classList.remove('modal-open');
    this.talkQueue = null;
    const m = $('#modal');
    m.className = 'hidden';
    m.innerHTML = '';
    this.hideTip();
    this.dirty = true;
  }
  tip(html: string, ev?: MouseEvent): void {
    const t = $('#tooltip');
    t.innerHTML = html;
    t.classList.remove('hidden');
    if (ev) { t.style.left = ev.clientX + 14 + 'px'; t.style.top = ev.clientY + 14 + 'px'; }
  }
  hideTip(): void {
    $('#tooltip').classList.add('hidden');
  }

  // ── 메뉴: 가방 / 능력치 / 스킬 / 퀘스트 ────────────────────────
  openMenu(tab: string): void {
    this.g?.tutorial?.event('menu');
    this.menuTab = tab;
    this.selInv = null;
    this.selEq = null;
    this.renderMenu();
  }
  renderMenu(): void {
    const tabs = [['inv', '장비·가방'], ['stat', '능력치'], ['skill', '스킬'], ['quest', '퀘스트']];
    let body = '';
    if (this.menuTab === 'inv') body = this.invHtml();
    else if (this.menuTab === 'stat') body = this.statHtml();
    else if (this.menuTab === 'skill') body = this.skillHtml();
    else body = this.questHtml();
    this.openModal('menu', `
      <div class="panel menu">
        <div class="tabs">${tabs.map(([k, n]) => `<button class="tab ${k === this.menuTab ? 'on' : ''}" data-t="${k}">${n}</button>`).join('')}<button class="x">✕</button></div>
        <div class="mbody">${body}</div>
      </div>`);
    const m = $('#modal');
    m.querySelectorAll<HTMLButtonElement>('.tab').forEach((b) => (b.onclick = () => { sfx('ui'); this.openMenu(b.dataset.t!); }));
    $('.x', m).onclick = () => this.closeModal();
    if (this.menuTab === 'inv') {
      this.bindInv(m);
      $('#invSort', m).onclick = () => { sortEntries(this.hero.inv); this.selInv = null; sfx('ui'); this.dirty = true; this.renderMenu(); };
    }
    if (this.menuTab === 'stat') this.bindStat(m);
    if (this.menuTab === 'skill') this.bindSkill(m);
  }

  // ── 보관함 ───────────────────────────────────────────────────
  openStash(): void {
    const h = this.hero;
    if (!h.stash) h.stash = new Array(STASH_SIZE).fill(null);
    sfx('chest');
    this.renderStash();
  }
  renderStash(): void {
    const h = this.hero, stash = h.stash!;
    const cell = (e: InvEntry | null, w: string, i: number) => {
      if (!e) return `<div class="slot" data-w="${w}" data-i="${i}"></div>`;
      const border = e.t === 'eq' ? `border-color:${RARITY[e.item.rarity].color}` : '';
      const n = e.t !== 'eq' && e.n > 1 ? `<b class="cnt">${e.n}</b>` : '';
      return `<div class="slot" data-w="${w}" data-i="${i}" style="${border}">${img(entryIcon(e), 2)}${n}</div>`;
    };
    const used = (a: (InvEntry | null)[]) => a.filter(Boolean).length;
    this.openModal('stash', `
      <div class="panel menu stash">
        <div class="tabs"><span class="ttl">보관함</span><span class="dim small"> 아이템을 클릭하면 반대쪽으로 옮겨집니다</span><button class="x">✕</button></div>
        <div class="mbody"><div class="stashwrap">
          <div class="scol"><div class="shead"><b>내 가방</b> <span class="dim">${used(h.inv)}/${h.inv.length}</span>
            <button class="btn" data-a="sortInv">정리</button><button class="btn" data-a="matsIn">재료 모두 넣기</button><button class="btn" data-a="eqIn">장비 모두 넣기</button></div>
            <div class="invgrid">${h.inv.map((e, i) => cell(e, 'inv', i)).join('')}</div></div>
          <div class="scol"><div class="shead"><b>보관함</b> <span class="dim">${used(stash)}/${stash.length}</span>
            <button class="btn" data-a="sortStash">정리</button></div>
            <div class="invgrid stashgrid">${stash.map((e, i) => cell(e, 'stash', i)).join('')}</div></div>
        </div></div>
      </div>`);
    const m = $('#modal');
    $('.x', m).onclick = () => this.closeModal();
    m.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => {
      const w = el.dataset.w!, i = +el.dataset.i!;
      const arr = w === 'inv' ? h.inv : stash;
      el.onclick = () => {
        if (!arr[i]) return;
        this.hideTip();
        if (moveEntry(arr, i, w === 'inv' ? stash : h.inv)) sfx('pickup');
        else { this.toast(w === 'inv' ? '보관함이 가득 찼다' : '가방이 가득 찼다', '#f66'); sfx('deny'); }
        this.dirty = true;
        this.buildSkillbar();
        this.renderStash();
      };
      el.onmouseenter = (ev) => { const e = arr[i]; if (!e) return; this.tip(e.t === 'eq' ? itemTooltip(e.item, h.cls) : e.t === 'use' ? `<b>${CONSUMABLES[e.id].name}</b> ×${e.n}<br>${CONSUMABLES[e.id].desc}` : `<b>${MATERIALS[e.id].name}</b> ×${e.n}`, ev); };
      el.onmouseleave = () => this.hideTip();
    });
    m.querySelectorAll<HTMLButtonElement>('.shead button').forEach((b) => (b.onclick = () => {
      const a = b.dataset.a!;
      if (a === 'sortInv') sortEntries(h.inv);
      else if (a === 'sortStash') sortEntries(stash);
      else {
        const t = a === 'matsIn' ? 'mat' : 'eq';
        let full = false;
        h.inv.forEach((e, i) => { if (e?.t === t && !moveEntry(h.inv, i, stash)) full = true; });
        if (full) this.toast('보관함이 가득 찼다', '#f66');
      }
      sfx('ui');
      this.dirty = true;
      this.buildSkillbar();
      this.renderStash();
    }));
  }

  invHtml(): string {
    const h = this.hero;
    const slots: EquipSlot[] = ['weapon', 'offhand', 'head', 'body', 'hands', 'feet', 'ring', 'ring2', 'amulet'];
    const body = RACES[h.race].bodies[h.gender];
    const eq = slots.map((s) => {
      const it = h.equip[s];
      return `<div class="slot eq ${this.selEq === s ? 'sel' : ''}" data-eq="${s}" style="${it ? `border-color:${RARITY[it.rarity].color}` : ''}">
        ${it ? img(baseOf(it).icon, 2) + (it.plus ? `<b class="plus">+${it.plus}</b>` : '') : `<span class="lbl">${SLOT_NAMES[s]}</span>`}</div>`;
    }).join('');
    const inv = h.inv.map((e, i) => {
      if (!e) return `<div class="slot ${this.selInv === i ? 'sel' : ''}" data-inv="${i}"></div>`;
      const border = e.t === 'eq' ? `border-color:${RARITY[e.item.rarity].color}` : '';
      const n = e.t !== 'eq' && e.n > 1 ? `<b class="cnt">${e.n}</b>` : '';
      const bad = e.t === 'eq' && !canEquip(e.item, h.cls) ? ' bad' : '';
      return `<div class="slot${bad} ${this.selInv === i ? 'sel' : ''}" data-inv="${i}" style="${border}">${img(entryIcon(e), 2)}${n}</div>`;
    }).join('');
    return `
      <div class="invwrap">
        <div class="eqcol">
          <div class="paper">${img(body + '_idle_anim_f0', 4)}</div>
          <div class="eqgrid">${eq}</div>
          <div class="money2">${img('i_gold', 1)} ${h.gold}G &nbsp; ${img('i_soul', 1)} 영혼석 ${h.soul}</div>
          <div class="quick">퀵슬롯: ${h.quick.map((q, i) => `<span class="qs">${i + 1}: ${q ? img(CONSUMABLES[q].icon, 1) + ' ' + CONSUMABLES[q].name + ` (${countOf(h, 'use', q)})` : '-'}</span>`).join('')}</div>
        </div>
        <div class="invcol"><div class="invtools"><button class="btn" id="invSort">가방 정리</button><span class="dim small">마을 여신상 옆 보관함에 맡길 수 있습니다</span></div><div class="invgrid">${inv}</div><div id="detail" class="detail">${this.detailHtml()}</div></div>
      </div>`;
  }

  detailHtml(ctx: 'menu' | 'shop' = 'menu'): string {
    const h = this.hero;
    if (this.selEq) {
      const it = h.equip[this.selEq];
      if (!it) return '<span class="dim">빈 칸</span>';
      return `${itemTooltip(it, h.cls)}<div class="acts"><button class="btn" data-a="unequip">해제</button></div>`;
    }
    if (this.selInv === null) return '<span class="dim">아이템을 클릭하면 자세히 볼 수 있습니다.<br>장비를 끼면 바로 능력치에 반영됩니다.</span>';
    const e = h.inv[this.selInv];
    if (!e) return '<span class="dim">빈 칸</span>';
    const sell = ctx === 'shop' ? `<button class="btn" data-a="sell">판매 (${this.sellPrice(e)}G)</button>` : '';
    if (e.t === 'eq') {
      const slot = slotFor(e.item);
      const cur = slot === 'ring' ? h.equip.ring : h.equip[slot];
      const cmp = cur ? `<div class="cmp"><div class="dim">현재 착용</div>${itemTooltip(cur, h.cls)}</div>` : '';
      return `${itemTooltip(e.item, h.cls)}<div class="acts">${ctx === 'menu' ? `<button class="btn" data-a="equip">장착</button>` : ''}${sell}${ctx === 'menu' ? '<button class="btn" data-a="drop">버리기</button>' : ''}</div>${cmp}`;
    }
    if (e.t === 'use') {
      const c = CONSUMABLES[e.id];
      return `<b>${c.name}</b> ×${e.n}<br><span class="dim">${c.desc}</span><div class="acts">${ctx === 'menu' ? `<button class="btn" data-a="use">사용</button><button class="btn" data-a="q0">1번 등록</button><button class="btn" data-a="q1">2번 등록</button><button class="btn" data-a="q2">3번 등록</button>` : ''}${sell}</div>`;
    }
    const mt = MATERIALS[e.id];
    return `<b>${mt.name}</b> ×${e.n}<br><span class="dim">재료 아이템 (퀘스트·제작)</span><div class="acts">${mt.price ? sell : ''}</div>`;
  }

  sellPrice(e: InvEntry): number {
    if (e.t === 'eq') return Math.max(1, Math.floor(itemPrice(e.item) * 0.25));
    if (e.t === 'use') return Math.max(1, Math.floor(CONSUMABLES[e.id].price * 0.3));
    return MATERIALS[e.id].price;
  }

  bindInv(m: HTMLElement, ctx: 'menu' | 'shop' = 'menu'): void {
    const h = this.hero;
    const refresh = () => (ctx === 'menu' ? this.renderMenu() : this.renderShop());
    m.querySelectorAll<HTMLElement>('[data-inv]').forEach((el) => {
      const i = +el.dataset.inv!;
      el.onclick = () => { sfx('ui'); this.selInv = i; this.selEq = null; refresh(); };
      el.ondblclick = () => { const e = h.inv[i]; if (!e) return; if (ctx === 'menu') { if (e.t === 'eq') this.equip(i); else if (e.t === 'use') this.g.useItem(e.id); } else this.sell(i); refresh(); };
      el.onmouseenter = (ev) => { const e = h.inv[i]; if (!e) return; this.tip(e.t === 'eq' ? itemTooltip(e.item, h.cls) : e.t === 'use' ? `<b>${CONSUMABLES[e.id].name}</b><br>${CONSUMABLES[e.id].desc}` : `<b>${MATERIALS[e.id].name}</b>`, ev); };
      el.onmouseleave = () => this.hideTip();
    });
    m.querySelectorAll<HTMLElement>('[data-eq]').forEach((el) => {
      const s = el.dataset.eq as EquipSlot;
      el.onclick = () => { sfx('ui'); this.selEq = s; this.selInv = null; refresh(); };
      el.ondblclick = () => { this.unequip(s); refresh(); };
      el.onmouseenter = (ev) => { const it = h.equip[s]; if (it) this.tip(itemTooltip(it, h.cls), ev); };
      el.onmouseleave = () => this.hideTip();
    });
    m.querySelectorAll<HTMLButtonElement>('.acts button').forEach((b) => (b.onclick = () => {
      const a = b.dataset.a!;
      const i = this.selInv;
      if (a === 'unequip' && this.selEq) this.unequip(this.selEq);
      else if (i !== null) {
        const e = h.inv[i];
        if (!e) return;
        if (a === 'equip') this.equip(i);
        else if (a === 'use' && e.t === 'use') this.g.useItem(e.id);
        else if (a.startsWith('q') && e.t === 'use') { h.quick[+a[1]] = e.id; sfx('ui'); this.dirty = true; this.buildSkillbar(); }
        else if (a === 'drop') { h.inv[i] = null; this.selInv = null; sfx('ui'); }
        else if (a === 'sell') this.sell(i);
      }
      refresh();
    }));
  }

  equip(i: number): void {
    const h = this.hero;
    const e = h.inv[i];
    if (!e || e.t !== 'eq') return;
    if (!canEquip(e.item, h.cls)) { this.toast('이 클래스는 착용할 수 없다', '#f66'); sfx('deny'); return; }
    let slot = slotFor(e.item);
    if (slot === 'ring' && h.equip.ring && !h.equip.ring2) slot = 'ring2';
    const old = h.equip[slot];
    h.equip[slot] = e.item;
    h.inv[i] = old ? { t: 'eq', item: old } : null;
    sfx('pickup');
    this.g.recalc();
    this.g.p.hp = Math.min(this.g.p.hp, this.g.der.maxHp);
    this.dirty = true;
  }
  unequip(s: EquipSlot): void {
    const h = this.hero;
    const it = h.equip[s];
    if (!it) return;
    if (s === 'weapon') { this.toast('무기는 벗을 수 없다 (다른 무기로 교체하세요)', '#ff9'); return; }
    if (!addToInv(h, { t: 'eq', item: it })) { this.toast('가방이 가득 찼다', '#f66'); return; }
    delete h.equip[s];
    this.selEq = null;
    sfx('ui');
    this.g.recalc();
    this.g.p.hp = Math.min(this.g.p.hp, this.g.der.maxHp);
    this.dirty = true;
  }

  statHtml(): string {
    const h = this.hero;
    const d = this.g.der;
    const r = RACES[h.race], c = CLASSES[h.cls];
    const keys: StatKey[] = ['str', 'dex', 'int', 'vit', 'wis'];
    return `
      <div class="stats">
        <div class="scol">
          <div class="who2">${img(r.bodies[h.gender] + '_idle_anim_f0', 3)}<div><b>${esc(h.name)}</b><br>Lv.${h.level} ${r.name} ${c.name}<br><span class="dim">EXP ${h.xp} / ${xpToNext(h.level)}</span></div></div>
          <div class="pts">남은 능력치 포인트: <b>${h.points}</b></div>
          ${keys.map((k) => `<div class="srow"><span>${STAT_NAMES[k]} <span class="dim">${k.toUpperCase()}</span></span><b>${d.stats[k]}</b><button class="btn sm" data-s="${k}" ${h.points ? '' : 'disabled'}>+</button></div>`).join('')}
          <div class="dim small">힘: 물리 공격력 · 민첩: 공격 속도/치명타/회피 · 지능: 마법 공격력/MP · 체력: HP · 신앙: 회복량/성속성</div>
        </div>
        <div class="scol">
          <div class="drow"><span>최대 HP</span><b>${d.maxHp}</b></div>
          <div class="drow"><span>최대 MP</span><b>${d.maxMp}</b></div>
          <div class="drow"><span>물리 공격력</span><b>${Math.round(d.patk)}</b></div>
          <div class="drow"><span>마법 공격력</span><b>${Math.round(d.matk)}</b></div>
          <div class="drow"><span>방어력</span><b>${Math.round(d.def)}</b></div>
          <div class="drow"><span>치명타율</span><b>${(d.crit * 100).toFixed(1)}%</b></div>
          <div class="drow"><span>회피율</span><b>${(d.evade * 100).toFixed(1)}%</b></div>
          <div class="drow"><span>공격 속도</span><b>×${d.aspd.toFixed(2)}</b></div>
          <div class="drow"><span>이동 속도</span><b>${Math.round(d.ms)}</b></div>
          <div class="race"><b>${r.name} 패시브 · ${r.passive.name}</b><br><span class="dim">${r.passive.desc}</span><br><b>마나 감응도 · ${r.mana.name}</b><br><span class="dim">${r.mana.desc}</span><br><b>종족 스킬 [T] · ${r.active.name}</b><br><span class="dim">${r.active.desc} (재사용 ${r.active.cd}초)</span></div>
        </div>
      </div>`;
  }
  bindStat(m: HTMLElement): void {
    m.querySelectorAll<HTMLButtonElement>('[data-s]').forEach((b) => (b.onclick = () => {
      const h = this.hero;
      if (h.points <= 0) return;
      h.points--;
      h.alloc[b.dataset.s as StatKey]++;
      sfx('ui');
      this.g.recalc();
      this.dirty = true;
      this.renderMenu();
    }));
  }

  skillHtml(): string {
    const h = this.hero;
    const c = CLASSES[h.cls];
    return `
      <div class="skills">
        <div class="pts">남은 스킬 포인트: <b>${h.skillPts}</b> <span class="dim">(레벨업마다 +1, 스킬 최대 5레벨)</span></div>
        ${c.skills.map((s) => {
          const lv = h.skillLv[s.id] ?? 0;
          const locked = h.level < s.unlock;
          return `<div class="skrow ${locked ? 'locked' : ''}">
            <div class="sk">${img(SKILL_ICONS[s.id], 2)}<b class="key">${s.key}</b></div>
            <div class="sd"><b>${s.name}</b> <span class="lv">Lv.${lv}/5</span> ${locked ? `<span class="dim">(레벨 ${s.unlock} 해금)</span>` : ''}<br>
            <span class="dim">${s.desc}</span><br><span class="small">MP ${s.mp} · 재사용 ${s.cd}초${s.coeff ? ` · 피해 계수 ×${(s.coeff * (1 + Math.max(0, lv - 1) * 0.15)).toFixed(2)}` : ''}</span></div>
            <button class="btn sm" data-k="${s.id}" ${!locked && h.skillPts > 0 && lv < 5 ? '' : 'disabled'}>+</button>
          </div>`;
        }).join('')}
        <div class="skrow"><div class="sk">${img(RACE_ICONS[h.race], 2)}<b class="key">T</b></div><div class="sd"><b>${RACES[h.race].active.name}</b> <span class="dim">(종족 스킬)</span><br><span class="dim">${RACES[h.race].active.desc}</span></div></div>
        <div class="dim small">기본 공격: ${c.basic.name} — 적을 좌클릭하면 사거리 안에서 자동으로 반복 공격합니다.</div>
      </div>`;
  }
  bindSkill(m: HTMLElement): void {
    m.querySelectorAll<HTMLButtonElement>('[data-k]').forEach((b) => (b.onclick = () => {
      const h = this.hero;
      if (h.skillPts <= 0) return;
      h.skillPts--;
      h.skillLv[b.dataset.k!] = (h.skillLv[b.dataset.k!] ?? 0) + 1;
      sfx('buff');
      this.dirty = true;
      this.renderMenu();
    }));
  }

  questHtml(): string {
    const h = this.hero;
    const active = h.quests.filter((q) => !q.done);
    const done = h.quests.filter((q) => q.done);
    const row = (q: (typeof h.quests)[0]) => {
      const def = QUESTS[q.id];
      const steps = def.stages.map((st, i) => {
        const state = q.done || i < q.stage ? 'done' : i === q.stage ? 'cur' : 'todo';
        let prog = '';
        if (state === 'cur' && st.k === 'kill') prog = ` (${q.count}/${st.n})`;
        if (state === 'cur' && st.k === 'collect') prog = ` (${Math.min(st.n, countOf(h, 'mat', st.mat))}/${st.n})`;
        return `<li class="${state}">${esc(st.text)}${prog}</li>`;
      }).join('');
      const r = def.reward;
      return `<div class="qrow ${def.main ? 'main' : ''}"><b>${def.main ? '[메인] ' : def.race ? '[종족] ' : '[서브] '}${esc(def.name)}</b><ul>${steps}</ul>
        <span class="dim small">보상: EXP ${r.xp} · ${r.gold}G${r.soul ? ` · 영혼석 ${r.soul}` : ''}${r.equip ? ' · 장비' : ''}${r.items ? ' · 소모품' : ''}</span></div>`;
    };
    return `<div class="quests">${active.map(row).join('') || '<span class="dim">진행 중인 퀘스트가 없습니다. 머리 위에 ! 가 뜬 NPC를 찾아보세요.</span>'}
      ${done.length ? `<h4>완료</h4>${done.map((q) => `<div class="qdone">✔ ${esc(QUESTS[q.id].name)}</div>`).join('')}` : ''}</div>${this.hero.flags.ch1_clear ? `<h4>다섯 종족의 맹약 · 진 엔딩 조건</h4><div class="pacts">${this.g.trueEndChecks().map((c) => `<div class="${c.ok ? 'ok' : ''}">${c.ok ? '✔' : '·'} ${esc(c.label)}</div>`).join('')}</div>` : ''}`;
  }

  // ── 상점 ───────────────────────────────────────────────────────
  openShop(npc: string): void {
    this.shopNpc = npc;
    this.selInv = null;
    this.selEq = null;
    const lvl = this.hero.level;
    if (SHOP_KIND[npc] === 'gear') {
      const mine = BASE_ITEMS.filter((b) => b.tier <= lvl + 3 && b.tier >= lvl - 4 && b.slot !== 'ring' && b.slot !== 'amulet' && (!b.cls || b.cls.includes(this.hero.cls)));
      const pick = mine.sort(() => Math.random() - 0.5).slice(0, 8);
      this.shopStock = pick.map((b) => ({ kind: 'eq', item: makeItem(b.id, Math.max(b.tier, lvl), Math.min(2, rollRarity(-20)) as 0) }));
    } else {
      const uses = SHOP_KIND[npc] === 'potion' ? ['hp_s', 'hp_l', 'mp_s', 'mp_l', 'antidote'] : ['hp_s', 'mp_s', 'antidote', 'meat', 'bomb', 'recall'];
      this.shopStock = uses.map((id) => ({ kind: 'use', id }));
      if (SHOP_KIND[npc] === 'general') {
        const acc = BASE_ITEMS.filter((b) => (b.slot === 'ring' || b.slot === 'amulet') && b.tier <= lvl + 2);
        for (let i = 0; i < 3 && acc.length; i++) this.shopStock.push({ kind: 'eq', item: makeItem(acc[(Math.random() * acc.length) | 0].id, lvl, Math.min(2, rollRarity(-10)) as 0) });
      }
    }
    this.renderShop();
  }
  buyPrice(s: UI['shopStock'][0]): number {
    const mul = priceMul(this.shopNpc, this.hero.race);
    return Math.round((s.kind === 'use' ? CONSUMABLES[s.id!].price : itemPrice(s.item!)) * mul);
  }
  renderShop(): void {
    const h = this.hero;
    const title = SHOP_TITLE[this.shopNpc] ?? '상점';
    const mul = priceMul(this.shopNpc, h.race);
    const stock = this.shopStock.map((s, i) => {
      const name = s.kind === 'use' ? CONSUMABLES[s.id!].name : itemName(s.item!);
      const icon = s.kind === 'use' ? CONSUMABLES[s.id!].icon : baseOf(s.item!).icon;
      const col = s.kind === 'eq' ? RARITY[s.item!.rarity].color : '#fdf7ed';
      return `<div class="shoprow" data-b="${i}">${img(icon, 2)}<span style="color:${col}">${esc(name)}</span><b>${this.buyPrice(s)}G</b></div>`;
    }).join('');
    const inv = h.inv.map((e, i) => {
      if (!e) return `<div class="slot" data-inv="${i}"></div>`;
      const border = e.t === 'eq' ? `border-color:${RARITY[e.item.rarity].color}` : '';
      const n = e.t !== 'eq' && e.n > 1 ? `<b class="cnt">${e.n}</b>` : '';
      return `<div class="slot ${this.selInv === i ? 'sel' : ''}" data-inv="${i}" style="${border}">${img(entryIcon(e), 2)}${n}</div>`;
    }).join('');
    this.openModal('shop', `
      <div class="panel menu shop">
        <div class="tabs"><span class="ttl">${title}</span>${mul !== 1 ? `<span class="dim small"> (종족 가격 ×${mul})</span>` : ''}<button class="x">✕</button></div>
        <div class="mbody"><div class="invwrap">
          <div class="eqcol"><div class="dim">구매 (클릭)</div><div class="stock">${stock}</div><div class="money2">${img('i_gold', 1)} ${h.gold}G</div></div>
          <div class="invcol"><div class="dim">내 가방 — 선택 후 판매 (더블클릭 즉시 판매)</div><div class="invgrid">${inv}</div><div class="detail">${this.detailHtml('shop')}</div></div>
        </div></div>
      </div>`);
    const m = $('#modal');
    $('.x', m).onclick = () => this.closeModal();
    m.querySelectorAll<HTMLElement>('[data-b]').forEach((el) => {
      const s = this.shopStock[+el.dataset.b!];
      el.onclick = () => this.buy(+el.dataset.b!);
      el.onmouseenter = (ev) => this.tip(s.kind === 'use' ? `<b>${CONSUMABLES[s.id!].name}</b><br>${CONSUMABLES[s.id!].desc}` : itemTooltip(s.item!, h.cls), ev);
      el.onmouseleave = () => this.hideTip();
    });
    this.bindInv(m, 'shop');
  }
  buy(i: number): void {
    const h = this.hero;
    const s = this.shopStock[i];
    const price = this.buyPrice(s);
    if (h.gold < price) { this.toast('골드가 부족하다', '#f66'); sfx('deny'); return; }
    const ok = s.kind === 'use' ? addToInv(h, { t: 'use', id: s.id!, n: 1 }) : addToInv(h, { t: 'eq', item: s.item! });
    if (!ok) { this.toast('가방이 가득 찼다', '#f66'); sfx('deny'); return; }
    h.gold -= price;
    sfx('coin');
    if (s.kind === 'eq') this.shopStock.splice(i, 1);
    this.dirty = true;
    this.renderShop();
  }
  sell(i: number): void {
    const h = this.hero;
    const e = h.inv[i];
    if (!e) return;
    if (e.t === 'mat' && !MATERIALS[e.id].price) { this.toast('팔 수 없는 물건이다', '#ff9'); return; }
    h.gold += this.sellPrice(e);
    if (e.t !== 'eq' && e.n > 1) e.n--;
    else { h.inv[i] = null; this.selInv = null; }
    sfx('coin');
    this.dirty = true;
  }

  // ── 대장간 강화 (+1~+10, 실패해도 하락 없음 · 재료만 잃음) ─────
  smithNpc = 'smith';
  openSmith(npc = 'smith'): void {
    this.smithNpc = npc;
    this.smithSel = null;
    this.renderSmith();
  }
  smithItem(): import('./items').ItemInst | null {
    const s = this.smithSel;
    if (!s) return null;
    if (s.where === 'eq') return this.hero.equip[s.key as EquipSlot] ?? null;
    const e = this.hero.inv[s.key as number];
    return e && e.t === 'eq' ? e.item : null;
  }
  smithCost(it: import('./items').ItemInst): { gold: number; soul: number; rate: number } {
    const n = it.plus;
    const mul = priceMul(this.smithNpc, this.hero.race);
    return { gold: Math.round((40 + n * n * 25 + it.ilvl * 10) * mul), soul: n < 3 ? 0 : n < 6 ? 1 : n < 8 ? 2 : 3, rate: [1, 0.95, 0.9, 0.8, 0.7, 0.6, 0.5, 0.4, 0.3, 0.2][n] ?? 0 };
  }
  renderSmith(): void {
    const h = this.hero;
    const list: string[] = [];
    for (const [k, it] of Object.entries(h.equip)) if (it) list.push(`<div class="shoprow ${this.smithSel?.key === k ? 'sel' : ''}" data-w="eq" data-k="${k}">${img(baseOf(it).icon, 2)}<span style="color:${RARITY[it.rarity].color}">${esc(itemName(it))}</span><b class="dim">착용</b></div>`);
    h.inv.forEach((e, i) => { if (e?.t === 'eq') list.push(`<div class="shoprow ${this.smithSel?.key === i ? 'sel' : ''}" data-w="inv" data-k="${i}">${img(baseOf(e.item).icon, 2)}<span style="color:${RARITY[e.item.rarity].color}">${esc(itemName(e.item))}</span><b class="dim">가방</b></div>`); });
    const it = this.smithItem();
    let right = '<span class="dim">강화할 장비를 고르세요.<br>+1~+10까지 강화할 수 있고, 한 단계마다 기본 능력치가 8% 오릅니다.<br>실패해도 단계는 내려가지 않지만 재료는 사라집니다.</span>';
    if (it) {
      if (it.plus >= 10) right = `${itemTooltip(it, h.cls)}<br><b>최대 강화 단계입니다.</b>`;
      else {
        const c = this.smithCost(it);
        right = `${itemTooltip(it, h.cls)}<hr>
          <div>+${it.plus} → <b>+${it.plus + 1}</b></div>
          <div>성공 확률 <b>${Math.round(c.rate * 100)}%</b></div>
          <div>비용 ${img('i_gold', 1)} ${c.gold}G ${c.soul ? `+ ${img('i_soul', 1)} 영혼석 ${c.soul}` : ''}</div>
          <div class="dim small">보유: ${h.gold}G · 영혼석 ${h.soul}</div>
          <div class="acts"><button class="btn" id="doSmith">강화하기</button></div>`;
      }
    }
    this.openModal('smith', `
      <div class="panel menu shop">
        <div class="tabs"><span class="ttl">${SHOP_TITLE[this.smithNpc] ?? '대장간'} — 장비 강화</span><button class="x">✕</button></div>
        <div class="mbody"><div class="invwrap"><div class="eqcol"><div class="stock">${list.join('')}</div></div><div class="invcol"><div class="detail tall">${right}</div></div></div></div>
      </div>`);
    const m = $('#modal');
    $('.x', m).onclick = () => this.closeModal();
    m.querySelectorAll<HTMLElement>('[data-w]').forEach((el) => (el.onclick = () => {
      sfx('ui');
      this.smithSel = { where: el.dataset.w as 'eq' | 'inv', key: el.dataset.w === 'inv' ? +el.dataset.k! : el.dataset.k! };
      this.renderSmith();
    }));
    const b = $('#doSmith');
    if (b && it) b.onclick = () => {
      const c = this.smithCost(it);
      if (h.gold < c.gold || h.soul < c.soul) { this.toast('재료가 부족하다', '#f66'); sfx('deny'); return; }
      h.gold -= c.gold;
      h.soul -= c.soul;
      if (Math.random() < c.rate) { it.plus++; sfx('smith_ok'); this.toast(`강화 성공! ${itemName(it)}`, '#7fe3ff'); }
      else { sfx('smith_fail'); this.toast('강화 실패… (단계는 유지)', '#ff8a6a'); }
      this.g.recalc();
      this.dirty = true;
      this.renderSmith();
    };
  }

  // ── 일시정지 ───────────────────────────────────────────────────
  openPause(): void {
    this.openModal('pause', `
      <div class="panel center pause">
        <h2>일시정지</h2>
        <button class="btn big" id="pResume">계속하기</button>
        <button class="btn big" id="pSave">저장하기</button>
        <button class="btn big" id="pSet">설정 (키 바꾸기 · 소리)</button>
        <div class="help">${helpHtml()}</div>
        <button class="btn" id="pQuit">저장하고 타이틀로</button>
      </div>`);
    $('#pResume').onclick = () => this.closeModal();
    $('#pSave').onclick = () => { this.g.saveHero(); this.save(); sfx('holy'); this.toast('저장되었다', '#facb3e'); this.closeModal(); };
    $('#pSet').onclick = () => { sfx('ui'); this.openSettings(); };
    $('#pQuit').onclick = () => { this.g.saveHero(); this.save(); this.closeModal(); this.onQuit(); };
  }

  // ── 파티 (멀티플레이) ───────────────────────────────────────────
  openParty(msg = ''): void {
    const c = this.g.coop;
    const isArtifact = /claude\.ai|claudeusercontent/.test(location.hostname);
    let body = '';
    if (!c.on) {
      body = `
        <p>친구와 같은 세상에서 함께 모험합니다 (최대 4명).<br><span class="dim small">방장과 같은 지역에 있으면 몬스터를 함께 잡고, 처치 경험치·퀘스트 진행·전리품은 그 자리에 있는 모두가 각자 받습니다. 다른 지역에 가면 그곳에서는 각자 플레이합니다.</span></p>
        ${isArtifact ? '<p class="warn">이 페이지(claude.ai 미리보기)에서는 멀티플레이 연결이 막혀 있습니다. 공개 주소 mooner-1120.github.io 에서 열어 주세요.</p>' : ''}
        <div class="prow"><button class="btn big" id="pHost">방 만들기</button></div>
        <div class="prow"><input id="pCode" maxlength="5" placeholder="참가 코드 5자리" autocomplete="off"><button class="btn big" id="pJoin">참가하기</button></div>`;
    } else {
      const list = [`<li><b>${esc(this.hero.name)}</b> Lv.${this.hero.level} (나${c.role === 'host' ? ' · 방장' : ''})</li>`]
        .concat([...c.players.values()].map((p) => `<li><b>${esc(p.name)}</b> Lv.${p.level} <span class="dim">· ${esc(MAP_NAME[p.map] ?? p.map)}</span></li>`));
      body = `
        ${c.role === 'host' ? `<p>친구에게 이 코드를 알려 주세요</p><div class="bigcode">${c.code}</div>` : `<p>방 <b>${c.code}</b> 에 참가 중</p>`}
        <ul class="plist">${list.join('')}</ul>
        <p class="dim small">Enter 키로 채팅할 수 있습니다.${c.role === 'guest' ? ' 방장과 같은 지역에 가야 몬스터를 함께 잡습니다.' : ''}</p>
        <button class="btn" id="pLeave">${c.role === 'host' ? '방 닫기' : '방 나가기'}</button>`;
    }
    this.openModal('party', `
      <div class="panel center partyp">
        <h2>함께하기</h2>
        ${msg ? `<p class="warn">${esc(msg)}</p>` : ''}
        ${body}
        <button class="btn" id="pClose">닫기</button>
      </div>`);
    const q = (s: string) => document.getElementById(s);
    q('pClose')!.onclick = () => this.closeModal();
    const busy = (b: HTMLElement) => { b.textContent = '연결 중…'; (b as HTMLButtonElement).disabled = true; };
    if (q('pHost')) q('pHost')!.onclick = async () => {
      busy(q('pHost')!);
      try { await c.host(); this.openParty(); } catch (e) { this.openParty((e as Error).message); }
    };
    if (q('pJoin')) {
      const inp = q('pCode') as HTMLInputElement;
      inp.onkeydown = (e) => { e.stopPropagation(); if (e.key === 'Enter') q('pJoin')!.click(); };
      q('pJoin')!.onclick = async () => {
        const code = inp.value.trim().toUpperCase();
        if (code.length < 5) { this.openParty('참가 코드 5자리를 입력해 주세요.'); return; }
        busy(q('pJoin')!);
        try { await c.join(code); this.openParty(); } catch (e) { this.openParty((e as Error).message); }
      };
      setTimeout(() => inp.focus(), 50);
    }
    if (q('pLeave')) q('pLeave')!.onclick = () => { c.leave(c.role === 'host' ? '방을 닫았습니다.' : '방에서 나왔습니다.'); this.openParty(); };
  }

  refreshParty(): void {
    const c = this.g.coop;
    const el = $('#party');
    if (!c.on) { el.innerHTML = ''; } else {
      el.innerHTML = [...c.players.values()].map((p) => `
        <div class="pm ${p.map === this.g.map.id ? '' : 'far'}"><span>${esc(p.name)} <i>Lv.${p.level}</i></span>
        <div class="pbar"><i style="width:${Math.max(0, Math.min(100, (p.hp / Math.max(1, p.maxHp)) * 100))}%"></i></div>
        ${p.map === this.g.map.id ? '' : `<span class="dim small">${esc(MAP_NAME[p.map] ?? '')}</span>`}</div>`).join('');
    }
    const log = $('#chatlog');
    log.innerHTML = c.chatLog.slice(-6).map((m) => `<div class="cl ${m.name === '알림' ? 'sys' : ''}"><b>${esc(m.name)}</b> ${esc(m.text)}</div>`).join('');
    const pb = document.querySelector<HTMLElement>('#menubtns [data-m="party"]');
    if (pb) pb.classList.toggle('on', c.on);
  }

  openSettings(): void {
    this.openModal('settings', '');
    renderSettings($('#modal'), () => this.closeModal(), () => this.buildSkillbar());
  }

  // ── HUD ────────────────────────────────────────────────────────
  buildSkillbar(): void {
    const h = this.hero;
    const c = CLASSES[h.cls];
    const slot = (id: string, key: string, icon: string, title: string) => `<div class="sbtn" data-act="${id}" title="${esc(title)}">${icon ? img(icon, 2) : ''}<i class="cd"></i><b class="key">${key}</b><span class="num"></span></div>`;
    $('#skillbar').innerHTML =
      slot('roll', keyOf('roll'), 'weapon_arrow', '회피 구르기 (스태미나 25, 무적 0.2초)') +
      '<span class="sep"></span>' +
      c.skills.map((s, i) => slot('s' + i, keyOf(('skill' + (i + 1)) as 'skill1'), SKILL_ICONS[s.id], `${s.name} — ${s.desc} (MP ${s.mp})`)).join('') +
      slot('race', keyOf('race'), RACE_ICONS[h.race], `${RACES[h.race].active.name} — ${RACES[h.race].active.desc}`) +
      '<span class="sep"></span>' +
      h.quick.map((q, i) => slot('q' + i, keyOf(('item' + (i + 1)) as 'item1'), q ? CONSUMABLES[q].icon : '', q ? CONSUMABLES[q].name : '빈 퀵슬롯')).join('');
    // 구르기 아이콘은 연기 모양으로
    const rb = $('#skillbar [data-act="roll"] img') as HTMLImageElement | null;
    if (rb) rb.src = iconURL('i_boots_leather', 2);
    $('#skillbar').querySelectorAll<HTMLElement>('.sbtn').forEach((b) => {
      const act = b.dataset.act!;
      b.addEventListener('pointerdown', (ev) => {
        ev.preventDefault();
        ev.stopPropagation();
        const g = this.g;
        if (ev.pointerType === 'touch') g.touch = true;
        if (act === 'roll') g.doRoll();
        else if (act === 'race') g.raceSkill();
        else if (act[0] === 's') g.castSkill(+act[1]);
        else if (act[0] === 'q') g.useQuick(+act[1]);
      });
    });
  }

  tick(): void {
    if (!this.g) return;
    requestAnimationFrame(() => this.tick());
    if (!this.g.running) return;
    const g = this.g, h = this.hero, p = g.p, d = g.der;
    const setBar = (sel: string, v: number, max: number, text = true) => {
      const el = $(sel);
      (el.firstElementChild as HTMLElement).style.width = Math.max(0, Math.min(100, (v / max) * 100)) + '%';
      if (text) (el.querySelector('span') as HTMLElement).textContent = `${Math.max(0, Math.ceil(v))} / ${max}`;
    };
    setBar('#bars .hp', p.hp, d.maxHp);
    setBar('#bars .mp', p.mp, d.maxMp);
    setBar('#bars .st', p.st, d.maxSt, false);
    const tox = $('#bars .tox');
    tox.classList.toggle('hidden', p.manaTox <= 0);
    tox.classList.toggle('sick', p.toxSick > 0);
    (tox.firstElementChild as HTMLElement).style.width = Math.min(100, p.manaTox) + '%';
    (tox.querySelector('span') as HTMLElement).textContent = p.toxSick > 0 ? `마나 중독 ${Math.ceil(p.toxSick)}초` : `마나 중독도 ${Math.floor(p.manaTox)}%`;
    $('#bars .hp').classList.toggle('low', p.hp / d.maxHp < 0.3);
    ($('#xpbar i') as HTMLElement).style.width = (h.xp / xpToNext(h.level)) * 100 + '%';
    // 스킬 쿨다운
    const c = CLASSES[h.cls];
    $('#skillbar').querySelectorAll<HTMLElement>('.sbtn').forEach((b) => {
      const act = b.dataset.act!;
      let cd = 0, max = 1, off = false, num = '';
      if (act === 'roll') { cd = p.rollCd; max = 0.35; off = p.st < 25; }
      else if (act === 'race') { cd = p.cds.race ?? 0; max = RACES[h.race].active.cd; }
      else if (act[0] === 's') {
        const s = c.skills[+act[1]];
        cd = p.cds[s.id] ?? 0; max = s.cd; off = (h.skillLv[s.id] ?? 0) <= 0 || p.mp < s.mp || p.toxSick > 0;
        if ((h.skillLv[s.id] ?? 0) <= 0) num = `Lv${s.unlock}`;
      } else {
        const q = h.quick[+act[1]];
        if (q) num = String(countOf(h, 'use', q));
        off = !q || countOf(h, 'use', q) <= 0;
      }
      const cdel = b.querySelector('.cd') as HTMLElement;
      cdel.style.height = cd > 0 ? Math.min(100, (cd / max) * 100) + '%' : '0';
      b.classList.toggle('off', off);
      const n = b.querySelector('.num') as HTMLElement;
      const t = cd > 0.95 ? String(Math.ceil(cd)) : num;
      if (n.textContent !== t) n.textContent = t;
    });
    // 보스 바
    if (this.bossE) {
      const e = this.bossE;
      ($('#bossbar .bb i') as HTMLElement).style.width = Math.max(0, (e.hp / e.maxHp) * 100) + '%';
      ($('#bossbar .bb b') as HTMLElement).textContent = `${Math.max(0, Math.ceil(e.hp))} / ${e.maxHp}  ·  ${e.phase}페이즈`;
      if (e.dead) this.bossBar(null);
    }
    // 미니맵 (10fps)
    if (((g.time * 10) | 0) !== (this as any)._mmT) { (this as any)._mmT = (g.time * 10) | 0; this.drawMinimap(); }
    if (this.dirty) { this.dirty = false; this.refreshHud(); }
    if (g.coop.on && ((g.time * 2) | 0) !== (this as any)._ptT) { (this as any)._ptT = (g.time * 2) | 0; this.refreshParty(); }
    else if (((g.time * 4) | 0) !== (this as any)._bfT) { (this as any)._bfT = (g.time * 4) | 0; this.refreshBuffs(); }
  }

  refreshHud(): void {
    const h = this.hero;
    $('#hname').textContent = h.name;
    $('#hlv').textContent = `Lv.${h.level} ${RACES[h.race].name} ${CLASSES[h.cls].name}`;
    $('#portrait').innerHTML = img(RACES[h.race].bodies[h.gender] + '_idle_anim_f0', 2);
    $('#money').innerHTML = `${img('i_gold', 1)} ${h.gold}G &nbsp;${img('i_soul', 1)} ${h.soul}`;
    $('#region').textContent = this.g.map.name;
    const pa = $('#pointsAlert');
    const msg = [h.points ? `능력치 포인트 ${h.points} (C)` : '', h.skillPts ? `스킬 포인트 ${h.skillPts} (K)` : ''].filter(Boolean).join(' · ');
    pa.textContent = msg;
    pa.classList.toggle('hidden', !msg);
    pa.onclick = () => this.openMenu(h.points ? 'stat' : 'skill');
    // 퀘스트 추적
    // 튜토리얼(꿈) 중에는 퀘스트 추적을 숨긴다 — 안내 창이 할 일을 알려 준다
    const act = this.g.map.id === 'tutorial' ? [] : h.quests.filter((q) => !q.done).slice(0, 4);
    $('#tracker').innerHTML = act.map((q) => {
      const def = QUESTS[q.id];
      const st = def.stages[q.stage];
      if (!st) return '';
      let prog = '';
      if (st.k === 'kill') prog = ` ${q.count}/${st.n}`;
      if (st.k === 'collect') prog = ` ${Math.min(st.n, countOf(h, 'mat', st.mat))}/${st.n}`;
      const on = this.g.trackedQuest()?.id === q.id;
      return `<div class="tq ${def.main ? 'main' : ''} ${on ? 'on' : ''}" data-q="${q.id}" title="클릭하면 이 퀘스트를 길안내합니다"><b>${on ? '➤ ' : ''}${esc(def.name)}</b><br>· ${esc(st.text)}${prog}</div>`;
    }).join('') + (act.length ? `<div class="tq guide" data-g="1">${h.flags.guideOff ? '길안내 켜기' : '길안내 끄기'}</div>` : '');
    $('#tracker').querySelectorAll<HTMLElement>('[data-q]').forEach((el) => (el.onclick = () => { sfx('ui'); h.flags.track = el.dataset.q as any; this.dirty = true; }));
    const gb = $('#tracker').querySelector<HTMLElement>('[data-g]');
    if (gb) gb.onclick = () => { sfx('ui'); h.flags.guideOff = !h.flags.guideOff; this.dirty = true; };
    this.refreshBuffs();
    // 퀵슬롯 아이콘 갱신
    h.quick.forEach((q, i) => {
      const b = $(`#skillbar [data-act="q${i}"]`);
      if (!b) return;
      const im = b.querySelector('img') as HTMLImageElement | null;
      if (q && im) im.src = iconURL(CONSUMABLES[q].icon, 2);
    });
  }

  refreshBuffs(): void {
    const p = this.g.p;
    const parts: string[] = [];
    for (const b of Object.values(p.buffs)) parts.push(`<span class="buff" title="${esc(b.name)}">${img(b.icon, 1)}<i>${Math.ceil(b.t)}</i></span>`);
    if (p.stealth > 0) parts.push(`<span class="buff" title="은신">${img('bomb_f0', 1)}<i>${Math.ceil(p.stealth)}</i></span>`);
    for (const s of Object.keys(p.status) as StatusId[]) if (p.has(s)) parts.push(`<span class="buff bad" style="color:${STATUS_COLORS[s]}">${STATUS_NAMES[s]}<i>${Math.ceil(p.status[s]!.t)}</i></span>`);
    const html = parts.join('');
    const el = $('#buffs');
    if (el.innerHTML !== html) el.innerHTML = html;
  }

  drawMinimap(): void {
    const g = this.g, m = g.map;
    const cv = this.miniCv;
    const ctx = cv.getContext('2d')!;
    if (this.miniMap !== m.id + m.w) {
      this.miniMap = m.id + m.w;
      const b = document.createElement('canvas');
      b.width = m.w;
      b.height = m.h;
      const bc = b.getContext('2d')!;
      const col = ['#3d734f', '#4a8a52', '#b58057', '#aa8d7a', '#417089', '#2f5a40', '#3b2a2a', '#da4e38', '#5a4842', '#1a1316', '#0d0a0c'];
      for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) {
        bc.fillStyle = m.solid[m.idx(x, y)] ? '#24402e' : col[m.get(x, y)];
        if (m.solid[m.idx(x, y)] && m.get(x, y) === 8) bc.fillStyle = '#3a2e2c';
        bc.fillRect(x, y, 1, 1);
      }
      this.miniBase = b;
    }
    const s = Math.min(cv.width / m.w, cv.height / m.h, 2.5);
    const zoom = s < 1.6 ? 1.6 : s;
    ctx.fillStyle = '#0d0a0c';
    ctx.fillRect(0, 0, cv.width, cv.height);
    const px = g.p.x / 16, py = g.p.y / 16;
    const ox = Math.max(Math.min(0, cv.width - m.w * zoom), Math.min(0, cv.width / 2 - px * zoom));
    const oy = Math.max(Math.min(0, cv.height - m.h * zoom), Math.min(0, cv.height / 2 - py * zoom));
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(this.miniBase!, ox, oy, m.w * zoom, m.h * zoom);
    const dot = (x: number, y: number, c: string, r = 2) => { ctx.fillStyle = c; ctx.fillRect(Math.round(ox + (x / 16) * zoom - r / 2), Math.round(oy + (y / 16) * zoom - r / 2), r, r); };
    for (const ex of m.exits) { ctx.fillStyle = ex.locked && !g.hero.flags[ex.locked] ? '#a33' : '#facb3e'; ctx.fillRect(ox + ex.x * zoom, oy + ex.y * zoom, Math.max(2, ex.w * zoom), Math.max(2, ex.h * zoom)); }
    for (const e of g.enemies) if (!e.dead) dot(e.x, e.y, e.boss ? '#ff3a3a' : e.aggro ? '#ff7a5a' : '#c04040', e.boss ? 4 : 2);
    for (const n of g.npcs) dot(n.x, n.y, g.npcMarker(n.id) ? '#ffd23e' : '#7fe3ff', 2);
    for (const c of m.chests) if (!g.hero.flags['chest_' + c.id]) dot(c.x * 16 + 8, c.y * 16 + 8, '#ee8e2e', 2);
    const tg = g.hero.flags.guideOff ? null : g.questTarget();
    if (tg && Math.floor(g.time * 3) % 2 === 0) dot(tg.x, tg.y, '#facb3e', 4);
    dot(g.p.x, g.p.y, '#ffffff', 3);
  }
}

export { helpHtml } from './settings';

// ── 저장 (localStorage, 3슬롯, JSON) ─────────────────────────────
const KEY = (i: number) => `ashen_crown_slot_${i}`;
export function saveSlot(i: number, h: Hero): void {
  try { localStorage.setItem(KEY(i), JSON.stringify({ v: 1, t: Date.now(), hero: h })); } catch { /* 저장 불가 환경 */ }
}
export function loadSlot(i: number): { t: number; hero: Hero } | null {
  try {
    const s = localStorage.getItem(KEY(i));
    if (!s) return null;
    const d = JSON.parse(s);
    return d.hero ? d : null;
  } catch { return null; }
}
export function deleteSlot(i: number): void {
  try { localStorage.removeItem(KEY(i)); } catch { /* */ }
}
export function saveSettings(): void {
  try { localStorage.setItem('ashen_crown_settings', JSON.stringify(volume)); } catch { /* */ }
}
export function loadSettings(): void {
  try {
    const s = JSON.parse(localStorage.getItem('ashen_crown_settings') ?? 'null');
    if (s) setVolumes(s.sfx, s.music);
  } catch { /* */ }
}
export function fmtTime(s: number): string {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
  return h ? `${h}시간 ${m}분` : `${m}분`;
}
