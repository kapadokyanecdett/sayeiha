/* ============================================================
   SAYE - Yonetim Paneli (SPA)
   ============================================================ */
(function () {
  'use strict';

  const API = '/api/admin';
  const TOKEN_KEY = 'solar_admin_token';

  let token = localStorage.getItem(TOKEN_KEY) || '';
  let user = null;
  let current = 'dashboard';
  let counts = { messages: 0, applications: 0, pendingComments: 0 };

  // ---------------------------------------------------------
  // Yardimcilar
  // ---------------------------------------------------------
  const el = (id) => document.getElementById(id);
  const qs = (s, r) => (r || document).querySelector(s);
  const qsa = (s, r) => Array.prototype.slice.call((r || document).querySelectorAll(s));

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function fmt(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? `${m[3]}.${m[2]}.${m[1]}` : '—';
  }
  function fmtDateTime(v) {
    const m = String(v || '').match(/^(\d{4})-(\d{2})-(\d{2})[ T](\d{2}:\d{2})/);
    return m ? `${m[3]}.${m[2]}.${m[1]} ${m[4]}` : '—';
  }
  const toLocal = (v) => { const m = String(v || '').match(/^(\d{4}-\d{2}-\d{2})[ T](\d{2}:\d{2})/); return m ? `${m[1]}T${m[2]}` : ''; };
  const fromLocal = (v) => (v ? String(v).replace('T', ' ') + ':00' : null);

  function toast(message, type) {
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'success');
    t.textContent = message;
    el('toast-wrap').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; }, 3400);
    setTimeout(() => t.remove(), 3900);
  }

  async function api(path, options) {
    const opts = Object.assign({}, options);
    opts.headers = Object.assign({}, opts.headers, {
      'Authorization': 'Bearer ' + token,
    });
    if (opts.body && !opts.headers['Content-Type']) opts.headers['Content-Type'] = 'application/json';
    const res = await fetch(API + path, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (res.status === 401) { logout(false); throw new Error((data && data.error) || 'Oturum süresi doldu.'); }
    if (!res.ok) throw new Error((data && data.error) || `İstek başarısız (${res.status})`);
    return data;
  }

  const tag = (text, cls) => `<span class="tag ${cls || ''}">${esc(text)}</span>`;

  // ---------------------------------------------------------
  // Kaynak tanimlari (client tarafi form/liste semasi)
  // ---------------------------------------------------------
  const RESOURCES = {
    news: {
      label: 'Haberler & Blog', icon: '📰', endpoint: 'news',
      desc: 'Haberler, blog yazıları ve başarı duyuruları',
      columns: [
        { key: 'title', label: 'Başlık', cls: 'cell-title truncate' },
        { key: 'category', label: 'Kategori', render: (r) => tag(r.category) },
        { key: 'published_at', label: 'Tarih', render: (r) => `<span class="cell-muted">${fmt(r.published_at)}</span>` },
        { key: 'is_published', label: 'Durum', render: (r) => (r.is_published ? tag('Yayında', 'tag-green') : tag('Taslak', 'tag-mute')) },
      ],
      fields: [
        { name: 'title', label: 'Başlık', type: 'text', required: true, full: true },
        { name: 'category', label: 'Kategori', type: 'select', options: ['Haber', 'Blog', 'Başarı', 'Etkinlik'] },
        { name: 'author', label: 'Yazar', type: 'text' },
        { name: 'image', label: 'Görsel URL', type: 'text', full: true, placeholder: 'https://...' },
        { name: 'summary', label: 'Özet', type: 'textarea', full: true, rows: 3 },
        { name: 'content', label: 'İçerik', type: 'textarea', full: true, rows: 9 },
        { name: 'tags', label: 'Etiketler (virgülle)', type: 'text' },
        { name: 'published_at', label: 'Yayın Tarihi', type: 'datetime' },
        { name: 'is_published', label: 'Yayında', type: 'checkbox', default: true },
      ],
    },
    announcements: {
      label: 'Duyurular', icon: '📣', endpoint: 'announcements',
      desc: 'Takım duyuruları',
      columns: [
        { key: 'title', label: 'Başlık', cls: 'cell-title truncate' },
        { key: 'type', label: 'Tür', render: (r) => tag(r.type) },
        { key: 'is_pinned', label: 'Sabit', render: (r) => (r.is_pinned ? tag('📌 Sabit', 'tag-amber') : '<span class="cell-muted">—</span>') },
        { key: 'published_at', label: 'Tarih', render: (r) => `<span class="cell-muted">${fmt(r.published_at)}</span>` },
        { key: 'is_published', label: 'Durum', render: (r) => (r.is_published ? tag('Yayında', 'tag-green') : tag('Taslak', 'tag-mute')) },
      ],
      fields: [
        { name: 'title', label: 'Başlık', type: 'text', required: true, full: true },
        { name: 'type', label: 'Tür', type: 'select', options: ['Genel', 'Acil', 'Yarışma', 'Başvuru'] },
        { name: 'published_at', label: 'Yayın Tarihi', type: 'datetime' },
        { name: 'content', label: 'İçerik', type: 'textarea', full: true, rows: 6 },
        { name: 'is_pinned', label: 'Sabitlenmiş (üste taşı)', type: 'checkbox' },
        { name: 'is_published', label: 'Yayında', type: 'checkbox', default: true },
      ],
    },
    members: {
      label: 'Takım Üyeleri', icon: '👥', endpoint: 'members',
      desc: 'Takım üyeleri ve görevleri',
      columns: [
        { key: 'name', label: 'Ad Soyad', cls: 'cell-title' },
        { key: 'role', label: 'Görev' },
        { key: 'department', label: 'Birim', render: (r) => tag(r.department || '—', 'tag-cyan') },
        { key: 'email', label: 'E-posta', render: (r) => `<span class="cell-muted">${esc(r.email || '—')}</span>` },
        { key: 'is_active', label: 'Durum', render: (r) => (r.is_active ? tag('Aktif', 'tag-green') : tag('Pasif', 'tag-mute')) },
      ],
      fields: [
        { name: 'name', label: 'Ad Soyad', type: 'text', required: true },
        { name: 'role', label: 'Görev / Unvan', type: 'text' },
        { name: 'department', label: 'Birim', type: 'select', options: ['Yönetim', 'Tasarım', 'Yazılım', 'Mekanik', 'Elektronik', 'Uçuş', 'Medya'] },
        { name: 'photo', label: 'Fotoğraf URL', type: 'text' },
        { name: 'email', label: 'E-posta', type: 'text' },
        { name: 'linkedin', label: 'LinkedIn', type: 'text' },
        { name: 'github', label: 'GitHub', type: 'text' },
        { name: 'bio', label: 'Kısa Biyografi', type: 'textarea', full: true, rows: 3 },
        { name: 'sort_order', label: 'Sıra', type: 'number' },
        { name: 'is_active', label: 'Aktif', type: 'checkbox', default: true },
      ],
    },
    vehicles: {
      label: "İHA'lar", icon: '🛩️', endpoint: 'vehicles',
      desc: 'İHA platformları ve teknik özellikleri',
      wide: true,
      columns: [
        { key: 'name', label: 'Ad', cls: 'cell-title' },
        { key: 'category', label: 'Kategori', render: (r) => tag(r.category || '—', 'tag-cyan') },
        { key: 'status', label: 'Durum', render: (r) => tag(r.status || '—', r.status === 'Aktif' ? 'tag-green' : 'tag-amber') },
        { key: 'specs', label: 'Özellik', render: (r) => `<span class="cell-muted">${(r.specs || []).length} adet</span>` },
      ],
      fields: [
        { name: 'name', label: 'Ad', type: 'text', required: true },
        { name: 'category', label: 'Kategori', type: 'text', placeholder: 'Savaşan İHA' },
        { name: 'status', label: 'Durum', type: 'select', options: ['Aktif', 'Prototip', 'Geliştirme', 'Arşiv'] },
        { name: 'image', label: 'Görsel URL', type: 'text' },
        { name: 'summary', label: 'Özet', type: 'textarea', full: true, rows: 2 },
        { name: 'description', label: 'Açıklama', type: 'textarea', full: true, rows: 6 },
        { name: 'sort_order', label: 'Sıra', type: 'number' },
        { name: 'is_featured', label: 'Öne çıkar', type: 'checkbox' },
        { name: '__specs', label: 'Teknik Özellikler', type: 'specs', full: true },
      ],
    },
    'activity-areas': {
      label: 'Faaliyet Alanları', icon: '🧩', endpoint: 'activity-areas',
      desc: 'Takımın çalışma alanları',
      columns: [
        { key: 'icon', label: 'Logo', render: (r) => (r.image
          ? `<img src="${esc(r.image)}" alt="" style="height:26px;width:auto;max-width:110px;object-fit:contain;vertical-align:middle;background:#fff;border-radius:6px;padding:2px 4px">`
          : `<span style="font-size:1.3rem">${esc(r.icon || '—')}</span>`) },
        { key: 'title', label: 'Başlık', cls: 'cell-title' },
        { key: 'description', label: 'Açıklama', cls: 'truncate cell-muted' },
        { key: 'sort_order', label: 'Sıra' },
      ],
      fields: [
        { name: 'title', label: 'Başlık', type: 'text', required: true, full: true },
        { name: 'icon', label: 'İkon (emoji)', type: 'text', placeholder: '🛩️' },
        { name: 'sort_order', label: 'Sıra', type: 'number' },
        { name: 'description', label: 'Açıklama', type: 'textarea', full: true, rows: 3 },
        { name: 'image', label: 'Logo / Görsel URL', type: 'text', full: true, placeholder: '/assets/logos/tubitak.svg' },
      ],
    },
    careers: {
      label: 'Kariyer', icon: '💼', endpoint: 'careers',
      desc: 'Açık pozisyonlar',
      columns: [
        { key: 'title', label: 'Pozisyon', cls: 'cell-title' },
        { key: 'department', label: 'Birim', render: (r) => tag(r.department || '—', 'tag-cyan') },
        { key: 'employment_type', label: 'Tür', render: (r) => tag(r.employment_type, 'tag-mute') },
        { key: 'is_open', label: 'Durum', render: (r) => (r.is_open ? tag('Açık', 'tag-green') : tag('Kapalı', 'tag-mute')) },
      ],
      fields: [
        { name: 'title', label: 'Pozisyon Adı', type: 'text', required: true, full: true },
        { name: 'department', label: 'Birim', type: 'select', options: ['Yazılım', 'Mekanik', 'Elektronik', 'Medya', 'Yönetim'] },
        { name: 'employment_type', label: 'Çalışma Türü', type: 'select', options: ['Gönüllü', 'Tam Zamanlı', 'Yarı Zamanlı', 'Stajyer'] },
        { name: 'location', label: 'Konum', type: 'text' },
        { name: 'description', label: 'Açıklama', type: 'textarea', full: true, rows: 4 },
        { name: 'requirements', label: 'Aranan Nitelikler (her satıra bir madde)', type: 'textarea', full: true, rows: 5 },
        { name: 'is_open', label: 'Başvuruya açık', type: 'checkbox', default: true },
      ],
    },
    sponsors: {
      label: 'Sponsorlar', icon: '🤝', endpoint: 'sponsors',
      desc: 'Sponsor kurumlar',
      columns: [
        { key: 'name', label: 'Kurum', cls: 'cell-title' },
        { key: 'tier', label: 'Seviye', render: (r) => tag(r.tier, r.tier === 'Platin' ? 'tag-cyan' : r.tier === 'Altın' ? 'tag-amber' : 'tag-mute') },
        { key: 'website', label: 'Web', render: (r) => (r.website ? `<a href="${esc(r.website)}" target="_blank" rel="noopener">${esc(r.website)}</a>` : '<span class="cell-muted">—</span>') },
        { key: 'sort_order', label: 'Sıra' },
      ],
      fields: [
        { name: 'name', label: 'Kurum Adı', type: 'text', required: true },
        { name: 'tier', label: 'Sponsorluk Seviyesi', type: 'select', options: ['Platin', 'Altın', 'Gümüş', 'Bronz', 'Destekçi'] },
        { name: 'website', label: 'Web Sitesi', type: 'text', placeholder: 'https://...' },
        { name: 'logo', label: 'Logo URL', type: 'text' },
        { name: 'description', label: 'Açıklama', type: 'textarea', full: true, rows: 3 },
        { name: 'sort_order', label: 'Sıra', type: 'number' },
      ],
    },
    gallery: {
      label: 'Galeri', icon: '🖼️', endpoint: 'gallery',
      desc: 'Fotoğraf galerisi',
      columns: [
        { key: 'image', label: 'Fotoğraf', render: (r) => (r.image
          ? `<img src="${esc(r.image)}" alt="" style="height:44px;width:64px;object-fit:cover;border-radius:6px;vertical-align:middle">`
          : '<span class="cell-muted">—</span>') },
        { key: 'title', label: 'Başlık', cls: 'cell-title truncate' },
        { key: 'caption', label: 'Açıklama', cls: 'truncate cell-muted' },
        { key: 'sort_order', label: 'Sıra' },
        { key: 'is_published', label: 'Durum', render: (r) => (r.is_published ? tag('Yayında', 'tag-green') : tag('Gizli', 'tag-mute')) },
      ],
      fields: [
        { name: 'image', label: 'Fotoğraf', type: 'photo', required: true, full: true },
        { name: 'title', label: 'Başlık', type: 'text', full: true },
        { name: 'caption', label: 'Açıklama', type: 'textarea', full: true, rows: 2 },
        { name: 'sort_order', label: 'Sıra', type: 'number' },
        { name: 'is_published', label: 'Yayında', type: 'checkbox', default: true },
      ],
    },
  };

  const SETTINGS_FIELDS = [
    { name: 'site_name', label: 'Site Adı', type: 'text' },
    { name: 'site_short', label: 'Kısa Ad', type: 'text' },
    { name: 'competition', label: 'Yarışma / Kategori', type: 'text' },
    { name: 'slogan', label: 'Slogan', type: 'text' },
    { name: 'founded_year', label: 'Kuruluş Yılı', type: 'text' },
    { name: 'member_count', label: 'Üye Sayısı (ana sayfa)', type: 'text' },
    { name: 'university', label: 'Kurum / Üniversite', type: 'text' },
    { name: 'email', label: 'E-posta', type: 'text' },
    { name: 'phone', label: 'Telefon', type: 'text' },
    { name: 'instagram', label: 'Instagram URL', type: 'text' },
    { name: 'linkedin', label: 'LinkedIn URL', type: 'text' },
    { name: 'youtube', label: 'YouTube URL', type: 'text' },
    { name: 'github', label: 'GitHub URL', type: 'text' },
    { name: 'address', label: 'Adres', type: 'textarea', full: true, rows: 2 },
    { name: 'about', label: 'Hakkımızda Metni', type: 'textarea', full: true, rows: 4 },
  ];

  const NAV = [
    { group: 'Panel', items: [{ key: 'dashboard', label: 'Genel Bakış', icon: '📊' }] },
    { group: 'İçerik', items: [
      { key: 'news', label: 'Haberler', icon: '📰' },
      { key: 'announcements', label: 'Duyurular', icon: '📣' },
      { key: 'activity-areas', label: 'Faaliyet Alanları', icon: '🧩' },
      { key: 'careers', label: 'Kariyer', icon: '💼' },
      { key: 'sponsors', label: 'Sponsorlar', icon: '🤝' },
      { key: 'gallery', label: 'Galeri', icon: '🖼️' },
    ] },
    { group: 'Takım', items: [
      { key: 'members', label: 'Takım Üyeleri', icon: '👥' },
      { key: 'vehicles', label: "İHA'lar", icon: '🛩️' },
    ] },
    { group: 'Gelen Kutusu', items: [
      { key: 'messages', label: 'Mesajlar', icon: '✉️', badge: 'messages' },
      { key: 'applications', label: 'Başvurular', icon: '📥', badge: 'applications' },
      { key: 'comments', label: 'Yorumlar', icon: '💬', badge: 'pendingComments' },
    ] },
    { group: 'Veritabanı', items: [
      { key: 'users', label: 'Kayıtlı Üyeler', icon: '🧑💻' },
      { key: 'database', label: 'Tablo Gezgini', icon: '🗄️' },
    ] },
    { group: 'Sistem', items: [
      { key: 'newsletter', label: 'Bülten', icon: '✉️' },
      { key: 'audit-log', label: 'Denetim Kaydı', icon: '📜' },
    ] },
    { group: 'Ayarlar', items: [{ key: 'settings', label: 'Site Ayarları', icon: '⚙️' }] },
  ];

  // ---------------------------------------------------------
  // Giris / cikis
  // ---------------------------------------------------------
  function showLogin() {
    el('login-view').classList.remove('hidden');
    el('app-view').classList.add('hidden');
  }

  function showApp() {
    el('login-view').classList.add('hidden');
    el('app-view').classList.remove('hidden');
    renderSidebar();
    renderUserChip();
    navigate(current || 'dashboard');
  }

  function logout(notify) {
    if (token) {
      fetch(API + '/logout', { method: 'POST', headers: { 'Authorization': 'Bearer ' + token } }).catch(() => {});
    }
    token = ''; user = null;
    localStorage.removeItem(TOKEN_KEY);
    showLogin();
    if (notify) toast('Çıkış yapıldı.');
  }

  async function init() {
    el('login-form').addEventListener('submit', onLogin);
    if (!token) return showLogin();
    try {
      const me = await api('/me');
      user = me.user;
      await refreshCounts();
      showApp();
    } catch (e) {
      showLogin();
    }
  }

  async function onLogin(ev) {
    ev.preventDefault();
    const form = ev.target;
    const btn = qs('button[type=submit]', form);
    const err = el('login-error');
    err.classList.add('hidden');
    btn.disabled = true; btn.textContent = 'Giriş yapılıyor...';
    try {
      const body = {
        username: form.elements.username.value.trim(),
        password: form.elements.password.value,
      };
      const res = await fetch(API + '/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) throw new Error((data && data.error) || 'Giriş başarısız.');
      token = data.token;
      user = data.user;
      localStorage.setItem(TOKEN_KEY, token);
      form.reset();
      await refreshCounts();
      showApp();
      toast('Hoş geldiniz, ' + (user.fullName || user.username) + '.');
    } catch (e) {
      err.textContent = e.message;
      err.classList.remove('hidden');
    } finally {
      btn.disabled = false; btn.textContent = 'Giriş Yap';
    }
  }

  async function refreshCounts() {
    try {
      const s = await api('/stats');
      counts.messages = s.unreadMessages;
      counts.applications = s.newApplications;
      counts.pendingComments = s.pendingComments;
    } catch (e) { /* yoksay */ }
  }

  // ---------------------------------------------------------
  // Iskelet
  // ---------------------------------------------------------
  function renderSidebar() {
    el('sidebar').innerHTML = `
      <a class="brand" href="/" target="_blank" rel="noopener">
        <span class="mark">
          <svg viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2 2 20l10-4 10 4z"/><path d="M12 2v14"/></svg>
        </span>
        <span><b>SAYE</b><span>Yönetim Paneli</span></span>
      </a>
      ${NAV.map((g) => `
        <div class="nav-group">
          <div class="nav-group-title">${g.group}</div>
          ${g.items.map((it) => `
            <a class="nav-item" data-nav="${it.key}">
              <span class="ico">${it.icon}</span>
              <span>${it.label}</span>
              ${it.badge && counts[it.badge] ? `<span class="count">${counts[it.badge]}</span>` : ''}
            </a>`).join('')}
        </div>`).join('')}
      <div class="sidebar-foot">
        <a href="/" target="_blank" rel="noopener">↗ Siteyi görüntüle</a>
        <a href="#" id="logout-link">⏻ Çıkış yap</a>
      </div>`;
    qsa('[data-nav]').forEach((a) => a.addEventListener('click', () => navigate(a.dataset.nav)));
    el('logout-link').addEventListener('click', (e) => { e.preventDefault(); logout(true); });
  }

  function renderUserChip() {
    const name = (user && (user.fullName || user.username)) || 'Yönetici';
    el('user-chip').innerHTML = `
      <span>${esc(name)}</span>
      <span class="avatar">${esc(name.slice(0, 2).toUpperCase())}</span>`;
  }

  function setActive() {
    qsa('[data-nav]').forEach((a) => a.classList.toggle('active', a.dataset.nav === current));
  }

  function setHeader(title, sub) {
    el('page-title').textContent = title;
    el('page-sub').textContent = sub || '';
  }

  async function navigate(key) {
    current = key;
    setActive();
    const content = el('view-content');
    content.innerHTML = '<div class="panel"><div class="state">Yükleniyor...</div></div>';
    try {
      if (key === 'dashboard') await viewDashboard();
      else if (key === 'messages') await viewMessages();
      else if (key === 'applications') await viewApplications();
      else if (key === 'comments') await viewComments();
      else if (key === 'settings') await viewSettings();
      else if (key === 'users') await viewDatabase('users');
      else if (key === 'newsletter') await viewNewsletter();
      else if (key === 'audit-log') await viewAuditLog();
      else if (key === 'database') await viewDatabase();
      else if (RESOURCES[key]) await viewResource(key);
      else content.innerHTML = '<div class="panel"><div class="state">Sayfa bulunamadı.</div></div>';
    } catch (e) {
      content.innerHTML = `<div class="panel"><div class="alert alert-error">${esc(e.message)}</div></div>`;
    }
  }

  // ---------------------------------------------------------
  // Genel Bakis
  // ---------------------------------------------------------
  const MONTHS_TR = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];

  /** Son n ayin {ym, label} listesini uretir. */
  function lastMonths(n) {
    const out = [];
    const now = new Date();
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      out.push({ ym: d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0'), label: MONTHS_TR[d.getMonth()] });
    }
    return out;
  }

  /** Yatay cubuk grafigi HTML'i. */
  function hbar(items) {
    if (!items || !items.length) return '<div class="state">Veri yok.</div>';
    const max = Math.max.apply(null, items.map((i) => Number(i.value) || 0).concat([1]));
    return `<div class="hbar-list">${items.map((i) => `
      <div class="hbar">
        <span class="hbar-label">${esc(i.label)}</span>
        <span class="hbar-track"><span class="hbar-fill" style="width:${Math.max(3, Math.round(((Number(i.value) || 0) / max) * 100))}%"></span></span>
        <span class="hbar-value">${esc(i.value)}</span>
      </div>`).join('')}</div>`;
  }

  /** Aylik iki serili sutun grafigi HTML'i. */
  function monthChart(months, seriesA, seriesB) {
    const a = {}; seriesA.forEach((r) => { a[r.ym] = Number(r.value) || 0; });
    const b = {}; seriesB.forEach((r) => { b[r.ym] = Number(r.value) || 0; });
    const max = Math.max(1, ...months.map((m) => Math.max(a[m.ym] || 0, b[m.ym] || 0)));
    return `<div class="mchart">
      ${months.map((m) => `
        <div class="mcol" title="${esc(m.label)} — Mesaj: ${a[m.ym] || 0}, Başvuru: ${b[m.ym] || 0}">
          <div class="mbars">
            <span class="mbar mbar-a" style="height:${((a[m.ym] || 0) / max) * 100}%"></span>
            <span class="mbar mbar-b" style="height:${((b[m.ym] || 0) / max) * 100}%"></span>
          </div>
          <span class="mlabel">${esc(m.label.slice(0, 3))}</span>
        </div>`).join('')}
    </div>
    <div class="legend"><span><i class="lg-a"></i> Mesaj</span><span><i class="lg-b"></i> Başvuru</span></div>`;
  }

  async function viewDashboard() {
    setHeader('Genel Bakış', 'Site içeriği, gelen kutusu ve istatistikler');
    const [s, d] = await Promise.all([api('/stats'), api('/dashboard')]);
    const cards = [
      ['Üye', s.members], ['Kayıtlı Üye', s.users], ['İHA', s.vehicles], ['Haber', s.news],
      ['Duyuru', s.announcements], ['Faaliyet Alanı', s.activityAreas], ['Pozisyon', s.careers],
      ['Sponsor', s.sponsors], ['Okunmamış Mesaj', s.unreadMessages], ['Yeni Başvuru', s.newApplications],
    ];
    const months = lastMonths(6);
    el('view-content').innerHTML = `
      <div class="stat-grid">
        ${cards.map(([l, v]) => `<div class="stat-card"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('')}
      </div>

      <div class="panel">
        <div class="toolbar"><h2>Hızlı İşlemler</h2></div>
        <div style="display:flex;gap:10px;flex-wrap:wrap">
          <button class="btn btn-primary btn-sm" data-quick="news">+ Yeni Haber</button>
          <button class="btn btn-ghost btn-sm" data-quick="announcements">+ Yeni Duyuru</button>
          <button class="btn btn-ghost btn-sm" data-quick="members">+ Yeni Üye</button>
          <button class="btn btn-ghost btn-sm" data-quick="careers">+ Yeni Pozisyon</button>
          <button class="btn btn-ghost btn-sm" data-quick="messages">Gelen Mesajlar (${s.unreadMessages})</button>
          <button class="btn btn-ghost btn-sm" data-quick="applications">Başvurular (${s.newApplications})</button>
        </div>
      </div>

      <div class="grid-2col">
        <div class="panel">
          <div class="toolbar"><h2>Son 6 Ay</h2></div>
          ${monthChart(months, d.monthlyMessages, d.monthlyApplications)}
        </div>
        <div class="panel">
          <div class="toolbar"><h2>Başvuru Durumları</h2></div>
          ${hbar((d.statusBreakdown || []).map((r) => ({ label: r.label, value: r.value })))}
        </div>
      </div>

      <div class="grid-2col">
        <div class="panel">
          <div class="toolbar"><h2>Birim Dağılımı</h2><span class="muted">Takım üyeleri</span></div>
          ${hbar(d.memberDepartments)}
        </div>
        <div class="panel">
          <div class="toolbar"><h2>Kayıtlı Üyeler</h2><span class="muted">Birimlere göre</span></div>
          ${hbar(d.userDepartments)}
        </div>
      </div>

      <div class="grid-2col">
        <div class="panel">
          <div class="toolbar"><h2>Son Mesajlar</h2><button class="btn btn-ghost btn-sm" data-quick="messages">Tümü</button></div>
          ${(d.recentMessages || []).length ? `<div class="mini-list">${d.recentMessages.map((m) => `
            <div class="mini-row">
              <span class="mini-dot ${m.is_read ? '' : 'on'}"></span>
              <span class="mini-main"><b>${esc(m.name)}</b><span>${esc(m.subject || 'Konu yok')}</span></span>
              <span class="cell-muted">${fmt(m.created_at)}</span>
            </div>`).join('')}</div>` : '<div class="state">Mesaj yok.</div>'}
        </div>
        <div class="panel">
          <div class="toolbar"><h2>Son Başvurular</h2><button class="btn btn-ghost btn-sm" data-quick="applications">Tümü</button></div>
          ${(d.recentApplications || []).length ? `<div class="mini-list">${d.recentApplications.map((a) => `
            <div class="mini-row">
              <span class="mini-main"><b>${esc(a.full_name)}</b><span>${esc(a.career_title || 'Genel başvuru')}</span></span>
              ${tag(a.status, a.status === 'Yeni' ? 'tag-red' : a.status === 'Reddedildi' ? 'tag-mute' : 'tag-amber')}
            </div>`).join('')}</div>` : '<div class="state">Başvuru yok.</div>'}
        </div>
      </div>`;

    qsa('[data-quick]').forEach((b) => b.addEventListener('click', () => {
      const k = b.dataset.quick;
      navigate(k).then(() => { if (RESOURCES[k]) openForm(k, null); });
    }));
  }

  // ---------------------------------------------------------
  // Genel kaynak listesi + form
  // ---------------------------------------------------------
  async function viewResource(key) {
    const cfg = RESOURCES[key];
    setHeader(cfg.label, cfg.desc);
    const rows = await api('/' + cfg.endpoint);
    const content = el('view-content');
    content.innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <h2>${esc(cfg.label)} <span class="muted">(${rows.length})</span></h2>
          <button class="btn btn-primary btn-sm" id="new-btn">+ Yeni Ekle</button>
        </div>
        <div class="table-wrap">
          ${rows.length ? `<table class="data">
            <thead><tr>${cfg.columns.map((c) => `<th>${esc(c.label)}</th>`).join('')}<th></th></tr></thead>
            <tbody>
              ${rows.map((r) => `<tr>
                ${cfg.columns.map((c) => `<td class="${c.cls || ''}">${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}
                <td class="actions"><div class="row-actions">
                  <button class="btn btn-ghost btn-sm" data-edit="${r.id}">Düzenle</button>
                  <button class="btn btn-danger btn-sm" data-del="${r.id}">Sil</button>
                </div></td>
              </tr>`).join('')}
            </tbody>
          </table>` : '<div class="state">Henüz kayıt yok. "+ Yeni Ekle" ile başlayın.</div>'}
        </div>
      </div>`;

    el('new-btn').addEventListener('click', () => openForm(key, null));
    qsa('[data-edit]').forEach((b) => b.addEventListener('click', () => {
      openForm(key, rows.find((r) => String(r.id) === b.dataset.edit));
    }));
    qsa('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Bu kaydı silmek istediğinize emin misiniz?')) return;
      try {
        await api(`/${cfg.endpoint}/${b.dataset.del}`, { method: 'DELETE' });
        toast('Kayıt silindi.');
        await refreshCounts();
        navigate(key);
      } catch (e) { toast(e.message, 'error'); }
    }));
  }

  function fieldHtml(f, value) {
    const id = 'f_' + f.name;
    const cls = 'field' + (f.full ? ' full' : '');
    const req = f.required ? ' <span class="req">*</span>' : '';
    const ph = f.placeholder ? ` placeholder="${esc(f.placeholder)}"` : '';
    switch (f.type) {
      case 'textarea':
        return `<div class="${cls}"><label for="${id}">${esc(f.label)}${req}</label><textarea id="${id}" name="${f.name}" rows="${f.rows || 5}"${ph}>${esc(value == null ? '' : value)}</textarea></div>`;
      case 'select':
        return `<div class="${cls}"><label for="${id}">${esc(f.label)}${req}</label><select id="${id}" name="${f.name}">${(f.options || []).map((o) => `<option value="${esc(o)}"${String(value) === String(o) ? ' selected' : ''}>${esc(o)}</option>`).join('')}</select></div>`;
      case 'checkbox':
        return `<div class="field checkbox"><input type="checkbox" id="${id}" name="${f.name}"${value ? ' checked' : ''}><label for="${id}">${esc(f.label)}</label></div>`;
      case 'number':
        return `<div class="${cls}"><label for="${id}">${esc(f.label)}${req}</label><input id="${id}" name="${f.name}" type="number" value="${esc(value == null ? '' : value)}"></div>`;
      case 'datetime':
        return `<div class="${cls}"><label for="${id}">${esc(f.label)}${req}</label><input id="${id}" name="${f.name}" type="datetime-local" value="${esc(toLocal(value))}"></div>`;
      case 'photo': {
        const v = value == null ? '' : String(value);
        return `<div class="field full"><label for="${id}">${esc(f.label)}${req}</label>
          <input type="hidden" id="${id}" name="${f.name}" value="${esc(v)}">
          <div class="photo-picker">
            <div class="photo-preview" id="${id}_prev">${v ? `<img src="${esc(v)}" alt="">` : '<span class="cell-muted">Fotoğraf seçilmedi</span>'}</div>
            <div class="photo-actions">
              <input type="file" accept="image/*" id="${id}_file" hidden>
              <button type="button" class="btn btn-ghost btn-sm" data-photo-pick="${id}">📷 Fotoğraf Seç</button>
              <button type="button" class="btn btn-ghost btn-sm" data-photo-clear="${id}">Kaldır</button>
            </div>
          </div>
        </div>`;
      }
      case 'specs':
        return ''; // ozel islenir
      default:
        return `<div class="${cls}"><label for="${id}">${esc(f.label)}${req}</label><input id="${id}" name="${f.name}" type="text" value="${esc(value == null ? '' : value)}"${ph}></div>`;
    }
  }

  /** Fotoğrafı oranını koruyarak küçültür ve JPEG data URL döner. */
  function resizeImage(file, max) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          const scale = Math.min(1, max / Math.max(width, height));
          width = Math.max(1, Math.round(width * scale));
          height = Math.max(1, Math.round(height * scale));
          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, width, height);
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.onerror = () => reject(new Error('Görsel okunamadı.'));
        img.src = reader.result;
      };
      reader.onerror = () => reject(new Error('Dosya okunamadı.'));
      reader.readAsDataURL(file);
    });
  }

  /** photo tipi alanları (dosya seçici + önizleme) bağlar. */
  function bindPhotoFields(form, cfg) {
    cfg.fields.filter((f) => f.type === 'photo').forEach((f) => {
      const id = 'f_' + f.name;
      const hidden = el(id);
      const file = el(id + '_file');
      const prev = el(id + '_prev');
      const pick = qs(`[data-photo-pick="${id}"]`, form);
      const clear = qs(`[data-photo-clear="${id}"]`, form);
      if (pick && file) pick.addEventListener('click', () => file.click());
      if (file) file.addEventListener('change', async () => {
        const chosen = file.files && file.files[0];
        if (!chosen) return;
        try {
          const dataUrl = await resizeImage(chosen, 1600);
          hidden.value = dataUrl;
          prev.innerHTML = `<img src="${esc(dataUrl)}" alt="">`;
        } catch (e) { toast(e.message, 'error'); }
        file.value = '';
      });
      if (clear) clear.addEventListener('click', () => {
        hidden.value = '';
        prev.innerHTML = '<span class="cell-muted">Fotoğraf seçilmedi</span>';
      });
    });
  }

  function specRowHtml(s) {
    return `<div class="spec-row">
      <input type="text" class="spec-label" placeholder="Etiket (örn. Kanat Açıklığı)" value="${esc(s ? s.label : '')}">
      <input type="text" class="spec-value" placeholder="Değer" value="${esc(s ? s.value : '')}">
      <input type="text" class="spec-unit" placeholder="Birim" value="${esc(s && s.unit ? s.unit : '')}">
      <button type="button" class="btn btn-danger btn-sm spec-del">×</button>
    </div>`;
  }

  function openForm(key, record) {
    const cfg = RESOURCES[key];
    const isEdit = !!record;
    const bodyHtml = `
      <form id="entity-form" class="form-grid">
        ${cfg.fields.map((f) => (f.type === 'specs'
          ? `<div class="field full"><label>${esc(f.label)}</label>
               <div class="spec-rows" id="spec-rows">
                 ${((record && record.specs) || []).map(specRowHtml).join('')}
               </div>
               <button type="button" class="btn btn-ghost btn-sm" id="add-spec" style="align-self:flex-start">+ Özellik Ekle</button>
             </div>`
          : fieldHtml(f, isEdit ? record[f.name] : f.default))).join('')}
      </form>`;

    openModal({
      title: (isEdit ? 'Düzenle: ' : 'Yeni: ') + cfg.label.replace(/s$/, ''),
      wide: cfg.wide,
      bodyHtml,
      confirmLabel: isEdit ? 'Kaydet' : 'Oluştur',
      onSubmit: async (form) => {
        const data = {};
        for (const f of cfg.fields) {
          if (f.type === 'specs') continue;
          const input = form.elements[f.name];
          if (!input) continue;
          if (f.type === 'checkbox') data[f.name] = input.checked ? 1 : 0;
          else if (f.type === 'datetime') data[f.name] = fromLocal(input.value);
          else data[f.name] = input.value;
        }
        if (cfg.fields.some((f) => f.type === 'specs')) {
          data.specs = qsa('.spec-row', form).map((row, i) => ({
            label: qs('.spec-label', row).value.trim(),
            value: qs('.spec-value', row).value.trim(),
            unit: qs('.spec-unit', row).value.trim(),
            sort_order: i + 1,
          })).filter((s) => s.label !== '');
        }
        const method = isEdit ? 'PUT' : 'POST';
        const path = isEdit ? `/${cfg.endpoint}/${record.id}` : `/${cfg.endpoint}`;
        await api(path, { method, body: JSON.stringify(data) });
        toast(isEdit ? 'Kayıt güncellendi.' : 'Kayıt oluşturuldu.');
        closeModal();
        await refreshCounts();
        navigate(key);
      },
    });

    const addSpec = el('add-spec');
    if (addSpec) {
      addSpec.addEventListener('click', () => {
        el('spec-rows').insertAdjacentHTML('beforeend', specRowHtml(null));
      });
      el('spec-rows').addEventListener('click', (e) => {
        if (e.target.classList.contains('spec-del')) e.target.closest('.spec-row').remove();
      });
    }
    bindPhotoFields(el('entity-form'), cfg);
  }

  // ---------------------------------------------------------
  // Mesajlar
  // ---------------------------------------------------------
  async function viewMessages() {
    setHeader('Mesajlar', 'İletişim formundan gelen mesajlar');
    const rows = await api('/messages');
    el('view-content').innerHTML = `
      <div class="panel">
        <div class="toolbar"><h2>Gelen Mesajlar <span class="muted">(${rows.length})</span></h2></div>
        <div class="table-wrap">${rows.length ? `<table class="data">
          <thead><tr><th>Durum</th><th>Gönderen</th><th>Konu / Mesaj</th><th>Tarih</th><th></th></tr></thead>
          <tbody>${rows.map((m) => `<tr>
            <td>${m.is_read ? tag('Okundu', 'tag-mute') : tag('Yeni', 'tag-red')}</td>
            <td><div class="cell-title">${esc(m.name)}</div><div class="cell-muted">${esc(m.email)}${m.phone ? ' • ' + esc(m.phone) : ''}</div></td>
            <td><div class="cell-title">${esc(m.subject || 'Konu yok')}</div><div class="cell-muted" style="white-space:pre-wrap;max-width:420px">${esc(m.message)}</div></td>
            <td class="cell-muted">${fmt(m.created_at)}</td>
            <td class="actions"><div class="row-actions">
              ${m.is_read ? '' : `<button class="btn btn-ghost btn-sm" data-read="${m.id}">Okundu işaretle</button>`}
              <button class="btn btn-danger btn-sm" data-del="${m.id}">Sil</button>
            </div></td>
          </tr>`).join('')}</tbody></table>` : '<div class="state">Henüz mesaj yok.</div>'}</div>
      </div>`;
    qsa('[data-read]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('/messages/' + b.dataset.read, { method: 'PATCH', body: JSON.stringify({ is_read: 1 }) }); await refreshCounts(); renderSidebar(); setActive(); navigate('messages'); }
      catch (e) { toast(e.message, 'error'); }
    }));
    qsa('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Mesajı silmek istediğinize emin misiniz?')) return;
      try { await api('/messages/' + b.dataset.del, { method: 'DELETE' }); await refreshCounts(); renderSidebar(); setActive(); navigate('messages'); }
      catch (e) { toast(e.message, 'error'); }
    }));
  }

  // ---------------------------------------------------------
  // Basvurular
  // ---------------------------------------------------------
  const APP_STATUSES = [
    { value: 'Yeni', label: 'Yeni' },
    { value: 'Inceleniyor', label: 'İnceleniyor' },
    { value: 'Degerlendirildi', label: 'Değerlendirildi' },
    { value: 'Reddedildi', label: 'Reddedildi' },
  ];

  async function viewApplications() {
    setHeader('Başvurular', 'Kariyer başvuru formundan gelen kayıtlar');
    const rows = await api('/applications');
    el('view-content').innerHTML = `
      <div class="panel">
        <div class="toolbar"><h2>Kariyer Başvuruları <span class="muted">(${rows.length})</span></h2></div>
        <div class="table-wrap">${rows.length ? `<table class="data">
          <thead><tr><th>Aday</th><th>Pozisyon</th><th>Bilgiler</th><th>Durum</th><th>Tarih</th><th></th></tr></thead>
          <tbody>${rows.map((a) => `<tr>
            <td><div class="cell-title">${esc(a.full_name)}</div><div class="cell-muted">${esc(a.email)}${a.phone ? ' • ' + esc(a.phone) : ''}</div></td>
            <td>${esc(a.career_title || 'Genel başvuru')}</td>
            <td class="cell-muted">${a.university ? esc(a.university) : ''}${a.department ? ' / ' + esc(a.department) : ''}${a.message ? `<div style="max-width:320px;white-space:pre-wrap;margin-top:4px">${esc(a.message)}</div>` : ''}${a.cv_url ? `<div style="margin-top:4px"><a href="${esc(a.cv_url)}" target="_blank" rel="noopener">CV / Portfolyo</a></div>` : ''}</td>
            <td><select data-status="${a.id}" style="padding:7px 9px">${APP_STATUSES.map((s) => `<option value="${esc(s.value)}"${s.value === a.status ? ' selected' : ''}>${esc(s.label)}</option>`).join('')}</select></td>
            <td class="cell-muted">${fmt(a.created_at)}</td>
            <td class="actions"><button class="btn btn-danger btn-sm" data-del="${a.id}">Sil</button></td>
          </tr>`).join('')}</tbody></table>` : '<div class="state">Henüz başvuru yok.</div>'}</div>
      </div>`;
    qsa('[data-status]').forEach((sel) => sel.addEventListener('change', async () => {
      try { await api('/applications/' + sel.dataset.status, { method: 'PATCH', body: JSON.stringify({ status: sel.value }) }); toast('Durum güncellendi.'); await refreshCounts(); }
      catch (e) { toast(e.message, 'error'); }
    }));
    qsa('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Başvuruyu silmek istediğinize emin misiniz?')) return;
      try { await api('/applications/' + b.dataset.del, { method: 'DELETE' }); await refreshCounts(); renderSidebar(); setActive(); navigate('applications'); }
      catch (e) { toast(e.message, 'error'); }
    }));
  }

  // ---------------------------------------------------------
  // Yorum moderasyonu
  // ---------------------------------------------------------
  let commentFilter = 'pending';

  async function viewComments() {
    setHeader('Yorumlar', 'Üye yorumlarını onayla veya reddet');
    const rows = await api('/comments?status=' + encodeURIComponent(commentFilter));
    const pill = (key, label) => `<button class="btn btn-sm ${commentFilter === key ? 'btn-primary' : 'btn-ghost'}" data-filter="${key}">${label}</button>`;
    el('view-content').innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <h2>Yorumlar <span class="muted">(${rows.length})</span></h2>
          <div class="row-actions">
            ${pill('pending', 'Onay Bekleyen')}
            ${pill('approved', 'Onaylanan')}
            ${pill('all', 'Tümü')}
          </div>
        </div>
        <div class="table-wrap">${rows.length ? `<table class="data">
          <thead><tr><th>Yazan</th><th>Yorum</th><th>Durum</th><th>Tarih</th><th></th></tr></thead>
          <tbody>${rows.map((c) => `<tr>
            <td><div class="cell-title">${esc(c.name)}</div><div class="cell-muted">${c.user_id ? 'Üye #' + esc(c.user_id) : 'Ziyaretçi'}</div></td>
            <td><div class="cell-muted" style="white-space:pre-wrap;max-width:420px">${esc(c.content)}</div><div class="cell-muted">${esc(c.target_type)} • ${esc(c.target_title || ('#' + c.target_id))}</div></td>
            <td>${c.is_approved ? tag('Onaylandı', 'tag-green') : tag('Bekliyor', 'tag-amber')}</td>
            <td class="cell-muted">${fmtDateTime(c.created_at)}</td>
            <td class="actions"><div class="row-actions">
              ${c.is_approved
                ? `<button class="btn btn-ghost btn-sm" data-reject="${c.id}">Onayı kaldır</button>`
                : `<button class="btn btn-primary btn-sm" data-approve="${c.id}">Onayla</button>`}
              <button class="btn btn-danger btn-sm" data-del="${c.id}">Sil</button>
            </div></td>
          </tr>`).join('')}</tbody></table>` : '<div class="state">Bu filtrede yorum yok.</div>'}</div>
      </div>`;

    qsa('[data-filter]').forEach((b) => b.addEventListener('click', () => { commentFilter = b.dataset.filter; navigate('comments'); }));
    qsa('[data-approve]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('/comments/' + b.dataset.approve, { method: 'PATCH', body: JSON.stringify({ is_approved: 1 }) }); toast('Yorum onaylandı.'); await refreshCounts(); renderSidebar(); setActive(); navigate('comments'); }
      catch (e) { toast(e.message, 'error'); }
    }));
    qsa('[data-reject]').forEach((b) => b.addEventListener('click', async () => {
      try { await api('/comments/' + b.dataset.reject, { method: 'PATCH', body: JSON.stringify({ is_approved: 0 }) }); toast('Yorum onayı kaldırıldı.'); await refreshCounts(); renderSidebar(); setActive(); navigate('comments'); }
      catch (e) { toast(e.message, 'error'); }
    }));
    qsa('[data-del]').forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Yorumu silmek istediğinize emin misiniz?')) return;
      try { await api('/comments/' + b.dataset.del, { method: 'DELETE' }); toast('Yorum silindi.'); await refreshCounts(); renderSidebar(); setActive(); navigate('comments'); }
      catch (e) { toast(e.message, 'error'); }
    }));
  }

  // ---------------------------------------------------------
  // Veritabani gezgini (tum tablolar)
  // ---------------------------------------------------------
  const TABLE_LABELS = {
    users: 'Kayıtlı Üyeler',
    email_verifications: 'Bekleyen E-posta Doğrulamaları',
    password_resets: 'Şifre Sıfırlama Kodları',
    messages: 'İletişim Mesajları',
    career_applications: 'Kariyer Başvuruları',
    members: 'Takım Üyeleri',
    vehicles: 'İHA / Araçlar',
    vehicle_specs: 'Araç Teknik Özellikleri',
    news: 'Haberler',
    announcements: 'Duyurular',
    activity_areas: 'Faaliyet Alanları',
    careers: 'Kariyer Pozisyonları',
    sponsors: 'Sponsorlar',
    settings: 'Site Ayarları',
    admins: 'Yöneticiler',
    audit_log: 'Denetim Kaydı',
    subscribers: 'Bülten Aboneleri',
    comments: 'Yorumlar',
    reactions: 'Beğeniler',
    favorites: 'Favoriler',
  };
  const LONG_COLUMNS = ['content', 'description', 'summary', 'bio', 'message', 'address', 'payload', 'about', 'requirements'];

  function dbCell(v) {
    if (v === null || v === undefined || v === '') return '<span class="cell-muted">—</span>';
    const s = String(v).replace(/\s+/g, ' ');
    const title = s.length > 300 ? s.slice(0, 300) + '…' : s;
    return `<span title="${esc(title)}">${esc(s.length > 45 ? s.slice(0, 45) + '…' : s)}</span>`;
  }

  function dbFieldHtml(c, value) {
    const id = 'd_' + c.name;
    const label = esc(c.name) + (c.notnull ? ' <span class="req">*</span>' : '');
    const t = String(c.type || '').toUpperCase();
    if (c.pk && /INT/.test(t)) {
      return `<div class="field"><label>${esc(c.name)} <span class="cell-muted">(otomatik)</span></label><input type="text" value="${esc(value == null ? '' : value)}" disabled></div>`;
    }
    if (LONG_COLUMNS.includes(c.name)) {
      return `<div class="field full"><label>${label}</label><textarea id="${id}" name="${c.name}" rows="4">${esc(value == null ? '' : value)}</textarea></div>`;
    }
    if (/INT|REAL|NUM|DEC/.test(t) && !/TEXT|CHAR|CLOB/.test(t)) {
      return `<div class="field"><label>${label}</label><input id="${id}" name="${c.name}" type="number" value="${esc(value == null ? '' : value)}"></div>`;
    }
    return `<div class="field"><label>${label}</label><input id="${id}" name="${c.name}" type="text" value="${esc(value == null ? '' : value)}"></div>`;
  }

  function openDbForm(meta, row) {
    const isEdit = !!row;
    const fields = meta.columns.filter((c) => !meta.masked.includes(c.name));
    const bodyHtml = `<form id="db-form" class="form-grid">
      ${fields.map((c) => dbFieldHtml(c, isEdit ? row[c.name] : '')).join('')}
    </form>`;
    openModal({
      title: (isEdit ? 'Düzenle: ' : 'Yeni Kayıt: ') + (TABLE_LABELS[meta.table] || meta.table),
      wide: true,
      bodyHtml,
      confirmLabel: isEdit ? 'Kaydet' : 'Ekle',
      onSubmit: async (form) => {
        const data = {};
        for (const c of fields) {
          const input = form.elements[c.name];
          if (!input) continue;
          data[c.name] = input.value;
        }
        const path = isEdit
          ? `/db/${meta.table}/${encodeURIComponent(row[meta.pk])}`
          : `/db/${meta.table}`;
        await api(path, { method: isEdit ? 'PUT' : 'POST', body: JSON.stringify(data) });
        toast(isEdit ? 'Kayıt güncellendi.' : 'Kayıt eklendi.');
        closeModal();
        await refreshCounts();
        renderSidebar(); setActive();
        await loadDbTable(meta.table);
      },
    });
  }

  // Aktif tablo durumu (arama + sayfalama)
  const dbState = { table: null, q: '', limit: 25, offset: 0 };
  let dbSearchTimer = null;

  async function exportDbCsv(table) {
    try {
      const params = new URLSearchParams();
      if (dbState.q) params.set('q', dbState.q);
      const res = await fetch(`${API}/db/${table}/export?` + params.toString(), {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) throw new Error('Dışa aktarma başarısız.');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url; a.download = table + '.csv';
      document.body.appendChild(a); a.click(); a.remove();
      URL.revokeObjectURL(url);
      toast('CSV indirildi.');
    } catch (e) { toast(e.message, 'error'); }
  }

  async function loadDbTable(table, resetOffset) {
    if (table) dbState.table = table;
    if (resetOffset) dbState.offset = 0;
    table = dbState.table;
    const view = el('db-table-view');
    if (!view) return;

    const params = new URLSearchParams({ limit: dbState.limit, offset: dbState.offset });
    if (dbState.q) params.set('q', dbState.q);
    const meta = await api(`/db/${table}?` + params.toString());
    const rows = meta.rows;
    const from = meta.total === 0 ? 0 : meta.offset + 1;
    const to = meta.offset + rows.length;
    const pages = Math.max(1, Math.ceil(meta.total / meta.limit));
    const page = Math.floor(meta.offset / meta.limit) + 1;

    view.innerHTML = `
      <div class="toolbar">
        <h2>${esc(TABLE_LABELS[table] || table)} <span class="muted">(${meta.total} kayıt)</span></h2>
        <div class="toolbar-actions">
          <input type="search" id="db-search" class="db-search" placeholder="Ara..." value="${esc(dbState.q)}">
          <button class="btn btn-ghost btn-sm" id="db-export">⭳ CSV</button>
          <button class="btn btn-primary btn-sm" id="db-new">+ Yeni Kayıt</button>
        </div>
      </div>
      <div class="table-wrap">${rows.length ? `<table class="data">
        <thead><tr>${meta.columns.map((c) => `<th>${esc(c.name)}</th>`).join('')}<th></th></tr></thead>
        <tbody>${rows.map((r) => `<tr>
          ${meta.columns.map((c) => `<td>${dbCell(r[c.name])}</td>`).join('')}
          <td class="actions"><div class="row-actions">
            <button class="btn btn-ghost btn-sm" data-db-edit="${esc(String(r[meta.pk]))}">Düzenle</button>
            <button class="btn btn-danger btn-sm" data-db-del="${esc(String(r[meta.pk]))}">Sil</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table>` : `<div class="state">${dbState.q ? 'Aramaya uygun kayıt bulunamadı.' : 'Bu tabloda kayıt yok. "+ Yeni Kayıt" ile ekleyebilirsiniz.'}</div>`}</div>
      ${meta.total > meta.limit ? `<div class="pager">
        <button class="btn btn-ghost btn-sm" id="pg-prev"${page <= 1 ? ' disabled' : ''}>‹ Önceki</button>
        <span class="pager-info">${from}–${to} / ${meta.total} • Sayfa ${page}/${pages}</span>
        <button class="btn btn-ghost btn-sm" id="pg-next"${to >= meta.total ? ' disabled' : ''}>Sonraki ›</button>
      </div>` : ''}`;

    el('db-new').addEventListener('click', () => openDbForm(meta, null));
    el('db-export').addEventListener('click', () => exportDbCsv(table));
    const search = el('db-search');
    search.addEventListener('input', () => {
      clearTimeout(dbSearchTimer);
      dbSearchTimer = setTimeout(() => { dbState.q = search.value.trim(); loadDbTable(table, true); }, 300);
    });
    const prev = el('pg-prev');
    if (prev) prev.addEventListener('click', () => { dbState.offset = Math.max(0, dbState.offset - dbState.limit); loadDbTable(table); });
    const next = el('pg-next');
    if (next) next.addEventListener('click', () => { dbState.offset += dbState.limit; loadDbTable(table); });

    qsa('[data-db-edit]', view).forEach((b) => b.addEventListener('click', () => {
      openDbForm(meta, rows.find((r) => String(r[meta.pk]) === b.dataset.dbEdit));
    }));
    qsa('[data-db-del]', view).forEach((b) => b.addEventListener('click', async () => {
      if (!confirm('Bu kaydı silmek istediğinize emin misiniz? İşlem geri alınamaz.')) return;
      try {
        await api(`/db/${table}/${encodeURIComponent(b.dataset.dbDel)}`, { method: 'DELETE' });
        toast('Kayıt silindi.');
        await refreshCounts();
        renderSidebar(); setActive();
        await loadDbTable(table);
      } catch (e) { toast(e.message, 'error'); }
    }));
  }

  async function viewDatabase(initialTable) {
    const isUsers = initialTable === 'users';
    setHeader(isUsers ? 'Kayıtlı Üyeler' : 'Veritabanı',
      isUsers ? 'Sisteme kayıtlı üye hesapları' : 'Tüm tabloları görüntüle; kayıt ekle, düzenle, sil veya CSV indir');
    const tables = await api('/db/tables');
    el('view-content').innerHTML = `
      <div class="panel">
        <div class="toolbar">
          <h2>Tablo Seç</h2>
          <select id="db-table-select">${tables.map((t) => `<option value="${esc(t.name)}">${esc(TABLE_LABELS[t.name] || t.name)} (${t.count})</option>`).join('')}</select>
        </div>
        <div id="db-table-view"></div>
      </div>`;
    const sel = el('db-table-select');
    sel.value = initialTable || (tables[0] ? tables[0].name : 'users');
    dbState.q = ''; dbState.offset = 0;
    sel.addEventListener('change', async () => {
      setHeader(TABLE_LABELS[sel.value] || sel.value, 'Tablo kayıtları');
      dbState.q = ''; dbState.offset = 0;
      await loadDbTable(sel.value);
    });
    await loadDbTable(sel.value);
  }

  // ---------------------------------------------------------
  // Bulten (newsletter)
  // ---------------------------------------------------------
  async function viewNewsletter() {
    setHeader('Bülten', 'Abonelere toplu e-posta gönder');
    const data = await api('/newsletter');
    el('view-content').innerHTML = `
      <div class="stat-grid">
        <div class="stat-card"><b>${data.total}</b><span>Toplam Abone</span></div>
        <div class="stat-card"><b>${data.active}</b><span>Aktif Abone</span></div>
        <div class="stat-card"><b>${data.mailEnabled ? 'Aktif' : 'Test'}</b><span>SMTP Durumu</span></div>
      </div>
      ${data.mailEnabled ? '' : '<div class="panel"><div class="state">SMTP tanımlı değil — gönderimler test modunda konsola yazılır.</div></div>'}
      <div class="panel">
        <div class="toolbar"><h2>Yeni Bülten Gönder</h2></div>
        <form id="newsletter-form" class="form-grid">
          <div class="field full">
            <label for="nl-subject">Konu <span class="req">*</span></label>
            <input id="nl-subject" name="subject" type="text" required placeholder="Örn. Yeni sezon duyurumuz">
          </div>
          <div class="field full">
            <label for="nl-message">Mesaj <span class="req">*</span></label>
            <textarea id="nl-message" name="message" rows="7" required placeholder="Bülten içeriğini yazın... (paragraflar arası boş satır bırakın)"></textarea>
          </div>
          <div class="field full">
            <button class="btn btn-primary" type="submit">Tüm Aktif Abonelere Gönder (${data.active})</button>
          </div>
        </form>
      </div>
      <div class="panel">
        <div class="toolbar"><h2>Son Aboneler</h2>
          <button class="btn btn-ghost btn-sm" id="nl-all">Tümünü Gör</button>
        </div>
        ${data.recent.length ? `<div class="table-wrap"><table class="data">
          <thead><tr><th>E-posta</th><th>Ad</th><th>Durum</th><th>Tarih</th></tr></thead>
          <tbody>${data.recent.map((s) => `<tr>
            <td>${esc(s.email)}</td>
            <td>${esc(s.name || '—')}</td>
            <td>${s.is_active ? '<span class="tag tag-green">Aktif</span>' : '<span class="tag tag-mute">Pasif</span>'}</td>
            <td class="cell-muted">${fmtDateTime(s.created_at)}</td>
          </tr>`).join('')}</tbody>
        </table></div>` : '<div class="state">Henüz abone yok.</div>'}
      </div>`;

    el('newsletter-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const f = ev.target;
      const btn = qs('button[type=submit]', f);
      btn.disabled = true; btn.textContent = 'Gönderiliyor...';
      try {
        const payload = Object.fromEntries(new FormData(f).entries());
        const r = await api('/newsletter', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        toast(`Bülten gönderildi: ${r.sent} başarılı${r.failed ? `, ${r.failed} hatalı` : ''}${r.test ? ' (test modu)' : ''}.`);
        f.reset();
      } catch (e) { toast(e.message, 'error'); }
      finally { btn.disabled = false; btn.textContent = 'Tüm Aktif Abonelere Gönder'; }
    });

    el('nl-all').addEventListener('click', () => { current = 'database'; setActive(); viewDatabase('subscribers'); });
  }

  // ---------------------------------------------------------
  // Denetim kaydi
  // ---------------------------------------------------------
  const AUDIT_ACTIONS = {
    create: { label: 'Ekleme', cls: 'tag-green' },
    update: { label: 'Güncelleme', cls: 'tag-amber' },
    delete: { label: 'Silme', cls: 'tag-red' },
    login: { label: 'Giriş', cls: 'tag-cyan' },
    settings: { label: 'Ayarlar', cls: 'tag-mute' },
    password: { label: 'Şifre', cls: 'tag-amber' },
    export: { label: 'Dışa aktarma', cls: 'tag-mute' },
  };

  async function viewAuditLog() {
    setHeader('Denetim Kaydı', 'Yönetim panelinde yapılan son işlemler');
    const rows = await api('/audit-log');
    el('view-content').innerHTML = `
      <div class="panel">
        <div class="toolbar"><h2>İşlem Geçmişi <span class="muted">(${rows.length})</span></h2>
          <button class="btn btn-ghost btn-sm" id="audit-refresh">↻ Yenile</button>
        </div>
        <div class="table-wrap">${rows.length ? `<table class="data">
          <thead><tr><th>Tarih</th><th>Kullanıcı</th><th>İşlem</th><th>Varlık</th><th>Kayıt</th><th>Detay</th></tr></thead>
          <tbody>${rows.map((r) => {
            const a = AUDIT_ACTIONS[r.action] || { label: r.action, cls: 'tag-mute' };
            return `<tr>
              <td class="cell-muted">${fmtDateTime(r.created_at)}</td>
              <td>${esc(r.username || '—')}</td>
              <td>${tag(a.label, a.cls)}</td>
              <td>${esc(TABLE_LABELS[r.entity] || r.entity)}</td>
              <td class="cell-muted">${esc(r.entity_id || '—')}</td>
              <td class="cell-muted">${esc(r.details || '—')}</td>
            </tr>`;
          }).join('')}</tbody>
        </table>` : '<div class="state">Henüz kayıtlı işlem yok.</div>'}</div>
      </div>`;
    el('audit-refresh').addEventListener('click', () => viewAuditLog());
  }

  // ---------------------------------------------------------
  // Site ayarlari
  // ---------------------------------------------------------
  async function viewSettings() {
    setHeader('Site Ayarları', 'Site genel bilgileri ve iletişim detayları');
    const s = await api('/settings');
    el('view-content').innerHTML = `
      <div class="panel">
        <div class="toolbar"><h2>Genel Bilgiler</h2></div>
        <form id="settings-form" class="form-grid">
          ${SETTINGS_FIELDS.map((f) => fieldHtml(f, s[f.name])).join('')}
          <div class="field full"><button class="btn btn-primary" type="submit">Ayarları Kaydet</button></div>
        </form>
      </div>
      <div class="panel">
        <div class="toolbar"><h2>Şifre Değiştir</h2></div>
        <div id="pw-alert" class="alert hidden"></div>
        <form id="pw-form" class="form-grid">
          <div class="field"><label>Mevcut Şifre</label><input type="password" name="currentPassword" required></div>
          <div class="field"><label>Yeni Şifre</label><input type="password" name="newPassword" required></div>
          <div class="field full"><button class="btn btn-ghost" type="submit">Şifreyi Güncelle</button></div>
        </form>
      </div>`;

    el('settings-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      const btn = qs('button[type=submit]', form);
      btn.disabled = true; btn.textContent = 'Kaydediliyor...';
      try {
        const data = {};
        for (const f of SETTINGS_FIELDS) {
          const input = form.elements[f.name];
          if (input) data[f.name] = input.value;
        }
        await api('/settings', { method: 'PUT', body: JSON.stringify(data) });
        toast('Ayarlar kaydedildi.');
      } catch (e) { toast(e.message, 'error'); }
      finally { btn.disabled = false; btn.textContent = 'Ayarları Kaydet'; }
    });

    el('pw-form').addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const form = ev.target;
      const alertBox = el('pw-alert');
      const btn = qs('button[type=submit]', form);
      btn.disabled = true;
      try {
        await api('/password', {
          method: 'PUT',
          body: JSON.stringify({ currentPassword: form.elements.currentPassword.value, newPassword: form.elements.newPassword.value }),
        });
        form.reset();
        alertBox.className = 'alert alert-success';
        alertBox.textContent = 'Şifreniz güncellendi.';
        alertBox.classList.remove('hidden');
        toast('Şifre güncellendi.');
      } catch (e) {
        alertBox.className = 'alert alert-error';
        alertBox.textContent = e.message;
        alertBox.classList.remove('hidden');
      } finally { btn.disabled = false; }
    });
  }

  // ---------------------------------------------------------
  // Modal
  // ---------------------------------------------------------
  let modalSubmit = null;
  function openModal({ title, bodyHtml, confirmLabel, wide, onSubmit }) {
    modalSubmit = onSubmit;
    el('modal-root').innerHTML = `
      <div class="modal-backdrop" id="modal-backdrop">
        <div class="modal ${wide ? 'modal-wide' : ''}">
          <div class="modal-head"><h3>${esc(title)}</h3><button class="modal-close" id="modal-x">×</button></div>
          <div class="modal-body">
            <div id="modal-alert" class="alert alert-error hidden"></div>
            ${bodyHtml}
          </div>
          <div class="modal-foot">
            <button class="btn btn-ghost" id="modal-cancel">Vazgeç</button>
            <button class="btn btn-primary" id="modal-confirm">${esc(confirmLabel || 'Kaydet')}</button>
          </div>
        </div>
      </div>`;
    el('modal-x').addEventListener('click', closeModal);
    el('modal-cancel').addEventListener('click', closeModal);
    el('modal-backdrop').addEventListener('mousedown', (e) => { if (e.target.id === 'modal-backdrop') closeModal(); });
    el('modal-confirm').addEventListener('click', async () => {
      const form = qs('#modal-body form') || qs('.modal-body form');
      const alertBox = el('modal-alert');
      alertBox.classList.add('hidden');
      if (form && !form.reportValidity()) return;
      const btn = el('modal-confirm');
      btn.disabled = true; btn.textContent = 'Kaydediliyor...';
      try {
        await modalSubmit(form);
      } catch (e) {
        alertBox.textContent = e.message;
        alertBox.classList.remove('hidden');
      } finally {
        btn.disabled = false; btn.textContent = confirmLabel || 'Kaydet';
      }
    });
  }

  function closeModal() { el('modal-root').innerHTML = ''; modalSubmit = null; }

  // ---------------------------------------------------------
  document.addEventListener('DOMContentLoaded', init);
})();
