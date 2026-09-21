// Cloudflare Pages Function + Durable Object eFootball game
export class ParticleRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.width = 1000;
    this.height = 600;
    this.playerRadius = 18;
    this.ballRadius = 12;
    this.goalSize = 160;

    this.stateObj = {
      players: {},
      ball: { x: this.width / 2, y: this.height / 2, vx: 0, vy: 0 },
      scores: { red: 0, blue: 0 },
      started: false,
    };

    this.gameLoop = null;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      if (this.sessions.size >= 2) {
        return new Response('Room full', { status: 403 });
      }
      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected websocket', { status: 400 });
      }

      const pair = new WebSocketPair();
      this.handleSession(pair[1]);
      return new Response(null, { status: 101, webSocket: pair[0] });
    }

    return new Response('Not found', { status: 404 });
  }

  async handleSession(ws) {
    ws.accept();

    const playerId = crypto.randomUUID();
    const team = this.sessions.size === 0 ? 'red' : 'blue';
    const startX = team === 'red' ? 250 : this.width - 250;

    this.sessions.set(ws, { playerId, team });
    this.stateObj.players[playerId] = { x: startX, y: this.height / 2, vx: 0, vy: 0, team };

    ws.send(JSON.stringify({ type: 'init', playerId, team, state: this.stateObj }));
    this.broadcast({ type: 'state', state: this.stateObj });

    if (this.sessions.size === 2 && !this.stateObj.started) {
      this.startGame();
    }

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'input') {
          this.handleInput(playerId, data.keys || []);
        }
      } catch (err) {
        console.error('Bad message', err);
      }
    });

    ws.addEventListener('close', () => {
      this.sessions.delete(ws);
      delete this.stateObj.players[playerId];
      this.broadcast({ type: 'state', state: this.stateObj });
      if (this.sessions.size < 2) {
        this.stopGame();
      }
    });
  }

  handleInput(playerId, keys) {
    const p = this.stateObj.players[playerId];
    if (!p) return;

    const speed = 5;
    let dx = 0;
    let dy = 0;

    if (keys.includes('ArrowUp') || keys.includes('w') || keys.includes('W') || keys.includes('z') || keys.includes('Z')) dy -= 1;
    if (keys.includes('ArrowDown') || keys.includes('s') || keys.includes('S')) dy += 1;
    if (keys.includes('ArrowLeft') || keys.includes('a') || keys.includes('A') || keys.includes('q') || keys.includes('Q')) dx -= 1;
    if (keys.includes('ArrowRight') || keys.includes('d') || keys.includes('D')) dx += 1;

    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(2);
      dx /= len;
      dy /= len;
    }

    p.vx = dx * speed;
    p.vy = dy * speed;
  }

  startGame() {
    this.stateObj.started = true;
    this.broadcast({ type: 'start' });
    this.gameLoop = setInterval(() => {
      this.update();
      this.broadcast({ type: 'state', state: this.stateObj });
    }, 1000 / 60);
  }

  stopGame() {
    this.stateObj.started = false;
    if (this.gameLoop) {
      clearInterval(this.gameLoop);
      this.gameLoop = null;
    }
  }

  update() {
    const s = this.stateObj;
    const R = this.playerRadius;
    const r = this.ballRadius;

    // Move players
    for (const id in s.players) {
      const p = s.players[id];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.85;
      p.vy *= 0.85;

      if (p.x < R) p.x = R;
      if (p.x > this.width - R) p.x = this.width - R;
      if (p.y < R) p.y = R;
      if (p.y > this.height - R) p.y = this.height - R;
    }

    // Move ball
    s.ball.x += s.ball.vx;
    s.ball.y += s.ball.vy;
    s.ball.vx *= 0.985;
    s.ball.vy *= 0.985;

    // Ball boundary with goals
    const goalTop = (this.height - this.goalSize) / 2;
    const goalBottom = (this.height + this.goalSize) / 2;

    if (s.ball.y >= goalTop && s.ball.y <= goalBottom) {
      if (s.ball.x <= r) {
        this.goal('blue');
        return;
      }
      if (s.ball.x >= this.width - r) {
        this.goal('red');
        return;
      }
    }

    // Walls
    if (s.ball.x < r) { s.ball.x = r; s.ball.vx *= -0.8; }
    if (s.ball.x > this.width - r) { s.ball.x = this.width - r; s.ball.vx *= -0.8; }
    if (s.ball.y < r) { s.ball.y = r; s.ball.vy *= -0.8; }
    if (s.ball.y > this.height - r) { s.ball.y = this.height - r; s.ball.vy *= -0.8; }

    // Player-ball collisions
    for (const id in s.players) {
      const p = s.players[id];
      const dx = s.ball.x - p.x;
      const dy = s.ball.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < R + r) {
        const a = Math.atan2(dy, dx);
        const push = (R + r - dist) / 2;
        p.x -= Math.cos(a) * push;
        p.y -= Math.sin(a) * push;
        s.ball.x += Math.cos(a) * push;
        s.ball.y += Math.sin(a) * push;
        s.ball.vx += Math.cos(a) * 8;
        s.ball.vy += Math.sin(a) * 8;
      }
    }
  }

  goal(team) {
    this.stateObj.scores[team]++;
    this.broadcast({ type: 'score', team, scores: this.stateObj.scores });
    this.resetPositions();
  }

  resetPositions() {
    const s = this.stateObj;
    s.ball = { x: this.width / 2, y: this.height / 2, vx: 0, vy: 0 };
    for (const id in s.players) {
      const p = s.players[id];
      p.x = p.team === 'red' ? 250 : this.width - 250;
      p.y = this.height / 2;
      p.vx = 0;
      p.vy = 0;
    }
  }

  broadcast(message) {
    const data = JSON.stringify(message);
    for (const ws of this.sessions.keys()) {
      try {
        ws.send(data);
      } catch (err) {
        // session may be closing
      }
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    const pathname = url.pathname;

    // Static asset paths
    if (pathname === '/' || pathname === '/index.html' || pathname === '/styles.css' || pathname === '/script.js') {
      const assetName = pathname === '/' ? 'index.html' : pathname.slice(1);
      try {
        const asset = await env.ASSETS.fetch(new URL(assetName, request.url));
        return asset;
      } catch (e) {
        console.error('Asset fetch error', e);
      }
    }

    if (pathname === '/websocket') {
      // Get or create a Durable Object instance based on room id
      const roomId = url.searchParams.get('room') || 'default-room';
      const id = env.PARTICLE_ROOM.idFromName(roomId);
      const room = env.PARTICLE_ROOM.get(id);
      return room.fetch(request);
    }

    return new Response('Not found', { status: 404 });
  }
};
