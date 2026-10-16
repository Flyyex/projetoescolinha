# Programa Social — R$ 1 por vídeo (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Cada operador ganha R$ 1,00 por vídeo aprovado por video, publicando material (roteiros + artes) com o próprio link de indicação; o admin aprova em fila rápida com aviso no Telegram.

**Spec:** `docs/superpowers/specs/2026-10-04-programa-social-design.md`

**Architecture:** Tabela `social_posts` no Postgres (e `data.json` no modo arquivo). A marcação de aprovação é feita por `UPDATE ... WHERE status='pending'`, e o crédito de R$ 1,00 só acontece se o `UPDATE` afetar 1 linha — é isso que impede pagamento duplicado sem depender da UI. Rotas do operador em `routes/social.js`, do admin dentro de `routes/admin.js` (que já tem o middleware `x-admin-key`). A geração dos 3 formatos de imagem é feita no navegador com canvas, a partir da arte mestra em `public/social/arts/`.

**Tech Stack:** Node.js + Express (CommonJS), `pg` com fallback JSON, `node --test` para testes, frontend sem framework (JS puro + canvas).

## Global Constraints

- Testes rodam com `node --test tests/arquivo.test.js`. Sem framework externo, sem assert além de `node:assert/strict`.
- O valor do prêmio é **exatamente 1.00** e entra em `investBalance` (`balance` também aumenta, para manter a soma coerente).
- Saque no sistema sai **só** de `earnBalance` (`routes/wallet.js:762`). Por isso prêmio em `investBalance` não é sacável — é a trava anti-golpe e **não pode ser alterado**.
- Rotas do admin usam o middleware já existente em `routes/admin.js` (`x-admin-key`). Não criar autenticação nova.
- Rotas do operador usam `authMiddleware` de `middleware/auth`.
- Migration no bloco `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` que já existe em `database.js` (mesma técnica de `ad_reported_at`). Idempotente, roda no boot.
- Sem dependência nova. Nada de `multer` — upload de arte **não** entra na v1 (§13 do spec).
- Toda function de banco precisa dos **dois** caminhos: Postgres e JSON.
- Ao final de cada task, `data.json` de teste deve estar restaurado (backup antes, restore no `finally`).
- Nenhum teste pode tocar a rede. Servidor de teste sobe em porta alta (32xx) e é derrubado no `finally`.

## Review Focus

Cinco classes de entrada/falha que o spec exige mas que são fáceis de errar e caras se quebrarem:

1. **Aprovar o mesmo vídeo duas vezes** (clique duplo, duplo refresh, duas abas) — nunca pode pagar R$ 2,00. É o risco de dinheiro mais grave do projeto.
2. **`url_hash` duplicado** — o mesmo link reenviado depois de recusado precisa ser aceito de novo (recusa libera o reenvio); o mesmo link ainda pendente ou já aprovado precisa ser barrado.
3. **Um usuário pendente de confirmação que envia `id` de outro usuário** em `/purchases/reported` ou em qualquer rota admin por id — o Reward nunca pode sair da própria conta.
4. **URL malformada / host parecido** (`youtube.com.evil.com`, `tiktok.com.branco.net`) — precisa cair no host permitido, não só conter a string.
5. **`amount` de procedência errada** — o R$ 1,00 é uma constante, nunca vem do corpo da requisição do admin.

---

## File Structure

| Arquivo | Responsabilidade |
|---|---|
| `services/social.js` (novo) | Regras de elegibilidade, normalizacao/validacao de URL, `url_hash`, valor do premio constante. Sem acesso a banco. |
| `database.js` (modifica) | Tabela `social_posts`, funções de leitura/escrita, `approveSocialPost` com transição atômica. |
| `routes/social.js` (novo) | Endpoints do operador: `GET /info`, `POST /posts`, `GET /posts`. |
| `routes/admin.js` (modifica) | Endpoints do admin: fila, histórico, aprovar, recusar, stats do mês. |
| `services/telegramBot.js` (modifica) | `notifyAdminSocialPost`. |
| `public/app.js` (modifica) | Tela "Ganhe R$ 1 postando": link, roteiros, imagens, formulário, histórico. |
| `public/admin.html` (modifica) | Aba "Vídeos" com fila e aprovação por teclado. |
| `tests/social.test.js` (novo) | Regras puras de URL/elegibilidade. |
| `tests/social-db.test.js` (novo) | Banco: duplicata, fila, aprovação atômica, crédito. |

---

## Task 1: Regras puras (validação e elegibilidade)

Sem banco, sem rede. É o alicerce das rotas e o lugar mais barato de testar.

**Files:**
- Create: `services/social.js`
- Test: `tests/social.test.js`

**Interfaces:**
- Produces:
  - `normalizeUrl(raw)` → `{ url, hash }` ou `{ error: '...' }`
  - `isAllowedHost(url)` → boolean
  - `REWARD_AMOUNT` → `1.0`
  - `NETWORKS` → `['tiktok','instagram','reels']`
  - `isEligibleToPost({ createdAt, totalDeposited, pendingCount })` → `{ ok: boolean, reason?: string }`

- [ ] **Step 1: Escreva o teste que falha**

`tests/social.test.js`:

```javascript
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const social = require('../services/social');

describe('normalizeUrl', () => {
  it('normaliza e gera hash estavel', () => {
    const a = social.normalizeUrl('https://www.tiktok.com/@maria.voos/video/7123456789');
    const b = social.normalizeUrl('https://www.tiktok.com/@maria.voos/video/7123456789/');
    assert.equal(a.error, undefined);
    assert.equal(a.hash, b.hash, 'mesma URL com barra final gera mesmo hash');
  });

  it('rejeita URL vazia ou sem http', () => {
    assert.ok(social.normalizeUrl('').error);
    assert.ok(social.normalizeUrl('tiktok.com/@x').error);
  });

  it('rejeita URL longa demais', () => {
    assert.ok(social.normalizeUrl('https://tiktok.com/' + 'a'.repeat(600)).error);
  });
});

describe('isAllowedHost', () => {
  it('aceita as redes da campanha', () => {
    for (const u of [
      'https://www.tiktok.com/@a/video/1',
      'https://vm.tiktok.com/ZM123/',
      'https://www.instagram.com/reel/ABC/',
      'https://youtube.com/shorts/xyz',
      'https://youtu.be/xyz',
      'https://www.facebook.com/watch?v=1'
    ]) assert.equal(social.isAllowedHost(u), true, u);
  });

  it('bloqueia host parecido (prefixo enganoso)', () => {
    assert.equal(social.isAllowedHost('https://youtube.com.evil.com/x'), false);
    assert.equal(social.isAllowedHost('https://tiktok.com.branco.net/x'), false);
    assert.equal(social.isAllowedHost('https://naotiktok.com/x'), false);
  });
});

describe('REWARD_AMOUNT', () => {
  it('e exatamente 1 real', () => {
    assert.equal(social.REWARD_AMOUNT, 1);
  });
});

describe('isEligibleToPost', () => {
  const DIA = 864e5;
  const agora = Date.now();

  it('bloqueia conta com menos de 24h', () => {
    const r = social.isEligibleToPost({
      createdAt: new Date(agora - 2 * 3600 * 1000).toISOString(),
      totalDeposited: 100, pendingCount: 0
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /24h/);
  });

  it('bloqueia conta sem deposito', () => {
    const r = social.isEligibleToPost({
      createdAt: new Date(agora - 5 * DIA).toISOString(),
      totalDeposited: 0, pendingCount: 0
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /dep[oó]sito/i);
  });

  it('bloqueia quem ja tem video pendente', () => {
    const r = social.isEligibleToPost({
      createdAt: new Date(agora - 5 * DIA).toISOString(),
      totalDeposited: 100, pendingCount: 1
    });
    assert.equal(r.ok, false);
    assert.match(r.reason, /pendente/i);
  });

  it('libera conta antiga com deposito e sem pendencia', () => {
    const r = social.isEligibleToPost({
      createdAt: new Date(agora - 5 * DIA).toISOString(),
      totalDeposited: 30, pendingCount: 0
    });
    assert.equal(r.ok, true);
  });
});
```

- [ ] **Step 2: Rode o teste e veja falhar**

Run: `node --test tests/social.test.js`
Expected: FAIL com `Cannot find module '../services/social'`

- [ ] **Step 3: Implementação mínima**

`services/social.js`:

```javascript
'use strict';
// Regras do Programa Social. Sem acesso a banco: aqui so valida, normaliza e
// calcula o hash. O premio e uma constante de 1,00 e nunca vem do corpo da
// requisicao -- se o admin mandasse o valor, qualquer um com a chave poderia
//Creditar o quanto quisesse.

const crypto = require('crypto');

const REWARD_AMOUNT = 1.0;
const NETWORKS = ['tiktok', 'instagram', 'reels'];

const HOSTS_PERMITIDOS = [
  'tiktok.com', 'vm.tiktok.com',
  'instagram.com',
  'youtube.com', 'youtu.be',
  'facebook.com', 'fb.watch'
];

const MIN_ANTIGUIDADE_H = 24;
const MIN_DEPOSITO = 0.01;
const MAX_URL = 500;

function normalizeUrl(raw) {
  const txt = String(raw || '').trim();
  if (!txt) return { error: 'Informe o link do vídeo.' };
  if (!/^https?:\/\//i.test(txt)) {
    return { error: 'O link precisa começar com http:// ou https://' };
  }
  if (txt.length > MAX_URL) return { error: 'Link muito longo.' };

  let u;
  try {
    u = new URL(txt);
  } catch (e) {
    return { error: 'Link inválido.' };
  }

  // Normaliza: minusculo no host, sem barra/query/hash final, semutm.
  u.hash = '';
  u.hostname = u.hostname.toLowerCase();
  let out = u.toString();
  out = out.replace(/\/+$/, '');

  return {
    url: out,
    hash: crypto.createHash('sha256').update(out).digest('hex')
  };
}

// Compara o hostname inteiro contra a lista. Nada de "includes": e o que barra
// youtube.com.evil.com, que contem 'youtube.com' mas nao E o site.
function isAllowedHost(url) {
  let host;
  try {
    host = new URL(url).hostname.toLowerCase();
  } catch (e) {
    return false;
  }
  return HOSTS_PERMITIDOS.includes(host);
}

function isEligibleToPost({ createdAt, totalDeposited, pendingCount }) {
  const ts = createdAt ? new Date(createdAt).getTime() : NaN;
  if (!Number.isFinite(ts)) {
    return { ok: false, reason: 'Não foi possível validar sua conta.' };
  }
  const horas = (Date.now() - ts) / (3600 * 1000);
  if (horas < MIN_ANTIGUIDADE_H) {
    return { ok: false, reason: `Seuamming conta precisa ter 24h para participar. Tente daqui a pouco.` };
  }
  if (!(parseFloat(totalDeposited || 0) > MIN_DEPOSITO)) {
    return { ok: false, reason: 'É preciso ter ao menos um depósito confirmado para participar.' };
  }
  if ((pendingCount || 0) > 0) {
    return { ok: false, reason: 'Você já tem um vídeo em análise. Aguarde o admin responder.' };
  }
  return { ok: true };
}

module.exports = {
  REWARD_AMOUNT,
  NETWORKS,
  HOSTS_PERMITIDOS,
  normalizeUrl,
  isAllowedHost,
  isEligibleToPost
};
```

- [ ] **Step 4: Rode o teste e veja passar**

Run: `node --test tests/social.test.js`
Expected: PASS (todos os `it` verdes)

- [ ] **Step 5: Commit**

```bash
git add services/social.js tests/social.test.js
git commit -m "feat(social): regras de elegibilidade e validacao de URL"
```

---

## Task 2: Banco — tabela e transição atômica de aprovação

**Files:**
- Modify: `database.js` (tabela no bloco de migration; funções perto de `getApprovedWithdrawalsTotal`; export no fim)
- Test: `tests/social-db.test.js`

**Interfaces:**
- Consumes: `REWARD_AMOUNT` de `services/social.js` (não — o banco usa a própria constante `1.00` para não acoplar; mantenha os dois em sincronia eCubra isso no teste do Task 5)
- Produces:
  - `ensureSchema` já roda no boot (sem função nova)
  - `createSocialPost(userId, { url, urlHash, network, handle })` → `post | { error }`
  - `getSocialPostById(id)` → `post | null`
  - `getUserSocialPosts(userId)` → `post[]`
  - `getPendingSocialPosts()` → `post[]` (com `operatorName` e `phone`)
  - `countPendingSocialByUser(userId)` → `number`
  - `countApprovedSocialByUser(userId)` → `number`
  - `approveSocialPost(id)` → `{ ok: boolean, alreadyDone?: boolean, post? }`
  - `rejectSocialPost(id, reason)` → `{ ok, alreadyDone?, post? }`
  - `getSocialStats()` → `{ pending, approvedCount, rejectedCount, paidTotal, paidThisMonth }`

- [ ] **Step 1: Escreva o teste que falha**

`tests/social-db.test.js`:

```javascript
const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');

const DB = path.join(__dirname, '..', 'data.json');
const backup = fs.readFileSync(DB, 'utf8');
const db = require('../database');

const UID = 'usr_teste_social';

function plantarPosts(posts) {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(p => p.userId !== UID);
  for (const p of posts) d.social_posts.push({ userId: UID, ...p });
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}
function lerPosts() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  return (d.social_posts || []).filter(p => p.userId === UID);
}
function limparUsuario() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(p => p.userId !== UID);
  d.users = (d.users || []).filter(u => u.id !== UID);
  d.transactions = (d.transactions || []).filter(t => t.userId !== UID);
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}

before(() => { limparUsuario(); });
after(() => { fs.writeFileSync(DB, backup); });

describe('createSocialPost', () => {
  it('cria pendente com reward travado em 1.00', () => {
    plantarPosts([]);
    const p = db.createSocialPost(UID, {
      url: 'https://www.tiktok.com/@a/video/1', urlHash: 'h1', network: 'tiktok', handle: '@a'
    });
    assert.equal(p.status, 'pending');
    assert.equal(p.reward, 0, 'reward so e gravado na aprovacao');
  });

  it('bloqueia url_hash repetido', () => {
    const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
    d.social_posts = (d.social_posts || []).filter(p => p.urlHash !== 'h1');
    fs.writeFileSync(DB, JSON.stringify(d, null, 2));
    db.createSocialPost(UID, { url: 'https://x/1', urlHash: 'h1', network: 'tiktok', handle: '@a' });
    const dup = db.createSocialPost(UID, { url: 'https://x/1', urlHash: 'h1', network: 'tiktok', handle: '@b' });
    assert.ok(dup.error, 'segundo create com mesmo hash deve falhar');
  });
});

describe('approveSocialPost — o mais importante', () => {
  it('aprova uma vez e paga 1.00', () => {
    const p = db.createSocialPost(UID, { url: 'https://x/2', urlHash: 'h2', network: 'tiktok', handle: '@a' });
    const r = db.approveSocialPost(p.id);
    assert.equal(r.ok, true);
    assert.equal(r.post.status, 'approved');
    assert.equal(r.post.reward, 1);
  });

  it('aprovar de novo NAO paga de novo', () => {
    const p = db.createSocialPost(UID, { url: 'https://x/3', urlHash: 'h3', network: 'tiktok', handle: '@a' });
    db.approveSocialPost(p.id);
    const seg = db.approveSocialPost(p.id);
    assert.equal(seg.ok, false);
    assert.equal(seg.alreadyDone, true);
  });

  it('getSocialStats conta o total pago', () => {
    const s = db.getSocialStats();
    assert.ok(s.paidTotal >= 2, 'duas aprovacoes = 2.00+');
    assert.ok(typeof s.paidThisMonth === 'number');
  });
});

describe('rejectSocialPost', () => {
  it('recusa com motivo', () => {
    const p = db.createSocialPost(UID, { url: 'https://x/4', urlHash: 'h4', network: 'tiktok', handle: '@a' });
    const r = db.rejectSocialPost(p.id, 'link nao abre');
    assert.equal(r.ok, true);
    assert.equal(r.post.status, 'rejected');
    assert.equal(r.post.rejectReason, 'link nao abre');
  });

  it('recusa em post ja aprovado nao volta pra pendente', () => {
    const p = db.createSocialPost(UID, { url: 'https://x/5', urlHash: 'h5', network: 'tiktok', handle: '@a' });
    db.approveSocialPost(p.id);
    const r = db.rejectSocialPost(p.id, 'mudei de ideia');
    assert.equal(r.ok, false);
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node --test tests/social-db.test.js`
Expected: FAIL — `createSocialPost is not a function`

- [ ] **Step 3: Migration da tabela**

Em `database.js`, dentro do bloco que já tem `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ...` (por volta da linha 392), adicione:

```javascript
    CREATE TABLE IF NOT EXISTS social_posts (
      id VARCHAR(64) PRIMARY KEY,
      user_id VARCHAR(64) NOT NULL,
      video_url TEXT NOT NULL,
      url_hash VARCHAR(64) UNIQUE,
      network VARCHAR(16),
      handle VARCHAR(64),
      status VARCHAR(16) DEFAULT 'pending',
      reject_reason TEXT,
      reward NUMERIC(14, 2) DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      reviewed_at TIMESTAMPTZ
    );
    ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS url_hash VARCHAR(64);
    ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS reject_reason TEXT;
    ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS reward NUMERIC(14, 2) DEFAULT 0;
    ALTER TABLE social_posts ADD COLUMN IF NOT EXISTS reviewed_at TIMESTAMPTZ;
```

- [ ] **Step 4: Funções de leitura/escrita**

Adicione junto de `getApprovedWithdrawalsTotal` em `database.js`. `SOCIAL_REWARD` é 1.00 fixo — o valor nunca vem da requisição:

```javascript
// ============ PROGRAMA SOCIAL ============
// Premio fixo de 1,00 por video aprovado. NUNCA ler isso do corpo da requisicao:
// se o valor viesse de fora, qualquer um com a chave do admin creditava o quanto
// quisesse. Ver Review Focus #5.
const SOCIAL_REWARD = 1.00;

function mapSocialPost(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id || row.userId,
    videoUrl: row.video_url || row.videoUrl,
    urlHash: row.url_hash || row.urlHash || null,
    network: row.network,
    handle: row.handle,
    status: row.status,
    rejectReason: row.reject_reason || row.rejectReason || null,
    reward: parseFloat(row.reward || 0),
    createdAt: row.created_at || row.createdAt,
    reviewedAt: row.reviewed_at || row.reviewedAt || null,
    operatorName: row.operator_name || row.operatorName || undefined,
    phone: row.phone || undefined,
    approvedBefore: row.approved_before !== undefined ? parseInt(row.approved_before, 10) : undefined
  };
}

function socialDb() { return readJsonDb(); }

async function createSocialPost(userId, { url, urlHash, network, handle }) {
  const id = 'SP' + newSocialPostId();
  if (isPostgres) {
    try {
      const res = await pool.query(
        `INSERT INTO social_posts (id, user_id, video_url, url_hash, network, handle, status, reward)
         VALUES ($1, $2, $3, $4, $5, $6, 'pending', 0) RETURNING *`,
        [id, userId, url, urlHash, network, handle || null]
      );
      return mapSocialPost(res.rows[0]);
    } catch (e) {
      if (String(e.code) === '23505') return { error: 'Este vídeo já foi enviado.' };
      throw e;
    }
  }
  const db = socialDb();
  db.social_posts = db.social_posts || [];
  if (urlHash && db.social_posts.some(p => p.urlHash === urlHash)) {
    return { error: 'Este vídeo já foi enviado.' };
  }
  const post = {
    id, userId, videoUrl: url, urlHash: urlHash || null,
    network: network || 'tiktok', handle: handle || '',
    status: 'pending', rejectReason: null, reward: 0,
    createdAt: new Date().toISOString(), reviewedAt: null
  };
  db.social_posts.push(post);
  writeJsonDb(db);
  return post;
}

async function getSocialPostById(id) {
  if (isPostgres) {
    const res = await pool.query('SELECT * FROM social_posts WHERE id = $1', [id]);
    return mapSocialPost(res.rows[0]);
  }
  const db = socialDb();
  return mapSocialPost((db.social_posts || []).find(p => p.id === id));
}

async function getUserSocialPosts(userId) {
  if (isPostgres) {
    const res = await pool.query(
      'SELECT * FROM social_posts WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100', [userId]);
    return res.rows.map(mapSocialPost);
  }
  const db = socialDb();
  return (db.social_posts || [])
    .filter(p => p.userId === userId)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 100)
    .map(mapSocialPost);
}

async function getPendingSocialPosts() {
  if (isPostgres) {
    const res = await pool.query(
      `SELECT s.*, u.operator_name, u.phone,
              (SELECT COUNT(*) FROM social_posts a
                WHERE a.user_id = s.user_id AND a.status = 'approved') AS approved_before
         FROM social_posts s LEFT JOIN users u ON u.id = s.user_id
        WHERE s.status = 'pending'
        ORDER BY s.created_at ASC LIMIT 200`);
    return res.rows.map(mapSocialPost);
  }
  const db = socialDb();
  const users = db.users || [];
  return (db.social_posts || [])
    .filter(p => p.status === 'pending')
    .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt))
    .slice(0, 200)
    .map(p => {
      const u = users.find(x => x.id === p.userId);
      return mapSocialPost({
        ...p,
        operator_name: u ? u.operatorName : null,
        phone: u ? u.phone : null,
        approved_before: (db.social_posts || [])
          .filter(x => x.userId === p.userId && x.status === 'approved').length
      });
    });
}

async function countPendingSocialByUser(userId) {
  if (isPostgres) {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n FROM social_posts WHERE user_id = $1 AND status = 'pending'`, [userId]);
    return (res.rows[0] && res.rows[0].n) || 0;
  }
  return (socialDb().social_posts || [])
    .filter(p => p.userId === userId && p.status === 'pending').length;
}

async function countApprovedSocialByUser(userId) {
  if (isPostgres) {
    const res = await pool.query(
      `SELECT COUNT(*)::int AS n FROM social_posts WHERE user_id = $1 AND status = 'approved'`, [userId]);
    return (res.rows[0] && res.rows[0].n) || 0;
  }
  return (socialDb().social_posts || [])
    .filter(p => p.userId === userId && p.status === 'approved').length;
}

// Aprovacao atomica. O UPDATE so atinge a linha se ela ainda for 'pending'.
// Dois approves simultaneos disputam o mesmo row: um afeta 1 linha e paga, o
// outro afeta 0 e recebe alreadyDone. E isso que garante pagamento unico sem
// depender da UI. Ver Review Focus #1.
async function approveSocialPost(id) {
  if (isPostgres) {
    const res = await pool.query(
      `UPDATE social_posts SET status='approved', reward=$1, reviewed_at=NOW()
        WHERE id=$2 AND status='pending' RETURNING *`,
      [SOCIAL_REWARD, id]);
    if (!res.rows.length) {
      const atual = await getSocialPostById(id);
      return { ok: false, alreadyDone: true, post: atual };
    }
    return { ok: true, post: mapSocialPost(res.rows[0]) };
  }
  const db = socialDb();
  const p = (db.social_posts || []).find(x => x.id === id);
  if (!p) return { ok: false, error: 'Vídeo não encontrado.' };
  if (p.status !== 'pending') return { ok: false, alreadyDone: true, post: mapSocialPost(p) };
  p.status = 'approved';
  p.reward = SOCIAL_REWARD;
  p.reviewedAt = new Date().toISOString();
  writeJsonDb(db);
  return { ok: true, post: mapSocialPost(p) };
}

async function rejectSocialPost(id, reason) {
  if (isPostgres) {
    const res = await pool.query(
      `UPDATE social_posts SET status='rejected', reject_reason=$1, reviewed_at=NOW()
        WHERE id=$2 AND status='pending' RETURNING *`,
      [reason || 'Não atende aos critérios.', id]);
    if (!res.rows.length) {
      const atual = await getSocialPostById(id);
      return { ok: false, alreadyDone: true, post: atual };
    }
    return { ok: true, post: mapSocialPost(res.rows[0]) };
  }
  const db = socialDb();
  const p = (db.social_posts || []).find(x => x.id === id);
  if (!p) return { ok: false, error: 'Vídeo não encontrado.' };
  if (p.status !== 'pending') return { ok: false, alreadyDone: true, post: mapSocialPost(p) };
  p.status = 'rejected';
  p.rejectReason = reason || 'Não atende aos critérios.';
  p.reviewedAt = new Date().toISOString();
  writeJsonDb(db);
  return { ok: true, post: mapSocialPost(p) };
}

async function getSocialStats() {
  const mes = new Date();
  mes.setUTCDate(1);
  mes.setUTCHours(0, 0, 0, 0);
  const inicioMes = mes.toISOString();

  if (isPostgres) {
    const res = await pool.query(
      `SELECT
         COUNT(*) FILTER (WHERE status='pending')::int AS pending,
         COUNT(*) FILTER (WHERE status='approved')::int AS approved_count,
         COUNT(*) FILTER (WHERE status='rejected')::int AS rejected_count,
         COALESCE(SUM(reward) FILTER (WHERE status='approved'), 0) AS paid_total,
         COALESCE(SUM(reward) FILTER (WHERE status='approved' AND reviewed_at >= $1), 0) AS paid_month
       FROM social_posts`,
      [inicioMes]);
    const r = res.rows[0] || {};
    return {
      pending: r.pending || 0,
      approvedCount: r.approved_count || 0,
      rejectedCount: r.rejected_count || 0,
      paidTotal: parseFloat(r.paid_total || 0),
      paidThisMonth: parseFloat(r.paid_month || 0)
    };
  }
  const all = socialDb().social_posts || [];
  const soma = (arr) => arr.reduce((a, p) => a + parseFloat(p.reward || 0), 0);
  const aprov = all.filter(p => p.status === 'approved');
  const doMes = aprov.filter(p => new Date(p.reviewedAt || 0) >= new Date(inicioMes));
  return {
    pending: all.filter(p => p.status === 'pending').length,
    approvedCount: aprov.length,
    rejectedCount: all.filter(p => p.status === 'rejected').length,
    paidTotal: Math.round(soma(aprov) * 100) / 100,
    paidThisMonth: Math.round(soma(doMes) * 100) / 100
  };
}
```

- [ ] **Step 5: Exporte**

No bloco `module.exports` de `database.js`, adicione: `createSocialPost`, `getSocialPostById`, `getUserSocialPosts`, `getPendingSocialPosts`, `countPendingSocialByUser`, `countApprovedSocialByUser`, `approveSocialPost`, `rejectSocialPost`, `getSocialStats`.

- [ ] **Step 6: Rode e veja passar**

Run: `node --test tests/social-db.test.js`
Expected: PASS

- [ ] **Step 7: Confirme que o JSON não ficou sujo**

Run: `node -e "const d=require('./data.json');console.log('vazou?',(d.social_posts||[]).some(p=>p.userId==='usr_teste_social')?'SIM':'nao (ok)')"`
Expected: `nao (ok)`

- [ ] **Step 8: Commit**

```bash
git add database.js tests/social-db.test.js
git commit -m "feat(social): tabela social_posts e aprovacao atomica sem pagamento duplicado"
```

---

## Task 3: Rotas do operador

**Files:**
- Create: `routes/social.js`
- Modify: `server.js` (montar a rota, perto de `app.use('/api/team', ...)`)

**Interfaces:**
- Consumes: `services/social.js` (Task 1), `database.js` (Task 2)
- Produces (montar em `app.use('/api/social', ...)`):
  - `GET /info` → `{ link, hashtags, roteiros, instrucoes, totalEarned, approvedCount, pendingCount, arts: [...] }`
  - `POST /posts` body `{ videoUrl, network, handle }` → `{ ok, post }` ou `{ error }`
  - `GET /posts` → `{ posts: [...] }`

- [ ] **Step 1: Escreva o teste que falha**

Crie `tests/social-routes.test.js`:

```javascript
// Sobe o servidor real em porta alta e fala HTTP. Sem tocar a rede externa.
const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');

const DB = path.join(__dirname, '..', 'data.json');
const backup = fs.readFileSync(DB, 'utf8');
const PORT = 3301;
const B = 'http://127.0.0.1:' + PORT;
const DIA = 864e5;
const wait = (ms) => new Promise(r => setTimeout(r, ms));

let token = null, uid = null, srv = null;

function ajustar(over = {}) {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.users = d.users.map(u => u.id === uid
    ? { ...u, totalDeposited: 30, createdAt: new Date(Date.now() - 5 * DIA).toISOString(), ...over }
    : u);
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}
function limpar() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(p => p.userId !== uid);
  d.users = d.users.map(u => u.id === uid ? { ...u, createdAt: new Date().toISOString(), totalDeposited: 0 } : u);
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}

before(async () => {
  srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await wait(16000);
  const r = await (await fetch(B + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '11955550001', password: '12345678', operatorName: 'Social Teste' })
  })).json();
  token = r.token; uid = r.user && r.user.id;
  assert.ok(token, 'cadastro falhou: ' + JSON.stringify(r));
});

after(() => {
  if (srv) srv.kill();
  fs.writeFileSync(DB, backup);
});

const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token });

describe('POST /api/social/posts', () => {
  it('bloqueia conta sem deposito', async () => {
    limpar();
    const r = await (await fetch(B + '/api/social/posts', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ videoUrl: 'https://www.tiktok.com/@a/video/1', network: 'tiktok', handle: '@a' })
    })).json();
    assert.ok(r.error, 'deveria barrar sem deposito');
  });

  it('bloqueia host nao permitido', async () => {
    ajustar();
    const r = await (await fetch(B + '/api/social/posts', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ videoUrl: 'https://youtube.com.evil.com/x', network: 'tiktok', handle: '@a' })
    })).json();
    assert.ok(r.error, 'deveria barrar host');
  });

  it('aceita video valido', async () => {
    ajustar();
    const r = await (await fetch(B + '/api/social/posts', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ videoUrl: 'https://www.tiktok.com/@maria/video/771', network: 'tiktok', handle: '@maria' })
    })).json();
    assert.equal(r.ok, true, JSON.stringify(r));
    assert.equal(r.post.status, 'pending');
  });

  it('bloqueia segundo video enquanto o primeiro esta pendente', async () => {
    const r = await (await fetch(B + '/api/social/posts', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ videoUrl: 'https://www.instagram.com/reel/ABC9/', network: 'instagram', handle: '@maria' })
    })).json();
    assert.ok(r.error, 'deveria barrar o segundo pendente');
  });

  it('exige autenticacao', async () => {
    const r = await fetch(B + '/api/social/posts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ videoUrl: 'https://www.tiktok.com/@z/video/9' })
    });
    assert.equal(r.status, 401);
  });
});

describe('GET /api/social/info', () => {
  it('devolve link com o inviteCode do usuario', async () => {
    const r = await (await fetch(B + '/api/social/info', { headers: H() })).json();
    assert.match(r.link, /ref=/);
    assert.ok(Array.isArray(r.roteiros) && r.roteiros.length >= 3);
    assert.match(r.hashtags, /#truckauto/i);
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node --test tests/social-routes.test.js`
Expected: FAIL — 404 em `/api/social/posts`

- [ ] **Step 3: Crie `routes/social.js`**

```javascript
const express = require('express');
const router = express.Router();
const { authMiddleware } = require('../middleware/auth');
const social = require('../services/social');
const {
  findUserById,
  createSocialPost,
  getUserSocialPosts,
  countPendingSocialByUser,
  countApprovedSocialByUser
} = require('../database');
const { notifyAdminSocialPost } = require('../services/telegramBot');

const HASHTAGS = '#truckauto #investimentos #truckautodrones';
const HASHTAGS_BONUS = '#entregapordrone #rendadigital #drones';

const ROTEIROS = [
  {
    id: 'gancho',
    titulo: 'Achei um drone (o que mais engaja)',
    texto: 'mano, olha só isso aqui [mostra o drone voando] eu achei isso voando por cima do bairro e o dono me explicou: é uma cota de drone. ele faz entregas sozinho, 24 horas por dia, e todo dia rende uma cota. quem diria... você quer entender como funciona? o link tá na bio.'
  },
  {
    id: 'diaadia',
    titulo: 'Dia a dia com prova na tela',
    texto: 'vim mostrar como funciona um drone de entrega de verdade. [mostra o drone decolando] ele sai sozinho, faz as entregas e volta. todo dia eu acompanho o rendimento dele no app [mostra a tela]. um dia você grava um vídeo como esse, cola o link lá no app e ganha R$ 1. o link tá na bio.'
  },
  {
    id: 'pergunta',
    titulo: 'Pergunta direta',
    texto: 'quanto vale um drone de entrega que trabalha sozinho o dia inteiro? ... rende uma cota por dia, todo dia. e o melhor: dá pra assistir ele funcionando. não é só print, é o drone real voando aqui na sua frente. quem quiser ver como funciona, link na bio.'
  }
];

const INSTRUCOES = [
  'Grave na vertical (9:16) e mostre o drone funcionando de verdade.',
  'Coloque o link de indicação na bio do vídeo.',
  'Cada vídeo aprovado vale R$ 1.',
  'Repita em vídeos diferentes — o app paga R$ 1 em cada um.',
  'Se for recusado, o motivo aparece no app e dá para reenviar.'
];

const BASE = process.env.APP_URL ? process.env.APP_URL.replace(/\/+$/, '') : '';

// Link de indicação do operador. O parâmetro é o MESMO inviteCode que já
// atribui referral no cadastro -- nada de código novo por vídeo (o parceiro
// decidiu assim de propósito: simplicidade).
function linkDoUsuario(inviteCode) {
  return `${BASE}/presell?ref=${encodeURIComponent(inviteCode || '')}`;
}

router.get('/info', authMiddleware, async (req, res) => {
  try {
    const user = await findUserById(req.user.id);
    if (!user) return res.status(404).json({ error: 'Usuário não encontrado.' });
    const [posts, pendingCount, approvedCount] = await Promise.all([
      getUserSocialPosts(req.user.id),
      countPendingSocialByUser(req.user.id),
      countApprovedSocialByUser(req.user.id)
    ]);
    const totalEarned = Math.round(posts
      .filter(p => p.status === 'approved')
      .reduce((a, p) => a + (parseFloat(p.reward) || 0), 0) * 100) / 100;

    res.json({
      link: linkDoUsuario(user.inviteCode),
      hashtags: HASHTAGS,
      hashtagsBonus: HASHTAGS_BONUS,
      roteiros: ROTEIROS,
      instrucoes: INSTRUCOES,
      reward: social.REWARD_AMOUNT,
      totalEarned,
      approvedCount,
      pendingCount,
      arts: [] // v1: sem arte publicada ainda (fora do escopo do upload)
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

    const norm = social.normalizeUrl(videoUrl);
    if (norm.error) return res.status(400).json({ error: norm.error });
    if (!social.isAllowedHost(norm.url)) {
      return res.status(400).json({ error: 'Link de rede social não suportada. Use TikTok, Instagram, Reels ou Facebook.' });
    }
    const net = social.NETWORKS.includes(String(network || '').toLowerCase())
      ? String(network).toLowerCase() : 'tiktok';

    const pendentes = await countPendingSocialByUser(req.user.id);
    const eleg = social.isEligibleToPost({
      createdAt: user && user.createdAt,
      totalDeposited: user && user.totalDeposited,
      pendingCount: pendentes
    });
    if (!eleg.ok) return res.status(403).json({ error: eleg.reason });

    const post = await createSocialPost(req.user.id, {
      url: norm.url, urlHash: norm.hash, network: net, handle: String(handle || '').slice(0, 64)
    });
    if (post.error) return res.status(409).json({ error: post.error });

    notifyAdminSocialPost({
      operatorName: user ? user.operatorName : '',
      phone: user ? user.phone : '',
      network: net,
      handle: String(handle || ''),
      videoUrl: norm.url
    }).catch(e => console.error('[SOCIAL notify]:', e.message));

    res.json({ ok: true, post });
  } catch (err) {
    console.error('[SOCIAL ERROR /posts]:', err);
    res.status(500).json({ error: 'Erro ao enviar o vídeo.' });
  }
});

router.get('/posts', authMiddleware, async (req, res) => {
  try {
    res.json({ posts: await getUserSocialPosts(req.user.id) });
  } catch (err) {
    console.error('[SOCIAL ERROR /posts list]:', err);
    res.status(500).json({ error: 'Erro ao carregar seus vídeos.' });
  }
});

module.exports = router;
```

- [ ] **Step 4: Monte a rota em `server.js`**

Adicione depois de `app.use('/api/team', ...)`:

```javascript
app.use('/api/social', require('./routes/social'));
```

- [ ] **Step 5: Rode e veja passar**

Run: `node --test tests/social-routes.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add routes/social.js server.js tests/social-routes.test.js
git commit -m "feat(social): rotas do operador (info, enviar video, historico)"
```

---

## Task 4: Telegram — aviso de vídeo novo

**Files:**
- Modify: `services/telegramBot.js`
- Test: `tests/social-telegram.test.js`

**Interfaces:**
- Consumes: nada novo
- Produces: `notifyAdminSocialPost({ operatorName, phone, network, handle, videoUrl })`

- [ ] **Step 1: Escreva o teste que falha**

`tests/social-telegram.test.js`:

```javascript
// Token falso + fetch interceptado: nenhum HTTP real sai.
process.env.TELEGRAM_BOT_TOKEN = 'fake:token';
process.env.ADMIN_TELEGRAM_CHAT_ID = '123';
const enviados = [];
const realFetch = global.fetch;
global.fetch = async (url, opts) => {
  if (String(url).includes('api.telegram.org')) {
    enviados.push(JSON.parse((opts && opts.body) || '{}'));
    return { ok: true, json: async () => ({ ok: true }) };
  }
  return realFetch(url, opts);
};

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const bot = require('../services/telegramBot');

describe('notifyAdminSocialPost', () => {
  it('manda link, rede e quem enviou', async () => {
    enviados.length = 0;
    await bot.notifyAdminSocialPost({
      operatorName: 'Maria', phone: '11988887777',
      network: 'tiktok', handle: '@maria.voos',
      videoUrl: 'https://www.tiktok.com/@maria.voos/video/7123'
    });
    assert.equal(enviados.length, 1);
    const t = enviados[0].text;
    assert.match(t, /Maria/);
    assert.match(t, /@maria\.voos/);
    assert.match(t, /tiktok/i);
    assert.match(t, /7123/);
    assert.ok(!/undefined|NaN/.test(t), 'sem undefined/NaN: ' + t);
  });

  it('não quebra com campos vazios', async () => {
    enviados.length = 0;
    await bot.notifyAdminSocialPost({});
    assert.equal(enviados.length, 1);
    assert.ok(!/undefined|NaN/.test(enviados[0].text));
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node --test tests/social-telegram.test.js`
Expected: FAIL — `notifyAdminSocialPost is not a function`

- [ ] **Step 3: Implemente**

Em `services/telegramBot.js`, ao lado de `notifyAdminWithdrawal`:

```javascript
async function notifyAdminSocialPost({ operatorName, phone, network, handle, videoUrl }) {
  if (!token) return;
  const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
  const rede = String(network || 'tiktok');
  const msg =
    '🎥 *NOVO VÍDEO PARA APROVAR*\n\n' +
    '👤 *Operador:* ' + (operatorName || 'Não identificado') + '\n' +
    '📱 *Telefone:* ' + (phone || '-') + '\n' +
    '🌐 *Rede:* ' + rede + (handle ? ' — ' + handle : '') + '\n' +
    '🔗 *Vídeo:* ' + (videoUrl || '-') + '\n' +
    '⏰ *Horário:* ' + now + '\n\n' +
    '👉 *Ação:* aprove ou recuse no painel administrativo.';

  const targets = Array.from(adminChatIds);
  if (targets.length === 0 && (groupChatId || process.env.TELEGRAM_CHAT_ID)) {
    targets.push(groupChatId || process.env.TELEGRAM_CHAT_ID);
  }
  for (const chatId of targets) {
    try {
      await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          chat_id: chatId,
          text: msg,
          parse_mode: 'Markdown',
          disable_web_page_preview: true
        })
      });
      console.log('[TELEGRAM SOCIAL] Vídeo enviado para o admin no chat ' + chatId);
    } catch (e) {
      console.error('[TELEGRAM SOCIAL ERROR]:', e.message);
    }
  }
}
```

E adicione `notifyAdminSocialPost` ao `module.exports`.

- [ ] **Step 4: Rode e veja passar**

Run: `node --test tests/social-telegram.test.js`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add services/telegramBot.js tests/social-telegram.test.js
git commit -m "feat(social): avisa o admin no Telegram quando chega video novo"
```

---

## Task 5: Rotas do admin — fila, aprovar, recusar, total do mês

Aqui está o dinheiro: o crédito de R$ 1,00 acontece aqui.

**Files:**
- Modify: `routes/admin.js` (dentro do router, após as rotas existentes de withdrawal)
- Test: `tests/social-admin.test.js`

**Interfaces:**
- Consumes: `database.js` (Task 2), `social.REWARD_AMOUNT` (Task 1)
- Produces (todas sob o middleware existente do admin):
  - `GET /social/pending` → `{ posts, stats }`
  - `GET /social/history` → `{ posts }`
  - `POST /social/:id/approve` → `{ ok, alreadyDone, post }`
  - `POST /social/:id/reject` body `{ reason }` → `{ ok, alreadyDone, post }`

- [ ] **Step 1: Escreva o teste que falha**

`tests/social-admin.test.js`:

```javascript
const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');

const DB = path.join(__dirname, '..', 'data.json');
const backup = fs.readFileSync(DB, 'utf8');
const PORT = 3302;
const B = 'http://127.0.0.1:' + PORT;
const DIA = 864e5;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const KEY = process.env.ADMIN_KEY || 'devkey';

let token = null, uid = null, srv = null;

function saldo() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const u = (d.users || []).find(x => x.id === uid) || {};
  return { invest: parseFloat(u.investBalance || 0), total: parseFloat(u.balance || 0) };
}
function ajustar(over = {}) {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(p => p.userId !== uid);
  d.users = d.users.map(u => u.id === uid
    ? { ...u, totalDeposited: 30, investBalance: 0, earnBalance: 0, balance: 0,
        createdAt: new Date(Date.now() - 5 * DIA).toISOString(), ...over }
    : u);
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}
function criarPost(hash) {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = d.social_posts || [];
  d.social_posts.push({
    id: 'SP' + hash, userId: uid, videoUrl: 'https://www.tiktok.com/@a/video/' + hash,
    urlHash: hash, network: 'tiktok', handle: '@a', status: 'pending',
    rejectReason: null, reward: 0, createdAt: new Date().toISOString(), reviewedAt: null
  });
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
  return 'SP' + hash;
}

before(async () => {
  srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await wait(16000);
  const r = await (await fetch(B + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '11955550002', password: '12345678', operatorName: 'Admin Social' })
  })).json();
  token = r.token; uid = r.user && r.user.id;
  assert.ok(token, 'cadastro falhou');
});

after(() => { if (srv) srv.kill(); fs.writeFileSync(DB, backup); });

const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token });
const A = () => ({ 'Content-Type': 'application/json', 'x-admin-key': KEY });

describe('aprovar credita R$1 em investBalance', () => {
  it('paga exatamente 1,00 e registra no extrato', async () => {
    ajustar();
    const id = criarPost('p1');
    const antes = saldo();
    const r = await (await fetch(B + '/api/admin/social/' + id + '/approve', { method: 'POST', headers: A() })).json();
    assert.equal(r.ok, true, JSON.stringify(r));
    const dep = saldo();
    assert.equal(Math.round((dep.invest - antes.invest) * 100) / 100, 1);
    assert.equal(Math.round((dep.total - antes.total) * 100) / 100, 1);
    const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
    const tx = (d.transactions || []).find(t => t.type === 'commission' && t.amount === 1);
    assert.ok(tx, 'deveria existir transacao de comissao de 1');
  });

  it('aprovar 2x paga uma vez so', async () => {
    ajustar();
    const id = criarPost('p2');
    await fetch(B + '/api/admin/social/' + id + '/approve', { method: 'POST', headers: A() });
    const meio = saldo();
    const r2 = await (await fetch(B + '/api/admin/social/' + id + '/approve', { method: 'POST', headers: A() })).json();
    assert.equal(r2.ok, false);
    assert.equal(r2.alreadyDone, true);
    const fim = saldo();
    assert.equal(Math.round((fim.invest - meio.invest) * 100) / 100, 0, 'segunda aprovacao nao pode pagar');
  });

  it('aprova em paralelo: so um paga', async () => {
    ajustar();
    const id = criarPost('p3');
    const antes = saldo();
    const rs = await Promise.all([
      fetch(B + '/api/admin/social/' + id + '/approve', { method: 'POST', headers: A() }).then(r => r.json()),
      fetch(B + '/api/admin/social/' + id + '/approve', { method: 'POST', headers: A() }).then(r => r.json())
    ]);
    const deps = saldo();
    assert.equal(Math.round((deps.invest - antes.invest) * 100) / 100, 1, 'pagou ' + (deps.invest - antes.invest));
    assert.equal(rs.filter(x => x.ok).length, 1, 'exatamente um ok');
  });
});

describe('fila, historico e stats', () => {
  it('fila traz pendente com nome do operador e quantos ja aprovou', async () => {
    ajustar();
    criarPost('p4');
    const r = await (await fetch(B + '/api/admin/social/pending', { headers: A() })).json();
    assert.ok(Array.isArray(r.posts));
    assert.ok(typeof r.stats.paidThisMonth === 'number');
    if (r.posts.length) assert.ok(r.posts[0].operatorName, 'fila traz operatorName');
  });

  it('recusa grava motivo e nao paga', async () => {
    ajustar();
    const id = criarPost('p5');
    const r = await (await fetch(B + '/api/admin/social/' + id + '/reject', {
      method: 'POST', headers: A(), body: JSON.stringify({ reason: 'link não abre' })
    })).json();
    assert.equal(r.ok, true);
    assert.equal(saldo().invest, 0, 'recusa nao paga nada');
  });

  it('exige chave de admin', async () => {
    const r = await fetch(B + '/api/admin/social/pending', { headers: { 'Content-Type': 'application/json' } });
    assert.ok(r.status === 401 || r.status === 403, 'deveria negar sem chave, veio ' + r.status);
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node --test tests/social-admin.test.js`
Expected: FAIL — 404 nas rotas `/api/admin/social/*`

- [ ] **Step 3: Implemente as rotas**

Em `routes/admin.js`, **depois do middleware de admin** (ou seja, depois da linha onde `ADMIN_KEY` é validado e o middleware registrado), adicione:

```javascript
const { REWARD_AMOUNT } = require('../services/social');
const {
  getPendingSocialPosts,
  getUserSocialPosts,
  approveSocialPost,
  rejectSocialPost,
  getSocialStats
} = require('../database');

// ---------- PROGRAMA SOCIAL (admin) ----------

// Fila + totais. O total pago no mes fica no topo da aba para o admin decidir
// se precisa frear (nao ha limite no sistema -- o freio e politica dele).
router.get('/social/pending', async (req, res) => {
  try {
    const [posts, stats] = await Promise.all([getPendingSocialPosts(), getSocialStats()]);
    res.json({ posts, stats, reward: REWARD_AMOUNT });
  } catch (err) {
    console.error('[ADMIN SOCIAL ERROR /pending]:', err);
    res.status(500).json({ error: 'Erro ao carregar a fila de vídeos.' });
  }
});

router.get('/social/history', async (req, res) => {
  try {
    const stats = await getSocialStats();
    res.json({ stats });
  } catch (err) {
    console.error('[ADMIN SOCIAL ERROR /history]:', err);
    res.status(500).json({ error: 'Erro ao carregar o histórico.' });
  }
});

// Aprova e credita R$ 1,00 no saldo Investir da pessoa.
//
// A ordem importa: approveSocialPost so marca `approved` se a linha ainda
// estiver `pending` (UPDATE ... WHERE status='pending'). So credito se veio
// ok:true. Aprovar duas vezes, recarregar ou abrir em duas abas -> nao paga
// duas vezes. E por isso que o preco vem da constante e nunca do body.
router.post('/social/:id/approve', async (req, res) => {
  try {
    const r = await approveSocialPost(req.params.id);
    if (!r.ok) {
      return res.status(r.alreadyDone ? 409 : 404)
        .json({ ok: false, alreadyDone: !!r.alreadyDone, error: r.error || 'Este vídeo já foi analisado.' });
    }
    const post = r.post;
    const user = await findUserById(post.userId);
    if (user) {
      const reward = REWARD_AMOUNT; // constante, nunca req.body
      await updateUser(post.userId, {
        investBalance: Math.round(((parseFloat(user.investBalance || 0)) + reward) * 100) / 100,
        balance: Math.round(((parseFloat(user.balance || 0)) + reward) * 100) / 100
      });
      await createTransaction({
        id: post.id + '-C',
        userId: post.userId,
        type: 'commission',
        amount: reward,
        status: 'approved',
        description: 'Vídeo aprovado no programa social',
        createdAt: new Date().toISOString()
      });
    } else {
      console.error('[ADMIN SOCIAL] post sem usuário:', post.id);
    }
    const stats = await getSocialStats();
    res.json({ ok: true, post, stats });
  } catch (err) {
    console.error('[ADMIN SOCIAL ERROR /approve]:', err);
    res.status(500).json({ error: 'Erro ao aprovar o vídeo.' });
  }
});

router.post('/social/:id/reject', async (req, res) => {
  try {
    const reason = String((req.body && req.body.reason) || '').trim().slice(0, 300);
    const r = await rejectSocialPost(req.params.id, reason);
    if (!r.ok) {
      return res.status(r.alreadyDone ? 409 : 404)
        .json({ ok: false, alreadyDone: !!r.alreadyDone, error: r.error || 'Este vídeo já foi analisado.' });
    }
    res.json({ ok: true, post: r.post });
  } catch (err) {
    console.error('[ADMIN SOCIAL ERROR /reject]:', err);
    res.status(500).json({ error: 'Erro ao recusar o vídeo.' });
  }
});
```

- [ ] **Step 4: Rode e veja passar**

Run: `node --test tests/social-admin.test.js`
Expected: PASS — em especial "aprovar 2x paga uma vez so" e "aprova em paralelo: so um paga"

- [ ] **Step 5: Confirme que o banco de teste ficou limpo**

Run: `node -e "const d=require('./data.json');console.log('social vazou?',(d.social_posts||[]).length?'SIM':'nao (ok)')"`
Expected: `nao (ok)`

- [ ] **Step 6: Commit**

```bash
git add routes/admin.js tests/social-admin.test.js
git commit -m "feat(social): fila de videos no admin, aprovar credita R\$1 no saldo investir"
```

---

## Task 6: Tela do operador

**Files:**
- Modify: `public/app.js`
- Create/Modify: `public/social.js` (funções de render, para não inflar o `app.js`)

**Interfaces:**
- Consumes: `GET /api/social/info`, `POST /api/social/posts`, `GET /api/social/posts`
- Produces: `openSocialModal()` global, acessível por um botão na home

- [ ] **Step 1: Escreva o teste de render que falha**

`tests/social-ui.test.js` — renderiza o HTML sem browser, reusando o padrão de extração que já usamos no app:

```javascript
const fs = require('fs');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const src = fs.readFileSync('public/social.js', 'utf8');

// isola a funcao de render do historico
const ini = src.indexOf('function renderSocialHistory');
const NL = src.includes('\r\n') ? '\r\n' : '\n';
const fim = src.indexOf('\nfunction ', ini + 10);
const corpo = src.slice(ini, fim < 0 ? undefined : fim)
  .split(NL).map(l => l.replace(/^  /, '')).join('\n');

function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c])); }
const render = new Function('escHtml', corpo + '\nreturn renderSocialHistory;')(esc);

describe('renderSocialHistory', () => {
  it('mostra aprovado com o valor', () => {
    const h = render([{ id: 'a', status: 'approved', reward: 1, videoUrl: 'https://x/1', createdAt: '2026-10-01T10:00:00Z' }]);
    assert.match(h, /aprovado/i);
    assert.match(h, /R\$\s?1,00/);
  });

  it('mostra em analise', () => {
    const h = render([{ id: 'b', status: 'pending', videoUrl: 'https://x/2', createdAt: '2026-10-02T10:00:00Z' }]);
    assert.match(h, /análise/i);
    assert.ok(!/aprovado/i.test(h));
  });

  it('mostra recusado com o motivo', () => {
    const h = render([{ id: 'c', status: 'rejected', rejectReason: 'link não abre', videoUrl: 'https://x/3', createdAt: '2026-10-03T10:00:00Z' }]);
    assert.match(h, /recusado/i);
    assert.match(h, /link não abre/);
  });

  it('lida com lista vazia', () => {
    assert.ok(render([]).length > 0);
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node --test tests/social-ui.test.js`
Expected: FAIL — `ENOENT` em `public/social.js`

- [ ] **Step 3: Crie `public/social.js`**

```javascript
/* Programa Social — tela do operador.
   R$ 1,00 por video aprovado. O link exibido e o inviteCode do proprio
   operador (o mesmo que ja atribui referral no cadastro). */

const SOCIAL_STATE = { info: null, posts: [] };

function escSocial(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function socialMoney(v) {
  return 'R$ ' + (parseFloat(v || 0)).toFixed(2).replace('.', ',');
}

function socialDate(iso) {
  try {
    return new Date(iso).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
  } catch (e) { return ''; }
}

function renderSocialHistory(posts) {
  if (!Array.isArray(posts) || !posts.length) {
    return '<p style="font-size: 12px; color: var(--text-muted); text-align: center; padding: 14px;">'
      + 'Você ainda não enviou nenhum vídeo.</p>';
  }
  return posts.map(p => {
    const mapa = {
      approved: { txt: 'aprovado', cor: 'var(--accent-green)', ic: 'fa-solid fa-circle-check' },
      pending: { txt: 'em análise', cor: 'var(--accent-gold)', ic: 'fa-regular fa-clock' },
      rejected: { txt: 'recusado', cor: '#f43f5e', ic: 'fa-solid fa-circle-xmark' }
    }[p.status] || { txt: p.status, cor: 'var(--text-muted)', ic: 'fa-solid fa-circle' };
    const motivo = p.status === 'rejected' && p.rejectReason
      ? '<div style="font-size: 11px; color: #f43f5e; margin-top: 4px;">Motivo: ' + escSocial(p.rejectReason) + '</div>'
      : '';
    const valor = p.status === 'approved'
      ? ' <strong style="color: var(--accent-green);">+' + socialMoney(p.reward) + '</strong>' : '';
    return '<div style="display: flex; justify-content: space-between; align-items: flex-start; gap: 8px; '
      + 'padding: 10px 0; border-bottom: 1px solid rgba(255,255,255,0.06);">'
      + '<div style="min-width: 0;"><a href="' + escSocial(p.videoUrl) + '" target="_blank" rel="noopener" '
      + 'style="font-size: 12px; color: var(--primary); word-break: break-all;">' + socialDate(p.createdAt) + '</a>'
      + '<div style="font-size: 11px; color: ' + mapa.cor + '; margin-top: 2px;">'
      + '<i class="' + mapa.ic + '"></i> ' + mapa.txt + valor + '</div>'
      + motivo + '</div></div>';
  }).join('');
}

async function socialApi(method, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (window.appState && appState.token) headers['Authorization'] = 'Bearer ' + appState.token;
  const res = await fetch('/api/social' + (method === 'GET' ? '/info' : '/posts'), {
    method: method, headers, body: body ? JSON.stringify(body) : null
  });
  return res.json();
}

async function socialCarregar() {
  const info = await socialApi('GET');
  SOCIAL_STATE.info = info;
  const lista = await socialApi('GET');
  SOCIAL_STATE.posts = (lista && lista.posts) || [];

  const box = document.getElementById('social-box');
  if (!box) return;
  box.innerHTML =
    '<div style="font-size: 13px; color: var(--text-muted); margin-bottom: 8px;">'
    + 'Você já ganhou <strong style="color: var(--accent-green);">' + socialMoney(info.totalEarned)
    + '</strong> em ' + (info.approvedCount || 0) + ' vídeo(s).</div>'
    + '<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Seu link de indicação:</div>'
    + '<div style="display:flex; gap:6px; margin-bottom: 14px;">'
    + '<input id="social-link" class="form-input" readonly value="' + escSocial(info.link) + '">'
    + '<button class="btn btn-secondary" onclick="socialCopiar(\'link\')">Copiar</button></div>'
    + '<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 4px;">Hashtags:</div>'
    + '<div style="font-family: var(--font-mono, monospace); font-size: 12px; color: var(--primary); margin-bottom: 14px;">'
    + escSocial(info.hashtags) + '</div>'
    + '<div style="margin-bottom: 14px;">'
    + (info.roteiros || []).map(r =>
        '<div style="border:1px solid rgba(255,255,255,0.08); border-radius: var(--radius-md); padding: 10px; margin-bottom: 8px;">'
        + '<div style="font-size: 12px; font-weight: 700; margin-bottom: 6px;">' + escSocial(r.titulo) + '</div>'
        + '<div style="font-size: 11px; color: var(--text-muted); line-height: 1.5; margin-bottom: 8px;">'
        + escSocial(r.texto) + '</div>'
        + '<button class="btn btn-secondary" style="font-size: 11px; padding: 6px 10px;" '
        + 'onclick="socialCopiar(\'roteiro\',' + JSON.stringify(String(r.texto)) + ')">Copiar roteiro</button></div>'
      ).join('') + '</div>'
    + '<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">Envie o link do vídeo que você postou:</div>'
    + '<input id="social-url" class="form-input" placeholder="https://www.tiktok.com/@perfil/video/..." style="margin-bottom: 8px;">'
    + '<input id="social-handle" class="form-input" placeholder="Seu @ no TikTok" style="margin-bottom: 8px;">'
    + '<div id="social-msg" style="font-size: 12px; margin-bottom: 8px;"></div>'
    + '<button class="btn btn-primary btn-block" onclick="socialEnviar()">Enviar vídeo</button>'
    + '<div style="margin-top: 18px;"><div style="font-size: 12px; font-weight: 700; margin-bottom: 6px;">Seus vídeos</div>'
    + '<div id="social-historico">' + renderSocialHistory(SOCIAL_STATE.posts) + '</div></div>';
}

function socialCopiar(oque, texto) {
  const valor = oque === 'link' ? (document.getElementById('social-link') || {}).value : texto;
  if (!valor) return;
  if (navigator.clipboard) navigator.clipboard.writeText(valor);
  const msg = document.getElementById('social-msg');
  if (msg) { msg.style.color = 'var(--accent-green)'; msg.textContent = 'Copiado!'; }
}

async function socialEnviar() {
  const url = (document.getElementById('social-url') || {}).value || '';
  const handle = (document.getElementById('social-handle') || {}).value || '';
  const msg = document.getElementById('social-msg');
  if (msg) { msg.style.color = 'var(--text-muted)'; msg.textContent = 'Enviando...' }
  try {
    const r = await socialApi('POST', { videoUrl: url, network: 'tiktok', handle });
    if (r && r.ok) {
      await socialCarregar();
      const m = document.getElementById('social-msg');
      if (m) { m.style.color = 'var(--accent-green)'; m.textContent = 'Vídeo enviado! Aguarde a análise.'; }
    } else {
      if (msg) { msg.style.color = '#f43f5e'; msg.textContent = (r && r.error) || 'Não foi possível enviar.'; }
    }
  } catch (e) {
    if (msg) { msg.style.color = '#f43f5e'; msg.textContent = 'Erro de conexão.'; }
  }
}

async function openSocialModal() {
  let m = document.getElementById('modal-social');
  if (!m) {
    const div = document.createElement('div');
    div.id = 'modal-social';
    div.className = 'modal-overlay';
    div.innerHTML = '<div class="modal-content" style="max-width: 560px;">'
      + '<div class="modal-header"><h5>Ganhe R$ 1 postando</h5>'
      + '<button class="modal-close" onclick="document.getElementById(\'modal-social\').classList.remove(\'open\')">&times;</button></div>'
      + '<div class="modal-body"><div id="social-box"><p style="color: var(--text-muted);">Carregando...</p></div></div></div>';
    document.body.appendChild(div);
    m = div;
  }
  m.classList.add('open');
  await socialCarregar();
}
```

- [ ] **Step 4: Rode e veja passar**

Run: `node --test tests/social-ui.test.js`
Expected: PASS

- [ ] **Step 5: Adicione o botão na home**

Em `public/app.js`, junto das outras ações da home, adicione um botão que chama `openSocialModal()`:

```html
<button class="btn btn-secondary btn-block" onclick="openSocialModal()" style="margin-top: 8px;">
  <i class="fa-solid fa-share-nodes"></i> Ganhe R$ 1 postando
</button>
```

E, no fim de `public/app.js`, fora de qualquer função, carregue o script:

```javascript
// Programa Social (R$ 1 por video). Carregado no fim para nao depender de ordem.
document.addEventListener('DOMContentLoaded', () => {
  const s = document.createElement('script');
  s.src = '/social.js';
  s.onload = () => { window.openSocialModal = openSocialModal; };
  document.head.appendChild(s);
});
```

- [ ] **Step 6: Verifique que o servidor serve o arquivo**

Run: `node -e "const h=require('http');const s=require('./server.js');"` não é suficiente. Faça:
```bash
node -e "
const http=require('http');
const fs=require('fs');
if(!fs.existsSync('public/social.js')) { console.log('FALTA public/social.js'); process.exit(1); }
console.log('public/social.js existe, ' + fs.statSync('public/social.js').size + ' bytes');
"
```
Expected: `public/social.js existe, NNNN bytes`

- [ ] **Step 7: Commit**

```bash
git add public/social.js public/app.js tests/social-ui.test.js
git commit -m "feat(social): tela do operador com link, roteiros, envio e historico"
```

---

## Task 7: Aba "Vídeos" no admin

**Files:**
- Modify: `public/admin.html`
- Test: `tests/social-admin-ui.test.js` (checagem estática do HTML servido)

**Interfaces:**
- Consumes: `GET /api/admin/social/pending`, `POST /api/admin/social/:id/approve`, `POST /api/admin/social/:id/reject`
- Produces: aba `videos` com atalhos de teclado

- [ ] **Step 1: Escreva o teste que falha**

`tests/social-admin-ui.test.js`:

```javascript
const fs = require('fs');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const html = fs.readFileSync('public/admin.html', 'utf8');

describe('admin tem a aba de videos', () => {
  it('existe o container da aba', () => {
    assert.match(html, /id="tab-videos"/);
    assert.match(html, /id="social-pending-list"/);
  });

  it('exibe o total pago no mes', () => {
    assert.match(html, /paidThisMonth/);
  });

  it('tem os atalhos de teclado A e R', () => {
    assert.match(html, /socialKeydown|keydown/);
  });

  it('nao usa confirm() antes de aprovar', () => {
    const bloco = html.slice(html.indexOf('socialKeydown'));
    assert.ok(!/confirm\(/.test(bloco.slice(0, 1200)),
      'aprovacao tem que ser num clique, sem confirm');
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node --test tests/social-admin-ui.test.js`
Expected: FAIL — `id="tab-videos"` não encontrado

- [ ] **Step 3: Adicione o HTML da aba**

Dentro do `admin.html`, junto das outras abas:

```html
<div id="tab-videos" class="tab-content">
  <div class="stats-grid" style="margin-bottom: 16px;">
    <div class="stat-card"><div class="stat-label">Pendentes</div><div class="stat-value" id="social-stat-pending">0</div></div>
    <div class="stat-card"><div class="stat-label">Aprovados</div><div class="stat-value" id="social-stat-approved">0</div></div>
    <div class="stat-card"><div class="stat-label">Pago no mês</div><div class="stat-value" id="social-stat-month">R$ 0,00</div></div>
  </div>

  <div class="form-group" style="margin-bottom: 12px;">
    <label class="form-label">Fila de vídeos</label>
    <div class="hint">Atalhos: <strong>A</strong> aprova · <strong>R</strong> recusa · <strong>J</strong>/<strong>K</strong> navegam</div>
  </div>

  <div id="social-pending-list">
    <p style="color: var(--text-muted);">Carregando...</p>
  </div>
</div>
```

- [ ] **Step 4: Adicione o JS da aba**

Antes do `</script>` final do `admin.html`:

```javascript
/* ===== PROGRAMA SOCIAL (admin) ===== */
let SOCIAL_PENDING = [];
let SOCIAL_IDX = 0;

function socialMoney(v) {
  return 'R$ ' + (parseFloat(v || 0)).toFixed(2).replace('.', ',');
}
function socialEsc(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

async function socialAdminCarregar() {
  const r = await apiAdmin('/social/pending');
  SOCIAL_PENDING = (r && r.posts) || [];
  SOCIAL_IDX = 0;
  const st = (r && r.stats) || {};
  const set = (id, v) => { const el = document.getElementById(id); if (el) el.textContent = v; };
  set('social-stat-pending', st.pending || 0);
  set('social-stat-approved', st.approvedCount || 0);
  set('social-stat-month', socialMoney(st.paidThisMonth));
  socialAdminRender();
}

function socialAdminRender() {
  const box = document.getElementById('social-pending-list');
  if (!box) return;
  if (!SOCIAL_PENDING.length) {
    box.innerHTML = '<p style="color: var(--text-muted); text-align: center; padding: 20px;">Nenhum vídeo na fila. 🎉</p>';
    return;
  }
  const p = SOCIAL_PENDING[SOCIAL_IDX];
  if (!p) return;
  box.innerHTML =
    '<div class="form-card" style="border: 1px solid rgba(255,255,255,0.08); border-radius: var(--radius-md); padding: 14px;">'
    + '<div style="font-size: 14px; font-weight: 700; margin-bottom: 4px;">' + socialEsc(p.operatorName || 'Sem nome') + '</div>'
    + '<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 8px;">'
    + socialEsc(p.phone || '-') + ' · ' + socialEsc(p.network || 'tiktok') + ' ' + socialEsc(p.handle || '')
    + ' · já aprovou ' + (p.approvedBefore || 0) + ' vídeo(s)</div>'
    + '<a href="' + socialEsc(p.videoUrl) + '" target="_blank" rel="noopener" '
    + 'style="font-size: 12px; color: var(--primary); word-break: break-all; display: block; margin-bottom: 12px;">'
    + socialEsc(p.videoUrl) + '</a>'
    + '<div style="display: flex; gap: 8px;">'
    + '<button class="btn btn-primary" style="flex: 1;" onclick="socialAprovar()">Aprovar <small>(A)</small></button>'
    + '<button class="btn btn-secondary" style="flex: 1;" onclick="socialRecusar()">Recusar <small>(R)</small></button>'
    + '</div>'
    + '<div style="font-size: 11px; color: var(--text-muted); margin-top: 8px;">'
    + 'Fila: ' + (SOCIAL_IDX + 1) + ' de ' + SOCIAL_PENDING.length + '</div>'
    + '</div>';
}

// Um clique, sem confirm: o gargalo e o tempo do admin, nao o custo.
async function socialAprovar() {
  const p = SOCIAL_PENDING[SOCIAL_IDX];
  if (!p) return;
  try {
    await apiAdmin('/social/' + encodeURIComponent(p.id) + '/approve', { method: 'POST' });
    SOCIAL_PENDING.splice(SOCIAL_IDX, 1);
    if (SOCIAL_IDX >= SOCIAL_PENDING.length) SOCIAL_IDX = Math.max(0, SOCIAL_PENDING.length - 1);
    await socialAdminCarregar();
  } catch (e) { alert('Erro ao aprovar: ' + e.message); }
}

async function socialRecusar() {
  const p = SOCIAL_PENDING[SOCIAL_IDX];
  if (!p) return;
  const motivo = prompt('Motivo da recusa (a pessoa vai ver):', 'O link não está abrindo.');
  if (motivo === null) return;
  try {
    await apiAdmin('/social/' + encodeURIComponent(p.id) + '/reject', {
      method: 'POST', body: JSON.stringify({ reason: motivo })
    });
    SOCIAL_PENDING.splice(SOCIAL_IDX, 1);
    if (SOCIAL_IDX >= SOCIAL_PENDING.length) SOCIAL_IDX = Math.max(0, SOCIAL_PENDING.length - 1);
    await socialAdminCarregar();
  } catch (e) { alert('Erro ao recusar: ' + e.message); }
}

function socialKeydown(ev) {
  const tab = document.getElementById('tab-videos');
  if (!tab || !tab.classList.contains('active')) return;
  const tag = (ev.target && ev.target.tagName) || '';
  if (tag === 'INPUT' || tag === 'TEXTAREA') return;
  const k = (ev.key || '').toLowerCase();
  if (k === 'a') { ev.preventDefault(); socialAprovar(); }
  else if (k === 'r') { ev.preventDefault(); socialRecusar(); }
  else if (k === 'j') { ev.preventDefault(); SOCIAL_IDX = Math.min(SOCIAL_PENDING.length - 1, SOCIAL_IDX + 1); socialAdminRender(); }
  else if (k === 'k') { ev.preventDefault(); SOCIAL_IDX = Math.max(0, SOCIAL_IDX - 1); socialAdminRender(); }
}

document.addEventListener('keydown', socialKeydown);
```

Ligue `socialAdminCarregar()` ao abrir a aba de vídeos, no mesmo ponto onde as outras abas carregam seus dados.

- [ ] **Step 5: Rode e veja passar**

Run: `node --test tests/social-admin-ui.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add public/admin.html tests/social-admin-ui.test.js
git commit -m "feat(social): aba de videos no admin com atalhos e total pago no mes"
```

---

## Task 8: Verificação final integrada

**Files:**
- Test: `tests/social-e2e.test.js`

- [ ] **Step 1: Escreva o teste de ponta a ponta**

Percorre o caminho real: operador envia → admin aprova → saldo subiu → vídeo some da fila → segundo envio bloqueado.

```javascript
// Ponta a ponta do programa social. Servidor real, sem tocar a rede externa.
const fs = require('fs');
const path = require('path');
const { describe, it, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('child_process');

const DB = path.join(__dirname, '..', 'data.json');
const backup = fs.readFileSync(DB, 'utf8');
const PORT = 3303;
const B = 'http://127.0.0.1:' + PORT;
const DIA = 864e5;
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const KEY = process.env.ADMIN_KEY || 'devkey';

let token = null, uid = null, srv = null;
const H = () => ({ 'Content-Type': 'application/json', Authorization: 'Bearer ' + token });
const A = () => ({ 'Content-Type': 'application/json', 'x-admin-key': KEY });

function ajustar() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  d.social_posts = (d.social_posts || []).filter(p => p.userId !== uid);
  d.users = d.users.map(u => u.id === uid
    ? { ...u, totalDeposited: 30, investBalance: 0, earnBalance: 0, balance: 0,
        createdAt: new Date(Date.now() - 5 * DIA).toISOString() }
    : u);
  d.transactions = (d.transactions || []).filter(t => t.userId !== uid);
  fs.writeFileSync(DB, JSON.stringify(d, null, 2));
}
function invest() {
  const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
  const u = (d.users || []).find(x => x.id === uid) || {};
  return parseFloat(u.investBalance || 0);
}

before(async () => {
  srv = spawn('node', ['server.js'], { cwd: path.join(__dirname, '..'), env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await wait(16000);
  const r = await (await fetch(B + '/api/auth/register', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone: '11955550003', password: '12345678', operatorName: 'E2E Social' })
  })).json();
  token = r.token; uid = r.user && r.user.id;
  assert.ok(token, 'cadastro falhou');
});

after(() => { if (srv) srv.kill(); fs.writeFileSync(DB, backup); });

describe('fluxo completo', () => {
  it('operador envia, admin aprova, saldo sobe 1,00', async () => {
    ajustar();
    const env = await (await fetch(B + '/api/social/posts', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ videoUrl: 'https://www.tiktok.com/@e2e/video/9001', network: 'tiktok', handle: '@e2e' })
    })).json();
    assert.equal(env.ok, true, JSON.stringify(env));

    const fila = await (await fetch(B + '/api/admin/social/pending', { headers: A() })).json();
    const meu = fila.posts.find(p => p.id === env.post.id);
    assert.ok(meu, 'video deveria estar na fila');
    assert.ok(meu.operatorName, 'fila traz o nome do operador');
    assert.equal(invest(), 0, 'antes de aprovar nao ha credito');

    const ap = await (await fetch(B + '/api/admin/social/' + env.post.id + '/approve', { method: 'POST', headers: A() })).json();
    assert.equal(ap.ok, true, JSON.stringify(ap));
    assert.equal(invest(), 1, 'saldo subiu exatamente 1,00');

    const fila2 = await (await fetch(B + '/api/admin/social/pending', { headers: A() })).json();
    assert.ok(!fila2.posts.find(p => p.id === env.post.id), 'saiu da fila');

    const info = await (await fetch(B + '/api/social/info', { headers: H() })).json();
    assert.equal(info.totalEarned, 1);
    assert.equal(info.approvedCount, 1);
  });

  it('reenvio do mesmo video bloqueado; recusado libera reenvio', async () => {
    ajustar();
    const url = 'https://www.tiktok.com/@e2e/video/9002';
    const a = await (await fetch(B + '/api/social/posts', {
      method: 'POST', headers: H(), body: JSON.stringify({ videoUrl: url, network: 'tiktok', handle: '@e2e' })
    })).json();
    assert.equal(a.ok, true);

    const dup = await (await fetch(B + '/api/social/posts', {
      method: 'POST', headers: H(), body: JSON.stringify({ videoUrl: url, network: 'tiktok', handle: '@e2e' })
    })).json();
    assert.ok(dup.error, 'mesmo link pendente deve ser barrado');

    await fetch(B + '/api/admin/social/' + a.post.id + '/reject', {
      method: 'POST', headers: A(), body: JSON.stringify({ reason: 'link quebrado' })
    });
    const deNovo = await (await fetch(B + '/api/social/posts', {
      method: 'POST', headers: H(), body: JSON.stringify({ videoUrl: url, network: 'tiktok', handle: '@e2e' })
    })).json();
    assert.equal(deNovo.ok, true, 'recusado precisa liberar o reenvio');
  });

  it('premiado vai para investBalance e nao para earnBalance', async () => {
    ajustar();
    const env = await (await fetch(B + '/api/social/posts', {
      method: 'POST', headers: H(),
      body: JSON.stringify({ videoUrl: 'https://www.instagram.com/reel/e2e9003/', network: 'instagram', handle: '@e2e' })
    })).json();
    assert.equal(env.ok, true);
    await fetch(B + '/api/admin/social/' + env.post.id + '/approve', { method: 'POST', headers: A() });
    const d = JSON.parse(fs.readFileSync(DB, 'utf8'));
    const u = d.users.find(x => x.id === uid);
    assert.equal(parseFloat(u.investBalance), 1);
    assert.equal(parseFloat(u.earnBalance), 0, 'nao pode cair em earn (sacavel)');
  });
});
```

- [ ] **Step 2: Rode e veja passar**

Run: `node --test tests/social-e2e.test.js`
Expected: PASS

- [ ] **Step 3: Rode a suíte inteira**

Run: `node --test tests/`
Expected: PASS — incluindo `limits.test.js`, `i18n.test.js`, `admin-filters.test.js` que já existiam

- [ ] **Step 4: Confirme que nada vazou no data.json**

Run: `node -e "const d=require('./data.json');console.log('social_posts:',(d.social_posts||[]).length,'| usuarios de teste:',(d.users||[]).filter(u=>/5555/.test(u.phone||'')).length)"`
Expected: `social_posts: 0 | usuarios de teste: 0`

- [ ] **Step 5: Confirme que o servidor sobe**

Run: `node --check server.js` e subir em porta livre com HTTP 200 em `/api/fleet/products`

- [ ] **Step 6: Commit**

```bash
git add tests/social-e2e.test.js
git commit -m "test(social): fluxo completo operador -> admin -> saldo"
```

---

## Task 9: Gerador dos 3 formatos da arte

> ⚠️ **BLOQUEADA** — precisa do arquivo `public/social/arts/*.png`. O parceiro
> ainda não colocou a arte na pasta. A tela do operador (Task 6) já funciona sem
> isto: `arts` retorna `[]` e o bloco de imagens simplesmente não aparece.
> Rode esta task só depois que o arquivo existir.

**Files:**
- Create: `public/social-art.js`
- Test: `tests/social-art.test.js`

**Interfaces:**
- Consumes: `GET /api/social/info` (campo `arts`, do Step 3 da Task 6 — trocar `arts: []` pela leitura da pasta)
- Produces: `gerarFormatoSocial(url, formato)` → `Promise<string>` (dataURL do PNG)

- [ ] **Step 1: Escreva o teste que falha**

`tests/social-art.test.js` — testa só a matemática do encaixe, que é a parte
que pode errar e cortar a arte:

```javascript
// Sem browser: testa o calculo de 'contain'. O canvas em si é verificado a mao.
const fs = require('fs');
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const src = fs.readFileSync('public/social-art.js', 'utf8');
const ini = src.indexOf('function calcularEncaixe');
const NL = src.includes('\r\n') ? '\r\n' : '\n';
const fim = src.indexOf('\nfunction ', ini + 10);
const corpo = src.slice(ini, fim < 0 ? undefined : fim).split(NL).map(l => l.replace(/^  /, '')).join('\n');
const calc = new Function(corpo + '\nreturn calcularEncaixe;')();

describe('calcularEncaixe', () => {
  it('escala pra caber inteira (nunca corta)', () => {
    // arte 1080x1920 em alvo 1080x1350: escala pela largura, sobra vertical
    const r = calc(1080, 1920, 1080, 1350);
    assert.equal(r.largura, 1080);
    assert.ok(r.altura <= 1350, 'altura nao pode passar do alvo');
    assert.equal(r.dx, 0);
    assert.ok(r.dy >= 0, 'centralizado na vertical');
  });

  it('preenche o resto com a cor de fundo', () => {
    const r = calc(1080, 1920, 1080, 1080);
    assert.equal(r.largura, 1080);
    assert.equal(r.altura, 1080);
    assert.equal(r.dx, 0);
    assert.equal(r.dy, 0);
  });

  it('arte quadrada em alvo 9:16 fica com barra na lateral', () => {
    const r = calc(1080, 1080, 1080, 1920);
    assert.equal(r.altura, 1920);
    assert.ok(r.largura < 1080, 'largura menor que o alvo: barra lateral');
    assert.ok(r.dx > 0, 'centralizado na horizontal');
  });

  it('nunca upscale acima do alvo na altura', () => {
    const r = calc(400, 300, 1080, 1920);
    assert.ok(r.largura <= 1080 && r.altura <= 1920);
  });
});
```

- [ ] **Step 2: Rode e veja falhar**

Run: `node --test tests/social-art.test.js`
Expected: FAIL — `ENOENT` em `public/social-art.js`

- [ ] **Step 3: Crie `public/social-art.js`**

```javascript
/* Programa Social — gera os 3 formatos da arte sem cortar nada.
   A arte entra inteira (encaixe 'contain') e o espaco que sobra recebe a cor
   de fundo da marca. Nada e cortado, em nenhum formato. */

const SOCIAL_FORMATOS = [
  { id: 'vertical', nome: 'Stories / TikTok (9:16)', w: 1080, h: 1920 },
  { id: 'retrato', nome: 'Feed Instagram (4:5)', w: 1080, h: 1350 },
  { id: 'quadrado', nome: 'Feed / WhatsApp (1:1)', w: 1080, h: 1080 }
];

// Encaixe total: a menor escala que faz a arte caber inteira no alvo.
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

function socialArtCorFundo() {
  const meta = document.querySelector('meta[name="theme-color"]');
  return (meta && meta.getAttribute('content')) || '#0A1A33';
}

function carregarImagem(src) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Falhou ao carregar a arte.'));
    img.crossOrigin = 'anonymous';
    img.src = src;
  });
}

async function gerarFormatoSocial(artUrl, formato, corFundo) {
  const img = await carregarImagem(artUrl);
  const cv = document.createElement('canvas');
  cv.width = formato.w;
  cv.height = formato.h;
  const ctx = cv.getContext('2d');
  ctx.fillStyle = corFundo || socialArtCorFundo();
  ctx.fillRect(0, 0, formato.w, formato.h);
  const c = calcularEncaixe(img.naturalWidth, img.naturalHeight, formato.w, formato.h);
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

// Desenha as 3 opcoes na tela e deixa baixar cada uma.
async function montarFormatosSocial(containerId, artUrl) {
  const box = document.getElementById(containerId);
  if (!box) return;
  box.innerHTML = '<p style="color: var(--text-muted); font-size: 12px;">Preparando os formatos...</p>';
  const cor = socialArtCorFundo();
  let html = '';
  for (const f of SOCIAL_FORMATOS) {
    const url = await gerarFormatoSocial(artUrl, f, cor);
    html += '<div style="margin-bottom: 14px;">'
      + '<div style="font-size: 12px; color: var(--text-muted); margin-bottom: 6px;">' + f.nome + '</div>'
      + '<img src="' + url + '" style="max-width: 100%; border-radius: 8px; border: 1px solid rgba(255,255,255,0.1);">'
      + '<button class="btn btn-secondary btn-block" style="margin-top: 6px; font-size: 12px;" '
      + 'onclick="baixarDataUrl(\'' + url + '\', \'truckauto-' + f.id + '.png\')">Baixar</button>'
      + '</div>';
  }
  box.innerHTML = html;
}

window.SOCIAL_FORMATOS = SOCIAL_FORMATOS;
window.gerarFormatoSocial = gerarFormatoSocial;
window.montarFormatosSocial = montarFormatosSocial;
window.baixarDataUrl = baixarDataUrl;
```

- [ ] **Step 4: Ligue a arte no `/info`**

Em `routes/social.js`, troque `arts: []` por uma leitura da pasta:

```javascript
const fs = require('fs');
const path = require('path');
const ARTES_DIR = path.join(__dirname, '..', 'public', 'social', 'arts');

function listarArtes() {
  try {
    return fs.readdirSync(ARTES_DIR)
      .filter(f => /\.(png|jpe?g)$/i.test(f))
      .map(f => ({ nome: f, url: '/social/arts/' + encodeURIComponent(f) }));
  } catch (e) {
    return [];
  }
}
```

E use `arts: listarArtes()` no `res.json` do `/info`.

- [ ] **Step 5: Rode e veja passar**

Run: `node --test tests/social-art.test.js`
Expected: PASS — em especial "arte quadrada em alvo 9:16 fica com barra na lateral"

- [ ] **Step 6: Confira manualmente no navegador**

Suba o servidor, entre no app com uma conta que tenha depósito e pelo menos 24h, abra "Ganhe R$ 1 postando", baixe os 3 formatos e **abra os 3 arquivos** para conferir que a arte aparece inteira.

- [ ] **Step 7: Commit**

```bash
git add public/social-art.js routes/social.js tests/social-art.test.js
git commit -m "feat(social): gera os 3 formatos da arte sem cortar"
```

---

## Fora de escopo (v1) — não implementar

Do §13 do spec: sem upload de arte pelo admin, sem publicar automaticamente nas redes, sem ranking, sem código por vídeo. A geração dos 3 formatos da arte depende do arquivo `public/social/arts/*.png`, que o parceiro vai fornecer — até lá, `arts` retorna `[]` e a tela esconde o bloco de imagens.