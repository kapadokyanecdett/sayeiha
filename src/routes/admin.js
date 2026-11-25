'use strict';

/**
 * Yonetim paneli API'si.
 * Kimlik dogrulama + icerik CRUD (kaynak tanimlari uzerinden genel islem).
 */

const express = require('express');
const { all, get, run, db, count } = require('../db');
const {
  hashPassword,
  verifyPassword,
  createSession,
  destroySession,
  authMiddleware,
} = require('../auth');
const { uniqueSlug, normalizeValue, missingFields } = require('../utils');
const { sendMail, newsletterHtml, mailEnabled } = require('../mailer');

const router = express.Router();

// ============================================================
// Kimlik dogrulama
// ============================================================
router.post('/login', (req, res) => {
  const { username, password } = req.body || {};
  if (!username || !password) {
    return res.status(400).json({ error: 'Kullanici adi ve sifre gerekli.' });
  }
  const admin = get('SELECT * FROM admins WHERE username = ?', String(username).trim());
  if (!admin || !verifyPassword(password, admin.password_hash)) {
    return res.status(401).json({ error: 'Kullanici adi veya sifre hatali.' });
  }
  const { token, expiresAt } = createSession(admin);
  req.admin = { adminId: admin.id, username: admin.username };
  logAudit(req, 'login', 'admins', admin.id, 'Yönetim paneline giriş yapıldı');
  res.json({
    token,
    expiresAt,
    user: { id: admin.id, username: admin.username, fullName: admin.full_name, role: admin.role },
  });
});

router.post('/logout', authMiddleware, (req, res) => {
  destroySession(req.token);
  res.json({ ok: true });
});

router.get('/me', authMiddleware, (req, res) => {
  res.json({ user: req.admin });
});

router.put('/password', authMiddleware, (req, res) => {
  const { currentPassword, newPassword } = req.body || {};
  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mevcut ve yeni sifre gerekli.' });
  }
  if (String(newPassword).length < 6) {
    return res.status(400).json({ error: 'Yeni sifre en az 6 karakter olmali.' });
  }
  const admin = get('SELECT * FROM admins WHERE id = ?', req.admin.adminId);
  if (!admin || !verifyPassword(currentPassword, admin.password_hash)) {
    return res.status(401).json({ error: 'Mevcut sifre hatali.' });
  }
  run('UPDATE admins SET password_hash = ? WHERE id = ?', hashPassword(newPassword), admin.id);
  logAudit(req, 'password', 'admins', admin.id, 'Yönetici şifresi değiştirildi');
  res.json({ ok: true });
});

// Bu noktadan sonraki tum rotalar korunmali
router.use(authMiddleware);

// ============================================================
// Denetim kaydi (audit log)
// ============================================================
/** Yonetici islemlerini audit_log tablosuna kaydeder. Hata olursa islemi engellemez. */
function logAudit(req, action, entity, entityId, details) {
  try {
    const a = req.admin || {};
    run(
      'INSERT INTO audit_log (admin_id, username, action, entity, entity_id, details) VALUES (?, ?, ?, ?, ?, ?)',
      a.adminId != null ? a.adminId : null,
      a.username || null,
      action,
      entity,
      entityId != null ? String(entityId) : null,
      details ? String(details).slice(0, 500) : null
    );
  } catch (e) { /* loglama hatasi islemi engellemesin */ }
}

/** Bir kaydin adini/etiketini bulmaya calisir (log detayi icin). */
function describeRow(table, row) {
  if (!row) return '';
  for (const key of ['title', 'name', 'full_name', 'username', 'key', 'label', 'subject']) {
    if (row[key]) return String(row[key]).slice(0, 120);
  }
  return '';
}

// ============================================================
// Yardimcilar
// ============================================================
function replaceSpecs(vehicleId, specs) {
  run('DELETE FROM vehicle_specs WHERE vehicle_id = ?', vehicleId);
  if (!Array.isArray(specs)) return;
  const stmt = db.prepare(
    'INSERT INTO vehicle_specs (vehicle_id, label, value, unit, sort_order) VALUES (?, ?, ?, ?, ?)'
  );
  specs.forEach((s, i) => {
    if (!s || s.label === undefined || s.label === null || String(s.label).trim() === '') return;
    stmt.run(
      vehicleId,
      String(s.label).trim(),
      String(s.value ?? '').trim(),
      s.unit != null && String(s.unit).trim() !== '' ? String(s.unit).trim() : null,
      Number(s.sort_order) || i + 1
    );
  });
}

const RESOURCES = {
  members: {
    table: 'members',
    fields: ['name', 'role', 'department', 'bio', 'photo', 'email', 'linkedin', 'github', 'is_active', 'sort_order'],
    required: ['name'],
    order: 'sort_order ASC, id ASC',
  },
  vehicles: {
    table: 'vehicles',
    fields: ['name', 'category', 'summary', 'description', 'image', 'status', 'is_featured', 'sort_order'],
    required: ['name'],
    slugFrom: 'name',
    order: 'sort_order ASC, id ASC',
    decorate: (rows) =>
      rows.map((v) => ({
        ...v,
        specs: all('SELECT * FROM vehicle_specs WHERE vehicle_id = ? ORDER BY sort_order ASC, id ASC', v.id),
      })),
    afterWrite: (id, body) => {
      if (body.specs !== undefined) replaceSpecs(id, body.specs);
    },
  },
  news: {
    table: 'news',
    fields: ['title', 'category', 'summary', 'content', 'image', 'author', 'tags', 'is_published', 'published_at'],
    required: ['title'],
    slugFrom: 'title',
    order: 'published_at DESC, id DESC',
  },
  announcements: {
    table: 'announcements',
    fields: ['title', 'content', 'type', 'is_pinned', 'is_published', 'published_at'],
    required: ['title'],
    order: 'is_pinned DESC, published_at DESC, id DESC',
  },
  'activity-areas': {
    table: 'activity_areas',
    fields: ['title', 'description', 'icon', 'image', 'sort_order'],
    required: ['title'],
    order: 'sort_order ASC, id ASC',
  },
  careers: {
    table: 'careers',
    fields: ['title', 'department', 'employment_type', 'location', 'description', 'requirements', 'is_open'],
    required: ['title'],
    order: 'is_open DESC, id DESC',
  },
  sponsors: {
    table: 'sponsors',
    fields: ['name', 'logo', 'website', 'tier', 'description', 'sort_order'],
    required: ['name'],
    order: 'sort_order ASC, id ASC',
  },
};

function buildSlug(cfg, body, excludeId) {
  const provided = body.slug != null && String(body.slug).trim() !== '';
  const source = provided ? body.slug : body[cfg.slugFrom] || 'kayit';
  return uniqueSlug(cfg.table, source, excludeId);
}

// ============================================================
// Genel istatistikler
// ============================================================
router.get('/stats', (req, res) => {
  res.json({
    members: count('members'),
    vehicles: count('vehicles'),
    news: count('news'),
    announcements: count('announcements'),
    activityAreas: count('activity_areas'),
    careers: count('careers'),
    sponsors: count('sponsors'),
    messages: count('messages'),
    unreadMessages: get('SELECT COUNT(*) AS c FROM messages WHERE is_read = 0').c,
    applications: count('career_applications'),
    newApplications: get("SELECT COUNT(*) AS c FROM career_applications WHERE status = 'Yeni'").c,
    users: count('users'),
    comments: count('comments'),
    pendingComments: get('SELECT COUNT(*) AS c FROM comments WHERE is_approved = 0').c,
    audit: count('audit_log'),
  });
});

// ============================================================
// Gosterge paneli (dashboard) verileri
// ============================================================
router.get('/dashboard', (req, res) => {
  // Birim dagilimi (takim uyeleri ve kayitli uyeler ayri)
  const byDepartment = (table) =>
    all(
      `SELECT COALESCE(NULLIF(TRIM(department), ''), 'Belirtilmemiş') AS label, COUNT(*) AS value
         FROM ${table} GROUP BY label ORDER BY value DESC, label ASC`
    );

  // Son 6 ayin aylik sayilari (mesaj + basvuru)
  const monthly = (table) =>
    all(
      `SELECT strftime('%Y-%m', created_at) AS ym, COUNT(*) AS value
         FROM ${table}
        WHERE created_at >= datetime('now', '-5 months', 'start of month')
        GROUP BY ym ORDER BY ym ASC`
    );

  const statusBreakdown = all(
    `SELECT status AS label, COUNT(*) AS value
       FROM career_applications GROUP BY status ORDER BY value DESC`
  );

  res.json({
    memberDepartments: byDepartment('members'),
    userDepartments: byDepartment('users'),
    monthlyMessages: monthly('messages'),
    monthlyApplications: monthly('career_applications'),
    statusBreakdown,
    recentMessages: all('SELECT id, name, email, subject, is_read, created_at FROM messages ORDER BY created_at DESC LIMIT 5'),
    recentApplications: all(
      `SELECT a.id, a.full_name, a.email, a.status, a.created_at, c.title AS career_title
         FROM career_applications a LEFT JOIN careers c ON c.id = a.career_id
        ORDER BY a.created_at DESC LIMIT 5`
    ),
  });
});

// ============================================================
// Denetim kaydi listesi
// ============================================================
router.get('/audit-log', (req, res) => {
  const limit = Math.min(Math.max(Number(req.query.limit) || 200, 1), 1000);
  res.json(all('SELECT * FROM audit_log ORDER BY created_at DESC, id DESC LIMIT ?', limit));
});

// ============================================================
// Bulten (newsletter)
// ============================================================
router.get('/newsletter', (req, res) => {
  res.json({
    total: count('subscribers'),
    active: get('SELECT COUNT(*) AS c FROM subscribers WHERE is_active = 1').c,
    mailEnabled,
    recent: all('SELECT id, email, name, is_active, created_at FROM subscribers ORDER BY created_at DESC LIMIT 10'),
  });
});

router.post('/newsletter', async (req, res) => {
  const body = req.body || {};
  const subject = String(body.subject || '').trim();
  const message = String(body.message || '').trim();
  if (!subject || !message) {
    return res.status(400).json({ error: 'Konu ve mesaj zorunludur.' });
  }
  const recipients = all('SELECT email FROM subscribers WHERE is_active = 1');
  if (!recipients.length) {
    return res.status(400).json({ error: 'Aktif abone bulunmuyor.' });
  }

  const html = newsletterHtml(subject, message);
  let sent = 0; let failed = 0;
  for (const r of recipients) {
    try {
      await sendMail(r.email, subject, message, html);
      sent += 1;
    } catch (e) {
      failed += 1;
    }
  }
  logAudit(req, 'newsletter', 'subscribers', null, `Bülten gönderildi: ${sent} başarılı, ${failed} hatalı`);
  res.json({ ok: true, total: recipients.length, sent, failed, test: !mailEnabled });
});


// ============================================================
// Site ayarlari (anahtar-deger)
// ============================================================
router.get('/settings', (req, res) => {
  const settings = {};
  for (const row of all('SELECT key, value FROM settings')) settings[row.key] = row.value;
  res.json(settings);
});

router.put('/settings', (req, res) => {
  const body = req.body || {};
  const stmt = db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value'
  );
  for (const [key, value] of Object.entries(body)) {
    stmt.run(String(key), value === null || value === undefined ? null : String(value));
  }
  logAudit(req, 'settings', 'settings', null, `${Object.keys(body).length} ayar güncellendi`);
  const settings = {};
  for (const row of all('SELECT key, value FROM settings')) settings[row.key] = row.value;
  res.json(settings);
});

// ============================================================
// Iletisim mesajlari
// ============================================================
router.get('/messages', (req, res) => {
  res.json(all('SELECT * FROM messages ORDER BY is_read ASC, created_at DESC'));
});

router.patch('/messages/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = get('SELECT * FROM messages WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Mesaj bulunamadi.' });
  if (req.body && req.body.is_read !== undefined) {
    run('UPDATE messages SET is_read = ? WHERE id = ?', normalizeValue(req.body.is_read), id);
    logAudit(req, 'update', 'messages', id, 'Mesaj okundu olarak işaretlendi');
  }
  res.json(get('SELECT * FROM messages WHERE id = ?', id));
});

router.delete('/messages/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = run('DELETE FROM messages WHERE id = ?', id);
  if (!info.changes) return res.status(404).json({ error: 'Mesaj bulunamadi.' });
  logAudit(req, 'delete', 'messages', id, 'Mesaj silindi');
  res.json({ ok: true });
});

// ============================================================
// Kariyer basvurulari
// ============================================================
// Durum kodlari bilincli olarak ASCII tutulur (veri butunlugu); Turkce etiketler arayuzde gosterilir.
const APPLICATION_STATUSES = ['Yeni', 'Inceleniyor', 'Degerlendirildi', 'Reddedildi'];

router.get('/applications', (req, res) => {
  res.json(
    all(
      `SELECT a.*, c.title AS career_title
         FROM career_applications a
         LEFT JOIN careers c ON c.id = a.career_id
        ORDER BY a.created_at DESC`
    )
  );
});

router.patch('/applications/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = get('SELECT * FROM career_applications WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Basvuru bulunamadi.' });
  const { status } = req.body || {};
  if (status !== undefined) {
    if (!APPLICATION_STATUSES.includes(status)) {
      return res.status(400).json({ error: `Gecersiz durum. Gecerli degerler: ${APPLICATION_STATUSES.join(', ')}` });
    }
    run('UPDATE career_applications SET status = ? WHERE id = ?', status, id);
    logAudit(req, 'update', 'career_applications', id, `Başvuru durumu: ${status}`);
  }
  res.json(get('SELECT * FROM career_applications WHERE id = ?', id));
});

router.delete('/applications/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = run('DELETE FROM career_applications WHERE id = ?', id);
  if (!info.changes) return res.status(404).json({ error: 'Basvuru bulunamadi.' });
  logAudit(req, 'delete', 'career_applications', id, 'Başvuru silindi');
  res.json({ ok: true });
});

// ============================================================
// Yorum moderasyonu
// ============================================================
// status: pending (varsayilan) | approved | all
router.get('/comments', (req, res) => {
  const status = String(req.query.status || 'pending');
  const where = status === 'approved' ? 'WHERE c.is_approved = 1'
    : status === 'all' ? ''
    : 'WHERE c.is_approved = 0';
  res.json(all(
    `SELECT c.*,
            CASE c.target_type
              WHEN 'news' THEN (SELECT title FROM news WHERE id = c.target_id)
              WHEN 'announcement' THEN (SELECT title FROM announcements WHERE id = c.target_id)
            END AS target_title
       FROM comments c ${where}
      ORDER BY c.created_at DESC, c.id DESC
      LIMIT 300`
  ));
});

/** Yorumu onayla (is_approved=1) veya reddet (is_approved=0). */
router.patch('/comments/:id', (req, res) => {
  const id = Number(req.params.id);
  const existing = get('SELECT * FROM comments WHERE id = ?', id);
  if (!existing) return res.status(404).json({ error: 'Yorum bulunamadi.' });
  const raw = req.body ? req.body.is_approved : true;
  const approved = (raw === false || raw === 0 || raw === '0' || raw === 'false') ? 0 : 1;
  run('UPDATE comments SET is_approved = ? WHERE id = ?', approved, id);
  logAudit(req, 'update', 'comments', id, approved ? 'Yorum onaylandı' : 'Yorum reddedildi');
  res.json(get('SELECT * FROM comments WHERE id = ?', id));
});

router.delete('/comments/:id', (req, res) => {
  const id = Number(req.params.id);
  const info = run('DELETE FROM comments WHERE id = ?', id);
  if (!info.changes) return res.status(404).json({ error: 'Yorum bulunamadi.' });
  logAudit(req, 'delete', 'comments', id, 'Yorum silindi');
  res.json({ ok: true });
});

// ============================================================
// Veritabani gezgini (tum tablolar icin genel goruntule/ekle/duzenle/sil)
// ============================================================
const DB_TABLES = [
  'users', 'email_verifications', 'password_resets', 'messages', 'career_applications',
  'members', 'vehicles', 'vehicle_specs', 'news', 'announcements',
  'activity_areas', 'careers', 'sponsors', 'settings', 'admins', 'audit_log',
  'subscribers', 'comments', 'reactions', 'favorites',
];

// Bu kolonlar arayuzde maskelenir ve yazma islemlerinde yok sayilir.
const MASKED_COLUMNS = {
  admins: ['password_hash'],
  email_verifications: ['code_hash'],
  password_resets: ['code_hash'],
};

/** Tablonun kolon bilgilerini doner (yalnizca izinli tablolar). */
function tableColumns(table) {
  if (!DB_TABLES.includes(table)) return null;
  const cols = db.prepare(`PRAGMA table_info(${table})`).all();
  return cols.length ? cols : null;
}

/** Birincil anahtar kolonunu doner. */
function primaryKey(cols) {
  return cols.filter((c) => c.pk > 0).sort((a, b) => a.pk - b.pk)[0] || null;
}

router.get('/db/tables', (req, res) => {
  res.json(DB_TABLES.map((name) => ({ name, count: count(name) })));
});

/** Arama/siralama icin guvenli (parametreli) WHERE + ORDER ifadeleri uretir. */
function buildQuery(cols, masked, query) {
  const searchable = cols.filter((c) => !masked.includes(c.name));
  const q = String(query.q || '').trim();
  const params = [];
  let where = '';
  if (q) {
    where = 'WHERE ' + searchable.map((c) => `CAST(${c.name} AS TEXT) LIKE ?`).join(' OR ');
    searchable.forEach(() => params.push(`%${q}%`));
  }
  const pk = primaryKey(cols);
  const sortBy = query.sort && cols.some((c) => c.name === query.sort) ? query.sort : (pk ? pk.name : null);
  const dir = String(query.dir || '').toLowerCase() === 'asc' ? 'ASC' : 'DESC';
  const order = sortBy ? `ORDER BY ${sortBy} ${dir}` : '';
  return { where, params, order };
}

/** Satirlari CSV metnine cevirir (tum degerler tirnaklanir, tirnaklar kacirilir). */
function toCsv(columns, rows) {
  const head = columns.map((c) => c.name);
  const cell = (v) => '"' + (v === null || v === undefined ? '' : String(v)).replace(/"/g, '""') + '"';
  const lines = [head.map(cell).join(';')];
  for (const r of rows) lines.push(head.map((h) => cell(r[h])).join(';'));
  return '\ufeff' + lines.join('\r\n'); // BOM: Excel'de Turkce karakterler dogru gorunsun
}

router.get('/db/:table', (req, res) => {
  const cols = tableColumns(req.params.table);
  if (!cols) return res.status(404).json({ error: 'Tablo bulunamadi.' });
  const pk = primaryKey(cols);
  const masked = MASKED_COLUMNS[req.params.table] || [];
  const { where, params, order } = buildQuery(cols, masked, req.query);

  const limit = Math.min(Math.max(Number(req.query.limit) || 50, 1), 500);
  const offset = Math.max(Number(req.query.offset) || 0, 0);
  const total = get(`SELECT COUNT(*) AS c FROM ${req.params.table} ${where}`, ...params).c;

  const rows = all(
    `SELECT * FROM ${req.params.table} ${where} ${order} LIMIT ? OFFSET ?`,
    ...params, limit, offset
  ).map((r) => {
    for (const m of masked) if (r[m] != null && r[m] !== '') r[m] = '••••••';
    return r;
  });

  res.json({
    table: req.params.table,
    pk: pk ? pk.name : null,
    masked,
    columns: cols.map((c) => ({ name: c.name, type: c.type, notnull: !!c.notnull, pk: !!c.pk })),
    rows,
    total,
    limit,
    offset,
  });
});

// CSV disa aktarma (arama filtresini korur)
router.get('/db/:table/export', (req, res) => {
  const cols = tableColumns(req.params.table);
  if (!cols) return res.status(404).json({ error: 'Tablo bulunamadi.' });
  const masked = MASKED_COLUMNS[req.params.table] || [];
  const { where, params, order } = buildQuery(cols, [], req.query);
  const rows = all(`SELECT * FROM ${req.params.table} ${where} ${order}`, ...params);
  const visible = cols.filter((c) => !masked.includes(c.name));
  logAudit(req, 'export', req.params.table, null, `${rows.length} kayıt CSV olarak indirildi`);
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${req.params.table}.csv"`);
  res.send(toCsv(visible, rows));
});

router.post('/db/:table', (req, res) => {
  const cols = tableColumns(req.params.table);
  if (!cols) return res.status(404).json({ error: 'Tablo bulunamadi.' });
  const masked = MASKED_COLUMNS[req.params.table] || [];
  const valid = new Set(cols.map((c) => c.name));
  const pk = primaryKey(cols);
  const body = req.body || {};
  const use = [];
  const vals = [];
  for (const [k, v] of Object.entries(body)) {
    if (!valid.has(k) || masked.includes(k)) continue;
    use.push(k);
    vals.push(v === '' ? null : normalizeValue(v));
  }
  if (!use.length) return res.status(400).json({ error: 'Kaydedilecek alan bulunamadi.' });
  try {
    const info = run(
      `INSERT INTO ${req.params.table} (${use.join(', ')}) VALUES (${use.map(() => '?').join(', ')})`,
      ...vals
    );
    const key = pk && /INT/i.test(pk.type) ? Number(info.lastInsertRowid) : (pk ? body[pk.name] : null);
    logAudit(req, 'create', req.params.table, key, 'Kayıt eklendi');
    res.status(201).json({ ok: true, key });
  } catch (e) {
    res.status(400).json({ error: 'Kayıt eklenemedi: ' + e.message });
  }
});

router.put('/db/:table/:key', (req, res) => {
  const cols = tableColumns(req.params.table);
  if (!cols) return res.status(404).json({ error: 'Tablo bulunamadi.' });
  const pk = primaryKey(cols);
  if (!pk) return res.status(400).json({ error: 'Bu tablo düzenlenemez (birincil anahtar yok).' });
  const masked = MASKED_COLUMNS[req.params.table] || [];
  const valid = new Set(cols.map((c) => c.name));
  const body = req.body || {};
  const sets = [];
  const vals = [];
  for (const [k, v] of Object.entries(body)) {
    if (!valid.has(k) || masked.includes(k) || k === pk.name) continue;
    sets.push(`${k} = ?`);
    vals.push(v === '' ? null : normalizeValue(v));
  }
  if (!sets.length) return res.status(400).json({ error: 'Değişiklik yok.' });
  const keyVal = /INT/i.test(pk.type) ? Number(req.params.key) : req.params.key;
  try {
    const info = run(`UPDATE ${req.params.table} SET ${sets.join(', ')} WHERE ${pk.name} = ?`, ...vals, keyVal);
    if (!info.changes) return res.status(404).json({ error: 'Kayıt bulunamadi.' });
    logAudit(req, 'update', req.params.table, keyVal, 'Kayıt güncellendi');
    res.json({ ok: true });
  } catch (e) {
    res.status(400).json({ error: 'Güncellenemedi: ' + e.message });
  }
});

router.delete('/db/:table/:key', (req, res) => {
  const cols = tableColumns(req.params.table);
  if (!cols) return res.status(404).json({ error: 'Tablo bulunamadi.' });
  const pk = primaryKey(cols);
  if (!pk) return res.status(400).json({ error: 'Bu tablo silinemez (birincil anahtar yok).' });
  const keyVal = /INT/i.test(pk.type) ? Number(req.params.key) : req.params.key;
  const info = run(`DELETE FROM ${req.params.table} WHERE ${pk.name} = ?`, keyVal);
  if (!info.changes) return res.status(404).json({ error: 'Kayıt bulunamadi.' });
  logAudit(req, 'delete', req.params.table, keyVal, 'Kayıt silindi');
  res.json({ ok: true });
});

// ============================================================
// Genel CRUD:  /:resource
// ============================================================
router.get('/:resource', (req, res) => {
  const cfg = RESOURCES[req.params.resource];
  if (!cfg) return res.status(404).json({ error: 'Kaynak bulunamadi.' });
  let rows = all(`SELECT * FROM ${cfg.table} ORDER BY ${cfg.order}`);
  if (cfg.decorate) rows = cfg.decorate(rows);
  res.json(rows);
});

router.get('/:resource/:id', (req, res) => {
  const cfg = RESOURCES[req.params.resource];
  if (!cfg) return res.status(404).json({ error: 'Kaynak bulunamadi.' });
  const row = get(`SELECT * FROM ${cfg.table} WHERE id = ?`, Number(req.params.id));
  if (!row) return res.status(404).json({ error: 'Kayit bulunamadi.' });
  res.json(cfg.decorate ? cfg.decorate([row])[0] : row);
});

router.post('/:resource', (req, res) => {
  const cfg = RESOURCES[req.params.resource];
  if (!cfg) return res.status(404).json({ error: 'Kaynak bulunamadi.' });
  const body = req.body || {};
  const missing = missingFields(body, cfg.required || []);
  if (missing.length) {
    return res.status(400).json({ error: `Zorunlu alanlar eksik: ${missing.join(', ')}` });
  }

  const cols = [];
  const vals = [];
  for (const f of cfg.fields) {
    if (body[f] === undefined) continue;
    cols.push(f);
    vals.push(normalizeValue(body[f]));
  }
  if (cfg.slugFrom) {
    cols.push('slug');
    vals.push(buildSlug(cfg, body, -1));
  }

  const placeholders = cols.map(() => '?').join(', ');
  const info = run(`INSERT INTO ${cfg.table} (${cols.join(', ')}) VALUES (${placeholders})`, ...vals);
  const id = Number(info.lastInsertRowid);
  if (cfg.afterWrite) cfg.afterWrite(id, body);
  const row = get(`SELECT * FROM ${cfg.table} WHERE id = ?`, id);
  logAudit(req, 'create', cfg.table, id, describeRow(cfg.table, row));
  res.status(201).json(cfg.decorate ? cfg.decorate([row])[0] : row);
});

router.put('/:resource/:id', (req, res) => {
  const cfg = RESOURCES[req.params.resource];
  if (!cfg) return res.status(404).json({ error: 'Kaynak bulunamadi.' });
  const id = Number(req.params.id);
  const existing = get(`SELECT * FROM ${cfg.table} WHERE id = ?`, id);
  if (!existing) return res.status(404).json({ error: 'Kayit bulunamadi.' });

  const body = req.body || {};
  const sets = [];
  const vals = [];
  for (const f of cfg.fields) {
    if (body[f] === undefined) continue;
    sets.push(`${f} = ?`);
    vals.push(normalizeValue(body[f]));
  }
  if (cfg.slugFrom && (body[cfg.slugFrom] !== undefined || body.slug !== undefined)) {
    sets.push('slug = ?');
    vals.push(buildSlug(cfg, body, id));
  }
  if (sets.length) {
    vals.push(id);
    run(`UPDATE ${cfg.table} SET ${sets.join(', ')} WHERE id = ?`, ...vals);
  }
  if (cfg.afterWrite) cfg.afterWrite(id, body);
  const row = get(`SELECT * FROM ${cfg.table} WHERE id = ?`, id);
  logAudit(req, 'update', cfg.table, id, describeRow(cfg.table, row));
  res.json(cfg.decorate ? cfg.decorate([row])[0] : row);
});

router.delete('/:resource/:id', (req, res) => {
  const cfg = RESOURCES[req.params.resource];
  if (!cfg) return res.status(404).json({ error: 'Kaynak bulunamadi.' });
  const id = Number(req.params.id);
  const existing = get(`SELECT * FROM ${cfg.table} WHERE id = ?`, id);
  const info = run(`DELETE FROM ${cfg.table} WHERE id = ?`, id);
  if (!info.changes) return res.status(404).json({ error: 'Kayit bulunamadi.' });
  logAudit(req, 'delete', cfg.table, id, describeRow(cfg.table, existing));
  res.json({ ok: true });
});

module.exports = router;
