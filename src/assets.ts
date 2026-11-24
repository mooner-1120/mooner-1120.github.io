// 아틀라스 로더 + 스프라이트/애니메이션 그리기

export type Frame = [number, number, number, number];
let atlasImg: HTMLImageElement;
let frames: Record<string, Frame> = {};
const animCache = new Map<string, string[]>();

export async function loadAssets(): Promise<void> {
  const [json, img] = await Promise.all([
    fetch('./assets/atlas.json').then((r) => r.json()),
    new Promise<HTMLImageElement>((res, rej) => {
      const i = new Image();
      i.onload = () => res(i);
      i.onerror = rej;
      i.src = './assets/atlas.png';
    }),
  ]);
  frames = json;
  atlasImg = img;
  // 폰트가 늦게 뜨면 캔버스 글자가 대체 글꼴로 찍히므로 기다린다
  try {
    await Promise.all([
      document.fonts.load('11px Galmuri11'),
      document.fonts.load('bold 11px Galmuri11'),
      document.fonts.load('9px Galmuri9'),
    ]);
  } catch {
    /* 폰트 실패해도 진행 */
  }
}

export function has(name: string): boolean {
  return name in frames;
}

export function frame(name: string): Frame | undefined {
  return frames[name];
}

/** base 의 kind(idle/run/hit) 애니 프레임 이름 목록. 0x72 시트는 이름 규칙이 몇 가지라 차례로 찾는다. */
export function anim(base: string, kind: string): string[] {
  const key = base + '|' + kind;
  const c = animCache.get(key);
  if (c) return c;
  const out: string[] = [];
  const tries = [`${base}_${kind}_anim_f`, `${base}_anim_f`];
  for (const t of tries) {
    for (let i = 0; i < 8; i++) if (frames[t + i]) out.push(t + i);
    if (out.length) break;
  }
  if (!out.length && kind === 'hit') return anim(base, 'idle');
  if (!out.length && kind === 'run') return anim(base, 'idle');
  if (!out.length && frames[base]) out.push(base);
  animCache.set(key, out);
  return out;
}

export function drawFrame(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  opts?: { flip?: boolean; ax?: number; ay?: number; alpha?: number; scale?: number },
): void {
  const f = frames[name];
  if (!f) return;
  const [sx, sy, w, h] = f;
  const s = opts?.scale ?? 1;
  const ax = opts?.ax ?? 0.5;
  const ay = opts?.ay ?? 1;
  const dw = w * s;
  const dh = h * s;
  const dx = Math.round(x - dw * ax);
  const dy = Math.round(y - dh * ay);
  if (opts?.alpha !== undefined) ctx.globalAlpha = opts.alpha;
  if (opts?.flip) {
    ctx.save();
    ctx.translate(dx + dw, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(atlasImg, sx, sy, w, h, 0, 0, dw, dh);
    ctx.restore();
  } else {
    ctx.drawImage(atlasImg, sx, sy, w, h, dx, dy, dw, dh);
  }
  if (opts?.alpha !== undefined) ctx.globalAlpha = 1;
}

/** 회전 그리기 (무기 휘두르기). pivot 은 스프라이트 안의 비율 좌표. */
export function drawRotated(
  ctx: CanvasRenderingContext2D,
  name: string,
  x: number,
  y: number,
  angle: number,
  px = 0.5,
  py = 0.9,
  flipX = false,
): void {
  const f = frames[name];
  if (!f) return;
  const [sx, sy, w, h] = f;
  ctx.save();
  ctx.translate(Math.round(x), Math.round(y));
  ctx.rotate(angle);
  if (flipX) ctx.scale(-1, 1);
  ctx.drawImage(atlasImg, sx, sy, w, h, -Math.round(w * px), -Math.round(h * py), w, h);
  ctx.restore();
}

// 흰색 번쩍임용 실루엣 캐시
const silCache = new Map<string, HTMLCanvasElement>();
export function silhouette(name: string, color: string): HTMLCanvasElement | null {
  const key = name + color;
  const c = silCache.get(key);
  if (c) return c;
  const f = frames[name];
  if (!f) return null;
  const cv = document.createElement('canvas');
  cv.width = f[2];
  cv.height = f[3];
  const g = cv.getContext('2d')!;
  g.drawImage(atlasImg, f[0], f[1], f[2], f[3], 0, 0, f[2], f[3]);
  g.globalCompositeOperation = 'source-in';
  g.fillStyle = color;
  g.fillRect(0, 0, f[2], f[3]);
  silCache.set(key, cv);
  return cv;
}

export function drawSil(
  ctx: CanvasRenderingContext2D,
  name: string,
  color: string,
  x: number,
  y: number,
  flip: boolean,
  alpha = 1,
): void {
  const cv = silhouette(name, color);
  if (!cv) return;
  const dx = Math.round(x - cv.width / 2);
  const dy = Math.round(y - cv.height);
  ctx.globalAlpha = alpha;
  if (flip) {
    ctx.save();
    ctx.translate(dx + cv.width, dy);
    ctx.scale(-1, 1);
    ctx.drawImage(cv, 0, 0);
    ctx.restore();
  } else ctx.drawImage(cv, dx, dy);
  ctx.globalAlpha = 1;
}

/** DOM용 아이콘: 프레임을 정수배로 키운 dataURL */
const iconCache = new Map<string, string>();
export function iconURL(name: string, scale = 2): string {
  const key = name + '@' + scale;
  const c = iconCache.get(key);
  if (c) return c;
  const f = frames[name];
  if (!f) return '';
  const cv = document.createElement('canvas');
  cv.width = f[2] * scale;
  cv.height = f[3] * scale;
  const g = cv.getContext('2d')!;
  g.imageSmoothingEnabled = false;
  g.drawImage(atlasImg, f[0], f[1], f[2], f[3], 0, 0, cv.width, cv.height);
  const url = cv.toDataURL();
  iconCache.set(key, url);
  return url;
}

export function atlas(): HTMLImageElement {
  return atlasImg;
}
