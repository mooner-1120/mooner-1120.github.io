// 그리기: 저해상도 월드 캔버스 → 정수 배율로 확대 → 고해상도 글자 오버레이
import { anim, drawFrame, drawRotated, drawSil, frame } from './assets';
import { CLASSES } from './data';
import { Enemy, Hazard, NpcEnt, STATUS_COLORS, StatusId } from './entities';
import type { Game } from './game';
import { baseOf } from './items';
import { RARITY } from './data';
import { TS } from './tilemap';

type Drawable = { y: number; draw: () => void };

export function renderGame(g: Game): void {
  const w = g.wctx;
  const { vw, vh } = g;
  const sx = g.shakeA > 0 ? (Math.random() * 2 - 1) * g.shakeA : 0;
  const sy = g.shakeA > 0 ? (Math.random() * 2 - 1) * g.shakeA : 0;
  const cx = Math.round(g.cam.x + sx), cy = Math.round(g.cam.y + sy);
  w.setTransform(1, 0, 0, 1, 0, 0);
  w.fillStyle = '#0d0a0c';
  w.fillRect(0, 0, vw, vh);
  if (!g.map) return;
  w.translate(-cx, -cy);
  const m = g.map;
  m.drawGround(w, cx, cy, vw, vh, g.time);
  const inView = (x: number, y: number, pad = 48) => x > cx - pad && x < cx + vw + pad && y > cy - pad && y < cy + vh + pad + 40;

  // 바닥 오브젝트
  for (const o of m.objects) if (o.layer === 'ground' && inView(o.x, o.y)) drawFrame(w, m.objFrame(o, g.time), o.x, o.y, { flip: o.flip });
  // 장판
  for (const z of g.zones) drawZone(g, z);
  // 경고 표시
  for (const h of g.hazards) if (!h.silent && h.t > 0) drawHazard(w, h, g.time);

  const list: Drawable[] = [];
  // 오브젝트
  for (const o of m.objects) {
    if (o.layer === 'ground' || !inView(o.x, o.y, 80)) continue;
    if (o.tag === 'portal') { list.push({ y: o.y - 20, draw: () => drawPortal(w, o.x, o.y, g.time) }); continue; }
    list.push({ y: o.y, draw: () => drawFrame(w, m.objFrame(o, g.time), o.x, o.y, { flip: o.flip }) });
  }
  // 상자
  for (const c of m.chests) {
    const x = c.x * TS + 8, y = c.y * TS + 16;
    if (!inView(x, y)) continue;
    const opened = !!g.hero.flags['chest_' + c.id];
    const ot = (c as any).openT ?? 9;
    (c as any).openT = ot + 1 / 60;
    const f = opened ? Math.min(2, Math.floor(ot * 10)) : 0;
    list.push({ y, draw: () => { shadow(w, x, y - 1, 7); drawFrame(w, 'chest_full_open_anim_f' + f, x, y); if (!opened) sparkle(w, x, y - 14, g.time); } });
  }
  // 떨어진 물건
  for (const d of g.drops) {
    if (!inView(d.x, d.y)) continue;
    list.push({
      y: d.y,
      draw: () => {
        const bob = d.z + (d.z === 0 ? Math.sin(g.time * 4 + d.x) * 1 : 0);
        shadow(w, d.x, d.y, 3);
        if (d.kind === 'gold') drawFrame(w, 'coin_anim_f' + (Math.floor(g.time * 8 + d.x) % 4), d.x, d.y - bob);
        else if (d.kind === 'soul') drawFrame(w, 'i_soul', d.x, d.y - bob, {});
        else if (d.kind === 'item' && d.item) {
          const col = RARITY[d.item.rarity].color;
          if (d.item.rarity >= 2) { w.globalAlpha = 0.35 + Math.sin(g.time * 5) * 0.1; w.fillStyle = col; w.fillRect(Math.round(d.x) - 1, Math.round(d.y - 26), 2, 24); w.globalAlpha = 1; }
          drawFrame(w, baseOf(d.item).icon, d.x, d.y - bob);
        } else if (d.kind === 'use' && d.id) drawFrame(w, d.id === 'hp_s' ? 'flask_red' : 'flask_blue', d.x, d.y - bob);
        else drawFrame(w, d.id === 'seal' ? 'i_amulet_blue' : d.id === 'hide' ? 'i_armor_leather' : d.id === 'silk' ? 'i_helm_cloth' : 'skull', d.x, d.y - bob);
      },
    });
  }
  // NPC
  for (const n of g.npcs) if (inView(n.x, n.y)) list.push({ y: n.y, draw: () => drawNpc(w, n) });
  // 적
  for (const e of g.enemies) if (inView(e.x, e.y)) list.push({ y: e.y, draw: () => drawEnemy(g, e) });
  // 플레이어
  list.push({ y: g.p.y, draw: () => drawPlayer(g) });
  list.sort((a, b) => a.y - b.y);
  for (const d of list) d.draw();

  // 투사체
  for (const pr of g.projs) {
    const ang = Math.atan2(pr.vy, pr.vx);
    if (pr.kind === 'arrow') drawRotated(w, 'weapon_arrow', pr.x, pr.y, ang + Math.PI / 2, 0.5, 0.3);
    else if (pr.kind === 'axe') drawRotated(w, 'weapon_throwing_axe', pr.x, pr.y, pr.spin ?? 0, 0.5, 0.5);
    else if (pr.kind === 'orb') drawFrame(w, pr.sprite + '_' + (Math.floor(g.time * 10) % 2), pr.x, pr.y, { ay: 0.5 });
    else drawRotated(w, pr.sprite, pr.x, pr.y, ang + Math.PI / 2, 0.5, 0.5);
  }
  // 파티클
  for (const q of g.parts) drawParticle(w, q, g);

  // 조명 (어두운 지역)
  if (m.dark) {
    const l = g.lctx;
    l.setTransform(1, 0, 0, 1, 0, 0);
    l.globalCompositeOperation = 'source-over';
    l.clearRect(0, 0, vw, vh);
    l.fillStyle = m.ambient;
    l.fillRect(0, 0, vw, vh);
    l.globalCompositeOperation = 'destination-out';
    const hole = (x: number, y: number, r: number, a = 1) => {
      const gr = l.createRadialGradient(x - cx, y - cy, 0, x - cx, y - cy, r);
      gr.addColorStop(0, `rgba(0,0,0,${a})`);
      gr.addColorStop(0.55, `rgba(0,0,0,${a * 0.75})`);
      gr.addColorStop(1, 'rgba(0,0,0,0)');
      l.fillStyle = gr;
      l.fillRect(x - cx - r, y - cy - r, r * 2, r * 2);
    };
    const flick = 1 + Math.sin(g.time * 13) * 0.03 + Math.sin(g.time * 7.3) * 0.03;
    hole(g.p.x, g.p.y - 8, 100 * flick);
    for (const o of m.objects) if (o.light && inView(o.x, o.y, o.light)) hole(o.x, o.y - 10, o.light * flick, 0.9);
    for (const pr of g.projs) if (pr.kind === 'orb') hole(pr.x, pr.y, 34, 0.8);
    for (const q of g.parts) if (q.kind === 'ring' && q.r && q.r > 20) hole(q.x, q.y, q.r * 1.5, (q.life / q.max) * 0.8);
    for (const h of g.hazards) if (!h.silent && h.team === 'enemy') hole(h.x, h.y, 40, 0.5);
    for (const z of g.zones) hole(z.x, z.y, z.r + 10, 0.6);
    for (const d of g.drops) if (d.kind === 'item') hole(d.x, d.y - 8, 18, 0.6);
    w.setTransform(1, 0, 0, 1, 0, 0);
    w.drawImage(g.light, 0, 0);
    // 횃불의 따뜻한 빛
    w.globalCompositeOperation = 'lighter';
    for (const o of m.objects) {
      if (!o.light || !inView(o.x, o.y, o.light)) continue;
      const gr = w.createRadialGradient(o.x - cx, o.y - 10 - cy, 0, o.x - cx, o.y - 10 - cy, o.light * 0.6);
      gr.addColorStop(0, 'rgba(255,140,60,0.18)');
      gr.addColorStop(1, 'rgba(255,140,60,0)');
      w.fillStyle = gr;
      w.fillRect(o.x - cx - o.light, o.y - 10 - cy - o.light, o.light * 2, o.light * 2);
    }
    w.globalCompositeOperation = 'source-over';
    w.translate(-cx, -cy);
  }
  // 적 HP 바 (조명 위)
  for (const e of g.enemies) {
    if (e.dead || e.boss || !inView(e.x, e.y)) continue;
    if (e.hpBarT <= 0 && !e.aggro && e.hp >= e.maxHp) continue;
    const h = (frame(anim(e.sprite, 'idle')[0])?.[3] ?? 16) * e.scale;
    const bw = e.d.elite ? 20 : 14;
    const x = Math.round(e.x - bw / 2), y = Math.round(e.y - h - 4);
    w.fillStyle = '#222';
    w.fillRect(x - 1, y - 1, bw + 2, 4);
    w.fillStyle = '#5a1a1a';
    w.fillRect(x, y, bw, 2);
    w.fillStyle = e.d.elite ? '#ff9a3a' : '#e04040';
    w.fillRect(x, y, Math.max(0, Math.round((bw * e.hp) / e.maxHp)), 2);
    // 상태이상 점
    let k = 0;
    for (const s of Object.keys(e.status) as StatusId[]) {
      if (!e.has(s)) continue;
      w.fillStyle = STATUS_COLORS[s];
      w.fillRect(x + k * 3, y - 4, 2, 2);
      k++;
    }
  }
  const guide = drawGuide(g, w, cx, cy);
  w.setTransform(1, 0, 0, 1, 0, 0);

  // ── 확대해서 화면에 ──
  const ctx = g.ctx;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(g.world, 0, 0, vw * g.scale, vh * g.scale);

  // ── 글자 오버레이 ──
  const S = g.scale;
  const fsU = Math.max(1, Math.round(S / 3), Math.round(g.dpr()));
  const toS = (x: number, y: number): [number, number] => [Math.round((x - cx) * S), Math.round((y - cy) * S)];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'alphabetic';
  // NPC 이름·퀘스트 표시
  for (const n of g.npcs) {
    if (!inView(n.x, n.y)) continue;
    const h = frame(anim(n.sprite, 'idle')[0])?.[3] ?? 24;
    const [x, y] = toS(n.x, n.y - h + 3);
    outlineText(ctx, n.name, x, y, `${11 * fsU}px Galmuri11`, '#e8f4ff', fsU);
    const mk = g.npcMarker(n.id);
    if (mk) {
      const bob = Math.round(Math.sin(g.time * 5) * 2 * fsU);
      outlineText(ctx, mk, x, y - 13 * fsU + bob, `bold ${22 * fsU}px Galmuri11`, mk === '!' ? '#ffd23e' : '#7fe3ff', fsU * 2);
    }
  }
  // 마우스 올린 적 이름
  if (!g.touch) {
    const he = g.enemyAt(g.mouse.wx, g.mouse.wy);
    if (he && !he.boss) {
      const h = (frame(anim(he.sprite, 'idle')[0])?.[3] ?? 16) * he.scale;
      const [x, y] = toS(he.x, he.y - h - 8);
      outlineText(ctx, `Lv.${he.d.level} ${he.d.name}`, x, y, `${11 * fsU}px Galmuri11`, he.d.elite ? '#ffb35a' : '#ffd0d0', fsU);
    }
  }
  // 대상 표시
  const tg = g.p.target;
  if (tg instanceof Enemy && !tg.dead) {
    w.setTransform(1, 0, 0, 1, 0, 0);
  }
  // 길안내 글자
  if (guide) {
    const [x, y] = [Math.round(guide.lx * S), Math.round(guide.ly * S)];
    ctx.textAlign = guide.align;
    outlineText(ctx, guide.text, x, y, `${11 * fsU}px Galmuri11`, '#ffe48a', fsU);
    ctx.textAlign = 'center';
  }
  // 떠오르는 숫자
  for (const t of g.texts) {
    const [x, y] = toS(t.x, t.y);
    const a = Math.min(1, t.life * 3);
    ctx.globalAlpha = a;
    outlineText(ctx, t.text, x, y, `${t.big ? 'bold ' : ''}${(t.big ? 22 : 11) * fsU}px Galmuri11`, t.color, fsU * (t.big ? 2 : 1));
    ctx.globalAlpha = 1;
  }
  // 적 머리 위 '!' (감지)
  for (const q of g.parts) {
    if (q.kind !== 'text') continue;
    const [x, y] = toS(q.x, q.y);
    outlineText(ctx, q.sprite ?? '!', x, y, `bold ${22 * fsU}px Galmuri11`, q.color, fsU * 2);
  }
  // 사망 / 페이드
  if (g.p.dead) {
    ctx.fillStyle = `rgba(60,0,0,${Math.min(0.55, g.p.deathT * 0.5)})`;
    ctx.fillRect(0, 0, g.cv.width, g.cv.height);
  }
  if (g.fade > 0) {
    ctx.fillStyle = `rgba(0,0,0,${g.fade})`;
    ctx.fillRect(0, 0, g.cv.width, g.cv.height);
  }
}

function outlineText(ctx: CanvasRenderingContext2D, s: string, x: number, y: number, font: string, color: string, o: number): void {
  ctx.font = font;
  ctx.fillStyle = '#1a1214';
  for (const [dx, dy] of [[-o, 0], [o, 0], [0, -o], [0, o], [-o, -o], [o, o], [-o, o], [o, -o]]) ctx.fillText(s, x + dx, y + dy);
  ctx.fillStyle = color;
  ctx.fillText(s, x, y);
}

function shadow(w: CanvasRenderingContext2D, x: number, y: number, r: number): void {
  w.fillStyle = 'rgba(0,0,0,0.28)';
  const rx = Math.round(x), ry = Math.round(y);
  w.fillRect(rx - r + 1, ry - 1, r * 2 - 2, 2);
  w.fillRect(rx - r, ry, r * 2, 1);
  w.fillRect(rx - r + 2, ry + 1, r * 2 - 4, 1);
}

function sparkle(w: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const p = (t * 1.3) % 1;
  if (p > 0.4) return;
  w.fillStyle = '#fdf7ed';
  const sx = Math.round(x + 4), sy = Math.round(y);
  w.fillRect(sx, sy - 1, 1, 3);
  w.fillRect(sx - 1, sy, 3, 1);
}

function actorFrame(sprite: string, moving: boolean, hit: boolean, t: number): string {
  const kind = hit ? 'hit' : moving ? 'run' : 'idle';
  const fr = anim(sprite, kind);
  if (!fr.length) return sprite;
  return fr[Math.floor(t * (kind === 'run' ? 11 : 6)) % fr.length];
}

function drawNpc(w: CanvasRenderingContext2D, n: NpcEnt): void {
  shadow(w, n.x, n.y, 6);
  drawFrame(w, actorFrame(n.sprite, n.moving, false, n.animT), n.x, n.y, { flip: n.flip });
}

function drawEnemy(g: Game, e: Enemy): void {
  const w = g.wctx;
  const f = actorFrame(e.sprite, e.moving || e.state === 'charge', false, e.animT * (e.state === 'charge' ? 2 : 1));
  const h = frame(f)?.[3] ?? 16;
  if (e.dead) {
    const a = Math.max(0, 1 - e.deathT / 0.6);
    drawFrame(w, f, e.x, e.y + e.deathT * 6, { flip: e.flip, alpha: a, scale: e.scale });
    return;
  }
  shadow(w, e.x, e.y, Math.max(5, e.r));
  let ox = 0;
  if (e.state === 'windup') ox = Math.sin(g.time * 60) * 0.8;
  drawFrame(w, f, e.x + ox, e.y, { flip: e.flip, scale: e.scale });
  if (e.flash > 0) drawSil(w, f, '#ffffff', e.x + ox, e.y, e.flip, Math.min(1, e.flash * 8));
  else if (e.state === 'windup') drawSil(w, f, '#ff3030', e.x + ox, e.y, e.flip, 0.25 + Math.sin(g.time * 30) * 0.15);
  else if ((e as any).enraged) drawSil(w, f, '#ff2020', e.x, e.y, e.flip, 0.18);
  if (e.has('slow')) drawSil(w, f, '#9be3ff', e.x, e.y, e.flip, 0.35);
  if (e.has('poison')) drawSil(w, f, '#6ad040', e.x, e.y, e.flip, 0.2 + Math.sin(g.time * 8) * 0.1);
  if (e.has('stun')) {
    for (let i = 0; i < 3; i++) {
      const a = g.time * 6 + (i * Math.PI * 2) / 3;
      w.fillStyle = '#ffe26a';
      w.fillRect(Math.round(e.x + Math.cos(a) * 6), Math.round(e.y - h * e.scale - 3 + Math.sin(a) * 2), 1, 1);
    }
  }
  if (e.has('root')) {
    w.fillStyle = '#b6cbcf';
    w.fillRect(Math.round(e.x - 5), Math.round(e.y - 2), 10, 1);
    w.fillRect(Math.round(e.x - 4), Math.round(e.y - 4), 1, 3);
    w.fillRect(Math.round(e.x + 3), Math.round(e.y - 4), 1, 3);
  }
  // 인식 표시 (키보드 전투): 청록색 모서리 괄호
  if (g.p.lock === e && g.p.target !== e) {
    w.fillStyle = '#7fe3ff';
    const h = (frame(f)?.[3] ?? 16) * e.scale;
    const x0 = Math.round(e.x - Math.max(7, e.r + 2)), x1 = Math.round(e.x + Math.max(7, e.r + 2));
    const y0 = Math.round(e.y - h - 2), y1 = Math.round(e.y + 2);
    const pulse = Math.floor(g.time * 4) % 2;
    for (const [x, sx] of [[x0 - pulse, 1], [x1 + pulse, -1]] as const)
      for (const [y, sy] of [[y0 - pulse, 1], [y1 + pulse, -1]] as const) { w.fillRect(x, y, 1, 1); w.fillRect(x + sx, y, 3 * sx, 1); w.fillRect(x, y + sy, 1, 3 * sy); }
    // 머리 위 작은 청록 삼각형
    const tx = Math.round(e.x), ty = y0 - 4 - pulse;
    w.fillRect(tx - 2, ty - 2, 5, 1); w.fillRect(tx - 1, ty - 1, 3, 1); w.fillRect(tx, ty, 1, 1);
  }
  // 대상 표시
  if (g.p.target === e) {
    w.fillStyle = '#ff5050';
    const t = Math.floor(g.time * 4) % 2;
    const x = Math.round(e.x), y = Math.round(e.y) + 2;
    const r = Math.max(6, e.r) + t;
    w.fillRect(x - r, y, 3, 1); w.fillRect(x + r - 2, y, 3, 1);
    w.fillRect(x - r, y - 1, 1, 1); w.fillRect(x + r, y - 1, 1, 1);
  }
}

function drawPlayer(g: Game): void {
  const w = g.wctx;
  const p = g.p;
  const f = g.playerFrame();
  const h = frame(f)?.[3] ?? 24;
  if (p.dead) {
    drawRotated(w, f, p.x, p.y - 3, p.flip ? -Math.PI / 2 : Math.PI / 2, 0.5, 0.9);
    return;
  }
  shadow(w, p.x, p.y, 6);
  const alpha = p.stealth > 0 ? 0.4 : 1;
  // 무기 (뒤쪽): 활·지팡이는 몸 뒤
  const wep = g.hero.equip.weapon ? baseOf(g.hero.equip.weapon).icon : '';
  const cls = g.hero.cls;
  const handX = p.x + (p.flip ? -4 : 4), handY = p.y - 7;
  const swingP = p.swingT > 0 ? 1 - p.swingT / p.swingDur : -1;
  const drawWeapon = () => {
    if (!wep) return;
    const c = CLASSES[cls].basic.kind;
    if (c === 'arrow') {
      const a = swingP >= 0 || p.target ? p.aimAng : p.flip ? Math.PI : 0;
      drawRotated(w, wep, p.x + Math.cos(a) * 5, p.y - 9 + Math.sin(a) * 4, a, 0.5, 0.5, false);
      return;
    }
    if (c === 'bolt') {
      const tilt = swingP >= 0 ? (p.flip ? -0.6 : 0.6) * Math.sin(swingP * Math.PI) : p.flip ? -0.15 : 0.15;
      drawRotated(w, wep, handX, handY + 3, tilt, 0.5, 0.75);
      return;
    }
    let ang: number;
    if (swingP >= 0) {
      const base = p.aimAng + Math.PI / 2;
      const dir = Math.cos(p.aimAng) < 0 ? -1 : 1;
      const k = p.combo % 2 === 0 ? -1 : 1;
      ang = base + dir * k * (-1.5 + 3.0 * easeOut(swingP));
    } else ang = p.flip ? -0.5 : 0.5;
    drawRotated(w, wep, handX, handY, ang, 0.5, 0.92);
  };
  const behind = cls === 'archer' ? Math.sin(p.aimAng) < -0.3 : cls === 'mage' ? false : swingP < 0 && false;
  if (behind) drawWeapon();
  if (p.roll) {
    const prog = 1 - p.roll.t / 0.3;
    drawRotated(w, f, p.x, p.y - h / 2, (p.flip ? -1 : 1) * prog * Math.PI * 2, 0.5, 0.5, p.flip);
  } else {
    w.globalAlpha = alpha;
    drawFrame(w, f, p.x, p.y, { flip: p.flip });
    w.globalAlpha = 1;
    if (p.flash > 0) drawSil(w, f, '#ff4040', p.x, p.y, p.flip, Math.min(0.8, p.flash * 4));
    if (p.has('poison')) drawSil(w, f, '#6ad040', p.x, p.y, p.flip, 0.2);
    if (p.has('slow')) drawSil(w, f, '#9be3ff', p.x, p.y, p.flip, 0.3);
    if (p.has('burn')) drawSil(w, f, '#ff8a2e', p.x, p.y, p.flip, 0.2 + Math.sin(g.time * 20) * 0.1);
  }
  if (!behind && !p.roll) drawWeapon();
  // 방패 막기
  if (p.block > 0) {
    const off = g.hero.equip.offhand ? baseOf(g.hero.equip.offhand).icon : 'i_shield_red';
    drawFrame(w, off, p.x + (p.flip ? -7 : 7), p.y - 3, {});
    if (p.parry > 0) {
      w.strokeStyle = '#7fe3ff';
      w.beginPath();
      w.arc(Math.round(p.x + (p.flip ? -7 : 7)), Math.round(p.y - 10), 9, 0, Math.PI * 2);
      w.stroke();
    }
  }
  if (p.invuln > 0 && p.buffs.barrier) {
    w.globalAlpha = 0.35 + Math.sin(g.time * 12) * 0.1;
    w.strokeStyle = '#facb3e';
    w.beginPath();
    w.ellipse(Math.round(p.x) + 0.5, Math.round(p.y - h / 2) + 0.5, 11, h / 2 + 3, 0, 0, Math.PI * 2);
    w.stroke();
    w.globalAlpha = 1;
  }
  if (p.buffs.will || p.buffs.war_cry) {
    w.fillStyle = p.buffs.will ? '#facb3e' : '#ffd36a';
    for (let i = 0; i < 2; i++) {
      const a = g.time * 4 + i * Math.PI;
      w.fillRect(Math.round(p.x + Math.cos(a) * 9), Math.round(p.y - 6 + Math.sin(a) * 3), 1, 2);
    }
  }
  if (p.has('stun')) {
    for (let i = 0; i < 3; i++) {
      const a = g.time * 6 + (i * Math.PI * 2) / 3;
      w.fillStyle = '#ffe26a';
      w.fillRect(Math.round(p.x + Math.cos(a) * 6), Math.round(p.y - h - 3 + Math.sin(a) * 2), 1, 1);
    }
  }
}

function easeOut(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

function drawHazard(w: CanvasRenderingContext2D, h: Hazard, time: number): void {
  const enemy = h.team === 'enemy';
  const fake = (h as any).fake;
  const prog = h.total > 0 ? 1 - h.t / h.total : 1;
  const base = enemy ? '218,60,46' : '250,203,62';
  w.save();
  w.translate(Math.round(h.x), Math.round(h.y));
  const path = (scale: number) => {
    w.beginPath();
    const s = h.shape;
    if (s.k === 'circle') w.arc(0, 0, s.r * scale, 0, Math.PI * 2);
    else if (s.k === 'ring') { w.arc(0, 0, s.r, 0, Math.PI * 2); w.arc(0, 0, s.inner, 0, Math.PI * 2, true); }
    else if (s.k === 'cone') { w.moveTo(0, 0); w.arc(0, 0, s.r * scale, s.ang - s.spread, s.ang + s.spread); w.closePath(); }
    else if (s.k === 'line') { w.rotate(s.ang); w.rect(0, -s.w / 2, s.len * (fake ? 1 : scale), s.w); w.rotate(-s.ang); }
  };
  w.fillStyle = `rgba(${base},${enemy ? 0.16 : 0.12})`;
  path(1);
  w.fill('evenodd');
  w.fillStyle = `rgba(${base},${enemy ? 0.3 : 0.22})`;
  if (h.shape.k !== 'ring') { path(Math.max(0.05, prog)); w.fill(); }
  w.strokeStyle = `rgba(${enemy ? '255,90,70' : '255,230,120'},${0.6 + Math.sin(time * 20) * 0.2})`;
  w.lineWidth = 1;
  path(1);
  w.stroke();
  w.restore();
}

function drawZone(g: Game, z: import('./entities').Zone): void {
  const w = g.wctx;
  const x = Math.round(z.x), y = Math.round(z.y);
  const fadeIn = Math.min(1, (z.total - z.t) * 4, z.t * 2);
  w.save();
  w.globalAlpha = fadeIn;
  if (z.kind === 'trap') {
    w.fillStyle = '#545454';
    w.fillRect(x - 5, y - 1, 10, 3);
    w.fillStyle = '#b6cbcf';
    for (let i = -4; i <= 4; i += 2) w.fillRect(x + i, y - 3, 1, 2);
    w.restore();
    return;
  }
  const col = z.kind === 'frost' ? '114,214,206' : z.kind === 'rain' ? '211,191,169' : z.kind === 'poison' ? '75,167,71' : '238,142,46';
  w.fillStyle = `rgba(${col},0.22)`;
  w.beginPath();
  w.ellipse(x, y, z.r, z.r * 0.75, 0, 0, Math.PI * 2);
  w.fill();
  w.strokeStyle = `rgba(${col},0.7)`;
  w.setLineDash([3, 2]);
  w.lineDashOffset = -g.time * 10;
  w.stroke();
  w.restore();
}

function drawPortal(w: CanvasRenderingContext2D, x: number, y: number, t: number): void {
  const cx = Math.round(x), cy = Math.round(y - 14);
  const cols = ['#21141b', '#5f2d56', '#9f294e', '#da4e38', '#ee8e2e'];
  for (let i = 0; i < cols.length; i++) {
    w.fillStyle = cols[i];
    const r = 14 - i * 2.6 + Math.sin(t * 3 + i) * 0.6;
    w.beginPath();
    w.ellipse(cx, cy, Math.max(1, r * 0.7), Math.max(1, r), 0, 0, Math.PI * 2);
    w.fill();
  }
  for (let i = 0; i < 8; i++) {
    const a = t * 2 + (i * Math.PI) / 4;
    w.fillStyle = i % 2 ? '#facb3e' : '#dc4a7b';
    w.fillRect(Math.round(cx + Math.cos(a) * 8), Math.round(cy + Math.sin(a) * 12), 1, 1);
  }
}

function drawParticle(w: CanvasRenderingContext2D, q: import('./entities').Particle, g: Game): void {
  const a = Math.max(0, q.life / q.max);
  const x = Math.round(q.x), y = Math.round(q.y - q.z);
  switch (q.kind) {
    case 'text':
      return;
    case 'smoke': {
      w.globalAlpha = a * 0.6;
      w.fillStyle = q.color;
      const r = Math.round(q.size + (1 - a) * 3);
      w.fillRect(x - r, y - r, r * 2, r * 2);
      w.globalAlpha = 1;
      return;
    }
    case 'ring': {
      w.globalAlpha = a;
      w.strokeStyle = q.color;
      w.lineWidth = 1;
      const r = (q.r ?? 10) * (1.15 - a * 0.6);
      w.beginPath();
      w.ellipse(x + 0.5, y + 0.5, r, r * 0.75, 0, 0, Math.PI * 2);
      w.stroke();
      w.globalAlpha = 1;
      return;
    }
    case 'slash': {
      w.globalAlpha = Math.min(1, a * 1.5);
      w.strokeStyle = q.color;
      w.lineWidth = q.size;
      const r = q.r ?? 12;
      const ang = q.ang ?? 0;
      const sweep = 1.6 * (1 - a * 0.4);
      w.beginPath();
      w.arc(x - Math.cos(ang) * r * 0.6, y - Math.sin(ang) * r * 0.6, r, ang - sweep / 2, ang + sweep / 2);
      w.stroke();
      w.lineWidth = 1;
      w.globalAlpha = 1;
      return;
    }
    case 'star':
    case 'cross':
      w.globalAlpha = a;
      w.fillStyle = q.color;
      w.fillRect(x, y - 1, 1, 3);
      w.fillRect(x - 1, y, 3, 1);
      w.globalAlpha = 1;
      return;
    case 'beam': {
      w.globalAlpha = a;
      w.fillStyle = q.color;
      if (q.size > 2) {
        w.fillRect(x - q.size / 2, y - 120, q.size, 120);
      } else w.fillRect(x, y - 5, 1, 5);
      w.globalAlpha = 1;
      return;
    }
    case 'sprite':
      if (q.sprite) drawSil(w, q.sprite, '#c6e4ff', q.x, q.y + 10, (q.ang ?? 0) > 0, a * 0.5);
      return;
    default:
      w.globalAlpha = Math.min(1, a * 1.5);
      w.fillStyle = q.color;
      w.fillRect(x, y, q.size, q.size);
      w.globalAlpha = 1;
  }
}

/** 퀘스트 길안내 화살표: 화면 안이면 목표 위에서 튀고, 밖이면 화면 가장자리에서 방향을 가리킨다 */
function drawGuide(g: Game, w: CanvasRenderingContext2D, cx: number, cy: number): { lx: number; ly: number; text: string; align: CanvasTextAlign } | null {
  if (g.p.dead || g.hero.flags.guideOff) return null;
  const t = g.questTarget();
  if (!t) return null;
  const { vw, vh } = g;
  const sx = t.x - cx, sy = t.y - cy;
  const dist = Math.round(Math.hypot(t.x - g.p.x, t.y - g.p.y) / 16);
  const gold = '#facb3e', dark = '#3a2410', light = '#fff3b0';
  const inside = sx > 10 && sx < vw - 10 && sy > 22 && sy < vh - 10;
  w.save();
  w.setTransform(1, 0, 0, 1, 0, 0);
  // 인식한 적이 곧 목표면 길안내 화살표는 생략 (표시가 겹치지 않게)
  const lk = g.p.lock;
  if (inside && lk && !lk.dead && Math.hypot(lk.x - t.x, lk.y - 6 - t.y) < 14) { w.restore(); return null; }
  if (inside && dist > 1) {
    // 목표 머리 위에서 통통 튀는 아래 화살표
    const bob = Math.round(Math.abs(Math.sin(g.time * 4)) * 4);
    const x = Math.round(sx), y = Math.round(sy) - (t.npc ? 22 : 8) - bob;
    arrowShape(w, x, y, Math.PI / 2, gold, dark, light);
    w.restore();
    return dist > 3 && !t.npc ? { lx: x, ly: y - 10, text: t.label, align: 'center' } : null;
  }
  if (inside) { w.restore(); return null; }
  // 화면 밖: 플레이어에서 목표 쪽 가장자리
  const px = g.p.x - cx, py = g.p.y - 10 - cy;
  const ang = Math.atan2(sy - py, sx - px);
  const mx = 16, mTop = 34, mBot = 34;
  const dx = Math.cos(ang), dy = Math.sin(ang);
  let k = 1e9;
  if (dx > 0) k = Math.min(k, (vw - mx - px) / dx);
  if (dx < 0) k = Math.min(k, (mx - px) / dx);
  if (dy > 0) k = Math.min(k, (vh - mBot - py) / dy);
  if (dy < 0) k = Math.min(k, (mTop - py) / dy);
  const pulse = Math.round(Math.sin(g.time * 6) * 2);
  const ax = Math.round(px + dx * (k + pulse)), ay = Math.round(py + dy * (k + pulse));
  arrowShape(w, ax, ay, ang, gold, dark, light);
  // 플레이어 발밑의 작은 방향 표시
  const rx = Math.round(px + dx * 14), ry = Math.round(py + 10 + dy * 9);
  w.globalAlpha = 0.8;
  w.fillStyle = gold;
  w.fillRect(rx - 1, ry - 1, 2, 2);
  w.fillRect(Math.round(px + dx * 18), Math.round(py + 10 + dy * 11), 1, 1);
  w.globalAlpha = 1;
  w.restore();
  const align: CanvasTextAlign = dx > 0.5 ? 'right' : dx < -0.5 ? 'left' : 'center';
  const lx = ax - dx * 12, ly = ay - dy * 12 + (dy < -0.5 ? 12 : -2);
  return { lx, ly, text: `${t.label} ${dist}m`, align };
}

function arrowShape(w: CanvasRenderingContext2D, x: number, y: number, ang: number, fill: string, edge: string, hi: string): void {
  w.save();
  w.translate(x, y);
  w.rotate(ang);
  const path = () => {
    w.beginPath();
    w.moveTo(6, 0);
    w.lineTo(0, -5);
    w.lineTo(0, -2);
    w.lineTo(-6, -2);
    w.lineTo(-6, 2);
    w.lineTo(0, 2);
    w.lineTo(0, 5);
    w.closePath();
  };
  w.lineJoin = 'miter';
  w.lineWidth = 3;
  w.strokeStyle = edge;
  path();
  w.stroke();
  w.fillStyle = fill;
  path();
  w.fill();
  w.fillStyle = hi;
  w.fillRect(-5, -1, 5, 1);
  w.restore();
}
