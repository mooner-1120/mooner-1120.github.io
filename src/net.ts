// 멀티플레이 연결 계층 — 별 모양 연결: 방장(host)이 모든 참가자와 직접 연결하고, 참가자끼리는 방장을 거친다.
// 실제 플레이: PeerJS(WebRTC, 무료 공개 중계 서버로 처음 연결만 맺음)
// 테스트(?net=local): 같은 브라우저의 탭끼리 BroadcastChannel

export interface Transport {
  readonly id: string;
  readonly isHost: boolean;
  send(to: string, msg: unknown): void; // to = '*' 이면 연결된 모두에게
  onMessage(cb: (from: string, msg: any) => void): void;
  onPeer(cb: (id: string, joined: boolean) => void): void;
  close(): void;
}

const PREFIX = 'ashencrown-room-';

export function makeCode(): string {
  const a = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let s = '';
  for (let i = 0; i < 5; i++) s += a[(Math.random() * a.length) | 0];
  return s;
}

function useLocal(): boolean {
  try { return new URLSearchParams(location.search).get('net') === 'local'; } catch { return false; }
}

export async function hostRoom(code: string): Promise<Transport> {
  if (useLocal()) return localHost(code);
  return hybridHost(code);
}

export async function joinRoom(code: string): Promise<Transport> {
  if (useLocal()) return localJoin(code);
  // 1) 직접 연결(WebRTC)을 먼저 시도하고, 2) 안 되면 공개 메시지 서버(MQTT)를 거쳐 주고받는다
  let first: Error | null = null;
  if (!forceRelay()) {
    try { return await peerJoin(code, 10000); } catch (e) { first = e as Error; }
  }
  try { return await relayJoin(code); } catch (e) {
    throw new Error((e as Error).message + (first ? ` (직접 연결: ${first.message})` : ''));
  }
}

function forceRelay(): boolean {
  try { return new URLSearchParams(location.search).get('net') === 'relay'; } catch { return false; }
}

/** 방장: 직접 연결과 중계 서버 양쪽에서 손님을 받는다. 하나만 되어도 방이 열린다. */
async function hybridHost(code: string): Promise<Transport> {
  const tries = await Promise.allSettled([forceRelay() ? Promise.reject(new Error('relay only')) : peerHost(code), relayHost(code)]);
  const parts = tries.filter((r): r is PromiseFulfilledResult<Transport> => r.status === 'fulfilled').map((r) => r.value);
  if (!parts.length) {
    const why = tries.map((r) => (r.status === 'rejected' ? (r.reason as Error)?.message : '')).filter(Boolean).join(' / ');
    throw new Error('방을 열지 못했습니다. ' + why);
  }
  let msgCb: (from: string, msg: any) => void = () => {};
  let peerCb: (id: string, joined: boolean) => void = () => {};
  const owner = new Map<string, Transport>();
  for (const t of parts) {
    t.onMessage((f, m) => msgCb(f, m));
    t.onPeer((id, j) => {
      if (j) {
        if (owner.size >= 3) { t.send(id, { t: 'full' }); return; }
        owner.set(id, t);
      } else if (!owner.delete(id)) return;
      peerCb(id, j);
    });
  }
  return {
    id: PREFIX + code,
    isHost: true,
    send(to, msg) {
      if (to === '*') { for (const [id, t] of owner) t.send(id, msg); return; }
      owner.get(to)?.send(to, msg);
    },
    onMessage(cb) { msgCb = cb; },
    onPeer(cb) { peerCb = cb; },
    close() { for (const t of parts) t.close(); },
  };
}

// ── PeerJS ─────────────────────────────────────────────────────────
type Conn = import('peerjs').DataConnection;

/** 연결 경로 후보: STUN(주소 알아내기) + TURN(서로 직접 못 닿을 때 대신 전달해 주는 중계) */
const ICE: RTCIceServer[] = [
  { urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302', 'stun:stun.cloudflare.com:3478'] },
  { urls: ['turn:eu-0.turn.peerjs.com:3478', 'turn:us-0.turn.peerjs.com:3478'], username: 'peerjs', credential: 'peerjsp' },
  {
    urls: ['turn:openrelay.metered.ca:80', 'turn:openrelay.metered.ca:443', 'turn:openrelay.metered.ca:443?transport=tcp', 'turns:openrelay.metered.ca:443?transport=tcp'],
    username: 'openrelayproject', credential: 'openrelayproject',
  },
];
const PEER_OPTS = { debug: 0, config: { iceServers: ICE } } as const;

async function loadPeer() {
  const mod = await import('peerjs');
  return mod.Peer;
}

function friendly(err: any): Error {
  const t = err?.type ?? '';
  if (t === 'peer-unavailable') return new Error('방을 찾을 수 없습니다. 코드를 다시 확인하고, 방장 화면에 방이 아직 열려 있는지 확인해 주세요.');
  if (t === 'unavailable-id') return new Error('이미 쓰는 방 코드입니다. 다시 시도해 주세요.');
  if (t === 'network' || t === 'server-error' || t === 'socket-error' || t === 'socket-closed') return new Error('연결 서버(PeerJS)에 닿지 못했습니다. 인터넷 연결을 확인하거나, 광고 차단·보안 프로그램이 막고 있지 않은지 확인해 주세요.');
  if (t === 'webrtc' || t === 'negotiation-failed') return new Error('방장과 직접 연결하지 못했습니다. 같은 와이파이에서 다시 시도해 주세요.');
  if (t === 'browser-incompatible') return new Error('이 브라우저(또는 이 페이지)에서는 멀티플레이 연결(WebRTC)을 쓸 수 없습니다.');
  return new Error('연결에 실패했습니다: ' + (err?.message ?? t ?? err));
}

async function peerHost(code: string): Promise<Transport> {
  const Peer = await loadPeer();
  const peer = new Peer(PREFIX + code, PEER_OPTS);
  const conns = new Map<string, Conn>();
  let msgCb: (from: string, msg: any) => void = () => {};
  let peerCb: (id: string, joined: boolean) => void = () => {};
  await new Promise<void>((res, rej) => {
    peer.on('open', () => res());
    peer.on('error', (e) => rej(friendly(e)));
    setTimeout(() => { peer.destroy(); rej(new Error('연결 서버 응답이 없습니다.')); }, 8000);
  });
  peer.on('connection', (c) => {
    c.on('open', () => {
      if (conns.size >= 3) { c.send({ t: 'full' }); setTimeout(() => c.close(), 300); return; }
      conns.set(c.peer, c);
      peerCb(c.peer, true);
    });
    c.on('data', (d) => msgCb(c.peer, d));
    const gone = () => { if (conns.delete(c.peer)) peerCb(c.peer, false); };
    c.on('close', gone);
    c.on('error', gone);
  });
  return {
    id: peer.id,
    isHost: true,
    send(to, msg) {
      if (to === '*') for (const c of conns.values()) c.open && c.send(msg);
      else { const c = conns.get(to); if (c?.open) c.send(msg); }
    },
    onMessage(cb) { msgCb = cb; },
    onPeer(cb) { peerCb = cb; },
    close() { for (const c of conns.values()) c.close(); peer.destroy(); },
  };
}

async function peerJoin(code: string, wait = 25000): Promise<Transport> {
  const Peer = await loadPeer();
  const peer = new Peer(PEER_OPTS);
  let msgCb: (from: string, msg: any) => void = () => {};
  let peerCb: (id: string, joined: boolean) => void = () => {};
  await new Promise<void>((res, rej) => {
    peer.on('open', () => res());
    peer.on('error', (e) => { peer.destroy(); rej(friendly(e)); });
    setTimeout(() => { peer.destroy(); rej(new Error('연결 서버 응답이 없습니다.')); }, 8000);
  });
  const hostId = PREFIX + code;
  const conn = peer.connect(hostId, { reliable: true });
  await new Promise<void>((res, rej) => {
    conn.on('open', () => res());
    peer.on('error', (e) => { peer.destroy(); rej(friendly(e)); });
    setTimeout(() => { peer.destroy(); rej(new Error('방장 컴퓨터와 직접 이어지지 않음')); }, wait);
  });
  conn.on('data', (d) => msgCb(hostId, d));
  conn.on('close', () => peerCb(hostId, false));
  return {
    id: peer.id,
    isHost: false,
    send(_to, msg) { if (conn.open) conn.send(msg); },
    onMessage(cb) { msgCb = cb; },
    onPeer(cb) { peerCb = cb; },
    close() { conn.close(); peer.destroy(); },
  };
}

// ── 중계: 공개 MQTT 서버를 거쳐 메시지를 주고받는다 (직접 연결이 막힌 네트워크용) ──
// 방장은 여러 서버에 동시에 귀를 기울이고, 손님은 처음 닿는 서버로 들어온다.
const BROKERS = [
  'wss://broker.emqx.io:8084/mqtt',
  'wss://broker.hivemq.com:8884/mqtt',
  'wss://test.mosquitto.org:8081/mqtt',
];
function brokers(): string[] {
  try { const u = new URLSearchParams(location.search).get('relay'); if (u) return [u]; } catch { /* */ }
  return BROKERS;
}
const topic = (code: string) => `ashencrown/v1/${code}`;
type Mqtt = import('mqtt').MqttClient;

async function connectBroker(url: string, ms = 6000): Promise<Mqtt> {
  const mqtt = (await import('mqtt')).default;
  return new Promise((res, rej) => {
    const c = mqtt.connect(url, { reconnectPeriod: 2000, connectTimeout: ms, clean: true, clientId: 'ac_' + Math.random().toString(36).slice(2, 10) });
    const t = setTimeout(() => { c.end(true); rej(new Error('timeout')); }, ms);
    c.once('connect', () => { clearTimeout(t); res(c); });
    c.once('error', (e) => { clearTimeout(t); c.end(true); rej(e); });
  });
}

/** 보낼 메시지를 모아 50ms 마다 한 번에 보낸다 (서버 부담 ↓) */
function batcher(pub: (to: string, list: unknown[]) => void) {
  const q = new Map<string, unknown[]>();
  const iv = setInterval(() => { for (const [to, list] of q) if (list.length) pub(to, list.splice(0)); }, 50);
  return { push(to: string, m: unknown) { (q.get(to) ?? q.set(to, []).get(to)!).push(m); }, stop() { clearInterval(iv); }, drop(to: string) { q.delete(to); } };
}

async function relayHost(code: string): Promise<Transport> {
  const T = topic(code);
  const got = await Promise.allSettled(brokers().map((u) => connectBroker(u)));
  const clients = got.filter((r): r is PromiseFulfilledResult<Mqtt> => r.status === 'fulfilled').map((r) => r.value);
  if (!clients.length) throw new Error('중계 서버에 닿지 못했습니다');
  const id = 'relay-host-' + code;
  const guests = new Map<string, { c: Mqtt; seen: number }>();
  let msgCb: (from: string, msg: any) => void = () => {};
  let peerCb: (id: string, joined: boolean) => void = () => {};
  const out = batcher((to, list) => { const g = guests.get(to); g?.c.publish(`${T}/g/${to}`, JSON.stringify({ k: 'd', d: list })); });
  const drop = (gid: string) => { if (guests.delete(gid)) { out.drop(gid); peerCb(gid, false); } };
  for (const c of clients) {
    c.subscribe(`${T}/h`);
    c.on('message', (_t, buf) => {
      let m: any;
      try { m = JSON.parse(buf.toString()); } catch { return; }
      const f = String(m.f ?? '');
      if (!f) return;
      if (m.k === 'join') {
        c.publish(`${T}/g/${f}`, JSON.stringify({ k: 'ok' }));
        if (!guests.has(f)) { guests.set(f, { c, seen: Date.now() }); peerCb(f, true); }
        return;
      }
      const g = guests.get(f);
      if (!g) return;
      g.seen = Date.now();
      if (m.k === 'bye') { drop(f); return; }
      if (m.k === 'd') for (const d of m.d ?? []) msgCb(f, d);
    });
  }
  const watch = setInterval(() => { for (const [gid, g] of guests) if (Date.now() - g.seen > 12000) drop(gid); }, 2000);
  return {
    id, isHost: true,
    send(to, msg) {
      if (to === '*') { for (const gid of guests.keys()) out.push(gid, msg); return; }
      if (guests.has(to)) out.push(to, msg);
    },
    onMessage(cb) { msgCb = cb; },
    onPeer(cb) { peerCb = cb; },
    close() {
      for (const [gid, g] of guests) g.c.publish(`${T}/g/${gid}`, JSON.stringify({ k: 'bye' }));
      out.stop(); clearInterval(watch);
      setTimeout(() => clients.forEach((c) => c.end(true)), 200);
    },
  };
}

async function relayJoin(code: string): Promise<Transport> {
  const T = topic(code);
  const id = 'relay-' + Math.random().toString(36).slice(2, 10);
  const hostId = PREFIX + code;
  let lastErr = '';
  for (const url of brokers()) {
    let c: Mqtt;
    try { c = await connectBroker(url); } catch (e) { lastErr = (e as Error).message; continue; }
    const ok = await new Promise<boolean>((res) => {
      const t = setTimeout(() => res(false), 6000);
      c.subscribe(`${T}/g/${id}`, () => c.publish(`${T}/h`, JSON.stringify({ f: id, k: 'join' })));
      c.on('message', (_t, buf) => { try { if (JSON.parse(buf.toString()).k === 'ok') { clearTimeout(t); res(true); } } catch { /* */ } });
    });
    if (!ok) { c.end(true); lastErr = '방을 찾지 못함'; continue; }
    let msgCb: (from: string, msg: any) => void = () => {};
    let peerCb: (id: string, joined: boolean) => void = () => {};
    let seen = Date.now();
    c.removeAllListeners('message');
    c.on('message', (_t, buf) => {
      let m: any;
      try { m = JSON.parse(buf.toString()); } catch { return; }
      seen = Date.now();
      if (m.k === 'bye') { peerCb(hostId, false); return; }
      if (m.k === 'd') for (const d of m.d ?? []) msgCb(hostId, d);
    });
    const out = batcher((_to, list) => c.publish(`${T}/h`, JSON.stringify({ f: id, k: 'd', d: list })));
    const watch = setInterval(() => { if (Date.now() - seen > 12000) { clearInterval(watch); peerCb(hostId, false); } }, 2000);
    return {
      id, isHost: false,
      send(_to, msg) { out.push(hostId, msg); },
      onMessage(cb) { msgCb = cb; },
      onPeer(cb) { peerCb = cb; },
      close() { c.publish(`${T}/h`, JSON.stringify({ f: id, k: 'bye' })); out.stop(); clearInterval(watch); setTimeout(() => c.end(true), 200); },
    };
  }
  throw new Error(lastErr === '방을 찾지 못함'
    ? '방을 찾을 수 없습니다. 코드를 다시 확인하고, 방장 화면에 방이 열려 있는지 확인해 주세요.'
    : '중계 서버에도 닿지 못했습니다. 인터넷 연결이나 보안 프로그램을 확인해 주세요.');
}

// ── 테스트용: 같은 브라우저 탭끼리 ───────────────────────────────────
function localHost(code: string): Transport {
  const ch = new BroadcastChannel(PREFIX + code);
  const id = 'host-' + code;
  const guests = new Set<string>();
  let msgCb: (from: string, msg: any) => void = () => {};
  let peerCb: (id: string, joined: boolean) => void = () => {};
  ch.onmessage = (e) => {
    const { from, to, data, ctl } = e.data;
    if (to !== id) return;
    if (ctl === 'join') { guests.add(from); ch.postMessage({ from: id, to: from, ctl: 'ok' }); peerCb(from, true); return; }
    if (ctl === 'leave') { if (guests.delete(from)) peerCb(from, false); return; }
    msgCb(from, data);
  };
  return {
    id, isHost: true,
    send(to, msg) {
      if (to === '*') for (const g of guests) ch.postMessage({ from: id, to: g, data: msg });
      else ch.postMessage({ from: id, to, data: msg });
    },
    onMessage(cb) { msgCb = cb; },
    onPeer(cb) { peerCb = cb; },
    close() { for (const g of guests) ch.postMessage({ from: id, to: g, ctl: 'leave' }); ch.close(); },
  };
}

async function localJoin(code: string): Promise<Transport> {
  const ch = new BroadcastChannel(PREFIX + code);
  const id = 'guest-' + Math.random().toString(36).slice(2, 8);
  const hostId = 'host-' + code;
  let msgCb: (from: string, msg: any) => void = () => {};
  let peerCb: (id: string, joined: boolean) => void = () => {};
  await new Promise<void>((res, rej) => {
    ch.onmessage = (e) => { if (e.data.to === id && e.data.ctl === 'ok') res(); };
    ch.postMessage({ from: id, to: hostId, ctl: 'join' });
    setTimeout(() => rej(new Error('방을 찾을 수 없습니다.')), 3000);
  });
  ch.onmessage = (e) => {
    const { from, to, data, ctl } = e.data;
    if (to !== id) return;
    if (ctl === 'leave') { peerCb(from, false); return; }
    msgCb(from, data);
  };
  return {
    id, isHost: false,
    send(_to, msg) { ch.postMessage({ from: id, to: hostId, data: msg }); },
    onMessage(cb) { msgCb = cb; },
    onPeer(cb) { peerCb = cb; },
    close() { ch.postMessage({ from: id, to: hostId, ctl: 'leave' }); ch.close(); },
  };
}
