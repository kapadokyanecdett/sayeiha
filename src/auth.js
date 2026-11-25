'use strict';

/**
 * Sifre hash'leme ve basit oturum (session) yonetimi.
 * Harici bagimlilik yok - Node.js yerlesik crypto modulu kullanilir.
 */

const { scryptSync, randomBytes, timingSafeEqual, randomUUID, createHash } = require('node:crypto');
const { get, run } = require('./db');

// ------------------------------------------------------------
// Sifre hash / dogrulama (scrypt)
// ------------------------------------------------------------
function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(String(password), salt, 64).toString('hex');
  return `${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  if (typeof stored !== 'string' || !stored.includes(':')) return false;
  const [salt, hash] = stored.split(':');
  const candidate = scryptSync(String(password), salt, 64);
  const expected = Buffer.from(hash, 'hex');
  if (candidate.length !== expected.length) return false;
  return timingSafeEqual(candidate, expected);
}

// ------------------------------------------------------------
// Oturumlar (bellek ici). Sunucu yeniden baslayinca sifirlanir.
// ------------------------------------------------------------
const SESSION_TTL_MS = 1000 * 60 * 60 * 8; // 8 saat
const sessions = new Map();

function createSession(admin) {
  const token = randomUUID().replace(/-/g, '') + randomBytes(16).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  sessions.set(token, {
    adminId: admin.id,
    username: admin.username,
    fullName: admin.full_name || admin.username,
    expiresAt,
  });
  return { token, expiresAt };
}

function getSession(token) {
  if (!token) return null;
  const s = sessions.get(token);
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    sessions.delete(token);
    return null;
  }
  return s;
}

function destroySession(token) {
  if (token) sessions.delete(token);
}

/** Token'i eski oturumlardan temizle (periyodik). */
function cleanupSessions() {
  const now = Date.now();
  for (const [token, s] of sessions) {
    if (s.expiresAt < now) sessions.delete(token);
  }
  run('DELETE FROM user_sessions WHERE expires_at <= ?', now);
}
setInterval(cleanupSessions, 1000 * 60 * 30).unref();

// ------------------------------------------------------------
// Uye oturumlari DB'de hash'li saklanir; restart oturumu dusurmez.
// ------------------------------------------------------------
function hashSessionToken(token) {
  return createHash('sha256').update(token).digest('hex');
}

function createUserSession(user) {
  const token = randomUUID().replace(/-/g, '') + randomBytes(16).toString('hex');
  const expiresAt = Date.now() + SESSION_TTL_MS;
  run(
    'INSERT INTO user_sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)',
    hashSessionToken(token), user.id, expiresAt
  );
  return { token, expiresAt };
}

function getUserSession(token) {
  if (!token) return null;
  const s = get(
    `SELECT s.user_id AS userId, u.username,
            u.first_name AS firstName, u.last_name AS lastName,
            u.department, s.expires_at AS expiresAt
       FROM user_sessions s
       JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ?`,
    hashSessionToken(token)
  );
  if (!s) return null;
  if (s.expiresAt < Date.now()) {
    destroyUserSession(token);
    return null;
  }
  return s;
}

function destroyUserSession(token) {
  if (token) run('DELETE FROM user_sessions WHERE token_hash = ?', hashSessionToken(token));
}

/** Express middleware: uye oturumu dogrular (Authorization: Bearer <token>). */
function userAuthMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const session = getUserSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Yetkisiz. Lutfen giris yapin.' });
  }
  req.user = session;
  req.token = token;
  next();
}

// ------------------------------------------------------------
// Express middleware: Authorization: Bearer <token>
// ------------------------------------------------------------
function authMiddleware(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : null;
  const session = getSession(token);
  if (!session) {
    return res.status(401).json({ error: 'Yetkisiz. Lutfen giris yapin.' });
  }
  req.admin = session;
  req.token = token;
  next();
}

module.exports = {
  hashPassword,
  verifyPassword,
  createSession,
  getSession,
  destroySession,
  authMiddleware,
  createUserSession,
  getUserSession,
  destroyUserSession,
  userAuthMiddleware,
};
