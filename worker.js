// Durable Object eFootball game server
export class ParticleRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // ws -> { playerId, team }

    this.width = 1000;
    this.height = 600;
    this.playerRadius = 18;
    this.ballRadius = 12;
    this.goalSize = 160;

    this.stateObj = {
      players: {}, // playerId -> {x, y, vx, vy, team}
      ball: { x: this.width / 2, y: this.height / 2, vx: 0, vy: 0 },
      scores: { red: 0, blue: 0 },
      started: false,
      width: this.width,
      height: this.height
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

      const [client, server] = Object.values(new WebSocketPair());
      this.handleSession(server);
      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response('Not found', { status: 404 });
  }

  async handleSession(ws) {
    ws.accept();

    const playerId = crypto.randomUUID();
    const team = this.sessions.size === 0 ? 'red' : 'blue';
    const startX = team === 'red' ? 250 : this.width - 250;
    const startY = this.height / 2;

    this.sessions.set(ws, { playerId, team });
    this.stateObj.players[playerId] = { x: startX, y: startY, vx: 0, vy: 0, team };

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

    // Move players
    for (const id in s.players) {
      const p = s.players[id];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.85;
      p.vy *= 0.85;

      if (p.x < this.playerRadius) p.x = this.playerRadius;
      if (p.x > this.width - this.playerRadius) p.x = this.width - this.playerRadius;
      if (p.y < this.playerRadius) p.y = this.playerRadius;
      if (p.y > this.height - this.playerRadius) p.y = this.height - this.playerRadius;
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
      if (s.ball.x <= this.ballRadius) {
        this.score('blue');
        return;
      }
      if (s.ball.x >= this.width - this.ballRadius) {
        this.score('red');
        return;
      }
    }

    if (s.ball.x < this.ballRadius) {
      s.ball.x = this.ballRadius;
      s.ball.vx *= -0.8;
    }
    if (s.ball.x > this.width - this.ballRadius) {
      s.ball.x = this.width - this.ballRadius;
      s.ball.vx *= -0.8;
    }
    if (s.ball.y < this.ballRadius) {
      s.ball.y = this.ballRadius;
      s.ball.vy *= -0.8;
    }
    if (s.ball.y > this.height - this.ballRadius) {
      s.ball.y = this.height - this.ballRadius;
      s.ball.vy *= -0.8;
    }

    // Player-ball collision
    for (const id in s.players) {
      const p = s.players[id];
      const dx = s.ball.x - p.x;
      const dy = s.ball.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = this.playerRadius + this.ballRadius;

      if (dist < minDist) {
        const angle = Math.atan2(dy, dx);
        const force = 9;
        s.ball.vx = Math.cos(angle) * force;
        s.ball.vy = Math.sin(angle) * force;
        const overlap = minDist - dist;
        s.ball.x += Math.cos(angle) * overlap;
        s.ball.y += Math.sin(angle) * overlap;
      }
    }
  }

  score(team) {
    this.stateObj.scores[team]++;
    this.resetPositions();
    this.broadcast({ type: 'score', team, scores: this.stateObj.scores });
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
        console.error('Broadcast error', err);
      }
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Static files
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/styles.css' || url.pathname === '/script.js') {
      try {
        const filePath = url.pathname === '/' ? 'index.html' : url.pathname.slice(1);
        const resp = await fetch(new URL(filePath, request.url));
        if (resp.ok) return resp;
      } catch (err) {}
    }

    const roomId = url.searchParams.get('room') || 'default';
    const id = env.PARTICLE_ROOM.idFromName(roomId);
    const room = env.PARTICLE_ROOM.get(id);
    return room.fetch(request);
  }
};
