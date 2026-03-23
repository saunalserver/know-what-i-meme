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

// API Routes (with base path support for production)
const API_BASE = process.env.NODE_ENV === 'production' ? '/games/kwim' : '';

app.get(`${API_BASE}/api/health`, (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get(`${API_BASE}/api/gif/search`, async (req, res) => {
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

// Klipy GIF Browser
// API Routes (with /games/kwim prefix)
app.get('/games/kwim/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.get('/games/kwim/api/gif/search', async (req, res) => {
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

app.get('/games/kwim/api/gif/trending', async (req, res) => {
  const { limit = 20, fresh = false } = req.query;
  try {
    const gifs = await gifService.getTrending(parseInt(limit), fresh === 'true');
    res.json(gifs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/games/kwim/api/gif/random', async (req, res) => {
  const { limit = 20 } = req.query;
  try {
    const gifs = await gifService.getRandom(parseInt(limit));
    res.json(gifs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/games/kwim/api/gif/category/:categoryId', async (req, res) => {
  const { categoryId } = req.params;
  const { limit = 20 } = req.query;
  try {
    const gifs = await gifService.getByCategory(categoryId, parseInt(limit));
    res.json(gifs);
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

app.get('/games/kwim/api/gif/categories', (req, res) => {
  res.json(gifService.getCategories());
});

app.get('/games/kwim/api/gif/emoji-map', (req, res) => {
  res.json(gifService.getEmojiMap());
});

app.get('/games/kwim/api/gif/usage', (req, res) => {
  res.json(gifService.getUsageStats());
});
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Klipy GIF Browser</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0f0f0f;
      color: #e0e0e0;
      min-height: 100vh;
      padding: 20px;
    }
    .container { max-width: 1400px; margin: 0 auto; }
    h1 { text-align: center; margin-bottom: 20px; color: #00d4ff; }
    .controls {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
      flex-wrap: wrap;
      align-items: center;
    }
    input[type="text"] {
      flex: 1;
      min-width: 200px;
      padding: 12px 16px;
      border: 2px solid #333;
      border-radius: 8px;
      background: #1a1a1a;
      color: #fff;
      font-size: 16px;
    }
    input[type="text"]:focus { outline: none; border-color: #00d4ff; }
    button {
      padding: 12px 20px;
      border: none;
      border-radius: 8px;
      background: #00d4ff;
      color: #000;
      font-size: 14px;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }
    button:hover { background: #00a8cc; transform: translateY(-1px); }
    button:disabled { background: #555; cursor: not-allowed; transform: none; }
    button.secondary { background: #333; color: #fff; }
    button.secondary:hover { background: #444; }
    button.category { padding: 8px 14px; font-size: 13px; }
    button.category.active { background: #00d4ff; color: #000; }
    .categories { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 15px; }
    .status {
      display: flex;
      justify-content: space-between;
      align-items: center;
      margin-bottom: 15px;
      padding: 10px;
      background: #1a1a1a;
      border-radius: 8px;
      font-size: 14px;
    }
    .rate-limit { color: #ffa500; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 12px;
    }
    .gif-item {
      position: relative;
      border-radius: 8px;
      overflow: hidden;
      background: #1a1a1a;
      aspect-ratio: 1;
      cursor: pointer;
      transition: transform 0.2s;
    }
    .gif-item:hover { transform: scale(1.02); }
    .gif-item img {
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .gif-item .info {
      position: absolute;
      bottom: 0;
      left: 0;
      right: 0;
      padding: 8px;
      background: linear-gradient(transparent, rgba(0,0,0,0.8));
      font-size: 12px;
      opacity: 0;
      transition: opacity 0.2s;
    }
    .gif-item:hover .info { opacity: 1; }
    .loading { text-align: center; padding: 40px; color: #666; }
    .error {
      background: #331111;
      color: #ff6b6b;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 15px;
    }
    .modal {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      background: rgba(0,0,0,0.9);
      z-index: 1000;
      align-items: center;
      justify-content: center;
      padding: 20px;
    }
    .modal.active { display: flex; }
    .modal-content {
      max-width: 90vw;
      max-height: 90vh;
      position: relative;
    }
    .modal-content img {
      max-width: 100%;
      max-height: 80vh;
      border-radius: 8px;
    }
    .modal-close {
      position: absolute;
      top: -40px;
      right: 0;
      background: none;
      border: none;
      color: #fff;
      font-size: 30px;
      cursor: pointer;
    }
    .modal-info {
      margin-top: 15px;
      text-align: center;
    }
    .modal-info a { color: #00d4ff; word-break: break-all; }
  </style>
</head>
<body>
  <div class="container">
    <h1>🎬 Klipy GIF Browser</h1>

    <div class="controls">
      <input type="text" id="searchInput" placeholder="Search Klipy GIFs..." />
      <button id="searchBtn">Search</button>
      <button id="trendingBtn" class="secondary">🔥 Trending</button>
      <button id="randomBtn" class="secondary">🎲 Random</button>
    </div>

    <div class="categories" id="categories"></div>

    <div class="status">
      <span id="resultCount">Ready</span>
      <span class="rate-limit" id="rateLimit">API calls: 0</span>
    </div>

    <div id="error" class="error" style="display:none;"></div>
    <div id="loading" class="loading" style="display:none;">Loading...</div>
    <div id="grid" class="grid"></div>
  </div>

  <div class="modal" id="modal">
    <div class="modal-content">
      <button class="modal-close" id="modalClose">&times;</button>
      <img id="modalImg" src="" alt="GIF" />
      <div class="modal-info">
        <p id="modalTitle"></p>
        <p><a id="modalUrl" href="" target="_blank"></a></p>
      </div>
    </div>
  </div>

  <script>
    const API_BASE = window.location.origin;
    let apiCallCount = 0;
    let lastCallTime = 0;
    const MIN_CALL_INTERVAL = 300; // 300ms between calls (max ~3/sec)
    const MAX_CALLS_PER_MINUTE = 60;
    let callsThisMinute = 0;
    let minuteStartTime = Date.now();

    // Rate limiting
    async function rateLimitedFetch(url) {
      const now = Date.now();

      // Reset minute counter
      if (now - minuteStartTime > 60000) {
        callsThisMinute = 0;
        minuteStartTime = now;
      }

      // Check minute limit
      if (callsThisMinute >= MAX_CALLS_PER_MINUTE) {
        throw new Error('Rate limit reached. Please wait a moment.');
      }

      // Enforce minimum interval
      const timeSinceLastCall = now - lastCallTime;
      if (timeSinceLastCall < MIN_CALL_INTERVAL) {
        await new Promise(r => setTimeout(r, MIN_CALL_INTERVAL - timeSinceLastCall));
      }

      lastCallTime = Date.now();
      callsThisMinute++;
      apiCallCount++;
      updateRateLimitDisplay();

      const res = await fetch(url);
      if (!res.ok) throw new Error('API error: ' + res.status);
      return res.json();
    }

    function updateRateLimitDisplay() {
      document.getElementById('rateLimit').textContent = 'API calls: ' + apiCallCount + ' (' + callsThisMinute + '/min)';
    }

    // Fetch functions
    async function searchGifs(query) {
      showLoading();
      hideError();
      try {
        const data = await rateLimitedFetch(API_BASE + '/api/gif/search?q=' + encodeURIComponent(query) + '&limit=30');
        displayGifs(data, 'Search: ' + query);
      } catch (e) {
        showError(e.message);
      } finally {
        hideLoading();
      }
    }

    async function getTrending() {
      showLoading();
      hideError();
      try {
        const data = await rateLimitedFetch(API_BASE + '/api/gif/trending?limit=30');
        displayGifs(data, 'Trending');
      } catch (e) {
        showError(e.message);
      } finally {
        hideLoading();
      }
    }

    async function getRandom() {
      showLoading();
      hideError();
      try {
        const data = await rateLimitedFetch(API_BASE + '/api/gif/random?limit=30');
        displayGifs(data, 'Random');
      } catch (e) {
        showError(e.message);
      } finally {
        hideLoading();
      }
    }

    async function getByCategory(category) {
      showLoading();
      hideError();
      try {
        const data = await rateLimitedFetch(API_BASE + '/api/gif/category/' + category + '?limit=30');
        displayGifs(data, 'Category: ' + category);
      } catch (e) {
        showError(e.message);
      } finally {
        hideLoading();
      }
    }

    async function loadCategories() {
      try {
        const data = await rateLimitedFetch(API_BASE + '/api/gif/categories');
        const container = document.getElementById('categories');
        container.innerHTML = data.map(cat =>
          '<button class="category secondary" data-id="' + cat.id + '">' + cat.emoji + ' ' + cat.name + '</button>'
        ).join('');

        container.querySelectorAll('.category').forEach(btn => {
          btn.addEventListener('click', () => {
            document.querySelectorAll('.category').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            getByCategory(btn.dataset.id);
          });
        });
      } catch (e) {
        console.error('Failed to load categories:', e);
      }
    }

    // Display
    function displayGifs(gifs, source) {
      const grid = document.getElementById('grid');
      document.getElementById('resultCount').textContent = source + ' (' + gifs.length + ' GIFs)';

      if (!gifs.length) {
        grid.innerHTML = '<div class="loading">No GIFs found</div>';
        return;
      }

      grid.innerHTML = gifs.map(gif => {
        const previewUrl = gif.preview || gif.url;
        return '<div class="gif-item" data-url="' + gif.url + '" data-title="' + (gif.title || 'GIF') + '">' +
          '<img src="' + previewUrl + '" loading="lazy" alt="' + (gif.title || 'GIF') + '" />' +
          '<div class="info">' + (gif.title || 'GIF') + '</div>' +
        '</div>';
      }).join('');

      // Add click handlers
      grid.querySelectorAll('.gif-item').forEach(item => {
        item.addEventListener('click', () => openModal(item.dataset.url, item.dataset.title));
      });
    }

    function openModal(url, title) {
      document.getElementById('modalImg').src = url;
      document.getElementById('modalTitle').textContent = title;
      document.getElementById('modalUrl').href = url;
      document.getElementById('modalUrl').textContent = url;
      document.getElementById('modal').classList.add('active');
    }

    function closeModal() {
      document.getElementById('modal').classList.remove('active');
    }

    // UI helpers
    function showLoading() { document.getElementById('loading').style.display = 'block'; }
    function hideLoading() { document.getElementById('loading').style.display = 'none'; }
    function showError(msg) {
      document.getElementById('error').textContent = msg;
      document.getElementById('error').style.display = 'block';
    }
    function hideError() { document.getElementById('error').style.display = 'none'; }

    // Event listeners
    document.getElementById('searchBtn').addEventListener('click', () => {
      const q = document.getElementById('searchInput').value.trim();
      if (q) searchGifs(q);
    });

    document.getElementById('searchInput').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') {
        const q = document.getElementById('searchInput').value.trim();
        if (q) searchGifs(q);
      }
    });

    document.getElementById('trendingBtn').addEventListener('click', () => {
      document.querySelectorAll('.category').forEach(b => b.classList.remove('active'));
      getTrending();
    });

    document.getElementById('randomBtn').addEventListener('click', () => {
      document.querySelectorAll('.category').forEach(b => b.classList.remove('active'));
      getRandom();
    });

    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('modal').addEventListener('click', (e) => {
      if (e.target.id === 'modal') closeModal();
    });

    // Initialize
    loadCategories();
    getTrending();
  </script>
</body>
</html>
  `);
});

// Serve static files in production
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(join(__dirname, 'dist')));
  app.get('{*path}', (req, res) => {
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
