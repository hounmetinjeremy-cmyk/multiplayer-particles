// Client-side eFootball game
const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const overlayEl = document.getElementById('overlay');
const waitingEl = document.getElementById('waiting');
const startingEl = document.getElementById('starting');
const roomLinkInput = document.getElementById('room-link');
const countdownEl = document.getElementById('countdown');
const redScoreEl = document.getElementById('red-score');
const blueScoreEl = document.getElementById('blue-score');

let ws = null;
let myId = null;
let myTeam = null;
let gameState = null;
let keys = [];

// Generate or get room ID from URL
function getRoomId() {
  const urlParams = new URLSearchParams(window.location.search);
  return urlParams.get('room') || Math.random().toString(36).substring(2, 10);
}

const roomId = getRoomId();

// Update URL without reloading
if (!window.location.search.includes('room=')) {
  window.history.replaceState({}, '', `?room=${roomId}`);
}

roomLinkInput.value = window.location.href;
roomLinkInput.onclick = () => {
  roomLinkInput.select();
  document.execCommand('copy');
  statusEl.textContent = 'Lien copié !';
};

function connect() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}/websocket`;

  statusEl.textContent = 'Connexion au serveur...';

  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    statusEl.textContent = 'Connecté. En attente d\'un adversaire...';
  };

  ws.onmessage = (event) => {
    const msg = JSON.parse(event.data);
    handleMessage(msg);
  };

  ws.onclose = () => {
    statusEl.textContent = 'Déconnecté. Reconnexion dans 2s...';
    setTimeout(connect, 2000);
  };

  ws.onerror = (err) => {
    console.error('WebSocket error:', err);
    statusEl.textContent = 'Erreur de connexion.';
  };
}

function handleMessage(msg) {
  switch (msg.type) {
    case 'init':
      myId = msg.playerId;
      myTeam = msg.team;
      gameState = msg.state;
      statusEl.textContent = `Tu joues l'équipe ${myTeam === 'red' ? 'Rouge' : 'Bleu'}`;
      break;

    case 'playerJoined':
      gameState = msg.state;
      statusEl.textContent = 'Adversaire trouvé !';
      showStartingCountdown();
      break;

    case 'playerLeft':
      gameState = msg.state;
      statusEl.textContent = 'Adversaire déconnecté.';
      waitingEl.classList.remove('hidden');
      startingEl.classList.add('hidden');
      overlayEl.classList.remove('hidden');
      break;

    case 'update':
      gameState = msg.state;
      break;

    case 'goal':
      updateScoreboard(msg.scores);
      statusEl.textContent = `BUT pour l'équipe ${msg.team === 'red' ? 'Rouge' : 'Bleu'} !`;
      break;
  }
}

function showStartingCountdown() {
  waitingEl.classList.add('hidden');
  startingEl.classList.remove('hidden');
  let count = 3;
  countdownEl.textContent = count;

  const interval = setInterval(() => {
    count--;
    countdownEl.textContent = count;
    if (count <= 0) {
      clearInterval(interval);
      overlayEl.classList.add('hidden');
      statusEl.textContent = 'Match en cours !';
    }
  }, 1000);
}

function updateScoreboard(scores) {
  redScoreEl.textContent = scores.red;
  blueScoreEl.textContent = scores.blue;
}

function sendInput() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'input', keys }));
  }
}

// Keyboard controls
window.addEventListener('keydown', (e) => {
  const key = e.key;
  const validKeys = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'w', 'a', 's', 'd', 'q', 'z'];
  if (validKeys.includes(key) && !keys.includes(key)) {
    keys.push(key);
    sendInput();
  }
});

window.addEventListener('keyup', (e) => {
  keys = keys.filter(k => k !== e.key);
  sendInput();
});

// Repeated input sending for smoother movement
setInterval(() => {
  if (keys.length > 0) sendInput();
}, 50);

// Drawing
function drawField() {
  const w = canvas.width;
  const h = canvas.height;

  // Grass
  ctx.fillStyle = '#2d7a3e';
  ctx.fillRect(0, 0, w, h);

  // Stripes
  ctx.fillStyle = '#368a49';
  for (let i = 0; i < w; i += 100) {
    ctx.fillRect(i, 0, 50, h);
  }

  // Borders
  ctx.strokeStyle = 'rgba(255,255,255,0.6)';
  ctx.lineWidth = 4;
  ctx.strokeRect(20, 20, w - 40, h - 40);

  // Center line
  ctx.beginPath();
  ctx.moveTo(w / 2, 20);
  ctx.lineTo(w / 2, h - 20);
  ctx.stroke();

  // Center circle
  ctx.beginPath();
  ctx.arc(w / 2, h / 2, 60, 0, Math.PI * 2);
  ctx.stroke();

  // Goals
  const goalTop = 200;
  const goalHeight = 100;
  ctx.strokeStyle = '#fff';
  ctx.lineWidth = 3;

  // Left goal
  ctx.strokeRect(0, goalTop, 20, goalHeight);
  // Right goal
  ctx.strokeRect(w - 20, goalTop, 20, goalHeight);
}

function drawPlayer(player, id) {
  const isMe = id === myId;

  // Player body
  ctx.beginPath();
  ctx.arc(player.x, player.y, player.radius, 0, Math.PI * 2);
  ctx.fillStyle = player.team === 'red' ? '#ff4444' : '#4444ff';
  ctx.fill();
  ctx.strokeStyle = isMe ? '#ffd700' : '#fff';
  ctx.lineWidth = isMe ? 3 : 2;
  ctx.stroke();

  // Team letter
  ctx.fillStyle = '#fff';
  ctx.font = 'bold 12px Arial';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(player.team === 'red' ? 'R' : 'B', player.x, player.y);
}

function drawBall(ball) {
  ctx.beginPath();
  ctx.arc(ball.x, ball.y, 10, 0, Math.PI * 2);
  ctx.fillStyle = '#fff';
  ctx.fill();
  ctx.strokeStyle = '#000';
  ctx.lineWidth = 2;
  ctx.stroke();

  // Ball pattern
  ctx.fillStyle = '#000';
  ctx.beginPath();
  ctx.arc(ball.x - 3, ball.y - 3, 2, 0, Math.PI * 2);
  ctx.arc(ball.x + 3, ball.y + 2, 2, 0, Math.PI * 2);
  ctx.fill();
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawField();

  if (gameState) {
    if (gameState.ball) drawBall(gameState.ball);
    for (const id in gameState.players) {
      drawPlayer(gameState.players[id], id);
    }
  }

  requestAnimationFrame(draw);
}

// Start
connect();
draw();
