# Know What I Meme

A real-time, Jackbox-style party game: everyone answers a ridiculous prompt with a GIF, then
votes on whose was best. One screen for the room, one phone per player.

Live at **https://saunalserver.xyz/kwim/**

![One player hosts on the big screen; everyone else scans the QR, joins on their phones and pops up in the lobby live](docs/img/join.gif)

## 🖥️ The big screen (host)

| Lobby: code, QR, live players | Presenting the memes | Round results |
|---|---|---|
| ![Host lobby with room code, QR code and players joining live](docs/img/host-lobby.png) | ![Big screen presenting submitted memes one by one](docs/img/host-round.png) | ![Round results with scores and who voted for whom](docs/img/host-results.png) |

## 📱 Your phone (player)

| Join with code and name | Vote on the prompt | Find your GIF |
|---|---|---|
| ![Phone join form with room code, name and optional selfie](docs/img/phone-join.png) | ![Phone view voting on the round prompt](docs/img/phone-vote.png) | ![Phone view searching GIFs for the round prompt](docs/img/phone-search.png) |

## 🎮 How to Play
1. **Create a room** on the big screen and share the 4-letter code (or let players scan the QR).
2. **Join** from any phone at `/kwim` and pick a name; add a selfie or play as your initial.
3. **Vote on the prompt** for the round from three options.
4. **Find your GIF** with the built-in Klipy search.
5. **Vote for the best** submission. Voting is anonymous and you can't vote for your own.
6. **Win** by racking up points across the rounds (the final round is worth double).

## ✨ Features
- **Real-time**: Socket.io keeps every device in step; a shared countdown runs on the big
  screen *and* on every phone.
- **Survives interruptions**: hosts and players auto-rejoin after a refresh, a dropped tunnel,
  or a locked phone. Mid-game disconnects keep the player's score and show a 📴 marker.
- **Mobile-first**: the phone is the controller; no pinch-zoom traps, no iOS input zoom, and it
  respects `prefers-reduced-motion`. Safari-specific layout and animation fixes throughout.
- **Cached GIF search**: repeated searches are served from an in-process LRU, so a full game
  costs a fraction of the API calls it used to.
- **Path-prefix friendly**: builds and runs under `/kwim/` behind a reverse proxy, or at the
  root for local play.

## 🛠️ Tech Stack
React 19 · Vite 7 · Tailwind 4 · Framer Motion · Lucide · Express 5 · Socket.io 4 ·
Klipy GIF API · Vitest

## 🔑 API Keys & Configuration

Copy `.env.example` to `.env` and fill in:

| Variable | Required | What it's for | Where to get it |
|---|---|---|---|
| `KLIPY_API_KEY` | ✅ | GIF search during rounds | Free account at **https://klipy.com** → dashboard → API key |
| `VITE_PUBLIC_URL` | | Public address baked into the QR code / join link (e.g. `https://example.com/kwim`). Leave unset for LAN play; the host's own address is used. | Your own deployment URL |
| `PORT` | | Server port (default `3002`) | |

> `VITE_PUBLIC_URL` is baked in at build time: change it and you must `npm run build` again.
> The phone camera used for profile pictures only works over HTTPS, so set it (with a reverse
> proxy) if you want photos.

## 🚀 Setup

You need [Node.js](https://nodejs.org) 20+ and a (free) Klipy API key.

**Option A: Interactive wizard (recommended)**

```bash
./setup.sh
```

Asks for your Klipy key and public URL, writes `.env` (it will not overwrite an existing one
without asking), and installs dependencies.

**Option B: Manual**

```bash
cp .env.example .env   # add your KLIPY_API_KEY
npm install
```

**Development** (hot-reloading frontend + server):

```bash
npm run dev:all         # server on :3002, Vite frontend on :5173
```

**Production** (server serves the built frontend):

```bash
npm run build
npm start               # everything on :3002
```

## 🔧 Scripts
| Command | What it does |
|---|---|
| `npm run dev` | Vite dev server (client) |
| `npm run dev:server` | Express + socket.io with watch |
| `npm run dev:all` | Both at once |
| `npm run build` | Production client into `dist/` |
| `npm start` | Serve the built app and the API from one process |
| `npm test` | Vitest run (86 tests) |
| `npm run test:watch` | Vitest in watch mode |
| `npm run test:coverage` | Coverage report for the server |
| `npm run lint` | ESLint |
| `npm run check` | Lint + tests: run this before committing |
| `npm run capture` | Regenerate every README screenshot and `join.gif` (see `scripts/capture.mjs`) |

## 🚢 Deploying behind a reverse proxy
The client is built with base `/kwim/`, and the API router is mounted at both `/` and `/kwim`,
so a proxy only needs to forward `/kwim*` and `/socket.io/*` to the app on the same origin.
Socket.io connects to `/socket.io/`, not `/kwim/socket.io/`; give it its own rule.

## 🛡️ License
MIT
