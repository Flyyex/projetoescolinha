/* i18n de DADOS (catálogo): resolve campo por idioma com fallback PT.
 * UMD: browser (window.I18nData) + node --test. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.I18nData = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Pega obj[base_lang] quando não-vazio, senão obj[base] (PT).
  function pickLang(obj, base, lang) {
    obj = obj || {};
    if (lang && lang !== 'pt') {
      const v = obj[base + '_' + lang];
      if (typeof v === 'string' && v.trim() !== '') return v;
    }
    return obj[base];
  }

  // Cidades dos EUA: o nome e o mesmo nos quatro idiomas, entao cada entrada so
// mapeia para ela mesma. A unica traduzida de verdade e "Todas as Cidades".
const CITIES = {
    'Kansas City, MO': { es: 'Kansas City, MO', en: 'Kansas City, MO', zh: 'Kansas City, MO' },
    'Memphis, TN': { es: 'Memphis, TN', en: 'Memphis, TN', zh: 'Memphis, TN' },
    'Atlanta, GA': { es: 'Atlanta, GA', en: 'Atlanta, GA', zh: 'Atlanta, GA' },
    'Dallas, TX': { es: 'Dallas, TX', en: 'Dallas, TX', zh: 'Dallas, TX' },
    'Los Angeles, CA': { es: 'Los Angeles, CA', en: 'Los Angeles, CA', zh: 'Los Angeles, CA' },
    'Todas as Cidades': { es: 'Todas las ciudades', en: 'All cities', zh: '所有城市' }
  };

  function cityName(city, lang) {
    const entry = CITIES[String(city || '')];
    if (!entry) return city;
    if (!lang || lang === 'pt') return city;
    return entry[lang] || city;
  }

  return { pickLang, cityName };
}));
