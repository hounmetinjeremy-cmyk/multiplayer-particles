export class ParticleRoom {
  constructor(state, env) {
    this.state = state; this.env = env; this.sessions = new Map();
    this.W = 1000; this.H = 600; this.R = 18; this.r = 12; this.G = 160;
    this.s = { players: {}, ball: { x: 500, y: 300, vx: 0, vy: 0 }, scores: { red: 0, blue: 0 }, started: false };
    this.loop = null;
  }
  async fetch(req) {
    const url = new URL(req.url);
    if (url.pathname === '/websocket') {
      if (this.sessions.size >= 2) return new Response('Room full', { status: 403 });
      if (req.headers.get('Upgrade') !== 'websocket') return new Response('Expected websocket', { status: 400 });
      const p = new WebSocketPair();
      this.join(p[1]);
      return new Response(null, { status: 101, webSocket: p[0] });
    }
    return fetch(req);
  }
  join(ws) {
    ws.accept();
    const id = crypto.randomUUID();
    const team = this.sessions.size === 0 ? 'red' : 'blue';
    const x = team === 'red' ? 250 : this.W - 250;
    this.sessions.set(ws, { id, team });
    this.s.players[id] = { x, y: this.H / 2, vx: 0, vy: 0, team };
    ws.send(JSON.stringify({ type: 'init', playerId: id, team, state: this.s }));
    this.bcast({ type: 'state', state: this.s });
    if (this.sessions.size === 2 && !this.s.started) this.start();
    ws.addEventListener('message', e => {
      try { const d = JSON.parse(e.data); if (d.type === 'input') this.input(id, d.keys || []); } catch {}
    });
    ws.addEventListener('close', () => {
      this.sessions.delete(ws); delete this.s.players[id]; this.bcast({ type: 'state', state: this.s });
      if (this.sessions.size < 2) this.stop();
    });
  }
  input(id, keys) {
    const p = this.s.players[id]; if (!p) return;
    const sp = 5; let dx = 0, dy = 0;
    if (keys.includes('ArrowUp') || /[wWzZ]/.test(keys.find(k => 'wWzZ'.includes(k)))) dy--;
    if (keys.includes('ArrowDown') || keys.includes('s') || keys.includes('S')) dy++;
    if (keys.includes('ArrowLeft') || /[aAqQ]/.test(keys.find(k => 'aAqQ'.includes(k)))) dx--;
    if (keys.includes('ArrowRight') || keys.includes('d') || keys.includes('D')) dx++;
    if (dx && dy) { dx /= 1.414; dy /= 1.414; }
    p.vx = dx * sp; p.vy = dy * sp;
  }
  start() { this.s.started = true; this.bcast({ type: 'start' }); this.loop = setInterval(() => { this.update(); this.bcast({ type: 'state', state: this.s }); }, 1000 / 60); }
  stop() { this.s.started = false; if (this.loop) { clearInterval(this.loop); this.loop = null; } }
  update() {
    const s = this.s, R = this.R, r = this.r, G = this.G;
    for (const id in s.players) { const p = s.players[id]; p.x += p.vx; p.y += p.vy; p.vx *= .85; p.vy *= .85; p.x = Math.max(R, Math.min(this.W - R, p.x)); p.y = Math.max(R, Math.min(this.H - R, p.y)); }
    s.ball.x += s.ball.vx; s.ball.y += s.ball.vy; s.ball.vx *= .985; s.ball.vy *= .985;
    const gt = (this.H - G) / 2, gb = (this.H + G) / 2;
    if (s.ball.y >= gt && s.ball.y <= gb) { if (s.ball.x <= r) { s.scores.blue++; this.reset('blue'); return; } if (s.ball.x >= this.W - r) { s.scores.red++; this.reset('red'); return; } }
    if (s.ball.x < r) { s.ball.x = r; s.ball.vx *= -.8; } if (s.ball.x > this.W - r) { s.ball.x = this.W - r; s.ball.vx *= -.8; }
    if (s.ball.y < r) { s.ball.y = r; s.ball.vy *= -.8; } if (s.ball.y > this.H - r) { s.ball.y = this.H - r; s.ball.vy *= -.8; }
    for (const id in s.players) { const p = s.players[id], dx = s.ball.x - p.x, dy = s.ball.y - p.y, d = Math.sqrt(dx * dx + dy * dy); if (d < R + r) { const a = Math.atan2(dy, dx); const f = 3; s.ball.vx += Math.cos(a) * f + p.vx * .5; s.ball.vy += Math.sin(a) * f + p.vy * .5; } }
  }
  reset(team) { this.s.ball = { x: this.W / 2, y: this.H / 2, vx: 0, vy: 0 }; this.bcast({ type: 'score', team, scores: this.s.scores }); for (const id in this.s.players) { const p = this.s.players[id]; p.x = p.team === 'red' ? 250 : this.W - 250; p.y = this.H / 2; p.vx = 0; p.vy = 0; } }
  bcast(msg) { const txt = JSON.stringify(msg); for (const [ws] of this.sessions) { try { ws.send(txt); } catch {} } }
}

export default {
  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    const roomId = url.searchParams.get('room') || 'default';
    if (url.pathname === '/websocket') {
      const id = env.PARTICLE_ROOM.idFromName(roomId);
      const room = env.PARTICLE_ROOM.get(id);
      return room.fetch(req);
    }
    return env.ASSETS ? env.ASSETS.fetch(req) : new Response('Fallback not configured', { status: 404 });
  }
};
