// Carrega o pixel do TikTok e liga os eventos do app.
// Roda nas 3 telas publicas (presell, login e app). O ID vem do painel admin,
// entao trocar de pixel nao exige novo deploy.
(function () {
  'use strict';
  // cria o stub ttq agora (sincrono) para nenhum evento se perder
  if (typeof window.TikTokBase === 'function') window.TikTokBase();

  function get(url) { return fetch(url, { credentials: 'include' }).then(r => r.ok ? r.json() : null).catch(() => null); }

  get('/api/admin/public-settings').then(s => {
    if (!s || !s.tiktokPixelId) return;
    try {
      if (typeof window.ttq === 'undefined') return;
      window.ttq.load(s.tiktokPixelId);
      window.ttq.page();
    } catch (e) { console.error('[TIKTOK] falha ao iniciar pixel:', e.message); }
  });
})();
