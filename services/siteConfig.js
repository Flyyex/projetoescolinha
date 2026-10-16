/**
 * Dados publicos da empresa (contato, dominio, razao social).
 *
 * A fonte da verdade e config/site.json. As variaveis de ambiente SITE_* tem
 * prioridade sobre o arquivo, o que permite mudar o WhatsApp no painel do
 * Render sem editar codigo.
 *
 * Os tokens {{SITE_*}} ficam versionados no git e sao substituidos aqui, no
 * momento de entregar o arquivo -- assim ninguem corre o risco de commitar por
 * acidente um numero de telefone ou o CNPJ no repositorio.
 */
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
      base = JSON.parse(fs.readFileSync(CONFIG, 'utf8'));
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
  return cache;
}

function substituir(texto) {
  const mapa = carregar();
  return texto.replace(TOKEN, (match, chave) => {
    const v = mapa[chave];
    return v ? String(v) : match;
  });
}

module.exports = { carregar, substituir };
