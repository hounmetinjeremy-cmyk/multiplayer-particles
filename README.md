# ⚽ eFootball Cloudflare

Jeu de football multijoueur en temps réel, hébergé sur **Cloudflare Workers + Durable Objects + WebSockets**.

## 🎮 Comment jouer

1. Ouvre le lien du jeu dans ton navigateur
2. Partage le lien à un ami
3. Dès que l'adversaire se connecte, la partie commence
4. **Joueur 1 (Rouge)** : flèches directionnelles
5. **Joueur 2 (Bleu)** : touches Z/Q/S/D ou W/A/S/D

## 🏗 Architecture

- `src/index.js` → Worker Cloudflare + Durable Object (logique du jeu + WebSockets)
- `public/index.html` → Interface du jeu
- `public/game.js` → Client JavaScript (canvas, WebSocket, rendu)
- `public/style.css` → Styles
- `wrangler.toml` → Configuration Wrangler

## 🚀 Déploiement

### Local

```bash
npm install -g wrangler
wrangler login
wrangler dev
```

### Production

```bash
wrangler deploy
```

## 🕹 Règles du jeu

- 2 joueurs, un ballon, 2 buts
- Premier à marquer 5 buts gagne
- La physique et la synchronisation sont gérées par le serveur

## 📝 Note

Ce projet est un fork adapté de [multiplayer-particles](https://github.com/supernovaio/multiplayer-particles).
