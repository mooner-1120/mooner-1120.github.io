// 튜토리얼 「잿불의 꿈」 — 조작을 하나씩 해 보게 한다. 안내 문구는 지금 키 설정을 따른다.
import { sfx } from './audio';
import { keyOf } from './keys';
import type { Game } from './game';

interface Step {
  title: string;
  text: () => string;
  start?: (g: Game) => void;
  done: (g: Game, ev: Set<string>) => boolean;
  tick?: (g: Game, dt: number) => void;
}

const STEPS: Step[] = [
  {
    title: '이동',
    text: () => `바닥을 <b>좌클릭</b>(누르고 있으면 계속)하거나 <b>${keyOf('up')} ${keyOf('down')} ${keyOf('left')} ${keyOf('right')}</b> 로 움직여, 오른쪽의 빛나는 표시까지 가 보세요.`,
    done: (g) => { const m = g.map.points.mark; return Math.hypot(g.p.x - m[0], g.p.y - m[1]) < 16; },
  },
  {
    title: '대화',
    text: () => `<b>성소의 불꽃</b>에게 다가가 <b>클릭</b>하거나 <b>${keyOf('interact')}</b> 로 말을 걸어 보세요. 대사는 <b>클릭 · Space</b> 로 넘깁니다.`,
    done: (_g, ev) => ev.has('talk'),
  },
  {
    title: '공격',
    text: () => `왼쪽의 <b>허수아비</b>를 <b>좌클릭</b>하면 다가가서 계속 공격합니다. 키보드라면 <b>${keyOf('attack')}</b>. 하나를 쓰러뜨려 보세요.`,
    done: (_g, ev) => ev.has('kill'),
  },
  {
    title: '다른 적 인식',
    text: () => `<b>${keyOf('nextTarget')}</b> 를 누르면 가까운 순서대로 다른 적을 인식합니다 (청록색 괄호). 한 번 눌러 보세요.`,
    done: (_g, ev) => ev.has('cycle'),
  },
  {
    title: '스킬',
    text: () => `<b>${keyOf('skill1')}</b> 로 첫 번째 클래스 스킬을 써 보세요. 마우스 커서(키보드라면 인식한 적) 쪽으로 나갑니다. 스킬은 레벨이 오를수록 <b>${keyOf('skill2')} ${keyOf('skill3')} ${keyOf('skill4')}</b> 까지 열립니다.`,
    done: (_g, ev) => ev.has('skill'),
  },
  {
    title: '회피',
    text: () => `<b>빨간 범위</b>는 적의 공격 예고입니다. 범위가 차오르기 전에 <b>${keyOf('roll')}</b> 로 굴러서 피하세요. 구르는 순간은 무적입니다.`,
    start: (g) => { (g as any).tutHazT = 0.6; },
    tick: (g, dt) => {
      const t = ((g as any).tutHazT -= dt);
      if (t > 0) return;
      (g as any).tutHazT = 2.4;
      g.hazards.push({ x: g.p.x, y: g.p.y, shape: { k: 'circle', r: 24 }, t: 1.3, total: 1.3, team: 'enemy', dmg: 4, element: 'phys', knock: 20 });
    },
    done: (_g, ev) => ev.has('dodge'),
  },
  {
    title: '포션',
    text: () => `꿈속에서도 상처는 아픕니다. <b>${keyOf('item1')}</b> 로 체력 포션을 마셔 보세요. (<b>${keyOf('item2')}</b> 마나, <b>${keyOf('item3')}</b> 해독제)`,
    start: (g) => { g.p.hp = Math.round(g.der.maxHp * 0.5); g.hazards = []; },
    done: (_g, ev) => ev.has('potion'),
  },
  {
    title: '가방과 창',
    text: () => `<b>${keyOf('inv')}</b> 로 가방을 열어 보세요. <b>${keyOf('stat')}</b> 능력치, <b>${keyOf('skillWin')}</b> 스킬, <b>${keyOf('quest')}</b> 퀘스트. 닫을 때는 <b>Esc</b>. 키는 오른쪽 위 <b>⚙</b> 에서 바꿀 수 있습니다.`,
    done: (_g, ev) => ev.has('menu'),
  },
  {
    title: '깨어나기',
    text: () => '잘했다. 북쪽 길 끝, <b>빛의 문</b>으로 걸어가 꿈에서 깨어나라. 금색 화살표는 언제나 다음 목적지를 가리킨다.',
    start: (g) => g.setFlag('tut_done'),
    done: () => false,
  },
];

export class Tutorial {
  step = 0;
  ev = new Set<string>();
  active = false;
  el: HTMLElement;
  constructor(private g: Game) {
    this.el = document.createElement('div');
    this.el.id = 'tutorial';
    this.el.className = 'hidden';
    document.getElementById('ui')!.appendChild(this.el);
  }

  begin(): void {
    this.active = true;
    this.step = 0;
    this.ev.clear();
    STEPS[0].start?.(this.g);
    this.render();
  }

  end(): void {
    this.active = false;
    this.el.className = 'hidden';
  }

  event(name: string): void {
    if (this.active) this.ev.add(name);
  }

  /** 지금 단계가 가리킬 곳 (길안내 화살표) */
  target(): { x: number; y: number; label: string } | null {
    if (!this.active) return null;
    const g = this.g;
    const s = STEPS[this.step].title;
    if (s === '이동') { const m = g.map.points.mark; return { x: m[0], y: m[1], label: '빛나는 표시' }; }
    if (s === '대화') { const n = g.npcs.find((n) => n.id === 'tutor'); return n ? { x: n.x, y: n.y - 14, label: '' } : null; }
    if (s === '공격') { const e = g.enemies.find((e) => !e.dead && e.d.id === 'dummy'); return e ? { x: e.x, y: e.y - 6, label: '허수아비' } : null; }
    if (s === '깨어나기') { const m = g.map.points.exit; return { x: m[0], y: m[1], label: '빛의 문' }; }
    return null;
  }

  update(dt: number): void {
    if (!this.active) return;
    if (this.g.map.id !== 'tutorial') { this.end(); return; }
    const st = STEPS[this.step];
    st.tick?.(this.g, dt);
    if (st.done(this.g, this.ev)) {
      sfx('buff');
      this.g.ui.toast(`✔ ${st.title}`, '#9be06a');
      this.step++;
      this.ev.clear();
      STEPS[this.step]?.start?.(this.g);
      this.render();
    }
  }

  render(): void {
    const st = STEPS[this.step];
    if (!st) return;
    this.el.className = '';
    this.el.innerHTML = `
      <div class="th"><span>잿불의 꿈 · ${this.step + 1}/${STEPS.length}</span><b>${st.title}</b><button id="tutSkip">튜토리얼 건너뛰기</button></div>
      <div class="tt">${st.text()}</div>
      <div class="tp">${STEPS.map((_, i) => `<i class="${i < this.step ? 'ok' : i === this.step ? 'on' : ''}"></i>`).join('')}</div>`;
    (this.el.querySelector('#tutSkip') as HTMLElement).onclick = () => {
      sfx('ui');
      this.g.setFlag('tut_done');
      this.end();
      this.g.leaveTutorial();
    };
  }
}
