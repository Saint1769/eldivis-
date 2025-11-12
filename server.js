
/**
 * Eldivis server
 * - Users with editable profile (except username)
 * - Private chats, messages with attachments (photos, files, video)
 * - Profile pages with avatar, diamonds (coins), gifts (NFTs)
 * - Daily wheel of fortune to win diamonds
 * - Block users
 * - Delete account (only from profile)
 * - Uses SQLite for persistence and multer for uploads
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
const sharp = require('sharp');

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me';
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data.sqlite');
const UPLOADS = path.join(__dirname, 'uploads');
try { fs.mkdirSync(UPLOADS, { recursive: true }); } catch(e){}

// Setup multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, UPLOADS),
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname);
    cb(null, Date.now().toString(36) + '-' + Math.random().toString(36).slice(2,8) + ext);
  }
});
const upload = multer({ storage, limits: { fileSize: 50 * 1024 * 1024 } });

const db = new sqlite3.Database(DB_FILE, (err)=>{
  if (err) { console.error('DB open error', err); process.exit(1); }
});

db.serialize(()=>{
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT UNIQUE,
    username TEXT UNIQUE,
    passwordHash TEXT,
    nickname TEXT,
    avatar TEXT,
    coins INTEGER DEFAULT 50,
    lastSpin INTEGER DEFAULT 0,
    createdAt INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    fromUser TEXT,
    toUser TEXT,
    text TEXT,
    attachment TEXT,
    type TEXT,
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
  db.run(`CREATE TABLE IF NOT EXISTS blocks (
    id TEXT PRIMARY KEY,
    blocker TEXT,
    blocked TEXT,
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
app.use('/assets', express.static(path.join(__dirname,'public','assets')));
app.use(express.static(path.join(__dirname, 'public')));

function genId(prefix='id'){ return prefix + '_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2,8); }
function authMiddleware(req,res,next){
  const h = req.headers.authorization;
  if (!h) return res.status(401).json({error:'no_token'});
  const token = h.split(' ')[1];
  try { const data = jwt.verify(token, JWT_SECRET); req.user = data; next(); } catch(e){ return res.status(401).json({error:'invalid_token'}); }
}

// Auth endpoints
app.post('/api/register', async (req,res)=>{
  try{
    const { username, password, nickname } = req.body || {};
    if (!username || !password) return res.status(400).json({error:'username_password_required'});
    const clean = String(username).trim();
    const exists = await get('SELECT * FROM users WHERE username = ?', [clean]);
    if (exists) return res.status(409).json({error:'username_taken'});
    const userId = genId('u');
    const hash = await bcrypt.hash(password, 10);
    await run('INSERT INTO users (userId,username,passwordHash,nickname,coins,createdAt) VALUES (?,?,?,?,?,?)', [userId, clean, hash, nickname||clean, 50, Date.now()]);
    const token = jwt.sign({ userId, username: clean }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ ok:true, token });
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
    res.json({ ok:true, token });
  }catch(err){ console.error(err); res.status(500).json({error:'server'}); }
});

// get public profile
app.get('/api/profile/:userId', async (req,res)=>{
  try{
    const uid = req.params.userId;
    const user = await get('SELECT userId,username,nickname,avatar,coins,createdAt FROM users WHERE userId = ?', [uid]);
    if (!user) return res.status(404).json({error:'not_found'});
    const gifts = await all('SELECT un.id, un.nftId, n.title, n.image, un.giftedBy, un.time FROM user_nfts un JOIN nfts n ON un.nftId = n.id WHERE un.ownerUserId = ?', [uid]);
    res.json({ user, gifts });
  }catch(err){ res.status(500).json({error:'server'}); }
});

// edit profile (must be authenticated)
app.post('/api/profile/edit', authMiddleware, upload.single('avatar'), async (req,res)=>{
  try{
    const me = req.user.userId;
    const { nickname } = req.body || {};
    let avatarPath = null;
    if (req.file){
      // create small avatar using sharp if available
      const inPath = req.file.path;
      const outName = 'av_' + req.file.filename;
      const outPath = path.join(UPLOADS, outName);
      try { await sharp(inPath).resize(256,256,{fit:'cover'}).toFile(outPath); avatarPath = '/uploads/' + outName; fs.unlinkSync(inPath); } catch(e){ avatarPath = '/uploads/' + req.file.filename; }
    }
    if (nickname !== undefined) await run('UPDATE users SET nickname = ? WHERE userId = ?', [nickname, me]);
    if (avatarPath) await run('UPDATE users SET avatar = ? WHERE userId = ?', [avatarPath, me]);
    const u = await get('SELECT userId,username,nickname,avatar,coins FROM users WHERE userId = ?', [me]);
    res.json({ ok:true, user: u });
  }catch(err){ console.error(err); res.status(500).json({error:'server'}); }
});

// spin wheel (daily) - returns diamonds won
app.post('/api/spin', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    const user = await get('SELECT lastSpin, coins FROM users WHERE userId = ?', [me]);
    const now = Date.now();
    const oneDay = 24*60*60*1000;
    if (user && (now - (user.lastSpin||0) < oneDay)) return res.status(400).json({error:'already_spun'});
    // random prizes
    const prizes = [0,5,10,20,50,100];
    const pick = prizes[Math.floor(Math.random()*prizes.length)];
    await run('UPDATE users SET coins = coins + ?, lastSpin = ? WHERE userId = ?', [pick, now, me]);
    io.to('u:'+me).emit('coins_updated', { userId: me });
    res.json({ ok:true, won: pick });
  }catch(err){ console.error(err); res.status(500).json({error:'server'}); }
});

// send private message with optional attachment
app.post('/api/message', authMiddleware, upload.single('file'), async (req,res)=>{
  try{
    const me = req.user.userId;
    const { toUserId, text } = req.body || {};
    if (!toUserId) return res.status(400).json({error:'missing_to'});
    let attachment = null;
    let type = null;
    if (req.file){
      attachment = '/uploads/' + req.file.filename;
      const ext = path.extname(req.file.filename).toLowerCase();
      if (['.png','.jpg','.jpeg','.gif','webp'].includes(ext)) type = 'image';
      else if (['.mp4','.mov','.webm'].includes(ext)) type = 'video';
      else type = 'file';
    }
    const blocked = await get('SELECT * FROM blocks WHERE blocker = ? AND blocked = ?', [toUserId, me]);
    if (blocked) return res.status(403).json({error:'blocked_by_target'});
    const id = genId('m');
    const msg = { id, fromUser: me, toUser: toUserId, text: text||'', attachment, type, time: Date.now() };
    await run('INSERT INTO messages (id,fromUser,toUser,text,attachment,type,time) VALUES (?,?,?,?,?,?)', [msg.id,msg.fromUser,msg.toUser,msg.text,msg.attachment,msg.type,msg.time]);
    io.to('u:'+me).emit('new_message', { msg });
    io.to('u:'+toUserId).emit('new_message', { msg });
    res.json({ ok:true, msg });
  }catch(err){ console.error(err); res.status(500).json({error:'server'}); }
});

// get messages with peer
app.get('/api/messages/:peerId', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    const peer = req.params.peerId;
    const rows = await all('SELECT * FROM messages WHERE (fromUser=? AND toUser=?) OR (fromUser=? AND toUser=?) ORDER BY time ASC', [me,peer,peer,me]);
    res.json(rows);
  }catch(err){ res.status(500).json({error:'server'}); }
});

// delete message
app.delete('/api/message/:id', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    const id = req.params.id;
    const msg = await get('SELECT * FROM messages WHERE id = ?', [id]);
    if (!msg) return res.status(404).json({error:'not_found'});
    if (msg.fromUser !== me) return res.status(403).json({error:'not_owner'});
    await run('DELETE FROM messages WHERE id = ?', [id]);
    io.emit('message_deleted', { id });
    res.json({ ok:true });
  }catch(err){ res.status(500).json({error:'server'}); }
});

// block user
app.post('/api/block', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    const { target } = req.body || {};
    if (!target) return res.status(400).json({error:'missing_target'});
    const id = genId('b');
    await run('INSERT INTO blocks (id,blocker,blocked,time) VALUES (?,?,?,?)', [id,me,target,Date.now()]);
    res.json({ ok:true });
  }catch(err){ res.status(500).json({error:'server'}); }
});

// gift nft
app.post('/api/gift-nft', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    const { toUserId, nftId } = req.body || {};
    const nft = await get('SELECT * FROM nfts WHERE id = ?', [nftId]);
    if (!nft) return res.status(404).json({error:'nft_not_found'});
    const entryId = genId('unft');
    await run('INSERT INTO user_nfts (id,nftId,ownerUserId,giftedBy,time) VALUES (?,?,?,?,?)', [entryId,nftId,toUserId,me,Date.now()]);
    io.emit('nft_gifted', { id: entryId, nftId, ownerUserId: toUserId, giftedBy: me });
    res.json({ ok:true });
  }catch(err){ res.status(500).json({error:'server'}); }
});

// delete account
app.delete('/api/account', authMiddleware, async (req,res)=>{
  try{
    const me = req.user.userId;
    await run('DELETE FROM messages WHERE fromUser = ?', [me]);
    await run('DELETE FROM user_nfts WHERE ownerUserId = ?', [me]);
    await run('DELETE FROM users WHERE userId = ?', [me]);
    io.emit('user_deleted', { userId: me });
    res.json({ ok:true });
  }catch(err){ res.status(500).json({error:'server'}); }
});

// seed few NFTs if not present
(async ()=>{
  const exists = await get('SELECT id FROM nfts LIMIT 1');
  if (!exists){
    await run('INSERT INTO nfts (id,title,image) VALUES (?,?,?)', ['nft_confetti','New Year Confetti','/assets/nft1.png']);
    await run('INSERT INTO nfts (id,title,image) VALUES (?,?,?)', ['nft_star','Shiny Star','/assets/nft2.png']);
  }
})();

// serve SPA
app.get('*', (req,res)=> res.sendFile(path.join(__dirname,'public','index.html')));

// Socket.IO
const server = http.createServer(app);
const io = new Server(server, { cors: { origin:'*' } });

io.use((socket,next)=>{ const token = socket.handshake.auth && socket.handshake.auth.token; if (!token) return next(); try{ const data = jwt.verify(token, JWT_SECRET); socket.user = data; }catch(e){} next(); });

io.on('connection', (socket)=>{
  if (socket.user && socket.user.userId) socket.join('u:'+socket.user.userId);
  socket.on('disconnect', ()=>{});
});

server.listen(PORT, ()=> console.log('Eldivis listening on', PORT));
