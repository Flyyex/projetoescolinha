---
doc: structure
last_mapped_commit: 3b38fa8
mapped_date: 2026-09-30
previous_mapped_commit: 4c16c6f
staleness_fixed: true
scope: root
---

# Codebase Structure

**Mapped commit:** `3b38fa8` | **Mapped date:** 2026-09-30 | **Supersedes:** `4c16c6f` (2026-09-29)

Contagens de linhas obtidas com `[System.IO.File]::ReadAllLines(path).Count` (linhas fisicas, incluindo linhas em branco). Node files usam LF; a contagem pode diferir em 1 das exibidas por editores com BOM.

## Layout de Diretorios

```
ProjetoEscola/
├── .planning/                 # Documentacao canonica de planejamento (GSD)
│   ├── config.json            # Config do GSD
│   ├── PROJECT.md             # Visao do produto
│   ├── REQUIREMENTS.md        # Requisitos
│   ├── ROADMAP.md             # Roadmap
│   ├── STATE.md               # Estado do trabalho
│   └── codebase/              # ESTES docs: ARCHITECTURE, STRUCTURE, STACK,
│                              #   INTEGRATIONS, CONVENTIONS, TESTING, CONCERNS
├── .superpowers/              # Ledger de SDD (briefs, reports, reviews) — ignorado pelo git
├── crm_frontend_src/          # FONTE React do CRM (nao e servida; build gera public/crm/)
│   ├── components/            # 2 modais
│   └── views/                 # 6 telas
├── docs/                      # Planos e specs de produto/engenharia
│   └── superpowers/
│       ├── plans/             # Planos de execucao
│       └── specs/             # Specs de design
├── e2e/                       # Testes end-to-end (Playwright)
├── middleware/                # Middleware de autenticacao (JWT do operador)
├── routes/                    # 7 roteadores HTTP por dominio
├── services/                  # 14 servicos: dominio, gateways Pix, integracoes, jobs
├── tests/                     # Testes unitarios (node:test)
├── test-results/              # Artefato do Playwright (ignorado)
├── public/                    # Frontend estatico servido pelo Express
│   ├── crm/                   # BUILD do CRM React (gerado; committado)
│   ├── i18n/                  # 4 dicionarios de traducao (JSON)
│   ├── images/                # 23 fotos de catalogo e campanha
│   ├── admin.html             # Painel master (2962 linhas; script inline)
│   ├── app.js                 # SPA do operador (2833 linhas)
│   ├── index.html             # Markup do app do operador
│   ├── login.html             # Terminal de autenticacao + cadastro
│   ├── presell.html           # Landing / presell oficial
│   ├── tiktok-pixel.js        # BOOT do pixel do TikTok (19 linhas)
│   ├── tiktok-pixel-base.js   # Stub sincrono do TikTok Pixel (32 linhas)
│   ├── style.css              # Estilos do app (2545 linhas)
│   └── i18n.js, i18n-data.js, admin-filters.js, sw.js, manifest.json
├── node_modules/              # Dependencias (IGNORAR)
├── server.js                  # Bootstrap: middlewares, rotas, jobs, socket.io
├── database.js                # DAL unificada (Postgres OU data.json)
├── data.json                  # Banco local em arquivo (fallback sem DATABASE_URL)
├── package.json               # Manifesto e dependencias do backend
├── crm_package.json           # Manifesto do projeto React do CRM (build separado)
├── crm_index.html             # Template HTML do build do CRM (Vite)
├── playwright.config.js       # Playwright (testDir ./e2e, porta 3100)
├── render.yaml                # Blueprint de deploy no Render
├── .env.example               # Inventario de variaveis de ambiente
├── .gitignore                 # Exclusoes (data.json, crm_data.json, .env, .superpowers/)
├── git_sync.ps1               # Script PowerShell de sincronizacao git
├── README.md                  # Instrucoes de rodar e deploy
├── plano-antifraude-bonus-R5.md      # Nota de projeto: anti-fraude de bonus
└── plano-limites-nativos-fase2.md    # Nota de projeto: limites nativos
```

## Proposito dos Diretorios

**`middleware/`**
- **Proposito:** autenticacao do operador por JWT, aplicado como middleware Express.
- **Contem:** 1 arquivo JS (34 linhas).
- **Arquivos-chave:** `auth.js` — `authMiddleware` (`:11-31`), `JWT_SECRET` (`:4`), throw em producao sem segredo (`:7-9`).
- **Subdiretorios:** nenhum.
- **Nao pertence aqui:** rotas, acesso a dados, validacao de CPF/chave Pix ou logica de gateway. A sessao do CRM **nao** mora aqui — ver `services/crmSession.js`.

**`routes/`**
- **Proposito:** receber requisicoes HTTP, validar entrada, orquestrar `database.js` + `services/` e formatar a resposta. Agrupa por dominio de negocio.
- **Contem:** 7 arquivos JS, todos exportando um `express.Router()`, **exceto** `crm.js`, que e uma **factory** que recebe `io`.
- **Arquivos-chave:**
  - `wallet.js` (979) — resumo da carteira, geracao de Pix, os 4 webhooks de gateway, saque, check-in, cupom, extrato, recargas para o pixel. O arquivo mais critico do sistema.
  - `admin.js` (1476) — painel master inteiro, 43 rotas; unico arquivo com `router.use(adminAuthMiddleware)` (`:121`).
  - `crm.js` (525) — WhatsApp/Evolution, funil de leads, automacoes, analytics, exports CSV; router factory (`:5`), agora com sessao obrigatoria (`:33-36`).
  - `auth.js` (276) — cadastro, login (operador **e** CRM), `/me`; emite o JWT e o cookie do CRM.
  - `fleet.js` (206) — catalogo, meus contratos, contratacao com carencia de 30 dias.
  - `team.js` (112) — overview de rede e plano de carreira.
  - `support.js` (84) — chat de suporte do usuario.
- **Subdiretorios:** nenhum.
- **Nao pertence aqui:** SQL, DDL, e o catalogo de produtos (que vive em `database.js:24-157`).

**`services/`**
- **Proposito:** regras de dominio e integracoes externas, carregados como modulos singleton sem instanciacao.
- **Contem:** **14 arquivos JS** (era 13 ate o commit `57afb4f`), em cinco grupos:
  - *Gateways Pix (4):* `misticpay.js` (265), `asaas.js` (170), `syncpay.js` (118), `cartpanda.js` (95).
  - *Dominio (4):* `careerEngine.js` (277), `settlementEngine.js` (211), `limits.js` (145), `aiSdrEngine.js` (158).
  - *Infra/Operacao (4):* `telegramBot.js` (675), `backup.js` (111), `keepAliveWatchdog.js` (55), `whatsappQueue.js` (96).
  - *Seguranca do CRM (1) — NOVO:* `crmSession.js` (61).
  - *Store do CRM (1):* `crmDb.js` (313) — persiste em `crm_data.json` (raiz), **fora** do dual-store de `database.js`.
- **Arquivos-chave:**
  - `crmSession.js` — sessao do CRM por cookie HMAC. Ver secao dedicada abaixo.
  - `limits.js` — unico servico 100% puro e testado, sem I/O.
  - `settlementEngine.js` — gotejamento: `processDripSlice` (`:185`), regras de dia em `:86-118`.
  - `careerEngine.js` — tabela de patentes em `:9-76`, distribuidor de comissoes em `:227`.
- **Subdiretorios:** nenhum.
- **Nao pertence aqui:** definicao de rotas Express e DDL/mappers — o DDL esta em `database.js:245-412`, nao aqui.

**`public/`**
- **Proposito:** tudo que e servido como arquivo estatico pelo Express (`server.js:131-136`) e as paginas montadas por rota (`server.js:173-208`).
- **Contem:**
  - Paginas: `admin.html` (2962), `presell.html` (2746), `index.html` (990), `login.html` (772), `privacidade.html` (57), `termos.html` (74).
  - Scripts do app: `app.js` (2833), `admin-filters.js` (80), `i18n.js` (98), `i18n-data.js` (35), `sw.js` (27).
  - Pixel de anuncios: `tiktok-pixel-base.js` (32), `tiktok-pixel.js` (19) — **NOVOS** no commit `8a7007c`.
  - Estilos: `style.css` (2545).
  - Dicionarios: `i18n/pt.json`, `i18n/es.json`, `i18n/en.json`, `i18n/zh.json` (451 cada, alinhados).
  - PWA: `manifest.json` (32), `icon-192.png`, `icon-512.png`, `apple-touch-icon.png`, `favicon.ico`, `support-alert.mp3`, `og-cover.jpg`.
  - Midia: `images/` (23 arquivos).
  - `crm/` — **build** do CRM (ver "Diretorios Especiais").
- **Arquivos-chave:**
  - `app.js` — `appState` em `:35-152`, `apiRequest` em `:225-249`, dispatcher de render `renderVisibleTab` em `:194-202`, listener `truckauto:lang` em `:177`, `calcCooldown` (carencia de frota) em `:366-385`, `reportNewDepositPurchases` em `:2002-2031`.
  - `admin.html` — script inline monolito; `AF()` em `:1478-1479`, `adminFetch` com `x-admin-key`, tabela de origem de leads em `:999-1023`.
  - `tiktok-pixel-base.js` / `tiktok-pixel.js` — ver secao dedicada abaixo.
- **Subdiretorios:** `crm/`, `i18n/`, `images/`.
- **Nao pertence aqui:** codigo de servidor, segredos, e o *source* do CRM React (que e `crm_frontend_src/`).

**`crm_frontend_src/`** — SOURCE, nao build
- **Proposito:** codigo-fonte React (JSX) do CRM Nexus; **nao e servido pelo Express e nao e lido em runtime**.
- **Contem:** 11 arquivos JSX/CSS.
- **Arquivos-chave:** `App.jsx` (628) — shell, estado global do CRM, login (`/api/auth/login` em `:119`) e as chamadas a API; `views/LiveChatView.jsx` (467), `views/AutomationsView.jsx` (304), `views/WebhooksHubView.jsx` (249), `views/KanbanView.jsx` (222), `views/SettingsView.jsx` (219), `views/AnalyticsView.jsx` (213), `components/WhatsAppModal.jsx` (253), `components/NewLeadModal.jsx` (140), `index.css` (82), `main.jsx` (10).
- **Subdiretorios:** `views/` (6 telas), `components/` (2 modais).
- **Nao pertence aqui:** o bundle compilado (vai para `public/crm/`) e qualquer chamada a `database.js` (o CRM conversa so com as rotas `/api/*` expostas por `routes/crm.js`).
- **Cuidado:** `crm_package.json:4,6,8` referencia `server/index.js` e `crm_package.json:7` chama `vite build`, mas **nao existe `vite.config.js`, `tailwind.config` nem `server/` no repo**. O build do CRM **nao e reproduzivel** a partir deste repositorio; `public/crm/assets/` e o artefato committed.

**`e2e/`**
- **Proposito:** testes de navegador Playwright contra o servidor real.
- **Contem:** `lang.spec.js` (69) — 4 testes funcionais de troca de idioma + 8 testes de "sweep" de chave i18n vazada em `/login` e `/app` (gerados pelo loop em `:52-68`, 4 idiomas x 2 telas).
- **Nao pertence aqui:** mocks de API — o app sobe de verdade via `playwright.config.js`.

**`tests/`**
- **Proposito:** testes unitarios com o runner nativo do Node (`node --test`), sem dependencias.
- **Contem:** 4 arquivos, 407 linhas no total.
- **Arquivos-chave:** `limits.test.js` (211), `admin-filters.test.js` (119), `i18n.test.js` (40), `i18n-data.test.js` (37).
- **Alvo:** so modulos UMD ou puros — `services/limits.js`, `public/admin-filters.js`, `public/i18n.js`, `public/i18n-data.js`.
- **Nao pertence aqui:** testes que exigem banco, rede ou processo HTTP (nao ha suite para `database.js`, `routes/*`, gateways, nem para `services/crmSession.js`).

**`docs/`**
- **Proposito:** documentos de planejamento e spec.
- **Contem:** `superpowers/plans/2026-09-29-i18n-app-operador.md` (449), `superpowers/specs/2026-09-29-i18n-app-operador-design.md` (70).
- **Nao pertence aqui:** documentacao tecnica da API (nao existe) e notas de projeto soltas, que ficaram na raiz.

**`.planning/`**
- **Proposito:** documentos canonicos do planejamento GSD.
- **Contem:** `PROJECT.md`, `REQUIREMENTS.md`, `ROADMAP.md`, `STATE.md`, `config.json`, e `codebase/` com os 7 documentos de mapa.
- **Nao pertence aqui:** scratch ou notas de sessao.

**`.superpowers/`**
- **Proposito:** ledger de SDD (briefs, task reports e packages de review) da feature de i18n.
- **Contem:** ~23 arquivos MD em `.superpowers/sdd/2026-09-29-i18n-app-operador/`.
- Ignorado pelo git (`.gitignore`).

**`test-results/`**
- **Proposito:** saida do Playwright. Contem apenas `.last-run.json`.
- Ignorado pelo git (`.gitignore`).

**`node_modules/`**
- **Proposito:** dependencias instaladas. **Ignorar por completo** em qualquer analise, contagem ou varredura.

## Diretorios Especiais

**`services/crmSession.js`** — NOVO em `57afb4f` (arquivo unico, 61 linhas)
- **Proposito:** fechar o CRM, que aceitava qualquer chamada e devolvia um token que ninguem validava. Assina a sessao em um cookie `httpOnly`.
- **Estrutura:**
  | Simbolo | Linha | Papel |
  |---|---|---|
  | `COOKIE_NAME` | `:10` | `'truckauto_crm_session'` |
  | `TTL_MS` | `:11` | 12 horas |
  | `secret()` | `:13-15` | resolve `CRM_SECRET \|\| ADMIN_KEY \|\| ADMIN_PASSWORD` |
  | `sign(id, exp)` | `:17-19` | HMAC-SHA256 de `id.exp` |
  | `make()` | `:22-26` | gera `id.exp.sig` |
  | `isValid(value)` | `:28-40` | confere formato, expiracao e assinatura com `timingSafeEqual`; **fail-secure** sem segredo (`:30`) |
  | `setCookie(res)` | `:42-49` | `httpOnly` + `sameSite: 'lax'` + `secure` em producao |
  | `clearCookie(res)` | `:51-53` | exportado, **nunca chamado** (nao ha rota de logout) |
  | `middleware` | `:55-59` | 401 JSON se a cookie nao valida |
- **Consumidores:** `routes/auth.js:218` (emite) e `routes/crm.js:13-36` (verifica).
- **Contrapartida no painel:** `routes/crm.js:444-453` (`safeSettings`) mascara `globalApiKey`/`webhookToken` com `'********'` e zera `adminPassword`; o `PUT` ignora os campos mascarados (`:456-460`).
- **Nao pertence aqui:** rotas, acesso a lead ou `database.js`. E um modulo de **autenticacao**, sem I/O e sem estado.

**`public/tiktok-pixel.js` + `public/tiktok-pixel-base.js`** — NOVOS em `8a7007c`
- **Proposito:** pixel do TikTok com ID configuravel pelo admin, sem novo deploy.
- **Dois arquivos porque o bundle oficial nao esta no repo:**
  - `tiktok-pixel-base.js` (32) — define `window.TikTokBase` (`:8`), o **stub** reescrito a mao a partir do codigo do Gerenciador de Eventos. Mantem a estrutura exata, **incluindo `n.src`** (`:26`), que e o que faz `events.js` carregar de verdade. O stub e criado de forma **sincrona** (`:7` em `tiktok-pixel.js`) para nenhum evento se perder.
  - `tiktok-pixel.js` (19) — IIFE que chama o stub (`:7`), busca `GET /api/admin/public-settings` (`:11`), e so entao faz `ttq.load(id)` + `ttq.page()` (`:15-16`). Tudo em `try/catch` (`:13-17`).
- **Carregados** em `public/presell.html:2743-2744`, `public/login.html:523-524` e `public/index.html:926-927` — as 3 telas publicas. **Nao** estao no admin.
- **Par no cliente:** `public/app.js:1768-1777` (mapa de nomes Meta → TikTok) e `public/app.js:1788-1797` (`trackTikTok`, anexa o `ttp`).
- **Servidor:** `GET /api/admin/public-settings` (`routes/admin.js:70-85`) expoe `tiktokPixelId`; persistido em `system_settings.tiktok_pixel_id` (`database.js:1988`, `:2018`, escrita em `routes/admin.js:1419`); campo no painel em `public/admin.html:1054-1055`.
- **Nao pertence aqui:** o bundle `events.js` do TikTok (nao esta no repo) nem os IDs hardcoded — o ID vem sempre do banco.

**`public/crm/`** — BUILD GERADO (nao e source)
- **Proposito:** bundle do CRM React servido em `/crm` pelo Express.
- **Conteudo:** `index.html` (23) + `assets/index-B9Ccm2A2.js` (~707 KB, minificado) + `assets/index-B03ZFj7a.css` (~58 KB).
- **Source:** `crm_frontend_src/`, compilado por Vite com o manifesto `crm_package.json`. O `crm_index.html` (15) na raiz e o template do build.
- **Committed:** **Sim.** A linha que ignoraria `public/crm/assets/` esta comentada no `.gitignore`. Consequencia: o hash no nome do arquivo muda a cada build e o bundle antigo so some por remocao manual.
- **Regra: edite sempre em `crm_frontend_src/`, nunca em `public/crm/`.**

**`crm_frontend_src/`** — SOURCE (nao e servido)
- Nao e exposto pelo Express e nao e importado pelo backend; so entra no bundle via build.
- Regra: espelha o runtime em `/crm` consumindo as rotas de `routes/crm.js` via `/api/*` e socket.io; nao importa nada de `database.js` nem de `services/`.

**`node_modules/`** — IGNORAR
Dependencias instaladas a partir de `package.json`. Nao versionado. Nao deve aparecer em nenhuma contagem ou analise.

**`data.json`** — banco de dados no working tree
Fallback em arquivo usado quando `DATABASE_URL` nao esta definida (`database.js:9-12`, `:200-215`). Listado no `.gitignore` mas existe no diretorio de trabalho (1075 linhas, com o catalogo de produtos semeado). No modo arquivo nao ha transacao nem lock: cada escrita reescreve o arquivo inteiro.

**`crm_data.json`** — store do CRM
Criado em runtime por `services/crmDb.js:5` (na raiz do projeto, nao em `database.js`). Listado no `.gitignore`; nao existe no diretorio de trabalho (criado no primeiro uso).

**`.superpowers/`** — ledger de trabalho
Briefs, relatorios e packages de review da feature de i18n. Ignorado pelo git; nao e fonte nem documentacao do produto.

**`test-results/`** — artefato de teste
Saida do Playwright. Ignorado.

## Localizacoes de Arquivos-chave

**Entry Points:**
- `server.js` (246) — unico entry point de processo; bootstrap, middlewares, rotas e jobs. `startServer()` chamada em `:245`.
- `public/index.html` (990) + `public/app.js` (2833) — entry point do app do operador (SPA sem build).
- `public/login.html` (772) — entry point de autenticacao **e** cadastro (e o unico que captura `fbclid`/`ttp`).
- `public/admin.html` (2962) — entry point do painel master.
- `public/presell.html` (2746) — entry point da landing/presell.
- `public/crm/index.html` (23) — entry point do CRM **buildado**.
- `crm_frontend_src/main.jsx` (10) — entry point do CRM em desenvolvimento (build only).
- `playwright.config.js` (5) — entry point dos e2e; sobe `node server.js` na porta 3100.

**Configuracao:**
- `package.json` (31) — manifesto e dependencias do backend; `main: server.js`, script `start`, `engines.node >= 18`.
- `crm_package.json` (40) — manifesto do projeto React/Vite do CRM (build separado).
- `crm_index.html` (15) — template HTML do build do CRM.
- `playwright.config.js` (5) — `testDir: './e2e'`, `baseURL: http://localhost:3100`, `webServer` com `PORT=3100`.
- `.env.example` (53) — inventario de variaveis de ambiente.
- `render.yaml` (61) — blueprint de deploy (web service + Postgres), chaves com `sync: false`.
- `public/manifest.json` (32) — manifesto PWA.
- `public/sw.js` (27) — service worker (network-first, apaga caches no activate).
- **Configuracao de negocio em runtime:** `system_settings`, defaults em `database.js:1957-1978`, editavel em `routes/admin.js:1411-1474`.
- **Lacuna:** `CRM_SECRET`, `CARTPANDA_WEBHOOK_SECRET`, `DEFAULT_INVITE_CODE`, `NEXUS_CRM_URL` e `ADMIN_PASSWORD` nao aparecem em `.env.example` nem em `render.yaml`, embora sejam lidos em runtime.

**Logica Central:**
- `database.js` (2180) — DAL unificada: DDL e migracoes (`:245-412`), mappers (`:476-569`), repositorios dual-branch (`:576-2100`), catalogo de produtos seed (`:24-157`), cadeia de gateway (`:2037-2063`), export (`:2102-2180`).
- `routes/wallet.js` (979) — orquestracao de deposito, saque e webhooks de pagamento.
- `routes/admin.js` (1476) — aprovacao de saque, ajuste de saldo, override de patente, reprocessamento de webhook, settings.
- `routes/fleet.js` (206) — contratacao com a carencia de 30 dias por modelo (`:23-138`).
- `services/settlementEngine.js` (211) — gotejamento de rendimento diario.
- `services/limits.js` (145) — janela rolante, tetos e carencias.
- `services/misticpay.js` (265) — gateway com a validacao de chave Pix mais completa do sistema.
- `services/crmDb.js` (313) — persistencia do funil de leads em `crm_data.json` (inclui `fbclid`/`ttp` em `:113-114` e `:140-143`).
- `services/crmSession.js` (61) — autenticacao por cookie assinado do CRM.
- `services/careerEngine.js` (277) — rede multinivel, patentes e comissoes.

**Testes:**
- `tests/limits.test.js` (211) — regras de limite de saque/deposito.
- `tests/admin-filters.test.js` (119) — predicados de filtro do admin.
- `tests/i18n.test.js` (40), `tests/i18n-data.test.js` (37) — resolucao de idioma.
- `e2e/lang.spec.js` (69) — comportamento de idioma no navegador.
- Execucao: `node --test tests/` e `npx playwright test` (nao ha script npm para os testes).

**Documentacao:**
- `README.md` (18) — rodar localmente e deploy no Render.
- `.planning/codebase/ARCHITECTURE.md`, `.planning/codebase/STRUCTURE.md` — arquitetura e estrutura (estes documentos).
- `.planning/codebase/STACK.md`, `INTEGRATIONS.md`, `CONVENTIONS.md`, `TESTING.md`, `CONCERNS.md` — demais mapas do mesmo conjunto.
- `plano-antifraude-bonus-R5.md` (87), `plano-limites-nativos-fase2.md` (56) — notas de projeto na raiz.
- `docs/superpowers/plans/`, `docs/superpowers/specs/` — plano e spec da feature de i18n.
- Ausente: referencia de API, runbook operacional e ADR.

## Onde Adicionar Codigo Novo

**Nova rota de API:**
- Definicao e handler: `routes/<dominio>.js` (dominios existentes: auth, wallet, fleet, team, support, admin, crm) — adicione o `router.get/post/...` no arquivo do dominio correspondente, junto dos handlers irmaos.
- Montagem: nenhuma mudanca necessaria se o dominio ja esta montado em `server.js:139-144`; se for dominio novo, adicione o `app.use` **antes** do fallback `app.get('*')` (`server.js:206`).
- Acesso a dados: `database.js` — adicione a funcao no grupo correto e registre no `module.exports` (`database.js:2102-2180`); se for tabela nova, acrescente o DDL em `initDb` (`:245-412`) nos dois caminhos.
- Testes: `tests/<alvo>.test.js` se a logica for pura/sem I/O; `e2e/<cenario>.spec.js` se depender de navegador.

**Novo servico / nova integracao:**
- Implementacao: `services/<nome>.js`, exportando um objeto de funcoes.
- Configuracao: `.env.example` + `render.yaml` (com `sync: false` para segredos).
- Registro: nenhum registro central — services sao `require`-d sob demanda; se precisar agendar, o cron vai em `server.js:230-237` ou e auto-agendado no proprio service (`services/backup.js:101-109`).
- Testes: `tests/<nome>.test.js`.

**Nova gateway de pagamento:**
- Cliente: `services/<gateway>.js` com o contrato `is<Gateway>Enabled()` e `createPixCharge({amount, customerName, customerPhone, customerEmail, customerCpfCnpj, referenceId, webhookUrl})` retornando `{ success, provider, txId, pixCopyPaste, qrImage, expiresInSeconds }`.
- **Registro do nome (obrigatorio, 2 passos):**
  1. `KNOWN_GATEWAYS` em `database.js:2038` — sem isso `normalizeGatewayOrder` (`:2040`) descarta o nome e ele nunca entra na cascata.
  2. `gatewayCreators` em `routes/wallet.js:140-145` (deposito) e, se enviar Pix, `gatewaySenders` em `routes/admin.js:320-325` (payout).
- Webhook: handler em `routes/wallet.js` + alias de URL em `server.js:148-155`.

**Novo campo no usuario / contrato / transacao:**
- Postgres: coluna no `CREATE TABLE` **e** `ALTER TABLE ... ADD COLUMN IF NOT EXISTS` em `database.js:245-412`, entrada no `mapX` correspondente (`:476-569`) e no `updateUser`/`updateContract`/`updateTransaction`.
- JSON: o branch de arquivo persiste campos novos sem DDL, mas os mappers e o `createUser` precisam ser atualizados, senao o campo fica **invisivel no Postgres**.
- UI: `public/app.js` (render) e/ou `public/admin.html` (tabela/coluna).

**Novo texto traduzido (UI):**
- Adicione a chave em `public/i18n/pt.json` e em `es.json`, `en.json`, `zh.json` (os 4 tem 451 linhas e devem permanecer alinhados).
- Marque o elemento com `data-i18n`, `data-i18n-ph`, `data-i18n-aria` ou `data-i18n-title` (aplicados por `public/i18n.js:80-86`).
- Se o texto for montado em JS, use `window.TruckAutoI18n.t('chave')` e escute o evento `truckauto:lang` para re-renderizar.

**Novo texto traduzido (catalogo/dados):**
- Colunas `*_es`, `*_en`, `*_zh` em `products`, valores default em `productDescI18n`/`productStatusI18n` (`database.js:162-180`), e resolucao no cliente via `window.I18nData.pickLang` (`public/i18n-data.js:10-17`).

**Novo filtro/busca no painel admin:**
- Predicado puro em `public/admin-filters.js` + export no bloco `return` (`:72-79`).
- Teste em `tests/admin-filters.test.js`.
- Se o nome nao estiver na lista de `AF()` (`public/admin.html:1478`), adicione la, senao o fallback `() => true` filtra nada.

**Novo campo de origem de lead (ex.: novo click-id de plataforma):**
- Captura no navegador em `public/login.html:691-705` (query string + fallback `tn_*`), envio no body em `public/login.html:711-715`.
- Receber e sanitizar em `routes/auth.js:12` e `:132-135`, incluir no calculo de `veioDeAnuncio` (`:139`) e no `createLead` (`:140-157`).
- Persistir no lead em `services/crmDb.js:113-114` (merge) e `:140-143` (novo).
- Expor no painel em `routes/admin.js:149-170` (`/leads-origin`) e na tabela em `public/admin.html:1023`, `:1619`, `:1639-1664`.

**Novo job agendado:**
- `services/<nome>.js` com `node-cron` e uma funcao `schedule*()` idempotente (padrao de `services/backup.js:101-109`).
- Chamada em `startServer()` dentro do callback de `listen` (`server.js:218-238`).

**Nova rota no CRM:**
- `routes/crm.js` **ja e todo protegido por sessao** a partir de `:33-36`. Uma rota nova herda a sessao automaticamente.
- Se a rota for de ingestao de terceiros (nao navegador), acrescente a excecao no guard de `:34` **e** uma checagem de segredo propria no estilo de `leadIngestAuth` (`:22-26`).
- Se tocar settings, use `safeSettings()` (`:445`) no `GET` e o filtro de campos mascarados no `PUT` (`:456-460`).

## Convencoes de Nomenclatura

**Arquivos:**
- Backend e servicos: `camelCase.js` — `database.js`, `settlementEngine.js`, `careerEngine.js`, `keepAliveWatchdog.js`, `whatsappQueue.js`, `aiSdrEngine.js`, `admin-filters.js`, `tiktok-pixel.js` (os ultimos dois usam hifen: espelham a convencao do frontend).
- Modulos UMD compartilhados com o browser: mesmo nome nos dois lados, exportando `window.X` e `module.exports` — `i18n.js` → `window.TruckAutoI18n`, `i18n-data.js` → `window.I18nData`, `admin-filters.js` → `window.AdminFilters`.
- CRM React: `PascalCase.jsx` para componentes e views — `App.jsx`, `LiveChatView.jsx`, `NewLeadModal.jsx`.
- Paginas: `kebab-case.html` — `login.html`, `presell.html`, `privacidade.html`, `termos.html`, `admin.html`, `index.html`.
- Dicionarios i18n: `public/i18n/{code-de-idioma}.json` — `pt.json`, `es.json`, `en.json`, `zh.json`.
- Documentos de projeto: `kebab-case.md` com prefixo de tema na raiz (`plano-*.md`) e `YYYY-MM-DD-<slug>.md` em `docs/superpowers/`.
- Configuracao/build na raiz: `package.json`, `playwright.config.js`, `render.yaml`, `crm_package.json`, `crm_index.html` (prefixo `crm_` para separar do projeto React).
- Dados: `data.json` (dominio) e `crm_data.json` (CRM), ambos na raiz e ambos no `.gitignore`.
- Tests: `<alvo>.test.js` em `tests/` (unitario, `node:test`); `<cenario>.spec.js` em `e2e/` (Playwright).

**Diretorios:**
- `kebab-case` no plural ou sem plural: `routes/`, `services/`, `middleware/`, `public/`, `tests/`, `e2e/`, `docs/`.
- `crm_frontend_src/` usa `snake_case` (unica excecao de estilo de diretorio).
- `views/` e `components/` em minusculo dentro do CRM, com arquivos `PascalCase.jsx` dentro deles.

**Padroes Especiais:**
- Prefixo `map` para conversores de linha do Postgres: `mapUser`, `mapProduct`, `mapContract`, `mapTransaction`, `mapPromo`, `mapSupportThread`.
- Prefixo `get`/`find`/`create`/`update`/`delete` para as funcoes de repositorio em `database.js`.
- Prefixo `normalize*` para sanitizacao de lista persistida: `normalizeGatewayOrder`, `normalizeGatewayDisabled`.
- Prefixo `notifyAdmin*` para as notificacoes ao Telegram: `notifyAdminWithdrawal`, `notifyAdminDeposit`, `notifyAdminSupportMessage`, `notifyAdminSecurityAlert`.
- Prefixo `is*` para habilitacao/verificacao booleana: `isAsaasEnabled`, `isSyncPayEnabled`, `isMisticEnabled`, `isPaymentConfirmed`, `isDepositEvent`, `isCashinCompleted`, `isValid`.
- Prefixo `check*` para validacao que retorna `{ ok, status, error }`: `checkDepositLimits`, `checkWithdrawLimits`.
- Prefixo `*Inc` para os incrementos atomicos de dinheiro em `updateUser` (`database.js:787-807`): `balanceInc`, `investBalanceInc`, `earnBalanceInc`, `totalDepositedInc`, `totalWithdrawnInc`. **Em dinheiro, use sempre `*Inc`, nunca atribuicao absoluta** — a atribuicao absoluta perde escrita concorrente.
- IDs com prefixo de dominio: `usr_` (usuario), `CTR-` (contrato), `NX` (codigo de convite), `WD-` (saque), `CK-` (check-in), `BN-`/`BNS-SIGNUP-`/`BNS-EXP-` (bonus), `CP-`/`ASAAS-`/`MISTIC-`/`SYNC-` (pagamento), `TX-` (transacao), `ADJ-` (ajuste), `lead-`/`auto-`/`msg-` (CRM), `dep_` (evento de anuncio).
- Log prefixado por dominio entre colchetes: `[WALLET]`, `[ASAAS]`, `[MISTIC]`, `[DRIP]`, `[SETTLEMENT]`, `[CAREER ENGINE]`, `[BACKUP]`, `[WATCHDOG 24/7]`, `[SECURITY ALERT]`, `[ANTI-FARM]`, `[TIKTOK]`, `[SECURITY]`.
- Tipos de transacao em caixa baixa com traco: `deposit`, `withdraw`, `income`, `commission`, `bonus`, `contract`, `adjustment`.
- Status de transacao em caixa baixa: `pending`, `processing`, `approved`, `rejected` (com aliases tolerados `aprovado`/`completed`/`paid` em `database.js:1077`).
- Estagios de funil do CRM em portugues: `novo`, `contato`, `qualificado`, `proposta`, `ganho`, `perdido` (`services/crmDb.js:19-26`).
- **Mensagens de erro para o usuario sempre em portugues, sem jargao interno.** A carencia de frota e o exemplo canonico: o backend sabe o prazo e devolve `cooldownDaysLeft`, mas a mensagem enviada e `"Limite deste modelo atingido."` (`routes/fleet.js:53`).
- Idiomas sempre em codigo curto minusculo: `pt`, `es`, `en`, `zh`; locale completo so no atributo `lang` do `<html>`.

---

*Analise de estrutura: 2026-09-30 — commit `3b38fa8`*
*Atualizar quando a organizacao de diretorios mudar*
