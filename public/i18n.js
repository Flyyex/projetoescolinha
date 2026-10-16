(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TruckAutoI18n = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const SUPPORTED = ['pt', 'es', 'en', 'zh'];
  const LOCALES = { pt: 'pt-BR', es: 'es-ES', en: 'en-US', zh: 'zh-CN' };

  function resolveLang(saved, navLang) {
    const s = String(saved || '').toLowerCase().trim();
    if (SUPPORTED.indexOf(s) !== -1) return s;
    const n = String(navLang || '').toLowerCase().trim();
    for (const l of SUPPORTED) { if (l !== 'pt' && n.indexOf(l) === 0) return l; }
    return 'pt';
  }

  function lookup(dict, fallbackDict, key, lang) {
    const get = (o) => String(key).split('.').reduce(
      (a, p) => (a && Object.prototype.hasOwnProperty.call(a, p) ? a[p] : undefined), o);
    const v = get(dict);
    if (typeof v === 'string') return v;
    const fb = get(fallbackDict);
    if (typeof fb === 'string') {
      if (typeof console !== 'undefined') console.warn('[i18n] ' + (lang || current) + ':' + key);
      return fb;
    }
    return key;
  }

  function interpolate(str, vars) {
    return String(str).replace(/\{(\w+)\}/g, (m, k) =>
      (vars && vars[k] !== undefined ? vars[k] : m));
  }

  const STORE_KEY = 'truckauto_lang';
  let current = 'pt';
  let cache = {}; // lang -> dict
  let ptDict = null;

  function lsGet() { try { return window.localStorage.getItem(STORE_KEY); } catch (e) { return null; } }
  function lsSet(v) { try { window.localStorage.setItem(STORE_KEY, v); } catch (e) {} }
  function navLang() { return (typeof navigator !== 'undefined' && (navigator.language || navigator.userLanguage)) || ''; }

  function getLang() { return current; }

  async function loadLang(lang) {
    if (cache[lang]) return cache[lang];
    const res = await fetch('/i18n/' + lang + '.json');
    if (!res.ok) throw new Error('i18n 404 ' + lang);
    const dict = await res.json();
    cache[lang] = dict;
    return dict;
  }

  async function setLang(lang) {
    const target = SUPPORTED.indexOf(lang) !== -1 ? lang : 'pt';
    try { await loadLang('pt').then((d) => { ptDict = d; }); } catch (e) {}
    try { await loadLang(target); } catch (e) {}
    if (!cache[target] && !cache.pt && !ptDict) return current;
    current = cache[target] ? target : 'pt';
    lsSet(current);
    if (typeof document !== 'undefined') {
      document.documentElement.lang = LOCALES[current];
      applyStatic(document);
      window.dispatchEvent(new Event('truckauto:lang'));
    }
    return current;
  }

  function t(key, vars) {
    return interpolate(lookup(cache[current] || {}, ptDict || cache.pt || {}, key, current), vars);
  }

  function setText(el, str) {
    const nodes = Array.from(el.childNodes).filter((n) => n.nodeType === 3 && n.nodeValue.trim() !== '');
    if (nodes.length) nodes[0].nodeValue = str;
    else el.textContent = str;
  }

  function applyStatic(root) {
    const r = root || document;
    r.querySelectorAll('[data-i18n]').forEach((el) => { setText(el, t(el.getAttribute('data-i18n'))); });
    r.querySelectorAll('[data-i18n-ph]').forEach((el) => { el.setAttribute('placeholder', t(el.getAttribute('data-i18n-ph'))); });
    r.querySelectorAll('[data-i18n-aria]').forEach((el) => { el.setAttribute('aria-label', t(el.getAttribute('data-i18n-aria'))); });
    r.querySelectorAll('[data-i18n-title]').forEach((el) => { el.setAttribute('title', t(el.getAttribute('data-i18n-title'))); });
  }

  function init() {
    current = resolveLang(lsGet(), navLang());
    return setLang(current).catch(() => current);
  }
  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
  }

  return { SUPPORTED, LOCALES, resolveLang, lookup, interpolate, getLang, setLang, t, applyStatic };
}));
