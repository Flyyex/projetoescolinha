---
doc: testing
last_mapped_commit: 3b38fa8
mapped_date: 2026-09-30
previous_mapped_commit: 4c16c6f
staleness_fixed: true
scope: root
---

# Padroes de Teste

**Mapped commit:** `3b38fa8` | **Mapped date:** 2026-09-30 | **Supersedes:** `4c16c6f` (2026-09-29)

**Execucao real feita nesta passagem (2026-09-30, Node v22.14.0):**
- `node --test tests/i18n.test.js tests/i18n-data.test.js tests/limits.test.js tests/admin-filters.test.js` -> **55/55 passaram, 20 suites, 256,7 ms, 0 falhas.**
- `node tests/limits.test.js` (o comando que `git_sync.ps1` usa) -> **25/25 passaram, exit 0.**
- E2E **nao foi re-executado** nesta passagem (o runner reescreve `test-results/`). O ultimo resultado registrado em `test-results/.last-run.json` e `{ "status": "passed", "failedTests": [] }`. O ultimo output completo datado de 2026-09-29 esta em §12.

**Mudancas desde 2026-09-29 que afetam este doc:**
- **Nenhum arquivo de teste novo ou modificado.** `tests/` e `e2e/` estao identicos a `4c16c6f`.
- **Mas o escopo do codebase mudou em +578 linhas**, e **zero** dessas linhas tem teste. Os quatro alvos nao testados de antes ficaram maiores: `database.js` 2095 -> **2180**, `routes/wallet.js` 940 -> **979**, `routes/fleet.js` 147 -> **206**, `routes/crm.js` 475 -> **525**, `public/app.js` 2730 -> **2833**.
- **`services/crmSession.js` (61 linhas, novo) nao tem nenhum teste** — e e o servico que carrega a sessao assinada de **todos** os leads do CRM (dado pessoal sob LGPD). Detalhe em §7.2.
- **`routes/fleet.js` ganhou `cooldownsForModel()`**, uma regra de negocio nova (carencia de 30 dias por modelo) que **nao tem teste** — apesar de `services/limits.js` (mesma familia de regra) ter 25.
- **`routes/wallet.js` ganhou os dois endpoints de ads** (`GET /purchases`, `POST /purchases/reported`) e a expiracao preguicosa do bonus — nenhum dos dois tem teste. Detalhe em §9.
- Contagens corrigidas: `tests/limits.test.js` tem **25** `it` (o doc antigo dizia 24); `tests/i18n.test.js` tem **8** (o antigo dizia 9).

---

## 1. Framework e Configuracao

**Runner unitario: `node:test` nativo do Node.js** (nativo desde 18, `package.json` exige `>=18.0.0`; ambiente real: Node v22.14.0).
**Runner E2E: Playwright** (`@playwright/test ^1.63.0`, unica `devDependency` em `package.json`).

**Nenhuma biblioteca de assercao externa. Nenhum framework de teste em `dependencies`. Nenhum transpiler, nenhum ts-jest, nenhum `jest.config`, nenhum `vitest.config`, nenhum `mocha`.**

- **Assercao: exclusivamente `node:assert/strict`** (modulo nativo). Matchers usados em todo o repositorio de testes: `assert.equal`, `assert.ok`, `assert.match`. Nada alem disso.
- **`node:test`:** importa-se apenas `describe` e `it`. **Nao se usa** `before`, `beforeEach`, `after`, `afterEach`, `test.only`, `test.skip`, `t.mock`, nem `assert.rejects`.
- **Config unitario: nao existe.** Nenhum arquivo de config, nenhuma chave `test` em `package.json`. Os comandos de teste estao documentados **apenas em comentario no topo de 3 dos 4 arquivos** (`tests/limits.test.js:2`, `tests/admin-filters.test.js:2`, `tests/i18n-data.test.js:2`); `tests/i18n.test.js` **nao tem cabecalho** — comeca direto nos imports.
- **Cobertura: inexistente.** Sem `c8`, sem `nyc`, sem `--experimental-test-coverage`, sem config, sem meta, sem gate de CI. `node --test --experimental-coverage` funcionaria (o Node 22 tem coverage nativo), mas **nao esta configurado em lugar nenhum**.

### 1.1 `playwright.config.js` — 5 linhas, completo

```js
// playwright.config.js:1-5
module.exports = {
  testDir: './e2e',
  use: { baseURL: 'http://localhost:3100', locale: 'pt-BR' },
  webServer: { command: 'node server.js', port: 3100, env: { PORT: '3100' }, reuseExistingServer: true },
};
```

Ausentes (por omissao, nao por decisao): `projects`, `reporter` (default `list`), `retries` (default 0), `timeout`, `expect.timeout`, `use.trace`/`screenshot`/`video`. `workers` nao configurado -> **1 worker por default**. `reuseExistingServer: true` significa que se ja houver algo escutando na 3100 o Playwright **reusa e nao sobe servidor novo**.

### 1.2 Comandos (verificados nesta passagem)

```bash
# Unitarios — suíte completa (o que foi executado em 2026-09-30)
node --test tests/i18n.test.js tests/i18n-data.test.js tests/limits.test.js tests/admin-filters.test.js

# Unitarios — arquivo único
node --test tests/limits.test.js

# Unitarios — executar o arquivo direto (sem --test) TAMBEM funciona no Node 22
# e e o que git_sync.ps1 usa. Exit code propagado.
node tests/limits.test.js

# E2E — sobe o server na 3100 e roda tudo
npx playwright test

# E2E — um spec só / um teste só
npx playwright test e2e/lang.spec.js
npx playwright test -g "idioma persiste"
npx playwright test --headed
npx playwright test --debug
```

**`node --test tests/` (passando o diretorio) FALHA no Node 22** com `MODULE_NOT_FOUND` / `ERR_TEST_FAILURE` — o runner trata o diretorio como um modulo. **Use a lista explicita de arquivos**, como em `git_sync.ps1` e no comando acima. Este e um atrito real para quem tentar rodar "tudo".

**No PowerShell, encandeie com `; if ($?) { ... }` — nunca `&&`.** O `npx playwright test` leva 15-30 s (use timeout de 240000 ms). O `node --test` leva <1 s.

**Nao existe `npm test`.** `package.json:6-8` so tem `"start": "node server.js"`.

---

## 2. Organizacao dos Arquivos de Teste

Duas arvores separadas, ambas na raiz do projeto (nao coladas ao lado do fonte):

```
ProjetoEscola/
├── services/
│   ├── limits.js                  (145 linhas)  <- alvo do maior teste unitario
│   └── crmSession.js              ( 61 linhas)  <- NOVO, SEM TESTE
├── public/
│   ├── i18n.js                    ( 98 linhas)  <- alvo (metade pura)
│   ├── i18n-data.js               ( 35 linhas)  <- alvo
│   ├── admin-filters.js           ( 80 linhas)  <- alvo
│   ├── app.js                     (2833 linhas) <- NAO testado
│   └── admin.html                 (2962 linhas) <- NAO testado
├── tests/                                   <- UNITARIOS (node:test)
│   ├── limits.test.js            (211 linhas)  <- 9 describe / 25 it
│   ├── admin-filters.test.js     (119 linhas)  <- 6 describe / 17 it
│   ├── i18n.test.js              ( 40 linhas)  <- 3 describe /  8 it
│   └── i18n-data.test.js         ( 37 linhas)  <- 2 describe /  5 it
├── e2e/                                     <- E2E (Playwright)
│   └── lang.spec.js              ( 69 linhas)  <- 6 test() declarados, 12 casos
├── playwright.config.js           (  5 linhas)
├── test-results/.last-run.json   (  3 linhas, gitignored)
└── package.json                   (SEM script de teste)
```

**Nomenclatura:**
- Unitario: `<modulo>.test.js` — o nome e **o do modulo alvo**, nao o da feature. Nomes em **kebab-case**.
- E2E: `*.spec.js` — o sufixo `.spec.js` distingue de `.test.js` e e o que o `testDir: './e2e'` pega. O nome descreve o **dominio** (`lang`), nao a rota.
- Nao existe distincao de `unit`/`integration`/`e2e` no nome do arquivo — a pasta e que separa.

**Numeros reais (contagem refeita em 2026-09-30):**
- **4 arquivos de teste unitario**, **20 `describe`**, **55 `it`** — confirmado pelo TAP: `# tests 55 / # suites 20 / # pass 55 / # fail 0 / # duration_ms 256.7185`.
- **1 arquivo E2E**, **6 `test()` declarados**, dos quais 4 estaticos + 8 gerados por `for` em runtime = **12 casos**.
- **Nenhum** arquivo de fixture, factory, helper ou setup compartilhado. Nenhum `test-utils/`. Nenhum `__snapshots__/`. Nenhum `tests/fixtures/`. Nenhum `.env.test`.

---
## 3. Estrutura dos Testes

### 3.1 Cabecalho de escopo

Tres dos quatro arquivos comecam com 2 linhas de comentario explicando **escopo** e **como rodar**. Dois declaram TDD RED explicitamente:

```js
// tests/limits.test.js:1-2
// Fase 2 - Limites nativos. TDD RED: este teste deve FALHAR até services/limits.js existir.
// Roda com: node --test tests/limits.test.js (sem dependências)
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const limits = require('../services/limits');
```
```js
// tests/admin-filters.test.js:1-2
// Filtros do /admin — TDD RED: falha até public/admin-filters.js existir.
// Roda com: node --test tests/admin-filters.test.js
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');

const f = require('../public/admin-filters.js');
```

**Excecao:** `tests/i18n.test.js` **nao tem cabecalho** — comeca direto em `const { describe, it } = require('node:test');`. `tests/i18n-data.test.js` tem cabecalho mas nao menciona TDD RED.

**Padrão de imports: sempre `node:test` -> `node:assert/strict` -> modulo alvo**, nessa ordem, com uma **linha em branco** separando o terceiro (o doc de 2026-09-29 dizia "sem linhas em branco" — ha uma). O alias do modulo alvo e curto e descritivo: `const limits = `, `const f = `, `const I = `, `const D = `.

**No E2E:** `const { test, expect } = require('@playwright/test');` (`e2e/lang.spec.js:1`), sem cabecalho, sem `describe`.

### 3.2 Suites

Um `describe` por **funcao exportada** do modulo, nomeado **exatamente como a funcao**, em minusculas:

| Arquivo | `describe` |
|---|---|
| `tests/limits.test.js` | `parseLimitSettings`, `sumInWindow`, `msUntilNextWithdraw`, `checkDepositLimits`, `checkWithdrawLimits`, `bônus expiração 7 dias`, `comissão só sobre dinheiro real`, `formatRetryMs`, `0 = sem limite` |
| `tests/i18n.test.js` | `resolveLang`, `lookup`, `interpolate` |
| `tests/i18n-data.test.js` | `pickLang`, `cityName` |
| `tests/admin-filters.test.js` | `matchWithdrawal`, `matchDeposit`, `matchWebhook`, `matchSupport`, `matchBonus`, `matchLeader` |

**Desvio observado e intencional:** quando o `describe` descreve uma **regra de negocio** em vez de uma funcao, ele e escrito em **portugues, como frase**: `'bônus expiração 7 dias'`, `'comissão só sobre dinheiro real'`, `'0 = sem limite'`. Ambos os estilos convivem; mantenha cada um onde ja esta.

### 3.3 Nomes dos casos (`it`)

**Todos em portugues, minusculo, descrevendo o comportamento esperado — nunca "should X" / "deve ...".** Exemplos reais:
- `'prefere salvo válido'`, `'cai em pt para resto/lixo'` (`tests/i18n.test.js:6,14`)
- `'rejeita depósito acima do máx por transação'` (`tests/limits.test.js:67`)
- `'bloqueia saque 00:01 quando o anterior foi 23:59 (bug atual)'` (`tests/limits.test.js:49`) — o nome carrega o contexto do bug
- `'só não-lidas'`, `'busca por nome e patente'` (`tests/admin-filters.test.js:90,114`)
- `'traduz as 4 cidades + todas'` (`tests/i18n-data.test.js:27`)
- `'status paid casa com approved'` (`tests/admin-filters.test.js:40`)

No E2E os nomes tambem sao frases PT, e os casos gerados por `for` interpolam o idioma: `` `sweep sem chave crua em /login (${lang})` ``.

**Muitos testes agrupam varias assercoes num unico `it`** quando o cenario e o mesmo:
```js
// tests/i18n.test.js:9-13
it('mapeia navigator para suportados', () => {
  assert.equal(I.resolveLang('', 'en-US'), 'en');
  assert.equal(I.resolveLang('', 'zh-CN'), 'zh');
  assert.equal(I.resolveLang('', 'es-MX'), 'es');
});
```

### 3.4 Fixtures: constante inline, nunca factory

**Nao existe padrao de factory.** O objeto de entrada e uma `const` literal no topo do `describe`, e o teste faz **spread** para variar um campo:

```js
// tests/admin-filters.test.js:8-9
describe('matchWithdrawal', () => {
  const t = { id: 'WD-123', userName: 'Maria Silva', userPhone: '11987654321', pixKey: 'maria@email.com', status: 'pending' };
  ...
  assert.equal(f.matchWebhook({ ...l, event_type: 'withdraw' }, {...}), true);  // linha 63
```

No `limits.test.js` ha uma segunda convencao: **tempo congelado e derivado de constante**, para eliminar `Date.now()` do teste — e o que torna as regras de janela rolante testaveis:
```js
// tests/limits.test.js:8-10
const H = 3600 * 1000;
const NOW = new Date('2026-09-29T12:00:00Z').getTime();
const iso = (ms) => new Date(ms).toISOString();
```
E o "config de limites" e uma `const L` dentro do `describe` (`tests/limits.test.js:65`, `84-88`), variavel com spread: `{ ...L, payoutsPaused: true }` (linha 129).

**Nota importante:** `NOW` esta fixado em `2026-09-29T12:00:00Z` — a data em que o arquivo foi escrito. Isso e fine para `msUntilNextWithdraw`/`sumInWindow` (relativas), mas **quebraria qualquer teste de "expira em 7 dias" que dependesse de `Date.now()` real**. `isSignupBonusExpired` recebe `now` por parametro justamente por isso (`tests/limits.test.js:146`).

**Setup/Teardown: inexistentes.** Nenhum `beforeEach`/`afterEach`/`after` em nenhum arquivo. Como os modulos testados sao puros, nao ha estado a resetar. **E a razao pela qual a estrategia de "modulo puro" (§5) e obrigatoria.**

---

## 4. Mocks

**Nao existe mocking neste repositorio. Zero.** Verificado por busca por `mock`, `sinon`, `proxyquire`, `jest`, `beforeEach`, `afterEach` em `tests/` e `e2e/`: **nenhuma ocorrencia real** (os unicos hits sao `onlyUnread` em `tests/admin-filters.test.js:91-92` e a palavra "load-only" no nome de um teste E2E). `t.mock`/`mock.fn`/`mock.timers` do `node:test` tambem nao sao usados.

Isso nao e omissao, e consequencia do desenho: **so modulos puros sao testados unitariamente**, entao nao ha fronteira externa (HTTP, fs, banco, relogio) para substituir. As dependencias externas ficam nos **mesmos arquivos nao testados** (`services/asaas.js`, `services/misticpay.js`, `services/syncpay.js`, `services/cartpanda.js`, `services/crmSession.js`, `database.js`) e sao exercitadas indiretamente pelo E2E contra servidor real.

**Se voce precisar testar algo com I/O, ele hoje nao tem teste** e nao ha infraestrutura para isso. Nao ha `supertest`, `nock`, `nock`-like, nem servidor HTTP de teste. `node:test` tem `mock` nativo desde 18.13 e seria a primeira opcao se voce precisar comecar — mas nenhum padrao foi estabelecido.

**Substituto improvisado que existe hoje:** em `e2e/lang.spec.js` o isolamento e feito no **browser**, nao no codigo — `page.addInitScript((l) => { localStorage.setItem('truckauto_lang', l); }, lang)` (linha 63) injeta estado antes do load. E o unico mecanismo de isolamento de estado do projeto.

---

## 5. A regra que torna os testes unitarios possiveis: modulos puros (padrao UMD)

Quatro arquivos sao projetados para rodar **no browser E no `node --test`** sem build. Esse e o padrao a seguir para qualquer logica que precise de teste:

| Arquivo | Global no browser | Testado por |
|---|---|---|
| `services/limits.js` | (so Node — CommonJS puro) | `tests/limits.test.js` |
| `public/i18n.js` | `window.TruckAutoI18n` | `tests/i18n.test.js` |
| `public/i18n-data.js` | `window.I18nData` | `tests/i18n-data.test.js` |
| `public/admin-filters.js` | `window.AdminFilters` | `tests/admin-filters.test.js` |

**O wrapper UMD (identico em `public/i18n.js:1-4`, `public/i18n-data.js:3-6`, `public/admin-filters.js:4-7`):**
```js
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.AdminFilters = factory();
}(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  ...
  return { matchWithdrawal, matchDeposit, /* ... */ };
}));
```

O comentario de cabecalho de 2-3 linhas **explica o porque** do wrapper — copie esse habito:
```js
// public/admin-filters.js:1-3
/* Filtros client-side do /admin - predicados puros.
 * UMD: funciona via <script src> no browser (window.AdminFilters)
 * e via require() no node --test. */
```

**Por que `i18n.js` e `i18n-data.js` sao testaveis apesar de serem browser:** o nucleo testado (`resolveLang`, `lookup`, `interpolate` / `pickLang`, `cityName`) e a **metade pura** do arquivo; a metade de DOM/fetch/localStorage (`loadLang`, `setLang`, `t`, `setText`, `applyStatic`, `init`) fica no mesmo objeto exportado mas **nao tem unit test** — e verificada so pelo E2E. A separacao e feita por *funcao*, nao por arquivo.

**Como testar um modulo UMD no Node 22:** basta `require('../public/i18n.js')` — o wrapper detecta `module.exports` e nao toca em `window`/`document`. Nao e preciso `jsdom`, `happy-dom` nem nenhum carregador.

---
## 6. O que E Testado (o que os 55 testes realmente verificam)

### 6.1 `tests/limits.test.js` — 9 suites, 25 testes (o maior)

Alvo: `services/limits.js` (145 linhas, funcoes puras). Usa `NOW` congelado (`2026-09-29T12:00:00Z`).

- **`parseLimitSettings`** (2 testes) — defaults com settings vazio (`maxDepositTx: 5000`, `maxWithdrawTx: 2000`, `newAccountGraceH: 24`, `newAccountCap7d: 500`, `globalDailyWithdrawCap: 20000`, as duas pausas `false`); saneamento de `'abc'` e `-5` para os defaults.
- **`sumInWindow`** (2) — janela **rolante** de 24 h (nao dia corrido): tx de `-26h` fora, tx de `-2h` dentro; tx de `-12h` conta.
- **`msUntilNextWithdraw`** (3) — regressao do bug 23:59 -> 00:01 (`assert.ok(wait > 23 * H)` com mensagem customizada); liberacao apos 24 h completas; sem saque anterior libera.
- **`checkDepositLimits`** (3) — `ok:false` acima do teto por transacao; `ok:false` estouro do teto diario; `ok:true` no fluxo normal.
- **`checkWithdrawLimits`** (6) — teto por tx; **carencia de conta nova** (`assert.match(r.error, /carência|24h/i)`, linha 105); teto de R$ 500 nos primeiros 7 dias; **teto global com `r.status === 429` e `r.code === 'GLOBAL_CAP'`** (linhas 116-124); pausa de emergencia com `r.status === 403`; fluxo normal passa e nao exige retry.
- **`bônus expiração 7 dias`** (3) — `isSignupBonusExpired`: >7d sem deposito expira; 30d **com** deposito nao expira; bonus novo sem deposito ainda vale.
- **`comissão só sobre dinheiro real`** (2) — `shouldPayCommission`: comprador sem deposito (`buyerTotalDeposited: 0`) nao gera comissao; com 50 e minimo 20 gera.
- **`formatRetryMs`** (1) — countdown pt-BR: `13h22m`.
- **`0 = sem limite`** (3) — `parseLimitSettings` aceita `0` em 4 tetos; deposito gigante (`999999`) passa com tetos zerados; saque gigante passa com tetos zerados e conta antiga.

**Este arquivo e a unica barreira automatizada sobre regra financeira** (tetos, carencia, comissao). E o unico que `git_sync.ps1` roda (§8).

### 6.2 `tests/i18n.test.js` — 3 suites, 8 testes

Alvo: nucleo puro de `public/i18n.js`. **Fixa dicionarios inline** (`const pt = { nav: { home: 'Início' } };`, linha 21) — **nao le `public/i18n/*.json`**.

- **`resolveLang`** — salvo valido tem precedencia; `navigator.language` mapeado (`en-US`->`en`, `zh-CN`->`zh`, `es-MX`->`es`); lixo cai em `pt`.
- **`lookup`** — chave aninhada pontuada; **fallback PT** quando falta (e emite o `console.warn` que vira a linha `# [i18n] pt:nav.home` no TAP); devolve a **propria chave** quando nem o PT tem.
- **`interpolate`** — troca `{min}`; mantem placeholder sem valor.

### 6.3 `tests/i18n-data.test.js` — 2 suites, 5 testes

Alvo: `public/i18n-data.js`.

- **`pickLang`** — usa idioma ativo; cai no PT quando vazio/ausente; `pt` sempre resolve.
- **`cityName`** — as 4 cidades traduzidas nas 3 linguas + `'Todas as Cidades'`; cidade desconhecida volta crua.

### 6.4 `tests/admin-filters.test.js` — 6 suites, 17 testes

Alvo: `public/admin-filters.js`. Cobre os **6 filtros de lista do `/admin`** (saques, depositos, webhooks, suporte, bonus, lideres) combinando busca textual (case-insensitive, parcial, em nome/telefone/pix/id) com filtro de status. Inclui o mapeamento nao-obvio `status 'paid'` <-> `'approved'` (linhas 40-42) e `onlyUnread` (linhas 90-93).

**Importante:** o predicado tem 17 testes, mas **a UI que o consome (`public/admin.html`, 2962 linhas, script inline) nao tem nenhum** — nem unitario nem E2E.

### 6.5 `e2e/lang.spec.js` — 12 casos (1 arquivo, 6 `test()` declarados)

Playwright com **servidor real** (`node server.js` na porta 3100, `playwright.config.js:4`). UI real, sem mock, sem `data-testid` — tudo por seletor de ID/classe e por texto.

| # | Linha | O que verifica |
|---|---|---|
| 1 | `:3` | modal de idioma abre no `/login`, lista 4 botoes (`toHaveCount(4)`), troca para EN, `<html lang="en-US">`, texto `'Sign In'` |
| 2 | `:13` | idioma persiste em `localStorage['truckauto_lang']` apos reload; texto muda para `'Gestión'`; `<html lang="es-ES">` |
| 3 | `:23` | **icones sobrevivem a troca de idioma** (`#btn-tab-login i` continua com count 1) — teste de regressao do `setText` que preserva filhos (`public/i18n.js:74-78`) |
| 4 | `:33` | ZH persiste + `document.lang === 'zh-CN'` |
| 5-12 | `:52-68` | **varredura parametrizada** de 4 idiomas x 2 paginas: `rawKeyEchoes(page)` deve ser `[]` |

**O sweep `/app` (linhas 61-68) e deliberadamente load-only**, sem login, sem clique, sem submit — o comentario na linha 62 diz: *"So carrega a pagina: sem login, sem cliques que mudem estado, sem submits."* Como `/app` sem token redireciona para `/login`, e a pagina `/login` que e efetivamente varrida.

**O helper `rawKeyEchoes` (linhas 45-50)** e o detector de regressao de i18n do projeto:
```js
async function rawKeyEchoes(page) {
  return page.$$eval('[data-i18n]', (els) =>
    els
      .filter((el) => /^[a-z]+\.[a-zA-Z.]+$/.test((el.textContent || '').trim()))
      .map((el) => el.getAttribute('data-i18n')));
}
```

**Limites desse detector (importante):**
- So olha elementos **que tem `data-i18n`** — texto inserido via JS (246 dos ternarios de `app.js`) **nao e varrido**.
- So detecta **chave crua** (`wallet.minDep`). Nao detecta **texto PT residual** — por isso o botao hardcoded de `public/app.js:740` e o `alert` de `public/app.js:2814` passam.
- So cobre `/login` e `/app`. **Nao cobre `/admin` (2962 linhas, zero `data-i18n`), nem `/` (presell, 2746 linhas), nem `/dashboard`.**

`expect.poll` e o mecanismo padrao para esperar estado assincrono (linhas 17, 37, 58, 66, 67) — nunca `waitForTimeout`.

---

## 7. O que NAO E Testado (cobertura zero — fatos)

Confirmado por leitura de `tests/`, `e2e/`, `playwright.config.js` e `package.json`, e por busca em `tests/` e `e2e/` por `app.js`, `admin.html`, `database`, `routes/`, `services/`.

### 7.1 Resumo do placar

| Area | Linhas | Cobertura |
|---|---|---|
| `services/limits.js` | 145 | **25 testes unitarios** |
| `public/i18n.js` (nucleo puro) | ~30 de 98 | **8 testes unitarios + E2E** |
| `public/i18n-data.js` | 35 | **5 testes unitarios** |
| `public/admin-filters.js` | 80 | **17 testes unitarios** |
| `routes/*.js` (7 arquivos) | **4.167** | **0** |
| `database.js` | **2.180** | **0** |
| `services/*.js` (13 dos 17) | ~2.600 | **0** |
| `services/crmSession.js` | **61** | **0** |
| `public/app.js` | **2.833** | so sweep load-only |
| `public/admin.html` | **2.962** | **0** |
| `public/presell.html` | **2.746** | **0** |
| `public/tiktok-pixel*.js` | 49 | **0** |

**Backend: 16 de 17 modulos de regra/IO sem nenhum teste. Frontend: 0% dos dois arquivos maiores.**

### 7.2 Backend — 0%

- **Todas as rotas HTTP.** `routes/auth.js` (276 l.), `routes/wallet.js` (979 l.), `routes/admin.js` (1.476 l.), `routes/crm.js` (525 l.), `routes/fleet.js` (206 l.), `routes/team.js` (112 l.), `routes/support.js` (84 l.). **Nenhum handler e exercitado por teste unitario nem E2E.** Nao ha `supertest`, `nock` nem cliente HTTP de teste.
- **`services/crmSession.js` (61 linhas, NOVO em `3b38fa8`) — zero testes.** E o servico que:
  - assina e verifica `id.exp.sig` com `crypto.timingSafeEqual` (`services/crmSession.js:36-39`),
  - decide `fail safe` sem segredo (linha 30: `if (!secret()) return false;`),
  - faz `middleware()` que protege **todas** as rotas de dados do CRM (`routes/crm.js:31-36`),
  - emite/limpa o cookie httpOnly com `sameSite: 'lax'` e `secure` condicional (linhas 42-53).
  **Esta e a lacuna mais nova e mais grave:** e codigo de autenticacao/autorizacao sob LGPD (`REQUIREMENTS.md` SEC-01) com logica de expiracao e comparacao em tempo constante — exatamente o tipo de coisa que precisa de teste de borda (expirado, adulterado, segredo ausente, assinatura de tamanho diferente).
- **`routes/crm.js`** — a mascara de segredos (`safeSettings()`, `routes/crm.js:445-453`) e o `leadIngestAuth` (`routes/crm.js:22-27`) foram escritos **na mesma passagem em que o doc de 2026-09-29 afirmava que essa rota nao tinha auth**. Zero testes.
- **`middleware/auth.js` (34 linhas)** — verificacao de JWT, os tres `401` distintos (sem header / usuario inexistente / token invalido), guarda de `JWT_SECRET` em producao. Sem teste.
- **`database.js` (2.180 linhas)** — todos os `mapUser`/`mapProduct`/`mapContract`/`mapTransaction`/`mapPromo`/`mapSupportThread`, os 81 `await`, o toggle Postgres/JSON, os backfill, `getApprovedWithdrawalsTotal` (linha 1076), `getUnreportedDeposits` (1123), `markDepositsReported` (1141), `claimWithdrawal` (1287). Zero testes.
- **13 dos 17 servicos** sem teste: `aiSdrEngine.js`, `asaas.js`, `backup.js`, `careerEngine.js`, `cartpanda.js`, `crmDb.js`, `crmSession.js`, `keepAliveWatchdog.js`, `misticpay.js`, `settlementEngine.js`, `syncpay.js`, `telegramBot.js` (675 l.), `whatsappQueue.js`. **Nenhuma integracao de gateway (MisticPay, Syncpay, Asaas, Cartpanda) e testada.**
- **`claimWithdrawal` (`database.js:1287`) e a unica primitiva de lock/claim do sistema** e nao tem teste. `REQUIREMENTS.md` SEC-04 (idempotencia de webhook) e SEC-06/07/08 (atomicidade de saldo) estao todos abertos e dependem dela.
- **Idempotencia de webhook** (`routes/wallet.js`) — declarada como invariante critica no comentario, sem teste de regressao.

### 7.3 Regras de negocio novas sem teste

- **`routes/fleet.js:32-52` `cooldownsForModel()`** — carencia de 30 dias por modelo, contada da data da compra do contrato mais recente **do mesmo modelo**, que so vale depois que o modelo foi lotado (`totalSameModel >= MAX_PER_MODEL`, linha 129). Regra financeira de bloqueio de compra, com bordas (contrato sem `startDate`, lista vazia, `restante <= 0`, `Math.ceil` de dias restantes). **Zero testes** — apesar de `services/limits.js`, da mesma familia, ter 25.
- **Sua replica no cliente**, `public/app.js:364-386` `calcCooldown()` — **zero testes**. Divergir as duas produz botao habilitado + 403 (ver `CONVENTIONS.md` §13.4).
- **`routes/wallet.js:687-721` expiracao preguicosa do bonus.** A funcao pura (`isSignupBonusExpired`) tem 3 testes; **a orquestração lazy-expiry dentro do handler (o `Math.min`, o `Math.min(earnBal0, bonusAmt)`, a gravacao do `BNS-EXP-`, o re-leitura do usuario, o alerta) nao tem nenhum.** Se `take` fosse maior que `earnBal0`, o saldo de saque ficaria negativo e nada detectaria.

### 7.4 Frontend — 0%

- **`public/app.js` (2.833 linhas, 103 funcoes globais)** — nenhum teste unitario. So coberto *indirectamente* pelo sweep de `/app` em modo load-only (sem login, sem interacao, sem clicar em botao).
- **`public/admin.html` (2.962 linhas, 73 `onclick=` inline, zero `data-i18n`)** — **zero E2E**. Nenhuma das 6 listas do admin e testada no browser, apesar de `admin-filters.js` ter 17 testes unitarios. **A UI que consome esses predicados nao e verificada.**
- **`public/presell.html` (2.746 linhas)**, `termos.html`, `privacidade.html` — sem teste. `/` e a rota de maior trafego do funil e nao e nem carregada nos testes.
- **`public/tiktok-pixel.js` / `public/tiktok-pixel-base.js` (49 linhas, novos)** — `TIKTOK_EVENT_NAMES` (`public/app.js:1768-1777`) mapeia `Purchase`->`CompletePayment`, `StartTrial`->`Subscribe`, `Lead`->`SubmitForm`. **Se um nome divergir, o TikTok ignora o evento silenciosamente** (exatamente o cenario descrito no comentario em `public/app.js:1765-1767`) e a equipe paga por anuncio achando que converte. Zero testes — nem do mapa, nem do `tiktokClickId()`.
- **Os dicionarios `public/i18n/{pt,en,es,zh}.json`** — **nenhum teste le esses arquivos.** A paridade de chaves (451 linhas em cada um dos 4) e fato atual, mas **nao e assegurada por teste**; foi mantida por revisao manual e pelos ~18 commits `i18n:`.
- **`setLang`/`applyStatic`/`setText`/`t()` de DOM** — `public/i18n.js:44-95` so e testado via browser (E2E), nunca em unitario.
- **`sw.js` (service worker), `manifest.json`, `style.css`** — sem teste.

### 7.5 Infraestrutura de teste — lacunas

- **Sem CI.** Nao existe `.github/workflows/` (verificado: o unico `.github` no disco esta dentro de `node_modules/`). O unico arquivo YAML do repo e `render.yaml` (deploy). **Nada roda os testes automaticamente no push.**
- **Sem pre-commit hook, sem gate de cobertura.**
- **O gate real e `git_sync.ps1`, e ele e parcial:**
  ```powershell
  # git_sync.ps1:56-62
  Title "4. Rodando os testes"
  $falhou = $false
  if (Test-Path "tests/limits.test.js") {
    $out = node tests/limits.test.js 2>&1
    $out | Select-String -Pattern "pass|fail" | ForEach-Object { Write-Host "  $_" }
    if ($LASTEXITCODE -ne 0) { $falhou = $true; Write-Host "  testes FALHARAM" -ForegroundColor Red }
  }
  ```
  Ele roda **apenas `tests/limits.test.js`** (25 de 55 = **45%** dos testes unitarios) + `node --check` nos `.js` alterados no ultimo commit. **`i18n.test.js`, `i18n-data.test.js`, `admin-filters.test.js` e todo o E2E ficam de fora.** E um script local, opcional, e opcional-dentro-do-opcional: se `tests/limits.test.js` nao existir, o bloco inteiro e pulado sem erro.
- **`node --test tests/` nao funciona** (§1.2) — o caminho natural "roda tudo" esta quebrado.
- **O E2E sobe `node server.js` sem `DATABASE_URL`** (`playwright.config.js:4` so define `PORT`), entao o servidor de teste roda no **modo `data.json`** — o arquivo local gitignored (`.gitignore:5`) que hoje tem 0 usuarios / 12 produtos / 112 pageViews. **O E2E nao roda contra Postgres, nao tem schema nem seed, e o estado do teste depende de um arquivo que ninguem versiona.** Um `data.json` local com dados reais de producao faria o E2E ler dado real.
- **`server.js:206-208` e um catch-all** (`app.get('*')` -> `index.html`). Nao existe 404: **toda rota inexistente devolve o HTML do app com 200.** Um E2E que verifique "rota protegida responde 401" sem token **passaria errado** se so checasse status != 200.
- **O E2E nao autentica ninguem.** Nao ha login, nao ha token, nao ha setup de usuario. Consequencia: `/app` sempre redireciona para `/login`, e **todo o app do operador (2.833 linhas) nunca e efetivamente exercitado**.
- **`test-results/.last-run.json`** e gitignored (`.gitignore:39`). O resultado do E2E **nao fica no repositorio** — se ninguem rodar, nao ha evidencia de que passou.

---
## 8. Tipos de Teste

**Unitario (`tests/`, `node:test`)** — escopo: uma funcao pura do modulo alvo, isolada. Sem mock, sem I/O, sem relogio real (`NOW` congelado). Velocidade: a suite inteira roda em **256,7 ms**; o `limits.test.js` sozinho em **37,6 ms**. Adequado para rodar a cada edicao.

**E2E (`e2e/`, Playwright)** — escopo: fluxo de usuario real no Chromium, contra `node server.js` de verdade na porta 3100, no modo `data.json`. Sem mock, sem interceptacao de rede, sem banco semeado, sem autenticacao. Setup: apenas `page.goto` + `page.evaluate`/`page.addInitScript` para setar `localStorage['truckauto_lang']` antes do load. Velocidade: **~23 s** para 12 casos, 1 worker. **Cobre somente a troca de idioma no login — nenhum fluxo de negocio (cadastro, deposito, saque, contratacao, administracao) tem E2E.**

**Nao existe teste de integracao.** Nao ha teste que suba o app com banco semeado, nem que verifique a interacao rota <-> banco <-> gateway.

**Nao existe teste de snapshot.** Nenhum `__snapshots__/`, nenhuma comparacao de HTML/JSON serializado.

**Nao existe teste de carga, de fuzz, nem property-based testing.** Nao ha `fast-check` nem equivalente.

**Nao existe teste de contrato** entre o backend e o `crm_frontend_src` (o bundle React do CRM que consome as rotas agora protegidas por `crmSession.middleware`).

---

## 9. Licao de Teste e Monitoramento: o incidente dos 42.000 Purchase

Este e o exemplo mais importante de "o que um teste deveria ter pegado" no repositorio, e o comentario que o registra **esta no codigo** em `public/app.js:1992-2000` (a linha **1997** e a linha do relato):

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
// Fluxo: pega que o servidor ainda nao marcou -> dispara -> confirma.
```

### 9.1 O que aconteceu

- **Sintoma:** Meta e TikTok receberam **200 eventos `Purchase` duplicados**, chegando a **42.000 eventos de Purchase para 39 depositantes** — inflando o ROAS dos anuncios de aquisicao e corrompendo a otimizacao de campanha.
- **Causa raiz:** o estado de idempotencia ("ja reportei esta recarga?") vivia em `localStorage['truckauto_purchase_seen']`, um array de ids **truncado em 200** e **no cliente**. `updateSupportBadge` rodava a cada 30 s e `openHistoryModal` tambem disparava.
- **Por que nao falhou de forma visivel:** `localStorage` e silenciosamente descartado em WebView do WhatsApp, em modo privado e quando o storage satura. Cada pagina recarregada sem o storage re-disparava a lista inteira. **O sistema nunca "quebrou" — ele apenas mentiu para as plataformas de anuncio.**

### 9.2 Por que nenhum teste pegou (e por que nenhum pegaria hoje)

| Armadilha | Por que o teste nao veria |
|---|---|
| Estado de idempotencia no cliente | Um teste unitario do front (`require('../public/app.js')`) nem existe; e o `localStorage` e um stub de 1 linha no teste |
| O bug so se manifesta com storage limpo | Requer `page.addInitScript` + `localStorage.clear()` + multiplos reloads — cenario de E2E que ninguem escreveu |
| O dano e **externo** ao sistema | O "erro" aparece no painel do Meta/TikTok, nao em log nem em resposta HTTP. **Nenhum teste de unidade ou integracao pode ver isso.** |
| A "correcao" de ontem (`event_id`) nao existia | Sem `event_id`/`eventID`, as plataformas nao tinham como deduplicar |

**Conclusao de teste:** *bugs de idempotencia com efeito externo (ads, e-mail, SMS, webhook) nao sao encontrados por teste funcional — sao encontrados por invariant monitoring.* Nenhum dos frameworks deste repo teria pegado isso.

### 9.3 As defesas adicionadas (e o que cada uma protege)

| Defesa | Onde | Protege contra |
|---|---|---|
| Marcacao server-side `transactions.ad_reported_at` | `database.js:389`, `:567`, `:1123`, `:1141` | storage limpo, WebView, multiplos dispositivos, troca de navegador |
| `event_id`/`eventID` estaveis (`'dep_' + t.id`) | `public/app.js:2017-2018` | a plataforma deduplicar do lado dela |
| Guard de reentrada `adReportInFlight` + `finally` | `public/app.js:2001`, `:2028-2030` | duas chamadas concorrentes (o poll de 30 s e o clique no Extrato) |
| Validacao de dono dos ids + teto de 200/lote | `routes/wallet.js:955-958` | usuario A marcar a recarga do usuario B; lote ilimitado |
| `catch` que **nao marca** | `public/app.js:2025-2027` | perder o evento para sempre em vez de repetir 500x |
| Pula se `document.hidden` | `public/app.js` (`updateSupportBadge`) | evento disparado de app em segundo plano |

### 9.4 Como isso deveria virar teste (recomendacao, nao implementada)

O padrao UMD (§5) torna isso testavel sem infraestrutura nova:

1. **Extrair a montagem do `params`** para um modulo puro (`public/ads.js` ou uma funcao em `admin-filters.js`): `buildPurchaseParams(tx) -> { value, currency, event_id, eventID }`. Teste puro: `event_id` estavel para o mesmo `tx.id`, `value > 0` so para `type === 'deposit'`.
2. **Testar a logica de lote no servidor** (`getUnreportedDeposits` + `markDepositsReported`) com um `LIMIT 200` e um filtro `ad_reported_at IS NULL` — hoje so possivel com Postgres real, mas factivel como teste de integracao.
3. **E2E de regressao:** 2 sessoes de browser separadas (Playwright `browser.newContext()`), limpar `localStorage` no meio, e afirmar que `POST /api/wallet/purchases/reported` **nao** re-marca nada. Precisa de seed de banco — nao existe infra (§7.5).
4. **Metrica de operacao (o que teria pegado na hora):** um alerta no Telegram quando `getUnreportedDeposits()` retorna sempre o mesmo id por N leituras seguidas, ou quando a razao `eventos Purchase disparados / recargas confirmadas` sai de 1.0. Isso e **monitoring, nao teste** — e e a unica camada que teria detectado.

**Estado atual:** nada disso existe. `routes/wallet.js:940-966`, `database.js:1123-1160`, `public/app.js:2002-2031` e o mapa `TIKTOK_EVENT_NAMES` (`public/app.js:1768-1777`) estao **inteiramente sem cobertura**.

---

## 10. Padroes Comuns

**Teste assincrono:** nao se aplica no unitario (nenhuma funcao testada e async; `checkWithdrawLimits` recebe `now` por parametro justamente para isso). No E2E, o padrao e **`await expect.poll(...)`** para estado assincrono, nunca `waitForTimeout`:
```js
// e2e/lang.spec.js:17
await expect.poll(async () => page.evaluate(() => localStorage.getItem('truckauto_lang'))).toBe('es');
// e2e/lang.spec.js:58
await expect.poll(() => rawKeyEchoes(page)).toEqual([]);
```

**Teste de erro:** o estilo e **assertiva sobre o valor de retorno**, nunca sobre `throw` (as funcoes de dominio nao lancam):
```js
// tests/limits.test.js:116-124
it('teto global bloqueia com 429', () => {
  const r = limits.checkWithdrawLimits({ /* ... */ });
  assert.equal(r.ok, false);
  assert.equal(r.status, 429);
  assert.equal(r.code, 'GLOBAL_CAP');
});
// tests/limits.test.js:105 — checa o texto com regex, nao igualdade exata
assert.match(r.error, /carência|24h/i);
```
Mensagens de erro em PT sao validadas com `assert.match` e regex tolerante, porque o texto e parte do produto (vai para o usuario) e muda com frequencia. **Ao alterar uma mensagem de `services/limits.js`, revise `tests/limits.test.js:105`.**

**Teste de borda / regressao:** o nome do `it` carrega o bug. `tests/limits.test.js:49` — `it('bloqueia saque 00:01 quando o anterior foi 23:59 (bug atual)')`. Ao corrigir um bug, **adicione um `it` que so passa com a correcao** e cite o sintoma no nome.

**`assert.ok` com mensagem customizada** quando a falha precisa de contexto numerico:
```js
// tests/limits.test.js:52
assert.ok(wait > 23 * H, `esperava >23h, veio ${wait}`);
```

**Nota de ruido:** durante `node --test tests/i18n.test.js` aparece a linha `# [i18n] pt:nav.home` no TAP. Nao e falha — e o `console.warn` de `public/i18n.js:24` disparado pelo `lookup` quando cai no fallback PT. **Esperado; nao investigue como bug.**

---

## 11. Como Adicionar Testes (guia pratico)

1. **Escolha o alvo certo.** Se a logica mora em `routes/`, `database.js` ou nos servicos com I/O, **nao ha caminho de teste unitario hoje** (§7). A alternativa honesta e **extrair a logica para um modulo puro** (padrao UMD de `public/admin-filters.js` ou CommonJS puro de `services/limits.js`) e testar isso — que e literalmente o que `tests/limits.test.js:1` e `tests/admin-filters.test.js:1` registraram como "TDD RED: este teste deve FALHAR ate X existir".
2. **Unitario:** crie `tests/<modulo>.test.js`, comece com 2 linhas de comentario (escopo + `// Roda com: node --test tests/<modulo>.test.js`), depois os imports na ordem fixa (`node:test` -> `node:assert/strict` -> modulo alvo, com linha em branco antes do terceiro), um `describe` por funcao exportada, `it` em portugues minusculo descrevendo comportamento, objeto de entrada como `const` literal no topo do `describe` (com spread para variar), `now` congelado para regra temporal, sem mocks.
3. **Nao esqueça de rodar a suite INTEIRA:** `node --test tests/*.test.js` **nao funciona no PowerShell** sem expansao; use a lista explicita (§1.2) ou `Get-ChildItem tests -Filter *.test.js | ForEach-Object { node --test $_.FullName }`.
4. **E2E:** crie `e2e/<dominio>.spec.js`, use os seletores de ID/classe reais (`data-testid` nao e usado no projeto), `expect.poll` para async, e inclua um "sweep" parametrizado se o tema for i18n. Lembre que `/app` redireciona para `/login` sem token — para testar o app de verdade voce precisa de um caminho de login que **nao existe**.
5. **Rode os dois** antes de commitar, no PowerShell com `;` (nunca `&&`).
6. **Commite** no padrao do repo: `test: <descricao em pt-BR minuscula, sem acento>` (exemplo real: `test: e2e idioma (playwright)`).

---

## 12. Numeros Reais da Execucao

### 12.1 Unitarios — 2026-09-30

Comando: `node --test tests/i18n.test.js tests/i18n-data.test.js tests/limits.test.js tests/admin-filters.test.js` (Node v22.14.0)

```
# tests 55
# suites 20
# pass 55
# fail 0
# cancelled 0
# skipped 0
# todo 0
# duration_ms 256.7185
```

Por arquivo: `limits.test.js` 25, `admin-filters.test.js` 17, `i18n.test.js` 8, `i18n-data.test.js` 5.

**Comando do gate** — `node tests/limits.test.js` (sem `--test`, como em `git_sync.ps1:59`) tambem funciona no Node 22 e propaga exit code:
```
# pass 25
# fail 0
# duration_ms 37.559
EXIT=0
```

### 12.2 E2E — ultima execucao completa registrada (2026-09-29)

`npx playwright test`:
```
Running 12 tests using 1 worker
  ok 1  modal abre e troca para inglês no login (1.5s)
  ok 2  idioma persiste após reload (1.0s)
  ok 3  ícones sobrevivem à troca de idioma (877ms)
  ok 4  ZH persiste após reload + document.lang zh-CN (1.3s)
  ok 5  sweep sem chave crua em /login (pt) (922ms)
  ok 6  sweep /app load-only sem login (pt) (1.1s)
  ok 7  sweep sem chave crua em /login (es) (1.0s)
  ok 8  sweep /app load-only sem login (es) (1.1s)
  ok 9  sweep sem chave crua em /login (en) (937ms)
  ok 10 sweep /app load-only sem login (en) (932ms)
  ok 11 sweep sem chave crua em /login (zh) (844ms)
  ok 12 sweep /app load-only sem login (zh) (1.2s)
  12 passed (23.3s)
```

Artefato do runner: `test-results/.last-run.json` -> `{ "status": "passed", "failedTests": [] }` (diretorio no `.gitignore:39`, portanto **nao versionado**).

**Nota de confianca:** o E2E **nao foi re-executado em 2026-09-30** (ver aviso no cabecalho). Como `e2e/lang.spec.js` nao mudou e o servidor sobe com o mesmo `public/i18n/*.json`, o resultado e esperado ser identico — mas **treat como nao verificado nesta passagem**.

### 12.3 Placar em uma frase

Os **55 testes unitarios cobrem 4 modulos puros** (limites nativos, nucleo de i18n, i18n de catalogo, filtros do admin) e os **12 E2E cobrem somente a troca de idioma na tela de login**; **as 7 rotas da API (4.167 linhas), `database.js` (2.180), 16 dos 17 servicos (incluindo o novo `crmSession.js`), `public/admin.html` (2.962), `public/presell.html` (2.746) e `public/app.js` (2.833) nao tem nenhum teste** — e `node --test tests/` (o caminho natural para rodar tudo) esta quebrado no Node 22.

---

*Mapeamento de testes: 2026-09-30 | commit `3b38fa8` | substitui `4c16c6f` (2026-09-29)*
*Atualize quando os padroes de teste mudarem.*