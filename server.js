'use strict';

/**
 * SAYE - Takim web sitesi sunucusu.
 * Node.js + Express + SQLite (node:sqlite).
 */

const path = require('node:path');

// .env dosyasini yukle (varsa). Yoksa sessizce devam edilir.
try { process.loadEnvFile(path.join(__dirname, '.env')); } catch (e) { /* .env yok */ }

const express = require('express');

const { initSchema, DB_PATH } = require('./src/db');
const { seed } = require('./src/seed');
const publicRoutes = require('./src/routes/public');
const adminRoutes = require('./src/routes/admin');

// Veritabani semasini kur ve tablolar bossa ornek veriyi yukle.
initSchema();
seed();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

// --- API rotalari ---
app.use('/api/admin', adminRoutes);
app.use('/api', publicRoutes);

// --- API 404 ---
app.use('/api', (req, res) => {
  res.status(404).json({ error: 'API ucu bulunamadi.', path: req.originalUrl });
});

// --- Statik dosyalar (site + admin paneli) ---
app.use(express.static(path.join(__dirname, 'public'), { extensions: ['html'] }));

// --- Genel hata yakalayici ---
// eslint-disable-next-line no-unused-vars
app.use((err, req, res, next) => {
  console.error('Sunucu hatasi:', err);
  res.status(500).json({ error: 'Sunucu hatasi.' });
});

app.listen(PORT, () => {
  console.log('==============================================');
  console.log('  SAYE web sitesi calisiyor');
  console.log(`  Site       : http://localhost:${PORT}`);
  console.log(`  Yonetim    : http://localhost:${PORT}/admin/`);
  console.log(`  Veritabani : ${DB_PATH}`);
  console.log('==============================================');
});
