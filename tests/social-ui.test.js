// Testa o render do historico do Programa Social sem browser: extrai a funcao
// do fonte e chama direto. O que importa aqui e o texto que o operador le.
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'social.js'), 'utf8');

function extrair(nome) {
  const ini = src.indexOf('function ' + nome);
  if (ini < 0) throw new Error('funcao ' + nome + ' nao encontrada em public/social.js');
  // recorta ate a proxima funcao de nivel superior
  let i = src.indexOf('{', ini);
  let nivel = 0, achou = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { nivel++; achou = true; }
    else if (src[i] === '}') { nivel--; if (achou && nivel === 0) { return src.slice(ini, i + 1); } }
  }
  throw new Error('nao consegui fechar ' + nome);
}

const escHtml = (s) => String(s == null ? '' : s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// Extrai do fonte as dependencias de renderSocialHistory em vez de stubbar:
// o teste tem que provar o mapeamento de status e o escapamento reais.
const iStatus = src.indexOf('const SOCIAL_STATUS');
assert.ok(iStatus >= 0, 'SOCIAL_STATUS tem que existir em public/social.js');
const statusCorpo = src.slice(iStatus, src.indexOf('};', iStatus) + 2);

const NL = src.includes('\r\n') ? '\r\n' : '\n';
const tira2 = (s) => s.split(NL).map((l) => l.replace(/^  /, '')).join('\n');
// renderSocialHistory depende de escSocial, socialMoney e socialData: as tres
// entram do fonte, sem stub, para o teste cobrir o codigo real.
const escCorpo = tira2(extrair('escSocial'));
const socialMoneyCorpo = tira2(extrair('socialMoney'));
const socialDataCorpo = tira2(extrair('socialData'));
const corpo = tira2(extrair('renderSocialHistory'));

// constroi tudo no mesmo escopo do render
const ambiente = new Function(
  statusCorpo + '\n' + escCorpo + '\n' + socialMoneyCorpo + '\n' + socialDataCorpo + '\n' + corpo
  + '\nreturn { esc: escSocial, money: socialMoney, data: socialData, render: renderSocialHistory };'
)();

const texto = (h) => h.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim();
const render = (posts) => ambiente.render(posts);

describe('renderSocialHistory', () => {
  it('estado vazio diz que nao ha video', () => {
    const t = texto(render([]));
    assert.ok(t.length > 10, 'nao pode ser vazio');
    assert.match(t, /nenhum vídeo/i);
  });

  it('aprovado mostra o valor recebido', () => {
    const t = texto(render([{
      id: 'a', status: 'approved', reward: 1,
      videoUrl: 'https://www.tiktok.com/@a/video/1', createdAt: '2026-10-01T10:00:00Z'
    }]));
    assert.match(t, /aprovado/i);
    assert.match(t, /R\$\s?1,00/);
  });

  it('pendente mostra em analise e NAO mostra valor', () => {
    const t = texto(render([{
      id: 'b', status: 'pending', reward: 0,
      videoUrl: 'https://www.tiktok.com/@a/video/2', createdAt: '2026-10-02T10:00:00Z'
    }]));
    assert.match(t, /análise/i);
    assert.ok(!/R\$/.test(t), 'nao deve mostrar dinheiro no que ainda nao foi aprovado');
  });

  it('recusado mostra o motivo', () => {
    const t = texto(render([{
      id: 'c', status: 'rejected', rejectReason: 'link não abre',
      videoUrl: 'https://www.tiktok.com/@a/video/3', createdAt: '2026-10-03T10:00:00Z'
    }]));
    assert.match(t, /recusado/i);
    assert.match(t, /link não abre/);
  });

  it('escapa o motivo contra HTML (vindo do admin)', () => {
    const h = render([{
      id: 'd', status: 'rejected', rejectReason: '<img src=x onerror=alert(1)>',
      videoUrl: 'https://x/4', createdAt: '2026-10-04T10:00:00Z'
    }]);
    assert.ok(!/<img/.test(h), 'nao pode injetar HTML no motivo');
    assert.match(h, /&lt;img/);
  });

  it('o link do video aparece e abre em aba nova', () => {
    const h = render([{
      id: 'e', status: 'pending', videoUrl: 'https://www.tiktok.com/@a/video/5',
      createdAt: '2026-10-05T10:00:00Z'
    }]);
    assert.match(h, /href="https:\/\/www\.tiktok\.com\/@a\/video\/5"/);
    assert.match(h, /target="_blank"/);
    assert.match(h, /rel="noopener"/);
  });

  it('lista varios em ordem, sem quebrar', () => {
    const h = render([
      { id: '1', status: 'approved', reward: 1, videoUrl: 'https://x/1', createdAt: '2026-10-01T10:00:00Z' },
      { id: '2', status: 'rejected', rejectReason: 'x', videoUrl: 'https://x/2', createdAt: '2026-10-02T10:00:00Z' },
      { id: '3', status: 'pending', videoUrl: 'https://x/3', createdAt: '2026-10-03T10:00:00Z' }
    ]);
    assert.equal((h.match(/href=/g) || []).length, 3, 'tres videos');
  });

  it('status desconhecido nao quebra a tela', () => {
    const t = texto(render([{ id: 'f', status: 'inventado', videoUrl: 'https://x/6', createdAt: '2026-10-06T10:00:00Z' }]));
    assert.ok(t.length > 5, 'precisa renderizar algo');
    assert.ok(!/undefined|NaN/.test(t), 'sem undefined/NaN: ' + t);
  });
});