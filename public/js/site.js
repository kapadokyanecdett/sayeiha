/* ============================================================
   SAYE - On yuz scripti
   Ortak bilesenler (header/footer) + sayfaya ozel mantik
   ============================================================ */
(function () {
  'use strict';

  const API = '/api';
  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];

  // ---------------------------------------------------------
  // Yardimcilar
  // ---------------------------------------------------------
  async function api(path, options) {
    const opts = Object.assign({}, options);
    const token = getUserToken();
    if (token) {
      opts.headers = Object.assign({}, opts.headers, { Authorization: 'Bearer ' + token });
    }
    const res = await fetch(API + path, opts);
    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
    if (!res.ok) {
      const err = new Error((data && data.error) || `İstek başarısız (${res.status})`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  function esc(v) {
    return String(v == null ? '' : v)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function el(id) { return document.getElementById(id); }
  function qs(sel, root) { return (root || document).querySelector(sel); }
  function qsa(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  function parseDate(s) {
    const m = String(s || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    return { y: Number(m[1]), mo: Number(m[2]), d: Number(m[3]) };
  }

  function fmtDate(s) {
    const p = parseDate(s);
    return p ? `${p.d} ${MONTHS[p.mo - 1]} ${p.y}` : '';
  }

  function dateParts(s) {
    const p = parseDate(s);
    if (!p) return { day: '', month: '', year: '' };
    return { day: String(p.d).padStart(2, '0'), month: MONTHS[p.mo - 1], year: p.y, weekday: DAYS[new Date(p.y, p.mo - 1, p.d).getDay()] };
  }

  function initials(name) {
    return String(name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w.charAt(0).toUpperCase()).join('');
  }

  /** Avatar icerigini dondurur: fotograf varsa img, yoksa bas harfler. */
  function avatarInner(user, name) {
    const src = user && user.avatar;
    return src ? `<img class="avatar-img" src="${esc(src)}" alt="">` : esc(initials(name));
  }

  /** <div class="auth-avatar ..."> icin hazir avatar blogu uretir. */
  function avatarBlock(user, name, extraClass, id) {
    const has = !!(user && user.avatar);
    return `<div class="auth-avatar${has ? ' has-img' : ''}${extraClass ? ' ' + extraClass : ''}"${id ? ` id="${id}"` : ''}>${avatarInner(user, name)}</div>`;
  }

  // Kurucu olan uyeleri yildizla isaretler (role alaninda "Kurucu" gecerse).
  function isFounder(m) {
    return /kurucu/i.test((m && m.role) || '');
  }

  function toParagraphs(text) {
    if (!text) return '';
    return String(text).split(/\n{2,}/).map((block) => {
      const lines = block.split('\n').filter((l) => l.trim() !== '');
      if (lines.every((l) => /^\s*[-*•]\s+/.test(l))) {
        return '<ul>' + lines.map((l) => `<li>${esc(l.replace(/^\s*[-*•]\s+/, ''))}</li>`).join('') + '</ul>';
      }
      return `<p>${esc(block).replace(/\n/g, '<br>')}</p>`;
    }).join('');
  }

  // Veritabanindaki "YYYY-MM-DD HH:MM:SS" (UTC) degerini yerel saate cevirir
  function toDate(s) {
    const d = new Date(String(s || '').replace(' ', 'T') + 'Z');
    return isNaN(d.getTime()) ? null : d;
  }

  function fmtDateTimeTR(s) {
    const d = toDate(s);
    if (!d) return String(s || '');
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}, ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
  }

  function timeAgo(s) {
    const d = toDate(s);
    if (!d) return '';
    const diff = Math.floor((Date.now() - d.getTime()) / 1000);
    if (diff < 60) return 'az önce';
    if (diff < 3600) return Math.floor(diff / 60) + ' dk önce';
    if (diff < 86400) return Math.floor(diff / 3600) + ' saat önce';
    if (diff < 604800) return Math.floor(diff / 86400) + ' gün önce';
    return fmtDate(s);
  }

  const HEART_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20.3 4.6 13a4.6 4.6 0 0 1 6.5-6.5l.9.9.9-.9A4.6 4.6 0 1 1 19.4 13z"/></svg>';
  const BOOKMARK_ICON = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M6 3.5h12a.5.5 0 0 1 .5.5v16.5L12 16.8 5.5 20.5V4a.5.5 0 0 1 .5-.5z"/></svg>';

  // Listelerdeki begeni butonlarini baglar (haber / duyuru)
  function bindLikeButtons(root) {
    qsa('[data-like]', root || document).forEach((b) => {
      if (b.dataset.bound) return;
      b.dataset.bound = '1';
      b.addEventListener('click', async (ev) => {
        ev.preventDefault();
        if (!getUser()) { openAuth(); return; }
        b.disabled = true;
        try {
          const r = await api('/like', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_type: b.dataset.likeType, target_id: Number(b.dataset.like) }),
          });
          b.classList.toggle('on', r.liked);
          b.setAttribute('aria-pressed', r.liked ? 'true' : 'false');
          const num = qs('.like-num', b);
          if (num) num.textContent = r.likes;
        } catch (e) {
          toast(e.message, 'error');
        } finally {
          b.disabled = false;
        }
      });
    });
  }

  // ---------------------------------------------------------
  // Favoriler / kaydedilenler
  // ---------------------------------------------------------
  let favCache = null; // "type:id" kumesi (giris yapmis uye icin)

  async function loadFavorites(force) {
    if (!getUser()) { favCache = null; return new Set(); }
    if (favCache && !force) return favCache;
    try {
      const rows = await api('/me/favorites');
      favCache = new Set(rows.map((r) => r.target_type + ':' + r.target_id));
    } catch (e) { favCache = new Set(); }
    return favCache;
  }

  /** Kaydet butonlarinin durumunu sunucudaki favorilerle esitler. */
  async function syncFavoriteButtons(root) {
    const btns = qsa('[data-fav]', root || document);
    if (!btns.length) return;
    const set = await loadFavorites();
    btns.forEach((b) => {
      const on = set.has(b.dataset.favType + ':' + b.dataset.fav);
      b.classList.toggle('on', on);
      b.setAttribute('aria-pressed', on ? 'true' : 'false');
      b.title = on ? 'Favorilerden çıkar' : 'Favorilere ekle';
      const lbl = qs('.fav-label', b);
      if (lbl) lbl.textContent = on ? 'Kaydedildi' : 'Kaydet';
    });
  }

  /** Kaydet butonlarini baglar (haber / duyuru). */
  function bindFavoriteButtons(root) {
    qsa('[data-fav]', root || document).forEach((b) => {
      if (b.dataset.favBound) return;
      b.dataset.favBound = '1';
      b.addEventListener('click', async (ev) => {
        ev.preventDefault();
        if (!getUser()) { openAuth(); return; }
        b.disabled = true;
        try {
          const r = await api('/favorites', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_type: b.dataset.favType, target_id: Number(b.dataset.fav) }),
          });
          b.classList.toggle('on', r.saved);
          b.setAttribute('aria-pressed', r.saved ? 'true' : 'false');
          b.title = r.saved ? 'Favorilerden çıkar' : 'Favorilere ekle';
          const lbl = qs('.fav-label', b);
          if (lbl) lbl.textContent = r.saved ? 'Kaydedildi' : 'Kaydet';
          toast(r.saved ? 'Favorilere eklendi.' : 'Favorilerden çıkarıldı.');
          if (favCache) {
            const key = b.dataset.favType + ':' + b.dataset.fav;
            if (r.saved) favCache.add(key); else favCache.delete(key);
          }
          b.dispatchEvent(new CustomEvent('fav-toggle', { detail: { saved: r.saved } }));
        } catch (e) { toast(e.message, 'error'); }
        finally { b.disabled = false; }
      });
    });
    syncFavoriteButtons(root);
  }

  function toast(message, type) {
    let wrap = qs('.toast-wrap');
    if (!wrap) {
      wrap = document.createElement('div');
      wrap.className = 'toast-wrap';
      document.body.appendChild(wrap);
    }
    const t = document.createElement('div');
    t.className = 'toast ' + (type || 'success');
    t.textContent = message;
    wrap.appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(10px)'; }, 3600);
    setTimeout(() => t.remove(), 4100);
  }

  function emptyState(target, text) {
    target.innerHTML = `<div class="state">${esc(text || 'Gösterilecek içerik bulunamadı.')}</div>`;
  }

  function skeletons(target, count, cls) {
    target.innerHTML = Array.from({ length: count }).map(() => `<div class="skeleton ${cls || ''}"></div>`).join('');
  }

  function tagClass(type) {
    const map = {
      'Haber': 'tag', 'Blog': 'tag-cyan', 'Başarı': 'tag-green', 'Etkinlik': 'tag-amber',
      'Acil': 'tag-red', 'Yarışma': 'tag-amber', 'Başvuru': 'tag-green', 'Genel': 'tag-mute',
      'Platin': 'tag-cyan', 'Altın': 'tag-amber', 'Gümüş': 'tag-mute', 'Bronz': 'tag-mute',
    };
    return map[type] || 'tag';
  }

  // ---------------------------------------------------------
  // Tema (acik / koyu)
  // ---------------------------------------------------------
  const THEME_KEY = 'saye-theme';

  function getTheme() {
    return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
  }

  function setTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* yoksay */ }
    const btn = el('theme-toggle');
    if (btn) btn.setAttribute('title', theme === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç');
  }

  function toggleTheme() {
    setTheme(getTheme() === 'light' ? 'dark' : 'light');
  }

  // ---------------------------------------------------------
  // Uye oturumu (kayit / giris)
  // ---------------------------------------------------------
  const USER_TOKEN_KEY = 'saye-user-token';
  const USER_INFO_KEY = 'saye-user';

  function getUser() {
    try {
      const raw = localStorage.getItem(USER_INFO_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function getUserToken() {
    try { return localStorage.getItem(USER_TOKEN_KEY); } catch (e) { return null; }
  }

  function setUser(token, user) {
    try {
      localStorage.setItem(USER_TOKEN_KEY, token);
      localStorage.setItem(USER_INFO_KEY, JSON.stringify(user));
    } catch (e) { /* yoksay */ }
  }

  function clearUser() {
    try {
      localStorage.removeItem(USER_TOKEN_KEY);
      localStorage.removeItem(USER_INFO_KEY);
    } catch (e) { /* yoksay */ }
  }

  async function logoutUser() {
    const token = getUserToken();
    clearUser();
    try {
      if (token) {
        await api('/logout', { method: 'POST', headers: { Authorization: 'Bearer ' + token } });
      }
    } catch (e) { /* oturum zaten gecersiz olabilir */ }
  }

  // ---------------------------------------------------------
  // Site ici arama (Ctrl+K komut paleti)
  // ---------------------------------------------------------
  const QUICK_LINKS = [
    { type: 'Sayfa', title: 'Ana Sayfa', desc: 'Öne çıkan içerikler', url: '/' },
    { type: 'Sayfa', title: 'Takımımız', desc: 'Üyeler ve birimler', url: '/takim' },
    { type: 'Sayfa', title: 'İHA’mız', desc: 'Teknik özellikler', url: '/arac' },
    { type: 'Sayfa', title: 'Haberler & Blog', desc: 'Takımdan gelişmeler', url: '/haberler' },
    { type: 'Sayfa', title: 'Duyurular', desc: 'Resmi duyurular', url: '/duyurular' },
    { type: 'Sayfa', title: 'Faaliyet Alanları', desc: 'Çalışma disiplinleri', url: '/faaliyetler' },
    { type: 'Sayfa', title: 'Sponsorlarımız', desc: 'Bizi destekleyen kurumlar', url: '/sponsorlar' },
    { type: 'Sayfa', title: 'Kariyer', desc: 'Açık pozisyonlar', url: '/kariyer' },
    { type: 'Sayfa', title: 'İletişim', desc: 'Bize ulaşın', url: '/iletisim' },
    { type: 'Hesap', title: 'Giriş Yap', desc: 'Üye girişi', url: '/giris' },
    { type: 'Hesap', title: 'Kayıt Ol', desc: 'Yeni hesap oluştur', url: '/kayit' },
  ];

  let searchOverlay = null;
  let searchInput = null;
  let searchResults = null;
  let searchItems = [];
  let searchIndex = -1;
  let searchTimer = null;

  function highlight(text, term) {
    const safe = esc(text || '');
    const t = String(term || '').trim();
    if (!t) return safe;
    const re = new RegExp('(' + t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi');
    return safe.replace(re, '<mark>$1</mark>');
  }

  function buildSearchUI() {
    if (searchOverlay) return;
    searchOverlay = document.createElement('div');
    searchOverlay.className = 'search-overlay';
    searchOverlay.id = 'search-overlay';
    searchOverlay.hidden = true;
    searchOverlay.innerHTML = `
      <div class="search-modal" role="dialog" aria-modal="true" aria-label="Site içi arama">
        <div class="search-bar">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
          <input id="search-input" type="text" placeholder="Haber, duyuru, ekip üyesi veya İHA ara..." autocomplete="off" spellcheck="false">
          <button class="esc" type="button" id="search-close">Esc</button>
        </div>
        <div class="search-results" id="search-results"></div>
        <div class="search-foot"><span>↑ ↓ gez</span><span>Enter ile aç</span><span>Esc kapat</span></div>
      </div>`;
    document.body.appendChild(searchOverlay);

    searchInput = el('search-input');
    searchResults = el('search-results');

    searchOverlay.addEventListener('mousedown', (e) => { if (e.target === searchOverlay) closeSearch(); });
    el('search-close').addEventListener('click', closeSearch);
    searchInput.addEventListener('input', () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => runSearch(searchInput.value), 200);
    });
    searchInput.addEventListener('keydown', onSearchKey);
  }

  function renderSearchResults(list, term) {
    searchItems = list;
    searchIndex = list.length ? 0 : -1;

    if (!list.length) {
      searchResults.innerHTML = term
        ? `<div class="search-empty">“${esc(term)}” için sonuç bulunamadı.</div>`
        : '<div class="search-empty">Aramak için yazmaya başlayın.</div>';
      return;
    }

    // Ayni turdeki sonuclari grupla (sirayi korur)
    const groups = [];
    list.forEach((item) => {
      let g = groups.find((x) => x.type === item.type);
      if (!g) { g = { type: item.type, items: [] }; groups.push(g); }
      g.items.push(item);
    });

    let html = '';
    let i = 0;
    groups.forEach((g) => {
      html += `<div class="search-group-label">${esc(g.type)}</div>`;
      g.items.forEach((item) => {
        html += `
          <button class="search-item" type="button" data-idx="${i}">
            <span class="si-type">${esc(item.type)}</span>
            <span class="si-body">
              <span class="si-title">${highlight(item.title, term)}</span>
              ${item.desc || item.meta ? `<span class="si-desc">${highlight(item.desc || item.meta, term)}</span>` : ''}
            </span>
          </button>`;
        i += 1;
      });
    });
    searchResults.innerHTML = html;

    qsa('.search-item', searchResults).forEach((b) => {
      b.addEventListener('click', () => goSearchItem(Number(b.dataset.idx)));
      b.addEventListener('mousemove', () => setSearchActive(Number(b.dataset.idx)));
    });
    setSearchActive(0);
  }

  function setSearchActive(idx) {
    if (idx < 0 || idx >= searchItems.length) return;
    searchIndex = idx;
    qsa('.search-item', searchResults).forEach((b) => {
      const on = Number(b.dataset.idx) === idx;
      b.classList.toggle('active', on);
      if (on && b.scrollIntoView) b.scrollIntoView({ block: 'nearest' });
    });
  }

  function goSearchItem(idx) {
    const item = searchItems[idx];
    if (item && item.url) location.href = item.url;
  }

  function onSearchKey(e) {
    if (e.key === 'ArrowDown') { e.preventDefault(); setSearchActive(Math.min(searchIndex + 1, searchItems.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setSearchActive(Math.max(searchIndex - 1, 0)); }
    else if (e.key === 'Enter') { e.preventDefault(); if (searchIndex >= 0) goSearchItem(searchIndex); }
    else if (e.key === 'Escape') { e.preventDefault(); closeSearch(); }
  }

  async function runSearch(q) {
    const term = String(q || '').trim();
    if (term.length < 2) { renderSearchResults(QUICK_LINKS, ''); return; }
    searchResults.innerHTML = '<div class="search-empty">Aranıyor...</div>';
    let data;
    try {
      data = await api('/search?q=' + encodeURIComponent(term));
    } catch (e) {
      searchResults.innerHTML = '<div class="search-empty">Arama sırasında bir hata oluştu.</div>';
      return;
    }
    if (searchInput.value.trim() !== term) return; // daha yeni bir istek var
    renderSearchResults((data && data.results) || [], term);
  }

  function openSearch() {
    buildSearchUI();
    searchOverlay.hidden = false;
    document.body.classList.add('no-scroll');
    searchInput.value = '';
    renderSearchResults(QUICK_LINKS, '');
    setTimeout(() => searchInput.focus(), 30);
  }

  function closeSearch() {
    if (!searchOverlay) return;
    searchOverlay.hidden = true;
    document.body.classList.remove('no-scroll');
    searchIndex = -1;
  }

  function initSearch() {
    buildSearchUI();
    window.addEventListener('keydown', (e) => {
      if ((e.key === 'k' || e.key === 'K') && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        if (searchOverlay.hidden) openSearch(); else closeSearch();
      }
    });
  }

  // ---------------------------------------------------------
  // Haber okuma deneyimi: ilerleme + paylasim
  // ---------------------------------------------------------
  const SHARE_ICONS = {
    X: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
    LinkedIn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 1 1 8.3 6.5a1.78 1.78 0 0 1-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0 0 13 14.19a.66.66 0 0 0 0 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 0 1 2.7-1.4c1.55 0 3.36.86 3.36 3.66z"/></svg>',
    WhatsApp: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12.04 2C6.58 2 2.13 6.45 2.13 11.91c0 1.75.46 3.45 1.32 4.95L2 22l5.25-1.38a9.9 9.9 0 0 0 4.79 1.22c5.46 0 9.91-4.45 9.91-9.91C21.96 6.45 17.5 2 12.04 2zm5.8 14.05c-.24.68-1.4 1.3-1.93 1.35-.53.05-1.03.24-3.47-.72-2.94-1.16-4.79-4.19-4.94-4.39-.14-.19-1.16-1.55-1.16-2.96 0-1.41.73-2.1 1-2.39.26-.29.58-.36.77-.36.19 0 .39 0 .55.01.18.01.42-.07.65.5.24.58.82 2 .89 2.15.07.14.12.31.02.5-.1.19-.15.31-.29.48-.15.17-.3.38-.44.51-.14.14-.29.29-.12.58.17.29.75 1.24 1.61 2.01 1.11.99 2.04 1.29 2.33 1.44.29.14.46.12.63-.07.17-.19.72-.84.91-1.13.19-.29.39-.24.65-.14.26.1 1.68.79 1.97.94.29.14.48.22.55.34.07.13.07.75-.17 1.43z"/></svg>',
    Link: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M10 13a5 5 0 0 0 7.1 0l3-3a5 5 0 0 0-7.1-7.1L11.3 4.6"/><path d="M14 11a5 5 0 0 0-7.1 0l-3 3a5 5 0 0 0 7.1 7.1l1.7-1.7"/></svg>',
  };

  function initReadingProgress(articleEl, endEl) {
    const bar = qs('.read-progress', articleEl);
    const fill = bar ? qs('.read-fill', bar) : null;
    const pctEl = el('read-pct');
    if (!fill) return;

    const startY = articleEl.getBoundingClientRect().top + window.scrollY;
    const endY = (endEl || articleEl).getBoundingClientRect().bottom + window.scrollY;
    let ticking = false;

    function update() {
      ticking = false;
      const total = Math.max(endY - startY - window.innerHeight, 1);
      const scrolled = Math.min(Math.max(window.scrollY - startY, 0), total);
      const pct = Math.round((scrolled / total) * 100);
      fill.style.width = pct + '%';
      if (pctEl) pctEl.textContent = '%' + pct + ' okundu';
    }
    function onScroll() { if (!ticking) { ticking = true; window.requestAnimationFrame(update); } }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();
  }

  function initShareButtons(root) {
    const btn = qs('#copy-link', root);
    if (!btn) return;
    btn.addEventListener('click', async () => {
      const url = location.href;
      try {
        if (navigator.clipboard && navigator.clipboard.writeText) {
          await navigator.clipboard.writeText(url);
        } else {
          const tmp = document.createElement('textarea');
          tmp.value = url; tmp.setAttribute('readonly', '');
          tmp.style.position = 'fixed'; tmp.style.opacity = '0';
          document.body.appendChild(tmp); tmp.select(); document.execCommand('copy'); tmp.remove();
        }
        toast('Bağlantı kopyalandı.');
      } catch (e) {
        toast('Bağlantı kopyalanamadı.', 'error');
      }
    });
  }

  // ---------------------------------------------------------
  // Header / Footer
  // ---------------------------------------------------------
  // Ust seviye basliklar; "children" varsa hover ile acilan panel gosterilir
  const NAV = [
    { href: '/', label: 'Ana Sayfa', page: 'home' },
    {
      href: '/takim', label: 'Takım', page: 'takim',
      children: [
        { href: '/takim', label: 'Takımımız', desc: 'Üyeler, birimler ve ekip yapısı', page: 'takim' },
        { href: '/faaliyetler', label: 'Faaliyet Alanları', desc: 'Mühendislik ve çalışma disiplinleri', page: 'faaliyetler' },
        { href: '/kariyer', label: 'Kariyer', desc: 'Açık pozisyonlar ve başvuru', page: 'kariyer' },
      ],
    },
    { href: '/arac', label: 'İHA’mız', page: 'arac' },
    {
      href: '/haberler', label: 'Haberler', page: 'haberler',
      children: [
        { href: '/haberler', label: 'Haberler & Blog', desc: 'Takımdan son gelişmeler', page: 'haberler' },
        { href: '/duyurular', label: 'Duyurular', desc: 'Resmi duyurular ve bildirimler', page: 'duyurular' },
      ],
    },
    {
      href: '/sponsorlar', label: 'Destek', page: 'sponsorlar',
      children: [
        { href: '/sponsorlar', label: 'Sponsorlarımız', desc: 'Bizi destekleyen kurumlar', page: 'sponsorlar' },
        { href: '/iletisim', label: 'İletişim', desc: 'Sponsorluk ve iş birliği', page: 'iletisim' },
      ],
    },
  ];
  const ACTIVE_ALIAS = { haber: 'haberler' };

  function renderNavItem(item, active) {
    const inSection = item.page === active || (item.children || []).some((c) => c.page === active);
    if (!item.children) {
      return `<a href="${item.href}" class="${item.page === active ? 'active' : ''}">${esc(item.label)}</a>`;
    }
    const sub = item.children.map((c) =>
      `<a href="${c.href}"><b>${esc(c.label)}</b>${c.desc ? `<span>${esc(c.desc)}</span>` : ''}</a>`
    ).join('');
    return `
      <div class="nav-item has-drop">
        <a class="nav-link ${inSection ? 'active' : ''}" href="${item.href}">
          ${esc(item.label)}<span class="caret" aria-hidden="true"></span>
        </a>
        <div class="nav-drop"><div class="nav-drop-inner">${sub}</div></div>
      </div>`;
  }

  function renderHeader(settings) {
    const host = el('site-header');
    if (!host) return;
    const current = document.body.dataset.page || 'home';
    const active = ACTIVE_ALIAS[current] || current;
    const links = NAV.map((n) => renderNavItem(n, active)).join('');

    const user = getUser();
    const userIcon = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/></svg>';
    const userName = user ? esc(user.first_name + ' ' + user.last_name) : '';
    const userAvatar = user && user.avatar ? `<img class="user-btn-img" src="${esc(user.avatar)}" alt="">` : userIcon;
    const userTools = `<button class="tool-btn user-btn${user && user.avatar ? ' has-img' : ''}" type="button" id="user-open" title="${user ? userName : 'Giriş / Kayıt'}" aria-label="${user ? 'Hesabım' : 'Giriş veya kayıt'}">${userAvatar}</button>`;
    host.className = 'site-header';
    host.innerHTML = `
      <div class="topstrip">
        <div class="container">
          <div class="ts-left">
            <span class="ts-dot"></span>
            <span>${esc(settings.competition || 'Teknofest Savaşan İHA')}</span>
          </div>
          <div class="ts-right">
            ${settings.email ? `<a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a>` : ''}
            ${settings.phone ? `<a href="tel:${esc(String(settings.phone).replace(/\s/g, ''))}">${esc(settings.phone)}</a>` : ''}
          </div>
        </div>
      </div>
      <div class="container">
        <a class="brand" href="/">
          <img class="brand-logo" src="/assets/logo.png" alt="${esc(settings.site_name || 'SAYE')}">
        </a>
        <nav class="nav" id="main-nav">
          ${links}
          <a class="nav-cta" href="/iletisim">Sponsor Ol</a>
        </nav>
        <div class="nav-tools">
          <button class="tool-btn" type="button" id="search-open" aria-label="Site içi arama (Ctrl+K)">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.6-3.6"/></svg>
            <span class="tool-label">Ara</span>
            <kbd>Ctrl K</kbd>
          </button>
          <button class="tool-btn theme-toggle" type="button" id="theme-toggle" aria-label="Açık/koyu temayı değiştir" title="${getTheme() === 'light' ? 'Koyu temaya geç' : 'Açık temaya geç'}">
            <svg class="ico-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8z"/></svg>
            <svg class="ico-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="4.2"/><path d="M12 2v2.2M12 19.8V22M2 12h2.2M19.8 12H22M4.9 4.9l1.6 1.6M17.5 17.5l1.6 1.6M19.1 4.9l-1.6 1.6M6.5 17.5l-1.6 1.6"/></svg>
          </button>
          ${userTools}
        </div>
        <button class="nav-toggle" id="nav-toggle" aria-label="Menüyü aç/kapat"><span></span></button>
      </div>`;

    const toggle = el('nav-toggle');
    const nav = el('main-nav');
    toggle.addEventListener('click', () => nav.classList.toggle('open'));
    qsa('.nav a', nav).forEach((a) => a.addEventListener('click', () => nav.classList.remove('open')));

    const themeBtn = el('theme-toggle');
    if (themeBtn) themeBtn.addEventListener('click', toggleTheme);
    const searchBtn = el('search-open');
    if (searchBtn) searchBtn.addEventListener('click', openSearch);
    const userBtn = el('user-open');
    if (userBtn) userBtn.addEventListener('click', () => { if (authOverlay && !authOverlay.hidden) closeAuth(); else openAuth(); });
  }

  // Sosyal medya SVG ikonlari
  const SOCIAL_ICONS = {
    Instagram: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="2" width="20" height="20" rx="5"/><circle cx="12" cy="12" r="4"/><circle cx="17.5" cy="6.5" r="1.2" fill="currentColor" stroke="none"/></svg>',
    LinkedIn: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M20.5 2h-17A1.5 1.5 0 0 0 2 3.5v17A1.5 1.5 0 0 0 3.5 22h17a1.5 1.5 0 0 0 1.5-1.5v-17A1.5 1.5 0 0 0 20.5 2zM8 19H5v-9h3zM6.5 8.25A1.75 1.75 0 1 1 8.3 6.5a1.78 1.78 0 0 1-1.8 1.75zM19 19h-3v-4.74c0-1.42-.6-1.93-1.38-1.93A1.74 1.74 0 0 0 13 14.19a.66.66 0 0 0 0 .14V19h-3v-9h2.9v1.3a3.11 3.11 0 0 1 2.7-1.4c1.55 0 3.36.86 3.36 3.66z"/></svg>',
    YouTube: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M23 7.5a3 3 0 0 0-2.1-2.1C19 5 12 5 12 5s-7 0-8.9.4A3 3 0 0 0 1 7.5C.6 9.4.6 12 .6 12s0 2.6.4 4.5a3 3 0 0 0 2.1 2.1C5 19 12 19 12 19s7 0 8.9-.4a3 3 0 0 0 2.1-2.1c.4-1.9.4-4.5.4-4.5s0-2.6-.4-4.5zM9.75 15.02V8.98L15.5 12z"/></svg>',
    GitHub: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 .5C5.73.5.5 5.73.5 12c0 5.08 3.29 9.39 7.86 10.91.58.11.79-.25.79-.56v-2c-3.2.7-3.88-1.37-3.88-1.37-.52-1.33-1.28-1.69-1.28-1.69-1.05-.72.08-.7.08-.7 1.16.08 1.77 1.19 1.77 1.19 1.03 1.77 2.71 1.26 3.37.96.1-.75.4-1.26.73-1.55-2.55-.29-5.24-1.28-5.24-5.69 0-1.26.45-2.28 1.19-3.09-.12-.29-.52-1.46.11-3.05 0 0 .97-.31 3.18 1.18a11.06 11.06 0 0 1 5.8 0c2.21-1.49 3.18-1.18 3.18-1.18.63 1.59.23 2.76.11 3.05.74.81 1.19 1.83 1.19 3.09 0 4.42-2.7 5.39-5.26 5.68.41.36.78 1.05.78 2.12v3.14c0 .31.21.68.8.56A11.51 11.51 0 0 0 23.5 12C23.5 5.73 18.27.5 12 .5z"/></svg>',
    Twitter: '<svg viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>',
  };

  function renderFooter(settings) {
    const host = el('site-footer');
    if (!host) return;
    const year = new Date().getFullYear();
    const socials = [
      ['Instagram', settings.instagram], ['LinkedIn', settings.linkedin],
      ['YouTube', settings.youtube], ['GitHub', settings.github],
      ['Twitter', settings.twitter],
    ].filter((s) => s[1]);
    host.className = 'site-footer';
    host.innerHTML = `
      <div class="container">
        <div class="footer-grid">
          <div>
            <a class="brand" href="/" style="margin-bottom:14px">
              <img class="brand-logo" src="/assets/logo.png" alt="${esc(settings.site_name || 'SAYE')}">
            </a>
            ${settings.about ? `<p class="footer-about">${esc(settings.about)}</p>` : ''}
            ${socials.length ? `<div class="social-row">${socials.map((s) => `<a href="${esc(s[1])}" target="_blank" rel="noopener" aria-label="${s[0]}" title="${s[0]}">${SOCIAL_ICONS[s[0]] || s[0].slice(0, 2)}</a>`).join('')}</div>` : ''}
            <form class="newsletter-form" id="newsletter-form" novalidate>
              <label for="nl-email">Bültene abone ol</label>
              <div class="nl-row">
                <input id="nl-email" name="email" type="email" required autocomplete="email" placeholder="E-posta adresin">
                <button class="btn btn-primary btn-sm" type="submit">Abone Ol</button>
              </div>
              <span class="nl-note">Yeni haber ve duyuruları e-postana gönderelim.</span>
            </form>
          </div>
          <div>
            <h4>Kurumsal</h4>
            <a href="/takim">Takımımız</a>
            <a href="/arac">İHA’mız</a>
            <a href="/faaliyetler">Faaliyet Alanları</a>
            <a href="/kariyer">Kariyer</a>
          </div>
          <div>
            <h4>İçerik</h4>
            <a href="/haberler">Haberler & Blog</a>
            <a href="/duyurular">Duyurular</a>
            <a href="/sponsorlar">Sponsorlar</a>
            <a href="/iletisim">İletişim</a>
          </div>
          <div>
            <h4>İletişim</h4>
            ${settings.email ? `<a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a>` : ''}
            ${settings.phone ? `<a href="tel:${esc(String(settings.phone).replace(/\s/g, ''))}">${esc(settings.phone)}</a>` : ''}
            ${settings.address ? `<span class="footer-about" style="display:block;padding-top:6px">${esc(settings.address)}</span>` : ''}
          </div>
        </div>
        <div class="footer-bottom">
          <span>© ${year} ${esc(settings.site_name || 'SAYE')}. Tüm hakları saklıdır.</span>
          <span>${esc(settings.competition || 'Teknofest Savaşan İHA')}</span>
        </div>
      </div>`;

    // Bulten abonelik formu
    const nlForm = el('newsletter-form');
    if (nlForm) {
      nlForm.addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const input = qs('input[name=email]', nlForm);
        const btn = qs('button[type=submit]', nlForm);
        const email = (input.value || '').trim();
        if (!email) { toast('Lütfen e-posta adresinizi girin.', 'error'); input.focus(); return; }
        btn.disabled = true;
        const label = btn.textContent;
        btn.textContent = 'Gönderiliyor...';
        try {
          await api('/subscribe', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          nlForm.reset();
          toast('Bültene başarıyla abone oldunuz.');
        } catch (e) {
          toast(e.message, 'error');
        } finally {
          btn.disabled = false;
          btn.textContent = label;
        }
      });
    }
  }

  // ---------------------------------------------------------
  // ORTAK BILESENLER
  // ---------------------------------------------------------
  // Sabit "WhatsApp ile yaz" butonu (ayarlarda telefon tanimliysa)
  function renderQuickContact(settings) {
    const raw = String(settings.whatsapp || settings.phone || '').replace(/\D/g, '');
    if (raw.length < 10) return;
    let num = raw;
    if (num.charAt(0) === '0') num = '90' + num.slice(1);
    else if (num.length === 10) num = '90' + num;
    const a = document.createElement('a');
    a.className = 'wa-fab';
    a.href = 'https://wa.me/' + num;
    a.target = '_blank';
    a.rel = 'noopener';
    a.setAttribute('aria-label', 'WhatsApp ile iletişime geç');
    a.title = 'WhatsApp ile yazın';
    a.innerHTML = SHARE_ICONS.WhatsApp;
    document.body.appendChild(a);
  }

  function vehicleCard(v) {
    return `
      <article class="card">
        <div class="news-thumb" style="border-radius:10px;margin-bottom:16px">
          ${v.image ? `<img src="${esc(v.image)}" alt="${esc(v.name)}">` : '<span class="thumb-ico">🛩️</span>'}
        </div>
        <span class="tag ${v.status === 'Aktif' ? 'tag-green' : 'tag-amber'}">${esc(v.status)}</span>
        <h3 style="margin-top:10px">${esc(v.name)}</h3>
        <p>${esc(v.summary || '')}</p>
        <a class="card-link" href="/arac#${esc(v.slug || '')}">Teknik özellikler →</a>
      </article>`;
  }

  function newsCard(n) {
    return `
      <article class="card news-card">
        <div class="news-thumb">
          ${n.image ? `<img src="${esc(n.image)}" alt="${esc(n.title)}">` : '<span class="thumb-ico">📰</span>'}
        </div>
        <div class="news-body">
          <span class="tag ${tagClass(n.category)}">${esc(n.category)}</span>
          <h3><a href="/haber?slug=${encodeURIComponent(n.slug)}">${esc(n.title)}</a></h3>
          <p>${esc(n.summary || '')}</p>
          <div class="news-meta">
            <span>${esc(fmtDate(n.published_at))}</span>${n.author ? `<span>•</span><span>${esc(n.author)}</span>` : ''}
            <button class="like-btn sm fav-btn" type="button" data-fav="${n.id}" data-fav-type="news" aria-pressed="false" title="Favorilere ekle">${BOOKMARK_ICON}</button>
          </div>
        </div>
      </article>`;
  }

  function announcementRow(a) {
    const d = dateParts(a.published_at);
    return `
      <div class="announce ${a.is_pinned ? 'pinned' : ''}">
        <div class="announce-date"><b>${esc(d.day)}</b><span>${esc(d.month)} ${esc(d.year)}</span></div>
        <div>
          <div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-bottom:6px">
            ${a.is_pinned ? '<span class="tag tag-amber">📌 Sabitlenmiş</span>' : ''}
            <span class="tag ${tagClass(a.type)}">${esc(a.type)}</span>
          </div>
          <h3>${esc(a.title)}</h3>
          <p>${esc(a.content || '')}</p>
          <div class="announce-actions">
            <button class="like-btn sm ${a.liked ? 'on' : ''}" type="button" data-like="${a.id}" data-like-type="announcement" aria-pressed="${a.liked ? 'true' : 'false'}" title="Beğen">
              ${HEART_ICON}<span class="like-num">${Number(a.likes) || 0}</span>
            </button>
            <button class="like-btn sm fav-btn" type="button" data-fav="${a.id}" data-fav-type="announcement" aria-pressed="false" title="Favorilere ekle">
              ${BOOKMARK_ICON}
            </button>
          </div>
        </div>
      </div>`;
  }

  function sponsorCard(s) {
    const tierKey = ({ 'Platin': 'platinum', 'Altın': 'gold', 'Gümüş': 'silver', 'Bronz': 'bronze' })[s.tier] || 'supporter';
    const inner = s.logo
      ? `<img src="${esc(s.logo)}" alt="${esc(s.name)}" loading="lazy">`
      : `<span class="sponsor-name">${esc(s.name)}</span>`;
    const tag = `<span class="sponsor-tier">${esc(s.tier || 'Destekçi')}</span>`;
    const box = `<div class="card sponsor-card sponsor-${tierKey}">${tag}<div class="sponsor-card-content">${inner}</div></div>`;
    return s.website
      ? `<a class="sponsor-link" href="${esc(s.website)}" target="_blank" rel="noopener" aria-label="${esc(s.name)} web sitesini yeni sekmede aç">${box}</a>`
      : box;
  }

  // ---------------------------------------------------------
  // SAYFA: Ana Sayfa
  // ---------------------------------------------------------
  async function initHome(settings) {
    if (el('hero-pill')) {
      el('hero-pill').innerHTML = `<span class="dot"></span> ${esc(settings.competition || 'Teknofest Savaşan İHA')} Yarışma Takımı`;
    }
    if (el('hero-lead') && settings.about) el('hero-lead').textContent = settings.about;
    if (el('about-text') && settings.about) el('about-text').textContent = settings.about;

    const statGrid = el('stat-grid');
    const actGrid = el('activity-grid');
    const vehGrid = el('vehicle-grid');
    const newsGrid = el('news-grid');
    const annList = el('announcement-list');
    const sponGrid = el('sponsor-grid');
    if (actGrid) skeletons(actGrid, 6);
    if (vehGrid) skeletons(vehGrid, 2);
    if (newsGrid) skeletons(newsGrid, 3);

    let stats, activities, vehicles, news, announcements, sponsors;
    try {
      [stats, activities, vehicles, news, announcements, sponsors] = await Promise.all([
        api('/stats'), api('/activity-areas'), api('/vehicles'),
        api('/news?limit=3'), api('/announcements'), api('/sponsors'),
      ]);
    } catch (e) { console.error(e); }

    // Bir grid bossa ait oldugu section'i gizle.
    function hideEmptySection(gridEl) {
      if (!gridEl) return;
      let sec = gridEl.closest('.section, .section-sm');
      if (sec) sec.style.display = 'none';
    }

    if (statGrid && stats) {
      const items = [
        [settings.member_count || stats.members, 'Takım Üyesi'],
        [stats.vehicles, 'İHA Platformu'],
        [stats.news, 'Haber & Yazı'],
        [stats.sponsors, 'Sponsor'],
      ].filter(([v]) => Number(v) > 0);
      if (items.length) {
        statGrid.innerHTML = items
          .map(([v, l]) => `<div class="stat"><b>${esc(v)}</b><span>${esc(l)}</span></div>`).join('');
      } else {
        hideEmptySection(statGrid);
      }
    }

    if (actGrid) {
      if (activities && activities.length) {
        actGrid.innerHTML = activities.slice(0, 6).map((a) => `
          <article class="card">
            <div class="card-icon">${esc(a.icon || '🛠️')}</div>
            <h3>${esc(a.title)}</h3>
            ${a.description ? `<p>${esc(a.description)}</p>` : ''}
          </article>`).join('');
      } else hideEmptySection(actGrid);
    }

    if (vehGrid) {
      if (vehicles && vehicles.length) vehGrid.innerHTML = vehicles.slice(0, 2).map(vehicleCard).join('');
      else hideEmptySection(vehGrid);
    }

    if (newsGrid) {
      if (news && news.length) { newsGrid.innerHTML = news.map(newsCard).join(''); bindFavoriteButtons(newsGrid); }
      else hideEmptySection(newsGrid);
    }

    if (annList) {
      if (announcements && announcements.length) {
        annList.innerHTML = announcements.slice(0, 3).map(announcementRow).join('');
        bindLikeButtons(annList);
        bindFavoriteButtons(annList);
      } else annList.innerHTML = '';
    }

    if (sponGrid) {
      if (sponsors && sponsors.length) sponGrid.innerHTML = sponsors.slice(0, 10).map(sponsorCard).join('');
      else hideEmptySection(sponGrid);
    }
  }

  // ---------------------------------------------------------
  // SAYFA: Takim
  // ---------------------------------------------------------
  async function initTeam() {
    const wrap = el('team-wrap');
    if (!wrap) return;
    skeletons(wrap, 6);
    let members;
    try { members = await api('/members'); } catch (e) { return emptyState(wrap); }
    if (!members.length) return emptyState(wrap, 'Henüz takım üyesi eklenmemiş.');

    const groups = {};
    members.forEach((m) => {
      const key = m.department || 'Takım';
      (groups[key] = groups[key] || []).push(m);
    });

    wrap.innerHTML = Object.keys(groups).map((dept) => `
      <div class="section-sm">
        <div class="tier-title"><span class="tag tag-cyan">${esc(dept)}</span><span style="color:var(--text-dim);font-weight:600">${groups[dept].length} kişi</span></div>
        <div class="grid grid-4">
          ${groups[dept].map((m) => `
            <article class="card member-card">
              ${m.photo ? `<img class="avatar" src="${esc(m.photo)}" alt="${esc(m.name)}">` : `<div class="avatar">${esc(initials(m.name))}</div>`}
              <h3>${isFounder(m) ? '<span class="founder-star" title="Kurucu" aria-label="Kurucu">\u2605</span> ' : ''}${esc(m.name)}</h3>
              <div class="member-role">${esc(m.role || '')}</div>
              ${m.bio ? `<p class="member-bio">${esc(m.bio)}</p>` : ''}
              <div class="member-links">
                ${m.email ? `<a href="mailto:${esc(m.email)}">E-posta</a>` : ''}
                ${m.linkedin ? `<a href="${esc(m.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}
                ${m.github ? `<a href="${esc(m.github)}" target="_blank" rel="noopener">GitHub</a>` : ''}
              </div>
            </article>`).join('')}
        </div>
      </div>`).join('');
  }

  // ---------------------------------------------------------
  // SAYFA: Arac (IHA teknik ozellikleri)
  // ---------------------------------------------------------
  async function initVehicle() {
    const tabs = el('vehicle-tabs');
    const panel = el('vehicle-panel');
    if (!tabs || !panel) return;
    skeletons(panel, 1, 'skeleton-lg');
    let vehicles;
    try { vehicles = await api('/vehicles'); } catch (e) { return emptyState(panel); }
    if (!vehicles.length) return emptyState(panel, 'Henüz araç bilgisi eklenmemiş.');

    function show(id) {
      const v = vehicles.find((x) => x.id === id) || vehicles[0];
      qsa('.tab', tabs).forEach((t) => t.classList.toggle('active', Number(t.dataset.id) === v.id));
      panel.innerHTML = `
        <div class="split">
          <div>
            <div class="article-hero" style="max-height:340px">
              ${v.image ? `<img src="${esc(v.image)}" alt="${esc(v.name)}">` : `<div style="height:260px;display:grid;place-items:center;font-size:4rem;background:linear-gradient(135deg,#12203a,#0c1526)">🛩️</div>`}
            </div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:12px">
              <span class="tag tag-cyan">${esc(v.category || 'İHA')}</span>
              <span class="tag ${v.status === 'Aktif' ? 'tag-green' : 'tag-amber'}">${esc(v.status)}</span>
            </div>
            <h2>${esc(v.name)}</h2>
            <p style="color:var(--text-muted)">${esc(v.summary || '')}</p>
            <div class="article-body">${toParagraphs(v.description)}</div>
          </div>
          <aside>
            <div class="card article-aside">
              <h3 style="font-size:1.05rem;margin-bottom:14px">Teknik Özellikler</h3>
              ${v.specs && v.specs.length
                ? `<table class="spec-table">${v.specs.map((s) => `<tr><th>${esc(s.label)}</th><td>${esc(s.value)}${s.unit ? `<span class="unit">${esc(s.unit)}</span>` : ''}</td></tr>`).join('')}</table>`
                : '<p style="color:var(--text-dim);font-size:0.9rem">Teknik özellik eklenmemiş.</p>'}
            </div>
          </aside>
        </div>`;
      if (location.hash) {
        try { history.replaceState(null, '', '#' + v.slug); } catch (e) { /* yoksay */ }
      }
    }

    tabs.innerHTML = vehicles.map((v, i) => `<button class="tab ${i === 0 ? 'active' : ''}" data-id="${v.id}">${esc(v.name)}</button>`).join('');
    qsa('.tab', tabs).forEach((t) => t.addEventListener('click', () => show(Number(t.dataset.id))));

    const hash = decodeURIComponent(location.hash.replace('#', ''));
    const target = vehicles.find((v) => v.slug === hash) || vehicles[0];
    show(target.id);
  }

  // ---------------------------------------------------------
  // SAYFA: Haberler
  // ---------------------------------------------------------
  async function initNewsList() {
    const grid = el('news-grid');
    const chips = el('news-filters');
    const search = el('news-search');
    if (!grid) return;
    skeletons(grid, 3);
    let items;
    try { items = await api('/news?limit=60'); } catch (e) { return emptyState(grid); }

    const cats = ['Tümü'].concat(Array.from(new Set(items.map((n) => n.category))));
    let activeCat = 'Tümü';
    let term = '';

    if (chips) {
      chips.innerHTML = cats.map((c) => `<button class="chip ${c === 'Tümü' ? 'active' : ''}" data-cat="${esc(c)}">${esc(c)}</button>`).join('');
      qsa('.chip', chips).forEach((b) => b.addEventListener('click', () => {
        activeCat = b.dataset.cat;
        qsa('.chip', chips).forEach((x) => x.classList.toggle('active', x === b));
        render();
      }));
    }
    if (search) search.addEventListener('input', () => { term = search.value.trim().toLowerCase(); render(); });

    const params = new URLSearchParams(location.search);
    if (params.get('kategori') && chips) {
      activeCat = params.get('kategori');
      qsa('.chip', chips).forEach((x) => x.classList.toggle('active', x.dataset.cat === activeCat));
    }

    function render() {
      const list = items.filter((n) =>
        (activeCat === 'Tümü' || n.category === activeCat) &&
        (!term || (n.title + ' ' + (n.summary || '')).toLowerCase().includes(term))
      );
      grid.innerHTML = list.length ? list.map(newsCard).join('') : '<div class="state" style="grid-column:1/-1">Aramanıza uygun içerik bulunamadı.</div>';
      bindFavoriteButtons(grid);
    }
    render();
  }

  // ---------------------------------------------------------
  // SAYFA: Haber detayi
  // ---------------------------------------------------------
  async function initNewsDetail() {
    const wrap = el('article-wrap');
    if (!wrap) return;
    const slug = new URLSearchParams(location.search).get('slug');
    if (!slug) { wrap.innerHTML = '<div class="state">İçerik bulunamadı.</div>'; return; }
    skeletons(wrap, 1, 'skeleton-lg');
    let n;
    try { n = await api('/news/' + encodeURIComponent(slug)); } catch (e) { return emptyState(wrap, 'İçerik bulunamadı veya kaldırılmış.'); }

    // Ayni kategoriden ilgili haberler (yetmezse diger son icerikler)
    let related = [];
    try {
      const list = await api('/news?limit=60');
      related = list.filter((x) => x.slug !== n.slug && x.category === n.category).slice(0, 3);
      if (!related.length) related = list.filter((x) => x.slug !== n.slug).slice(0, 3);
    } catch (e) { /* ilgili icerik alinamazsa bolum gizlenir */ }

    // Tahmini okuma suresi (200 kelime/dk)
    const wordCount = (((n.content || '') + ' ' + (n.summary || '')).trim().match(/\S+/g) || []).length;
    const readMin = Math.max(1, Math.round(wordCount / 200));

    const shareUrl = encodeURIComponent(location.href);
    const shareText = encodeURIComponent(n.title);

    document.title = n.title + ' | SAYE';
    wrap.innerHTML = `
      <div class="breadcrumb"><a href="/haberler">Haberler</a> / ${esc(n.category)}</div>
      <span class="tag ${tagClass(n.category)}">${esc(n.category)}</span>
      <h1 style="margin:16px 0 12px">${esc(n.title)}</h1>
      <div class="news-meta" style="margin-bottom:14px">
        <span>${esc(fmtDate(n.published_at))}</span>
        ${n.author ? `<span>•</span><span>${esc(n.author)}</span>` : ''}
        <span>•</span><span>${readMin} dk okuma</span>
        <span>•</span><span id="read-pct">%0 okundu</span>
      </div>
      <div class="read-progress" aria-hidden="true"><span class="read-fill"></span></div>
      ${n.image ? `<div class="article-hero"><img src="${esc(n.image)}" alt="${esc(n.title)}"></div>` : ''}
      ${n.summary ? `<p style="font-size:1.1rem;color:var(--text)">${esc(n.summary)}</p>` : ''}
      <div class="article-body">${toParagraphs(n.content)}</div>
      ${n.tags ? `<div style="margin-top:28px;display:flex;gap:8px;flex-wrap:wrap">${String(n.tags).split(',').filter(Boolean).map((t) => `<span class="tag tag-mute">#${esc(t.trim())}</span>`).join('')}</div>` : ''}
      <div class="share-row">
        <span class="lbl">Paylaş</span>
        <a class="share-btn" href="https://twitter.com/intent/tweet?text=${shareText}&url=${shareUrl}" target="_blank" rel="noopener">${SHARE_ICONS.X} X</a>
        <a class="share-btn" href="https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}" target="_blank" rel="noopener">${SHARE_ICONS.LinkedIn} LinkedIn</a>
        <a class="share-btn" href="https://wa.me/?text=${shareText}%20${shareUrl}" target="_blank" rel="noopener">${SHARE_ICONS.WhatsApp} WhatsApp</a>
        <button class="share-btn" type="button" id="copy-link">${SHARE_ICONS.Link} Linki kopyala</button>
      </div>
      <div class="interact-row">
        <button class="like-btn ${n.liked ? 'on' : ''}" type="button" data-like="${n.id}" data-like-type="news" aria-pressed="${n.liked ? 'true' : 'false'}" title="Beğen">
          ${HEART_ICON}<span class="like-num">${Number(n.likes) || 0}</span>
        </button>
        <button class="like-btn fav-btn" type="button" data-fav="${n.id}" data-fav-type="news" aria-pressed="false" title="Favorilere ekle">
          ${BOOKMARK_ICON}<span class="fav-label">Kaydet</span>
        </button>
        <span class="interact-count">${Number(n.comments) || 0} yorum</span>
      </div>
      <section class="comments" id="comments">
        <h2>Yorumlar</h2>
        <div id="comment-compose"></div>
        <div class="comment-list" id="comment-list"></div>
      </section>
      ${related.length ? `
        <div class="related-block">
          <h2>İlgili haberler</h2>
          <div class="grid grid-3">${related.map(newsCard).join('')}</div>
        </div>` : ''}
      <div style="margin-top:34px"><a class="btn btn-ghost" href="/haberler">← Tüm haberler</a></div>`;

    const shareRow = qs('.share-row', wrap);
    initReadingProgress(wrap, shareRow);
    initShareButtons(wrap);
    bindLikeButtons(wrap);
    bindFavoriteButtons(wrap);
    initComments(n.id);
  }

  // ---------------------------------------------------------
  // Haber yorumlari
  // ---------------------------------------------------------
  async function initComments(targetId) {
    const host = el('comments');
    if (!host) return;
    const listEl = el('comment-list');
    const composeEl = el('comment-compose');

    async function load() {
      let data = { likes: 0, liked: false, comments: [] };
      try { data = await api('/interactions?type=news&id=' + encodeURIComponent(targetId)); } catch (e) { /* yoksay */ }
      const me = getUser();
      listEl.innerHTML = data.comments.length
        ? data.comments.map((c) => `
            <div class="comment">
              <div class="comment-avatar">${esc(initials(c.name))}</div>
              <div class="comment-body">
                <div class="comment-head">
                  <b>${esc(c.name)}</b>
                  <span>${esc(timeAgo(c.created_at))}</span>
                  ${me && me.id === c.user_id && !c.is_approved ? '<span class="tag tag-amber">Onay bekliyor</span>' : ''}
                  ${me && me.id === c.user_id ? `<button class="comment-del" type="button" data-del="${c.id}" title="Yorumu sil">Sil</button>` : ''}
                </div>
                <p>${esc(c.content)}</p>
              </div>
            </div>`).join('')
        : '<div class="state">Henüz yorum yok. İlk yorumu sen yaz!</div>';

      const cnt = qs('.interact-count', host.parentElement || document);
      if (cnt) cnt.textContent = data.comments.filter((c) => c.is_approved).length + ' yorum';

      qsa('[data-del]', listEl).forEach((b) => b.addEventListener('click', async () => {
        if (!window.confirm('Yorumunuzu silmek istediğinize emin misiniz?')) return;
        try {
          await api('/comments/' + b.dataset.del, { method: 'DELETE' });
          toast('Yorum silindi.');
          load();
        } catch (e) { toast(e.message, 'error'); }
      }));
    }

    function renderCompose() {
      if (!getUser()) {
        composeEl.innerHTML = `
          <div class="comment-login">
            <span>Yorum yapmak için üye girişi yapmalısınız.</span>
            <button class="btn btn-primary btn-sm" type="button" id="comment-login-btn">Giriş Yap / Kayıt Ol</button>
          </div>`;
        el('comment-login-btn').addEventListener('click', openAuth);
        return;
      }
      composeEl.innerHTML = `
        <form class="comment-form" id="comment-form">
          <textarea name="content" rows="3" maxlength="1000" placeholder="Yorumunu yaz..." required></textarea>
          <button class="btn btn-primary btn-sm" type="submit">Yorum Gönder</button>
        </form>`;
      el('comment-form').addEventListener('submit', async (ev) => {
        ev.preventDefault();
        const formEl = el('comment-form');
        const ta = qs('textarea', formEl);
        const content = ta.value.trim();
        if (content.length < 2) { toast('Yorum en az 2 karakter olmalı.', 'error'); return; }
        const btn = qs('button', formEl);
        btn.disabled = true;
        try {
          const created = await api('/comments', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ target_type: 'news', target_id: targetId, content }),
          });
          ta.value = '';
          toast(created && created.pending ? 'Yorumunuz onay için gönderildi.' : 'Yorumunuz eklendi.');
          load();
        } catch (e) { toast(e.message, 'error'); }
        finally { btn.disabled = false; }
      });
    }

    renderCompose();
    await load();
  }

  // ---------------------------------------------------------
  // SAYFA: Duyurular
  // ---------------------------------------------------------
  async function initAnnouncements() {
    const list = el('announcement-list');
    if (!list) return;
    skeletons(list, 3);
    let items;
    try { items = await api('/announcements'); } catch (e) { return emptyState(list); }
    list.innerHTML = items.length ? items.map(announcementRow).join('') : '<div class="state">Şu anda yayınlanmış duyuru yok.</div>';
    bindLikeButtons(list);
    bindFavoriteButtons(list);
  }

  // ---------------------------------------------------------
  // SAYFA: Faaliyet alanlari
  // ---------------------------------------------------------
  async function initActivities() {
    const grid = el('activity-grid');
    if (!grid) return;
    skeletons(grid, 6);
    let items;
    try { items = await api('/activity-areas'); } catch (e) { return emptyState(grid); }
    grid.innerHTML = items.length ? items.map((a) => `
      <article class="card">
        <div class="card-icon" style="font-size:2rem">${esc(a.icon || '🛠️')}</div>
        <h3>${esc(a.title)}</h3>
        <p>${esc(a.description || '')}</p>
      </article>`).join('') : '<div class="state">Faaliyet alanı eklenmemiş.</div>';
  }

  // ---------------------------------------------------------
  // SAYFA: Kariyer
  // ---------------------------------------------------------
  async function initCareers() {
    const list = el('career-list');
    if (!list) return;
    skeletons(list, 4);
    let items;
    try { items = await api('/careers'); } catch (e) { return emptyState(list); }

    list.innerHTML = items.length ? items.map((c) => `
      <article class="card" style="margin-bottom:16px">
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-bottom:10px">
          <span class="tag ${c.is_open ? 'tag-green' : 'tag-mute'}">${c.is_open ? 'Başvuruya Açık' : 'Kapalı'}</span>
          ${c.department ? `<span class="tag tag-cyan">${esc(c.department)}</span>` : ''}
          <span class="tag tag-mute">${esc(c.employment_type)}</span>
          ${c.location ? `<span class="tag tag-mute">📍 ${esc(c.location)}</span>` : ''}
        </div>
        <h3>${esc(c.title)}</h3>
        <p>${esc(c.description || '')}</p>
        ${c.requirements ? `<div class="article-body" style="font-size:0.92rem;margin-top:12px">${toParagraphs(c.requirements)}</div>` : ''}
        ${c.is_open ? `<button class="btn btn-primary btn-sm" style="margin-top:16px" data-apply="${c.id}" data-title="${esc(c.title)}">Bu pozisyona başvur</button>` : ''}
      </article>`).join('') : '<div class="state">Şu anda açık pozisyon bulunmuyor.</div>';

    // Basvuru formu
    const form = el('career-form');
    const select = el('career_id');
    if (select) {
      select.innerHTML = '<option value="">Genel başvuru</option>' + items.filter((c) => c.is_open)
        .map((c) => `<option value="${c.id}">${esc(c.title)}</option>`).join('');
    }

    // Uye girisindeyse basvuru formunu onceden doldur
    const accUser = getUser();
    if (accUser) {
      const nameInput = el('full_name');
      const emailInput = el('email');
      if (nameInput && !nameInput.value) nameInput.value = `${accUser.first_name || ''} ${accUser.last_name || ''}`.trim();
      if (emailInput && !emailInput.value) emailInput.value = accUser.email || '';
    }

    qsa('[data-apply]').forEach((b) => b.addEventListener('click', () => {
      if (select) select.value = b.dataset.apply;
      el('career-form').scrollIntoView({ behavior: 'smooth', block: 'center' });
      const name = el('full_name');
      if (name) name.focus();
    }));

    if (form) form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = qs('button[type=submit]', form);
      const alertBox = el('career-alert');
      btn.disabled = true; btn.textContent = 'Gönderiliyor...';
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        await api('/career-applications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        form.reset();
        if (alertBox) { alertBox.className = 'alert alert-success full'; alertBox.textContent = 'Başvurunuz alındı. Teşekkürler, en kısa sürede dönüş yapacağız.'; alertBox.classList.remove('hidden'); }
        toast('Başvurunuz başarıyla gönderildi.');
      } catch (e) {
        if (alertBox) { alertBox.className = 'alert alert-error full'; alertBox.textContent = e.message; alertBox.classList.remove('hidden'); }
        toast(e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = 'Başvuruyu Gönder';
      }
    });
  }

  // ---------------------------------------------------------
  // SAYFA: Sponsorlar
  // ---------------------------------------------------------
  async function initSponsors() {
    const wrap = el('sponsor-wrap');
    if (!wrap) return;
    skeletons(wrap, 6);
    let items;
    try { items = await api('/sponsors'); } catch (e) { return emptyState(wrap); }
    if (!items.length) return emptyState(wrap, 'Henüz sponsor eklenmemiş.');

    const order = ['Platin', 'Altın', 'Gümüş', 'Bronz', 'Destekçi'];
    const groups = {};
    items.forEach((s) => { (groups[s.tier] = groups[s.tier] || []).push(s); });

    wrap.innerHTML = order.filter((t) => groups[t]).map((tier) => `
      <div class="tier-title"><span class="tag ${tagClass(tier)}">${esc(tier)}</span><span style="color:var(--text-dim);font-weight:600">${groups[tier].length} sponsor</span></div>
      <div class="grid grid-4">${groups[tier].map(sponsorCard).join('')}</div>`).join('');
  }

  // ---------------------------------------------------------
  // SAYFA: Iletisim
  // ---------------------------------------------------------
  async function initContact(settings) {
    const info = el('contact-info');
    if (info) {
      info.innerHTML = `<ul class="info-list">
        ${settings.email ? `<li><span class="k">E-posta</span><span class="v"><a href="mailto:${esc(settings.email)}">${esc(settings.email)}</a></span></li>` : ''}
        ${settings.phone ? `<li><span class="k">Telefon</span><span class="v">${esc(settings.phone)}</span></li>` : ''}
        ${settings.address ? `<li><span class="k">Adres</span><span class="v">${esc(settings.address)}</span></li>` : ''}
        ${settings.university ? `<li><span class="k">Kurum</span><span class="v">${esc(settings.university)}</span></li>` : ''}
        ${settings.competition ? `<li><span class="k">Kategori</span><span class="v">${esc(settings.competition)}</span></li>` : ''}
      </ul>`;
    }
    const form = el('contact-form');
    if (!form) return;
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = qs('button[type=submit]', form);
      const alertBox = el('contact-alert');
      btn.disabled = true; btn.textContent = 'Gönderiliyor...';
      try {
        const payload = Object.fromEntries(new FormData(form).entries());
        await api('/messages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        form.reset();
        if (alertBox) { alertBox.className = 'alert alert-success full'; alertBox.textContent = 'Mesajınız iletildi. En kısa sürede size dönüş yapacağız.'; alertBox.classList.remove('hidden'); }
        toast('Mesajınız gönderildi.');
      } catch (e) {
        if (alertBox) { alertBox.className = 'alert alert-error full'; alertBox.textContent = e.message; alertBox.classList.remove('hidden'); }
        toast(e.message, 'error');
      } finally {
        btn.disabled = false; btn.textContent = 'Mesajı Gönder';
      }
    });
  }

  // ---------------------------------------------------------
  // Hesap: giris / kayit modali + profil
  // ---------------------------------------------------------
  let authOverlay = null;

  function authAlertBox(form) {
    return form && form.parentElement ? qs('.auth-alert-box', form.parentElement) : null;
  }

  function showAuthAlert(box, message, type) {
    if (!box) return;
    box.className = 'alert ' + (type === 'error' ? 'alert-error' : 'alert-success') + ' auth-alert-box';
    box.textContent = message;
  }

  async function submitAuth(form, endpoint, btnLabel, onSuccess) {
    const btn = qs('button[type=submit]', form);
    const box = authAlertBox(form);
    btn.disabled = true; btn.textContent = 'Gönderiliyor...';
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const data = await api(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      setUser(data.token, data.user);
      toast('Başarılı!');
      if (onSuccess === 'reload') { closeAuth(); location.reload(); }
      else { location.href = '/'; }
    } catch (e) {
      showAuthAlert(box, e.message, 'error');
      toast(e.message, 'error');
      btn.disabled = false; btn.textContent = btnLabel;
    }
  }

  // Kayit adimi 1: bilgileri gonder -> e-postaya kod gitsin
  async function submitRegister(form, container, onSuccess) {
    const btn = qs('button[type=submit]', form);
    const box = authAlertBox(form);
    const label = btn.textContent;
    btn.disabled = true; btn.textContent = 'Gönderiliyor...';
    try {
      const payload = Object.fromEntries(new FormData(form).entries());
      const data = await api('/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      toast(data.mailSent === false ? 'Test modu: kod konsola yazıldı.' : 'Doğrulama kodu e-postana gönderildi.');
      renderVerifyStep(container, data.email, onSuccess);
      if (data.devCode) {
        const inp = el('m-v-code');
        if (inp) inp.value = data.devCode;
      }
    } catch (e) {
      showAuthAlert(box, e.message, 'error');
      toast(e.message, 'error');
      btn.disabled = false; btn.textContent = label;
    }
  }

  // Kayit adimi 2: e-postaya gelen kodu dogrula
  function renderVerifyStep(container, email, onSuccess) {
    container.innerHTML = `
      <h2 class="auth-title">E-postanı Doğrula</h2>
      <p class="auth-sub"><b>${esc(email)}</b> adresine 6 haneli bir doğrulama kodu gönderdik. Kodu aşağıya gir.</p>
      <div class="auth-alert-box alert alert-error hidden"></div>
      <form id="m-verify-form" class="form-grid" novalidate>
        <input type="hidden" name="email" value="${esc(email)}">
        <div class="field full">
          <label for="m-v-code">Doğrulama Kodu <span class="req">*</span></label>
          <input id="m-v-code" name="code" type="text" inputmode="numeric" maxlength="6" required autocomplete="one-time-code" placeholder="6 haneli kod">
        </div>
        <div class="field full">
          <button class="btn btn-primary" type="submit" style="width:100%">Doğrula ve Tamamla</button>
        </div>
      </form>
      <p class="auth-alt">Kod gelmedi mi? <a href="#" id="m-resend">Yeniden gönder</a></p>`;

    // Modal icinde sekme cubugunu gizle
    const tabs = el('auth-tabs');
    if (tabs && container === el('auth-body')) tabs.style.display = 'none';

    const f = el('m-verify-form');
    const box = authAlertBox(f);
    f.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = qs('button[type=submit]', f);
      const label = btn.textContent;
      btn.disabled = true; btn.textContent = 'Doğrulanıyor...';
      try {
        const payload = Object.fromEntries(new FormData(f).entries());
        const data = await api('/verify-email', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
        setUser(data.token, data.user);
        toast('Hesabın oluşturuldu!');
        if (onSuccess === 'reload') { closeAuth(); location.reload(); }
        else { location.href = '/'; }
      } catch (e) {
        showAuthAlert(box, e.message, 'error');
        btn.disabled = false; btn.textContent = label;
      }
    });

    const resend = el('m-resend');
    if (resend) {
      resend.addEventListener('click', async (ev) => {
        ev.preventDefault();
        try {
          const data = await api('/resend-code', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email }),
          });
          if (data.devCode) { const inp = el('m-v-code'); if (inp) inp.value = data.devCode; }
          showAuthAlert(box, 'Yeni kod gönderildi.', 'success');
          toast('Yeni kod gönderildi.');
        } catch (e) {
          showAuthAlert(box, e.message, 'error');
        }
      });
    }
  }

  function loginFormHTML() {
    return `
      <h2 class="auth-title">Giriş Yap</h2>
      <p class="auth-sub">Kullanıcı adı ve şifrenle devam et.</p>
      <div class="auth-alert-box alert alert-error hidden"></div>
      <form id="m-login-form" class="form-grid" novalidate>
        <div class="field full">
          <label for="m-l-username">Kullanıcı Adı <span class="req">*</span></label>
          <input id="m-l-username" name="username" type="text" required autocomplete="username" placeholder="kullanici_adi">
        </div>
        <div class="field full">
          <label for="m-l-password">Şifre <span class="req">*</span></label>
          <input id="m-l-password" name="password" type="password" required autocomplete="current-password" placeholder="••••••••">
        </div>
        <div class="field full"><button class="btn btn-primary" type="submit" style="width:100%">Giriş Yap</button></div>
      </form>
      <p class="auth-alt">Şifreni mi unuttun? <a href="#" id="m-forgot-link">Şifre sıfırla</a></p>`;
  }

  function forgotFormHTML() {
    return `
      <h2 class="auth-title">Şifre Sıfırlama</h2>
      <p class="auth-sub">Kayıtlı e-posta adresine 6 haneli sıfırlama kodu göndereceğiz.</p>
      <div class="auth-alert-box alert alert-error hidden"></div>
      <form id="m-forgot-form" class="form-grid" novalidate>
        <div class="field full">
          <label for="m-f-email">E-posta <span class="req">*</span></label>
          <input id="m-f-email" name="email" type="email" required autocomplete="email" placeholder="ornek@eposta.com">
        </div>
        <div class="field full"><button class="btn btn-primary" type="submit" style="width:100%">Kod Gönder</button></div>
      </form>
      <p class="auth-alt"><a href="#" class="auth-back">← Girişe dön</a></p>`;
  }

  function resetFormHTML(email) {
    return `
      <h2 class="auth-title">Yeni Şifre Belirle</h2>
      <p class="auth-sub"><b>${esc(email)}</b> adresine gönderilen kodu gir ve yeni şifreni belirle.</p>
      <div class="auth-alert-box alert alert-error hidden"></div>
      <form id="m-reset-form" class="form-grid" novalidate>
        <div class="field full">
          <label for="m-rst-code">Doğrulama Kodu <span class="req">*</span></label>
          <input id="m-rst-code" name="code" type="text" inputmode="numeric" maxlength="6" required autocomplete="one-time-code" placeholder="6 haneli kod">
        </div>
        <div class="field full">
          <label for="m-rst-pass">Yeni Şifre <span class="req">*</span></label>
          <input id="m-rst-pass" name="password" type="password" required minlength="6" autocomplete="new-password" placeholder="En az 6 karakter">
        </div>
        <div class="field full"><button class="btn btn-primary" type="submit" style="width:100%">Şifreyi Güncelle</button></div>
      </form>
      <p class="auth-alt"><a href="#" class="auth-back">← Girişe dön</a></p>`;
  }

  /** Sifre sifirlama akisini verilen kaba yukler. */
  function mountForgot(host, onBack) {
    host.innerHTML = forgotFormHTML();
    hideAuthTabsIfModal(host);
    const back = qs('.auth-back', host);
    if (back) back.addEventListener('click', (e) => { e.preventDefault(); onBack(); });
    const form = el('m-forgot-form');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = qs('button[type=submit]', form);
      const box = authAlertBox(form);
      const email = String(new FormData(form).get('email') || '').trim();
      btn.disabled = true; btn.textContent = 'Gönderiliyor...';
      try {
        const data = await api('/forgot-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email }),
        });
        toast(data.mailSent === false ? 'Test modu: kod konsola yazıldı.' : 'Sıfırlama kodu e-postana gönderildi.');
        mountReset(host, email, onBack);
        if (data.devCode) { const c = el('m-rst-code'); if (c) c.value = data.devCode; }
      } catch (e) {
        showAuthAlert(box, e.message, 'error');
        toast(e.message, 'error');
        btn.disabled = false; btn.textContent = 'Kod Gönder';
      }
    });
  }

  function mountReset(host, email, onBack) {
    host.innerHTML = resetFormHTML(email);
    hideAuthTabsIfModal(host);
    const back = qs('.auth-back', host);
    if (back) back.addEventListener('click', (e) => { e.preventDefault(); onBack(); });
    const form = el('m-reset-form');
    form.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = qs('button[type=submit]', form);
      const box = authAlertBox(form);
      const data = new FormData(form);
      const code = String(data.get('code') || '').trim();
      const password = String(data.get('password') || '');
      btn.disabled = true; btn.textContent = 'Güncelleniyor...';
      try {
        await api('/reset-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ email, code, password }),
        });
        toast('Şifren güncellendi. Şimdi giriş yapabilirsin.');
        onBack();
      } catch (e) {
        showAuthAlert(box, e.message, 'error');
        toast(e.message, 'error');
        btn.disabled = false; btn.textContent = 'Şifreyi Güncelle';
      }
    });
  }

  /** Modal icinde sekme cubugunu gizler. */
  function hideAuthTabsIfModal(host) {
    const tabs = el('auth-tabs');
    if (tabs && host === el('auth-body')) tabs.style.display = 'none';
  }

  function registerFormHTML() {
    return `
      <h2 class="auth-title">Kayıt Ol</h2>
      <p class="auth-sub">Ekibe katılmak için bilgilerini doldur.</p>
      <div class="auth-alert-box alert alert-error hidden"></div>
      <form id="m-register-form" class="form-grid" novalidate>
        <div class="field">
          <label for="m-r-first">Adı <span class="req">*</span></label>
          <input id="m-r-first" name="first_name" type="text" required autocomplete="given-name" placeholder="Adınız">
        </div>
        <div class="field">
          <label for="m-r-last">Soyadı <span class="req">*</span></label>
          <input id="m-r-last" name="last_name" type="text" required autocomplete="family-name" placeholder="Soyadınız">
        </div>
        <div class="field full">
          <label for="m-r-username">Kullanıcı Adı <span class="req">*</span></label>
          <input id="m-r-username" name="username" type="text" required autocomplete="username" placeholder="kullanici_adi (3-24 karakter)">
        </div>
        <div class="field full">
          <label for="m-r-email">E-posta <span class="req">*</span></label>
          <input id="m-r-email" name="email" type="email" required autocomplete="email" placeholder="ornek@eposta.com">
        </div>
        <div class="field full">
          <label for="m-r-password">Şifre <span class="req">*</span></label>
          <input id="m-r-password" name="password" type="password" required autocomplete="new-password" placeholder="En az 6 karakter">
        </div>
        <div class="field">
          <label for="m-r-age">Yaş <span class="req">*</span></label>
          <input id="m-r-age" name="age" type="number" min="10" max="99" required placeholder="Örn. 18">
        </div>
        <div class="field">
          <label for="m-r-department">Birim <span class="req">*</span></label>
          <select id="m-r-department" name="department" required>
            <option value="">Birim seçin</option>
            <option value="Yazılım">Yazılım</option>
            <option value="Mekanik">Mekanik</option>
            <option value="Elektronik">Elektronik</option>
            <option value="Tasarım">Tasarım</option>
            <option value="Medya">Medya</option>
            <option value="Yönetim">Yönetim</option>
          </select>
        </div>
        <div class="field full"><button class="btn btn-primary" type="submit" style="width:100%">Kayıt Ol</button></div>
      </form>`;
  }

  function profileHTML() {
    const u = getUser() || {};
    const full = ((u.first_name || '') + ' ' + (u.last_name || '')).trim();
    const role = (u.department || '') + (u.age ? (u.department ? ' • ' : '') + u.age + ' yaş' : '');
    return `
      <div class="auth-profile">
        ${avatarBlock(u, full || u.username)}
        <div class="auth-name">${esc(full || u.username || '')}</div>
        <div class="auth-role">${esc(role)}</div>
        <a class="btn btn-primary" href="/hesabim" style="width:100%;margin-top:22px">Hesabım</a>
        <button class="btn btn-ghost" type="button" id="profile-logout" style="width:100%;margin-top:10px">Çıkış Yap</button>
      </div>`;
  }

  function buildAuthUI() {
    if (authOverlay) return;
    authOverlay = document.createElement('div');
    authOverlay.className = 'search-overlay';
    authOverlay.id = 'auth-overlay';
    authOverlay.hidden = true;
    authOverlay.innerHTML = `
      <div class="auth-modal" role="dialog" aria-modal="true" aria-label="Hesap">
        <button class="auth-close" type="button" id="auth-close" aria-label="Kapat">✕</button>
        <div class="auth-tabs" id="auth-tabs">
          <button type="button" data-tab="login" class="active">Giriş</button>
          <button type="button" data-tab="register">Kayıt</button>
        </div>
        <div id="auth-body"></div>
      </div>`;
    document.body.appendChild(authOverlay);
    authOverlay.addEventListener('mousedown', (e) => { if (e.target === authOverlay) closeAuth(); });
    el('auth-close').addEventListener('click', closeAuth);
    qsa('#auth-tabs button').forEach((b) => b.addEventListener('click', () => showAuthTab(b.dataset.tab)));
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !authOverlay.hidden) closeAuth(); });
  }

  function showAuthTab(mode) {
    const tabs = el('auth-tabs');
    const body = el('auth-body');
    if (!tabs || !body) return;
    if (mode === 'profile') {
      tabs.style.display = 'none';
      body.innerHTML = profileHTML();
      const out = el('profile-logout');
      if (out) out.addEventListener('click', async () => { await logoutUser(); closeAuth(); location.reload(); });
      return;
    }
    tabs.style.display = 'flex';
    qsa('button', tabs).forEach((b) => b.classList.toggle('active', b.dataset.tab === mode));
    if (mode === 'register') {
      body.innerHTML = registerFormHTML();
      const f = qs('form', body);
      f.addEventListener('submit', (ev) => { ev.preventDefault(); submitRegister(f, body, 'reload'); });
    } else {
      body.innerHTML = loginFormHTML();
      const f = qs('form', body);
      f.addEventListener('submit', (ev) => { ev.preventDefault(); submitAuth(f, '/login', 'Giriş Yap', 'reload'); });
      const forgot = el('m-forgot-link');
      if (forgot) forgot.addEventListener('click', (e) => { e.preventDefault(); mountForgot(body, () => showAuthTab('login')); });
    }
  }

  /** Giris modali icinde sifre sifirlama ekranini acar. */
  function openAuthForgot() {
    buildAuthUI();
    authOverlay.hidden = false;
    document.body.classList.add('no-scroll');
    mountForgot(el('auth-body'), () => showAuthTab('login'));
  }

  function openAuth() {
    buildAuthUI();
    authOverlay.hidden = false;
    document.body.classList.add('no-scroll');
    showAuthTab(getUser() ? 'profile' : 'login');
  }

  function closeAuth() {
    if (!authOverlay) return;
    authOverlay.hidden = true;
    document.body.classList.remove('no-scroll');
  }

  // ---------------------------------------------------------
  // SAYFA: /giris ve /kayit (dogrudan erisim icin)
  // ---------------------------------------------------------
  function initLogin() {
    if (getUser()) { location.href = '/'; return; }
    const form = el('login-form');
    if (!form) return;
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      submitAuth(form, '/login', 'Giriş Yap');
    });
    const forgot = el('forgot-link');
    if (forgot) forgot.addEventListener('click', (ev) => { ev.preventDefault(); openAuthForgot(); });
  }

  function initRegister() {
    if (getUser()) { location.href = '/'; return; }
    const form = el('register-form');
    if (!form) return;
    const card = form.closest('.auth-card') || form.parentElement;
    form.addEventListener('submit', (ev) => {
      ev.preventDefault();
      submitRegister(form, card, '');
    });
  }

  // ---------------------------------------------------------
  // SAYFA: /hesabim (uye hesabi)
  // ---------------------------------------------------------
  const DEPARTMENTS = ['Yazılım', 'Mekanik', 'Elektronik', 'Tasarım', 'Medya', 'Yönetim'];

  function statusTag(s) {
    const map = { 'Yeni': 'tag-amber', 'İnceleniyor': 'tag-cyan', 'Değerlendirildi': 'tag-green', 'Reddedildi': 'tag-red' };
    return map[s] || 'tag-mute';
  }

  async function accountApi(path) {
    for (let attempt = 0; ; attempt++) {
      try {
        return await api(path);
      } catch (e) {
        if (attempt >= 1 || (e.status && e.status < 500)) throw e;
        await new Promise((resolve) => setTimeout(resolve, 350));
      }
    }
  }

  function renderAccountGuest(wrap, message) {
    wrap.innerHTML = `
      <div class="card account-guest">
        <h2>Hesabına giriş yap</h2>
        <p>${esc(message || 'Profilini düzenlemek ve başvurularını takip etmek için giriş yapmalısın.')}</p>
        <div class="acc-actions">
          <button class="btn btn-primary" type="button" id="acc-login">Giriş Yap</button>
          <a class="btn btn-ghost" href="/kayit">Kayıt Ol</a>
        </div>
      </div>`;
    el('acc-login').addEventListener('click', openAuth);
  }

  async function initAccount() {
    const wrap = el('account-wrap');
    if (!wrap) return;

    if (!getUser()) {
      renderAccountGuest(wrap);
      return;
    }

    skeletons(wrap, 2, 'skeleton-lg');
    let me, apps, favs;
    try {
      me = (await accountApi('/me')).user;
      apps = await accountApi('/me/applications').catch(() => []);
      favs = await accountApi('/me/favorites').catch(() => []);
    } catch (e) {
      if (e.status === 401) {
        clearUser();
        renderAccountGuest(wrap, 'Oturumun doğrulanamadı. Hesabına devam etmek için yeniden giriş yap.');
        return;
      }
      wrap.innerHTML = `
        <div class="card account-guest">
          <h2>Hesap bilgileri yüklenemedi</h2>
          <p>Bağlantı geçici olarak kesilmiş olabilir. Çıkış yapmadan tekrar deneyebilirsin.</p>
          <button class="btn btn-primary" type="button" id="acc-retry">Tekrar Dene</button>
        </div>`;
      el('acc-retry').addEventListener('click', initAccount);
      return;
    }
    apps = apps || [];
    favs = favs || [];
    favCache = new Set(favs.map((f) => f.target_type + ':' + f.target_id));
    setUser(getUserToken(), me);

    const full = `${me.first_name || ''} ${me.last_name || ''}`.trim() || me.username;
    wrap.innerHTML = `
      <div class="account-head card">
        ${avatarBlock(me, full, '', 'acc-head-avatar')}
        <div>
          <div class="auth-name">${esc(full)}</div>
          <div class="auth-role">${esc(me.username)}${me.email ? ' • ' + esc(me.email) : ''}</div>
        </div>
        <button class="btn btn-ghost btn-sm" type="button" id="acc-logout" style="margin-left:auto">Çıkış Yap</button>
      </div>

      <section class="card acc-block">
        <h2>Profil Fotoğrafı</h2>
        <div class="avatar-editor">
          ${avatarBlock(me, full, 'avatar-md', 'acc-avatar-preview')}
          <div class="avatar-editor-main">
            <p class="avatar-hint">JPG, PNG veya WebP yükleyebilirsin. Görsel, yüklenmeden önce otomatik olarak 320 piksele küçültülür.</p>
            <div class="avatar-editor-actions">
              <input type="file" id="acc-avatar-file" accept="image/png,image/jpeg,image/webp,image/gif" hidden>
              <button class="btn btn-primary btn-sm" type="button" id="acc-avatar-pick">Fotoğraf Yükle</button>
              <button class="btn btn-ghost btn-sm" type="button" id="acc-avatar-remove"${me.avatar ? '' : ' hidden'}>Kaldır</button>
            </div>
          </div>
        </div>
      </section>

      <section class="card acc-block">
        <h2>Profil Bilgileri</h2>
        <form id="acc-profile" class="form-grid" novalidate>
          <div class="field"><label for="acc-first">Adı</label><input id="acc-first" name="first_name" type="text" value="${esc(me.first_name || '')}" required></div>
          <div class="field"><label for="acc-last">Soyadı</label><input id="acc-last" name="last_name" type="text" value="${esc(me.last_name || '')}" required></div>
          <div class="field"><label for="acc-age">Yaş</label><input id="acc-age" name="age" type="number" min="10" max="99" value="${me.age != null ? esc(me.age) : ''}"></div>
          <div class="field"><label for="acc-dep">Birim</label>
            <select id="acc-dep" name="department">
              <option value="">Seçin</option>
              ${DEPARTMENTS.map((d) => `<option value="${esc(d)}" ${d === me.department ? 'selected' : ''}>${esc(d)}</option>`).join('')}
            </select>
          </div>
          <div class="field full"><button class="btn btn-primary" type="submit">Kaydet</button></div>
        </form>
      </section>

      <section class="card acc-block">
        <h2>Bildirim Tercihleri</h2>
        <form id="acc-notify" class="acc-notify" novalidate>
          <label class="notify-row">
            <span class="notify-text"><b>Yeni haberler</b><span>Takımdan yeni bir haber yayınlandığında e-posta gönder.</span></span>
            <input type="checkbox" name="notify_news" ${me.notify_news ? 'checked' : ''}>
          </label>
          <label class="notify-row">
            <span class="notify-text"><b>Duyurular</b><span>Yeni bir resmî duyuru yayınlandığında e-posta gönder.</span></span>
            <input type="checkbox" name="notify_announcements" ${me.notify_announcements ? 'checked' : ''}>
          </label>
          <div class="field full"><button class="btn btn-primary" type="submit">Tercihleri Kaydet</button></div>
        </form>
      </section>

      <section class="card acc-block">
        <h2>Başvurularım <span class="acc-count">${apps.length}</span></h2>
        <div id="acc-apps"></div>
      </section>

      <section class="card acc-block">
        <h2>Favorilerim <span class="acc-count" id="acc-fav-count">${favs.length}</span></h2>
        <div id="acc-favs"></div>
      </section>

      <section class="card acc-block">
        <h2>Şifre Değiştir</h2>
        <form id="acc-pass" class="form-grid" novalidate>
          <div class="field"><label for="acc-p-cur">Mevcut Şifre</label><input id="acc-p-cur" name="currentPassword" type="password" autocomplete="current-password" required></div>
          <div class="field"><label for="acc-p-new">Yeni Şifre</label><input id="acc-p-new" name="newPassword" type="password" autocomplete="new-password" minlength="6" required></div>
          <div class="field full"><button class="btn btn-primary" type="submit">Şifreyi Güncelle</button></div>
        </form>
      </section>`;

    const appsHost = el('acc-apps');
    appsHost.innerHTML = apps.length
      ? apps.map((a) => `
          <div class="acc-app">
            <div class="acc-app-main">
              <b>${esc(a.career_title || 'Genel Başvuru')}</b>
              <span>${esc(a.career_department || '')}${a.career_department ? ' • ' : ''}${esc(fmtDate(a.created_at))}</span>
            </div>
            <span class="tag ${statusTag(a.status)}">${esc(a.status)}</span>
          </div>`).join('')
      : '<div class="state">Henüz bir başvurun yok. <a href="/kariyer">Açık pozisyonlara göz at →</a></div>';

    el('acc-logout').addEventListener('click', async () => { await logoutUser(); location.href = '/'; });
    renderAccountFavorites(el('acc-favs'), favs);
    bindAccountForms();
  }

  /** Hesabim sayfasindaki favori listesini cizer. */
  function renderAccountFavorites(host, list) {
    if (!host) return;
    if (!list.length) {
      host.innerHTML = '<div class="state">Henüz favori kaydetmedin. Haber ve duyurulardaki <b>Kaydet</b> butonuyla buraya ekleyebilirsin.</div>';
      return;
    }
    host.innerHTML = list.map((f) => {
      const isNews = f.target_type === 'news';
      const title = f.title || 'İçerik kaldırılmış';
      const href = isNews ? (f.slug ? `/haber?slug=${encodeURIComponent(f.slug)}` : '/haberler') : '/duyurular';
      return `
        <div class="acc-fav">
          <div class="acc-fav-main">
            <span class="tag ${isNews ? 'tag-cyan' : 'tag-amber'}">${isNews ? 'Haber' : 'Duyuru'}</span>
            <b>${f.title ? `<a href="${href}">${esc(title)}</a>` : esc(title)}</b>
          </div>
          <button class="like-btn sm fav-btn on" type="button" data-fav="${f.target_id}" data-fav-type="${f.target_type}" aria-pressed="true" title="Favorilerden çıkar">${BOOKMARK_ICON}</button>
        </div>`;
    }).join('');

    qsa('[data-fav]', host).forEach((b) => b.addEventListener('fav-toggle', (ev) => {
      if (ev.detail && ev.detail.saved) return;
      const row = b.closest('.acc-fav');
      if (row) row.remove();
      const count = el('acc-fav-count');
      if (count) count.textContent = String(qsa('.acc-fav', host).length);
      if (!qsa('.acc-fav', host).length) renderAccountFavorites(host, []);
    }));
    bindFavoriteButtons(host);
  }

  function bindAccountForms() {
    const profile = el('acc-profile');
    if (profile) profile.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = qs('button[type=submit]', profile);
      btn.disabled = true;
      try {
        const payload = Object.fromEntries(new FormData(profile).entries());
        const r = await api('/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        setUser(getUserToken(), r.user);
        toast('Profil bilgilerin güncellendi.');
      } catch (e) { toast(e.message, 'error'); }
      finally { btn.disabled = false; }
    });

    const notify = el('acc-notify');
    if (notify) notify.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = qs('button[type=submit]', notify);
      btn.disabled = true;
      try {
        const payload = {
          notify_news: qs('[name=notify_news]', notify).checked,
          notify_announcements: qs('[name=notify_announcements]', notify).checked,
        };
        const r = await api('/me', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        setUser(getUserToken(), r.user);
        toast('Bildirim tercihlerin kaydedildi.');
      } catch (e) { toast(e.message, 'error'); }
      finally { btn.disabled = false; }
    });

    const pass = el('acc-pass');
    if (pass) pass.addEventListener('submit', async (ev) => {
      ev.preventDefault();
      const btn = qs('button[type=submit]', pass);
      btn.disabled = true;
      try {
        const payload = Object.fromEntries(new FormData(pass).entries());
        await api('/me/password', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
        pass.reset();
        toast('Şifren güncellendi.');
      } catch (e) { toast(e.message, 'error'); }
      finally { btn.disabled = false; }
    });

    bindAvatarEditor();
  }

  // ---------------------------------------------------------
  // Profil fotografi
  // ---------------------------------------------------------

  /** Secilen gorseli kare olarak kirpar, kucultur ve JPEG data URL doner. */
  function resizeImage(file, max) {
    return new Promise((resolve, reject) => {
      if (!file || !/^image\//.test(file.type || '')) { reject(new Error('Lütfen bir görsel dosyası seç.')); return; }
      if (file.size > 8 * 1024 * 1024) { reject(new Error('Görsel en fazla 8 MB olabilir.')); return; }
      const reader = new FileReader();
      reader.onerror = () => reject(new Error('Dosya okunamadı.'));
      reader.onload = () => {
        const img = new Image();
        img.onerror = () => reject(new Error('Görsel açılamadı.'));
        img.onload = () => {
          const side = Math.min(img.width, img.height);
          const out = Math.max(1, Math.min(max || 320, side));
          const canvas = document.createElement('canvas');
          canvas.width = out; canvas.height = out;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff';
          ctx.fillRect(0, 0, out, out);
          ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, out, out);
          resolve(canvas.toDataURL('image/jpeg', 0.85));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /** Sayfadaki tum avatar gostergelerini yeni fotografa gore yeniler. */
  function refreshAvatars(user) {
    const full = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.username;
    const head = el('acc-head-avatar');
    if (head) head.outerHTML = avatarBlock(user, full, '', 'acc-head-avatar');
    const preview = el('acc-avatar-preview');
    if (preview) preview.outerHTML = avatarBlock(user, full, 'avatar-md', 'acc-avatar-preview');
    const removeBtn = el('acc-avatar-remove');
    if (removeBtn) removeBtn.hidden = !user.avatar;
    renderHeader(siteSettings);
  }

  /** Avatar degisikligini sunucuya kaydeder ve arayuzu gunceller. */
  async function saveAvatar(avatar) {
    const r = await api('/me/avatar', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ avatar }),
    });
    setUser(getUserToken(), r.user);
    refreshAvatars(r.user);
    return r.user;
  }

  function bindAvatarEditor() {
    const input = el('acc-avatar-file');
    const pick = el('acc-avatar-pick');
    const remove = el('acc-avatar-remove');

    if (input && pick) {
      pick.addEventListener('click', () => input.click());
      input.addEventListener('change', async () => {
        const file = input.files && input.files[0];
        input.value = '';
        if (!file) return;
        pick.disabled = true;
        try {
          await saveAvatar(await resizeImage(file, 320));
          toast('Profil fotoğrafın güncellendi.');
        } catch (e) { toast(e.message, 'error'); }
        finally { pick.disabled = false; }
      });
    }

    if (remove) remove.addEventListener('click', async () => {
      remove.disabled = true;
      try {
        await saveAvatar(null);
        toast('Profil fotoğrafın kaldırıldı.');
      } catch (e) { toast(e.message, 'error'); }
      finally { remove.disabled = false; }
    });
  }

  // ---------------------------------------------------------
  // Kaydirma animasyonu (reveal)
  // ---------------------------------------------------------
  function initReveal() {
    const nodes = qsa([
      'main .card',
      'main .stat',
      'main .announce',
      'main .cta-band',
      'main .section-head',
      'main .split > div > .eyebrow',
      'main .split > div > h2',
      'main .split > div > p',
    ].join(', '));
    if (!nodes.length) return;
    if (!('IntersectionObserver' in window)) return;
    // Ayni kapsayici icindeki ogelere kademeli gecikme (stagger) uygula
    const counts = new Map();
    nodes.forEach((n) => {
      const key = n.parentElement;
      const i = counts.get(key) || 0;
      counts.set(key, i + 1);
      n.style.transitionDelay = Math.min(i, 6) * 70 + 'ms';
    });
    const io = new IntersectionObserver((entries) => {
      entries.forEach((en) => {
        if (en.isIntersecting) {
          const t = en.target;
          t.classList.add('in');
          io.unobserve(t);
          // Gecikmeyi temizle ki hover gecisleri etkilenmesin
          setTimeout(() => { t.style.transitionDelay = ''; }, 900);
        }
      });
    }, { rootMargin: '0px 0px -6% 0px', threshold: 0.06 });
    nodes.forEach((n) => { n.classList.add('reveal'); io.observe(n); });
    // Guvenlik agi: her durumda icerik gorunur olsun
    setTimeout(() => nodes.forEach((n) => n.classList.add('in')), 1600);
    setTimeout(() => nodes.forEach((n) => { n.style.transitionDelay = ''; }), 2600);
  }

  // ---------------------------------------------------------
  // Gorsel efektler: kaydirma cubugu, yukari don, header, paralaks
  // ---------------------------------------------------------
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  function initFx() {
    const header = qs('.site-header');

    // Ustte ince kaydirma ilerleme cubugu
    const bar = document.createElement('div');
    bar.className = 'scroll-progress';
    document.body.appendChild(bar);

    // Yukari don butonu
    const toTop = document.createElement('button');
    toTop.type = 'button';
    toTop.className = 'to-top';
    toTop.setAttribute('aria-label', 'Sayfanın başına dön');
    toTop.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 19V5"/><path d="M5 12l7-7 7 7"/></svg>';
    toTop.addEventListener('click', () => {
      window.scrollTo({ top: 0, behavior: reduceMotion ? 'auto' : 'smooth' });
    });
    document.body.appendChild(toTop);

    const hero = qs('.hero');
    let ticking = false;

    function update() {
      ticking = false;
      const y = window.scrollY || document.documentElement.scrollTop || 0;

      // Ilerleme cubugu
      const docH = document.documentElement.scrollHeight - window.innerHeight;
      const ratio = docH > 0 ? Math.min(1, Math.max(0, y / docH)) : 0;
      bar.style.transform = 'scaleX(' + ratio + ')';

      // Header kaydirma durumu
      if (header) header.classList.toggle('scrolled', y > 8);

      // Yukari don butonu gorunurlugu
      toTop.classList.toggle('show', y > 420);

      // Hero paralaks
      if (hero && !reduceMotion && window.innerWidth > 860) {
        hero.style.setProperty('--hero-shift', (y * -0.18).toFixed(1) + 'px');
      }
    }

    function onScroll() {
      if (!ticking) { ticking = true; window.requestAnimationFrame(update); }
    }

    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    update();

    // Kart uzerinde imleci takip eden yumusak parlama
    if (!reduceMotion) {
      document.addEventListener('mousemove', (e) => {
        const card = e.target.closest ? e.target.closest('.card') : null;
        if (!card) return;
        const r = card.getBoundingClientRect();
        card.style.setProperty('--mx', (((e.clientX - r.left) / r.width) * 100).toFixed(1) + '%');
        card.style.setProperty('--my', (((e.clientY - r.top) / r.height) * 100).toFixed(1) + '%');
      }, { passive: true });
    }
  }

  // ---------------------------------------------------------
  // Baslat
  // ---------------------------------------------------------
  const PAGES = {
    home: initHome, takim: initTeam, arac: initVehicle, haberler: initNewsList,
    haber: initNewsDetail, duyurular: initAnnouncements, faaliyetler: initActivities,
    kariyer: initCareers, sponsorlar: initSponsors, iletisim: initContact,
    giris: initLogin, kayit: initRegister, hesabim: initAccount,
  };

  let siteSettings = {};

  document.addEventListener('DOMContentLoaded', async () => {
    try { siteSettings = (await api('/settings')) || {}; } catch (e) { console.warn('Ayarlar yüklenemedi', e); }
    renderHeader(siteSettings);
    renderFooter(siteSettings);
    renderQuickContact(siteSettings);
    initFx();
    initSearch();
    const page = document.body.dataset.page || 'home';
    const init = PAGES[page];
    if (init) {
      try { await init(siteSettings); } catch (e) { console.error('Sayfa başlatılamadı:', e); }
    }
    initReveal();
  });
})();
