// Gerador dos 3 formatos. Sem browser: testa a MATEMATICA do encaixe, que e o
// que pode dar errado e cortar a arte. O canvas em si (desenho de verdade) e
// conferido a mao, com os arquivos gerados pelo script de preview.
const fs = require('fs');
const path = require('path');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const src = fs.readFileSync(path.join(__dirname, '..', 'public', 'social-art.js'), 'utf8');

function extrair(nome) {
  const ini = src.indexOf('function ' + nome);
  if (ini < 0) throw new Error('funcao ' + nome + ' nao encontrada em public/social-art.js');
  let i = src.indexOf('{', ini);
  let nivel = 0, achou = false;
  for (; i < src.length; i++) {
    if (src[i] === '{') { nivel++; achou = true; }
    else if (src[i] === '}') { nivel--; if (achou && nivel === 0) return src.slice(ini, i + 1); }
  }
  throw new Error('nao consegui fechar ' + nome);
}

const NL = src.includes('\r\n') ? '\r\n' : '\n';
const tira2 = (s) => s.split(NL).map((l) => l.replace(/^  /, '')).join('\n');

const calc = new Function(tira2(extrair('calcularEncaixe')) + '\nreturn calcularEncaixe;')();

// Os 3 formatos que a campanha precisa
const FORMATOS = (() => {
  const i = src.indexOf('const SOCIAL_FORMATOS');
  assert.ok(i >= 0, 'SOCIAL_FORMATOS tem que existir');
  return new Function(src.slice(i, src.indexOf('];', i) + 2) + '\nreturn SOCIAL_FORMATOS;')();
})();

describe('os tres formatos', () => {
  it('sao exatamente 9:16, 4:5 e 1:1', () => {
    assert.equal(FORMATOS.length, 3);
    const pares = FORMATOS.map((f) => f.w + 'x' + f.h).sort();
    assert.deepEqual(pares, ['1080x1080', '1080x1350', '1080x1920']);
  });

  it('tem nome de rede legivel para o operador escolher', () => {
    for (const f of FORMATOS) {
      assert.ok(f.id && f.nome, 'cada formato precisa de id e nome');
      assert.ok(f.nome.length > 5, 'nome util: ' + f.nome);
    }
  });
});

describe('calcularEncaixe — a arte entra INTEIRA, nunca e cortada', () => {
  it('arte 9:16 no alvo 9:16 preenche tudo', () => {
    const r = calc(1080, 1920, 1080, 1920);
    assert.equal(r.largura, 1080);
    assert.equal(r.altura, 1920);
    assert.equal(r.dx, 0);
    assert.equal(r.dy, 0);
  });

  it('arte alta em 4:5 preenche a ALTURA e sobra barra lateral', () => {
    // 824x1246 (a fly1, proporção 1,51) num alvo 1080x1350 (proporção 1,25).
    // O alvo é mais "quadrado" que a arte, então quem limita é a ALTURA: a arte
    // preenche 1350 de altura e sobram 187px de barra na lateral.
    const r = calc(824, 1246, 1080, 1350);
    assert.equal(r.altura, 1350, 'preenche a altura do alvo');
    assert.equal(r.largura, 893, 'e sobra barra na horizontal');
    assert.ok(r.dx > 0, 'barra centralizada');
    assert.equal(r.dy, 0, 'sem barra vertical');
  });

  it('arte quadrada em 9:16 preenche a LARGURA e sobra barra em cima/baixo', () => {
    // 1080x1080 num alvo 1080x1920: o alvo é muito mais alto, então quem
    // limita é a LARGURA.
    const r = calc(1080, 1080, 1080, 1920);
    assert.equal(r.largura, 1080, 'preenche a largura do alvo');
    assert.equal(r.altura, 1080, 'altura preservada — o quadrado nao estica');
    assert.equal(r.dx, 0, 'sem barra lateral');
    assert.ok(r.dy > 0, 'barra em cima e embaixo');
  });

  it('NUNCA estoura o alvo em nenhuma direcao (o que cortaria a arte)', () => {
    for (const arte of [[824, 1246], [988, 1600], [1080, 1080], [1080, 1920], [400, 300], [3000, 2000]]) {
      for (const f of FORMATOS) {
        const r = calc(arte[0], arte[1], f.w, f.h);
        assert.ok(r.largura <= f.w, arte + ' em ' + f.id + ': largura ' + r.largura + ' > ' + f.w);
        assert.ok(r.altura <= f.h, arte + ' em ' + f.id + ': altura ' + r.altura + ' > ' + f.h);
        assert.ok(r.largura > 0 && r.altura > 0, 'nao pode colapsar para zero');
        // centralizado: as sobras dividem o espaco que sobra
        const sobraH = f.w - r.largura;
        const sobraV = f.h - r.altura;
        assert.ok(r.dx >= 0 && r.dx + r.largura <= f.w, 'fora do alvo na horizontal');
        assert.ok(r.dy >= 0 && r.dy + r.altura <= f.h, 'fora do alvo na vertical');
        if (sobraH === 0) assert.equal(r.dx, 0, 'sem sobra lateral tem que encostar na borda');
        if (sobraV === 0) assert.equal(r.dy, 0, 'sem sobra vertical tem que encostar na borda');
      }
    }
  });

  it('nao estica a arte: contain preserva a proporcao', () => {
    // Erro classico de quem implementa "contain" como "stretch": esticar a arte
    // deformaria o texto e o logo. Um quadrado em 9:16 tem que continuar
    // quadrado, com barra -- nunca virar um retangulo.
    const r = calc(1080, 1080, 1080, 1920);
    const proporcaoArte = 1080 / 1080;
    const proporcaoResult = r.largura / r.altura;
    assert.ok(Math.abs(proporcaoArte - proporcaoResult) < 0.01,
      'a proporção tem que se manter: ' + proporcaoResult);
  });

  it('reduz quando a arte e maior que o alvo (para caber inteira)', () => {
    // 3000x2000 (proporção 1,5) num alvo quadrado 1080x1080: a arte e mais
    // larga que alta, então quem limita é a LARGURA -> 1080x720 com barra
    // vertical. O que nao pode e' passar do alvo, que cortaria a arte.
    const r = calc(3000, 2000, 1080, 1080);
    assert.equal(r.largura, 1080, 'preenche a largura');
    assert.equal(r.altura, 720, 'altura reduzida pela proporção');
    assert.ok(r.dy > 0, 'barra vertical');
    assert.ok(r.largura <= 1080 && r.altura <= 1080, 'nunca passa do alvo');
  });
});

describe('a barra usa o gradiente da propria arte', () => {
  it('existe funcao para amostrar a borda da arte', () => {
    assert.ok(src.indexOf('function amostrarBorda') >= 0,
      'amostrarBorda existe: e o que faz a barra combinar com a arte');
  });

  it('a geracao preenche antes de desenhar a arte', () => {
    const corpo = extrair('gerarFormatoSocial');
    const iFill = corpo.indexOf('fillRect');
    const iDraw = corpo.indexOf('drawImage');
    assert.ok(iFill > 0 && iDraw > 0, 'tem que preencher e desenhar');
    assert.ok(iFill < iDraw, 'o preenchimento vem ANTES da arte, senao a barra fica por cima');
  });

  it('usa gradiente no preenchimento, nao cor chapada', () => {
    const corpo = extrair('gerarFormatoSocial');
    assert.match(corpo, /createLinearGradient/, 'usa gradiente: e o que matou a emenda visivel');
    assert.ok(!/fillStyle\s*=\s*['"]#/.test(corpo), 'nao pinta uma cor fixa por cima da arte');
  });
});