
/**
 * Full chat server with:
 * - user registration/login (username + password, bcrypt + JWT)
 * - private chats between users
 * - delete messages and delete account
 * - coins (simulated purchase) and gifting
 * - NFT-like gifts (mocked items you can gift)
 * - Socket.IO real-time messaging
 * - SQLite persistent storage (data.sqlite)
 */

const express = require('express');
const http = require('http');
const path = require('path');
const cors = require('cors');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const { Server } = require('socket.io');
const sqlite3 = require('sqlite3').verbose();
const fs = require('fs');
const multer = require('multer');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data.sqlite');

// ensure uploads folder for nft images
const UPLOADS = path.join(__dirname, 'uploads');
try { fs.mkdirSync(UPLOADS, { recursive: true }); } catch(e){}

const db = new sqlite3.Database(DB_FILE, (err)=>{
  if (err) { console.error('DB open error', err); process.exit(1); }
});

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT UNIQUE,
    username TEXT UNIQUE,
    passwordHash TEXT,
    coins INTEGER DEFAULT 0,
    createdAt INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    fromUser TEXT,
    toUser TEXT,
    text TEXT,
    time INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS nfts (
    id TEXT PRIMARY KEY,
    title TEXT,
    image TEXT
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS user_nfts (
    id TEXT PRIMARY KEY,
    nftId TEXT,
    ownerUserId TEXT,
    giftedBy TEXT,
    time INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS transactions (
    id TEXT PRIMARY KEY,
    userId TEXT,
    type TEXT,
    amount INTEGER,
    meta TEXT,
    time INTEGER
  )`);
});

function run(sql, params=[]) { return new Promise((res,rej)=> db.run(sql,params,function(err){ if (err) rej(err); else res(this); })); }
function get(sql, params=[]) { return new Promise((res,rej)=> db.get(sql,params,(err,row)=> err?rej(err):res(row))); }
function all(sql, params=[]) { return new Promise((res,rej)=> db.all(sql,params,(err,rows)=> err?rej(err):res(rows))); }

const app = express();
app.use(cors());
app.use(express.json());
app.use('/uploads', express.static(UPLOADS));
app.use(express.static(path.join(__dirname, 'public')));

// multer for file uploads (admin; optional)
const upload = multer({ dest: UPLOADS });

// Helper
function genId(prefix='id') { return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }
function authMiddleware(req,res,next){
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({error:'no_token'});
  const token = h.split(' ')[1];
  try {
    const data = jwt.verify(token, JWT_SECRET);
    req.user = data;
    next();
  } catch(e){
    return res.status(401).json({error:'invalid_token'});
  }
}

// Public API: register/login
app.post('/api/register', async (req,res)=>{
  try{
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({error:'username_password_required'});
    const clean = String(username).trim();
    const exists = await get('SELECT * FROM users WHERE username = ?', [clean]);
    if (exists) return res.status(409).json({error:'username_taken'});
    const userId = genId('u');
    const hash = await bcrypt.hash(password, 10);
    await run('INSERT INTO users (userId, username, passwordHash, coins, createdAt) VALUES (?,?,?,?,?)', [userId, clean, hash, 100, Date.now()]);
    const token = jwt.sign({ userId, username: clean }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ ok:true, token });
  }catch(err){ console.error(err); res.status(500).json({error:'server'}); }
});

app.post('/api/login', async (req,res)=>{
  try{
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({error:'username_password_required'});
    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({error:'invalid'});
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({error:'invalid'});
    const token = jwt.sign({ userId: user.userId, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ ok:true, token });
  }catch(err){ console.error(err); res.status(500).json({error:'server'}); }
});

// get users (simple list)
app.get('/api/users', authMiddleware, async (req,res)=>{
  try{
    const rows = await all('SELECT userId, username, coins FROM users ORDER BY username ASC');
    res.json(rows);
  }catch(err){ res.status(500).json({error:'db'}); }
});

// get private messages between two users
app.get('/api/messages/:peerId', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    const peer = req.params.peerId;
    const rows = await all('SELECT * FROM messages WHERE (fromUser=? AND toUser=?) OR (fromUser=? AND toUser=?) ORDER BY time ASC', [me,peer,peer,me]);
    res.json(rows);
  }catch(err){ res.status(500).json({error:'db'}); }
});

// delete a message (only owner or sender)
app.delete('/api/message/:id', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    const id = req.params.id;
    const msg = await get('SELECT * FROM messages WHERE id = ?', [id]);
    if (!msg) return res.status(404).json({error:'not_found'});
    if (msg.fromUser !== me) return res.status(403).json({error:'not_owner'});
    await run('DELETE FROM messages WHERE id = ?', [id]);
    // notify via io
    io.emit('message_deleted', { id });
    res.json({ ok:true });
  }catch(err){ res.status(500).json({error:'db'}); }
});

// delete account (and owned nft entries)
app.delete('/api/account', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    await run('DELETE FROM messages WHERE fromUser = ?', [me]);
    await run('DELETE FROM user_nfts WHERE ownerUserId = ?', [me]);
    await run('DELETE FROM users WHERE userId = ?', [me]);
    io.emit('user_deleted', { userId: me });
    res.json({ ok:true });
  }catch(err){ res.status(500).json({error:'db'}); }
});

// simulated purchase coins (no payment integration) - increases user's coins
app.post('/api/purchase', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    const { amount } = req.body || {};
    const n = parseInt(amount) || 0;
    if (n <= 0) return res.status(400).json({error:'invalid_amount'});
    await run('UPDATE users SET coins = coins + ? WHERE userId = ?', [n, me]);
    const txId = genId('tx');
    await run('INSERT INTO transactions (id,userId,type,amount,meta,time) VALUES (?,?,?,?,?)', [txId, me, 'purchase', n, 'simulated', Date.now()]);
    io.emit('coins_updated', { userId: me, delta: n });
    res.json({ ok:true });
  }catch(err){ res.status(500).json({error:'db'}); }
});

// gift coins to another user
app.post('/api/gift-coins', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    const { toUserId, amount } = req.body || {};
    const n = parseInt(amount) || 0;
    if (n <= 0) return res.status(400).json({error:'invalid_amount'});
    const from = await get('SELECT coins FROM users WHERE userId = ?', [me]);
    if (!from || from.coins < n) return res.status(400).json({error:'not_enough'});
    await run('UPDATE users SET coins = coins - ? WHERE userId = ?', [n, me]);
    await run('UPDATE users SET coins = coins + ? WHERE userId = ?', [n, toUserId]);
    const tx1 = genId('tx'); const tx2 = genId('tx');
    await run('INSERT INTO transactions (id,userId,type,amount,meta,time) VALUES (?,?,?,?,?)', [tx1, me, 'gift_sent', n, toUserId, Date.now()]);
    await run('INSERT INTO transactions (id,userId,type,amount,meta,time) VALUES (?,?,?,?,?)', [tx2, toUserId, 'gift_received', n, me, Date.now()]);
    io.emit('coins_updated', { userId: me }); io.emit('coins_updated', { userId: toUserId });
    res.json({ ok:true });
  }catch(err){ res.status(500).json({error:'db'}); }
});

// list available NFT gifts
app.get('/api/nfts', authMiddleware, async (req,res)=>{
  try{
    const rows = await all('SELECT * FROM nfts');
    res.json(rows);
  }catch(err){ res.status(500).json({error:'db'}); }
});

// gift an NFT to user (creates user_nfts entry)
app.post('/api/gift-nft', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    const { toUserId, nftId } = req.body || {};
    const nft = await get('SELECT * FROM nfts WHERE id = ?', [nftId]);
    if (!nft) return res.status(404).json({error:'nft_not_found'});
    const entryId = genId('unft');
    await run('INSERT INTO user_nfts (id,nftId,ownerUserId,giftedBy,time) VALUES (?,?,?,?,?)', [entryId, nftId, toUserId, me, Date.now()]);
    io.emit('nft_gifted', { id: entryId, nftId, ownerUserId: toUserId, giftedBy: me });
    res.json({ ok:true });
  }catch(err){ res.status(500).json({error:'db'}); }
});

// upload NFT image (admin task - optional)
app.post('/api/upload-nft', upload.single('file'), async (req,res)=>{
  try{
    if (!req.file) return res.status(400).json({error:'no_file'});
    const id = genId('nft');
    const filename = path.basename(req.file.path);
    await run('INSERT INTO nfts (id,title,image) VALUES (?,?,?)', [id, req.body.title || 'NFT', '/uploads/' + filename]);
    res.json({ ok:true, id, image: '/uploads/' + filename });
  }catch(err){ console.error(err); res.status(500).json({error:'server'}); }
});

// Serve SPA
app.get('*', (req,res)=>{
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HTTP + Socket.IO server
const server = http.createServer(app);
const io = new Server(server, { cors: { origin:'*' } });

io.use((socket, next)=>{
  // allow token in handshake auth or query
  const token = socket.handshake.auth && socket.handshake.auth.token || socket.handshake.query && socket.handshake.query.token;
  if (!token) return next();
  try{
    const data = jwt.verify(token, JWT_SECRET);
    socket.user = data;
  }catch(e){ /* ignore */ }
  next();
});

io.on('connection', (socket)=>{
  console.log('socket connected', socket.id);
  // join personal room if authenticated
  if (socket.user && socket.user.userId) socket.join('u:' + socket.user.userId);

  socket.on('private_message', async (payload, cb)=>{
    try{
      const { token, toUserId, text } = payload || {};
      let sender = socket.user;
      if (!sender && token) {
        try { sender = jwt.verify(token, JWT_SECRET); } catch(e){}
      }
      if (!sender) return cb && cb({ ok:false, error:'not_auth' });
      const me = sender.userId;
      const id = genId('m');
      const msg = { id, fromUser: me, toUser: toUserId, text: text.slice(0,2000), time: Date.now() };
      await run('INSERT INTO messages (id,fromUser,toUser,text,time) VALUES (?,?,?,?,?)', [msg.id,msg.fromUser,msg.toUser,msg.text,msg.time]);
      // emit to both participants' rooms
      io.to('u:' + me).emit('new_message', { msg });
      io.to('u:' + toUserId).emit('new_message', { msg });
      if (cb) cb({ ok:true, msg });
    }catch(err){ console.error('pm err', err); if (cb) cb({ ok:false, error:'server' }); }
  });

  socket.on('disconnect', ()=>{
    // nothing
  });
});

server.listen(PORT, ()=> console.log('Server listening on', PORT));
