/* Programa Social — tela do operador.
   R$ 1,00 por video aprovado. O link exibido e o inviteCode do proprio
   operador (o mesmo que ja atribui referral no cadastro).

   Este arquivo e carregado por public/app.js no fim do body, entao depende de
   appState, apiRequest e closeModal que ja existem. */

const SOCIAL_STATE = { info: null, posts: [] };

function escSocial(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function socialMoney(v) {
  return 'R$ ' + (parseFloat(v || 0)).toFixed(2).replace('.', ',');
}

function socialData(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch (e) { return ''; }
}

const SOCIAL_STATUS = {
  approved: { txt: 'aprovado', cor: 'var(--accent-green)', ic: 'fa-solid fa-circle-check' },
  pending: { txt: 'em análise', cor: 'var(--accent-gold)', ic: 'fa-regular fa-clock' },
  rejected: { txt: 'recusado', cor: '#f43f5e', ic: 'fa-solid fa-circle-xmark' }
};

function renderSocialHistory(posts) {
  if (!Array.isArray(posts) || !posts.length) {
    return '<p style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 16px 0;">'
      + 'Você ainda não enviou nenhum vídeo.</p>';
  }
  return posts.map(function (p) {
    const m = SOCIAL_STATUS[p.status] || { txt: String(p.status || ''), cor: 'var(--text-muted)', ic: 'fa-solid fa-circle' };
    const motivo = (p.status === 'rejected' && p.rejectReason)
      ? '<div style="font-size: 11px; color: #f43f5e; margin-top: 4px;">Motivo: ' + escSocial(p.rejectReason) + '</div>'
      : '';
    // Dinheiro so aparece quando o video foi aprovado de verdade. No pendente,
    // mostrar valor seria prometer antes da hora.
    const valor = (p.status === 'approved')
      ? ' <strong style="color: var(--accent-green);">+' + socialMoney(p.reward) + '</strong>' : '';
    return '<div style="padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">'
      + '<a href="' + escSocial(p.videoUrl) + '" target="_blank" rel="noopener" '
      + 'style="font-size: 12px; color: var(--primary); word-break: break-all;">'
      + socialData(p.createdAt) + '</a>'
      + '<div style="font-size: 11px; color: ' + m.cor + '; margin-top: 2px;">'
      + '<i class="' + m.ic + '"></i> ' + m.txt + valor + '</div>'
      + motivo + '</div>';
  }).join('');
}

async function socialApi(method, caminho, body) {
  return apiRequest('/social' + caminho, method, body || null);
}

function socialMsg(texto, cor) {
  const el = document.getElementById('social-msg');
  if (!el) return;
  el.style.color = cor || 'var(--text-muted)';
  el.textContent = texto;
}

async function socialCarregar() {
  const box = document.getElementById('social-box');
  if (box) box.innerHTML = '<p style="color: var(--text-muted); font-size: 12px;">Carregando...</p>';
  let info;
  try {
    info = await socialApi('GET', '/info');
  } catch (e) {
    if (box) box.innerHTML = '<p style="color: #f43f5e; font-size: 12px;">Não foi possível carregar. Tente de novo.</p>';
    return;
  }
  SOCIAL_STATE.info = info;
  let lista = { posts: [] };
  try { lista = await socialApi('GET', '/posts'); } catch (e) { /* historico é secundário */ }
  SOCIAL_STATE.posts = (lista && lista.posts) || [];
  if (!box) return;

  const linkEsc = escSocial(info.link || '');
  const linkAttr = linkEsc.replace(/"/g, '&quot;');
  const bonus = info.hashtagsBonus ? ' <span style="color: var(--text-muted);">+ ' + escSocial(info.hashtagsBonus) + '</span>' : '';

  box.innerHTML =
    '<div style="display:flex; align-items:center; gap:10px; padding:12px 14px; border-radius: var(--radius-md); '
    + 'background: linear-gradient(135deg, #0B63E5, #08479E); color:#fff; margin-bottom:14px;">'
    + '<span style="width:34px;height:34px;border-radius:10px;background:rgba(255,255,255,0.18);display:flex;'
    + 'align-items:center;justify-content:center;font-size:15px;"><i class="fa-solid fa-share-nodes"></i></span>'
    + '<div><div style="font-weight:800;font-size:14px;">Ganhe R$ 1 postando</div>'
    + '<div style="font-size:11px;opacity:0.9;">Você já ganhou '
    + '<strong>' + socialMoney(info.totalEarned) + '</strong> em ' + (info.approvedCount || 0) + ' vídeo(s)</div></div></div>'

    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">'
    + 'Grave um vídeo sobre os drones, coloque este link na bio e mande o link do vídeo aqui.</div>'
    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">Seu link de indicação:</div>'
    + '<div style="display:flex;gap:6px;margin-bottom:12px;">'
    + '<input id="social-link" class="form-input" readonly value="' + linkAttr + '" style="flex:1; min-width:0;">'
    + '<button class="btn btn-secondary" onclick="socialCopiarLink()">Copiar</button></div>'

    + '<div style="font-size:12px;color:var(--text-muted);margin-bottom:2px;">Hashtags:</div>'
    + '<div style="font-size:12px;color:var(--primary);margin-bottom:14px;">'
    + escSocial(info.hashtags) + bonus + '</div>'

    + ((info.instrucoes || []).length
      ? '<ul style="font-size:11px;color:var(--text-muted);line-height:1.6;padding-left:18px;margin:10px 0 14px;">'
        + info.instrucoes.map(function (i) { return '<li>' + escSocial(i) + '</li>'; }).join('') + '</ul>'
      : '')

    + ((info.arts || []).length
      ? '<div style="font-size:12px;font-weight:700;margin:16px 0 6px;">Imagens prontas para postar</div>'
        + '<div style="font-size:11px;color:var(--text-muted);margin-bottom:8px;line-height:1.5;">'
        + 'Baixe no tamanho da rede e cole o seu link na bio. A arte aparece inteira '
        + 'nos 3 formatos (a barra em volta faz parte do desenho).</div>'
        + (info.arts || []).map(function (a, idx) {
          return '<div style="border:1px solid rgba(255,255,255,0.08); border-radius: var(--radius-md);'
            + ' padding:10px; margin-bottom:10px;">'
            + '<div style="font-size:12px;font-weight:700;margin-bottom:8px;">' + escSocial(a.nome) + '</div>'
            + '<div id="social-art-box-' + idx + '" style="min-height: 18px;"></div>'
            + '</div>';
        }).join('')
      : '')

    // Formulario de envio. Os campos ficavam sem label e sem separacao, e o
    // placeholder do link era maior que o campo. 16px de fonte nao e capricho:
    // abaixo disso o iOS da zoom na tela quando o campo ganha foco.
    + '<div style="margin-top:20px; padding-top:18px; border-top:1px solid rgba(255,255,255,0.08);">'
    + '<div style="display:flex; align-items:center; gap:8px; font-size:13.5px; font-weight:800; margin-bottom:5px;">'
    + '<i class="fa-solid fa-link" style="color:var(--primary);"></i> Envie o vídeo que você postou</div>'
    + '<div style="font-size:11.5px; color:var(--text-muted); line-height:1.55; margin-bottom:16px;">'
    + 'Cole o link do vídeo publicado. A gente confere e libera seu '
    + 'R$ ' + Number(info.reward || 1).toFixed(2).replace('.', ',')
    + ' no saldo de investir.</div>'

    + '<label for="social-url">Link do vídeo</label>'
    + '<input id="social-url" type="url" inputmode="url" autocomplete="off" spellcheck="false"'
    + ' placeholder="https://www.tiktok.com/@perfil/video/..." style="font-size:16px;">'

    + '<label for="social-handle">Seu @ no TikTok '
    + '<span style="opacity:.65;">(opcional)</span></label>'
    + '<input id="social-handle" type="text" autocomplete="off" spellcheck="false"'
    + ' placeholder="@seuperfil" style="font-size:16px; margin-bottom:14px;">'

    + '<div id="social-msg" style="font-size:12px;margin-bottom:8px;"></div>'
    + '<button class="btn btn-primary btn-block" onclick="socialEnviar()"'
    + ' style="padding:15px 16px; font-size:15px; font-weight:800;">'
    + '<i class="fa-solid fa-paper-plane"></i> Enviar vídeo</button>'
    + '</div>'

    + '<div style="margin-top:18px;"><div style="font-size:12px;font-weight:700;margin-bottom:6px;">Seus vídeos</div>'
    + renderSocialHistory(SOCIAL_STATE.posts) + '</div>';

  // As imagens so aparecem quando existe arte em public/social/arts. Sem
  // arquivo, o bloco nem e desenhado e o resto do programa segue valendo.
  //
  // Cada arte tem seu proprio id de caixa. Com um id so, todo mundo apontava
  // para a primeira caixa: a segunda arte ficava vazia para sempre.
  if ((info.arts || []).length && typeof montarFormatosSocial === 'function') {
    info.arts.forEach(function (a, idx) {
      try {
        montarFormatosSocial('social-art-box-' + idx, a.url);
      } catch (e) { /* canvas pode nao existir neste navegador; o resto segue */ }
    });
  }
}

function socialCopiarLink() {
  const el = document.getElementById('social-link');
  if (!el || !el.value) return;
  if (navigator.clipboard) navigator.clipboard.writeText(el.value);
  socialMsg('Link copiado!', 'var(--accent-green)');
}

async function socialEnviar() {
  const url = (document.getElementById('social-url') || {}).value || '';
  const handle = (document.getElementById('social-handle') || {}).value || '';
  socialMsg('Enviando...', 'var(--text-muted)');
  let r;
  try {
    r = await socialApi('POST', '/posts', { videoUrl: url, network: 'tiktok', handle });
  } catch (e) {
    socialMsg('Erro de conexão. Tente de novo.', '#f43f5e');
    return;
  }
  if (r && r.ok) {
    await socialCarregar();
    socialMsg('Vídeo enviado! Aguarde a análise.', 'var(--accent-green)');
    const campo = document.getElementById('social-url');
    if (campo) campo.value = '';
    return;
  }
  socialMsg((r && r.error) || 'Não foi possível enviar o vídeo.', '#f43f5e');
}

async function openSocialModal() {
  let m = document.getElementById('modal-social');
  if (!m) {
    const div = document.createElement('div');
    div.id = 'modal-social';
    div.className = 'modal';
    div.setAttribute('role', 'dialog');
    div.setAttribute('aria-modal', 'true');
    div.onclick = function (ev) { closeModalOutside(ev, 'modal-social'); };
    div.innerHTML =
      '<div class="modal-content" style="max-height: 88vh; display: flex; flex-direction: column; padding: 0; overflow: hidden;">'
      + '<div style="display: flex; align-items: center; gap: 10px; padding: 14px 16px; background: #0B63E5; color: #fff;">'
      + '<div style="flex: 1; font-weight: 800; font-size: 15px;">Ganhe R$ 1 postando</div>'
      + '<button class="modal-close" onclick="closeModal(\'modal-social\')">&times;</button></div>'
      // A classe modal-body nao e cosmetica: e o que faz .modal-body input e
      // .modal-body label existirem. Sem ela os campos deste modal ficam com o
      // visual padrao do navegador (brancos, estreitos, lado a lado).
      + '<div class="modal-body" style="padding: 16px; overflow-y: auto;">'
      + '<div id="social-box"><p style="color: var(--text-muted); font-size: 12px;">Carregando...</p></div>'
      + '</div></div>';
    document.body.appendChild(div);
    m = div;
  }
  m.classList.add('open');
  await socialCarregar();
}

window.openSocialModal = openSocialModal;
window.socialCopiarLink = socialCopiarLink;
window.socialEnviar = socialEnviar;