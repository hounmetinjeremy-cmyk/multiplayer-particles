# ⚽ eFootball Cloudflare

Jeu de football multijoueur en temps réel, hébergé sur **Cloudflare Workers + Durable Objects + WebSockets**.

## 🎮 Comment jouer

1. Ouvre l'URL du Worker (ex: `https://efootball-cloudflare.hounmetinjeremy.workers.dev`)
2. Partage le lien avec un ami (le paramètre `?room=...` crée une room unique)
3. Quand 2 joueurs sont connectés, la partie commence automatiquement
4. **Joueur 1 (Rouge)** : flèches directionnelles
5. **Joueur 2 (Bleu)** : Z, Q, S, D ou W, A, S, D

## 🏗 Fichiers

- `worker.js` → Worker + Durable Object (logique serveur, physique, WebSockets)
- `index.html` → Interface du jeu
- `styles.css` → Styles
- `script.js` → Client JavaScript
- `wrangler.toml` → Configuration Wrangler

## 🚀 Déploiement

```bash
npm install -g wrangler
wrangler login
wrangler deploy
```

## 📝 Note

Forké et adapté depuis [multiplayer-particles](https://github.com/supernovaio/multiplayer-particles).
