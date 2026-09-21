# ⚽ eFootball Cloudflare

Jeu de football multijoueur en temps réel, hébergé gratuitement sur **Cloudflare Pages + Durable Objects + WebSockets**.

## 🎮 Jouer

1. Ouvre le lien : https://multiplayer-particles.pages.dev
2. Partage le même lien à un ami
3. Quand 2 joueurs sont connectés, la partie commence
4. 🔴 Joueur 1 : Flèches directionnelles
5. 🔵 Joueur 2 : Z, Q, S, D ou W, A, S, D

## 📁 Fichiers

- `index.html` → Interface du jeu
- `styles.css` → Styles
- `script.js` → Client JavaScript (canvas + WebSocket)
- `functions/_worker.js` → Pages Function + Durable Object (logique serveur)
- `wrangler.toml` → Configuration Cloudflare

## 🚀 Déploiement

Déployé automatiquement à chaque push sur `main` via Cloudflare Pages.

## 📝 Note

Forké et adapté depuis [multiplayer-particles](https://github.com/supernovaio/multiplayer-particles).
