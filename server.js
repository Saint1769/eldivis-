
const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const multer = require('multer');
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');

const PORT = process.env.PORT || 3000;
const DATABASE_URL = postgresql://eldivis_user:X5DkEz7FAFzqpN06D3KmCUgeXaeqT8cI@dpg-d4ap3mogjchc73f1hpl0-a/eldivis;
const JWT_SECRET = process.env.JWT_SECRET || 'dev_jwt_secret_change_me';

if (!DATABASE_URL) {
  console.error('DATABASE_URL is not set. Exiting.');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const UPLOADS = path.join(__dirname, 'uploads');
if (!fs.existsSync(UPLOADS)) fs.mkdirSync(UPLOADS, { recursive: true });
const upload = multer({ dest: UPLOADS, limits: { fileSize: 50 * 1024 * 1024 } });

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS));
app.use('/assets', express.static(path.join(__dirname, 'public', 'assets')));
app.use(express.static(path.join(__dirname, 'public')));

async function initDB() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      nickname TEXT,
      avatar TEXT,
      coins INTEGER DEFAULT 50,
      vip BOOLEAN DEFAULT FALSE,
      last_spin TIMESTAMP,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS messages (
      id UUID PRIMARY KEY,
      from_user UUID REFERENCES users(id) ON DELETE CASCADE,
      to_user UUID REFERENCES users(id) ON DELETE CASCADE,
      text TEXT,
      attachment TEXT,
      type TEXT,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS nfts (
      id UUID PRIMARY KEY,
      title TEXT,
      image TEXT
    );
    CREATE TABLE IF NOT EXISTS user_nfts (
      id UUID PRIMARY KEY,
      nft_id UUID REFERENCES nfts(id) ON DELETE CASCADE,
      owner_user UUID REFERENCES users(id) ON DELETE CASCADE,
      gifted_by UUID,
      created_at TIMESTAMP DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS blocks (
      id UUID PRIMARY KEY,
      blocker UUID REFERENCES users(id) ON DELETE CASCADE,
      blocked UUID REFERENCES users(id) ON DELETE CASCADE,
      created_at TIMESTAMP DEFAULT NOW()
    );
  `);
  console.log('DB init complete');
}

initDB().catch(err=>{ console.error('DB init error', err); process.exit(1); });

function authMiddleware(req, res, next) {
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({ error: 'no_token' });
  const token = h.split(' ')[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid_token' });
  }
}

app.post('/api/register', async (req, res) => {
  try {
    const { username, password, nickname } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username_password_required' });
    const hashed = await bcrypt.hash(password, 10);
    const id = uuidv4();
    await pool.query('INSERT INTO users (id, username, password_hash, nickname) VALUES ($1,$2,$3,$4)', [id, username, hashed, nickname || username]);
    const token = jwt.sign({ userId: id, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token });
  } catch (err) {
    if (err.code === '23505') return res.status(409).json({ error: 'username_taken' });
    console.error('register err', err);
    res.status(500).json({ error: 'server' });
  }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({ error: 'username_password_required' });
    const { rows } = await pool.query('SELECT id, password_hash FROM users WHERE username = $1', [username]);
    const user = rows[0];
    if (!user) return res.status(401).json({ error: 'invalid' });
    const ok = await bcrypt.compare(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'invalid' });
    const token = jwt.sign({ userId: user.id, username }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok: true, token });
  } catch (err) {
    console.error('login err', err); res.status(500).json({ error: 'server' });
  }
});

app.get('/api/me', authMiddleware, async (req, res) => {
  const userId = req.user.userId;
  const { rows } = await pool.query('SELECT id, username, nickname, avatar, coins, vip, created_at FROM users WHERE id = $1', [userId]);
  res.json({ user: rows[0] });
});

app.post('/api/me', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    const userId = req.user.userId;
    const { nickname } = req.body || {};
    let avatarPath = null;
    if (req.file) avatarPath = '/uploads/' + req.file.filename;
    if (nickname) await pool.query('UPDATE users SET nickname = $1 WHERE id = $2', [nickname, userId]);
    if (avatarPath) await pool.query('UPDATE users SET avatar = $1 WHERE id = $2', [avatarPath, userId]);
    const { rows } = await pool.query('SELECT id, username, nickname, avatar, coins, vip FROM users WHERE id=$1', [userId]);
    res.json({ ok: true, user: rows[0] });
  } catch (err) { console.error('edit profile err', err); res.status(500).json({ error: 'server' }); }
});

app.get('/api/users', authMiddleware, async (req, res) => {
  const { rows } = await pool.query('SELECT id, username, nickname, avatar, coins, vip FROM users ORDER BY username LIMIT 200');
  res.json(rows);
});

app.get('/api/messages/:peerId', authMiddleware, async (req, res) => {
  const me = req.user.userId;
  const peer = req.params.peerId;
  const { rows } = await pool.query(
    'SELECT * FROM messages WHERE (from_user=$1 AND to_user=$2) OR (from_user=$2 AND to_user=$1) ORDER BY created_at ASC',
    [me, peer]
  );
  res.json(rows);
});

app.post('/api/message', authMiddleware, upload.single('file'), async (req, res) => {
  try {
    const from = req.user.userId;
    const { toUserId, text } = req.body || {};
    if (!toUserId) return res.status(400).json({ error: 'missing_to' });
    let attachment = null; let type = null;
    if (req.file) { attachment = '/uploads/' + req.file.filename; const ext = path.extname(req.file.originalname).toLowerCase(); if (['.png','.jpg','.jpeg','.gif','webp'].includes(ext)) type = 'image'; else if (['.mp4','.mov','.webm'].includes(ext)) type = 'video'; else type = 'file'; }
    const id = uuidv4();
    await pool.query('INSERT INTO messages (id, from_user, to_user, text, attachment, type) VALUES ($1,$2,$3,$4,$5,$6)', [id, from, toUserId, text||'', attachment, type]);
    const msg = { id, from_user: from, to_user: toUserId, text: text||'', attachment, type, created_at: new Date() };
    io.to('u:' + from).emit('new_message', { msg });
    io.to('u:' + toUserId).emit('new_message', { msg });
    res.json({ ok: true, msg });
  } catch (err) { console.error('send msg err', err); res.status(500).json({ error: 'server' }); }
});

app.delete('/api/message/:id', authMiddleware, async (req, res) => {
  try {
    const me = req.user.userId; const id = req.params.id;
    const { rows } = await pool.query('SELECT from_user FROM messages WHERE id = $1', [id]);
    if (!rows[0]) return res.status(404).json({ error: 'not_found' });
    if (rows[0].from_user !== me) return res.status(403).json({ error: 'not_owner' });
    await pool.query('DELETE FROM messages WHERE id = $1', [id]);
    io.emit('message_deleted', { id });
    res.json({ ok: true });
  } catch (err) { console.error(err); res.status(500).json({ error: 'server' }); }
});

app.post('/api/spin', authMiddleware, async (req, res) => {
  try {
    const me = req.user.userId;
    const { rows } = await pool.query('SELECT last_spin FROM users WHERE id = $1', [me]);
    const lastSpin = rows[0].last_spin;
    const now = new Date();
    if (lastSpin && (now - new Date(lastSpin) < 24*60*60*1000)) return res.status(400).json({ error: 'already_spun' });
    const prizes = [0,5,10,20,50,100,200]; const won = prizes[Math.floor(Math.random()*prizes.length)];
    await pool.query('UPDATE users SET coins = coins + $1, last_spin = $2 WHERE id = $3', [won, now, me]);
    io.to('u:' + me).emit('coins_updated', { userId: me, delta: won });
    res.json({ ok: true, won });
  } catch (err) { console.error(err); res.status(500).json({ error: 'server' }); }
});

app.post('/api/gift-nft', authMiddleware, async (req, res) => {
  try { const me = req.user.userId; const { toUserId, nftId } = req.body || {}; const id = uuidv4(); await pool.query('INSERT INTO user_nfts (id, nft_id, owner_user, gifted_by) VALUES ($1,$2,$3,$4)', [id, nftId, toUserId, me]); io.emit('nft_gifted', { id, nftId, ownerUserId: toUserId, giftedBy: me }); res.json({ ok: true }); } catch (err) { console.error(err); res.status(500).json({ error: 'server' }); }
});

app.post('/api/block', authMiddleware, async (req, res) => {
  try { const me = req.user.userId; const { target } = req.body || {}; const id = uuidv4(); await pool.query('INSERT INTO blocks (id, blocker, blocked) VALUES ($1,$2,$3)', [id, me, target]); res.json({ ok: true }); } catch (err) { console.error(err); res.status(500).json({ error: 'server' }); }
});

app.delete('/api/account', authMiddleware, async (req, res) => {
  try { const me = req.user.userId; await pool.query('DELETE FROM users WHERE id = $1', [me]); io.emit('user_deleted', { userId: me }); res.json({ ok: true }); } catch (err) { console.error(err); res.status(500).json({ error: 'server' }); }
});

app.get('/api/nfts', authMiddleware, async (req, res) => { const { rows } = await pool.query('SELECT * FROM nfts ORDER BY title LIMIT 200'); res.json(rows); });

app.get('*', (req, res) => { res.sendFile(path.join(__dirname, 'public', 'index.html')); });

const server = http.createServer(app);
const io = require('socket.io')(server, { cors: { origin: '*' } });

io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token;
  if (!token) return next();
  try {
    const data = require('jsonwebtoken').verify(token, process.env.JWT_SECRET || 'dev_jwt_secret_change_me');
    socket.user = data;
    socket.join('u:' + data.userId);
  } catch (e) { console.log('socket auth failed'); }
  next();
});

io.on('connection', (socket) => {
  console.log('socket connected', socket.id, socket.user ? socket.user.userId : '(anon)');
  socket.on('private_message', async (payload, cb) => {
    try {
      const { toUserId, text } = payload || {};
      const from = socket.user && socket.user.userId;
      if (!from) return cb && cb({ ok: false, error: 'not_auth' });
      const id = uuidv4();
      await pool.query('INSERT INTO messages (id, from_user, to_user, text) VALUES ($1,$2,$3,$4)', [id, from, toUserId, text||'']);
      const msg = { id, from_user: from, to_user: toUserId, text, created_at: new Date() };
      io.to('u:' + from).emit('new_message', { msg });
      io.to('u:' + toUserId).emit('new_message', { msg });
      if (cb) cb({ ok: true, msg });
    } catch (err) { console.error('private_message err', err); if (cb) cb({ ok: false, error: 'server' }); }
  });
});

server.listen(PORT, () => { console.log('Eldivis listening on', PORT); });
