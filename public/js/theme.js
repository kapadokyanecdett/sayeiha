/* ============================================================
   SAYE - Tema on yukleme
   Sayfa boyanmadan once kayitli temayi uygular (FOUC onleme).
   <head> icinde, stil dosyasindan sonra calistirilmalidir.
   ============================================================ */
(function () {
  'use strict';
  try {
    var saved = localStorage.getItem('saye-theme');
    if (saved === 'light' || saved === 'dark') {
      document.documentElement.setAttribute('data-theme', saved);
    }
  } catch (e) {
    /* localStorage erisilemezse varsayilan tema kullanilir */
  }

  try {
    if (sessionStorage.getItem('saye-loader-shown') === '1') return;
    sessionStorage.setItem('saye-loader-shown', '1');
  } catch (e) {
    /* Depolama kapaliysa animasyonu yine goster */
  }

  var startedAt = performance.now();
  var loader = document.createElement('div');
  loader.className = 'site-loader';
  loader.setAttribute('role', 'status');
  loader.setAttribute('aria-live', 'polite');
  loader.setAttribute('aria-label', 'SAYE sitesi yükleniyor');
  loader.innerHTML = `
    <div class="site-loader__content">
      <div class="site-loader__mark" aria-hidden="true">
        <span class="site-loader__orbit"></span>
        <span class="site-loader__orbit site-loader__orbit--inner"></span>
        <img class="site-loader__logo" src="/assets/logo.png" alt="">
      </div>
      <div class="site-loader__caption">SAYE <span>• SİSTEMLER BAŞLATILIYOR</span></div>
      <div class="site-loader__progress" aria-hidden="true"><i></i></div>
    </div>`;
  document.documentElement.classList.add('site-is-loading');
  document.documentElement.appendChild(loader);

  var dismissed = false;
  function dismissLoader() {
    if (dismissed) return;
    dismissed = true;
    var reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    var minimumTime = reducedMotion ? 350 : 1500;
    var fadeTime = reducedMotion ? 300 : 1200;
    var wait = Math.max(0, minimumTime - (performance.now() - startedAt));

    window.setTimeout(function () {
      loader.classList.add('site-loader--leaving');
      var cleanup = function () {
        loader.remove();
        document.documentElement.classList.remove('site-is-loading');
      };
      loader.addEventListener('transitionend', cleanup, { once: true });
      window.setTimeout(cleanup, fadeTime + 150);
    }, wait);
  }

  window.addEventListener('load', dismissLoader, { once: true });
  window.setTimeout(dismissLoader, 7000);
})();
