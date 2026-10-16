const express = require('express');
const router = express.Router();
const fs = require('fs');
const path = require('path');
const { authMiddleware } = require('../middleware/auth');
const social = require('../services/social');
const {
  findUserById,
  createSocialPost,
  getUserSocialPosts,
  countPendingSocialByUser,
  getUserEarnedTotal,
  countApprovedSocialByUser
} = require('../database');
const { notifyAdminSocialPost } = require('../services/telegramBot');

const HASHTAGS = '#truckauto #investimentos #truckautodrones';
const HASHTAGS_BONUS = '#entregapordrone #rendadigital #drones';

// Nao temos roteiros prontos: o operador grava o que quiser. O caminho que
// cresce e video, mas texto pronto engessava a divulgação — as instrucoes e as
// artes sao o material de apoio, e o aviso de risco fica em `instrucoesDo`.

// Artes de divulgacao em public/social/arts. O app gera os 3 formatos no
// navegador a partir da arte mestra. Sem arte, arts vem vazio e a tela esconde
// o bloco — o resto do programa continua funcionando.
const ARTES_DIR = path.join(__dirname, '..', 'public', 'social', 'arts');

function listarArtes() {
  try {
    return fs.readdirSync(ARTES_DIR)
      .filter((f) => /\.(png|jpe?g)$/i.test(f))
      .sort()
      .map((f) => ({ nome: f, url: '/social/arts/' + encodeURIComponent(f) }));
  } catch (e) {
    return [];
  }
}

// As instruções citam o valor do backend, nunca um "R$ 1" escrito no fonte.
// Se o premio mudar, a tela muda junto -- e o que a pessoa gravou no vídeo
// continua batendo com o que o sistema paga.
function instrucoesDo(premio) {
  const v = 'R$ ' + Number(premio).toFixed(2).replace('.', ',');
  return [
    'Grave na vertical (9:16) e mostre o drone funcionando de verdade.',
    'Coloque o link de indicação na bio do vídeo.',
    'Cada vídeo aprovado vale ' + v + '.',
    'Repita em vídeos diferentes — o app paga ' + v + ' em cada um.',
    'Se for recusado, o motivo aparece no app e dá para reenviar.',
    'Os rendimentos variam todo dia. Não é retorno garantido.'
  ];
}

// O link que o operador copia precisa ser ABSOLUTO: vai para a bio do TikTok,
// e "/presell?ref=..." colado num vídeo nao abre nada.
//
// APP_URL/PUBLIC_URL tem prioridade. Sem elas (nao estao no .env hoje), cai
// para o host da propria requisicao -- no Render o host ja vem correto, entao
// nao depende de configurar nada. A ordem importa: host de requisicao pode ser
// forjado pelo header Host, mas o pior caso e o operador copiar um link com o
// host errado, nao um problema de seguranca.
function basePublica(req) {
  const cfg = String(process.env.APP_URL || process.env.PUBLIC_URL || '').replace(/\/+$/, '');
  if (cfg) return cfg;
  const host = req && req.get && req.get('host');
  if (!host) return '';
  const proto = (req && req.protocol) || 'https';
  return proto + '://' + host;
}

// O link exibido e o inviteCode do PROPRIO operador — o mesmo que ja atribui
// referral no cadastro. O parceiro decidiu nao usar codigo por video
// (simplicidade de proposito), entao nao ha parametro novo aqui.
function linkDoUsuario(req, inviteCode) {
  return `${basePublica(req)}/presell?ref=${encodeURIComponent(inviteCode || '')}`;
}

router.get('/info', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const [totalEarned, pendingCount] = await Promise.all([
      // Soma no banco, sem LIMIT: somar em cima da lista (topo 100) saturava
      // em R$ 100 e a tela dizia um valor errado a quem ja fez mais de 100.
      getUserEarnedTotal(req.user.id),
      countPendingSocialByUser(req.user.id)
    ]);

    res.json({
      link: linkDoUsuario(req, user.inviteCode),
      hashtags: HASHTAGS,
      hashtagsBonus: HASHTAGS_BONUS,
      instrucoes: instrucoesDo(social.REWARD_AMOUNT),
      reward: social.REWARD_AMOUNT,
      totalEarned: totalEarned.total,
      approvedCount: totalEarned.count,
      pendingCount,
      arts: listarArtes()
    });
  } catch (err) {
    console.error('[SOCIAL ERROR /info]:', err);
    res.status(500).json({ error: 'Erro ao carregar o programa social.' });
  }
});

router.post('/posts', authMiddleware, async (req, res) => {
  try {
    const { videoUrl, network, handle } = req.body || {};
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });

    const norm = social.normalizeUrl(videoUrl);
    if (norm.error) return res.status(400).json({ error: norm.error });
    // Host e conferido separado: e o que barra youtube.com.evil.com, que
    // passaria num 'includes' ingênuo.
    if (!social.isAllowedHost(norm.url)) {
      return res.status(400).json({ error: 'Link de rede social não suportada. Use TikTok, Instagram, Reels ou Facebook.' });
    }

    const net = social.NETWORKS.includes(String(network || '').toLowerCase())
      ? String(network).toLowerCase()
      : 'tiktok';

    const pendentes = await countPendingSocialByUser(req.user.id);
    const eleg = social.isEligibleToPost({
      createdAt: user.createdAt,
      totalDeposited: user.totalDeposited,
      pendingCount: pendentes
    });
    if (!eleg.ok) return res.status(403).json({ error: eleg.reason });

    // A regra do "so um pendente" tambem e checada DENTRO do createSocialPost
    // (indice unico parcial no Postgres, contagem sincrona no arquivo). Contar
    // aqui e so para dar a mensagem amigavel antes; a trava de verdade esta la.
    const criado = await createSocialPost(req.user.id, {
      url: norm.url,
      urlHash: norm.hash,
      network: net,
      handle: String(handle || '').slice(0, 64)
    });
    if (criado.error) return res.status(409).json({ error: criado.error });

    // Aviso pro admin. Nao pode derrubar o envio: se o Telegram falhar, o
    // video ja esta na fila e o admin ve no painel mesmo assim.
    try {
      await notifyAdminSocialPost({
        operatorName: user.operatorName,
        phone: user.phone,
        network: net,
        handle: String(handle || ''),
        videoUrl: norm.url
      });
    } catch (e) {
      console.error('[SOCIAL] falha no aviso do Telegram:', e.message);
    }

    res.json({ ok: true, post: criado });
  } catch (err) {
    console.error('[SOCIAL ERROR /posts]:', err);
    res.status(500).json({ error: 'Erro ao enviar o vídeo.' });
  }
});

router.get('/posts', authMiddleware, async (req, res) => {
  try {
    const lista = await getUserSocialPosts(req.user.id);
    // urlHash nao vai para o frontend: e o sha256 do link da propria pessoa,
    // nao tem uso nenhum na tela.
    res.json({
      posts: lista.map((p) => Object.assign({}, p, { urlHash: undefined }))
    });
  } catch (err) {
    console.error('[SOCIAL ERROR /posts list]:', err);
    res.status(500).json({ error: 'Erro ao carregar seus vídeos.' });
  }
});

module.exports = router;