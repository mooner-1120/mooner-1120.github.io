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
  return useLocal() ? localHost(code) : peerHost(code);
}

export async function joinRoom(code: string): Promise<Transport> {
  return useLocal() ? localJoin(code) : peerJoin(code);
}

// ── PeerJS ─────────────────────────────────────────────────────────
type Conn = import('peerjs').DataConnection;

async function loadPeer() {
  const mod = await import('peerjs');
  return mod.Peer;
}

function friendly(err: any): Error {
  const t = err?.type ?? '';
  if (t === 'peer-unavailable') return new Error('방을 찾을 수 없습니다. 코드를 다시 확인해 주세요.');
  if (t === 'unavailable-id') return new Error('이미 쓰는 방 코드입니다. 다시 시도해 주세요.');
  if (t === 'network' || t === 'server-error' || t === 'socket-error') return new Error('연결 서버에 닿지 못했습니다. 인터넷 연결을 확인해 주세요.');
  if (t === 'browser-incompatible') return new Error('이 브라우저(또는 이 페이지)에서는 멀티플레이 연결(WebRTC)을 쓸 수 없습니다.');
  return new Error('연결에 실패했습니다: ' + (err?.message ?? t ?? err));
}

async function peerHost(code: string): Promise<Transport> {
  const Peer = await loadPeer();
  const peer = new Peer(PREFIX + code, { debug: 0 });
  const conns = new Map<string, Conn>();
  let msgCb: (from: string, msg: any) => void = () => {};
  let peerCb: (id: string, joined: boolean) => void = () => {};
  await new Promise<void>((res, rej) => {
    peer.on('open', () => res());
    peer.on('error', (e) => rej(friendly(e)));
    setTimeout(() => rej(new Error('연결 서버 응답이 없습니다. 잠시 후 다시 시도해 주세요.')), 12000);
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

async function peerJoin(code: string): Promise<Transport> {
  const Peer = await loadPeer();
  const peer = new Peer({ debug: 0 });
  let msgCb: (from: string, msg: any) => void = () => {};
  let peerCb: (id: string, joined: boolean) => void = () => {};
  await new Promise<void>((res, rej) => {
    peer.on('open', () => res());
    peer.on('error', (e) => rej(friendly(e)));
    setTimeout(() => rej(new Error('연결 서버 응답이 없습니다.')), 12000);
  });
  const hostId = PREFIX + code;
  const conn = peer.connect(hostId, { reliable: true });
  await new Promise<void>((res, rej) => {
    conn.on('open', () => res());
    peer.on('error', (e) => rej(friendly(e)));
    setTimeout(() => rej(new Error('방장과 연결하지 못했습니다. 코드를 확인하거나 다시 시도해 주세요.')), 15000);
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
