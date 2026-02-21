import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import dotenv from 'dotenv';

import { setupSocketHandlers } from './server/socket/index.js';
import { gifService } from './server/services/gifService.js';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'OPTIONS'],
    credentials: false,
  },
  allowEIO3: true, // Support older clients
  transports: ['polling', 'websocket'],
});

const PORT = process.env.PORT || 3002;

// Middleware
app.use(express.json());

// CORS for API routes
app.use((req, res, next) => {
  res.header('Access-Control-Allow-Origin', '*');
  res.header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.header('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') {
    return res.sendStatus(200);
  }
  next();
});

// API Routes
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/api/gif/search', async (req, res) => {
  const { q, limit = 20, exclude } = req.query;
  if (!q) {
    return res.status(400).json({ error: 'Query parameter "q" is required' });
  }
  try {
    const excludeIds = exclude ? exclude.split(',') : [];
    const gifs = await gifService.search(q, parseInt(limit), excludeIds);
    res.json(gifs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gif/trending', async (req, res) => {
  const { limit = 20, fresh = false } = req.query;
  try {
    const gifs = await gifService.getTrending(parseInt(limit), fresh === 'true');
    res.json(gifs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gif/random', async (req, res) => {
  const { limit = 20 } = req.query;
  try {
    const gifs = await gifService.getRandom(parseInt(limit));
    res.json(gifs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gif/category/:categoryId', async (req, res) => {
  const { categoryId } = req.params;
  const { limit = 20 } = req.query;
  try {
    const gifs = await gifService.getByCategory(categoryId, parseInt(limit));
    res.json(gifs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/api/gif/categories', (req, res) => {
  res.json(gifService.getCategories());
});

app.get('/api/gif/emoji-map', (req, res) => {
  res.json(gifService.getEmojiMap());
});

app.get('/api/gif/usage', (req, res) => {
  res.json(gifService.getUsageStats());
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
  app.get('*', (req, res) => {
    res.sendFile(join(__dirname, 'dist', 'index.html'));
  });
}

// Setup Socket.io handlers
setupSocketHandlers(io);

// Start server on all interfaces
httpServer.listen(PORT, '0.0.0.0', () => {
  console.log(`🎮 Know What I Meme server running on port ${PORT}`);
  console.log(`📡 Socket.io ready for connections`);
  console.log(`🌐 Access via:`);
  console.log(`   - Local: http://localhost:${PORT}`);
  console.log(`   - LAN: http://YOUR_SERVER_IP:${PORT}`);
  console.log(`   - Tailscale: http://YOUR_TAILSCALE_IP:${PORT}`);
});
