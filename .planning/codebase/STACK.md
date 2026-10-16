---
doc: stack
last_mapped_commit: 3b38fa8
mapped_date: 2026-09-30
previous_mapped_commit: 4c16c6f
staleness_fixed: true
scope: root
---

# Technology Stack

**Mapped commit:** `3b38fa8` | **Mapped date:** 2026-09-30 | **Supersedes:** `4c16c6f` (2026-09-29)

O que mudou desde o mapa anterior e foi corrigido aqui: `cookie-parser` entrou em `package.json`;
existem `services/crmSession.js`, `public/tiktok-pixel.js` e `public/tiktok-pixel-base.js`;
`database.js` ganhou a coluna `transactions.ad_reported_at` e os *endpoints*
`GET /api/wallet/purchases` / `POST /api/wallet/purchases/reported`;
`tiktokPixelId` virou chave de `system_settings` (`tiktok_pixel_id`); `routes/crm.js` passou a exigir
sessão assinada em quase todas as rotas.

## Languages

**Primary:**
- JavaScript (Node 18+, ES2022, 100% CommonJS) — backend (`server.js`, `database.js`, `middleware/auth.js`,
  `routes/*.js`, `services/*.js`) e todo o frontend mobile-first servido de `public/`
  (`public/app.js` 2.833 linhas, `public/admin-filters.js`, `public/i18n.js`, `public/i18n-data.js`,
  `public/tiktok-pixel.js`, `public/tiktok-pixel-base.js`).

**Secondary:**
- HTML — páginas estáticas servidas por Express: `public/index.html` (app do operador, 909 linhas),
  `public/admin.html` (painel master, 2.725), `public/login.html` (682), `public/presell.html` (2.569),
  `public/termos.html` (64), `public/privacidade.html` (49), `public/crm/index.html` (SPA do CRM).
- CSS — `public/style.css` (2.268 linhas, vanilla com CSS variables); o CRM usa Tailwind compilado
  versionado em `public/crm/assets/index-B03ZFj7a.css`.
- JSX — só no CRM: `crm_frontend_src/**/*.jsx` (13 arquivos), compilado por Vite e **commitado** em `public/crm/assets/`.
- JSON — i18n (`public/i18n/{pt,es,en,zh}.json`, 451 linhas cada), PWA (`public/manifest.json`),
  `data.json` (fallback de banco) e `crm_data.json` (store do CRM, gitignored).

## Runtime

- Node `>=18.0.0` (`package.json:9-11`); versão verificada no ambiente: **v22.14.0** (npm 11.17.0).
- Sem `.nvmrc`, sem Docker, sem TypeScript, sem bundler no caminho principal.
- CommonJS em todo o runtime (`require`); o bundle do CRM é a única parte com `type="module"`.
- Requisitos que forçam Node 18+: `fetch` global, `AbortSignal.timeout` (`services/misticpay.js:39`),
  `FormData`/`Blob` (`services/backup.js:76-79`), `res.cookie` (Express 4 + `cookie-parser`).
- Bind: `PORT || 10000` em `0.0.0.0` (`server.js:19-20`).
- Corpo de request limite **50mb** em JSON e urlencoded (`server.js:27-28`).

## Frameworks

**Core:**
- **Express 4.22.3** — HTTP + roteamento (`server.js:2`). Routers montados em `server.js:139-145`:
  `/api/auth`, `/api/wallet`, `/api/fleet`, `/api/team`, `/api/admin`, `/api/support`; mais o router do CRM
  montado em `/api` (`server.js:158-163`) e aliases de webhook (`:148-162`).
- **Socket.IO 4.8.3** — realtime do CRM (`server.js:15-17`, `cors.origin: '*'`). Emite `whatsapp:qrcode`,
  `whatsapp:connection`, `chat:message`, `leads:new`, `leads:update`, `leads:human_requested`
  (`routes/crm.js:130,208-209,286-290,303-309,324,327`).
- **helmet 7.2.0** — `contentSecurityPolicy: false` e `crossOriginEmbedderPolicy: false` (`server.js:32`).
- **express-rate-limit 7.5.1** — 3 limitadores em `server.js:37-69`: login+verify-admin por IP (100/15min),
  login por telefone normalizado (10/15min, `skipSuccessfulRequests`, chave `login:<13 dígitos>`),
  cadastro (60/hora por IP).
- **cookie-parser 1.4.7** — **novo** nesta janela; `server.js:29`. Existe porque a sessão do CRM passou a ser
  cookie httpOnly (`services/crmSession.js`).

**Testing:**
- `node --test` (runner nativo) + `node:assert/strict` — 4 suítes em `tests/`
  (`limits.test.js`, `i18n.test.js`, `i18n-data.test.js`, `admin-filters.test.js`), **55 casos, todos passando**
  em 2026-09-30. Detalhe operacional: `node --test tests/` **falha** neste ambiente Windows
  (`Cannot find module ...\tests`); o comando que funciona é `node --test "tests/*.test.js"`.
- `@playwright/test` 1.63.0 (devDependency) — E2E, único spec `e2e/lang.spec.js` (61 linhas, troca de idioma
  pt/es/en/zh). `playwright.config.js`: `testDir: ./e2e`, `baseURL http://localhost:3100`, `webServer: node server.js`
  com `PORT=3100`, `reuseExistingServer: true`.

**Build/Dev:**
- Zero build step no caminho principal: `npm install` + `node server.js` (`render.yaml:9-10`).
- `package.json` só tem o script `start` — **não existe `npm test`**.
- CRM tem stack separada declarada em `crm_package.json` (não é o `package.json` do produto):
  Vite 6.2 + React 18.3 + Tailwind 4.3 + `socket.io-client`, `recharts`, `lucide-react`, `canvas-confetti`,
  `ssh2`, `clsx`/`tailwind-merge`. Scripts `dev`/`build`/`start` (via `concurrently`/`nodemon`).

## Database Layer — dois modos, mesma API

O app escolhe o backend **uma única vez, no boot**, por `DATABASE_URL` (`database.js:9-12`):

```js
const isPostgres = Boolean(DATABASE_URL && DATABASE_URL.trim().length > 0);
```

- **Modo PostgreSQL (produção)** — `Pool` do `pg` (`database.js:16-19`), `ssl: { rejectUnauthorized: false }`
  exceto quando a URL contém `localhost`. Sem ORM e sem pasta de migrations: `initDb()` (`database.js:220-407`)
  roda `CREATE TABLE IF NOT EXISTS` + `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` **no boot**, com pool de
  conexão dedicado. 13 tabelas: `users` (`:246`), `products` (`:264`), `contracts` (`:276`),
  `transactions` (`:291`), `page_views` (`:306`), `webhook_logs` (`:317`), `promo_codes` (`:332`),
  `promo_redemptions` (`:341`), `pix_charges` (`:347`), `support_messages` (`:355`),
  `support_threads` (`:364`), `system_settings` (`:407`).
  Colunas adicionadas por migração idempotente: ~30 `ALTER` (`:372-405`), incluindo
  `transactions.ad_reported_at TIMESTAMPTZ` (`:391`), `transactions.external_id` (`:390`),
  `transactions.pix_key_type` (`:393`), `contracts.drip_day/drip_count` (`:394-395`),
  `users.invest_balance/earn_balance` (`:386-387`).
- **Modo arquivo `data.json` (fallback)** — ativo quando `DATABASE_URL` está vazia. Mesmo arquivo para o
  app inteiro: `readJsonDb()`/`writeJsonDb()` com `fs` **síncrono** e reescrita do arquivo inteiro a cada
  escrita (`database.js:200-215`). `initDb()` nesse modo só roda a migração dos 2 saldos
  (`balance` → `earnBalance`, `investBalance = 0`) e gera `inviteCode` faltante (`:221-239`).
  Conteúdo do `data.json` local em 2026-09-30: chaves `users`, `products`, `contracts`, `transactions`,
  `webhookLogs`, `pageViews` (sem `systemSettings`, então `getSystemSettings()` cai nos defaults).
  `data.json` e `crm_data.json` são gitignored (`.gitignore:5-6`).
- **Terceiro store: `crm_data.json`** — o CRM (leads, mensagens, funil, automações, settings da Evolution)
  vive em arquivo próprio via `fs` sync (`services/crmDb.js:5,47-67`), **independente** do PostgreSQL e do
  `data.json`. Não há como rodar o CRM no Postgres.
- Sem cache/Redis: todo cache é em memória do processo.

## Dependencies (todas de `package.json`)

| Dependência | Versão declarada | Instalada (2026-09-30) | Para quê |
|---|---|---|---|
| `express` | `^4.21.2` | 4.22.3 | HTTP, roteamento, static, cookies (`server.js`) |
| `pg` | `^8.23.0` | 8.23.0 | driver PostgreSQL (`database.js:6,16`) |
| `jsonwebtoken` | `^9.0.2` | 9.0.3 | JWT do operador, payload `{ userId }`, 30 dias (`middleware/auth.js`, `routes/auth.js:184,235`) |
| `bcryptjs` | `^2.4.3` | 2.4.3 | hash de senha (`database.js:5`, `routes/auth.js:4,72,231`) |
| `helmet` | `^7.2.0` | 7.2.0 | headers de segurança, sem CSP (`server.js:32`) |
| `express-rate-limit` | `^7.5.1` | 7.5.1 | anti-força-bruta (`server.js:37-69`) |
| `cors` | `^2.8.5` | 2.8.6 | liberado global sem restrição (`server.js:26`) |
| `cookie-parser` | `^1.4.7` | **UNMET local** (lockfile fixa 1.4.7) | cookie httpOnly da sessão do CRM (`server.js:29`) |
| `dotenv` | `^17.4.2` | 17.4.2 | carrega `.env` (`server.js:1`, `database.js:1`, `services/telegramBot.js:1`) |
| `axios` | `^1.19.0` | 1.20.0 | **só** Evolution API e self-ping do watchdog (`routes/crm.js:42`, `services/whatsappQueue.js:66`, `services/keepAliveWatchdog.js:46`); as 4 gateways Pix usam `fetch` nativo, exceto `services/cartpanda.js` que usa `https` |
| `socket.io` | `^4.8.3` | 4.8.3 | realtime do CRM (`server.js:15`) |
| `node-telegram-bot-api` | `^2.0.0` | 2.1.0 | bot (polling) de comunidade + alertas ao admin (`services/telegramBot.js`) |
| `node-cron` | `^4.6.0` | 4.6.0 | 4 agendamentos: drip horário (`server.js:233`), backup 04:00 (`services/backup.js:105`), grade de posts + rotação 5min (`services/telegramBot.js:393-421`) |
| `uuid` | `^14.0.2` | 14.0.2 | IDs de lead/mensagem do CRM (`services/crmDb.js:3,127,224`) |
| `@playwright/test` (dev) | `^1.63.0` | 1.63.0 | E2E de idioma |

Nada de e-mail/SMS/LLM/observabilidade no grafo de dependências. `crypto` é nativo do Node (hash de IP,
HMAC da sessão do CRM, invite codes).

## Configuration

**Como a config é carregada (importante para deploy):**
1. `require('dotenv').config()` roda em `server.js:1`, `database.js:1` e `services/telegramBot.js:1` —
   arquivos `.env` de desenvolvimento são carregados, mas em produção quem define é o painel do Render.
2. **Praticamente todo `process.env.*` é lido no topo do módulo** (ex.: `services/misticpay.js:6-8,30`,
   `services/asaas.js:6-11`, `services/syncpay.js:5-8`, `services/cartpanda.js:3-4`,
   `routes/wallet.js:175`, `middleware/auth.js:4`, `routes/admin.js:62`). Consequência: mudar env var exige
   **reiniciar o processo**, e `CARTPANDA_WEBHOOK_SECRET` é lido uma vez e congelado no boot.
3. Config de negócio **em banco**: `getSystemSettings()` (`database.js:1956-2035`) sobre a tabela
   `system_settings` (ou `db.systemSettings` no modo JSON), editável em `PUT /api/admin/settings`
   (`routes/admin.js:1411-1474`) e lida no painel `public/admin.html:2361,2384-2399`.
4. Config do CRM **em arquivo**: `crm_data.json` `settings` (`services/crmDb.js:8-18,70-76`), editável em
   `PUT /api/settings` do CRM (`routes/crm.js:455-463`), com segredos mascarados (`routes/crm.js:444-453`).
5. Sem auth, `GET /api/admin/public-settings` (`routes/admin.js:70-85`) expõe ao front
   `whatsappNumber`, `metaPixelId`, `tiktokPixelId`, `minDeposit`, `minWithdraw`, `withdrawFee`.

**Environment variables — nomes apenas (nenhum valor real neste documento).**

| Origem | Variáveis |
|---|---|
| `.env.example` (53 linhas) | `PORT`, `NODE_ENV`, `JWT_SECRET`, `ADMIN_KEY`, `APP_URL`, `DATABASE_URL`, `TELEGRAM_BOT_TOKEN`, `TELEGRAM_CHAT_ID`, `ADMIN_TELEGRAM_CHAT_ID`, `EVOLUTION_API_URL`, `GLOBAL_API_KEY`, `DEFAULT_INSTANCE`, `CARTPANDA_API_TOKEN`, `CARTPANDA_STORE_SLUG`, `ASAAS_ENV`, `ASAAS_API_KEY`, `ASAAS_WEBHOOK_TOKEN`, `MISTIC_PK`, `MISTIC_SK`, `SYNCPAY_CLIENT_ID`, `SYNCPAY_CLIENT_SECRET`, `SYNCPAY_WEBHOOK_TOKEN` |
| **Só no código** (ausentes do `.env.example`) | `ADMIN_PASSWORD` (alias de `ADMIN_KEY`, `routes/admin.js:62,65`), `CRM_SECRET` (segredo da sessão/ingestão do CRM, `services/crmSession.js:14`, `routes/crm.js:168`), `CARTPANDA_WEBHOOK_SECRET` (`routes/wallet.js:175,186`), `EVOLUTION_INSTANCE_TOKEN` (`routes/crm.js:116`), `DEFAULT_INVITE_CODE` (`routes/auth.js:46`), `MISTIC_BASE_URL` (`services/misticpay.js:8`), `MISTIC_TIMEOUT_MS` (`:30`), `SYNCPAY_BASE_URL` (`services/syncpay.js:8`), `ASAAS_BASE_URL` (`services/asaas.js:8`), `NEXUS_CRM_URL` (fallback de `routes/auth.js:165`, `routes/wallet.js:356`) |
| Ausentes **também** do `render.yaml` | `CRM_SECRET`, `CARTPANDA_WEBHOOK_SECRET`, `CARTPANDA_API_TOKEN`, `CARTPANDA_STORE_SLUG`, `EVOLUTION_INSTANCE_TOKEN`, `DEFAULT_INVITE_CODE`, `NEXUS_CRM_URL`, `MISTIC_BASE_URL`, `MISTIC_TIMEOUT_MS`, `SYNCPAY_BASE_URL`, `ASAAS_BASE_URL` |
| Guardas de produção (explodem no boot sem a var) | `JWT_SECRET` → `middleware/auth.js:7-9`; `ADMIN_KEY`/`ADMIN_PASSWORD` → `routes/admin.js:65-67`; segredo do CRM (`CRM_SECRET`\|`ADMIN_KEY`\|`ADMIN_PASSWORD`) → `routes/crm.js:16-18` |
| Fallbacks inseguros (só para dev) | `middleware/auth.js:4` (JWT), `routes/admin.js:62` (admin), `routes/auth.js:46` (invite padrão), `routes/crm.js:116` (token de instância Evolution) |

**Chaves em `system_settings`** (`database.js:1984-2004` / `:2015-2033`; default em `:1957-1978`):
`nexus_crm_url`, `whatsapp_number`, `meta_pixel_id`, `tiktok_pixel_id`, `gateway_order`, `gateway_disabled`,
`min_deposit`, `min_withdraw`, `withdraw_fee`, `signup_bonus`, `max_deposit_tx`, `max_deposit_day`,
`max_withdraw_tx`, `max_withdraw_day`, `new_account_grace_h`, `new_account_cap_7d`,
`global_daily_withdraw_cap`, `payouts_paused`, `deposits_paused`.
Defaults de negócio: depósito mín. 20, saque mín. 15, taxa 10%, bônus 5, drip 24 fatias/dia,
ordem de gateways `misticpay,syncpay,asaas,cartpanda` (`KNOWN_GATEWAYS`, `database.js:2038`).

**Chaves em `crm_data.json` settings** (`services/crmDb.js:8-18`): `evolutionApiUrl`, `globalApiKey`,
`defaultInstance`, `aiEnabled`, `aiModel`, `autoReplyNewLeads`, `welcomeMessageTemplate`, `webhookToken`,
`adminPassword`.

## Money-Moving Code Paths (app financeiro — mapa de risco)

Invariante do app: `balance = investBalance + earnBalance`; todo writer recalcula `balance` a partir dos dois
baldes, e existem incrementos atômicos (`balanceInc`, `investBalanceInc`, `earnBalanceInc`,
`totalDepositedInc`, `totalWithdrawnInc`) que geram `COALESCE(col,0) + $n` no SQL (`database.js:788-807`),
com equivalente arredondado a 2 casas no modo JSON (`:820-825`).

| Caminho | Efeito no dinheiro | Arquivo:linha |
|---|---|---|
| Webhook Cartpanda aprovado | **credita** `investBalance` + `balance` + `totalDeposited` | `routes/wallet.js:314-318` |
| Webhook Asaas aprovado | idem | `routes/wallet.js:431` |
| Webhook MisticPay confirmado (após reconfirmar na API) | idem | `routes/wallet.js:542` |
| Webhook SyncPay confirmado | idem | `routes/wallet.js:636` |
| Gotejamento de rendimento (24 fatias/dia) | **credita** `earnBalance` + `balance` | `services/settlementEngine.js:127` (e `:29` na liquidação diária) |
| Comissão multinível (até 5 níveis, 10% cada, só nível liberado pela patente) | **credita** `earnBalance` | `services/careerEngine.js:245-246` |
| Bônus de graduação de patente | **credita** `earnBalance` | `services/careerEngine.js:202-204` |
| Bônus de boas-vindas no cadastro | **credita** `earnBalance` | `routes/auth.js:110-125` |
| Check-in diário | **credita** `earnBalance` (R$ 0,10–0,89 aleatório) | `routes/wallet.js:861-873` |
| Cupom de bônus | **credita** `earnBalance` | `routes/wallet.js:908-926` |
| **Pedido de saque** | **debita só `earnBalance`** (recusa se valor > saldo de saque, `:762`), soma `totalWithdrawn`, cria tx `pending` | `routes/wallet.js:777-805` |
| Expiração de bônus (7 dias sem depósito) | **debita** `earnBalance` e grava `adjustment` negativo | `routes/wallet.js:688-721` |
| Contratação de frota (`POST /api/fleet/hire`) | **debita** `investBalance` **ou** `earnBalance` (nunca mistura, um balde só) | `routes/fleet.js:94-146` |
| Aprovar saque (`POST /api/admin/withdrawals/:id/approve`) | reserva atômica `pending→processing` e **chama payout externo** | `routes/admin.js:299-362` + `database.js:1287` |
| Rejeitar saque | **estorna** `earnBalance` + `balance` | `routes/admin.js:409-417` |
| Marcar pago na mão (`manual-paid`) | fecha como `approved` **sem** mover saldo nem chamar gateway | `routes/admin.js:366-391` |
| Ajuste manual de saldo | credita/debita balde escolhido + tx `ADJ` | `routes/admin.js:656-693` |
| Injetar depósito | credita `totalDeposited` + (auto-hire) debita contrato e paga comissão | `routes/admin.js:1110-1182` |
| Reprocessar/vincular webhook | credita `totalDeposited` e contrato | `routes/admin.js:936-1035`, `:1038-1107` |

**Único caminho que dispara payout externo:** `routes/admin.js:320-340`. SyncPay e Cartpanda têm sender
`() => null` (`routes/admin.js:322,324`); só MisticPay (`services/misticpay.js:188`) e Asaas
(`services/asaas.js:144`) saem com o Pix. Se `payout.success` vier `true`, o saque **nunca** volta para
`pending` mesmo sem `transferId` (proteção contra pagamento duplo, `routes/admin.js:335,356-361`) — e a
conferência real é por `POST /api/wallet/webhook/mistic` com `transactionType=RETIRADA` ou pelo botão
"Ver na Mistic" (`routes/admin.js:436-470`).

## Build & Platform Requirements

- `render.yaml` — web service `truckauto`, `env: node`, `plan: free`, `buildCommand: npm install`,
  `startCommand: node server.js`, `NODE_ENV=production` fixo, banco gerenciado `truckauto-db` injetado em
  `DATABASE_URL` via `fromDatabase` (`render.yaml:4-18,59-61`); demais env vars com `sync: false`.
- `git_sync.ps1` — sincronização manual com git (ambiente Windows).
- Limitações assumidas no código por ser plano free: `app.set('trust proxy', 1)` para o rate-limit ler o IP
  real (`server.js:24`), MemoryStore do rate-limit (instância única), self-ping de anti-sleep a cada 4 min
  contra `${APP_URL}/api/health` (`services/keepAliveWatchdog.js:22-26`), e handlers de
  `uncaughtException`/`unhandledRejection` que **só logam** e mantêm o processo vivo (`:32-38`).
- **Sem CI**: não existe `.github/workflows`. Os testes rodam local e manual.
- Estado do `node_modules` local em 2026-09-30: `cookie-parser` **não instalado** (UNMET) — `node server.js`
  falha com `MODULE_NOT_FOUND` até `npm install`. Todo o resto das 14 deps resolve.

---

*Stack analysis: 2026-09-30 (commit `3b38fa8`)*
*Update after major dependency changes*
