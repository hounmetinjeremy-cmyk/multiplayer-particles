// Cloudflare Worker + Durable Object for 2-player eFootball game

export class FootballRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map(); // websocket -> player info
    this.gameState = {
      players: {}, // id -> {x, y, vx, vy, team, score}
      ball: { x: 400, y: 250, vx: 0, vy: 0 },
      scores: { red: 0, blue: 0 },
      started: false,
      maxPlayers: 2,
      width: 800,
      height: 500
    };
    this.gameLoopInterval = null;
  }

  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname === '/websocket') {
      if (this.sessions.size >= this.gameState.maxPlayers) {
        return new Response('Room is full', { status: 403 });
      }

      const upgradeHeader = request.headers.get('Upgrade');
      if (upgradeHeader !== 'websocket') {
        return new Response('Expected websocket', { status: 400 });
      }

      const [client, server] = Object.values(new WebSocketPair());
      await this.handleSession(server);

      return new Response(null, {
        status: 101,
        webSocket: client
      });
    }

    return new Response('Not found', { status: 404 });
  }

  async handleSession(ws) {
    // Accept the websocket
    ws.accept();

    // Assign player id and team
    const playerId = crypto.randomUUID();
    const team = this.sessions.size === 0 ? 'red' : 'blue';
    const startX = team === 'red' ? 200 : 600;
    const startY = 250;

    this.sessions.set(ws, { id: playerId, team });
    this.gameState.players[playerId] = {
      x: startX,
      y: startY,
      vx: 0,
      vy: 0,
      team,
      radius: 15
    };

    // Send initial state to this player
    ws.send(JSON.stringify({
      type: 'init',
      playerId,
      team,
      state: this.gameState
    }));

    // Notify everyone about new player
    this.broadcast({
      type: 'playerJoined',
      playerId,
      team,
      state: this.gameState
    });

    // Start game loop if we have enough players
    if (this.sessions.size >= 2 && !this.gameLoopInterval) {
      this.startGameLoop();
    }

    ws.addEventListener('message', (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'input') {
          this.handleInput(playerId, data);
        }
      } catch (err) {
        console.error('Invalid message', err);
      }
    });

    ws.addEventListener('close', () => {
      this.sessions.delete(ws);
      delete this.gameState.players[playerId];
      this.broadcast({
        type: 'playerLeft',
        playerId,
        state: this.gameState
      });

      if (this.sessions.size < 2) {
        this.stopGameLoop();
      }
    });
  }

  handleInput(playerId, data) {
    const player = this.gameState.players[playerId];
    if (!player) return;

    const speed = 4;
    let dx = 0;
    let dy = 0;

    if (data.keys.includes('ArrowUp') || data.keys.includes('w')) dy -= 1;
    if (data.keys.includes('ArrowDown') || data.keys.includes('s')) dy += 1;
    if (data.keys.includes('ArrowLeft') || data.keys.includes('a')) dx -= 1;
    if (data.keys.includes('ArrowRight') || data.keys.includes('d')) dx += 1;

    // Normalize diagonal movement
    if (dx !== 0 && dy !== 0) {
      const len = Math.sqrt(dx * dx + dy * dy);
      dx /= len;
      dy /= len;
    }

    player.vx = dx * speed;
    player.vy = dy * speed;
  }

  startGameLoop() {
    this.gameState.started = true;
    this.gameLoopInterval = setInterval(() => {
      this.updatePhysics();
      this.broadcast({
        type: 'update',
        state: this.gameState
      });
    }, 1000 / 60); // 60 FPS
  }

  stopGameLoop() {
    if (this.gameLoopInterval) {
      clearInterval(this.gameLoopInterval);
      this.gameLoopInterval = null;
    }
    this.gameState.started = false;
  }

  updatePhysics() {
    const g = this.gameState;
    const friction = 0.98;
    const playerRadius = 15;
    const ballRadius = 10;

    // Update player positions
    for (const id in g.players) {
      const p = g.players[id];
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.8;
      p.vy *= 0.8;

      // Boundaries
      p.x = Math.max(playerRadius, Math.min(g.width - playerRadius, p.x));
      p.y = Math.max(playerRadius, Math.min(g.height - playerRadius, p.y));
    }

    // Ball physics
    g.ball.x += g.ball.vx;
    g.ball.y += g.ball.vy;
    g.ball.vx *= friction;
    g.ball.vy *= friction;

    // Ball boundaries
    const goalTop = 200;
    const goalBottom = 300;

    if (g.ball.y < goalTop || g.ball.y > goalBottom) {
      if (g.ball.x < ballRadius) {
        g.ball.x = ballRadius;
        g.ball.vx *= -0.7;
      } else if (g.ball.x > g.width - ballRadius) {
        g.ball.x = g.width - ballRadius;
        g.ball.vx *= -0.7;
      }
    } else {
      // Goal scored
      if (g.ball.x < 0) {
        g.scores.blue++;
        this.resetBall();
        this.broadcast({ type: 'goal', team: 'blue', scores: g.scores });
        return;
      } else if (g.ball.x > g.width) {
        g.scores.red++;
        this.resetBall();
        this.broadcast({ type: 'goal', team: 'red', scores: g.scores });
        return;
      }
    }

    if (g.ball.y < ballRadius || g.ball.y > g.height - ballRadius) {
      g.ball.y = Math.max(ballRadius, Math.min(g.height - ballRadius, g.ball.y));
      g.ball.vy *= -0.7;
    }

    // Player-ball collision
    for (const id in g.players) {
      const p = g.players[id];
      const dx = g.ball.x - p.x;
      const dy = g.ball.y - p.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const minDist = playerRadius + ballRadius;

      if (dist < minDist) {
        const angle = Math.atan2(dy, dx);
        const force = 6;
        g.ball.vx = Math.cos(angle) * force;
        g.ball.vy = Math.sin(angle) * force;

        // Separate ball from player
        const overlap = minDist - dist;
        g.ball.x += Math.cos(angle) * overlap;
        g.ball.y += Math.sin(angle) * overlap;
      }
    }
  }

  resetBall() {
    this.gameState.ball = {
      x: this.gameState.width / 2,
      y: this.gameState.height / 2,
      vx: 0,
      vy: 0
    };

    // Reset players
    for (const id in this.gameState.players) {
      const p = this.gameState.players[id];
      p.x = p.team === 'red' ? 200 : 600;
      p.y = 250;
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
        console.error('Send error', err);
      }
    }
  }
}

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // Room ID from path: /room/{id}
    const roomMatch = url.pathname.match(/^\/room\/([^\/]+)$/);
    let roomId = 'default';

    if (roomMatch) {
      roomId = roomMatch[1];
    } else if (url.pathname.startsWith('/websocket')) {
      // WebSocket upgrade request
    } else {
      return new Response('Not found', { status: 404 });
    }

    // Get or create the durable object for this room
    const id = env.FOOTBALL_ROOM.idFromName(roomId);
    const room = env.FOOTBALL_ROOM.get(id);

    return room.fetch(request);
  }
};
