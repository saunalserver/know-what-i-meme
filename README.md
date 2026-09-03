# Know What I Meme

A real-time, Jackbox-style multiplayer party game where friends compete to find the perfect GIF for ridiculous prompts.

## 🎮 How to Play
1. **Create a Room**: The host creates a game room and shares the unique 4-character room code.
2. **Join the Fun**: Players join from their own devices by entering the room code and selecting a profile.
3. **Vote on Prompts**: Players vote on which ridiculous prompt to use for the round.
4. **GIF Search**: Use the integrated Klipy-powered search to find the perfect GIF that matches the chosen prompt.
5. **Vote for the Best**: Review everyone's submissions anonymously and vote for your favorite meme.
6. **Win the Game**: Accumulate points across multiple rounds to be crowned the ultimate meme master!

## ✨ Key Features
- **Real-time Gameplay**: Powered by Socket.io for instantaneous updates across all devices.
- **Robust Reconnection**: Interrupted sessions? Players can seamlessly rejoin active games without losing their state.
- **Safari Optimized**: Features hardware-accelerated animations and specialized layout fixes for a smooth experience on iOS and macOS devices.
- **Integrated GIF Browser**: Optimized Klipy API integration for fast, relevant GIF searching.
- **Mobile-First Design**: Responsive interface built with React and TailwindCSS, perfect for phone-as-a-controller gameplay.

## 🛠️ Tech Stack
- **Frontend**: React, TailwindCSS, Framer Motion, Lucide React
- **Backend**: Node.js, Express, Socket.io
- **API**: Klipy GIF API
- **Deployment**: Production-ready with support for path-based routing (e.g., `/kwim/`)

## 🔑 API Keys & Configuration

Copy `.env.example` to `.env` and fill in:

| Variable | Required | What it's for | Where to get it |
|---|---|---|---|
| `KLIPY_API_KEY` | ✅ | GIF search during rounds | Create a free account at **https://klipy.com** → dashboard → API key. |
| `VITE_PUBLIC_URL` | — | Public address baked into the QR code / join link (e.g. `https://example.com/kwim`). Leave unset for LAN play — the host's own address is used. | Your own deployment URL, if you host it publicly. |
| `PORT` | — | Server port (default `3002`) | — |

> Note: the phone camera used for profile pictures only works over HTTPS, so use `VITE_PUBLIC_URL` with a reverse proxy if you want photos.

## 🚀 Setup

You need [Node.js](https://nodejs.org) 18+ and a (free) Klipy API key.

**Option A — Interactive wizard (recommended)**

```bash
./setup.sh
```

Asks for your Klipy API key, writes `.env`, installs dependencies, and offers to build + start.

**Option B — Manual**

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
npm start               # serves everything on :3002
```

The app also works under a path prefix like `/kwim/` behind a reverse proxy
(Caddy/nginx) — the server serves itself under the prefix and passes Socket.io
through on the same origin.

## ▶️ Playing

1. Host creates a room and gets a 4-character code + QR code.
2. Players scan the QR (or open the link) on their phones, enter the code, pick a profile.
3. Everyone votes on the round's prompt.
4. Each player searches (Klipy) and submits a GIF for it.
5. Anonymous submissions are shown — vote for the best one.
6. Points across rounds crown the meme master. Disconnected players can rejoin with the room code.

## 🧪 Tests & Lint

```bash
npm run check           # eslint + vitest
npm run test:coverage   # with coverage
```

## 🛡️ License
MIT
