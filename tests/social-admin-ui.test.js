// Checagem estatica da aba de Videos no admin. O comportamento de verdade
// (aprovar, recusar, atalhos) e coberto pelos testes HTTP; aqui o que importa
// e a tela existir, estar ligada na navegacao e nao atrapalhar a UX de quem
// aprova o dia inteiro.
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync(path.join(__dirname, '..', 'public', 'admin.html'), 'utf8');

describe('admin tem a aba de Videos', () => {
  it('existe o pane e o botao na navegacao', () => {
    assert.match(html, /id="tab-videos" class="admin-tab-pane"/, 'pane da aba');
    assert.match(html, /switchAdminTab\('videos'/, 'botao de navegacao');
  });

  it('a aba carrega a fila ao ser aberta', () => {
    assert.match(html, /tabId === 'videos'/, 'switchAdminTab precisa carregar a aba');
    assert.match(html, /loadSocialVideos\(\)/, 'carrega a fila');
  });

  it('mostra o total pago no mes (decisao de freio)', () => {
    assert.match(html, /paidThisMonth/, 'le o total do mes');
    assert.match(html, /id="social-stat-month"/, 'tem onde mostrar');
  });

  it('usa adminFetch, que existe de fato', () => {
    // O plano escrevia apiAdmin(), que nao existe neste arquivo. Se alguem
    // voltar a usar apiAdmin, a tela quebra em runtime sem o teste de HTTP
    // accusing.
    assert.match(html, /async function adminFetch\(/, 'o helper precisa existir');
    assert.ok(!/apiAdmin\(/i.test(html), 'nao deve chamar apiAdmin (nao existe)');
    assert.match(html, /adminFetch\('\/social\/pending'\)/, 'a fila usa adminFetch');
    assert.match(html, /adminFetch\(`\/social\/\$\{[^}]+\}\/approve`/, 'aprova via adminFetch');
  });

  it('aprovacao e num clique, sem confirm()', () => {
    const i = html.indexOf('async function socialAprovar');
    assert.ok(i > 0, 'socialAprovar precisa existir');
    const corpo = html.slice(i, i + 900);
    assert.ok(!/confirm\(/.test(corpo), 'aprovacao nao pode pedir confirmacao');
    assert.match(corpo, /approve/, 'chama o endpoint de aprovar');
  });

  it('tem os atalhos de teclado A, R, J e K', () => {
    const i = html.indexOf('function socialKeydown');
    assert.ok(i > 0, 'socialKeydown precisa existir');
    const corpo = html.slice(i, i + 1400);
    for (const tecla of ["'a'", "'r'", "'j'", "'k'"]) {
      assert.ok(corpo.includes(tecla), 'falta o atalho ' + tecla);
    }
    assert.match(html, /addEventListener\('keydown', socialKeydown\)/, 'ligado ao teclado');
  });

  it('os atalhos nao dispara quando o admin esta digitando', () => {
    const i = html.indexOf('function socialKeydown');
    const corpo = html.slice(i, i + 900);
    assert.match(corpo, /INPUT|TEXTAREA/, 'precisa ignorar campos de texto');
  });

  it('so roda os atalhos com a aba de Videos aberta', () => {
    const i = html.indexOf('function socialKeydown');
    const corpo = html.slice(i, i + 500);
    assert.match(corpo, /tab-videos/, 'precisa checar se a aba esta ativa');
  });

  it('a recusa pede motivo e mostra o que a pessoa ja aprovou antes', () => {
    assert.match(html, /async function socialRecusar/, 'existe socialRecusar');
    assert.match(html, /reason:/, 'manda o motivo');
    assert.match(html, /approvedBefore/, 'mostra quantos ja aprovou');
  });

  it('fala o motivo da recusa em portugues para o operador entender', () => {
    const i = html.indexOf('async function socialRecusar');
    const bloco = html.slice(i, i + 700);
    const iniPrompt = bloco.indexOf('prompt(');
    assert.ok(iniPrompt > 0, 'a recusa precisa pedir o motivo');
    // as duas strings do prompt: rotulo e valor padrao
    const args = bloco.slice(iniPrompt + 7, iniPrompt + 260);
    const strings = [...args.matchAll(/'([^']{3,})'/g)].map(m => m[1]);
    assert.ok(strings.length >= 2, 'prompt precisa ter rotulo e valor padrao: ' + JSON.stringify(strings));
    const padrao = strings[1];
    assert.ok(padrao.length > 10, 'motivo padrao util: ' + JSON.stringify(padrao));
    assert.match(padrao, /link|vídeo|video/i, 'motivo padrao fala do problema: ' + padrao);
    assert.ok(!/[a-z]{4,}\s+[a-z]{4,}/.test(padrao.replace(/[áéíóúâêãõç]/gi, 'a')) || /[áéíóúâêãõç]/i.test(padrao),
      'motivo padrao em portugues: ' + JSON.stringify(padrao));
  });
});