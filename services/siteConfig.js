const fs = require('fs');
const path = require('path');

const CONFIG = path.join(__dirname, '..', 'config', 'site.json');
const TOKEN = /\{\{(SITE_[A-Z_]+)\}\}/g;

let cache = null;

function carregar() {
  if (cache) return cache;

  let base = {};
  if (!fs.existsSync(CONFIG)) {
    console.error('[SITE] config/site.json nao existe. Copie config/site.json.example e preencha,');
    console.error('[SITE] ou defina as variaveis SITE_* no ambiente. Os tokens ficarao sem substituir.');
  } else {
    try {
      // BOM: o Set-Content -Encoding UTF8 do PowerShell grava com BOM, e o
      // JSON.parse quebra com "Unexpected token". Tirar o BOM na mao resolve.
      let bruto = fs.readFileSync(CONFIG, 'utf8');
      if (bruto.charCodeAt(0) === 0xFEFF) bruto = bruto.slice(1);
      base = JSON.parse(bruto);
    } catch (e) {
      console.error('[SITE] nao consegui ler config/site.json:', e.message);
    }
  }

  const mapa = {
    SITE_RAZAO_SOCIAL:   base.razaoSocial,
    SITE_CNPJ:           base.cnpj,
    SITE_RESPONSAVEL:    base.responsavel,
    SITE_EMAIL:          base.email,
    SITE_WHATSAPP:       base.whatsapp,
    SITE_WHATSAPP_TEXTO: base.whatsappTexto,
    SITE_GRUPO_WHATSAPP: base.grupoWhatsapp,
    SITE_TELEGRAM:       base.telegram,
    SITE_INSTAGRAM:      base.instagram,
    SITE_DOMINIO:        base.dominio,
    SITE_APP_URL:        base.appUrl || process.env.APP_URL || '',
  };

  for (const chave of Object.keys(mapa)) {
    if (process.env[chave]) mapa[chave] = process.env[chave];
  }

  const faltando = Object.keys(mapa).filter((k) => !mapa[k]);
  if (faltando.length) {
    console.warn('[SITE] preencha em config/site.json: ' + faltando.join(', '));
  }

  // Campos que ainda estao com valor de exemplo -- avisa porque publicar um CNPJ
  // ou telefone de mentira em termos de uso e problema legal.
  const exemplo = (base._pendentes || []).filter((campo) => {
    const valor = base[campo];
    return valor === undefined || !valor || /^(SEU_|0{2}\.0|Nome do)/.test(valor);
  });
  if (exemplo.length) {
    console.warn('[SITE] ATENCAO: ainda com valor de exemplo em config/site.json -> ' + exemplo.join(', '));
  }

  cache = mapa;
  return mapa;
}

function substituir(texto) {
  const mapa = carregar();
  return texto.replace(TOKEN, (match, chave) => {
    const v = mapa[chave];
    return v ? String(v) : match;
  });
}

module.exports = { carregar, substituir };
