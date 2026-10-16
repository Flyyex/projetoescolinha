---
doc: integrations
last_mapped_commit: 3b38fa8
mapped_date: 2026-09-30
previous_mapped_commit: 4c16c6f
staleness_fixed: true
scope: root
---

# External Integrations

**Mapped commit:** `3b38fa8` | **Mapped date:** 2026-09-30 | **Supersedes:** `4c16c6f` (2026-09-29)

Inventário do que vive **fora** do código. Todos os segredos ficam em variáveis de ambiente (painel do
Render) ou em `system_settings` / `crm_data.json` — nenhum valor real aparece neste documento.

Novidades desta janela, que o mapa anterior não podia registrar:
1. **`services/crmSession.js`** (novo) — sessão assinada em cookie httpOnly que **tranca** o CRM.
2. **TikTok Pixel** (`public/tiktok-pixel-base.js` + `public/tiktok-pixel.js`, novos) com eventos `ttq`
   e atribuição pelo click-id **`ttp`**.
3. Marcação de `Purchase`/`AddPaymentInfo` **no servidor** (`transactions.ad_reported_at`).
4. Ingestão de lead do CRM (`POST /api/leads/webhook`) passou a exigir segredo próprio.

## Inventário rápido

| Serviço | Papel | Base URL / host | Auth |
|---|---|---|---|
| MisticPay | Pix cash-in **e** cash-out (saque) | `https://api.misticpay.com/api` | HTTP Basic `MISTIC_PK:MISTIC_SK` |
| SyncPay | Pix cash-in (só recebimento) | `https://api.syncpayments.com.br` | OAuth2 client_credentials → Bearer |
| Asaas | Pix cash-in + transferência Pix (saque) | `https://api.asaas.com/v3` / `https://sandbox.asaas.com/api/v3` | header `access_token` |
| Cartpanda Pay | Pix cash-in (+ checkout externo) | `api.cartpanda.com/v1/orders/pix` | `Authorization: Bearer` |
| Meta Pixel | Eventos de anúncio | `connect.facebook.net/en_US/fbevents.js` | ID do pixel (sem token) |
| TikTok Pixel | Eventos de anúncio | `analytics.tiktok.com/i18n/pixel/events.js` | ID do pixel (sem token) |
| Telegram Bot API | Community, alertas, backup CSV | `api.telegram.org` | token do bot |
| Evolution API | WhatsApp (Baileys) + CRM | auto-hospedada, URL configurável | header `apikey` |
| Nexus CRM | É o próprio app em `/crm` (auto-call HTTP) | `${nexusCrmUrl}` | header `x-crm-secret` (novo) |
| AI SDR | Classificador local por palavras-chave | — | nenhuma |
| CDNs | Fontes, ícones, Leaflet, flags, tiles | cdnjs / Google Fonts / flagcdn / ArcGIS | nenhuma |

## Pagamento Pix — 4 gateways com failover

Uma única rota de entrada escolhe a gateway: `POST /api/wallet/deposit/pix` (`routes/wallet.js:96-173`).
A ordem vem do admin (`getGatewayOrder()`, `database.js:2044-2052`; default
`misticpay,syncpay,asaas,cartpanda`, `database.js:1962`) menos as desabilitadas (`gateway_disabled`).
Cada tentativa que falha cai na próxima; se nenhuma responder: **HTTP 503** (`routes/wallet.js:147-162`).

### MisticPay — cash-in + cash-out
- Cliente próprio sobre `fetch` nativo: `services/misticpay.js`. Base `MISTIC_BASE_URL` (default
  `https://api.misticpay.com/api`).
- Auth: HTTP Basic com `MISTIC_PK`:`MISTIC_SK` (`:14-17`). Comentário no cabeçalho (`:4`) avisa que a auth
  legada `ci`/`cs` **morre em 30/09/2026** — prazo 1 dia após a data deste mapa.
- Habilitada quando `MISTIC_PK` e `MISTIC_SK` têm >5 chars (`isMisticEnabled`, `:10-12`).
- Endpoints: `POST /transactions/create` (depósito, `:63`), `POST /transactions/withdraw` (**payout de saque**, `:188`),
  `POST /transactions/check` (consulta/verificação server-side, `:211,235`). Timeout por
  `AbortSignal.timeout(MISTIC_TIMEOUT_MS)`, default 30s (`:30,39`).
- Restrição: exige **CPF de 11 dígitos** do pagador; CNPJ faz a tentativa cair para a próxima gateway (`:59-61`).
- Rotas que tocam: `POST /api/wallet/deposit/pix`; `POST /api/admin/withdrawals/:id/approve` (saque,
  `routes/admin.js:321`); `POST /api/admin/withdrawals/:id/check-gateway` (somente leitura, `routes/admin.js:446`);
  `GET /api/admin/gateways` (diagnóstico sem segredos, `routes/admin.js:124-135`).
- **Webhook sem assinatura do provedor** — o handler **reconfirma na API** (`/transactions/check`) e usa o
  **valor retornado pela API**, nunca o do corpo (`routes/wallet.js:507-520`). Também trata
  `transactionType=RETIRADA` para liquidar o saque ou, em `FALHA`/`CANCELADO`, devolver para `pending`
  com o saldo ainda reservado (`:454-495`).
- Sem config: ignorada silenciosamente no loop de depósito; o erro só aparece em log.

### SyncPay — cash-in apenas
- `services/syncpay.js`; base `SYNCPAY_BASE_URL` (default `https://api.syncpayments.com.br`).
- Auth: OAuth client_credentials em `POST /api/partner/v1/auth-token` com
  `SYNCPAY_CLIENT_ID`/`SYNCPAY_CLIENT_SECRET`; token cacheado em memória, renovado 60s antes do expiry (`:14-32`).
- Endpoint: `POST /api/partner/v1/cash-in`. Exige CPF (11), telefone (10/11) e e-mail do pagador (`:70-76`).
- Estado do saque: **não implementa payout** — sender `() => null` no approve do admin (`routes/admin.js:322`).
- Webhook: `POST /api/wallet/webhook/syncpay`. Token **opcional**: se `SYNCPAY_WEBHOOK_TOKEN` estiver vazio,
  a rota não valida nada (`routes/wallet.js:560-566`) — o ponto mais frágil da lista.
- Correlação de usuário em cascata: mapa em memória `identifier→userId` (`:50-62`), depois
  `pix_charges.identifier`, depois CPF, depois telefone extraído do e-mail, depois nome (`:591-626`).

### Asaas — cobrança Pix + transferência Pix
- `services/asaas.js`; base por `ASAAS_ENV`: `https://api.asaas.com/v3` (production) ou
  `https://sandbox.asaas.com/api/v3` (default sandbox, `:7-10`); `ASAAS_BASE_URL` sobrescreve.
- Auth: header `access_token: ASAAS_API_KEY`. Habilitada com chave >10 chars (`:13-15`).
- Endpoints: `GET /customers?email=`, `PUT/POST /customers`, `POST /payments` (`billingType: PIX`),
  `GET /payments/:id/pixQrCode`, `POST /transfers` (**payout de saque**, `:144`).
- Detecção do tipo de chave Pix em `detectPixKeyType`: `EVP`/`EMAIL`/`CNPJ`/`PHONE`/`CPF` (`:121-134`).
- Webhook: `POST /api/wallet/webhook/asaas`. Validação **obrigatória** por token (header `asaas-access-token`
  ou `?token=`) contra `ASAAS_WEBHOOK_TOKEN`; sem a var, tudo cai em 401 (`routes/wallet.js:394-401`).
  Aceita `PAYMENT_CONFIRMED`/`PAYMENT_RECEIVED` (`services/asaas.js:157-159`).
- `render.yaml:33-34` fixa `ASAAS_ENV=production` em produção.

### Cartpanda Pay — Pix + checkout externo
- `services/cartpanda.js` usa `https` nativo: `POST api.cartpanda.com/v1/orders/pix`.
- Auth: `Authorization: Bearer CARTPANDA_API_TOKEN`.
- **Sem token o serviço não falha: devolve um payload Pix BR Code falso** gerado localmente, com
  `provider: 'cartpanda_simulated'` e validade 900s (`:11-25`). É o único caminho que "sempre funciona" —
  e o único capaz de gerar um Pix que ninguém paga.
- `CARTPANDA_STORE_SLUG` é lido (`:4`) mas **não é usado** em nenhuma requisição.
- Webhook: `POST /api/wallet/webhook/cartpanda` + aliases. Exige `CARTPANDA_WEBHOOK_SECRET` com comparação
  exata, sem bypass; sem a var, tudo é 401 (`routes/wallet.js:178-189`).
- Diferença crítica vs. as outras: é o único webhook que **cria usuário sozinho** quando o pagamento veio de
  checkout externo sem cadastro prévio, com senha fixa `123` (`routes/wallet.js:266-285`) — mesma prática em
  `routes/admin.js:955-971` (reprocess) e `routes/admin.js:1116-1132` (inject-deposit).
- `checkoutUrl` nos produtos (default placeholder `https://SEU_GATEWAY.com/checkout/...`,
  `public/app.js:61`) é o link de checkout externo, editável em `/admin`.

### Nota sobre saques
O payout Pix é feito **somente** por MisticPay e Asaas, na ordem configurada, sobre o valor líquido
(bruto − taxa). Se ambas falharem, o saque volta para `pending` (`routes/admin.js:341-344`) — exceto quando
alguma gateway já retornou `success`, caso em que nunca reverte (`routes/admin.js:333-335,356-361`).
Reserva atômica antes do payout: `claimWithdrawal()` faz `UPDATE ... WHERE status='pending'` e retorna a
linha só para quem ganhou (`database.js:1287-1303`), impedindo pagamento duplo por clique duplo.

## Meta Pixel (Facebook)

- `fbevents.js` de `connect.facebook.net` carregado por snippet **inline** com stub síncrono (enfileira
  eventos) em `public/presell.html:2727-2741`, `public/login.html:581-595` e `public/index.html:970-981`.
- **O ID não vem de env**: vem da chave `meta_pixel_id` em `system_settings` (`database.js:1960,1987,2017`),
  editável em `PUT /api/admin/settings` (`routes/admin.js:1418`) e exposto **sem auth** em
  `GET /api/admin/public-settings` (`routes/admin.js:76`). Os 3 arquivos leem essa rota no boot.
- Eventos: `PageView` (boot das 3 telas), `CompleteRegistration` (`public/login.html:720-722`),
  `StartTrial` (`public/app.js:1127`), `InitiateCheckout` (`public/app.js:1321`),
  `Lead` (`public/app.js:2790,2810`, botões de WhatsApp), `Purchase` + `AddPaymentInfo`
  (`public/app.js:2019-2020`). Helper `trackPixel()` (`public/app.js:1805-1810`) retorna cedo se `fbq`
  não existir.
- Captação: `fbclid`, `utm_source/campaign/medium/content/term` são lidos no cadastro
  (`public/login.html:696-714`, persistidos como `tn_*` em `sessionStorage`+`localStorage` por
  `public/login.html:534-541`) e gravados no lead do CRM (`routes/auth.js:132-157`, `services/crmDb.js:141`).
  UTM também entra no analytics interno de page views (`server.js:88-90`).
- **Ingestão de leads do Meta Ads** — `GET/POST /api/leads/webhook` (`routes/crm.js:336-388`):
  - `GET`: verificação de assinatura do Meta (`hub.mode= subscribe` + `hub.verify_token` contra
    `settings.webhookToken` do `crm_data.json`); o `hub.challenge` é devolvido mesmo fora do modo
    subscribe (`:342-345`).
  - `POST`: **exige segredo próprio** — header `x-crm-secret` ou `?secret=` contra
    `CRM_SECRET|ADMIN_KEY|ADMIN_PASSWORD` (`routes/crm.js:22-36`). Sem isso, qualquer POST criava lead falso.
- Sem pixel configurado: nada inicializa e o app funciona normalmente.

## TikTok Pixel (novo nesta janela)

Três arquivos e uma chave de configuração. O objetivo declarado nos comentários é permitir **trocar de pixel
pelo painel admin sem novo deploy**.

1. **`public/tiktok-pixel-base.js`** (32 linhas) — recria o bloco oficial do TikTok verbatim
   (inclusive o `n.src` que faz o `events.js` carregar). Expõe `window.TikTokBase()` e monta o stub
   `window.ttq` com os métodos `page, track, identify, instances, debug, on, off, once, ready, alias,
   group, enableCookie, disableCookie, holdConsent, revokeConsent, grantConsent` (`:14`).
   O ID fixo do snippet foi trocado por parâmetro: `ttq.load(id)` injeta
   `https://analytics.tiktok.com/i18n/pixel/events.js?sdkid=<id>&lib=ttq` (`:22-29`).
2. **`public/tiktok-pixel.js`** (19 linhas) — chama `TikTokBase()` **de forma síncrona** (para que nenhum
   evento disparado antes do ID chegar se perca), depois busca `GET /api/admin/public-settings` com
   `credentials: 'include'` e, se vier `tiktokPixelId`, faz `ttq.load(id)` + `ttq.page()` (`:7-18`).
   Sem ID configurado, nada acontece.
3. Carregado nas 3 telas públicas: `public/index.html:925-927`, `public/login.html:522-524`,
   `public/presell.html:2743-2744`.
4. **Chave de config**: `tiktok_pixel_id` em `system_settings` → `settings.tiktokPixelId`
   (`database.js:1961,1988,2018`), editável no painel (`public/admin.html:1054-1055`, `2361`, `2384-2399`)
   e exposta em `GET /api/admin/public-settings` (`routes/admin.js:77`).

### Eventos `ttq`: nomes diferentes do Meta
O mapa de nomes está em `public/app.js:1768-1777` (`TIKTOK_EVENT_NAMES`), porque nome errado = evento
ignorado pelo TikTok e anúncio pago sem conversão:

| Evento interno (nome Meta) | Nome enviado ao TikTok (`ttq.track`) | Dispara em |
|---|---|---|
| `Purchase` | **`CompletePayment`** | `public/app.js:2019` |
| `StartTrial` | **`Subscribe`** | `public/app.js:1127` |
| `Lead` | **`SubmitForm`** | `public/app.js:2790`, `:2810` |
| `InitiateCheckout` | `InitiateCheckout` | `public/app.js:1321` |
| `AddPaymentInfo` | `AddPaymentInfo` | `public/app.js:2020` |
| `CompleteRegistration` | `CompleteRegistration` | mapeado, mas disparado só via `fbq` em `public/login.html:720` |
| `ViewContent` | `ViewContent` | mapeado, sem call site no app |
| `Contact` | `Contact` | mapeado, sem call site no app |

`trackTikTok()` (`public/app.js:1788-1797`) traduz o nome, injeta o `ttp` e chama `window.ttq.track`.
`trackBoth()` (`:1800-1803`) dispara **o mesmo evento nos dois canais** (Meta e TikTok) — é o ponto único
de saída. Tudo é `try/catch`: pixel nunca quebra o app.

### Click-id `ttp`: a atribuição do TikTok
`ttp` é o equivalente do `fbclid`; sem ele o TikTok não fecha a ligação clique→conversão.

- **Leitura no front**: `tiktokClickId()` (`public/app.js:1781-1786`) resolve nesta ordem
  `?ttp=` da URL → `localStorage['tn_ttp']` → `localStorage['tiktok_ttp']`.
- **Envio em todo evento**: `trackTikTok()` anexa `p.ttp = ttp` em **todos** os payloads (`:1793-1795`).
- **Captura no cadastro**: `public/login.html:705` lê `?ttp=` e envia no corpo de
  `POST /api/auth/register` (`public/login.html:714`); o backend persiste no lead:
  `routes/auth.js:12,133,155` → `services/crmDb.js:143` (`ttp` no lead) e também no lead já existente
  (`services/crmDb.js:114`).
- **Origem do lead**: em `routes/auth.js:136-139` o lead só é marcado `veioDeAnuncio` se tiver `fbclid`,
  **`ttp`**, `utm_content` ou `utm_term`; sem nenhum deles o lead é classificado como origem direta.
- **Lacuna real**: a lista de chaves persistidas em `public/login.html:534` **não inclui `ttp`**, então
  `tn_ttp` nunca é escrito por este repositório — a atribuição no app depende do `?ttp=` estar na URL da
  tela. (O mesmo padrão vale para o `fbclid`, que também só é persistido via a lista `tn_*`.)
- `GET /api/admin/leads-origin` (`routes/admin.js:143-190`) reconstrói a origem por lead, mas a heurística
  atual só considera `fbclid`, `utm_content` e `utm_term` (`:150-156`) — **`ttp` não entra nessa conta**.

### Marcação de `Purchase` no servidor (fim da inflação de eventos)
Problema documentado em `public/app.js:1992-1998`: com a lista de ids no `localStorage`, cada página
re-disparava tudo e o TikTok recebeu ~42 mil eventos para 39 depositantes.

- Coluna `transactions.ad_reported_at TIMESTAMPTZ` (`database.js:391`).
- `GET /api/wallet/purchases` → `getUnreportedDeposits()` (`database.js:1123-1138`): recargas
  `type= deposit AND status= approved AND ad_reported_at IS NULL`, limite 200.
- `POST /api/wallet/purchases/reported` (`routes/wallet.js:951-966`) → `markDepositsReported()`
  (`database.js:1141-1162`): marca apenas ids que pertencem **ao próprio usuário** (`wallet.js:956-958`).
- No browser: `reportNewDepositPurchases()` (`public/app.js:2002-2031`) chama, dispara
  `Purchase`/`AddPaymentInfo` com `event_id`/`eventID` estáveis (`dep_<id>`, `:2017-2018`) — o que
  permite Meta e TikTok descartarem duplicidade no lado deles — e só então confirma. Falha não marca:
  o evento sai uma única vez na próxima checagem.
- Chamadores: `updateSupportBadge()` a cada 30s, pulando aba escondida (`public/app.js:1212-1217` +
  `setInterval` em `:219`), `openHistoryModal()` (`:1986`) e `renderHomeRecentDeposits()` (`:2662`).

## Telegram Bot

- `services/telegramBot.js` (675 linhas) com `node-telegram-bot-api` + long polling
  (`bot.startPolling()` — **sem webhook**); `bot.catch()` para não derrubar o processo (`:25-27`).
- Auth: `TELEGRAM_BOT_TOKEN`. Destinos: `TELEGRAM_CHAT_ID` (grupo/community) e `ADMIN_TELEGRAM_CHAT_ID`
  (alertas privados do dono, também populável em runtime pelo comando `/admin`, `/alerta`, `/notificacoes`
  — `:73-87`;集合 em memória `adminChatIds`).
- Comandos: `/start`, `/frotas`, `/regras`/`/saques`, `/postar` + `callback_query:data`.
- Funções de notificação (todas chamadas com `.catch()`, nenhuma quebra fluxo financeiro):
  `notifyAdminWithdrawal` (`:468-538`), `notifyAdminDeposit` (`:543`), `notifyAdminSupportMessage` (`:589`,
  usada em `routes/support.js:69-70`), `notifyAdminSecurityAlert` (`:632`) e `broadcastDailySettlement` (`:433`).
- **Alerta de saque** (relevante para conciliação manual): inclui valor, chave Pix, txId, total depositado,
  nº de frotas ativas e **quanto a pessoa já sacou** — soma de `getApprovedWithdrawalsTotal()`
  (`database.js:1075-1098`, só status aprovados), com alerta "VALOR ALTO" acima de R$ 500
  (`services/telegramBot.js:478-495`). Se nenhum admin privado estiver registrado, cai para o chat do grupo.
- Agendamentos `node-cron` em `America/Sao_Paulo`: rotação aleatória a cada 5 min + 09:00, 12:30, 16:00,
  20:00 (`:383-421`); só iniciam se `TELEGRAM_CHAT_ID` existir (`:426-428`). Mídia vem de pastas
  `media/<slug>/` que **não existem no repositório** → na prática os posts saem em texto.
- Backup diário 04:00 (`services/backup.js:105`): monta CSV (usuários + contratos + leads,
  `services/backup.js:11-67`) e envia como documento via `https://api.telegram.org/bot<token>/sendDocument`
  (`:80`). Sem token/chat, gera localmente e não envia (`:72-75`).
- Sem config: `initTelegramBot()` retorna `null` com log "modo de espera" (`:16-19`).

## Evolution API (WhatsApp) + fila

- Cliente `axios` em `routes/crm.js` (`getEvoClient()`, timeout 10s, `:39-50`) e
  `services/whatsappQueue.js` (timeout 12s, fila com delay aleatório de 2–4s entre mensagens como
  proteção anti-ban, `:34-39`).
- Auth: header `apikey: GLOBAL_API_KEY`. Config em duas camadas — env (`EVOLUTION_API_URL`,
  `GLOBAL_API_KEY`, `DEFAULT_INSTANCE`, `EVOLUTION_INSTANCE_TOKEN`) **ou** `crm_data.json`
  (`settings.evolutionApiUrl` / `globalApiKey` / `defaultInstance`), editável pela tela de Settings do CRM.
  O **env tem precedência** (`routes/crm.js:41-45,52-55`; `services/whatsappQueue.js:47-49`).
- Endpoints Evolution usados: `GET /instance/fetchInstances`, `GET /instance/connect/:name` (QR e
  pareamento por número), `POST /instance/create` (cria a instância com integration `WHATSAPP-BAILEYS` em
  404, `routes/crm.js:112-119`), `POST /message/sendText/:inst` (`:194`, `whatsappQueue.js:74`).
- Webhook **inbound**: `POST /webhook/evolution` + aliases `/evolution/webhook`, `/api/webhook/evolution`
  (`server.js:159-162`, handler `routes/crm.js:231-331`). Eventos tratados: `messages.upsert`
  (`MESSAGES_UPSERT`), `qrcode.updated`, `connection.update`.
- **Sem verificação de assinatura no inbound**: aceita payload de qualquer origem que alcance a rota.
  JIDs `status@broadcast` e grupos (`@g.us`) são ignorados, mas qualquer POST válido cria lead e pode
  disparar resposta do bot.
- Comportamento no inbound: cria lead se desconhecido (tag `WhatsApp Orgânico`), grava mensagem, emite
  Socket.IO, e se `!fromMe` e o bot não estiver pausado chama o AI SDR (`:293-320`).
- Envio manual pelo CRM (`POST /api/whatsapp/send`, `:144-228`) aceita um bloco `<crm>{...}</crm>` no texto
  que atualiza estágio/temperatura/score/válor/tag do lead e é removido antes do envio (`:174-191`).
- Sem config: `POST /api/whatsapp/send` falha; a fila marca a mensagem com `status: 'error'` e segue
  (`services/whatsappQueue.js:51-62`).
- Também exposto ao front: `GET /api/whatsapp/status`, `POST /api/whatsapp/connect`.
- `GET /api/crm/health` (`:29`) é a única rota do CRM **sem** sessão (não devolve segredo nenhum).

## Nexus CRM — auto-chamada HTTP (o próprio app)

Não é um terceiro: é este mesmo servidor no path `/crm` (`server.js:178-180`), mas há chamadas HTTP de
saída para a URL pública.

- Config: chave `nexus_crm_url` em `system_settings` (`database.js:1985`), fallback `NEXUS_CRM_URL`
  (`routes/auth.js:165`, `routes/wallet.js:356`). Default = `${APP_URL}/crm` (`database.js:1958`).
- Chamadas `POST ${nexusCrmUrl}/api/leads/webhook`:
  - no cadastro (`routes/auth.js:169-181`) — envia nome, telefone, UTMs, `value: 30.00`, com header
    **`x-crm-secret`** (`:168,171`);
  - na confirmação de Pix Cartpanda (`routes/wallet.js:355-369`) — campanha
    `TruckAuto - <produto|Recarga Pix>`, `utm_source: cartpanda_checkout`, **sem** header de segredo
    (esse caminho quebra se `nexusCrmUrl` apontar para a própria rota com `leadIngestAuth` ativo).
- Sem config: `if (!crmUrl) return;` — silencioso, só `console.warn` em falha. Sem retry explícito.

## Sessão do CRM — `services/crmSession.js` (novo)

> Correção de nomenclatura: apesar do nome "session", **não existe tracking anônimo**. O módulo é a
> **autenticação do CRM**: cookie httpOnly assinado com HMAC, criado no login e verificado em toda chamada.

Motivo declarado no cabeçalho (`services/crmSession.js:1-7`): o login do CRM existia
(`POST /api/auth/login` sem telefone) mas devolvia um token que **ninguém validava** — a tela abria e a API
ficava aberta para a internet (leads em LGPD, senhas em `/settings`, conta de WhatsApp da empresa).

- **Formato do token**: `id.expiracao.assinatura` em hex (`:17-26`), com `id = crypto.randomBytes(24)`,
  TTL de **12h** (`TTL_MS`, `:11`).
- **Segredo**: `CRM_SECRET` → `ADMIN_KEY` → `ADMIN_PASSWORD` (`:13-15`). Sem segredo, `isValid()` retorna
  `false` para tudo (fail-safe explícito, `:30`).
- **Comparação**: HMAC-SHA256 com `crypto.timingSafeEqual` e guarda de tamanho (`:36-39`).
- **Cookie**: `truckauto_crm_session`, `httpOnly`, `sameSite: 'lax'`, `secure` só quando `NODE_ENV=production`,
  `maxAge = 12h` (`:10,42-49`).
- **Emissão**: `routes/auth.js:212-225` — login só com `password` (sem `phone`) compara com
  `ADMIN_KEY|ADMIN_PASSWORD` e chama `crmSession.setCookie(res)`. Sem segredo configurado, o login de
  senha nunca concede acesso.
- **Verificação**: `crmSession.middleware` (`:55-59`) como middleware global do router do CRM
  (`routes/crm.js:33-36`). **Única exceção**: `POST /api/leads/webhook`, que tem checagem própria
  (`leadIngestAuth`, `routes/crm.js:22-26`). `GET /api/crm/health` fica acima do middleware (`:29`).
- **Guarda de boot**: o router lança se `NODE_ENV=production` e não houver `CRM_KEY` (`routes/crm.js:16-18`).
- **Mascaramento de segredos no settings**: `GET/PUT /api/settings` trocam `globalApiKey`, `webhookToken`
  e `adminPassword` por `********`, e o PUT ignora o valor mascarado para não gravar o asterisco
  (`routes/crm.js:444-463`).
- **Por que cookie e não Bearer**: o bundle do CRM já faz `fetch` com `credentials: 'include'`, então o
  navegador envia o cookie sozinho — **não é preciso rebuildar o React**, cujo bundle é versionado em
  `public/crm/assets/`. É esse motivo que explica a entrada de `cookie-parser` em `package.json`
  (`server.js:29`).

## AI SDR Engine

- `services/aiSdrEngine.js` (158 linhas): classificador **local e determinístico** por palavras-chave,
  com normalização (minúsculas, sem acentos, sem pontuação). Nenhuma chamada a OpenAI/Anthropic/Google.
- 9 intenções: `human_transfer` (pausa o bot e emite `leads:human_requested`), `daily_checkin`,
  `affiliates_and_levels`, `fleets_pricing`, `withdrawals_pix`, `activation_and_registration`,
  `trust_and_company`, `greeting`, `contextual_help`. Cada uma pode mover o lead de estágio no funil
  (`:148-153`).
- Chamado de dentro do webhook inbound do WhatsApp (`routes/crm.js:295-319`); a resposta entra na
  `whatsappQueue`.
- `aiEnabled` e `aiModel` (`services/crmDb.js:12-13`) existem como campos default e **não são usados** em
  lugar nenhum do código.
- ⚠️ Inconsistência de conteúdo: as respostas do bot anunciam comissões de **15%/10%/5%** e tabela de preços
  própria (`services/aiSdrEngine.js:69,83`), enquanto o código real usa 10% por nível até N5 com
  progressão por patente (`services/careerEngine.js:10-70,238-246`) e preços de `database.js:24-112`.
  O bot também aponta `telegramUrl`/`instagramUrl` que estão **vazios** (`:10-11`).

## CDNs e assets externos (front, sem bundler)

- `cdnjs.cloudflare.com` — Font Awesome 6.4.0 (`index.html:22`, `login.html:20`), 6.5.1
  (`admin.html:12`, `presell.html:19`), Leaflet 1.9.4 CSS+JS (`index.html:25-26`), `qrcodejs` 1.0.0
  (`index.html:24`).
- `fonts.googleapis.com` / `fonts.gstatic.com` — Outfit, Plus Jakarta Sans, Space Grotesk, Figtree,
  Roboto Mono, JetBrains Mono.
- `flagcdn.com` — bandeiras dos 4 idiomas (`index.html:57,847-850`, `login.html:383,387-390`).
- `server.arcgisonline.com` — tiles do mapa de telemetria (ArcGIS World Dark Gray Base + Reference,
  `public/app.js:2345-2349`). **Não é Google Maps** — Google Maps não é usado em lugar nenhum.
- `connect.facebook.net` — `fbevents.js`; `analytics.tiktok.com` — `events.js` do TikTok.
- Imagem OG em domínio próprio: `https://www.SEU_DOMINIO.com.br/og-cover.jpg` (`index.html:15`, `presell.html:13`).
- Links `wa.me` / `chat.whatsapp.com` / `t.me` / `api.whatsapp.com` hardcoded no HTML: telefone
  `+55 SEU_NUMERO_WHATSAPP` (`presell.html:2474,2494,2714`, `index.html:471`, `login.html:509`,
  `public/app.js:2800`), grupo WhatsApp (`index.html:832`, `public/app.js:2786`), grupo Telegram
  `https://SEU_GRUPO_TELEGRAM` (`public/app.js:2817`). O número do admin vem de `whatsapp_number`
  (`system_settings`), com fallback nos números hardcoded.
- Consequência: se qualquer CDN cair, ícones/mapa/QR/bandeiras quebram — e o helmet está com **CSP
  desligado** (`server.js:32`), então não há rede de proteção.

### Integração interna que também é HTTP de saída
- `services/keepAliveWatchdog.js` — self-ping em `${APP_URL}/api/health` a cada 4 min (`:22-26,43-51`),
  para evitar o cold start do plano free do Render, + handlers de exceção que só logam (`:32-38`).
  Alvo: `GET /api/health` (`server.js:166-168`).

### E-mail / SMS
**Ausentes.** Sem SDK de e-mail e sem SMS em `package.json`, `routes/` ou `services/`. O canal de suporte
é interno: tabelas `support_threads`/`support_messages` + notificação ao admin via Telegram.
Nenhuma notificação por e-mail é enviada.

## Data Storage

- **PostgreSQL** (Render `truckauto-db`, ou Supabase/Neon via `DATABASE_URL`) — modo de produção; sem ORM e
  sem migrations em arquivo (schema no boot, `database.js:220-407`).
- **`data.json`** — fallback automático quando `DATABASE_URL` está vazio; arquivo único reescrito inteiro
  a cada escrita (`database.js:200-215`).
- **`crm_data.json`** — store exclusivo do CRM, sempre em disco via `fs` sync
  (`services/crmDb.js:5,47-67`), gitignored (`.gitignore:6`). Leads carregam `fbclid` e `ttp`
  (`:141-143`).
- Sem storage de arquivos externo; único binário versionado é `public/support-alert.mp3`.
- Cache só em memória de processo: token da SyncPay (`services/syncpay.js:14-32`), mapa
  `identifier→user` da SyncPay (`:50`), fila do WhatsApp (`services/whatsappQueue.js`), dicionários i18n
  no browser (`public/i18n.js:37`).
- Service worker (`public/sw.js`) não faz cache real: no `activate` apaga todos os caches e no `fetch` faz
  rede-primeiro.

## Authentication & Identity

- **JWT próprio, sem provedor externo**: `jsonwebtoken`, payload `{ userId }`, expiração **30 dias**
  (`routes/auth.js:184,235`); `authMiddleware` em `middleware/auth.js:11-31`. Segredo `JWT_SECRET`,
  fallback hardcoded em `middleware/auth.js:4` que **lança no boot** se `NODE_ENV=production` sem a var.
  Token no `localStorage` (`truckauto_token`), enviado como `Authorization: Bearer`.
- **Senhas**: `bcryptjs` (hash 10). Login por telefone (DDD + número, validação em `routes/auth.js:26-38`);
  `GET /api/auth/me` devolve perfil e saldos.
- **Admin**: chave estática comparada com `===` no header `x-admin-key` (ou `Bearer`), **sem JWT e sem
  sessão** (`routes/admin.js:110-121`); fallback `'dev_apenas_adminkey_insegura'` que também explode em
  produção sem a var (`:62,65-67`). Chave errada dispara alerta no Telegram, com throttle de 5 min (`:88-105`).
- **CRM**: cookie httpOnly assinado, 12h — ver seção dedicada acima.
- **Idioma**: `truckauto_lang` no `localStorage`, com detecção por `navigator.language` (`public/i18n.js:35-42`).
- **Anti-força-bruta**: 100/15min por IP (login e verify admin), 10/15min por telefone (ignorando sucesso),
  60 cadastros/hora por IP (`server.js:37-69`).
- **Anti-farm**: hash do IP de cadastro (`sha256(ip + '_truckauto_salt')` truncado, `routes/auth.js:61-67`);
  a partir da 4ª conta em 24h no mesmo IP o usuário é marcado `crm_status = 'suspeito'` e o dono é
  avisado no Telegram (`routes/auth.js:89-106`).
- **OAuth**: ausente — não existe botão de login Meta/Facebook em `public/login.html` (a única referência
  a Facebook na tela é o snippet do `fbevents.js`, `public/login.html:581-588`); nenhuma rota `facebook` no backend.
- Sem recuperação de senha, troca de e-mail ou confirmação por e-mail.

## Monitoring & Observability

- Nenhum Sentry/Datadog/PM2. Erros só em `console.error` com prefixo por subsistema
  (`[WALLET ERROR]`, `[ASAAS]`, `[MISTIC]`, `[SYNCPAY]`, `[CARTPANDA]`, `[TELEGRAM BOT ERROR]`,
  `[BACKUP ERROR]`, `[DATABASE]`, `[ANALYTICS ERROR]`, `[WATCHDOG CRITICAL SHIELD]`, `[SECURITY ALERT]`).
- **Analytics é interno**: tabela `page_views`, alimentada por middleware global (`server.js:72-112`) que
  grava cada GET de página, ignorando assets estáticos, rotas `/api/*` e `/webhook`, e filtrando search
  bots (googlebot/bingbot/yandex/duckduckbot). IP nunca vai em claro:
  `sha256(clientIp + '_truckauto_salt').slice(0,16)` (`server.js:84`). Lido em `GET /api/admin/analytics` e
  `GET /api/admin/leads-origin`.
- Auditoria de pagamentos: tabela `webhook_logs` com payload bruto, provider, status
  (`processed`/`ignored`/`user_not_found`/`failed`) e nota. O painel admin lista (`routes/admin.js:916`)
  e pode reprocessar (`:936`) ou vincular a um usuário (`:1038`) — ambos **recusam** logs de saque para
  não creditar valor indevido (`:942-944`, `:1050-1052`).
- **Health**: `GET /api/health` → `{ status, service, timestamp }` (`server.js:166-168`).
- Só stdout: no Render isso significa os logs da plataforma.

## CI/CD & Deployment

- **Render.com** — web service `truckauto`, `plan: free`, `npm install` + `node server.js`, `NODE_ENV=production`
  fixo (`render.yaml:4-13`); banco gerenciado `truckauto-db` injetado em `DATABASE_URL` (`:15-18,59-61`).
  Todas as demais env vars com `sync: false` — valores reais digitados no painel.
- **Sem CI**: não existe `.github/workflows`. Testes rodam local e manual
  (`node --test "tests/*.test.js"`, `npx playwright test`).
- Sem redundância: um único Postgres free, sem réplica, sem backup do banco. O "backup" do sistema é um CSV
  textual enviado ao Telegram — útil para auditoria, **não é restauração**.

## Webhooks & Callbacks

**Incoming:**

| Serviço | Endpoint (com aliases) | Verificação | Eventos tratados |
|---|---|---|---|
| MisticPay | `POST /api/wallet/webhook/mistic` (+ `/webhook/mistic`, `/mistic/webhook`, `server.js:152-155`) | **Nenhuma assinatura** — reconfirma em `/transactions/check` e usa o valor da API | `DEPOSITO` + `COMPLETO/COMPLETA/PAID/APPROVED`; `RETIRADA` liquidada ou falha → volta a `pending` |
| SyncPay | `POST /api/wallet/webhook/syncpay` | `Bearer` ou `?token=` vs `SYNCPAY_WEBHOOK_TOKEN` — **só se a var estiver setada** | `completed`/`paid`/`approved` |
| Asaas | `POST /api/wallet/webhook/asaas` | `asaas-access-token` ou `?token=` vs `ASAAS_WEBHOOK_TOKEN` — obrigatória, senão 401 | `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED` |
| Cartpanda | `POST /api/wallet/webhook/cartpanda` (+ `/api/webhook/cartpanda`, `/cartpanda/webhook`, `server.js:148-151`) | token em query ou 4 headers vs `CARTPANDA_WEBHOOK_SECRET` — obrigatória, senão 401 | status `paid`/`completed`/`approved`/`authorized`/`succeeded` (flexível, `routes/wallet.js:236`) |
| Evolution API | `POST /webhook/evolution` (+ `/evolution/webhook`, `/api/webhook/evolution`, `server.js:159-162`) | **Nenhuma** | `messages.upsert`, `qrcode.updated`, `connection.update` |
| Meta Ads (leads) | `POST /api/leads/webhook` | **Segredo obrigatório** `x-crm-secret`/`?secret=` (NOVO nesta janela, `routes/crm.js:22-26`) | payload de lead solto; `GET` valida `hub.verify_token` |
| Aliases | `server.js:148-162` reescreve `req.url` antes de delegar ao router, para que qualquer variação de URL cadastrada no painel do provedor funcione | — | — |

Regras comuns aos webhooks de Pix: **idempotência** por `txId` já persistido (`CP-<id>`, `ASAAS-<id>`,
`MISTIC-<id>`, `SYNC-<id>` — `routes/wallet.js:304-311,426-430,503-506,631-635`), com `500` de volta
quando a verificação server-side falha para o provedor reenviar (`routes/wallet.js:513`);
correlação de usuário por `pix_charges.identifier` e, como fallback, por CPF/telefone/nome; auditoria em
`webhook_logs`; saída no funil do CRM via `crmDb.moveLeadByPhone` (para `proposta` ao gerar o QR,
`routes/wallet.js:167`; para `ganho` ao confirmar, `:344,436,545,643`).

**Outgoing:**
- `POST ${nexusCrmUrl}/api/leads/webhook` no cadastro (`routes/auth.js:169`, com `x-crm-secret`) e na
  confirmação de Pix Cartpanda (`routes/wallet.js:358`, sem segredo).
- `POST ${APP_URL}/api/health` a cada 4 min pelo watchdog.
- Nenhum outro webhook de saída. Nenhuma integração com Stripe, Mercado Pago, PagSeguro, S3, e-mail, SMS
  ou analytics genérico.

---

*Integration audit: 2026-09-30 (commit `3b38fa8`)*
*Update when adding/removing external services*
