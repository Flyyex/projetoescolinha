// Bloco TikTok Pixel, gerado a partir do codigo oficial que o TikTok entregou
// no Gerenciador de Eventos. Mantem a estrutura EXATA (inclusive o n.src, que e
// o que faz o events.js carregar de verdade) e so troca o ID fixo por uma
// leitura do painel — assim da para trocar o pixel sem novo deploy.
//
// O stub e criado de forma SINCRONA: eventos disparados antes do ID chegar
// ficam na fila do ttq e sao enviados assim que o events.js carrega.
window.TikTokBase = (function () {
  'use strict';
  return function () {
    !function (w, d, t) {
      w.TiktokAnalyticsObject = t;
      var ttq = w[t] = w[t] || [];
      ttq.methods = ["page", "track", "identify", "instances", "debug", "on", "off", "once", "ready", "alias", "group", "enableCookie", "disableCookie", "holdConsent", "revokeConsent", "grantConsent"];
      ttq.setAndDefer = function (t, e) { t[e] = function () { t.push([e].concat(Array.prototype.slice.call(arguments, 0))) } };
      for (var i = 0; i < ttq.methods.length; i++) ttq.setAndDefer(ttq, ttq.methods[i]);
      ttq.instance = function (t) {
        var e = ttq._i[t] || [], n = 0;
        for (; n < ttq.methods.length; n++) ttq.setAndDefer(e, ttq.methods[n]);
        return e
      };
      ttq.load = function (e, n) {
        var r = "https://analytics.tiktok.com/i18n/pixel/events.js", o = n && n.partner;
        ttq._i = ttq._i || {}, ttq._i[e] = [], ttq._i[e]._u = r, ttq._t = ttq._t || {}, ttq._t[e] = +new Date, ttq._o = ttq._o || {}, ttq._o[e] = n || {};
        n = document.createElement("script");
        n.type = "text/javascript", n.async = !0, n.src = r + "?sdkid=" + e + "&lib=" + t;
        e = document.getElementsByTagName("script")[0];
        e.parentNode.insertBefore(n, e)
      };
    }(window, document, 'ttq');
  };
})();
