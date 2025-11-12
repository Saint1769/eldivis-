
const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname,'data.sqlite'));
db.serialize(()=>{ db.run("INSERT OR IGNORE INTO nfts (id,title,image) VALUES (?,?,?)", ['nft_1','Party Confetti','/public/assets/nft1.png']); db.run("INSERT OR IGNORE INTO nfts (id,title,image) VALUES (?,?,?)", ['nft_2','Shiny Star','/public/assets/nft2.png']); db.close(); });
console.log('seeded');