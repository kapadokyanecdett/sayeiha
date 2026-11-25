'use strict';

/**
 * Herkese acik API rotalari (site icerigi ve form gonderimleri).
 */

const express = require('express');
const { randomInt } = require('node:crypto');
const { all, get, run, count } = require('../db');
const { isValidEmail, missingFields, normalizeEmail } = require('../utils');
const {
  hashPassword,
  verifyPassword,
  createUserSession,
  destroyUserSession,
  userAuthMiddleware,
  getUserSession,
} = require('../auth');
const { sendVerificationCode, sendPasswordReset, mailEnabled } = require('../mailer');

const router = express.Router();

// Yorum/begeni hedef turleri
const TARGET_TYPES = ['news', 'announcement'];

/** Token varsa req.user'i doldurur, yoksa da devam eder (zorunlu degil). */
function optionalUser(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  req.user = getUserSession(token) || null;
  next();
}

/** Begeni sayisi ve (giris yaptiysa) kullanicinin begenip begenmedigi SQL ifadesi. */
function likeSelect(targetType, userId, prefix) {
  const a = `${prefix}likes`;
  const b = `${prefix}liked`;
  return `(SELECT COUNT(*) FROM reactions r WHERE r.target_type = '${targetType}' AND r.target_id = t.id) AS ${a},
          (SELECT COUNT(*) FROM reactions r2 WHERE r2.target_type = '${targetType}' AND r2.target_id = t.id AND r2.user_id = ${Number(userId) || -1}) AS ${b}`;
}

// Kayit sirasinda secilebilecek birimler
const DEPARTMENTS = ['Yazılım', 'Mekanik', 'Elektronik', 'Tasarım', 'Medya', 'Yönetim'];

// Dogrulama kodu ayarlari
const CODE_TTL_MS = 10 * 60 * 1000; // 10 dakika
const MAX_ATTEMPTS = 6;

// Profil fotografi ayarlari (istemcide kucultulmus data URL)
const AVATAR_MAX_LEN = 700 * 1024; // ~700 KB
const AVATAR_RE = /^data:image\/(?:png|jpe?g|webp|gif);base64,[A-Za-z0-9+/]+={0,2}$/;

/** Gelen avatar degerini dogrular. Bos deger fotografin kaldirilmasini saglar. */
function parseAvatar(v) {
  if (v === null || v === undefined || v === '') return { ok: true, avatar: null };
  if (typeof v !== 'string') return { ok: false };
  if (v.length > AVATAR_MAX_LEN) return { ok: false, tooLarge: true };
  if (!AVATAR_RE.test(v)) return { ok: false };
  return { ok: true, avatar: v };
}

/** Kullaniciyi sifre alani olmadan disari doner. */
function publicUser(u) {
  return {
    id: u.id,
    first_name: u.first_name,
    last_name: u.last_name,
    username: u.username,
    email: u.email,
    age: u.age,
    department: u.department,
    avatar: u.avatar || null,
    notify_news: Number(u.notify_news) ? 1 : 0,
    notify_announcements: Number(u.notify_announcements) ? 1 : 0,
    created_at: u.created_at,
  };
}

/** Yeni 6 haneli dogrulama kodu uretir. */
function generateCode() {
  return String(randomInt(100000, 1000000));
}

/** Test modunda kodu API yanitina ekler, gercek modda eklemez. */
function codeField(code) {
  return mailEnabled ? {} : { devCode: code };
}

/** Formdan gelen degeri 1/0 bayrağa cevirir (checkbox "on" dahil). */
function toFlag(v, fallback) {
  if (v === undefined || v === null) return fallback;
  if (typeof v === 'boolean') return v ? 1 : 0;
  const s = String(v).toLowerCase();
  return (s === '1' || s === 'true' || s === 'on' || s === 'yes') ? 1 : 0;
}

function attachSpecs(vehicle) {
  if (!vehicle) return vehicle;
  vehicle.specs = all(
    'SELECT id, label, value, unit, sort_order FROM vehicle_specs WHERE vehicle_id = ? ORDER BY sort_order ASC, id ASC',
    vehicle.id
  );
  return vehicle;
}

// ------------------------------------------------------------
// Site ayarlari
// ------------------------------------------------------------
router.get('/settings', (req, res) => {
  const settings = {};
  for (const row of all('SELECT key, value FROM settings')) settings[row.key] = row.value;
  res.json(settings);
});

// ------------------------------------------------------------
// Takim uyeleri
// ------------------------------------------------------------
router.get('/members', (req, res) => {
  res.json(all('SELECT * FROM members WHERE is_active = 1 ORDER BY sort_order ASC, id ASC'));
});

// ------------------------------------------------------------
// Araclar + teknik ozellikler
// ------------------------------------------------------------
router.get('/vehicles', (req, res) => {
  const rows = all('SELECT * FROM vehicles ORDER BY sort_order ASC, id ASC');
  res.json(rows.map(attachSpecs));
});

router.get('/vehicles/:slug', (req, res) => {
  const numeric = Number(req.params.slug);
  const v = get(
    'SELECT * FROM vehicles WHERE slug = ? OR id = ?',
    req.params.slug,
    Number.isFinite(numeric) ? numeric : -1
  );
  if (!v) return res.status(404).json({ error: 'Arac bulunamadi.' });
  res.json(attachSpecs(v));
});

// ------------------------------------------------------------
// Haberler / blog
// ------------------------------------------------------------
router.get('/news', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 30, 1), 100);
  const { category, q } = req.query;
  let sql =
    'SELECT id, title, slug, category, summary, image, author, tags, published_at FROM news WHERE is_published = 1';
  const params = [];
  if (category) { sql += ' AND category = ?'; params.push(category); }
  if (q) {
    sql += ' AND (title LIKE ? OR summary LIKE ? OR content LIKE ?)';
    params.push(`%${q}%`, `%${q}%`, `%${q}%`);
  }
  sql += ' ORDER BY published_at DESC LIMIT ?';
  params.push(limit);
  res.json(all(sql, ...params));
});

router.get('/news/:slug', optionalUser, (req, res) => {
  const numeric = Number(req.params.slug);
  const uid = req.user ? req.user.userId : null;
  const item = get(
    `SELECT t.*, ${likeSelect('news', uid)},
       (SELECT COUNT(*) FROM comments c WHERE c.target_type = 'news' AND c.target_id = t.id AND c.is_approved = 1) AS comments
       FROM news t
      WHERE (t.slug = ? OR t.id = ?) AND t.is_published = 1`,
    req.params.slug,
    Number.isFinite(numeric) ? numeric : -1
  );
  if (!item) return res.status(404).json({ error: 'Icerik bulunamadi.' });
  res.json(item);
});

// ------------------------------------------------------------
// Duyurular
// ------------------------------------------------------------
router.get('/announcements', optionalUser, (req, res) => {
  const uid = req.user ? req.user.userId : null;
  res.json(
    all(`SELECT t.*, ${likeSelect('announcement', uid)}
           FROM announcements t
          WHERE t.is_published = 1
          ORDER BY t.is_pinned DESC, t.published_at DESC`)
  );
});

// ------------------------------------------------------------
// Faaliyet alanlari
// ------------------------------------------------------------
router.get('/activity-areas', (req, res) => {
  res.json(all('SELECT * FROM activity_areas ORDER BY sort_order ASC, id ASC'));
});

// ------------------------------------------------------------
// Kariyer ilanlari
// ------------------------------------------------------------
router.get('/careers', (req, res) => {
  res.json(all('SELECT * FROM careers ORDER BY is_open DESC, id DESC'));
});

// ------------------------------------------------------------
// Sponsorlar
// ------------------------------------------------------------
const TIER_ORDER = "CASE tier WHEN 'Platin' THEN 1 WHEN 'Altın' THEN 2 WHEN 'Gümüş' THEN 3 WHEN 'Bronz' THEN 4 ELSE 5 END";
router.get('/sponsors', (req, res) => {
  res.json(all(`SELECT * FROM sponsors ORDER BY ${TIER_ORDER}, sort_order ASC, id ASC`));
});

// ------------------------------------------------------------
// Ana sayfa ozet istatistikleri
// ------------------------------------------------------------
router.get('/stats', (req, res) => {
  res.json({
    members: count('members'),
    vehicles: count('vehicles'),
    news: count('news'),
    announcements: count('announcements'),
    sponsors: count('sponsors'),
    activityAreas: count('activity_areas'),
  });
});

// ------------------------------------------------------------
// Site ici arama (komut paleti icin)
// ------------------------------------------------------------
router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim();
  if (q.length < 2) return res.json({ query: q, results: [] });
  const like = `%${q}%`;
  const results = [];

  const add = (type, rows, map) => {
    for (const row of rows) results.push(map(row));
  };

  add('Haber',
    all('SELECT title, slug, category, summary FROM news WHERE is_published = 1 AND (title LIKE ? OR summary LIKE ? OR content LIKE ?) ORDER BY published_at DESC LIMIT 6', like, like, like),
    (r) => ({ type: 'Haber', title: r.title, meta: r.category, desc: r.summary, url: `/haber?slug=${encodeURIComponent(r.slug || '')}` }));

  add('Duyuru',
    all('SELECT title, type, content FROM announcements WHERE is_published = 1 AND (title LIKE ? OR content LIKE ?) ORDER BY published_at DESC LIMIT 4', like, like),
    (r) => ({ type: 'Duyuru', title: r.title, meta: r.type, desc: r.content, url: '/duyurular' }));

  add('Ekip',
    all('SELECT name, role, department, bio FROM members WHERE is_active = 1 AND (name LIKE ? OR role LIKE ? OR department LIKE ? OR bio LIKE ?) LIMIT 5', like, like, like, like),
    (r) => ({ type: 'Ekip', title: r.name, meta: r.role || r.department, desc: r.bio || r.department, url: '/takim' }));

  add('İHA',
    all('SELECT name, slug, category, summary FROM vehicles WHERE name LIKE ? OR summary LIKE ? OR description LIKE ? LIMIT 5', like, like, like),
    (r) => ({ type: 'İHA', title: r.name, meta: r.category, desc: r.summary, url: `/arac#${r.slug || ''}` }));

  add('Faaliyet',
    all('SELECT title, description FROM activity_areas WHERE title LIKE ? OR description LIKE ? LIMIT 5', like, like),
    (r) => ({ type: 'Faaliyet', title: r.title, meta: 'Faaliyet Alanı', desc: r.description, url: '/faaliyetler' }));

  add('Kariyer',
    all('SELECT title, department, description FROM careers WHERE title LIKE ? OR description LIKE ? LIMIT 5', like, like),
    (r) => ({ type: 'Kariyer', title: r.title, meta: r.department, desc: r.description, url: '/kariyer' }));

  add('Sponsor',
    all('SELECT name, tier, description FROM sponsors WHERE name LIKE ? OR description LIKE ? LIMIT 4', like, like),
    (r) => ({ type: 'Sponsor', title: r.name, meta: `Sponsor · ${r.tier}`, desc: r.description, url: '/sponsorlar' }));

  res.json({ query: q, results });
});

// ------------------------------------------------------------
// Iletisim formu -> messages
// ------------------------------------------------------------
router.post('/messages', (req, res) => {
  const body = req.body || {};
  const missing = missingFields(body, ['name', 'email', 'message']);
  if (missing.length) {
    return res.status(400).json({ error: `Zorunlu alanlar eksik: ${missing.join(', ')}` });
  }
  if (!isValidEmail(body.email)) {
    return res.status(400).json({ error: 'Gecerli bir e-posta adresi girin.' });
  }
  const info = run(
    'INSERT INTO messages (name, email, phone, subject, message) VALUES (?, ?, ?, ?, ?)',
    String(body.name).trim(),
    String(body.email).trim(),
    body.phone ? String(body.phone).trim() : null,
    body.subject ? String(body.subject).trim() : null,
    String(body.message).trim()
  );
  res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
});

// ------------------------------------------------------------
// Kariyer basvurusu -> career_applications
// ------------------------------------------------------------
router.post('/career-applications', optionalUser, (req, res) => {
  const body = req.body || {};
  const missing = missingFields(body, ['full_name', 'email']);
  if (missing.length) {
    return res.status(400).json({ error: `Zorunlu alanlar eksik: ${missing.join(', ')}` });
  }
  if (!isValidEmail(body.email)) {
    return res.status(400).json({ error: 'Gecerli bir e-posta adresi girin.' });
  }
  const careerId = Number(body.career_id);
  const info = run(
    `INSERT INTO career_applications
       (career_id, user_id, full_name, email, phone, university, department, message, cv_url)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    Number.isFinite(careerId) && careerId > 0 ? careerId : null,
    req.user ? req.user.userId : null,
    String(body.full_name).trim(),
    String(body.email).trim(),
    body.phone ? String(body.phone).trim() : null,
    body.university ? String(body.university).trim() : null,
    body.department ? String(body.department).trim() : null,
    body.message ? String(body.message).trim() : null,
    body.cv_url ? String(body.cv_url).trim() : null
  );
  res.status(201).json({ ok: true, id: Number(info.lastInsertRowid) });
});

// ------------------------------------------------------------
// Bulten aboneligi -> subscribers
// ------------------------------------------------------------
router.post('/subscribe', (req, res) => {
  const body = req.body || {};
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
  }
  const name = body.name ? String(body.name).trim().slice(0, 80) : null;
  run(
    `INSERT INTO subscribers (email, name) VALUES (?, ?)
     ON CONFLICT(email) DO UPDATE SET is_active = 1, name = COALESCE(excluded.name, subscribers.name)`,
    email, name
  );
  res.status(201).json({ ok: true, email });
});

// ------------------------------------------------------------
// Yorumlar & begeniler (haber / duyuru)
// ------------------------------------------------------------
/** target_type + target_id parametrelerini dogrular. */
function parseTarget(query) {
  const type = String(query.type || '');
  const id = Number(query.id);
  if (!TARGET_TYPES.includes(type) || !Number.isInteger(id) || id <= 0) return null;
  return { type, id };
}

/** Yorum listesi + begeni ozeti (herkese acik). */
router.get('/interactions', optionalUser, (req, res) => {
  const target = parseTarget(req.query);
  if (!target) return res.status(400).json({ error: 'Geçersiz hedef (type/id).' });
  const uid = req.user ? req.user.userId : -1;
  const likes = get(
    'SELECT COUNT(*) AS c FROM reactions WHERE target_type = ? AND target_id = ?',
    target.type, target.id
  ).c;
  const liked = !!get(
    'SELECT 1 FROM reactions WHERE target_type = ? AND target_id = ? AND user_id = ?',
    target.type, target.id, uid
  );
  const comments = all(
    `SELECT id, user_id, name, content, is_approved, created_at FROM comments
      WHERE target_type = ? AND target_id = ? AND (is_approved = 1 OR user_id = ?)
      ORDER BY created_at ASC, id ASC`,
    target.type, target.id, uid
  );
  res.json({ likes, liked, comments });
});

/** Yorum ekle (giris zorunlu). Yorumlar once moderasyon onayindan gecer. */
router.post('/comments', userAuthMiddleware, (req, res) => {
  const body = req.body || {};
  const target = parseTarget({ type: body.target_type, id: body.target_id });
  if (!target) return res.status(400).json({ error: 'Geçersiz hedef (type/id).' });
  const content = String(body.content || '').trim();
  if (content.length < 2) return res.status(400).json({ error: 'Yorum en az 2 karakter olmalı.' });
  if (content.length > 1000) return res.status(400).json({ error: 'Yorum en fazla 1000 karakter olabilir.' });

  const user = get('SELECT first_name, last_name, username FROM users WHERE id = ?', req.user.userId);
  const name = user ? `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username : 'Üye';
  const info = run(
    'INSERT INTO comments (target_type, target_id, user_id, name, content, is_approved) VALUES (?, ?, ?, ?, ?, 0)',
    target.type, target.id, req.user.userId, name, content
  );
  res.status(201).json({
    ...get(
      'SELECT id, user_id, name, content, is_approved, created_at FROM comments WHERE id = ?',
      Number(info.lastInsertRowid)
    ),
    pending: true,
  });
});

/** Kendi yorumunu sil (giris zorunlu). */
router.delete('/comments/:id', userAuthMiddleware, (req, res) => {
  const id = Number(req.params.id);
  const row = get('SELECT * FROM comments WHERE id = ?', id);
  if (!row) return res.status(404).json({ error: 'Yorum bulunamadi.' });
  if (row.user_id !== req.user.userId) {
    return res.status(403).json({ error: 'Yalnızca kendi yorumunuzu silebilirsiniz.' });
  }
  run('DELETE FROM comments WHERE id = ?', id);
  res.json({ ok: true });
});

/** Begeniyi ac/kapat (giris zorunlu). */
router.post('/like', userAuthMiddleware, (req, res) => {
  const body = req.body || {};
  const target = parseTarget({ type: body.target_type, id: body.target_id });
  if (!target) return res.status(400).json({ error: 'Geçersiz hedef (type/id).' });
  const existing = get(
    'SELECT id FROM reactions WHERE target_type = ? AND target_id = ? AND user_id = ?',
    target.type, target.id, req.user.userId
  );
  if (existing) {
    run('DELETE FROM reactions WHERE id = ?', existing.id);
  } else {
    run(
      'INSERT INTO reactions (target_type, target_id, user_id) VALUES (?, ?, ?)',
      target.type, target.id, req.user.userId
    );
  }
  const likes = get(
    'SELECT COUNT(*) AS c FROM reactions WHERE target_type = ? AND target_id = ?',
    target.type, target.id
  ).c;
  res.json({ ok: true, liked: !existing, likes });
});

// ------------------------------------------------------------
// Favoriler / kaydedilenler (giris zorunlu)
// ------------------------------------------------------------
router.get('/me/favorites', userAuthMiddleware, (req, res) => {
  res.json(all(
    `SELECT f.id, f.target_type, f.target_id, f.created_at,
            CASE f.target_type
              WHEN 'news' THEN (SELECT title FROM news WHERE id = f.target_id)
              WHEN 'announcement' THEN (SELECT title FROM announcements WHERE id = f.target_id)
            END AS title,
            CASE f.target_type WHEN 'news' THEN (SELECT slug FROM news WHERE id = f.target_id) END AS slug
       FROM favorites f
      WHERE f.user_id = ?
      ORDER BY f.created_at DESC, f.id DESC`,
    req.user.userId
  ));
});

/** Favoriye ekle / cikar (toggle). */
router.post('/favorites', userAuthMiddleware, (req, res) => {
  const body = req.body || {};
  const target = parseTarget({ type: body.target_type, id: body.target_id });
  if (!target) return res.status(400).json({ error: 'Geçersiz hedef (type/id).' });
  const existing = get(
    'SELECT id FROM favorites WHERE user_id = ? AND target_type = ? AND target_id = ?',
    req.user.userId, target.type, target.id
  );
  if (existing) {
    run('DELETE FROM favorites WHERE id = ?', existing.id);
  } else {
    run(
      'INSERT INTO favorites (user_id, target_type, target_id) VALUES (?, ?, ?)',
      req.user.userId, target.type, target.id
    );
  }
  const total = get('SELECT COUNT(*) AS c FROM favorites WHERE user_id = ?', req.user.userId).c;
  res.json({ ok: true, saved: !existing, total });
});

// ------------------------------------------------------------
// Uye kayit / giris sistemi -> users
// ------------------------------------------------------------
// Kayit adimi 1: bilgileri dogrula, e-posta adresine 6 haneli kod gonder.
// Kullanici kaydi, kod dogrulanana kadar email_verifications tablosunda bekler.
router.post('/register', async (req, res) => {
  const body = req.body || {};
  const missing = missingFields(body, ['first_name', 'last_name', 'username', 'email', 'password', 'age', 'department']);
  if (missing.length) {
    return res.status(400).json({ error: `Zorunlu alanlar eksik: ${missing.join(', ')}` });
  }

  const username = String(body.username).trim();
  if (!/^[A-Za-z0-9._]{3,24}$/.test(username)) {
    return res.status(400).json({ error: 'Kullanıcı adı 3-24 karakter olmalı; harf, rakam, nokta veya alt çizgi kullanın.' });
  }
  const email = normalizeEmail(body.email);
  if (!isValidEmail(email)) {
    return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
  }
  if (String(body.password).length < 6) {
    return res.status(400).json({ error: 'Şifre en az 6 karakter olmalı.' });
  }
  const age = Number(body.age);
  if (!Number.isInteger(age) || age < 10 || age > 99) {
    return res.status(400).json({ error: 'Geçerli bir yaş girin (10-99).' });
  }
  const department = String(body.department).trim();
  if (!DEPARTMENTS.includes(department)) {
    return res.status(400).json({ error: 'Geçerli bir birim seçin.' });
  }
  if (get('SELECT id FROM users WHERE username = ?', username)) {
    return res.status(409).json({ error: 'Bu kullanıcı adı zaten kayıtlı.' });
  }
  if (get('SELECT id FROM users WHERE email = ?', email)) {
    return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı.' });
  }

  // Onaylandiginda olusturulacak kullanici bilgilerini beklet.
  const payload = JSON.stringify({
    first_name: String(body.first_name).trim(),
    last_name: String(body.last_name).trim(),
    username,
    email,
    password_hash: hashPassword(body.password),
    age,
    department,
  });

  const code = generateCode();
  run(
    `INSERT INTO email_verifications (email, code_hash, payload, attempts, expires_at)
     VALUES (?, ?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET
       code_hash = excluded.code_hash,
       payload   = excluded.payload,
       attempts  = 0,
       expires_at = excluded.expires_at,
       created_at = datetime('now')`,
    email, hashPassword(code), payload, Date.now() + CODE_TTL_MS
  );

  try {
    const { sent } = await sendVerificationCode(email, code);
    res.status(200).json({ ok: true, pending: true, email, mailSent: sent, ...codeField(code) });
  } catch (err) {
    console.error('Dogrulama e-postasi gonderilemedi:', err.message);
    res.status(502).json({ error: 'Doğrulama e-postası gönderilemedi. Lütfen tekrar deneyin.' });
  }
});

// Kayit adimi 2: e-postaya gelen kodu dogrula ve kullaniciyi olustur.
router.post('/verify-email', (req, res) => {
  const { email, code } = req.body || {};
  const em = normalizeEmail(email);
  if (!em || !code) {
    return res.status(400).json({ error: 'E-posta ve doğrulama kodu gerekli.' });
  }

  const rec = get('SELECT * FROM email_verifications WHERE email = ?', em);
  if (!rec) {
    return res.status(400).json({ error: 'Bu e-posta için bekleyen bir doğrulama bulunamadı.' });
  }
  if (rec.expires_at < Date.now()) {
    run('DELETE FROM email_verifications WHERE email = ?', em);
    return res.status(400).json({ error: 'Kodun süresi doldu. Lütfen yeni kod isteyin.' });
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    run('DELETE FROM email_verifications WHERE email = ?', em);
    return res.status(429).json({ error: 'Çok fazla hatalı deneme yapıldı. Lütfen yeni kod isteyin.' });
  }
  if (!verifyPassword(String(code).trim(), rec.code_hash)) {
    run('UPDATE email_verifications SET attempts = attempts + 1 WHERE email = ?', em);
    const left = Math.max(MAX_ATTEMPTS - (rec.attempts + 1), 0);
    return res.status(400).json({ error: `Kod hatalı. Kalan deneme hakkı: ${left}.` });
  }

  const data = JSON.parse(rec.payload);
  if (get('SELECT id FROM users WHERE username = ?', data.username)) {
    run('DELETE FROM email_verifications WHERE email = ?', em);
    return res.status(409).json({ error: 'Bu kullanıcı adı zaten kayıtlı.' });
  }
  if (get('SELECT id FROM users WHERE email = ?', em)) {
    run('DELETE FROM email_verifications WHERE email = ?', em);
    return res.status(409).json({ error: 'Bu e-posta adresi zaten kayıtlı.' });
  }

  const info = run(
    `INSERT INTO users (first_name, last_name, username, email, password_hash, age, department)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
    data.first_name, data.last_name, data.username, data.email,
    data.password_hash, data.age, data.department
  );
  run('DELETE FROM email_verifications WHERE email = ?', em);

  const user = get('SELECT * FROM users WHERE id = ?', Number(info.lastInsertRowid));
  const { token, expiresAt } = createUserSession(user);
  res.status(201).json({ ok: true, token, expiresAt, user: publicUser(user) });
});

// Bekleyen kayit icin yeni kod gonder.
router.post('/resend-code', async (req, res) => {
  const em = normalizeEmail((req.body || {}).email);
  if (!isValidEmail(em)) {
    return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
  }
  const rec = get('SELECT * FROM email_verifications WHERE email = ?', em);
  if (!rec) {
    return res.status(400).json({ error: 'Bu e-posta için bekleyen bir doğrulama bulunamadı.' });
  }

  const code = generateCode();
  run(
    'UPDATE email_verifications SET code_hash = ?, attempts = 0, expires_at = ? WHERE email = ?',
    hashPassword(code), Date.now() + CODE_TTL_MS, em
  );

  try {
    const { sent } = await sendVerificationCode(em, code);
    res.json({ ok: true, pending: true, email: em, mailSent: sent, ...codeField(code) });
  } catch (err) {
    console.error('Dogrulama e-postasi gonderilemedi:', err.message);
    res.status(502).json({ error: 'Doğrulama e-postası gönderilemedi. Lütfen tekrar deneyin.' });
  }
});

// ------------------------------------------------------------
// Sifre sifirlama (e-posta kodu ile)
// ------------------------------------------------------------
router.post('/forgot-password', async (req, res) => {
  const em = normalizeEmail((req.body || {}).email);
  if (!isValidEmail(em)) {
    return res.status(400).json({ error: 'Geçerli bir e-posta adresi girin.' });
  }
  const user = get('SELECT id FROM users WHERE email = ?', em);
  // Kayitli olmayan e-posta icin de ayni yanit verilir (hesap kesfi engellenir).
  if (!user) {
    return res.json({ ok: true, email: em, mailSent: mailEnabled });
  }

  const code = generateCode();
  run(
    `INSERT INTO password_resets (email, code_hash, attempts, expires_at)
     VALUES (?, ?, 0, ?)
     ON CONFLICT(email) DO UPDATE SET
       code_hash  = excluded.code_hash,
       attempts   = 0,
       expires_at = excluded.expires_at,
       created_at = datetime('now')`,
    em, hashPassword(code), Date.now() + CODE_TTL_MS
  );

  try {
    const { sent } = await sendPasswordReset(em, code);
    res.json({ ok: true, email: em, mailSent: sent, ...codeField(code) });
  } catch (err) {
    console.error('Sifre sifirlama e-postasi gonderilemedi:', err.message);
    res.status(502).json({ error: 'Şifre sıfırlama e-postası gönderilemedi. Lütfen tekrar deneyin.' });
  }
});

router.post('/reset-password', (req, res) => {
  const { email, code, password } = req.body || {};
  const em = normalizeEmail(email);
  if (!isValidEmail(em) || !code) {
    return res.status(400).json({ error: 'E-posta ve doğrulama kodu gerekli.' });
  }
  if (String(password || '').length < 6) {
    return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalı.' });
  }

  const rec = get('SELECT * FROM password_resets WHERE email = ?', em);
  if (!rec) {
    return res.status(400).json({ error: 'Bu e-posta için bekleyen bir sıfırlama talebi bulunamadı.' });
  }
  if (rec.expires_at < Date.now()) {
    run('DELETE FROM password_resets WHERE email = ?', em);
    return res.status(400).json({ error: 'Kodun süresi doldu. Lütfen yeni kod isteyin.' });
  }
  if (rec.attempts >= MAX_ATTEMPTS) {
    run('DELETE FROM password_resets WHERE email = ?', em);
    return res.status(429).json({ error: 'Çok fazla hatalı deneme yapıldı. Lütfen yeni kod isteyin.' });
  }
  if (!verifyPassword(String(code).trim(), rec.code_hash)) {
    run('UPDATE password_resets SET attempts = attempts + 1 WHERE email = ?', em);
    const left = Math.max(MAX_ATTEMPTS - (rec.attempts + 1), 0);
    return res.status(400).json({ error: `Kod hatalı. Kalan deneme hakkı: ${left}.` });
  }

  const user = get('SELECT id FROM users WHERE email = ?', em);
  if (!user) {
    run('DELETE FROM password_resets WHERE email = ?', em);
    return res.status(400).json({ error: 'Bu e-posta ile kayıtlı bir hesap bulunamadı.' });
  }
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(password), user.id);
  run('DELETE FROM password_resets WHERE email = ?', em);
  // Guvenlik: sifre degisince mevcut tum oturumlar gecersiz olur.
  run('DELETE FROM user_sessions WHERE user_id = ?', user.id);
  res.json({ ok: true });
});

router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanıcı adı ve şifre gerekli.' });
  }
  const user = get('SELECT * FROM users WHERE username = ?', String(username).trim());
  if (!user || !verifyPassword(password, user.password_hash)) {
    return res.status(401).json({ error: 'Kullanıcı adı veya şifre hatalı.' });
  }
  const { token, expiresAt } = createUserSession(user);
  res.json({ ok: true, token, expiresAt, user: publicUser(user) });
});

router.post('/logout', userAuthMiddleware, (req, res) => {
  destroyUserSession(req.token);
  res.json({ ok: true });
});

router.get('/me', userAuthMiddleware, (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.user.userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  res.json({ user: publicUser(user) });
});

// ------------------------------------------------------------
// Uye hesabi: profil duzenleme, sifre degistirme, basvurular, ekip vitrini
// ------------------------------------------------------------
router.put('/me', userAuthMiddleware, (req, res) => {
  const body = req.body || {};
  const user = get('SELECT * FROM users WHERE id = ?', req.user.userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  const first_name = body.first_name != null ? String(body.first_name).trim() : user.first_name;
  const last_name = body.last_name != null ? String(body.last_name).trim() : user.last_name;
  if (!first_name || !last_name) {
    return res.status(400).json({ error: 'Ad ve soyad zorunludur.' });
  }
  let age = user.age;
  if (body.age != null && body.age !== '') {
    age = Number(body.age);
    if (!Number.isInteger(age) || age < 10 || age > 99) {
      return res.status(400).json({ error: 'Geçerli bir yaş girin (10-99).' });
    }
  }
  let department = user.department;
  if (body.department != null && body.department !== '') {
    department = String(body.department).trim();
    if (!DEPARTMENTS.includes(department)) {
      return res.status(400).json({ error: 'Geçerli bir birim seçin.' });
    }
  }
  const notify_news = toFlag(body.notify_news, Number(user.notify_news) ? 1 : 0);
  const notify_announcements = toFlag(body.notify_announcements, Number(user.notify_announcements) ? 1 : 0);
  run(
    `UPDATE users SET first_name = ?, last_name = ?, age = ?, department = ?,
       notify_news = ?, notify_announcements = ? WHERE id = ?`,
    first_name, last_name, age, department, notify_news, notify_announcements, user.id
  );
  res.json({ ok: true, user: publicUser(get('SELECT * FROM users WHERE id = ?', user.id)) });
});

/** Profil fotografini kaydeder veya kaldirir (data URL). */
router.put('/me/avatar', userAuthMiddleware, (req, res) => {
  const parsed = parseAvatar((req.body || {}).avatar);
  if (!parsed.ok) {
    return res.status(parsed.tooLarge ? 413 : 400).json({
      error: parsed.tooLarge
        ? 'Fotoğraf çok büyük. Daha küçük bir görsel seçin.'
        : 'Geçersiz görsel verisi.',
    });
  }
  run('UPDATE users SET avatar = ? WHERE id = ?', parsed.avatar, req.user.userId);
  res.json({ ok: true, user: publicUser(get('SELECT * FROM users WHERE id = ?', req.user.userId)) });
});

router.put('/me/password', userAuthMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mevcut ve yeni şifre gerekli.' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Yeni şifre en az 6 karakter olmalı.' });
  }
  const user = get('SELECT * FROM users WHERE id = ?', req.user.userId);
  if (!user || !verifyPassword(currentPassword, user.password_hash)) {
    return res.status(401).json({ error: 'Mevcut şifre hatalı.' });
  }
  run('UPDATE users SET password_hash = ? WHERE id = ?', hashPassword(newPassword), user.id);
  res.json({ ok: true });
});

/** Kullanicinin kariyer basvurulari (user_id veya e-posta eslesmesi). */
router.get('/me/applications', userAuthMiddleware, (req, res) => {
  const user = get('SELECT * FROM users WHERE id = ?', req.user.userId);
  if (!user) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });
  res.json(all(
    `SELECT a.id, a.career_id, a.status, a.created_at,
            c.title AS career_title, c.department AS career_department
       FROM career_applications a
       LEFT JOIN careers c ON c.id = a.career_id
      WHERE a.user_id = ? OR (a.email = ? AND a.user_id IS NULL)
      ORDER BY a.created_at DESC, a.id DESC`,
    user.id, normalizeEmail(user.email)
  ));
});

module.exports = router;
