'use strict';

/**
 * Baslangic verisi. Tablolar bos ise yalnizca varsayilan yonetici
 * hesabini olusturur. Site icerigi yonetim panelinden eklenir.
 * Elle calistirmak icin:  npm run seed
 */

const { db, initSchema, count, get } = require('./db');
const { hashPassword } = require('./auth');

function seed() {
  initSchema();

  // --- Admin (varsayilan giris) --------------------------------
  if (count('admins') === 0) {
    db.prepare(
      'INSERT INTO admins (username, password_hash, full_name, role) VALUES (?, ?, ?, ?)'
    ).run('admin', hashPassword('solar2026'), 'Yonetici', 'admin');
  }
}

// Dogrudan calistirildiginda seed at ve bilgi ver.
if (require.main === module) {
  seed();
  const a = get('SELECT username FROM admins LIMIT 1');
  console.log('Veritabani hazirlandi.');
  if (a) console.log(`Varsayilan admin girisi -> kullanici: ${a.username}  sifre: solar2026`);
}

module.exports = { seed };
