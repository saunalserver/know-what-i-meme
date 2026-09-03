# Know What I Meme

A real-time, Jackbox-style party game: everyone answers a ridiculous prompt with a GIF, then
votes on whose was best. One screen for the room, one phone per player.

Live at **https://saunalserver.xyz/kwim/**

## 🎮 How to Play
1. **Create a room** on the big screen and share the 4-letter code (or let players scan the QR).
2. **Join** from any phone at `/kwim` — pick a name and take a selfie or choose an emoji.
3. **Vote on the prompt** for the round from three options.
4. **Find your GIF** with the built-in Klipy search.
5. **Vote for the best** submission — you can't vote for your own.
6. **Win** by racking up points across the rounds.

## ✨ Features
- **Real-time**: Socket.io keeps every device in step; a shared countdown runs on the big
  screen *and* on every phone.
- **Survives interruptions**: hosts and players auto-rejoin after a refresh, a dropped tunnel,
  or a locked phone — mid-game disconnects keep the player's score and show a 📴 marker.
- **Mobile-first**: the phone is the controller; no pinch-zoom traps, no iOS input zoom, and it
  respects `prefers-reduced-motion`.
- **Cached GIF search**: repeated searches are served from an in-process LRU, so a full game
  costs a fraction of the API calls it used to.
- **Path-prefix friendly**: builds and runs under `/kwim/` behind a reverse proxy, or at the
  root for local play.

## 🛠️ Tech Stack
React 19 · Vite 7 · Tailwind 4 · Framer Motion · Express 5 · Socket.io 4 · Klipy GIF API · Vitest

## 🚀 Quick Start
```bash
npm install
cp .env.example .env      # then add your KLIPY_API_KEY
npm run dev:server        # API + sockets on :3002
npm run dev               # client on :5173
```
Open http://localhost:5173.

`./setup.sh` does the same thing interactively.

## 🔧 Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (client) |
| `npm run dev:server` | Express + socket.io with watch |
| `npm run build` | Production client into `dist/` |
| `npm start` | Serve the built app and the API from one process |
| `npm test` | Vitest run (86 tests) |
| `npm run test:coverage` | Coverage report for the server |
| `npm run lint` | ESLint |
| `npm run check` | Lint + tests — run this before committing |

## ⚙️ Configuration
| Variable | Required | Purpose |
|---|---|---|
| `KLIPY_API_KEY` | yes | GIF search |
| `PORT` | no | Server port, default `3002` |
| `VITE_PUBLIC_URL` | no | Absolute URL the lobby QR code encodes, when the public address differs from the server's own origin |

## 🚢 Deploying
`npm run build`, then serve with `NODE_ENV=production node server.js`. The client is built with
base `/kwim/`, and the API router is mounted at both `/` and `/kwim`, so a reverse proxy only
needs to forward `/kwim*` and `/socket.io/*` to the app.

## 🛡️ License
MIT
