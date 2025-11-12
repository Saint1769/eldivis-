const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const db = new sqlite3.Database(path.join(__dirname, 'data.sqlite'));

db.serialize(() => {
  // Basic NFTs
  db.run("INSERT OR IGNORE INTO nfts (id, title, image, rarity, price) VALUES (?, ?, ?, ?, ?)", 
    ['nft_1', 'Party Confetti', '/public/assets/nft1.png', 'common', 100]);
  db.run("INSERT OR IGNORE INTO nfts (id, title, image, rarity, price) VALUES (?, ?, ?, ?, ?)", 
    ['nft_2', 'Shiny Star', '/public/assets/nft2.png', 'rare', 250]);
  db.run("INSERT OR IGNORE INTO nfts (id, title, image, rarity, price) VALUES (?, ?, ?, ?, ?)", 
    ['nft_3', 'Golden Crown', '/public/assets/nft3.png', 'epic', 500]);
  db.run("INSERT OR IGNORE INTO nfts (id, title, image, rarity, price) VALUES (?, ?, ?, ?, ?)", 
    ['nft_4', 'Dragon Egg', '/public/assets/nft4.png', 'legendary', 1000]);

  // Stickers
  db.run("INSERT OR IGNORE INTO stickers (id, name, imageUrl, price, category) VALUES (?, ?, ?, ?, ?)",
    ['sticker_1', 'Winking Face', '/public/stickers/wink.png', 50, 'emotions');
  db.run("INSERT OR IGNORE INTO stickers (id, name, imageUrl, price, category) VALUES (?, ?, ?, ?, ?)",
    ['sticker_2', 'Heart Eyes', '/public/stickers/heart_eyes.png', 50, 'emotions');
  db.run("INSERT OR IGNORE INTO stickers (id, name, imageUrl, price, category) VALUES (?, ?, ?, ?, ?)",
    ['sticker_3', 'Laughing', '/public/stickers/laugh.png', 50, 'emotions');
  db.run("INSERT OR IGNORE INTO stickers (id, name, imageUrl, price, category) VALUES (?, ?, ?, ?, ?)",
    ['sticker_4', 'Thumbs Up', '/public/stickers/thumbs_up.png', 30, 'gestures');
  db.run("INSERT OR IGNORE INTO stickers (id, name, imageUrl, price, category) VALUES (?, ?, ?, ?, ?)",
    ['sticker_5', 'Celebration', '/public/stickers/celebration.png', 70, 'events');

  // Themes
  db.run("INSERT OR IGNORE INTO themes (id, name, cssFile, price) VALUES (?, ?, ?, ?)",
    ['theme_1', 'Dark Matrix', '/public/themes/matrix.css', 200);
  db.run("INSERT OR IGNORE INTO themes (id, name, cssFile, price) VALUES (?, ?, ?, ?)",
    ['theme_2', 'Ocean Blue', '/public/themes/ocean.css', 200);
  db.run("INSERT OR IGNORE INTO themes (id, name, cssFile, price) VALUES (?, ?, ?, ?)",
    ['theme_3', 'Sunset Orange', '/public/themes/sunset.css', 200);
  db.run("INSERT OR IGNORE INTO themes (id, name, cssFile, price) VALUES (?, ?, ?, ?)",
    ['theme_4', 'Forest Green', '/public/themes/forest.css', 200);

  // Sample group
  db.run("INSERT OR IGNORE INTO groups (id, name, description, ownerId, isPublic, createdAt) VALUES (?, ?, ?, ?, ?, ?)",
    ['grp_welcome', 'Welcome Group', 'General chat for new members', 'system', 1, Date.now()]);

  console.log('Database seeded with extended data!');
});

db.close();