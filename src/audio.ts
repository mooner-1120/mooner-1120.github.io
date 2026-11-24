// 효과음·배경음 — WebAudio로 직접 합성 (외부 파일 없음)

let ctx: AudioContext | null = null;
let master: GainNode, sfxBus: GainNode, musicBus: GainNode;
let noiseBuf: AudioBuffer;
export const volume = { sfx: 0.7, music: 0.45 };

function ensure(): AudioContext | null {
  if (ctx) return ctx;
  try {
    ctx = new AudioContext();
  } catch {
    return null;
  }
  master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(ctx.destination);
  sfxBus = ctx.createGain();
  sfxBus.gain.value = volume.sfx;
  sfxBus.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = volume.music;
  musicBus.connect(master);
  noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const d = noiseBuf.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return ctx;
}

export function unlockAudio(): void {
  const c = ensure();
  if (c && c.state === 'suspended') c.resume();
}

export function setVolumes(sfx: number, music: number): void {
  volume.sfx = sfx;
  volume.music = music;
  if (ctx) {
    sfxBus.gain.value = sfx;
    musicBus.gain.value = music;
  }
}

function tone(type: OscillatorType, f0: number, f1: number, dur: number, vol: number, delay = 0, bus?: GainNode) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const o = c.createOscillator();
  const g = c.createGain();
  o.type = type;
  o.frequency.setValueAtTime(f0, t);
  o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  o.connect(g).connect(bus ?? sfxBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}

function noise(dur: number, vol: number, fHi: number, fLo: number, delay = 0, q = 1) {
  const c = ensure();
  if (!c) return;
  const t = c.currentTime + delay;
  const s = c.createBufferSource();
  s.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = 'bandpass';
  f.Q.value = q;
  f.frequency.setValueAtTime(fHi, t);
  f.frequency.exponentialRampToValueAtTime(Math.max(40, fLo), t + dur);
  const g = c.createGain();
  g.gain.setValueAtTime(vol, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + dur);
  s.connect(f).connect(g).connect(sfxBus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + dur + 0.02);
}

const last: Record<string, number> = {};
export function sfx(name: string): void {
  const c = ensure();
  if (!c) return;
  const now = c.currentTime;
  if (last[name] && now - last[name] < 0.03) return;
  last[name] = now;
  switch (name) {
    case 'swing': noise(0.12, 0.25, 3000, 800, 0, 0.8); break;
    case 'hit': noise(0.09, 0.5, 1800, 300, 0, 1.2); tone('square', 180, 60, 0.08, 0.15); break;
    case 'crit': noise(0.14, 0.6, 2500, 200, 0, 1.2); tone('square', 520, 90, 0.14, 0.18); tone('triangle', 1200, 600, 0.12, 0.1, 0.02); break;
    case 'hurt': tone('square', 300, 90, 0.16, 0.2); noise(0.08, 0.3, 900, 300); break;
    case 'bolt': tone('sine', 900, 1500, 0.12, 0.15); tone('triangle', 1400, 700, 0.1, 0.08, 0.03); break;
    case 'arrow': noise(0.1, 0.3, 5000, 2000, 0, 2); tone('triangle', 700, 300, 0.06, 0.08); break;
    case 'fire': noise(0.35, 0.4, 1200, 150, 0, 0.6); tone('sawtooth', 120, 50, 0.3, 0.12); break;
    case 'boom': noise(0.5, 0.7, 800, 60, 0, 0.5); tone('sine', 110, 30, 0.45, 0.4); break;
    case 'ice': tone('triangle', 1800, 2600, 0.2, 0.12); tone('sine', 2400, 1200, 0.3, 0.08, 0.05); noise(0.2, 0.15, 6000, 3000, 0, 3); break;
    case 'holy': tone('triangle', 660, 660, 0.4, 0.12); tone('triangle', 880, 880, 0.4, 0.1, 0.06); tone('triangle', 1320, 1320, 0.4, 0.08, 0.12); break;
    case 'heal': tone('sine', 520, 1040, 0.35, 0.15); tone('sine', 780, 1560, 0.35, 0.1, 0.08); break;
    case 'roll': noise(0.18, 0.25, 600, 200, 0, 0.7); break;
    case 'dash': noise(0.2, 0.35, 2500, 400, 0, 0.6); break;
    case 'block': tone('square', 1200, 900, 0.08, 0.12); noise(0.06, 0.4, 4000, 2000, 0, 3); break;
    case 'parry': tone('square', 1600, 1600, 0.05, 0.15); tone('triangle', 2400, 2400, 0.2, 0.12, 0.04); noise(0.1, 0.4, 6000, 3000, 0, 4); break;
    case 'roar': tone('sawtooth', 140, 70, 0.6, 0.25); noise(0.6, 0.3, 500, 150, 0, 0.5); break;
    case 'buff': tone('square', 440, 440, 0.08, 0.08); tone('square', 660, 660, 0.08, 0.08, 0.08); tone('square', 880, 880, 0.12, 0.08, 0.16); break;
    case 'coin': tone('square', 1320, 1320, 0.05, 0.08); tone('square', 1760, 1760, 0.12, 0.08, 0.05); break;
    case 'pickup': tone('triangle', 600, 900, 0.1, 0.12); break;
    case 'potion': tone('sine', 300, 700, 0.25, 0.15); noise(0.2, 0.1, 1500, 800, 0.05, 3); break;
    case 'levelup': [523, 659, 784, 1047].forEach((f, i) => tone('square', f, f, 0.14, 0.1, i * 0.09)); tone('triangle', 1047, 1047, 0.5, 0.1, 0.36); break;
    case 'ui': tone('square', 880, 880, 0.04, 0.06); break;
    case 'deny': tone('square', 200, 150, 0.12, 0.1); break;
    case 'die': tone('square', 400, 50, 0.4, 0.15); noise(0.3, 0.2, 800, 100); break;
    case 'enemy_die': noise(0.25, 0.35, 1200, 100, 0, 0.8); tone('square', 220, 60, 0.2, 0.1); break;
    case 'warn': tone('square', 330, 330, 0.06, 0.07); break;
    case 'door': noise(0.4, 0.4, 300, 80, 0, 0.6); tone('square', 80, 50, 0.3, 0.15); break;
    case 'chest': tone('square', 392, 392, 0.08, 0.1); tone('square', 523, 523, 0.08, 0.1, 0.08); tone('square', 784, 784, 0.2, 0.1, 0.16); break;
    case 'step': noise(0.04, 0.06, 500, 300, 0, 2); break;
    case 'teleport': tone('sine', 300, 1800, 0.18, 0.12); noise(0.15, 0.15, 3000, 6000, 0, 2); break;
    case 'smith_ok': tone('square', 1000, 1000, 0.05, 0.12); tone('square', 1500, 1500, 0.3, 0.1, 0.1); break;
    case 'smith_fail': tone('square', 300, 100, 0.4, 0.12); break;
  }
}

// ── 배경음: 간단한 4성부 칩튠 시퀀서 ─────────────────────────────────
interface Song {
  bpm: number;
  lead: string; // 음표 문자열: "C5 . E5 G5 ..." 16분 음표 단위, '.' 이어짐, '-' 쉼
  bass: string;
  arp?: string;
  drum?: string; // k s h -
  leadWave?: OscillatorType;
}

const NOTE: Record<string, number> = { C: 0, 'C#': 1, D: 2, 'D#': 3, E: 4, F: 5, 'F#': 6, G: 7, 'G#': 8, A: 9, 'A#': 10, B: 11 };
function freq(n: string): number {
  const m = /^([A-G]#?)(\d)$/.exec(n);
  if (!m) return 0;
  return 440 * Math.pow(2, (NOTE[m[1]] + (+m[2] + 1) * 12 - 69) / 12);
}

const SONGS: Record<string, Song> = {
  village: {
    bpm: 96, leadWave: 'triangle',
    lead: 'E5 . G5 . A5 . . . G5 . E5 . D5 . . . C5 . D5 . E5 . G5 . E5 . . . - - - - D5 . E5 . G5 . A5 . C6 . A5 . G5 . . . E5 . G5 . A5 . G5 . E5 . . . D5 . . . - - - -',
    bass: 'C3 - G3 - A2 - E3 - F2 - C3 - G2 - D3 - C3 - G3 - A2 - E3 - F2 - C3 - G2 - G2 - A2 - E3 - F2 - C3 - C3 - G3 - G2 - D3 - A2 - E3 - F2 - C3 - G2 - D3 - C3 - C3 -',
    drum: 'k - h - s - h - k - h - s - h h',
  },
  field: {
    bpm: 132, leadWave: 'square',
    lead: 'A4 . C5 . E5 . A5 . G5 . E5 . D5 . E5 . C5 . . . D5 . E5 . G5 . . . E5 . D5 . C5 . D5 . . . E5 . . . A4 . C5 . E5 . A5 . B5 . C6 . B5 . A5 . G5 . E5 . G5 . A5 . . . . . . . - - - -',
    bass: 'A2 A2 E3 A2 A2 A2 E3 A2 F2 F2 C3 F2 F2 F2 C3 F2 G2 G2 D3 G2 G2 G2 D3 G2 E2 E2 B2 E2 E2 E2 B2 E2 A2 A2 E3 A2 A2 A2 E3 A2 F2 F2 C3 F2 F2 F2 C3 F2 G2 G2 D3 G2 G2 G2 D3 G2 A2 A2 E3 A2 A2 A2 A2 A2',
    drum: 'k - h - s - h k k - h - s - h h',
  },
  dungeon: {
    bpm: 84, leadWave: 'triangle',
    lead: 'D5 . . . F5 . . . E5 . . . C5 . . . D5 . . . A4 . . . . . . . - - - - D5 . . . F5 . . . G5 . . . A5 . . . G5 . F5 . E5 . . . . . . . - - - -',
    bass: 'D2 . . . D2 . . . C2 . . . C2 . . . A#1 . . . A#1 . . . A1 . . . A1 . . . D2 . . . D2 . . . C2 . . . C2 . . . A#1 . . . A1 . . . D2 . . . D2 . . .',
    drum: 'k - - - - - h - s - - - - - h -',
  },
  fort: {
    bpm: 140, leadWave: 'square',
    lead: 'E5 . E5 . G5 . E5 . D5 . C5 . D5 . B4 . E5 . E5 . G5 . A5 . B5 . A5 . G5 . . . E5 . E5 . G5 . E5 . D5 . C5 . D5 . E5 . C5 . B4 . A4 . B4 . C5 . B4 . A4 . . .',
    bass: 'E2 E2 E3 E2 E2 E2 E3 E2 C2 C2 C3 C2 D2 D2 D3 D2 E2 E2 E3 E2 E2 E2 E3 E2 C2 C2 C3 C2 D2 D2 D3 D2 E2 E2 E3 E2 E2 E2 E3 E2 C2 C2 C3 C2 D2 D2 D3 D2 A1 A1 A2 A1 B1 B1 B2 B1 E2 E2 E3 E2 E2 E2 E2 E2',
    drum: 'k h s h k k s h k h s h k k s s',
  },
  boss: {
    bpm: 156, leadWave: 'sawtooth',
    lead: 'A4 . A4 C5 . A4 D#5 . D5 . C5 . A4 . G4 . A4 . A4 C5 . A4 D#5 . F5 . D#5 . D5 . C5 . A4 . A4 C5 . A4 D#5 . D5 . C5 . A4 . G4 . A5 . G5 . D#5 . D5 . C5 . D5 . . . . . . .',
    bass: 'A1 A2 A1 A2 A1 A2 A1 A2 F1 F2 F1 F2 G1 G2 G1 G2 A1 A2 A1 A2 A1 A2 A1 A2 F1 F2 F1 F2 G1 G2 G1 G2 A1 A2 A1 A2 A1 A2 A1 A2 F1 F2 F1 F2 G1 G2 G1 G2 D2 D3 D2 D3 E2 E3 E2 E3 A1 A2 A1 A2 A1 A2 A1 A2',
    drum: 'k h s h k h s h k h s h k k s s',
  },
  title: {
    bpm: 80, leadWave: 'triangle',
    lead: 'A4 . . . E5 . . . D5 . C5 . B4 . . . C5 . . . A4 . . . . . . . - - - - F4 . . . C5 . . . B4 . A4 . G4 . . . A4 . . . E4 . . . . . . . - - - -',
    bass: 'A2 . . . . . . . F2 . . . . . . . G2 . . . . . . . A2 . . . . . . . F2 . . . . . . . D2 . . . . . . . E2 . . . . . . . A2 . . . . . . .',
    drum: '',
  },
  victory: {
    bpm: 120, leadWave: 'square',
    lead: 'C5 . C5 . C5 . G5 . . . . . F5 . E5 . D5 . C6 . . . G5 . . . . . . . - - - -',
    bass: 'C3 . . . . . . . F2 . . . G2 . . . C3 . . . . . . . . . . . - - - -',
  },
};

let current = '';
let timer: number | null = null;
let step = 0;
let nextTime = 0;

function playSong(): void {
  if (!ctx || !current) return;
  const s = SONGS[current];
  const lead = s.lead.split(/\s+/);
  const bass = s.bass.split(/\s+/);
  const drum = (s.drum ?? '').split(/\s+/).filter(Boolean);
  const len = Math.max(lead.length, bass.length);
  const dt = 60 / s.bpm / 4;
  while (nextTime < ctx.currentTime + 0.25) {
    const i = step % len;
    const dur = (arr: string[], j: number) => {
      let k = 1;
      while (arr[(j + k) % arr.length] === '.' && k < 16) k++;
      return k * dt;
    };
    const L = lead[i % lead.length];
    if (L && L !== '.' && L !== '-') note(s.leadWave ?? 'square', freq(L), nextTime, dur(lead, i % lead.length) * 0.92, 0.06);
    const B = bass[i % bass.length];
    if (B && B !== '.' && B !== '-') note('triangle', freq(B), nextTime, dur(bass, i % bass.length) * 0.9, 0.12);
    if (drum.length) {
      const D = drum[i % drum.length];
      if (D === 'k') kick(nextTime);
      else if (D === 's') snare(nextTime);
      else if (D === 'h') hat(nextTime);
    }
    nextTime += dt;
    step++;
    if (current === 'victory' && step >= len) {
      current = '';
      return;
    }
  }
}

function note(type: OscillatorType, f: number, t: number, dur: number, vol: number) {
  if (!ctx || !f) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = f;
  g.gain.setValueAtTime(0, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.01);
  g.gain.setValueAtTime(vol, t + dur * 0.7);
  g.gain.linearRampToValueAtTime(0, t + dur);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + dur + 0.02);
}
function kick(t: number) {
  if (!ctx) return;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.frequency.setValueAtTime(140, t);
  o.frequency.exponentialRampToValueAtTime(40, t + 0.12);
  g.gain.setValueAtTime(0.25, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.14);
  o.connect(g).connect(musicBus);
  o.start(t);
  o.stop(t + 0.16);
}
function snare(t: number) {
  if (!ctx) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 1500;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.12, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.12);
  s.connect(f).connect(g).connect(musicBus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + 0.13);
}
function hat(t: number) {
  if (!ctx) return;
  const s = ctx.createBufferSource();
  s.buffer = noiseBuf;
  const f = ctx.createBiquadFilter();
  f.type = 'highpass';
  f.frequency.value = 7000;
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.04, t);
  g.gain.exponentialRampToValueAtTime(0.001, t + 0.04);
  s.connect(f).connect(g).connect(musicBus);
  s.start(t, Math.random() * 0.5);
  s.stop(t + 0.05);
}

export function music(name: string): void {
  const c = ensure();
  if (!c || current === name) return;
  current = name;
  step = 0;
  nextTime = c.currentTime + 0.1;
  if (timer === null) timer = window.setInterval(playSong, 60);
}
