/* Programa Social — gera os 3 formatos da arte de divulgacao.
 *
 * Regra: a arte entra INTEIRA (encaixe 'contain'). O que sobra recebe um
 * gradiente tirado da BORDA da propria arte, que e o que faz a barra combinar
 * em vez de aparecer como emenda. Nada e cortado em nenhum formato.
 *
 * O calculo roda no navegador: o operador ve os 3 formatos e baixa o que
 * quiser, na resolucao nativa. Sem upload e sem ImageMagick no servidor.
 */

const SOCIAL_FORMATOS = [
  { id: 'vertical', nome: 'TikTok, Reels e Status (9:16)', w: 1080, h: 1920 },
  { id: 'retrato', nome: 'Feed do Instagram (4:5)', w: 1080, h: 1350 },
  { id: 'quadrado', nome: 'Feed e WhatsApp (1:1)', w: 1080, h: 1080 }
];

// Encaixe total: a menor escala que faz a arte caber inteira no alvo.
// dx/dy centralizam o que sobra.
function calcularEncaixe(arteW, arteH, alvoW, alvoH) {
  const escala = Math.min(alvoW / arteW, alvoH / arteH);
  const largura = Math.round(arteW * escala);
  const altura = Math.round(arteH * escala);
  return {
    largura,
    altura,
    dx: Math.round((alvoW - largura) / 2),
    dy: Math.round((alvoH - altura) / 2),
    escala
  };
}

// Media da borda da arte, amostrada a cada 3px. E a cor que a barra usa, por
// isso a emenda some: a barra comeca exatamente na cor que a arte tem ali.
function amostrarBorda(img) {
  const passo = 3;
  const w = img.naturalWidth || img.width;
  const h = img.naturalHeight || img.height;
  const cv = document.createElement('canvas');
  cv.width = w; cv.height = h;
  const ctx = cv.getContext('2d');
  ctx.drawImage(img, 0, 0);
  const media = (xs, y) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let x = 0; x < w; x += passo) {
      const c = ctx.getImageData(x, y, 1, 1).data;
      r += c[0]; g += c[1]; b += c[2]; n++;
    }
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  };
  const mediaColuna = (x) => {
    let r = 0, g = 0, b = 0, n = 0;
    for (let y = 0; y < h; y += passo) {
      const c = ctx.getImageData(x, y, 1, 1).data;
      r += c[0]; g += c[1]; b += c[2]; n++;
    }
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n) };
  };
  return {
    topo: media(null, 0),
    base: media(null, h - 1),
    esquerda: mediaColuna(0),
    direita: mediaColuna(w - 1)
  };
}

function carregarImagem(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Não foi possível carregar a arte.'));
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

async function gerarFormatoSocial(artUrl, formato) {
  const img = await carregarImagem(artUrl);
  const cv = document.createElement('canvas');
  cv.width = formato.w;
  cv.height = formato.h;
  const ctx = cv.getContext('2d');

  const borda = amostrarBorda(img);
  const c = calcularEncaixe(img.naturalWidth, img.naturalHeight, formato.w, formato.h);

  // Barra vertical (sobra em cima/baixo) -> gradiente de cima para baixo.
  // Barra lateral -> gradiente da esquerda para a direita.
  const sobraVertical = formato.h - c.altura > 0;
  const grad = sobraVertical
    ? ctx.createLinearGradient(0, 0, 0, formato.h)
    : ctx.createLinearGradient(0, 0, formato.w, 0);
  const c1 = sobraVertical ? borda.topo : borda.esquerda;
  const c2 = sobraVertical ? borda.base : borda.direita;
  grad.addColorStop(0, `rgb(${c1.r},${c1.g},${c1.b})`);
  grad.addColorStop(1, `rgb(${c2.r},${c2.g},${c2.b})`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, formato.w, formato.h);

  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, c.dx, c.dy, c.largura, c.altura);
  return cv.toDataURL('image/png');
}

function baixarDataUrl(dataUrl, nome) {
  const a = document.createElement('a');
  a.href = dataUrl;
  a.download = nome || 'truckauto.png';
  document.body.appendChild(a);
  a.click();
  a.remove();
}

// Desenha as opcoes na tela. `soGerar` roda so o formato pedido (o botao de
// baixar chama isto para nao refazer os tres).
async function montarFormatosSocial(containerId, artUrl) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = '<p style="font-size: 12px; color: var(--text-muted);">Preparando os formatos...</p>';
  const html = [];
  for (const f of SOCIAL_FORMATOS) {
    try {
      const url = await gerarFormatoSocial(artUrl, f);
      html.push(
        '<div style="margin-bottom: 14px;">'
        + '<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">' + f.nome + '</div>'
        + '<img src="' + url + '" alt="Formato ' + f.id + '" '
        + 'style="max-width:100%; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">'
        + '<button class="btn btn-secondary btn-block" style="margin-top: 6px; font-size: 12px;" '
        + 'onclick="baixarDataUrl(this)">Baixar</button>'
        + '</div>'
      );
    } catch (e) {
      html.push('<div style="font-size: 12px; color: #f43f5e; margin-bottom: 10px;">'
        + 'Não deu para gerar ' + f.nome + ': ' + escSocial(e.message || '') + '</div>');
    }
  }
  box.innerHTML = html.join('');
}

// O botao passa o proprio <img>, que ja tem o PNG gerado como src. Baixar de
// la evita refazer o canvas e mantem o arquivo em resolucao nativa.
function baixarDataUrl(el) {
  const img = el && el.previousElementSibling;
  if (!img || !img.src || img.src.indexOf('data:image/png') !== 0) return;
  const nome = 'truckauto-' + ((img.alt || '').replace('Formato ', '') || 'arte') + '.png';
  const a = document.createElement('a');
  a.href = img.src;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
}

if (typeof window !== 'undefined') {
  window.SOCIAL_FORMATOS = SOCIAL_FORMATOS;
  window.calcularEncaixe = calcularEncaixe;
  window.gerarFormatoSocial = gerarFormatoSocial;
  window.montarFormatosSocial = montarFormatosSocial;
  window.baixarDataUrl = baixarDataUrl;
}