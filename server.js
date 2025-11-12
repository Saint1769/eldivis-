/**
 * Full chat server with extended features:
 * - User system with profiles
 * - Private and group chats
 * - Voice/video messages
 * - Gamification system
 * - NFT marketplace
 * - Social features
 * - Advanced media handling
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

const JWT_SECRET = process.env.JWT_SECRET || 'dev_secret_change_me_production';
const PORT = process.env.PORT || 3000;
const DB_FILE = path.join(__dirname, 'data.sqlite');

// Ensure directories exist
const UPLOADS = path.join(__dirname, 'uploads');
const VOICE_UPLOADS = path.join(__dirname, 'voice_uploads');
try { 
  fs.mkdirSync(UPLOADS, { recursive: true });
  fs.mkdirSync(VOICE_UPLOADS, { recursive: true });
} catch(e){}

const db = new sqlite3.Database(DB_FILE, (err)=>{
  if (err) { console.error('DB open error', err); process.exit(1); }
});

// Extended database schema
db.serialize(()=>{
  // Existing tables
  db.run(`CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    userId TEXT UNIQUE,
    username TEXT UNIQUE,
    passwordHash TEXT,
    coins INTEGER DEFAULT 100,
    createdAt INTEGER
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS messages (
    id TEXT PRIMARY KEY,
    fromUser TEXT,
    toUser TEXT,
    text TEXT,
    time INTEGER,
    replyTo TEXT,
    type TEXT DEFAULT 'text'
  )`);
  db.run(`CREATE TABLE IF NOT EXISTS nfts (
    id TEXT PRIMARY KEY,
    title TEXT,
    image TEXT,
    rarity TEXT DEFAULT 'common',
    price INTEGER DEFAULT 100
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

  // New tables for extended features
  db.run(`CREATE TABLE IF NOT EXISTS groups (
    id TEXT PRIMARY KEY,
    name TEXT,
    description TEXT,
    ownerId TEXT,
    avatar TEXT,
    isPublic BOOLEAN DEFAULT 1,
    createdAt INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS group_members (
    id TEXT PRIMARY KEY,
    groupId TEXT,
    userId TEXT,
    role TEXT DEFAULT 'member',
    joinedAt INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS group_messages (
    id TEXT PRIMARY KEY,
    groupId TEXT,
    fromUser TEXT,
    text TEXT,
    replyTo TEXT,
    type TEXT DEFAULT 'text',
    time INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS message_reactions (
    id TEXT PRIMARY KEY,
    messageId TEXT,
    userId TEXT,
    emoji TEXT,
    time INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS user_status (
    userId TEXT PRIMARY KEY,
    status TEXT DEFAULT 'online',
    customStatus TEXT,
    lastSeen INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS user_profiles (
    userId TEXT PRIMARY KEY,
    avatar TEXT,
    bio TEXT,
    website TEXT,
    location TEXT
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS friends (
    id TEXT PRIMARY KEY,
    userId TEXT,
    friendId TEXT,
    status TEXT DEFAULT 'pending',
    createdAt INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS user_achievements (
    id TEXT PRIMARY KEY,
    userId TEXT,
    achievementId TEXT,
    achievementName TEXT,
    achievedAt INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS user_levels (
    userId TEXT PRIMARY KEY,
    level INTEGER DEFAULT 1,
    xp INTEGER DEFAULT 0,
    messagesCount INTEGER DEFAULT 0
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS daily_bonus (
    id TEXT PRIMARY KEY,
    userId TEXT,
    day INTEGER,
    claimedAt INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS nft_market (
    id TEXT PRIMARY KEY,
    nftId TEXT,
    sellerId TEXT,
    price INTEGER,
    listedAt INTEGER,
    isActive BOOLEAN DEFAULT 1
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS voice_messages (
    id TEXT PRIMARY KEY,
    fromUser TEXT,
    toUser TEXT,
    groupId TEXT,
    audioUrl TEXT,
    duration INTEGER,
    time INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS scheduled_messages (
    id TEXT PRIMARY KEY,
    fromUser TEXT,
    toUser TEXT,
    groupId TEXT,
    text TEXT,
    scheduledFor INTEGER,
    sent INTEGER DEFAULT 0
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS stickers (
    id TEXT PRIMARY KEY,
    name TEXT,
    imageUrl TEXT,
    price INTEGER DEFAULT 50,
    category TEXT
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS user_stickers (
    id TEXT PRIMARY KEY,
    userId TEXT,
    stickerId TEXT,
    purchasedAt INTEGER
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS themes (
    id TEXT PRIMARY KEY,
    name TEXT,
    cssFile TEXT,
    price INTEGER DEFAULT 200
  )`);
  
  db.run(`CREATE TABLE IF NOT EXISTS user_themes (
    id TEXT PRIMARY KEY,
    userId TEXT,
    themeId TEXT,
    purchasedAt INTEGER
  )`);
});

// Database helper functions
function run(sql, params=[]) { return new Promise((res,rej)=> db.run(sql,params,function(err){ if (err) rej(err); else res(this); })); }
function get(sql, params=[]) { return new Promise((res,rej)=> db.get(sql,params,(err,row)=> err?rej(err):res(row))); }
function all(sql, params=[]) { return new Promise((res,rej)=> db.all(sql,params,(err,rows)=> err?rej(err):res(rows))); }

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));
app.use('/uploads', express.static(UPLOADS));
app.use('/voice', express.static(VOICE_UPLOADS));
app.use(express.static(path.join(__dirname, 'public')));

// Multer configurations
const upload = multer({ 
  dest: UPLOADS,
  limits: { fileSize: 10 * 1024 * 1024 } // 10MB
});

const voiceUpload = multer({
  dest: VOICE_UPLOADS,
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('audio/')) cb(null, true);
    else cb(new Error('Only audio files are allowed'));
  }
});

// Helper functions
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

// Update user status
async function updateUserStatus(userId, status, customStatus = null) {
  await run(
    'INSERT OR REPLACE INTO user_status (userId, status, customStatus, lastSeen) VALUES (?, ?, ?, ?)',
    [userId, status, customStatus, Date.now()]
  );
  io.emit('user_status_changed', { userId, status, customStatus });
}

// Add XP to user
async function addUserXP(userId, xpAmount) {
  const levelData = await get('SELECT * FROM user_levels WHERE userId = ?', [userId]);
  if (!levelData) {
    await run('INSERT INTO user_levels (userId, level, xp, messagesCount) VALUES (?, 1, ?, 0)', [userId, xpAmount]);
  } else {
    const newXP = levelData.xp + xpAmount;
    const newLevel = Math.floor(newXP / 100) + 1;
    await run(
      'UPDATE user_levels SET xp = ?, level = ? WHERE userId = ?',
      [newXP, newLevel, userId]
    );
    
    if (newLevel > levelData.level) {
      io.to('u:' + userId).emit('level_up', { userId, newLevel });
    }
  }
}

// ========== EXTENDED API ROUTES ==========

// User Profiles
app.get('/api/profile/:userId', authMiddleware, async (req, res) => {
  try {
    const profile = await get(`
      SELECT u.userId, u.username, u.coins, up.avatar, up.bio, up.website, up.location, 
             ul.level, ul.xp, us.status, us.customStatus
      FROM users u
      LEFT JOIN user_profiles up ON u.userId = up.userId
      LEFT JOIN user_levels ul ON u.userId = ul.userId
      LEFT JOIN user_status us ON u.userId = us.userId
      WHERE u.userId = ?
    `, [req.params.userId]);
    
    if (!profile) return res.status(404).json({error:'user_not_found'});
    res.json(profile);
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

app.put('/api/profile', authMiddleware, async (req, res) => {
  try {
    const { bio, website, location, customStatus } = req.body;
    await run(
      'INSERT OR REPLACE INTO user_profiles (userId, bio, website, location) VALUES (?, ?, ?, ?)',
      [req.user.userId, bio, website, location]
    );
    
    if (customStatus !== undefined) {
      await updateUserStatus(req.user.userId, 'online', customStatus);
    }
    
    res.json({ ok: true });
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

// Avatar upload
app.post('/api/upload-avatar', authMiddleware, upload.single('avatar'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({error:'no_file'});
    const avatarUrl = '/uploads/' + path.basename(req.file.path);
    await run(
      'INSERT OR REPLACE INTO user_profiles (userId, avatar) VALUES (?, ?)',
      [req.user.userId, avatarUrl]
    );
    res.json({ ok: true, avatarUrl });
  } catch(err) { res.status(500).json({error:'upload_failed'}); }
});

// Friends System
app.get('/api/friends', authMiddleware, async (req, res) => {
  try {
    const friends = await all(`
      SELECT f.*, u.username, us.status, up.avatar 
      FROM friends f
      JOIN users u ON u.userId = f.friendId
      LEFT JOIN user_status us ON us.userId = f.friendId
      LEFT JOIN user_profiles up ON up.userId = f.friendId
      WHERE f.userId = ? AND f.status = 'accepted'
    `, [req.user.userId]);
    res.json(friends);
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

app.post('/api/friends/request', authMiddleware, async (req, res) => {
  try {
    const { friendId } = req.body;
    if (req.user.userId === friendId) return res.status(400).json({error:'cannot_add_self'});
    
    const existing = await get(
      'SELECT * FROM friends WHERE userId = ? AND friendId = ?',
      [req.user.userId, friendId]
    );
    if (existing) return res.status(400).json({error:'request_exists'});
    
    const friendRequestId = genId('fr');
    await run(
      'INSERT INTO friends (id, userId, friendId, status, createdAt) VALUES (?, ?, ?, ?, ?)',
      [friendRequestId, req.user.userId, friendId, 'pending', Date.now()]
    );
    
    io.to('u:' + friendId).emit('friend_request', { 
      fromUserId: req.user.userId, 
      fromUsername: req.user.username 
    });
    
    res.json({ ok: true });
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

app.post('/api/friends/accept', authMiddleware, async (req, res) => {
  try {
    const { requestId } = req.body;
    await run(
      'UPDATE friends SET status = ? WHERE id = ? AND friendId = ?',
      ['accepted', requestId, req.user.userId]
    );
    res.json({ ok: true });
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

// Group Chats
app.get('/api/groups', authMiddleware, async (req, res) => {
  try {
    const groups = await all(`
      SELECT g.*, gm.role 
      FROM groups g
      JOIN group_members gm ON g.id = gm.groupId
      WHERE gm.userId = ?
    `, [req.user.userId]);
    res.json(groups);
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

app.post('/api/groups', authMiddleware, async (req, res) => {
  try {
    const { name, description, isPublic } = req.body;
    const groupId = genId('grp');
    
    await run(
      'INSERT INTO groups (id, name, description, ownerId, isPublic, createdAt) VALUES (?, ?, ?, ?, ?, ?)',
      [groupId, name, description, req.user.userId, isPublic, Date.now()]
    );
    
    await run(
      'INSERT INTO group_members (id, groupId, userId, role, joinedAt) VALUES (?, ?, ?, ?, ?)',
      [genId('gmem'), groupId, req.user.userId, 'owner', Date.now()]
    );
    
    res.json({ ok: true, groupId });
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

app.get('/api/groups/:groupId/messages', authMiddleware, async (req, res) => {
  try {
    const messages = await all(`
      SELECT gm.*, u.username 
      FROM group_messages gm
      JOIN users u ON u.userId = gm.fromUser
      WHERE gm.groupId = ?
      ORDER BY gm.time ASC
    `, [req.params.groupId]);
    res.json(messages);
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

// Voice Messages
app.post('/api/upload-voice', authMiddleware, voiceUpload.single('audio'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({error:'no_audio'});
    const { toUserId, groupId, duration } = req.body;
    const voiceId = genId('vm');
    const audioUrl = '/voice/' + path.basename(req.file.path);
    
    await run(
      'INSERT INTO voice_messages (id, fromUser, toUser, groupId, audioUrl, duration, time) VALUES (?, ?, ?, ?, ?, ?, ?)',
      [voiceId, req.user.userId, toUserId, groupId, audioUrl, duration, Date.now()]
    );
    
    res.json({ ok: true, voiceId, audioUrl });
  } catch(err) { res.status(500).json({error:'upload_failed'}); }
});

// Message Reactions
app.post('/api/messages/:messageId/react', authMiddleware, async (req, res) => {
  try {
    const { emoji } = req.body;
    const reactionId = genId('react');
    
    await run(
      'INSERT INTO message_reactions (id, messageId, userId, emoji, time) VALUES (?, ?, ?, ?, ?)',
      [reactionId, req.params.messageId, req.user.userId, emoji, Date.now()]
    );
    
    io.emit('message_reacted', { 
      messageId: req.params.messageId, 
      userId: req.user.userId, 
      emoji 
    });
    
    res.json({ ok: true });
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

// Gamification - Daily Bonus
app.post('/api/daily-bonus', authMiddleware, async (req, res) => {
  try {
    const today = new Date().toDateString();
    const todayKey = today.replace(/\s/g, '');
    
    const claimed = await get(
      'SELECT * FROM daily_bonus WHERE userId = ? AND day = ?',
      [req.user.userId, todayKey]
    );
    
    if (claimed) return res.status(400).json({error:'already_claimed'});
    
    const bonusAmount = 50 + Math.floor(Math.random() * 50);
    await run('UPDATE users SET coins = coins + ? WHERE userId = ?', [bonusAmount, req.user.userId]);
    await run(
      'INSERT INTO daily_bonus (id, userId, day, claimedAt) VALUES (?, ?, ?, ?)',
      [genId('bonus'), req.user.userId, todayKey, Date.now()]
    );
    
    await addUserXP(req.user.userId, 10);
    
    io.emit('coins_updated', { userId: req.user.userId, delta: bonusAmount });
    res.json({ ok: true, bonusAmount });
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

// Achievements
app.get('/api/achievements', authMiddleware, async (req, res) => {
  try {
    const achievements = await all(`
      SELECT * FROM user_achievements 
      WHERE userId = ?
    `, [req.user.userId]);
    res.json(achievements);
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

// NFT Marketplace
app.get('/api/marketplace', authMiddleware, async (req, res) => {
  try {
    const listings = await all(`
      SELECT nm.*, n.title, n.image, n.rarity, u.username as sellerName
      FROM nft_market nm
      JOIN nfts n ON n.id = nm.nftId
      JOIN users u ON u.userId = nm.sellerId
      WHERE nm.isActive = 1
    `);
    res.json(listings);
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

app.post('/api/marketplace/list', authMiddleware, async (req, res) => {
  try {
    const { nftId, price } = req.body;
    
    // Check if user owns the NFT
    const owned = await get(
      'SELECT * FROM user_nfts WHERE nftId = ? AND ownerUserId = ?',
      [nftId, req.user.userId]
    );
    if (!owned) return res.status(400).json({error:'not_owner'});
    
    const listingId = genId('mkt');
    await run(
      'INSERT INTO nft_market (id, nftId, sellerId, price, listedAt) VALUES (?, ?, ?, ?, ?)',
      [listingId, nftId, req.user.userId, price, Date.now()]
    );
    
    res.json({ ok: true, listingId });
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

// Stickers and Themes
app.get('/api/stickers', authMiddleware, async (req, res) => {
  try {
    const stickers = await all('SELECT * FROM stickers');
    const userStickers = await all(
      'SELECT stickerId FROM user_stickers WHERE userId = ?',
      [req.user.userId]
    );
    res.json({ stickers, userStickers: userStickers.map(s => s.stickerId) });
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

app.post('/api/stickers/buy', authMiddleware, async (req, res) => {
  try {
    const { stickerId } = req.body;
    const sticker = await get('SELECT * FROM stickers WHERE id = ?', [stickerId]);
    if (!sticker) return res.status(404).json({error:'sticker_not_found'});
    
    const user = await get('SELECT coins FROM users WHERE userId = ?', [req.user.userId]);
    if (user.coins < sticker.price) return res.status(400).json({error:'not_enough_coins'});
    
    await run('UPDATE users SET coins = coins - ? WHERE userId = ?', [sticker.price, req.user.userId]);
    await run(
      'INSERT INTO user_stickers (id, userId, stickerId, purchasedAt) VALUES (?, ?, ?, ?)',
      [genId('stk'), req.user.userId, stickerId, Date.now()]
    );
    
    io.emit('coins_updated', { userId: req.user.userId, delta: -sticker.price });
    res.json({ ok: true });
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

// Scheduled Messages
app.post('/api/schedule-message', authMiddleware, async (req, res) => {
  try {
    const { toUserId, groupId, text, scheduledFor } = req.body;
    const scheduledId = genId('sch');
    
    await run(
      'INSERT INTO scheduled_messages (id, fromUser, toUser, groupId, text, scheduledFor) VALUES (?, ?, ?, ?, ?, ?)',
      [scheduledId, req.user.userId, toUserId, groupId, text, scheduledFor]
    );
    
    res.json({ ok: true, scheduledId });
  } catch(err) { res.status(500).json({error:'server_error'}); }
});

// ========== EXISTING API ROUTES (UPDATED) ==========

app.post('/api/register', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({error:'username_password_required'});
    const clean = String(username).trim();
    const exists = await get('SELECT * FROM users WHERE username = ?', [clean]);
    if (exists) return res.status(409).json({error:'username_taken'});
    const userId = genId('u');
    const hash = await bcrypt.hash(password, 10);
    await run('INSERT INTO users (userId, username, passwordHash, coins, createdAt) VALUES (?,?,?,?,?)', [userId, clean, hash, 100, Date.now()]);
    
    // Initialize user data
    await updateUserStatus(userId, 'online');
    await run('INSERT INTO user_levels (userId, level, xp, messagesCount) VALUES (?, 1, 0, 0)', [userId]);
    
    const token = jwt.sign({ userId, username: clean }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ ok:true, token });
  } catch(err){ console.error(err); res.status(500).json({error:'server'}); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) return res.status(400).json({error:'username_password_required'});
    const user = await get('SELECT * FROM users WHERE username = ?', [username]);
    if (!user) return res.status(401).json({error:'invalid'});
    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({error:'invalid'});
    
    await updateUserStatus(user.userId, 'online');
    
    const token = jwt.sign({ userId: user.userId, username: user.username }, JWT_SECRET, { expiresIn: '30d' });
    return res.json({ ok:true, token });
  } catch(err){ console.error(err); res.status(500).json({error:'server'}); }
});

app.get('/api/users', authMiddleware, async (req, res) => {
  try {
    const rows = await all(`
      SELECT u.userId, u.username, u.coins, us.status, us.customStatus, up.avatar, ul.level
      FROM users u
      LEFT JOIN user_status us ON u.userId = us.userId
      LEFT JOIN user_profiles up ON u.userId = up.userId
      LEFT JOIN user_levels ul ON u.userId = ul.userId
      ORDER BY u.username ASC
    `);
    res.json(rows);
  } catch(err){ res.status(500).json({error:'db'}); }
});

app.get('/api/messages/:peerId', authMiddleware, async (req, res) => {
  try {
    const me = req.user.userId;
    const peer = req.params.peerId;
    const rows = await all(`
      SELECT m.*, mr.emoji, mr.userId as reactedBy 
      FROM messages m
      LEFT JOIN message_reactions mr ON m.id = mr.messageId
      WHERE (m.fromUser=? AND m.toUser=?) OR (m.fromUser=? AND m.toUser=?) 
      ORDER BY m.time ASC
    `, [me, peer, peer, me]);
    res.json(rows);
  } catch(err){ res.status(500).json({error:'db'}); }
});

app.delete('/api/message/:id', authMiddleware, async (req, res) => {
  try {
    const me = req.user.userId;
    const id = req.params.id;
    const msg = await get('SELECT * FROM messages WHERE id = ?', [id]);
    if (!msg) return res.status(404).json({error:'not_found'});
    if (msg.fromUser !== me) return res.status(403).json({error:'not_owner'});
    await run('DELETE FROM messages WHERE id = ?', [id]);
    await run('DELETE FROM message_reactions WHERE messageId = ?', [id]);
    io.emit('message_deleted', { id });
    res.json({ ok:true });
  } catch(err){ res.status(500).json({error:'db'}); }
});

app.delete('/api/account', authMiddleware, async (req, res) => {
  try {
    const me = req.user.userId;
    await run('DELETE FROM messages WHERE fromUser = ? OR toUser = ?', [me, me]);
    await run('DELETE FROM user_nfts WHERE ownerUserId = ?', [me]);
    await run('DELETE FROM user_status WHERE userId = ?', [me]);
    await run('DELETE FROM user_profiles WHERE userId = ?', [me]);
    await run('DELETE FROM friends WHERE userId = ? OR friendId = ?', [me, me]);
    await run('DELETE FROM group_members WHERE userId = ?', [me]);
    await run('DELETE FROM users WHERE userId = ?', [me]);
    io.emit('user_deleted', { userId: me });
    res.json({ ok:true });
  } catch(err){ res.status(500).json({error:'db'}); }
});

app.post('/api/purchase', authMiddleware, async (req, res) => {
  try {
    const me = req.user.userId;
    const { amount } = req.body || {};
    const n = parseInt(amount) || 0;
    if (n <= 0) return res.status(400).json({error:'invalid_amount'});
    await run('UPDATE users SET coins = coins + ? WHERE userId = ?', [n, me]);
    const txId = genId('tx');
    await run('INSERT INTO transactions (id,userId,type,amount,meta,time) VALUES (?,?,?,?,?,?)', [txId, me, 'purchase', n, 'simulated', Date.now()]);
    io.emit('coins_updated', { userId: me, delta: n });
    res.json({ ok:true });
  } catch(err){ res.status(500).json({error:'db'}); }
});

app.post('/api/gift-coins', authMiddleware, async (req, res) => {
  try {
    const me = req.user.userId;
    const { toUserId, amount } = req.body || {};
    const n = parseInt(amount) || 0;
    if (n <= 0) return res.status(400).json({error:'invalid_amount'});
    const from = await get('SELECT coins FROM users WHERE userId = ?', [me]);
    if (!from || from.coins < n) return res.status(400).json({error:'not_enough'});
    await run('UPDATE users SET coins = coins - ? WHERE userId = ?', [n, me]);
    await run('UPDATE users SET coins = coins + ? WHERE userId = ?', [n, toUserId]);
    const tx1 = genId('tx'); const tx2 = genId('tx');
    await run('INSERT INTO transactions (id,userId,type,amount,meta,time) VALUES (?,?,?,?,?,?)', [tx1, me, 'gift_sent', n, toUserId, Date.now()]);
    await run('INSERT INTO transactions (id,userId,type,amount,meta,time) VALUES (?,?,?,?,?,?)', [tx2, toUserId, 'gift_received', n, me, Date.now()]);
    io.emit('coins_updated', { userId: me }); io.emit('coins_updated', { userId: toUserId });
    res.json({ ok:true });
  } catch(err){ res.status(500).json({error:'db'}); }
});

app.get('/api/nfts', authMiddleware, async (req, res) => {
  try {
    const rows = await all('SELECT * FROM nfts');
    res.json(rows);
  } catch(err){ res.status(500).json({error:'db'}); }
});

app.post('/api/gift-nft', authMiddleware, async (req, res) => {
  try {
    const me = req.user.userId;
    const { toUserId, nftId } = req.body || {};
    const nft = await get('SELECT * FROM nfts WHERE id = ?', [nftId]);
    if (!nft) return res.status(404).json({error:'nft_not_found'});
    const entryId = genId('unft');
    await run('INSERT INTO user_nfts (id,nftId,ownerUserId,giftedBy,time) VALUES (?,?,?,?,?)', [entryId, nftId, toUserId, me, Date.now()]);
    io.emit('nft_gifted', { id: entryId, nftId, ownerUserId: toUserId, giftedBy: me });
    res.json({ ok:true });
  } catch(err){ res.status(500).json({error:'db'}); }
});

app.post('/api/upload-nft', upload.single('file'), async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({error:'no_file'});
    const id = genId('nft');
    const filename = path.basename(req.file.path);
    await run('INSERT INTO nfts (id,title,image) VALUES (?,?,?)', [id, req.body.title || 'NFT', '/uploads/' + filename]);
    res.json({ ok:true, id, image: '/uploads/' + filename });
  } catch(err){ console.error(err); res.status(500).json({error:'server'}); }
});

// Serve SPA
app.get('*', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

// HTTP + Socket.IO server
const server = http.createServer(app);
const io = new Server(server, { cors: { origin:'*' } });

// Socket.IO authentication
io.use((socket, next) => {
  const token = socket.handshake.auth && socket.handshake.auth.token || socket.handshake.query && socket.handshake.query.token;
  if (!token) return next();
  try {
    const data = jwt.verify(token, JWT_SECRET);
    socket.user = data;
  } catch(e) { /* ignore */ }
  next();
});

// Socket.IO connection handling
io.on('connection', (socket) => {
  console.log('socket connected', socket.id, socket.user?.username);
  
  if (socket.user && socket.user.userId) {
    socket.join('u:' + socket.user.userId);
    updateUserStatus(socket.user.userId, 'online');
  }

  // Private messages
  socket.on('private_message', async (payload, cb) => {
    try {
      const { token, toUserId, text, replyTo } = payload || {};
      let sender = socket.user;
      if (!sender && token) {
        try { sender = jwt.verify(token, JWT_SECRET); } catch(e){}
      }
      if (!sender) return cb && cb({ ok:false, error:'not_auth' });
      
      const me = sender.userId;
      const id = genId('m');
      const msg = { id, fromUser: me, toUser: toUserId, text: text.slice(0,2000), time: Date.now(), replyTo };
      
      await run('INSERT INTO messages (id,fromUser,toUser,text,time,replyTo) VALUES (?,?,?,?,?,?)', 
        [msg.id, msg.fromUser, msg.toUser, msg.text, msg.time, msg.replyTo]);
      
      // Add XP for message
      await addUserXP(me, 1);
      
      io.to('u:' + me).emit('new_message', { msg });
      io.to('u:' + toUserId).emit('new_message', { msg });
      if (cb) cb({ ok:true, msg });
    } catch(err) { console.error('pm err', err); if (cb) cb({ ok:false, error:'server' }); }
  });

  // Group messages
  socket.on('group_message', async (payload, cb) => {
    try {
      const { groupId, text } = payload || {};
      if (!socket.user) return cb && cb({ ok:false, error:'not_auth' });
      
      const id = genId('gm');
      const msg = { id, groupId, fromUser: socket.user.userId, text: text.slice(0,2000), time: Date.now() };
      
      await run('INSERT INTO group_messages (id, groupId, fromUser, text, time) VALUES (?, ?, ?, ?, ?)',
        [id, groupId, socket.user.userId, text, Date.now()]);
      
      // Add XP for message
      await addUserXP(socket.user.userId, 1);
      
      io.to('g:' + groupId).emit('new_group_message', { msg });
      if (cb) cb({ ok:true, msg });
    } catch(err) { console.error('gm err', err); if (cb) cb({ ok:false, error:'server' }); }
  });

  // Join group room
  socket.on('join_group', (groupId) => {
    socket.join('g:' + groupId);
  });

  // Leave group room
  socket.on('leave_group', (groupId) => {
    socket.leave('g:' + groupId);
  });

  // Voice call signaling
  socket.on('voice_call_offer', (data) => {
    socket.to('u:' + data.toUserId).emit('voice_call_offer', {
      fromUserId: socket.user.userId,
      fromUsername: socket.user.username,
      offer: data.offer
    });
  });

  socket.on('voice_call_answer', (data) => {
    socket.to('u:' + data.toUserId).emit('voice_call_answer', {
      fromUserId: socket.user.userId,
      answer: data.answer
    });
  });

  socket.on('voice_call_ice_candidate', (data) => {
    socket.to('u:' + data.toUserId).emit('voice_call_ice_candidate', {
      fromUserId: socket.user.userId,
      candidate: data.candidate
    });
  });

  socket.on('disconnect', () => {
    if (socket.user && socket.user.userId) {
      updateUserStatus(socket.user.userId, 'offline');
    }
  });
});

// Process scheduled messages
setInterval(async () => {
  try {
    const dueMessages = await all(
      'SELECT * FROM scheduled_messages WHERE scheduledFor <= ? AND sent = 0',
      [Date.now()]
    );
    
    for (const msg of dueMessages) {
      if (msg.toUser) {
        // Private message
        const messageId = genId('m');
        await run('INSERT INTO messages (id, fromUser, toUser, text, time) VALUES (?, ?, ?, ?, ?)',
          [messageId, msg.fromUser, msg.toUser, msg.text, Date.now()]);
        
        io.to('u:' + msg.fromUser).emit('new_message', { 
          msg: { id: messageId, fromUser: msg.fromUser, toUser: msg.toUser, text: msg.text, time: Date.now() }
        });
        io.to('u:' + msg.toUser).emit('new_message', { 
          msg: { id: messageId, fromUser: msg.fromUser, toUser: msg.toUser, text: msg.text, time: Date.now() }
        });
      } else if (msg.groupId) {
        // Group message
        const messageId = genId('gm');
        await run('INSERT INTO group_messages (id, groupId, fromUser, text, time) VALUES (?, ?, ?, ?, ?)',
          [messageId, msg.groupId, msg.fromUser, msg.text, Date.now()]);
        
        io.to('g:' + msg.groupId).emit('new_group_message', { 
          msg: { id: messageId, groupId: msg.groupId, fromUser: msg.fromUser, text: msg.text, time: Date.now() }
        });
      }
      
      await run('UPDATE scheduled_messages SET sent = 1 WHERE id = ?', [msg.id]);
    }
  } catch (err) {
    console.error('Error processing scheduled messages:', err);
  }
}, 60000); // Check every minute

server.listen(PORT, () => console.log('Server listening on', PORT));