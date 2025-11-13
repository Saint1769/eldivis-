
const { Pool } = require('pg');
const bcrypt = require('bcrypt');
const { v4: uuidv4 } = require('uuid');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS nfts (id UUID PRIMARY KEY, title TEXT, image TEXT);
    CREATE TABLE IF NOT EXISTS users (id UUID PRIMARY KEY, username TEXT UNIQUE, password_hash TEXT, nickname TEXT, avatar TEXT, coins INTEGER DEFAULT 50, vip BOOLEAN DEFAULT FALSE, created_at TIMESTAMP DEFAULT NOW());
  `);
  const res = await pool.query('SELECT COUNT(*) FROM nfts');
  if (parseInt(res.rows[0].count) === 0) {
    const nft1 = { id: uuidv4(), title: 'New Year Confetti', image: '/assets/nfts/nft_0.png' };
    const nft2 = { id: uuidv4(), title: 'Shiny Star', image: '/assets/nfts/nft_1.png' };
    await pool.query('INSERT INTO nfts (id,title,image) VALUES ($1,$2,$3)', [nft1.id, nft1.title, nft1.image]);
    await pool.query('INSERT INTO nfts (id,title,image) VALUES ($1,$2,$3)', [nft2.id, nft2.title, nft2.image]);
    console.log('Seeded NFTs');
  } else console.log('NFTs exist, skipping');
  const ures = await pool.query('SELECT COUNT(*) FROM users');
  if (parseInt(ures.rows[0].count) === 0) {
    const pw = await bcrypt.hash('password', 10);
    const u1 = { id: uuidv4(), username: 'alice', password_hash: pw, nickname: 'Alice', avatar: '/assets/images/avatar_0.png' };
    const u2 = { id: uuidv4(), username: 'bob', password_hash: pw, nickname: 'Bob', avatar: '/assets/images/avatar_1.png' };
    await pool.query('INSERT INTO users (id,username,password_hash,nickname,avatar) VALUES ($1,$2,$3,$4,$5)', [u1.id,u1.username,u1.password_hash,u1.nickname,u1.avatar]);
    await pool.query('INSERT INTO users (id,username,password_hash,nickname,avatar) VALUES ($1,$2,$3,$4,$5)', [u2.id,u2.username,u2.password_hash,u2.nickname,u2.avatar]);
    console.log('Seeded demo users: alice, bob (password: password)');
  } else console.log('Users exist, skipping');
  await pool.end();
}
run().catch(err=>{ console.error(err); process.exit(1); });
