
/**
 * server.js
 * Full Express + Socket.IO server with SQLite storage.
 * Serves static frontend from /public and provides real-time chat.
 */

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data.sqlite');

// Ensure DB file directory exists
try { fs.mkdirSync(path.dirname(DB_FILE), { recursive: true }); } catch(e){}

// Open (or create) SQLite DB
const db = new sqlite3.Database(DB_FILE, (err) => {
  if (err) {
    console.error('Failed to open database:', err);
    process.exit(1);
  }
});

// Create tables if they don't exist
db.serialize(() => {
  db.run(`CREATE TABLE IF NOT EXISTS users (
    userId TEXT PRIMARY KEY,
    username TEXT UNIQUE,
    nickname TEXT,
    createdAt INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    userId TEXT,
    username TEXT,
    nickname TEXT,
    text TEXT,
    time INTEGER
  )`);
});

// Promise wrappers for convenience
function run(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function(err) {
      if (err) reject(err); else resolve(this);
    });
  });
}
function get(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err); else resolve(row);
    });
  });
}
function all(sql, params=[]) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err); else resolve(rows);
    });
  });
}

// Express app
const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

// API: get messages (for initial load)
app.get('/api/messages', async (req, res) => {
  try {
    const rows = await all('SELECT * FROM messages ORDER BY time ASC LIMIT 1000', []);
    res.json(rows || []);
  } catch (err) {
    console.error('API /api/messages error', err);
    res.status(500).json({ error: 'db' });
  }
});

// API: get users
app.get('/api/users', async (req, res) => {
  try {
    const rows = await all('SELECT userId, username, nickname FROM users', []);
    res.json(rows || []);
  } catch (err) {
    console.error('API /api/users error', err);
    res.status(500).json({ error: 'db' });
  }
});

// API: register via REST (optional)
app.post('/api/register', async (req, res) => {
  try {
    const { userId, username, nickname } = req.body || {};
    if (!userId || !username) return res.status(400).json({ ok:false, error: 'userId and username required' });
    const clean = String(username).trim();
    if (!clean) return res.status(400).json({ ok:false, error: 'empty name' });

    const owner = await get('SELECT userId FROM users WHERE username = ?', [clean]);
    if (owner && owner.userId !== userId) return res.status(409).json({ ok:false, error: 'username_taken' });

    const existing = await get('SELECT username FROM users WHERE userId = ?', [userId]);
    if (existing && existing.username && existing.username !== clean) return res.status(403).json({ ok:false, error: 'cannot_change_name' });

    await run(`INSERT OR REPLACE INTO users (userId, username, nickname, createdAt) VALUES (?, ?, ?, COALESCE((SELECT createdAt FROM users WHERE userId = ?), ?))`, [userId, clean, nickname || clean, userId, Date.now()]);
    res.json({ ok:true });
  } catch (err) {
    console.error('API /api/register err', err);
    res.status(500).json({ ok:false, error: 'server' });
  }
});

// Serve index.html for SPA routes
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HTTP + Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*', methods: ['GET','POST'] } });

// In-memory sockets mapping
const socketsByUser = new Map();

io.on('connection', (socket) => {
  console.log('Socket connected', socket.id);

  socket.on('register', async (payload, cb) => {
    try {
      const { userId, username, nickname } = payload || {};
      if (!userId || !username) {
        if (cb) cb({ ok:false, error: 'userId and username required' });
        return;
      }
      const clean = String(username).trim();
      const owner = await get('SELECT userId FROM users WHERE username = ?', [clean]);
      if (owner && owner.userId !== userId) {
        if (cb) cb({ ok:false, error: 'username_taken' });
        return;
      }
      const existing = await get('SELECT username FROM users WHERE userId = ?', [userId]);
      if (existing && existing.username && existing.username !== clean) {
        if (cb) cb({ ok:false, error: 'cannot_change_name' });
        return;
      }
      await run(`INSERT OR REPLACE INTO users (userId, username, nickname, createdAt) VALUES (?, ?, ?, COALESCE((SELECT createdAt FROM users WHERE userId = ?), ?))`, [userId, clean, nickname || clean, userId, Date.now()]);

      socket.userId = userId;
      if (!socketsByUser.has(userId)) socketsByUser.set(userId, new Set());
      socketsByUser.get(userId).add(socket.id);

      const users = await all('SELECT userId, username, nickname FROM users');
      io.emit('users', users);

      if (cb) cb({ ok:true, user: { userId, username: clean, nickname: nickname || clean } });
    } catch (err) {
      console.error('socket register err', err);
      if (cb) cb({ ok:false, error: 'server' });
    }
  });

  socket.on('send_message', async (payload, cb) => {
    try {
      const { userId, text } = payload || {};
      if (!userId || !text) {
        if (cb) cb({ ok:false, error: 'userId and text required' });
        return;
      }
      const user = await get('SELECT username, nickname FROM users WHERE userId = ?', [userId]);
      if (!user) {
        if (cb) cb({ ok:false, error: 'not_authorized' });
        return;
      }
      const msg = {
        id: (Date.now()).toString(36) + '-' + Math.random().toString(36).slice(2,8),
        userId,
        username: user.username,
        nickname: user.nickname || user.username,
        text: String(text).slice(0, 2000),
        time: Date.now()
      };
      await run('INSERT INTO messages (id, userId, username, nickname, text, time) VALUES (?, ?, ?, ?, ?, ?)', [msg.id, msg.userId, msg.username, msg.nickname, msg.text, msg.time]);

      const meta = {};
      if (msg.text.includes(':party:')) meta.confetti = true;
      if (msg.text.includes(':wave:')) meta.wave = true;

      io.emit('new_message', { msg, meta });

      // cleanup if too many messages
      const rows = await all('SELECT COUNT(*) as c FROM messages');
      if (rows && rows[0] && rows[0].c > 5000) {
        await run('DELETE FROM messages WHERE id IN (SELECT id FROM messages ORDER BY time ASC LIMIT ?)', [rows[0].c - 5000]);
      }

      if (cb) cb({ ok:true });
    } catch (err) {
      console.error('send_message err', err);
      if (cb) cb({ ok:false, error: 'server' });
    }
  });

  socket.on('typing', (payload) => {
    const { userId, typing } = payload || {};
    if (!userId) return;
    io.emit('typing', { userId, typing: !!typing });
  });

  socket.on('disconnect', async () => {
    try {
      if (socket.userId) {
        const set = socketsByUser.get(socket.userId);
        if (set) {
          set.delete(socket.id);
          if (set.size === 0) socketsByUser.delete(socket.userId);
        }
        const users = await all('SELECT userId, username, nickname FROM users');
        io.emit('users', users);
      }
    } catch (err) {
      console.error('disconnect err', err);
    }
  });
});

server.listen(PORT, () => {
  console.log('Server listening on port', PORT);
});
