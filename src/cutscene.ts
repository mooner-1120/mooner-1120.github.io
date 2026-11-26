// 오프닝 컷신 — 도트 그림 + 한 글자씩 나오는 내레이션. 클릭·Space·Enter 로 넘기고 Esc 로 건너뛴다.
import { music, sfx } from './audio';
import { RaceId } from './data';
import { HOME } from './homes';

interface Slide { img: string; title: string; lines: string[] }

const BASE: Slide[] = [
  { img: 'cs1_war', title: '천 년 전', lines: ['대륙 아르카디아의 다섯 종족은 백 년 가까이 서로를 죽였다.', '사람들은 그 시대를 오족 전쟁이라 부른다.'] },
  { img: 'cs2_crown', title: '태양 왕관', lines: ['인간 영웅 아우렐리온은 다섯 종족의 영웅과 함께 태양 왕관을 만들었다.', '왕관의 맹약 아래 누구도 서로를 해칠 수 없었고, 솔라리온 왕국의 천 년 평화가 시작되었다.', '사람들은 그가 북방의 마족을 물리치고 균열을 봉인했다고 기억한다.'] },
  { img: 'cs3_ash', title: '잿빛 왕관', lines: ['천 년 동안 황금빛이던 왕관은, 언제부턴가 색이 바래기 시작했다.', '사람들은 그것을 왕가의 쇠락이라 여겼고, 잿빛 왕관이라 불렀다.'] },
  { img: 'cs4_king', title: '사라진 왕관', lines: ['그리고 1년 전, 국왕 발레리안 3세가 후계자 없이 세상을 떠났다.', '그날 밤 왕관도 함께 사라졌다.', '섭정 재상 모르데인은 근위대장 가르토를 도둑으로 지목했다.'] },
  { img: 'cs5_rift', title: '붉은 하늘', lines: ['맹약이 약해지자 종족들은 서로를 의심하기 시작했다.', '북쪽 하늘이 붉게 찢어지고, 균열 너머에서 마족의 군세가 다시 움직인다.'] },
];

function lastSlide(race: RaceId): Slide {
  return {
    img: 'cs6_' + race,
    title: HOME[race].name,
    lines: [
      `그리고 오늘 밤, ${HOME[race].name}의 맹약 성소가 꺼져 가고 있다.`,
      '잿빛 짐승들이 마지막 불꽃을 노린다.',
      '이 이야기는, 그 불꽃이 당신을 고른 밤에서 시작된다.',
    ],
  };
}

/** race 를 주면 마지막에 종족별 장면을 붙인다 */
export function playIntro(race?: RaceId): Promise<void> {
  const slides = race ? [...BASE, lastSlide(race)] : BASE;
  const root = document.getElementById('screen')!;
  root.className = 'on cutscene';
  music('title');
  return new Promise((resolve) => {
    let si = 0, li = 0, shown = 0, timer = 0;
    let full = '';
    const finish = () => {
      clearInterval(timer);
      window.removeEventListener('keydown', onKey, true);
      root.className = '';
      root.innerHTML = '';
      resolve();
    };
    const fit = () => {
      const im = root.querySelector('.csimg') as HTMLImageElement | null;
      if (!im) return;
      const k = Math.max(1, Math.floor(Math.min(window.innerWidth / 480, (window.innerHeight * 0.72) / 270) * 2) / 2);
      im.style.width = 480 * k + 'px';
      im.style.height = 270 * k + 'px';
    };
    const drawSlide = () => {
      const s = slides[si];
      root.innerHTML = `
        <div class="csbox">
          <img class="csimg" src="./cutscenes/${s.img}.png" alt="">
          <div class="cscap"><div class="cst">${s.title}</div><div class="csl"></div><div class="csh">클릭 · Space 다음 &nbsp;|&nbsp; Esc 건너뛰기 &nbsp; ${si + 1}/${slides.length}</div></div>
          <button class="btn csskip">건너뛰기 ▶▶</button>
        </div>`;
      fit();
      (root.querySelector('.csskip') as HTMLElement).onclick = (e) => { e.stopPropagation(); sfx('ui'); finish(); };
      (root.querySelector('.csbox') as HTMLElement).onclick = () => next();
      li = 0;
      typeLine();
    };
    const typeLine = () => {
      const s = slides[si];
      full = s.lines[li];
      shown = 0;
      clearInterval(timer);
      const el = root.querySelector('.csl') as HTMLElement;
      const prev = s.lines.slice(0, li).map((l) => `<p>${l}</p>`).join('');
      timer = window.setInterval(() => {
        shown++;
        el.innerHTML = prev + `<p>${full.slice(0, shown)}<span class="cur">▌</span></p>`;
        if (shown % 3 === 0) sfx('step');
        if (shown >= full.length) { clearInterval(timer); el.innerHTML = prev + `<p>${full}</p>`; }
      }, 38);
    };
    const next = () => {
      const s = slides[si];
      if (shown < full.length) {
        // 타자 중이면 그 줄을 바로 다 보여 준다
        shown = full.length;
        clearInterval(timer);
        (root.querySelector('.csl') as HTMLElement).innerHTML = s.lines.slice(0, li + 1).map((l) => `<p>${l}</p>`).join('');
        return;
      }
      sfx('ui');
      if (li < s.lines.length - 1) { li++; typeLine(); return; }
      si++;
      if (si >= slides.length) { finish(); return; }
      drawSlide();
    };
    const onKey = (e: KeyboardEvent) => {
      if (!root.classList.contains('cutscene')) return;
      e.preventDefault();
      e.stopImmediatePropagation();
      if (e.code === 'Escape') finish();
      else if (e.code === 'Space' || e.code === 'Enter') next();
    };
    window.addEventListener('keydown', onKey, true);
    window.addEventListener('resize', fit);
    drawSlide();
  });
}
