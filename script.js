// eFootball client
const canvas = document.getElementById('canvas');
const ctx = canvas.getContext('2d');
const statusEl = document.getElementById('status');
const participantsEl = document.getElementById('participants');
const scoresListEl = document.getElementById('scores-list');
const timerEl = document.getElementById('timer');
const countdownOverlayEl = document.getElementById('countdown-overlay');
const gameOverEl = document.getElementById('game-over');

let ws = null;
let myId = null;
let myTeam = null;
let gameState = null;
let keys = [];
let startTime = null;
const gameDuration = 180;

function getRoomId() {
    const params = new URLSearchParams(window.location.search);
    return params.get('room') || crypto.randomUUID().slice(0, 8);
}

const roomId = getRoomId();
if (!window.location.search.includes('room=')) {
    window.history.replaceState({}, '', `?room=${roomId}`);
}

function connect() {
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/websocket?room=${roomId}`;

    statusEl.textContent = 'Connexion au serveur...';

    ws = new WebSocket(wsUrl);

    ws.onopen = () => {
        statusEl.textContent = 'Connecté';
    };

    ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        handleMessage(msg);
    };

    ws.onclose = () => {
        statusEl.textContent = 'Déconnecté. Reconnexion...';
        setTimeout(connect, 2000);
    };

    ws.onerror = () => {
        statusEl.textContent = 'Erreur de connexion';
    };
}

function handleMessage(msg) {
    switch (msg.type) {
        case 'init':
            myId = msg.playerId;
            myTeam = msg.team;
            gameState = msg.state;
            statusEl.textContent = `Tu es l'équipe ${myTeam === 'red' ? 'Rouge (flèches)' : 'Bleu (ZQSD)'}`;
            showWaiting();
            break;

        case 'state':
            gameState = msg.state;
            updateParticipants();
            updateScores();
            break;

        case 'start':
            countdownOverlayEl.classList.add('hidden');
            startTime = Date.now();
            statusEl.textContent = 'Match en cours !';
            break;

        case 'score':
            updateScores();
            statusEl.textContent = `BUT ${msg.team === 'red' ? 'Rouge' : 'Bleu'} !`;
            break;
    }
}

function updateParticipants() {
    const count = Object.keys(gameState.players).length;
    participantsEl.textContent = `Joueurs : ${count} / 2`;

    if (count === 2) {
        countdownOverlayEl.classList.add('hidden');
    } else {
        countdownOverlayEl.classList.remove('hidden');
        const textEl = countdownOverlayEl.querySelector('h2') || countdownOverlayEl;
        countdownOverlayEl.innerHTML = `
            <div>
                <h2>En attente d'un adversaire...</h2>
                <p>Partage ce lien :</p>
                <input type="text" value="${window.location.href}" style="width: 300px; padding: 8px; border-radius: 4px; border: none; text-align: center;" readonly>
            </div>
        `;
    }
}

function showWaiting() {
    countdownOverlayEl.classList.remove('hidden');
}

function updateScores() {
    if (!gameState) return;
    const scores = gameState.scores;
    scoresListEl.innerHTML = `
        <li style="color: #ff6b6b">🔴 Rouge : ${scores.red}</li>
        <li style="color: #4d94ff">🔵 Bleu : ${scores.blue}</li>
    `;
}

// Keyboard input
window.addEventListener('keydown', (e) => {
    const key = e.key;
    const valid = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'z', 'q', 's', 'd', 'w', 'a', 'Z', 'Q', 'S', 'D', 'W', 'A'];
    if (valid.includes(key) && !keys.includes(key)) {
        keys.push(key);
        sendInput();
    }
});

window.addEventListener('keyup', (e) => {
    keys = keys.filter(k => k !== e.key);
    sendInput();
});

function sendInput() {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: 'input', keys }));
    }
}

setInterval(() => {
    if (keys.length > 0) sendInput();
}, 40);

function drawField() {
    const w = canvas.width;
    const h = canvas.height;

    // Grass
    ctx.fillStyle = '#1e5631';
    ctx.fillRect(0, 0, w, h);

    // Stripes
    ctx.fillStyle = '#267a40';
    for (let x = 0; x < w; x += 100) {
        ctx.fillRect(x, 0, 50, h);
    }

    // Borders
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = 4;
    ctx.strokeRect(20, 20, w - 40, h - 40);

    // Center line
    ctx.beginPath();
    ctx.moveTo(w / 2, 20);
    ctx.lineTo(w / 2, h - 20);
    ctx.stroke();

    // Center circle
    ctx.beginPath();
    ctx.arc(w / 2, h / 2, 70, 0, Math.PI * 2);
    ctx.stroke();

    // Goals
    const goalTop = (h - 160) / 2;
    const goalBottom = (h + 160) / 2;
    ctx.lineWidth = 5;

    ctx.beginPath();
    ctx.moveTo(20, goalTop);
    ctx.lineTo(0, goalTop);
    ctx.lineTo(0, goalBottom);
    ctx.lineTo(20, goalBottom);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(w - 20, goalTop);
    ctx.lineTo(w, goalTop);
    ctx.lineTo(w, goalBottom);
    ctx.lineTo(w - 20, goalBottom);
    ctx.stroke();
}

function drawPlayer(p, id) {
    const isMe = id === myId;
    ctx.beginPath();
    ctx.arc(p.x, p.y, 18, 0, Math.PI * 2);
    ctx.fillStyle = p.team === 'red' ? '#ff4444' : '#4444ff';
    ctx.fill();
    ctx.lineWidth = isMe ? 4 : 2;
    ctx.strokeStyle = isMe ? '#ffd700' : '#fff';
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 14px Arial';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(p.team === 'red' ? 'R' : 'B', p.x, p.y);
}

function drawBall(ball) {
    ctx.beginPath();
    ctx.arc(ball.x, ball.y, 12, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.fill();
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.arc(ball.x - 3, ball.y - 3, 2, 0, Math.PI * 2);
    ctx.arc(ball.x + 3, ball.y + 2, 2, 0, Math.PI * 2);
    ctx.fill();
}

function draw() {
    drawField();

    if (gameState) {
        if (gameState.ball) drawBall(gameState.ball);
        for (const id in gameState.players) {
            drawPlayer(gameState.players[id], id);
        }
    }

    // Timer
    if (startTime) {
        const elapsed = Math.floor((Date.now() - startTime) / 1000);
        const remaining = Math.max(0, gameDuration - elapsed);
        const m = Math.floor(remaining / 60).toString().padStart(2, '0');
        const s = (remaining % 60).toString().padStart(2, '0');
        timerEl.textContent = `${m}:${s}`;
        if (remaining <= 0) showGameOver();
    }

    requestAnimationFrame(draw);
}

function showGameOver() {
    if (!gameState) return;
    const { red, blue } = gameState.scores;
    let winner = '';
    if (red > blue) winner = '🔴 Victoire Rouge !';
    else if (blue > red) winner = '🔵 Victoire Bleu !';
    else winner = 'Match nul !';

    gameOverEl.querySelector('#winner-text').textContent = winner;
    gameOverEl.classList.remove('hidden');
}

connect();
draw();
