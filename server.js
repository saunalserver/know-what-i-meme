import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

import { setupSocketHandlers } from './server/socket/index.js';
import { createApiRouter } from './server/routes/api.js';
import { gameStore } from './server/data/gameStore.js';
import { gifCache } from './server/services/gifCache.js';

dotenv.config();

const __dirname = dirname(fileURLToPath(import.meta.url));

const PORT = Number(process.env.PORT) || 3002;
const HOST = process.env.HOST || '0.0.0.0';
const isProduction = process.env.NODE_ENV === 'production';

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST'],
    credentials: false,
  },
  transports: ['polling', 'websocket'],
  // Photos are base64 data URLs; the client downscales them, but leave room.
  maxHttpBufferSize: 2e6,
});

// Player photos arrive as data URLs inside socket payloads, not HTTP bodies,
// so a small JSON limit is plenty here.
app.use(express.json({ limit: '128kb' }));

app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.sendStatus(200);
  next();
});

// The app lives under /kwim in production (Caddy passes the prefix through),
// and at the root in development. Mounting both keeps one set of route
// definitions valid in either environment.
const apiRouter = createApiRouter();
app.use('/', apiRouter);
app.use('/kwim', apiRouter);

if (isProduction) {
  const distDir = join(__dirname, 'dist');
  app.use('/kwim', express.static(distDir));
  // Client-side routing: any unmatched /kwim path renders the SPA shell.
  app.get('/kwim/{*path}', (req, res) => {
    res.sendFile(join(distDir, 'index.html'));
  });
  // Bare / is the portfolio site's territory; point strays at the game.
  app.get('/', (req, res) => res.redirect('/kwim/'));
}

setupSocketHandlers(io);

// Opt-in local GIF pool; a no-op unless GIF_CACHE_DIR is set. Never fatal --
// a missing drive must not stop the game from starting.
gifCache.init().catch(error => console.error(`❌ GIF pool init failed: ${error.message}`));

httpServer.listen(PORT, HOST, () => {
  console.log(`🎮 Know What I Meme server running on port ${PORT}`);
  console.log(`📡 Socket.io ready (${isProduction ? 'production, /kwim prefix' : 'development'})`);
});

// Shut down cleanly so systemd restarts don't leave sockets or timers behind.
let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`👋 ${signal} received, shutting down`);

  gameStore.shutdown();
  gifCache.shutdown().catch(() => {});
  io.close();
  httpServer.close(() => process.exit(0));

  // Don't hang forever on a stuck connection.
  setTimeout(() => process.exit(0), 5000).unref();
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

export { app, httpServer, io };
