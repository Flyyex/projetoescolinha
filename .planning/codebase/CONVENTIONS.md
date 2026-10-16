---
doc: conventions
last_mapped_commit: 3b38fa8
mapped_date: 2026-09-30
previous_mapped_commit: 4c16c6f
staleness_fixed: true
scope: root
---

# Convencoes de Codigo

**Mapped commit:** `3b38fa8` | **Mapped date:** 2026-09-30 | **Supersedes:** `4c16c6f` (2026-09-29)

**Escopo verificado nesta passagem:** `server.js`, `database.js`, `routes/*.js` (7 arquivos), `services/*.js` (17 arquivos), `middleware/auth.js`, `public/*.js`, `public/*.html`, `tests/*.js`, `e2e/*.js`, `playwright.config.js`, `package.json`, `render.yaml`, `git_sync.ps1`, `.gitignore`, `data.json`.
**Metodo:** leitura integral dos arquivos pequenos, varrura por regex sobre ~55 arquivos de primeira parte, `git diff 4c16c6f..3b38fa8`, `git log`, e validacao byte-a-byte de encoding/EOL. Todas as contagens abaixo foram refeitas em 2026-09-30.

**Correcoes em relacao a versao de 2026-09-29** (o doc ficou stale apos o pull de 19 arquivos / +578 linhas):

| Afirmacao antiga | Verificacao em 2026-09-30 |
|---|---|
| "Mojibake real (dupla codificacao) em 12 linhas em `database.js` e `data.json`" | **FALSO.** Era artefato de console (UTF-8 impresso em CP850). Decodificador estrito: 0 arquivos `.js`/`.html`/`.json`/`.css`/`.md` de primeira parte invalidos. `database.js:29` e `database.js:268` contem `'Disponivel'` com acento correto. Ver §11. |
| `routes/crm.js` "475 linhas, sem auth nenhuma" | **OBSOLETO.** Hoje 525 linhas e tem gate de sessao + mascaramento de segredos (§13.1, §13.6). |
| `public/app.js` = 2730 linhas | **2833 linhas.** |
| `database.js` = 2095 linhas | **2180 linhas.** |
| `routes/wallet.js` = 940 linhas | **979 linhas.** |
| `routes/fleet.js` = 147 linhas | **206 linhas** (ganhou a carencia de 30 dias por modelo). |
| `services/telegramBot.js` = 655 linhas | **675 linhas.** |
| "13 de 14 servicos sem teste" | Contagem hoje e **16 de 17**: `services/crmSession.js` (novo, 61 linhas) nao tem teste. Ver `TESTING.md` §7. |
| `i18n:` = 18 dos 30 commits mais recentes | O repo tem 230 commits. Ver §12. |

---

## 0. Idioma — a convencao mais importante deste repositorio

**TODO o codigo, comentarios, nomes de funcao/variavel, strings de log, mensagens de erro de API e textos de interface estao em PORTUGUES (pt-BR).** Nao existe camada de codigo em ingles, exceto nomes herdados de biblioteca (`mapUser` e' ingles por herdar do padrao de mapeamento; `resolveLang`, `lookup`, `interpolate` em `public/i18n.js` sao os unicos nomes de funcao deliberadamente ingleses que sobraram).

### 0.1 A convencao distintiva: comentario em portugues SEM ACENTO

Este e o trago mais marcante do repositorio e precisa ser seguido. Comentarios novos sao escritos em portugues **sem acentuacao**:

```js
// services/crmSession.js:1-7
// Sessao do CRM: o login ja existia (routes/auth.js) mas devolvia um token de
// menos que ninguem validava — a tela pedia senha e a API ficava aberta pra
// qualquer um. Aqui a assinatura passa a ter validade real, num cookie httpOnly.
//
// Por que cookie e nao token no header: o bundle do CRM ja faz fetch com
// credentials:include, entao o navegador manda o cookie sozinho em toda
// chamada. Nao precisa rebuildar o React (que nem tem build no repo).
```

```js
// services/crmSession.js:21
// "id.expiracao.assinatura" — os 3 precisao bater, senao invalido
```

```js
// routes/crm.js:9-12
// ================= SEGURANCA DO CRM =================
// Sem isso, qualquer pessoa na internet lia todos os leads (LGPD), via as
// senhas do CRM em /settings e usava a conta de WhatsApp da empresa.
```

```js
// routes/wallet.js:935-939
// Recargas confirmadas (leve). O app consulta de tempos em tempos para
// disparar o evento Purchase no Meta sem depender de o operador abrir o Extrato.
// Recargas aprovadas que ainda NAO foram reportadas para Meta/TikTok.
// O cliente dispara os eventos e depois chama /purchases/reported para marcar.
// Sem isso, o app repetia o Purchase a cada 30s (ver updateSupportBadge).
```

```js
// public/tiktok-pixel-base.js:1-4
// Bloco TikTok Pixel, gerado a partir do codigo oficial que o TikTok entregou
// no Gerenciador de Eventos. Mantem a estrutura EXATA (inclusive o n.src, que e
// o que faz o events.js carregar de verdade) e so troca o ID fixo por uma
// leitura do painel - assim da para trocar o pixel sem novo deploy.
```

**Medido (linhas de comentario em `.js`, excluindo HTML/CSS):**

| Arquivo | com acento | sem acento |
|---|---|---|
| `services/crmSession.js` (novo) | 0 | 7 |
| `public/tiktok-pixel-base.js` (novo) | 0 | 6 |
| `public/tiktok-pixel.js` (novo) | 0 | 4 |
| `services/syncpay.js` | 0 | 5 |
| `services/backup.js` | 0 | 4 |
| `services/misticpay.js` | 4 | 20 |
| `services/asaas.js` | 1 | 7 |
| `server.js` | 5 | 23 |
| `routes/auth.js` | 4 | 14 |
| `routes/crm.js` | 8 | 19 |
| `services/settlementEngine.js` | 13 | 5 |
| `services/careerEngine.js` | 2 | 0 |
| `routes/fleet.js` | 18 | 6 |
| `database.js` | 26 | 28 |
| **TOTAL** | **~245** | **~275** |

**Leitura:** o codebase esta em transicao. O codigo antigo (ate ~2026-08) usava acento; **todo o codigo novo (a partir de ~set/2026) e sem acento.** A regra pratica e: *comentario novo = portugues sem acento; texto de interface e mensagem de erro = portugues COM acento.*

**Atencao — nem todo string e sem acento.** Excecoes que continuam acentuadas e nao devem ser "normalizadas":
- `database.js:29`, `:40`, `:268` — `status: 'Disponivel'` e o `DEFAULT` do `VARCHAR` no schema, persistido no banco.
- Mensagens de erro de API: `routes/wallet.js:763` `'Saldo de saque insuficiente. Rendimentos e bonus ficam no saldo de saque.'`, `routes/wallet.js:710` `'Bonus de boas-vindas expirado (7 dias sem deposito).'`, `routes/fleet.js:118`, `routes/misticpay.js` via `routes/wallet.js:668` `'Tipo de chave Pix invalido.'` — todas com acento no original.
- Textos de Telegram: `services/telegramBot.js:492` `'Ja sacou antes'`, `:492` `'VALOR ALTO'`.
- Valores dos dicionarios i18n (a chave e ASCII; o valor PT tem acento).

### 0.2 Termos de dominio preservados no codigo

Contagem real dos termos PT preservados em identificadores, strings e nomes de arquivo:

| Termo | Ocorrencias | Onde mais aparece |
|---|---|---|
| `saque` / `Saque` | 93 / 54 | `telegramBot.js`, `admin.js`, `wallet.js`, `app.js` |
| `bonus` / `Bonus` / `bonus`(acentuado) | 96 / 53 / 30 | `app.js`, `wallet.js`, `careerEngine.js` |
| `pixKey` | 53 | `wallet.js:14`, `misticpay.js:11`, `admin.js:9` |
| `saldo` / `Saldo` | 42 / 18 | `admin.js`, `wallet.js`, `app.js` |
| `frota` / `Frota` | 40 / 26 | `telegramBot.js`, `aiSdrEngine.js`, `app.js` |
| `contrato` | 24 | `app.js`, `fleet.js`, `backup.js` |
| `rendimento` / `Rendimento` | 27 / 17 | `settlementEngine.js`, `aiSdrEngine.js` |
| `carencia` / `Carencia` / `carencia`(acentuado) | 10 / 1 / 3 | `routes/fleet.js:5`, `public/app.js:364` |
| `liberacao` | 17 | `routes/fleet.js:10`, `public/app.js` |
| `gotejamento` | 1 | `server.js:230` (o `drip` em ingles so existe em `database.js`/`settlementEngine.js` como `drip_day`/`dripDay`) |
| `patente` / `carreira` | 5 / 2 | `careerEngine.js`, `admin-filters.test.js` |
| `comissao` / `Comissao` | 1 / 1 | `aiSdrEngine.js`, `admin.js` |

**Consequencia pratica:** `carencia` vira `carencia`/`Carencia` em identificador (JS nao aceita acento de forma confiavel), `liberacao` vira `liberacao`, e a palavra original **continua aparecendo acentuada nos textos de interface**. Nao "traduza" `carencia` para `cooldown` no dominio — `cooldownUntil`/`cooldownDaysLeft` (`routes/fleet.js:134-135`) so aparecem como **chaves de resposta HTTP novas**, nunca substituindo o termo PT.

**Excecoes ja existentes e toleradas:** `username/password/token` quando espelham contrato de lib externa; e a pasta `crm_frontend_src/` (React do Nexus CRM, unico pedaco com nomenclatura em ingles: `NewLeadModal.jsx`, `AnalyticsView.jsx`).

---
## 1. Padroes de Nomenclatura

### 1.1 Arquivos

- **Backend Node:** `camelCase.js` para servicos/modulos — `settlementEngine.js`, `keepAliveWatchdog.js`, `aiSdrEngine.js`, `careerEngine.js`, `whatsappQueue.js`, `crmSession.js`, `crmDb.js`, `admin-filters.js`.
- **Rotas:** substantivo singular minusculo — `routes/auth.js`, `routes/wallet.js`, `routes/fleet.js`, `routes/admin.js`, `routes/crm.js`, `routes/support.js`, `routes/team.js`.
- **Frontend estatico:** `kebab-case.js` quando e modulo compartilhado (`public/admin-filters.js`, `public/i18n-data.js`, `public/tiktok-pixel.js`, `public/tiktok-pixel-base.js`) e `i18n.js` (nome curto, herdado).
- **Paginas HTML:** `kebab-case.html` — `login.html`, `index.html`, `admin.html`, `presell.html`, `termos.html`, `privacidade.html`.
- **Testes unitarios:** `<modulo>.test.js` na pasta `tests/`. E2E: `*.spec.js` na pasta `e2e/`. Pastas **colocadas na raiz**, nunca coladas ao lado do fonte.
- **Nomes antigos:** `crm_frontend_src/App.jsx`, `main.jsx` (convencao React; nao reaproveitar).

### 1.2 Funcoes

- `camelCase`, verbo primeiro + substantivo: `createUser`, `findProductById`, `mapUser`, `parseLimitSettings`, `sumInWindow`, `msUntilNextWithdraw`, `cooldownsForModel` (`routes/fleet.js:32`), `getApprovedWithdrawalsTotal` (`database.js:1076`), `markDepositsReported` (`database.js:1141`), `reportNewDepositPurchases` (`public/app.js:2002`).
- **Async sem prefixo.** O `async` e explicito na declaracao: `async function findUserById(id)` (`database.js:576`), `async function loadLang(lang)` (`public/i18n.js:46`).
- **Handlers de rota: anonimos.** `router.post('/hire', authMiddleware, async (req, res) => {` (`routes/fleet.js:80`).
- **Funcao global no front, sem namespace.** `openModal(modalId)`, `closeModal(modalId)`, `reportNewDepositPurchases()` sao globais de proposito (ver §10.5). Contagem real em `public/app.js`: **82 declaracoes `function` + 21 `async function` de top-level = 103 funcoes globais**.
- `routes/crm.js` e a unica rota que exporta **fabrica**: `module.exports = function(io) { ... }` (`routes/crm.js:5`), porque precisa do `socket.io` server.

### 1.3 Variaveis e constantes

- `camelCase` para tudo.
- **Constantes de verdadeira configuracao/segredo: `UPPER_SNAKE_CASE`** — `DB_FILE`, `DATABASE_URL` (`database.js:8-9`), `PORT`, `HOST` (`server.js:19-20`), `ADMIN_KEY` (`routes/admin.js:62`), `JWT_SECRET` (`middleware/auth.js:4`), `COOKIE_NAME`, `TTL_MS` (`services/crmSession.js:10-11`), `MISTIC_PK`, `MISTIC_SK`, `MISTIC_TIMEOUT_MS` (`services/misticpay.js`), `CARTPANDA_API_TOKEN`, `CARTPANDA_WEBHOOK_SECRET` (`services/cartpanda.js`), `SYNCPAY_CLIENT_ID`, `SYNCPAY_CLIENT_SECRET`, `SYNCPAY_WEBHOOK_TOKEN` (`services/syncpay.js`), `CACHE_NAME` (`public/sw.js:1`), `MAX_PER_MODEL` (`routes/fleet.js:114`), `COOLDOWN_DAYS`, `COOLDOWN_MS` (`routes/fleet.js:23-24`), `TIKTOK_EVENT_NAMES` (`public/app.js:1768`), `PURCHASE_COOLDOWN_DAYS` (`public/app.js:364`), `ALERTE_SAQUE` (`services/telegramBot.js:487`), `MASK` (`routes/crm.js:445`), `SUPPORTED`, `LOCALES` (`public/i18n.js:6-7`).
- **Tabelas de dados fixos: `UPPER_SNAKE_CASE`** — `DEFAULTS` (`services/limits.js:7`), `RANKS`, `LEVEL_PERCENTS` (`services/careerEngine.js`), `PIX_TYPES` (`services/asaas.js`), `CITIES` (`public/i18n-data.js:19`), `APROVADOS` (`database.js:1077`).
- **Sem prefixo `_` para "privado".** Nao existe encapsulamento de modulo; tudo e funcao top-level exportada por `module.exports`.
- `snake_case` e exclusivo do mundo Postgres (ver §2).

### 1.4 IDs e codigos de negocio

Fabricas com `crypto`, nunca incrementais (`database.js:666-679`):

| Entidade | Formato | Fabrica | Exemplo |
|---|---|---|---|
| Usuario | `usr_` + 8 bytes hex | `newUserId()` `database.js:667` | `usr_a1b2c3d4e5f60718` |
| Contrato | `CTR-` + 6 bytes hex upper | `newContractId()` `database.js:677` | `CTR-3F9A1B2C3D4E` |
| Convite | `NX` + 4 bytes hex upper | `newInviteCode()` `database.js:670` | `NX18CD83D3` |
| Sessao CRM | `<24 bytes hex>.<exp>.<hmac-sha256 hex>` | `make()` `services/crmSession.js:22` | `a3f9...1771000000000.9c1e...` |
| Transacao saque | `WD-` + `Date.now()` | `routes/wallet.js:790` | `WD-1767000000000` |
| Transacao generica | `TX-` + `Date.now()` | `routes/wallet.js`, `routes/fleet.js` | `TX-1767000000000` |
| Bonus boas-vindas | `BNS-SIGNUP-` + `Date.now()` | `routes/auth.js` | `BNS-SIGNUP-1767000000000` |
| Estorno bonus expirado | `BNS-EXP-` + `Date.now()` | `routes/wallet.js:705` | `BNS-EXP-1767000000000` |
| Bonus cupom resgatado | `BN-` + `Date.now()` | `routes/wallet.js:919` | `BN-1767000000000` |
| `event_id` de ads | `dep_` + id da transacao | `public/app.js:2017` | `dep_TX-1767000000000` |
| Produto / ponto de carga | `NX-NNN` / `CH-NNN` fixos, seed | `database.js:24-190` | `NX-030`, `NX-101`, `NX-202`, `NX-303`, `NX-404`, `NX-505`, `NX-606`, `NX-707`; carregadores `CH-*` |

`newInviteCode()` tem loop anti-colisao de 10 tentativas com fallback temporal (`database.js:671-675`). `WD-`, `TX-`, `BN-`, `BNS-*` usam so `Date.now()` — colisao provavel sob concorrencia; ja observado no historico. `crmSession.make()` usa 24 bytes de entropia + `crypto.timingSafeEqual` na verificacao (`services/crmSession.js:36-39`).

**Colunas/campos JSON:** camelCase no dominio (`totalDeposited`, `careerRank`, `forceLevel3Unlocked`, `adReportedAt`). Excecao herdada: os campos de i18n de produto mantem sufixo snake_case **no objeto JS** — `name_es`, `name_en`, `name_zh`, `description_es`, `status_es`. Nao "converta" esses nomes.

---

## 2. A fronteira snake_case (Postgres) <-> camelCase (JS)

O banco e Postgres com colunas `snake_case`; o JS e `camelCase`. A conversao e feita **manualmente, por mapa explicito**, nunca por `SELECT AS`:

```js
// database.js:552-569 (mapTransaction) — canonico do padrao, ja com o
// fallback "a || b" das colunas novas
function mapTransaction(row) {
  if (!row) return null;
  return {
    id: row.id,
    userId: row.user_id,
    type: row.type,
    amount: parseFloat(row.amount || 0),
    status: row.status,
    pixKey: row.pix_key,
    pixKeyType: row.pix_key_type || row.pixKeyType || null,
    description: row.description,
    externalId: row.external_id || row.externalId || null,
    createdAt: row.created_at,
    approvedAt: row.approved_at,
    rejectedAt: row.rejected_at,
    adReportedAt: row.ad_reported_at || null
  };
}
```

**Mapas existentes (numeros de linha de 2026-09-30):** `mapUser` (`database.js:476`), `mapProduct` (`database.js:510`), `mapContract` (`database.js:534`), `mapTransaction` (`database.js:552`), `mapPromo` (`database.js:1471`), `mapSupportThread` (`database.js:1627`). Aparte: `mapPixKeyType` (`services/misticpay.js`) normaliza o *tipo* da chave Pix, nao colunas.

**Regras derivadas da pratica:**
- **Nome: `map<Entidade>(row)`.** Guard clause `if (!row) return null;` explicita em todas.
- **Numericos do Postgres (`NUMERIC`/`BIGINT`) sempre passam por `parseFloat(x || 0)` na fronteira**; inteiros por `parseInt(x, 10)`.
- **Colunas novas em tabela ja populada aceitam as duas formas:** `row.external_id || row.externalId`, `row.ad_reported_at || null` (`database.js:563`, `:567`). Use esse `a || b` ao adicionar coluna nova — evita precisar de backfill.
- **O inverso (JS -> coluna) e feito no proprio `INSERT`/`UPDATE`**, com placeholders `$1..$n` montados por `setClauses` (`database.js:719-812`, `database.js:1227-1255`).
- **`database.js` tem fallback em arquivo (`data.json`) quando `DATABASE_URL` esta ausente** (`database.js:14-22`, flag `isPostgres`). Nesse modo o objeto ja vem em camelCase e o `map*` e **pulado** (`database.js:577-580`).
- `database.js` usa 102 tokens `snake_case` distintos; `services/crmDb.js` usa 11 (contrato proprio do CRM, colunas `snake_case` direto no JSON `crm_data.json`).

---
## 3. Estilo de Codigo

**Modulos: CommonJS em 100% do backend.** `require`/`module.exports`, sem `import`/`export`.
```js
const express = require('express');
const { authMiddleware, JWT_SECRET } = require('../middleware/auth');   // middleware/auth.js:33
module.exports = router;                                                // routes/fleet.js:206
```

**Front (`public/*.js`): JS vanilla, escopo global, sem IIFE (exceto os 3 modulos compartilhados + `tiktok-pixel.js`), sem modulos, sem framework.** `public/app.js` e um script classico de 2833 linhas com 103 funcoes globais.

**Formatacao (observada, nao toolada):**
- **Indentacao: 2 espacos**, sem tabs. **Verificado: 0 tabs** em qualquer `.js`/`.html` de primeira parte.
- **Aspas simples** em JS em praticamente 100% dos casos. Excecoes: SQL multilinha com template literal, HTML inline em template literal, e `public/tiktok-pixel-base.js` (codigo de terceiro entregue pelo TikTok, mantido verbatim por decisao — ver comentario em `public/tiktok-pixel-base.js:1-4`).
- **Ponto e virgula sempre presente.**
- **Sem Prettier, sem ESLint, sem `.editorconfig`, sem `.gitattributes`, sem `biome`** — nenhum arquivo de configuracao de lint/format existe no repositorio (verificado). O estilo e puramente convencional/consensual.
- Comprimento de linha: sem limite formal; o padrao e quebrar em ~100-120 colunas.
- **Lint: nao existe.** `package.json` so define `"start": "node server.js"` — nem `test`, nem `lint`. Qualidade de estilo depende 100% de revisao humana.

**Colapso de indentacao — 3 casos reais, todos herdados, nenhum intencional:**
- `routes/wallet.js:676-678` — `if (!numAmount || numAmount < minWithdraw) { ... }` colado na coluna 0 dentro do handler.
- `routes/auth.js:127-161` — o bloco "Lead automatico no funil local" foi colado sem reindentar: `try {`, `const crmDb = ...`, `});` todos na coluna 0.
- `routes/wallet.js:15-30` — 16 linhas do destructuring de `require('../database')` sem indentacao dentro das chaves.

---

## 4. Organizacao de Imports / Requires

Sem ferramenta, sem aliases, sem barrel files. A ordem e sempre:

1. `require('dotenv').config()` — **primeira linha do arquivo**, quando houver env (`server.js:1`, `database.js:1`).
2. Pacotes externos (`express`, `pg`, `axios`, `jsonwebtoken`, `socket.io`, `node-cron`, `bcryptjs`, `helmet`, `cors`, `express-rate-limit`, `cookie-parser`, `path`, `crypto`).
3. Modulos internos via caminho relativo a partir da raiz do projeto: `'./database'`, `'./services/telegramBot'`, `'../middleware/auth'`, `'../services/limits'`, `'../services/crmSession'`.
4. `const { a, b, c } = require(...)` — destructuring na linha do require, e o padrao dominante. Listas longas sao quebradas em multilinha vertical (`routes/fleet.js:3-12`, `server.js:10-11`).

Sem linha em branco obrigatoria separando grupos; na pratica ha uma. Sem aliases (`@/`, `~/` nao existem). Sem barrel `index.js` — cada rota e `module.exports = router` direto.

**Excecao notavel: `require` local e preguiçoso**, feito dentro do handler para quebrar ciclo, evitar custo, ou proteger o boot:

- `const wdLimitsLib = require('../services/limits');` (`routes/wallet.js:685`) — dentro do handler de saque.
- `const { notifyAdminSecurityAlert } = require('../services/telegramBot');` (`routes/admin.js:98`) — dentro do alerta de intrusao, alem de `.catch(() => {})`.
- `try { require('../services/crmSession').setCookie(res); } catch (e) { console.error('[CRM SESSION ERROR]:', e.message); }` (`routes/auth.js:218`) — require **dentro de try** para nunca derrubar o login.
- `require('./services/keepAliveWatchdog')`, `require('./services/backup')`, `require('node-cron')` — todos dentro do callback de `server.listen` e dentro de `try` (`server.js:225-237`).
- `const crmSession = require('../services/crmSession');` (`routes/crm.js:13`) — no topo do arquivo, porque o gate de boot depende dele.

Comentario explica o porqueder — mantenha esse padrao.

---

## 5. Tratamento de Erros

**Estrategia: `try/catch` no handler, log com tag prefixada, resposta JSON generica em PT-BR. Nenhuma classe de erro customizada, nenhum `Result<T,E>`, nenhuma promisificacao de erro.**

```js
// routes/wallet.js:845-848 — padrao canonico
  } catch (err) {
    console.error('[WALLET ERROR /withdraw]:', err);
    res.status(500).json({ error: 'Erro ao solicitar saque.' });
  }
```

### 5.1 Resposta de erro

- **Formato: SEMPRE `res.status(NNN).json({ error: '<mensagem em PT-BR, com ponto final>' })`.** Contagem real em 2026-09-30: **155 ocorrencias** — `routes/admin.js` 88, `routes/wallet.js` 32, `routes/fleet.js` 9, `routes/auth.js` 8, `routes/support.js` 7, `routes/crm.js` 6, `middleware/auth.js` 3, `services/crmSession.js` 1, `routes/team.js` 1.
- **Status usados:** `400` (validacao), `401` (nao autenticado / token invalido — `middleware/auth.js:14,23,29`; `routes/crm.js:26`; `services/crmSession.js:58`), `403` (sem saldo, carencia, pausa de saques, chave de admin — `routes/fleet.js:118`, `:131`; `routes/admin.js:118`), `404` (recurso inexistente), `409` (duplicata), `429` (rate limit / teto global de saque), `500` (falha interna), `502`/`503` (gateway indisponivel).
- **Nunca vazar stack nem `err.message` ao cliente.** O `catch` loga e devolve texto generico.
- **Handler usa `return` para sair cedo** em validacao: `if (!product) { return res.status(404).json({...}); }` (`routes/fleet.js`). Nunca `throw` em rota.
- **Erros de dominio via `code`/`retryAfterMs`:** a rota traduz o objeto resultado em resposta HTTP (`routes/wallet.js:744-757`):
  ```js
  if (!wdCheck.ok) {
    const body = { error: wdCheck.error };
    if (wdCheck.retryAfterMs) { body.retryAfterMs = wdCheck.retryAfterMs; body.retryIn = wdLimitsLib.formatRetryMs(wdCheck.retryAfterMs); }
    return res.status(wdCheck.status).json(body);
  }
  ```

### 5.2 Onde `throw` e permitido (e onde nao e)

1. **Borda de boot — falha o processo se segredo falta.** Exatamente 3 sitios, todos com tag `[SECURITY]`:
   - `middleware/auth.js:8` — `JWT_SECRET` ausente em producao.
   - `routes/admin.js:66` — `ADMIN_KEY`/`ADMIN_PASSWORD` ausente em producao.
   - `routes/crm.js:17` — CRM sem `CRM_SECRET`/`ADMIN_KEY` em producao (novo em `3b38fa8`).
2. **Camada de servico de gateway** — `throw` e o contrato (`services/asaas.js:30,71,73,139,141`; `services/misticpay.js:43,48,56,58,61,73,179,181,185`; `services/syncpay.js:26,44,67,69,71,74,76,88`; `services/whatsappQueue.js:61`; `services/backup.js:83`). A rota chama dentro de `try/catch` e converte em 500/503.
3. **Invariante de dados** — `database.js:1450` (`'Dados do cupom invalidos.'`), `database.js:1459`/`:1464` (`'Codigo ja existe.'`), `database.js:1606` (`'Mensagem invalida.'`).

**Nunca** `throw` em `routes/*` para sinalizar falha de negocio.

### 5.3 Camada de dominio pura: retorna objeto, nao lanca

`services/limits.js` nao usa `throw` nem HTTP. Retorna objeto resultado puro, e a rota traduz:
```js
// services/limits.js — forma canonica do retorno
{ ok: false, status: 429, error: '...', code: 'GLOBAL_CAP', retryAfterMs: wait }

// services/limits.js:130-132 — booleano puro para regra simples
function shouldPayCommission({ buyerTotalDeposited, minDeposit }) {
  return parseFloat(buyerTotalDeposited || 0) >= parseFloat(minDeposit || 20);
}
```
**Siga isso ao adicionar regra de negocio:** a funcao pura decide, a rota formata. E por isso que `services/limits.js` e o unico servico com teste unitario.

### 5.4 `catch` silencioso — aceito, mas limitado

- **Backend: 9 ocorrencias** de `catch` vazio (`routes/wallet.js` 2, `routes/admin.js` 2, `routes/crm.js` 2, `routes/auth.js` 1, `routes/support.js` 1) + padroes `catch (e) { console.error('[TAG]:', e.message); }` para falha nao-critica. Exemplo: `routes/wallet.js:721` `catch (e) { console.error('[WALLET] bonus expiry check:', e.message); }`.
- **Justificativa explicita no `catch` vazio do novo fluxo de ads** (`public/app.js:2025-2027`):
  ```js
  } catch (e) {
    // Falhou? nao marca: o servidor devolve de novo na proxima checagem e o
    // evento sai uma unica vez. Melhor perder 1 evento que repetir 500.
  } finally {
  ```
- **Frontend: 26 `catch` vazios** (`public/app.js` 18, `public/admin.html` 4, `public/i18n.js` 3, `public/login.html` 3, `public/index.html` 1). Padrao aceito para "pixel/UI nunca deve quebrar o app" (`public/app.js:1794` `{ /* pixel nunca deve quebrar o app */ }`).
- **Armadilha:** `getSystemSettings().then(...).catch(() => {})` (`routes/auth.js:165`) torna uma falha de sync com o Nexus CRM **completamente invisivel em producao**.

### 5.5 async/await

**async/await domina:** **556 `await`** no repositorio de primeira parte — `routes/admin.js` 142, `database.js` 81, `routes/wallet.js` 84, `services/telegramBot.js` 29, `e2e/lang.spec.js` 37, `public/app.js` 36, `routes/fleet.js` 10. `.then()` aparece 22 vezes e sempre como "fire-and-forget" sem `await` (`routes/wallet.js:717`, `:754`, `:832`; `routes/auth.js:165`).

---

## 6. Logging

**Ferramenta: `console.*` puro.** Sem pino/winston/logger, sem niveis estruturados, sem correlation-id.

**Formato obrigatorio: `console.<nivel>('[TAG MAIUSCULO]', ...)`** — a tag vai entre colchetes, no inicio, em MAIUSCULAS, identificando o subsistema (e as vezes a rota).

Contagem real de tags distintas em 2026-09-30: **~125 tags unicas**. As de maior frequencia:

| Tag | Ocorrencias | Onde |
|---|---|---|
| `[DATABASE]` / `[DATABASE ERROR]` | 9 / 2 | `database.js` |
| `[WALLET]` | 9 | `routes/wallet.js` |
| `[ASAAS]` | 6 | `services/asaas.js` |
| `[TELEGRAM CRON]` | 5 | `services/telegramBot.js` |
| `[MISTIC]` | 3 | `services/misticpay.js` |
| `[BACKUP]` / `[BACKUP ERROR]` | 3 / 1 | `services/backup.js` |
| `[WATCHDOG 24/7]` / `[WATCHDOG CRITICAL SHIELD]` | 3 / 2 | `services/keepAliveWatchdog.js` |
| `[ADMIN ERROR /<rota>]` | ~30 distintas | `routes/admin.js` — uma por rota |
| `[WALLET ERROR /<rota>]` | ~9 distintas | `routes/wallet.js` — inclui os novos `/purchases` e `/purchases/reported` |
| `[SECURITY]` | 3 | os 3 `throw` de boot |
| `[ANTI-FARM]` / `[ANTI-FARM ERROR]` / `[ANTI-FARM NOTIFY ERROR]` | 3 | `routes/auth.js` |
| `[CRM SESSION ERROR]` | 1 | `routes/auth.js:218` (novo) |
| `[i18n]` | 1 | `public/i18n.js:24` (fallback PT) |

**Nivel de log = escolha do metodo:** `console.error` para falha (quase sempre seguido de 500), `console.warn` para degradacao (`routes/wallet.js:286`; `public/i18n.js:24`), `console.log` para informacao/diagnostico/estado.

**Tres padroes de subtag coexistindo:**
1. `[X ERROR]` — subsystemo + palavra ERROR. Ex.: `[WALLET ERROR /withdraw]`.
2. `[X]` — so o subsystemo, para falha nao-critica. Ex.: `[WALLET] bonus expiry notify:` (`routes/wallet.js:717`), `[WITHDRAW] nao deu para calcular o total ja sacado:` (`routes/wallet.js:818`).
3. `[X ERROR /rota]` — quando o log serve para localizar a rota. Dominante em `routes/admin.js` e `routes/wallet.js`.

Tags com `ERROR` embutida no nome sao redundantes com `console.error` — e o padrao real, mantenha por consistencia.

---
## 7. Comentarios

**Idioma: portugues. Comentarios `//` de linha unica dominam; `/* */` de bloco so em cabecalho de arquivo, em wrapper UMD, e em banners de secao. Acentuacao: ver §0.1 — seguir o sem-acento.**

**Quando comentar (forte na pratica):**

- **Explicar o "porque" de uma decisao de negocio ou de seguranca.** E o principal motivo de os comentarios existirem neste repo:
  ```js
  // server.js:22-24
  // Atras do proxy do Render: req.ip precisa ser o IP real do visitante,
  // senao o rate-limit conta todo mundo como 1 IP so e trava o cadastro.
  app.set('trust proxy', 1);
  ```
  ```js
  // services/limits.js:2
  // Todas as janelas sao ROLANTES (agora - N), nunca dia corrido.
  ```
  ```js
  // routes/fleet.js:35-38
  // Mensagem neutra de proposito: a regra de carencia e interna, o cliente
  // nao precisa saber dela nem do prazo. O `diasRestantes`/`liberacao` continuam
  // na resposta para uso administrativo.
  mensagem: 'Limite deste modelo atingido.'
  ```
  ```js
  // routes/crm.js:10-12
  // Sem isso, qualquer pessoa na internet lia todos os leads (LGPD), via as
  // senhas do CRM em /settings e usava a conta de WhatsApp da empresa.
  ```
  ```js
  // routes/auth.js:215-217
  // Antes devolvia um token que ninguem validava: a tela abria, mas a API
  // ficava aberta pra internet. Agora o cookie httpOnly e assinado e
  // verificado a cada chamada (services/crmSession.js).
  ```

- **Registrar incidente de producao.** O caso mais valioso do repositorio — ver §13.1.
- **Marcar etapas numeradas de um bloco grande:** `// 1. Extracao flexivel de Status`, `// 2. Extracao de Valor` (`routes/wallet.js`); `// 1. SOLICITAÇÃO DE ATENDENTE HUMANO` (`services/aiSdrEngine.js`); `// 2b. GESTAO DE DEPOSITOS` (`routes/admin.js`).
- **Explicar gambiarra/workaround de infra:** `server.js:31` (helmet sem CSP por causa de script inline), `server.js:35-36` (rate-limit em plano free = MemoryStore, single-instance), `public/tiktok-pixel-base.js:1-7` (codigo de terceiro verbatim + stub sincrono).
- **Documentar premissa de bug corrigido:** `tests/limits.test.js:49` -> `it('bloqueia saque 00:01 quando o anterior foi 23:59 (bug atual)')`.
- **Banners de secao** que delimitam blocos inseridos depois: `routes/fleet.js:17-19` (`// ==== CARENCIA DE COMPRA POR MODELO (30 DIAS) ====`), `routes/crm.js:8` (`// ================= SEGURANCA DO CRM =================`), `database.js:571-573`, `public/app.js:1853-1855`, `public/app.js:2253-2255`.

**JSDoc: nao existe.** Nenhuma anotacao `@param`/`@returns` em todo o repositorio. Cabecalho de bloco so em `services/keepAliveWatchdog.js`, `services/settlementEngine.js`, `services/crmSession.js`, `services/telegramBot.js` (descricao do modulo).

**TODO: nao existe nenhum marcador `TODO`/`FIXME`/`XXX` no codigo.** O rastreamento de pendencia e feito em markdown na raiz (`plano-antifraude-bonus-R5.md`, `plano-limites-nativos-fase2.md`), em `.planning/REQUIREMENTS.md`, ou via commit.

---

## 8. Convencoes de Dinheiro (monetario)

Esta e a segunda convencao mais importante do repositorio e afeta integridade financeira.

### 8.1 O idioma de arredondamento

**`Math.round(x * 100) / 100` e o arredondamento canonico de centavos.** Contagem real: **43 ocorrencias** — `routes/wallet.js` 17, `routes/admin.js` 10, `routes/fleet.js` 5, `public/app.js` 4, `services/settlementEngine.js` 2, `public/admin.html` 2, `routes/auth.js` 1, `services/misticpay.js` 1, `database.js` 1.

```js
// routes/wallet.js:696-702 — le o saldo, arredonda, subtrai, recalcula o total
const earnBal0 = Math.round(parseFloat(user.earnBalance || 0) * 100) / 100;
const take = Math.min(earnBal0, bonusAmt);
if (take > 0) {
  const newEarn0 = Math.round((earnBal0 - take) * 100) / 100;
  await updateUser(user.id, {
    earnBalance: newEarn0,
    balance: Math.round(((user.investBalance || 0) + newEarn0) * 100) / 100
  });
```

```js
// routes/wallet.js:786-788 — taxa e liquido tambem arredondados antes de gravar
const WITHDRAW_FEE_RATE = withdrawFee / 100;
const feeAmount = Math.round(numAmount * WITHDRAW_FEE_RATE * 100) / 100;
const netAmount = Math.round((numAmount - feeAmount) * 100) / 100;
```

**Regra:** arredonde **na fronteira** (ao ler do banco e ao gravar), nunca so na exibicao. `toFixed(2)` (86 ocorrencias) e so para montar texto.

### 8.2 Coercao numerica

`parseFloat(x || 0)` e o idioma universal (campos `NUMERIC` do Postgres chegam como string). Inteiros por `parseInt(x, 10)`. Media mobile do Postgres: `parseInt(res.rows[0].count, 10) || 0` (`database.js:866`).

`Number.isFinite` antes de usar resultado de `parseFloat` em valor que vai para mensagem de alerta — bug real documentado no comentario novo (`services/telegramBot.js:479-482`):
```js
// parseFloat de lixo devolve NaN e Math.max(0, NaN) continua NaN, entao
// precisa do Number.isFinite antes -- senao vaza "NaN" na mensagem.
const rawSacou = parseFloat(alreadyWithdrawn);
const sacou = Number.isFinite(rawSacou) ? Math.max(0, rawSacou) : 0;
```

### 8.3 Mutacao de dinheiro: preferir incremento sobre read-modify-write

**Regra:** creditos usam os helpers de incremento `updateUser(id, { <campo>Inc: valor })`; **debitos** (que dependem do saldo atual) fazem read-modify-write explicito com `Math.round`.

**Incrementos disponiveis** (`database.js:788-807` Postgres, `database.js:820-825` JSON):

| Chave `updateUser` | Coluna | Semantica |
|---|---|---|
| `balanceInc` | `balance` | `balance = COALESCE(balance, 0) + $n` |
| `investBalanceInc` | `invest_balance` | idem |
| `earnBalanceInc` | `earn_balance` | idem |
| `totalDepositedInc` | `total_deposited` | idem |
| `totalWithdrawnInc` | `total_withdrawn` | idem |

Comentario que justifica o padrao (`database.js:787`):
```js
// Incrementos atomicos (evitam perda em creditos concorrentes)
```

**Uso correto (credito atomico) — 22 chamadas:**
```js
// routes/wallet.js:431 — deposito confirmado credita 3 saldos em uma chamada
await updateUser(user.id, { totalDepositedInc: amount, investBalanceInc: amount, balanceInc: amount });
// services/settlementEngine.js:29 — fatia horaria de rendimento
await updateUser(user.id, { earnBalanceInc: contract.dailyReturn, balanceInc: contract.dailyReturn });
// services/careerEngine.js:245 — comissao de upline
await updateUser(uplineUser.id, { earnBalanceInc: commissionAmount, balanceInc: commissionAmount });
// routes/admin.js:413-414 — devolucao
await updateUser(user.id, { earnBalanceInc: refundAmount, balanceInc: refundAmount });
```
Distribuicao: `routes/admin.js` 9, `routes/wallet.js` 4, `services/careerEngine.js` 2, `services/settlementEngine.js` 2.

**O modo JSON nao e atomico** (`database.js:820`): `user[k] = Math.round(((parseFloat(user[k] || 0) + parseFloat(fields[f])) * 100) / 100` sobre `readJsonDb()`/`writeJsonDb()`. A atomicidade real so existe no Postgres. Isso esta declarado como constraint em `.planning/STATE.md` e e o alvo da Fase 3 do roadmap de seguranca.

### 8.4 O padrao de expiracao preguicosa (lazy expiry)

**Regra:** estado que expira por tempo **nao e processado por cron**; e verificado e aplicado **dentro do handler que vai precisar dele**, antes de usar.

O caso canonico e o bonus de boas-vindas (7 dias sem deposito), em `routes/wallet.js:687-721`:

```js
// Fase 2: expiracao preguicosa do bonus de boas-vindas (7 dias sem nenhum deposito)
try {
  const userTx0 = await getTransactionsByUserId(user.id);
  const bonusTx = userTx0.find(t => t.type === 'bonus' && String(t.id || '').indexOf('BNS-SIGNUP') === 0 && t.status === 'approved');
  if (bonusTx && wdLimitsLib.isSignupBonusExpired({
    bonusCreatedAt: bonusTx.createdAt, totalDeposited: user.totalDeposited, now: Date.now()
  })) {
    const bonusAmt = Math.round(Math.abs(parseFloat(bonusTx.amount || 0)) * 100) / 100;
    if (bonusAmt > 0) {
      const earnBal0 = Math.round(parseFloat(user.earnBalance || 0) * 100) / 100;
      const take = Math.min(earnBal0, bonusAmt);            // <-- NUNCA fica negativo
      if (take > 0) {
        await updateUser(user.id, {
          earnBalance: newEarn0,
          balance: Math.round(((user.investBalance || 0) + newEarn0) * 100) / 100
        });
        await createTransaction({
          id: `BNS-EXP-${Date.now()}`, type: 'adjustment', amount: -take, status: 'approved',
          description: 'Bonus de boas-vindas expirado (7 dias sem deposito).', ...
        });
        user = await findUserById(user.id);                 // <-- re-le o usuario
        notifyAdminSecurityAlert({ ... }).catch(e => console.error('[WALLET] bonus expiry notify:', e.message));
      }
    }
  }
} catch (e) { console.error('[WALLET] bonus expiry check:', e.message); }
```

**As 5 marcas do padrao:**
1. **Bloco `try/catch` proprio**, independente do `try/catch` do handler — falha na expiracao **nao bloqueia** a operacao principal.
2. **Predicado puro externo:** a regra fica em `services/limits.js` (`isSignupBonusExpired`, `services/limits.js:120-127`), que recebe `now` por parametro e nao lanca.
3. **`Math.min(ganho, valor)`** para nunca debitar mais do que existe.
4. **Transacao de ajuste espelhada** (`type: 'adjustment'`, valor negativo) — o extrato do usuario mostra a baixa; o id `BNS-EXP-` distingue de `BNS-SIGNUP-`.
5. **Re-leitura do usuario** (`user = await findUserById(user.id)`) depois da mutacao, porque todo o resto do handler usa `user.*`.

**Segundo caso (teto de saque em 24h, `routes/wallet.js:723-758`)** — mesma forma: bloco `try` proprio, soma rolante calculada na hora (`sumInWindow`), checagem **antes** do saldo, `notifyAdminSecurityAlert` apenas quando `code === 'GLOBAL_CAP'`, e **best-effort na soma global** (`routes/wallet.js:733-739` — falha no `getAllTransactions()` loga e segue com `globalWithdraws24h = 0`).

**Terceiro caso (marcacao de ads, `database.js:1123` + `routes/wallet.js:940`)** — o estado "ja reportei isso?" e lido do servidor a cada consulta e marcado imediatamente apos o uso; nunca guardado em cache de navegador. Ver §13.1.

---
## 9. Design de Funcoes

- **Nivel de abstracao: baixo e procedural.** Funcoes de rota sao longas e lineares (guard clauses -> query -> resposta), sem camada de servico intermediaria. `routes/admin.js` tem 1476 linhas em um unico router.
- **Limite de tamanho na pratica: nao existe.** `public/app.js` = 2833 linhas, `public/admin.html` = 2962, `public/presell.html` = 2746, `database.js` = 2180, `public/style.css` = 2545, `routes/admin.js` = 1476, `routes/wallet.js` = 979, `services/telegramBot.js` = 675.
- **Parametros: posicionais quando cabe; destructuring de objeto unico quando ha 4+** — esse e o padrao para "regras de negocio testaveis":
  ```js
  // services/limits.js — assinatura canonica
  function checkWithdrawLimits({ amount, user, withdraws24h, globalWithdraws24h, lastWithdrawAt, limits, now })
  function isSignupBonusExpired({ bonusCreatedAt, totalDeposited, now })
  function shouldPayCommission({ buyerTotalDeposited, minDeposit })
  // services/telegramBot.js:468 — objeto grande com defaults (novo em 3b38fa8)
  async function notifyAdminWithdrawal({ operatorName, phone, amount, pixKey, txId,
    totalDeposited = 0, activeContractsCount = 0, alreadyWithdrawn = 0, alreadyCount = 0 })
  ```
- **Retorno antecipado e explicito.** Guard clauses dominam: `if (!row) return null;`, `if (!product) return res.status(404)...`.
- **Funcao pura de regra = testavel.** Contrato: nao toca I/O, nao lanca, recebe `now`, devolve objeto/booleano.

### 9.1 O padrao UMD para logica pura compartilhada (o padrao para qualquer logica que precise de teste unitario)

Quatro arquivos sao projetados para rodar **no browser E no `node --test`** sem build:

```js
// public/admin-filters.js:1-8
/* Filtros client-side do /admin - predicados puros.
 * UMD: funciona via <script src> no browser (window.AdminFilters)
 * e via require() no node --test. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdminFilters = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  ...
  return { matchWithdrawal, matchDeposit, /* ... */ };
}));
```

| Arquivo | Global no browser | Testado por |
|---|---|---|
| `services/limits.js` | (so Node — CommonJS puro) | `tests/limits.test.js` |
| `public/i18n.js` | `window.TruckAutoI18n` | `tests/i18n.test.js` |
| `public/i18n-data.js` | `window.I18nData` | `tests/i18n-data.test.js` |
| `public/admin-filters.js` | `window.AdminFilters` | `tests/admin-filters.test.js` |

O comentario de cabecalho de 2-3 linhas **explica o porque** do wrapper — copie esse habito.

**Variacoes recentes:** `public/tiktok-pixel.js` usa IIFE simples (nao UMD) porque so roda no browser; `public/tiktok-pixel-base.js` expoe `window.TikTokBase` direto, sem wrapper, por ser codigo de terceiro.

---

## 10. Frontend

### 10.1 Convencao obrigatoria de i18n — a indirecao `window.TruckAutoI18n`

O app do operador e quadrilingue (pt/es/en/zh). A convencao e explicita e dominante.

**Padrao canonico (ternario com fallback PT-BR hardcoded) — 256 ocorrencias:**
```js
window.TruckAutoI18n ? window.TruckAutoI18n.t('chave') : 'fallback em PT'
```

| Arquivo | Ternarios `window.TruckAutoI18n ?` | Chamadas `.t(` |
|---|---|---|
| `public/app.js` | 243 | 242 |
| `public/login.html` | 13 | 12 |
| **Total** | **256** | **254** |

**Como o fallback funciona** (leia `public/i18n.js:17-33`, `:70-72`): o literal PT **nao e apenas decorativo** — ele e a segunda fonte de verdade.

```js
// public/i18n.js:70-72
function t(key, vars) {
  return interpolate(lookup(cache[current] || {}, ptDict || cache.pt || {}, key, current), vars);
}
// public/i18n.js:17-28
function lookup(dict, fallbackDict, key, lang) {
  ...
  const fb = get(fallbackDict);
  if (typeof fb === 'string') {
    if (typeof console !== 'undefined') console.warn('[i18n] ' + (lang || current) + ':' + key);
    return fb;                     // <-- cai no PT
  }
  return key;                      // <-- devolve a chave CRUA
}
```

Consequencias praticas:
- O ternario `? :` e **obrigatorio** porque o app precisa renderizar antes do `fetch('/i18n/<lang>.json')` resolver (`public/i18n.js:46-53` e async).
- Como o PT esta hardcoded, **um texto so aparece em ingles quando existe no dicionario**. Se voce adiciona UI nova, o fallback mostra PT e nao quebra.
- O aviso `[i18n]` no console e **esperado** durante os testes, nao e bug.
- A ultima linha (`return key`) e o que produz **chave i18n crua na tela** — exatamente o que o E2E `rawKeyEchoes` caça. O aviso `console.warn` existe para diagnosticar isso.

**Com interpolacao:**
```js
// public/app.js:168 — placeholder {var} substituido por interpolate()
window.TruckAutoI18n.t('wallet.minDepPh', { min: appLimits.minDeposit.toFixed(2) })
// public/i18n.js:30-33 — se a var nao vier, o placeholder fica intacto
return String(str).replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
```

**Para dados de catalogo (nao UI)** o helper e outro: `window.I18nData.pickLang(prod, 'name', langNow)` e `window.I18nData.cityName(assignedCity, langNow)`, com o mesmo ternario de fallback.

**Para locale de formatacao:** `window.TruckAutoI18n.LOCALES[window.TruckAutoI18n.getLang()] || 'pt-BR'` (`public/app.js:8`, `:27`).

### 10.2 Nos templates estaticos

Atributo `data-i18n` no elemento, com o texto PT hardcoded como fallback no corpo:
```html
<span class="tag" data-i18n="home.autoTag">Operacao Autonoma</span>
<p class="auth-subtitle" data-i18n="login.subtitle">Terminal de Gestao de Frotas Autonomas</p>
```
Variantes aplicadas em `public/i18n.js:80-86`: `data-i18n`, `data-i18n-ph` (placeholder), `data-i18n-aria` (aria-label), `data-i18n-title` (title).
Contagem real: **164 atributos** — `public/index.html` 147, `public/login.html` 17, **0 em `public/admin.html`**.

**Cuidado ao traduzir:** `setText` (`public/i18n.js:74-78`) substitui **apenas o primeiro no de texto nao-vazio** e preserva os filhos `<i>` (icones). E por isso que existe o teste E2E "icones sobrevivem a troca de idioma". Se voce escrever `data-i18n` num elemento cujo texto esta entre outras tags inline, o icone some.

### 10.3 Chaves de traducao

Chaves **camelCase aninhadas por tela**, com valor ASCII e sem acento: `home.*`, `fleet.*`, `wallet.*`, `login.*`, `common.*`, `hist.*`, `notif.*`, `team.*`, `profile.*`, `receipt.*`, `hiredone.*` (`public/i18n/{pt,en,es,zh}.json`, 451 linhas cada).

**Nao existe teste que garanta a paridade de chaves entre os 4 dicionarios** — ver `TESTING.md` §7.

### 10.4 Onde a convencao e VIOLADA (fatos observados em 2026-09-30)

- **`public/admin.html` (2962 linhas) nao tem NENHUM `data-i18n` e nao carrega `/i18n.js`.** So importa `/admin-filters.js`. O painel admin e 100% PT hardcoded.
- **`public/presell.html` (2746 linhas)** esta fora do escopo do i18n v1 e e 100% PT.
- **Violacao NOVA introduzida no pull mapeado:** `public/app.js:740` — o botao de carencia renderiza `<i class="fa-solid fa-lock"></i> Limite deste modelo atingido` como **literal PT fora do `t()`**, dentro de um `renderProducts()` onde todo o resto do bloco passa pelo ternario. O texto e identico ao do servidor (`routes/fleet.js:49`) — se um dia o servidor mudar a frase, os dois saem diferentes.
- `public/app.js:2814` — `alert()` com o texto de **ACESSO RESTRITO** inteiro em PT, sem passar por `t()`.
- `public/app.js:1137` — `alert(\`Erro: ${res.error}\`)` com prefixo PT fixo.
- **`public/index.html`** tem linhas com texto PT visivel sem `data-i18n` (nomes de marca como "Telegram"/"TruckAuto" sao legitimos; textos de UI nao).
- **O e2e `rawKeyEchoes` (`e2e/lang.spec.js:45-50`) so detecta chave crua vazada** (`/^[a-z]+\.[a-zA-Z.]+$` como `textContent` em elementos `[data-i18n]`) em `/login` e `/app`. **Nao detecta texto PT residual** — por isso todas as violacoes acima passam. E **nao cobre `/admin` nem `/` (presell)**.

### 10.5 Handlers de evento no HTML: inline vs delegation

**O projeto usa `onclick=`/`onsubmit=`/`onchange=` inline como padrao, nao event delegation.**

| Arquivo | `onclick=` | `onsubmit=` | `onchange/oninput=` | `addEventListener` |
|---|---|---|---|---|
| `public/index.html` | 113 | 0 | 2 | 2 |
| `public/admin.html` | 73 | 2 | 20 | 1 |
| `public/presell.html` | 37 | 1 | 2 | 1 |
| `public/login.html` | 11 | 2 | 0 | 4 |
| `public/app.js` | — | — | — | 6 |

Isso e **forcado** por `helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })` (`server.js:32`) combinado com o comentario explicito em `server.js:31`: *"sem CSP/COEP para nao quebrar scripts e fontes inline do app"*. Consequencia: as funcoes chamadas inline precisam ser globais — dai as 103 funcoes top-level em `app.js`.

**Ao adicionar handler:** siga o dominante (`onclick="nomeDaFuncaoGlobal(args)"` no HTML + funcao global no JS). So introduza `addEventListener` se estiver adicionando delegacao para uma lista dinamica grande.

### 10.6 Estilo visual

`public/style.css` (2545 linhas, 59 KB) e CSS vanilla com CSS custom properties. O CRM (`public/crm/assets/`) usa Tailwind compilado e vive fora do sistema de estilo do app. Zero preprocessador, zero build step para `public/` exceto o bundle do CRM (que ja vem compilado no repo).

---

## 11. EOL, Encoding e Tamanho de Arquivo (verificado byte a byte em 2026-09-30)

- **Encoding: UTF-8 sem BOM em 100% dos arquivos de primeira parte.** Verificado com decodificador de fallback **excecao**: **0 arquivos `.js`/`.html`/`.json`/`.css`/`.md` de primeira parte invalidos.**
- **Correcao importante:** a versao anterior deste doc afirmava "mojibake real (dupla codificacao) em 12 linhas" em `database.js:21,29,40,268,468,599,616,625,1099,1109` e `data.json:8,19`. **Isso e falso.** `database.js:21` contem `DATABASE_URL nao detectada` em ASCII puro; `database.js:29` e `:268` contem `'Disponivel'` (com acento) corretamente codificado; `database.js:468` e uma `catch`, `:599`/`:616`/`:625` sao chaves de objeto, `:1099`/`:1109` sao parenteses de fechamento. **Era artefato de renderizacao do console (UTF-8 impresso em CP850).** O unico arquivo realmente invalido no repositorio e `.superpowers/sdd/2026-09-29-i18n-app-operador/task-7-report.md` (byte solto), que **nao e versionado** (`.gitignore:37`).
- **Sem BOM** em todos os arquivos versionados. Os unicos com UTF-8-BOM sao relatorios de review em `.superpowers/sdd/` (nao versionados) e `INTEGRATIONS.md`/`STACK.md` em `.planning/codebase/` (artefato de geracao).
- **EOL: predominantemente CRLF**, porque `core.autocrlf=true` no clone local e **nao existe `.gitattributes`**.
- **Excecao — arquivos em LF puro:** `public/i18n/{pt,en,es,zh}.json` (451 LF cada), `public/i18n-data.js` (35 LF), `tests/i18n-data.test.js` (37 LF), `package-lock.json`, `data.json` (1074 LF), `crm_index.html`, `crm_package.json`, `test-results/.last-run.json`. **O repositorio esta misturando CRLF e LF.** Nao "normalize" sem decisao explicita.

---

## 12. Mensagens de Commit

**230 commits no total, branch `main`, fluxo de merge direto (sem branch protection, sem PR).**

Prefixos nos 60 commits mais recentes (contagem real):

| Prefixo | Ocorrencias |
|---|---|
| `i18n` | 18 |
| `frotas` | 5 |
| `ads` | 5 |
| `Merge remote-tracking branch 'origin/main'` | 4 |
| `chore` | 4 |
| `admin` | 2 |
| `git` | 2 |
| `bonus diario` | 2 |
| `teste` | 2 |
| demais (`fase 2`, `limites nativos fase 2`, `telegram`, `reverte`, `pixel`, `plan`, `bonus cupom`, `fix`, `test`, `docs`, `i18n dados`, `origem dos leads`, `seguranca`, `Revert "teste`, `spec`, `comunidade`) | 1 cada |

**Padrao: `<escopo-em-pt>: <descricao-em-minusculas-em-pt>`, uma linha, descrevendo o efeito observavel e nao o arquivo.** Nao e Conventional Commits puro (nao ha `!`, nao ha corpo padronizado), nem squash-merge. Os 6 commits verdadeiramente Conventional em 230 sao `chore:` (4), `test:` (1), `spec:` (1), `plan:` (1), `fix:` (1).

**Escrita: minuscula, PT-BR, sem acento no prefixo nem no subject.** Exemplos reais recentes:
- `ads: para de inflar Purchase no Meta/TikTok - marcacao no servidor em vez de localStorage + event_id`
- `telegram: mostra no alerta de saque quanto a pessoa ja sacou (soma dos aprovados) com alerta de valor alto`
- `frotas: carencia de 30 dias so vale depois que o modelo foi lotado (permite comprar as vagas restantes na hora)`
- `seguranca: fecha o CRM (sessao assinada via cookie) e mascara segredos em /settings`
- `origem dos leads: para de mentir. so conta como anuncio se tiver fbclid/criativo/palavra; o resto e 'direto'`

**A ausencia de acento e consistente e intencional** — mesma convencao dos comentarios (§0.1). O corpo do commit raramente e usado.

**Ao commitar:** `<escopo-em-pt-sem-acento>: <descricao-em-minusculas-em-pt-sem-acento>`, uma linha. Prefixos em uso que vale reaproveitar: `i18n:`, `ads:`, `frotas:`, `admin:`, `app:`, `saque(s):`, `telegram:`, `seguranca:`, `chore:`, `test:`, `fix:`, `spec:`, `plan:`, `docs:`.

**Merge:** `Merge remote-tracking branch 'origin/main'` — fluxo `git_sync.ps1` (stash/commit -> fetch -> merge -> **roda testes** -> `node --check` nos `.js` alterados -> push direto em `main`).
---

## 13. Problemas de Qualidade Observados (fatos, nao sugestoes)

### 13.1 CRITICO — Duplicidade de evento de ads em producao, documentada no proprio codigo

O incidente mais importante do repositorio esta registrado como comentario permanente em **`public/app.js:1992-2000`** (bloco que comeca na linha 1992; a **linha 1997** e a linha do relato):

```js
// public/app.js:1992-2000
// Purchase/AddPaymentInfo para Meta e TikTok.
//
// Quem controla a marcacao e o SERVIDOR (transactions.ad_reported_at), nao o
// localStorage. Antes a lista de ids ficava no navegador e cada pagina podia
// re-disparar tudo: se o storage sumisse (WebView do WhatsApp) ou passasse de
// 200 ids, o TikTok recebia a mesma compra centenas de vezes -- chegou a 42 mil
// eventos de Purchase para 39 pessoas que depositaram.
//
// Fluxo: pega o que o servidor ainda nao marcou -> dispara -> confirma.
```

**Causa:** a marcacao vivia em `localStorage['truckauto_purchase_seen']` (array de ids, truncado em 200) em vez do servidor. `updateSupportBadge` rodava a cada 30s e `openHistoryModal` tambem disparava.

**Dano:** Meta e TikTok receberam **200 eventos `Purchase` duplicados**, chegando a **42.000 eventos de Purchase para 39 depositantes** — ou seja, o ROAS dos anuncios de aquisicao estava contaminado e o pixel inflava as metricas. Um usuario que nunca voltava ao app (storage limpo) ou que so usava a WebView do WhatsApp re-disparava tudo.

**Correcao (commit `f457410`, no pull mapeado):**

| Camada | Onde | O que |
|---|---|---|
| Migracao | `database.js:389` | `ALTER TABLE transactions ADD COLUMN IF NOT EXISTS ad_reported_at TIMESTAMPTZ` |
| Mapeamento | `database.js:567` | `adReportedAt: row.ad_reported_at \|\| null` |
| Leitura | `database.js:1123` `getUnreportedDeposits(userId)` | `WHERE ... AND ad_reported_at IS NULL ORDER BY created_at DESC LIMIT 200` |
| Escrita | `database.js:1141` `markDepositsReported(ids)` | `UPDATE ... SET ad_reported_at = $1 WHERE id = ANY($2::varchar[]) AND ad_reported_at IS NULL` |
| API leitura | `routes/wallet.js:940` | `GET /api/wallet/purchases` |
| API escrita | `routes/wallet.js:951` | `POST /api/wallet/purchases/reported` |
| Cliente | `public/app.js:2002-2031` | `reportNewDepositPurchases()` |

**Defesa em profundidade adicionada:**
- `event_id`/`eventID` estaveis por recarga (`'dep_' + t.id`, `public/app.js:2017-2018`) para as plataformas deduplicarem do lado delas.
- Guard de reentrada `adReportInFlight` (`public/app.js:2001`, liberado em `finally`).
- Limite de 200 ids por lote e **validacao de que os ids pertencem ao usuario autenticado** (`routes/wallet.js:955-958` — um id de outro usuario nao pode ser confirmado).
- `catch` que **nao marca** em caso de falha (`public/app.js:2025-2027`) — o servidor devolve na proxima checagem.
- Pula se a aba estiver escondida (`public/app.js` em `updateSupportBadge`: `if (document.hidden) return;`) — evento nao sai de app em segundo plano.

**Licao transversal (vale para qualquer integracao com idempotencia):** *estado de "ja fiz isso" nao pode viver no cliente.* Se o cliente pode perder esse estado, toda a logica de idempotencia em volta e decorativa. Detalhes de teste/monitoramento em `TESTING.md` §9.

### 13.2 `catch` silencioso onde a falha some

9 `catch` vazios no backend. O mais perigoso: `getSystemSettings().then(settings => { ... }).catch(() => {})` (`routes/auth.js:165`) — uma falha de sync com o Nexus CRM e **completamente invisivel em producao**. Combinado com `routes/support.js` e `routes/admin.js`, distingue-se o silencioso *justificado por comentario* (como `public/app.js:2025`) do silencioso *acidental*.

### 13.3 Segredo de ambiente novo nao documentado

`services/crmSession.js` le `CRM_SECRET` (`services/crmSession.js:14`) e `routes/crm.js:17` **falha o boot em producao sem ele** — mas **nem `.env.example` (49 linhas) nem `render.yaml` documentam `CRM_SECRET`**. Quem faz deploy em producao vai bater no `[SECURITY]` sem saber de onde vem a variavel.

### 13.4 Regra de negocio replicada em duas linguagens

A carencia de 30 dias por modelo esta implementada **duas vezes**: `routes/fleet.js:32-52` (`cooldownsForModel`, servidor, autoritativo) e `public/app.js:364-386` (`calcCooldown`, cliente, so para UX). O comentario do cliente **assume** a igualdade explicitamente (`public/app.js:362-363`: *"Espelha cooldownsForModel() do servidor"*). Divergir as duas produz botao habilitado + 403 no servidor. Nao ha teste compartilhando a regra.

### 13.5 Colapso de indentacao

3 blocos colados sem reindentar: `routes/wallet.js:676-678` (guard clause na coluna 0), `routes/auth.js:127-161` (bloco de lead automatico inteiro na coluna 0), `routes/wallet.js:15-30` (destructuring de 16 linhas sem indentacao). Detalhado em §3.

### 13.6 Texto nao-portugues em comentario portugues

`routes/wallet.js:663-664`:
```js
// O operador escolhe o tipo da chave. Sem escolha, detectamos — mas NUNCA
// chutamos "CPF": chave invalida<aqui>travava dinheiro na fila da gateway.
```
(na linha 664 ha caracteres chineses no meio do comentario, comecando em "chave invalida"). Sem efeito funcional, mas indica edicao incremental sem revisao.

### 13.7 `.gitignore:38` corrompido

A linha e `.superpowers/**# Playwright` — o comentario `# Playwright` foi colado no padrao. As regras `test-results/`, `playwright-report/`, `playwright/.cache/` (linhas 39-41) ainda funcionam porque estao em linhas proprias.

### 13.8 Zero ferramental de qualidade

Sem ESLint, sem Prettier, sem `.editorconfig`, sem `.gitattributes`, sem type-checking. `package.json` so define `start`. Nada impede que as convencoes acima regredam. O unico gate automatico e `git_sync.ps1:56-71`, que roda **apenas `tests/limits.test.js`** + `node --check` nos `.js` alterados no ultimo commit — 25 de 55 testes unitarios, zero E2E. Ver `TESTING.md` §8.

### 13.9 `data.json` no working tree mas ignorado no git

`.gitignore:5` ignora `data.json`, mas o arquivo esta presente com 1.074 linhas (0 usuarios, 12 produtos, 0 contratos, 0 transacoes, 2 webhookLogs, 112 pageViews). Como nao ha `DATABASE_URL` local, `node server.js` sobe no modo arquivo — e **o E2E do Playwright sobe exatamente assim** (ver `TESTING.md` §7.4).

### 13.10 `catch` vazio em `reportNewDepositPurchases` pode mascarar perda

`public/app.js:2025-2027` escolhe deliberadamente **nao marcar** quando o envio falha ("melhor perder 1 evento que repetir 500"). A escolha esta certa, mas o `catch` vazio significa que **nao ha sinal nenhum** quando um evento e perdido para sempre. Um `console.warn` com taxa de perda seria o contra-positivo.

---

## 14. Checklist para code novo

1. Comentario em **portugues sem acento**; texto de interface em **portugues com acento**. (§0.1)
2. `camelCase` para funcao/variavel; `UPPER_SNAKE_CASE` so para config/segredo/tabela. (§1.3)
3. `require` na ordem: dotenv -> externos -> internos; destructuring na linha. `require` preguiçoso dentro de `try` quando proteger boot. (§4)
4. Handler de rota: `try { ... } catch (err) { console.error('[X ERROR /rota]:', err); res.status(500).json({ error: 'Erro ao ... em PT.' }); }`. (§5.1)
5. Dinheiro: `Math.round(x * 100) / 100` na fronteira; credito com `<campo>Inc`; debito com `Math.min`. (§8)
6. Regra de negocio (expiracao, carencia, teto) em **funcao pura** em `services/` + bloco `try` proprio no handler. (§8.4)
7. Log com tag `[X]` ou `[X ERROR /rota]`. (§6)
8. Nova coluna Postgres: `ALTER TABLE ... ADD COLUMN IF NOT EXISTS`, `map*` com `row.a || row.b`, `setClauses` no `update*`. (§2)
9. Texto de UI em JS: **sempre** `window.TruckAutoI18n ? window.TruckAutoI18n.t('chave') : 'PT hardcoded'`. (§10.1)
10. Texto de UI no HTML: `data-i18n` + PT no corpo do elemento. (§10.2)
11. Handler de UI: `onclick="funcaoGlobal()"` no HTML + funcao global no JS. (§10.5)
12. Logica pura que precisa de teste: wrapper UMD + `window.<Global>` + um unico objeto de retorno. (§9.1)
13. Teste unitario: `tests/<modulo>.test.js`, comentario de escopo + comando, 3 imports, `describe` por funcao, `it` em PT minusculo, sem mock. (`TESTING.md` §10)
14. Commitar: `<escopo-em-pt-sem-acento>: <descricao-em-minusculas>`. (§12)

---

*Mapeamento de convencoes: 2026-09-30 | commit `3b38fa8` | substitui `4c16c6f` (2026-09-29)*
*Atualize quando os padroes mudarem.*