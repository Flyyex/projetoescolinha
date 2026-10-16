---
doc: architecture
last_mapped_commit: 3b38fa8
mapped_date: 2026-09-30
previous_mapped_commit: 4c16c6f
staleness_fixed: true
scope: root
---

# Architecture

**Mapped commit:** `3b38fa8` | **Mapped date:** 2026-09-30 | **Supersedes:** `4c16c6f` (2026-09-29)

## Visao Geral do Pattern

**Monolito Full-Stack Node.js/Express, sem framework e sem abstracao de aplicacao.** Um unico processo serve a API REST, o frontend estatico (app do operador, painel admin, landing/presell), a SPA React ja buildada do CRM, os webhooks de terceiros e os jobs agendados. Nao ha diretorio `src/`, nem container de injecao de dependencia, nem ORM, nem suite de testes de integracao.

**Caracteristicas-chave:**
- Executavel unico: `server.js:245` invoca `startServer()` (`server.js:211-243`), que sobe HTTP + socket.io + cron + watchdog no mesmo processo.
- Persistencia **dual alternada em runtime**: PostgreSQL **ou** arquivo `data.json`, decidido uma unica vez no boot por `isPostgres` (`database.js:12`).
- Sem build step no app do operador: render por template string em `public/app.js` (2833 linhas) + `public/index.html` (990 linhas). O painel admin e um HTML de 2962 linhas com script inline monolitico.
- O CRM (Nexus) e a **unica** SPA React buildada (Vite), servida do mesmo Express em `/crm` (`server.js:135-136`, `server.js:178-180`). O source vive em `crm_frontend_src/` e o bundle commitado em `public/crm/`.
- Integracao externa por **webhooks de gateways Pix** (MisticPay, SyncPay, Asaas, Cartpanda) com aliases de URL, tokens por provedor e confirmacao server-side.
- Tempo real **apenas no CRM**: `socket.io` instanciado em `server.js:15-17` e injetado no router do CRM via factory (`server.js:158`).
- Configuracao de negocio em banco (`system_settings`), lida por `database.js:1956-2035` e editavel em `routes/admin.js:1411-1474`.

**Correcao em relacao ao mapa de 2026-09-29:** o router do CRM **nao esta mais aberto**. `routes/crm.js:33-36` aplica `services/crmSession.js` a todas as rotas do CRM desde o commit `57afb4f`. Ver "Autenticacao do CRM".

## Camadas

```
server.js  (HTTP kernel / bootstrap)
   +-- routes/*.js          (controladores HTTP + logica de negocio inline)
        +-- middleware/auth.js      (JWT do operador)
        +-- services/*.js           (dominio + integracoes + jobs)
             +-- database.js        (DAL dual-store: Postgres | data.json)
             +-- services/crmDb.js  (store separado: crm_data.json)
   +-- public/*             (frontend estatico servido pelo mesmo Express)
```

### 1. Bootstrap / Composicao (HTTP Kernel)

- **Proposito:** ordem de middlewares, montagem de routers, aliases de webhook, rotas de pagina, agendamento de jobs, init do banco.
- **Contem:** `server.js:13-245` — dotenv (`:1`), CORS + body parsers 50mb (`:26-28`), cookie-parser (`:29`), Helmet sem CSP/COEP (`:32`), `trust proxy` (`:24`), rate limiters (`:37-69`), analytics de visitantes (`:72-112`), redirect de URLs legadas `.html` (`:116-128`), estaticos (`:131-136`), montagem de routers (`:139-163`), rotas de pagina + SPA fallback (`:166-208`), `startServer()` (`:211-243`).
- **Depende de:** `express`, `http`, `socket.io`, `cors`, `helmet`, `express-rate-limit`, `./database`, `./services/telegramBot`.
- **Usado por:** todo o resto do sistema. E o **unico entry point de processo**.

### 2. Camada de Rotas (Controladores HTTP)

Proposito: parsing de `req`/`res`, validacao de entrada, orquestracao de `database.js` + `services/*`, formatacao de resposta. **Contem logica de negocio inline de forma deliberada** — `routes/wallet.js` e `routes/admin.js` sao onde as regras de dinheiro realmente vivem, nao em `services/`.

| Arquivo | Linhas | Conteudo |
|---|---|---|
| `routes/wallet.js` | 979 | resumo, deposito Pix, os 4 webhooks de gateway, saque, check-in, cupom, extrato, recargas para o pixel |
| `routes/admin.js` | 1476 | painel master inteiro (43 rotas): metricas, saques, depositos, usuarios, carreira, webhooks, settings |
| `routes/crm.js` | 525 | **router factory** `module.exports = function(io)` (`routes/crm.js:5`): WhatsApp/Evolution, funil de leads, automacoes, analytics, exports CSV |
| `routes/auth.js` | 276 | cadastro, login (operador **e** CRM), `/me`; emite o JWT e o cookie de sessao do CRM |
| `routes/fleet.js` | 206 | catalogo, meus contratos, contratacao (`/hire`) com carencia de 30 dias |
| `routes/team.js` | 112 | overview de rede e plano de carreira |
| `routes/support.js` | 84 | chat de suporte in-app |

### 3. Camada de Servico (Dominio + Integracoes)

Modulos singleton carregados por `require`, sem instanciacao e sem DI.

- **Gateways Pix** (um arquivo por provedor): `services/misticpay.js` (265), `services/asaas.js` (170), `services/syncpay.js` (118), `services/cartpanda.js` (95).
- **Dominio:** `services/careerEngine.js` (277), `services/settlementEngine.js` (211), `services/limits.js` (145, unico modulo 100% puro), `services/aiSdrEngine.js` (158).
- **Infra/Operacao:** `services/telegramBot.js` (675), `services/backup.js` (111), `services/keepAliveWatchdog.js` (55), `services/whatsappQueue.js` (96).
- **Seguranca do CRM (novo):** `services/crmSession.js` (61) — ver secao dedicada.
- **Store do CRM:** `services/crmDb.js` (313) — persiste em `crm_data.json` proprio, **fora** do dual-store de `database.js`.

### 4. Camada de Acesso a Dados (DAL unificada)

`database.js` (2180 linhas) e a **unica** porta de entrada para usuarios, produtos, contratos, transacoes, cupons, `pix_charges`, suporte, analytics, `webhook_logs` e `system_settings`. Ver "Persistencia Dual".

### 5. Camada de Autenticacao

- `middleware/auth.js:11-31` — `authMiddleware`, JWT Bearer HS256, reidrata o usuario via `findUserById` e injeta `req.user` (`:26`). `JWT_SECRET` com **throw** em producao se ausente (`:4-9`).
- `routes/admin.js:110-119` — `adminAuthMiddleware`, chave estatica `x-admin-key` / `Authorization: Bearer`; aplicado com `router.use` em `routes/admin.js:121`, protegendo tudo abaixo dele.
- `services/crmSession.js:55-59` — `middleware` de cookie assinado do CRM.

### 6. Camada de Apresentacao (Frontend)

`public/app.js` (2833) + `public/index.html` (990) para o operador; `public/admin.html` (2962, script inline) + `public/admin-filters.js` (80); `public/login.html` (772); `public/presell.html` (2746); `public/tiktok-pixel.js` (19) + `public/tiktok-pixel-base.js` (32); CRM buildado em `public/crm/`. Todo `fetch` direto com `Authorization: Bearer` (operador) ou `x-admin-key` (admin).

## Fluxo de Dados

### Requisicao HTTP tipica autenticada — `POST /api/wallet/deposit/pix`

1. **Middlewares globais** — `server.js:26-32`. O analytics de pagina (`server.js:72-112`) e ignorado para `/api/` (`:75`).
2. **Roteamento** — `server.js:141` monta `walletRouter` em `/api/wallet`; handler em `routes/wallet.js:96`.
3. **Autenticacao** — `authMiddleware` (`middleware/auth.js:11`) valida o JWT e recarrega o usuario (`:20`), populando `req.user` (`:26`).
4. **Leitura de configuracao** — `getMoneyLimits()` (`database.js:2066-2083`) le `system_settings` e saneia os valores (min 1, taxa 0-50%, bonus 0-1000).
5. **Validacao de negocio** — minimo de deposito (`routes/wallet.js:105-107`), pausa de depositos (`:111-113`), tetos rolantes de 24h via `checkDepositLimits` (`:114-122`, `services/limits.js:75-84`), exigencia de CPF/CNPJ quando Asaas esta ativa (`:124-126`).
6. **Orquestracao de gateway em cascata** — dicionario `gatewayCreators` (`routes/wallet.js:140-145`) percorrido na ordem de `getGatewayOrder()` (`:147-157`); a primeira que retorna `success: true` vence (`:152`). Nenhuma disponivel → 503 (`:160`).
7. **Persistencia do QR** — `savePixCharge` grava o identificador externo para correlacao no webhook (`routes/wallet.js:164-166` → `database.js:1531-1551`).
8. **Efeito colateral no CRM** — `crmDb.moveLeadByPhone(user.phone, 'proposta', 'QR Pix gerado', numAmount)` (`routes/wallet.js:167`) move/cria o lead no funil.
9. **Resposta** — JSON normalizado do gateway (`:168`).

### Fluxo de webhook de pagamento (credito de saldo)

O esqueleto e identico nos quatro provedores; a Mistic e o mais rigido.

1. **Chegada no alias** — o provedor pode chamar qualquer URL registrada; `server.js:148-151` (Cartpanda) e `server.js:152-155` (Mistic) reescrevem `req.url` e delegam ao mesmo `walletRouter`.
2. **Autenticacao do webhook** (nao usa JWT) — token por provedor conferido dentro do handler: `CARTPANDA_WEBHOOK_SECRET` (`routes/wallet.js:186`), `ASAAS_WEBHOOK_TOKEN` (`:398`), `SYNCPAY_WEBHOOK_TOKEN` (`:560-566`). **A Mistic nao assina** — por isso ela reconfirma server-side antes de creditar (`routes/wallet.js:507-517` + `services/misticpay.js:234`) e devolve **500** de proposito para forcar retry (`:513`).
3. **Idempotencia** — o id da transacao deriva do id externo com prefixo de dominio (`MISTIC-`, `SYNC-`, `ASAAS-`, `CP-`) e a existencia e checada **antes** de qualquer credito (`routes/wallet.js:504-506`, `:632-635`, `:428-430`, `:308-311`).
4. **Valor autoritativo** — na Mistic, o valor vem da API de confirmacao, nunca do corpo do webhook (`routes/wallet.js:518-519`).
5. **Localizacao do usuario** — cascata de heuristicas: `pix_charges` salvo → `externalReference` (Asaas, `:411-421`) → memoria auxiliar do SyncPay (`:592-595`) → CPF (`:528-534`, `:603-610`) → telefone derivado do e-mail (`:611-617`) → nome exato (`:618-626`). Sem match → log `user_not_found` e **200** para nao gerar retry do provedor (`:627-630`).
6. **Credito atomico** — `updateUser(id, { totalDepositedInc, investBalanceInc, balanceInc })` (ex.: `routes/wallet.js:542`), que no Postgres vira `SET col = COALESCE(col,0) + $n` (`database.js:787-807`).
7. **Extrato** — `createTransaction` tipo `deposit`, status `approved` (`routes/wallet.js:543`).
8. **Efeitos colaterais (fire-and-forget)** — `markPixChargeUsed` (`:544`), `crmDb.moveLeadByPhone(..., 'ganho', 'Pix confirmado', ...)` (`:545`), `notifyAdminDeposit` (`:546`), sync com Nexus CRM remoto (`:355-369`).
9. **Auditoria** — `recordWebhookLog` grava o payload bruto em `webhook_logs` (`:547` → `database.js:1862`).
10. **Resposta 200.**

### Fluxo de saque (caminho manual e assistido) — dinheiro real

`POST /api/wallet/withdraw` (`routes/wallet.js:654`):

1. Valida e normaliza a chave Pix com o **tipo escolhido pelo operador** (`routes/wallet.js:665-675`, `services/misticpay.js:124-168`). A deteccao **nunca** adivinha CPF como fallback (`services/misticpay.js:158-167`).
2. Expiracao preguicosa do bonus de boas-vindas (7 dias sem deposito) — `routes/wallet.js:688-721`, regra em `services/limits.js:122-127`.
3. Limites rolantes de 24h + carencia de conta nova + teto global — `routes/wallet.js:724-758`, `services/limits.js:86-119`.
4. **Debita so do saldo de saque** (`earnBalance`) — `routes/wallet.js:760-764`, com o recalculo de `balance` em `:782`.
5. **Regra `totalDeposited >= minDeposit`** — `routes/wallet.js:766-775` (403 se nao tiver pelo menos um deposito minimo confirmado).
6. Cria a transacao com **status `pending`** — `routes/wallet.js:790-805`. A taxa e descontada so na descricao/neto (`netAmount`, `:788`), nao no debito.
7. Calcula quanto a pessoa **ja sacou de verdade** (so saques aprovados) para o alerta de abuso — `routes/wallet.js:811-819` → `getApprovedWithdrawalsTotal` (`database.js:1076-1098`).
8. Notifica o Telegram com `alreadyWithdrawn`/`alreadyCount` (`routes/wallet.js:822-832` → `services/telegramBot.js:468-538`; alerta `**VALOR ALTO**` acima de R$ 500 em `services/telegramBot.js:486-492`).

**O Pix so sai quando o admin age:**

| Acao | Rota | Efeito no saldo |
|---|---|---|
| Aprovar e enviar Pix | `routes/admin.js:299-362` | reserva via `claimWithdrawal` (`:304`) → envia pela cascata de gateways (`:320-340`) → `approved`. Se **nenhum** gateway pagou, volta para `pending` (`:341-344`) e devolve 502. Nunca reverte se o Pix ja saiu (`:358-360`). |
| "Ja paguei na mao" | `routes/admin.js:366-391` | aceita `pending` **e** `processing` (`:370-371`), marca `approved` **sem** tocar no saldo (o valor ja foi debitado no pedido). |
| Rejeitar | `routes/admin.js:393-424` | `rejected` + **estorno** ao `earnBalance` (`:412-416`) e reducao de `totalWithdrawn` (`:415`). |
| Consultar estado real | `routes/admin.js:436-467` | somente leitura na MisticPay, com dicionario de estados em `:427-435`. |

### Fluxo de job (gotejamento de rendimento)

`server.js:232-235` agenda `cron.schedule('7 * * * *')` → `processDripSlice()` (`services/settlementEngine.js:185-194`) → `runSlices(1)` (`:140-182`): folga aos domingos (`:86-94`, `:144-147`), contrato novo so rende **a partir do dia seguinte** a contratacao (`:101-112`, `:152-153`), rendimento diario fatiado em 24 partes com o resto distribuido (`:114-118`), credito em `earnBalance` por fatia (`:127`) e `daysRemaining` so consome quando as 24 fatias completam (`:168-176`).

### Fluxo de atribuicao de anuncio (fbclid / ttp) — lead anonimo → cadastro

Este e o caminho que amarra a conversao ao anuncio, e ele atravessa tres arquivos:

1. **Captura no navegador** — `public/login.html:691-705` le `utm_source/campaign/medium/content/term`, `fbclid` e `ttp` da query string, com fallback para `sessionStorage`/`localStorage` (`tn_utm_*`, `tn_fbclid`, `tn_ttp`). `public/presell.html` **nao** captura nada disso.
2. **Envio no cadastro** — `public/login.html:711-715` manda tudo no corpo de `POST /api/auth/register`. O login tambem envia (`public/login.html:714`).
3. **Sanitizacao e decisao de origem** — `routes/auth.js:132-139`: cada click-id e `String(...).trim().slice(0, 100)`; `veioDeAnuncio` e verdadeiro **so** se houver `fbclid`, `ttp`, `utm_content` ou `utm_term` (`:139`). Sem isso o lead e marcado `'Direto'` e recebe a nota "origem direta" (`:146`, `:156`) — o sistema se recusa a inventar origem de anuncio.
4. **Criacao/merge no funil** — `routes/auth.js:140-157` chama `crmDb.createLead` com `fbclid` (`:153`) e `ttp` (`:155`). `services/crmDb.js` casa por telefone normalizado (`:93-96`); no lead existente faz merge campo a campo (`:113-114`) e no novo grava `fbclid`/`ttp` (`:140-143`).
5. **Relatorio** — `routes/admin.js:143-194` (`GET /api/admin/leads-origin`) agrega por campanha, criativo (`utm_content`) e palavra-chave (`utm_term`), com a regra `veioDeAnuncio` recomputada no servidor (`routes/admin.js:154-155`).
6. **Pixel** — `public/app.js:1781-1797` anexa o `ttp` a cada evento do TikTok; `public/app.js:1768-1777` traduz os nomes de evento do Meta para os do TikTok.

> **Precisao importante:** `services/crmSession.js` **nao** participa desse fluxo. Ele e autenticacao do operador do CRM (cookie assinado), nao rastreamento de lead anonimo. O rastreamento de click-id vive em `routes/auth.js` + `services/crmDb.js` + `public/login.html`. Ver "Atribuicao de anuncio" e "Autenticacao do CRM".

### Fluxo de marcacao server-side de `Purchase` (Meta/TikTok)

Correcao recente e relevante (commit `f457410`): a marcacao saiu do `localStorage` e passou para o servidor.

1. `public/app.js:2002-2031` (`reportNewDepositPurchases`) chama `GET /api/wallet/purchases` com guarda de corrida `adReportInFlight` (`:2001-2004`).
2. O servidor devolve **apenas** depositos `approved` cujo `ad_reported_at IS NULL` — `database.js:1123-1138` (coluna em `database.js:391`, exposta por `mapTransaction` em `database.js:567`).
3. O cliente dispara `Purchase` + `AddPaymentInfo` nos dois canais com `event_id`/`eventID` estaveis (`dep_<txId>`) — `public/app.js:2017-2020`.
4. So entao confirma: `POST /api/wallet/purchases/reported` (`public/app.js:2024` → `routes/wallet.js:951-966`), que **revalida que os ids sao do proprio usuario** (`routes/wallet.js:956-958`) e marca em lote (`database.js:1141-1162`).
5. Se a confirmacao falhar, **nao marca** — o servidor devolve de novo e o evento sai uma unica vez (`public/app.js:2025-2027`). O comentario em `public/app.js:1994-1999` registra o motivo: checagem por localStorage chegou a gerar 42 mil eventos para 39 depositantes.

## Modelo de Dinheiro (dominio)

Tres baldes e um derivado. Esta e a parte mais sensivel do sistema e as invariantes valem em **cada** handler:

| Balde | Semantica | Onde e creditado | Pode ser sacado? |
|---|---|---|---|
| `investBalance` | **Dinheiro do proprio usuario depositado.** Nao e saque. | Deposito confirmado (`routes/wallet.js:431`, `:542`, `:636`, `:317`) | **Nao** |
| `earnBalance` | **"Saldo de saque"**: rendimentos, bonus, comissoes, cupons. | `settlementEngine.js:127` (rendimento), `wallet.js:114` (bonus signup), `:867` (check-in), `:913` (cupom), comissoes via `careerEngine.js` | **Sim**, exclusivamente (`routes/wallet.js:760-764`) |
| `commissionBalance` | Balde separado de comissao, derivado do extrato, nao coluna de verdade | Nao e creditado diretamente; e **recalculado** em `routes/wallet.js:64-65` a partir da soma de `type === 'commission'` menos saques nao rejeitados | Derivado (`routes/wallet.js:82`) |
| `balance` | **Derivado:** `investBalance + earnBalance` | Recalculado a mao em cada escrita (ex.: `routes/wallet.js:782`, `:871`, `:916`; `routes/fleet.js:145`) | Nao e fonte de verdade |

- `balance` **nao** e lido como verdade em lugar nenhum de decisao: so se soma ou se recalcula. `mapUser` expoe os tres (`database.js:490-494`).
- **Saldo nao pode ser misturado numa compra.** `routes/fleet.js:98-111` exige que o valor cheio caiba em **um** balde; o cliente escolhe via `payFrom` (`invest` | `earn`) e o debite e feito so de um (`:141-146`).
- **Comissao so sobre dinheiro real** — `shouldPayCommission` (`services/limits.js:130-132`) exige `totalDeposited >= minDeposit`; se nao, a comissao e retida e logada (`routes/fleet.js:180-188`).
- **Rendimento cai no saldo de saque, nunca no de investir** — `services/settlementEngine.js:127`.

## Persistencia Dual (Postgres | data.json) — onde segura e onde vaza

`isPostgres` (`database.js:12`) e constante de modulo resolvida no boot a partir de `DATABASE_URL` (`database.js:9`, pool em `:14-19`). **Nao ha fallback dinamico**: se `DATABASE_URL` existir mas o Postgres cair, o processo nao troca para arquivo.

### Onde a abstracao **segura**

- **Superficie unica e assincrona.** `module.exports` (`database.js:2102-2180`) expoe ~70 funcoes; nenhuma rota conhece SQL.
- **As chaves de idempotencia sao as mesmas** nos dois ramos: `MISTIC-<id>`, `claimWithdrawal`, `findTransactionById`.
- **Incrementos de dinheiro sao atomicos no Postgres**: `updateUser` gera `balance = COALESCE(balance,0) + $n` para os cinco campos `*Inc` (`database.js:787-807`), protegendo contra webhooks concorrentes que somem por read-modify-write.

### Onde a abstracao **vaza**

1. **Sem transacao, sem lock, sem concorrencia no modo arquivo.** `readJsonDb`/`writeJsonDb` (`database.js:200-215`) fazem `readFile → JSON.parse → modify → writeFile` do arquivo **inteiro**. Duas requisicoes simultaneas perdem escrita; o arquivo pode ser truncado num crash no meio do `writeFileSync`.
2. **Corrupcao silenciosa.** `catch { return defaultData }` em `database.js:208-210` devolve o seed sem alertar — dados de producao podem sumir sem nenhum log.
3. **Mappers so no caminho Postgres.** `mapUser`/`mapProduct`/`mapContract`/`mapTransaction` (`database.js:476-569`) sao aplicados apenas no branch SQL (`:1066`, `:966`); o branch JSON devolve o objeto cru. Consequencia pratica: `mapUser` **nao expoe** `registerIpHash`, entao um campo novo adicionado so no JSON fica invisivel no Postgres e vice-versa.
4. **`claimWithdrawal` e CAS no Postgres e checagem sequencial no JSON.** `UPDATE ... WHERE status = $2 RETURNING *` (`database.js:1290-1295`) vs. `find` + `if` + atribuicao (`:1297-1302`). **O clique duplo no admin que protege o dinheiro pode pagar duas vezes no modo arquivo.**
5. **Numeros viram string no Postgres.** `NUMERIC` chega como string; todo consumidor precisa de `parseFloat`. Os mappers cuidam do caso comum, mas `routes/wallet.js:462-468` e `:603-608` fazem parse manual em codigo de webhook.
6. **`system_settings` tem dois esquemas de chave** — `snake_case` no Postgres (`database.js:1985-2003`) e o mesmo `snake_case` no JSON (`:2015-2033`) — mas `services/limits.js:27-29` precisa aceitar **as duas** grafias (`pick()` checa `max_deposit_tx` e `maxDepositTx`) porque `getMoneyLimits()` mistura fontes. E um fork silencioso que a abstracao de settings nao eliminou.
7. **`data.json` esta no `.gitignore` mas existe no working tree** (1075 linhas, com o catalogo semeado). Rodar sem `DATABASE_URL` em producao e uma decisao, nao um default seguro.

## Cadeia de Failover de Gateway

```
KNOWN_GATEWAYS = ['misticpay','syncpay','asaas','cartpanda']   (database.js:2038)
        |
        +-- normalizeGatewayOrder(value)    database.js:2039-2043
        |     -> ordena o que o admin pediu, joga fora nome desconhecido,
        |        e COMPLETA com os que faltarem (nunca devolve lista curta)
        |
        +-- normalizeGatewayDisabled(value) database.js:2053-2055
        |
        +-- getGatewayOrder()                database.js:2044-2052
              -> normalizeGatewayOrder(system_settings.gateway_order)
                 .filter(g => !disabled.includes(g))
              -> em erro: devolve [...KNOWN_GATEWAYS]  (fallback seguro)
```

- **Estado:** `system_settings.gateway_order` (default `'misticpay,syncpay,asaas,cartpanda'`, `database.js:1962`) e `gateway_disabled` (`:1963`), editaveis em `routes/admin.js:1420-1421` **ja normalizados** antes de gravar.
- **Leitura/diagnostico:** `GET /api/admin/gateways` (`routes/admin.js:124-139`) expoe ordem e desabilitadas + status da Mistic (`getMisticStatus()`, `services/misticpay.js:24-26`) sem nenhum segredo.

### Cascata de deposito — `routes/wallet.js:140-162`

`gatewayCreators` mapeia nome → factory; cada factory **retorna `null` se nao esta habilitada** (`isMisticEnabled()`, `isSyncPayEnabled()`, `isAsaasEnabled()`) e e invocada dentro de `try/catch` (`:150-156`). O contrato uniforme de todos os provedores e **`{ success: false, error }` em vez de `throw`**, o que torna a cascata possivel sem `try/catch` aninhado por provedor. Vence a primeira `success: true` (`:152`).

### Cascata de payout — `routes/admin.js:320-344`

`gatewaySenders` e **menor** que a de deposito: `syncpay` e `cartpanda` retornam `null` (`:322`, `:324`), ou seja, **so MisticPay e Asaas conseguem enviar Pix de saque**. O `continue` em `:330` pula as nao implementadas, entao a ordem configurada e respeitada sem erro. O `success` do gateway e a verdade sobre o dinheiro: se saiu, `payoutSent = true` (`:335`) e **jamais** ha revesao para `pending`, mesmo que o `transferId` venha vazio (`:333-334`).

### Contrato por arquivo de servico

| Arquivo | Habilitacao | Cria Pix | Envia Pix | Confirma servidor | Notas |
|---|---|---|---|---|---|
| `services/misticpay.js` | `isMisticEnabled()` `:10` | `createPixCharge` `:54` | `sendPixTransfer` `:177` | `checkTransactionPaid` `:234` | Auth HTTP Basic `pk_`/`sk_`; timeout 30s (`:30`); `validatePixKey` `:124` e o validador mais completo do sistema (CPF com digito verificador `:93-106`, lista de DDDs validos `:119`, UUID `:120`, e-mail) |
| `services/asaas.js` | `isAsaasEnabled()` `:13` | `createPixCharge` `:69` | `sendPixTransfer` `:137` | `isPaymentConfirmed` `:157` | `findOrCreateCustomer` `:39`; exige CPF/CNPJ valido no deposito (`routes/wallet.js:124-126`) |
| `services/syncpay.js` | `isSyncPayEnabled()` `:10` | `createPixCharge` `:65` | — | `isCashinCompleted` `:105` | Cache de token OAuth `:17`; memoria auxiliar `pendingCharges` (`:50`) que **se perde no restart** |
| `services/cartpanda.js` | sempre "habilitada" | `createCartpandaPix` `:9` | — | — | Sem token de API cai em modo simulado (`routes/admin.js:132`) |

## Autenticacao do CRM (novo em `57afb4f`)

`services/crmSession.js` (61 linhas) fecha o CRM, que antes aceitava **qualquer** chamada e devolvia um token que ninguem validava.

- **Segredo:** `secret()` (`:13-15`) resolve `CRM_SECRET || ADMIN_KEY || ADMIN_PASSWORD`. Sem nenhuma delas, `isValid()` retorna `false` sempre (`:30`) — **fail-secure**.
- **Formato do token:** `id.expiracao.assinatura` (`:22-26`), HMAC-SHA256 de `id + '.' + exp` (`:17-19`), TTL de **12h** (`:11`).
- **Verificacao:** comparacao com `crypto.timingSafeEqual` e checagem de comprimento antes (`:36-39`) para nao vazar por timing.
- **Transporte:** cookie `truckauto_crm_session` `httpOnly` + `sameSite: 'lax'` + `secure` so em producao (`:42-49`).
- **Emissao:** o login "so senha" de `routes/auth.js:212-225` chama `setCookie(res)` (`:218`) e devolve `success: true` sem token no corpo.
- **Consumo:** `routes/crm.js:13-18` carrega o modulo e **lanca** em producao se nao houver segredo; `routes/crm.js:33-36` aplica o middleware a tudo, com **uma** excecao — `POST /leads/webhook`, que usa `leadIngestAuth` (`:22-26`, header `x-crm-secret`), para impedir injecao de lead falso.
- **Mascaramento de settings:** `safeSettings()` (`routes/crm.js:444-453`) devolve `'********'` para `globalApiKey`/`webhookToken` e string vazia para `adminPassword`; o `PUT /settings` remove os campos mascarados do corpo para nao gravar o asterisco (`:456-460`).

**Onde essa abstracao ainda vaza (verificado no codigo atual):**

1. **`GET /leads/webhook` (verificacao do Meta) responde 401.** A isencao em `routes/crm.js:34` so cobre `POST`. O handshake do Gerenciador de Anuncios e um `GET` sem cookie → cai no `crmSession.middleware` e e rejeitado (`:35`).
2. **O webhook de entrada do Evolution e alcancado por `server.js:159-162`**, que reescreve `req.url = '/webhook/evolution'` antes de delegar ao router. Dentro do router `req.path === '/webhook/evolution'`, que **nao** corresponde a isencao de `:34` → tambem cai no `crmSession.middleware`. O handler de inbound em `routes/crm.js:231` e inalcancavel por esse caminho.
3. **`clearCookie` (`services/crmSession.js:51-53`) e exportado e nunca chamado** — nao existe rota de logout; a sessao so morre em 12h ou quando o cookie e apagado.
4. O comentario em `services/crmSession.js:5-7` justifica a escolha do cookie alegando que "o bundle do CRM ja faz fetch com `credentials:include`". O bundle `public/crm/assets/index-B9Ccm2A2.js` **nao** faz isso — a unica ocorrencia de `credentials` e o polyfill `__vitePreload` do Vite. O cookie funciona porque as chamadas sao same-origin e o modo padrao (`same-origin`) ja o envia. O codigo esta correto; a justificativa no comentario nao e.

## Gerenciamento de Estado

- **Sem estado em memoria para o dominio.** Tudo vive no Postgres ou no `data.json`.
- **In-memory apenas como cache/auxiliar**, perdido a cada restart: `services/syncpay.js:50` (`pendingCharges`), `services/syncpay.js:14` (token OAuth), `services/keepAliveWatchdog.js` (intervalo), `services/whatsappQueue.js:6-7` (fila), `routes/support.js` (throttle de aviso), `routes/admin.js:88` (`lastVerifyAlertAt`).
- **Frontend:** `appState` em memoria (`public/app.js:35-152`) + `localStorage` para token e idioma (`public/i18n.js:35`).
- **Otimista no cliente com reconciliacao server-side:** `appState.balance` e atualizado pela resposta do servidor (`public/app.js:1820-1821`) e corrigido no proximo `/wallet/summary`.

## Abstracoes-chave

**Camada unificada de dados (dual-store).** Repository procedural com `if (isPostgres)` em **cada** funcao (`database.js:569-2100`). Export unico em `database.js:2102-2180`. Ver "Persistencia Dual".

**Mapper de linhas (`mapX`).** `mapUser` (`database.js:476-508`), `mapProduct` (`:510-532`), `mapContract` (`:534-550`), `mapTransaction` (`:552-569`), `mapPromo` (`:1471`), `mapSupportThread` (`:1627`). Funcoes puras `row → objeto`, aplicadas com `res.rows.map(mapX)`. `mapTransaction` tolera as duas grafias de coluna nova (`row.pix_key_type || row.pixKeyType`, `:561`) — defesa contra a lacuna entre o DDL e o branch JSON.

**Ordem e fallback de gateway Pix.** Descrito em "Cadeia de Failover de Gateway". Strategy + lista ordenada persistida + lista de desabilitadas.

**Reserva atomica de saque (`claimWithdrawal`).** `database.js:1287-1303`. Compare-and-swap no Postgres (`WHERE status = $from RETURNING *`), checagem sequencial no JSON. Aceita `fromStatus` explicito para destravar saque preso em `processing` (`routes/admin.js:370`).

**Ciclo de vida de cobranca Pix (`pix_charges`).** Tabela de correlacao porque o webhook chega sem contexto. `savePixCharge` (`database.js:1531`), `findPixCharge` (`:1552`), `markPixChargeUsed` (`:1563`), `getPixChargeStats` (`:1576`). Complementada pela memoria auxiliar do SyncPay (`services/syncpay.js:52-62`) — que se perde no restart, e exatamente por isso que a tabela existe.

**`authMiddleware` (JWT de operador).** `middleware/auth.js:11-31`. Token emitido em `routes/auth.js:184` (cadastro) e `:235` (login) com expiracao de **30 dias** e payload `{ userId }`. Verifica assinatura **e** reconsulta o usuario (`:20`) — conta deletada invalida o token na hora.

**`adminAuthMiddleware` (chave do admin).** `routes/admin.js:110-119`, aplicado com `router.use` em `:121`. Comparacao de string estatica, sem JWT e sem sessao; **throw em producao** sem `ADMIN_KEY`/`ADMIN_PASSWORD` (`:65-67`).

**Sessao assinada por cookie do CRM.** `services/crmSession.js` (61 linhas). Descrito em "Autenticacao do CRM".

**Helpers puros de limites.** `services/limits.js` — `parseLimitSettings` (`:27`), `sumInWindow` (`:47`), `msUntilNextWithdraw` (`:58`), `formatRetryMs` (`:67`), `checkDepositLimits` (`:75`), `checkWithdrawLimits` (`:86`), `isSignupBonusExpired` (`:122`), `shouldPayCommission` (`:130`). Modulo funcional sem I/O, **unico servico coberto por testes unitarios** (`tests/limits.test.js`, 211 linhas). Todas as janelas sao **rolantes** (`agora - N`), nunca dia corrido.

**Motor de plano de carreira.** `services/careerEngine.js` — `RANKS` (`:9-76`), `LEVEL_PERCENTS` (`:78`), `calculateUserNetwork` (`:86`), `hasFunded` (`:96-99`, so conta quem ja depositou), `evaluateUserRank` (`:120`, aceita override manual em `:149-154`), `checkAndPromoteUser` (`:183`), `distributeCareerCommissions` (`:227`).

**Configuracao de negocio em banco (`system_settings`).** Defaults em `database.js:1957-1978`, leitura normalizada em `getSystemSettings` (`:1956-2035`), escrita em `updateSystemSetting` (`:2085-2100`), edicao validada em `routes/admin.js:1411-1474` (faixas por campo: taxa 0-50%, bonus 0-1000, tetos com teto superior).

**Motivos de pixel (Meta + TikTok) no cliente.** `public/tiktok-pixel-base.js:8-32` define `window.TikTokBase` — o stub oficial do TikTok reescrito **sincronamente**, com o `n.src` preservado (o que faz o `events.js` carregar de verdade). `public/tiktok-pixel.js:4-19` invoca o stub (`:7`) e so entao busca o ID em `GET /api/admin/public-settings` (`:11`) e chama `ttq.load`/`ttq.page` (`:15-16`). Resultado: trocar de pixel e uma mudanca no painel, sem deploy. O bundle de eventos do TikTok **nao** esta no repo; so o stub.
`public/app.js:1768-1777` mapeia nomes de evento Meta → TikTok (`Purchase`→`CompletePayment`, `Lead`→`SubmitForm`, `StartTrial`→`Subscribe`, …) porque nome errado faz o TikTok ignorar o evento em silencio. `trackBoth` (`:1800-1803`) dispara nos dois canais; todo wrapped em `try/catch` (`:1796`, `:1809`) porque **o pixel nunca pode derrubar o app**.

**i18n no cliente.** `public/i18n.js` (98) — UMD (`window.TruckAutoI18n`), dicionarios em `/i18n/{lang}.json` (451 linhas cada, os quatro alinhados), `setLang` dispara `window.dispatchEvent(new Event('truckauto:lang'))` (`:65`), marcado declarativo via `data-i18n`/`-ph`/`-aria`/`-title` aplicado por `applyStatic` (`:80-86`). Consumido por `public/app.js:177` e `public/login.html:768`. Modulo separado para i18n de **dados**: `public/i18n-data.js:10-17` resolve colunas `*_es/*_en/*_zh` do catalogo, semeadas em `database.js:162-187` e backfilled em `database.js:443-455`.

**Predicados de filtro do admin.** `public/admin-filters.js` (80, UMD `window.AdminFilters`), consumido por `AF()` em `public/admin.html:1478-1479` com fallback neutro, e testado em `tests/admin-filters.test.js`.

## Carencia de 30 dias por modelo de frota

Regra comercial que forca ticket maior: comprar a 1a unidade de um modelo nao trava nada; a partir do momento em que o modelo esta **lotado**, so entra unidade nova 30 dias depois da ultima compra **do mesmo modelo**.

**Implementacao canonica (servidor):**
- Constante `COOLDOWN_DAYS = 30` / `COOLDOWN_MS` — `routes/fleet.js:23-24`.
- `cooldownsForModel(contracts, productId)` — `routes/fleet.js:32-55`. Filtra os contratos **do mesmo modelo** (`:33`), ordena por `startDate` descendente e pega o mais recente (`:35-37`), calcula `ultimo.startDate + 30d` (`:40`) e devolve `{ bloqueado, diasRestantes, liberacao, mensagem }`. A **mensagem e deliberadamente neutra** — `"Limite deste modelo atingido."` (`:53`) — porque a carencia e regra interna e o cliente nao deve saber dela nem do prazo, embora `diasRestantes`/`liberacao` continuem na resposta para uso administrativo (`:50-52`).
- **Gate que aplica a regra so depois do lote lotar** — `routes/fleet.js:128-138`:

```js
const totalSameModel = existingContracts.filter(c => c.productId === product.id).length;  // :128
if (totalSameModel >= MAX_PER_MODEL) {                                                     // :129
  const carencia = cooldownsForModel(existingContracts, product.id);                      // :130
  if (carencia.bloqueado) return res.status(403).json({ error, cooldownUntil, cooldownDaysLeft });  // :132-136
}
```

  E a **mudanca recente** (commit `65c2e60`): antes a carencia contava a partir de qualquer compra. O guarda `totalSameModel >= MAX_PER_MODEL` faz a regra so comecar a valer **depois que o modelo foi lotado**, e e por isso que ela conta **todos** os contratos do modelo (nao so os `Em corrida`).
- `MAX_PER_MODEL` — `routes/fleet.js:114`: `1` para carregadores (id comeca com `CH-`), `1` para preco >= R$ 79, `2` abaixo disso.
- **Teto simultaneo e separado e mais estrito** — `routes/fleet.js:115-119` conta apenas contratos com `status === 'Em corrida'` e barra acima de `MAX_PER_MODEL` com 403.
- Resposta de erro no cliente: **403** com `cooldownUntil` (ISO) e `cooldownDaysLeft`.

**Espelho no cliente:** `PURCHASE_COOLDOWN_DAYS = 30` e `calcCooldown(productId, ownedTotal, maxAllowed)` em `public/app.js:366-385`, com o mesmo guarda `ownedTotal < maxAllowed` de saida antecipada (`:371-373`). Consumido em `renderProducts` (`public/app.js:672-673`), que separa os dois contadores: `ownedModel` so com `Em corrida` para o slot visivel (`:667`) e `totalModel` com todos para a carencia (`:672`). Durante a carencia a nota de "vagas" e suprimida (`:680-684`) e o botao sai desabilitado (`:738-741`) — correcoes dos commits `7b42563` e `25204e8`.

> **Regra de Espelhamento:** a carencia e duplicada em servidor e cliente. Uma mudanca em `routes/fleet.js:32-55` **precisa** ser replicada em `public/app.js:366-385`, senao o botao fica travado para sempre (foi o bug do commit `835e9fa`).

## Entry Points

**Processo Node:**
- `server.js:245` chama `startServer()` (`server.js:211-243`).
- Triggers: `npm start` / `node server.js` (`package.json:7`), ou `startCommand: node server.js` no deploy (`render.yaml:10`).
- Responsabilidades: `initDb()` (`:213` → `database.js:220`), `initTelegramBot()` (`:216`), `server.listen` (`:218`), watchdog anti-sleep (`:226-227`), backup diario (`:229`), cron de gotejamento (`:232-237`). Falha no `initDb` no Postgres **nao** e fatal no ponto de chamada — `database.js:468-469` engole e segue; falha em `startServer` encerra com `process.exit(1)` (`server.js:239-242`).

**Paginas (HTML estatico montado por rota):**
- `GET /`, `/presell`, `/apresentacao`, `/start`, `/como-funciona` → `presell.html` (`server.js:173-175`)
- `GET /crm`, `/crm/*`, `/nexus` → CRM buildado (`server.js:178-180`)
- `GET /admin` → painel master (`server.js:183-185`)
- `GET /login` → autenticacao (`server.js:188-190`)
- `GET /termos`, `/privacidade` (`server.js:193-198`)
- `GET /app`, `/dashboard`, `/painel`, `/home` → app do operador (`server.js:201-203`)
- `GET *` → fallback SPA para `index.html` (`server.js:206-208`)
- URLs legadas com `.html` sao redirecionadas **301** para as formas limpas (`server.js:116-128`)

**Entrada por webhook (HTTP de terceiros):**
- Cartpanda: `/webhook/cartpanda`, `/api/webhook/cartpanda`, `/cartpanda/webhook` (`server.js:148-151` → `routes/wallet.js:178`)
- Mistic: `/webhook/mistic`, `/api/webhook/mistic`, `/mistic/webhook` (`server.js:152-155` → `routes/wallet.js:449`)
- Evolution API (WhatsApp): `/webhook/evolution`, `/evolution/webhook`, `/api/webhook/evolution` (`server.js:159-162` → `routes/crm.js:231`)
- Meta Ads leads: `GET`/`POST /api/leads/webhook` (`routes/crm.js:336`, `:348`)
- Carteira: `/api/wallet/webhook/{cartpanda,asaas,mistic,syncpay}` (`routes/wallet.js:178`, `:394`, `:449`, `:557`)

**Entrada por jobs agendados:**
- Gotejamento horario: `server.js:233` → `services/settlementEngine.js:185`
- Backup diario 04:00: `services/backup.js:105` (ativado por `server.js:229`)
- Auto-ping anti-sleep: `services/keepAliveWatchdog.js` (intervalo de 4 min)

**Entrada por CLI/testes:**
- `playwright.config.js` — `testDir: './e2e'`, `baseURL: http://localhost:3100`, sobe `node server.js` de verdade
- `node --test tests/*.test.js` (runner nativo, sem dependencias)

## Tratamento de Erros

**Estrategia:** `try/catch` por handler, **sem error handler global do Express**. Erros de negocio sao 4xx JSON; inesperados viram 500 com mensagem generica (nunca o stack). Log sempre com prefixo de dominio entre colchetes: `[WALLET ERROR /withdraw]`, `[CARTPANDA WEBHOOK ERROR]`, `[MISTIC WEBHOOK]`, `[DRIP ERROR contract ...]`, `[SETTLEMENT ERROR]`, `[CAREER ENGINE]`, `[WATCHDOG CRITICAL SHIELD]`, `[BACKUP]`, `[SECURITY ALERT]`, `[ANTI-FARM]`, `[TIKTOK]`, `[CRM AUTO-LEAD ERROR]`, `[SECURITY]`.

**Padroes notaveis:**
- **Try/catch que falha aberto** em checagens de seguranca — limite de deposito (`routes/wallet.js:122`), limites de saque (`:758`), expiracao de bonus (`:721`), soma global de saques (`:739`), deteccao anti-farm no cadastro (`routes/auth.js:106`), bonus de boas-vindas (`:126`), lead automatico no CRM (`routes/auth.js:159-161`). O log registra e o fluxo segue: **uma falha de I/O vira uma regra de negocio nao aplicada**.
- **Erros engolidos silenciosamente:** `catch (e) {}` em `routes/crm.js:75`, `:189`; `routes/wallet.js:472`; `routes/support.js`; `services/whatsappQueue.js`; e o `catch { return defaultData }` de `database.js:208-210`.
- **Nao existe crash handler que reinicie o processo.** `process.on('uncaughtException')` / `unhandledRejection` em `services/keepAliveWatchdog.js` **so logam**. No Render (plano free, `render.yaml:8`) um unhandled rejection derruba o container.
- **Idempotencia e estado parcial:** webhooks respondem **200** mesmo em "ignorado"/"user_not_found" (`routes/wallet.js:251`, `:299`, `:409`, `:476`, `:499`, `:629`) para nao provocar retry; a Mistic devolve **500** de proposito quando a API de confirmacao esta indisponivel (`:513`) para forcar a repeticao.
- **Gateways nunca lancam** em operacao normal: devolvem `{ success: false, error }` (`services/asaas.js`, `services/misticpay.js:47`, `services/syncpay.js:43`, `services/cartpanda.js`), o que torna a cascata em `routes/wallet.js:147-157` e `routes/admin.js:328-340` possivel.
- **`getSystemSettings` nunca lanca:** em erro no Postgres devolve os defaults (`database.js:2006-2008`); `getGatewayOrder` devolve a ordem cheia (`:2050`); `getMoneyLimits` devolve os defaults saneados (`:2079-2082`). Um banco indisponivel **nao** derruba o app — ele so volta a cobrar os limites padrao, sem o teto global nem a pausa de emergencia.

## Preocupacoes Transversais

**Autenticacao:**
- Operador: JWT HS256 `{ userId }`, 30 dias (`routes/auth.js:184`, `:235`), verificado e reidratado por requisicao (`middleware/auth.js:19-26`).
- Admin: chave estatica (`routes/admin.js:110-119`), **throw** em producao sem env (`:65-67`), alerta Telegram com throttle de 5 min em falhas (`:88-107`).
- CRM: cookie HMAC de 12h (`services/crmSession.js`) — detalhado acima.
- Webhooks: token por provedor conferido dentro do handler; nao ha middleware compartilhado. O SyncPay e o unico que **pula a checagem se o token nao estiver configurado** (`routes/wallet.js:560`) — fail-open consciente, ja que sem token cadastrado no painel SyncPay nao ha o que comparar.

**Autorizacao:**
- **Nao existe RBAC.** Cada rota declara seu proprio `authMiddleware`.
- `GET /api/fleet/products` e **publica** (`routes/fleet.js:58`) — o catalogo e publico por design (a landing mostra precos).
- `GET /api/admin/public-settings` e **publica por necessidade** (`routes/admin.js:70-85`): expoe apenas `whatsappNumber`, `metaPixelId`, `tiktokPixelId` e os tres limites monetarios, para que o app renderize antes do login e o pixel suba sem sessao.
- `GET /api/admin/auth/verify` fica **antes** do `router.use` de auth (`routes/admin.js:89` vs `:121`).
- No CRM a fronteira agora e: sessao para tudo, `x-crm-secret` para a ingestao de lead. Ver a lista de lacunas em "Autenticacao do CRM".

**Limites e regras de negocio:**
- Fonte da verdade: `system_settings` (`database.js:1956-2035`).
- Intermediarios puros em `services/limits.js`; `getMoneyLimits()` cruza banco + saneamento.
- Enforced em: deposito (`routes/wallet.js:105-122`), saque (`routes/wallet.js:676`, `:724-775`), contratacao (`routes/fleet.js:94-138`), cadastro (`routes/auth.js:26-43` validacao de telefone BR; `:89-106` anti-farm por hash de IP, marca `crmStatus: 'suspeito'` e alerta o admin).
- Pausa de emergencia: `depositsPaused` (`routes/wallet.js:111`) e `payoutsPaused` (`services/limits.js:88`).
- **`0` significa "sem limite"** em todos os tetos (`services/limits.js:31`, e os `> 0` em `:77`, `:80`, `:92`, `:103`, `:112`, `:115`).

**Validacao:**
- Manual e inline; **nenhum schema** (Zod/Joi) no projeto inteiro.
- Sanitizacao ad-hoc de `<>"'` em texto (`routes/auth.js:13`, `database.js`), e escape no frontend.
- CPF com digito verificador em `services/misticpay.js:93-106` e `services/asaas.js:107`.
- Limites de tamanho: body 50mb (`server.js:27-28`), chave Pix `slice(0, 77)` (`routes/wallet.js:665`), click-ids `slice(0, 100)` (`routes/auth.js:132-135`), mensagem de suporte `slice(0, 1000)`, texto de Telegram `slice(0, 400)` com escape de Markdown (`services/telegramBot.js:592`).

**Configuracao e ambiente:**
- `.env` via dotenv (`server.js:1`, `database.js:1`); segredos nunca versionados (`.gitignore`).
- Inventario em `.env.example` (53 linhas) e `render.yaml:11-57` (todos com `sync: false`).
- **Lacuna:** `CRM_SECRET`, `CARTPANDA_WEBHOOK_SECRET`, `DEFAULT_INVITE_CODE`, `NEXUS_CRM_URL` e `ADMIN_PASSWORD` sao lidos em runtime mas **nao** estao em `.env.example` nem em `render.yaml`. `CRM_SECRET` em particular e a primeira opcao de segredo do CRM (`services/crmSession.js:14`) — quem seguir o `.env.example` depende do fallback `ADMIN_KEY`.
- Parametros que mudam com frequencia **nao** sao env: vao para `system_settings` e sao editaveis no painel.

**Observabilidade:**
- Apenas `console.log`/`error`/`warn`. Sem logger estruturado, metricas, tracing nem APM.
- **Auditoria duravel so para o que e dinheiro:** `webhook_logs` (payload bruto em JSONB, DDL `database.js:317-330`) e `transactions` (extrato por usuario).
- `keepAliveWatchdog` faz heartbeat em `GET /api/health` (`server.js:166-168`).

**Analytics de visitantes:**
- Middleware global em `server.js:72-112`: filtra estaticos, `/api/` e `/webhook` (`:74-75`), ignora bots (`:79-81`), resolve o IP real atras do proxy (`:83`), hasheia com SHA-256 + salt `_truckauto_salt` truncado em 16 chars (`:84`), detecta mobile (`:85-86`), classifica UTM/referer (`:88-97`).
- Grava em `page_views` via `recordPageView` (`database.js:1366`); metricas em `getAnalyticsMetrics` (`:1393`), expostas em `/api/admin/metrics` e `/api/admin/analytics` (`routes/admin.js:195`, `:243`).
- **O mesmo padrao de hash e reaproveitado no cadastro** para velocidade anti-farm (`routes/auth.js:66`) — uma escolha consciente de nao coletar IP em claro.

**i18n:**
- Cliente-only para UI: 4 dicionarios JSON estaticos (451 linhas cada) + modulos UMD.
- Persistencia em `localStorage['truckauto_lang']` (`public/i18n.js:35`, `:61`) e deteccao inicial por `navigator.language` (`:9-15`, `:42`).
- Troca propaga por evento `truckauto:lang` (`public/i18n.js:65`) consumido em `public/app.js:177` e `public/login.html:768`.
- i18n de **dados** (catalogo) e server-side: colunas `*_es/*_en/*_zh` em `products`, semeadas em `database.js:162-187` e backfilled em `:443-455`.
- Sem i18n no painel admin nem no CRM.
- Cobertura verificada pelos "sweeps" de `e2e/lang.spec.js:52-68`, que varrem 4 idiomas x 2 telas procurando chave crua vazada.

**Resiliencia / operacao continua:**
- `trust proxy` para o rate-limit enxergar o IP real atras do proxy do Render (`server.js:24`).
- Rate limit: 100/15min por IP no login (`server.js:37-43`), 10/15min **por telefone** com `skipSuccessfulRequests` (`:47-55`), 60 cadastros/hora por IP (`:62-69`).
- Backup CSV de usuarios/contratos/leads enviado ao Telegram do admin (`services/backup.js:11-109`), agendado e tambem disparavel por `POST /api/admin/backup/run` (`routes/admin.js:1295`).
- CSP/COEP desativados no Helmet para nao quebrar scripts e fontes inline (`server.js:32`).

**Realtime:**
- `socket.io` criado em `server.js:15-17` (CORS `'*'`) e injetado **apenas** no router do CRM (`server.js:158`). Emite `chat:message`, `leads:update`, `leads:new`, `leads:human_requested`, `whatsapp:qrcode`, `whatsapp:connection` (`routes/crm.js:130`, `:208-209`, `:286-289`, `:303`, `:324`, `:327`).

---

*Analise de arquitetura: 2026-09-30 — commit `3b38fa8`*
*Atualizar quando os padroes estruturais mudarem*
