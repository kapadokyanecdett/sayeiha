-- ============================================================
--  SAYE - Teknofest Savasan IHA Takimi
--  SQLite veritabani semasi
--  Not: node:sqlite (Node.js yerlesik modulu) ile calisir.
-- ============================================================

PRAGMA foreign_keys = ON;

-- ------------------------------------------------------------
-- Site ayarlari (anahtar-deger)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS settings (
  key   TEXT PRIMARY KEY,
  value TEXT
);

-- ------------------------------------------------------------
-- Admin kullanicilari (yonetim paneli girisi)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS admins (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  username      TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT,
  role          TEXT NOT NULL DEFAULT 'admin',   -- admin | editor
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Takim uyeleri
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS members (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  role       TEXT,                                -- Takim Kaptani, Yazilim Lideri...
  department TEXT,                                -- Yazilim, Mekanik, Elektronik, Medya, Yonetim
  bio        TEXT,
  photo      TEXT,                                -- gorsel URL
  email      TEXT,
  linkedin   TEXT,
  github     TEXT,
  user_id    INTEGER,                             -- bagli uye hesabi (varsa)
  is_active  INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- IHA / araclar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicles (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  slug        TEXT UNIQUE,
  category    TEXT,                               -- Savasan IHA, Gozcu IHA...
  summary     TEXT,
  description TEXT,
  image       TEXT,
  status      TEXT NOT NULL DEFAULT 'Gelistirme', -- Aktif | Prototip | Gelistirme | Arsiv
  is_featured INTEGER NOT NULL DEFAULT 0,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Arac teknik ozellikleri (arac basina anahtar-deger)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS vehicle_specs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  vehicle_id INTEGER NOT NULL REFERENCES vehicles(id) ON DELETE CASCADE,
  label      TEXT NOT NULL,                       -- Kanat Acikligi
  value      TEXT NOT NULL,                       -- 140
  unit       TEXT,                                -- cm
  sort_order INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_vehicle_specs_vehicle ON vehicle_specs(vehicle_id);

-- ------------------------------------------------------------
-- Haberler / blog yazilari
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS news (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  slug         TEXT UNIQUE,
  category     TEXT NOT NULL DEFAULT 'Haber',     -- Haber | Blog | Basari | Etkinlik
  summary      TEXT,
  content      TEXT,
  image        TEXT,
  author       TEXT,
  tags         TEXT,                              -- virgulle ayrilmis
  is_published INTEGER NOT NULL DEFAULT 1,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_news_pub ON news(is_published, published_at DESC);

-- ------------------------------------------------------------
-- Duyurular
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS announcements (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  title        TEXT NOT NULL,
  content      TEXT,
  type         TEXT NOT NULL DEFAULT 'Genel',     -- Genel | Acil | Yarisma | Basvuru
  is_pinned    INTEGER NOT NULL DEFAULT 0,
  is_published INTEGER NOT NULL DEFAULT 1,
  published_at TEXT NOT NULL DEFAULT (datetime('now')),
  created_at   TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ann_pub ON announcements(is_published, is_pinned DESC, published_at DESC);

-- ------------------------------------------------------------
-- Faaliyet alanlari
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS activity_areas (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  title       TEXT NOT NULL,
  description TEXT,
  icon        TEXT,                               -- emoji veya ikon adi
  image       TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Kariyer pozisyonlari
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS careers (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  title           TEXT NOT NULL,
  department      TEXT,                           -- Yazilim, Mekanik, Elektronik...
  employment_type TEXT NOT NULL DEFAULT 'Gonullu',-- Tam Zamanli | Yari Zamanli | Stajyer | Gonullu
  location        TEXT,
  description     TEXT,
  requirements    TEXT,
  is_open         INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Kariyer basvurulari
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS career_applications (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  career_id   INTEGER REFERENCES careers(id) ON DELETE SET NULL,
  user_id     INTEGER,                            -- bagli uye hesabi (varsa)
  full_name   TEXT NOT NULL,
  email       TEXT NOT NULL,
  phone       TEXT,
  university  TEXT,
  department  TEXT,
  message     TEXT,
  cv_url      TEXT,
  status      TEXT NOT NULL DEFAULT 'Yeni',       -- Yeni | Inceleniyor | Degerlendirildi | Reddedildi
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_applications_career ON career_applications(career_id);

-- ------------------------------------------------------------
-- Sponsorlar
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sponsors (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  name        TEXT NOT NULL,
  logo        TEXT,
  website     TEXT,
  tier        TEXT NOT NULL DEFAULT 'Destekci',   -- Platin | Altin | Gumus | Bronz | Destekci
  description TEXT,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Uye hesaplari (kayit / giris sistemi)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  first_name    TEXT NOT NULL,
  last_name     TEXT NOT NULL,
  username      TEXT NOT NULL UNIQUE,
  email         TEXT UNIQUE,
  password_hash TEXT NOT NULL,
  age           INTEGER,
  department    TEXT,                             -- Yazilim, Mekanik, Elektronik...
  avatar        TEXT,                             -- profil fotografi (data URL, kucultulmus)
  notify_news         INTEGER NOT NULL DEFAULT 0, -- yeni haber e-posta bildirimi
  notify_announcements INTEGER NOT NULL DEFAULT 0,-- yeni duyuru e-posta bildirimi
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);

-- Uye oturumlari sunucu yeniden baslatmalarinda da sureleri dolana kadar gecerli kalir.
CREATE TABLE IF NOT EXISTS user_sessions (
  token_hash TEXT PRIMARY KEY,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  expires_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_user_sessions_expiry ON user_sessions(expires_at);

-- ------------------------------------------------------------
-- E-posta dogrulama kodlari (kayit oncesi bekleyen talepler)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS email_verifications (
  email       TEXT PRIMARY KEY,
  code_hash   TEXT NOT NULL,
  payload     TEXT NOT NULL,                      -- onaylaninca olusturulacak kullanici (JSON)
  attempts    INTEGER NOT NULL DEFAULT 0,
  expires_at  INTEGER NOT NULL,                   -- unix ms
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ------------------------------------------------------------
-- Iletisim mesajlari
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS messages (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  name       TEXT NOT NULL,
  email      TEXT NOT NULL,
  phone      TEXT,
  subject    TEXT,
  message    TEXT NOT NULL,
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_messages_read ON messages(is_read, created_at DESC);

-- ------------------------------------------------------------
-- Denetim kaydi (yonetim paneli islem gecmisi)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS audit_log (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  admin_id   INTEGER,
  username   TEXT,
  action     TEXT NOT NULL,     -- create | update | delete | login | settings | password
  entity     TEXT NOT NULL,     -- tablo / kaynak adi
  entity_id  TEXT,
  details    TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_audit_created ON audit_log(created_at DESC);

-- ------------------------------------------------------------
-- Bulten aboneleri (newsletter)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS subscribers (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  email      TEXT NOT NULL UNIQUE,
  name       TEXT,
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_subscribers_active ON subscribers(is_active);

-- ------------------------------------------------------------
-- Yorumlar (haber / duyuru)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS comments (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,     -- 'news' | 'announcement'
  target_id   INTEGER NOT NULL,
  user_id     INTEGER,
  name        TEXT NOT NULL,
  content     TEXT NOT NULL,
  is_approved INTEGER NOT NULL DEFAULT 0,  -- 0: moderasyon bekliyor, 1: onaylandi
  created_at  TEXT NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_comments_target ON comments(target_type, target_id, created_at DESC);

-- ------------------------------------------------------------
-- Begeniler (haber / duyuru)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS reactions (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  target_type TEXT NOT NULL,
  target_id   INTEGER NOT NULL,
  user_id     INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(target_type, target_id, user_id)
);
CREATE INDEX IF NOT EXISTS idx_reactions_target ON reactions(target_type, target_id);

-- ------------------------------------------------------------
-- Favoriler / kaydedilen icerikler (haber / duyuru)
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS favorites (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id     INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  target_type TEXT NOT NULL,     -- 'news' | 'announcement'
  target_id   INTEGER NOT NULL,
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(user_id, target_type, target_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user ON favorites(user_id, created_at DESC);

-- ------------------------------------------------------------
-- Sifre sifirlama kodlari
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS password_resets (
  email      TEXT PRIMARY KEY,
  code_hash  TEXT NOT NULL,
  attempts   INTEGER NOT NULL DEFAULT 0,
  expires_at INTEGER NOT NULL,                   -- unix ms
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);
