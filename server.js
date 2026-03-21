import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { fileURLToPath } from 'url';
import { dirname, join, basename } from 'path';
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

// Serve cached GIF files from HDD
app.get('/api/gif/cache-health', (req, res) => {
  res.json(gifService.getCacheHealth());
});

// Get all cached GIFs with optional search
app.get('/api/gif/cache', async (req, res) => {
  const { q, limit = 100, offset = 0 } = req.query;
  try {
    const { getAllCached, searchCache } = await import('./scripts/cache-utils.js');

    let gifs;
    if (q) {
      gifs = searchCache(q, parseInt(limit));
    } else {
      gifs = getAllCached();
    }

    // Apply pagination
    const start = parseInt(offset);
    const end = start + parseInt(limit);
    const paginated = gifs.slice(start, end);

    // Convert to response format with local URLs
    const results = paginated.map(gif => ({
      id: gif.id,
      source: gif.source,
      title: gif.title,
      url: `/cached-gifs/${basename(gif.localPath)}`,
      preview: `/cached-gifs/${basename(gif.localPath)}`,
      tags: gif.tags,
      width: gif.width,
      height: gif.height,
      fileSize: gif.fileSize,
      searchQuery: gif.searchQuery,
      fetchedAt: gif.fetchedAt
    }));

    res.json({
      total: gifs.length,
      offset: start,
      limit: parseInt(limit),
      results
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Cache browser page
app.get('/cache-browser', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>GIF Cache Browser</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #1a1a2e;
      color: #eee;
      min-height: 100vh;
      padding: 20px;
    }
    .header {
      max-width: 1400px;
      margin: 0 auto 20px;
    }
    h1 { color: #ff6b6b; margin-bottom: 10px; }
    .stats {
      background: #16213e;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 20px;
      display: flex;
      gap: 30px;
      flex-wrap: wrap;
    }
    .stat { text-align: center; }
    .stat-value { font-size: 24px; font-weight: bold; color: #4ecdc4; }
    .stat-label { font-size: 12px; color: #888; }
    .search-box {
      display: flex;
      gap: 10px;
      margin-bottom: 20px;
    }
    input {
      flex: 1;
      padding: 12px 16px;
      border: none;
      border-radius: 8px;
      background: #16213e;
      color: #eee;
      font-size: 16px;
    }
    input:focus { outline: 2px solid #4ecdc4; }
    button {
      padding: 12px 24px;
      border: none;
      border-radius: 8px;
      background: #4ecdc4;
      color: #1a1a2e;
      font-size: 16px;
      font-weight: bold;
      cursor: pointer;
    }
    button:hover { background: #3dbdb5; }
    .grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 15px;
      max-width: 1400px;
      margin: 0 auto;
    }
    .gif-card {
      background: #16213e;
      border-radius: 8px;
      overflow: hidden;
      transition: transform 0.2s;
    }
    .gif-card:hover { transform: scale(1.05); }
    .gif-card img {
      width: 100%;
      height: 150px;
      object-fit: cover;
      cursor: pointer;
    }
    .gif-info {
      padding: 10px;
      font-size: 12px;
    }
    .gif-title {
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      margin-bottom: 5px;
      color: #fff;
    }
    .gif-meta {
      color: #888;
      font-size: 11px;
    }
    .tags {
      display: flex;
      flex-wrap: wrap;
      gap: 4px;
      margin-top: 8px;
    }
    .tag {
      background: #0f3460;
      padding: 2px 8px;
      border-radius: 12px;
      font-size: 10px;
      color: #4ecdc4;
    }
    .loading { text-align: center; padding: 40px; color: #888; }
    .error { text-align: center; padding: 40px; color: #ff6b6b; }
    .pagination {
      display: flex;
      justify-content: center;
      gap: 10px;
      margin-top: 20px;
    }
    .pagination button {
      background: #16213e;
      color: #eee;
    }
    .pagination button:disabled {
      opacity: 0.5;
      cursor: not-allowed;
    }
    #lightbox {
      display: none;
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      background: rgba(0,0,0,0.9);
      z-index: 1000;
      justify-content: center;
      align-items: center;
      cursor: pointer;
    }
    #lightbox img { max-width: 90%; max-height: 90%; }
    #lightbox.active { display: flex; }
  </style>
</head>
<body>
  <div class="header">
    <h1>GIF Cache Browser</h1>
    <div class="stats" id="stats">Loading...</div>
    <div class="search-box">
      <input type="text" id="search" placeholder="Search cached GIFs by tag or title...">
      <button onclick="search()">Search</button>
      <button onclick="loadCache()" style="background: #ff6b6b;">Show All</button>
    </div>
  </div>
  <div class="grid" id="grid"></div>
  <div class="pagination" id="pagination"></div>
  <div id="lightbox" onclick="this.classList.remove('active')">
    <img id="lightbox-img" src="">
  </div>

  <script>
    let currentOffset = 0;
    const limit = 50;
    let currentQuery = '';

    async function loadStats() {
      const res = await fetch('/api/gif/cache-health');
      const data = await res.json();
      document.getElementById('stats').innerHTML = \`
        <div class="stat"><div class="stat-value">\${data.totalGifs}</div><div class="stat-label">Total GIFs</div></div>
        <div class="stat"><div class="stat-value">\${data.storageUsedMB}</div><div class="stat-label">MB Used</div></div>
        <div class="stat"><div class="stat-value">\${data.maxStorageMB}</div><div class="stat-label">MB Limit</div></div>
        <div class="stat"><div class="stat-value">\${data.percentUsed}%</div><div class="stat-label">Storage Used</div></div>
      \`;
    }

    async function loadCache(offset = 0) {
      currentOffset = offset;
      currentQuery = '';
      document.getElementById('search').value = '';
      await fetchCache(offset);
    }

    async function search() {
      const q = document.getElementById('search').value.trim();
      currentQuery = q;
      currentOffset = 0;
      await fetchCache(0, q);
    }

    async function fetchCache(offset = 0, query = '') {
      const grid = document.getElementById('grid');
      grid.innerHTML = '<div class="loading">Loading...</div>';

      try {
        let url = \`/api/gif/cache?limit=\${limit}&offset=\${offset}\`;
        if (query) url += \`&q=\${encodeURIComponent(query)}\`;

        const res = await fetch(url);
        const data = await res.json();

        if (data.results.length === 0) {
          grid.innerHTML = '<div class="loading">No GIFs found</div>';
        } else {
          grid.innerHTML = data.results.map(gif => \`
            <div class="gif-card">
              <img src="\${gif.url}" alt="\${gif.title}" onclick="openLightbox('\${gif.url}')">
              <div class="gif-info">
                <div class="gif-title" title="\${gif.title}">\${gif.title || 'Untitled'}</div>
                <div class="gif-meta">\${gif.source} • \${Math.round(gif.fileSize/1024)}KB</div>
                <div class="tags">\${(gif.tags || []).slice(0, 5).map(t => \`<span class="tag">\${t}</span>\`).join('')}</div>
              </div>
            </div>
          \`).join('');
        }

        // Pagination
        const pagination = document.getElementById('pagination');
        const prevDisabled = offset === 0 ? 'disabled' : '';
        const nextDisabled = data.results.length < limit ? 'disabled' : '';

        pagination.innerHTML = \`
          <button \${prevDisabled} onclick="fetchCache(\${offset - limit}, '\${query}')">← Previous</button>
          <span style="padding: 12px;">Showing \${offset + 1}-\${offset + data.results.length} of \${data.total}</span>
          <button \${nextDisabled} onclick="fetchCache(\${offset + limit}, '\${query}')">Next →</button>
        \`;
      } catch (error) {
        grid.innerHTML = \`<div class="error">Error: \${error.message}</div>\`;
      }
    }

    function openLightbox(url) {
      document.getElementById('lightbox-img').src = url;
      document.getElementById('lightbox').classList.add('active');
    }

    // Enter key to search
    document.getElementById('search').addEventListener('keypress', (e) => {
      if (e.key === 'Enter') search();
    });

    // Load on page load
    loadStats();
    loadCache();
  </script>
</body>
</html>
  `);
});

// Serve cached GIF files
app.use('/cached-gifs', express.static('/mnt/photos/gif-cache/gifs', {
  maxAge: '1y', // Cache for 1 year since these are immutable
  immutable: true
}));

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
